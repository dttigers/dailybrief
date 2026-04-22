#!/bin/bash
# Sync ANTHROPIC_API_KEY from ~/.config/dailybrief/config.json (the canonical
# PROD source of truth) into Railway (production vigil-core).
#
# Phase 107.1 D-18 change: local dev Anthropic key lives in vigil-core/.env
# (sourced from a separate Anthropic dev workspace with $20/mo cap) and is
# EXPECTED to differ from the prod Railway key. This script, by default,
# does NOT touch local .env files — only Railway. Use --include-config-env
# to also overwrite ~/.config/dailybrief/.env (rare — mostly used when
# rotating the prod key on the Mac-app path).
#
# Targets:
#   1. Railway env var (production vigil-core)                  — ALWAYS (unless --skip-railway)
#   2. ~/.config/dailybrief/.env                                — ONLY with --include-config-env
#
# Post-Phase-107.1: the launchd plist at ~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist
# is RETIRED (Plan 04). This script no longer writes to it.
#
# Flags:
#   --skip-railway          Don't touch Railway even if the CLI is available
#   --include-config-env    ALSO sync ~/.config/dailybrief/.env (off by default)
#   --skip-launchagent      Accepted for backwards compat — now a no-op (plist was retired)

set -euo pipefail

CONFIG_PATH="$HOME/.config/dailybrief/config.json"
ENV_PATH="$HOME/.config/dailybrief/.env"
PLIST_PATH="$HOME/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist"
LABEL="com.jamesonmorrill.vigilcore"
VIGIL_CORE_DIR="$(cd "$(dirname "$0")/.." && pwd)/vigil-core"

SKIP_RAILWAY=0
INCLUDE_CONFIG_ENV=0
for arg in "$@"; do
  case "$arg" in
    --skip-railway)        SKIP_RAILWAY=1 ;;
    --include-config-env)  INCLUDE_CONFIG_ENV=1 ;;
    --skip-launchagent)    : ;; # accepted, no-op (Phase 107.1: plist retired)
    -h|--help)
      sed -n '2,22p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "error: unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "error: config not found at $CONFIG_PATH" >&2
  exit 1
fi

# ----------------------------------------------------------------------------
# Step 1: Extract canonical key from config.json
# ----------------------------------------------------------------------------

KEY=$(/usr/bin/python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
key = cfg.get("ai", {}).get("claude_api_key", "")
if not key:
    sys.exit("error: ai.claude_api_key is empty in config.json")
print(key)
' "$CONFIG_PATH")

KEY_PREFIX="${KEY:0:20}"
echo "source: ai.claude_api_key in $CONFIG_PATH (${KEY_PREFIX}…)"
echo

# ----------------------------------------------------------------------------
# Step 2 (Phase 107.1 D-18): Local config .env sync — OPT-IN ONLY
# ----------------------------------------------------------------------------
# Post-Phase-107.1 contract: local dev Anthropic key is SOURCED FROM A SEPARATE
# Anthropic workspace ($20/mo cap) and lives in vigil-core/.env. The Mac-app
# path's ~/.config/dailybrief/.env is historically synced with the prod key,
# but we no longer overwrite it by default because it would re-introduce the
# "local uses prod key" drift this phase eliminated.

if [[ "$INCLUDE_CONFIG_ENV" -eq 1 ]]; then
  if [[ -f "$ENV_PATH" ]]; then
    # Replace any existing ANTHROPIC_API_KEY line; preserve everything else.
    /usr/bin/python3 - "$ENV_PATH" "$KEY" <<'PY'
import sys, pathlib
path, key = sys.argv[1], sys.argv[2]
p = pathlib.Path(path)
lines = p.read_text().splitlines()
found = False
out = []
for line in lines:
    if line.startswith("ANTHROPIC_API_KEY="):
        out.append(f"ANTHROPIC_API_KEY={key}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"ANTHROPIC_API_KEY={key}")
p.write_text("\n".join(out) + "\n")
PY
    echo "[1/2] synced .env             → $ENV_PATH (--include-config-env)"
  else
    echo "[1/2] skipped .env (not present at $ENV_PATH)"
  fi
else
  echo "[1/2] skipped ~/.config/dailybrief/.env (Phase 107.1 D-18 — local dev key is EXPECTED to differ from prod)"
  echo "      to force-sync anyway: ./scripts/sync-anthropic-key.sh --include-config-env"
fi

# ----------------------------------------------------------------------------
# Step 3 (Phase 107.1 D-09 retirement): LaunchAgent plist no longer exists
# ----------------------------------------------------------------------------
# The com.jamesonmorrill.vigilcore launchd daemon was retired in Phase 107.1
# Plan 04. If someone resurrects it in a future phase, this block will need
# to be re-enabled.
if [[ -f "$PLIST_PATH" ]]; then
  echo "warning: plist at $PLIST_PATH exists but Phase 107.1 D-09 retired it."
  echo "         This script is not syncing it. Re-enable this code block if the daemon is resurrected."
fi

# ----------------------------------------------------------------------------
# Step 4: Sync Railway env var
# ----------------------------------------------------------------------------

if [[ "$SKIP_RAILWAY" -eq 1 ]]; then
  echo "[2/2] skipped Railway (--skip-railway)"
elif ! command -v railway >/dev/null 2>&1; then
  echo "[2/2] skipped Railway (railway CLI not installed — install via 'brew install railway')"
elif [[ ! -d "$VIGIL_CORE_DIR" ]]; then
  echo "[2/2] skipped Railway (vigil-core directory not found at $VIGIL_CORE_DIR)"
else
  # railway commands need to run from a linked project directory.
  if (cd "$VIGIL_CORE_DIR" && railway status >/dev/null 2>&1); then
    (cd "$VIGIL_CORE_DIR" && railway variables --set "ANTHROPIC_API_KEY=$KEY" --skip-deploys >/dev/null)
    echo "[2/2] synced Railway env var  → vigil-core service (production)"
    echo "      note: Railway will auto-redeploy on next push, OR you can"
    echo "      trigger a redeploy now with:"
    echo "        cd vigil-core && railway redeploy"
  else
    echo "[2/2] skipped Railway ($VIGIL_CORE_DIR is not linked — run 'railway link' first)"
  fi
fi

echo
echo "done."
