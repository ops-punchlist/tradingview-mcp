#!/usr/bin/env bash
# One-time push to YOUR new GitHub using a Personal Access Token (PAT).
# GitHub does not allow anyone else to log in as you — you create the token once, paste it here, then never save it in the repo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
USER="${GITHUB_USER:-}"
REPO="${GITHUB_REPO:-tradingview-mcp}"

if [[ -z "${GITHUB_PAT:-}" ]]; then
  cat << 'EOF'
You need to do 3 quick things in the browser (new GitHub account), then run this script again.

1) Create an EMPTY repository (no README, no .gitignore):
   https://github.com/new
   Name it: tradingview-mcp   (or pick another name — if so, run:
   export GITHUB_REPO=other-name
   before this script)

2) Create a token (classic is fine):
   GitHub → Settings → Developer settings → Personal access tokens → Generate new (classic)
   Enable scope: repo
   Set Expiration → Custom → 30 days (or pick “30 days” if offered)
   Copy the token (starts with ghp_)

3) In Terminal, paste these TWO lines (replace with your values), then run this script:

   export GITHUB_USER=your_new_github_username
   export GITHUB_PAT=ghp_paste_the_token_here
   "/Users/steveonan/Documents/Crypto Trading/TradingViewMCP/tradingview-mcp/scripts/push_via_pat.sh"

After a successful push, run:  unset GITHUB_PAT
EOF
  exit 1
fi

if [[ -z "$USER" ]]; then
  echo "Set GITHUB_USER to your GitHub username, e.g. export GITHUB_USER=janedoe"
  exit 1
fi

URL="https://x-access-token:${GITHUB_PAT}@github.com/${USER}/${REPO}.git"
echo "Pushing main → ${USER}/${REPO} ..."
git push -u "$URL" main
git remote set-url origin "https://github.com/${USER}/${REPO}.git"
echo ""
echo "Done. origin now points to https://github.com/${USER}/${REPO}.git"
echo "Next: unset GITHUB_PAT"
