---
phase: 122-vigil-watch-core-watcher-parser-emitter-config
plan: 08
subsystem: infra
tags: [swift, spm, xctest, fseventstream, actor, tail-cursor, jsonl, watcheractor, concurrency, vigil-watch]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 02 parseJSONLLine pure function + nonSpecLineTypes Set
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 03 ConfigLoader.expandHome path expansion
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 06 StateStore actor — getOffset / updateOffset / atomicSave

provides:
  - public final class FSEventBridge: @unchecked Sendable — Swift 6 safe C-callback wrapper, kFSEventStreamCreateFlagFileEvents | NoDefer | WatchRoot, CallbackBox pattern
  - public actor WatcherActor — bootstrap(projectsDir:) namespace enumeration, handleFileEvent(filePath:) tail-cursor read, partialBuffers in-memory partial-line cache
  - Tail-cursor invariant: offset advances only past complete \n-terminated lines; partial bytes re-read from disk on next tick
  - WatcherActorTests: 10 XCTest cases covering all tail-cursor, partial-line, offset-persistence, and bootstrap behaviors

affects:
  - 122-09 (main.swift wires WatcherActor.lineHandler to SessionStateRegistry, starts FSEventBridge)

# Tech tracking
tech-stack:
  added: [CoreServices (FSEventStreamCreate), Foundation (FileHandle seek/readToEnd)]
  patterns:
    - "CallbackBox pattern: heap-allocated class bridges Swift closure across C void* context pointer — avoids Sendability errors in Swift 6 strict-concurrency mode"
    - "Serial DispatchQueue for FSEventStream: Pitfall 1 mitigation — C callbacks serialised on dedicated queue"
    - "@unchecked Sendable on FSEventBridge: all mutable state serialised by start/stop/deinit caller; C callback dispatches via closure to actor"
    - "Tail-cursor read: seek to StateStore offset, read to EOF, prepend in-memory partial when offset >= partial.count"
    - "Partial-line buffer invariant: offset stays at last complete \n; in-memory partial re-read from disk on next tick if offset == 0"
    - "useInMemoryPartial guard: prevents UInt64 underflow when currentOffset < partialCount (first tick with partial bytes)"

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/FSEventBridge.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/WatcherActor.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/WatcherActorTests.swift
  modified: []

key-decisions:
  - "useInMemoryPartial guard: only prepend in-memory partial when currentOffset >= partialCount; when currentOffset < partialCount (no lines ever consumed), seek to currentOffset re-reads the partial bytes from disk — no prepend needed"
  - "Offset stays at 0 when no \n found on first tick (plan test 2 assertion); the partial buffer is re-read from disk on tick 2 combined with new bytes"
  - "Bad JSON in complete \n-terminated line: offset advances (re-reading is a no-op — bytes are intact and still bad JSON); dispatch is skipped; this deliberately diverges from CONTEXT.md surface wording which was intended for incomplete bytes"
  - "Non-spec lines dispatched to lineHandler (caller gates on lineType == .nonSpec); this gives Plan 09 full visibility into all line types for SessionState.process"
  - "T-122-02 mitigation: logWarn if resolved projects_dir does not start with NSHomeDirectory()"

patterns-established:
  - "FSEventBridge + WatcherActor separation: bridge owns C lifecycle; actor owns read/parse/dispatch logic"
  - "partialBufferSize(filePath:) test-inspection API: actors expose internal state for unit testing without breaking encapsulation"
  - "lineHandler injection: Plan 09 wires handler at init time; WatcherActor has no dependency on SessionState/EmitterActor directly"

requirements-completed: [AGENT-WATCH-01, AGENT-WATCH-02]

# Metrics
duration: 8min
completed: 2026-05-08
---

# Phase 122 Plan 08: FSEventBridge + WatcherActor Summary

**Swift 6 strict-concurrency-safe FSEventStream bridge (CallbackBox/Unmanaged) plus WatcherActor tail-cursor pipeline reading new bytes from stored offsets, buffering partial lines, routing through parseJSONLLine, persisting offsets atomically — 10 XCTest cases all green (102 total)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-08T22:28:53Z
- **Completed:** 2026-05-08T22:37:15Z
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- `FSEventBridge.swift` wraps FSEventStream behind a Swift 6-safe facade: `kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer | kFSEventStreamCreateFlagWatchRoot`, `CallbackBox` pattern (Pitfall 4), serial `DispatchQueue` (Pitfall 1), `@unchecked Sendable` with documented safety
- `WatcherActor.swift` implements the full tail-cursor read pipeline: `bootstrap(projectsDir:)` enumerates namespace subdirs at startup, `handleFileEvent(filePath:)` guards non-JSONL paths, `readNewBytes` advances offset only past complete `\n`-terminated lines with in-memory partial buffer, dispatches ParsedLine to injected `lineHandler`
- `WatcherActorTests.swift` delivers 10 XCTest cases covering: complete-line read, partial-line no-advance, partial completion on next tick, bad-JSON skip, non-spec dispatch, restart-replay safety (SC #3), non-JSONL filter, bootstrap namespace enumeration, bootstrap missing-dir creation, 5-line single-batch
- Full test suite advances from 92 to 102 green tests

## Task Commits

Each task committed atomically in the vigil-watch repo:

1. **Task 8.1: FSEventBridge** - `54d6e58` (feat)
2. **Task 8.2: WatcherActor** - `14c6f0c` (feat)
3. **Task 8.3: WatcherActorTests** - `84ea957` (feat)

## Files Created/Modified

- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/FSEventBridge.swift` — `FSEventBridge` public final class, `CallbackBox` private class
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/WatcherActor.swift` — `WatcherActor` actor with `bootstrap`, `handleFileEvent`, `readNewBytes`, `processLine`, `partialBufferSize` APIs
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/WatcherActorTests.swift` — 10 XCTest methods

## Decisions Made

- **useInMemoryPartial guard (Rule 1 - Bug Fix during Task 8.3):** The plan's `anchorOffset = currentOffset - UInt64(partial.count)` formula causes UInt64 underflow when `currentOffset = 0` and a partial buffer exists (first tick with no lines yet). Fix: `useInMemoryPartial = partialCount > 0 && UInt64(partialCount) <= currentOffset`. When false (first-tick case), `buffer = newData` directly (which already contains the partial bytes from disk at offset 0 — no prepend needed). The test `testPartialLineCompletedOnNextCall` verifies the fix end-to-end.

- **Offset stays at 0 when no `\n` found:** `newOffset = anchorOffset + consumedUpTo`. When `consumedUpTo = 0`, `newOffset = anchorOffset = currentOffset = 0`. Guard `if newOffset != currentOffset` skips the StateStore update. The partial bytes are re-read from disk on the next tick when the file grows. Tests 2 and 3 verify this.

- **Non-spec lines dispatched to lineHandler:** Plan 09 needs to call `SessionState.process(line:)` for all line types (including `.nonSpec`) to update `latestLineTimestamp`. Dispatching `.nonSpec` lines gives Plan 09 full visibility; the caller gates on `lineType != .nonSpec` before heavy processing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UInt64 underflow in anchorOffset calculation**
- **Found during:** Task 8.3 (`testPartialLineCompletedOnNextCall` crashed with SIGILL)
- **Issue:** `anchorOffset = currentOffset - UInt64(partial.count)` underflows when `currentOffset = 0` (no lines ever consumed) and `partial.count > 0` (partial bytes from first tick). SIGILL = Swift runtime integer overflow precondition.
- **Fix:** Added `useInMemoryPartial = partialCount > 0 && UInt64(partialCount) <= currentOffset` guard. When false, `buffer = newData` directly (disk read at offset 0 re-reads the partial bytes — no in-memory prepend). `anchorOffset = currentOffset` when not using in-memory partial.
- **Files modified:** `Sources/VigilWatch/WatcherActor.swift`
- **Verification:** `testPartialLineCompletedOnNextCall`, `testPartialLineDoesNotAdvanceOffset` both green. Full suite 102/102.
- **Committed in:** `14c6f0c` (Task 8.2 implementation) and `84ea957` (Task 8.3 tests where fix was discovered)

---

**Total deviations:** 1 auto-fixed (Rule 1 — UInt64 underflow in anchorOffset)
**Impact on plan:** Required for correctness; no scope creep. The plan's `anchorOffset` description in the action body was semantically correct for the steady-state case (lines already consumed) but underflowed on the first partial-only tick.

## Issues Encountered

- `testPartialLineCompletedOnNextCall` crashed immediately with SIGILL (signal 4 = illegal instruction = Swift integer overflow assertion). Root cause: UInt64 underflow in `anchorOffset = currentOffset - UInt64(partial.count)` when `currentOffset = 0`. The `write` helper's `FileHandle.seekToEnd()` was initially suspected but the real cause was the underflow in WatcherActor's `readNewBytes`.

## Known Stubs

None — FSEventBridge and WatcherActor are fully implemented. `lineHandler` is an injected closure; Plan 09 provides the concrete SessionStateRegistry wiring.

## Threat Surface Scan

**T-122-02 (Path traversal via projects_dir)** — Mitigated per plan: `logWarn` if resolved `projects_dir` does not start with `NSHomeDirectory()`. Watcher can only READ JSONL files; no write access. Documented in `WatcherActor.bootstrap`.

No new threat surface beyond the plan's threat model.

## Next Phase Readiness

- Plan 122-09 (main.swift) can initialize `WatcherActor(stateStore:lineHandler:)` and inject the SessionStateRegistry handler
- Plan 122-09 creates `FSEventBridge { paths in Task { await watcher.handleFileEvent(filePath:) } }` and calls `bridge.start(paths: [expanded_projects_dir])`
- Plan 122-09 calls `await watcher.bootstrap(projectsDir: config.projectsDir)` before starting the FSEventBridge
- 102 total tests green (`swift test` exits 0)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| FSEventBridge.swift exists | FOUND |
| `public final class FSEventBridge` (count 1) | FOUND |
| `kFSEventStreamCreateFlagFileEvents` (≥1 hit) | FOUND (2) |
| `kFSEventStreamCreateFlagNoDefer` (≥1 hit) | FOUND (2) |
| `kFSEventStreamCreateFlagWatchRoot` (≥1 hit) | FOUND (2) |
| `class CallbackBox` (count 1) | FOUND |
| `FSEventStreamCreate` (≥1 hit) | FOUND |
| `FSEventStreamSetDispatchQueue` (count 1) | FOUND |
| WatcherActor.swift exists | FOUND |
| `public actor WatcherActor` (count 1) | FOUND |
| `public func bootstrap` (count 1) | FOUND |
| `public func handleFileEvent` (count 1) | FOUND |
| `partialBuffers` (≥3 hits) | FOUND (7) |
| `parseJSONLLine` (≥1 hit) | FOUND (4) |
| `updateOffset` (≥1 hit) | FOUND (1) |
| `atomicSave` (≥1 hit) | FOUND (3) |
| `hasSuffix(".jsonl")` (count 1) | FOUND |
| WatcherActorTests.swift exists | FOUND |
| 10 `func test` methods | FOUND (10) |
| `testReadsCompleteLineAndAdvancesOffset` | FOUND |
| `testPartialLineDoesNotAdvanceOffset` | FOUND |
| `testPartialLineCompletedOnNextCall` | FOUND |
| `testRestartReplaySafetyViaStoredOffset` | FOUND |
| `testBootstrapEnumeratesNamespaceSubdirs` | FOUND |
| `testNonJSONLFilesIgnored` | FOUND |
| swift build exits 0 | PASS |
| swift test --filter WatcherActorTests exits 0 (10/10) | PASS |
| swift test (full suite) exits 0 (102/102) | PASS |
| vigil-watch commit 54d6e58 | FOUND |
| vigil-watch commit 14c6f0c | FOUND |
| vigil-watch commit 84ea957 | FOUND |

---
*Phase: 122-vigil-watch-core-watcher-parser-emitter-config*
*Completed: 2026-05-08*
