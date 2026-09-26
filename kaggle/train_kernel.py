"""
Kaggle kernel: G-Code pretraining session (GPU T4 x2, Internet on).

Inputs (kernel_sources): gcode-prep for the token binaries and, from the
second session on, the previous training session for its checkpoint. Each
session stops itself after TIME_LIMIT hours so Kaggle marks it COMPLETE —
a session Kaggle kills is CANCEL_ACKNOWLEDGED and cannot be mounted as the
next session's input (learned on G-Mini).
"""

import glob
import os
import shutil
import subprocess
import sys

REPO = "https://github.com/JerzySukiennik/g-code.git"
OUT = "/kaggle/working/run"

# 16 x 30 x 1024 = 491,520 tokens/step; 3400 steps = 1.67B tokens (~1.4 epochs).
BATCH, ACCUM, STEPS, WARMUP = 16, 30, 3400, 200
TIME_LIMIT = 11.2

subprocess.run(["git", "clone", "--depth", "1", REPO, "/tmp/g-code"], check=True)
os.chdir("/tmp/g-code")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "tokenizers"], check=True)

hits = glob.glob("/kaggle/input/**/gc_train.bin", recursive=True)
if not hits:
    for root, dirs, files in os.walk("/kaggle/input"):
        print(root, files[:10])
    raise SystemExit("gc_train.bin not found")
data = os.path.dirname(hits[0])
print("data:", data)

os.makedirs(OUT, exist_ok=True)
tok = glob.glob("/kaggle/input/**/tokenizer.json", recursive=True)
if tok:
    shutil.copy(tok[0], f"{OUT}/tokenizer.json")

resume = []
ck = sorted(glob.glob("/kaggle/input/**/run/ckpt.pt", recursive=True))
if ck:
    shutil.copy(ck[0], f"{OUT}/ckpt.pt")
    best = ck[0].replace("ckpt.pt", "best.pt")
    if os.path.exists(best):
        shutil.copy(best, f"{OUT}/best.pt")
    log = ck[0].replace("ckpt.pt", "log.jsonl")
    if os.path.exists(log):
        shutil.copy(log, f"{OUT}/log.jsonl")
    resume = ["--resume"]
    print("resuming from", ck[0])
else:
    print("starting from scratch")

cmd = [sys.executable, "train/train.py", "--data", f"{data}/gc", "--out", OUT,
       "--batch-size", str(BATCH), "--grad-accum", str(ACCUM),
       "--max-steps", str(STEPS), "--warmup", str(WARMUP),
       "--eval-every", "100", "--ckpt-every", "50", "--log-every", "10",
       "--time-limit", str(TIME_LIMIT)] + resume
print(" ".join(cmd), flush=True)
subprocess.run(cmd, check=True)
