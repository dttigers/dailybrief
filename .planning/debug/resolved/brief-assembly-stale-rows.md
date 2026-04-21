---
status: resolved
trigger: "Brief PDF contains completed work orders and soft-deleted thoughts/tasks"
created: 2026-04-21T00:00:00Z
updated: 2026-04-21T00:01:00Z
resolved: 2026-04-21T19:10:00Z
---

## Current Focus

hypothesis: CONFIRMED — two distinct missing filters in brief-assembly-service.ts
test: completed — root cause identified by reading all relevant code
expecting: n/a — proceeding to fix
next_action: add ne(syncStatus, 'pendingDeletion') to all three thought queries; add isNull(archivedAt) and status-filter post-join to work order fetch; add failing tests first

## Symptoms

expected: Today's brief includes only (a) open/active work orders and (b) thoughts/tasks where deletedAt IS NULL. Anything completed or soft-deleted before brief-generation time should not render.
actual: Brief PDF contains at least one completed work order. Brief PDF also contains thoughts and/or tasks that the user deleted in the PWA yesterday (before today's scheduled brief ran).
errors: None — no server errors, no missing-data warnings. Brief generation "succeeds" and posts a PDF with wrong contents.
reproduction: User noticed it in today's (2026-04-21) scheduled brief on iOS/PWA. Historical PDFs likely have the same issue — should be reproducible by regenerating a brief for any day where soft-deleted items or completed WOs existed.
started: Unknown start date. User discovered today (2026-04-21). Phase 99 moved briefs from /tmp → brief_pdfs BYTEA table on 2026-04-18.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-21T00:00:00Z
  checked: orchestrator pre-analysis
  found: brief-generate.ts delegates to brief-assembly-service.ts; display routes filter "soft-deleted" thoughts correctly; only the assembly pipeline path skips the filter
  implication: bug is localized to brief-assembly-service.ts query layer

- timestamp: 2026-04-21T00:01:00Z
  checked: vigil-core/src/db/schema.ts thoughts table
  found: NO deletedAt column exists. Soft-delete is syncStatus = 'pendingDeletion'. Schema has no deletedAt.
  implication: The filter needed is ne(thoughts.syncStatus, 'pendingDeletion'), NOT isNull(deletedAt). Orchestrator headstart description of "deletedAt" was an approximation — the actual mechanism is syncStatus.

- timestamp: 2026-04-21T00:01:00Z
  checked: vigil-core/src/routes/brief.ts and bulk.ts
  found: All display/mutation routes use ne(thoughts.syncStatus, 'pendingDeletion') to exclude soft-deleted thoughts. This pattern is consistent across the codebase.
  implication: Assembly service must apply the same ne(thoughtsTable.syncStatus, 'pendingDeletion') to all three thought queries (fetchTaskThoughts, fetchRecentThoughts, fetchUnprocessedThoughts).

- timestamp: 2026-04-21T00:01:00Z
  checked: vigil-core/src/services/brief-assembly-service.ts fetchTaskThoughts/fetchRecentThoughts/fetchUnprocessedThoughts
  found: All three thought queries use AND(userId, category/null filters, createdAt window) — none include syncStatus filter. Soft-deleted thoughts pass through.
  implication: Adding ne(thoughtsTable.syncStatus, 'pendingDeletion') to each query's AND clause fixes symptom 2.

- timestamp: 2026-04-21T00:01:00Z
  checked: vigil-core/src/services/brief-assembly-service.ts fetchWorkOrdersWithStatus + mapWorkOrders
  found: fetchWorkOrdersWithStatus queries workOrders with only userId scope — no archivedAt IS NULL filter. mapWorkOrders joins statusRows but does NOT filter out rows where status = 'done'. All WOs including archived and completed pass through.
  implication: Two fixes needed for symptom 1: (a) add isNull(workOrdersTable.archivedAt) to the DB query, AND (b) filter mapWorkOrders output to exclude status='done' rows.

- timestamp: 2026-04-21T00:01:00Z
  checked: vigil-core/src/db/schema.ts workOrderStatuses
  found: work_order_statuses.status is free text defaulting to 'open'. Values in use: 'open', 'inProgress', 'done'. No userId column (Phase 102 tech-debt W-01). The assembly service fetches ALL status rows without userId filtering — correct given the table has no userId column. The completed-WO fix must filter post-join in mapWorkOrders.
  implication: mapWorkOrders should filter out entries where resolved status === 'done' (or any terminal status). This is the correct boundary because the status table lacks userId.

## Resolution

root_cause: |
  Two missing filters in brief-assembly-service.ts:
  1. Thoughts queries (fetchTaskThoughts, fetchRecentThoughts, fetchUnprocessedThoughts) do not exclude syncStatus='pendingDeletion' rows, so soft-deleted thoughts appear in the brief.
  2. Work order fetch does not filter archivedAt IS NULL, and mapWorkOrders does not exclude status='done' entries — so both archived and completed WOs appear in the brief.
fix: |
  vigil-core/src/services/brief-assembly-service.ts — four targeted changes:
  1. Added `ne` to drizzle-orm import.
  2. Added `notPendingDeletion()` helper: `ne(thoughtsTable.syncStatus, "pendingDeletion")`.
  3. Added `activeWorkOrderFilter()` helper: `isNull(workOrdersTable.archivedAt)`.
  4. Applied `notPendingDeletion()` to all three thought queries (fetchTaskThoughts, fetchRecentThoughts, fetchUnprocessedThoughts).
  5. Applied `activeWorkOrderFilter()` to the work orders DB query.
  6. Added `.filter((wo) => wo.status !== "done")` in `mapWorkOrders` to exclude completed WOs resolved from the status join.
  vigil-core/src/services/brief-assembly-service.test.ts — added four new tests (7c, 7d, 11, 12) locking in both acceptance criteria.
verification: |
  - 19/19 tests pass (npm test equivalent: node --import tsx/esm --test src/services/brief-assembly-service.test.ts)
  - npx tsc --noEmit: clean, zero errors
  - All pre-existing tests continue to pass (no regressions)
files_changed:
  - vigil-core/src/services/brief-assembly-service.ts
  - vigil-core/src/services/brief-assembly-service.test.ts
