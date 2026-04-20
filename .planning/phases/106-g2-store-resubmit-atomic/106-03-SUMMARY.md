---
phase: 106-g2-store-resubmit-atomic
plan: 03
subsystem: ui
tags: [g2, plugin, ui, brand, greyscale, screens, header, border, even-realities]

# Dependency graph
requires:
  - phase: 106-g2-store-resubmit-atomic
    provides: "Plan 01 atomic-gate scaffold (VERIFIED.md, check-verified.mjs, package:ehpk gate) — Plan 03 sits inside the Wave 1 gated bundle"
provides:
  - "Unified VIGIL screen surface across all 4 G2 screens (home, work-orders, affirmation, task-detail)"
  - "buildVigilHeader factory + shared formatTime helper at src/screens/header.ts (Pattern 2 option (b) — wordmark left, screen-label right)"
  - "Body borders (1/15/0 greyscale) on all 4 bodies + both empty-state and list variants of work-orders"
  - "Vigil-voice render-layer fallback copy for empty/missing/failure states (work-orders, affirmation, task-detail)"
  - "Exit-gesture footer discoverability on all 4 top-level screens (⌾ double-tap to exit / for home)"
  - "Zero new ContainerId entries — still 12 total, within host budget (Pitfall 4 preserved)"
affects: ["106-04 (screenshots pipeline)", "106-05 (pack + submission with VERIFIED.md)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared header factory pattern (buildVigilHeader) — single source of truth for brand surface across TextContainerProperty-based screens"
    - "Render-layer fallback copy (Pitfall 5) — user-facing Vigil-voice strings at screen render time, distinct from API-layer EMPTY_* sentinels"
    - "Greyscale-only brand presence — wordmark + DIVIDER row + borderColor:15 borders; no teal, no Inter (D-05 — don't render on 4-bit display)"

key-files:
  created:
    - "vigil-g2-plugin/src/screens/header.ts"
  modified:
    - "vigil-g2-plugin/src/screens/home.ts"
    - "vigil-g2-plugin/src/screens/work-orders.ts"
    - "vigil-g2-plugin/src/screens/affirmation.ts"
    - "vigil-g2-plugin/src/screens/task-detail.ts"

key-decisions:
  - "Header strategy option (b): `VIGIL <screen-label>` — keeps screen identity legible on the right while the wordmark anchors every surface (phase-specific guidance)"
  - "Header borderWidth stays 0 — the DIVIDER row is the structural separator (RESEARCH Pattern 3); an extra border would double-draw"
  - "Fallback copy lives at the screen-render layer, not the API layer (RESEARCH Pitfall 5) — API EMPTY_* sentinels still clean, user-facing voice happens where rendering happens"
  - "constants.ts UNTOUCHED — ContainerId enum remains 12 entries (T-106-03-01 mitigation / Pitfall 4); borders applied to existing containers"

patterns-established:
  - "buildVigilHeader factory: centralizes VIGIL wordmark + DIVIDER construction across all TextContainerProperty-based screens"
  - "Screen-label right-side convention: home → HH:MM AM/PM, work-orders → '<n> open', affirmation → HH:MM AM/PM, task-detail → status"
  - "Exit-gesture footer convention: top-level screens show '⌾ double-tap to exit'; sub-screens (task-detail) show '⌾ double-tap for home'"

requirements-completed: [G2-03]

# Metrics
duration: 4m 52s
completed: 2026-04-20
---

# Phase 106 Plan 03: G2-03 Unified Greyscale Surface Summary

**Unified `VIGIL <label>` header factory across all 4 G2 screens, with greyscale body borders (1/15/0), exit-gesture footers, and Vigil-voice render-layer fallbacks — zero new containers, constants.ts untouched.**

## Performance

- **Duration:** 4m 52s
- **Started:** 2026-04-20T17:34:12Z
- **Completed:** 2026-04-20T17:39:04Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 edited)

## Accomplishments
- All 4 screen files (`home.ts`, `work-orders.ts`, `affirmation.ts`, `task-detail.ts`) now build their header through `buildVigilHeader(containerID, containerName, rightSide?)` — one shared factory, one wordmark layout, one DIVIDER row.
- All 4 body containers and both variants of the work-orders body (empty-state + list) carry `borderWidth: 1, borderColor: 15, borderRadius: 0` — 5 total border declarations across 4 screens.
- All 4 footers now mention the exit gesture (`⌾ double-tap to exit` on top-level, `⌾ double-tap for home` on task-detail sub-screen).
- Three exact Vigil-voice fallback strings land at the screen-render layer:
  - work-orders empty: `No work orders open. Capture one when it finds you.`
  - affirmation failure: `Brief unavailable. Retry when you're ready.`
  - task-detail missing: `Task not found. Swipe to return.`
- `formatTime` de-duplicated — was defined in `home.ts` and `affirmation.ts`, now only exported from `header.ts`.
- Container budget preserved: `ContainerId` enum still has exactly 12 entries (grep confirms). `constants.ts` shows no diff.
- Production bundle: `dist/assets/index-Dlw5Sg9k.js` at 65.85 kB (gzip 25.30 kB); `tsc && vite build` both exit 0.

## Task Commits

1. **Task 1: Create buildVigilHeader factory in new src/screens/header.ts** — `5c00ab3` (feat)
2. **Task 2: Wire buildVigilHeader + body border + exit-gesture footer into home.ts and affirmation.ts** — `8ec2fa3` (feat)
3. **Task 3: Wire buildVigilHeader + body border + fallback copy into work-orders.ts and task-detail.ts** — `32bd1d2` (feat)

**Plan metadata:** pending final commit (this SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `vigil-g2-plugin/src/screens/header.ts` — **created** — exports `buildVigilHeader` + `formatTime`; wordmark-left + label-right + DIVIDER row; greyscale-only per D-05; 57 lines.
- `vigil-g2-plugin/src/screens/home.ts` — imports `buildVigilHeader`, body border 1/15/0, footer `↓ work orders   ⌾ double-tap to exit`; local `formatTime` removed.
- `vigil-g2-plugin/src/screens/work-orders.ts` — imports `buildVigilHeader` with third arg `` `${tasks.length} open` ``; both empty-state and listBody bordered 1/15/0; empty copy replaced with Vigil-voice; footer carries exit gesture; unused `DIVIDER` import dropped.
- `vigil-g2-plugin/src/screens/affirmation.ts` — imports `buildVigilHeader`, body border 1/15/0, footer `↑ work orders   ⌾ double-tap to exit`, `FALLBACK_AFFIRMATION` now `Brief unavailable. Retry when you're ready.`; local `formatTime` + unused `DIVIDER` import removed.
- `vigil-g2-plugin/src/screens/task-detail.ts` — imports `buildVigilHeader` with third arg `status`; render-layer fallback `Task not found. Swipe to return.` when `task.content` is empty; body border 1/15/0; footer `↑ back to list   ⌾ double-tap for home`; unused `DIVIDER` import dropped.

## Decisions Made
- **Header strategy (b) — wordmark left + screen-label right.** Chosen per phase-specific guidance: preserves screen identity (open count, status, time) while making VIGIL persistent across every surface.
- **Third `rightSide` argument is optional and defaults to `HH:MM AM/PM`.** home and affirmation omit it; work-orders passes `${tasks.length} open`; task-detail passes `status`.
- **Header borderWidth stays 0.** The DIVIDER row is the structural separator per RESEARCH Pattern 3; an additional border would double-draw.
- **Render-layer fallbacks, not API-layer.** Pitfall 5 — API already sanitizes empty shapes via `EMPTY_*` sentinels; the user-facing Vigil voice lives at the screen render call site so empty-API and empty-value states both flow through the same copy.
- **Pre-existing untracked `src/screens/header.ts` matched plan spec verbatim.** Used as-is (the file was committed by this plan's Task 1). No divergence from the plan's Example 3 code block.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused `DIVIDER` import from 3 screens**
- **Found during:** Task 2 (affirmation.ts), pre-emptively applied in Task 3 (work-orders.ts + task-detail.ts)
- **Issue:** Replacing hand-rolled `headerContent` with `buildVigilHeader(...)` eliminated the only `DIVIDER` reference in `affirmation.ts`, `work-orders.ts`, and `task-detail.ts`. Project tsconfig has `noUnusedLocals: true`, so tsc failed with `TS6133: 'DIVIDER' is declared but its value is never read` on `affirmation.ts`.
- **Fix:** Narrowed the constants.ts imports in each file to just `{ DISPLAY_WIDTH, ContainerId }` (home.ts still uses DIVIDER for its `bodyContent` assembly so kept there).
- **Files modified:** `vigil-g2-plugin/src/screens/affirmation.ts`, `vigil-g2-plugin/src/screens/work-orders.ts`, `vigil-g2-plugin/src/screens/task-detail.ts`
- **Verification:** `npx tsc` exits 0 with no `TS6133` errors after each removal; `npm run build:prod` clean.
- **Committed in:** `8ec2fa3` (Task 2 — affirmation.ts) and `32bd1d2` (Task 3 — work-orders.ts + task-detail.ts)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking — TS strictness)
**Impact on plan:** Necessary for `npx tsc` to pass; identical to the kind of lint-strictness cleanup the plan's "tsconfig strictness compliance" note anticipated for Task 1. No scope creep. `home.ts` intentionally kept the `DIVIDER` import because home.ts still uses it inside `bodyContent` between "TOP PRIORITY" and the affirmation — the plan's instruction to "Delete the now-unused `headerContent` constant" was followed, but the import itself stayed live for the body assembly.

## Issues Encountered
- None blocking. The `DIVIDER` unused-import error surfaced and was resolved in-place per Rule 3.

## User Setup Required
None — no external service configuration required.

## Recommendations for Plan 05 (Pack + Submission)
- **Figma spec cross-check (RESEARCH Q1):** Plan 05 should open Even Realities' public Figma design spec alongside simulator screenshots; any divergence (border weight, wordmark styling, padding) should be noted in `VERIFIED.md` per D-06's "planner amends the roadmap where brand intent needs translating to greyscale reality" clause.
- **Screenshot targets:** Capture at least one screen demonstrating the body border (home is the richest since it stacks task count + top priority + affirmation inside the border). Capture the work-orders empty state too — it's the most Vigil-voice-forward fallback and the most likely thing a reviewer reads.
- **VERIFIED.md G2-03 checkbox:** The G2-03 item is now code-verified (tsc + build:prod clean, all greps pass). Only remaining gate is human visual confirmation in simulator — that's Plan 05's work.

## Next Phase Readiness
- Wave 1 (Plans 02 + 03) now complete — G2-02 exit-confirm + G2-03 greyscale surface both landed.
- Plan 04 (screenshots pipeline) can start immediately — screen surfaces are stable.
- Plan 05 (pack gated by VERIFIED.md) blocked only on human-eyes verification of screenshots.
- `ContainerId` stays at 12 entries — if any future plan needs more containers, this is the limit per host spec (Pitfall 4).

## Self-Check

Verifying claims before state updates.

**Created files:**
- `vigil-g2-plugin/src/screens/header.ts` — FOUND

**Commits:**
- `5c00ab3` (Task 1) — FOUND
- `8ec2fa3` (Task 2) — FOUND
- `32bd1d2` (Task 3) — FOUND

**Acceptance gates:**
- tsc exit 0 — confirmed
- vite build exit 0 — confirmed (65.85 kB bundle)
- 4 screens use buildVigilHeader — confirmed (grep count = 4)
- 5 borderWidth:1 declarations across screens — confirmed
- ContainerId enum count = 12 — confirmed
- formatTime only defined in header.ts — confirmed (1 match across screens/)

## Self-Check: PASSED

---
*Phase: 106-g2-store-resubmit-atomic*
*Completed: 2026-04-20*
