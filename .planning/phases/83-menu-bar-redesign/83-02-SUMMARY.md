---
phase: 83-menu-bar-redesign
plan: 02
subsystem: ui
tags: [swift, swiftui, menubar, appdelegate, macos, dock]

# Dependency graph
requires:
  - phase: 83-01
    provides: print-schedule API (GET/PUT /v1/settings/print-schedule)
provides:
  - Trimmed AppDelegate — no openDashboard, no openSettings, no dashboard/settings window props
  - Slimmed MenuBarView — schedule row + Print Now + Quick Capture + Open Latest PDF + Update Vigil + View Log + Quit
  - Cleaned DailyBriefMonitorApp — no onDashboard/onSettings callbacks passed to MenuBarView
  - Zero NSApp.setActivationPolicy(.regular) calls in DailyBriefMonitor — Dock icon permanently absent
affects:
  - 83-03-scheduler-wiring
  - 83-04-print-now-api

# Tech tracking
tech-stack:
  added: []
  patterns:
    - MenuBarExtra-only app pattern — no NSWindow promotion, no setActivationPolicy(.regular)

key-files:
  created: []
  modified:
    - Sources/DailyBriefMonitor/AppDelegate.swift
    - Sources/DailyBriefMonitor/MenuBarView.swift
    - Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift

key-decisions:
  - "Deleted both setActivationPolicy(.regular) call sites (openDashboard + openSettings) to make Dock icon permanently absent"
  - "folderWatcher kept in AppDelegate — deferred scope per plan decision"
  - "Run Now label renamed to Print Now to match menu-bar-only mental model"

patterns-established:
  - "MenuBarExtra-only: MenuBarView receives only onCapture — no window-opening callbacks"

requirements-completed: [SC-1, SC-2, SC-5]

# Metrics
duration: 35min
completed: 2026-04-15
---

# Phase 83 Plan 02: Delete Dashboard/Settings UI + Trim AppDelegate Summary

**15 SwiftUI Dashboard/Settings files deleted, AppDelegate stripped to capture+hotkey+folderWatcher shell, MenuBarView slimmed to schedule+actions only — swift build passes with zero errors and zero setActivationPolicy calls remaining**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-15T00:25:00Z
- **Completed:** 2026-04-15T01:00:00Z
- **Tasks:** 2
- **Files modified:** 3 (modified) + 16 (deleted)

## Accomplishments

- Deleted 11 Dashboard/ SwiftUI views/viewmodels, 2 Settings/ files, ImagePicker.swift, GoogleCalendarAuth.swift, and DashboardViewModelPhotoPreviewTests.swift (16 files total)
- AppDelegate stripped of dashboardWindow, settingsWindow, projectsStore, insightService, therapyClassificationService, therapyPatternService, therapyPrepService — both `NSApp.setActivationPolicy(.regular)` call sites removed
- MenuBarView now has only `onCapture` callback — no Dashboard or Settings buttons; "Run Now" renamed to "Print Now"
- `swift build --product DailyBriefMonitor` passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete 15 Dashboard + Settings source files** - `0dcadfb` (chore)
2. **Task 2: Trim AppDelegate + slim MenuBarView + update app entry point** - `e9f4261` (feat)

## Files Created/Modified

### Deleted (16 files)
- `Sources/DailyBriefMonitor/Dashboard/BriefHistoryView.swift`
- `Sources/DailyBriefMonitor/Dashboard/BriefHistoryViewModel.swift`
- `Sources/DailyBriefMonitor/Dashboard/ChatView.swift`
- `Sources/DailyBriefMonitor/Dashboard/ChatViewModel.swift`
- `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift`
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift`
- `Sources/DailyBriefMonitor/Dashboard/LinkedThoughtsSheet.swift`
- `Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift`
- `Sources/DailyBriefMonitor/Dashboard/PhotoPreviewSheet.swift`
- `Sources/DailyBriefMonitor/Dashboard/TherapyPrepView.swift`
- `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift`
- `Sources/DailyBriefMonitor/Settings/SettingsView.swift`
- `Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift`
- `Sources/DailyBriefMonitor/ImagePicker.swift`
- `Sources/DailyBriefMonitor/GoogleCalendarAuth.swift`
- `Tests/DailyBriefMonitorTests/DashboardViewModelPhotoPreviewTests.swift`

### Modified (3 files)
- `Sources/DailyBriefMonitor/AppDelegate.swift` — removed dashboard/settings window props, insight/therapy services, projectsStore; removed openDashboard(), openSettings(), restartFolderWatcher()
- `Sources/DailyBriefMonitor/MenuBarView.swift` — removed onDashboard/onSettings props and buttons; renamed "Run Now" to "Print Now"
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` — removed onDashboard/onSettings arguments from MenuBarView call

## Decisions Made

- Removed both `NSApp.setActivationPolicy(.regular)` call sites (in openDashboard and openSettings) — these were the sole reason the Dock icon appeared; deleting them makes the app permanently menu-bar-only
- Kept `folderWatcher` in AppDelegate per user decision (deferred scope)
- Kept `thoughtStore` and `triageService` in AppDelegate — still required by CapturePanel's onTriage/onOverride closures
- Renamed "Run Now" → "Print Now" to match the menu-bar-only mental model where the action means printing a brief

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Worktree base commit mismatch on start — reset --soft to correct base `05e0c4d` before beginning work
- The `git reset --soft` preserved pre-existing staged changes from before the reset; unstaged all non-task files before committing Task 1 to keep commits atomic

## Threat Model Findings (T-83-07)

Ran `grep -r "setActivationPolicy" Sources/DailyBriefMonitor/` — **zero matches**. No activation policy calls remain anywhere in DailyBriefMonitor sources. CapturePanel does not call setActivationPolicy. T-83-07 fully mitigated.

## User Setup Required

None - no external service configuration required. After `./Scripts/install.sh`, confirm no Dock icon appears at launch.

## Next Phase Readiness

- AppDelegate shell is ready for Phase 83-03 (scheduler wiring to print-schedule API)
- MenuBarView schedule row already renders next-run time from BriefScheduler — ready to be wired to API-fetched schedule
- No Dashboard or Settings references remain — clean slate for PWA-only settings UI

## Known Stubs

None - no stub values introduced in this plan.

## Self-Check: PASSED

- FOUND: Sources/DailyBriefMonitor/AppDelegate.swift (modified — openDashboard/openSettings absent)
- FOUND: Sources/DailyBriefMonitor/MenuBarView.swift (modified — onCapture only)
- FOUND: Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift (modified — no onDashboard/onSettings)
- CONFIRMED: Dashboard/ directory empty
- CONFIRMED: Settings/ directory empty
- CONFIRMED: zero setActivationPolicy matches
- CONFIRMED: zero onDashboard/onSettings/openDashboard/openSettings matches
- CONFIRMED: "Print Now" label present in MenuBarView.swift line 108
- CONFIRMED: swift build --product DailyBriefMonitor passes (23.62s)
- FOUND: commit 0dcadfb (Task 1 — file deletions)
- FOUND: commit e9f4261 (Task 2 — trim AppDelegate + slim MenuBarView)

---
*Phase: 83-menu-bar-redesign*
*Completed: 2026-04-15*
