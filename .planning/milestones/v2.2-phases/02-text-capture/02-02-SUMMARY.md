---
phase: 02-text-capture
plan: 02
subsystem: ui, system
tags: [carbon, global-hotkey, appkit, keyboard-shortcut]

# Dependency graph
requires:
  - phase: 02-text-capture
    provides: CapturePanel floating NSPanel with toggle/show/hide, AppDelegate with toggleCapture()
provides:
  - GlobalHotKey utility wrapping Carbon RegisterEventHotKey for system-wide shortcuts
  - Cmd+Shift+J hotkey to toggle capture panel from any application
  - Escape key dismissal on CapturePanel via cancelOperation
affects: [02-text-capture, 03-voice-capture]

# Tech tracking
tech-stack:
  added: [Carbon.HIToolbox]
  patterns: [Carbon event handler with Unmanaged pointer bridging, @MainActor Task dispatch from C callback]

key-files:
  created:
    - Sources/DailyBriefMonitor/GlobalHotKey.swift
  modified:
    - Sources/DailyBriefMonitor/AppDelegate.swift
    - Sources/DailyBriefMonitor/CapturePanel.swift

key-decisions:
  - "Carbon RegisterEventHotKey over NSEvent.addGlobalMonitorForEvents — no Accessibility permissions required"
  - "Capture panel reference directly in hotkey closure instead of weak self — avoids Swift 6 Sendable data race errors"
  - "Task { @MainActor } dispatch from hotkey callback to satisfy actor isolation for NSPanel methods"

patterns-established:
  - "Global hotkey pattern: Carbon C handler -> Unmanaged pointer -> DispatchQueue.main.async -> callback"
  - "Swift 6 main-actor bridge: Task { @MainActor in ... } for calling UI code from non-isolated closures"

# Metrics
duration: 5min
completed: 2026-04-01
---

# Plan 02-02: Global Hotkey for Capture Panel Summary

**System-wide Cmd+Shift+J hotkey via Carbon API toggles floating capture panel from any application without Accessibility permissions**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-01
- **Completed:** 2026-04-01
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- GlobalHotKey utility class wrapping Carbon RegisterEventHotKey / UnregisterEventHotKey
- Cmd+Shift+J registered in AppDelegate to toggle capture panel from any application
- Escape key dismissal added to CapturePanel via cancelOperation override
- No Accessibility permissions required (Carbon API, not NSEvent global monitor)
- Clean unregistration on app termination

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GlobalHotKey utility using Carbon API** - `d950da1` (feat)
2. **Task 2: Register Cmd+Shift+J hotkey in AppDelegate** - `cee5c68` (feat)

## Files Created/Modified
- `Sources/DailyBriefMonitor/GlobalHotKey.swift` - Carbon-based global hotkey registration utility
- `Sources/DailyBriefMonitor/AppDelegate.swift` - Hotkey registration on launch, cleanup on termination
- `Sources/DailyBriefMonitor/CapturePanel.swift` - Escape key dismissal via cancelOperation

## Decisions Made
- Used Carbon RegisterEventHotKey instead of NSEvent.addGlobalMonitorForEvents to avoid requiring Accessibility permissions
- Captured panel reference directly in hotkey closure rather than weak self to avoid Swift 6 Sendable data race errors with @unchecked Sendable class
- Used Task { @MainActor in } bridge to call NSPanel.toggle() from the non-isolated Carbon callback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Swift 6 actor isolation: callback closure accessing @MainActor method**
- **Found during:** Task 2 (Register hotkey in AppDelegate)
- **Issue:** `self?.toggleCapture()` in non-sendable closure caused "sending risks data races" error under Swift 6
- **Fix:** Captured `capturePanel` directly and dispatched via `Task { @MainActor in panel.toggle() }`
- **Files modified:** Sources/DailyBriefMonitor/AppDelegate.swift
- **Verification:** Clean build with zero errors and zero warnings
- **Committed in:** cee5c68 (Task 2 commit)

**2. [Rule 3 - Blocking] fileprivate access for callback property**
- **Found during:** Task 1 (GlobalHotKey utility)
- **Issue:** Top-level C handler function could not access `private` callback property on GlobalHotKey
- **Fix:** Changed `callback` from `private` to `fileprivate`
- **Files modified:** Sources/DailyBriefMonitor/GlobalHotKey.swift
- **Verification:** Clean build
- **Committed in:** d950da1 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes required for compilation under Swift 6. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full capture loop complete: Cmd+Shift+J -> floating panel -> type text -> Cmd+Enter -> SQLite persistence
- CAPT-01 satisfied (< 1s capture via hotkey + panel + Enter)
- CAPT-02 satisfied (global keyboard shortcut from any application)
- CAPT-05 confirmed (auto timestamps from Phase 1)
- Ready for Plan 02-03 or Phase 03 (voice capture)

---
*Phase: 02-text-capture*
*Completed: 2026-04-01*
