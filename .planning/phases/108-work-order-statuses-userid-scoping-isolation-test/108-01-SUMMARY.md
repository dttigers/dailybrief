---
phase: 108
plan: 01
subsystem: vigil-core/db
tags: [schema, migration, drizzle, multi-user, work-order-statuses, W-01]
requires: [102-01, 107.1-04]
provides: [work_order_statuses.userId FK, composite PK (userId+caseNumber), 0014 migration applied]
affects: [vigil-core/src/routes/work-order-status.ts, vigil-core/src/routes/work-orders.ts]
tech-stack:
  added: []
  patterns: [5-step ADD-COLUMN-nullable→backfill→NOT-NULL→FK→INDEX migration, composite drizzle primaryKey helper, D-23 guardrail inversion]
key-files:
  created:
    - vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql
    - .planning/phases/108-work-order-statuses-userid-scoping-isolation-test/108-01-SUMMARY.md
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/src/db/migrate.test.ts
    - vigil-core/drizzle/meta/_journal.json
decisions:
  - "Added 0014 entry to _journal.json manually because drizzle migrator requires SQL files to be registered in the journal before pickup — hand-written migration (D-04) bypasses drizzle-kit generate which would auto-update the journal"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-23"
  tasks_completed: 4
  files_changed: 5
---

# Phase 108 Plan 01: work_order_statuses Schema + Migration + D-23 Inversion Summary

**One-liner:** Added `user_id INTEGER NOT NULL FK` to `work_order_statuses`, swapped sole `case_number` PK for composite `(user_id, case_number)` via hand-authored 0014 migration, applied to `vigil_dev`, inverted D-23 guardrail test.

## What Was Built

W-01 schema prerequisite for Phase 108: `work_order_statuses` is now user-scoped with a NOT NULL `user_id` FK to `users(id) ON DELETE RESTRICT`, a composite `(user_id, case_number)` primary key, and a `idx_work_order_statuses_user_id` index for list-by-user queries. The Phase 102 D-23 decision ("work_order_statuses stays unscoped") is formally reversed.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update schema.ts — userId FK + composite PK + index | ef087f2 | vigil-core/src/db/schema.ts |
| 2 | Create 0014 migration SQL — 5-step + PK swap | 209ad7e | vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql |
| 3 | Run db:migrate-102 against vigil_dev | ee7e259 | vigil-core/drizzle/meta/_journal.json |
| 4 | Invert D-23 guardrail in migrate.test.ts | 7c2c4bc | vigil-core/src/db/migrate.test.ts |

## Schema Diff

**Before (vigil-core/src/db/schema.ts:222-228):**
```typescript
export const workOrderStatuses = pgTable("work_order_statuses", {
  caseNumber: text("case_number").primaryKey(),
  status: text("status").notNull().default("open"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**After:**
```typescript
export const workOrderStatuses = pgTable(
  "work_order_statuses",
  {
    caseNumber: text("case_number").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("open"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.caseNumber] }),
    index("idx_work_order_statuses_user_id").on(table.userId),
  ],
);
```

## Migration File

**Path:** `vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql`

6-step migration (5 data steps + PK swap):
1. ADD COLUMN `user_id` integer (nullable)
2. DO-block backfill: reads `vigil.seed_email` GUC → UPDATEs all NULL rows to seed user id
3. ALTER COLUMN `user_id` SET NOT NULL
4. ADD CONSTRAINT FK to `users(id)` ON DELETE RESTRICT (guarded by EXCEPTION WHEN duplicate_object)
5. CREATE INDEX `idx_work_order_statuses_user_id` (IF NOT EXISTS)
6. DROP CONSTRAINT `work_order_statuses_pkey` (IF EXISTS) + ADD composite PK `(user_id, case_number)` (EXCEPTION WHEN duplicate_object / invalid_table_definition guards)

## Migration Run Output (First Run)

```
[migrate-102-seed] seed user row ensured for jamesonmorrill1@gmail.com; vigil.seed_email GUC set on database "vigil_dev"
[migrate] Running migrations...
[migrate] Migrations complete
EXIT: 0
```

All NOTICE messages were "already exists, skipping" from earlier migrations — expected and correct.

## Live DB Verification

```
COLS: [{"column_name":"case_number","is_nullable":"NO"},{"column_name":"status","is_nullable":"NO"},{"column_name":"updated_at","is_nullable":"NO"},{"column_name":"user_id","is_nullable":"NO"}]
IDX:  [{"indexname":"idx_work_order_statuses_user_id"},{"indexname":"work_order_statuses_pkey"}]
PK:   [{"attname":"case_number"},{"attname":"user_id"}]  (composite — 2 entries)
FK:   [{"confdeltype":"r"}]  (ON DELETE RESTRICT confirmed)
```

## Re-run Safety Verification

Second run of `npm run db:migrate-102` exits 0 — all IF NOT EXISTS / duplicate_object guards held.

## D-23 Guardrail Inversion

**migrate.test.ts line 13 (comment):**
- Before: `//   - D-23:    work_order_statuses stays unscoped (no user_id column)`
- After: `//   - D-23 (Phase 102) REVERSED in Phase 108 — work_order_statuses is now user-scoped; assertion flipped.`

**migrate.test.ts it() block (~line 130):**
- Before: Asserted `user_id` column length === 0 (D-23 violation check — "does NOT have user_id")
- After: Asserts `user_id` IS_NULLABLE='NO' + FK confdeltype='r' (D-23 reversal guard — "DOES have NOT NULL user_id")

**Test run result:**
```
✔ work_order_statuses table DOES have NOT NULL user_id column with FK to users(id) ON DELETE RESTRICT (D-23 reversed in Phase 108 — W-01) (3.238438ms)
```
All 6 migrate.test.ts assertions pass.

## TypeScript Type Check

`npx tsc --noEmit` has no errors in `schema.ts` or `migrate.test.ts`. Errors in `work-order-status.ts` and `seed-work-order-statuses.ts` are expected call-site type errors that Plan 02 will fix (they reference the new `userId` required field which the routes don't yet supply).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hand-added 0014 entry to drizzle meta/_journal.json**
- **Found during:** Task 3
- **Issue:** Drizzle migrator reads `_journal.json` to discover which SQL files to apply. Hand-written migration files (per D-04) are not auto-registered by `drizzle-kit generate` since we bypassed drizzle-kit. The plan stated "let `npm run db:migrate-102` register it" — but the migrator only applies files already in the journal; it does not auto-discover new `.sql` files.
- **Fix:** Manually appended idx=14 entry for `0014_work_order_statuses_user_scoping` to `_journal.json`. The migrator then picked it up on the next run and applied it cleanly.
- **Files modified:** `vigil-core/drizzle/meta/_journal.json`
- **Commit:** ee7e259

## Known Stubs

None. This plan is schema + migration only; no UI or data-fetch stubs exist.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes beyond those described in the plan's threat model (T-108-01 through T-108-05).

## Self-Check: PASSED

- vigil-core/src/db/schema.ts: FOUND
- vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql: FOUND
- vigil-core/src/db/migrate.test.ts: FOUND
- vigil-core/drizzle/meta/_journal.json: FOUND
- Commit ef087f2: FOUND
- Commit 209ad7e: FOUND
- Commit ee7e259: FOUND
- Commit 7c2c4bc: FOUND
