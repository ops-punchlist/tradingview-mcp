# Session Notes — TradingView MCP Session 4
_TradingView + Kraken wiring in `dashboard_push.mjs` + scheduling — April 2026_

## What was implemented

### `scripts/dashboard_push.mjs`
- **TradingView:** runs `node src/cli/index.js` for `timeframe` → delay → `state`, `quote`, `values`, `ohlcv --summary`, `data lines` for **60** and **240** (1H / 4H). Delay: **`TV_SWITCH_DELAY_MS`** (default **1200**).
- **Kraken:** `futures ticker PF_XBTUSD`, `balance`, `futures positions` (all `-o json`). Populates `kraken.funding_rate_*`, `open_positions`, `balances`, plus raw `futures_ticker` / `futures_positions_raw`.
- **Macro / BTC headline:** unchanged — Alternative.me F&G + CoinGecko spot price for top bar.
- **KV:** PUT `dashboard:state` with URL-encoded key; requires `CLOUDFLARE_API_TOKEN` + `CF_KV_NAMESPACE_ID` (or `KV_NAMESPACE_ID`).
- **`SKIP_TV=1`:** skips CDP calls (useful when TradingView is off; chart blocks show `_skipped: true`).

### `scripts/run_push.sh`
- Sources `~/.zshrc` if present, `cd` to project, appends stdout/stderr to **`/tmp/dashboard_push.log`**.

### `scripts/com.steveonan.btc-dashboard-push.plist`
- **LaunchAgent** — runs `run_push.sh` every **300 seconds** and once at load. Preferred on macOS vs `crontab` when the system returns `Operation not permitted` on crontab install.
- **Installed:** `~/Library/LaunchAgents/com.steveonan.btc-dashboard-push.plist` (copy from repo if you reinstall the Mac).
- **Unload:** `launchctl unload ~/Library/LaunchAgents/com.steveonan.btc-dashboard-push.plist`

### `~/.zshrc` (Cloudflare)
- **`CLOUDFLARE_ACCOUNT_ID`** must be **`3c26eee30bc4f90d841016e831a3b29f`** (same account as KV namespace `46cdb112…`). The obsolete id **`68a2c4bd…`** caused KV auth error **10000**.
- Removed duplicate exports and the placeholder `your-new-token-here` line.

## Operator checklist (Mac mini)

1. **TradingView** — `--remote-debugging-port=9222` when you want live 1H/4H in KV.
2. **Kraken** — `KRAKEN_API_KEY` / `KRAKEN_API_SECRET` in `~/.zshrc` for `balance` and `futures positions`.
3. **Logs** — `tail -f /tmp/dashboard_push.log` or `/tmp/dashboard_push.launchd.log`.
4. **`crontab`** — optional; if you use it, grant **Full Disk Access** to Terminal. Otherwise rely on LaunchAgent above.

## Git (important)

- **Real repo root:** `…/TradingViewMCP/tradingview-mcp` (has `origin/main`). Run all `git` commands from there.
- **Remotes:** `upstream` → tradesdontlie/tradingview-mcp (upstream MCP). **`origin`** → **`https://github.com/ops-punchlist/tradingview-mcp.git`** (Steve’s fork; `main` tracks `origin/main`).
- **`scripts/push_via_pat.sh`:** pushes once using a token URL, then sets `main` to track **`origin/main`** only. It does **not** use `git push -u` with the token URL, so the PAT is **not** written into `.git/config` under `branch.main.remote`. After any PAT push, run **`unset GITHUB_PAT`** in the shell.
- **`.gitignore`:** local Word doc **`BTC Loan Strategy March2026 2.docx`** is ignored so it stays off GitHub and out of `git status`.
- **Do not** run `git init` in **`~`** or **`Documents`** — it made Cursor think your whole home folder was a repo. A mistaken `~/.git` was **renamed to** `~/.git-accidental-home-init-backup-*` (no commits were lost). To undo: move that folder back to `~/.git` (not recommended).

## Session 5 (next)

- Conviction scoring engine, EV, strategy doc alignment (`btc_perp_strategy_v1.docx`).

---

_Session 4 complete — push pipeline + LaunchAgent + docs. Follow-up: `origin` wired to ops-punchlist, PAT push script hardened, local loan doc ignored._
