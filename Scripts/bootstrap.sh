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

# ----------------------------------------------------------------------------
# Step 3: Restore secrets from 1Password (D-08 step 3, D-02)
# ----------------------------------------------------------------------------
echo "=== Vigil Bootstrap: Secrets Restore ==="
mkdir -p "$CONFIG_DIR"
mkdir -p "$LAUNCH_AGENTS_DIR"

restore_op_document() {
    local item="$1"
    local out_path="$2"
    echo "  restoring $item → $out_path"
    # Verify the item exists before attempting restore (cleaner error message)
    if ! op item get "$item" >/dev/null 2>&1; then
        echo "error: 1Password item '$item' not found in your vault." >&2
        echo "" >&2
        echo "Create it with:" >&2
        echo "  op document create $out_path --title '$item'" >&2
        echo "" >&2
        echo "(You must have the original file on a machine that already has it." >&2
        echo " See the header comment in this script for the full vault contract.)" >&2
        exit 1
    fi
    # --out writes the document content to the specified file, overwriting if present.
    # Ref: https://developer.1password.com/docs/cli/reference/commands/document/get/
    op document get "$item" --out "$out_path" --force 2>/dev/null \
        || op document get "$item" --out "$out_path"
}

restore_op_document "$OP_ITEM_CONFIG" "$CONFIG_JSON"
restore_op_document "$OP_ITEM_GCAL"   "$GCAL_TOKENS"
restore_op_document "$OP_ITEM_PLIST"  "$VIGILCORE_PLIST"

# Sanity: config.json must parse as JSON after restore
if ! /usr/bin/python3 -c "import json; json.load(open('$CONFIG_JSON'))" 2>/dev/null; then
    echo "error: restored $CONFIG_JSON is not valid JSON. Check the 1P document contents." >&2
    exit 1
fi
echo "  secrets restored"
echo ""

# ----------------------------------------------------------------------------
# Step 5: Build vigil-core (D-08 step 5)
# ----------------------------------------------------------------------------
echo "=== Vigil Bootstrap: vigil-core build ==="
if [[ ! -d "$VIGIL_CORE_DIR" ]]; then
    echo "error: vigil-core directory not found at $VIGIL_CORE_DIR" >&2
    echo "Are you running this from inside the dailybrief repo?" >&2
    exit 1
fi
(
    cd "$VIGIL_CORE_DIR"
    echo "  npm install..."
    npm install
    echo "  npm run build..."
    npm run build
)
echo "  vigil-core built"
echo ""

# ----------------------------------------------------------------------------
# Step 6: Ensure .env exists, then sync ANTHROPIC_API_KEY (D-08 step 6)
# ----------------------------------------------------------------------------
echo "=== Vigil Bootstrap: .env + key sync ==="

# Seed .env from template only if missing (idempotent: never overwrite existing .env)
if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$VIGIL_CORE_DIR/.env.example" ]]; then
        cp "$VIGIL_CORE_DIR/.env.example" "$ENV_FILE"
        echo "  seeded $ENV_FILE from vigil-core/.env.example"
    else
        touch "$ENV_FILE"
        echo "  created empty $ENV_FILE (no .env.example template found)"
    fi
else
    echo "  $ENV_FILE already exists — leaving in place"
fi

# Run sync-anthropic-key.sh to propagate ai.claude_api_key → .env + plist + Railway.
# This script is already idempotent and uses replace-or-append patterns.
# It also reloads the vigil-core LaunchAgent as a side effect; we reload again
# explicitly in step 7 for clarity, but the unload-then-load pattern is safe.
"$SCRIPT_DIR/sync-anthropic-key.sh"
echo ""

# ----------------------------------------------------------------------------
# Step 7: Load vigil-core LaunchAgent (D-08 step 7)
# ----------------------------------------------------------------------------
echo "=== Vigil Bootstrap: vigil-core LaunchAgent ==="
GUI_DOMAIN="gui/$(id -u)"

# Idempotent load: bootout first (ignore errors if not loaded), then bootstrap.
# Matches install.sh pattern for the Monitor plist.
launchctl bootout "$GUI_DOMAIN/$VIGILCORE_LABEL" 2>/dev/null || true
launchctl bootstrap "$GUI_DOMAIN" "$VIGILCORE_PLIST"
echo "  $VIGILCORE_LABEL bootstrapped"
echo ""

# ----------------------------------------------------------------------------
# Step 8: Delegate Mac-side install to install.sh (D-08 step 8, D-03)
# ----------------------------------------------------------------------------
echo "=== Vigil Bootstrap: DailyBrief CLI + Monitor ==="
# install.sh is idempotent (declared in its own header), builds both swift
# targets in release mode, installs to ~/.local/bin, and bootstraps the
# DailyBriefMonitor LaunchAgent. It does NOT touch config.json or vigil-core.
bash "$SCRIPT_DIR/install.sh"
echo ""

# ----------------------------------------------------------------------------
# Step 9: Health check — HTTP 200 ONLY (D-08 step 9, D-12, D-13)
# ----------------------------------------------------------------------------
echo "=== Vigil Bootstrap: Health check ==="
echo "  polling $HEALTH_URL for HTTP 200 (timeout ${HEALTH_TIMEOUT_SECS}s)..."

# D-13: HTTP 200 ONLY. Do NOT parse JSON body. Local vigil-core runs
# status: "degraded" as accepted steady state because Mac apps talk to
# Railway. JSON parsing here would fail on a healthy-enough environment.

health_ok=0
for ((i=0; i<HEALTH_TIMEOUT_SECS; i+=HEALTH_POLL_INTERVAL)); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$HEALTH_URL" 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" ]]; then
        health_ok=1
        break
    fi
    sleep "$HEALTH_POLL_INTERVAL"
done

if [[ "$health_ok" -eq 0 ]]; then
    echo "error: vigil-core health endpoint did not return HTTP 200 within ${HEALTH_TIMEOUT_SECS}s" >&2
    echo "" >&2
    # Extract log path dynamically from the plist (do NOT hardcode — the 1P
    # restored plist may point elsewhere)
    STDERR_LOG=$(/usr/libexec/PlistBuddy -c "Print :StandardErrorPath" "$VIGILCORE_PLIST" 2>/dev/null || echo "$HOME/Library/Logs/DailyBrief/vigilcore-stderr.log")
    STDOUT_LOG=$(/usr/libexec/PlistBuddy -c "Print :StandardOutPath" "$VIGILCORE_PLIST" 2>/dev/null || echo "$HOME/Library/Logs/DailyBrief/vigilcore-stdout.log")
    echo "--- last 50 lines of $STDERR_LOG ---" >&2
    tail -n 50 "$STDERR_LOG" 2>/dev/null >&2 || echo "(log not readable)" >&2
    echo "--- last 20 lines of $STDOUT_LOG ---" >&2
    tail -n 20 "$STDOUT_LOG" 2>/dev/null >&2 || echo "(log not readable)" >&2
    echo "" >&2
    echo "Debug: check 'launchctl print $GUI_DOMAIN/$VIGILCORE_LABEL'" >&2
    exit 1
fi

echo "  $HEALTH_URL -> HTTP 200"
echo ""

# ----------------------------------------------------------------------------
# Step 10: Summary (D-08 step 10)
# ----------------------------------------------------------------------------
echo "=== Vigil Bootstrap: Complete ==="
echo ""
echo "  Secrets restored from 1Password:"
echo "    - $CONFIG_JSON"
echo "    - $GCAL_TOKENS"
echo "    - $VIGILCORE_PLIST"
echo ""
echo "  vigil-core:"
echo "    - built at $VIGIL_CORE_DIR/dist"
echo "    - LaunchAgent: $VIGILCORE_LABEL (loaded)"
echo "    - health: $HEALTH_URL -> HTTP 200"
echo ""
echo "  Mac apps (via install.sh):"
echo "    - $HOME/.local/bin/DailyBrief"
echo "    - $HOME/.local/bin/DailyBriefMonitor"
echo "    - LaunchAgent: com.jamesonmorrill.dailybriefmonitor (loaded)"
echo ""
echo "  Next steps:"
echo "    - Run ./scripts/bootstrap.sh --check to scan for secret drift"
echo "    - Run ./scripts/dailybrief-doctor.sh directly for the same"
echo ""
echo "  Done."
