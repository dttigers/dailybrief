---
phase: 115-calendar-source-picker-thoughtrow-polish
plan: 03
subsystem: ui
tags: [pwa, react, tailwind, thought, polish, regression-test]

# Dependency graph
requires:
  - phase: 100-edit-refresh-pause
    provides: "ThoughtRow edit lifecycle (vigil:edit-started/ended) untouched by this change"
  - phase: 101-context-menu
    provides: "ThoughtRow context-menu props (preserved — no regression)"
provides:
  - "Multi-line thought content renders with preserved newlines in row view"
  - "Tailwind whitespace-pre-line utility now in compiled CSS for vigil-pwa"
  - "Regression test pinning POLISH-01 className contract against future refactors"
affects: [thoughts-ui, pwa-polish, future-thoughtrow-refactors]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-line className polish + dedicated regression test in same plan — pins the visual contract against Tailwind purging or className refactoring"

key-files:
  created: []
  modified:
    - vigil-pwa/src/components/ThoughtRow.tsx
    - vigil-pwa/src/components/ThoughtRow.test.tsx

key-decisions:
  - "Followed plan exactly — no deviations. D-15 (append whitespace-pre-line, preserve all existing classes), D-16 (textarea unchanged), D-17 (regression test locks className contract) all honored"

patterns-established:
  - "POLISH-style plans: 1 className change + 1 regression test asserting the className stays present (jsdom can't compute CSS, so the className IS the contract)"

requirements-completed: [POLISH-01]

# Metrics
duration: 3min
completed: 2026-04-27
---

# Phase 115 Plan 03: POLISH-01 ThoughtRow whitespace-pre-line Summary

**Appended `whitespace-pre-line` Tailwind utility to ThoughtRow's display-mode `<p>` className so multi-line thought captures (paste, voice transcripts) render with line breaks preserved in the row view, plus a regression test locking the className contract against future refactors.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-27T22:39:33Z
- **Completed:** 2026-04-27T22:42:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `<p>` at `vigil-pwa/src/components/ThoughtRow.tsx:399` now carries `whitespace-pre-line` alongside the pre-existing `text-gray-100 text-sm leading-relaxed line-clamp-3 break-words cursor-text`
- Edit-mode `<textarea>` at lines 387-395 remains untouched (D-16) — `<textarea>` preserves `\n` natively
- New regression test `POLISH-01-whitespace-pre-line-class` at `ThoughtRow.test.tsx` renders a multi-line thought (`'line one\nline two\nline three'`) and asserts the `<p>` className contains both `whitespace-pre-line` and the load-bearing existing classes (`text-gray-100`, `line-clamp-3`, `break-words`)
- All 26 ThoughtRow tests pass (25 pre-existing + 1 new); pre-existing tests untouched (0 deletions, 22 insertions)
- XSS posture preserved: 0 `dangerouslySetInnerHTML` (T-115-03-01 mitigation confirmed before AND after)
- `line-clamp-3` still caps visual lines at 3 (T-115-03-02/03 bounded — overflow into adjacent rows impossible regardless of newline count)

## Task Commits

Each task was committed atomically:

1. **Task 1: Append whitespace-pre-line to ThoughtRow's non-edit-mode `<p>` className** — `9265a9f` (feat)
2. **Task 2: Add POLISH-01 regression test in ThoughtRow.test.tsx** — `6050083` (test)

**Plan metadata:** _pending — final commit after this SUMMARY + STATE/ROADMAP update_

_Note: Plan 115-03 is a single-CSS-class polish; Task 1 is a one-line className edit and Task 2 is the regression test that locks it. Both committed individually per atomic-commit rules._

## Files Created/Modified
- `vigil-pwa/src/components/ThoughtRow.tsx` — Display-mode `<p>` className (line 399) gains `whitespace-pre-line`. Diff: 1 line added, 1 line removed (the same className string, plus the new utility appended).
- `vigil-pwa/src/components/ThoughtRow.test.tsx` — New describe block at end of file: `'ThoughtRow — POLISH-01 whitespace-pre-line'` containing the regression test. 22 lines inserted; 0 lines deleted from existing tests.
- `.planning/phases/115-calendar-source-picker-thoughtrow-polish/deferred-items.md` — Logs the pre-existing TS6305 stale-`.d.ts` warnings in `vigil-pwa/src/` so they don't get conflated with this plan's surface (see Issues Encountered).

## Decisions Made

None — followed plan as specified. All three POLISH-01 decisions (D-15/D-16/D-17) honored verbatim.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **Pre-existing TS6305 stale-`.d.ts` warnings in vigil-pwa.** `npx tsc --noEmit` exits non-zero with 70 TS6305 warnings about stale `.d.ts` files in `vigil-pwa/src/**`. Confirmed via stash-and-rerun that these are 100% pre-existing (70 before AND 70 after this plan's edits) and are unrelated to the single-line className change. 0 actual TypeScript errors in `ThoughtRow.tsx`. Logged to `deferred-items.md`; vitest run for `ThoughtRow.test.tsx` passes cleanly (26/26).

## User Setup Required

None — no external service configuration required. The change is a single CSS utility class; it ships when `vigil-pwa` is rebuilt and deployed (Vercel auto-deploys on push, no env var needed).

## Next Phase Readiness

- POLISH-01 requirement complete; will be visible on app.vigilhub.io after the next vigil-pwa deploy.
- Plan 115-02 (PWA calendar picker UI, Wave 2 — depends on 115-01) is unblocked and ready to execute. This plan is independent (D-18: ride-along, no dependencies).
- No blockers introduced; no carry-forward.

## Self-Check: PASSED

- FOUND: vigil-pwa/src/components/ThoughtRow.tsx (modified)
- FOUND: vigil-pwa/src/components/ThoughtRow.test.tsx (modified)
- FOUND: .planning/phases/115-calendar-source-picker-thoughtrow-polish/115-03-SUMMARY.md (created)
- FOUND: .planning/phases/115-calendar-source-picker-thoughtrow-polish/deferred-items.md (created)
- FOUND: commit 9265a9f (Task 1 feat)
- FOUND: commit 6050083 (Task 2 test)

---
*Phase: 115-calendar-source-picker-thoughtrow-polish*
*Completed: 2026-04-27*
