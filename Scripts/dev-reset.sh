#!/usr/bin/env bash
# scripts/dev-reset.sh — Wipe and rebuild local vigil_dev DB (Phase 107.1 D-06 discretion).
# Not for prod. Destructive — asks for confirmation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PG_BIN="/usr/local/opt/postgresql@16/bin"
export PATH="$PG_BIN:$PATH"

printf "This will DROP and rebuild vigil_dev (all local data is lost). Continue? [y/N] "
read -r CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "aborted."
  exit 0
fi

echo "[dev-reset] dropping vigil_dev..."
dropdb --if-exists vigil_dev
echo "[dev-reset] creating vigil_dev..."
createdb vigil_dev
echo "[dev-reset] running migrations..."
npm --prefix "$REPO_ROOT/vigil-core" run db:migrate
echo "[dev-reset] seeding..."
npm --prefix "$REPO_ROOT/vigil-core" run seed:local
echo "[dev-reset] complete."
