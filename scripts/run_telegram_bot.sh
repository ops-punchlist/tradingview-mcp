#!/bin/bash
# Session 5 — Telegram long poll daemon (Approve/Deny callbacks → KV)
set -euo pipefail
if [[ -f "${HOME}/.zshrc" ]]; then
  # shellcheck disable=SC1090
  source "${HOME}/.zshrc"
fi
cd "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp"
exec node scripts/telegram_bot.mjs --daemon >> /tmp/telegram_bot.log 2>&1
