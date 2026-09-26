#!/bin/sh
# Install (or refresh) the G-Code Kaggle chain as a LaunchAgent that runs
# tools/chain.py --once every 15 minutes from ~/.gcode-chain.
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd)
H="$HOME/.gcode-chain"
mkdir -p "$H/src/kaggle" "$H/state"
[ -x "$H/venv/bin/python" ] || { python3 -m venv "$H/venv"; "$H/venv/bin/pip" install -q kaggle; }
cp "$REPO"/kaggle/*.py "$H/src/kaggle/"
cp "$REPO/tools/chain.py" "$H/chain.py"
PL="$HOME/Library/LaunchAgents/com.gzowo.gcode-chain.plist"
cat > "$PL" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.gzowo.gcode-chain</string>
  <key>ProgramArguments</key><array><string>$H/venv/bin/python</string><string>$H/chain.py</string><string>--once</string></array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$H/state/launchd.log</string>
  <key>StandardErrorPath</key><string>$H/state/launchd.log</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/com.gzowo.gcode-chain" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PL"
echo "chain installed; log: $H/state/chain.log"
