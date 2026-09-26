"""
Instruction tuning for G-Code: description -> program.

One example per row, padded to the longest example in the batch, so the
model never attends from one program into an unrelated one. Loss is computed
only on the program tokens (see data/build_sft.py).

With --init the pretrained base is loaded and tuned at a low learning rate.
Without it a model is trained from scratch on the pairs alone — used for the
small end-to-end test model (--preset mini).

    python train/finetune.py --init run/best.pt --data data/gc_sft --out run_sft
    python train/finetune.py --preset mini --data data/gc_sft --out run_mini --lr 1e-3
"""

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from model.gpt import GPT, GPTConfig  # noqa: E402
from train.train import lr_at, save_ckpt  # noqa: E402

PRESETS = {
    "base": dict(n_layer=12, n_head=12, n_embd=768, ffn_hidden=2048),
    "mini": dict(n_layer=6, n_head=8, n_embd=384, ffn_hidden=1024, block_size=768),
}


class Pairs:
    def __init__(self, prefix, device, val_frac=0.01, max_len=768):
        self.tokens = np.memmap(f"{prefix}_tokens.bin", dtype=np.uint16, mode="r")
        self.mask = np.memmap(f"{prefix}_mask.bin", dtype=np.uint8, mode="r")
        offs = np.fromfile(f"{prefix}_offsets.bin", dtype=np.int64)
        ends = np.append(offs[1:], len(self.tokens))
        cut = int(len(offs) * (1 - val_frac))
        self.split = {"train": (offs[:cut], ends[:cut]), "val": (offs[cut:], ends[cut:])}
        self.device = device
        self.max_len = max_len
        self.rng = np.random.default_rng(0)

    def batch(self, n, split="train", idx=None):
        starts, ends = self.split[split]
        pick = self.rng.integers(0, len(starts), n) if idx is None else idx
        L = int(min(self.max_len, max(ends[i] - starts[i] for i in pick)))
        x = np.zeros((n, L - 1), np.int64)
        y = np.full((n, L - 1), -1, np.int64)
        for r, i in enumerate(pick):
            s, e = int(starts[i]), int(min(ends[i], starts[i] + L))
            t = self.tokens[s:e].astype(np.int64)
            m = self.mask[s:e].astype(bool)
            k = len(t) - 1
            x[r, :k] = t[:-1]
            y[r, :k] = np.where(m[1:], t[1:], -1)
        xt, yt = torch.from_numpy(x), torch.from_numpy(y)
        if self.device == "cuda":
            return xt.pin_memory().to("cuda", non_blocking=True), yt.pin_memory().to("cuda", non_blocking=True)
        return xt.to(self.device), yt.to(self.device)

    def n(self, split="train"):
        return len(self.split[split][0])


@torch.no_grad()
def evaluate(model, data, batch, ctx):
    model.eval()
    starts, _ = data.split["val"]
    losses = []
    for i in range(0, min(len(starts), 2048), batch):
        idx = np.arange(i, min(i + batch, len(starts)))
        x, y = data.batch(len(idx), "val", idx)
        with ctx:
            _, loss = model(x, targets=y, return_logits=False)
        losses.append(loss.mean().item())
    model.train()
    return sum(losses) / max(1, len(losses))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", type=Path, default=None)
    ap.add_argument("--preset", choices=list(PRESETS), default="base")
    ap.add_argument("--vocab-size", type=int, default=32000)
    ap.add_argument("--data", type=str, default="data/gc_sft")
    ap.add_argument("--out", type=Path, default=Path("run_sft"))
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--grad-accum", type=int, default=2)
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--min-lr", type=float, default=1e-5)
    ap.add_argument("--warmup", type=int, default=100)
    ap.add_argument("--weight-decay", type=float, default=0.0)
    ap.add_argument("--eval-every", type=int, default=250)
    ap.add_argument("--ckpt-every", type=int, default=250)
    ap.add_argument("--log-every", type=int, default=25)
    ap.add_argument("--time-limit", type=float, default=0.0, help="hours")
    ap.add_argument("--single-gpu", action="store_true")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    use_amp = device == "cuda"
    bf16 = use_amp and torch.cuda.get_device_capability()[0] >= 8
    ctx = (torch.autocast(device_type="cuda", dtype=torch.bfloat16 if bf16 else torch.float16)
           if use_amp else torch.autocast(device_type="cpu", enabled=False))
    scaler = torch.cuda.amp.GradScaler(enabled=use_amp and not bf16)

    if args.init:
        ck = torch.load(args.init, map_location="cpu", weights_only=False)
        cfg = GPTConfig(**ck["config"])
        model = GPT(cfg)
        model.load_state_dict(ck["model"])
        print(f"loaded {args.init} (step {ck.get('step')}, val {ck.get('best_val', float('nan')):.4f})")
    else:
        cfg = GPTConfig(vocab_size=args.vocab_size, **PRESETS[args.preset])
        model = GPT(cfg)
        print(f"from scratch: preset {args.preset}")
    model.to(device)
    print(f"params {model.num_params():,}  device {device}  amp {'bf16' if bf16 else 'fp16' if use_amp else 'off'}")

    decay = [p for p in model.parameters() if p.dim() >= 2]
    no_decay = [p for p in model.parameters() if p.dim() < 2]
    opt = torch.optim.AdamW([{"params": decay, "weight_decay": args.weight_decay},
                             {"params": no_decay, "weight_decay": 0.0}],
                            lr=args.lr, betas=(0.9, 0.95), eps=1e-8, fused=(device == "cuda"))

    data = Pairs(args.data, device, max_len=cfg.block_size)
    ex_per_step = args.batch_size * args.grad_accum
    max_steps = max(1, int(data.n() * args.epochs / ex_per_step))
    print(f"{data.n():,} train / {data.n('val'):,} val examples -> {max_steps} steps of {ex_per_step}")

    args.out.mkdir(parents=True, exist_ok=True)
    step, best = 0, float("inf")
    if args.resume and (args.out / "ckpt.pt").exists():
        rc = torch.load(args.out / "ckpt.pt", map_location=device, weights_only=False)
        model.load_state_dict(rc["model"]); opt.load_state_dict(rc["optimizer"])
        step, best = rc["step"], rc.get("best_val", float("inf"))
        print(f"resumed at step {step}")

    core = model
    if device == "cuda" and torch.cuda.device_count() > 1 and not args.single_gpu:
        model = torch.nn.DataParallel(model)

    log = (args.out / "log.jsonl").open("a")
    t0 = t_start = time.time()
    model.train()
    while step < max_steps:
        lr = lr_at(step, args.warmup, max_steps, args.lr, args.min_lr)
        for g in opt.param_groups:
            g["lr"] = lr
        opt.zero_grad(set_to_none=True)
        for _ in range(args.grad_accum):
            x, y = data.batch(args.batch_size)
            with ctx:
                _, loss = model(x, targets=y, return_logits=False)
                loss = loss.mean() / args.grad_accum
            scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(opt)
        scaler.update()
        step += 1
        if step % args.log_every == 0:
            dt = time.time() - t0
            l = loss.item() * args.grad_accum
            print(f"step {step:>6}/{max_steps}  loss {l:.4f}  lr {lr:.2e}  {args.log_every * ex_per_step / dt:.0f} ex/s", flush=True)
            log.write(json.dumps({"step": step, "loss": l, "lr": lr}) + "\n"); log.flush()
            t0 = time.time()
        if step % args.eval_every == 0 or step == max_steps:
            v = evaluate(model, data, args.batch_size, ctx)
            print(f"  -> val {v:.4f}", flush=True)
            log.write(json.dumps({"step": step, "val": v}) + "\n"); log.flush()
            if v < best:
                best = v
                save_ckpt(args.out / "best.pt", core, opt, step, best, cfg, args)
            t0 = time.time()
        if step % args.ckpt_every == 0:
            save_ckpt(args.out / "ckpt.pt", core, opt, step, best, cfg, args)
        if args.time_limit and time.time() - t_start > args.time_limit * 3600:
            print(f"time limit at step {step}")
            break
    save_ckpt(args.out / "ckpt.pt", core, opt, step, best, cfg, args)
    print(f"done step {step} best val {best:.4f}")


if __name__ == "__main__":
    main()
