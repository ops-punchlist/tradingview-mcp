# Session Notes — TradingView MCP Session 3
_Cloudflare Credentials, KV Setup & Dashboard Deployment — April 6, 2026_

---

## What Was Accomplished

Session 3 completed the Cloudflare infrastructure setup and got the BTC Trading Dashboard live with real data. This session was run from Claude Chat (not Claude Code) using the Claude in Chrome MCP to assist with Cloudflare UI navigation.

---

## Credentials & Environment

### Cloudflare Account (IMPORTANT)
There are TWO account IDs in play — this caused significant confusion during the session:

| Item | Value |
|---|---|
| **Correct account ID** | `3c26eee30bc4f90d841016e831a3b29f` (Ops@aipunchlist.com's Account) |
| Old/wrong account ID | `68a2c4bd8e7d9b95aef0593510d9a46c` — appeared in early Session 2 docs, **do not use** |
| Account email | ops@aipunchlist.com |

The wrong ID was hardcoded in `wrangler.toml` and `~/.zshrc` from Session 2 documentation. It was corrected during this session. **Always use `CLOUDFLARE_ACCOUNT_ID=3c26eee30bc4f90d841016e831a3b29f`** (or rely on `dashboard_push.mjs` default fallback).

### Env Vars (stored in `~/.zshrc` on Mac mini)
```bash
export CLOUDFLARE_API_TOKEN="<btc-trading-dashboard token — do not log>"
export CLOUDFLARE_ACCOUNT_ID="3c26eee30bc4f90d841016e831a3b29f"
export CF_KV_NAMESPACE_ID="46cdb112832f47848a91a8f1109a0ebe"
```

### Cloudflare API Token
- **Name:** `btc-trading-dashboard`
- **Type:** User API Token (under profile, not account-level)
- **Permissions:** Account > Cloudflare Pages > Edit, Account > Workers KV Storage > Edit, User > User Details > Read
- **Resources:** Ops@aipunchlist.com's Account
- The `User > User Details > Read` permission is required — without it wrangler throws auth error [code: 10000]

### KV Namespace
- **Name:** `btc_dashboard` (production)
- **ID:** `46cdb112832f47848a91a8f1109a0ebe`
- **Preview ID:** same as production (preview namespace creation failed during session — not blocking)
- **Key used:** `dashboard:state`

---

## Files Created / Modified

### `functions/_data.js`
Cloudflare Pages Function. Reads `dashboard:state` from KV and serves it as JSON at `/_data`. Dashboard polls this endpoint every 30 seconds.

```
/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp/functions/_data.js
```

### `scripts/dashboard_push.mjs`
Runs on Mac mini. Fetches BTC price (CoinGecko), Fear & Greed (alternative.me), and writes a full state payload to Cloudflare KV. Uses ES module syntax (`.mjs`).

```
/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp/scripts/dashboard_push.mjs
```

**Note:** The Session 2 `scripts/dashboard_push.js` helper was removed from this repo. Use **`dashboard_push.mjs`** and **`npm run dashboard:push`** only.

### `wrangler.toml`
KV namespace IDs set to production values; binding `TRADING_DASHBOARD`.

```toml
[[kv_namespaces]]
binding = "TRADING_DASHBOARD"
id = "46cdb112832f47848a91a8f1109a0ebe"
preview_id = "46cdb112832f47848a91a8f1109a0ebe"
```

---

## Dashboard

**Live URL:** https://btc-trading-dashboard.pages.dev  
**Cloudflare Pages project:** `btc-trading-dashboard`  
**Build output dir:** `dashboard/` (contains `index.html`)

The dashboard auto-refreshes every 30 seconds by polling `/_data`.

### Panels (all present, some awaiting data wiring)
- Top bar: BTC price, 24H change, Fear & Greed, Bankroll, Drawdown, Sats, Open positions, Updated timestamp
- 1H chart panel (OHLCV null until TradingView MCP wired)
- 4H chart panel (OHLCV null until TradingView MCP wired)
- Conviction scoring (null until engine wired in Session 4+)
- Macro signals (F&G and thesis_status live; bond yield and oil manual)
- Positions & history (awaiting Kraken execution journal)

---

## How to Deploy

### Deploy dashboard to Cloudflare Pages
```bash
cd "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp"
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=3c26eee30bc4f90d841016e831a3b29f npx wrangler pages deploy dashboard --project-name btc-trading-dashboard --commit-dirty=true
```

### Push live data to KV (manually or cron)
```bash
cd "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp"
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN CF_KV_NAMESPACE_ID=$CF_KV_NAMESPACE_ID node scripts/dashboard_push.mjs
```

Or: `npm run dashboard:push` (requires the same env vars in the shell).

---

## Wrangler Notes

- Wrangler version: 4.80.0 (approx; check `npx wrangler --version`)
- `--account-id` flag does NOT exist in wrangler 4.x — remove it from any commands
- Always pass account ID via `CLOUDFLARE_ACCOUNT_ID` env var, not a flag
- Wrangler caches OAuth state in `~/.wrangler/` — if auth errors persist, delete `~/.wrangler/config` and `~/.wrangler/state`
- Wrangler will prompt to create the Pages project on first deploy if it doesn't exist — answer `Create a new project`, branch name `main`

---

## Errors Encountered & Resolutions

| Error | Cause | Fix |
|---|---|---|
| Auth error [code: 10000] on KV create | Wrong account ID in env | Use `3c26eee30bc4f90d841016e831a3b29f` |
| Auth error on Pages deploy | Old account ID cached in wrangler | Pass `CLOUDFLARE_ACCOUNT_ID` explicitly as env var prefix |
| Legacy `dashboard_push.js` | Session 2 script | Removed; use `dashboard_push.mjs` |
| Token missing User Details Read | Initial token creation missing permission | Edited token via Cloudflare UI to add User > User Details > Read |
| `--account-id` unknown argument | Flag removed in wrangler 4.x | Removed flag, use env var instead |
| Exposed token in chat | Token pasted into Claude chat | Token was rolled; new token created |

---

## Security Notes

- A token was accidentally pasted into Claude chat during this session — it was rolled immediately and a new one created.
- Any file named like `punchlist_credentials.txt` with live secrets should be removed or moved to a password manager; do not keep in repo or screen-share.
- **Never** paste API tokens into project markdown, `settings.local.json` allowlists, or chat — use `~/.zshrc` or a gitignored `.env` and reference variables by name in docs only.
- Older Punchlist / Wrangler docs (e.g. `punchlist_quick_ref.md`, AI Punchlist `.claude/settings.local.json`) may still contain or reference historical tokens. **Rotate** any token that was ever committed, allowlisted with a literal value, or exposed; replace with env-based workflow.

---

## Session 4 — What's Next

1. **Wire TradingView MCP into `dashboard_push.mjs`** — replace null OHLCV with real 1H and 4H chart data from TradingView Desktop
2. **Wire Kraken CLI** — real balances and open positions in the dashboard
3. **Set up Mac mini cron** — run `dashboard_push.mjs` every 5 minutes automatically
4. **Wire conviction scoring engine** — 5-factor scoring from `btc_perp_strategy_v1.docx`
5. **Portfolio tracker** — add multi-exchange BTC balance aggregation (Kraken, Coinbase, Gemini, Robinhood, iTrust) with goal tracker toward 5 BTC family target

---

_Session 3 complete — April 6, 2026_
