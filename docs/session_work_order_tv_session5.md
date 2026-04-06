# Session Work Order — TradingView MCP
_Session 5 — Conviction Scoring Engine + Telegram Proposals_
_April 2026_

---

## Objective
Build the conviction scoring engine from `btc_perp_strategy_v1.docx`. Agent reads live dashboard state from KV, scores the current BTC setup across 5 factors, calculates EV, and fires a formatted Telegram proposal card with Approve/Deny inline buttons. Paper trading only — no live execution.

---

## Pre-approved for this session — execute without stopping to confirm:
- Read KV `dashboard:state` — read-only
- Create `scripts/scoring_engine.mjs`
- Create `scripts/telegram_bot.mjs`
- Create `scripts/run_scorer.sh` wrapper
- Create LaunchAgent plist for scoring loop
- Create LaunchAgent plist for `telegram_bot.mjs --daemon` (polling / callback handler)
- Edit `scripts/dashboard_push.mjs` to write scoring output back to KV
- Install any npm packages needed (node-telegram-bot-api or similar)
- Write session notes on completion

**Stop and ask only if:**
- Any step requires live trade execution on Kraken (real money)
- Telegram bot token or chat ID not available in env — flag and wait
- A fix fails twice and root cause is unclear
- Hard Stop condition triggered (see CLAUDE.md)

---

## Context

### Strategy source of truth
`btc_perp_strategy_v1.docx` — all scoring constants, weights, EV formula, and Telegram card format live there. Do not deviate from it.

### Current KV payload shape (`dashboard:state`)
```json
{
  "updated_at": "ISO",
  "btc": { "price": 0, "change_24h": 0, "vs_200sma": "unknown" },
  "chart_1h": { "symbol": "KRAKEN:BTCUSD", "timeframe": "60", "ohlcv": {}, "indicators": [], "levels": [] },
  "chart_4h": { "symbol": "KRAKEN:BTCUSD", "timeframe": "240", "ohlcv": {}, "indicators": [], "levels": [] },
  "macro": { "fear_greed": 0, "fear_greed_label": "", "bond_yield_10yr": null, "oil_trend": "unknown", "thesis_status": "active" },
  "kraken": { "funding_rate_current": null, "open_positions": [], "balances": {} },
  "scoring": { "last_score": null, "last_grade": null, "last_ev": null, "last_scored_at": null },
  "bankroll": { "starting": 1000, "current": 1000, "drawdown_pct": 0, "sats_accumulated": 0, "trade_count": 0, "win_count": 0 }
}
```

### Env vars on Mac mini (`~/.zshrc`):
```bash
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID=3c26eee30bc4f90d841016e831a3b29f
CF_KV_NAMESPACE_ID=46cdb112832f47848a91a8f1109a0ebe
KRAKEN_API_KEY
KRAKEN_API_SECRET
TELEGRAM_BOT_TOKEN   # Steve will add this — flag if missing
TELEGRAM_CHAT_ID     # Steve will add this — flag if missing
```

### Key paths:
- Project: `/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp`
- Scoring engine: `scripts/scoring_engine.mjs` (create this)
- Telegram bot: `scripts/telegram_bot.mjs` (create this)
- Push script: `scripts/dashboard_push.mjs` (modify to write scoring output)
- KV key: `dashboard:state`

---

## Task 1 — Build `scripts/scoring_engine.mjs`

Implement all 5 factors exactly per the strategy doc. The engine reads the current KV state and produces a score object.

### Factor 1 — Trend Alignment (25 pts)
```
1H + 4H + Daily all agree → 25 pts
Two of three agree → 15 pts
1H only → 5 pts
```
Read direction from `chart_1h` and `chart_4h` indicator data. For Daily, derive from 4H OHLCV trend or mark as "unknown" and score 5 pts if unavailable.

Direction detection logic:
- If RSI > 50 AND price above key MA → bullish
- If RSI < 50 AND price below key MA → bearish
- Otherwise → neutral/mixed

### Factor 2 — Technical Signal Confluence (25 pts)
```
4+ signals present → 25 pts
3 strong signals → 18 pts
3 signals but weak → 10 pts
Below 3 signals → 0 pts
```
Signals to check from indicator data:
1. RSI (bullish: >55, bearish: <45)
2. MACD (bullish: line above signal, bearish: below)
3. Fibonacci level (price near fib level from `levels` array)
4. Volume confirmation (volume above average — from OHLCV)
5. MA crossover (fast MA above/below slow MA)

If indicator data is sparse/null, score conservatively (0-10).

### Factor 3 — Risk/Reward Quality (20 pts)
```
3:1 or better → 20 pts
2.5:1 → 15 pts
2:1 (minimum) → 10 pts
Below 2:1 → 0 pts — HARD RULE: no trade regardless of other scores
```
R:R derived from nearest Fibonacci levels in `levels` array:
- Entry = current BTC price
- Stop = nearest support/fib below entry (long) or above (short)
- Target = next resistance/fib level above entry (long) or below (short)
- If no levels available, score 0 and note "no technical levels available"

### Factor 4 — Funding Rate Environment (15 pts)
```
Below 0.02%/hr → 15 pts
0.02–0.04%/hr → 8 pts
0.04–0.05%/hr → 3 pts
Above 0.05%/hr → 0 pts (AND block long entries entirely)
```
Read from `kraken.funding_rate_current`. If null, score 8 pts (assume neutral).

### Factor 5 — Macro Context + Thesis Overlay (15 pts)

**Step 1 — Broad Macro Base Score:**
```
Fear & Greed: >50 = bullish, 25-50 = neutral, <25 = bearish
BTC vs 200SMA: "above" = bullish, "within5pct" = neutral, "below" = bearish
Bond yield 10yr: <4.5% = bullish, 4.5-5% = neutral, >5% = bearish
Oil trend: "stable"/"falling" = bullish, "sideways" = neutral, "spiking" = bearish
```
Count bullish/neutral/bearish signals:
- 3-4 bullish → 10 base pts
- 2 bullish / 2 neutral → 7 base pts
- Mixed/neutral → 4 base pts
- 3-4 bearish → 1 base pt

**Step 2 — Thesis Overlay Modifier:**
- `thesis_status = "active"` → +3 pts to longs, -3 pts to shorts
- `thesis_status = "neutral"` → 0 modifier
- `thesis_status = "deteriorating"` → -3 pts to longs, +3 pts to shorts

**Step 3 — Hard Downgrade Rule:**
If 3-4 bearish macro signals AND thesis overlay negative for trade direction → downgrade one grade (A→B, B→C, C→no trade). Log this downgrade clearly.

### Score → Grade → Trade Parameters
```
80-100 → Grade A: win_prob=65%, max_leverage=3x (paper cap), max_size=75%
65-79  → Grade B: win_prob=55%, max_leverage=3x (paper cap), max_size=50%
50-64  → Grade C: win_prob=45%, max_leverage=2x, max_size=25%
<50    → No trade
```
Note: leverage capped at 3x during paper trading regardless of grade.

### EV Calculation
```
EV = (win_probability × target_pct) - (loss_probability × stop_pct)
loss_probability = 1 - win_probability
```
If EV <= 0 → no proposal generated regardless of score.

### Output shape from scoring engine:
```json
{
  "scored_at": "ISO timestamp",
  "direction": "long|short",
  "score": 72,
  "grade": "B",
  "ev": 8.45,
  "generate_proposal": true,
  "factors": {
    "trend_alignment": { "score": 15, "max": 25, "detail": "1H + 4H agree, Daily unknown" },
    "signal_confluence": { "score": 18, "max": 25, "detail": "RSI bullish, MACD bullish, Fib level hit" },
    "risk_reward": { "score": 15, "max": 20, "detail": "R:R 2.5:1 — entry 69500, stop 67800, target 73900" },
    "funding_rate": { "score": 8, "max": 15, "detail": "0.031%/hr — moderate" },
    "macro_thesis": { "score": 7, "max": 15, "detail": "F&G 13 bearish, BTC below 200SMA, thesis active +3 long" }
  },
  "entry": 69500,
  "stop": 67800,
  "target_1": 73900,
  "stop_pct": 2.45,
  "target_pct": 6.33,
  "leverage": 3,
  "position_size_pct": 50,
  "funding_rate": 0.031,
  "macro_summary": "Extreme Fear (F&G 13), BTC below 200 SMA. Iran war risk elevated, oil spiking.",
  "thesis_alignment": "Bullish — thesis active, monetization thesis intact despite near-term risk",
  "downgraded": false,
  "downgrade_reason": null,
  "hard_stops_triggered": []
}
```

---

## Task 2 — Build `scripts/telegram_bot.mjs`

Sends the Telegram proposal card with inline Approve/Deny buttons.

### Architecture (approved): one module, two roles

Use **`scripts/telegram_bot.mjs`** as the single Telegram surface:

1. **Exported helper** — e.g. `sendProposalCard(payload)` (or equivalent) so **`scoring_engine.mjs`** can call it after a score run. This path only calls `sendMessage` + inline keyboard; no polling.
2. **Daemon mode** — running `node scripts/telegram_bot.mjs` **with a dedicated flag** (e.g. `--daemon`) starts **`getUpdates` polling** so **Approve / Deny** `callback_query` events are received. The hourly scorer exits; the daemon does not — it writes **`scoring:proposals`** and updates **`scoring:trade_state`** when buttons are tapped.

**Second LaunchAgent** (separate from the scoring loop): load at login, keep the daemon alive (same pattern as dashboard push: `ProgramArguments` → `node` + absolute path to `telegram_bot.mjs` + `--daemon`). If the daemon is not running, proposals may still **send**, but **buttons will not update KV** until it is.

No Cloudflare webhook required for Session 5 unless you later prefer it.

### Card format (exact from strategy doc):
```
TRADE PROPOSAL — BTCUSD LONG
Grade: B
Score: 72/100
EV: +8.45%
Entry: $69,500
Stop: $67,800 (2.45% loss)
Target 1: $73,900 (6.33% gain)
Target 2: Trailing from T1
Leverage: 3x (paper)
Position size: 50% of bankroll
Funding rate: 0.031%/hr

Conviction breakdown:
  Trend alignment:   15/25
  Signal confluence: 18/25
  Risk/reward:       15/20
  Funding rate:       8/15
  Macro/thesis:       7/15

Macro: Extreme Fear (F&G 13). BTC below 200 SMA. Iran war risk elevated.
Thesis: Bullish — monetization thesis intact despite near-term risk.

⚠️ PAPER TRADE — no real money
```

Inline keyboard:
```
[✅ APPROVE]  [❌ DENY]
```

Callback data: `approve_<timestamp>` and `deny_<timestamp>`.

On APPROVE: log to KV `scoring:proposals` with status "approved", log timestamp.
On DENY: log to KV `scoring:proposals` with status "denied", log timestamp.
Neither button executes any real trade.

### Implementation notes:
- Use `node-telegram-bot-api` npm package (install if not present)
- Bot token from `TELEGRAM_BOT_TOKEN` env var
- Chat ID from `TELEGRAM_CHAT_ID` env var
- If either is missing, log warning and skip Telegram — do not crash
- Duplicate proposal prevention: do not send a new proposal if one was sent in the last 4 hours for the same direction (check KV `scoring:last_proposal_at`)
- **Daemon:** register `bot.on('callback_query', …)`; answer callbacks with `answerCallbackQuery`; persist approve/deny to KV as specified in Task 6
- **Scorer:** import the send helper from `telegram_bot.mjs` (or a tiny shared `scripts/telegram_format.mjs` if you need to avoid circular imports — document which you chose in session notes)

---

## Task 3 — Wire scoring output back into KV

After scoring runs, update `dashboard:state.scoring` with:
```json
{
  "last_score": 72,
  "last_grade": "B",
  "last_ev": 8.45,
  "last_scored_at": "ISO timestamp",
  "last_direction": "long",
  "last_proposal_sent": true
}
```

This makes the dashboard conviction panel live.

When editing **`scripts/dashboard_push.mjs`**, ensure each KV PUT **merges** the existing `dashboard:state` (or at least preserves the `scoring` object from the last scorer run). A full blind replace must not wipe `scoring` written between push intervals.

---

## Task 4 — Create `scripts/run_scorer.sh`

```bash
#!/bin/bash
source ~/.zshrc 2>/dev/null || true
cd "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp"
node scripts/scoring_engine.mjs >> /tmp/scoring_engine.log 2>&1
```

Make executable: `chmod +x scripts/run_scorer.sh`

---

## Task 5 — LaunchAgent for scoring loop

Create `scripts/com.steveonan.btc-scoring-engine.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.steveonan.btc-scoring-engine</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp/scripts/run_scorer.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/scoring_engine.launchd.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/scoring_engine.launchd.log</string>
</dict>
</plist>
```

Install:
```bash
cp scripts/com.steveonan.btc-scoring-engine.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.steveonan.btc-scoring-engine.plist
```

Note: scoring runs every **60 minutes** (3600 seconds) — not every 5 minutes like the dashboard push. Scoring is deliberate, not continuous.

---

## Task 5b — LaunchAgent for Telegram bot daemon

Create **`scripts/com.steveonan.btc-telegram-bot.plist`** (copy the scoring plist pattern):

- **Label:** `com.steveonan.btc-telegram-bot`
- **ProgramArguments:** `/usr/local/bin/node` or `/opt/homebrew/bin/node` (use `which node` on the Mac mini), then absolute path to `scripts/telegram_bot.mjs`, then `--daemon`
- **`RunAtLoad`:** `true`
- **`KeepAlive`:** `true` (recommended so the bot restarts if it crashes)
- **Logs:** e.g. `/tmp/telegram_bot.launchd.log`

Install:

```bash
cp scripts/com.steveonan.btc-telegram-bot.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.steveonan.btc-telegram-bot.plist
```

Unload when testing: `launchctl unload ~/Library/LaunchAgents/com.steveonan.btc-telegram-bot.plist`

---

## Task 6 — Loss state tracking in KV

Create KV key `scoring:trade_state`:
```json
{
  "consecutive_losses": 0,
  "pause_until": null,
  "bankroll_current": 1000,
  "bankroll_starting": 1000,
  "total_trades": 0,
  "total_wins": 0,
  "sats_accumulated": 0,
  "last_updated": "ISO"
}
```

Scoring engine reads this on every run:
- If `pause_until` is set and current time < `pause_until` → skip scoring, log "48hr pause active"
- If `bankroll_current` <= 75% of `bankroll_starting` → skip scoring, log "25% drawdown — full stop"
- Write updated state after every approved/denied proposal outcome (when Steve responds via Telegram)

---

## Task 7 — Test run

Run scoring engine manually once:
```bash
node scripts/scoring_engine.mjs
```

Expected output:
- Factor scores printed to console
- Total score and grade
- EV calculated
- If score ≥ 50 and EV > 0: Telegram card sent (or logged if bot not configured)
- KV `dashboard:state.scoring` updated

Check dashboard at https://btc-trading-dashboard.pages.dev — conviction panel should show last score, grade, EV.

---

## Task 8 — Update session notes

Write `session_notes_tv_session5.md` covering:
- Scoring engine implementation details
- Any factor logic deviations from strategy doc (explain why)
- Telegram bot status (configured / not configured)
- LaunchAgent install status
- First test run results
- Session 6 focus: trade journal, graduation tracker, weekly digest

---

## Hard Rules from Strategy Doc — Enforce in Code

These are non-negotiable. Hardcode as constants, never as configurable parameters:

```javascript
const RULES = {
  MIN_SCORE_TO_PROPOSE: 50,
  MIN_RR_RATIO: 2.0,          // below this → Factor 3 = 0, no trade
  MAX_LEVERAGE_PAPER: 3,       // paper trading cap
  MAX_LEVERAGE_LIVE: 5,        // absolute ceiling
  FUNDING_RATE_LONG_BLOCK: 0.0005,  // 0.05%/hr — block long entries
  MAX_POSITION_SIZE: 0.75,     // 75% ceiling
  MAX_CONCURRENT_POSITIONS: 3,
  CONSECUTIVE_LOSS_PAUSE_HOURS: 48,
  DRAWDOWN_FULL_STOP_PCT: 0.25,
  PROPOSAL_DEDUP_HOURS: 4,
};
```

---

## What NOT to touch
- `dashboard/index.html` — UI is complete
- `functions/_data.js` — Worker is working
- `scripts/dashboard_push.mjs` — only add scoring output write, don't break existing data flow
- Any Punchlist files or workflows

---

## Telegram Setup (if not done)
1. Message @BotFather on Telegram → `/newbot` → get token
2. Add token to `~/.zshrc`: `export TELEGRAM_BOT_TOKEN="..."`
3. Get your chat ID: message the bot, then fetch `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Add to `~/.zshrc`: `export TELEGRAM_CHAT_ID="..."`
5. Source: `source ~/.zshrc`

If this isn't set up yet, scoring engine should run and log everything but skip Telegram. Flag it in session notes.

---

_TradingView MCP Project — Session 5 of N_
