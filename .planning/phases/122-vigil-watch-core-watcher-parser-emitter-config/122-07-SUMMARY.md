---
phase: 122-vigil-watch-core-watcher-parser-emitter-config
plan: 07
subsystem: infra
tags: [swift, spm, xctest, actor, timer-state-machine, vigil-watch, session-state, detection-rules]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 01 EventTypes.swift — ParsedLine, VigilEvent, VigilPayload, makeClientEventId
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 02 Parser.swift — parseJSONLLine output shape (ParsedLine consumed here)
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 03 Config.swift — WatchConfig with D-03/D-04/D-05 locked thresholds

provides:
  - actor SessionState: per-session timer state machine with all 5 Vigil event detection rules
  - process(line:ParsedLine) -> [VigilPayload]: updates state; fires task_failed immediately on is_error=true (deduped)
  - evaluate(now:Date, config:WatchConfig) -> [VigilPayload]: timer-driven; returns needs_input, task_complete/task_failed (precedence), heartbeat
  - sessionHadError: Bool (never resets within session — Pitfall 3 mitigation per CONTEXT.md)
  - pendingToolUses: [String:(Date,UInt64)] (cleared on any user line arrival — pragmatic resolution)
  - Heartbeat re-arm: lastHeartbeatEmittedAt < latestLineTimestamp detects new line → re-arms window
  - 13 XCTest cases covering all 5 detection rules + precedence + debounce + D-01 determinism

affects:
  - 122-09 (Plan 09 main.swift wires 1Hz tick loop calling evaluate(now:config:) per active session)
  - 122-08 (WatcherActor routes ParsedLine to SessionState.process(line:))

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; pure Foundation + Swift Concurrency actor
  patterns:
    - Swift actor for per-session mutable timer state — eliminates data races under Swift 6 strict concurrency
    - Two-method API: process() for line-arrival state updates; evaluate() for timer-driven event generation
    - pragmatic pendingToolUses.removeAll() on any user line — false-negative rate negligible vs complexity of per-ID matching
    - Heartbeat re-arm via lastHeartbeatEmittedAt < latestLineTimestamp (Date comparison, no explicit reset needed)
    - taskCompleteEmittedAt used as gate even when suppressed by precedence — prevents repeated re-evaluation
    - @discardableResult on process() — caller may discard [] on non-failing lines without warning

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/SessionActor.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/SessionActorTests.swift
  modified: []

key-decisions:
  - "Two-method split: process(line:) fires task_failed immediately (latency-sensitive, user sees error now); evaluate(now:config:) fires all timer-based events (needs_input, task_complete, heartbeat) — Plan 09 calls evaluate() on 1Hz tick loop per CONTEXT.md D-06"
  - "Pragmatic pendingToolUses.removeAll() on any user line: Phase 120 README confirms resolution by next user line; per-ID matching adds complexity for negligible accuracy gain in the narrow needs_input window"
  - "taskCompleteEmittedAt set even when suppressed by sessionHadError precedence: prevents re-evaluation on every subsequent 1Hz tick after silence threshold crossed"
  - "Heartbeat re-arm detection via lastHeartbeatEmittedAt < latestLineTimestamp: when new line lands, latestLineTimestamp jumps forward past lastHeartbeatEmittedAt, re-arming eligibility without any explicit reset"
  - "bypassPermissions gate in evaluate(): permissionMode is set from last user line; once set to bypassPermissions it suppresses needs_input for the rest of the session (consistent with Claude Code running fully automated)"

patterns-established:
  - "SessionState actor is pure-logic: no I/O, no timers — all timer-driven evaluation is pulled by Plan 09's 1Hz loop; testability follows from this separation"
  - "evaluate() is idempotent: re-calling without new lines or time advancing produces no events (all dedupe stamps catch re-evaluation)"
  - "Test pattern: fixed WatchConfig.defaults + fixed baseTime ISO8601 anchor + helper functions for each line type — readable, threshold-unambiguous assertions"

requirements-completed: [AGENT-WATCH-02]

# Metrics
duration: 8min
completed: 2026-05-08
---

# Phase 122 Plan 07: SessionState Actor (Timer State Machine) Summary

**Per-session timer state machine actor with all 5 Vigil event detection rules, task_failed/task_complete precedence, needs_input debounce, heartbeat re-arm window, and 13 exhaustive XCTest cases**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-08T22:22:03Z
- **Completed:** 2026-05-08T22:30:00Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `SessionActor.swift` implements `actor SessionState` with all 5 detection rules: needs_input (gap + debounce), task_complete (silence), task_failed (immediate + deduped + precedence), heartbeat (silence + re-arm), milestone wiring point (handled by Plan 05 MilestoneMatcher at Plan 09 orchestration layer)
- `sessionHadError` flag never resets within session — Pitfall 3 mitigation locks task_failed precedence over task_complete when an error occurred in the session
- `@discardableResult` on `process(line:)` for ergonomic caller API; process() is an actor method (Swift 6 concurrency-safe)
- 13 XCTest cases in `SessionActorTests.swift` covering every detection rule, debounce window, dedupe gate, precedence rule, and D-01 deterministic clientEventId round-trip
- 92 total tests green (`swift test` exits 0); 13 new SessionActorTests added on top of prior 79

## Task Commits

Each task committed atomically in the vigil-watch repo:

1. **Task 7.1: SessionState actor with all 5 detection rules + precedence** - `c1773b4` (feat)
2. **Task 7.2: SessionActorTests — exhaustive detection rule + precedence + debounce coverage** - `d235195` (test)

## Files Created/Modified

- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/SessionActor.swift` — `actor SessionState` with `process(line:)`, `evaluate(now:config:)`, `makePayload()`, test inspection helpers
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/SessionActorTests.swift` — 13 XCTest methods across needs_input, task_failed, task_complete, precedence, heartbeat, D-01 determinism

## Decisions Made

- **Two-method API split:** `process(line:)` fires task_failed immediately (latency-sensitive — user sees error now); `evaluate(now:config:)` fires all timer-based events via Plan 09's 1Hz tick loop per CONTEXT.md D-06
- **Pragmatic pendingToolUses.removeAll() on any user line:** Phase 120 README confirms resolution by next user line; per-ID matching adds complexity for negligible accuracy gain in the narrow needs_input window
- **taskCompleteEmittedAt gate even when suppressed by precedence:** prevents re-evaluation on every 1Hz tick after silence threshold crossed, keeping evaluate() idempotent
- **Heartbeat re-arm via Date comparison:** `lastHeartbeatEmittedAt < latestLineTimestamp` detects new line arrival without explicit reset; clean and allocation-free

## Deviations from Plan

None — plan executed exactly as written. The provided implementation code in the plan was complete and correct; no deviation rules triggered.

## Known Stubs

None — SessionState is pure-logic with no I/O. No hardcoded empty values in data flow. Plan 09 wiring (1Hz tick loop + WatcherActor routing) is the next step; SessionState is ready to receive.

## Threat Surface Scan

No new threat surface beyond the plan's threat model.

- **T-122-PRECEDENCE (T — Wrong event class emitted):** Mitigated. `sessionHadError` never resets within session; `testTaskFailedPrecedenceWhenSessionHadError` pins behavior at test level. evaluate() branches on sessionHadError before emitting task_complete.
- **T-122-DRIFT (D — Timer drift under sleep/wake):** Accepted. Plan 09 can implement wake-detection reset as follow-on per CONTEXT.md deferred items. Phase 123 24h soak will surface if painful.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| SessionActor.swift exists | FOUND |
| `public actor SessionState` (count 1) | FOUND (1) |
| `public func process(line: ParsedLine)` (count 1) | FOUND (1) |
| `public func evaluate(now: Date = Date(), config: WatchConfig)` (count 1) | FOUND (1) |
| `sessionHadError` (≥3 hits) | FOUND (6) |
| `pendingToolUses` (≥3 hits) | FOUND (8) |
| `bypassPermissions` (≥1 hit) | FOUND (2) |
| `taskFailedEmittedAt` (≥3 hits) | FOUND (5) |
| `taskCompleteEmittedAt` (≥3 hits) | FOUND (4) |
| `lastHeartbeatEmittedAt` (≥3 hits) | FOUND (5) |
| `lastNeedsInputEmittedAt` (≥2 hits) | FOUND (3) |
| `makeClientEventId` (count 1) | FOUND (1) |
| `swift build` exits 0 | PASS |
| SessionActorTests.swift has 13 func test methods | FOUND (13) |
| `testNeedsInputFiresAfter10sGap` (count 1) | FOUND |
| `testNeedsInputSuppressedByBypassPermissions` (count 1) | FOUND |
| `testNeedsInputDebouncedTo30sWindow` (count 1) | FOUND |
| `testTaskFailedFiresOnIsError` (count 1) | FOUND |
| `testTaskFailedDedupedToOnce` (count 1) | FOUND |
| `testTaskCompleteFiresAfter30sSilenceAfterEndTurn` (count 1) | FOUND |
| `testTaskFailedPrecedenceWhenSessionHadError` (count 1) | FOUND |
| `testHeartbeatFiresAfter60sSilence` (count 1) | FOUND |
| `testHeartbeatRearmsAfterNewLine` (count 1) | FOUND |
| `testEventsCarryDeterministicClientEventId` (count 1) | FOUND |
| `swift test --filter SessionActorTests` exits 0 (13/13 green) | PASS |
| `swift test` (all 92 tests) exits 0 | PASS |
| vigil-watch commit c1773b4 | FOUND |
| vigil-watch commit d235195 | FOUND |

## Next Phase Readiness

- Plan 122-08 (WatcherActor) can now call `SessionState.process(line:)` to route parsed lines
- Plan 122-09 (main.swift orchestration) can now call `SessionState.evaluate(now:config:)` in 1Hz tick loop
- 92 total tests green — Wave 2 floor holds
