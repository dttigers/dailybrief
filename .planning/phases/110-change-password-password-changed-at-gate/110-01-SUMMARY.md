---
phase: 110-change-password-password-changed-at-gate
plan: 01
subsystem: database
tags: [migration, drizzle, schema, postgres, auth, timestamptz, backfill]

# Dependency graph
requires:
  - phase: 102-multi-user-foundation
    provides: users pgTable + 5-step migration template (ADD nullable → backfill → SET NOT NULL)
  - phase: 108-work-order-statuses-userid-scoping
    provides: hand-authored migration pattern (SQL + _journal.json append, no drizzle-kit generate round-trip)
provides:
  - users.password_changed_at TIMESTAMPTZ NOT NULL column, live on local dev DB
  - D-03 backfill semantic pinned (password_changed_at = created_at for every pre-migration user)
  - drizzle migration 0015 with idempotent re-run guards (IF NOT EXISTS + WHERE-NULL filter)
  - Journal + snapshot infrastructure in place for drizzle-kit to continue diff-generating future migrations
affects:
  - 110-02 (bearerAuth gate reads this column; /v1/auth/change-password endpoint writes it)
  - 112-forgot-password-email-flow (reset-password handler will also write this column)
  - all future authenticated JWT paths (gate is cross-cutting)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "5-step migration (Phase 102/108 template), Steps 1-3 only for scalar columns — no FK/index for non-reference timestamps"
    - "When-field bumping on out-of-order hand-authored migrations to restore drizzle-kit migrator chronological ordering"

key-files:
  created:
    - vigil-core/drizzle/0015_add_password_changed_at.sql
    - vigil-core/drizzle/meta/0015_snapshot.json
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/drizzle/meta/_journal.json
    - vigil-core/drizzle/meta/0013_snapshot.json

key-decisions:
  - "D-01 placement: passwordChangedAt immediately after updatedAt with no .defaultNow() — 0015 migration handles backfill so existing JWTs stay valid"
  - "D-03 backfill literal: password_changed_at = created_at (exact equality, not approx); pinned by post-migration assert `SELECT COUNT(*) WHERE password_changed_at != created_at` returns 0"
  - "Skipped the drizzle-kit generate-then-rename dance — hand-authored the 5-step SQL per D-02 template; drizzle-kit draft (0015_lumpy_magma.sql) was discarded because it re-embedded the entire 0014 Phase 108 migration due to missing 0014_snapshot.json"

patterns-established:
  - "Rule-3 auto-fix cascade: when a migration is hand-edited AFTER drizzle-kit generates it, verify the `when` in _journal.json is strictly greater than the prior migration's `when` — drizzle-kit migrate orders by `when`, not by `idx`, and will silently skip out-of-order entries"
  - "0013_snapshot.json id/prevId repair: a future-migration generate run requires each snapshot's id to be unique; a duplicate id (0012 ≡ 0013 byte-identical from a bad Phase 107.1 repair) causes 'collision' errors"

requirements-completed: [AUTH-09]

# Metrics
duration: 5min
completed: 2026-04-24
---

# Phase 110 Plan 01: password_changed_at Column + 0015 Migration Summary

**Added `users.password_changed_at` TIMESTAMPTZ NOT NULL with D-03 backfill-to-created_at semantic, applied live via drizzle-kit migrate, with idempotency + zero-JWT-invalidation guarantees pinned by post-migration asserts.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-24T01:11:04Z
- **Completed:** 2026-04-24T01:16:44Z
- **Tasks:** 3/3
- **Files modified:** 3 (schema.ts, _journal.json, 0013_snapshot.json)
- **Files created:** 2 (0015_add_password_changed_at.sql, 0015_snapshot.json)

## Accomplishments

- `schema.ts` source-of-truth declares `passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull()` immediately after `updatedAt` per D-01, with a load-bearing comment block locking D-14 ordering.
- `drizzle/0015_add_password_changed_at.sql` ships the 3-statement 5-step template (ADD COLUMN IF NOT EXISTS nullable → backfill from created_at → SET NOT NULL), verbatim per D-02.
- Live local dev DB (`postgresql://...vigil_dev`) now has the column as `timestamp with time zone NOT NULL`. All 2 existing users backfilled to `password_changed_at = created_at` exactly (D-03 semantic preserved). Zero JWTs invalidated by the deploy — the strict-less-than gate (Plan 02 D-05) passes for every prior JWT because `iat ≥ floor(created_at/1000) = floor(password_changed_at/1000)`.
- Migration is idempotent: a second `npm run db:migrate` run adds zero new rows to `drizzle.__drizzle_migrations`.

## Schema Diff Snippet (Post-Task-1)

```typescript
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Phase 110 (AUTH-09 D-01): bearerAuth gate compares jwt.iat to
    // floor(passwordChangedAt/1000); change-password handler writes new Date()
    // here AFTER the password hash update commits (D-14). No DEFAULT — the
    // 0015 migration backfills existing rows to created_at so prior JWTs
    // (iat >= floor(created_at/1000)) keep working on deploy (D-03).
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
      .notNull(),
  },
  (table) => [uniqueIndex("uq_users_email").on(table.email)],
);
```

## 0015 SQL Statement Counts

- 1 × `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone;` (Step 1 — nullable)
- 1 × `UPDATE "users" SET "password_changed_at" = "created_at" WHERE "password_changed_at" IS NULL;` (Step 2 — D-03 backfill)
- 1 × `ALTER TABLE "users" ALTER COLUMN "password_changed_at" SET NOT NULL;` (Step 3)
- 0 × FOREIGN KEY / REFERENCES / CREATE INDEX (per D-01 / D-02 — scalar timestamp, PK-indexed reads)

## Live DB Verification (psql against local DATABASE_URL)

| Assertion | Expected | Actual |
|---|---|---|
| `data_type` on `users.password_changed_at` | `timestamp with time zone` | `timestamp with time zone` ✓ |
| `is_nullable` on `users.password_changed_at` | `NO` | `NO` ✓ |
| `COUNT(*) FROM users WHERE password_changed_at IS NULL` | `0` | `0` ✓ |
| `COUNT(*) FROM users WHERE password_changed_at != created_at` | `0` (D-03 exact) | `0` ✓ |
| Second `db:migrate` run adds rows to `__drizzle_migrations` | 0 | 0 ✓ (still 17 rows after re-run) |

## No-JWT-Invalidation Guarantee (D-03 Semantic Preserved)

For every existing `users` row: `created_at = password_changed_at` after backfill. For every JWT minted BEFORE this migration: `iat ≥ floor(created_at.getTime()/1000) = floor(password_changed_at.getTime()/1000)`. Plan 02's gate uses strict less-than (`jwt.iat < floor(ts/1000)`) so every prior JWT passes the gate — zero users kicked out by the deploy itself.

## Task Commits

1. **Task 1: Add passwordChangedAt column to schema.ts** — `9124c58` (feat)
2. **Task 2: Hand-author 0015 migration + journal + snapshot** — `de71164` (feat; includes Rule 3 auto-fix of 0013_snapshot.json id/prevId collision that blocked `drizzle-kit generate`)
3. **Task 3: Apply migration to live DB + idempotency proof** — `4afe0a6` (chore; includes Rule 3 auto-fix bumping 0015 `when` field to restore chronological ordering after the discovery below)

## Files Created/Modified

- `vigil-core/src/db/schema.ts` — Added `passwordChangedAt` column to `users` pgTable (7-line insertion, zero collateral changes)
- `vigil-core/drizzle/0015_add_password_changed_at.sql` — 3-statement 5-step migration; discarded drizzle-kit draft body and wrote hand-authored template
- `vigil-core/drizzle/meta/0015_snapshot.json` — Generated by drizzle-kit (kept intact — diff captures the column addition + Phase 108 0014 catch-up)
- `vigil-core/drizzle/meta/_journal.json` — Added entry idx 15 with tag `0015_add_password_changed_at`; `when` bumped post-initial-apply to 1777267200000 for correct ordering
- `vigil-core/drizzle/meta/0013_snapshot.json` — Rule 3 auto-fix: replaced duplicate id (`1024e7f9…`) with unique UUID + repointed prevId to actual 0012 id

## Decisions Made

- **Discarded drizzle-kit's 0015 SQL draft.** `npm run db:generate` produced `0015_lumpy_magma.sql` containing both the new `password_changed_at` column AND the entire Phase 108 `work_order_statuses` user-scoping migration (because 0014 was hand-written and never snapshot-updated). Keeping the hand-authored D-02 template per plan was the right call — applying the drizzle-kit draft would have re-run the Phase 108 migration (re-run-safe, but cognitively noisy).
- **Bumped 0015's `when` field post-generate.** drizzle-kit stamped 0015 with `1776993219709` (current wall-clock time). That's less than Phase 108's hand-written 0014 `when` of `1777180800000`. `drizzle-kit migrate` orders by `when`, not by `idx`, and silently skipped 0015 on first run. Bumped to `1777267200000` (strictly > 0014) and re-ran successfully.
- **Chose the minimal 0013 snapshot repair.** Only modified `id` + `prevId`. Did NOT reconstruct the full post-0013 schema tree or create a retroactive 0014 snapshot — that's Phase 107.1/108 drift-repair surface area already tracked in STATE.md blockers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repaired duplicate id collision in 0013_snapshot.json**
- **Found during:** Task 2 (running `npm run db:generate`)
- **Issue:** `drizzle-kit generate` errored: "drizzle/meta/0012_snapshot.json, drizzle/meta/0013_snapshot.json are pointing to a parent snapshot: drizzle/meta/0012_snapshot.json/snapshot.json which is a collision." 0013 and 0012 were byte-identical (same `id` field, same `prevId` field) — Phase 107.1 0013_work_orders_drift_repair was hand-authored and the drift-repair PR never re-ran drizzle-kit to update 0013's snapshot.
- **Fix:** Replaced 0013_snapshot.json's `id` with a freshly-generated UUID (`baf4f9b3-ac6e-4992-bb4b-7640e1a558f0`), updated its `prevId` to `1024e7f9-edcd-437f-9b4e-bdcfca37880f` (the actual 0012 id).
- **Files modified:** `vigil-core/drizzle/meta/0013_snapshot.json`
- **Verification:** `npm run db:generate` succeeded immediately after the fix.
- **Committed in:** `de71164` (Task 2 commit)

**2. [Rule 3 - Blocking] Bumped 0015 `when` field to restore chronological ordering**
- **Found during:** Task 3 (after first `npm run db:migrate` "succeeded" but the column didn't appear in `information_schema.columns`)
- **Issue:** drizzle-kit's `db:generate` stamped 0015 with `when=1776993219709` (wall-clock time 2026-04-24). Phase 108's hand-written 0014 had `when=1777180800000` (later timestamp, set arbitrarily). The drizzle-kit migrator orders pending migrations by `when` in ascending order and applies only those with `when > max(applied_when)`. Since 0015's `when` was LESS than 0014's, the migrator applied 0014 (which was still pending — never applied to this local DB before, had 16 rows max in `__drizzle_migrations` that didn't include 0014) and silently skipped 0015.
- **Fix:** Bumped 0015's `when` to `1777267200000` (strictly greater than 0014's `1777180800000`).
- **Files modified:** `vigil-core/drizzle/meta/_journal.json`
- **Verification:** Re-ran `npm run db:migrate`; 17th row appeared in `drizzle.__drizzle_migrations` with `created_at=1777267200000`; `password_changed_at` column verified live in `\d users` output.
- **Committed in:** `4afe0a6` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — Blocking)
**Impact on plan:** Both auto-fixes were directly required to complete Task 2 and Task 3. Zero scope creep — the fixes unblocked the plan's own prescribed happy path (drizzle-kit generate + drizzle-kit migrate). The 0013_snapshot.json repair touches pre-existing drift, but the scope is a 2-line id/prevId patch — not a schema reconstruction.

## Issues Encountered

- **Stale `__drizzle_migrations` state on local dev DB.** Before today, the local DB's `drizzle.__drizzle_migrations` only had 15 rows (0000–0012) — Phase 107.1's 0013 and Phase 108's 0014 had never been applied to this specific DB. The 0015 migration run not only added `password_changed_at` but incidentally applied 0013 and 0014 as well (rows 16 and 17 after the `when` bump). This is a consequence of the local DB being set up before Phase 107.1 landed; resolved by simply letting the migrator catch up. The `work_order_statuses.user_id` column + composite PK + `work_orders` drift columns (`notes`, `last_change_at`, `last_change_summary`, `archived_at`) are now also present on this DB. Confirmed via `\d users` and `\d work_order_statuses` spot-checks.

## User Setup Required

None — no external service configuration. Local dev DB fully migrated via `npm run db:migrate`. Railway production will pick up 0015 on the next deploy via the existing post-deploy `db:migrate-prod` hook (Phase 55).

## Next Phase Readiness

- Plan 02 (bearerAuth gate + `/v1/auth/change-password` endpoint) can now start. The column exists live; `bearerAuth`'s `SELECT id, password_changed_at FROM users WHERE id = userId` will succeed; the endpoint's `db.update(users).set({ passwordChangedAt: new Date() })` will succeed.
- Plan 03 (PWA change-password form) is also unblocked — it depends on Plan 02's endpoint existing, but schema drift is no longer a concern.
- **Concern carry-forward:** Railway prod DB state is unknown from this task. Plan 02 should include an acceptance test that exercises a post-migration flow against a real env (or at minimum, verify prod Railway DB reports the column in a pre-deploy smoke check). The local DB migration catch-up (rows 16–17) happened here; prod might have a different backlog.

## Self-Check: PASSED

- **Files verified:**
  - `vigil-core/src/db/schema.ts` — FOUND (grep `passwordChangedAt: timestamp("password_changed_at"` returns 1)
  - `vigil-core/drizzle/0015_add_password_changed_at.sql` — FOUND
  - `vigil-core/drizzle/meta/0015_snapshot.json` — FOUND (grep `password_changed_at` returns 2)
  - `vigil-core/drizzle/meta/_journal.json` — FOUND (idx 15 present, tag matches filename)
  - `vigil-core/drizzle/meta/0013_snapshot.json` — FOUND (id no longer collides with 0012)

- **Commits verified (git log --oneline --all | grep):**
  - `9124c58` — FOUND (Task 1: schema)
  - `de71164` — FOUND (Task 2: 0015 SQL + journal + snapshot + 0013 repair)
  - `4afe0a6` — FOUND (Task 3: when bump + live apply)

- **Live DB verified:** data_type + is_nullable + null count + mismatch count + idempotency all return expected values (see Live DB Verification table above).

---
*Phase: 110-change-password-password-changed-at-gate*
*Plan: 01*
*Completed: 2026-04-24*
