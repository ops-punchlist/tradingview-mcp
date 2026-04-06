# Session Work Order — TradingView MCP
_Session 4 — TradingView + Kraken Data Wiring & Cron Setup_
_April 2026_

---

## Objective
Wire real data into the live dashboard. Replace null placeholders with actual TradingView 1H/4H chart data and Kraken balances. Set up Mac mini cron to auto-push every 5 minutes.

---

## Pre-approved for this session — execute without stopping to confirm:
- Read TradingView MCP data (tv quote, tv values, tv ohlcv) — read-only
- Read Kraken CLI data (balance, futures positions, futures ticker) — read-only, no trades
- Edit `scripts/dashboard_push.mjs`
- Create or edit any config files, scripts, or docs in the project directory
- Set up a cron job on Mac mini
- Update session notes on completion

**Stop and ask only if:**
- Any step requires live trade execution on Kraken (real money)
- TradingView MCP returns unexpected errors that aren't self-evident
- A fix fails twice and root cause is unclear
- Something is structurally different from this spec requiring a judgment call

---

## Context

### Dashboard is LIVE
- URL: https://btc-trading-dashboard.pages.dev
- Cloudflare Pages project: `btc-trading-dashboard`
- KV key: `dashboard:state`
- KV namespace ID: `46cdb112832f47848a91a8f1109a0ebe`

### Env vars on Mac mini (`~/.zshrc`):
```bash
CLOUDFLARE_API_TOKEN   # btc-trading-dashboard User API token
CLOUDFLARE_ACCOUNT_ID  # 3c26eee30bc4f90d841016e831a3b29f
CF_KV_NAMESPACE_ID     # 46cdb112832f47848a91a8f1109a0ebe
```

### Key paths:
- Project: `/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp`
- Push script: `scripts/dashboard_push.mjs` (**canonical** — Session 2 `dashboard_push.js` was removed from the repo)
- Worker: `functions/_data.js`
- Dashboard HTML: `dashboard/index.html`
- MCP config: `~/.claude/.mcp.json`

### Deploy command:
```bash
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=3c26eee30bc4f90d841016e831a3b29f npx wrangler pages deploy dashboard --project-name btc-trading-dashboard --commit-dirty=true
```

### Push command (manual test):
```bash
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CF_KV_NAMESPACE_ID=$CF_KV_NAMESPACE_ID node scripts/dashboard_push.mjs
```

---

## Task 1 — Wire TradingView into dashboard_push.mjs

TradingView Desktop must be running with debug port:
```bash
/Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222
```

Chart should be set to `KRAKEN:BTCUSD`.

From **`dashboard_push.mjs`**, drive the **tv CLI** (same codebase as MCP — no separate MCP process needed for cron):

```bash
node src/cli/index.js timeframe 60
node src/cli/index.js quote
node src/cli/index.js values
node src/cli/index.js ohlcv --summary
node src/cli/index.js data lines
# then repeat for 240 (4H)
```

Replace null `chart_1h` / `chart_4h` placeholders with parsed JSON from those commands. Allow a short delay after each `timeframe` change (e.g. `TV_SWITCH_DELAY_MS`, default ~1200ms) before reads.

**Report:** Both chart panels showing real OHLCV and indicator values on the dashboard.

---

## Task 2 — Wire Kraken CLI into dashboard_push.mjs

Kraken CLI (`kraken`) is installed and configured. Use **actual** subcommands (Kraken CLI v0.3.x):

```bash
kraken balance -o json
kraken futures positions -o json
kraken futures ticker PF_XBTUSD -o json
```

Populate the `kraken` block, e.g.:

```json
{
  "funding_rate_current": "<from futures ticker>",
  "funding_rate_next": "<from futures ticker if present>",
  "open_positions": "<from futures positions>",
  "balances": "<from balance>"
}
```

**Report:** Kraken balances and positions visible in the dashboard payload / UI.

---

## Task 3 — Set up Mac mini cron

Create a shell wrapper that sources `~/.zshrc` and runs the push script:

```bash
# /Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp/scripts/run_push.sh
#!/bin/bash
source ~/.zshrc
cd "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp"
node scripts/dashboard_push.mjs >> /tmp/dashboard_push.log 2>&1
```

Make it executable:
```bash
chmod +x scripts/run_push.sh
```

Add to crontab (every 5 minutes):
```bash
crontab -e
# Add: */5 * * * * "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp/scripts/run_push.sh"
```

Verify: wait 5 minutes, then `tail /tmp/dashboard_push.log`.

**Report:** Cron confirmed running, log shows successful push.

---

## Task 4 — Update session notes

Write **`tradingview-mcp/session_notes_tv_session4.md`** covering what was wired, errors, and next steps (Session 5: conviction scoring engine).

---

## Wrangler Notes (important)
- Wrangler 4.x — `--account-id` flag does NOT exist; use `CLOUDFLARE_ACCOUNT_ID` env var
- Auth errors: delete `~/.wrangler/config` and `~/.wrangler/state` to clear cached OAuth
- Always use `CLOUDFLARE_ACCOUNT_ID=3c26eee30bc4f90d841016e831a3b29f` — the old ID `68a2c4bd…` is wrong

---

## What NOT to touch
- `dashboard/index.html` — UI shell is complete unless payload shape changes require small binding tweaks
- `functions/_data.js` — Worker is working unless the KV key or CORS policy must change
- Any Punchlist files or workflows — separate project

---

_TradingView MCP Project — Session 4 of N_
