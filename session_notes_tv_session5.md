# Session Notes — TradingView MCP Session 5
_Conviction scoring + Telegram proposals + launchd — April 2026_

## Status (shipped)

- **`main`** on GitHub includes Session 5 code (`afb9db5` area: scoring engine, Telegram daemon, KV merge, plists, these notes).
- **LaunchAgents** installed under **`~/Library/LaunchAgents/`** and **`launchctl load`**’d: **`com.steveonan.btc-scoring-engine`** (hourly) + **`com.steveonan.btc-telegram-bot`** (`KeepAlive`).
- **Telegram:** `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` confirmed set in shell; wrappers **`source ~/.zshrc`** so **`launchd`** jobs see them.

## First validation run (2026-04-06)

Manual: `source ~/.zshrc` → `node scripts/scoring_engine.mjs` (same as `npm run scoring:run`).

- **Outcome:** scorer exited **0**, updated **`dashboard:state.scoring`** in KV; **no proposal** (correct for that snapshot).
- **Example result (before funding fix):** a run hit **`funding_block_long`** because an old heuristic mis-read Kraken’s **`fundingRate`** (USD/contract/hour) as if it were already a percentage. **Current code:** `fundingPctPerHr = (fundingRate / btc.price) * 100` using **`btc.price`** from `dashboard:state` (see `scoring_engine.mjs`).
- **Interpretation:** with correct units, typical PF_XBTUSD funding is a tiny **%/hr** (e.g. ~**−0.0008%/hr** at ~$69.9k when rate ≈ **−0.559 USD/h**), so the **0.05%/hr** long gate applies to the **converted** value, not the raw USD rate.

## Work order

- Spec: **`docs/session_work_order_tv_session5.md`** (constants, gates, Telegram architecture).

## KV keys used by Session 5

| Key | Purpose |
|-----|---------|
| `dashboard:state` | Read chart/macro/kraken; **merge** `scoring` on push; scorer writes `scoring.*` |
| `scoring:trade_state` | Pause / drawdown gates; seeded on first scorer run |
| `scoring:last_proposal_at` | ISO string dedup window (`RULES.PROPOSAL_DEDUP_HOURS`) |
| `scoring:last_proposal_direction` | Last proposed direction for dedup |
| `scoring:proposals` | Append-only log from Telegram Approve/Deny callbacks |

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
- **Funding rate units:** Kraken **`fundingRate`** on PF_XBTUSD is **USD per contract per hour** (signed). **`funding_pct_per_hr`** = `(fundingRate / btc.price) * 100` using **`dashboard:state.btc.price`** (CoinGecko spot in the push payload).
- **`btc.vs_200sma`:** still often `unknown` from push — macro sub-score uses other fields; enrich push later if desired.
- **2-loss pause:** `scoring:trade_state.consecutive_losses` is not auto-incremented from Telegram yet (Session 6 journal can wire outcomes).
- **Factor logic** is best-effort on sparse TV indicator shapes; tune `countSignals` / study name matching as your chart layout stabilizes.

## Session 6 (suggested)
- Trade journal, graduation tracker, weekly digest; wire approve/deny → bankroll + consecutive loss counter.

---

_Session 5 delivered — April 6, 2026_
