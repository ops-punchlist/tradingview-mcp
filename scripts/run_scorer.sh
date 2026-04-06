#!/bin/bash
# Session 5 — hourly scorer (sources ~/.zshrc for TELEGRAM_* + Cloudflare)
set -euo pipefail
if [[ -f "${HOME}/.zshrc" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/.zshrc"
fi
cd "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp"
exec node scripts/scoring_engine.mjs >> /tmp/scoring_engine.log 2>&1
