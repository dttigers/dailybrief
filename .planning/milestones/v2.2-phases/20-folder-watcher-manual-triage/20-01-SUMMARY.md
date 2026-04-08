---
phase: 20-folder-watcher-manual-triage
plan: 01
subsystem: ui
tags: [swiftui, triage, claude-api, dashboard]

requires:
  - phase: 19-bug-fixes
    provides: stable dashboard and triage pipeline
provides:
  - Manual re-triage button on each thought row in dashboard
  - Loading state tracking per-thought during re-triage
affects: []

tech-stack:
  added: []
  patterns: [per-row loading state via tracked ID property]

key-files:
  created: []
  modified:
    - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
    - Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift
    - Sources/DailyBriefMonitor/Dashboard/DashboardView.swift

key-decisions:
  - "Used arrow.clockwise SF Symbol for re-triage button — subtle and recognizable"
  - "Replace category pill with spinner during re-triage rather than overlay — cleaner visual feedback"
  - "Always show re-triage button when triageService is available (onRetriage non-nil) regardless of category"

patterns-established:
  - "Per-row loading state: track single ID in viewModel, compare in row view"

duration: 5min
completed: 2026-04-04
---

# Phase 20, Plan 01: Manual Re-Triage Summary

**Re-triage button on each dashboard thought row with per-row loading state and category update via TriageService**

## Performance

- **Duration:** 5 min
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `reTriageThought` async method to DashboardViewModel with `retriagingThoughtId` loading state
- Added re-triage button (arrow.clockwise icon) to ThoughtRowView metadata row
- Wired button callbacks and loading state through DashboardView to viewModel
- Category pill replaced with spinner + "Categorizing..." text during re-triage

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reTriageThought method to DashboardViewModel** - `1712efa` (feat)
2. **Task 2: Add re-triage button to ThoughtRowView and wire in DashboardView** - `0e962f6` (feat)

## Files Created/Modified
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` - Added retriagingThoughtId property and reTriageThought method
- `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` - Added onRetriage callback, isRetriaging property, conditional spinner/button UI
- `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` - Wired onRetriage and isRetriaging to ThoughtRowView instances

## Decisions Made
- Used `arrow.clockwise` SF Symbol for the re-triage button — universally recognized refresh/retry icon
- Replace category pill with spinner during re-triage rather than showing both — cleaner visual
- Button hidden when `onRetriage` is nil (no triage service), shown otherwise regardless of thought category

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Manual re-triage feature complete and ready for use
- Dashboard UI enhanced with per-thought AI recategorization

---
*Phase: 20-folder-watcher-manual-triage*
*Completed: 2026-04-04*
