"""
Generate programs for a list of prompts with a checkpoint (greedy), writing
JSONL for eval/score.mjs. Prompts come from a text file (one per line) or a
pairs JSONL (then the expected code is carried along).

    python eval/generate.py --ckpt run/best.pt --tokenizer tokenizer.json eval/human.txt --out eval/out.jsonl
"""
import argparse
import json
import sys
import time
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server.serve import Engine  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("src", type=Path)
ap.add_argument("--ckpt", type=Path, required=True)
ap.add_argument("--tokenizer", type=Path, required=True)
ap.add_argument("--out", type=Path, required=True)
ap.add_argument("--limit", type=int, default=400)
args = ap.parse_args()

eng = Engine(args.ckpt, args.tokenizer, "cuda" if torch.cuda.is_available() else "cpu")
rows = []
if args.src.suffix == ".jsonl":
    for line in args.src.open():
        r = json.loads(line)
        rows.append({"prompt": r["prompt"], "expected": r["code"], "genre": r.get("genre")})
else:
    rows = [{"prompt": l.strip()} for l in args.src.open() if l.strip()]
rows = rows[:args.limit]
t0 = time.time()
with args.out.open("w") as f:
    for r in rows:
        eng.latest += 1
        r["generated"] = "".join(eng.stream(r["prompt"], eng.latest))
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
print(f"{len(rows)} generated in {time.time() - t0:.1f}s")
