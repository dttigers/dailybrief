---
phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
plan: 02
subsystem: agent-events-bridge
tags: [bash, hook, claude-code, linux, agent-events, phase-121, node-test, tsx-test, session-bookends]

# Dependency graph
requires:
  - phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
    plan: 01
    provides: "emit_event helper, --event= dispatch scaffold, VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 test-capture escape hatch, 8/8 Wave-0 tests"
  - phase: 121-agent-events-foundation
    provides: "POST /v1/agent-events strict-mode KNOWN_FIELDS contract + VALID_EVENTS enum (heartbeat, task_complete)"
provides:
  - "Wired SessionStart → heartbeat / 'session started' (AGENT-LINUX-01) — pinned by Stop-probe-class test in body-builder.test.ts"
  - "Wired Stop → task_complete / 'turn complete' (AGENT-LINUX-02) — pinned by Stop-probe test in body-builder.test.ts"
  - "body-builder.test.ts now covers 5 it-blocks: KNOWN_FIELDS-only, SessionStart-heartbeat shape (Plan 01), missing-API-key gate (Plan 01), SessionStart probe (Plan 02), Stop probe (Plan 02)"
  - "10/10 tests across body-builder.test.ts + fail-safe.test.ts passing in ~525ms — Plan 01 fail-safe invariants intact"
affects: [134-03, 134-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-event probe assertion (event-literal + message-literal + KNOWN_FIELDS-membership + cwd-not-present regression) — template for Plan 03 UserPromptSubmit probe"

key-files:
  created: []
  modified:
    - "vigil-linux-hooks/__tests__/body-builder.test.ts (+99 lines — added SessionStart probe + Stop probe it-blocks inside the existing AGENT-LINUX-01/02 describe block)"

key-decisions:
  - "Plan 02 Task 1 (case-branch wiring) was already implemented by Plan 01 Task 2 — Plan 01 went beyond the strict Wave-0 scope and pre-wired both SessionStart and Stop branches with their final messages. Plan 02 therefore had zero hook source changes; the work consisted solely of locking the contract via the two new probe tests."
  - "Added explicit `cwd MUST NOT appear in body` regression guard (D-P3) on both new tests. Phase 121 strict mode rejects unknown keys with HTTP 400; this guard catches any future regression that accidentally adds cwd to the body builder."
  - "Reused the existing `captureBody()` helper unchanged — its `VIGIL_AGENT_BRIDGE_EMIT_ONLY=1` capture path is the locked-in test idiom for body-shape assertions (per Plan 01 hand-off note)."

patterns-established:
  - "Pattern 134-D: per-event probe test = (event-literal assert + message-literal assert + KNOWN_FIELDS-membership loop + cwd-not-present hasOwnProperty assert). Plan 03 mirrors this for UserPromptSubmit with the redacted-prompt message assertion replacing the static-literal check."

requirements-completed:
  - AGENT-LINUX-01
  - AGENT-LINUX-02

# Metrics
duration: ~3min
completed: 2026-05-19
---

# Phase 134 Plan 02: SessionStart heartbeat + Stop task_complete wiring Summary

**Locked AGENT-LINUX-01 (SessionStart → heartbeat / "session started") and AGENT-LINUX-02 (Stop → task_complete / "turn complete") via two new probe tests in body-builder.test.ts — the hook source already had the wiring from Plan 01; this plan pinned the contract.**

## Performance

- **Duration:** ~3 min (vs. ~12 min for Plan 01 — pure test-side work, no shell scripting)
- **Started:** 2026-05-19T01:04Z
- **Completed:** 2026-05-19T01:07Z (approximate)
- **Tasks:** 2 / 2
- **Files modified:** 1 (`body-builder.test.ts`, +99 lines)

## Accomplishments

- AGENT-LINUX-01 contract pinned: SessionStart probe test asserts `body.event === "heartbeat"`, `body.message === "session started"`, `body.session_id === "abc12345-0000-4000-8000-000000000001"` (verbatim mirror of the fixture's session_id), `body.label === "dailybrief"` (basename of the fixture's `cwd` field).
- AGENT-LINUX-02 contract pinned: Stop probe test asserts `body.event === "task_complete"`, `body.message === "turn complete"`, `client_event_id` matches the UUID-v4 lowercase-hex shape `/^[0-9a-f-]{36}$/`.
- Both new tests carry the D-P3 regression guard `assert.equal(Object.prototype.hasOwnProperty.call(body, "cwd"), false)` — any future change to the body builder that accidentally adds `cwd` (or any other unknown key) would 400-reject server-side under Phase 121 strict mode; this guard catches it pre-network.
- Both new tests re-assert the full KNOWN_FIELDS-membership loop against the canonical 8-key list (`session_id, event, message, timestamp, label, host, exit_code, client_event_id`) — defense-in-depth against the same unknown-field regression class.
- Full suite green: `npm test` exits 0 with 10/10 tests passing in ~525ms (5 body-builder + 5 fail-safe). Plan 01's 5 fail-safe invariants (missing API key silent, unreachable URL <3s, malformed STDIN silent, empty envelope silent, T-134-A1 source-grep gate) remain intact.

## Task Commits

1. **Task 1: Wire SessionStart and Stop case branches in vigil-agent-bridge.sh** — *no commit (no source changes)*. Plan 01's `c726640` (feat) already implemented both case branches with the final per-event message literals. Verified via `grep -c 'emit_event[[:space:]]\+"heartbeat"[[:space:]]\+"session started"'` = 1 and `grep -c 'emit_event[[:space:]]\+"task_complete"[[:space:]]\+"turn complete"'` = 1, plus behavioral capture confirming the emitted body shape.
2. **Task 2: Extend body-builder.test.ts with SessionStart and Stop shape assertions** — `63125d0` (test)

## Sample Bodies Observed in Tests

### SessionStart → heartbeat

```json
{
  "session_id": "abc12345-0000-4000-8000-000000000001",
  "event": "heartbeat",
  "timestamp": "2026-05-19T01:06:17+00:00",
  "label": "dailybrief",
  "host": "morrillhouse",
  "client_event_id": "13606db7-238a-49b8-852b-ffa0a32bb352",
  "message": "session started"
}
```

7 keys (the 6 always-present + optional `message`), all members of Phase 121 KNOWN_FIELDS. Zero overflow keys → zero server-side 400 surface.

### Stop → task_complete

```json
{
  "session_id": "abc12345-0000-4000-8000-000000000003",
  "event": "task_complete",
  "timestamp": "2026-05-19T01:06:17+00:00",
  "label": "dailybrief",
  "host": "morrillhouse",
  "client_event_id": "e3f906ca-b9a3-4798-a338-738ea4ab34fa",
  "message": "turn complete"
}
```

Same 7-key shape, `event` and `message` flipped to the task_complete pair per AGENT-LINUX-02. `session_id` reflects the Stop slice of the probe envelope (`abc12345-...-000000000003`, distinct from SessionStart's `...000000000001`) — confirms the STDIN-envelope parsing is per-event and not cached/shared.

## ROADMAP Intent Verification

| ROADMAP wording | Plan 02 implementation | Match? |
| --------------- | --------------------- | ------ |
| SessionStart "becomes a `heartbeat` event with `message: 'session started'`" | `case SessionStart) emit_event "heartbeat" "session started" ;;` | YES — string-literal match |
| "Each finished assistant turn creates one `task_complete` event" | `case Stop) emit_event "task_complete" "turn complete" ;;` | YES — Stop hook fires per turn per D-I2, one event per invocation |
| "label = basename(cwd)" | `basename "$CWD"` inside emit_event → `body.label = "dailybrief"` | YES — pinned by SessionStart probe |
| Phase 121 KNOWN_FIELDS strict shape | 7 keys, all members of the 8-key Set, never `exit_code` | YES — KNOWN_FIELDS membership loop in both new tests |

## Decisions Made

- **Task 1 was a no-op in source terms because Plan 01 already over-delivered.** Plan 01's `c726640` commit landed `emit_event "heartbeat" "session started"` and `emit_event "task_complete" "turn complete"` in the case dispatch — these were marked as "stubs" in Plan 01's plan body but in fact match the final Plan 02 spec verbatim. Plan 02 therefore consists solely of the test-side contract pin. This is intentional and noted in Plan 01's hand-off-notes section: "The current `Stop)` branch already calls `emit_event 'task_complete' 'turn complete'` — this may be sufficient. If Plan 03 spec calls for a different message string (e.g., dynamic content), only that one line changes." Plan 03 will be similarly evaluated — the UserPromptSubmit branch currently has a placeholder `"prompt submitted"` message that Plan 03 will replace with the redacted-prompt content.
- **`cwd` is the load-bearing regression guard.** Phase 121 KNOWN_FIELDS strictly rejects unknown keys, but it's easy to accidentally add `cwd` to a body builder under the (false) intuition that "the server might want it." The explicit `hasOwnProperty(body, "cwd") === false` assert in both new tests catches that class of mistake even when the broader KNOWN_FIELDS loop might miss it (e.g., if a developer mistakenly broadens KNOWN_FIELDS rather than removing the field).

## Deviations from Plan

### Task 1 No-Op (not a deviation in result; deviation in interpretation)

**[Rule observation] Plan 01 pre-implemented the Task 1 source changes.**

- **Found during:** Initial Task 1 verification (grep counts already 1/1 + behavioral capture confirmed correct body shape)
- **Issue:** Plan 02 Task 1 instructs editing the `SessionStart)` and `Stop)` case branches to call `emit_event "heartbeat" "session started"` / `emit_event "task_complete" "turn complete"`. Inspection of `vigil-agent-bridge.sh` (lines 114-125) shows Plan 01 Task 2 already committed these exact lines.
- **Action taken:** Treated Task 1 as a verification-only pass (acceptance criteria all met against the existing source). No commit for Task 1 since there are zero file modifications to attribute. All Plan 02 acceptance criteria for Task 1 are met:
  - `grep -c 'emit_event[[:space:]]\+"heartbeat"[[:space:]]\+"session started"' vigil-linux-hooks/vigil-agent-bridge.sh` → 1
  - `grep -c 'emit_event[[:space:]]\+"task_complete"[[:space:]]\+"turn complete"' vigil-linux-hooks/vigil-agent-bridge.sh` → 1
  - `bash -n vigil-linux-hooks/vigil-agent-bridge.sh` → exit 0
  - Behavioral capture (`VIGIL_API_KEY=vk_test VIGIL_AGENT_BRIDGE_EMIT_ONLY=1`) confirms both branches emit the expected body shape.
  - Fail-safe regression (`VIGIL_API_KEY=""` → `exit=0` silent) confirmed.
- **Files modified:** None (Task 1 was a verification pass against existing Plan 01 work).
- **Committed in:** N/A — folded into Plan 01's `c726640`.

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues encountered during the test-side work.

## Phase 121 KNOWN_FIELDS Contract Verification

Both new probe tests assert KNOWN_FIELDS membership via the explicit allow-list:

```typescript
const KNOWN_FIELDS_LIST = [
  "session_id", "event", "message", "timestamp",
  "label", "host", "exit_code", "client_event_id",
];
for (const k of Object.keys(body)) {
  assert.ok(KNOWN_FIELDS_LIST.includes(k), `unknown field "${k}" would 400-reject ...`);
}
```

This is the canonical 8-key Set lifted verbatim from `vigil-core/src/routes/agent-events.ts:34-43`. Phase 134 sends exactly 7 (never `exit_code` — that field is `task_failed`-only per Phase 121 semantics). The combined `KNOWN_FIELDS-membership loop + hasOwnProperty(cwd) === false` assertion gives belt-and-suspenders coverage against any future change that introduces an unknown key.

## Threat Mitigations Verified

| Threat | Mitigation in this Plan | Verification |
| ------ | ----------------------- | ------------ |
| T-134-I3 (command injection via crafted cwd) | SessionStart + Stop messages are static literals — no operator-influenced data flows into the body for these paths. `$CWD` is consumed by `basename "$CWD"` and passed via `process.env` to `node -e` (never heredoc-interpolated). | Source review of `case` dispatch + emit_event lines 51-87 (unchanged from Plan 01); 10/10 tests pass |
| T-134-A1 (info disclosure) | Plan 01's source-grep lint gate is unchanged; new test code lives outside the hook script (no impact on the lint). | `fail-safe.test.ts` test 5 still passes (`hook source contains zero unconditional echo/printf to terminal`) |
| Phase 121 strict-mode 400-reject (D-P3) | New tests carry explicit `hasOwnProperty(body, "cwd") === false` assertion + KNOWN_FIELDS-membership loop on every body emitted from SessionStart + Stop. | Both new tests pass; full suite 10/10 green |

## Self-Check: PASSED

- `vigil-linux-hooks/__tests__/body-builder.test.ts` — FOUND (now has 5 it-blocks per Task 2 done criteria)
- `vigil-linux-hooks/vigil-agent-bridge.sh` — FOUND (Plan 01's case dispatch unchanged this plan)
- Commit `63125d0` (Task 2 test additions) — FOUND in git log
- Test run: 10/10 passing in 525ms (verified post-Task-2 commit)
- Source-grep acceptance: `grep -c 'SessionStart probe'` = 1, `grep -c 'Stop probe'` = 1, `grep -c '"task_complete"'` = 2, `grep -c '"dailybrief"'` = 2 (all >= the plan's >=1 thresholds)
- Behavioral acceptance: both per-event JSON bodies captured above match expected shapes byte-for-byte (modulo timestamp + UUID variance, both non-deterministic by design)

## Hand-off Notes for Plan 03

- **UserPromptSubmit case branch is the last unwired path.** Lines 118-122 of `vigil-agent-bridge.sh` currently call `emit_event "heartbeat" "prompt submitted"` as the Wave-1 placeholder. Plan 03 replaces the message literal with the redacted+truncated prompt (per D-R2/D-R3): source `redact.sh`, call `redact_prompt "$PROMPT"`, then `emit_event "heartbeat" "$REDACTED"`.
- **Probe test template is locked.** Plan 03 should add a third probe it-block to `body-builder.test.ts` modeled on the two added here: assert `body.event === "heartbeat"`, assert `body.message` against a redacted-prompt fixture, KNOWN_FIELDS-membership loop, `hasOwnProperty(body, "cwd") === false`. The fixture's UserPromptSubmit slice already contains `"prompt": "help me refactor this function"` — a clean prompt that should pass through truncation unredacted.
- **Plan 04 installer/uninstaller is untouched** — no signature changes from Plan 02. The installer just copies `vigil-agent-bridge.sh` to `~/.claude/hooks/`; the script's behavior is fully defined by the 3 case branches it dispatches.
