---
phase: 92-work-order-archive
plan: 01
subsystem: api
tags: [drizzle, hono, postgres, soft-delete, archive, work-orders]

requires:
  - phase: 66-work-orders
    provides: work_orders table and GET/sync endpoints

provides:
  - archivedAt soft-delete column on work_orders table
  - Lazy auto-archive logic in GET /work-orders (syncedAt >7d, done >7d)
  - Filter query param on GET /work-orders (active|archived|all)
  - PUT /work-orders/:caseNumber/unarchive endpoint
  - DELETE /work-orders/archived bulk hard-delete endpoint
  - PWA client functions for archive operations

affects: [92-02-pwa-archive-ui]

tech-stack:
  added: []
  patterns: [lazy-evaluation-on-read, soft-delete-via-timestamp, batched-archive-updates]

key-files:
  created: []
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/src/routes/work-orders.ts
    - vigil-pwa/src/api/client.ts

key-decisions:
  - "Lazy auto-archive evaluates on every GET -- no cron or timer needed"
  - "Batched single UPDATE for all orders needing archive in one query"
  - "Filter param defaults to 'active' with allowlist validation (T-92-02)"
  - "DELETE endpoint uses isNotNull(archivedAt) WHERE clause -- cannot delete active orders"

patterns-established:
  - "Lazy archive: evaluate stale rules on read, batch-update, then filter"
  - "Soft-delete via nullable timestamp column (null=active, set=archived)"

requirements-completed: [WO-01, WO-02, WO-03, WO-04, WO-05, WO-06]

duration: 2min
completed: 2026-04-16
---

# Phase 92 Plan 01: Work Order Archive API Summary

**Soft-delete archivedAt column with lazy auto-archive on GET, filter param, unarchive endpoint, bulk-delete endpoint, and PWA client functions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-16T19:15:06Z
- **Completed:** 2026-04-16T19:17:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- archivedAt nullable timestamp added to work_orders table and pushed to Railway Postgres
- GET /work-orders lazily archives stale orders (syncedAt >7d or done status >7d) with batched update, then filters by active/archived/all
- PUT unarchive endpoint restores individual orders; DELETE endpoint hard-deletes all archived orders plus their statuses
- PWA API client updated with filter param, unarchiveWorkOrder, and deleteArchivedWorkOrders functions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add archivedAt column and lazy auto-archive logic** - `bbcbe5d` (feat)
2. **Task 2: Add unarchive, bulk-delete endpoints and PWA client functions** - `1b2b812` (feat)

## Files Created/Modified
- `vigil-core/src/db/schema.ts` - Added archivedAt nullable timestamp to workOrders table
- `vigil-core/src/routes/work-orders.ts` - Lazy auto-archive in GET, filter param, PUT unarchive, DELETE archived endpoints
- `vigil-pwa/src/api/client.ts` - archivedAt on interface, getWorkOrders filter param, unarchiveWorkOrder, deleteArchivedWorkOrders

## Decisions Made
- Lazy auto-archive evaluates on every GET request -- bounded by total work order count (typically <50), acceptable overhead
- All current work orders are Gmail-imported (manual entry path does not exist yet), so syncedAt >7d rule covers all orders; TODO comment added for future D-05 manual order exemption
- Filter param validated against allowlist; invalid values default to "active" (T-92-02)
- DELETE /work-orders/archived uses isNotNull(archivedAt) WHERE clause guaranteeing only archived orders are deleted (T-92-01)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - schema change applied via drizzle-kit push. Railway deploy will pick up via programmatic migrate().

## Next Phase Readiness
- All API endpoints and PWA client functions ready for Phase 92 Plan 02 (PWA archive UI)
- StatusFilterTabs component from Phase 91 available for reuse with Active/Archived/All options

---
*Phase: 92-work-order-archive*
*Completed: 2026-04-16*
