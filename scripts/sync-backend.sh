#!/usr/bin/env bash
# Refresh the shipped backend copy (./backend) from the development
# backend before a release. Never copies secrets (.env), git history, caches,
# or logs. Usage: scripts/sync-backend.sh [/path/to/dev/backend]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-}"
[ -n "$SRC" ] && [ -f "$SRC/docker-compose.yml" ] || { echo "Usage: $0 /path/to/backend (a separate dev checkout)"; exit 1; }
[ "$(readlink -f "$SRC")" != "$(readlink -f "$ROOT/backend")" ] || { echo "Source is the shipped copy itself."; exit 1; }
# The shipped gateway trusts the web server's X-Real-IP (deploy/); keep that change.
GW_KEEP="$(mktemp)"; cp "$ROOT/backend/gateway/nginx.conf" "$GW_KEEP"
rsync -a --delete \
  --exclude='.git' --exclude='.env' --exclude='__pycache__' --exclude='*.pyc' \
  --exclude='*.log' --exclude='node_modules' --exclude='/dpi-ocr' --exclude='.pytest_cache' \
  --exclude='tests/reports' --exclude='.dockerignore' \
  "$SRC/" "$ROOT/backend/"
grep -q "set_real_ip_from" "$ROOT/backend/gateway/nginx.conf" || {
  echo "NOTE: the dev gateway/nginx.conf lacks the production real-IP lines; restoring the shipped version."
  cp "$GW_KEEP" "$ROOT/backend/gateway/nginx.conf"; }
rm -f "$GW_KEEP"
ln -sfn ../ocr-backend "$ROOT/backend/dpi-ocr"
echo "backend/ refreshed from $SRC"
