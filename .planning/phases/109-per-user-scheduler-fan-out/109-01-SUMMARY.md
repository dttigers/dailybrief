---
phase: 109-per-user-scheduler-fan-out
plan: 01
subsystem: api
tags: [scheduler, multi-user, drizzle, dependency-injection, error-isolation, tdd]

# Dependency graph
requires:
  - phase: 102-multi-user-foundation
    provides: users table, appSettings composite PK (userId, key)
  - phase: 108-work-order-statuses-userid-scoping-isolation-test
    provides: cross-user isolation test harness pattern + per-user composite keys
provides:
  - getAllUsersFn DI seam on GenerateSchedulerDeps
  - tick() fans out across all registered users (not just seed)
  - Per-user try/catch + continue error isolation (SCHED-01 SC#2)
  - SCH-09 two-user + error-isolation regression test
affects: [109-02-prioritize-cache-key, 109-03-calendar-service, 113-email-verified]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DI-seam-with-drizzle-fallback: default helper closes over deps.db; test path overrides via deps.getAllUsersFn"
    - "Per-user try/catch + continue: inner fan-out layer inside total-function outer try/catch (T-86-07)"
    - "TODO-in-place rewrite: Phase 108 D-15/D-16 hygiene applied — rewrite resolved TODO blocks in place with phase/SC cite instead of deleting"

key-files:
  created: []
  modified:
    - vigil-core/src/services/generate-scheduler.ts
    - vigil-core/src/services/generate-scheduler.test.ts

key-decisions:
  - "TODO(AUTH-06+) marker literal removed from comment block: resolved TODOs should not advertise as unfinished work, but surrounding comment retained with AUTH-06+ reference for audit trail (CONTEXT.md §specifics rule: never delete the comments; prefix removal only)"
  - "Per-user catch uses err.message only, never err.stack (T-109-01 mitigation); PostHog side captures exceptions separately"
  - "Sequential per-user processing retained with comment noting revisit threshold (N > 10 users); Promise.all deferred"
  - "SCH-01..SCH-08 retrofit: seedUserId: 1 -> getAllUsersFn: async () => [{id:1, email:'seed@test'}] — single-user pipelines now exercised via deterministic DI mock"

patterns-established:
  - "Per-user fan-out: read settings scoped to this userId, match schedule in this user's TZ, dedupe per user, assemble per user, upsert per user — all inside try/catch + continue"
  - "Default Drizzle fallback for DI seams: if deps.fn set, use it; else if deps.db set, use drizzle; else return safe default (empty array / null)"

requirements-completed: [SCHED-01]

# Metrics
duration: 12min
completed: 2026-04-23
---

# Phase 109 Plan 01: Per-User Scheduler Fan-Out Summary

**Scheduler now iterates every registered user via `getAllUsersFn` DI seam with per-user try/catch + continue, unwinding the Phase 102 seed-user hard-scope and closing SCHED-01 SC#1, SC#2, and SC#4.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-23T18:35:59Z
- **Completed:** 2026-04-23T18:48:33Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- `GenerateSchedulerDeps.getAllUsersFn` DI seam added; default closes over `deps.db` with `SELECT id, email FROM users ORDER BY id`
- `seedUserId` DI field + `getSeedUserId()` helper + `resolvedSeedUserId` closure variable deleted (dead code)
- `tick()` rewritten: outer fail-safe wraps a for-of loop over all users; each user has its own inner try/catch using `continue` (never `return`) on failure
- Per-user failure log cites userId + email: `generate failed for user ${id} (${email})` with `err.message` only (no stack traces → T-109-01)
- SCH-01..SCH-08 retrofitted to use `getAllUsersFn` DI instead of `seedUserId`
- SCH-09 regression test added: two-user fixture, user 1 throws, user 2 succeeds, asserts fan-out + error-isolation at both upsert and log layers
- All 9 SCH tests pass; clean `npm run build`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getAllUsersFn DI seam + remove seedUserId dead code** — `07b6eef` (refactor)
2. **Task 2: Refactor tick() for per-user fan-out + retrofit SCH-01..SCH-08** — `40411a9` (feat)
3. **Task 3: Add SCH-09 two-user fan-out + error-isolation test** — `afbbaf4` (test)

_Note: Task 1's spec calls for tdd="true", but since it is a dead-code removal + interface extension, the failing-test phase is expressed as the plan-documented transitional 9-site compile error (8 test sites + 1 scheduler site); Task 2 closes all 9 with the new fan-out implementation + test retrofit in a single atomic commit. Task 3 follows strict TDD by authoring SCH-09 as a regression test against Task 2's already-green implementation._

## Files Created/Modified
- `vigil-core/src/services/generate-scheduler.ts` — TODO block rewrite, interface change, helper deletion, tick() fan-out
- `vigil-core/src/services/generate-scheduler.test.ts` — SCH-01..SCH-08 retrofit + SCH-09 new

## Decisions Made
- Followed plan as specified for all 3 tasks with one hygiene tweak:
  - Initial Phase 109 comment block as written in the plan retained the literal `TODO(AUTH-06+)` substring (referencing sibling files). The acceptance criterion `grep -q "TODO(AUTH-06+)" … exits non-zero` required the literal marker to be gone from this file. Reworded the comment to say "analogous AUTH-06+ markers" instead, preserving the audit-trail intent while satisfying the grep check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded Phase 109 comment to drop `TODO(AUTH-06+)` literal**
- **Found during:** Task 1 verification (TODO grep acceptance criterion)
- **Issue:** The canned replacement block from the plan action body still contained the literal substring `TODO(AUTH-06+)` (when describing sibling files). This violated acceptance criterion `grep -q "TODO(AUTH-06+)" generate-scheduler.ts` must exit non-zero.
- **Fix:** Reworded the sibling-service reference to `carry analogous AUTH-06+ markers` — same intent, no literal marker string.
- **Files modified:** vigil-core/src/services/generate-scheduler.ts
- **Verification:** grep now exits non-zero; intent + audit trail preserved per CONTEXT.md §specifics rule
- **Committed in:** 07b6eef (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Micro-edit to reconcile plan action body with plan acceptance criterion. No scope creep; no behavior change; no test impact.

## Issues Encountered
None. TDD cycle ran straight through: interface-first change generated the expected 9 transitional compile errors (8 test sites + 1 scheduler site), Task 2 closed all 9 in a single atomic refactor + retrofit, Task 3 added the regression guard. All 9 SCH tests pass; `npm run build` exits 0 at each task boundary (Task 1 is intentional transitional-error state; Task 2 onward is clean).

## User Setup Required

None — no external service configuration required. Changes are pure code-level; the default `getAllUsersFn` reads from the existing `users` table (Phase 102) with no schema change.

## Next Phase Readiness

**Ready for Plan 02 (prioritize cache-key userId, D-08..D-10)** — `generate-scheduler.ts` no longer references `seedUserId` / `VIGIL_SEED_USER_EMAIL`; downstream plans can reason about the scheduler as user-agnostic fan-out.

**Ready for Plan 03 (calendar-service fold-in, D-11..D-13)** — `assemble(dateStr, userId)` is now invoked per user inside the for-of loop, so wiring `calendarService.fetchTodaysEvents(userId)` into brief-assembly will flow through naturally.

**Downstream expectations unlocked:**
- Production wiring in `index.ts` is unchanged; the default `getAllUsersFn` closes over `deps.db` automatically (T-109-03: the DI seam is test-only in production)
- Future Phase 113 (email_verified filter) can refine the default query to `WHERE email_verified = true` without any caller-site changes

## Self-Check: PASSED

**File existence:**
- `vigil-core/src/services/generate-scheduler.ts`: FOUND
- `vigil-core/src/services/generate-scheduler.test.ts`: FOUND
- `.planning/phases/109-per-user-scheduler-fan-out/109-01-SUMMARY.md`: FOUND (this file)

**Commit existence:**
- `07b6eef` (Task 1): FOUND
- `40411a9` (Task 2): FOUND
- `afbbaf4` (Task 3): FOUND

**Behavioral verification:**
- `grep -c 'for (const user of allUsers)' generate-scheduler.ts` = 1 ✓
- `grep -c 'seedUserId' generate-scheduler.ts` = 0 ✓
- `grep -c 'getSeedUserId' generate-scheduler.ts` = 0 ✓
- `grep -c 'VIGIL_SEED_USER_EMAIL' generate-scheduler.ts` = 0 ✓
- `grep -c 'getAllUsersFn' generate-scheduler.ts` = 5 (≥3) ✓
- `grep -c 'Phase 109 (SCHED-01)' generate-scheduler.ts` = 4 (≥1) ✓
- `grep -q 'TODO(AUTH-06+)' generate-scheduler.ts` exits non-zero ✓
- `grep -c 'continue;' generate-scheduler.ts` = 4 (≥4) ✓
- `grep -c 'err instanceof Error ? err.message' generate-scheduler.ts` = 2 (≥2) ✓
- `grep -c 'SCH-09' generate-scheduler.test.ts` = 2 (≥1) ✓
- `npm run build` exits 0 ✓
- `npx tsx --test src/services/generate-scheduler.test.ts` = 9/9 pass ✓

---
*Phase: 109-per-user-scheduler-fan-out*
*Completed: 2026-04-23*
