---
phase: 26-therapy-intelligence
plan: 02
subsystem: ui, api
tags: [swiftui, therapy-classification, dashboard, sidebar-filters]

# Dependency graph
requires:
  - phase: 26-therapy-intelligence
    provides: TherapyClassificationService actor, TherapyClassification enum, ThoughtStore therapy queries
provides:
  - Auto-classification of therapy thoughts after triage in all flows
  - Therapy classification badges on ThoughtRowView
  - Therapy sub-filters (Self-work, Therapist, Unclassified) in sidebar
  - Re-classify context menu action for therapy thoughts
  - ThoughtStore countTherapy and countUnclassifiedTherapy queries
affects: [26-therapy-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns: [therapy-sub-filter-enum, auto-classify-after-triage]

key-files:
  created: []
  modified:
    - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
    - Sources/DailyBriefMonitor/Dashboard/DashboardView.swift
    - Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift
    - Sources/DailyBriefMonitor/AppDelegate.swift
    - Sources/JarvisCore/Services/FolderWatcherService.swift
    - Sources/JarvisCore/Storage/ThoughtStore.swift

key-decisions:
  - "TherapySubFilter enum with .all/.classified/.unclassified for three-state therapy filtering"
  - "Green badge for self-work, orange for therapist — warm non-alarming colors"
  - "AI suggestions disclaimer shown under therapy sub-filters"

patterns-established:
  - "Auto-classify pattern: call classifyTherapyIfNeeded after any triage that yields .therapy"
  - "Sub-filter enum pattern: TherapySubFilter mirrors TaskStatus filter approach"

# Metrics
duration: 8min
completed: 2026-04-04
---

# Phase 26 Plan 02: Therapy Intelligence Integration & UI Summary

**Therapy classification wired into all triage flows with dashboard badges, sidebar sub-filters, and re-classify action**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-04
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- TherapyClassificationService auto-runs after triage assigns therapy category in dashboard (single, bulk, import) and folder watcher
- Therapy thought rows show green "Self-work" or orange "Therapist" badge pills
- Sidebar shows classification sub-filters with counts when Therapy category is selected
- Re-classify context menu action for manual re-classification
- "AI suggestions - not clinical advice" disclaimer in sidebar

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire TherapyClassificationService into triage flow** - `b753a28` (feat)
2. **Task 2: Add therapy classification UI to dashboard** - `d417a63` (feat)

## Files Created/Modified
- `Sources/DailyBriefMonitor/AppDelegate.swift` - Creates and passes TherapyClassificationService to ViewModel and FolderWatcher
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` - TherapySubFilter enum, classifyTherapyIfNeeded helper, therapy counts, re-classify
- `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` - Therapy sub-filter pills in sidebar with counts and disclaimer
- `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` - Classification badge pills, re-classify context menu
- `Sources/JarvisCore/Services/FolderWatcherService.swift` - Therapy classification after triage in audio/image processing
- `Sources/JarvisCore/Storage/ThoughtStore.swift` - countTherapy and countUnclassifiedTherapy query methods

## Decisions Made
- TherapySubFilter enum with .all/.classified(TherapyClassification)/.unclassified for three-state filtering (needed to distinguish "show all" from "show unclassified")
- Green for self-work, orange for therapist badges — consistent with plan spec
- Disclaimer text in .caption2 .secondary style under therapy sub-filters

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added countTherapy and countUnclassifiedTherapy to ThoughtStore**
- **Found during:** Task 1 (wiring classification service)
- **Issue:** ThoughtStore had no count methods for therapy classification sub-types
- **Fix:** Added countTherapy(classification:) and countUnclassifiedTherapy() queries
- **Files modified:** Sources/JarvisCore/Storage/ThoughtStore.swift
- **Verification:** swift build succeeds
- **Committed in:** b753a28 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary foundation for UI counts. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Therapy intelligence fully integrated: auto-classification, UI badges, sidebar filters
- Ready for any future therapy intelligence enhancements (batch classification, insights)

---
*Phase: 26-therapy-intelligence*
*Completed: 2026-04-04*
