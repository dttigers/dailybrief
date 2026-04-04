---
phase: 19-bug-fixes
plan: 01
subsystem: database, services
tags: [grdb, fts5, sqlite, folder-watcher, triage]

requires:
  - phase: 14-dashboard
    provides: DashboardViewModel triage persistence pattern
provides:
  - Deduplicated FTS5 search results in ThoughtStore
  - Triage persistence in FolderWatcherService for audio and image files
affects: [dashboard-search, folder-watcher]

tech-stack:
  added: []
  patterns: [actor-isolated ThoughtStore access with await]

key-files:
  created: []
  modified:
    - Sources/JarvisCore/Storage/ThoughtStore.swift
    - Sources/JarvisCore/Services/FolderWatcherService.swift
    - Sources/DailyBriefMonitor/AppDelegate.swift

key-decisions:
  - "Used .all().distinct() for GRDB FTS5 deduplication since .distinct() is on DerivableRequest, not TableRecord directly"

patterns-established:
  - "FTS5 search should always use .distinct() to prevent duplicate rows from multi-token matches"
  - "All triage callers must persist category/confidence back to ThoughtStore after computing"

duration: 8min
completed: 2026-04-04
---

# Plan 19-01: Fix Duplicate Thoughts and Folder Watcher Triage Summary

**FTS5 search deduplicated with .distinct() and folder watcher triage results now persist to database**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- FTS5 search no longer returns duplicate Thought rows when queries match multiple tokens
- Search results now consistently sorted by createdAt descending
- Folder watcher audio and image processing now persists triage category and confidence to the database
- FolderWatcherService init accepts ThoughtStore parameter, wired through AppDelegate

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix duplicate thoughts in FTS5 search** - `c0da367` (fix)
2. **Task 2: Fix folder watcher triage persistence** - `f8d1767` (fix)

## Files Created/Modified
- `Sources/JarvisCore/Storage/ThoughtStore.swift` - Added .all().distinct() and .order() to FTS5 search query
- `Sources/JarvisCore/Services/FolderWatcherService.swift` - Added thoughtStore property, updated init, persist triage in processAudioFile and processImageFile
- `Sources/DailyBriefMonitor/AppDelegate.swift` - Pass thoughtStore to FolderWatcherService init

## Decisions Made
- Used `.all().distinct()` instead of `.distinct()` directly on Thought type, since GRDB's `distinct()` is defined on `DerivableRequest` protocol (returned by `.all()`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] GRDB .distinct() API mismatch**
- **Found during:** Task 1 (FTS5 search fix)
- **Issue:** Plan specified `Thought.distinct()` but GRDB requires `Thought.all().distinct()` since distinct() is on DerivableRequest
- **Fix:** Changed to `Thought.all().distinct()` chain
- **Files modified:** Sources/JarvisCore/Storage/ThoughtStore.swift
- **Verification:** swift build succeeds
- **Committed in:** c0da367

**2. [Rule 3 - Blocking] Actor isolation requires await on ThoughtStore.update()**
- **Found during:** Task 2 (folder watcher triage persistence)
- **Issue:** ThoughtStore is an actor; calling update() from FolderWatcherService requires `await`
- **Fix:** Changed `try thoughtStore.update(t)` to `try await thoughtStore.update(t)`
- **Files modified:** Sources/JarvisCore/Services/FolderWatcherService.swift
- **Verification:** swift build succeeds
- **Committed in:** f8d1767

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bug fixes complete, search and folder watcher working correctly
- Ready for next plan in phase 19

---
*Phase: 19-bug-fixes*
*Completed: 2026-04-04*
