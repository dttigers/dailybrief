---
phase: 101-context-menu
plan: 01
subsystem: ui

tags: [toast, undo, deferred-commit, portal, aria-live, categories, constants, wave-1, tdd]

# Dependency graph
requires:
  - phase: 101-context-menu
    provides: Wave 0 RED test scaffolds (useToast.test.tsx 9 cases, ToastHost.test.tsx 8 cases) pinning D-15/D-16 contracts
provides:
  - useToast hook + ToastProvider (single-slot, 5s auto-dismiss, replace-fires-onExpire)
  - ToastHost portal component (role=status|alert, aria-live, safe-area bottom, teal-400 action)
  - CATEGORIES constant (single source of truth for task/therapy/idea/reflection/project)
  - BulkActionBar refactored to import CATEGORIES from constants
affects: [101-02-context-menu, 101-03-thought-row-wiring, 101-04-a11y-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-slot toast via React context + useRef for timer/onExpire storage — avoids module-level singleton so provider unmount naturally GCs callbacks (T-101-01-03)"
    - "Deferred-commit UX primitive: showToast replacement fires previous onExpire SYNCHRONOUSLY before setState, so a second delete commits the first without waiting 5s (D-16)"
    - "Manual dismiss() clears expireRef BEFORE setState so subsequent delete-commit logic is not double-fired — user-initiated dismiss = no commit"
    - "Portal mount via createPortal(document.body) for surfaces that must survive route changes (Pitfall 7)"
    - "Shared constants in src/constants/ — type + tuple together via `as const` + `typeof X[number]` for auto-union type derivation"

key-files:
  created:
    - vigil-pwa/src/hooks/useToast.tsx (95 LOC)
    - vigil-pwa/src/components/ToastHost.tsx (48 LOC)
    - vigil-pwa/src/constants/categories.ts (15 LOC)
  modified:
    - vigil-pwa/src/components/BulkActionBar.tsx (inline CATEGORIES literal → import from constants)

key-decisions:
  - "useToast stored as React context (NOT module-level singleton) — provider unmount naturally GCs timer/expire refs; avoids cross-instance bleed in future test/SSR scenarios (T-101-01-03)"
  - "Timer callback checks `c?.id === id` equality before clearing current — prevents a toast replaced between schedule and fire from being clobbered (invariant needed for D-16 replace semantics to interact cleanly with auto-dismiss)"
  - ".tsx extension on useToast (not .ts) — the Provider renders JSX, so .tsx is the correct module kind matching the existing GoogleStatusContext.tsx precedent"
  - "Action button onClick ordering: onAction() FIRST, then dismiss() — the Wave 0 test asserts onAction was called AND toast is gone; reversing would either skip the callback or leave toast visible"
  - "TOAST_DURATION_MS kept module-private (not exported) — D-15 duration is an implementation detail of the primitive; callers don't need to tune it, and re-exporting would invite drift across call sites"

patterns-established:
  - "Pattern 1: Toast primitive via React context — single-slot, provider-scoped refs, no module-level state. Template for future notification expansions."
  - "Pattern 2: Extract-to-constants refactor path — when the same literal tuple appears in two call sites (BulkActionBar + upcoming ContextMenu), move to src/constants/ with a doc comment pointing at the server validator to prevent drift (T-101-01-04)."
  - "Pattern 3: safe-area-inset-bottom via inline style — `style={{ bottom: 'max(2rem, env(safe-area-inset-bottom))' }}` — Tailwind can't express the max() CSS function cleanly, so inline style is the correct escape hatch."

requirements-completed: [CTX-03]

# Metrics
duration: 2min
completed: 2026-04-18
---

# Phase 101 Plan 01: Toast Infrastructure + CATEGORIES Extract Summary

**Single-slot toast primitive (useToast hook + ToastHost portal) with 5s auto-dismiss and replace-fires-previous-onExpire semantics for Phase 101's deferred-commit delete flow, plus CATEGORIES constants extracted so ContextMenu (Plan 02) and BulkActionBar reference one source.**

## Performance

- **Duration:** 2 min 23 s
- **Started:** 2026-04-18T17:18:56Z
- **Completed:** 2026-04-18T17:21:19Z
- **Tasks:** 3/3 completed
- **Files modified:** 4 (3 created, 1 refactored)

## Accomplishments

- `useToast` hook + `ToastProvider` implementing all 9 Wave 0 contract tests GREEN on first run: provider-guard throw, initial null, showToast id/body, 5000ms auto-dismiss (D-15), dismiss(), replace-fires-first-onExpire (D-16), onAction preservation, variant round-trip, no-onExpire-on-manual-dismiss.
- `ToastHost` component renders toast via `createPortal(..., document.body)` with role=status/alert + aria-live=polite/assertive switching on variant. All 8 Wave 0 ToastHost tests GREEN.
- `CATEGORIES` constant lives at `vigil-pwa/src/constants/categories.ts` with a doc comment explicitly referencing `vigil-core/src/routes/thoughts.ts VALID_CATEGORIES` (drift mitigation, T-101-01-04). Server tuple matches client tuple exactly — verified by direct read.
- `BulkActionBar` refactored to import CATEGORIES from constants; existing 3 Layout.test.tsx cases still pass (rendering regression-free).
- Build green: `npm run build` exits 0 with 327.45 kB gzipped bundle (no size regression).

## Task Commits

Each task committed atomically:

1. **Task 1: Create CATEGORIES constant and refactor BulkActionBar** — `66235da` (refactor)
2. **Task 2: Implement useToast hook + ToastProvider** — `11191e7` (feat)
3. **Task 3: Implement ToastHost component** — `949e2d7` (feat)

## Files Created/Modified

- `vigil-pwa/src/constants/categories.ts` (created, 15 LOC) — Canonical CATEGORIES tuple + Category union type. Single source of truth with server-sync doc comment.
- `vigil-pwa/src/hooks/useToast.tsx` (created, 95 LOC) — ToastProvider + useToast. Module-private TOAST_DURATION_MS=5_000. Timer/expire refs stored on provider instance (not module-level).
- `vigil-pwa/src/components/ToastHost.tsx` (created, 48 LOC) — createPortal to document.body. role/aria-live switches on variant. Safe-area-aware fixed bottom via inline style.
- `vigil-pwa/src/components/BulkActionBar.tsx` (modified, -2/+1 LOC) — Inline `const CATEGORIES = [...]` removed; `import { CATEGORIES } from '../constants/categories'` added. No behavior change.

## Decisions Made

See `key-decisions` in frontmatter. Summary:
- Toast primitive lives on React context, not module-level singleton — cleanest GC story for future unmount scenarios and matches GoogleStatusContext pattern.
- `onAction()` fires BEFORE `dismiss()` inside the button click handler — the Wave 0 test explicitly asserts both happen in that order.
- TOAST_DURATION_MS stays module-private — D-15 is an implementation detail; re-exporting invites drift.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes required. No threat-model additions beyond what the plan already catalogued.

## Issues Encountered

None.

## Verification Run

```
$ cd vigil-pwa && npm run test -- --run \
    src/hooks/useToast.test.tsx \
    src/components/ToastHost.test.tsx \
    src/components/Layout.test.tsx

 ✓ src/hooks/useToast.test.tsx (9 tests)       41ms
 ✓ src/components/ToastHost.test.tsx (8 tests) 113ms
 ✓ src/components/Layout.test.tsx (3 tests)    77ms

 Test Files  3 passed (3)
      Tests  20 passed (20)
   Duration  1.28s

$ cd vigil-pwa && npm run build
 ✓ built in 329ms (327.45 kB │ gzip: 95.73 kB)

$ grep "dangerouslySetInnerHTML" vigil-pwa/src/components/ToastHost.tsx vigil-pwa/src/hooks/useToast.tsx
(no matches — T-101-01-01 mitigated)
```

Wave 0 RED → Wave 1 GREEN delta: +17 tests turned green this plan (useToast 0→9, ToastHost 0→8). Layout.test.tsx continues passing (no regression from BulkActionBar refactor).

## Threat Mitigations Confirmed

- **T-101-01-01** (XSS in toast body) — `{current.body}` only; no `dangerouslySetInnerHTML`. Verified by grep.
- **T-101-01-02** (timer accumulation DoS) — `showToast` calls `clearTimer()` before scheduling; Wave 0 test #6 (replace) exercises the path.
- **T-101-01-03** (callback leak on unmount) — expireRef/timerRef stored on provider scope, not module-level. Provider unmount → refs GC'd naturally.
- **T-101-01-04** (CATEGORIES drift from server) — Constants file opens with a comment linking to `vigil-core/src/routes/thoughts.ts VALID_CATEGORIES` and an explicit "keep in sync" note. Server tuple verified identical during task execution.

## Next Phase Readiness

Wave 2 can proceed:

- **Plan 02 (ContextMenu portal + positioning + submenus)** — CATEGORIES constant is ready for the Move-to-category submenu. The ContextMenu.tsx target is still unimplemented (29 Wave 0 tests still RED). Nothing from Plan 01 blocks Plan 02; the two plans are Wave 1 parallel-safe per the phase plan.
- **Plan 03 (ThoughtRow + ThoughtsPage wiring)** — `useToast` + `ToastHost` are the primitives Plan 03 will call for the `Thought deleted. [Undo]` destructive-delete-with-undo flow. Contract frozen: `showToast({ body, action, onAction, onExpire, variant })` with replace-fires-onExpire semantics (D-16).

No blockers. No new dependencies introduced. No secrets handled.

## Self-Check: PASSED

- FOUND: vigil-pwa/src/constants/categories.ts
- FOUND: vigil-pwa/src/hooks/useToast.tsx
- FOUND: vigil-pwa/src/components/ToastHost.tsx
- FOUND: vigil-pwa/src/components/BulkActionBar.tsx (modified)
- FOUND commit: 66235da (Task 1)
- FOUND commit: 11191e7 (Task 2)
- FOUND commit: 949e2d7 (Task 3)

---
*Phase: 101-context-menu*
*Plan: 01*
*Completed: 2026-04-18*
