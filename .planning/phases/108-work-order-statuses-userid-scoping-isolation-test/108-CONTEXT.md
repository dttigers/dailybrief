# Phase 108: work_order_statuses userId Scoping + Isolation Test — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase closes two v3.4 multi-user correctness gaps:

1. **W-01** — `work_order_statuses` gains `user_id` FK + composite `(userId, caseNumber)` PK. All four call sites in `work-order-status.ts` and `work-orders.ts` are scoped by the authenticated user. Upsert conflict target is composite so User A's PUT cannot overwrite User B's status for the same caseNumber.
2. **W-02** — `cross-user-isolation.test.ts` gains a new it() block asserting User B cannot retrieve User A's brief PDF bytes via `GET /v1/brief/:date` (returns 404 on dates only User A has).

Both requirements share the same test file and the schema change in W-01 is a prerequisite for meaningful isolation semantics, so they are packaged in the same phase.

**Out of scope (explicitly):** Scheduler per-user fan-out (Phase 109, SCHED-01). Password change / forgot-password / email verify (Phases 110-113). Parallel `work_orders.caseNumber` sole-PK bug (see Deferred Ideas).

</domain>

<decisions>
## Implementation Decisions

### Schema Change
- **D-01:** `work_order_statuses` gets a new `user_id integer NOT NULL` column with `REFERENCES users(id) ON DELETE RESTRICT` — mirrors Phase 102 FK pattern on all other user-scoped tables.
- **D-02:** PK changes from `caseNumber` alone to composite `(userId, caseNumber)` using drizzle's `primaryKey({ columns: [table.userId, table.caseNumber] })` helper. The old `case_number` sole-PK constraint is dropped as part of the migration. No surrogate `id` column is added — nothing FKs into this table, so the composite PK is sufficient.
- **D-03:** Index strategy — the composite PK auto-creates an index on `(userId, caseNumber)`. Add a separate `idx_work_order_statuses_user_id` on `user_id` alone for list queries (`getAllForUser(userId)`), mirroring the pattern on every other Phase 102 scoped table (e.g., `idx_work_orders_user_id`).

### Migration (drizzle/0014_*.sql)
- **D-04:** Five-step ordering **exactly as roadmap specifies**: ADD COLUMN nullable → backfill → SET NOT NULL → ADD FK → CREATE INDEX. Wrapped in the standard drizzle migrator transaction. Re-run safe via `IF NOT EXISTS` / `DO` guards like `0012_multi_user_foundation.sql`.
- **D-05:** **Backfill target = seed user** (Phase 102 pattern). Use the `vigil.seed_email` session variable set by `migrate-102-seed.ts` to look up the seed user's id, then `UPDATE work_order_statuses SET user_id = <seed_user_id> WHERE user_id IS NULL`. Do **not** attempt to JOIN with `work_orders` to infer owning user — production today is single-seed-user only; the join-and-fallback path adds complexity for zero real benefit.
- **D-06:** Drop-and-recreate PK — the old `work_order_statuses_pkey` on `case_number` alone must be dropped **before** the composite PK is added. Sequence inside the migration: DROP CONSTRAINT (if exists) → ADD PRIMARY KEY. Guarded by `DROP CONSTRAINT IF EXISTS` for re-run safety.
- **D-07:** Migration file name and version — next drizzle file is `0014_` (last is `0013_work_orders_drift_repair.sql`). drizzle-kit generates the descriptive suffix; do not hand-rename.

### Call-Site Scoping (4 sites)
- **D-08:** `routes/work-order-status.ts:21` GET `/work-orders/statuses` — add `.where(eq(workOrderStatuses.userId, userId))` to the select. Rename/extend `dbSelectFn` in the DI interface to accept a `userId` parameter. Preserve `createWorkOrderStatusRouter(deps)` factory pattern — tests inject a mock `dbSelectFn(userId)`.
- **D-09:** `routes/work-order-status.ts:33` PUT `/work-orders/:caseNumber/status` — read `userId` via `c.get("userId")`, pass it into `dbUpsertFn(userId, caseNumber, status)`. Set the insert's `userId` field and change `onConflictDoUpdate.target` to `[workOrderStatuses.userId, workOrderStatuses.caseNumber]` (drizzle accepts a column array as a composite target).
- **D-10:** `routes/work-orders.ts:92` (status join in GET /work-orders) — change `db.select().from(workOrderStatuses)` to `.where(eq(workOrderStatuses.userId, userId))`. The `statusMap` remains keyed by `caseNumber` within the user's own scope, so the existing map lookup stays correct.
- **D-11:** `routes/work-orders.ts:214` (DELETE /work-orders/archived status cleanup) — add `eq(workOrderStatuses.userId, userId)` to the existing `inArray(caseNumber, ...)` delete predicate. Defensive: even though `archivedCaseNumbers` is already user-scoped (comes from `workOrders.where(eq(workOrders.userId, userId))`), adding the userId predicate ensures the DELETE cannot accidentally sweep another user's statuses if the upstream scoping is ever regressed.

### W-02 Isolation Test Design
- **D-12:** Add a new `it()` block to `vigil-core/src/integration/cross-user-isolation.test.ts` titled something like `"brief PDF isolation — userB cannot retrieve userA's PDF bytes on a date only userA has"`. Place it after the existing `brief-history isolation` test (~line 348).
- **D-13:** Fixture shape — **minimal, single scenario**: insert briefs + brief_pdfs rows for `userA` on a distant-future date (e.g., `2099-12-28` — deconflicted from existing 2099-12-30/31 fixtures). Do **not** insert anything for userB on that date. Then `userB` calls `GET /v1/brief/2099-12-28` with `tokenB` and the test asserts `status === 404`. Cleanup both the `brief_pdfs` row and the `briefs` row in a `finally` block, matching the existing test's cleanup pattern.
- **D-14:** Skip the same-date-both-users byte-comparison scenario. The 404 assertion is sufficient to prove the `(briefs.userId = userId)` filter is actually applied on `GET /brief/:date`. Byte-level comparison adds test complexity without catching any additional bug class given the route is a straightforward scoped join.

### D-23 Reversal Hygiene
- **D-15:** Invert (do not delete) the active assertion at `vigil-core/src/db/migrate.test.ts:130` ("work_order_statuses table does NOT have a user_id column"). Rewrite it to assert `user_id` DOES exist, is `NOT NULL`, and references `users(id)`. Preserves the "this table IS scoped" invariant as a regression guard going forward.
- **D-16:** Update the comment block at `vigil-core/src/db/migrate.test.ts:13` (`"D-23: work_order_statuses stays unscoped (no user_id column)"`) to cite Phase 108 explicitly — e.g., `"D-23 (Phase 102) REVERSED in Phase 108 — work_order_statuses is now user-scoped; assertion flipped."` Keeps the CONTEXT.md D-23 audit trail readable across phases.

### Claude's Discretion
- Exact migration SQL text (ordering guarded by roadmap D-04); drizzle-kit generation vs. hand-writing — whatever cleanest.
- Exact test block name / inline comment wording.
- Whether the new `dbSelectFn(userId)` signature renames to e.g. `dbSelectFnForUser` or just adds a parameter — minor.
- Whether to split the PLAN.md into one plan or multiple (migration/route-scope/test). Planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 108 Specification
- `.planning/REQUIREMENTS.md` (W-01, W-02) — requirement text and acceptance criteria
- `.planning/ROADMAP.md` §"Phase 108: work_order_statuses userId Scoping + Isolation Test" (lines 489-500) — goal, success criteria #1-#5, five-step migration ordering

### Phase 102 Prior Decisions (reversed by this phase)
- `.planning/milestones/v3.4-phases/102-multi-user-foundation/102-CONTEXT.md` §D-23 — the decision that `work_order_statuses` stays unscoped; **this phase explicitly reverses D-23**
- `.planning/milestones/v3.4-phases/102-multi-user-foundation/102-01-PLAN.md` steps 3-4 — establishes the 5-step ADD-COLUMN-NULLABLE → backfill → SET-NOT-NULL → ADD-FK → CREATE-INDEX template this phase reuses
- `.planning/milestones/v3.4-phases/102-multi-user-foundation/102-RESEARCH.md` (Open Q4 resolution) — rationale for why D-23 was chosen originally (reference-table heuristic)

### Code Anchors (planner + researcher must read)
- `vigil-core/src/db/schema.ts:222-228` — current `workOrderStatuses` shape (to be modified)
- `vigil-core/src/db/migrate.test.ts:130-145` — the D-23 guardrail to invert
- `vigil-core/src/db/migrate.test.ts:13` — D-23 doc comment to update
- `vigil-core/src/routes/work-order-status.ts` — all 2 call sites (GET + PUT), DI router pattern to preserve
- `vigil-core/src/routes/work-orders.ts:92,214` — the 2 call sites on the joined-read + cascade-delete paths
- `vigil-core/src/routes/brief-generate.ts:134` — `GET /brief/:date` route that W-02 tests
- `vigil-core/src/integration/cross-user-isolation.test.ts` — target file for the new W-02 it() block; existing brief-history test at line 305 is the fixture template
- `vigil-core/drizzle/0012_multi_user_foundation.sql` — 5-step migration template (ADD COLUMN IF NOT EXISTS, DO block for seed_email lookup, ALTER SET NOT NULL, ALTER ADD CONSTRAINT FK, CREATE INDEX IF NOT EXISTS)

### Tooling
- `vigil-core/scripts/migrate-102-seed.ts` — establishes the `vigil.seed_email` session var the backfill DO-block reads; new 0014 migration reuses the same mechanism
- `vigil-core/drizzle/0013_work_orders_drift_repair.sql` — last migration on record; confirms next filename is `0014_*.sql`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createWorkOrderStatusRouter(deps)` factory** (work-order-status.ts:17) — DI pattern already in place; adding `userId` to the deps interface is a clean extension, not a refactor. Existing tests continue to mock `dbSelectFn`/`dbUpsertFn`; just update the mock signatures.
- **`cross-user-isolation.test.ts` `setupFixtures`** (line 66 describe block) — userA/userB/tokenA/tokenB are already provisioned for every it() block. New W-02 test inherits this environment for free.
- **`brief-history isolation` test** (line 305) — fixture template: distant-future dates, insert-run-cleanup in try/finally, `DB_READY` skip guard.
- **5-step migration template** — `0012_multi_user_foundation.sql` Steps 3-7 can be copied with minor edits for the single `work_order_statuses` table.
- **Drizzle `primaryKey` composite helper** — already imported in schema.ts line 15 (used by other tables with composite PKs like `aiCache`/`briefs`).

### Established Patterns
- **User-scoped table layout**: `user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT` + `idx_<table>_user_id` index. Phase 108 adopts this verbatim.
- **DB-gated integration tests**: every test uses `if (!DB_READY) { t.skip(...); return; }` at the top, relies on real Postgres via `DATABASE_URL`. W-02 follows suit.
- **Composite conflict target**: drizzle accepts `target: [tableA.col1, tableA.col2]` in `onConflictDoUpdate` — no extra helper needed.
- **Seed-email session var**: `ALTER DATABASE ... SET vigil.seed_email = '<email>'` → `current_setting('vigil.seed_email')` inside SQL DO-block. Re-used by 0014.

### Integration Points
- **Drizzle migrator**: `npm run db:migrate` picks up `0014_*.sql` automatically after `drizzle-kit generate`. Confirmed path from 0012's header comment.
- **bearerAuth middleware**: sets `c.set("userId", ...)` — every modified route already reads `c.get("userId")` (work-orders.ts does this today; work-order-status.ts will start doing it).
- **migrate.test.ts test runner**: `node --test` picks up test files automatically; no separate config needed to land D-15's inverted assertion.

</code_context>

<specifics>
## Specific Ideas

- **Distant-future dates for W-02**: use `2099-12-28` specifically (2099-12-30 and 2099-12-31 are already occupied by the existing brief-history isolation test — don't collide).
- **W-02 test body is small**: ~30-40 lines mirroring the existing `brief-history isolation` test's structure — insert briefs + brief_pdfs for userA, GET with tokenB, assert 404, cleanup in finally.
- **No PWA / dashboard changes** — this phase is server-only (schema + routes + tests). UI hint on the roadmap is "no", confirmed.
- **No new env vars** — everything uses existing DATABASE_URL, seed_email session var, bearerAuth middleware.

</specifics>

<deferred>
## Deferred Ideas

### `work_orders.caseNumber` sole-PK cross-user collision (adjacent bug)
`vigil-core/src/db/schema.ts:233` defines `workOrders.caseNumber.primaryKey()` as a single-column PK. `vigil-core/src/routes/work-orders.ts:58-71` uses `onConflictDoUpdate.target: workOrders.caseNumber`. If two users ever sync the same ServiceNow caseNumber, one overwrites the other. Same bug class as W-01 on a different table.

**Why deferred:** W-01 scope is explicitly `work_order_statuses`. Folding `work_orders` in doubles the phase blast radius (different test file, different sync flow, different migration complexity) and today's seed-user-only production data means zero live collision risk. Log as a candidate for v3.7 (e.g., "W-04: work_orders composite PK") or a Phase 108.1 insert if a second user starts syncing before then.

### None-of-the-above candidates considered
- **Cross-user work_orders PK fix in same migration** — rejected (scope creep)
- **Same-date both-users byte-comparison in W-02** — rejected (over-testing for the bug shape this phase is closing)
- **Backfill via JOIN work_orders** — rejected (over-engineering for seed-user-only prod data)
- **Delete D-23 guardrail test** — rejected (prefer inversion for audit-trail continuity)

</deferred>

---

*Phase: 108-work-order-statuses-userid-scoping-isolation-test*
*Context gathered: 2026-04-23*
