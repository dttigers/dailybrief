#!/bin/bash
# Sync ANTHROPIC_API_KEY from ~/.config/dailybrief/config.json (the canonical
# source of truth) into all the places that hold a duplicate copy:
#
#   1. ~/.config/dailybrief/.env             (used by `npm run dev` for local vigil-core)
#   2. LaunchAgent plist EnvironmentVariables (used by the LaunchAgent vigil-core process)
#   3. Railway env var (production vigil-core)  — only if `railway` CLI is installed
#                                                  and the cwd is linked to a project
#
# After updating each target, reloads the local LaunchAgent and (optionally)
# triggers a Railway redeploy.
#
# Run this whenever you rotate ai.claude_api_key in config.json.
#
# Flags:
#   --skip-railway   Don't touch Railway even if the CLI is available
#   --skip-launchagent  Don't reload the local LaunchAgent

set -euo pipefail

CONFIG_PATH="$HOME/.config/dailybrief/config.json"
ENV_PATH="$HOME/.config/dailybrief/.env"
PLIST_PATH="$HOME/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist"
LABEL="com.jamesonmorrill.vigilcore"
VIGIL_CORE_DIR="$(cd "$(dirname "$0")/.." && pwd)/vigil-core"

SKIP_RAILWAY=0
SKIP_LAUNCHAGENT=0
for arg in "$@"; do
  case "$arg" in
    --skip-railway) SKIP_RAILWAY=1 ;;
    --skip-launchagent) SKIP_LAUNCHAGENT=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \?//'
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
# Step 2: Sync ~/.config/dailybrief/.env
# ----------------------------------------------------------------------------

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
  echo "[1/3] synced .env             → $ENV_PATH"
else
  echo "[1/3] skipped .env (not present at $ENV_PATH)"
fi

# ----------------------------------------------------------------------------
# Step 3: Sync LaunchAgent plist + reload
# ----------------------------------------------------------------------------

if [[ -f "$PLIST_PATH" ]]; then
  /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:ANTHROPIC_API_KEY $KEY" "$PLIST_PATH"
  echo "[2/3] synced LaunchAgent plist → $PLIST_PATH"

  if [[ "$SKIP_LAUNCHAGENT" -eq 0 ]]; then
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    launchctl load   "$PLIST_PATH"
    echo "      reloaded $LABEL"
  else
    echo "      skipped reload (--skip-launchagent)"
  fi
else
  echo "[2/3] skipped LaunchAgent plist (not present at $PLIST_PATH)"
fi

# ----------------------------------------------------------------------------
# Step 4: Sync Railway env var
# ----------------------------------------------------------------------------

if [[ "$SKIP_RAILWAY" -eq 1 ]]; then
  echo "[3/3] skipped Railway (--skip-railway)"
elif ! command -v railway >/dev/null 2>&1; then
  echo "[3/3] skipped Railway (railway CLI not installed — install via 'brew install railway')"
elif [[ ! -d "$VIGIL_CORE_DIR" ]]; then
  echo "[3/3] skipped Railway (vigil-core directory not found at $VIGIL_CORE_DIR)"
else
  # railway commands need to run from a linked project directory.
  if (cd "$VIGIL_CORE_DIR" && railway status >/dev/null 2>&1); then
    (cd "$VIGIL_CORE_DIR" && railway variables --set "ANTHROPIC_API_KEY=$KEY" --skip-deploys >/dev/null)
    echo "[3/3] synced Railway env var  → vigil-core service (production)"
    echo "      note: Railway will auto-redeploy on next push, OR you can"
    echo "      trigger a redeploy now with:"
    echo "        cd vigil-core && railway redeploy"
  else
    echo "[3/3] skipped Railway ($VIGIL_CORE_DIR is not linked — run 'railway link' first)"
  fi
fi

echo
echo "done."
