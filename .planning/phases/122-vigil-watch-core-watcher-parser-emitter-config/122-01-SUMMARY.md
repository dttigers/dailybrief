---
phase: 122-vigil-watch-core-watcher-parser-emitter-config
plan: 01
subsystem: infra
tags: [swift, spm, xctest, cryptokit, sha256, vigil-watch, event-types, drift-detector]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 00 Swift Package scaffold — VigilWatch library target + test target + Fixtures
  - phase: 121-agent-events-api-foundation-cross-user-isolation-lock
    provides: VALID_EVENTS contract + KNOWN_FIELDS + D-A4 payload spec that EventTypes.swift implements

provides:
  - enum VigilEvent: String, CaseIterable, Sendable with 5 cases byte-identical to VALID_EVENTS in agent-events.ts
  - struct VigilPayload: Encodable, Sendable with 8 KNOWN_FIELDS and snake_case CodingKeys (D-A4 contract)
  - struct ParsedLine: Sendable with byteOffset for D-01 hash input and LineType enum (user/assistant/nonSpec)
  - func makeClientEventId(sessionId:byteOffset:eventType:) — D-01 SHA256 prefix-32 UUID-shaped hash
  - let ruleVersion = "v1" — D-02 Swift const, never a DB column
  - DriftDetectorTests — Phase 121 D-T2 carry-forward; locks VigilEvent.allCases byte-identical to VALID_EVENTS in agent-events.ts
  - HashIDTests — 7 tests covering UUID shape, determinism, divergence per input dimension, known-vector pin

affects:
  - 122-02 through 122-09 (all downstream Wave 1 plans import EventTypes.swift for VigilEvent + VigilPayload + ParsedLine)
  - 122-02 ParserTests uses ParsedLine.lineType + byteOffset directly
  - 122-05 EmitterTests uses VigilPayload Encodable contract
  - 122-06 SessionActor uses ParsedLine + makeClientEventId
  - 122-07 OffsetsStore uses ParsedLine.byteOffset

# Tech tracking
tech-stack:
  added: [CryptoKit (SHA256), Foundation (NSRegularExpression for drift detector)]
  patterns:
    - D-01 deterministic hash: sha256(sessionId|byteOffset|eventType|ruleVersion) formatted as UUID 8-4-4-4-12
    - D-02 ruleVersion as Swift const: never a DB column, only bumped for operator-initiated backfills
    - Drift detector via sibling-repo file read with VIGIL_CORE_PATH env + XCTSkip guard pattern
    - VigilEvent raw values byte-identical to VALID_EVENTS — locked by DriftDetectorTests at test time

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/EventTypes.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/HashID.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/HashIDTests.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/DriftDetectorTests.swift
  modified:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/VigilWatch.swift (deleted — placeholder superseded by real sources)

key-decisions:
  - "D-01 known-vector pinned at execution time: sha256(\"2072cbce-...|1024|needs_input|v1\") → \"39830cfa-218a-9bed-5804-49bd450dd210\" (verified via shasum -a 256; XCTAssertEqual uncommented in HashIDTests)"
  - "VigilWatch.swift placeholder dropped in separate chore commit — Plan 00 stub no longer needed once EventTypes.swift + HashID.swift land as real sources"
  - "DriftDetectorTests uses XCTSkip (not XCTFail) when VIGIL_CORE_PATH is absent — CI without sibling checkout skips gracefully; monorepo user gets real fail on drift"

patterns-established:
  - "All foundational types (VigilEvent, VigilPayload, ParsedLine) in a single EventTypes.swift — single import for all downstream Wave 1 plans"
  - "All types public + Sendable — library target + actor-boundary crossing ready from day one"
  - "Drift detector pattern: read sibling-repo TypeScript source file, regex-extract constant, assert byte-identical match against Swift enum rawValues"

requirements-completed: [AGENT-WATCH-02, AGENT-WATCH-03]

# Metrics
duration: 15min
completed: 2026-05-08
---

# Phase 122 Plan 01: Foundational Types + D-01 Hash + Drift Detector Summary

**SHA256-based deterministic client_event_id hash (D-01), five-case VigilEvent enum byte-matched to vigil-core VALID_EVENTS, VigilPayload + ParsedLine structs, and a drift-detector test that locks the contract in CI**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-08T15:38:00Z
- **Completed:** 2026-05-08T15:43:00Z
- **Tasks:** 3
- **Files modified:** 5 (4 created, 1 deleted)

## Accomplishments

- `EventTypes.swift` lands the three canonical types imported by all downstream Wave 1 plans: `VigilEvent` (5 cases), `VigilPayload` (8 fields, snake_case CodingKeys), `ParsedLine` (byteOffset + LineType)
- `HashID.swift` implements D-01 — `makeClientEventId` is a pure function producing a UUID-shaped SHA256-derived string; known-vector pinned live to `39830cfa-218a-9bed-5804-49bd450dd210`
- `DriftDetectorTests.swift` carries forward Phase 121 D-T2 — reads vigil-core source directly and asserts byte-identical match so any future VALID_EVENTS rename breaks `swift test` immediately
- 9 total tests pass (`swift test` green after all three tasks)

## Task Commits

Each task committed atomically in the vigil-watch repo:

1. **Task 1.1: EventTypes.swift** - `487eb87` (feat)
2. **Task 1.2: HashID.swift + HashIDTests** - `2c139ef` (feat)
3. **Task 1.3: DriftDetectorTests** - `320e9a0` (feat)
4. **Chore: drop VigilWatch.swift placeholder** - `b736210` (chore)

## Files Created/Modified

- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/EventTypes.swift` — VigilEvent enum (5 cases), VigilPayload struct (8 fields), ParsedLine struct with LineType nested enum
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/HashID.swift` — makeClientEventId D-01 hash function + ruleVersion D-02 const
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/HashIDTests.swift` — 7 tests: UUID shape, determinism, divergence per input dimension, ruleVersion lock, known-vector pin
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/DriftDetectorTests.swift` — Phase 121 D-T2 drift lock reading vigil-core/src/routes/agent-events.ts
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/VigilWatch.swift` — deleted (Plan 00 stub superseded)

## Decisions Made

- **Known-vector pinned live:** Ran `echo -n "2072cbce-9eb3-4f2d-a69d-a219d997aa2a|1024|needs_input|v1" | shasum -a 256` at execution time; first 32 hex chars `39830cfa218a9bed580449bd450dd210` format to `39830cfa-218a-9bed-5804-49bd450dd210`. XCTAssertEqual is uncommented in `testKnownVectorFromResearch` — this pins D-01 in CI.
- **Placeholder dropped in separate commit:** VigilWatch.swift placeholder was required by SPM for Plan 00 scaffold. With real sources now landed, it was removed cleanly in a labeled `chore` commit to keep history legible.
- **CodingKeys alignment:** Plan acceptance criteria greps for `case sessionId = "session_id"` (single space). Normalized CodingKeys to single-space format so acceptance greps match correctly.

## Deviations from Plan

None — plan executed exactly as written. The placeholder removal was explicitly mentioned as "executor's call" in the plan's cross_repo_context note.

## Issues Encountered

- CodingKeys initially written with alignment padding (multiple spaces), causing plan's acceptance grep to fail. Fixed inline before commit (no separate deviation commit needed — caught during verification, not after commit).

## Known Stubs

None — all types are fully specified. No placeholder data or hardcoded empty values. ParsedLine fields are all populated at parse time by Plan 02's parser.

## Threat Surface Scan

T-122-04 (Tampering/replay via client_event_id): Mitigated. HashIDTests asserts determinism + divergence on each input dimension. Known-vector test pins the exact hash output. Postgres partial unique index (Phase 121) handles dedup.

T-122-DRIFT (Contract drift via mismatched VigilEvent enum): Mitigated. DriftDetectorTests reads vigil-core source directly; any rename in VALID_EVENTS breaks `swift test` before next deploy.

No new threat surface introduced beyond the plan's threat model.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| EventTypes.swift exists | FOUND |
| VigilEvent has 5 cases with correct raw values | VERIFIED |
| VigilPayload has 8 fields with snake_case CodingKeys | VERIFIED |
| ParsedLine has byteOffset + LineType enum | VERIFIED |
| HashID.swift exists | FOUND |
| ruleVersion = "v1" const | FOUND (grep count = 1) |
| makeClientEventId signature correct | FOUND (grep count = 1) |
| import CryptoKit | FOUND |
| SHA256.hash | FOUND |
| HashIDTests.swift exists with 7 test methods | FOUND (7 funcs) |
| HashIDTests all pass | PASS (7/7) |
| DriftDetectorTests.swift exists | FOUND |
| testVigilEventCasesMatchAgentEventsTS | FOUND (grep count = 1) |
| VIGIL_CORE_PATH env var | FOUND (4 references) |
| XCTSkip guard for missing path | FOUND |
| DriftDetectorTests PASS against live agent-events.ts | PASS |
| swift build exits 0 | PASS |
| swift test exits 0 (9 tests, 0 failures) | PASS |
| vigil-watch commit 487eb87 | FOUND |
| vigil-watch commit 2c139ef | FOUND |
| vigil-watch commit 320e9a0 | FOUND |
| vigil-watch commit b736210 | FOUND |

## Next Phase Readiness

- Wave 1 downstream plans (122-02 through 122-09) can now `import VigilWatch` and use `VigilEvent`, `VigilPayload`, `ParsedLine`, and `makeClientEventId` without any further scaffold work
- Plan 122-02 (JSONL parser) will populate `ParsedLine` from fixture JSONL files — `byteOffset` field is the key input to D-01 hashing
- Plan 122-05 (emitter) will `JSONEncoder().encode(VigilPayload(...))` directly — `CodingKeys` already produce the correct snake_case POST body
- Plan 122-06 (SessionActor) will call `makeClientEventId(sessionId:byteOffset:eventType:)` per line — no adapter layer needed

---
*Phase: 122-vigil-watch-core-watcher-parser-emitter-config*
*Completed: 2026-05-08*
