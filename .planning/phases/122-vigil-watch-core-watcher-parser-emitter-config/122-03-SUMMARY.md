---
phase: 122-vigil-watch-core-watcher-parser-emitter-config
plan: 03
subsystem: infra
tags: [swift, spm, xctest, toml, config, vigil-watch, foundation]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 00 Swift Package scaffold
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 01 EventTypes.swift — ParsedLine, VigilEvent, HashID
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Plan 02 Parser.swift — parseJSONLLine pure function

provides:
  - TOMLParser: hand-rolled flat TOML parser (string/integer/string-array) with comment stripping and bracket-depth array termination
  - WatchConfig struct: 9-field Sendable config with D-03/D-04/D-05 locked defaults and 6-pattern D-10 milestone starter
  - ConfigLoader.load(path:env:): reads-or-creates ~/.config/vigil/watch.toml; api_key bootstrap precedence (file → VIGIL_API_KEY env → quarantine)
  - ConfigLoader.expandHome(_:): ~ expansion for projects_dir
  - ConfigLoader.resolveHost(_:): hostLabel or ProcessInfo.processInfo.hostName fallback
  - 20 new XCTest cases (10 TOMLParserTests + 10 ConfigTests)

affects:
  - 122-04 (milestone pattern matcher reads milestonePatterns from WatchConfig)
  - 122-05 (emitter reads apiURL, apiKey, heartbeatSeconds from WatchConfig)
  - 122-06 (SessionActor reads all threshold fields from WatchConfig)
  - 122-07 (OffsetsStore reads projectsDir from WatchConfig)
  - all downstream Wave 2 plans that call ConfigLoader.load() at startup

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; hand-rolled parser uses Foundation only
  patterns:
    - Hand-rolled minimal TOML parser (string/integer/string-array only) — correct choice for fixed 9-key schema
    - isArrayClosed() uses bracket-depth tracking (not simple string.contains("]")) to handle ] inside regex character classes [✓✔]
    - unquote() placeholder swap (\u{0001}) to avoid double-replacement in \\\\ → \\ → \\ chain
    - ConfigLoader.load(path:env:) injectable parameters — enables test isolation without ~/.config/ pollution
    - setUp/tearDown temp dir per test — no shared test state between ConfigTests cases

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/TOMLParser.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Config.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/TOMLParserTests.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/ConfigTests.swift
  modified: []

key-decisions:
  - "isArrayClosed() depth-tracking fix: simple contains(']') is wrong when regex patterns contain ] inside character classes like [✓✔]; bracket depth outside quoted strings is the correct termination test"
  - "defaultTOMLBody uses \\\\\\\\b in Swift source (→ \\\\b in file → \\b after TOMLParser.unquote) — round-trip verified by testFirstRunCreatesDefaultsAtTempPath"
  - "ConfigLoader.load(path:env:) injectable test parameters: tests pass temp paths + empty env dict to isolate from real ~/.config/vigil/ and real VIGIL_API_KEY env"
  - "T-122-01 mitigated: VIGIL_API_KEY never logged in Config.swift; api_key value only ever stored in WatchConfig.apiKey field — downstream logging (Plan 07) must mask it"
  - "T-122-02 noted: projects_dir accepted verbatim (~ expansion only); path-traversal rejection deferred to Plan 06 watcher per threat model"

patterns-established:
  - "TOMLParser is a pure value type (struct) with no global state — trivially testable, safe from concurrency issues"
  - "WatchConfig.defaults static property is the canonical source of truth for all threshold values — downstream plans read from it or from a loaded WatchConfig, never hardcode thresholds"
  - "ConfigLoader injectable path+env: write tests against temp paths and synthetic env dicts; never write tests that read real ~/.config files"

requirements-completed: [AGENT-WATCH-06]

# Metrics
duration: 25min
completed: 2026-05-08
---

# Phase 122 Plan 03: Config Subsystem (TOMLParser + WatchConfig + ConfigLoader) Summary

**Hand-rolled flat TOML parser with bracket-depth array termination, WatchConfig defaults for all D-03/D-04/D-05/D-10 locked values, and ConfigLoader.load() that reads-or-creates ~/.config/vigil/watch.toml with VIGIL_API_KEY env fallback and quarantine signaling**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-08T21:32:00Z
- **Completed:** 2026-05-08T21:57:00Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- `TOMLParser.swift` handles all 9 watch.toml keys (string, integer, string-array) with comment stripping; `isArrayClosed()` depth-tracking fix ensures regex character classes like `[✓✔]` don't prematurely close the TOML array
- `Config.swift` implements `WatchConfig` with all locked thresholds (D-03/D-04/D-05/D-10), `ConfigLoader.load()` with first-run create, and full api_key bootstrap chain (file → `VIGIL_API_KEY` env → quarantine empty string)
- 40 total tests green (`swift test` exits 0); 10 TOMLParserTests + 10 ConfigTests added on top of the prior 20

## Task Commits

Each task committed atomically in the vigil-watch repo:

1. **Task 3.1: TOMLParser — hand-rolled string/integer/string-array parser** - `7598a56` (feat)
2. **Task 3.2: Config + WatchConfig + first-run create + api_key bootstrap** - `937666a` (feat)

## Files Created/Modified

- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/TOMLParser.swift` — `TOMLValue` enum, `TOMLParseError` enum, `TOMLParser` struct with `parse()`, `isArrayClosed()`, `stripCommentAndTrim()`, `unquote()`, `parseStringArray()`
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/VigilWatch/Config.swift` — `WatchConfig` struct with defaults, `ConfigError` enum, `ConfigLoader` with `load()`, `expandHome()`, `resolveHost()`
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/TOMLParserTests.swift` — 10 XCTest methods including load-bearing `testFullWatchTOMLSchema`
- `/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/ConfigTests.swift` — 10 XCTest methods with setUp/tearDown temp dir isolation

## Decisions Made

- **isArrayClosed() depth-tracking:** The plan's reference implementation used `while !arrayBuf.contains("]")` which fails on the very first milestone pattern `"^[✓✔] "` because `]` inside the quoted string is incorrectly treated as the TOML array closing bracket. Fixed by tracking bracket depth outside quoted strings — the same technique already used in `parseStringArray()`.

- **round-trip backslash encoding:** `defaultTOMLBody` in Swift `"""..."""` uses `\\\\b` so the written file contains `\\b`, which `TOMLParser.unquote()` decodes to `\b`. This round-trips correctly so `testFirstRunCreatesDefaultsAtTempPath` can assert `cfg.milestonePatterns == WatchConfig.defaultMilestonePatterns`.

- **Injectable path + env in ConfigLoader.load():** Avoids any test touching `~/.config/vigil/watch.toml` or the real `VIGIL_API_KEY` env var. Each test creates/tears down its own temp directory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed array termination condition in TOMLParser.parse()**
- **Found during:** Task 3.1 (TOMLParser implementation + initial test run)
- **Issue:** The plan's reference pseudocode used `while !arrayBuf.contains("]")` to detect array close. This fails when any quoted string element contains `]` (e.g., the first default milestone pattern `"^[✓✔] "` has `]` inside the regex character class). `testFullWatchTOMLSchema` failed with count 1 instead of 6, and first element `""^[✓✔"` (truncated at `]`).
- **Fix:** Replaced `contains("]")` with `isArrayClosed(_:)` — a character-by-character scanner that tracks bracket depth only outside quoted strings. Depth starts at 0; `[` increments, `]` decrements; returns true when depth reaches 0.
- **Files modified:** `Sources/VigilWatch/TOMLParser.swift`
- **Verification:** `swift test --filter TOMLParserTests` went from 3 failures to 10/10 green
- **Committed in:** `7598a56` (part of Task 3.1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug)
**Impact on plan:** Fix was necessary for correctness against the real watch.toml schema. The plan's pseudocode was illustrative; the depth-tracking approach is the correct production implementation. No scope creep.

## Issues Encountered

- **Array termination bug:** Discovered during initial test run of `testFullWatchTOMLSchema`. Root cause: reference pseudocode used a naive `contains("]")` check. Fixed immediately with `isArrayClosed()` depth tracker. No impact on plan scope or timeline.

## Known Stubs

None — all 9 watch.toml keys parsed and mapped to WatchConfig; api_key bootstrap fully wired; first-run create fully wired. No placeholder values in data flow.

## Threat Surface Scan

T-122-01 (bearer leak) — Config.swift never logs `apiKey`. VIGIL_API_KEY env var is read into `cfg.apiKey` only. No `print()` or stderr output of the value in this file. Downstream Plan 07 logging must mask it.

T-122-02 (path traversal) — `ConfigLoader.expandHome` only expands leading `~/`. Arbitrary `..` segments are not rejected here; documented for Plan 06 watcher to enforce.

T-122-03 (regex DoS) — `milestonePatterns` is stored as `[String]`; NSRegularExpression compilation deferred to Plan 05 milestone matcher where the 100ms compile budget and throw-on-invalid-pattern behavior will be enforced.

No new threat surface beyond the plan's threat model.

## Next Phase Readiness

- Plan 122-04 (milestone pattern matcher) can now read `WatchConfig.milestonePatterns` directly
- Plan 122-05 (emitter) can call `ConfigLoader.load()` at startup and read `apiURL`, `apiKey` (quarantine check), `heartbeatSeconds`
- Plan 122-06 (SessionActor) reads `needsInputGapSeconds`, `needsInputDebounceSeconds`, `taskCompleteSilenceSeconds` from WatchConfig
- Plan 122-07 (OffsetsStore) reads `projectsDir` from WatchConfig via `ConfigLoader.expandHome`
- 40 total tests green (`swift test` exits 0) — Wave 1 floor holds

## Self-Check: PASSED

| Item | Status |
|------|--------|
| TOMLParser.swift exists | FOUND |
| `public enum TOMLValue` (count 1) | FOUND |
| `case string(String)` (count 1) | FOUND |
| `case integer(Int)` (count 1) | FOUND |
| `case stringArray([String])` (count 1) | FOUND |
| `public func parse` (count 1) | FOUND |
| TOMLParserTests.swift has 10 func test methods | FOUND (count 10) |
| `func testFullWatchTOMLSchema` (count 1) | FOUND |
| `swift test --filter TOMLParserTests` exits 0 | PASS (10/10) |
| Config.swift exists | FOUND |
| `public struct WatchConfig: Sendable` (count 1) | FOUND |
| `public static let defaultConfigPath` (count 1) | FOUND |
| `.config/vigil/watch.toml` in Config.swift (≥1) | FOUND (2 hits) |
| `VIGIL_API_KEY` in Config.swift (≥1) | FOUND (4 hits) |
| `public static func load` (count 1) | FOUND |
| `expandHome` (≥1) | FOUND |
| `resolveHost` (≥1) | FOUND |
| ConfigTests.swift has 10 func test methods | FOUND (count 10) |
| `testApiKeyEnvFallback` (count 1) | FOUND |
| `testApiKeyFilePrecedence` (count 1) | FOUND |
| `testApiKeyQuarantineWhenBothBlank` (count 1) | FOUND |
| `swift test --filter ConfigTests` exits 0 | PASS (10/10) |
| `swift build && swift test` exits 0 | PASS (40/40) |
| vigil-watch commit 7598a56 | FOUND |
| vigil-watch commit 937666a | FOUND |

---
*Phase: 122-vigil-watch-core-watcher-parser-emitter-config*
*Completed: 2026-05-08*
