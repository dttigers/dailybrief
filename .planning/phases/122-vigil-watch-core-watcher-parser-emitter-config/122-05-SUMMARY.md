---
phase: 122-vigil-watch-core-watcher-parser-emitter-config
plan: 05
subsystem: infra
tags: [swift, spm, xctest, nsregularexpression, milestone-matcher, vigil-watch, concurrency, actor]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 01 EventTypes.swift — ParsedLine struct with lineType + assistantTextBlocks fields
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 03 Config.swift — WatchConfig.milestonePatterns + defaultMilestonePatterns (D-10 6-pattern starter)
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 04 Logging.swift — logWarn() for compile-failure stderr output

provides:
  - actor MilestoneMatcher: compiles WatchConfig.milestonePatterns at init with implicit (?i) (D-10), dedupes per (sessionId, pattern) (D-07)
  - struct MilestoneRecord: Codable/Equatable/Sendable — Plan 06 StateStore persistence record for offsets.json schema_version=2 (D-08/D-09)
  - scanForFirstTimeMatches(line:) — scans assistant text blocks against compiled patterns, returns first-time matches
  - recordEmission(sessionId:pattern:) — records a fired pattern into dedupe state
  - hasEmitted(sessionId:pattern:) — inspection helper for tests and Plan 06 StateStore
  - snapshot() — returns [sessionId: Set<rawPattern>] for Plan 06 StateStore atomic save
  - MilestoneMatcherTests: 13 XCTest cases covering D-07, D-08, D-10, T-122-03

affects:
  - 122-06 (SessionActor calls scanForFirstTimeMatches per assistant line; calls recordEmission after milestone event enqueued)
  - 122-07 (OffsetsStore persists MilestoneRecord entries into offsets.json schema_version=2 milestones_emitted field)

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; NSRegularExpression is Foundation-built-in
  patterns:
    - Actor isolation for mutable dedupe state — all mutation through actor methods (Swift Concurrency safe)
    - Compile-once NSRegularExpression at init time — T-122-03 fail-closed; bad patterns skipped, not crashing daemon
    - (?i) implicit prepend with (?-prefix opt-out — pattern hasPrefix("(?") check preserves user inline flags
    - priorEmissions: [String: [MilestoneRecord]] init parameter — hydrates dedupe state from disk on restart (D-08)
    - Stored raw pattern (without (?i)) as dedupe key — round-trips cleanly through watch.toml → offsets.json → WatchConfig

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/MilestoneMatcher.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/MilestoneMatcherTests.swift
  modified: []

key-decisions:
  - "Raw pattern stored in Compiled.raw (without (?i)) so dedupe key matches watch.toml and offsets.json — round-trips cleanly across daemon restarts"
  - "(?-prefix opt-out check: hasPrefix('(?') leaves pattern unchanged — catches (?-i), (?s), (?m) and any other inline flag the user writes"
  - "scanForFirstTimeMatches returns [Compiled] not [Bool] — caller gets both the regex and the raw pattern, enabling milestone payload message construction and recordEmission in one pass"
  - "T-122-03 closed by construction: bad patterns produce a logWarn to stderr and are skipped; they never crash the daemon or block startup"

patterns-established:
  - "MilestoneMatcher actor pattern: all mutable state (emittedBySession, compiled) actor-isolated; callers use await at every access site"
  - "priorEmissions init injection: Plan 06 StateStore passes loaded offsets.json milestones_emitted to init; no separate hydration method needed"
  - "snapshot() / recordEmission() / hasEmitted() triad: snapshot for atomic disk write, recordEmission for mutation, hasEmitted for point-in-time inspection"

requirements-completed: [AGENT-WATCH-02]

# Metrics
duration: 8min
completed: 2026-05-08
---

# Phase 122 Plan 05: MilestoneMatcher Summary

**NSRegularExpression compile-once actor (D-10 implicit (?i) + opt-out) with (sessionId, pattern) dedupe (D-07), priorEmissions hydration for restart-survival (D-08), and 13 XCTest cases grounding all four spec requirements**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-08T22:08:43Z
- **Completed:** 2026-05-08T22:16:00Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `MilestoneMatcher.swift` lands the compile-once actor: init compiles all WatchConfig.milestonePatterns with implicit `(?i)` prepend per D-10; bad patterns hit `logWarn` and are skipped (T-122-03 mitigation)
- D-07 per-session dedupe is actor-isolated: `scanForFirstTimeMatches` filters already-recorded patterns; `recordEmission` is the single mutation point; `hasEmitted` + `snapshot` expose state for Plan 06 StateStore
- D-08 restart-survival is wired at construction time: `priorEmissions: [String: [MilestoneRecord]]` parameter hydrates `emittedBySession` before the first scan runs — no separate hydration call needed
- `MilestoneMatcherTests.swift` provides 13 XCTest cases across all four spec requirements; full test suite advances from 55 to 68 green tests

## Task Commits

Each task committed atomically in the vigil-watch repo:

1. **Task 5.1: MilestoneMatcher actor** - `e2435a4` (feat)
2. **Task 5.2: MilestoneMatcherTests — 13 tests** - `c7e8631` (feat)

## Files Created/Modified

- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/MilestoneMatcher.swift` — `MilestoneRecord` Codable struct + `MilestoneMatcher` actor with compile-once patterns, `scanForFirstTimeMatches`, `recordEmission`, `hasEmitted`, `snapshot`, `compiledCount`
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/MilestoneMatcherTests.swift` — 13 XCTest methods covering D-07 dedupe, D-08 hydration, D-10 case-insensitive default + opt-out, T-122-03 bad-pattern graceful skip

## Decisions Made

- **Raw pattern stored in `Compiled.raw` (without `(?i)`):** The dedupe key must match what's in `watch.toml` and `offsets.json`. If `(?i)` were stored as the key, round-tripping through disk would require stripping it back — error-prone. Storing raw avoids any encoding/decoding mismatch.
- **`(?-prefix` opt-out check via `hasPrefix("(?"):`** Any pattern that already opens with a `(?` flag group is left untouched. This preserves `(?-i)`, `(?s)`, `(?m)`, and any future inline flag user writes — without trying to parse flag group syntax.
- **`scanForFirstTimeMatches` returns `[Compiled]` not `[Bool]`:** The caller (Plan 06 SessionActor) needs both the raw pattern for `recordEmission` and a human-readable `Compiled.raw` for the milestone event's `message` field. Returning `[Compiled]` avoids a second lookup.

## Deviations from Plan

None — plan executed exactly as written. Both files match the plan's reference implementation verbatim.

## Issues Encountered

None — `swift build` and `swift test --filter MilestoneMatcherTests` both passed on first attempt.

## Known Stubs

None — `MilestoneMatcher` is fully functional. Plan 06 SessionActor will wire `scanForFirstTimeMatches` into the per-line processing loop and pass `priorEmissions` from the loaded StateStore.

## Threat Surface Scan

T-122-03 (Regex DoS via user-supplied patterns) — Mitigated by construction. `MilestoneMatcher.init` compiles each pattern inside a `do/catch`; failures call `logWarn` and skip the pattern. `testCompileBadPatternIsSkippedNotCrashed` asserts daemon continues with valid-pattern count = 1 when an invalid pattern is mixed in. `NSRegularExpression` internally caps pattern complexity.

No new threat surface introduced beyond the plan's threat model.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| MilestoneMatcher.swift exists | FOUND |
| `public actor MilestoneMatcher` (count 1) | FOUND (1) |
| `public struct MilestoneRecord: Codable` (count 1) | FOUND (1) |
| `"(?i)" + raw` (count 1) | FOUND (1) |
| `recordEmission` (count ≥2) | FOUND (3) |
| `scanForFirstTimeMatches` (count ≥1) | FOUND (3) |
| `NSRegularExpression` (count ≥1) | FOUND (3) |
| `swift build` exits 0 | PASS |
| MilestoneMatcherTests.swift exists | FOUND |
| 13 `func test` methods | FOUND (13) |
| `testCompilesAllSixDefaultPatterns` | FOUND |
| `testCompileBadPatternIsSkippedNotCrashed` | FOUND |
| `testGSDPlanCompletePatternMatchesPhaseString` | FOUND |
| `testCaseInsensitiveByDefault` | FOUND |
| `testCaseSensitiveOptOut` | FOUND |
| `testDedupesSamePatternSameSession` | FOUND |
| `testNewSessionResetsDedupe` | FOUND |
| `testHydrateFromPriorEmissions` | FOUND |
| `testNonAssistantLineSkipped` | FOUND |
| `swift test --filter MilestoneMatcherTests` exits 0 (13/13) | PASS |
| `swift test` (full suite) exits 0 (68/68) | PASS |
| vigil-watch commit e2435a4 | FOUND |
| vigil-watch commit c7e8631 | FOUND |

## Next Phase Readiness

- Plan 122-06 (SessionActor) can now call `await matcher.scanForFirstTimeMatches(line:)` per assistant line and `await matcher.recordEmission(sessionId:pattern:)` after milestone event enqueued
- Plan 122-07 (OffsetsStore) can load `milestones_emitted` from offsets.json schema_version=2 and pass as `priorEmissions` to `MilestoneMatcher.init`
- 68 total tests green (`swift test` exits 0) — Wave 1 floor holds

---
*Phase: 122-vigil-watch-core-watcher-parser-emitter-config*
*Completed: 2026-05-08*
