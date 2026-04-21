# Phase 107.1 — Deferred Items

Items discovered during plan execution that are **out of scope** for the current plan but need attention elsewhere. Items here do NOT block the plan they were discovered in.

---

## Schema ↔ Migration drift in `work_orders` (discovered in Plan 02, 2026-04-21)

**Found by:** Plan 02 live-seed verification run.

**Symptom:** After applying every migration under `vigil-core/drizzle/0000…0012` to a fresh local `vigil_dev`, `work_orders` is missing the columns `notes`, `last_change_at`, `last_change_summary`, and `archived_at`. `vigil-core/src/db/schema.ts` (lines 232–252) defines these columns as authoritative, but no migration creates them.

**Evidence:**

```
$ grep -l 'notes\|archived_at\|last_change_at' vigil-core/drizzle/*.sql
(no matches)

$ psql -h localhost -d vigil_dev -c "\d work_orders"
# columns present: case_number, store, short_description, trade, location,
# equipment, priority, contact, state, synced_at, user_id
# columns missing:  notes, last_change_at, last_change_summary, archived_at
```

Attempting `INSERT … ("notes", …)` against the live local DB fails with Postgres error `42703: column "notes" of relation "work_orders" does not exist`.

**Why out of scope for Plan 02:** Plan 02's task is the seed script only. The critical_context explicitly instructs "Do not re-run migrations" and offers a skip-live-verification fallback ("If Plan 01 was deferred, skip step 2-4 and verify only type-check + static grep"). The drift exists in production Railway too — Railway's live DB will have either (a) migrations that never made it into `drizzle/` git history, or (b) the same drift manifesting as runtime errors on work-order writes. Either way, investigating + authoring a fix migration is strictly outside the seed-script surface.

**Impact on Phase 107.1:**

- **Plan 02 (this plan):** Live-seed verification was NOT performed past the `work_orders` insert. Static grep + type-check acceptance fully green.
- **Plan 03 (`dev-setup.sh`):** Will invoke `npm run seed:local` as the final step. That step WILL crash with the same 42703 error on any freshly migrated local DB until the missing migration is authored. Plan 03 should either (a) defer the seed step, (b) wrap the seed invocation in a failure-tolerant check, or (c) be blocked until a follow-on plan writes the missing migration.
- **Plan 04 (verify script):** `bash scripts/verify-phase-107.1.sh --full` D5 check (seed data round-trip) will fail for the same reason.

**Suggested fix (future plan, likely Phase 107.1 sub-plan or a hotfix plan):**

1. Run `drizzle-kit generate` against the current `schema.ts` — this produces migration `0013_work_orders_drift_repair.sql` auto-detecting the four missing columns and any indexes.
2. Manually verify the generated migration is additive-only (ALTER TABLE … ADD COLUMN with safe defaults). No column drops, no data migration.
3. Commit the new migration.
4. Apply to Railway prod via the normal `db:migrate-prod` path.
5. Re-run `npm run seed:local` locally to confirm the full seed completes.

**Related:** The same drift MAY exist for other tables — a full `drizzle-kit generate` diff audit is advisable. Not doing it now keeps blast radius of the follow-on plan small.

---
