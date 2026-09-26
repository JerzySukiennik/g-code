"""
Kaggle kernel: G-Code instruction tuning (GPU T4 x2).

Inputs: gcode-prep (tokenizer), the last pretraining session (run/best.pt)
and the gcode-sft dataset (pairs.jsonl.gz from synth/generate.mjs).
"""

import glob
import os
import shutil
import subprocess
import sys

REPO = "https://github.com/JerzySukiennik/g-code.git"
OUT = "/kaggle/working/sft"

subprocess.run(["git", "clone", "--depth", "1", REPO, "/tmp/g-code"], check=True)
os.chdir("/tmp/g-code")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "tokenizers"], check=True)


def find(pattern):
    hits = sorted(glob.glob(f"/kaggle/input/**/{pattern}", recursive=True))
    if not hits:
        for root, _, files in os.walk("/kaggle/input"):
            print(root, files[:8])
        raise SystemExit(f"{pattern} not found")
    return hits


tok = find("tokenizer.json")[0]
base = [p for p in find("best.pt") if "/sft/" not in p][0]
pairs = find("pairs*.jsonl*")
os.makedirs(OUT, exist_ok=True)
shutil.copy(tok, f"{OUT}/tokenizer.json")
print("tokenizer", tok, "\nbase", base, "\npairs", pairs, flush=True)

subprocess.run([sys.executable, "data/build_sft.py", *pairs, "--tokenizer", tok, "--out", "/tmp/gc_sft"], check=True)
subprocess.run([sys.executable, "train/finetune.py", "--init", base, "--data", "/tmp/gc_sft", "--out", OUT,
                "--batch-size", "48", "--grad-accum", "1", "--epochs", "1.5", "--lr", "1e-4", "--min-lr", "1e-5",
                "--eval-every", "500", "--ckpt-every", "500", "--time-limit", "8"], check=True)
