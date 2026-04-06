#!/bin/bash
# Copy one Pine file to macOS clipboard for pasting into TradingView Editor.
# Usage: ./copy_to_clipboard.sh main | rsi | macd
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
case "${1:-}" in
  main) f="btc_scoring_main.pine" ;;
  rsi)  f="btc_scoring_rsi.pine" ;;
  macd) f="btc_scoring_macd.pine" ;;
  *)
    echo "Usage: $0 main | rsi | macd" >&2
    exit 1
    ;;
esac
pbcopy < "$DIR/$f"
echo "Copied $f to clipboard — paste in TradingView Pine Editor → Add to chart."
