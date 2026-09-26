#!/bin/sh
# Drive the HP laptop (RTX 3050) from the Mac.
#   tools/hp.sh sync                 pull the repo on the HP
#   tools/hp.sh put <file> [dest]    copy a file to C:\gcode
#   tools/hp.sh run "<cmd>" <log>    start a detached command on the HP
#   tools/hp.sh log <log> [n]        tail a log on the HP
#   tools/hp.sh serve <ckpt>         (re)start the inference server on the HP
#   tools/hp.sh tunnel               forward localhost:8765 -> HP:8765
set -e
HP=jurek@MacNotBook.local
SSH="ssh -o BatchMode=yes $HP"
case "$1" in
  sync)  $SSH 'git -C C:\gcode\repo pull -q; git -C C:\gcode\repo log --oneline -1' ;;
  put)   scp -q "$2" "$HP:C:/gcode/${3:-$(basename "$2")}" && echo "sent $2" ;;
  run)   $SSH "powershell -ExecutionPolicy Bypass -File C:\\gcode\\launch.ps1 -cmd \"$2\" -log C:\\gcode\\$3" ;;
  log)   $SSH "Get-Content C:\\gcode\\$2 -Tail ${3:-15}" ;;
  serve)
    $SSH 'Get-CimInstance Win32_Process -Filter "Name=''python.exe''" | Where-Object { $_.CommandLine -like "*serve.py*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }' || true
    $SSH "powershell -ExecutionPolicy Bypass -File C:\\gcode\\launch.ps1 -cmd \"C:\\gcode\\.venv\\Scripts\\python C:\\gcode\\repo\\server\\serve.py --ckpt $2 --tokenizer C:\\gcode\\tokenizer.json --port 8765\" -log C:\\gcode\\serve.log" ;;
  tunnel) exec ssh -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -L 8765:localhost:8765 $HP ;;
  *) sed -n '2,9p' "$0" ;;
esac
