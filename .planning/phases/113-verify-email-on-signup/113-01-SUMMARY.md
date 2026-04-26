---
phase: 113
plan: 01
subsystem: vigil-core/db
tags: [migration, schema, postgres, drizzle, auth]
requirements: [AUTH-11]

dependency_graph:
  requires:
    - 112-01  # 0016_password_reset_tokens migration (password_reset_tokens table)
    - 110-01  # 0015_add_password_changed_at migration (users table baseline)
  provides:
    - users.email_verified_at column (TIMESTAMPTZ NULL) in local Postgres
    - Drizzle schema type for emailVerifiedAt (used by Plans 02-04)
    - SC#4 grandfathering: all 117 pre-existing users set to email_verified_at = created_at
  affects:
    - vigil-core/src/db/schema.ts (users type now exposes emailVerifiedAt)
    - downstream Plans 02-04 (can reference users.emailVerifiedAt in select/set/where)

tech_stack:
  added: []
  patterns:
    - Hand-authored idempotent migration (IF NOT EXISTS + WHERE IS NULL guard)
    - Drizzle _journal.json manual append with monotonic `when` value
    - Nullable nullable TIMESTAMPTZ column as unverified sentinel

key_files:
  created:
    - vigil-core/drizzle/0017_users_email_verified_at.sql
    - .planning/phases/113-verify-email-on-signup/113-01-SUMMARY.md
  modified:
    - vigil-core/src/db/schema.ts (added emailVerifiedAt column to users pgTable)
    - vigil-core/drizzle/meta/_journal.json (appended idx=17 entry)

decisions:
  - "when value 1777440000000 chosen: Date.UTC(2026,3,29) = 2026-04-29, strictly > 0016's 1777353600000 (2026-04-28)"
  - "emailVerifiedAt is nullable with no default: NULL is the unverified sentinel per D-05"
  - "Backfill UPDATE runs in same migration file as ADD COLUMN, separated by --> statement-breakpoint"
  - "Idempotency: ADD COLUMN uses IF NOT EXISTS; UPDATE uses WHERE email_verified_at IS NULL"

metrics:
  duration: "~8 minutes"
  completed: "2026-04-26"
  tasks_completed: 4
  files_changed: 3
---

# Phase 113 Plan 01: Schema Migration — users.email_verified_at Summary

**One-liner:** Hand-authored idempotent migration 0017 adds `users.email_verified_at TIMESTAMPTZ NULL`, backfills all 117 pre-existing rows to `created_at` (SC#4 grandfathering), applied to local Postgres with zero unverified rows post-migration.

## What Was Built

Migration `0017_users_email_verified_at` adds the `email_verified_at` column to the `users` table. It is the data foundation for all subsequent Phase 113 plans (Plans 02–04). Without an applied schema migration, Plans 02/03 would type-check green (Drizzle types come from `schema.ts`, not the live DB) but runtime `SELECT email_verified_at` queries would fail with "column does not exist."

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author 0017_users_email_verified_at.sql | 9eafd50 | vigil-core/drizzle/0017_users_email_verified_at.sql (created) |
| 2 | Add emailVerifiedAt to Drizzle schema.ts | 99d73f9 | vigil-core/src/db/schema.ts (modified) |
| 3 | Register 0017 in _journal.json | 926ea09 | vigil-core/drizzle/meta/_journal.json (modified) |
| 4 | Apply migration to local Postgres [BLOCKING] | 4b32702 | (empty commit — DB state verified via psql) |

## Migration Details

### `when` Value

- **0016 `when`:** `1777353600000` (2026-04-28 00:00:00 UTC)
- **0017 `when`:** `1777440000000` (2026-04-29 00:00:00 UTC)
- **Delta:** +86,400,000 ms (exactly 24 hours)
- drizzle-kit migrate orders by `when` NOT `idx` — this ordering ensures 0017 always applies after 0016 (pitfall from Phase 110 STATE.md).

### Migration SQL Shape

Two statements, separated by `--> statement-breakpoint` (load-bearing Drizzle parser directive):

1. `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;`
2. `UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;`

Both statements are idempotent — safe to re-run.

### Pre/Post Migration Counts

| Metric | Value |
|--------|-------|
| Total users in local DB | 117 |
| Unverified after backfill | 0 |
| `email_verified_at = created_at` count | 117 |
| Seed user `jamesonmorrill1@gmail.com` non-null | `t` (verified) |

### Idempotency Verification

Second run of `npm run db:migrate` exited 0 with no SQL re-execution. drizzle's `__drizzle_migrations` tracking prevents duplicate applies.

## Drizzle Schema Sync

Added to `vigil-core/src/db/schema.ts` users pgTable, after `passwordChangedAt`:

```typescript
emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
```

- No `.notNull()` — NULL is the unverified sentinel (D-05)
- No `.defaultNow()` or any default — newly registered users start with NULL until verify click
- `npx tsc --noEmit` exits 0 — additive-only, no type errors introduced

## Railway Production Note

Railway prod will pick up 0017 on the next auto-deploy via `db:migrate-prod` (same pattern as Phases 110/112). The Plan 05 smoke test validates the prod side after Plans 02–04 deploy.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced by this plan beyond what was specified in the threat model.

| Threat ID | Mitigation Applied |
|-----------|--------------------|
| T-113-08 | D-02 backfill in same migration: `SELECT COUNT(*) WHERE email_verified_at IS NULL` = 0 after apply. All pre-existing users grandfathered. |
| T-113-MIG-01 | `when: 1777440000000` > 0016's `1777353600000`. Verified by node -e check. |
| T-113-MIG-02 | `--> statement-breakpoint` between ALTER and UPDATE. Verified by grep count = 1. |

## Known Stubs

None — this is a pure schema migration plan. No UI rendering, no data source wiring.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| vigil-core/drizzle/0017_users_email_verified_at.sql | FOUND |
| vigil-core/src/db/schema.ts | FOUND (emailVerifiedAt present) |
| vigil-core/drizzle/meta/_journal.json | FOUND (idx=17, when=1777440000000) |
| Commit 9eafd50 (Task 1) | FOUND |
| Commit 99d73f9 (Task 2) | FOUND |
| Commit 926ea09 (Task 3) | FOUND |
| Commit 4b32702 (Task 4) | FOUND |
| psql COUNT(*) WHERE email_verified_at IS NULL | 0 (GREEN) |
