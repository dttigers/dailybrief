---
phase: 92-work-order-archive
plan: 02
subsystem: ui
tags: [react, pwa, filter-tabs, archive-ui, work-orders]

requires:
  - phase: 92-work-order-archive-01
    provides: archivedAt column, filter API param, unarchive/delete endpoints, PWA client functions

provides:
  - Active/Archived/All filter tabs on Work Orders page
  - Archived row styling (dimmed) with Unarchive button
  - Clear Archived button with confirmation dialog
  - Filter-aware data fetching in useWorkOrders hook

affects: []

tech-stack:
  added: []
  patterns: [inline-filter-tabs-matching-StatusFilterTabs-visual, archive-aware-row-styling]

key-files:
  created: []
  modified:
    - vigil-pwa/src/hooks/useWorkOrders.ts
    - vigil-pwa/src/pages/WorkOrdersPage.tsx
    - vigil-pwa/src/components/WorkOrderRow.tsx

key-decisions:
  - "Inline filter tabs instead of generalizing StatusFilterTabs (different type signature, simpler)"
  - "AI prioritization skipped for archived/all filters (only active orders need ranking)"
  - "Clear Archived button uses window.confirm per D-09 for explicit user acknowledgment"

patterns-established:
  - "Archive filter tabs: inline pill buttons matching StatusFilterTabs visual pattern"
  - "Conditional row actions: isArchived prop swaps status cycle button for Unarchive"

requirements-completed: [WO-04, WO-05, WO-06]

duration: 2min
completed: 2026-04-16
---

# Phase 92 Plan 02: PWA Archive UI Summary

**Active/Archived/All filter tabs with dimmed archived row styling, per-row Unarchive button, and Clear Archived bulk-delete with confirmation dialog**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-16T19:18:35Z
- **Completed:** 2026-04-16T19:21:01Z
- **Tasks:** 2 of 2 code tasks completed (Task 3 is human-verify checkpoint)
- **Files modified:** 3

## Accomplishments
- useWorkOrders hook accepts filter param, passes to API, skips AI prioritization for non-active filters
- WorkOrdersPage shows Active | Archived | All pill tabs with teal active styling, default Active
- Summary line dynamically reflects current filter context (open/done counts, archived count, active/archived split)
- Archived rows display dimmed (opacity-50) with teal outlined Unarchive button replacing status cycle
- Clear Archived button visible only on Archived tab when orders exist, with confirmation dialog showing count

## Task Commits

Each task was committed atomically:

1. **Task 1: Add filter state to useWorkOrders and wire filter tabs into WorkOrdersPage** - `640bcb4` (feat)
2. **Task 2: Add archived row styling, Unarchive button, and Clear Archived with confirmation** - `0dc06fc` (feat)
3. **Task 3: Verify archive flow end-to-end** - Pending human verification checkpoint

## Files Created/Modified
- `vigil-pwa/src/hooks/useWorkOrders.ts` - Added WorkOrderFilter type, filter param, unarchive/deleteAllArchived functions, skip prioritization for non-active
- `vigil-pwa/src/pages/WorkOrdersPage.tsx` - Filter tabs, filter-aware summary line, Clear Archived button with confirmation, isArchived/onUnarchive props to rows
- `vigil-pwa/src/components/WorkOrderRow.tsx` - isArchived/onUnarchive props, dimmed styling, Unarchive button replacing status cycle for archived rows

## Decisions Made
- Inline filter tabs created instead of generalizing StatusFilterTabs -- different type signature (WorkOrderFilter vs TaskStatusFilter), simpler than adding generics
- Clear Archived button and confirmation dialog implemented in Task 1 commit alongside page changes (plan split them across Task 1/2 but they're naturally co-located in WorkOrdersPage)
- AI prioritization skipped entirely for archived/all filters -- archived orders don't need ranking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Merged Clear Archived button into Task 1 page changes**
- **Found during:** Task 1 (WorkOrdersPage updates)
- **Issue:** Plan placed Clear Archived button in Task 2, but it lives in WorkOrdersPage which was being rewritten in Task 1
- **Fix:** Included Clear Archived button, confirmation dialog, and all page-level changes in Task 1 commit; Task 2 focused purely on WorkOrderRow changes
- **Files modified:** vigil-pwa/src/pages/WorkOrdersPage.tsx
- **Verification:** TypeScript clean, Vite build succeeds
- **Committed in:** 640bcb4 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor reordering of where Clear Archived button was implemented. All functionality delivered as specified.

## Issues Encountered
None

## Pending Verification

Task 3 is a `checkpoint:human-verify` requiring end-to-end verification of the archive flow:
1. Open PWA -> Work Orders tab
2. Verify Active | Archived | All filter tabs, Active default
3. Check auto-archive of orders older than 7 days
4. Verify archived row styling + Unarchive button
5. Test unarchive restores to active
6. Test Clear Archived with confirmation dialog
7. Verify All tab shows combined view

## User Setup Required
None - PWA changes deploy via existing Vite build pipeline.

## Next Phase Readiness
- Work order archive UI complete pending human verification
- All Phase 92 code changes shipped (API + PWA)

---
*Phase: 92-work-order-archive*
*Completed: 2026-04-16*
