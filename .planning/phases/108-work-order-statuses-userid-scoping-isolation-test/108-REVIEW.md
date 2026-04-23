---
phase: 108-work-order-statuses-userid-scoping-isolation-test
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql
  - vigil-core/drizzle/meta/_journal.json
  - vigil-core/src/db/schema.ts
  - vigil-core/src/db/migrate.test.ts
  - vigil-core/src/db/seed-work-order-statuses.ts
  - vigil-core/src/integration/cross-user-isolation.test.ts
  - vigil-core/src/routes/work-order-status.test.ts
  - vigil-core/src/routes/work-order-status.ts
  - vigil-core/src/routes/work-orders.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 108: Code Review Report

**Reviewed:** 2026-04-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 108 successfully user-scopes the `work_order_statuses` table (NOT NULL `user_id` FK, composite `(user_id, case_number)` PK, per-user index) and threads `userId` through all four route call sites in `work-order-status.ts` and `work-orders.ts`. The migration is well-guarded (IF NOT EXISTS / EXCEPTION blocks) and the unit tests in `work-order-status.test.ts` now verify that `dbUpsertFn` and `dbSelectFn` receive `userId` from `c.get('userId')`. The cross-user isolation test suite gains a brief-PDF isolation test plus the existing work-orders isolation test.

However, the review surfaced one **critical cross-user data corruption path in `POST /work-orders/sync`** that Phase 108 did *not* address — that endpoint still uses `workOrders.caseNumber` (sole PK) as its `onConflictDoUpdate` target. Two users syncing the same ServiceNow caseNumber will silently overwrite each other's row (UserB's fields written to a row owned by UserA's `user_id`). The isolation test does not catch this because it deliberately uses distinct `ISO-A-*` / `ISO-B-*` caseNumbers, so the collision path is not exercised. This is a pre-existing bug, not a regression, but the phase's stated goal ("multi-user correctness is the core concern") should flag it.

Remaining findings are migration hardening, a redundant cast, and two small defensive-coding opportunities.

## Critical Issues

### CR-01: POST /work-orders/sync silently clobbers cross-user rows with sole-PK conflict target

**File:** `vigil-core/src/routes/work-orders.ts:54-72` (see also `vigil-core/src/db/schema.ts:244-264`)
**Issue:** The `work_orders` table still has `caseNumber` as its **sole** primary key (`schema.ts:245` — not user-scoped like `work_order_statuses` just became). The sync upsert uses `target: workOrders.caseNumber` as the conflict target. Concrete failure:

1. UserA syncs `CS0353598` — row inserted with `userId = A`.
2. UserB later syncs `CS0353598` (same ServiceNow case ID, different ServiceNow tenant/lease, totally plausible in real deployments) — INSERT collides on PK, runs UPDATE.
3. The `set: { ... }` clause on `work-orders.ts:60-69` does **not** re-set `userId`, so the row keeps `userId = A`, but every other field (`store`, `shortDescription`, `trade`, `location`, `equipment`, `priority`, `contact`, `state`, `syncedAt`) is overwritten with UserB's data.
4. UserB's GET `/v1/work-orders` returns nothing for this case (it's scoped `where userId = B`); UserA now sees UserB's ServiceNow data under their own caseNumber. Two-way leak.

This is an IDOR-style cross-tenant data clobber. The Phase 108 isolation test at `cross-user-isolation.test.ts:417-451` does **not** exercise this path — it uses `aCase = ISO-A-${Date.now()}` / `bCase = ISO-B-${Date.now()}`, distinct caseNumbers by construction.

**Fix:** Either (a) follow the same pattern Phase 108 applied to `work_order_statuses` — add a composite `(userId, caseNumber)` PK to `work_orders` and update the conflict target; or (b) as a minimal patch, scope the upsert by `userId` explicitly so a cross-user collision inserts a new row instead of overwriting:

```ts
// Minimal patch: do an explicit UPDATE-then-INSERT-or-UPDATE-existing, scoped
// by userId. Keeps the sole-PK migration decision unchanged but prevents the
// cross-user clobber.
for (const wo of valid) {
  const existing = await db
    .select({ caseNumber: workOrders.caseNumber })
    .from(workOrders)
    .where(and(
      eq(workOrders.caseNumber, wo.caseNumber),
      eq(workOrders.userId, userId as number),
    ));

  if (existing.length === 0) {
    // First-touch-wins: if another user already owns this caseNumber, skip
    // rather than clobber. (Long term: composite PK per Phase 108 pattern.)
    const conflictingOwner = await db
      .select({ userId: workOrders.userId })
      .from(workOrders)
      .where(eq(workOrders.caseNumber, wo.caseNumber));
    if (conflictingOwner.length > 0 && conflictingOwner[0].userId !== userId) {
      continue; // or return 409 — but silent skip matches "sync" semantics
    }
    await db.insert(workOrders).values(wo);
  } else {
    await db
      .update(workOrders)
      .set({
        store: wo.store,
        shortDescription: wo.shortDescription,
        trade: wo.trade,
        location: wo.location,
        equipment: wo.equipment,
        priority: wo.priority,
        contact: wo.contact,
        state: wo.state,
        syncedAt: wo.syncedAt,
      })
      .where(and(
        eq(workOrders.caseNumber, wo.caseNumber),
        eq(workOrders.userId, userId as number),
      ));
  }
}
```

**Preferred long-term fix:** migration 0015 that swaps `work_orders` sole-PK for composite `(user_id, case_number)`, mirroring 0014's pattern. The same test gap below (add a same-caseNumber cross-user assertion to `cross-user-isolation.test.ts`) would have caught this today.

## Warnings

### WR-01: Isolation test does not cover same-caseNumber cross-user collision (coverage gap)

**File:** `vigil-core/src/integration/cross-user-isolation.test.ts:417-451`
**Issue:** The work-orders isolation test uses `aCase = ISO-A-${Date.now()}` and `bCase = ISO-B-${Date.now()}` — distinct caseNumbers. This verifies GET-list scoping but cannot detect the CR-01 sync-clobber, because INSERT of disjoint caseNumbers never triggers `onConflictDoUpdate`. Phase 108's stated goal is "Multi-user correctness is the core concern," so a real collision probe belongs here.
**Fix:** Add a test that drives `POST /v1/work-orders/sync` once as UserA with caseNumber `SAME-CASE-${Date.now()}`, then once as UserB with the same caseNumber, then asserts both users see their own payload on GET:

```ts
it("POST /v1/work-orders/sync with same caseNumber across users does not clobber (CR-01 regression)", async (t) => {
  if (!DB_READY) { t.skip("DATABASE_URL required"); return; }
  const sharedCase = `SHARED-${Date.now()}`;
  await post("/v1/work-orders/sync", tokenA, {
    workOrders: [{ caseNumber: sharedCase, shortDescription: "A-payload" }],
  });
  await post("/v1/work-orders/sync", tokenB, {
    workOrders: [{ caseNumber: sharedCase, shortDescription: "B-payload" }],
  });
  const resA = await get("/v1/work-orders?filter=all", tokenA);
  const bodyA = (await resA.json()) as { data: Array<{ caseNumber: string; shortDescription: string }> };
  const rowA = bodyA.data.find((w) => w.caseNumber === sharedCase);
  assert.equal(
    rowA?.shortDescription,
    "A-payload",
    "LEAK: UserB's sync clobbered UserA's row (CR-01 — sole-PK conflict target)",
  );
  // and clean up both users' rows
});
```

### WR-02: PUT /work-orders/:caseNumber/status does not verify the caseNumber belongs to the caller

**File:** `vigil-core/src/routes/work-order-status.ts:39-64`
**Issue:** The handler accepts any caseNumber string from the URL and inserts a `(userId, caseNumber, status)` row into `work_order_statuses` with no check that `workOrders` contains a matching row for this user. Because the PK is now composite, cross-user leak is prevented (UserA writing status for a caseNumber UserB owns creates a NEW status row under UserA's `userId` — no overwrite, no leak). But it permits self-pollution: a caller can spray arbitrary caseNumbers into their own `work_order_statuses` table and those orphan rows are never cleaned up (`DELETE /work-orders/archived` at `work-orders.ts:219-226` only sweeps statuses whose caseNumbers match the caller's archived work orders).
**Fix:** Add an existence check mirroring `PUT /unarchive` (`work-orders.ts:181-188`):

```ts
// Before the upsert, verify the caseNumber exists under this user:
const existing = await db
  .select({ caseNumber: workOrders.caseNumber })
  .from(workOrders)
  .where(and(
    eq(workOrders.caseNumber, caseNumber),
    eq(workOrders.userId, userId),
  ));
if (existing.length === 0) {
  return c.json({ error: "Work order not found" }, 404);
}
await deps.dbUpsertFn(userId, caseNumber, status as string);
```
This also requires threading a second DI function for the existence check, or folding it into `dbUpsertFn`'s implementation.

### WR-03: Migration 0014 Step 2 fallback email is a hardcoded personal address that silently succeeds

**File:** `vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql:22-29`
**Issue:** Line 23 uses `COALESCE(current_setting('vigil.seed_email', true), 'jamesonmorrill1@gmail.com')`. If the `vigil.seed_email` GUC is not set (e.g., a DB restored from a backup that never ran `ALTER DATABASE ... SET`), the migration silently backfills to a hardcoded personal email. The guard two lines below (`IF seed_id IS NULL THEN RAISE EXCEPTION`) only fires when that hardcoded user also doesn't exist — but in a fresh deploy, the hardcoded user *would* exist (from the seed script). Net effect: a silent mis-attribution of every legacy status row to the developer's personal account on any deploy where the GUC setup got skipped.
**Fix:** Fail loudly if the GUC is missing, matching the seed-user-not-found posture:

```sql
DO $$
DECLARE
  seed_email text;
  seed_id integer;
BEGIN
  seed_email := current_setting('vigil.seed_email', true);
  IF seed_email IS NULL OR seed_email = '' THEN
    RAISE EXCEPTION 'vigil.seed_email GUC not set -- run migrate-102-seed.ts first';
  END IF;
  SELECT id INTO seed_id FROM users WHERE email = LOWER(seed_email) LIMIT 1;
  IF seed_id IS NULL THEN
    RAISE EXCEPTION 'Seed user not found for email %', LOWER(seed_email);
  END IF;
  UPDATE "work_order_statuses" SET user_id = seed_id WHERE user_id IS NULL;
END $$;
```

### WR-04: seed-work-order-statuses.ts onConflictDoNothing has no explicit target

**File:** `vigil-core/src/db/seed-work-order-statuses.ts:36`
**Issue:** `.onConflictDoNothing()` without a `target` relies on Drizzle inferring the table's PK. Phase 108 just swapped this table's PK from sole `caseNumber` to composite `(userId, caseNumber)` — today's inference is correct, but the next PK change will silently become a no-op or DO-SOMETHING-UNEXPECTED depending on Drizzle's runtime behavior for ambiguous constraints. Explicit > implicit.
**Fix:**

```ts
await db
  .insert(workOrderStatuses)
  .values(record)
  .onConflictDoNothing({
    target: [workOrderStatuses.userId, workOrderStatuses.caseNumber],
  });
```

### WR-05: migrate.test.ts per-user index check does not include work_order_statuses

**File:** `vigil-core/src/db/migrate.test.ts:186-217`
**Issue:** The test iterates 11 tables and asserts `idx_<table>_user_id` exists. Phase 108 adds `idx_work_order_statuses_user_id` (migration 0014 line 43), but `work_order_statuses` is not in the tables array. A future regression that drops the per-user index on status rows will slip through — per-user listing queries would degrade without a test signal.
**Fix:** Either add `"work_order_statuses"` to the tables array on lines 193-205 (making it "12 scoped tables") and update the `describe` string, or add a dedicated test block right after the "D-23 reversed" test at line 130:

```ts
it("idx_work_order_statuses_user_id exists (Phase 108 — W-01)", async (t) => {
  if (!DB_READY) { t.skip("DATABASE_URL required"); return; }
  const { db } = await import("./connection.js");
  if (!db) throw new Error("db null");
  const rows = await db.execute(sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'work_order_statuses'
      AND indexname = 'idx_work_order_statuses_user_id'
  `);
  assert.equal(
    (rows as unknown as unknown[]).length,
    1,
    "idx_work_order_statuses_user_id missing — per-user list queries will degrade",
  );
});
```

Also recommend a composite-PK assertion mirroring the `app_settings` check at lines 163-184:

```ts
it("work_order_statuses PK is composite (user_id, case_number) — Phase 108", async (t) => {
  if (!DB_READY) { t.skip("DATABASE_URL required"); return; }
  const { db } = await import("./connection.js");
  if (!db) throw new Error("db null");
  const rows = await db.execute(sql`
    SELECT a.attname AS col
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    JOIN pg_class c ON c.oid = i.indrelid
    WHERE c.relname = 'work_order_statuses' AND i.indisprimary = true
    ORDER BY array_position(i.indkey, a.attnum)
  `);
  const cols = (rows as unknown as Array<{ col: string }>).map((r) => r.col);
  assert.deepEqual(
    cols.slice().sort(),
    ["case_number", "user_id"],
    `expected composite PK (user_id, case_number); got ${cols.join(",")}`,
  );
});
```

## Info

### IN-01: work-order-status.ts redundant cast on c.get("userId")

**File:** `vigil-core/src/routes/work-order-status.ts:29` and `:42`
**Issue:** `const userId = c.get("userId") as number;` — the Hono `Variables` type augmentation (`middleware/auth.ts:13`) already declares `userId: number`, so `c.get("userId")` returns `number` directly. The `as number` cast is cosmetic noise.
**Fix:** Drop the cast for consistency with `work-orders.ts:14, 81, 177, 202` which do not cast:

```ts
const userId = c.get("userId");
```

### IN-02: Inconsistent style — work-orders.ts uses `as number` cast only in one place

**File:** `vigil-core/src/routes/work-orders.ts:135, 193, 207, 231`
**Issue:** `eq(workOrders.userId, userId as number)` — casts in the query builder but not at the `c.get` binding site, while `work-order-status.ts` does the opposite. Pick one style per codebase.
**Fix:** Given the Hono type augmentation, drop all `as number` casts in both files. Preferred:

```ts
const userId = c.get("userId"); // already typed as number
// ...
.where(eq(workOrders.userId, userId))
```

### IN-03: seed-work-order-statuses.ts variable name `existing` is misleading

**File:** `vigil-core/src/db/seed-work-order-statuses.ts:25`
**Issue:** `const existing = [...]` contains the records to seed (insert), not records that currently exist in the DB. Reader has to stare at the loop to realize the name is backwards.
**Fix:** Rename to `seedRows` or `records`:

```ts
const seedRows = [
  { userId: seedUser.id, caseNumber: "CS0353598", status: "done" },
  // ...
];
for (const record of seedRows) { ... }
```

### IN-04: migrate.test.ts:219 idempotency test remains skipped despite Phase 108 claiming re-run safety

**File:** `vigil-core/src/db/migrate.test.ts:219-222`
**Issue:** Migration 0014's header comment says "Re-run safe: every statement uses IF NOT EXISTS / DROP IF EXISTS / EXCEPTION WHEN duplicate_object guards" (`0014_work_order_statuses_user_scoping.sql:6-7`), but the idempotency test at line 219 remains `it.skip` with a comment "TODO Plan 05" from Phase 102. Phase 108 re-run safety is an unverified claim.
**Fix:** Either flip the idempotency test on for 0014 specifically (run the migrator twice, diff pg_dump), or update the `it.skip` body to reference Phase 108's re-run safety claim and explain why it's still deferred.

---

_Reviewed: 2026-04-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
