#!/usr/bin/env bash
# scripts/preflight-check.sh — Pre-flight doctor for `npm run dev` (Phase 107.1 D-10).
#
# Explicit > magic. Print the exact fix command on any failure, exit 1. NO auto-heal.
# No bypass flag or env var — if you need to skip a check, fix the underlying issue.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PG_BIN="/usr/local/opt/postgresql@16/bin"
ENV_FILE="$REPO_ROOT/vigil-core/.env"

FAIL=0
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
info()  { printf '[preflight] %s\n' "$*"; }

check_daemon_gone() {
  info "Check 1: com.jamesonmorrill.vigilcore daemon not registered"
  if launchctl list com.jamesonmorrill.vigilcore 2>/dev/null | grep -q 'Label'; then
    red "  FAIL — daemon still registered. Fix (run in Terminal.app, NOT via SSH):"
    red "    launchctl bootout gui/\$UID/com.jamesonmorrill.vigilcore"
    red "    rm ~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist"
    FAIL=1
  else
    green "  PASS — daemon not registered"
  fi
}

check_port_free() {
  info "Check 2: port 3001 is free for vigil-core"
  OCCUPANT=$(lsof -iTCP:3001 -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$OCCUPANT" ]]; then
    red "  FAIL — port 3001 is in use:"
    printf '%s\n' "$OCCUPANT" | sed 's/^/    /'
    red "  Fix: lsof -iTCP:3001 -sTCP:LISTEN | tail -n +2 | awk '{print \$2}' | xargs kill"
    FAIL=1
  else
    green "  PASS — port 3001 is free"
  fi
}

check_postgres_running() {
  info "Check 3: postgresql@16 is accepting connections on localhost"
  if [[ ! -x "$PG_BIN/pg_isready" ]]; then
    red "  FAIL — pg_isready not found at $PG_BIN"
    red "  Fix: brew install postgresql@16"
    FAIL=1
    return
  fi
  if ! "$PG_BIN/pg_isready" -h localhost -q 2>/dev/null; then
    red "  FAIL — Postgres not accepting connections."
    red "  Fix: brew services start postgresql@16"
    FAIL=1
  else
    green "  PASS — Postgres is accepting connections"
  fi
}

check_env_localhost() {
  info "Check 4: vigil-core/.env DATABASE_URL points at localhost"
  if [[ ! -f "$ENV_FILE" ]]; then
    red "  FAIL — $ENV_FILE does not exist."
    red "  Fix: bash scripts/dev-setup.sh"
    FAIL=1
    return
  fi
  DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)
  if [[ -z "$DB_URL" ]]; then
    red "  FAIL — DATABASE_URL is missing from $ENV_FILE."
    red "  Fix: bash scripts/dev-setup.sh (writes .env from .env.example)"
    FAIL=1
    return
  fi
  if [[ "$DB_URL" == *"rlwy.net"* ]] || [[ "$DB_URL" == *"railway"* ]] || [[ "$DB_URL" == *"proxy"* ]]; then
    red "  FAIL — DATABASE_URL looks like a prod Railway URL:"
    red "    $DB_URL"
    red "  Fix: edit $ENV_FILE — DATABASE_URL should be postgresql://localhost:5432/vigil_dev"
    FAIL=1
    return
  fi
  if [[ "$DB_URL" != *"localhost"* ]] && [[ "$DB_URL" != *"127.0.0.1"* ]]; then
    red "  FAIL — DATABASE_URL is not pointing at localhost or 127.0.0.1:"
    red "    $DB_URL"
    red "  Fix: edit $ENV_FILE — DATABASE_URL should be postgresql://localhost:5432/vigil_dev"
    FAIL=1
  else
    green "  PASS — DATABASE_URL points at local Postgres"
  fi
}

check_daemon_gone
check_port_free
check_postgres_running
check_env_localhost

if [[ "$FAIL" -ne 0 ]]; then
  red ""
  red "preflight: FAILED — fix the above and re-run"
  exit 1
fi
green ""
green "preflight: all checks passed — dev environment is healthy"
exit 0
