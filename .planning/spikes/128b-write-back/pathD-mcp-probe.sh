#!/usr/bin/env bash
# PHASE 128b SPIKE — TOSSABLE. Phase 133 owns G2-REPLY productionization;
# this file is spike-only and SHOULD BE DELETED after the verdict is committed.
# Path D: MCP server hook — Claude-pulls model via fresh -p subprocess
set -euo pipefail

EVIDENCE_DIR="$(pwd)/.planning/spikes/128b-write-back/evidence"
mkdir -p "$EVIDENCE_DIR"
SCRATCH=$(mktemp -d -t spike-128b-D-XXXXXX)
SERVER_PATH="$(pwd)/.planning/spikes/128b-write-back/pathD-mcp-server.mjs"
trap 'rm -rf "$SCRATCH"' EXIT

# Per CONTEXT D-A1: ad-hoc npx fetch must NEVER mutate any project package.json.
# Per CONTEXT D-A2: NO production reply-allowlist constant — Phase 133 G2-REPLY-04 scope.
# Per Pitfall 3: NO claude minimal-auth flag — operator's Claude Max OAuth handles auth
#                (the dash-dash-bare flag strips OAuth/keychain; we don't use it here).
# Per CONTEXT D-G1: variables use descriptive non-blocked names (no TOKEN/AUTH/SECRET/BEARER/APIKEY).
# Forbidden-token paraphrase: per Plan 02 pattern, the literal verification-grep targets
#   (the production reply-allowlist constant name and the claude minimal-auth flag) are
#   paraphrased in these comments so the verifier-grep that bans those literal strings
#   from script bodies has zero false-positives on docs.

# ----- SDK availability check (best-effort with fallback per RESEARCH §Environment Availability) -----
# DEVIATION FROM PLAN (Rule 3 — Blocking, auto-fix #2 + #4):
#   #2 — The plan specified `npm exec --yes --package=@modelcontextprotocol/sdk -- node -e ...`
#   for ad-hoc SDK fetch. Empirical run 2026-05-14 showed this DOES install the package
#   into ~/.npm/_npx/<hash>/node_modules but does NOT add that path to Node's module
#   resolution search for arbitrary `node -e` invocations.
#   #4 — Subsequently discovered that Node's ESM resolver does NOT honor NODE_PATH for
#   bare-specifier package imports (it walks up from the importing module's directory
#   looking for node_modules/<pkg>/package.json with an `exports` map). So even setting
#   NODE_PATH on the spawned MCP server's env doesn't help if the .mjs is sitting in the
#   project tree.
#   Fix: install the SDK into $SCRATCH/sdk-install (mktemp dir, D-A1-isolated — no project
#   package.json is mutated, dir wipes on EXIT trap), then COPY the MCP server stub into
#   that same scratch dir. Node's parent-walk module resolution then finds the SDK in
#   $SCRATCH/sdk-install/node_modules/. Final mcp-config points at the COPIED .mjs.
SDK_INSTALL_DIR="$SCRATCH/sdk-install"
mkdir -p "$SDK_INSTALL_DIR"
echo "[Path D] checking @modelcontextprotocol/sdk availability"
SDK_AVAILABLE=0
SDK_MODE="unknown"
EFFECTIVE_SERVER_PATH="$SERVER_PATH"
if node -e "import('@modelcontextprotocol/sdk/server/index.js').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
  SDK_AVAILABLE=1
  SDK_MODE="globally-resolvable (no install needed)"
  echo "[Path D] SDK already resolvable via node — no scratch install needed"
else
  echo "[Path D] SDK not globally resolvable; attempting ad-hoc install into \$SCRATCH"
  # Hard 5-minute cap to avoid 60-min wallclock blowout per RESEARCH bail
  ( cd "$SDK_INSTALL_DIR" && \
    npm init -y >/dev/null 2>&1 && \
    timeout 300 npm install --no-save --no-audit --no-fund @modelcontextprotocol/sdk 2>"$EVIDENCE_DIR/pathD-sdk-install-err.txt" ) || true
  # Copy the MCP server stub INTO the install dir so Node's parent-walk finds the SDK.
  cp "$SERVER_PATH" "$SDK_INSTALL_DIR/pathD-mcp-server.mjs"
  EFFECTIVE_SERVER_PATH="$SDK_INSTALL_DIR/pathD-mcp-server.mjs"
  # Verify by parse-loading the copied stub (it will block on stdio handshake; we just
  # check that the import statements don't throw — a 2s timeout + grep for the specific
  # import-error message tells us yes/no).
  IMPORT_PROBE_OUT=$(timeout 2 node "$EFFECTIVE_SERVER_PATH" </dev/null 2>&1 || true)
  if echo "$IMPORT_PROBE_OUT" | grep -qE "ERR_MODULE_NOT_FOUND|Cannot find package"; then
    SDK_AVAILABLE=0
    SDK_MODE="UNAVAILABLE — see pathD-sdk-install-err.txt"
    echo "$IMPORT_PROBE_OUT" >> "$EVIDENCE_DIR/pathD-sdk-install-err.txt"
  else
    # No import error within the 2s timeout window ⇒ stdio is waiting for handshake ⇒ imports succeeded
    SDK_AVAILABLE=1
    SDK_MODE="scratch-installed (ad-hoc; stub copied to $SDK_INSTALL_DIR/pathD-mcp-server.mjs)"
  fi
fi
echo "[Path D] SDK_AVAILABLE=$SDK_AVAILABLE  SDK_MODE=$SDK_MODE"
echo "[Path D] EFFECTIVE_SERVER_PATH=$EFFECTIVE_SERVER_PATH"

# ----- Build mcp-config.json (committed to evidence/ for reproducibility) -----
# args points at EFFECTIVE_SERVER_PATH — either the original .mjs at the spike dir (when
# SDK is globally resolvable) or the COPIED .mjs inside $SCRATCH/sdk-install (when scratch
# installed; Node's parent-walk then finds the ad-hoc node_modules).
cat > "$EVIDENCE_DIR/pathD-mcp-config.json" <<EOF
{
  "mcpServers": {
    "vigil-spike": {
      "command": "node",
      "args": ["$EFFECTIVE_SERVER_PATH"],
      "env": {"VIGIL_BUFFERED_REPLY": "VIGIL-SPIKE-OK-1337"}
    }
  }
}
EOF
echo "[Path D] mcp-config written to $EVIDENCE_DIR/pathD-mcp-config.json"

# ----- Probe — conditional on SDK_AVAILABLE -----
# With the scratch-install fix, the MCP server resolves the SDK via NODE_PATH set in
# mcp-config's env block — claude itself does NOT need to import the SDK, only the spawned
# child server does. So a single invocation works for both globally-resolvable and
# scratch-installed paths.
FRESH_PASS=0
if [ "$SDK_AVAILABLE" -eq 1 ]; then
  echo "[Path D] running claude -p with --mcp-config (fresh session)"
  timeout 120 claude -p \
    --mcp-config "$EVIDENCE_DIR/pathD-mcp-config.json" \
    --strict-mcp-config \
    --allowedTools "mcp__vigil-spike__vigil_external_reply" \
    --model haiku \
    "Use the vigil_external_reply tool and print exactly what it returned." \
    > "$EVIDENCE_DIR/pathD-fresh-out.txt" 2>&1 || true

  # Sentinel: the buffered reply is the computed token VIGIL-SPIKE-OK-1337 (set via env
  # in mcp-config). DEVIATION FROM PLAN (Rule 1 — Bug, auto-fix #5):
  #   The plan specified the buffered reply "yes" + a compound grep for
  #   `\byes\b AND vigil_external_reply|vigil-spike`. The empirical run 2026-05-14
  #   showed that `claude -p --output-format` (the default text-only print mode) emits
  #   ONLY the model's final text response — no tool-invocation markers leak into stdout
  #   even when the tool DID fire. This made the compound check unsatisfiable on success.
  #   Fix: use Pitfall-1-style computed sentinel (a token that cannot appear in the
  #   prompt text by accident). The spike's empirical question is "does the buffered
  #   string round-trip from the MCP server through Claude's reply?" — the distinctive
  #   token surfacing in stdout IS the proof. Plan 01's 1337 sentinel pattern.
  if grep -q 'VIGIL-SPIKE-OK-1337' "$EVIDENCE_DIR/pathD-fresh-out.txt"; then
    FRESH_PASS=1
    echo "[Path D] fresh-session: distinctive sentinel VIGIL-SPIKE-OK-1337 present in stdout ⇒ step 3 ✓"
  else
    FRESH_PASS=0
    echo "[Path D] fresh-session: distinctive sentinel missing ⇒ step 3 ✗"
  fi
else
  echo "[Path D] SKIPPING empirical probe — SDK unavailable; falling back to analytical-only"
fi

# ----- Mechanical TRANSCRIPT heredoc -----
MINI_VERDICT=""
if [ "$SDK_AVAILABLE" -eq 1 ] && [ "$FRESH_PASS" -eq 1 ]; then
  MINI_VERDICT="DEGRADE (inverted model — fresh-session-only via prompted tool-call)"
elif [ "$SDK_AVAILABLE" -eq 1 ] && [ "$FRESH_PASS" -eq 0 ]; then
  MINI_VERDICT="FAIL (fresh-session tool-call did not complete the round-trip)"
else
  MINI_VERDICT="INCONCLUSIVE — SDK unavailable; covered by RESEARCH §'Path D' analytical-only treatment"
fi

# Compute step row markers ahead of heredoc to keep the heredoc free of nested $() chains
if [ "$SDK_AVAILABLE" -eq 1 ]; then
  STEP1_VERDICT="✓ (env VIGIL_BUFFERED_REPLY=VIGIL-SPIKE-OK-1337 set by probe; server reads from env)"
  STEP2_VERDICT="✓ if step 3 ✓ (tool-result is the input channel from MCP server → Claude)"
  if [ "$FRESH_PASS" -eq 1 ]; then
    STEP3_VERDICT="✓ (distinctive sentinel VIGIL-SPIKE-OK-1337 present in stdout — see pathD-fresh-out.txt)"
  else
    STEP3_VERDICT="✗ (distinctive sentinel missing in stdout — see pathD-fresh-out.txt)"
  fi
else
  STEP1_VERDICT="N/A (SDK unavailable)"
  STEP2_VERDICT="N/A"
  STEP3_VERDICT="N/A"
fi

CLAUDE_VER=$(claude --version 2>/dev/null || echo unknown)
RUN_TS=$(date -Iseconds)

cat > "$EVIDENCE_DIR/pathD-TRANSCRIPT.md" <<EOF
# Path D — Per-Path D-V1 Mini-Verdict

Probe run: $RUN_TS
Script: .planning/spikes/128b-write-back/pathD-mcp-probe.sh
MCP server: .planning/spikes/128b-write-back/pathD-mcp-server.mjs
claude version: $CLAUDE_VER
SDK availability: $SDK_AVAILABLE ($SDK_MODE)

## D-V1 Four-Step Gate (Fresh Session, Claude-pulls model)

| Step | Description | Verdict |
|------|-------------|---------|
| 1    | Reply originates from non-TTY writer | $STEP1_VERDICT |
| 2    | String reaches input channel | $STEP2_VERDICT |
| 3    | Claude processes as next user turn | $STEP3_VERDICT |
| 4    | Session continues healthy ≥60s | N/A (claude -p exits after single response — by design) |

## D-V1 Four-Step Gate (Active Session)

| Step | Description | Verdict |
|------|-------------|---------|
| 1    | Reply originates from non-TTY writer | ✓ (server emits a tool result) |
| 2    | String reaches input channel | ✗ STRUCTURAL — MCP tools are tools Claude CALLS, not channels that PUSH to Claude. Vigil cannot force a tool call mid-turn from outside the process. |
| 3    | Claude processes as next user turn | ✗ vacuous (no input received) |
| 4    | Session continues healthy ≥60s | ✗ vacuous |

## Mini-Verdict

**$MINI_VERDICT**

Per CONTEXT line 222 (Deferred Idea — "MCP server-as-prompter UX"):
The interesting v3.10+ variant is "Claude pulls from a \`vigil_check_external_reply\` tool when it's about to ask the operator" — but that requires Claude to be prompt-conditioned to call the tool before every \`needs_input\`, which is NOT the round-trip the spike is testing.

## Evidence

- \`pathD-mcp-config.json\` — the mcp-config wiring the server stub to claude -p
- \`pathD-fresh-out.txt\` — raw stdout from \`claude -p --mcp-config ...\` (full transcript including tool invocations)
- \`pathD-mcp-server.mjs\` — the ~30 LOC stdio MCP server stub
- \`pathD-sdk-install-err.txt\` — stderr from npx attempt (only present if SDK fetch failed)

## Cited

- CONTEXT D-O1 path (d) — "MCP tools are tools Claude CALLS, not channels that PUSH to Claude. The injection model is inverted."
- CONTEXT line 222 — Deferred MCP-as-prompter UX for v3.10+
- RESEARCH §"Path D" — predicted DEGRADE (inverted model)
- RESEARCH §"Environment Availability" — INCONCLUSIVE fallback if SDK fetch fails
EOF
echo "[Path D] transcript written: $EVIDENCE_DIR/pathD-TRANSCRIPT.md"

exit 0
