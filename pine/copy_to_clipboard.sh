#!/bin/bash
# Copy one Pine file to macOS clipboard for pasting into TradingView Editor.
# Usage: ./copy_to_clipboard.sh main | rsi | macd
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == '#' ]] || [[ "${1:-}" == '#'* ]]; then
  echo "You passed a line that starts with # — the shell may try to run # as a command." >&2
  echo "Run only:  $0 main    or    $0 rsi    or    $0 macd" >&2
  exit 1
fi

case "${1:-}" in
  main|mai) f="btc_scoring_main.pine" ;; # mai = common typo
  rsi)      f="btc_scoring_rsi.pine" ;;
  macd)     f="btc_scoring_macd.pine" ;;
  "")
    echo "Usage: $0 main | rsi | macd" >&2
    exit 1
    ;;
  *)
    echo "Unknown argument: $1" >&2
    echo "Usage: $0 main | rsi | macd" >&2
    exit 1
    ;;
esac
pbcopy < "$DIR/$f"
echo "Copied $f to clipboard."
echo "Next: TradingView → Pine Editor → Cmd+V → Save → Add to chart (KRAKEN:BTCUSD)."
