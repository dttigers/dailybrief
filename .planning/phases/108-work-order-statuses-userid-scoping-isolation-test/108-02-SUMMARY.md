---
phase: 108
plan: 02
subsystem: vigil-core/routes
tags: [routes, drizzle, multi-user, work-order-statuses, W-01, userId-scoping]
requires: [108-01]
provides: [userId-scoped work-order-status routes, composite upsert conflict target, userId-scoped work-orders status join + archive cleanup]
affects: [vigil-core/src/routes/work-order-status.ts, vigil-core/src/routes/work-order-status.test.ts, vigil-core/src/routes/work-orders.ts, vigil-core/src/db/seed-work-order-statuses.ts]
tech-stack:
  added: []
  patterns: [Hono context userId DI injection, drizzle composite onConflictDoUpdate target, middleware userId stub in unit tests]
key-files:
  created: []
  modified:
    - vigil-core/src/routes/work-order-status.ts
    - vigil-core/src/routes/work-order-status.test.ts
    - vigil-core/src/routes/work-orders.ts
    - vigil-core/src/db/seed-work-order-statuses.ts
decisions:
  - "seed-work-order-statuses.ts fixed to look up seed user by email and include userId in inserts — required by NOT NULL constraint added in Plan 01"
metrics:
  duration_minutes: 4
  completed_date: "2026-04-23"
  tasks_completed: 3
  files_changed: 4
---

# Phase 108 Plan 02: work-order-status Route userId Scoping Summary

**One-liner:** Scoped all four `workOrderStatuses` call sites by authenticated userId — GET filter, PUT composite upsert conflict target, work-orders status join, archive cleanup DELETE predicate — with updated unit tests verifying the wiring.

## What Was Built

W-01 runtime correctness portion for Phase 108: all four `workOrderStatuses` query call sites now filter by the authenticated caller's `userId`. The PUT upsert uses a composite conflict target `[workOrderStatuses.userId, workOrderStatuses.caseNumber]` so User A's PUT on a caseNumber User B owns creates a new row rather than overwriting. Unit tests updated to inject `userId` via Hono middleware stub; two new tests verify the wiring end-to-end.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Scope work-order-status.ts — userId on DI, GET filter, PUT composite upsert | a4d63f4 | vigil-core/src/routes/work-order-status.ts |
| 2 | Update work-order-status.test.ts — mock signatures pass userId; add cross-user wiring tests | 5683b9c | vigil-core/src/routes/work-order-status.test.ts |
| 3 | Scope work-orders.ts — status join + archive cleanup DELETE filtered by userId | 6914b81 | vigil-core/src/routes/work-orders.ts, vigil-core/src/db/seed-work-order-statuses.ts |

## File Diffs

### work-order-status.ts

**Before:**
```typescript
export interface WorkOrderStatusDeps {
  dbAvailable: boolean;
  dbSelectFn: () => Promise<Array<{ caseNumber: string; status: string }>>;
  dbUpsertFn: (caseNumber: string, status: string) => Promise<void>;
}
// GET handler: deps.dbSelectFn()
// PUT handler: deps.dbUpsertFn(caseNumber, status)
// Production dbSelectFn: db.select().from(workOrderStatuses)
// Production dbUpsertFn: .values({ caseNumber, status }).onConflictDoUpdate({ target: workOrderStatuses.caseNumber, ... })
```

**After:**
```typescript
export interface WorkOrderStatusDeps {
  dbAvailable: boolean;
  dbSelectFn: (userId: number) => Promise<Array<{ caseNumber: string; status: string }>>;
  dbUpsertFn: (userId: number, caseNumber: string, status: string) => Promise<void>;
}
// GET handler: const userId = c.get("userId") as number; deps.dbSelectFn(userId)
// PUT handler: const userId = c.get("userId") as number; deps.dbUpsertFn(userId, caseNumber, status)
// Production dbSelectFn: db.select().from(workOrderStatuses).where(eq(workOrderStatuses.userId, userId))
// Production dbUpsertFn: .values({ userId, caseNumber, status }).onConflictDoUpdate({ target: [workOrderStatuses.userId, workOrderStatuses.caseNumber], ... })
```

### work-orders.ts

**Edit 1 — GET /work-orders status select (before):**
```typescript
const statusRows = await db.select().from(workOrderStatuses);
```

**After:**
```typescript
// Phase 108 W-01: scope by userId — status rows are now per-user.
const statusRows = await db
  .select()
  .from(workOrderStatuses)
  .where(eq(workOrderStatuses.userId, userId));
```

**Edit 2 — DELETE /work-orders/archived status cleanup (before):**
```typescript
// stays globally-keyed per D-23 — only this user's caseNumbers get cleared).
await db
  .delete(workOrderStatuses)
  .where(inArray(workOrderStatuses.caseNumber, archivedCaseNumbers));
```

**After:**
```typescript
// Phase 108 W-01: status rows are now user-scoped; add eq(workOrderStatuses.userId, userId)
// as defense-in-depth so the DELETE cannot sweep another user's statuses.
await db
  .delete(workOrderStatuses)
  .where(
    and(
      eq(workOrderStatuses.userId, userId),
      inArray(workOrderStatuses.caseNumber, archivedCaseNumbers),
    ),
  );
```

## Unit Test Output (7/7 passing)

```
✔ WO-02/T1: PUT /work-orders/TEST001/status with done returns 200 and correct body (39ms)
✔ WO-02/T2: PUT with invalid status returns 400 with error message containing 'status must be one of' (1ms)
✔ WO-02/T3: PUT same case number twice returns updated status (upsert, not duplicate) (2ms)
✔ WO-03/T4: GET /work-orders/statuses returns a flat { caseNumber: status } map (0.8ms)
✔ WO-03/T5: GET /work-orders/statuses when empty returns {} (1.7ms)
✔ Phase 108 W-01: dbUpsertFn receives correct userId argument (composite conflict target) (0.6ms)
✔ Phase 108 W-01: dbSelectFn receives correct userId argument (scoped GET) (0.5ms)
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

## TypeScript Type Check Output

```
cd vigil-core && npx tsc --noEmit
(no output — 0 errors)
```

Package-wide type check clean after all 3 tasks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Fixed seed-work-order-statuses.ts to include userId in inserts**
- **Found during:** Task 3 (package-wide tsc check after scoping work-orders.ts)
- **Issue:** `seed-work-order-statuses.ts` inserted rows with `{ caseNumber, status }` but the Plan 01 schema change added `userId integer NOT NULL`. TypeScript error TS2769: Property 'userId' is missing. Would also fail at runtime with "null value in column user_id violates not-null constraint".
- **Fix:** Added `eq` import + seed user lookup by email (`jamesonmorrill1@gmail.com`) before the insert loop. Mirrors the `scripts/seed-local.ts` pattern. Each record now includes `userId: seedUser.id`.
- **Files modified:** `vigil-core/src/db/seed-work-order-statuses.ts`
- **Commit:** 6914b81 (included in Task 3 commit)

## Known Stubs

None. All four call sites are wired to real userId from `c.get("userId")`. No placeholder values or hardcoded IDs in route code.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes beyond those described in the plan's threat model (T-108-06 through T-108-09). All four STRIDE threats are now mitigated by the implemented scoping predicates.

## Self-Check: PASSED

- vigil-core/src/routes/work-order-status.ts: FOUND
- vigil-core/src/routes/work-order-status.test.ts: FOUND
- vigil-core/src/routes/work-orders.ts: FOUND
- vigil-core/src/db/seed-work-order-statuses.ts: FOUND
- Commit a4d63f4: FOUND
- Commit 5683b9c: FOUND
- Commit 6914b81: FOUND
