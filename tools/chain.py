"""
Unattended Kaggle chain for G-Code: prep -> pretrain sessions -> SFT.

Idempotent: every run reads the live state of the kernels and does the one
next thing (push a session, or nothing). Stops and writes STOP_REASON when a
kernel ends in ERROR/CANCEL so a broken run never burns quota in a loop.

    python3 tools/chain.py            # loop until done (run detached)
    python3 tools/chain.py --once     # single decision, for debugging
"""

import json
import re
import subprocess
import sys
import time
from pathlib import Path

# Lives outside ~/Downloads on purpose: macOS privacy protection stops
# launchd jobs from reading ~/Downloads, so the LaunchAgent runs a copy of
# this script from ~/.gcode-chain with its own venv (install.sh sets it up).
HOME = Path.home() / ".gcode-chain"
ROOT = HOME / "src"
WORK = HOME / "state"
WORK.mkdir(parents=True, exist_ok=True)
PY = str(HOME / "venv" / "bin" / "python")
USER = "jerzysukiennik"
PREP = f"{USER}/gcode-prep"
TARGET_STEPS = 3400
MAX_SESSIONS = 4
LOG = WORK / "chain.log"


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with LOG.open("a") as f:
        f.write(line + "\n")


def kaggle(*args, timeout=600):
    r = subprocess.run([PY, "-m", "kaggle", *args], capture_output=True, text=True, timeout=timeout)
    return r.returncode, (r.stdout + r.stderr).strip()


def status(slug):
    rc, out = kaggle("kernels", "status", slug)
    if rc != 0 or "has status" not in out:
        return None
    return out.split("KernelWorkerStatus.")[-1].strip().strip('"')


def push(slug, code_file, sources, gpu=True, datasets=()):
    d = WORK / slug.split("/")[1]
    d.mkdir(exist_ok=True)
    (d / Path(code_file).name).write_text((ROOT / code_file).read_text())
    meta = {"id": slug, "title": slug.split("/")[1].replace("-", " "), "code_file": Path(code_file).name,
            "language": "python", "kernel_type": "script", "is_private": "true",
            "enable_gpu": "true" if gpu else "false", "enable_internet": "true",
            "dataset_sources": list(datasets), "competition_sources": [], "kernel_sources": sources, "model_sources": []}
    if gpu:
        meta["machine_shape"] = "NvidiaTeslaT4"
    (d / "kernel-metadata.json").write_text(json.dumps(meta, indent=2))
    rc, out = kaggle("kernels", "push", "-p", str(d))
    log(f"push {slug} sources={sources} -> {out[-200:]}")
    return rc == 0


def last_step(slug):
    d = WORK / "out" / slug.split("/")[1]
    d.mkdir(parents=True, exist_ok=True)
    rc, out = kaggle("kernels", "output", slug, "-p", str(d), "--file-pattern", "log.jsonl", timeout=900)
    step = 0
    for p in d.rglob("log.jsonl"):
        for line in p.read_text().splitlines():
            try:
                step = max(step, json.loads(line).get("step", 0))
            except json.JSONDecodeError:
                pass
    return step


LABEL = "com.gzowo.gcode-chain"
PLIST = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"


def unload():
    """The chain is finished or stopped: remove its LaunchAgent."""
    import os
    if PLIST.exists():
        PLIST.unlink()
        subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"], capture_output=True)
        log("LaunchAgent removed")


def stop(reason):
    (WORK / "STOP_REASON").write_text(reason)
    log("STOP: " + reason)
    unload()
    sys.exit(1)


def decide():
    """Returns True when everything is finished."""
    if (WORK / "STOP").exists():
        stop("manual STOP file")
    st = status(PREP)
    if st != "COMPLETE":
        if st in ("ERROR", "CANCEL_ACKNOWLEDGED"):
            stop(f"prep ended {st}")
        log(f"prep {st}")
        return False
    sessions = [f"{USER}/gcode-train-s{i}" for i in range(1, MAX_SESSIONS + 1)]
    prev = None
    for s in sessions:
        st = status(s)
        if st is None:
            if prev:
                step = last_step(prev)
                log(f"{prev} finished at step {step}")
                if step >= TARGET_STEPS:
                    return sft(prev)
            srcs = [PREP] + ([prev] if prev else [])
            push(s, "kaggle/train_kernel.py", srcs)
            return False
        if st in ("QUEUED", "RUNNING"):
            log(f"{s} {st}")
            return False
        if st != "COMPLETE":
            stop(f"{s} ended {st}")
        prev = s
    return sft(prev)


def sft(last):
    slug = f"{USER}/gcode-sft"
    st = status(slug)
    if st is None:
        if not dataset_ready():
            log("waiting for gcode-sft dataset")
            return False
        push(slug, "kaggle/sft_kernel.py", [PREP, last], datasets=[f"{USER}/gcode-sft"])
        return False
    if st in ("QUEUED", "RUNNING"):
        log(f"sft {st}")
        return False
    if st == "COMPLETE":
        log("SFT COMPLETE — chain done")
        (WORK / "DONE").write_text(last)
        return True
    stop(f"sft ended {st}")


def dataset_ready():
    rc, out = kaggle("datasets", "status", f"{USER}/gcode-sft")
    return rc == 0 and "ready" in out.lower()


if __name__ == "__main__":
    once = "--once" in sys.argv
    if (WORK / "DONE").exists() or (WORK / "STOP_REASON").exists():
        unload()
        sys.exit(0)
    while True:
        try:
            if decide():
                unload()
                break
        except subprocess.TimeoutExpired as e:
            log(f"timeout: {e}")
        if once:
            break
        time.sleep(600)
