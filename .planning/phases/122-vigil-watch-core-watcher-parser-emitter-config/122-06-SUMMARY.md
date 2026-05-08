---
phase: 122-vigil-watch-core-watcher-parser-emitter-config
plan: 06
subsystem: infra
tags: [swift, spm, xctest, actor, state-persistence, offsets-json, f-fullfsync, atomic-write, vigil-watch, concurrency]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 05 MilestoneRecord struct + MilestoneMatcher actor — StateStore persists MilestoneRecord to offsets.json
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 01 EventTypes.swift — ParsedLine sessionId field used as milestones_emitted key
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 04 Logging.swift — logWarn for operational log context (no direct call from StateStore, but test suite uses full module)

provides:
  - public actor StateStore: updateOffset / getOffset / recordMilestone / priorEmissions / atomicSave / loadOrCreate / snapshotForTesting
  - public struct StateFile: Codable — D-09 schema_version=2 with CodingKeys mapping to snake_case JSON keys
  - atomic save: write-temp + F_FULLFSYNC + rename(2) per RESEARCH.md §6 (macOS crash-safe)
  - lazy GC: sessions older than 24h dropped on loadOrCreate (matches Phase 121 GET sliding window)
  - priorEmissions() hydration API for Plan 09 main.swift → MilestoneMatcher.init (D-08 restart-survival)
  - StateStoreTests: 11 XCTest cases covering schema compliance, GC, roundtrip, mismatch, idempotency, hydration

affects:
  - 122-07 (SessionActor calls updateOffset / recordMilestone / atomicSave after each JSONL batch)
  - 122-08 (Watcher passes file path to StateStore.getOffset before opening cursor)
  - 122-09 (main.swift loads StateStore on startup, passes priorEmissions() to MilestoneMatcher.init)

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; Foundation + Darwin (fcntl, F_FULLFSYNC) are system-provided
  patterns:
    - "Actor isolation for mutable offsets + milestone state — all mutation through actor methods (Swift Concurrency safe)"
    - "Atomic write pattern: write-to-temp + F_FULLFSYNC fcntl + rename(2) — macOS APFS/HFS+ crash-safe (RESEARCH.md §6)"
    - "Lazy GC on loadOrCreate: newest-record-drives-cutoff semantics; sessions with at least one recent record survive"
    - "Two-formatter ISO-8601 parse: fractional-seconds-first then plain Internet DateTime — covers both emittedAt variants"
    - "snake_case CodingKeys on both StateFile and MilestoneRecord — D-09 JSON schema verbatim"

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/StateStore.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/StateStoreTests.swift
  modified:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/MilestoneMatcher.swift  # added CodingKeys to MilestoneRecord

key-decisions:
  - "MilestoneRecord.CodingKeys added (Rule 1 bug fix): auto-synthesis produced camelCase (firstMatchOffset, emittedAt); D-09 requires snake_case (first_match_offset, emitted_at) — added explicit CodingKeys enum to MilestoneMatcher.swift"
  - "F_FULLFSYNC error intentionally ignored: it is a durability hardener, not a correctness boundary; the atomic rename guarantees consistency regardless of whether F_FULLFSYNC flushed"
  - "removeItem before moveItem: FileManager.moveItem raises NSError if target exists; pre-remove + move replicates atomic rename(2) semantics cleanly without using shell syscalls directly"
  - "recordMilestone uses nil-default emittedAt parameter (not default-expression ISO8601DateFormatter()): avoids evaluating a non-Sendable type at call-site; formatter is created in body only when needed"
  - "GC uses newest-record-drives-cutoff: a session with one 25h-old and one 5min-old record is KEPT — the 5min record indicates the session is still live per D-09 spec wording 'oldest-wins'"

patterns-established:
  - "StateStore actor pattern: single-file single-actor owns all disk I/O; callers never touch offsets.json directly"
  - "snapshotForTesting(): returns copy of in-memory StateFile for XCTest assertions without triggering disk I/O"
  - "writeRawJSON() test helper: writes arbitrary dict directly bypassing StateStore GC — enables testing GC behavior in isolation"
  - "Two-formatter ISO-8601 parse: try fractional-seconds ISO8601DateFormatter first, fall back to plain InternetDateTime — covers emittedAt strings that may or may not have milliseconds"

requirements-completed: [AGENT-WATCH-02]

# Metrics
duration: 3min
completed: 2026-05-08
---

# Phase 122 Plan 06: StateStore Summary

**actor StateStore owning offsets.json exclusively: D-09 schema_version=2 (snake_case Codable), F_FULLFSYNC + rename atomic write (RESEARCH.md §6), 24h lazy GC, and priorEmissions() hydration API for MilestoneMatcher restart-survival (D-08)**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-08T22:14:06Z
- **Completed:** 2026-05-08T22:17:55Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `StateStore.swift` lands the single owner of `~/Library/Application Support/vigil-watch/offsets.json` — no other subsystem touches that path
- D-09 schema_version=2 implemented verbatim: `StateFile` CodingKeys map `schemaVersion→schema_version`, `milestonesEmitted→milestones_emitted`; `MilestoneRecord` CodingKeys map `firstMatchOffset→first_match_offset`, `emittedAt→emitted_at`
- Atomic save: write-to-temp + `F_FULLFSYNC` fcntl + `rename(2)` (macOS APFS/HFS+ crash-safe per RESEARCH.md §6); `F_FULLFSYNC` error is swallowed (durability hardener, not correctness gate)
- Lazy GC: on `loadOrCreate()`, sessions whose newest `emittedAt` record is older than 24h are dropped; matches Phase 121 GET sliding window; newest-record-drives-cutoff semantics per D-09
- `priorEmissions()` exposes full `[String: [MilestoneRecord]]` dict for Plan 09 main.swift → `MilestoneMatcher.init(patterns:priorEmissions:)` hydration at daemon restart (D-08)
- `StateStoreTests.swift` delivers 11 XCTest cases; full suite advances from 68 to 79 green tests

## Task Commits

Each task committed atomically in the vigil-watch repo:

1. **Task 6.1: StateStore actor** - `7f03f5d` (feat)
2. **Task 6.2: StateStoreTests — 11 tests** - `45ee8cd` (feat)

## Files Created/Modified

- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/StateStore.swift` — `StateFile` Codable struct + `StateStore` actor with `updateOffset`, `getOffset`, `recordMilestone`, `priorEmissions`, `atomicSave`, `loadOrCreate`, `snapshotForTesting`, `gcOldSessions`
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/StateStoreTests.swift` — 11 XCTest methods covering all must_have truths
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/MilestoneMatcher.swift` — added `CodingKeys` enum to `MilestoneRecord` (Rule 1 bug fix — snake_case JSON keys required by D-09)

## Decisions Made

- **MilestoneRecord.CodingKeys added:** Without explicit CodingKeys, Swift's auto-synthesis produces `"firstMatchOffset"` and `"emittedAt"` in JSON; D-09 schema requires `"first_match_offset"` and `"emitted_at"`. Added explicit enum to MilestoneMatcher.swift. Round-trip test (`testRecordMilestoneRoundTrip`) verifies the fix.
- **F_FULLFSYNC error ignored by design:** The fcntl call is best-effort — if the file descriptor can't be opened for any reason, we skip it. The subsequent atomic rename still guarantees consistency. This matches RESEARCH.md §6 guidance: "F_FULLFSYNC is a durability hardener, not correctness boundary."
- **`removeItem` before `moveItem`:** `FileManager.moveItem` raises NSError if the target path already exists on macOS. Pre-removing the target preserves the "atomic last write wins" semantics without dropping to raw syscalls. `testAtomicSaveSurvivesPartialFailure` verifies the missing-target case (no crash when target is absent before rename).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MilestoneRecord.CodingKeys missing — JSON keys were camelCase, not D-09 snake_case**
- **Found during:** Task 6.1 (StateStore actor implementation)
- **Issue:** `MilestoneRecord` in Plan 05's `MilestoneMatcher.swift` used Codable auto-synthesis, which produces `"firstMatchOffset"` / `"emittedAt"` in JSON output. D-09 schema verbatim requires `"first_match_offset"` / `"emitted_at"`. The round-trip test in Task 6.2 would fail without this fix.
- **Fix:** Added explicit `CodingKeys` enum to `MilestoneRecord` in `MilestoneMatcher.swift` with snake_case mappings.
- **Files modified:** `Sources/VigilWatch/MilestoneMatcher.swift`
- **Verification:** `testRecordMilestoneRoundTrip` asserts `emittedAt` field survives decode; `testSchemaVersion2WrittenToDisk` asserts disk content format.
- **Committed in:** `7f03f5d` (part of Task 6.1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in Plan 05 MilestoneRecord Codable keys)
**Impact on plan:** Required for D-09 schema compliance. No scope creep; MilestoneMatcher.swift change is a 6-line CodingKeys enum addition.

## Issues Encountered

- `XCTAssertNoThrow` does not support `async` closures in Swift — rewrote test 8 (`testAtomicSaveSurvivesPartialFailure`) to use a plain `do/catch` pattern with `XCTFail` on error. (Rule 1 auto-fix, first compile attempt.)

## Known Stubs

None — `StateStore` is fully wired. `priorEmissions()` returns live in-memory state populated from disk; no mock data or placeholder values.

## Threat Surface Scan

**T-122-CRASH** (I/T — data loss on crash mid-write): Mitigated. `F_FULLFSYNC` before `rename(2)` ensures temp file data is on physical media; rename is atomic on APFS/HFS+. `testAtomicSaveSurvivesPartialFailure` provides best-effort coverage of the partial-failure path.

No new threat surface beyond the plan's threat model.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| StateStore.swift exists | FOUND |
| `public actor StateStore` (count 1) | FOUND (1) |
| `public struct StateFile: Codable` (count 1) | FOUND (1) |
| `case schemaVersion = "schema_version"` (count 1) | FOUND (1) |
| `case milestonesEmitted = "milestones_emitted"` (count 1) | FOUND (1) |
| `F_FULLFSYNC` (count ≥1) | FOUND (7) |
| `Library/Application Support/vigil-watch/offsets.json` (count ≥1) | FOUND (3) |
| `sessionGCThresholdSeconds` (count ≥1) | FOUND (2) |
| `public func loadOrCreate` (count 1) | FOUND (1) |
| `public func atomicSave` (count 1) | FOUND (1) |
| `public func updateOffset` (count 1) | FOUND (1) |
| `public func recordMilestone` (count 1) | FOUND (1) |
| `swift build` exits 0 | PASS |
| StateStoreTests.swift exists | FOUND |
| 11 `func test` methods | FOUND (11) |
| `testLoadOrCreateCreatesEmptyFileWhenAbsent` | FOUND |
| `testUpdateOffsetAndAtomicSaveRoundTrip` | FOUND |
| `testSchemaVersion2WrittenToDisk` | FOUND |
| `testGCDropsSessionsOlderThan24h` | FOUND |
| `testSchemaMismatchThrows` | FOUND |
| `testRecordMilestoneIsIdempotent` | FOUND |
| `swift test --filter StateStoreTests` exits 0 (11/11) | PASS |
| `swift test` (full suite) exits 0 (79/79) | PASS |
| vigil-watch commit 7f03f5d | FOUND |
| vigil-watch commit 45ee8cd | FOUND |

## Next Phase Readiness

- Plan 122-07 (SessionActor) can call `await store.updateOffset(filePath:offset:)` after each JSONL batch and `await store.atomicSave()` periodically
- Plan 122-07 (SessionActor) can call `await store.recordMilestone(sessionId:pattern:firstMatchOffset:)` after each MilestoneMatcher hit
- Plan 122-08 (Watcher) passes `await store.getOffset(filePath:)` as the initial byte cursor before opening an `NSFileHandle`
- Plan 122-09 (main.swift) calls `try await store.loadOrCreate()` at startup, then `await store.priorEmissions()` to pass to `MilestoneMatcher.init`
- 79 total tests green (`swift test` exits 0) — Wave 1 floor holds

---
*Phase: 122-vigil-watch-core-watcher-parser-emitter-config*
*Completed: 2026-05-08*
