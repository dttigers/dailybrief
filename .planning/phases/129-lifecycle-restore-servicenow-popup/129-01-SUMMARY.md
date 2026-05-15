---
phase: 129-lifecycle-restore-servicenow-popup
plan: "01"
subsystem: vigil-core/db
tags: [drizzle, migration, idempotency, partial-unique-index, work-orders, wave-1-gate]

dependency_graph:
  requires:
    - vigil-core/drizzle/0020_add_ai_usage_daily.sql (latest prior migration)
  provides:
    - work_orders.client_capture_id column (nullable text)
    - uq_work_orders_user_client_capture_id partial unique index
    - Drizzle ORM workOrders.clientCaptureId field for TypeScript consumers
  affects:
    - vigil-core/src/routes/work-orders.ts (Wave 2 will read clientCaptureId)
    - ServiceNow extension popup (Wave 2 will POST clientCaptureId)

tech_stack:
  added: []
  patterns:
    - Phase 121 agent_events partial-unique-index pattern (0018 migration) mirrored exactly

key_files:
  created:
    - vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql
    - vigil-core/drizzle/meta/0021_snapshot.json
  modified:
    - vigil-core/src/db/schema.ts (added clientCaptureId field to workOrders table)
    - vigil-core/drizzle/meta/_journal.json (added 0021 entry)

decisions:
  - SQL-only partial unique index (Drizzle ORM cannot express partial index predicates — migration carries it, no uniqueIndex() in schema.ts)
  - IF NOT EXISTS throughout for re-run safety
  - Documented pre-existing global case_number PK limitation in migration header comment (not fixed in this phase per RESEARCH Probe 5)
  - drizzle-kit generate used to register migration in journal (auto-generated SQL replaced with hand-crafted version including IF NOT EXISTS + partial unique index)

metrics:
  duration: "~6 minutes"
  completed: "2026-05-15T18:06:40Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 129 Plan 01: DB Migration — client_capture_id on work_orders Summary

Drizzle migration 0021 adds `client_capture_id` (nullable text) and `(user_id, client_capture_id)` partial unique index to `work_orders`, mirroring Phase 121's agent_events idempotency pattern; applied to dev DB and unblocking Wave 2.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Author migration 0021 SQL + add clientCaptureId to schema.ts | 5d5c334 | `0021_add_work_orders_client_capture_id.sql`, `src/db/schema.ts` |
| 2 | Apply migration 0021 via drizzle-kit migrate | 7bb965d | `drizzle/meta/_journal.json`, `drizzle/meta/0021_snapshot.json` |

## Verification Results

- `tsc --noEmit`: clean (no new errors)
- `drizzle-kit check`: "Everything's fine"
- DB introspection: `work_orders.client_capture_id` column present (nullable)
- DB introspection: `uq_work_orders_user_client_capture_id` partial unique index present
- `drizzle/__drizzle_migrations` table: migration id=34 applied
- Migration file contains `ADD COLUMN IF NOT EXISTS "client_capture_id" text` (verbatim)
- Migration file contains `CREATE UNIQUE INDEX IF NOT EXISTS "uq_work_orders_user_client_capture_id"` (verbatim)
- Migration file contains `WHERE "client_capture_id" IS NOT NULL` (verbatim)
- Migration file contains `--> statement-breakpoint` between statements
- `schema.ts` declares `clientCaptureId: text("client_capture_id")` with no `.notNull()` or `.default()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] drizzle-kit generate replaced hand-crafted SQL with minimal ADD COLUMN**
- **Found during:** Task 2
- **Issue:** `drizzle-kit generate` is required to register migration in the journal (the `_journal.json` + snapshot must exist for `drizzle-kit migrate` to apply the SQL). Running `drizzle-kit generate` auto-generated a minimal SQL (`ALTER TABLE "work_orders" ADD COLUMN "client_capture_id" text;`) without `IF NOT EXISTS` and without the partial unique index.
- **Fix:** After `drizzle-kit generate` created the journal entry and snapshot, the migration SQL file was restored to the hand-crafted version (with header comment, `IF NOT EXISTS`, and the partial unique index). `drizzle-kit migrate` then applied the full SQL.
- **Files modified:** `vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql` (restored to authored version)
- **Commits:** 5d5c334 (Task 1 authored), 7bb965d (journal + snapshot from generate)

**2. [Observation] `drizzle-kit generate --dry` does not exist in drizzle-kit v0.31.10**
- The plan's acceptance criteria referenced `npx drizzle-kit generate --dry`. This flag does not exist in drizzle-kit@0.31.10. Replaced with `drizzle-kit check` which confirmed consistency ("Everything's fine").

## Known Stubs

None — this plan is purely additive schema/migration work with no UI or data stubs.

## Threat Flags

None — the partial unique index follows the established Phase 121 pattern. The `case_number` global PK pre-existing issue was documented in the migration header but is not introduced by this plan.

## Self-Check: PASSED

- `vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql`: EXISTS (verified by grep)
- `vigil-core/drizzle/meta/0021_snapshot.json`: EXISTS (created by drizzle-kit generate)
- Commit 5d5c334: EXISTS (`git log --oneline | grep 5d5c334`)
- Commit 7bb965d: EXISTS (`git log --oneline | grep 7bb965d`)
- Column `client_capture_id` in live DB: VERIFIED by DB introspection
- Index `uq_work_orders_user_client_capture_id` in live DB: VERIFIED by DB introspection
