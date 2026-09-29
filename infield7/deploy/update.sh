#!/usr/bin/env bash
# Pull the latest code and restart. Run from inside the repo: bash infield7/deploy/update.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git pull --ff-only
(cd backend && npm ci)
(cd frontend && npm ci && npm run build)
sudo systemctl restart infield7-api infield7-web
echo "Updated. API log: journalctl -u infield7-api -f"
