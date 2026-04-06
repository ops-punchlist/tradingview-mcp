#!/bin/bash
# Session 4 — cron-friendly wrapper (sources shell env, then pushes to KV)
set -euo pipefail
# Non-interactive shells may not load .zshrc; source it if present
if [[ -f "${HOME}/.zshrc" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/.zshrc"
fi
cd "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp"
exec node scripts/dashboard_push.mjs >> /tmp/dashboard_push.log 2>&1
