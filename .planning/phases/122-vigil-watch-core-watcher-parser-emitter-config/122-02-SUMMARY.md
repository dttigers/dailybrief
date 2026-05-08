---
phase: 122-vigil-watch-core-watcher-parser-emitter-config
plan: 02
subsystem: infra
tags: [swift, spm, xctest, jsonl, parser, vigil-watch, foundation, jsonserializiation]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 00 Swift Package scaffold + 6 Phase-120 fixture JSONL files via Bundle.module
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 01 EventTypes.swift — ParsedLine struct with LineType + byteOffset fields
  - phase: 120-day-1-jsonl-schema-verification-detection-strategy-lock
    provides: 8-row mapping table + 4 level-shift corrections (verbatim implementation target)

provides:
  - func parseJSONLLine(_ line: String, byteOffset: UInt64) -> ParsedLine? — stateless pure classifier
  - public let nonSpecLineTypes: Set<String> — 7 known noise types from Phase 120 README
  - ISO-8601 parser handling fractional and integer-second timestamps
  - ParserTests with 11 tests covering all 8 Phase 120 mapping table rows, bad-JSON survival, byte-offset preservation

affects:
  - 122-03 (milestone pattern matching reads assistantTextBlocks from ParsedLine)
  - 122-06 (SessionActor calls parseJSONLLine per appended JSONL line)
  - 122-07 (OffsetsStore reads byteOffset from ParsedLine to advance offsets.json)
  - all downstream Wave 1 plans that process JSONL lines

# Tech tracking
tech-stack:
  added: [Foundation (JSONSerialization, ISO8601DateFormatter)]
  patterns:
    - JSONSerialization (not Codable) for dynamic heterogeneous JSONL content[] arrays
    - Two-pass ISO-8601 parsing (fractional seconds first, then integer fallback)
    - nil on JSON parse failure = caller does NOT advance offset; nonSpec = caller DOES advance offset
    - Pure function (no actors, no I/O, no clocks) for maximal testability

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Parser.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/ParserTests.swift
  modified: []

key-decisions:
  - "Phase 120 level-shift corrections honored verbatim: tool_use/tool_result are inner $.message.content[].type discriminators, NOT top-level $.type values"
  - "is_error:true boolean is the single-field discriminator for task_failed (toolResultErrors) — no secondary type or subtype needed"
  - "nil-on-failure vs nonSpec-on-noise distinction: nil = parse error (offset NOT advanced); nonSpec = known skip type (offset IS advanced)"
  - "testUserLineParsesPermissionMode asserts actual fixture value (bypassPermissions) not fixture name (user_default_permission) — fixture name reflects intent of capture scenario, not first-line content"
  - "11 tests written (exceeding 9 required) to add text-block extraction test and nonSpec byte-offset round-trip test"

patterns-established:
  - "parseJSONLLine is a pure function — no side effects, no global state, trivially testable in isolation"
  - "nonSpecLineTypes Set<String> is a public constant — allows test code and future SessionActor to query it without re-defining"
  - "loadFixtureFirstLine / loadFixtureAllLines helpers in ParserTests — pattern reused in Plan 03 MilestoneTests"

requirements-completed: [AGENT-WATCH-02]

# Metrics
duration: 18min
completed: 2026-05-08
---

# Phase 122 Plan 02: JSONL Line Classifier Summary

**Stateless parseJSONLLine pure function implementing Phase 120's 8-row mapping table verbatim (including 4 level-shift corrections) with 11 XCTest cases against fixture corpus**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-08T15:44:00Z
- **Completed:** 2026-05-08T16:02:00Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `Parser.swift` implements `parseJSONLLine` and `nonSpecLineTypes` using `Foundation.JSONSerialization` — no Codable, no third-party deps — correctly handling the heterogeneous `message.content[]` arrays
- Phase 120's 4 level-shift corrections honored verbatim: `tool_use`/`tool_result` are inner `$.message.content[].type` discriminators; `is_error:true` is the single-field `task_failed` discriminator; no `session_end` line type exists
- `ParserTests` covers all 8 Phase 120 mapping table rows + bad-JSON survival + byte-offset preservation; 11/11 tests green
- Full test suite advances from 9 to 20 green tests (`swift test` exits 0)

## Task Commits

Each task committed atomically in the vigil-watch repo:

1. **Task 2.1: parseJSONLLine + nonSpecLineTypes** - `11c1be3` (feat)
2. **Task 2.2: ParserTests — 11 tests** - `24dd613` (feat)

## Files Created/Modified

- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Parser.swift` — `parseJSONLLine` pure function, `nonSpecLineTypes` Set, private `parseISO8601` helper
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/ParserTests.swift` — 11 XCTest methods against Phase 120 fixture corpus

## Decisions Made

- **JSONSerialization vs Codable:** The plan specifies JSONSerialization because `message.content[]` is heterogeneous (text, tool_use, tool_result, thinking blocks in the same array). Codable cannot handle this without a custom decoder at least as complex as manual JSONSerialization parsing. Decision confirmed correct — tests pass against real fixture data including mixed content[] types.
- **testUserLineParsesPermissionMode (vs original testUserLineParsesWithDefaultPermission):** The `user_default_permission.jsonl` fixture's first line actually contains `permissionMode: "bypassPermissions"` (the session started in bypass mode even though a later user prompt used default permission). Test was renamed and the assertion matches the actual fixture value. This is a test correctness fix, not a parser behavior change.
- **11 tests instead of 9:** Added `testAssistantTextBlocksExtracted` (grounds Plan 03's milestone matching target) and `testNonSpecByteOffsetPreserved` (grounds Plan 07's offset advancement for non-spec lines). Both are directly load-bearing for downstream plans.

## Deviations from Plan

None — plan executed exactly as written. The test naming deviation (`testUserLineParsesPermissionMode` vs `testUserLineParsesWithDefaultPermission`) reflects actual fixture content; it is a naming adjustment within the plan's intent, not a behavioral change.

The 2 extra tests (11 vs 9 required) are additive improvements with no scope creep.

## Issues Encountered

- **Fixture content vs fixture name mismatch (test design):** `user_default_permission.jsonl` line 1 has `permissionMode: "bypassPermissions"`. The fixture name reflects the Phase 120 capture intent (a session with a default-permission prompt later in the file), but line 1 happens to be a prior bypass-mode line in the same session. Fixed by adjusting the assertion to match the actual byte value, not the fixture name.

## Known Stubs

None — parseJSONLLine is fully implemented. All ParsedLine fields populated correctly from real fixture data.

## Threat Surface Scan

T-122-PARSE (DoS via malformed JSONL) — Mitigated by Task 2.1 implementation. `JSONSerialization` handles all malformed JSON without crashing; bad lines return nil; caller does not advance offset. Tested in `testInvalidJSONReturnsNil` (5 malformed input variants: malformed JSON, empty string, bare newline, empty object, unknown type).

T-122-LARGE (resource exhaustion via huge content[]) — Accepted per plan threat model. `attachment` lines can be very large (165-tool list visible in `user_default_permission.jsonl` line 4). The parser advances offset normally (fixture line 4 is an attachment, correctly classified as .nonSpec). No streaming JSON needed at single-user scale.

No new threat surface beyond the plan's threat model.

## Next Phase Readiness

- Plan 122-03 (milestone pattern matching) can now call `parseJSONLLine` and scan `assistantTextBlocks` — the test `testAssistantTextBlocksExtracted` verifies this field is populated correctly
- Plan 122-06 (SessionActor) can call `parseJSONLLine` per JSONL line and branch on `lineType`, `toolUseIds`, `toolResultErrors`, `stopReason`, and `permissionMode`
- Plan 122-07 (OffsetsStore) can use `byteOffset` from any `ParsedLine` (including `.nonSpec`) to advance `offsets.json` — verified by `testNonSpecByteOffsetPreserved`
- 20 total tests green (`swift test` exits 0) — Wave 1 floor holds

## Self-Check: PASSED

| Item | Status |
|------|--------|
| Parser.swift exists | FOUND |
| `public func parseJSONLLine` (count 1) | FOUND |
| `public let nonSpecLineTypes` (count 1) | FOUND |
| "attachment" in nonSpecLineTypes | FOUND |
| "queue-operation" in nonSpecLineTypes | FOUND |
| "file-history-snapshot" in nonSpecLineTypes | FOUND |
| "last-prompt" in nonSpecLineTypes | FOUND |
| "ai-title" in nonSpecLineTypes | FOUND |
| "summary" in nonSpecLineTypes | FOUND |
| "system" in nonSpecLineTypes | FOUND |
| is_error in Parser.swift (≥1) | FOUND (5 hits) |
| tool_use_id in Parser.swift (≥1) | FOUND (4 hits) |
| swift build exits 0 | PASS |
| ParserTests.swift exists | FOUND |
| 11 func test methods | FOUND (11 count) |
| testNonSpecLinesClassifyAsNonSpec | FOUND |
| testInvalidJSONReturnsNil | FOUND |
| testByteOffsetIsPreserved | FOUND |
| Bundle.module (≥1 reference) | FOUND (3 references) |
| swift test --filter ParserTests exits 0 | PASS (11/11) |
| swift test (full suite) exits 0 | PASS (20/20) |
| vigil-watch commit 11c1be3 | FOUND |
| vigil-watch commit 24dd613 | FOUND |

---
*Phase: 122-vigil-watch-core-watcher-parser-emitter-config*
*Completed: 2026-05-08*
