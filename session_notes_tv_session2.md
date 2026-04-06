# Session Notes — TradingView MCP Session 2
_April 6, 2026_

**Superseded for Cloudflare:** live account ID, KV IDs, deploy commands, and the current push script are documented in **`session_notes_tv_session3.md`**. This file incorrectly used account `68a2c4bd…` in one example — **use `3c26eee30…`** (see Session 3).

## Objective (from work order)

Dashboard architecture, Kraken CLI MCP, Cloudflare KV + Pages dashboard, Mac mini push pipeline.

## Completed this session

### Kraken CLI + MCP

- Installed **kraken 0.3.0** to `~/.cargo/bin/kraken` (official installer).
- Updated **`~/.claude/.mcp.json`**: `tradingview` (unchanged) + `kraken` with absolute binary path so MCP works even when `~/.cargo/bin` is not on the GUI app PATH.

### Kraken JSON field paths (validated without spot API keys where noted)

| Need | Command | Path |
|------|---------|------|
| Spot last / 24h change | `kraken ticker XBTUSD -o json` | `XXBTZUSD.c[0]` last trade price; `XXBTZUSD.o` open; `h`,`l` highs/lows |
| Perp funding | `kraken futures ticker PF_XBTUSD -o json` | `ticker.fundingRate`, `ticker.fundingRatePrediction`; `ticker.last`, `markPrice` |
| Spot balances | `kraken balance -o json` | Requires `KRAKEN_API_KEY` / `KRAKEN_API_SECRET` (or `kraken auth set`) |
| Paper balance / orders | `kraken futures paper balance -o json`, `kraken futures paper orders -o json` | Requires futures API auth as per CLI docs |

**Correction vs work order:** subcommand is `futures paper orders`, not `open-orders`.

### TradingView multi-timeframe (tv CLI)

Commands used by the push script (same as work order intent):

```bash
cd "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp"
npm run tv -- timeframe 60
npm run tv -- quote
npm run tv -- values
npm run tv -- data lines
# then 240 for 4H
```

- **Timing:** after `tv timeframe <minutes>`, wait for the chart to settle before reads. (Session 2 used a combined push script with **`TV_SWITCH_DELAY_MS`** default **1200** ms; that flow was replaced by **`dashboard_push.mjs`** in Session 3 — re-integrate tv CLI when wiring Session 4.)
- **Validation run:** with TradingView on CDP, both `chart_1h` and `chart_4h` blocks populated with OHLCV summary, studies, and Pine lines structure as expected.

### Cloudflare

- Added **`wrangler.toml`** with KV binding name **`TRADING_DASHBOARD`** (placeholder namespace IDs until created).
- Added **`functions/_data.js`** — `GET /_data` returns KV key `dashboard:state` with CORS `*`.
- **`dashboard/index.html`** — dark theme, orange accent, 30s poll of `/_data`, panels per work order layout (scoring placeholders until Session 3).

**Not run in this session (blocked on credentials in shell):**

- `npx wrangler kv namespace create "TRADING_DASHBOARD"` (+ preview)
- `wrangler pages deploy` — needs `CLOUDFLARE_API_TOKEN` with KV + Pages permissions

**Session 3 completed:** namespaces, `wrangler.toml` IDs, Pages deploy, and KV push. Example env (see Session 3 notes for full detail):

```bash
export CLOUDFLARE_API_TOKEN="…"
export CLOUDFLARE_ACCOUNT_ID="3c26eee30bc4f90d841016e831a3b29f"
export CF_KV_NAMESPACE_ID="46cdb112832f47848a91a8f1109a0ebe"
npm run dashboard:push
# pages: see session_notes_tv_session3.md
```

### Push script (historical)

- Session 2 **`scripts/dashboard_push.js`** (tv + Kraken + macro + optional KV) was **removed** after Session 3 introduced **`scripts/dashboard_push.mjs`** (CoinGecko + F&G → KV). Session 4 work order should merge tv/Kraken back into **`dashboard_push.mjs`**.

### npm scripts (current)

- `npm run dashboard:push` → `node scripts/dashboard_push.mjs`
- `npm run pages:deploy` → `wrangler pages deploy dashboard --project-name=btc-trading-dashboard` (set `CLOUDFLARE_ACCOUNT_ID` in env; Wrangler 4.x has no `--account-id` flag)

## Blockers / follow-ups (as of Session 2)

1. **Cloudflare:** resolved in Session 3 — see **`session_notes_tv_session3.md`**.
2. **Kraken account endpoints:** export `KRAKEN_API_KEY` / `KRAKEN_API_SECRET` (and restart Cursor) for `balance`, `futures paper balance`, `futures paper orders`, `futures paper positions`.
3. **Macro Phase 1:** bond yield and oil left `null` / manual per work order; notes surfaced in payload and UI.
4. **Session 4+:** wire TradingView + Kraken into `dashboard_push.mjs`, scoring engine, cron — per Session 4 work order.

## Session complete checklist

- [x] Kraken CLI installed and version confirmed
- [x] Both MCP servers in `~/.claude/.mcp.json`
- [~] Kraken paper + spot balance validation — **ticker + perp OK without keys; balance/paper need API keys**
- [x] Multi-timeframe tv sequence implemented + timing documented
- [x] KV + Pages — **completed Session 3** (see `session_notes_tv_session3.md`)
- [x] Combined push script prototyped in Session 2; **superseded by `dashboard_push.mjs`**
- [x] Pages deploy + live URL — **Session 3**
- [~] Full E2E with tv + Kraken in push — **Session 4**
- [x] CLAUDE.md / PROJECT_CLAUDE.md Quick Ref updated
- [x] This file

---

_TradingView MCP — Session 2 notes_
