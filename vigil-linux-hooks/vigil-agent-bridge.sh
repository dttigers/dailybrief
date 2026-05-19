#!/usr/bin/env bash
# vigil-hook-version: 0.1.0
# vigil-agent-bridge.sh — SessionStart/UserPromptSubmit/Stop hook for vigil-core
# Posts one /v1/agent-events event per Claude Code hook invocation. Fire-and-forget.
#
# DO NOT add `set -euo pipefail`. Bash `[[ =~ ]]` returns non-zero on no-match,
# which `set -e` treats as fatal — Phase 134 RESEARCH Pitfall 6.
#
# Phase 121 KNOWN_FIELDS contract (vigil-core/src/routes/agent-events.ts:34-43):
#   session_id, event, message, timestamp, label, host, exit_code, client_event_id
# Phase 134 sends exactly 7 of these (never exit_code).
#
# Threat mitigations:
#   T-134-A1 (info disclosure) — zero unconditional echo/printf to terminal
#   T-134-A2 (DoS) — nohup curl ... </dev/null >/dev/null 2>&1 & disown
#   T-134-I3 (command injection) — all user values via process.env to node -e

# ── D-A1: Auth-gate early-exit — silent no-op when VIGIL_API_KEY unset/empty ──
[ -z "${VIGIL_API_KEY:-}" ] && exit 0

# ── D-R1..D-R3: Source the sourceable redactor (provides redact_prompt) ───────
# Placed AFTER the auth gate so the source doesn't run on the silent-no-op path
# but BEFORE case dispatch so UserPromptSubmit can call redact_prompt directly.
# patterns loaded from: redaction-patterns.json  (Rail 2 drift-detector pin)
source "$(dirname "$0")/redact.sh"

# ── D-N4: Argument parse (--event=<X> flag) ───────────────────────────────────
EVENT_TYPE="${1#--event=}"
case "$EVENT_TYPE" in
  SessionStart|UserPromptSubmit|Stop) ;;
  *) exit 0 ;;
esac

# ── D-I1 / RESEARCH Pattern 1: STDIN JSON envelope parse ──────────────────────
# Read STDIN once, then extract fields via node -e (3 invocations).
# All node -e calls are silenced (2>/dev/null) and use try/catch internally so
# malformed JSON or missing fields produce empty strings rather than errors.
INPUT=$(cat)
SESSION_ID=$(printf '%s' "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch{}})" 2>/dev/null)
CWD=$(printf '%s' "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).cwd||'')}catch{}})" 2>/dev/null)
PROMPT=""
if [ "$EVENT_TYPE" = "UserPromptSubmit" ]; then
  PROMPT=$(printf '%s' "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).prompt||'')}catch{}})" 2>/dev/null)
fi

# ── D-A5 safety net: missing session_id → exit 0 silently ─────────────────────
# Server requires session_id; without it we cannot build a valid body and the
# POST would 400 anyway. Fail silent per AGENT-LINUX-04.
[ -z "$SESSION_ID" ] && exit 0

# ── D-A3: VIGIL_API_URL default ───────────────────────────────────────────────
VIGIL_API_URL="${VIGIL_API_URL:-https://api.vigilhub.io}"

# ── Body builder + fire-and-forget POST (RESEARCH Pattern Assignment 1) ───────
# All operator-controlled values (SESSION_ID, MESSAGE, LABEL, etc.) pass via
# process.env to node -e — never heredoc-interpolated. Defeats T-134-I3.
emit_event() {
  local event="$1"
  local message="${2:-}"
  local ts
  ts="$(date -Iseconds 2>/dev/null)"
  local uuid
  uuid="$(command -v uuidgen >/dev/null && uuidgen || cat /proc/sys/kernel/random/uuid 2>/dev/null)"
  local label
  if [ -n "$CWD" ]; then
    label="$(basename "$CWD" 2>/dev/null)"
  else
    label=""
  fi
  local host
  host="${VIGIL_HOST_OVERRIDE:-$(hostname -s 2>/dev/null)}"

  # If any required field is empty, abort silently (no POST, no error).
  if [ -z "$ts" ] || [ -z "$uuid" ] || [ -z "$label" ] || [ -z "$host" ]; then
    return 0
  fi

  local body
  body=$(SESSION_ID="$SESSION_ID" EVENT="$event" TS="$ts" UUID="$uuid" \
         LABEL="$label" HOST="$host" MESSAGE="$message" \
    node -e '
      const e = process.env;
      const obj = {
        session_id: e.SESSION_ID,
        event: e.EVENT,
        timestamp: e.TS,
        label: e.LABEL,
        host: e.HOST,
        client_event_id: e.UUID,
      };
      if (e.MESSAGE && e.MESSAGE.length > 0) obj.message = e.MESSAGE;
      process.stdout.write(JSON.stringify(obj));
    ' 2>/dev/null) || return 0

  [ -z "$body" ] && return 0

  # ── Emit-only escape hatch (test capture path, D-implementation-private) ──
  # When VIGIL_AGENT_BRIDGE_EMIT_ONLY=1, print the body to stdout and return
  # before any network call. body-builder.test.ts relies on this hook to
  # capture the JSON without making network requests.
  if [ "${VIGIL_AGENT_BRIDGE_EMIT_ONLY:-0}" = "1" ]; then
    printf '%s' "$body"
    return 0
  fi

  # ── T-134-A2 / RESEARCH Pattern 4: fire-and-forget curl ──────────────────
  # Belt-and-suspenders against Claude Code v2.1.87+ stdio inheritance bug
  # (anthropics/claude-code#43123): nohup + full stdio redirect + disown.
  nohup curl \
    --max-time 2 --silent --output /dev/null --fail \
    --header "Authorization: Bearer $VIGIL_API_KEY" \
    --header "Content-Type: application/json" \
    --data "$body" \
    "$VIGIL_API_URL/v1/agent-events" \
    </dev/null >/dev/null 2>&1 &
  disown
}

# ── Event dispatch scaffold (Plans 02-03 replace stub bodies with real semantics) ──
case "$EVENT_TYPE" in
  SessionStart)
    emit_event "heartbeat" "session started"
    ;;
  UserPromptSubmit)
    # AGENT-LINUX-03: redact then emit. redact_prompt truncates to <=80 chars
    # FIRST and then regex-matches the truncated slice (CONTEXT D-R2 ordering).
    # Any denylist match -> "[redacted: contains sensitive pattern]" literal;
    # clean prompts pass through as the truncated content. Empty prompts emit
    # a bare heartbeat with no message key (per emit_event's empty-arg behavior).
    if [ -n "$PROMPT" ]; then
      REDACTED="$(redact_prompt "$PROMPT")"
      emit_event "heartbeat" "$REDACTED"
    else
      emit_event "heartbeat"
    fi
    ;;
  Stop)
    emit_event "task_complete" "turn complete"
    ;;
esac

# ── D-T2: optional debug log gated on VIGIL_AGENT_BRIDGE_DEBUG=1 ──────────────
# Writes ONE line to /tmp/vigil-agent-bridge.log; NEVER to stderr/stdout.
# Never logs $VIGIL_API_KEY (T-134-A1).
if [ "${VIGIL_AGENT_BRIDGE_DEBUG:-0}" = "1" ]; then
  printf '%s %s %s\n' "$(date -Iseconds)" "$EVENT_TYPE" "$SESSION_ID" >> /tmp/vigil-agent-bridge.log 2>/dev/null
fi

# ── D-A5: unconditional exit 0 ────────────────────────────────────────────────
exit 0
