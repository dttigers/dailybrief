---
phase: 130
plan: 03
subsystem: voice-capture
tags: [sse, agent-events-bus, thought-created-channel, three-channel-cleanup-gate, agent-stream, pwa-sse-subscriber, useAgentStream, vigil-thought-created, error-codes-locked-enum, D-E1, D-X1, D8-round-trip]
dependency_graph:
  requires:
    - "Phase 130 Plan 02 — bus.emitThoughtCreated SHIM call site + voice_captures dedup primitive + locked-enum error class throws"
    - "Phase 125 quiet_mode_changed two-channel joint cleanup gate (extending to three channels here)"
    - "Phase 124 agent-events-bus per-userId emitter Map + /v1/agent-stream SSE infra"
    - "Phase 126 PWA api-error-codes ERROR_CODE_MAP locked-enum lookup table (D-04 additivity)"
  provides:
    - "Full emit/on/off triple on agent-events-bus.ts THOUGHT_CREATED_NAME channel + three-channel joint cleanup gate (T-130-03-R)"
    - "/v1/agent-stream multiplexed `thought-created` SSE frames (PATTERNS lines 558-565)"
    - "PWA useAgentStream hook — fetch-stream SSE subscriber dispatching `vigil:thought-created` window events"
    - "Three D-E1 locked-enum error code entries in api-error-codes.ts (VOICE_TRANSCRIBE_TIMEOUT/PROVIDER_DOWN/QUOTA operator copy)"
    - "VOICE-06 structural reachability — full cross-device path G2→server→bus→SSE→PWA→useThoughts refetch wired"
  affects:
    - "vigil-core/src/lib/agent-events-bus.ts (extended)"
    - "vigil-core/src/routes/agent-stream.ts (extended SSE multiplex)"
    - "vigil-pwa/src/lib/api-error-codes.ts (3 new locked-enum entries)"
    - "vigil-pwa/src/hooks/useAgentStream.ts (NEW — fetch-stream subscriber)"
    - "vigil-pwa/src/App.tsx (mounts AgentStreamSubscriber inside authenticated branch)"
    - "Plan 04+ G2 plugin work — voice-transcribe round-trip now structurally closes within 8s on cross-device G2-origin path"
tech_stack:
  added: []
  patterns:
    - "Three-channel joint cleanup gate on EventEmitter Map (extends Phase 125 two-channel pattern; PATTERNS lines 503-535)"
    - "SSE multiplex via single /v1/agent-stream endpoint (RESEARCH Gray Area #3 — preferred over standing up /v1/thought-stream parallel route)"
    - "Fetch-stream SSE subscriber on PWA side (works around EventSource Authorization-header limitation; supports Bearer auth)"
    - "Effect-only hook + tiny mount-component (AgentStreamSubscriber) inside authenticated branch — keeps SSE lifecycle bound to sign-in/out via React unmount"
key_files:
  created:
    - "vigil-core/src/routes/__tests__/voice-transcribe-sse.test.ts (D8 round-trip integration test + cross-user isolation)"
    - "vigil-pwa/src/hooks/useAgentStream.ts (fetch-stream SSE subscriber dispatching vigil:thought-created)"
  modified:
    - "vigil-core/src/lib/agent-events-bus.ts (SHIM → full triple + three-channel cleanup gate on both `off` and `offQuiet`)"
    - "vigil-core/src/lib/__tests__/agent-events-bus.test.ts (+6 thought-created tests including T-130-03-R three-channel gate)"
    - "vigil-core/src/routes/agent-stream.ts (extended AgentStreamDeps.bus with on/offThoughtCreated? + thoughtCreatedListener + onAbort cleanup)"
    - "vigil-pwa/src/lib/api-error-codes.ts (3 new D-E1 locked-enum entries)"
    - "vigil-pwa/src/lib/api-error-codes.test.ts (+3 tests pinning VOICE_TRANSCRIBE_* keys with operator copy)"
    - "vigil-pwa/src/App.tsx (AgentStreamSubscriber component inside authenticated branch)"
decisions:
  - "Three-channel cleanup gate is mandatory — without extending BOTH `off` and `offQuiet` to also check listenerCount(THOUGHT_CREATED_NAME) === 0, a live thought-created listener silently blocks Map cleanup when operator unsubscribes from the other channels (T-130-03-R; PATTERNS §CRITICAL lines 536-537)"
  - "Multiplexed /v1/agent-stream over parallel /v1/thought-stream — RESEARCH Gray Area #3 default; reuses already-wired SSE infra at zero new endpoint cost"
  - "fetch-stream over EventSource on PWA — EventSource spec does NOT support custom request headers; Authorization: Bearer is the only auth path the server accepts on /v1/agent-stream"
  - "AgentStreamSubscriber component inside authenticated branch — keeps SSE lifecycle bound to sign-in/out via React unmount (avoids leaking a stream after signOut)"
  - "vigil-pwa pre-existing 4 test failures (AuthPage 2x signup-flow, api/client redirectToGoogleAuth, SettingsPage invalid_state callback) verified pre-existing via `git stash` on prior tree — zero regressions from Plan 03"
  - "useThoughts.ts:127 UNCHANGED — additive wiring only; PWA refetch trigger path is now converged for both in-tab (usePhotoUpload + AudioUploadSection) AND cross-device (G2-origin SSE) sources"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-18"
  tasks_completed: 3
  files_created: 2
  files_modified: 6
  lines_changed: ~739
requirements_completed: [VOICE-06]
---

# Phase 130 Plan 03: SSE Fan-Out + PWA Subscriber + Thought-Created Channel Triple Completion Summary

**One-liner:** SSE fan-out path closed end-to-end — `agent-events-bus.ts` `thought-created` channel promoted from SHIM to full emit/on/off triple with three-channel joint cleanup gate; `/v1/agent-stream` multiplexes `thought-created` frames; PWA `useAgentStream` fetch-stream subscriber dispatches `vigil:thought-created` window event into the existing `useThoughts.ts:127` refetch listener; three D-E1 locked-enum error codes added to PWA api-error-codes; VOICE-06 cross-device round-trip now structurally reachable within 8 s (D8 server-side test asserts SSE delivery within 500 ms of POST).

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-18T18:10:00Z (approx)
- **Completed:** 2026-05-18T18:18:00Z
- **Tasks:** 3 (all TDD: RED → GREEN → close-loop)
- **Files created:** 2
- **Files modified:** 6
- **Lines changed:** ~739 insertions

## Accomplishments

- **Closed the VOICE-06 SSE path end-to-end.** Plan 02 emitted to a dead channel (SHIM); Plan 03 wires the listener triple, the agent-stream multiplex, and the PWA subscriber so the existing `useThoughts.ts:127` window-event listener finally fires on cross-device G2-origin captures.
- **Three-channel joint cleanup gate landed (T-130-03-R).** Extended both `off` and `offQuiet` cleanup gates on `agent-events-bus.ts` to ALSO require `listenerCount(THOUGHT_CREATED_NAME) === 0`. PATTERNS.md flagged this as "CRITICAL" — without it, a still-subscribed thought-created listener silently orphan-blocks emitter Map cleanup when the operator unsubscribes from EVENT + QUIET.
- **D8 round-trip server-side test GREEN within 500 ms.** New `voice-transcribe-sse.test.ts` wires both routes onto a single Hono app with the REAL `bus` singleton (cross-route fan-out is load-bearing), POSTs to `/v1/voice/transcribe`, and asserts the `thought-created` SSE frame arrives within 500 ms with the correct `{ thoughtId, content }` payload. Second test pins cross-user isolation across the full POST→bus→SSE path.
- **Three D-E1 locked-enum error codes operator-facing copy lives in PWA.** `VOICE_TRANSCRIBE_TIMEOUT` (504), `VOICE_TRANSCRIBE_PROVIDER_DOWN` (502), `VOICE_TRANSCRIBE_QUOTA` (503) — copy verbatim from PATTERNS.md lines 614-633. Dashboard now renders these strings when a queued utterance exhausts retries.
- **PWA `useAgentStream` hook works around EventSource Authorization-header limitation** via a fetch-stream approach (matches the existing agent-stream.test.ts harness pattern; documented inline). `useThoughts.ts:127` UNCHANGED — purely additive wiring.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 RED tests** — `43713e4` (test) — three test files extended/created: agent-events-bus.test.ts (+6 thought-created tests), voice-transcribe-sse.test.ts (NEW D8 round-trip), api-error-codes.test.ts (+3 VOICE_TRANSCRIBE_* tests). All RED on `bus.onThoughtCreated is not a function` and missing ERROR_CODE_MAP keys.
2. **Task 2: Bus triple promotion + agent-stream extension + error codes** — `f32b993` (feat) — promoted SHIM to full triple, extended BOTH `off` and `offQuiet` cleanup gates to three channels, added thoughtCreatedListener to agent-stream.ts with matching onAbort cleanup, appended 3 D-E1 entries to api-error-codes.ts. All Wave 0 tests GREEN.
3. **Task 3: PWA SSE subscriber** — `17a5c55` (feat) — new `useAgentStream` hook + `AgentStreamSubscriber` mount component inside authenticated branch of App.tsx. Fetch-stream SSE subscriber filters for `thought-created` frames and dispatches `vigil:thought-created` window event.

## Files Created/Modified

**Created (2):**

- `vigil-core/src/routes/__tests__/voice-transcribe-sse.test.ts` (~285 lines) — D8 round-trip integration test. Wires `/v1/voice/transcribe` + `/v1/agent-stream` onto a single Hono app sharing the REAL `bus` singleton, POSTs voice transcribe with mocked OpenAI, asserts SSE thought-created frame arrives within 500 ms. Second test asserts cross-user isolation across the full path.
- `vigil-pwa/src/hooks/useAgentStream.ts` (~127 lines) — PWA fetch-stream SSE subscriber. Opens auth'd stream to `/v1/agent-stream` on mount, parses SSE frames manually (EventSource cannot send Bearer headers), dispatches `vigil:thought-created` on `event: thought-created` frames. Tears down via AbortController on unmount.

**Modified (6):**

- `vigil-core/src/lib/agent-events-bus.ts` — Promoted SHIM `emitThoughtCreated` to full triple (added `onThoughtCreated` + `offThoughtCreated` mirroring `onQuiet`/`offQuiet`). Extended BOTH the existing `off` cleanup gate (lines 74-90) AND the `offQuiet` cleanup gate (lines 108-124) to ALSO require `listenerCount(THOUGHT_CREATED_NAME) === 0`. New `offThoughtCreated` method runs the same three-channel gate.
- `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` — Added 6 new tests: emit + cross-user isolation + fan-out + three-channel cleanup gate (T-130-03-R) + no-op safety (offThoughtCreated on non-existent emitter, emitThoughtCreated without subscribers). Total: 18/18 tests GREEN.
- `vigil-core/src/routes/agent-stream.ts` — Extended `AgentStreamDeps.bus` interface with optional `onThoughtCreated?` / `offThoughtCreated?` hooks. Added `thoughtCreatedListener` after `quietListener`. Registers via `deps.bus.onThoughtCreated?.(userId, thoughtCreatedListener)`. Cleans up in `stream.onAbort()` after the existing `offQuiet?` call.
- `vigil-pwa/src/lib/api-error-codes.ts` — Appended three D-E1 locked-enum entries after `DAILY_AI_BUDGET_EXCEEDED` (line 158): `VOICE_TRANSCRIBE_TIMEOUT`, `VOICE_TRANSCRIBE_PROVIDER_DOWN`, `VOICE_TRANSCRIBE_QUOTA`. Operator-facing copy per PATTERNS.md lines 614-633.
- `vigil-pwa/src/lib/api-error-codes.test.ts` — Added 3 tests asserting each new key is present with non-empty message containing a key tone-keyword ("timed out" / "unavailable" / "quota"). Total: 11/11 tests GREEN.
- `vigil-pwa/src/App.tsx` — Imported `useAgentStream` + added tiny `AgentStreamSubscriber` component (renders `null`, runs the hook). Mounted inside the authenticated branch alongside `<ToastHost />` so React's unmount cycle tears down the stream on sign-out.

## Verification Results

### Tests

```
vigil-core (node:test runner):
  agent-events-bus.test.ts            18/18 GREEN (6 new thought-created tests)
  voice-transcribe-sse.test.ts         2/2  GREEN (D8 round-trip + cross-user isolation)
  voice-transcribe.test.ts             9/9  GREEN (no regression — bus mock still works)
  agent-stream.test.ts                12/12 GREEN (no regression — fake bus omits optional on/offThoughtCreated, falls back to no-op)
  Total voice-related                  41/41 GREEN
  Plus lib + top-level                 31/31 GREEN (no regression)

vigil-pwa (vitest):
  api-error-codes.test.ts             11/11 GREEN (3 new VOICE_TRANSCRIBE_* tests)
  Full suite                         254/258 (4 pre-existing failures verified via git stash on prior tree — same 4 failures appear without Plan 03 changes; zero regressions)

D8 round-trip wall-clock:
  POST → SSE frame elapsed             65 ms (well within 500 ms gate; sub-100 ms in-process is typical)
```

### TypeScript

- `cd vigil-core && npx tsc --noEmit` → exit 0
- `cd vigil-pwa && npx tsc --noEmit | grep -vE "(TS6305|file is in the program because|Matched by default include pattern)"` → empty (zero non-build-artifact errors). The TS6305 noise is a pre-existing build artifact from prior `tsc` runs leaving stale `.d.ts` files in `src/` — same shape Plan 02 documented.

### Plan 03 Acceptance Criteria

All acceptance criteria from `<acceptance_criteria>` blocks verified:

- ✅ `agent-events-bus.ts` contains `const THOUGHT_CREATED_NAME = "thought-created"` and three methods `emitThoughtCreated`, `onThoughtCreated`, `offThoughtCreated`
- ✅ BOTH `off` and `offQuiet` cleanup gates updated to require `listenerCount(THOUGHT_CREATED_NAME) === 0` (3 listenerCount references inside both `if (...)` blocks)
- ✅ `agent-stream.ts` contains `thoughtCreatedListener` and `event: "thought-created"` SSE-frame literal
- ✅ `agent-stream.ts` `onAbort` block contains `offThoughtCreated`
- ✅ `api-error-codes.ts` contains keys `VOICE_TRANSCRIBE_TIMEOUT`, `VOICE_TRANSCRIBE_PROVIDER_DOWN`, `VOICE_TRANSCRIBE_QUOTA` each with non-empty `message`
- ✅ `useAgentStream.ts` contains both `'thought-created'` (SSE event-name) and `vigil:thought-created` (CustomEvent dispatch) literals
- ✅ `useThoughts.ts:127` UNCHANGED — pinned at the same line, same listener pattern
- ✅ `cd vigil-core && npm test -- --test-name-pattern="thought-created"` — GREEN (6 new tests)
- ✅ `cd vigil-core && npm test -- --test-name-pattern="voice-transcribe-sse"` — GREEN (2 D8 tests)
- ✅ `cd vigil-pwa && npm test -- --test-name-pattern="VOICE_TRANSCRIBE"` — GREEN (3 new tests)
- ✅ D8 server-side round-trip delivers SSE frame within 500 ms of HTTP 201

## Decisions Made

1. **Three-channel cleanup gate on BOTH existing methods (load-bearing)** — Per PATTERNS.md §"CRITICAL" lines 536-537, extending only the new `offThoughtCreated` would silently break the existing Phase 125 two-channel gate. The two-channel gate would still delete the Map entry when both EVENT + QUIET listeners are removed, even if THOUGHT_CREATED is still subscribed. T-130-03-R test pins this exact regression.
2. **Multiplexed `/v1/agent-stream` over parallel `/v1/thought-stream`** — RESEARCH Gray Area #3 default. Reuses the already-wired SSE infrastructure (auth, CORS, Last-Event-ID replay, suppression queue, keepalive). The only delta is one new event-channel name — trade-off is a tens-of-bytes-larger wire payload on the dashboard for every agent-event the PWA isn't watching (acceptable).
3. **Fetch-stream over EventSource on PWA** — The WHATWG EventSource spec deliberately omits custom request headers. `/v1/agent-stream` requires `Authorization: Bearer <jwt>` — the only path that supports headers is `fetch` with a streaming body + manual SSE parsing. The agent-stream.test.ts harness already proved this pattern (lines 118-156); the hook mirrors it.
4. **AgentStreamSubscriber component inside authenticated branch** — Keeps the SSE lifecycle bound to sign-in/out via React's unmount cycle. Alternatives considered: (a) mount at App root with internal JWT polling — rejected because it would orphan the stream on sign-out until next page navigation; (b) imperative open/close from auth handlers — rejected because it duplicates the React lifecycle that already covers this.
5. **`useThoughts.ts:127` UNCHANGED** — The plan's `<context>` block explicitly called out that the existing listener is the convergence point for both in-tab dispatches (usePhotoUpload + AudioUploadSection) and the new cross-device SSE path. Single refetch trigger, zero duplication.

## Deviations from Plan

None — plan executed exactly as written. All three tasks ran end-to-end with all acceptance criteria satisfied on the first pass. No auto-fixes needed:

- No Rule 1 (bugs) — implementation followed PATTERNS.md verbatim; no faulty code introduced
- No Rule 2 (missing critical) — Plan 02 already established the threat model coverage (per-userId isolation, cleanup gate, etc.); Plan 03 inherits and extends
- No Rule 3 (blocking) — all referenced files existed in the expected state from Plan 02 SHIM; no missing dependencies
- No Rule 4 (architectural) — no architectural ambiguity; the bus triple shape was fully specified in PATTERNS.md lines 503-535

**Total deviations:** 0
**Impact on plan:** Zero scope creep, exact plan execution.

## Issues Encountered

None — the test fixture pattern from agent-stream.test.ts mapped cleanly onto the new voice-transcribe-sse.test.ts, the bus triple mirrored the existing QUIET_NAME triple, and the PWA fetch-stream pattern followed the agent-stream.test.ts harness reference.

Pre-existing vigil-pwa test failures (4) verified pre-existing via `git stash` on the prior tree — zero regressions from Plan 03. Documented in deferred-items.md as carry-forward.

## Authentication Gates

None — Plan 03 is server-only test additions + PWA hook addition. The PWA hook reads JWT from `sessionStorage` via `getStoredKey()` matching the existing `vigilFetch` pattern; production runtime inherits the user's existing sign-in state. No new operator action required.

## Threat Flags

None — the threat surface introduced by this plan is fully covered by the plan's `<threat_model>` block:

- T-130-03-I (per-user SSE isolation) — Per-userId emitter Map enforces structural isolation; new D8/SSE-2 test pins cross-user no-leak (userA does NOT see userB's emit). Verified.
- T-130-03-R (listener leak) — Three-channel cleanup gate test pins Map entry deletion ONLY after all three off methods run. Verified.
- T-130-03-T (SSE frame content) — `accept` disposition; content is user's own transcribed audio behind the existing per-userId boundary. No new exposure.
- T-130-03-SC (npm installs) — `accept` disposition; no new packages installed. Verified.

## Known Stubs

None — the Plan 02 SHIM stub is now fully implemented (full triple + three-channel gate + agent-stream multiplex + PWA subscriber). The dashboard auto-refresh on cross-device G2-origin voice captures is no longer a no-op write.

## Threat Surface Scan

No new security-relevant surface beyond what the `<threat_model>` block already covers. Files created/modified:

- `vigil-core/src/lib/agent-events-bus.ts` — extends existing per-userId emitter with one more channel; no new trust boundary, no new auth path
- `vigil-core/src/routes/agent-stream.ts` — extends existing SSE handler with one more event channel; uses existing `c.get("userId")` boundary
- `vigil-pwa/src/hooks/useAgentStream.ts` — new outbound fetch with Bearer JWT (matches existing `vigilFetch` pattern); no new client-side data access
- `vigil-pwa/src/lib/api-error-codes.ts` — three new operator-copy strings; no new code paths

## Next Plan

**Plan 04 — Production Voice screen + DOUBLE_CLICK gesture + state machine + safeAudioControl signature change** (VOICE-02 / VOICE-03 productionization per CONTEXT D-G1, D-G2, D-S1, D-S2, D-S3). With the SSE path now closed by Plan 03, the G2-plugin side becomes the final missing link to close VOICE-06's end-to-end round-trip — Plan 04 wires the screen + cross-screen state survival + DOUBLE_CLICK gesture; Plans 05-06 handle the offline queue + drift detectors; Plan 07 is the hardware wallclock UAT that closes the operator-facing 8 s criterion.

## Self-Check: PASSED

Verified post-write:

- All 2 created files: `FOUND` (via `test -f`)
- All 3 commits (`43713e4`, `f32b993`, `17a5c55`): `FOUND` in `git log`
- All 6 modified files reachable; key invariants pinned by tests (3-channel gate, SSE multiplex, locked-enum keys, useThoughts.ts:127 unchanged)
- All targeted tests pass (41 voice-related vigil-core + 11 PWA api-error-codes + 31 lib/top-level — total ≥ 83 GREEN; zero regression)
- `useThoughts.ts:127` is line 127 with the literal `window.addEventListener('vigil:thought-created', handleCreated)` — verified unchanged

---

*Phase: 130-voice-capture-full-implementation-scope-locked-by-128a*
*Plan: 03 — SSE Fan-Out + PWA Subscriber + Thought-Created Channel Triple Completion*
*Completed: 2026-05-18*
