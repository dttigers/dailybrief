# Phase 92: Work Order Archive - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Stale work orders auto-archive based on age rules. Users can view archived orders via a filter toggle, unarchive individual orders, and bulk-clear (hard delete) all archived orders.

</domain>

<decisions>
## Implementation Decisions

### Archive Mechanism
- **D-01:** Soft-delete via `archivedAt` timestamp column on work_orders table. Null = active, set = archived.
- **D-02:** Unarchive clears `archivedAt` back to null.

### Auto-Archive Trigger
- **D-03:** Lazy evaluation on GET /work-orders — apply archive rules before returning results. No separate timer.
- **D-04:** Archive rules: (a) Gmail-imported order where syncedAt > 7 days ago, (b) order with status=done where status changed > 7 days ago. Both conditions auto-set archivedAt.
- **D-05:** Manually-entered work orders (no Gmail messageId or syncedAt from import) never auto-archive.

### Archived View UX
- **D-06:** Filter tab pattern matching Phase 91 — Active | Archived | All pill buttons on Work Orders page.
- **D-07:** Default to "Active" (only non-archived orders).
- **D-08:** "Archived" shows only archived orders. "All" shows everything.

### Bulk-Clear Behavior
- **D-09:** Hard delete from database. Confirmation dialog: "Delete X archived work orders? This cannot be undone."
- **D-10:** Only operates on archived orders (never deletes active orders regardless of filter state).
- **D-11:** "Clear Archived" button visible only when Archived filter is active and archived orders exist.

</decisions>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above.

### Existing code
- `vigil-core/src/routes/work-orders.ts` — GET/POST/sync endpoints, status cycling
- `vigil-core/src/db/schema.ts` — workOrders table (needs archivedAt column)
- `vigil-pwa/src/pages/WorkOrdersPage.tsx` — current work orders page
- `vigil-pwa/src/components/WorkOrderRow.tsx` — row component with status cycling + Updated banner
- `vigil-pwa/src/hooks/useWorkOrders.ts` — data fetching + prioritization
- `vigil-pwa/src/components/StatusFilterTabs.tsx` — reusable filter tab pattern from Phase 91

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- StatusFilterTabs component: already built for Phase 91, can be reused with different options (Active/Archived/All)
- useWorkOrders hook: has visibilitychange refetch, needs filter state added
- WorkOrderRow: already shows Updated banner, can add archived styling (dimmed)

### Established Patterns
- Lazy evaluation: apply rules in GET handler before returning (no separate cron needed)
- app_settings for filter persistence (Phase 91 pattern)
- Hard delete: existing bulk delete pattern from thoughts (bulkDeleteThoughts)

### Integration Points
- work_orders table: add archivedAt column via drizzle-kit push
- GET /work-orders: add archive rule evaluation + filter query param
- WorkOrdersPage: add filter tabs + Clear Archived button
- DELETE /work-orders/archived: new endpoint for bulk clear

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 92-work-order-archive*
*Context gathered: 2026-04-16*
