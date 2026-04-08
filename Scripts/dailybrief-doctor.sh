#!/bin/bash
set -euo pipefail

# ============================================================================
# dailybrief-doctor.sh — READ-ONLY drift doctor for Vigil secret storage.
#
# Scans all locations where ANTHROPIC_API_KEY and the VIGIL bearer live,
# reports first-8-char prefixes + file timestamps, and exits 1 if any drift
# detected. Never writes, never heals. Healing is sync-anthropic-key.sh's job
# (D-11).
#
# Output format (D-10):
#   TARGET | VALUE PREFIX | LAST MODIFIED | MATCH
#
# Exit codes:
#   0 = all drift-checked rows match
#   1 = drift detected (prints heal command)
#
# The `local vigil-core DB connected?` row is INFORMATIONAL ONLY and does
# NOT affect exit code (D-13 — local vigil-core runs degraded as accepted
# steady state because Mac apps talk to Railway).
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Config constants (D-06) ---
CONFIG_DIR="$HOME/.config/dailybrief"
CONFIG_JSON="$CONFIG_DIR/config.json"
ENV_FILE="$CONFIG_DIR/.env"
VIGILCORE_PLIST="$HOME/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist"
VIGIL_CORE_DIR="$REPO_DIR/vigil-core"
HEALTH_URL="http://localhost:3001/v1/health"

DRIFT_COUNT=0

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

prefix8() {
    local val="$1"
    if [[ -z "$val" ]]; then
        echo "(empty)"
    else
        echo "${val:0:8}…"
    fi
}

last_modified() {
    local path="$1"
    if [[ -f "$path" ]]; then
        /usr/bin/stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$path" 2>/dev/null || echo "unknown"
    else
        echo "(missing)"
    fi
}

# Print a table row. Args: target, value_prefix, last_modified, match
print_row() {
    printf "%-38s | %-13s | %-16s | %s\n" "$1" "$2" "$3" "$4"
}

print_header() {
    printf "%-38s | %-13s | %-16s | %s\n" "TARGET" "VALUE PREFIX" "LAST MODIFIED" "MATCH"
    printf "%-38s-+-%-13s-+-%-16s-+-%s\n" "--------------------------------------" "-------------" "----------------" "------"
}

# ----------------------------------------------------------------------------
# Header
# ----------------------------------------------------------------------------
echo "=== Vigil Drift Doctor ==="
echo ""

# Canonical source must exist
if [[ ! -f "$CONFIG_JSON" ]]; then
    echo "error: canonical config not found at $CONFIG_JSON" >&2
    echo "(Did you run ./scripts/bootstrap.sh yet?)" >&2
    exit 1
fi

# ----------------------------------------------------------------------------
# ANTHROPIC_API_KEY drift check (D-04: 4 places)
# ----------------------------------------------------------------------------
echo "ANTHROPIC_API_KEY drift check:"
print_header

# 1. Canonical source: config.json ai.claude_api_key
ANTHROPIC_CANONICAL=$(/usr/bin/python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
print(cfg.get("ai", {}).get("claude_api_key", ""))
' "$CONFIG_JSON" 2>/dev/null || echo "")

print_row "config.json ai.claude_api_key" "$(prefix8 "$ANTHROPIC_CANONICAL")" "$(last_modified "$CONFIG_JSON")" "✓ (canonical)"

# 2. .env ANTHROPIC_API_KEY
if [[ -f "$ENV_FILE" ]]; then
    ANTHROPIC_ENV=$(grep -E '^ANTHROPIC_API_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || echo "")
    if [[ "$ANTHROPIC_ENV" == "$ANTHROPIC_CANONICAL" ]]; then
        MATCH="✓"
    else
        MATCH="✗"
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
    fi
    print_row ".env ANTHROPIC_API_KEY" "$(prefix8 "$ANTHROPIC_ENV")" "$(last_modified "$ENV_FILE")" "$MATCH"
else
    print_row ".env ANTHROPIC_API_KEY" "(missing)" "(missing)" "✗"
    DRIFT_COUNT=$((DRIFT_COUNT + 1))
fi

# 3. Plist EnvironmentVariables:ANTHROPIC_API_KEY
if [[ -f "$VIGILCORE_PLIST" ]]; then
    ANTHROPIC_PLIST=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:ANTHROPIC_API_KEY" "$VIGILCORE_PLIST" 2>/dev/null || echo "")
    if [[ "$ANTHROPIC_PLIST" == "$ANTHROPIC_CANONICAL" ]]; then
        MATCH="✓"
    else
        MATCH="✗"
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
    fi
    print_row "plist EnvironmentVariables" "$(prefix8 "$ANTHROPIC_PLIST")" "$(last_modified "$VIGILCORE_PLIST")" "$MATCH"
else
    print_row "plist EnvironmentVariables" "(missing)" "(missing)" "✗"
    DRIFT_COUNT=$((DRIFT_COUNT + 1))
fi

# 4. Railway variable (only if CLI present and linked — otherwise informational)
# Note: railway v4.36.1 uses `railway variable --kv` (singular, not `variables`).
if command -v railway >/dev/null 2>&1 && [[ -d "$VIGIL_CORE_DIR" ]]; then
    if (cd "$VIGIL_CORE_DIR" && railway status >/dev/null 2>&1); then
        ANTHROPIC_RAILWAY=$(cd "$VIGIL_CORE_DIR" && railway variable --kv 2>/dev/null | grep -E '^ANTHROPIC_API_KEY=' | head -1 | cut -d= -f2- || echo "")
        if [[ "$ANTHROPIC_RAILWAY" == "$ANTHROPIC_CANONICAL" ]]; then
            MATCH="✓"
        else
            MATCH="✗"
            DRIFT_COUNT=$((DRIFT_COUNT + 1))
        fi
        print_row "railway ANTHROPIC_API_KEY" "$(prefix8 "$ANTHROPIC_RAILWAY")" "(live)" "$MATCH"
    else
        print_row "railway ANTHROPIC_API_KEY" "(not linked)" "(n/a)" "- info"
    fi
else
    print_row "railway ANTHROPIC_API_KEY" "(cli absent)" "(n/a)" "- info"
fi

echo ""

# ----------------------------------------------------------------------------
# VIGIL_API_KEY (bearer) drift check (D-04)
# ----------------------------------------------------------------------------
# Per research (Q2 VERIFIED): the bearer is stored ONLY in config.json
# top-level "api_key" field. NO UserDefaults, NO Keychain, NO separate file.
# SettingsViewModel round-trips it via ConfigLoader.save() back to the same
# file. This is a single-source check today — there's no drift possible
# until a second storage location is added.
# ----------------------------------------------------------------------------

echo "VIGIL_API_KEY (bearer) drift check:"
print_header

VIGIL_BEARER=$(/usr/bin/python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
print(cfg.get("api_key", ""))
' "$CONFIG_JSON" 2>/dev/null || echo "")

if [[ -n "$VIGIL_BEARER" ]]; then
    print_row "config.json api_key" "$(prefix8 "$VIGIL_BEARER")" "$(last_modified "$CONFIG_JSON")" "✓ (single source)"
else
    print_row "config.json api_key" "(empty)" "$(last_modified "$CONFIG_JSON")" "✗"
    DRIFT_COUNT=$((DRIFT_COUNT + 1))
fi

echo ""

# ----------------------------------------------------------------------------
# Informational rows (D-13) — do NOT affect exit code
# ----------------------------------------------------------------------------
# The local vigil-core's `status` field is INFORMATIONAL here. Per D-13,
# local vigil-core runs status: "degraded" as accepted steady state because
# Mac apps talk to api.vigilhub.io (Railway), not localhost. We report the
# status so the user can see what's happening, but we do NOT increment
# DRIFT_COUNT based on it. This is the ONE place where parsing the JSON
# body is correct — because the row is informational only.
# ----------------------------------------------------------------------------

echo "Informational (not counted toward exit code):"
printf "%-38s | %s\n" "TARGET" "VALUE"
printf "%-38s-+-%s\n" "--------------------------------------" "----------------------------------"

HEALTH_RESPONSE=$(curl -s --max-time 2 "$HEALTH_URL" 2>/dev/null || echo "")
if [[ -z "$HEALTH_RESPONSE" ]]; then
    printf "%-38s | %s\n" "local vigil-core /v1/health" "unreachable (process not running?)"
else
    # Parse status and database fields — purely informational
    HEALTH_INFO=$(/usr/bin/python3 -c '
import json, sys
try:
    d = json.loads(sys.argv[1])
    status = d.get("status", "unknown")
    db = d.get("database", "unknown")
    print(f"HTTP 200 (status={status}, db={db})")
except Exception as e:
    print(f"HTTP 200 (unparseable body: {e})")
' "$HEALTH_RESPONSE" 2>/dev/null || echo "HTTP 200 (parse failed)")
    printf "%-38s | %s\n" "local vigil-core /v1/health" "$HEALTH_INFO"
fi

echo ""

# ----------------------------------------------------------------------------
# Exit logic (D-10, D-11)
# ----------------------------------------------------------------------------
if [[ "$DRIFT_COUNT" -eq 0 ]]; then
    echo "=== Doctor: 0 drift found ==="
    exit 0
else
    echo "=== Doctor: $DRIFT_COUNT drift row(s) found ==="
    echo ""
    echo "Heal command:"
    echo "  ./scripts/sync-anthropic-key.sh"
    echo ""
    echo "(Doctor is read-only — it only reports. Healing lives in sync-anthropic-key.sh.)"
    exit 1
fi
