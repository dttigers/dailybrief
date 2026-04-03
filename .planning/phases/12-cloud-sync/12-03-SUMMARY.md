---
phase: 12-cloud-sync
plan: 03
subsystem: infra
tags: [cloudkit, sync, actor, change-token, last-write-wins]

# Dependency graph
requires:
  - phase: 12-cloud-sync plan 01
    provides: Thought model with syncStatus, cloudKitRecordID, lastSyncedAt
  - phase: 12-cloud-sync plan 02
    provides: CloudKitManager actor with zone setup and record mapping
provides:
  - SyncService actor with push/pull/sync orchestration
  - ThoughtStore sync-specific queries (fetchPendingSync, fetchPendingDeletions, markSynced, upsertFromCloud, etc.)
  - Last-write-wins conflict resolution
  - Incremental change token persistence
affects: [12-cloud-sync]

# Tech tracking
tech-stack:
  added: [os.Logger]
  patterns: [actor-based sync engine, CKServerChangeToken persistence, last-write-wins conflict resolution, soft-delete pattern]

key-files:
  created:
    - Sources/JarvisCore/Services/SyncService.swift
  modified:
    - Sources/JarvisCore/Storage/ThoughtStore.swift

key-decisions:
  - "Last-write-wins conflict resolution based on modifiedAt timestamps"
  - "Soft-delete pattern: delete() marks pendingDeletion, deletePermanently() removes row after CloudKit confirms"
  - "Change token persisted to UserDefaults via NSKeyedArchiver for incremental sync"
  - "Network/auth errors silently skipped -- sync is best-effort, retries next cycle"

patterns-established:
  - "Soft-delete pattern: mark for deletion sync before permanent removal"
  - "Incremental sync pattern: CKServerChangeToken persisted across app launches"
  - "Graceful degradation: network/auth errors don't crash, sync retries next cycle"

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 12, Plan 03: Sync Engine Summary

**SyncService actor with bidirectional CloudKit push/pull, last-write-wins conflict resolution, and incremental change token persistence**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended ThoughtStore with sync-specific queries: fetchPendingSync, fetchPendingDeletions, markSynced, markPendingDeletion, deletePermanently, upsertFromCloud, fetchByCloudKitRecordID
- Modified existing save/update/delete to set appropriate sync statuses (pending, pendingDeletion)
- Created SyncService actor with full push/pull/sync orchestration
- Implemented last-write-wins conflict resolution comparing modifiedAt timestamps
- Incremental change token persisted to UserDefaults for efficient subsequent syncs
- Graceful handling of network/auth errors without crashing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sync-specific queries to ThoughtStore** - `14c19b4` (feat)
2. **Task 2: Create SyncService actor with push, pull, and conflict resolution** - `29dc232` (feat)

**Plan metadata:** see below (docs commit)

## Files Created/Modified
- `Sources/JarvisCore/Services/SyncService.swift` - SyncService actor, SyncError enum, push/pull/sync methods, change token persistence
- `Sources/JarvisCore/Storage/ThoughtStore.swift` - Sync-specific queries, modified delete to soft-delete, save/update mark as pending

## Decisions Made
- Last-write-wins conflict resolution: compare remote vs local modifiedAt, skip remote if local is pending and newer
- Soft-delete pattern: delete() marks pendingDeletion, permanent removal only after CloudKit confirmation
- CKServerChangeToken stored in UserDefaults via NSKeyedArchiver for cross-launch persistence
- Network/auth CKErrors silently returned (no throw) -- sync retries on next cycle

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full sync engine ready for integration into app lifecycle
- Next plan can wire SyncService into AppDelegate with periodic timer and app lifecycle hooks
- CloudKit container and entitlements already configured from plan 12-02

---
*Phase: 12-cloud-sync, Plan: 03*
*Completed: 2026-04-03*
