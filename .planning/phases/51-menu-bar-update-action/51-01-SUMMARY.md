---
phase: 51
plan: 01
subsystem: DailyBriefMonitor
tags: [foundation, refactor, repo-path, compile-time-constant]
one_liner: "Compile-time repo root constant via #filePath walked up 3 levels, replacing hardcoded StatusChecker fallback"
dependency_graph:
  requires: []
  provides:
    - "RepoLocation.path (dailybrief repo root, compile-time baked)"
    - "RepoLocation.installScript (Scripts/install.sh absolute path)"
    - "RepoLocation.releaseBuildDir (.build/release absolute path)"
  affects:
    - "StatusChecker CLI binary discovery (no more hardcoded ~/Desktop path)"
tech_stack:
  added: []
  patterns:
    - "Swift #filePath compile-time literal (SE-0274)"
    - "NSString.appendingPathComponent for shell-ready path strings"
key_files:
  created:
    - "Sources/DailyBriefMonitor/RepoLocation.swift"
  modified:
    - "Sources/DailyBriefMonitor/StatusChecker.swift"
decisions:
  - "D-08: #filePath walked up exactly 3 levels (verified against live filesystem)"
  - "D-09: Hardcoded ~/Desktop/Local AI/dailybrief fallback fully deleted"
metrics:
  duration: "~3m"
  completed: "2026-04-07"
requirements: [DEV-01, DEV-02]
---

# Phase 51 Plan 01: Foundation — RepoLocation + StatusChecker Refactor Summary

## One-liner
Introduced `RepoLocation.swift` — a compile-time repo root derived from `#filePath` walked up 3 directory levels — and rerouted `StatusChecker`'s CLI binary discovery through it, killing the hardcoded `~/Desktop/Local AI/dailybrief` drift surface.

## What Shipped

### Task 1: `RepoLocation.swift` (new, commit `9a149ce`)
- New enum `RepoLocation` in `Sources/DailyBriefMonitor/RepoLocation.swift`.
- `static let path: String` — lazily evaluates `URL(fileURLWithPath: #filePath)` walked up 3 levels, baking the dailybrief repo root into the binary at parse time.
- `static var installScript: String` — `{path}/Scripts/install.sh` (ready for Plan 02).
- `static var releaseBuildDir: String` — `{path}/.build/release` (consumed by Task 2 + Plan 02).
- Walk-up count of 3 verified: `.../dailybrief/Sources/DailyBriefMonitor/RepoLocation.swift` → 3× `deleteLastPathComponent()` → `.../dailybrief`.
- Uses `#filePath` (SE-0274 absolute-path variant), NOT `#file` which may be shortened in release builds.
- Uses `(path as NSString).appendingPathComponent` to match the established StatusChecker convention for shell-passable path strings.

### Task 2: `StatusChecker.swift` refactor (commit `6b257ad`)
- Deleted both hardcoded `~/Desktop/Local AI/dailybrief/.build/{release,debug}/DailyBrief` candidates from `init()`.
- Dev-build candidates now derived from `RepoLocation.releaseBuildDir` and `(RepoLocation.path as NSString).appendingPathComponent(".build/debug")`.
- Installed path `~/.local/bin/DailyBrief` remains the first (preferred) candidate — behavior unchanged.
- Ordering preserved: installed → release dev build → debug dev build.
- No other StatusChecker behavior touched (`refresh`, `runNow`, `extractTimestamp`, PDF helpers all intact).
- No `import` added — same module (`DailyBriefMonitor`).

## Verification
- `grep -F "Desktop/Local AI/dailybrief" Sources/DailyBriefMonitor/StatusChecker.swift` → no matches (drift surface gone)
- `grep -F "RepoLocation.releaseBuildDir" Sources/DailyBriefMonitor/StatusChecker.swift` → 1 match
- `grep -F "RepoLocation.path" Sources/DailyBriefMonitor/StatusChecker.swift` → 1 match
- `grep -F "~/.local/bin/DailyBrief" Sources/DailyBriefMonitor/StatusChecker.swift` → 1 match
- `swift build -c release` → exit 0 (both after Task 1 and after Task 2)

## Commits
| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1 | `9a149ce` | feat | add RepoLocation compile-time repo root constant |
| 2 | `6b257ad` | refactor | route StatusChecker CLI lookup through RepoLocation |

## Deviations from Plan
None — plan executed exactly as written. Walk-up count of 3 was already verified in RESEARCH and confirmed live against the current filesystem layout before committing.

## Downstream Hooks for Plan 02
- `RepoLocation.installScript` is ready for the `UpdateService` to shell out to.
- `RepoLocation.releaseBuildDir` is ready for the mtime comparison logic (D-06).
- `RepoLocation.path` is ready if Plan 02 needs the repo root for `git rev-parse --short HEAD` (D-07).

## Self-Check: PASSED
- `Sources/DailyBriefMonitor/RepoLocation.swift` exists (verified `test -f`)
- `Sources/DailyBriefMonitor/StatusChecker.swift` modified (verified via grep — hardcoded path gone, RepoLocation references present)
- Commit `9a149ce` present in `git log`
- Commit `6b257ad` present in `git log`
- `swift build -c release` exit 0
