# CLAUDE.md — TradingView MCP Project
_v1.1 — April 5, 2026_
_Drop this file in the project root. Claude Code reads it automatically on session start._

---

## The Core Rule

**Steve's request IS the approval.**

When Steve asks for a task — even casually — that constitutes approval to execute everything reasonably required to complete it. Execute fully, report when done, do not re-ask on sub-steps.

The only exception: a Hard Stop (see below) that Steve didn't explicitly reference. Flag it, wait for YES. Everything else proceeds.

---

## Hard Stops — Always Ask First

Stop and get explicit approval before doing any of these:

1. **Any outbound message to a real person** (SMS, email, DM)
2. **Financial transactions of any kind**
3. **Deleting production data that cannot be recovered**
4. **Credential rotation** — API keys, tokens, passwords
5. **Creating accounts on external platforms**
6. **Accepting terms of service or legal agreements**

Everything else: just do it.

---

## Two Tiers

### Tier 1 — Just Do It
_No notification needed. Execute as part of any task._

- Read/query any API or data source (read-only)
- Debug and diagnose failures — inspect logs, check outputs
- Write and test code locally
- Create, update, and version documentation and session notes
- Deploy and configure local services (MCP server, scripts, config files)
- Install packages and dependencies required for an approved task
- Run diagnostic commands, log analysis, health checks
- Create and edit files in the project directory
- Update environment variables or config files (non-credential)

### Tier 2 — Do It, Then Tell Steve
_Execute without waiting. Report in the session summary. Steve can reverse if needed._

- Activate or deactivate services
- Fix broken integrations using known-good reference patterns
- Restart services (MCP server, Chrome DevTools bridge, Python scripts)
- Modify existing configs beyond simple parameter changes
- Make API calls that write or modify data when part of an approved task

---

## Standing Rules

1. **If a fix fails twice — STOP.** Take a higher-level view. Use first principles to identify the actual root cause before trying anything else. Don't iterate blindly.
2. **Always save.** After every edit. Unsaved work is lost work.
3. **Test before going live.** Use test data / sandbox mode before touching anything real.
4. **Clone before modifying.** If a working config or script exists, copy it and change only what's different.
5. **Never guess credentials.** If an API key or token isn't in the project ref doc, stop and ask.
6. **Versioning.** Never overwrite docs. Always increment (v1.0 → v1.1, etc.).

---

## Project Context

**Goal:** TradingView MCP integration on Mac mini — enables Claude Code to read live chart data, indicators, price levels, and Fibonacci structures directly from TradingView Desktop without screenshot workflow.

**Stack:**
- Mac mini (primary build machine)
- TradingView Desktop (Premium) — launched with `--remote-debugging-port=9222`
- MCP server: `tradingview-mcp` (tradesdontlie/tradingview-mcp on GitHub)
- Connection method: Chrome DevTools Protocol (CDP)
- Claude Code: reads live chart state via MCP
- Exchange: Kraken

**Primary use cases:**
- BTC chart analysis — Fibonacci levels, key support/resistance, indicator readings
- Multi-asset monitoring (BTC primary, alts secondary)
- Targeted buy/sell level identification
- Pine Script development assistance

**Quick Ref — update as project builds out:**

| Item | Value |
|---|---|
| MCP repo | tradesdontlie/tradingview-mcp |
| Project directory | /Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp |
| TradingView debug port | 9222 |
| MCP config location | ~/.claude/.mcp.json |
| MCP entry point | src/server.js |
| TradingView Desktop | v2.14.0 (Electron 38.2.2) |
| TradingView launch | /Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222 |
| Node.js | v25.9.0 |
| Primary asset | BTC/USD (KRAKEN:BTCUSD) |
| CDP status | Validated 2026-04-03 |
| Kraken CLI | 0.3.0 (`~/.cargo/bin/kraken`) |
| Kraken MCP | `kraken mcp` in `~/.claude/.mcp.json` |
| Cloudflare account ID | `3c26eee30bc4f90d841016e831a3b29f` (not `68a2c4bd…`) |
| KV namespace ID (prod) | `46cdb112832f47848a91a8f1109a0ebe` |
| Dashboard URL | https://btc-trading-dashboard.pages.dev |
| Dashboard push | `scripts/dashboard_push.mjs` (`npm run dashboard:push`) |
| Cloudflare Pages project | `btc-trading-dashboard` |
| Wrangler config | `wrangler.toml` (binding `TRADING_DASHBOARD`) |
| Session 3 notes | `session_notes_tv_session3.md` |
| Session 4 notes | `session_notes_tv_session4.md` |
| Schedule (Mac) | LaunchAgent `com.steveonan.btc-dashboard-push` |
| Git | This directory is the repo root — not `~/` or `Crypto Trading/` parent |
| GitHub `origin` | `ops-punchlist/tradingview-mcp` → `https://github.com/ops-punchlist/tradingview-mcp.git` |

---

## GitHub remotes

- **`upstream`** → `https://github.com/tradesdontlie/tradingview-mcp` (original MCP; pull fixes with `git fetch upstream` when needed).
- **`origin`** → **`https://github.com/ops-punchlist/tradingview-mcp.git`** (Steve’s repo). To point a clone elsewhere, use:
  ```bash
  chmod +x scripts/set_github_origin.sh
  ./scripts/set_github_origin.sh "https://github.com/YOUR_USER/YOUR_REPO.git"
  ```
- **Push:** `git push origin main` (tracking is `origin/main`).

If you see **“account suspended”** or **403** while the account is fine, macOS was usually still using **old GitHub credentials**. Clear cached entries for `github.com` in the Keychain helper if needed.

**PAT path:** **`scripts/push_via_pat.sh`** — sets a clean `origin` URL, pushes once via a token URL **without** `git push -u` (so the token is **not** saved in `.git/config`), then `git branch --set-upstream-to=origin/main main`. When creating a PAT, pick an **expiration** you’re comfortable with (e.g. 30 days). Always **`unset GITHUB_PAT`** after.

Example:

```bash
export GITHUB_USER=your_new_username
export GITHUB_PAT=ghp_your_one_time_token
"/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp/scripts/push_via_pat.sh"
unset GITHUB_PAT
```

Then future pushes can use **`git push`** after you sign in via normal GitHub auth, or keep using a PAT via the same pattern.

---

## Escalation Format

### Hard Stop — Requesting Approval
```
APPROVAL NEEDED

Action: [what Code wants to do]
Why: [one sentence]
Impact: [what changes, what could break]
Reversible: [yes/no]

Approve? YES / NO
```

### Tier 2 — Reporting Completed Work
```
COMPLETED

Action: [what Code did]
Result: [success / partial / needs follow-up]
Reverse if needed: [how Steve can undo it]
```

---

## Session Wrap

At the end of every session, update the Quick Ref table above with:
- Any new config values, file paths, or service URLs
- Blockers found or resolved
- What's next

_v1.1 — April 5, 2026_
