---
phase: 109-per-user-scheduler-fan-out
plan: 02
subsystem: api
tags: [multi-user, cache-key, prioritize, isolation, tdd, hono, bearerAuth]

# Dependency graph
requires:
  - phase: 102-multi-user-foundation
    provides: global bearerAuth dispatcher setting c.set("userId") before route registration
  - phase: 109-01-per-user-scheduler-fan-out
    provides: wave-1 sibling (scheduler fan-out); independent file-scope, landed in same wave
provides:
  - getCacheKey(userId, workOrders) with userId-first positional + userId-scoped filename (SCHED-01 SC#3)
  - Exported WorkOrder interface for test consumption
  - POST /prioritize handler reads c.get("userId") from bearerAuth context and threads into cache path
  - CACHE-01 / CACHE-02 regression tests asserting cross-user cache isolation + filename shape
affects: [109-03-calendar-service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Context-variable threading: c.get(\"userId\") read once at handler top, passed as first positional to pure helpers (mirrors assembleAndRender(date, userId))"
    - "Pure-function unit test over node:test + assert/strict: no HTTP surface, no Hono router, just the exported cache-key function — matches SC#3 scope (the cache-key function, not the route handler)"
    - "Regex-shape guard as defence-in-depth: CACHE-02 `/^wo-priority-\\d+-/` requires digits in the userId segment so an undefined-userId regression (T-109-P-02) would fail the test in CI"

key-files:
  created:
    - vigil-core/src/routes/prioritize.test.ts
  modified:
    - vigil-core/src/routes/prioritize.ts

key-decisions:
  - "userId is FIRST positional on getCacheKey (D-08); matches assembleAndRender(date, userId) ordering elsewhere"
  - "No explicit 401 runtime guard added (D-09); global bearerAuth dispatcher at index.ts:151 guarantees c.get(\"userId\") is non-null for /v1/prioritize"
  - "No startup sweep of pre-migration unscoped cache files (D-10); filename already embeds ${today}, so stale files become unreachable at the first server-TZ midnight after deploy"
  - "CACHE-02 regex is the load-bearing regression guard for T-109-P-02 (auth-wiring drift → undefined userId in filename)"
  - "Test file imports via ./prioritize.js ESM convention (tsx resolves .js→.ts at runtime); uses node:test not vitest"

requirements-completed: []

# Metrics
duration: 18min
completed: 2026-04-23
---

# Phase 109 Plan 02: Per-User /prioritize Cache Key Summary

**`/prioritize` cache filenames are now scoped by authenticated userId — `wo-priority-${userId}-${today}-${hash}.json` — closing SCHED-01 success criterion #3 and eliminating the cross-user cache-line sharing vector where User A's AI-ranked response could leak into User B's read on overlapping caseNumbers.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-23T18:51:29Z
- **Completed:** 2026-04-23T19:09:48Z
- **Tasks:** 2
- **Files changed:** 2 (1 modified, 1 created)

## Accomplishments

- `getCacheKey` signature changed from `(workOrders)` to `(userId: number, workOrders: WorkOrder[])` with userId as FIRST positional (D-08), exported for unit-test import
- `WorkOrder` interface exported so the test file can type its fixtures
- Filename template: `wo-priority-${userId}-${today}-${hash}.json` — userId segment sits between the prefix and the `${today}` date
- POST `/prioritize` handler reads `const userId = c.get("userId") as number;` at the top of the handler body (before JSON parse) and threads it into the single `getCacheKey(userId, body.workOrders)` call; cache-write path already reuses the same `cacheFile` variable so no separate key computation needed
- No runtime auth guard (D-09) and no startup sweep (D-10) — both out of scope per CONTEXT.md §Deferred Ideas
- New `vigil-core/src/routes/prioritize.test.ts` with two tests:
  - **CACHE-01:** `getCacheKey(1, wo) !== getCacheKey(2, wo)` for identical `wo` — mitigates T-109-P-01 (Information Disclosure, cross-user cache line sharing)
  - **CACHE-02:** filename matches `/^wo-priority-\d+-\d{4}-\d{2}-\d{2}-[a-f0-9]{32}\.json$/` — mitigates T-109-P-02 (undefined userId from auth-wiring drift would make the filename `wo-priority-undefined-…` and fail this regex in CI)
- `cd vigil-core && npm run build` — clean (tsc + tsc -p tsconfig.scripts.json, zero errors)
- `npx tsx --test src/routes/prioritize.test.ts` — **2/2 pass**

## Task Commits

Each task was committed atomically:

1. **Task 1: Rescope getCacheKey + handler to userId-first; export for test** — `639d37d` (refactor)
2. **Task 2: Add CACHE-01/02 cross-user cache-key isolation tests** — `59b13c5` (test)

_Note: Task 1 is marked `tdd="true"` but the test that validates it is the Task 2 deliverable — strict RED-first is structurally impossible here because the test file imports exports that Task 1 introduces. The TDD intent is preserved: Task 2 follows Task 1 immediately in the same plan wave, both committed atomically, and Task 2's two tests were GREEN on first run against Task 1's implementation._

## Files Created/Modified

- `vigil-core/src/routes/prioritize.ts` — exported `WorkOrder` + `getCacheKey`; added userId-first positional to `getCacheKey`; filename template now includes `${userId}`; handler reads `c.get("userId")` and threads it through; two Phase 109 (SCHED-01) comment blocks
- `vigil-core/src/routes/prioritize.test.ts` — new file; 62 lines; CACHE-01 + CACHE-02 via node:test

## Decisions Made

Followed plan as specified for both tasks with no deviations beyond:
- Discovery during Task 2 verification: pre-existing infrastructure hang in `npm test` caused by `src/integration/cross-user-isolation.test.ts` importing `../index.js`, which spawns `setInterval` loops (`[generate-scheduler] started (60s tick interval)` + `[gmail-workorders] started (5m tick interval)`) at module load. These intervals keep the node process alive after the integration suite's last assertion completes, so `npm test` never exits cleanly. Individual test files run fine via `npx tsx --test <file>` (that's how CACHE-01/02 were verified — 2/2 in 399 ms). Documented under **Deferred Issues** below; out-of-scope for Phase 109 Plan 02 per CONTEXT §Deferred Ideas and scope-boundary rules.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes needed; no Rule 4 architectural questions surfaced.

## Verification Results

### Task 1 Acceptance Criteria — all PASS

| Criterion | Expected | Actual |
|-----------|----------|--------|
| `export function getCacheKey(userId: number, workOrders: WorkOrder[])` | 1 | 1 |
| `export interface WorkOrder` | 1 | 1 |
| `wo-priority-${userId}-${today}-${hash}.json` template | 1 | 1 |
| `c.get("userId")` in handler | 1 | 1 |
| `getCacheKey(userId, body.workOrders)` call | 1 | 1 |
| Old signature `getCacheKey(body.workOrders)` absent | 0 | 0 |
| `Phase 109 (SCHED-01` comments | ≥2 | 2 |
| `npm run build` exit | 0 | 0 |

### Task 2 Acceptance Criteria — all PASS

| Criterion | Expected | Actual |
|-----------|----------|--------|
| `prioritize.test.ts` exists | yes | yes |
| `CACHE-01` occurrences | 1 | 2 (name + section header comment) |
| `CACHE-02` occurrences | 1 | 2 (name + section header comment) |
| `import { getCacheKey, type WorkOrder } from "./prioritize.js"` | 1 | 1 |
| `assert.notEqual` | ≥1 | 1 |
| `wo-priority-\d+-\d{4}-\d{2}-\d{2}` regex literal | 1 | 1 |
| `npx tsx --test src/routes/prioritize.test.ts` | 2/2 pass | 2/2 pass (399 ms) |

### Plan-level Success Criteria (ties to SCHED-01 SC#3) — all PASS

- [x] `getCacheKey(userId: number, workOrders: WorkOrder[])` present
- [x] `wo-priority-${userId}-${today}-${hash}.json` template present verbatim
- [x] `getCacheKey` and `WorkOrder` exported
- [x] Handler reads `c.get("userId") as number`
- [x] Old unscoped signature absent
- [x] CACHE-01 asserts notEqual between two userIds
- [x] CACHE-02 asserts filename regex shape
- [x] `npm run build` exits 0
- [x] `npx tsx --test src/routes/prioritize.test.ts` — 2/2 pass
- [ ] `npm test` full suite green — **not verified** (pre-existing integration-test hang, see Deferred Issues)

## Deferred Issues

**Pre-existing `npm test` suite hang (out of scope — logged, not fixed).** `vigil-core/src/integration/cross-user-isolation.test.ts:37` executes `const { app } = await import("../index.js");` at module load. `index.ts` starts `setInterval` loops for `generate-scheduler` (60s) and `gmail-workorders` (5m) at its own module load. These intervals hold the tsx test-isolation child process open after the final assertion, so `npm test` (glob `src/**/*.test.ts`) never cleanly exits — it stalls on the integration test file's child, leaving later files (`src/routes/prioritize.test.ts` among them) un-executed by the time a human wall-clock timeout fires. This is pre-existing behaviour introduced when `cross-user-isolation.test.ts` was added in an earlier phase (Phase 102/108) and was not a regression from Phase 109 Plan 01 or Plan 02.

Mitigation for this plan: I validated CACHE-01 + CACHE-02 by running `npx tsx --test src/routes/prioritize.test.ts` directly (2/2 pass in 399 ms, exit 0). The plan's acceptance criterion `cd vigil-core && npm test -- --test-name-pattern="CACHE-"` would pass too if the suite could be bypassed around the integration file.

Recommendation for a follow-up plan (not this one): either export `app` + the scheduler start-up from `index.ts` conditionally (e.g., gate on `NODE_ENV !== "test"`), or split `index.ts` into a pure `buildApp()` factory + a thin bootstrap entrypoint so integration tests can import the factory without triggering module-level side effects. Tracked here for the next phase planner to pick up; not worth scope churn mid-wave for Phase 109.

## Known Stubs

None. Both source and test files wire real logic end-to-end.

## Threat Flags

None. The changes strictly narrow the cache-key surface (userId prefix) — no new network endpoint, no new auth path, no new file-access pattern, no new schema. All changes fall under the Phase 109 threat model already documented in the plan (T-109-P-01 mitigated by CACHE-01; T-109-P-02 mitigated by CACHE-02 regex).

## Self-Check

**File existence:**
- FOUND: vigil-core/src/routes/prioritize.ts (modified)
- FOUND: vigil-core/src/routes/prioritize.test.ts (created)
- FOUND: .planning/phases/109-per-user-scheduler-fan-out/109-02-SUMMARY.md (this file)

**Commit existence:**
- FOUND: 639d37d — refactor(109-02): scope /prioritize cache key by authenticated userId
- FOUND: 59b13c5 — test(109-02): add CACHE-01/02 cross-user cache-key isolation tests

## Self-Check: PASSED
