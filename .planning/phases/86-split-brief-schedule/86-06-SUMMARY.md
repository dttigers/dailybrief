---
phase: 86-split-brief-schedule
plan: 06
subsystem: [mac-monitor]
tags: [swift, menubar, staleness, log-parsing, gap-closure, tdd]
requirements: [SC-4]
gap_closure: true
dependency_graph:
  requires: [86-05]
  provides:
    - "External CLI invocations (launchd/cron/terminal) now drive the menubar staleness UI via log-marker inference"
    - "Log-line -> lastExitCode contract pinned by 6 unit tests (StatusCheckerTests)"
  affects:
    - Sources/DailyBriefMonitor/StatusChecker.swift
    - Tests/DailyBriefMonitorTests/StatusCheckerTests.swift
tech-stack:
  added: []
  patterns:
    - "Log-marker reverse walk in StatusChecker.refresh() writes lastExitCode for ALL invocation paths (not just runNow())"
    - "Parameterized internal init (Strategy A) enables unit-testable temp-log fixtures without touching production init()"
key-files:
  created:
    - Tests/DailyBriefMonitorTests/StatusCheckerTests.swift
  modified:
    - Sources/DailyBriefMonitor/StatusChecker.swift
decisions:
  - "Strategy A (parameterized init) over Strategy B (extract pure parser): 15-line widening of init vs. refactoring refresh() control flow. Keeps refresh() control flow byte-identical except for the new lastExitCode assignments; tests exercise the real reversed-lines walk, not a stand-in."
  - "Preserve lastExitCode on the 'No log file' and 'no markers found' branches instead of resetting to nil — avoids race where runNow()'s MainActor write is erased by its own refresh() before the CLI log flushes."
  - "Match on 'No brief for today' substring (not full regex on YYYY-MM-DD) — robust against date format tweaks and matches the exact Logger.log call site in DailyBrief.swift line 82."
metrics:
  duration_minutes: ~10
  tasks_completed: 2
  tasks_total: 2
  completed_date: "2026-04-15"
commits:
  - cc287ec: "feat(86-06): infer lastExitCode from log markers in StatusChecker.refresh()"
  - 269793e: "test(86-06): add StatusCheckerTests covering log-line -> lastExitCode inference"
---

# Phase 86 Plan 06: Gap Closure — StatusChecker Log-Based Exit Code Inference Summary

Teach `StatusChecker.refresh()` to infer `lastExitCode` from the most recent terminal log marker so externally-invoked CLI runs (launchd/cron/terminal) surface correctly in the menubar. Closes the UAT Test 2 blocker where Plan 05's staleness UI was invisible for non-`runNow()` invocations.

## What changed in `refresh()`

The reversed-lines walk now writes `lastExitCode` alongside the existing `lastRunTime` / `lastRunSuccess` updates. New branch table:

| Line contains          | lastExitCode | lastRunSuccess | lastRunTime                        |
|------------------------|--------------|----------------|------------------------------------|
| `DailyBrief complete`  | `0`          | `true`         | timestamp                          |
| `No brief for today`   | `2`          | `false`        | timestamp                          |
| `ERROR`                | `1`          | `false`        | timestamp                          |
| `DailyBrief starting`  | `1`          | `false`        | timestamp + `" (crashed?)"`        |
| *(no markers found)*   | **preserved** | `nil`         | `"No runs found"`                  |
| *(log file missing)*   | **preserved** | `nil`         | `"No log file"`                    |

First matching marker in reverse order wins (most recent entry). The two "no signal" branches intentionally leave `lastExitCode` untouched so `runNow()`'s MainActor write isn't clobbered by its own post-run `refresh()` before the CLI flushes its log.

## Strategy choice (A vs B)

**Strategy A (parameterized init) — chosen.** Added:

```swift
init(
    logPath: String,
    pdfDir: String = ...,
    configPath: String = ...,
    cliBinary: String = ...
)
```

Existing zero-arg `init()` became a `convenience init` delegating to it with the hard-coded default paths. Net additions: ~15 lines. Rejected Strategy B (extract `inferState(from:)` pure function) because refactoring the control flow would risk regressing the reversed-lines walk; Strategy A exercises the real `refresh()` path in tests.

## Test coverage (`StatusCheckerTests.swift`)

6 XCTest cases — all pass, full suite green (21/21):

| # | Name                                       | Asserts                                    |
|---|--------------------------------------------|--------------------------------------------|
| 1 | `testSuccessLogInfersExitZero`             | exit 0, isStale=false, lastRunTime parsed  |
| 2 | `testNoBriefForTodayLogInfersExitTwo`      | exit 2, isStale=true, didFailNonStale=false|
| 3 | `testErrorLogInfersExitOne`                | exit 1, didFailNonStale=true               |
| 4 | `testStartingWithoutCompleteInfersExitOne` | exit 1, lastRunTime contains `(crashed?)`  |
| 5 | `testMostRecentMarkerWinsInReverseWalk`    | stale wins when it's newer than complete   |
| 6 | `testNoMarkersPreservesPriorExitCode`      | runNow() race guard — empty log preserves  |

Fixtures: unique temp-log per test via `NSTemporaryDirectory() + UUID`, cleaned up in `tearDown`.

## Regression posture

- **`isStale` / `didFailNonStale`** — byte-identical to Plan 05 source (unchanged).
- **`runNow()`** — body byte-identical; still writes `lastExitCode = exitCode` then calls `refresh()`. When refresh() then finds the just-flushed log marker it will overwrite with the log-inferred value — which matches the in-process exit code by construction (same run, same log line), so no behavioral change for the menubar "Print Now" button.
- **`MenuBarView`** — not modified this plan. Plan 05's `statusIcon` / `statusLine` / `statusLineTint` wiring already branches on `isStale` / `didFailNonStale`, which are now correctly driven for external runs.
- **`extractTimestamp`, `todaysPDFPath`, `latestPDFPath`, `logFilePath`, `configFilePath`** — untouched.
- **Full test suite:** `swift test` passes 21/21 (15 FolderWatcherServiceTests + 6 new StatusCheckerTests); no FolderWatcher regression.

## Closes UAT Test 2

Before this plan: external CLI run logs `[2026-04-15 04:02:11] [INFO] No brief for today (2026-04-15)` → menubar shows "No runs found" (no icon change). After: same log line → `lastExitCode = 2` → orange `exclamationmark.triangle.fill` + "No brief today" per Plan 05's copy/tint map.

## Deviations from Plan

None — plan executed exactly as written. Strategy A adopted as plan-preferred. Only adjustment: the convenience initializer restructure required making the four stored `let` properties declared without defaults and set inside the new designated init (Swift requires all stored properties to be initialized before `self` is used; the plan's inline code sketch implicitly assumed this).

## Authentication gates

None — pure local Swift edits.

## Self-Check: PASSED

- FOUND: `Sources/DailyBriefMonitor/StatusChecker.swift`
- FOUND: `Tests/DailyBriefMonitorTests/StatusCheckerTests.swift`
- FOUND commit: `cc287ec` (Task 1 — refresh() log-marker inference + parameterized init)
- FOUND commit: `269793e` (Task 2 — StatusCheckerTests, 6 cases)
- grep acceptance criteria: all present, no `lastExitCode = nil` assignments on no-signal branches
- `swift build --target DailyBriefMonitor`: succeeds
- `swift test`: 21/21 green
