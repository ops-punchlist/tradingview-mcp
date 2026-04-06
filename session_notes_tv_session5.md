# Session Notes — TradingView MCP Session 5
_Conviction scoring + Telegram proposals + launchd — April 2026_

## Implemented

### Scripts
- **`scripts/kv_cloudflare.mjs`** — shared KV GET/PUT for JSON/text keys.
- **`scripts/scoring_engine.mjs`** — reads `dashboard:state`, applies `RULES` + gates from Session 5 work order, writes `dashboard:state.scoring`, seeds `scoring:trade_state`, may send Telegram via `sendProposalCard`. Uses native Telegram HTTP API (no extra npm dep).
- **`scripts/telegram_bot.mjs`** — `sendProposalCard(result)` + **`--daemon`** long-poll `getUpdates`, handles `approve_*` / `deny_*`, appends to KV `scoring:proposals`.
- **`scripts/run_scorer.sh`** / **`scripts/run_telegram_bot.sh`** — `source ~/.zshrc` then `node` (so `TELEGRAM_*` and Cloudflare env load under launchd).

### `scripts/dashboard_push.mjs`
- Fetches existing **`dashboard:state`** before PUT; **merges** `scoring` and `bankroll` so pushes do not wipe scorer output.

### LaunchAgents (repo + `~/Library/LaunchAgents/`)
- **`com.steveonan.btc-scoring-engine`** — every **3600s** + `RunAtLoad` → `run_scorer.sh` → `/tmp/scoring_engine.log`.
- **`com.steveonan.btc-telegram-bot`** — **`KeepAlive`** + `RunAtLoad` → `run_telegram_bot.sh` → `/tmp/telegram_bot.log`.

### npm
- `npm run scoring:run` — one-off scorer.
- `npm run telegram:daemon` — foreground daemon (for debugging).

## Operator commands

```bash
# (re)load after editing plists in repo
cp scripts/com.steveonan.btc-scoring-engine.plist ~/Library/LaunchAgents/
cp scripts/com.steveonan.btc-telegram-bot.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.steveonan.btc-scoring-engine.plist
launchctl unload ~/Library/LaunchAgents/com.steveonan.btc-telegram-bot.plist
launchctl load ~/Library/LaunchAgents/com.steveonan.btc-scoring-engine.plist
launchctl load ~/Library/LaunchAgents/com.steveonan.btc-telegram-bot.plist
```

## Deviations / follow-ups
- **Funding rate units:** Kraken `funding_rate_current` is mapped with a heuristic (`< 0.005` → ×100 as %/hr). Confirm against live ticker and adjust in code if needed.
- **`btc.vs_200sma`:** still often `unknown` from push — macro sub-score uses other fields; enrich push later if desired.
- **2-loss pause:** `scoring:trade_state.consecutive_losses` is not auto-incremented from Telegram yet (Session 6 journal can wire outcomes).
- **Factor logic** is best-effort on sparse TV indicator shapes; tune `countSignals` / study name matching as your chart layout stabilizes.

## Session 6 (suggested)
- Trade journal, graduation tracker, weekly digest; wire approve/deny → bankroll + consecutive loss counter.
