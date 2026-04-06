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
`btc_perp_strategy_v1.docx` — full narrative, diagrams, and Telegram card prose. **For code, use the canonical constants below** (pulled from the strategy doc). If anything conflicts, **these tables win for Session 5 implementation** — note any doc delta in `session_notes_tv_session5.md`.

### Canonical strategy constants (Session 5 — enforce in code)

**Hard rules (gates + risk)**
| Rule | Value |
|------|--------|
| Min score to propose | **50** / 100 |
| Min signals (confluence) | **3** distinct signals for a tradeable setup |
| Min timeframe | **1H setup confirmed by 4H** — do not propose if 1H and 4H trend alignment conflict (see Factor 1 + gate below) |
| Min R:R | **2:1** — below → Factor 3 = **0**, **no trade** |
| Funding gate (longs) | **> 0.05%/hr** → **0** pts on Factor 4 **and block long entries** |
| Stop loss (max distance) | **15%** from entry — if structural stop would exceed 15%, **no trade** (or cap stop to 15% only if strategy doc allows; default **veto** if stop > 15%) |
| Tier 1 take-profit | **30–35%** gain target band; **close 50%** at T1 (document on proposal card; paper only) |
| Max leverage (ceiling) | **5x** (strategy); paper session may apply a lower effective cap (see grade table note) |
| Max position size | **75%** of bankroll (ceiling by grade) |
| Max concurrent positions | **3** |
| Consecutive loss pause | **2** consecutive losses → **48h** mandatory pause (no new proposals until `pause_until`) |
| Bankroll death | **25%** drawdown from starting bankroll → **full stop** (no proposals) |

**Factor weights**

| Factor | Points |
|--------|--------|
| Trend alignment (1H / 4H / Daily) | 25 |
| Technical signal confluence | 25 |
| Risk/reward quality | 20 |
| Funding rate environment | 15 |
| Macro context + thesis overlay | 15 |
| **Total** | **100** |

**Grade → parameters (strategy)**

| Score | Grade | Win prob | Max leverage | Max size |
|-------|-------|----------|--------------|----------|
| 80–100 | A | 65% | 5x | 75% |
| 65–79 | B | 55% | 3x | 50% |
| 50–64 | C | 45% | 2x | 25% |
| <50 | — | No trade | — | — |

**Paper trading (Session 5):** Objective is paper only. Use the grade table’s **win prob** and **max size** as-is; for **leverage**, use `effective_leverage = min(grade_max_leverage, MAX_LEVERAGE_PAPER)` where `MAX_LEVERAGE_PAPER` is in `RULES` (e.g. 3) so you never exceed the paper cap while preserving relative A > B > C.

**EV (required for proposal)**  
`EV = (Win% × Target%) − (Loss% × Stop%)` with `Loss% = 1 − Win%`. **EV must be > 0** or **no proposal**, regardless of score.

**Factor 4 — funding rate scoring**

| Rate (/hr) | Points | Notes |
|------------|--------|--------|
| < 0.02% | 15 | |
| 0.02% – 0.04% | 8 | |
| 0.04% – 0.05% | 3 | |
| > 0.05% | 0 | **Block longs** |

**Factor 5 — macro base + thesis**  
- 3–4 bullish macro signals → **10** base pts  
- 2 bullish / 2 neutral → **7** pts  
- Mixed / neutral → **4** pts  
- 3–4 bearish → **1** pt  
- Thesis overlay → **±3** pts (per existing direction rules)  
- **Hard downgrade:** 3–4 bearish **and** thesis negative for trade direction → drop **one** grade (A→B, B→C, C→no trade)

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

Implement all 5 factors and **global gates** using **Canonical strategy constants** above. The engine reads the current KV state and produces a score object.

### Global gates (evaluate before proposing)
1. **Min timeframe — 1H confirmed on 4H:** If the proposed direction is **long**, require 4H not bearish (and ideally bullish/mixed per Factor 1); if **short**, require 4H not bullish. If 1H and 4H directions **contradict**, set `generate_proposal: false` and record `hard_stops_triggered` e.g. `["1h_not_confirmed_by_4h"]`. If 4H data missing, be conservative (no trade or require explicit approval in session notes).
2. **Min signals:** Count **distinct** signals from the Factor 2 list (RSI, MACD, fib, volume, MA cross). Need **≥ 3** for any proposal. Below 3 → Factor 2 = **0** and **`generate_proposal: false`** even if the raw 100-point sum ≥ 50.
3. **Stop max 15%:** If the structural stop implies **> 15%** loss from entry, **no trade** (add to `hard_stops_triggered`).
4. **`scoring:trade_state`:** Honor **2-loss / 48h pause** and **25% drawdown** (Task 6) before scoring or sending.

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
**Minimum 3 signals** required by strategy; banding:
```
4+ signals present → 25 pts
3 strong signals → 18 pts
3 signals but weak → 10 pts
Below 3 signals → 0 pts — also triggers global “no trade” gate
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
- **Tier 1 (strategy):** For proposal copy and EV, use a **primary target** in the **30–35% gain** band when structural levels allow; otherwise use level-derived target and document. **At T1, plan to close 50%** (paper); state this on the Telegram card.
- After stop/target are chosen, verify **stop distance ≤ 15%** (global gate).

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
Use the **Grade → parameters (strategy)** table exactly for `win_prob`, `max_leverage` (grade), and `max_size`. Apply **paper** effective leverage: `min(grade_max_leverage, RULES.MAX_LEVERAGE_PAPER)`.
```
80-100 → Grade A: win_prob=65%, max_leverage=5x (strategy) → cap by MAX_LEVERAGE_PAPER, max_size=75%
65-79  → Grade B: win_prob=55%, max_leverage=3x, max_size=50%
50-64  → Grade C: win_prob=45%, max_leverage=2x, max_size=25%
<50    → No trade
```

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
  "tier1_target_pct_band": [30, 35],
  "tier1_close_pct": 50,
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
Tier 1 plan: 30–35% gain band — close 50% at T1 (paper)
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
- **2 consecutive losses** (strategy) → set `pause_until` to **now + 48h**; increment only on **approved** paper outcomes you define in session notes (e.g. manual journal sync later; Session 5 may stub loss counting until journal exists)
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

These are non-negotiable. Hardcode as constants, never as configurable parameters (must match **Canonical strategy constants**):

```javascript
const RULES = {
  MIN_SCORE_TO_PROPOSE: 50,
  MIN_SIGNALS_REQUIRED: 3,     // confluence; below → no trade (gate)
  MIN_RR_RATIO: 2.0,            // below → Factor 3 = 0, no trade
  MAX_STOP_LOSS_PCT: 0.15,      // 15% max stop distance from entry
  TIER1_TARGET_GAIN_MIN_PCT: 30,
  TIER1_TARGET_GAIN_MAX_PCT: 35,
  TIER1_CLOSE_PCT: 0.5,         // close 50% at T1 (paper)
  MAX_LEVERAGE_PAPER: 3,        // effective cap min(grade, this) for Session 5
  MAX_LEVERAGE_LIVE_CEILING: 5, // strategy ceiling (live future)
  FUNDING_RATE_LONG_BLOCK_PCT_PER_HR: 0.05, // > this → 0 pts + block longs (match Kraken field units in code)
  MAX_POSITION_SIZE: 0.75,      // 75% grade ceiling
  MAX_CONCURRENT_POSITIONS: 3,
  CONSECUTIVE_LOSSES_FOR_PAUSE: 2,
  CONSECUTIVE_LOSS_PAUSE_HOURS: 48,
  DRAWDOWN_FULL_STOP_PCT: 0.25, // bankroll death — stop proposals
  PROPOSAL_DEDUP_HOURS: 4,
};
```

**Units:** Map `FUNDING_RATE_LONG_BLOCK_PCT_PER_HR` to however `kraken.funding_rate_current` is stored (percent per hour vs decimal); use one consistent representation in code and document it in session notes.

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
