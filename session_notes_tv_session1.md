# Session Notes — TradingView MCP Session 1
_Setup & Connection Validation — April 3, 2026_

---

## Environment

| Item | Value |
|---|---|
| Machine | Mac mini (Apple Silicon) |
| OS | macOS (Darwin 25.4.0) |
| Node.js | v25.9.0 (installed via Homebrew) |
| npm | 11.12.1 |
| git | 2.50.1 |
| TradingView Desktop | v2.14.0 (Electron 38.2.2, Chrome 140) |

---

## Repo & Paths

| Item | Value |
|---|---|
| Project directory | /Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp |
| MCP config | ~/.claude/.mcp.json |
| Entry point | src/server.js |
| CLI | src/cli/index.js (aliased as `tv`) |
| Screenshots dir | screenshots/ |

---

## How to Launch

**TradingView with debug port:**
```bash
/Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222
```
Or use the included script:
```bash
./scripts/launch_tv_debug_mac.sh
```

**MCP server (for Claude Code — runs via stdio):**
Configured in `~/.claude/.mcp.json`:
```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp/src/server.js"]
    }
  }
}
```

**CLI (standalone testing):**
```bash
cd /Users/steveonan/Documents/Crypto\ Trading/TradingViewMCP/tradingview-mcp
node src/cli/index.js <command>
```

---

## Validation Test Results

### Test 1: Current Price — PASS
- Command: `tv quote`
- Result: Real-time OHLCV data returned
- Tested on: COINBASE:SUIUSD (0.8701) and KRAKEN:BTCUSD (66,797.90)
- Format: JSON with symbol, time, open, high, low, close, last, volume, description, exchange, type

### Test 2: Indicator Values — PASS
- Command: `tv values`
- Result: Reads all visible indicator values from the data window
- Initial chart had Volume indicator: returned `"Volume": "1.62 K"`
- Format: JSON with study_count and array of studies, each with name and key-value pairs

### Test 3: Key Levels (Pine Lines) — PASS (no data)
- Command: `tv data lines`
- Result: Tool works correctly, returned empty array (study_count: 0)
- No custom Pine indicators with line.new() were on the chart
- This will populate once Pine scripts with drawn levels are active

### Test 4: Screenshot — PASS
- Command: `tv screenshot`
- Result: PNG saved to screenshots/ directory
- File: tv_undefined_2026-04-03T19-13-50-901Z.png (324 KB)
- Method: CDP-based capture

### Additional: Symbol Switch — PASS
- Command: `tv symbol KRAKEN:BTCUSD`
- Successfully switched chart from COINBASE:SUIUSD to KRAKEN:BTCUSD

---

## What Data Is Readable

| Data Type | Tool | Status | Notes |
|---|---|---|---|
| Real-time price (OHLCV) | quote | Working | Sub-second response |
| Indicator values | values | Working | Reads data window values |
| Pine drawn lines | data lines | Working | Needs Pine scripts with line.new() |
| Pine labels | data labels | Available | Needs Pine scripts with label.new() |
| Pine tables | data tables | Available | Needs Pine scripts with table.new() |
| Pine boxes | data boxes | Available | Needs Pine scripts with box.new() |
| OHLCV bars | ohlcv | Available | Up to 500 bars, supports summary mode |
| Chart state | state | Available | Symbol, TF, chart type, all studies |
| Screenshots | screenshot | Working | PNG via CDP, ~300KB |

---

## Errors & Resolutions

1. **Node.js not installed** — Resolved by `brew install node` (v25.9.0)
2. **TradingView not found initially** — App wasn't installed yet. User installed it from App Store.
3. **CDP port not responding on first launch** — TradingView was already running without the debug flag. Killed all processes, relaunched with `--remote-debugging-port=9222`. Resolved.

---

## Blockers

None. All 4 validation tests passed.

---

## Next Session

**Session 2: Dashboard Scoping & Architecture**
- Decide which data auto-populates from TradingView vs. exchange APIs (Kraken)
- Scope the dashboard layout and components
- Define which Pine Script indicators to build/integrate for automated level detection
- Consider multi-timeframe analysis workflow
- Test Pine Script development cycle (inject → compile → read output)

---

_Session 1 complete — April 3, 2026_
