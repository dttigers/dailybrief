---
phase: 88-date-window-helper-rollover
plan: "01"
subsystem: utility
tags: [datetime, timezone, intl, node-test, tdd, backend]

requires: []
provides:
  - Pure getCurrentWeekWindow(tz, now?) returning {start, end} anchored to Wednesday 00:00 in user tz
  - Pure getRollingDayWindow(tz, days, now?) returning {start=aligned 00:00, end=now}
  - 13 unit tests (DW-01..DW-13) covering Wed-boundary, DST transitions, extreme tz offsets
affects:
  - 88-02 (GET /thoughts window default consumes getCurrentWeekWindow)
  - phase-89 (Insights/Therapy use getRollingDayWindow with days=7)

tech-stack:
  added: []
  patterns:
    - "wallClockToUtc: bounded 4-iteration correction loop converging via Intl.DateTimeFormat wall-clock parts"
    - "Injectable now param (optional Date) for deterministic testing without mocking Date.now"
    - "Pure utility module with zero imports — Intl + Date builtins only"

key-files:
  created:
    - vigil-core/src/utils/date-window.ts
    - vigil-core/src/utils/date-window.test.ts

key-decisions:
  - "wallClockToUtc uses iterative offset-correction (not binary search) bounded to 4 iterations — converges in ≤3 for all real IANA zones"
  - "end is EXCLUSIVE — plan 02 must use lt(createdAt, end) not lte to avoid Wed midnight double-inclusion"
  - "getRollingDayWindow end === now (not day-aligned) per D-02 — preserves current-moment precision for callers"
  - "dayOfWeekInTz resolved via Intl weekday:short format — avoids UTC getUTCDay() error on tz offsets near midnight"

patterns-established:
  - "Pattern: Re-resolve wall-clock parts in tz after approximate UTC subtraction — avoids DST boundary errors"
  - "Pattern: day+7 in wallClockToUtc for end — Date.UTC rolls over month/year correctly"

requirements-completed:
  - ROLLOVER-04

duration: 8min
completed: 2026-04-15
---

# Phase 88 Plan 01: Date Window Helper Summary

**Pure Wed-anchored week window utility using native Intl.DateTimeFormat with 13 passing unit tests covering DST, extreme tz offsets, and injectable now — zero new dependencies**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-15T22:36:43Z
- **Completed:** 2026-04-15T22:44:44Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Implemented `getCurrentWeekWindow(tz, now?)` that correctly anchors to most recent Wednesday 00:00 in any IANA timezone, handling DST spring-forward and fall-back weeks
- Implemented `getRollingDayWindow(tz, days, now?)` that aligns start to 00:00 on (today − days) in tz with end === now
- All 13 DW tests passing: Wed boundary (DW-01..04), DST (DW-05..06), extreme offsets Kiritimati +14 / Pago Pago -11 (DW-07..08), now-injection (DW-09), tz-diff (DW-10), RangeError (DW-11), rolling day (DW-12..13)

## Task Commits

1. **Task 1: Write failing unit tests (RED)** — `2323a9e` (test)
2. **Task 2: Implement helpers (GREEN)** — `324c737` (feat)

## Files Created/Modified

- `vigil-core/src/utils/date-window.ts` — Pure utility module: `getCurrentWeekWindow`, `getRollingDayWindow`, and three internal helpers (`getWallClockParts`, `wallClockToUtc`, `dayOfWeekInTz`). 177 lines. Zero imports.
- `vigil-core/src/utils/date-window.test.ts` — 13 DW-NN test blocks using `node:test` + `node:assert/strict`. 136 lines.

## Algorithm Notes

### wallClockToUtc — Iterative Correction

The `wallClockToUtc` function uses an iterative approach rather than binary search:

1. Start with guess = `Date.UTC(year, month-1, day, hour, min, sec)` (as if UTC)
2. Resolve guess back to wall-clock parts in the target tz via `getWallClockParts`
3. Compute diff = target wall-clock UTC − actual wall-clock UTC
4. Apply diff to guess and repeat (up to 4 iterations)

Observed convergence: 1 iteration for UTC (diff = 0), 2 iterations for all tested IANA zones including extreme offsets and DST transition weeks. Loop bounded to 4 as a safety margin (RESEARCH A2 confirmed ≤3 is sufficient for all real zones).

### `lt` vs `lte` for the end bound

`end` is `next Wednesday 00:00:00.000` in the user's tz. Plan 02 MUST use `lt(createdAt, end)` (strict less than), NOT `lte`, to avoid a one-millisecond overlap where a thought created exactly at Wednesday midnight would appear in both weeks. This matches the `[start, end)` exclusive-end semantics documented in the plan interfaces.

### Surprising behaviors encountered

None — the algorithm worked as designed on first implementation. DW-07 (Kiritimati +14) and DW-08 (Pago Pago -11) both passed on the first run, confirming the wall-clock re-resolution approach handles extreme offsets correctly.

## Decisions Made

- Used iterative correction (not named "binary search") — simpler to reason about, same convergence characteristics
- `hour === 24` normalization added in `getWallClockParts` — some V8 versions return 24 for midnight with `hour12: false`; clamped to 0 defensively
- `dayOfWeekInTz` uses string map (`Sun→0..Sat→6`) rather than `Intl.DateTimeFormat` numeric weekday, which avoids locale-dependent numbering

## Deviations from Plan

None — plan executed exactly as written. The `hour === 24 → 0` normalization is a defensive guard documented in the implementation comment; it doesn't alter behavior in current Node.js but prevents edge-case failures on other V8 versions.

## Issues Encountered

- Worktree did not have `node_modules` installed — `npm run build` could not resolve `tsc` binary. Used main repo's `node_modules/.bin/tsc --noEmit` to verify TypeScript type-check. The `date-window.ts` file itself has zero type errors. The test file has the same pre-existing `node:test`/`node:assert` "Cannot find module" TS errors as `token-crypto.test.ts` (missing `@types/node` in worktree). Not caused by this plan.
- Other test suites (calendar, pdf-service, etc.) fail with `Cannot find package 'hono'` / `Cannot find package 'pdfkit'` — all pre-existing worktree issues, out of scope.

## Per-Task Verification Map (for 88-VALIDATION.md)

| Test ID | Case | Result |
|---------|------|--------|
| DW-01 | Thursday in ET → Wed start 2024-01-10T05:00:00.000Z | PASS |
| DW-02 | Wed 00:00 ET exactly → start === now | PASS |
| DW-03 | Wed 23:59:59 UTC (18:59:59 ET) → same start | PASS |
| DW-04 | Tue 23:59:59 UTC (18:59:59 ET) → 6-day lookback | PASS |
| DW-05 | Spring-forward week → Wed start 2024-03-13T04:00:00.000Z (UTC-4) | PASS |
| DW-06 | Fall-back week → Wed start 2024-11-06T05:00:00.000Z (UTC-5) | PASS |
| DW-07 | Kiritimati +14 → start.getUTCDay()===2, start.getUTCHours()===10 | PASS |
| DW-08 | Pago Pago -11 → start.getUTCDay()===3, start.getUTCHours()===11 | PASS |
| DW-09 | Two different now → two different windows | PASS |
| DW-10 | NY vs LA → starts differ by 3 hours | PASS |
| DW-11 | "Not/A_Zone" → throws RangeError | PASS |
| DW-12 | getRollingDayWindow NY 7d → start 2024-01-04T05:00:00.000Z, end=now | PASS |
| DW-13 | getRollingDayWindow UTC 7d → start 2024-01-04T00:00:00.000Z, end=now | PASS |

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `getCurrentWeekWindow` ready for import in Plan 02 (`GET /thoughts` default filter)
- `getRollingDayWindow` ready for Phase 89 (Insights/Therapy 7-day window)
- Callers must use `lt(createdAt, end)` for the exclusive end bound — document in Plan 02
- Plan 02 must add `appSettings` import and `lt` to drizzle imports in `thoughts.ts` (confirmed via RESEARCH Pitfall 1 and 4)

---
*Phase: 88-date-window-helper-rollover*
*Completed: 2026-04-15*
