---
phase: 108-work-order-statuses-userid-scoping-isolation-test
verified: 2026-04-23T17:45:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 108: work_order_statuses userId Scoping + Isolation Test — Verification Report

**Phase Goal:** work_order_statuses rows are isolated per user and the brief PDF cross-user isolation coverage gap is closed
**Verified:** 2026-04-23T17:45:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User A sets a work order status; User B's GET /v1/work-orders/statuses response does not include that row — verified by cross-user-isolation integration test | VERIFIED | `work-orders isolation` it() passes live (12/12 suite); GET scoped at `work-order-status.ts:80` via `.where(eq(workOrderStatuses.userId, userId))` |
| 2 | User A's PUT cannot overwrite User B's status for the same caseNumber — upsert conflict target is composite (userId, caseNumber) | VERIFIED | `work-order-status.ts:89`: `target: [workOrderStatuses.userId, workOrderStatuses.caseNumber]`; values include userId at line 87 |
| 3 | All four workOrderStatuses call sites in work-order-status.ts and work-orders.ts are scoped by userId | VERIFIED | `work-order-status.ts:80` (GET filter), `work-order-status.ts:89` (PUT composite target + `:87` values), `work-orders.ts:96` (status join), `work-orders.ts:223` (DELETE cleanup) |
| 4 | The migration deploys on a fresh local DB via docker/psql without error (five-step backfill ordering: ADD COLUMN nullable → backfill to seed user → SET NOT NULL → ADD FK → CREATE INDEX) | VERIFIED | `0014_work_order_statuses_user_scoping.sql` contains all 6 steps; SUMMARY 01 documents `npm run db:migrate-102` exiting 0 on both first and second run; `migrate.test.ts` D-23 inverted assertion passes live against the migrated DB |
| 5 | User B requesting GET /v1/brief/:date for a date that only User A has a brief PDF returns 404, not User A's bytes | VERIFIED | `cross-user-isolation.test.ts:349` it() block passes live: userB gets `status=404`, `body.error="brief_not_found"`, `content-type != "application/pdf"` |

**Score: 5/5 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/db/schema.ts` | workOrderStatuses with userId FK + composite PK | VERIFIED | Lines 226-240: `userId: integer("user_id").notNull().references(...)`, `primaryKey({ columns: [table.userId, table.caseNumber] })`, `index("idx_work_order_statuses_user_id")` |
| `vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql` | 5-step migration + PK swap, re-run safe | VERIFIED | All 6 steps present (ADD COLUMN → backfill DO-block → SET NOT NULL → ADD FK → CREATE INDEX → PK swap); 6 statement-breakpoints; `IF NOT EXISTS` / `EXCEPTION WHEN duplicate_object` guards throughout |
| `vigil-core/src/db/migrate.test.ts` | D-23 guardrail inverted — asserts user_id DOES exist | VERIFIED | Line 13: comment cites "D-23 (Phase 102) REVERSED in Phase 108"; line 130: it() asserts `is_nullable='NO'` and FK `confdeltype='r'`; no legacy "D-23 violation" assertion text remains |
| `vigil-core/src/routes/work-order-status.ts` | userId-scoped DI interface, GET filter, PUT composite upsert | VERIFIED | `dbSelectFn: (userId: number)` at line 15; `dbUpsertFn: (userId: number, ...)` at line 16; eq predicate at line 80; composite target at line 89 |
| `vigil-core/src/routes/work-orders.ts` | Status join + archive cleanup scoped by userId | VERIFIED | `eq(workOrderStatuses.userId, userId)` at lines 96 (GET join) and 223 (DELETE cleanup via `and(...)` wrapper) |
| `vigil-core/src/integration/cross-user-isolation.test.ts` | W-02 it() block — userB gets 404 on date only userA has | VERIFIED | Line 349: title cites "(W-02)"; date `"2099-12-28"` deconflicted from existing 2099-12-30/31 fixtures; inserts `briefs` and `briefPdfs` for userA; asserts `status=404` and `body.error="brief_not_found"`; finally block cleans up both rows |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `work-order-status.ts` GET handler | `workOrderStatuses` DB select | `.where(eq(workOrderStatuses.userId, userId))` | WIRED | `work-order-status.ts:79-80` — dbSelectFn production implementation filters by userId |
| `work-order-status.ts` PUT handler | `workOrderStatuses` upsert | `target: [workOrderStatuses.userId, workOrderStatuses.caseNumber]` | WIRED | `work-order-status.ts:88-90` — composite conflict target present; `.values({ userId, caseNumber, status })` at line 87 |
| `work-orders.ts` GET handler | `workOrderStatuses` select | `.where(eq(workOrderStatuses.userId, userId))` | WIRED | `work-orders.ts:93-96` — statusRows select scoped; statusMap still keyed by caseNumber within user scope |
| `work-orders.ts` DELETE handler | `workOrderStatuses` delete | `and(eq(workOrderStatuses.userId, userId), inArray(...))` | WIRED | `work-orders.ts:219-225` — defense-in-depth predicate present |
| `cross-user-isolation.test.ts` W-02 block | `GET /v1/brief/:date` route | In-process Hono fetch with tokenB | WIRED | `cross-user-isolation.test.ts:387` — `get(`/v1/brief/${isoDate}`, tokenB)` exercises the live route; 404 confirmed against real DB |
| `0014 migration` backfill DO-block | `users.id` via `vigil.seed_email` GUC | `current_setting('vigil.seed_email', true)` | WIRED | `0014_*.sql:23` — GUC lookup present; SUMMARY 01 confirms migration ran and DB shows `user_id NOT NULL` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `work-order-status.ts` GET production `dbSelectFn` | `rows` from `db.select()...where(eq(workOrderStatuses.userId, userId))` | `workOrderStatuses` table via Drizzle ORM | Yes — live DB query filtered by userId, not static | FLOWING |
| `work-orders.ts` `statusRows` | `db.select().from(workOrderStatuses).where(eq(...userId...))` | `workOrderStatuses` table | Yes — per-user scoped query, results populate `statusMap` consumed at line 163 | FLOWING |
| `cross-user-isolation.test.ts` W-02 | `res.status` from `GET /v1/brief/2099-12-28` | Live Postgres via `briefPdfs` + `briefs` fixture inserts | Yes — actual 404 returned from route reading real DB rows | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|----------|-------------------|--------|--------|
| work-order-status unit tests (7 tests, no DB) | `tsx --test src/routes/work-order-status.test.ts` | `# pass 7 / # fail 0` | PASS |
| cross-user isolation suite (12 tests, live DB) | `tsx --env-file=.env --test src/integration/cross-user-isolation.test.ts` | All 12 pass including `"brief PDF isolation — W-02"` and `"work-orders isolation"` | PASS |
| migrate.test.ts D-23 inverted assertion (live DB) | `tsx --env-file=.env --test src/db/migrate.test.ts` | `"work_order_statuses table DOES have NOT NULL user_id column..."` PASS; all 6 assertions pass | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| W-01 | Plans 01, 02 | work_order_statuses gains user_id FK; all 4 call sites scoped; upsert uses composite conflict target | SATISFIED | Schema: `schema.ts:226-240`; migration: `0014_*.sql`; routes: 4 call sites verified; unit tests: 7/7 pass |
| W-02 | Plan 03 | cross-user-isolation test covers GET /v1/brief/:date PDF bytes isolation | SATISFIED | `cross-user-isolation.test.ts:349`; live test passes against Postgres with `status=404` and `error="brief_not_found"` |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No TODOs, stubs, placeholder returns, or hardcoded empty values were found in any modified file | — | — |

Note: `work-orders.ts:110` contains a `// TODO: When manual work order creation is added, skip auto-archive for manual orders (D-05)` — this is a pre-existing planned extension comment, not a stub or missing implementation in this phase's scope.

---

### CR-01 Deferred Scope Acknowledgment

Per `108-CONTEXT.md` §deferred: the `work_orders.caseNumber` sole-PK cross-user collision bug (same bug class as W-01, different table) is explicitly out of scope for Phase 108. The existing `workOrders.caseNumber.primaryKey()` at `schema.ts:245` and `onConflictDoUpdate({ target: workOrders.caseNumber })` at `work-orders.ts:59` are unchanged by design. This is NOT flagged as a gap for Phase 108.

---

### Human Verification Required

None. All success criteria are verifiable programmatically and confirmed by live test runs above.

---

### Gaps Summary

No gaps found. All five success criteria are met by code that exists, is substantive, is wired, and produces real data through the call chain. Live test runs confirm runtime correctness against a real Postgres instance.

---

_Verified: 2026-04-23T17:45:00Z_
_Verifier: Claude (gsd-verifier)_
