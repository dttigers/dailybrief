#!/usr/bin/env bash
# scripts/dev-setup.sh — First-time local dev bootstrap (Phase 107.1 D-07).
#
# Idempotent: safe to re-run on an already-working machine.
# NOT a replacement for scripts/bootstrap.sh (which is 1Password-dependent and stale).
# Never silently overwrites vigil-core/.env — always creates a timestamped backup first.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PG_BIN="/usr/local/opt/postgresql@16/bin"
CORE_ENV="$REPO_ROOT/vigil-core/.env"
CORE_ENV_EXAMPLE="$REPO_ROOT/vigil-core/.env.example"
PWA_ENV_LOCAL="$REPO_ROOT/vigil-pwa/.env.local"
MANUAL_NOTES=()

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
info()  { printf '[dev-setup] %s\n' "$*"; }

# 1. Detect (do not attempt to retire) the vigilcore daemon — retirement is manual per RESEARCH Pitfall 2
if launchctl list com.jamesonmorrill.vigilcore 2>/dev/null | grep -q 'Label'; then
  yellow "[dev-setup] WARNING: com.jamesonmorrill.vigilcore daemon is still registered."
  MANUAL_NOTES+=("Retire the daemon (must run in Terminal.app on THIS Mac, NOT via SSH — LimitLoadToSessionType=Aqua):")
  MANUAL_NOTES+=("    launchctl bootout gui/\$UID/com.jamesonmorrill.vigilcore")
  MANUAL_NOTES+=("    rm ~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist")
fi

# 2. Verify brew + postgresql@16 installed (D-01)
if ! command -v brew >/dev/null 2>&1; then
  red "[dev-setup] FAIL — Homebrew not installed. Install: https://brew.sh"
  exit 1
fi
if ! brew list postgresql@16 >/dev/null 2>&1; then
  red "[dev-setup] FAIL — postgresql@16 not installed."
  red "  Fix: brew install postgresql@16"
  exit 1
fi
green "[dev-setup] postgresql@16 is installed"

# 3. Start brew service if not running (D-16: first-time only)
if ! brew services list | awk '$1=="postgresql@16" {print $2}' | grep -q '^started$'; then
  info "Starting postgresql@16 brew service (one-time; sticky across reboots per D-16)..."
  brew services start postgresql@16
  sleep 2
else
  green "[dev-setup] postgresql@16 brew service already started"
fi

# 4. Create vigil_dev if missing (D-04)
export PATH="$PG_BIN:$PATH"
if ! psql -h localhost -lqt 2>/dev/null | cut -d'|' -f1 | grep -qw vigil_dev; then
  info "Creating vigil_dev database..."
  createdb vigil_dev
else
  green "[dev-setup] vigil_dev database already exists"
fi

# 5. Write .env files (T-LOCAL-2: NEVER overwrite existing .env without backup)
if [[ ! -f "$CORE_ENV" ]]; then
  if [[ ! -f "$CORE_ENV_EXAMPLE" ]]; then
    red "[dev-setup] FAIL — $CORE_ENV_EXAMPLE is missing. Plan 01 should have created it."
    exit 1
  fi
  info "Creating vigil-core/.env from .env.example (LOCAL-ONLY template)..."
  cp "$CORE_ENV_EXAMPLE" "$CORE_ENV"
  MANUAL_NOTES+=("Fill real values in vigil-core/.env: JWT_SECRET (any 32+ chars), ANTHROPIC_API_KEY (dev workspace key — see note below).")
else
  # Existing .env — back up regardless of whether we touch it
  BACKUP="$CORE_ENV.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$CORE_ENV" "$BACKUP"
  green "[dev-setup] Backed up existing vigil-core/.env → $BACKUP"
  # If existing .env contains Railway hostname, warn but do not auto-rewrite
  if grep -qE '(rlwy\.net|railway\.app|proxy\.rlwy)' "$CORE_ENV"; then
    yellow "[dev-setup] WARNING: vigil-core/.env contains a Railway hostname."
    MANUAL_NOTES+=("vigil-core/.env still has a Railway hostname. Backup saved at $BACKUP.")
    MANUAL_NOTES+=("    Replace DATABASE_URL with: postgresql://localhost:5432/vigil_dev")
    MANUAL_NOTES+=("    Remove any rlwy.net or railway.app entries. See vigil-core/.env.example for the LOCAL-ONLY shape.")
  fi
fi

if [[ ! -f "$PWA_ENV_LOCAL" ]]; then
  info "Creating vigil-pwa/.env.local..."
  # Research finding #2: the correct env var name is VITE_API_BASE (the common wrong guess has no effect in this codebase).
  printf "VITE_API_BASE=http://localhost:3001\n" > "$PWA_ENV_LOCAL"
else
  green "[dev-setup] vigil-pwa/.env.local already exists"
fi

# 6. Run migrations (drizzle-kit is idempotent; D-05)
info "Running Drizzle migrations against vigil_dev..."
npm --prefix "$REPO_ROOT/vigil-core" run db:migrate

# 7. Run seed (Plan 02 seed is idempotent via onConflictDoNothing)
info "Seeding local DB (idempotent)..."
npm --prefix "$REPO_ROOT/vigil-core" run seed:local

# 8. Anthropic dev workspace reminder (Pitfall 8: workspace-level cap, not per-key — manual)
if [[ -f "$CORE_ENV" ]]; then
  ANTHROPIC_VAL=$(grep -E '^ANTHROPIC_API_KEY=' "$CORE_ENV" | head -1 | cut -d= -f2- || true)
  if [[ "$ANTHROPIC_VAL" == "sk-ant-dev-workspace-key-here" ]] || [[ -z "$ANTHROPIC_VAL" ]]; then
    MANUAL_NOTES+=("Create an Anthropic 'dev' workspace + generate a key there + set the workspace monthly limit to \$20 (D-18):")
    MANUAL_NOTES+=("    https://console.anthropic.com/settings/workspaces → Create → Limits tab → Change Limit")
    MANUAL_NOTES+=("    Paste the generated key into vigil-core/.env ANTHROPIC_API_KEY=...")
  fi
fi

# 9. Final preflight — confirm everything is healthy
info "Running pre-flight check to confirm setup..."
if ! bash "$SCRIPT_DIR/preflight-check.sh"; then
  red "[dev-setup] preflight failed — address the above and re-run scripts/dev-setup.sh"
  exit 1
fi

# 10. Print manual notes (iMac daemon bootout, Anthropic workspace)
if [[ ${#MANUAL_NOTES[@]} -gt 0 ]]; then
  yellow ""
  yellow "[dev-setup] Manual follow-ups (things this script cannot automate):"
  for note in "${MANUAL_NOTES[@]}"; do
    yellow "  $note"
  done
  yellow ""
fi

green "[dev-setup] complete. Run: npm run dev (from repo root)"
exit 0
