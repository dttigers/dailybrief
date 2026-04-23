---
phase: 109-per-user-scheduler-fan-out
verified: 2026-04-23T23:58:00Z
status: passed
score: 6/6 goal points verified (4/4 ROADMAP success criteria + SCHED-01 requirement fully satisfied)
verdict: PASS
requirements_completed: [SCHED-01]
plans_verified: [109-01, 109-02, 109-03]
---

# Phase 109: Per-User Scheduler Fan-Out — Verification Report

**Phase Goal:** The daily brief scheduler generates briefs and prioritization caches for every registered user, with per-user error isolation (ROADMAP.md:507). Maps to requirement SCHED-01.

**Verified:** 2026-04-23T23:58:00Z
**Status:** PASS
**Re-verification:** No — initial verification.

## Goal Achievement

### Six goal points from the phase prompt

| # | Goal Point | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Remove single-seed-user hard-scope from scheduler — ALL scheduled users receive a brief | VERIFIED | `generate-scheduler.ts:210` calls `getAllUsersViaDb()`; `for (const user of allUsers)` loop at :218; `seedUserId`/`getSeedUserId`/`VIGIL_SEED_USER_EMAIL` grep counts all 0 in generate-scheduler.ts |
| 2 | Scope `/prioritize` AI cache filename by userId so A's ranked response cannot leak into B's read | VERIFIED | `prioritize.ts:34` `getCacheKey(userId: number, workOrders: WorkOrder[])`; `:38` filename template `wo-priority-${userId}-${today}-${hash}.json`; `:64` handler reads `c.get("userId")`; CACHE-01 test asserts different userIds for identical work orders yield different filenames |
| 3 | Thread userId through calendar-service; remove internal seed-user resolver | VERIFIED | `calendar-service.ts:246` `fetchTodaysEvents(userId: number)`; `:325` `fetchCalendarList(userId: number)`; `:143` `dbUpdate(userId, ...)` with `and(eq(oauthTokens.userId, userId), ...)`; `getSeedUserId`/`resolvedSeedUserId`/`VIGIL_SEED_USER_EMAIL` grep counts all 0 in calendar-service.ts |
| 4 | Atomically wire `calendarService: createCalendarService()` into BOTH brief paths (latent calendar-never-rendered bug) | VERIFIED | `index.ts:210` (scheduler path) + `routes/brief-generate.ts:44` (on-demand path) both pass `calendarService: createCalendarService()` into `createBriefAssemblyService`; both files import `createCalendarService` at the top; both additions are in a single commit (`9054a5d`) per D-12 atomicity |
| 5 | Preserve pre-existing gmail-workorder-service seed-scope (explicitly deferred) | VERIFIED (by design) | `gmail-workorder-service.ts:10-14` TODO retained with `DEFERRED: Phase 109` marker + forward pointer to 109.1/v3.7; `getSeedUserId` helper still present at :220-232 as intended; runtime behavior unchanged (deferred per CONTEXT §Deferred Ideas) |
| 6 | No cross-user data leakage via cache, scheduler state, or calendar fetch | VERIFIED | Cache: CACHE-01/CACHE-02 assert userId-scoped filenames. Scheduler: SCH-09 injects user-1 throw and asserts user-2 completes upsert (only 1 upsert lands, userId=2). Calendar: oauthTokens SELECT/UPDATE both WHERE-clause by caller-supplied userId; no fallback code path exists. |

**Score:** 6/6 goal points verified.

### Four ROADMAP Success Criteria (SCHED-01)

| SC# | Criterion | Status | Evidence |
|-----|-----------|--------|----------|
| 1 | With two registered users, scheduler tick() generates a brief attempt for each user — confirmed by log output showing both user IDs processed | VERIFIED | SCH-09 test (`generate-scheduler.test.ts:249`) injects two-user fixture and asserts `assembleCalls.length === 2` with userIds `[1, 2]`. Log lines cite userId + email per `generate-scheduler.ts:240, :255, :261`. |
| 2 | Simulated failure for User N does not prevent User N+1 from receiving a brief attempt — per-user try/catch uses continue, not return | VERIFIED | `generate-scheduler.ts:256-265` per-user catch uses `continue;` (line 264) — no `return;` inside the catch. SCH-09 throws for userId=1 and asserts user-2's upsert still lands. Grep `return;` inside catch: 0. |
| 3 | Prioritization cache filename on disk includes userId — getCacheKey() in prioritize.ts includes userId parameter | VERIFIED | `prioritize.ts:34` signature `getCacheKey(userId: number, ...)`; `:38` filename includes `${userId}` literal. CACHE-02 regex `/^wo-priority-\d+-\d{4}-\d{2}-\d{2}-[a-f0-9]{32}\.json$/` asserts digits in userId position (regression guard for undefined-userId drift). |
| 4 | Test injecting getAllUsersFn with a two-element array confirms both users iterated and independent errors do not cross-contaminate | VERIFIED | SCH-09 injects `getAllUsersFn: async () => [{ id: 1, email: "a@test" }, { id: 2, email: "b@test" }]`; assembles throws for user-1; asserts `upserts.length === 1` with `upserts[0].userId === 2`. Error log for user 1 and success log for user 2 both asserted. |

**ROADMAP score:** 4/4 success criteria verified.

## Required Artifacts (Level 1-4)

| Artifact | L1 Exists | L2 Substantive | L3 Wired | L4 Data Flows | Status |
|----------|-----------|---------------|----------|---------------|--------|
| `vigil-core/src/services/generate-scheduler.ts` | YES | YES (293 lines, DI seam + fan-out) | WIRED (`index.ts:215-225` starts scheduler) | FLOWING (tick() → getAllUsersViaDb() → users table via deps.db) | VERIFIED |
| `vigil-core/src/services/generate-scheduler.test.ts` | YES | YES (SCH-01..SCH-09, 9 tests pass) | WIRED (tsx --test runner) | N/A (test file) | VERIFIED |
| `vigil-core/src/routes/prioritize.ts` | YES | YES (122 lines, getCacheKey exported + userId-first) | WIRED (`index.ts` `app.route("/v1", prioritize)`) | FLOWING (c.get userId → getCacheKey → filesystem cache path) | VERIFIED |
| `vigil-core/src/routes/prioritize.test.ts` | YES | YES (CACHE-01/CACHE-02, 2/2 pass) | WIRED (tsx --test runner) | N/A (test file) | VERIFIED |
| `vigil-core/src/services/calendar-service.ts` | YES | YES (fetchTodaysEvents(userId) + fetchCalendarList(userId) required params) | WIRED (imported by brief-assembly + index.ts + brief-generate.ts + calendar route) | FLOWING (userId → dbSelect(userId) → oauthTokens WHERE eq(userId, ...) → Google API) | VERIFIED |
| `vigil-core/src/services/brief-assembly-service.ts` | YES | YES (CalendarServiceDeps.fetchTodaysEvents sig updated; :442 passes userId) | WIRED (both index.ts + brief-generate.ts call createBriefAssemblyService) | FLOWING (assembleAndRender(dateStr, userId) → deps.calendarService.fetchTodaysEvents(userId)) | VERIFIED |
| `vigil-core/src/index.ts:207-214` (scheduler wiring) | YES | YES (calendarService: createCalendarService() present) | WIRED (generateScheduler.start() at :225) | FLOWING (scheduler tick → assembler.assembleAndRender → calendarService) | VERIFIED |
| `vigil-core/src/routes/brief-generate.ts:41-48` (on-demand wiring) | YES | YES (calendarService: createCalendarService() present) | WIRED (app.route mount) | FLOWING (POST /brief/generate → getAssembler() → calendarService) | VERIFIED |
| `vigil-core/src/routes/calendar.ts` (handler userId plumbing) | YES | YES (two handlers, both read c.get("userId")) | WIRED (calendar router mounted in index.ts) | FLOWING (c.get userId → service.fetchTodaysEvents(userId)) | VERIFIED |
| `vigil-core/src/services/gmail-workorder-service.ts` (deferred — seed retained) | YES | YES (TODO rewritten in-place with DEFERRED marker) | WIRED (unchanged runtime behavior) | N/A (intentionally deferred; feature-gap not data-leak per CONTEXT §Deferred Ideas) | VERIFIED (by design) |

## Key Link Verification

| From | To | Via | Status | Detail |
|------|----|----|--------|--------|
| `generate-scheduler.tick()` | `deps.getAllUsersFn() → deps.db users table` | DI-seam with drizzle fallback | WIRED | `getAllUsersViaDb` helper at `:115-122` closes over `deps.db`; default `SELECT id, email FROM users ORDER BY id` |
| per-user try/catch | `continue` (not return) | for-of loop over users array | WIRED | `:264` `continue;` inside catch; grep for `return;` in catch block = 0 |
| `POST /prioritize` handler | `c.get("userId")` from global bearerAuth | ContextVariableMap at middleware/auth.ts:12-14 | WIRED | `prioritize.ts:64` reads userId; handler registered after bearerAuth dispatcher at index.ts:151 |
| `getCacheKey` | filename on disk | `wo-priority-${userId}-${today}-${hash}.json` | WIRED | `prioritize.ts:38` template literal present verbatim |
| `index.ts:207` createBriefAssemblyService | `createCalendarService()` | calendarService key in deps object | WIRED | `index.ts:210` `calendarService: createCalendarService(),` — first time scheduler path carries calendar |
| `brief-generate.ts getAssembler` | `createCalendarService()` | calendarService key in deps object | WIRED | `brief-generate.ts:44` — first time on-demand path carries calendar |
| `assembleAndRender(dateStr, userId)` | `deps.calendarService.fetchTodaysEvents(userId)` | Promise.allSettled parallel | WIRED | `brief-assembly-service.ts:442` passes userId into the method call |
| `fetchTodaysEvents(userId)` | `oauthTokens WHERE eq(userId, X) AND eq(provider, 'google')` | dbSelect(userId) → Drizzle query | WIRED | `calendar-service.ts:121-141` dbSelect with composite where clause |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| vigil-core builds cleanly | `npm run build` | exit 0, zero TS errors | PASS |
| Scheduler fan-out + isolation | `npx tsx --test src/services/generate-scheduler.test.ts` | 9/9 pass (SCH-01..SCH-09), 831ms | PASS |
| Cache-key cross-user isolation | `npx tsx --test src/routes/prioritize.test.ts` | 2/2 pass (CACHE-01, CACHE-02), 414ms | PASS |
| Calendar-service userId plumbing | `npx tsx --test src/services/calendar-service.test.ts` | 11/11 pass (incl. CAL-SCHED-01-userid-required), 906ms | PASS |
| Brief-assembly calendar call | `npx tsx --test src/services/brief-assembly-service.test.ts` | 20/20 pass, 20.8s | PASS |
| No `VIGIL_SEED_USER_EMAIL` outside deferred gmail | `grep -rn "VIGIL_SEED_USER_EMAIL" src/ --include="*.ts" \| grep -v test` | 2 hits, both in gmail-workorder-service.ts (deferred) | PASS |
| No `getSeedUserId` outside deferred gmail | `grep -rn "getSeedUserId\\|resolvedSeedUserId" src/ --include="*.ts" \| grep -v test` | 6 hits, all in gmail-workorder-service.ts (deferred) | PASS |
| No `seedUserId: 1` hardcode outside test fixtures | `grep -rn "seedUserId: 1" src/ --include="*.ts" \| grep -v test` | 0 hits | PASS |
| All documented commits exist | `git log --oneline {07b6eef, 40411a9, afbbaf4, 639d37d, 59b13c5, 4ab2d04, 4fbf4a9, df70c7f, 327a17d, 9054a5d}` | 10/10 found | PASS |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SCHED-01 | 109-01, 109-02, 109-03 | Scheduler generates daily brief + prioritization cache for every registered user; per-user error isolation; prioritization cache keyed by userId | SATISFIED | All 4 ROADMAP success criteria verified above; REQUIREMENTS.md:16 and :91 already marked Complete by executors |

No orphaned requirements. REQUIREMENTS.md traceability table correctly lists SCHED-01 → Phase 109 → Complete.

## Anti-Patterns / Review Findings

Phase 109-REVIEW.md flagged 1 critical + 3 warning + 4 info. Classification for goal-backward verification:

| Finding | File | Severity | Phase 109 Impact | Disposition |
|---------|------|----------|-------------------|-------------|
| CR-01: gmail-workorder `onConflictDoUpdate({ target: caseNumber })` collides across users | `gmail-workorder-service.ts:333` | Critical (contextual) | NONE — file is pre-existing + explicitly deferred; current code hard-scoped to seed user so only one writer exists. Weaponizes only when AUTH-06+ Gmail fan-out ships. | INFO — blocks future Phase 109.1/v3.7 Gmail fan-out, not Phase 109. Flagged in REVIEW forward-pointer. |
| WR-01: Stale comment in brief-generate.ts:108-111 claims "schedulers run as seed user" | `brief-generate.ts:108` | Warning | Informational — no runtime effect; misleads future readers about post-Phase 109 scheduler architecture. | INFO — cosmetic comment drift; does not affect goal achievement. Optional follow-up. |
| WR-02: generate-scheduler does not emit `brief_generated` PostHog event on success | `generate-scheduler.ts:245-255` | Warning | Informational — scheduler path skips analytics; `brief_generated` funnel undercounts by the scheduler-generated volume. Not part of Phase 109 success criteria (no roadmap SC mentions analytics). | INFO — analytics gap; does not block SCHED-01. Follow-up phase. |
| WR-03: calendar-service `dbUpdateFn` DI seam drops userId parameter | `calendar-service.ts:66, 143` | Warning | Informational — production `dbUpdate(userId, ...)` is correct, tests just can't verify userId reaches the wrapper via DI. | INFO — test coverage gap; production correctness intact. |
| IN-01: Redundant `as number` casts on `c.get("userId")` | `calendar.ts:17,26`, `prioritize.ts:64` | Info | None — cast is redundant given ContextVariableMap but not wrong. | INFO — style nit. |
| IN-02..IN-04 | Various | Info | None — pre-existing or cosmetic. | INFO. |

**No blockers.** All flagged issues are either (a) pre-existing in the deferred gmail-workorder-service.ts, (b) cosmetic (stale comments), or (c) orthogonal to Phase 109's goal points (analytics, DI-seam coverage, redundant casts).

## Human Verification Already Completed

Task 4 of Plan 03 was a blocking human-verify checkpoint (Path B executed):

| Signal | Expected | Actual |
|--------|----------|--------|
| `POST /v1/brief/generate` HTTP status | 200 | **200** |
| Response artifact | valid PDF | 19306-byte PDF v1.3 (1 page) |
| `[brief-assembly] Total:` log line | present | `5641ms` |
| `"No calendar service"` rejections in logs | 0 | **0** |
| `needs_reauth` debug lines in logs | ≤1 | **0** |
| Stack traces in logs | 0 | **0** |
| Brief generation completes without crash | yes | **yes** |

Path A (calendar events actually rendering in PDF) deferred to production smoke-test post-v3.6 deploy where Google OAuth rows live, per plan spec lines 663-665 (Path A and Path B treated as equally-valid acceptance paths).

## Scope Preservation Audit

| Item | In Scope | Out of Scope | Disposition |
|------|----------|--------------|-------------|
| generate-scheduler fan-out | YES | — | DELIVERED |
| /prioritize cache userId scoping | YES | — | DELIVERED |
| calendar-service userId plumbing + atomic two-site wiring | YES | — | DELIVERED |
| gmail-workorder-service fan-out | — | YES | DEFERRED by design (CONTEXT §Deferred Ideas) — TODO rewritten in-place |
| `/prioritize` route 401 defence-in-depth | — | YES | DEFERRED per D-09 rationale (global bearerAuth guarantees non-null userId) |
| AUTH-11 email_verified filter on iteration | — | YES | Phase 113 concern (documented) |
| N > 10 users perf | — | YES | CONTEXT Deferred §Timezone-matching perf — comment in-place on scheduler for loop |

## Gaps Summary

None. All 6 goal points are satisfied; all 4 ROADMAP success criteria are verified; SCHED-01 requirement fully closed; all documented commits exist; build is clean; all touched test suites pass; no orphaned seed-user code outside the explicitly deferred gmail-workorder-service.ts; human-verify checkpoint (Path B) confirms the D-12 two-site calendar wiring does not crash and does not emit the "No calendar service" rejection that the pre-Phase 109 state would have produced.

The single Critical finding in 109-REVIEW.md is correctly scoped-out of Phase 109 per CONTEXT §Deferred Ideas and is documented as a forward-pointer blocker for Phase 109.1 / v3.7 Gmail fan-out — it is NOT a Phase 109 regression or gap.

---

_Verified: 2026-04-23T23:58:00Z_
_Verifier: Claude (gsd-verifier)_
_Depth: goal-backward (6 goal points + 4 ROADMAP SCs + L1-L4 artifact trace + 8 key-link traces + 9 behavioral spot-checks)_
