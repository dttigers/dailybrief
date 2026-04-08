---
phase: 46-remove-dual-code-paths
plan: 01
subsystem: database, infra
tags: [grdb, sqlite, cloudkit, cleanup, dead-code]

# Dependency graph
requires:
  - phase: 34-api-thought-store
    provides: APIThoughtStore as replacement for GRDB-backed ThoughtStore
provides:
  - Removed GRDB/SQLite dependency from project
  - Removed CloudKit sync infrastructure
  - Clean Thought and ThoughtLink models without database conformances
  - Package.swift with no GRDB or CloudKit references
affects: [46-02, 46-03, 46-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [models-as-plain-structs]

key-files:
  created: []
  modified:
    - Sources/JarvisCore/Models/Thought.swift
    - Sources/JarvisCore/Models/ThoughtLink.swift
    - Sources/JarvisCore/Storage/APIThoughtStore.swift
    - Package.swift

key-decisions:
  - "Kept cloudKitRecordID/syncStatus/lastSyncedAt in APIThoughtResponse (private Decodable) since API still returns them — just dropped from Thought model"

patterns-established:
  - "Models as plain Codable/Sendable structs without database framework conformances"

# Metrics
duration: 3min
completed: 2026-04-05
---

# Plan 46-01: Remove Local Storage and GRDB Summary

**Deleted 5 local-only files (1681 lines) and stripped GRDB/CloudKit from models and Package.swift**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-05
- **Completed:** 2026-04-05
- **Tasks:** 2
- **Files modified:** 4 modified, 5 deleted

## Accomplishments
- Deleted DatabaseManager, ThoughtStore, SyncService, CloudKitManager, FolderWatcherService (1681 lines of dead code)
- Removed GRDB package dependency and CloudKit linker setting from Package.swift
- Cleaned Thought and ThoughtLink models: removed GRDB conformances, SyncStatus enum, CloudKit fields
- Fixed APIThoughtStore toThought() to match cleaned Thought initializer

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete local-only storage and sync files** - `169d395` (refactor)
2. **Task 2: Remove GRDB from models and Package.swift** - `b45221c` (refactor)

## Files Created/Modified
- `Sources/JarvisCore/Storage/DatabaseManager.swift` - Deleted (SQLite/GRDB lifecycle)
- `Sources/JarvisCore/Storage/ThoughtStore.swift` - Deleted (GRDB-backed repository)
- `Sources/JarvisCore/Services/SyncService.swift` - Deleted (CloudKit sync)
- `Sources/JarvisCore/Services/CloudKitManager.swift` - Deleted (CloudKit management)
- `Sources/JarvisCore/Services/FolderWatcherService.swift` - Deleted (folder monitoring)
- `Sources/JarvisCore/Models/Thought.swift` - Stripped GRDB conformances, removed SyncStatus/CloudKit fields
- `Sources/JarvisCore/Models/ThoughtLink.swift` - Stripped GRDB conformances
- `Sources/JarvisCore/Storage/APIThoughtStore.swift` - Updated toThought() for cleaned model
- `Package.swift` - Removed GRDB dependency and CloudKit linker setting

## Decisions Made
- Kept cloudKitRecordID/syncStatus/lastSyncedAt in the private APIThoughtResponse Decodable struct since the API may still return those fields — just stopped passing them to Thought init

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed APIThoughtStore compile error from removed Thought fields**
- **Found during:** Task 2 (Remove GRDB from models)
- **Issue:** APIThoughtStore.toThought() passed cloudKitRecordID, syncStatus, lastSyncedAt to Thought init which no longer accepts them
- **Fix:** Removed the three parameters from Thought init call in toThought()
- **Files modified:** Sources/JarvisCore/Storage/APIThoughtStore.swift
- **Verification:** grep confirms no remaining references to removed fields in Thought model
- **Committed in:** b45221c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix to prevent compile error in APIThoughtStore. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Expected compile errors remain in DailyBrief.swift and AppDelegate.swift (reference deleted DatabaseManager, ThoughtStore, FolderWatcherService, CloudKitManager)
- These will be resolved in Plans 03 and 04 of this phase
- Plan 02 should proceed next (likely removing references from consumer files or further cleanup)

---
*Phase: 46-remove-dual-code-paths*
*Completed: 2026-04-05*
