"""
Kaggle kernel: build G-Code's token binaries (CPU only, Internet on).

Intermediates (raw parquet, filtered text) live in /tmp so the saved output
holds only what training needs: gc_train.bin, gc_val.bin, tokenizer.json.
"""

import os
import shutil
import subprocess
import sys

REPO = "https://github.com/JerzySukiennik/g-code.git"
WORK = "/kaggle/working"
TMP = "/tmp/gcode"

subprocess.run(["git", "clone", "--depth", "1", REPO, "/tmp/g-code"], check=True)
os.chdir("/tmp/g-code")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "tokenizers", "datasets", "pyarrow"], check=True)

try:
    from kaggle_secrets import UserSecretsClient
    os.environ["HF_TOKEN"] = UserSecretsClient().get_secret("HF_TOKEN")
except Exception as e:
    print(f"no HF token ({type(e).__name__})")

subprocess.run([sys.executable, "data/prep_pretrain.py", "--work", TMP], check=True)

for f in ("gc_train.bin", "gc_val.bin", "tokenizer.json", "pack.done", "code.done"):
    shutil.move(f"{TMP}/{f}", f"{WORK}/{f}")
for f in sorted(os.listdir(WORK)):
    print(f"  {f}  {os.path.getsize(f'{WORK}/{f}')/1e9:.2f} GB")
