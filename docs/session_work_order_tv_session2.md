# Session Work Order — TradingView MCP

*Session 2 — Dashboard Architecture & Kraken CLI Integration*
*April 2026*

---

## Objective

Wire the Kraken CLI MCP into the existing TradingView MCP setup, validate both data sources together, scaffold the Cloudflare Pages dashboard that displays real-time trading state, and establish the data push pipeline from Mac mini to Cloudflare KV.

---

## Pre-approved for this session — execute without stopping to confirm:

- Install Kraken CLI and wire into ~/.claude/.mcp.json alongside TradingView MCP
- Read Kraken account data, positions, funding rates (read-only — no trades)
- Create and deploy static HTML/JS dashboard to Cloudflare Pages
- Create and configure Cloudflare KV namespace for dashboard data
- Write a local polling script that reads from both MCPs and pushes to KV
- Create or edit any config files, scripts, or docs in the project directory
- Update CLAUDE.md Quick Ref table with confirmed values
- Create session notes on completion

**Stop and ask only if:**

- Any step requires live trade execution on Kraken (real money)
- Credential rotation is needed
- A fix fails twice and root cause is unclear
- Something is structurally different from this spec requiring a judgment call
- A Hard Stop condition is triggered (see CLAUDE.md)

---

## Context

**Session 1 results (confirmed working):**

- TradingView MCP connected via CDP on port 9222
- `tv quote` → real-time OHLCV ✅
- `tv values` → indicator values ✅
- `tv data lines` → Pine levels (needs Pine scripts active) ✅
- `tv screenshot` → PNG capture ✅
- Symbol switch confirmed working ✅

**Key paths:**

- Project directory: `/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp`
- MCP config: `~/.claude/.mcp.json`
- TradingView entry point: `src/server.js`
- TradingView launch: `/Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222`

**Strategy reference:** `btc_perp_strategy_v1.docx` in project — all scoring constants, factor weights, and EV formula live there. Do not hardcode any strategy parameters that conflict with it.

**Cloudflare:** Same account used for Punchlist (aipunchlist.com). **Account ID:** `3c26eee30bc4f90d841016e831a3b29f` (Ops@aipunchlist.com). _(An older doc typo used `68a2c4bd…` — do not use.)_ Wrangler token: env var only — see `session_notes_tv_session3.md`.

---

## Task 1 — Install Kraken CLI and Wire MCP

Install the Kraken CLI from the official repo:

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/krakenfx/kraken-cli/releases/latest/download/kraken-cli-installer.sh | sh
```

Verify install:

```bash
kraken --version
```

Add Kraken MCP server to `~/.claude/.mcp.json` alongside the existing TradingView entry:

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp/src/server.js"]
    },
    "kraken": {
      "command": "kraken",
      "args": ["mcp"]
    }
  }
}
```

Set Kraken API credentials as environment variables. Steve will provide the API key and secret at session start — do not hardcode them. Use:

```bash
export KRAKEN_API_KEY="..."
export KRAKEN_API_SECRET="..."
```

**Report:** Kraken CLI version confirmed, MCP config updated, credentials set.

---

## Task 2 — Validate Kraken CLI Data Access

With credentials set, run validation tests against Kraken paper trading (futures demo) — not the live account:

```bash
kraken futures paper balance -o json
kraken futures paper orders -o json
```

Then validate live read-only spot data (no trades):

```bash
kraken balance -o json
kraken ticker XBTUSD -o json
```

Also check funding rates — needed for Factor 4 scoring:

```bash
kraken futures ticker PF_XBTUSD -o json
```

Document the exact JSON field paths for:

- Current BTC spot price
- Futures funding rate (current and next)
- Open positions (if any)
- Account balances

**Report:** All commands return valid JSON, field paths documented for use in scoring engine.

---

## Task 3 — Multi-Timeframe TradingView Validation

The dashboard requires 1H and 4H chart state side by side. Test the timeframe switching and data reading sequence that the agent will use:

```bash
# Switch to 1H and capture state
tv timeframe 60
tv quote
tv values
tv data lines

# Switch to 4H and capture state
tv timeframe 240
tv quote
tv values
tv data lines
```

Document:

- How long each switch takes
- Whether indicator values update correctly after timeframe switch
- Any data gaps or stale reads to watch for
- Recommended sequence and timing for the polling script

**Report:** Timeframe switching works, timing documented, any issues noted.

---

## Task 4 — Set Up Cloudflare KV Namespace

Create a KV namespace for the dashboard data store:

```bash
npx wrangler kv namespace create "TRADING_DASHBOARD"
```

Note the namespace ID returned. This will be used in the dashboard Worker.

Create a second namespace for preview/development:

```bash
npx wrangler kv namespace create "TRADING_DASHBOARD" --preview
```

Test a write and read to confirm access:

```bash
npx wrangler kv key put --namespace-id=<ID> "test" "hello"
npx wrangler kv key get --namespace-id=<ID> "test"
```

**Report:** KV namespace ID, preview namespace ID, read/write confirmed.

---

## Task 5 — Build the Mac Mini Data Push Script

Create `scripts/dashboard_push.mjs` in the project directory (Session 3 canonical). This script:

1. Reads TradingView MCP data (1H then 4H)
2. Reads Kraken CLI data (positions, funding rate, balances)
3. Fetches macro signals (F&G index, BTC 200-day SMA status)
4. Assembles a single JSON payload
5. Writes it to Cloudflare KV

**Payload structure:**

```json
{
  "updated_at": "ISO timestamp",
  "btc": {
    "price": 0,
    "change_24h": 0,
    "vs_200sma": "above|below|within5pct"
  },
  "chart_1h": {
    "symbol": "KRAKEN:BTCUSD",
    "timeframe": "60",
    "ohlcv": {},
    "indicators": [],
    "levels": []
  },
  "chart_4h": {
    "symbol": "KRAKEN:BTCUSD",
    "timeframe": "240",
    "ohlcv": {},
    "indicators": [],
    "levels": []
  },
  "macro": {
    "fear_greed": 0,
    "fear_greed_label": "Extreme Fear",
    "bond_yield_10yr": 0,
    "oil_trend": "stable|rising|spiking",
    "thesis_status": "active|neutral|deteriorating"
  },
  "kraken": {
    "funding_rate_current": 0,
    "funding_rate_next": 0,
    "open_positions": [],
    "balances": {}
  },
  "scoring": {
    "last_score": null,
    "last_grade": null,
    "last_ev": null,
    "last_scored_at": null
  },
  "bankroll": {
    "starting": 0,
    "current": 0,
    "drawdown_pct": 0,
    "sats_accumulated": 0,
    "trade_count": 0,
    "win_count": 0
  }
}
```

For macro data:

- F&G: fetch from `https://api.alternative.me/fng/` (free, no key needed)
- Bond yield: fetch from a free financial API or hardcode manual update for now — flag if no clean free source
- Oil trend: same — flag if no clean free source, manual update acceptable for Phase 1

Write the payload to KV key `dashboard:state` on every run.

**Report:** Script created, test run successful, KV key confirmed written with valid JSON.

---

## Task 6 — Build Cloudflare Pages Dashboard

Create `dashboard/index.html` — a single-file dashboard that reads from KV via a Cloudflare Worker and renders the trading state.

**Layout (top to bottom):**

**1. Top summary bar (always visible)**

- BTC price + 24h change
- Fear & Greed index + label
- Bankroll remaining + drawdown %
- Sats accumulated
- Open positions count

**2. Chart panels (side by side, 50/50)**

- Left: 1H chart state — symbol, price, OHLCV, active indicators, key levels
- Right: 4H chart state — same structure

**3. Conviction scoring panel (left) + Macro signals panel (right)**

- Scoring: last score, grade, EV, full 5-factor breakdown with points
- Macro: F&G, BTC vs 200 SMA, bond yield, oil trend, thesis status — each with colored status indicator (green/yellow/red)

**4. Positions & history panel (full width)**

- Open positions table: asset, direction, entry, current price, P&L %, stop, target
- Trade history table: date, asset, direction, grade, EV projected vs actual, P&L, sats acquired

**Styling:**

- Dark background (#0D1117)
- Orange accent (#E8721C) — matches strategy doc branding
- Clean monospace font for numbers
- Status indicators: green (#2ECC71) / yellow (#F39C12) / red (#E74C3C)
- Auto-refresh via `setInterval` polling the Worker every 30 seconds

**Worker:** Create a simple Cloudflare Worker at `dashboard/worker.js` that reads `dashboard:state` from KV and returns it as JSON with CORS headers. Wire it to a `/_data` route.

**Deploy:**

```bash
cd /tmp/dashboard_deploy
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=3c26eee30bc4f90d841016e831a3b29f npx wrangler pages deploy dashboard --project-name=btc-trading-dashboard
```

Use a new Cloudflare Pages project — do not deploy to the aipunchlist project.

**Report:** Dashboard URL live, data loading from KV, all panels rendering.

---

## Task 7 — Test Full Pipeline End to End

With everything wired:

1. Ensure TradingView Desktop is running with debug port
2. Run `node scripts/dashboard_push.mjs` manually (or `npm run dashboard:push`)
3. Confirm KV is updated
4. Open dashboard URL
5. Confirm all panels show real data — not placeholder text

Document any panels that show stale or missing data and why.

**Report:** Full pipeline confirmed working or specific blockers identified.

---

## Task 8 — Update Docs

**CLAUDE.md Quick Ref table — add:**


| Item                     | Value                     |
| ------------------------ | ------------------------- |
| Kraken CLI version       | [confirmed]               |
| KV namespace ID          | [confirmed]               |
| KV preview namespace ID  | [confirmed]               |
| Dashboard URL            | [confirmed]               |
| Dashboard push script    | scripts/dashboard_push.mjs |
| Cloudflare Pages project | btc-trading-dashboard     |


**Session notes → `session_notes_tv_session2.md`**

Capture:

- Kraken CLI install path and version
- MCP config final state (both servers)
- Kraken API field paths for price, funding rate, positions
- Timeframe switching timing and any quirks
- KV namespace IDs
- Dashboard URL
- Pipeline test results — what worked, what didn't
- Blockers (if any)
- Next session: conviction scoring engine build

---

## Session Complete When:

- Kraken CLI installed and version confirmed
- Both MCP servers (TradingView + Kraken) wired in ~/.claude/.mcp.json
- Kraken paper trading and live read-only data validated
- Multi-timeframe TradingView switching tested and timing documented
- Cloudflare KV namespace created and read/write confirmed
- dashboard_push.mjs script created and test run successful
- Dashboard deployed to Cloudflare Pages and loading real data
- Full pipeline confirmed end to end
- CLAUDE.md Quick Ref updated
- Session notes saved as session_notes_tv_session2.md

---

## What This Unlocks

Session 2 complete means: the Mac mini is collecting live data from both TradingView and Kraken, pushing it to Cloudflare, and displaying it in a real-time dashboard. Session 3 builds the conviction scoring engine on top of this foundation — the agent reads the live data, runs the 5-factor scoring framework, calculates EV, and fires Telegram proposals.

---

*TradingView MCP Project — Session 2 of N*
