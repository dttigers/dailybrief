---
phase: 106-g2-store-resubmit-atomic
plan: 02
subsystem: ui
tags: [g2, navigation, exit-confirm, shutdown-page-container, even-sdk]

# Dependency graph
requires:
  - phase: 106
    provides: atomic-gate scaffold (Plan 01 — VERIFIED.md + check-verified.mjs + package:ehpk + app.json 0.2.0)
provides:
  - G2-02 home-branch exit-confirm edge inside handleNavEvent
  - Single call site of `void bridge.shutDownPageContainer(1)` on home + DOUBLE_CLICK
  - Preserved non-home double-tap-to-home muscle memory (D-02)
affects: [106-05-pack-and-verify, future-g2-nav-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "host-rendered exit-confirm handoff — plugin fires `shutDownPageContainer(exitMode=1)` and lets Even Hub draw the confirmation dialog; no custom greyscale UI"
    - "fire-and-forget SDK Promise — `void bridge.shutDownPageContainer(1)` avoids simulator-vs-hardware divergence when Promise<boolean> semantics are undocumented (RESEARCH Pitfall 3)"

key-files:
  created: []
  modified:
    - "vigil-g2-plugin/src/navigation.ts (handleNavEvent — added one 7-line early-return branch between task-detail branch and generic switch)"

key-decisions:
  - "Fire-and-forget (`void`) over `await` — SDK Promise<boolean> semantics undocumented (Pitfall 3 / T-106-02-02)"
  - "Branch placed AFTER task-detail AND BEFORE generic switch — preserves task-detail sub-screen semantics and leaves non-home DOUBLE_CLICK→HOME case intact for work-orders/affirmation (D-02)"
  - "Existing generic-switch DOUBLE_CLICK_EVENT case left untouched — dead for home (early-return preempts) but live for work-orders/affirmation; leaving it preserves switch symmetry and D-02 muscle memory"

patterns-established:
  - "Home-screen-specific navigation behavior lives as an early-return edge inside handleNavEvent (not in main.ts, not as a new container, not as a separate state machine)"

requirements-completed: [G2-02]

# Metrics
duration: 4m 32s
completed: 2026-04-20
---

# Phase 106 Plan 02: G2-02 Home-Branch Exit-Confirm Summary

**Home double-tap hands off to Even Hub host-rendered exit-confirmation dialog via `void bridge.shutDownPageContainer(1)` — fire-and-forget, single-function edit, no custom UI.**

## Performance

- **Duration:** 4m 32s
- **Started:** 2026-04-20T05:08:26Z
- **Completed:** 2026-04-20T05:12:58Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added the G2-02 exit-confirm edge to `handleNavEvent` in `vigil-g2-plugin/src/navigation.ts` — 13 lines inserted (comment + 7-line branch + surrounding blank line).
- Home-screen double-tap now fires `void bridge.shutDownPageContainer(1)` and returns early, deferring confirm-dialog rendering to the Even Hub host (D-01).
- Non-home double-tap behavior unchanged — work-orders / affirmation / task-detail still navigate to home (D-02 muscle memory preserved).
- Fire-and-forget semantics documented inline (Pitfall 3 rationale in code comment) so future contributors don't attempt to await/branch on the Promise<boolean>.
- Type-check (`npx tsc`) and full production build (`npm run build:prod` — 66.39 kB `dist/assets/index-CCcaGTRO.js`) both exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add home-branch exit-confirm edge inside handleNavEvent** — `02a96b6` (feat)

_Plan metadata commit follows after SUMMARY is written._

## Files Created/Modified

- `vigil-g2-plugin/src/navigation.ts` — Inserted one early-return branch in `handleNavEvent` (lines 119–130) between the existing task-detail branch (lines 108–117) and the generic switch (lines 132–146). Function signature, exports, imports, and all other functions (`navigateTo`, `refreshCurrentScreen`, `navigateToTaskDetail`, `buildScreen`, `getNextScreen`, `getPrevScreen`, module-level `currentScreen`) are untouched.

### Exact Diff Applied

```typescript
// Inserted between existing task-detail branch and `let target: ScreenName`:

  // G2-02: home-screen double-tap hands off to the host-rendered exit-confirm dialog.
  // Per D-01, we do NOT render a custom confirmation UI. Per RESEARCH Pitfall 3,
  // we fire-and-forget — the SDK's Promise<boolean> semantics are undocumented,
  // and lifecycle transitions (confirm/cancel) arrive via existing FOREGROUND_*
  // listeners in main.ts (lines 75-82). exitMode=1 per D-01.
  if (
    currentScreen === Screen.HOME &&
    eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    void bridge.shutDownPageContainer(1)
    return
  }
```

## Decisions Made

- **Fire-and-forget (`void`)**: SDK d.ts comment defines `return true = 成功` (success) but doesn't clarify whether "success" means "dialog shown" or "user confirmed exit." Awaiting and branching on the boolean would create simulator-vs-hardware divergence (A3). Lifecycle handled by existing `FOREGROUND_ENTER_EVENT` / `FOREGROUND_EXIT_EVENT` listeners in `main.ts:75-82`.
- **Branch ordering (after task-detail, before generic switch)**: Task-detail must still short-circuit. Placing the home-branch AFTER task-detail preserves the sub-screen semantics. Placing it BEFORE the generic switch means the dead-code `DOUBLE_CLICK_EVENT → target = Screen.HOME` case in the switch remains harmless (home can't `navigateTo(Screen.HOME)` from home via early-return) while still catching non-home DOUBLE_CLICK per D-02.
- **No new imports, no new ContainerId entries, no new files**: Per plan objective — single-function edit. `OsEventTypeList` and `EvenAppBridge` already imported (lines 3–7); `ContainerId` budget still 12/12 in `constants.ts`.

## Deviations from Plan

None - plan executed exactly as written.

The `<action>` block specified the exact content verbatim, and the edit matched that spec one-for-one. All 9 acceptance criteria from the task's `<acceptance_criteria>` verify:

| Criterion | Result |
|-----------|--------|
| `grep -cE 'shutDownPageContainer\(1\)' src/navigation.ts` returns exactly `1` | ✅ `1` |
| `grep -qE 'void bridge\.shutDownPageContainer\(1\)' src/navigation.ts` matches | ✅ OK |
| Home + DOUBLE_CLICK_EVENT conditions co-occur in new branch | ✅ lines 124–127 |
| `grep -q 'currentScreen === Screen.TASK_DETAIL'` matches | ✅ line 108 intact |
| `grep -qE 'case OsEventTypeList\.DOUBLE_CLICK_EVENT:'` matches | ✅ line 141 intact |
| `grep -c '^import' vigil-g2-plugin/src/navigation.ts` — same count (import lines unchanged) | ✅ 7 (same as pre-edit — 2 `import { ... } from` + 1 `import type { ... } from` + 4 local `.ts` imports) |
| `npx tsc` exits 0 | ✅ exit 0 |
| No new ContainerId entries in constants.ts | ✅ still 12 |
| Manual simulator verify (106-02-03 + D-02 regression) | ⏸ deferred to Plan 05 simulator session (per plan) |

## Issues Encountered

None.

## Authentication Gates

None — edit was local, no external services involved.

## Hardware / Simulator Note (RESEARCH A3)

Per RESEARCH §"Assumptions Log" A3 and §Pitfall 3: the simulator-vs-hardware behavior of `bridge.shutDownPageContainer(1)` is the single largest schedule risk for this phase. The Promise<boolean> resolution semantics are undocumented. On simulator v0.6.2+ the call may:

1. Render the host dialog and resolve when the user confirms/cancels (ideal).
2. Resolve immediately before the dialog appears (simulator stub).
3. Not render a dialog at all (simulator stubbed out).

Outcomes 2 and 3 would surface during Plan 05's simulator session — they do not block this plan's code delivery. The fire-and-forget design means none of these cases cause Vigil plugin code to misbehave; worst case, the user experience on simulator differs from hardware.

**Physical hardware retest** (~2026-04-24) remains tracked in STATE.md blockers. If simulator diverges from hardware, RESEARCH §"Valid until" notes require regenerating Pitfall 3 and A3.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 unblocks Plan 05 (pack-and-verify): G2-02 code path is now in place; Plan 05's simulator session will tick the G2-02 checkbox in VERIFIED.md.
- Plan 03 (VITE_SCREENSHOT_MODE) and Plan 04 (G2-03 brand UI) remain independent Wave 1 plans — no handoff needed from 02.
- No blockers introduced. `tsc` clean, build clean, acceptance criteria all green.

## Self-Check: PASSED

Verified:
- `[ -f vigil-g2-plugin/src/navigation.ts ]` → FOUND
- `git log --oneline --grep="106-02" ` contains `02a96b6 feat(106-02): add home-branch exit-confirm edge in handleNavEvent (G2-02)` → FOUND
- `grep -c 'shutDownPageContainer(1)' vigil-g2-plugin/src/navigation.ts` → `1` (exactly one call site)
- `npx tsc` in `vigil-g2-plugin/` → exit 0
- `npm run build:prod` in `vigil-g2-plugin/` → exit 0, 66.39 kB bundle

---
*Phase: 106-g2-store-resubmit-atomic*
*Completed: 2026-04-20*
