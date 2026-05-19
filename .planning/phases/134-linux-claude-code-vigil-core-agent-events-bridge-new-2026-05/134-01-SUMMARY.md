---
phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
plan: 01
subsystem: agent-events-bridge
tags: [bash, hook, claude-code, linux, agent-events, phase-121, fire-and-forget, tsx-test, node-test]

# Dependency graph
requires:
  - phase: 121-agent-events-foundation
    provides: POST /v1/agent-events strict-mode KNOWN_FIELDS contract + bearer auth shape
  - phase: 122-vigil-watch-core-daemon
    provides: label = basename(cwd) + host = hostname-s naming convention
provides:
  - vigil-linux-hooks/ mini-package scaffold (ESM, tsx --test wired, zero runtime deps)
  - vigil-agent-bridge.sh: 7-key Phase 121 body builder + fire-and-forget curl + auth gate + --event= dispatch scaffold
  - emit_event helper function with VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 test-capture escape hatch
  - 8 passing Wave-0 tests pinning T-134-A1 (info disclosure) + T-134-A2 (DoS) + T-134-I3 (injection) mitigations
affects: [134-02, 134-03, 134-04]

# Tech tracking
tech-stack:
  added:
    - "tsx ^4.19.0 (already in repo devDeps — reused for node:test execution)"
    - "@types/node ^22.0.0"
    - "typescript ^5.7.0"
    - "node:test (Node 22 built-in, no new dep)"
  patterns:
    - "ESM mini-package per top-level workspace (peer to vigil-core/, vigil-pwa/, vigil-g2-plugin/)"
    - "Bash hook + node -e JSON parse idiom (mirrors gsd-phase-boundary.sh:18-21)"
    - "process.env transport for shell-quote injection defense (body builder)"
    - "Belt-and-suspenders fire-and-forget: nohup curl ... </dev/null >/dev/null 2>&1 & disown"
    - "VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 test-capture escape hatch (production-private, test-load-bearing)"
    - "Source-grep T-134-A1 lint gate via node:test (sanctioned-paths allow-list: DEBUG guard, EMIT_ONLY guard, file-redirected printf, pipe-into-node-e)"

key-files:
  created:
    - "vigil-linux-hooks/package.json (mini-package manifest, ESM, tsx --test)"
    - "vigil-linux-hooks/tsconfig.json (ES2022 strict ESM)"
    - "vigil-linux-hooks/vigil-agent-bridge.sh (runtime hook, chmod 755)"
    - "vigil-linux-hooks/__tests__/fixtures/probe-envelope.json (canonical STDIN envelopes)"
    - "vigil-linux-hooks/__tests__/body-builder.test.ts (3 tests asserting KNOWN_FIELDS shape)"
    - "vigil-linux-hooks/__tests__/fail-safe.test.ts (5 tests asserting exit-0 + zero stderr)"
  modified: []

key-decisions:
  - "Chose Node node:test via tsx (NOT vitest) for the mini-package — mirrors vigil-core, no new dependency surface"
  - "EMIT_ONLY=1 escape hatch lives inside emit_event as an early-return BEFORE the curl invocation; printf '%s' to stdout. Test-capture contract is now locked for Plans 02-04"
  - "exit_code field deliberately NEVER sent — Phase 134 only emits heartbeat + task_complete; exit_code is task_failed-only per Phase 121 semantics"
  - "Empty session_id (parse failure / missing field) → silent exit 0 BEFORE emit_event runs (defense-in-depth — server would 400 anyway, but we fail fast and noiseless per AGENT-LINUX-04)"
  - "STDIN body builder skips message field when MESSAGE env var is empty (Phase 121 KNOWN_FIELDS allows message as optional; omitting the key entirely is cleaner than sending null)"

patterns-established:
  - "Pattern 134-A: bash hook with --event= flag dispatch + per-event case scaffold ready for Plan 02/03 extension"
  - "Pattern 134-B: emit_event signature is `emit_event <event_type> <message>` — Plans 02-03 call this with their per-event semantics (task_complete with custom message, UserPromptSubmit with redacted truncated prompt)"
  - "Pattern 134-C: source-grep T-134-A1 lint gate template — reusable for any future hook that must enforce zero-terminal-output invariant"

requirements-completed:
  - AGENT-LINUX-04

# Metrics
duration: ~12min
completed: 2026-05-19
---

# Phase 134 Plan 01: vigil-linux-hooks scaffold + auth/transport layer Summary

**Stood up the `vigil-linux-hooks/` Node ESM mini-package and the `vigil-agent-bridge.sh` runtime hook with auth-gate exit-0, fire-and-forget curl POST, --event= flag dispatch, and the 7-key Phase 121 KNOWN_FIELDS body builder — all 8 Wave-0 tests pass in <400ms.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-19T00:54Z
- **Completed:** 2026-05-19T01:08Z (approximate)
- **Tasks:** 2 / 2
- **Files modified:** 6 (5 created, 1 modified mid-task)

## Accomplishments

- AGENT-LINUX-04 fail-safe contract locked: silent exit 0 on missing API key, unreachable URL, malformed STDIN, missing envelope fields, and source-level zero-`echo`/`printf` gate.
- Phase 121 KNOWN_FIELDS strict-mode body contract pinned by `body-builder.test.ts` — the body builder produces exactly the 7 allowed keys (session_id, event, timestamp, label, host, client_event_id, optional message) with no overflow keys that would 400-reject server-side.
- Belt-and-suspenders T-134-A2 DoS mitigation in place: `nohup curl --max-time 2 ... </dev/null >/dev/null 2>&1 &` + `disown` makes the hook return in ~60ms wall time even against an unreachable URL.
- T-134-I3 command-injection defense: all operator-controlled values (`SESSION_ID`, `CWD`, `MESSAGE`) pass via `process.env` to `node -e` — never heredoc-interpolated. `basename "$CWD"` is the only point of shell-level expansion and it is bash-builtin (no path traversal).
- VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 escape hatch locked for downstream plans: when set, `emit_event` prints the JSON body to stdout and returns 0 before any network call. This is how Plans 02/03 will assert their per-event message shapes without network mocking.

## Task Commits

1. **Task 1: Wave 0 — scaffold mini-package + test fixtures** — `a28caf4` (test)
2. **Task 2: Create vigil-agent-bridge.sh with emit_event + dispatch scaffold** — `c726640` (feat)

## Files Created/Modified

- `vigil-linux-hooks/package.json` — ESM mini-package manifest; devDeps tsx ^4.19.0 / typescript ^5.7.0 / @types/node ^22.0.0; `npm test` → `tsx --test "__tests__/**/*.test.ts"`. Zero runtime dependencies.
- `vigil-linux-hooks/tsconfig.json` — ES2022 strict ESM, moduleResolution=bundler, node types.
- `vigil-linux-hooks/__tests__/fixtures/probe-envelope.json` — Canonical STDIN envelopes for the three Claude Code hook events. Same fixture shape consumed by both Wave-0 test files and by future Plan 02/03 per-event tests.
- `vigil-linux-hooks/vigil-agent-bridge.sh` (chmod 755) — Runtime hook. 9 sections: shebang/comments, D-A1 auth gate, D-N4 arg parse, D-I1 STDIN JSON parse, D-A5 missing-session-id safety net, D-A3 URL default, `emit_event` body builder + curl, event dispatch case, D-T2 debug log gate, D-A5 final exit 0. No `set -euo pipefail` (Pitfall 6).
- `vigil-linux-hooks/__tests__/body-builder.test.ts` — 3 tests via VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 capture path:
  1. Body has zero keys outside the 8-key KNOWN_FIELDS Set (strict-mode contract).
  2. SessionStart produces heartbeat event with all 6 required fields in correct shape (UUID v4, ISO-8601, basename=dailybrief, non-empty host).
  3. Missing VIGIL_API_KEY → no body and no stderr (D-A1 silent gate).
- `vigil-linux-hooks/__tests__/fail-safe.test.ts` — 5 tests + 1 source-grep lint:
  1. Missing API key → exit=0, zero stderr.
  2. Unreachable URL → exit=0, wall time <3s (fire-and-forget verified).
  3. Malformed JSON STDIN → exit=0, silent.
  4. Empty envelope `{}` → exit=0, silent.
  5. Source-grep T-134-A1: no unconditional `echo`/`printf` to terminal outside the two sanctioned guard blocks (DEBUG, EMIT_ONLY) or file-redirected targets (`>> /tmp/...`) or piped-into-node-e idioms.

## Decisions Made

- **EMIT_ONLY contract is implementation-private but test-load-bearing.** Plans 02-04 MUST honor the env-var-keyed escape hatch when extending `emit_event` semantics; do not rename or remove without updating both test files. The branch sits inside `emit_event` AFTER the body is built and BEFORE the curl invocation; this means tests get the FINAL body shape (including any conditional `message` field) exactly as production would have POSTed.
- **`emit_event` signature locked at `emit_event <event_type> [message]`.** Plan 02 calls `emit_event "heartbeat" "$REDACTED_PROMPT"` for UserPromptSubmit; Plan 03 calls `emit_event "task_complete" "turn complete"` for Stop. Current SessionStart/UserPromptSubmit/Stop branches are stubs that pass a placeholder message — Plans 02/03 replace those exact lines.
- **Skipping `message` key when MESSAGE env is empty.** The JSON-body builder uses `if (e.MESSAGE && e.MESSAGE.length > 0) obj.message = e.MESSAGE`, omitting the key entirely rather than emitting `message: ""`. Aligns with Phase 121's optional-field semantics (KNOWN_FIELDS membership is permissive; the validator only objects to UNKNOWN keys, not missing optional keys).
- **`set -euo pipefail` deliberately omitted.** Plan PATTERNS.md and RESEARCH.md Pitfall 6 both call this out: bash `[[ =~ ]]` returns 1 on no-match, which `set -e` treats as fatal. Plans 02/03 will use `[[ =~ ]]` for the WATCH-ENRICH-03 redaction regex; pre-emptively safe.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] T-134-A1 source-grep lint did not recognize EMIT_ONLY guard**

- **Found during:** Task 2 (test run after first hook commit)
- **Issue:** The Task 1 implementation of `__tests__/fail-safe.test.ts` line 5 (the source-grep gate) only knew about the `VIGIL_AGENT_BRIDGE_DEBUG=1` guard as a sanctioned `printf` path. The Task 2 hook script legitimately uses `printf '%s' "$body"` inside the `VIGIL_AGENT_BRIDGE_EMIT_ONLY=1` guard (the test-capture escape hatch). The lint test reported a false-positive violation on line 96 of the hook.
- **Fix:** Extended the lint test's guard-depth tracking to recognize BOTH `VIGIL_AGENT_BRIDGE_DEBUG` and `VIGIL_AGENT_BRIDGE_EMIT_ONLY` as sanctioned opt-in env-var guards. Also added a redirect-to-file exemption (`>>` or `>` followed by `/path`) so the `D-T2` debug-log line `printf ... >> /tmp/vigil-agent-bridge.log` is correctly classified as file-bound, not terminal-bound.
- **Files modified:** `vigil-linux-hooks/__tests__/fail-safe.test.ts` (lint guard logic)
- **Verification:** Re-ran `npm test` → 8/8 passing, all 5 fail-safe tests green including the source-grep gate.
- **Committed in:** `c726640` (folded into the Task 2 feat commit since it's a test-side fix tightly coupled to the hook's printf path)

## Phase 121 KNOWN_FIELDS Contract Verification

The body builder writes the body via `node -e` with this object shape (verbatim from `vigil-agent-bridge.sh:68-79`):

```javascript
{
  session_id: e.SESSION_ID,
  event:      e.EVENT,
  timestamp:  e.TS,
  label:      e.LABEL,
  host:       e.HOST,
  client_event_id: e.UUID,
  // message added conditionally when e.MESSAGE.length > 0
}
```

Cross-check against `vigil-core/src/routes/agent-events.ts:34-43`:

| KNOWN_FIELDS member | Phase 134 sends? | Notes |
| ------------------- | ---------------- | ----- |
| `session_id`        | Yes (required)   | From STDIN envelope `.session_id` |
| `event`             | Yes (required)   | "heartbeat" (SessionStart/UserPromptSubmit) or "task_complete" (Stop) |
| `message`           | Conditional      | Omitted when empty; included for static strings ("session started", etc.) |
| `timestamp`         | Yes (required)   | `date -Iseconds` ISO-8601 |
| `label`             | Yes (required)   | `basename "$CWD"` |
| `host`              | Yes (required)   | `$VIGIL_HOST_OVERRIDE` or `hostname -s` |
| `exit_code`         | NEVER            | Only meaningful for `task_failed` (not in Phase 134 scope) |
| `client_event_id`   | Yes (required)   | `uuidgen` or `/proc/sys/kernel/random/uuid` fallback |

Result: 6 required + 1 optional = at most 7 keys. Zero overflow keys. Server-side 400-reject surface area = 0.

## Threat Mitigations Verified

| Threat | Mitigation in this Plan | Verification |
| ------ | ----------------------- | ------------ |
| T-134-A1 (info disclosure via terminal output) | Source-grep gate in `fail-safe.test.ts` test 5 + `--silent` on curl + debug log goes to `/tmp/vigil-agent-bridge.log` only | 8/8 tests pass; `npm test` confirmed |
| T-134-A2 (DoS via curl blocking) | `nohup curl --max-time 2 ... </dev/null >/dev/null 2>&1 &` + `disown` | Unreachable-URL test confirms 62ms exit wall time (vs 2s `--max-time`) |
| T-134-I3 (command injection via STDIN content) | All values via `process.env` to `node -e`; never heredoc-interpolated. `basename "$CWD"` does not re-interpret. No `eval`. | Source review of `emit_event` lines 50-87 |

## Self-Check: PASSED

- `vigil-linux-hooks/package.json` — FOUND
- `vigil-linux-hooks/tsconfig.json` — FOUND
- `vigil-linux-hooks/vigil-agent-bridge.sh` — FOUND (executable)
- `vigil-linux-hooks/__tests__/fixtures/probe-envelope.json` — FOUND
- `vigil-linux-hooks/__tests__/body-builder.test.ts` — FOUND
- `vigil-linux-hooks/__tests__/fail-safe.test.ts` — FOUND
- Commit `a28caf4` (Task 1) — FOUND in git log
- Commit `c726640` (Task 2) — FOUND in git log
- Test run: 8/8 passing in 313ms (verified post-Task-2 commit)

## Hand-off Notes for Plans 02-04

- **Plan 02 (UserPromptSubmit + redaction):** Replace the `UserPromptSubmit)` case branch stub at `vigil-agent-bridge.sh:111` with the real flow: source `redact.sh`, call `redact_prompt "$PROMPT"`, then `emit_event "heartbeat" "$REDACTED"`. The current stub passes "prompt submitted" as message — overwrite that line.
- **Plan 03 (Stop → task_complete):** The current `Stop)` branch already calls `emit_event "task_complete" "turn complete"` — this may be sufficient. If Plan 03 spec calls for a different message string (e.g., dynamic content), only that one line changes.
- **Plan 04 (installer + settings.json splice + README):** No hook changes; install.js needs to copy `vigil-agent-bridge.sh` to `~/.claude/hooks/` and write three matcher-group entries with `bash <path> --event=<X>` commands. The splice MUST include `"async": true` + `"timeout": 5` per Phase 134 D-N3/RESEARCH §Pitfall 1.
- **No discrepancy found between PATTERNS.md and implementation** — the canonical body-builder snippet at PATTERNS.md lines 63-95 transferred verbatim into `vigil-agent-bridge.sh` lines 50-87. The only addition was the EMIT_ONLY=1 early-return branch (lines 88-94), which is implementation-private to this plan.
