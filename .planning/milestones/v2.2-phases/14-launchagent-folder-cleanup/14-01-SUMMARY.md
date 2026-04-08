---
phase: 14-launchagent-folder-cleanup
plan: 01
subsystem: infra
tags: [launchd, plist, nslog, diagnostics, macos]

# Dependency graph
requires:
  - phase: 08-launch-agent
    provides: LaunchAgent plist and install.sh for DailyBriefMonitor
provides:
  - Hardened LaunchAgent plist with session/process type constraints
  - Modern launchctl bootstrap/bootout API in install script
  - Startup diagnostic breadcrumbs in AppDelegate
  - CLI exit code tracking in StatusChecker
affects: [14-launchagent-folder-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [NSLog breadcrumb logging for crash diagnosis, launchctl bootstrap/bootout API]

key-files:
  created: []
  modified:
    - LaunchAgent/com.jamesonmorrill.dailybriefmonitor.plist
    - Scripts/install.sh
    - Sources/DailyBriefMonitor/AppDelegate.swift
    - Sources/DailyBriefMonitor/StatusChecker.swift

key-decisions:
  - "KeepAlive changed to SuccessfulExit:false dict to prevent restart loops on clean exit"
  - "LimitLoadToSessionType Aqua ensures GUI session availability before launch"
  - "Stale 'in progress' status now shows 'crashed?' with lastRunSuccess=false for better diagnostics"

patterns-established:
  - "NSLog breadcrumbs: log at entry, before each init phase, and at completion of applicationDidFinishLaunching"
  - "Modern launchctl API: use bootstrap/bootout with gui/$(id -u) domain target"

# Metrics
duration: 5min
completed: 2026-04-03
---

# Plan 14-01: LaunchAgent Crash Fix & Diagnostics Summary

**Hardened LaunchAgent plist with Aqua session constraints and added NSLog startup breadcrumbs with CLI exit code tracking**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-03
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- LaunchAgent plist now constrains to Aqua GUI sessions and declares Interactive process type, preventing SIGILL crashes when WindowServer is unavailable
- KeepAlive changed from bare true to SuccessfulExit:false dict to prevent infinite restart loops during debugging
- install.sh uses modern launchctl bootstrap/bootout API with post-install verification step
- AppDelegate logs NSLog breadcrumbs at each startup phase for crash diagnosis via monitor-stderr.log
- StatusChecker captures CLI process exit codes and logs non-zero exits; stale "in progress" states now display as "crashed?"

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix LaunchAgent plist and install script** - `708c5ee` (fix)
2. **Task 2: Add diagnostic logging and exit code handling** - `75744b9` (feat)

## Files Created/Modified
- `LaunchAgent/com.jamesonmorrill.dailybriefmonitor.plist` - Added LimitLoadToSessionType, ProcessType, KeepAlive dict; updated ProgramArguments to installed path
- `Scripts/install.sh` - Matching plist changes, bootstrap/bootout API, post-install verification
- `Sources/DailyBriefMonitor/AppDelegate.swift` - NSLog breadcrumbs at startup entry, config load, DB init, panel creation, folder watcher, cloud sync, and completion
- `Sources/DailyBriefMonitor/StatusChecker.swift` - Added lastExitCode property, exit code capture in runNow(), crash detection in refresh()

## Decisions Made
- KeepAlive changed to dict with SuccessfulExit:false rather than bare true -- prevents restart loops on intentional exit while still recovering from crashes
- "in progress?" changed to "crashed?" with lastRunSuccess=false -- more accurate for stale starts without completion

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- LaunchAgent is hardened for reliable auto-start at login
- Diagnostic logging in place for debugging any remaining startup issues
- Ready for next plan in phase 14

---
*Phase: 14-launchagent-folder-cleanup*
*Completed: 2026-04-03*
