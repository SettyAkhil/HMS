#!/usr/bin/env bash
# HospAI one-command deployment. See DEPLOYMENT.md.
#
#   ./deploy.sh            first run: creates deploy/.env (with generated secrets)
#                          and starts everything; later runs: start / update
#   ./deploy.sh up         build (if needed) and start everything
#   ./deploy.sh status     what is running, and whether the app answers
#   ./deploy.sh logs [svc] follow logs (all services, or one, e.g. web)
#   ./deploy.sh restart    restart everything (no rebuild)
#   ./deploy.sh update     rebuild from the current code and restart
#   ./deploy.sh backup     dump all databases + uploaded files to ./backups/
#   ./deploy.sh down       stop everything (data is kept)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/deploy/.env"
EXAMPLE="$ROOT/deploy/.env.example"
COMPOSE_FILE="$ROOT/deploy/docker-compose.yml"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

check_prereqs() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker Engine: https://docs.docker.com/engine/install/"
  docker info >/dev/null 2>&1 || die "Docker is not running, or this user cannot use it (try: sudo usermod -aG docker \$USER, then log in again)."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (the 'docker compose' plugin)."
  [ -d "$ROOT/backend" ] || die "backend/ is missing from this folder -- the repository is incomplete."
  [ -e "$ROOT/backend/dpi-ocr" ] || ln -s ../ocr-backend "$ROOT/backend/dpi-ocr" 2>/dev/null || true
}

secret() {   # 32 random bytes, URL-safe base64 (also a valid Fernet key)
  if command -v openssl >/dev/null 2>&1; then openssl rand -base64 32 | tr '+/' '-_' | tr -d '\n'
  else head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '\n'; fi
}

ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    [ -f "$EXAMPLE" ] || die "deploy/.env.example is missing."
    cp "$EXAMPLE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    created=1
  fi
  # Fill every <generated> placeholder with a fresh random secret.
  if grep -qE '^[A-Z_]+=<generated>$' "$ENV_FILE"; then
    tmp="$(mktemp)"
    while IFS= read -r line; do
      if [[ "$line" == *"=<generated>" ]]; then echo "${line%%=*}=$(secret)"; else echo "$line"; fi
    done < "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
    ok "Generated strong secrets in deploy/.env (back this file up)."
  fi
  if [ "${created:-0}" = 1 ]; then
    bold "deploy/.env created."
    echo "  Set PUBLIC_URL (and HTTP_PORT / AI_SERVER_URL if needed) in deploy/.env,"
    echo "  then run ./deploy.sh up"
    exit 0
  fi
}

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }

wait_healthy() {
  local port url i
  port="$(env_get HTTP_PORT)"; port="${port:-80}"
  url="http://127.0.0.1:${port}"
  printf '  Waiting for the app to answer on %s ' "$url"
  for i in $(seq 1 90); do
    if curl -fsS "$url/healthz" >/dev/null 2>&1 && curl -fsS "$url/hms-api/api/health" >/dev/null 2>&1; then
      echo; ok "Web and backend are up."; return 0
    fi
    printf '.'; sleep 4
  done
  echo; warn "Not answering yet -- first start can take a few minutes. Check: ./deploy.sh status / ./deploy.sh logs"
}

cmd_up() {
  check_prereqs; ensure_env
  local pub; pub="$(env_get PUBLIC_URL)"
  [[ "$pub" == *localhost* ]] && warn "PUBLIC_URL is $pub -- patients' phones cannot open QR/SMS links to localhost. Set the real address in deploy/.env."
  bold "Building and starting HospAI (first build takes several minutes)..."
  compose up -d --build --remove-orphans
  wait_healthy
  echo
  bold "HospAI is running: $pub"
  echo "  Sign in with the role picker on the login screen."
  echo "  Next: read DEPLOYMENT.md -> 'Security before go-live'."
}

cmd_status() {
  check_prereqs; [ -f "$ENV_FILE" ] || die "Not set up yet: run ./deploy.sh"
  compose ps
  local port; port="$(env_get HTTP_PORT)"; port="${port:-80}"
  curl -fsS "http://127.0.0.1:${port}/healthz" >/dev/null 2>&1 && ok "web answers" || warn "web is not answering"
  curl -fsS "http://127.0.0.1:${port}/hms-api/api/health" >/dev/null 2>&1 && ok "backend answers" || warn "backend is not answering"
}

cmd_backup() {
  check_prereqs; [ -f "$ENV_FILE" ] || die "Not set up yet."
  local dir="$ROOT/backups/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$dir"
  bold "Backing up to $dir"
  compose exec -T postgres      pg_dump -U hospai   -d hospai            -Fc > "$dir/main.dump"  && ok "main database"
  compose exec -T hr-postgres   pg_dump -U hr_owner -d hospai_hr         -Fc > "$dir/hr.dump"    && ok "HR database"
  compose exec -T ocr-postgres  pg_dump -U keppler  -d keppler           -Fc > "$dir/ocr.dump"   && ok "OCR database"
  compose exec -T hrms-postgres pg_dump -U hrms     -d hospai_enterprise -Fc > "$dir/hrms.dump"  && ok "HRMS database"
  for v in hospital_uploads hr_documents ocr_uploads; do
    docker run --rm -v "hospai_${v}:/data:ro" -v "$dir:/backup" alpine tar czf "/backup/${v}.tar.gz" -C /data . && ok "files: $v"
  done
  cp "$ENV_FILE" "$dir/env.backup" && chmod 600 "$dir/env.backup" && ok "configuration (deploy/.env)"
  bold "Done. Copy $dir off this server."
}

case "${1:-up}" in
  up|start|"") cmd_up ;;
  update)  check_prereqs; ensure_env; bold "Rebuilding from the current code..."; compose up -d --build --remove-orphans; wait_healthy ;;
  restart) check_prereqs; compose restart; wait_healthy ;;
  status)  cmd_status ;;
  logs)    check_prereqs; shift || true; compose logs -f --tail=200 "$@" ;;
  backup)  cmd_backup ;;
  down|stop) check_prereqs; compose down; ok "Stopped. Data is kept in Docker volumes (hospai_*)." ;;
  help|-h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "Unknown command '$1'. Try ./deploy.sh help" ;;
esac
