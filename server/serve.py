"""
G-Code inference server. Streams a program for a description as
Server-Sent Events, token by token.

    python server/serve.py --ckpt run_sft/best.pt --tokenizer tokenizer.json --port 8765

POST /generate  {"prompt": "...", "temperature": 0, "max_tokens": 700}
  -> text/event-stream: data: {"t": "<text chunk>"} ... data: {"done": true, "ms": 812, "tokens": 211}
GET  /health    -> {"ok": true, "device": "cuda", "params": ...}
GET  /<path>    -> static files from the repo (the playground), for LAN use

A newer request supersedes the one still running: while someone types, only
the latest description is worth finishing. Greedy decoding by default, so the
same description always yields the same program and small edits to the text
make small edits to the code.
"""

import argparse
import json
import mimetypes
import sys
import threading
import time
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import torch
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from model.gpt import GPT, GPTConfig, KVCache  # noqa: E402


class Engine:
    def __init__(self, ckpt, tok_path, device):
        self.device = device
        ck = torch.load(ckpt, map_location="cpu", weights_only=False)
        self.cfg = GPTConfig(**ck["config"])
        self.model = GPT(self.cfg)
        self.model.load_state_dict(ck["model"])
        self.model.to(device).eval()
        if device == "cuda":
            self.model.half()
        self.tok = Tokenizer.from_file(str(tok_path))
        self.PROMPT = self.tok.token_to_id("<|prompt|>")
        self.CODE = self.tok.token_to_id("<|code|>")
        self.EOT = self.tok.token_to_id("<|endoftext|>")
        self.lock = threading.Lock()
        self.latest = 0
        self.cache = OrderedDict()
        self.step = ck.get("step")
        print(f"loaded {ckpt}: {self.model.num_params():,} params, step {self.step}, device {device}", flush=True)

    @torch.no_grad()
    def stream(self, prompt, ticket, temperature=0.0, max_tokens=700, top_k=40):
        ids = [self.PROMPT] + self.tok.encode(prompt, add_special_tokens=False).ids + [self.CODE]
        ids = ids[-(self.cfg.block_size // 3):]
        kv = KVCache(self.cfg.n_layer)
        x = torch.tensor([ids], device=self.device)
        out = []
        emitted = ""
        limit = min(max_tokens, self.cfg.block_size - len(ids) - 1)
        for _ in range(limit):
            if ticket != self.latest:
                return
            logits, _ = self.model(x, kv=kv)
            logits = logits[0, -1].float()
            if temperature and temperature > 0:
                logits = logits / temperature
                v, _ = torch.topk(logits, top_k)
                logits[logits < v[-1]] = -float("inf")
                nxt = int(torch.multinomial(torch.softmax(logits, -1), 1))
            else:
                nxt = int(torch.argmax(logits))
            if nxt == self.EOT:
                break
            out.append(nxt)
            text = self.tok.decode(out, skip_special_tokens=True)
            if not text.endswith("�"):
                chunk = text[len(emitted):]
                emitted = text
                if chunk:
                    yield chunk
            x = torch.tensor([[nxt]], device=self.device)


def make_handler(engine: Engine):
    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *a):
            pass

        def cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def json(self, obj, code=200):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path.startswith("/health"):
                return self.json({"ok": True, "device": engine.device, "params": engine.model.num_params(), "step": engine.step})
            rel = self.path.split("?")[0].lstrip("/") or "web/index.html"
            p = (ROOT / rel).resolve()
            if ROOT not in p.parents or not p.is_file():
                return self.json({"error": "not found"}, 404)
            data = p.read_bytes()
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", mimetypes.guess_type(str(p))[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            if not self.path.startswith("/generate"):
                return self.json({"error": "not found"}, 404)
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
            prompt = str(req.get("prompt", ""))[:600].strip()
            temp = float(req.get("temperature", 0))
            max_tokens = int(req.get("max_tokens", 700))
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.end_headers()
            t0 = time.time()
            key = (prompt, temp)
            try:
                if temp == 0 and key in engine.cache:
                    code = engine.cache[key]
                    self.wfile.write(f"data: {json.dumps({'t': code})}\n\n".encode())
                    self.wfile.write(f"data: {json.dumps({'done': True, 'ms': 0, 'cached': True})}\n\n".encode())
                    self.wfile.flush()
                    return
                engine.latest += 1
                ticket = engine.latest
                parts, count = [], 0
                with engine.lock:
                    for chunk in engine.stream(prompt, ticket, temp, max_tokens):
                        parts.append(chunk)
                        count += 1
                        self.wfile.write(f"data: {json.dumps({'t': chunk})}\n\n".encode())
                        self.wfile.flush()
                superseded = ticket != engine.latest
                if not superseded and temp == 0:
                    engine.cache[key] = "".join(parts)
                    while len(engine.cache) > 500:
                        engine.cache.popitem(last=False)
                self.wfile.write(f"data: {json.dumps({'done': True, 'ms': int((time.time() - t0) * 1000), 'tokens': count, 'superseded': superseded})}\n\n".encode())
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

    return H


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", type=Path, required=True)
    ap.add_argument("--tokenizer", type=Path, required=True)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = ap.parse_args()
    eng = Engine(args.ckpt, args.tokenizer, args.device)
    srv = ThreadingHTTPServer((args.host, args.port), make_handler(eng))
    srv.daemon_threads = True
    print(f"G-Code serving on http://{args.host}:{args.port}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
