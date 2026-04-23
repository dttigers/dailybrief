---
phase: 108-work-order-statuses-userid-scoping-isolation-test
plan: "03"
subsystem: testing
tags: [postgres, drizzle, hono, integration-test, isolation, brief-pdfs, auth]

requires:
  - phase: 108-01
    provides: brief_pdfs table with userId FK + migration 0014 applied to live DB
  - phase: 108-02
    provides: work_order_statuses userId scoping (route layer, 4 call sites)

provides:
  - W-02 it() block in cross-user-isolation.test.ts proving GET /v1/brief/:date returns 404 when only another user has a brief on that date
  - brief_pdfs fixture insert + cleanup in try/finally (template for future briefPdfs isolation tests)

affects: [cross-user-isolation.test.ts, phase-109, any future plan touching brief-generate.ts]

tech-stack:
  added: []
  patterns:
    - "Isolation test pattern: insert fixture rows inside it() body, assert scoped 404, cleanup in finally (mirroring brief-history isolation test at line 305)"
    - "Lazy import of briefPdfs inside it() body via const { briefPdfs } = await import('../db/schema.js') — consistent with aiCache pattern at line 391"

key-files:
  created: []
  modified:
    - vigil-core/src/integration/cross-user-isolation.test.ts

key-decisions:
  - "Date 2099-12-28 used per D-13 — deconflicted from existing 2099-12-30/2099-12-31 fixtures in brief-history isolation test"
  - "Single scenario only per D-14 — 404 assertion sufficient; byte-compare adds nothing given route's scoped query shape"
  - "Cleanup order: brief_pdfs deleted before briefs — explicit rather than relying on ON DELETE CASCADE"
  - "Title cites (W-02) suffix per must_have artifact constraint"

patterns-established:
  - "brief_pdfs fixture: insert Buffer.from('...') as bytes with byteLength=pdfBytes.length; briefId FK to briefs.id must be inserted first"

requirements-completed: [W-02]

duration: 12min
completed: "2026-04-23"
---

# Phase 108 Plan 03: W-02 Brief PDF Cross-User Isolation Test Summary

**New it() block in cross-user-isolation.test.ts asserts userB gets 404 on GET /v1/brief/2099-12-28 when only userA has a brief+PDF on that date — proving GET /v1/brief/:date scopes by userId**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-23T15:40:00Z
- **Completed:** 2026-04-23T15:52:37Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added W-02 `it()` block at line 349 in `cross-user-isolation.test.ts`, immediately after the `brief-history isolation` test and before the `work-orders isolation` test
- Test inserts a `briefs` row and a `brief_pdfs` row for userA on `2099-12-28`, then userB calls `GET /v1/brief/2099-12-28` with tokenB and the test asserts `status === 404`, `body.error === 'brief_not_found'`, and `content-type !== 'application/pdf'`
- Full 12-test suite passes; idempotent cleanup verified on two consecutive runs (no lingering fixture rows)
- TypeScript check clean — `npx tsc --noEmit` produces no errors in `cross-user-isolation.test.ts`

## Task Commits

1. **Task 1: Add W-02 it() block — brief PDF isolation via GET /v1/brief/:date** - `9c69cc7` (test)

**Plan metadata:** (docs commit follows — see state updates)

## Files Created/Modified

- `vigil-core/src/integration/cross-user-isolation.test.ts` - Added 68 lines: W-02 it() block at line 349 with insert/assert/finally cleanup for briefs + briefPdfs

## Test Suite Output (first run)

```
▶ cross-user isolation (AUTH-05)
  ✔ GET /v1/thoughts returns only caller's rows — userA does NOT see userB's content (16.95ms)
  ✔ GET /v1/thoughts/:id — userA requesting userB's thought id returns 404 (4.00ms)
  ✔ GET /v1/summary uses only caller's thoughts (no cross-user pollution) (7.05ms)
  ✔ GET /v1/projects returns only caller's projects (8.49ms)
  ✔ POST /v1/thoughts/bulk/delete with userB's ids from userA's token deletes 0 rows (4.80ms)
  ✔ POST /v1/links — userA cannot create link between their thought and userB's thought (3.00ms)
  ✔ seed user's existing vk_ key still returns seed-user data (backwards-compat D-03) (3.43ms)
  ✔ chat-sessions isolation — GET /v1/chat-sessions returns only caller's sessions (7.72ms)
  ✔ brief-history isolation — GET /v1/briefs returns only caller's briefs (10.24ms)
  ✔ brief PDF isolation — userB cannot retrieve userA's PDF bytes on a date only userA has (W-02) (8.28ms)
  ✔ work-orders isolation — GET /v1/work-orders returns only caller's orders (7.90ms)
  ✔ insights cache isolation — GET /v1/insights/cache does not serve userA's cache to userB (aiCache.userId) (5.31ms)
✔ cross-user isolation (AUTH-05) (217.04ms)
```

12/12 pass. Second run (idempotent cleanup verification): 12/12 pass.

## Date Deconfliction Confirmation

All 2099-* date strings in the file:
- `"2099-12-28"` — W-02 fixture (this plan)
- `"2099-12-30"` — brief-history isolation test (userA's brief, pre-existing)
- `"2099-12-31"` — brief-history isolation test (userB's brief, pre-existing)
- `"2099-12-01"` — brief-history isolation test query range start
- `"2099-12-31"` — brief-history isolation test query range end

No collision. W-02's date `2099-12-28` is fully deconflicted.

## 404 Route Branch Observed

The route at `brief-generate.ts:163` returns `{ error: "brief_not_found", date, regenerable: false }` when `rows.length === 0`. Since userB has no `briefs` row on `2099-12-28`, the `where(and(eq(briefs.userId, userId), eq(briefs.date, date)))` clause returns zero rows — triggering the "no briefs row at all" 404 branch. This is the expected branch per W-02's design.

## Decisions Made

- Used `2099-12-28` per D-13 (deconflicted from existing fixtures)
- Single scenario only per D-14 — no same-date-both-users byte comparison
- Cleanup order: `briefPdfs` deleted before `briefs` (explicit, mirrors test style)
- `briefPdfs` lazily imported inside the it() body matching the `aiCache` pattern at line 391

## Deviations from Plan

None — plan executed exactly as written. The W-02 it() block matches the exact template provided in the plan's `<action>` section.

## Issues Encountered

The plan's `<verify>` command used `node --test` directly, which fails with `ERR_MODULE_NOT_FOUND` because the `.ts` source files require the `tsx` runtime. Used `tsx --env-file=.env --test` instead, which is the project's established pattern (`npm test` script). Tests passed immediately.

## Known Stubs

None — this plan adds a test that exercises live DB rows. No hardcoded values flow to UI rendering.

## Phase 108 Completion Check

With Plan 03 complete:
- **W-01:** work_order_statuses userId column + migration 0014 + 4 route call sites scoped (Plans 01 + 02)
- **W-02:** GET /v1/brief/:date cross-user isolation test (this plan)

Phase 108 is now complete. Both W-01 and W-02 requirements are satisfied.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 108 fully complete; Phase 109 (per-user scheduler fan-out, SCHED-01) can begin
- cross-user-isolation.test.ts now covers 12 isolation paths; the brief PDF path (W-02) is newly covered
- No blockers

## Self-Check

### Files Exist
- `vigil-core/src/integration/cross-user-isolation.test.ts` — FOUND (modified, 68 lines added)
- `.planning/phases/108-work-order-statuses-userid-scoping-isolation-test/108-03-SUMMARY.md` — this file

### Commits Exist
- `9c69cc7` — test(108-03): add W-02 brief PDF isolation test

## Self-Check: PASSED

---
*Phase: 108-work-order-statuses-userid-scoping-isolation-test*
*Completed: 2026-04-23*
