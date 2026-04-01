---
phase: 02-text-capture
plan: 01
subsystem: ui, database
tags: [swiftui, appkit, nspanel, grdb, actor, capture]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: GRDB storage layer (DatabaseManager, ThoughtStore, Thought model)
provides:
  - CaptureService actor in JarvisCore for persisting text thoughts
  - CapturePanel floating NSPanel for quick capture UI
  - CaptureView SwiftUI text input with Cmd+Enter submit
  - Quick Capture menu bar button in DailyBriefMonitor
affects: [02-text-capture, 03-voice-capture, 04-triage]

# Tech tracking
tech-stack:
  added: []
  patterns: [actor service layer wrapping store, closure-based view decoupling, NSPanel floating window]

key-files:
  created:
    - Sources/JarvisCore/Services/CaptureService.swift
    - Sources/DailyBriefMonitor/CapturePanel.swift
    - Sources/DailyBriefMonitor/CaptureView.swift
    - Sources/DailyBriefMonitor/AppDelegate.swift
  modified:
    - Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift
    - Sources/DailyBriefMonitor/MenuBarView.swift

key-decisions:
  - "CaptureView takes closure instead of CaptureService directly — keeps view testable and decoupled"
  - "AppDelegate handles DB init failure gracefully — logs error, panel still renders but capture fails"
  - "Added @MainActor to toggleCapture() to satisfy Swift 6 actor isolation for NSPanel methods"

patterns-established:
  - "Service actor pattern: CaptureService wraps ThoughtStore with domain-specific validation"
  - "Floating panel pattern: NSPanel subclass with toggle/show/hide API, hosted SwiftUI view"
  - "AppDelegate data stack init: DatabaseManager -> ThoughtStore -> Service, wired to UI via closures"

# Metrics
duration: 5min
completed: 2026-04-01
---

# Plan 02-01: Capture UI and Service Layer Summary

**CaptureService actor in JarvisCore with floating NSPanel capture UI wired to menu bar Quick Capture button**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-01
- **Completed:** 2026-04-01
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- CaptureService actor in JarvisCore wraps ThoughtStore with input validation (empty content rejection)
- Floating CapturePanel (NSPanel) stays above other windows with toggle/show/hide
- CaptureView with text input, character count, Cmd+Enter submit, Escape dismiss, success feedback
- "Quick Capture" (Cmd+N) button added to DailyBriefMonitor menu bar dropdown
- AppDelegate initializes full JarvisCore data stack on launch

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CaptureService actor in JarvisCore** - `61d5166` (feat)
2. **Task 2: Create CapturePanel and CaptureView** - `85bbbc0` (feat)
3. **Task 3: Wire capture into DailyBriefMonitor app** - `51e1c98` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Services/CaptureService.swift` - Actor wrapping ThoughtStore with captureText validation
- `Sources/DailyBriefMonitor/CapturePanel.swift` - Floating NSPanel subclass for capture window
- `Sources/DailyBriefMonitor/CaptureView.swift` - SwiftUI text input with closure-based capture
- `Sources/DailyBriefMonitor/AppDelegate.swift` - Data stack init and panel management
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` - Added AppDelegate adaptor, passed onCapture to MenuBarView
- `Sources/DailyBriefMonitor/MenuBarView.swift` - Added Quick Capture button with Cmd+N shortcut

## Decisions Made
- CaptureView takes closures (onCapture, onDismiss) instead of direct CaptureService dependency for testability
- AppDelegate handles DatabaseManager init failure gracefully with logging rather than crashing
- Added @MainActor to toggleCapture() to resolve Swift 6 actor isolation warning for NSPanel method calls

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Swift 6 actor isolation warning on toggleCapture()**
- **Found during:** Task 3 (Wire capture into DailyBriefMonitor)
- **Issue:** CapturePanel.toggle() is main-actor-isolated (inherited from NSPanel), but toggleCapture() was nonisolated
- **Fix:** Added @MainActor annotation to toggleCapture()
- **Files modified:** Sources/DailyBriefMonitor/AppDelegate.swift
- **Verification:** Clean build with zero warnings
- **Committed in:** 51e1c98 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix required for clean compilation under Swift 6 concurrency. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Capture loop complete: menu bar -> floating panel -> text input -> SQLite persistence
- Ready for Plan 02-02: global hotkey for capture panel (CAPT-01 full satisfaction)
- CaptureService available in JarvisCore for voice capture (Phase 03) and triage (Phase 04)

---
*Phase: 02-text-capture*
*Completed: 2026-04-01*
