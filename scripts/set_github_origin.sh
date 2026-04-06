#!/bin/bash
# Point this repo at YOUR new GitHub remote (empty repo, no README, same name ok).
# Usage: ./scripts/set_github_origin.sh https://github.com/YOUR_USER/YOUR_REPO.git
set -euo pipefail
if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 https://github.com/YOUR_USER/YOUR_REPO.git"
  echo "Create an empty repository on GitHub first (no README/license)."
  exit 1
fi
URL="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$URL"
else
  git remote add origin "$URL"
fi
echo "origin → $URL"
echo "Remotes:"
git remote -v
echo ""
echo "Next (after fixing GitHub login — see PROJECT_CLAUDE.md):"
echo "  git push -u origin main"
