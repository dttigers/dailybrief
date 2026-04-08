#!/bin/bash
set -euo pipefail

# ============================================================================
# bootstrap.sh — Cross-machine Vigil dev environment bootstrap
#
# One command takes a freshly-cloned dailybrief repo on a fresh Mac and
# produces a working dev environment: secrets restored from 1Password,
# vigil-core built + running, Mac apps built + installed, health endpoint
# responding on http://localhost:3001/v1/health.
#
# USAGE:
#   ./scripts/bootstrap.sh           Run full bootstrap (idempotent)
#   ./scripts/bootstrap.sh --check   Run drift doctor only (delegates to
#                                    scripts/dailybrief-doctor.sh)
#
# REQUIRED 1PASSWORD VAULT ITEMS (create these BEFORE running on a fresh
# machine — bootstrap will fail loud with install instructions if missing):
#
#   1. vigil-config           (document)
#      Contents: full ~/.config/dailybrief/config.json
#      Contains: ai.claude_api_key, api_key (VIGIL bearer), gmail, IMAP,
#                google_calendar_tokens_path, all nested settings.
#
#   2. vigil-gcal-tokens      (document)
#      Contents: full ~/.config/dailybrief/google_calendar_tokens.json
#      Contains: Google OAuth refresh tokens for calendar integration.
#
#   3. vigil-vigilcore-plist  (document)
#      Contents: full ~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist
#      Contains: EnvironmentVariables (ANTHROPIC_API_KEY, PORT=3001, PATH),
#                ProgramArguments, StandardOutPath/StandardErrorPath, log paths.
#      NOTE: DailyBriefMonitor plist is NOT in 1Password — install.sh
#      regenerates it from a heredoc on every run.
#
# TO UPLOAD A FILE TO 1PASSWORD AS A DOCUMENT:
#   op document create ~/.config/dailybrief/config.json --title 'vigil-config'
#   op document create ~/.config/dailybrief/google_calendar_tokens.json --title 'vigil-gcal-tokens'
#   op document create ~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist --title 'vigil-vigilcore-plist'
#
# TO UPDATE AN EXISTING ITEM:
#   op document edit 'vigil-config' ~/.config/dailybrief/config.json
#
# IDEMPOTENCY: Safe to re-run on an already-working machine. Every step is
# either naturally idempotent (npm install, launchctl unload-then-load,
# install.sh) or guarded by an existence check. Re-running should exit 0
# with no behavior change.
#
# FAIL LOUD: Any step that fails halts the script and prints an actionable
# heal message. Never silent, never "continue on error".
#
# THIS SCRIPT REPLACES THE OLD scripts/setup.sh AS THE PROJECT FRONT DOOR.
# setup.sh is retained as-is (D-03 — existing scripts unchanged) but is
# effectively dead code.
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Config constants (D-06: NO .planning/config.json keys; bash constants only) ---
CONFIG_DIR="$HOME/.config/dailybrief"
CONFIG_JSON="$CONFIG_DIR/config.json"
GCAL_TOKENS="$CONFIG_DIR/google_calendar_tokens.json"
ENV_FILE="$CONFIG_DIR/.env"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
VIGILCORE_LABEL="com.jamesonmorrill.vigilcore"
VIGILCORE_PLIST="$LAUNCH_AGENTS_DIR/$VIGILCORE_LABEL.plist"
VIGIL_CORE_DIR="$REPO_DIR/vigil-core"
HEALTH_URL="http://localhost:3001/v1/health"
HEALTH_TIMEOUT_SECS=30
HEALTH_POLL_INTERVAL=1

# 1P vault item names (D-02)
OP_ITEM_CONFIG="vigil-config"
OP_ITEM_GCAL="vigil-gcal-tokens"
OP_ITEM_PLIST="vigil-vigilcore-plist"

# ----------------------------------------------------------------------------
# --check dispatch (D-10: bootstrap.sh --check is a thin shim to the doctor)
# ----------------------------------------------------------------------------
if [[ "${1:-}" == "--check" ]]; then
    exec "$SCRIPT_DIR/dailybrief-doctor.sh"
fi

# ----------------------------------------------------------------------------
# Pre-flight (D-08 step 1 + step 2)
# ----------------------------------------------------------------------------
echo "=== Vigil Bootstrap: Pre-flight ==="

# 1. op CLI must be installed
if ! command -v op >/dev/null 2>&1; then
    echo "error: 1Password CLI (op) not installed." >&2
    echo "" >&2
    echo "Install it with:" >&2
    echo "  brew install --cask 1password-cli" >&2
    echo "" >&2
    echo "Then sign in once:" >&2
    echo "  op signin" >&2
    echo "" >&2
    echo "Then re-run: ./scripts/bootstrap.sh" >&2
    exit 1
fi

# 2. op must be signed in
if ! op whoami >/dev/null 2>&1; then
    echo "error: Not signed in to 1Password CLI." >&2
    echo "Run: op signin" >&2
    exit 1
fi

# 3. Required build tools
for tool in node npm swift; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "error: required tool '$tool' not installed." >&2
        case "$tool" in
            node|npm) echo "Install with: brew install node" >&2 ;;
            swift)    echo "Install Xcode or xcode-select --install" >&2 ;;
        esac
        exit 1
    fi
done

# 4. Optional tools — warn only
for tool in railway gh; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "  note: optional tool '$tool' not installed (skipping related steps)"
    fi
done

echo "  pre-flight OK (op signed in, node/npm/swift present)"
echo ""

# --- Task 2 appends here ---
