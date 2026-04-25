---
phase: 112-forgot-password-email-flow
plan: 01
subsystem: database
tags: [migration, drizzle, schema, postgres, auth, password-reset, wave-1]

requires:
  - phase: 110-change-password-password-changed-at-gate
    provides: password_changed_at column + bearerAuth iat-gate (the gate that gets bumped on Plan 03 reset success)
  - phase: 108-work-order-statuses-userid-scoping
    provides: hand-authored migration template (0014) — same pattern reused here
provides:
  - password_reset_tokens table (7 columns, 3 indexes, FK CASCADE, CHECK constraint)
  - 0016_password_reset_tokens.sql idempotent hand-authored migration
  - drizzle/_journal.json idx 16 entry with monotonically-increasing `when`
  - passwordResetTokens drizzle pgTable export consumed by Plans 02/03
affects:
  - 112-02 (forgot-password handler — INSERTs token_hash + type='password_reset')
  - 112-03 (reset-password handler — atomic UPDATE-RETURNING claim)
  - 113 (AUTH-11 email-verify reuse — same table, type='email_verify' rows; no migration needed)

tech-stack:
  added: []
  patterns:
    - "Hand-authored idempotent SQL with IF NOT EXISTS guards (Phase 108/110 pattern)"
    - "Journal `when` strictly greater than prior entry (drizzle-kit migrate orders by `when`, not idx)"
    - "Pre-locked CHECK constraint allows future phase reuse without revisiting migration"

key-files:
  created:
    - vigil-core/drizzle/0016_password_reset_tokens.sql
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/drizzle/meta/_journal.json

key-decisions:
  - "Hand-authored SQL (no drizzle-kit generate) — snapshot chain still broken at 0014 since Phase 110, same trade-off accepted"
  - "Journal `when=1777353600000` chosen as 0015's `when` + 86400000ms (one day) — prevents drizzle-kit silent skip"
  - "CHECK constraint pre-locks both 'password_reset' and 'email_verify' values so Phase 113 reuses table without revisiting migration"
  - "FK ON DELETE CASCADE on user_id — orphan tokens cannot outlive their user (vs RESTRICT used elsewhere because reset tokens are forensic-grade ephemera, not transactional records)"
  - "0016_snapshot.json deliberately NOT generated — chain already broken at 0014; adding it without repairing 0014/0015 snapshots is futile"

patterns-established:
  - "Pre-locked CHECK constraint for cross-phase table reuse — Phase 112 establishes this pattern (Phase 113 will be the first beneficiary)"

requirements-completed: [AUTH-10]

duration: 3min
completed: 2026-04-25
---

# Phase 112 Plan 01: password_reset_tokens schema + migration Summary

**`password_reset_tokens` table landed on disk and in the live DB — 7 columns, 4 indexes (3 declared + pkey), FK CASCADE to users.id, CHECK constraint pre-locked for both 'password_reset' and 'email_verify' so Phase 113 reuses the table without a new migration. Idempotent hand-authored 0016 SQL.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-25T01:12:06Z
- **Completed:** 2026-04-25T01:14:52Z
- **Tasks:** 3 / 3
- **Files modified:** 2 (schema.ts, _journal.json)
- **Files created:** 1 (0016_password_reset_tokens.sql)

## Accomplishments

- `passwordResetTokens` drizzle pgTable export added to `vigil-core/src/db/schema.ts` after `aiCache`. 7 columns + 3 indexes (idx_prt_token_hash UNIQUE, idx_prt_user_id_type composite, idx_prt_expires_at). FK CASCADE on `userId` to `users.id`.
- `vigil-core/drizzle/0016_password_reset_tokens.sql` authored — 4 idempotent statements (CREATE TABLE, UNIQUE INDEX, 2 INDEXes), all with `IF NOT EXISTS`. Re-running `npm run db:migrate` is a verified no-op.
- `_journal.json` entry idx 16 with `when=1777353600000` (strictly greater than 0015's `1777267200000`); monotonic `when` ordering verified across all 17 entries.
- Migration applied to live DB. Verified 1 table, 7 columns, 4 indexes (3 + pkey), CHECK constraint matches, FK CASCADE wired. Both destructive probes fired correctly: `INSERT type='invalid_type'` rejected by CHECK; `INSERT user_id=999999999` rejected by FK.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add passwordResetTokens pgTable to schema.ts** — `68918bb` (feat)
2. **Task 2: Hand-author 0016 SQL + add journal entry** — `3b80653` (feat)
3. **Task 3: Apply migration to live DB** — no file commit (runtime verification only; live DB now has the table per `\d password_reset_tokens` + `__drizzle_migrations` tracking row 43d78ce…)

## Files Created/Modified

### Created
- `vigil-core/drizzle/0016_password_reset_tokens.sql` — 4 idempotent SQL statements (CREATE TABLE + 3 indexes), CHECK constraint, FK CASCADE.

### Modified
- `vigil-core/src/db/schema.ts` — appended `passwordResetTokens` pgTable after `aiCache` (35 LOC added). No other tables touched.
- `vigil-core/drizzle/meta/_journal.json` — appended idx 16 entry with `when=1777353600000`, `tag="0016_password_reset_tokens"`.

## schema.ts Diff Snippet (placement — at end of file, after aiCache)

```typescript
// ── password_reset_tokens (Phase 112 — AUTH-10 forgot-password flow) ──────────
// Schema is permanent for two phases:
//   - Phase 112 writes type='password_reset' rows on /v1/auth/forgot-password.
//   - Phase 113 (AUTH-11) writes type='email_verify' rows; the CHECK constraint
//     is pre-locked here so 113 doesn't need to revisit the migration.
// ...
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    type: text("type").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_prt_token_hash").on(table.tokenHash),
    index("idx_prt_user_id_type").on(table.userId, table.type),
    index("idx_prt_expires_at").on(table.expiresAt),
  ],
);
```

## 0016 Migration — Statement Count

- **4 statements** separated by `--> statement-breakpoint`:
  1. `CREATE TABLE IF NOT EXISTS "password_reset_tokens"` — 7 columns, FK CASCADE, CHECK constraint
  2. `CREATE UNIQUE INDEX IF NOT EXISTS "idx_prt_token_hash"` on `(token_hash)`
  3. `CREATE INDEX IF NOT EXISTS "idx_prt_user_id_type"` on `(user_id, type)`
  4. `CREATE INDEX IF NOT EXISTS "idx_prt_expires_at"` on `(expires_at)`
- Every statement uses `IF NOT EXISTS` → re-run safe (verified live).

## Journal Entry

```json
{
  "idx": 16,
  "version": "7",
  "when": 1777353600000,
  "tag": "0016_password_reset_tokens",
  "breakpoints": true
}
```

`when` = `1777353600000` = 0015's `1777267200000` + 86400000 (one day). Monotonic ordering verified — `node -e "...every((v,i)=>i===0||v>w[i-1])"` returns `true`.

## Live DB Verification

| Check | Expected | Actual |
|---|---|---|
| `information_schema.tables.password_reset_tokens` count | 1 | 1 |
| `information_schema.columns.password_reset_tokens` count | 7 | 7 |
| Indexes on `password_reset_tokens` (incl. pkey) | 4 | 4 (`password_reset_tokens_pkey`, `idx_prt_token_hash` UNIQUE, `idx_prt_user_id_type`, `idx_prt_expires_at`) |
| CHECK constraint definition | accepts `'password_reset'` AND `'email_verify'` | `CHECK ((type = ANY (ARRAY['password_reset'::text, 'email_verify'::text])))` |
| FK target | `users(id) ON DELETE CASCADE` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` |
| `INSERT` with `type='invalid_type'` | rejected | `ERROR: ... violates check constraint "password_reset_tokens_type_check"` |
| `INSERT` with `user_id=999999999` | rejected | `ERROR: ... violates foreign key constraint "password_reset_tokens_user_id_fkey"` |
| Re-run `npm run db:migrate` | exits 0, no new statements | `[✓] migrations applied successfully!` (only `__drizzle_migrations`/schema NOTICE skips) |
| `__drizzle_migrations` tracking row for 0016 | `created_at = 1777353600000` | `created_at = 1777353600000` (matches journal `when`) |

## Decisions Made

- **Hand-authored SQL over `drizzle-kit generate`:** snapshot chain has been broken since Phase 108 (`0014_snapshot.json` still missing from `meta/`). Phase 110 accepted the same trade-off. Adding 0016_snapshot.json without first repairing 0013→0014→0015 chain would be futile.
- **`when=1777353600000` (one day after 0015):** RESEARCH §Pitfall 2 documents that drizzle-kit migrate orders by `when`, not idx. Phase 110 had to retroactively bump 0015's `when` for the same reason. Using a clean +1 day step keeps room for future Phase 113's 0017 entry.
- **CHECK constraint pre-locks `email_verify`:** Phase 112 only writes `password_reset` rows but Phase 113 (AUTH-11) reuses this table. Locking both values now means Phase 113 needs zero schema work.
- **`onDelete: "cascade"` for userId FK** (vs `restrict` everywhere else in this schema): reset tokens are forensic-grade ephemera, not transactional records. When a user is deleted, their tokens go with them — no orphan rows, no ALTER TABLE migration needed in the user-deletion phase.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Threat Surface (per plan threat_model)

All STRIDE threats T-112-01-01 through T-112-01-07 were addressed at the migration layer:

- **T-112-01-01 (idempotency)** — `IF NOT EXISTS` on every statement; second `db:migrate` exits clean ✓
- **T-112-01-02 (silent skip from stale `when`)** — `when=1777353600000 > 1777267200000` verified ✓
- **T-112-01-03 (CHECK shape)** — both `password_reset` and `email_verify` accepted; `invalid_type` rejected ✓
- **T-112-01-04 (raw token leak)** — column named `token_hash`, not `token`; runtime mitigation deferred to Plan 02 ✓
- **T-112-01-05 (missing UNIQUE on token_hash → split claim)** — `idx_prt_token_hash` UNIQUE in place ✓
- **T-112-01-06 (created_at forensic timeline)** — `created_at TIMESTAMPTZ DEFAULT now() NOT NULL` present ✓
- **T-112-01-07 (FK CASCADE leak)** — accepted; CASCADE silently removes rows on user deletion ✓

No new threat flags — every surface introduced is already in the plan's threat model.

## User Setup Required

None — no external service configuration required. Live DB migration applied; Railway production will pick up 0016 on next vigil-core deploy via the existing `npm run db:migrate` post-deploy hook (RAILWAY_SERVICE_ID gate).

## Next Phase Readiness

- **Plan 02 (forgot-password handler) unblocked** — `passwordResetTokens` is importable from `schema.ts` and the table exists live. INSERTs with `type='password_reset'` will succeed.
- **Plan 03 (reset-password handler) unblocked** — atomic UPDATE-RETURNING claim (D-02) can execute against this exact shape. UNIQUE index on `token_hash` gives deterministic single-row lookup.
- **Phase 113 (AUTH-11 email-verify)** — table is pre-shaped; CHECK constraint accepts `'email_verify'`; no schema work needed in 113.

## Self-Check: PASSED

- FOUND: vigil-core/src/db/schema.ts (modified)
- FOUND: vigil-core/drizzle/0016_password_reset_tokens.sql (created)
- FOUND: vigil-core/drizzle/meta/_journal.json (modified)
- FOUND commit: 68918bb (feat(112-01): add passwordResetTokens drizzle pgTable to schema.ts)
- FOUND commit: 3b80653 (feat(112-01): hand-author 0016_password_reset_tokens migration + journal entry)
- FOUND live DB row: drizzle.__drizzle_migrations.hash=43d78cefc87d54304da58016fd9f68d867974184bc0e6fefdbe550e819c6ab0c, created_at=1777353600000

---
*Phase: 112-forgot-password-email-flow*
*Plan: 01*
*Completed: 2026-04-25*
