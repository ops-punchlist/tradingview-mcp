#!/usr/bin/env bash
# Launch TradingView Desktop with Chrome DevTools on port 9222 (tv CLI / MCP).
# Invokes the real binary inside the .app — `open -a … --args` often drops flags for Electron.
#
# Env:
#   TV_BIN              — override path to the TradingView executable
#   TRADINGVIEW_DEBUG_PORT — default 9222
#   TRADINGVIEW_LAUNCH_WAIT_SEC — max wait for CDP (default 120)
set -euo pipefail

PORT="${TRADINGVIEW_DEBUG_PORT:-9222}"
WAIT_SEC="${TRADINGVIEW_LAUNCH_WAIT_SEC:-120}"
STEP=0.5

resolve_tv_bin() {
  if [[ -n "${TV_BIN:-}" && -x "$TV_BIN" ]]; then
    echo "$TV_BIN"
    return 0
  fi
  local locs=(
    "/Applications/TradingView.app/Contents/MacOS/TradingView"
    "$HOME/Applications/TradingView.app/Contents/MacOS/TradingView"
  )
  local loc
  for loc in "${locs[@]}"; do
    if [[ -x "$loc" ]]; then
      echo "$loc"
      return 0
    fi
  done
  local bundle
  bundle=$(mdfind 'kMDItemCFBundleIdentifier == "com.tradingview.tradingviewapp.desktop"' 2>/dev/null | head -1)
  if [[ -n "$bundle" && -x "$bundle/Contents/MacOS/TradingView" ]]; then
    echo "$bundle/Contents/MacOS/TradingView"
    return 0
  fi
  bundle=$(find /Applications "$HOME/Applications" -maxdepth 3 -name 'TradingView.app' -print 2>/dev/null | head -1)
  if [[ -n "$bundle" && -x "$bundle/Contents/MacOS/TradingView" ]]; then
    echo "$bundle/Contents/MacOS/TradingView"
    return 0
  fi
  return 1
}

TV_BIN="$(resolve_tv_bin)" || {
  echo "error: TradingView executable not found." >&2
  echo "  Tried: /Applications, ~/Applications, mdfind, find." >&2
  echo "  Set TV_BIN to your MacOS binary, e.g." >&2
  echo '    export TV_BIN="/path/to/TradingView.app/Contents/MacOS/TradingView"' >&2
  exit 1
}

cdp_ready() {
  curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1
}

port_listening() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

if cdp_ready; then
  echo "CDP already responding on http://127.0.0.1:${PORT}/json/version"
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
  exit 0
fi

echo "TradingView binary: $TV_BIN"
echo "Quitting existing TradingView so a new process picks up --remote-debugging-port=$PORT …"
osascript -e 'tell application "TradingView" to quit' 2>/dev/null || true
sleep 1
pkill -x TradingView 2>/dev/null || true

for _ in $(seq 1 40); do
  pgrep -x TradingView >/dev/null 2>&1 || break
  sleep "$STEP"
done

echo "Starting: \"$TV_BIN\" --remote-debugging-port=$PORT"
"$TV_BIN" --remote-debugging-port="$PORT" >/dev/null 2>&1 &
TV_PID=$!
disown "$TV_PID" 2>/dev/null || true

deadline=$(($(date +%s) + WAIT_SEC))
while [[ $(date +%s) -lt $deadline ]]; do
  if cdp_ready; then
    echo "CDP ready (PID $TV_PID)."
    echo "lsof -i :$PORT (LISTEN):"
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
    curl -sf "http://127.0.0.1:${PORT}/json/version" | head -c 200 || true
    echo ""
    exit 0
  fi
  sleep "$STEP"
done

echo "error: timed out after ${WAIT_SEC}s; CDP not answering at http://127.0.0.1:${PORT}/json/version" >&2
if pgrep -x TradingView >/dev/null 2>&1; then
  echo "TradingView is running; open ports for this process:" >&2
  lsof -nP -p "$(pgrep -x TradingView | head -1)" -a -iTCP 2>/dev/null | head -20 >&2 || true
else
  echo "TradingView process not found — launch may have failed from this terminal (GUI / permissions)." >&2
fi
exit 1
