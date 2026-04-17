---
phase: 97-mac-cli-print-reliability
plan: 01
subsystem: cli
tags: [lpr, cups, lpstat, swift, printing, launchd]

# Dependency graph
requires:
  - phase: 86-split-brief-schedule
    provides: "Pull-only CLI, BriefScheduler, StatusChecker log-marker inference"
provides:
  - "PrintService throws typed errors on lpr failure and unreachable printer"
  - "CLI 404 fallback to POST /v1/brief/generate for ephemeral PDF recovery"
  - "100% actual-size lpr flags (fit-to-page=false, scaling=100)"
  - "Doctor printer reachability check via lpstat"
  - "Monitor title bar red badge on print failure"
  - "Legacy LaunchAgent com.jameson.dailysheet-print removed"
affects: [mac-cli-print-reliability]

# Tech tracking
tech-stack:
  added: []
  patterns: ["lpstat -p for printer reachability", "postRawData for on-demand PDF regeneration"]

key-files:
  created: []
  modified:
    - Sources/DailyBrief/Utilities/PrintService.swift
    - Sources/DailyBrief/DailyBrief.swift
    - Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift

key-decisions:
  - "Used both fit-to-page=false and scaling=100 (belt-and-suspenders) for actual-size printing"
  - "CLI retries via postRawData on 404 rather than server-side regenerate-on-GET, keeping fix in CLI scope"

patterns-established:
  - "PrintError typed enum for print path failures"
  - "lpstat -p reachability guard before lpr invocation"

requirements-completed: [FIX-03]

# Metrics
duration: 2min
completed: 2026-04-17
---

# Phase 97 Plan 01: Mac CLI Print Reliability Summary

**PrintService throws on lpr failure with reachability guard, CLI recovers from Railway /tmp 404 via POST generate, Monitor shows red badge on failure**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-17T00:22:36Z
- **Completed:** 2026-04-17T00:25:01Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- PrintService now throws PrintError.lprFailed on non-zero lpr exit (was silently swallowed)
- Added lpstat-based printer reachability check before invoking lpr (D-06)
- Added -o fit-to-page=false -o scaling=100 for 100% actual-size printing (D-07)
- CLI falls back to POST /v1/brief/generate when GET /v1/brief/:date returns 404 (ephemeral /tmp recovery)
- Doctor subcommand checks printer reachability via lpstat (D-08)
- Monitor title bar shows red foreground on exclamationmark.circle.fill failure icon (D-04)
- Legacy LaunchAgent com.jameson.dailysheet-print unloaded and plist deleted (D-05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix PrintService — throw on failure, add reachability check, add 100% scale flags** - `9dc03bc` (fix)
2. **Task 2: Fix CLI 404 fallback, add Doctor printer check, add red badge, remove legacy LaunchAgent** - `ccab10c` (fix)

## Files Created/Modified
- `Sources/DailyBrief/Utilities/PrintService.swift` - PrintError enum, reachability check, 100% scale flags, throw on failure
- `Sources/DailyBrief/DailyBrief.swift` - 404 fallback to POST generate, Doctor printer check (Check 7)
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` - Red foreground style on failure icon

## Decisions Made
- Used both fit-to-page=false and scaling=100 together for belt-and-suspenders 100% scale enforcement
- CLI retries via postRawData (existing VigilAPIClient method) on 404 — keeps fix entirely in CLI scope without server changes
- Legacy cleanup done as runtime operation (launchctl bootout + rm) rather than code-based cleanup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All code changes compile (swift build succeeds)
- Plan 02 (full-chain verification) can proceed to test the scheduled print path end-to-end
- Legacy LaunchAgent removed — no interference with current Monitor-based scheduling

## Self-Check: PASSED

All files exist, all commits verified, all content patterns confirmed.

---
*Phase: 97-mac-cli-print-reliability*
*Completed: 2026-04-17*
