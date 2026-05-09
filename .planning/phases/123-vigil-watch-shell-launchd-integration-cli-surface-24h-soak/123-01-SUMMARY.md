---
phase: 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak
plan: 01
subsystem: infra
tags: [vigil-watch, swift, spm, swift-argument-parser, cli-shell, scaffold, async-parsable-command]

# Dependency graph
requires:
  - phase: 122-vigil-watch-core-watcher-parser-emitter-config
    provides: Phase 122 daemon engine (Daemon.swift composition root, EmitterActor, ConfigLoader, SignalHandling, Logging) — the engine that will live inside the Run subcommand body in Plan 123-03
provides:
  - swift-argument-parser 1.6.0 SemVer pin (resolved 1.7.1) wired into vigil-watch executable target
  - VigilWatchCLI parent dispatcher (AsyncParsableCommand with 6 subcommands + defaultSubcommand: Run.self)
  - Six typed AsyncParsableCommand/ParsableCommand stubs at Sources/vigil-watch/Commands/ — testable shells for Plans 123-03 and 123-04 to fill in
  - PackageTests drift detector pinning Package.swift dependency version
affects: [123-02 watch.toml extension, 123-03 Run/Tail/Test bodies, 123-04 Install/Uninstall/Status bodies, 123-05 24h soak gate]

# Tech tracking
tech-stack:
  added:
    - apple/swift-argument-parser (from 1.6.0; resolved 1.7.1) — Apple's official MIT-licensed CLI library; Phase 122 Package.swift comment already reserved this slot
  patterns:
    - "@main AsyncParsableCommand parent with subcommands: [...] + defaultSubcommand: Run.self for bare-invocation backcompat"
    - "Sources/vigil-watch/Commands/<Subcommand>.swift one-file-per-subcommand layout"
    - "Stub subcommands fail loudly via FileHandle.standardError.write + throw ExitCode.failure (so dev accidentally invoking pre-Plan-03/04 stubs fails fast, not silently)"
    - "PackageTests.swift fs+regex drift detector mirrors existing DriftDetectorTests idiom"

key-files:
  created:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/VigilWatchCLI.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/Commands/Run.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/Commands/Tail.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/Commands/Test.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/Commands/Install.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/Commands/Uninstall.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/Commands/Status.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Tests/VigilWatchTests/PackageTests.swift
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Package.resolved
  modified:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Package.swift
  deleted:
    - /Users/jamesonmorrill/Desktop/Local AI/vigil-watch/Sources/vigil-watch/main.swift  # renamed → VigilWatchCLI.swift; @main attribute is incompatible with file literally named main.swift (Swift top-level-code rule)

key-decisions:
  - "main.swift → VigilWatchCLI.swift rename: forced by Swift compiler — `@main` cannot be used in a file named main.swift (top-level-code rule). Filename change is mechanical; structural pattern (`@main` AsyncParsableCommand parent with subcommands list + defaultSubcommand) is preserved verbatim."
  - "swift-argument-parser pinned `from: \"1.6.0\"` (SemVer minor flex); SPM resolved 1.7.1 from registry — drift detector locks the pin, not the resolved version, so future minor bumps don't break the test."
  - "All 6 subcommand stubs throw ExitCode.failure with stderr message 'stub: lands in Plan 123-NN' — Run/Test/Install (123-03 / 123-04) message specifies which downstream plan owns the body. Loud-fail is intentional so accidentally invoking pre-implementation stubs in dev surfaces immediately."
  - "Run uses AsyncParsableCommand (daemon body in 123-03 needs Task/await for ConfigLoader.load + Daemon init); Tail and Status use ParsableCommand (synchronous tail+jq pipe / runtime-state.json read); Test/Install/Uninstall use AsyncParsableCommand (HTTPS POST / launchctl process spawn)."

patterns-established:
  - "@main + AsyncParsableCommand parent with one-file-per-subcommand layout under Sources/vigil-watch/Commands/"
  - "Subcommand stubs as testable shells: Plan-N+1 fills in run() bodies without touching the parser-level glue"
  - "Stub failure mode: write to stderr + throw ExitCode.failure (consistent across all 6 stubs, Run-Tail-Test-Install-Uninstall-Status)"
  - "fs.readFileSync + regex drift detector for SPM dependency pins (PackageTests.testArgumentParserDependencyVersion mirrors DriftDetectorTests.testVigilEventCasesMatchAgentEventsTS)"

requirements-completed: [AGENT-WATCH-04, AGENT-WATCH-05]

# Metrics
duration: 5 min
completed: 2026-05-09
---

# Phase 123 Plan 01: vigil-watch CLI shell scaffold Summary

**swift-argument-parser 1.6.0 wired into Package.swift with VigilWatchCLI @main dispatcher and 6 typed AsyncParsableCommand/ParsableCommand stubs unblocking Plans 123-03/04**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-09T18:31:39Z
- **Completed:** 2026-05-09T18:36:27Z
- **Tasks:** 2
- **Files modified:** 10 (8 created, 1 modified, 1 deleted)

## Accomplishments
- swift-argument-parser declared in Package.swift (`from: "1.6.0"`), resolved to 1.7.1, ArgumentParser product wired into vigil-watch executable target
- `VigilWatchCLI.swift` — `@main` AsyncParsableCommand parent with `subcommands: [Run.self, Tail.self, Test.self, Install.self, Uninstall.self, Status.self]` and `defaultSubcommand: Run.self` (preserves Phase 122 bare-invocation backcompat)
- Six subcommand stubs at `Sources/vigil-watch/Commands/` — Run (`--verbose` Flag), Tail (`sessionId` Argument), Test, Install (`--force` Flag), Uninstall, Status. Each throws `ExitCode.failure` with stderr message naming the downstream plan that owns the real body
- `Tests/VigilWatchTests/PackageTests.swift` — drift detector locks the swift-argument-parser pin to "1.6.0" via `fs.readFileSync` + regex
- `swift build -c release` green; `.build/release/vigil-watch --help` lists all 6 subcommands; full test suite 112 tests (was 111), no regressions

## Task Commits

Each task was committed atomically in the **vigil-watch** repo (planning artifacts commit separately in dailybrief):

1. **Task 1.1: Add swift-argument-parser to Package.swift + PackageTests drift detector** — `d57ab39` (feat)
2. **Task 1.2: Replace main.swift with VigilWatchCLI dispatcher + 6 subcommand stubs** — `3ae22bd` (feat)

## Files Created/Modified

### Created (vigil-watch repo)
- `Sources/vigil-watch/VigilWatchCLI.swift` — `@main` AsyncParsableCommand parent dispatcher (replaces deleted main.swift)
- `Sources/vigil-watch/Commands/Run.swift` — AsyncParsableCommand stub; `@Flag --verbose`; body in Plan 123-03
- `Sources/vigil-watch/Commands/Tail.swift` — ParsableCommand stub; `@Argument sessionId: String`; body in Plan 123-03
- `Sources/vigil-watch/Commands/Test.swift` — AsyncParsableCommand stub; body in Plan 123-03
- `Sources/vigil-watch/Commands/Install.swift` — AsyncParsableCommand stub; `@Flag --force`; body in Plan 123-04
- `Sources/vigil-watch/Commands/Uninstall.swift` — AsyncParsableCommand stub; body in Plan 123-04
- `Sources/vigil-watch/Commands/Status.swift` — ParsableCommand stub; body in Plan 123-04
- `Tests/VigilWatchTests/PackageTests.swift` — drift detector pinning swift-argument-parser version to "1.6.0"
- `Package.resolved` — SPM lockfile pinning resolved swift-argument-parser 1.7.1

### Modified
- `Package.swift` — added swift-argument-parser dependency (`from: "1.6.0"`); added `.product(name: "ArgumentParser", package: "swift-argument-parser")` to vigil-watch executable target

### Deleted
- `Sources/vigil-watch/main.swift` — renamed to `VigilWatchCLI.swift` (Swift compiler rule: `@main` attribute incompatible with files literally named `main.swift`)

### Created (dailybrief repo planning artifacts)
- `.planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/123-01-SUMMARY.md` — this file
- `.planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/deferred-items.md` — pre-existing test failure tracking

## Decisions Made

- **swift-argument-parser pin `from: "1.6.0"` (SemVer minor flex), drift detector locks the source-pin not the resolved version.** SPM resolved 1.7.1 from registry; pinning by source string ("1.6.0") rather than resolved version means future minor releases don't break the drift test, while the SemVer floor protects against accidental downgrade.
- **`@main` attribute forces file rename main.swift → VigilWatchCLI.swift.** Swift's top-level-code rule disallows `@main` in a file named `main.swift`. The plan's structural acceptance criteria (`@main`, AsyncParsableCommand, subcommands list, defaultSubcommand: Run.self) are preserved verbatim — only the filename changes. Tracked as Rule 3 deviation (blocking compiler issue, mechanical fix).
- **Stub failure shape: stderr write + throw ExitCode.failure with plan reference.** All 6 stubs follow the same pattern; the stderr message names which downstream plan owns the body (Run/Tail/Test → 123-03; Install/Uninstall/Status → 123-04). Loud-fail in dev > silent no-op stubs.
- **AsyncParsableCommand vs ParsableCommand split per subcommand.** Run/Test/Install/Uninstall need async (Task/await for daemon init, HTTPS POST, launchctl bootstrap) — chose AsyncParsableCommand. Tail/Status are synchronous (tail+jq subprocess pipe / runtime-state.json read) — chose ParsableCommand. Per RESEARCH.md §"Pattern 1" guidance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] main.swift filename forced rename to VigilWatchCLI.swift for `@main` compatibility**
- **Found during:** Task 1.2 (initial `swift build -c release`)
- **Issue:** Swift compiler error `'main' attribute cannot be used in a module that contains top-level code` — files literally named `main.swift` are treated as top-level code, which is mutually exclusive with `@main`. Plan's `<files>` list and acceptance criteria specify both `Sources/vigil-watch/main.swift` AND `@main` keyword, which is impossible at the language level.
- **Fix:** Renamed `Sources/vigil-watch/main.swift` → `Sources/vigil-watch/VigilWatchCLI.swift`. The `@main`-attributed `VigilWatchCLI: AsyncParsableCommand` struct preserves the plan's intent verbatim; only the filename changed.
- **Files modified:** Sources/vigil-watch/main.swift (deleted), Sources/vigil-watch/VigilWatchCLI.swift (created with the same content)
- **Verification:** `swift build -c release` succeeds; `.build/release/vigil-watch --help` shows all 6 subcommands; downstream Plan 123-03 (which references "main.swift" as the place the daemon body is being moved OUT of) is unaffected — the daemon body still moves into `Run.swift`, just from VigilWatchCLI.swift's parent rather than main.swift's parent.
- **Committed in:** 3ae22bd (Task 1.2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking compiler issue)
**Impact on plan:** No semantic impact — the structural pattern (`@main` + AsyncParsableCommand + 6 subcommands + defaultSubcommand: Run.self) is exact-as-specified. The filename change is mechanical and forced by Swift's language rules. Downstream plans (123-03, 123-04) reference subcommand FILES (Run.swift / Install.swift / etc.) by name, not main.swift, so this rename has zero blast radius.

## Issues Encountered

- **Pre-existing baseline test failure:** `StateStoreTests.testRecordMilestoneRoundTrip` was already failing on `main` at commit `c3de707` (head before Plan 123-01) — 4 XCTAssertEqual failures within the same test case (milestone fields read back as `nil`). Out of scope for this plan (StateStore is Phase 122 milestone-record persistence, unrelated to swift-argument-parser dependency or main.swift dispatcher work). Tracked in `.planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/deferred-items.md` for ride-along resolution. After Plan 123-01: 112 tests, 1 failing test case (same pre-existing one) — net +1 passing test (PackageTests) and zero regressions.

## User Setup Required

None — no external service configuration required. swift-argument-parser fetched from public GitHub registry; no credentials, no environment variables, no plist install (those land in Plan 123-04).

## Next Phase Readiness

- Plans 123-03 (Run/Tail/Test bodies) and 123-04 (Install/Uninstall/Status bodies) are **unblocked**. Each has a typed `AsyncParsableCommand`/`ParsableCommand` shell at `Sources/vigil-watch/Commands/<Name>.swift` with the locked flag/argument shape (Run `--verbose`, Tail `sessionId`, Install `--force`).
- Plan 123-02 (watch.toml extension) runs in parallel with this one (Wave 1) — no shared files, no dependency between them.
- Bare `vigil-watch` (no subcommand) routes to `Run.run()` via `defaultSubcommand: Run.self`; currently Run throws ExitCode.failure (stub), but Plan 123-03 will move the Phase 122 daemon body into Run's `run()` method preserving Phase 122's bare-invocation behavior end-to-end.
- `swift-argument-parser` 1.7.1 in `.build/checkouts/` and pinned in `Package.resolved` — Plan 123-03's tests can `@testable import vigil_watch` and call `Run.parse(["--verbose"])` directly without re-resolving.

## Self-Check: PASSED

Verified:
- `Sources/vigil-watch/VigilWatchCLI.swift` exists (FOUND — confirmed via `ls`)
- `Sources/vigil-watch/Commands/{Run,Tail,Test,Install,Uninstall,Status}.swift` all exist (FOUND — 6/6)
- `Tests/VigilWatchTests/PackageTests.swift` exists (FOUND)
- `Package.resolved` exists at vigil-watch repo root (FOUND, contains "swift-argument-parser")
- Commit `d57ab39` exists (FOUND in vigil-watch repo)
- Commit `3ae22bd` exists (FOUND in vigil-watch repo)
- `Sources/vigil-watch/main.swift` does NOT exist (deleted intentionally per Rule 3 deviation)
- `swift build -c release` exits 0 (verified)
- `.build/release/vigil-watch --help` lists 6 subcommands (run, tail, test, install, uninstall, status) — count = 6 (verified)
- Full test suite: 112 tests, 1 pre-existing failing test case (StateStore milestone roundtrip — out of scope), 111 passing (verified)

## TDD Gate Compliance

N/A — Plan 123-01 is `type: execute`, not `type: tdd`. The PackageTests drift detector was added in Task 1.1 alongside the dependency pin (not as a separate RED gate); this is consistent with the plan's structure (single feat commit per task).

---
*Phase: 123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak*
*Completed: 2026-05-09*
