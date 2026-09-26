"""
Pack description -> program pairs for instruction tuning.

Each example becomes

    <|prompt|>a jumping green sphere<|code|>world({ ... })\nadd(...)<|endoftext|>

and only the program (plus the closing <|endoftext|>) is scored: the model
should learn to write code for a description, not to invent descriptions.

Outputs <prefix>_tokens.bin (uint16), <prefix>_mask.bin (uint8, 1 = scored)
and <prefix>_offsets.bin (int64, start of every example). Examples are
shuffled before the validation tail is cut, so the held-out set is a fair
sample of every genre and both languages.

Usage:
    python data/build_sft.py pairs.jsonl --tokenizer tokenizer.json --out data/gc_sft
"""

import argparse
import gzip
import json
import random
from pathlib import Path

import numpy as np
from tokenizers import Tokenizer

PROMPT, CODE, EOT = "<|prompt|>", "<|code|>", "<|endoftext|>"


def read_pairs(paths):
    for p in paths:
        op = gzip.open if str(p).endswith(".gz") else open
        with op(p, "rt", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    yield json.loads(line)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pairs", nargs="+", type=Path)
    ap.add_argument("--tokenizer", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("data/gc_sft"))
    ap.add_argument("--max-len", type=int, default=768)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    tok = Tokenizer.from_file(str(args.tokenizer))
    ids = {t: tok.token_to_id(t) for t in (PROMPT, CODE, EOT)}
    assert all(v is not None for v in ids.values()), ids

    rows = list(read_pairs(args.pairs))
    random.Random(args.seed).shuffle(rows)
    print(f"{len(rows):,} pairs")

    toks, mask, offs = [], [], []
    pos = dropped = 0
    B = 4096
    for i in range(0, len(rows), B):
        chunk = rows[i:i + B]
        pe = tok.encode_batch([r["prompt"] for r in chunk], add_special_tokens=False)
        ce = tok.encode_batch([r["code"] for r in chunk], add_special_tokens=False)
        for p, c in zip(pe, ce):
            a = [ids[PROMPT]] + p.ids + [ids[CODE]]
            b = c.ids + [ids[EOT]]
            if len(a) + len(b) > args.max_len:
                dropped += 1
                continue
            offs.append(pos)
            toks.append(np.asarray(a + b, dtype=np.uint16))
            mask.append(np.concatenate([np.zeros(len(a), np.uint8), np.ones(len(b), np.uint8)]))
            pos += len(a) + len(b)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    np.concatenate(toks).tofile(f"{args.out}_tokens.bin")
    np.concatenate(mask).tofile(f"{args.out}_mask.bin")
    np.asarray(offs, dtype=np.int64).tofile(f"{args.out}_offsets.bin")
    lens = np.diff(np.asarray(offs + [pos]))
    print(f"tokens {pos:,}  examples {len(offs):,}  dropped {dropped}  "
          f"mean len {lens.mean():.0f}  p99 {np.percentile(lens, 99):.0f}  max {lens.max()}")
    print("sample:", tok.decode(toks[0].tolist(), skip_special_tokens=False)[:400])


if __name__ == "__main__":
    main()
