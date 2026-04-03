---
phase: 12-cloud-sync
plan: 03
subsystem: infra
tags: [cloudkit, sync, grdb, actor, conflict-resolution, change-token]

# Dependency graph
requires:
  - phase: 12-cloud-sync plan 01
    provides: Thought model with syncStatus, cloudKitRecordID, lastSyncedAt fields
  - phase: 12-cloud-sync plan 02
    provides: CloudKitManager actor with zone setup, record mapping, ThoughtCloudData
provides:
  - SyncService actor with push/pull/sync orchestration
  - ThoughtStore sync-specific queries (fetchPendingSync, upsertFromCloud, etc.)
  - Last-write-wins conflict resolution
  - CKServerChangeToken persistence for incremental sync
  - SyncError enum for structured error handling
affects: [12-cloud-sync]

# Tech tracking
tech-stack:
  added: [os.Logger]
  patterns: [incremental-sync-with-change-tokens, last-write-wins-conflict-resolution, soft-delete-for-sync]

key-files:
  created: [Sources/JarvisCore/Services/SyncService.swift]
  modified: [Sources/JarvisCore/Storage/ThoughtStore.swift]

key-decisions:
  - "delete() soft-deletes (marks pendingDeletion) — permanent removal only after CloudKit confirms sync"
  - "save()/update() automatically set syncStatus=pending so all local changes trigger sync"
  - "Last-write-wins by modifiedAt: remote wins unless local is newer AND pending"
  - "Network/auth errors silently skip sync rather than throwing — best-effort approach"

patterns-established:
  - "Soft-delete pattern: delete marks as pendingDeletion, deletePermanently removes row after sync"
  - "Change token persistence: NSKeyedArchiver/Unarchiver to/from UserDefaults"
  - "Sync guard pattern: isSyncing flag prevents concurrent sync operations"

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 12, Plan 03: SyncService Summary

**SyncService actor with bidirectional CloudKit push/pull, last-write-wins conflict resolution, and incremental change token persistence**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-03
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- ThoughtStore extended with 7 sync-specific methods: fetchPendingSync, fetchPendingDeletions, markSynced, markPendingDeletion, deletePermanently, upsertFromCloud, fetchByCloudKitRecordID
- Existing delete() changed to soft-delete (marks pendingDeletion); save()/update() now set syncStatus=pending
- SyncService actor created with full push/pull cycle, CKServerChangeToken persistence, and SyncError enum
- Last-write-wins conflict resolution: remote wins unless local is newer with pending changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sync-specific queries to ThoughtStore** - `14c19b4` (feat)
2. **Task 2: Create SyncService actor with push, pull, and conflict resolution** - `29dc232` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Services/SyncService.swift` - SyncService actor, SyncError enum
- `Sources/JarvisCore/Storage/ThoughtStore.swift` - 7 new sync methods, modified save/update/delete for sync tracking

## Decisions Made
- delete() now soft-deletes by setting syncStatus=pendingDeletion; permanent removal only after CloudKit confirms
- save()/update() automatically mark syncStatus=pending so all local changes are picked up by sync
- Network/auth CKErrors (notAuthenticated, networkUnavailable, networkFailure) silently skip rather than crash
- CKServerChangeToken persisted via NSKeyedArchiver to UserDefaults for incremental sync across app restarts

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Actor isolation: initial implementation called ThoughtStore methods without `await` from SyncService context; fixed by adding proper `await` for all cross-actor calls
- CKDatabase.recordZoneChanges return tuple uses `changeToken` member name, not `serverChangeToken` as assumed in plan; corrected to match actual API

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full sync engine ready: push local changes, pull remote changes, handle conflicts
- Next plan can wire SyncService into app lifecycle (auto-sync on launch, periodic sync)
- CloudKit entitlements and zone setup from 12-02 combined with this sync engine provide complete infrastructure

---
*Phase: 12-cloud-sync, Plan: 03*
*Completed: 2026-04-03*
