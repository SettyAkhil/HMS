#!/usr/bin/env bash
# Refresh the shipped backend copy (./keppler-backend) from the development
# backend before a release. Never copies secrets (.env), git history, caches,
# or logs. Usage: scripts/sync-backend.sh [/path/to/dev/keppler-backend]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-$(readlink -f "$ROOT/hospital-backend" 2>/dev/null || true)}"
[ -n "$SRC" ] && [ -f "$SRC/docker-compose.yml" ] || { echo "Usage: $0 /path/to/keppler-backend"; exit 1; }
[ "$(readlink -f "$SRC")" != "$(readlink -f "$ROOT/keppler-backend")" ] || { echo "Source is the shipped copy itself."; exit 1; }
# The shipped gateway trusts the web server's X-Real-IP (deploy/); keep that change.
GW_KEEP="$(mktemp)"; cp "$ROOT/keppler-backend/gateway/nginx.conf" "$GW_KEEP"
rsync -a --delete \
  --exclude='.git' --exclude='.env' --exclude='__pycache__' --exclude='*.pyc' \
  --exclude='*.log' --exclude='node_modules' --exclude='/dpi-ocr' --exclude='.pytest_cache' \
  --exclude='tests/reports' --exclude='.dockerignore' \
  "$SRC/" "$ROOT/keppler-backend/"
grep -q "set_real_ip_from" "$ROOT/keppler-backend/gateway/nginx.conf" || {
  echo "NOTE: the dev gateway/nginx.conf lacks the production real-IP lines; restoring the shipped version."
  cp "$GW_KEEP" "$ROOT/keppler-backend/gateway/nginx.conf"; }
rm -f "$GW_KEEP"
ln -sfn ../dpi-ocr-backend "$ROOT/keppler-backend/dpi-ocr"
echo "keppler-backend/ refreshed from $SRC"
