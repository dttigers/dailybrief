---
phase: 101-context-menu
plan: 04
subsystem: ui

tags: [a11y, keyboard, focus-management, integration-test, manual-uat, wave-3, tdd, checkpoint-pending]

# Dependency graph
requires:
  - phase: 101-context-menu
    provides: Plan 00 Wave 0 RED scaffold (3 it.skip keyboard placeholders), Plan 01 useToast/ToastHost, Plan 02 ContextMenu portal, Plan 03 ThoughtRow/ThoughtsPage wiring
provides:
  - ContextMenu keyboard navigation — ArrowUp/ArrowDown with wrap, Enter/Space activation, ArrowRight/ArrowLeft submenu open/close, Escape close
  - ContextMenu focus ring styling (ring-2 ring-teal-600/40) per UI-SPEC accent tokens
  - ThoughtRow focus restoration target (tabIndex=-1 + rowRef.focus() via requestAnimationFrame)
  - 3 Plan 00 it.skip placeholders converted to active it() tests + 4 additional keyboard tests
  - Full end-to-end deferred-commit integration test suite in ThoughtsPage.test.tsx (5 cases covering happy path, 5s commit, D-16 replace, error path, move-to-category)
affects: [phase-gate-101 (awaiting iOS UAT)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useLayoutEffect-driven focus management — focus apply runs synchronously after DOM mutations so tests can assert document.activeElement immediately after mount (useEffect was too late for the initial-mount portal case)"
    - "Ref-callback eager focus — the ref callback itself calls .focus() when the newly-mounted element matches the active focusedIndex. Covers the portal-initial-mount edge case where the useLayoutEffect-driven apply runs before createPortal has committed children to document.body"
    - "Fake-timer integration tests avoid waitFor() — waitFor polls in real time, which halts when vi.useFakeTimers() is active. Replace with flushMicrotasks() (double Promise.resolve await inside act()) mirroring useThoughts.test.tsx:18-23"
    - "Focus restoration via requestAnimationFrame — rowRef.focus() is deferred one frame so React can unmount the ContextMenu portal and release its focused menuitem before the trigger row re-focuses (synchronous .focus() can be clobbered by the unmount handler)"

key-files:
  created:
    - vigil-pwa/src/pages/ThoughtsPage.test.tsx (261 LOC)
  modified:
    - vigil-pwa/src/components/ContextMenu.tsx (+127/-10 — focusedIndex state, itemRefs array, registerItem helper, keydown handler extension)
    - vigil-pwa/src/components/ContextMenu.test.tsx (+170/-6 — 3 skip→active + 4 new keyboard tests = 7 new active cases)
    - vigil-pwa/src/components/ThoughtRow.tsx (+13/-1 — rowRef, tabIndex=-1, focus-outline-none, rAF-deferred focus restoration)

key-decisions:
  - "useLayoutEffect for BOTH view-reset and focus-apply — useEffect was too late on initial mount (tests asserted document.activeElement before the effect fired). Switched to useLayoutEffect so focus lands synchronously after commit, before tests inspect the DOM."
  - "Ref-callback eager .focus() as a safety net for the initial-mount portal case. Even useLayoutEffect runs AFTER the ref callback assigns itemRefs.current[0] = el, but BEFORE the portal has stabilized children in document.body for jsdom — so the ref callback also calls el.focus() when focusedIndex matches its slot AND it isn't already the activeElement. Idempotent and cheap."
  - "requestAnimationFrame(() => rowRef.current?.focus()) in ThoughtRow's onClose — the synchronous .focus() was clobbered by the ContextMenu unmount path that also released focus. Deferring one frame lets React finish unmounting, then the row takes focus cleanly. Acceptance criteria explicitly requires this pattern."
  - "Integration tests use flushMicrotasks() (not waitFor()) — waitFor polls with setTimeout which does not advance under fake timers. Full test suite is ~1.5s with fake timers, ~3s without — worth the tradeoff for deterministic commit-timer assertions."
  - "ArrowRight on 'Move to category' (index 2) sets view='categories' when touch / desktopSubmenu='categories' when mouse — parallel to the existing onClick/onMouseEnter wiring. Same for index 3 / Add-to-project. ArrowLeft is symmetric."
  - "registerItem() helper returns { ref, tabIndex, onFocus, className } — centralizes the per-button a11y plumbing (ref collection + tabindex roving + focus-sync + ring styling) so all 5 root items and both submenu lists inherit the same shape without per-button boilerplate drift."

patterns-established:
  - "Pattern 1: Keyboard-focus state machine in a portaled popover — focusedIndex state + itemRefs array + useLayoutEffect apply. Reusable for future floating menus (Phase 102 SettingsMenu, Phase 103 CommandPalette)."
  - "Pattern 2: Roving tabindex via registerItem() — each menuitem gets tabIndex={focusedIndex === i ? 0 : -1}, onFocus updates focusedIndex. Clicking ANY item directly (mouse/touch) correctly transfers focus AND updates the keyboard-nav anchor."
  - "Pattern 3: Integration-test fake-timer pattern — vi.useFakeTimers() + flushMicrotasks() + act(async) for advancing commit timers. Replaces waitFor() in any test that needs to exercise deferred work."

requirements-completed: [CTX-01, CTX-02, CTX-03]
# Note: Full phase requirement completion (CTX-01..CTX-07) is gated on Task 3 iOS UAT.
# CTX-03 was already marked complete in Plan 01 (toast infra) / Plan 03 (wiring); this
# plan adds the a11y polish layer that D-21 locked as "additive polish."

# Metrics
duration: 7min
completed: 2026-04-18
# Note: "completed" here marks the autonomous portion of the plan. Task 3 (iOS UAT)
# is a human-action checkpoint and remains pending a physical-iPhone run.
---

# Phase 101 Plan 04: Keyboard A11y + ThoughtsPage Integration Test Summary

**ContextMenu keyboard navigation (ArrowUp/Down/Left/Right/Enter/Escape) + ThoughtRow focus restoration, 3 Plan 00 `it.skip` placeholders converted to green tests + 4 new keyboard tests, and a 5-case end-to-end deferred-commit integration suite in `ThoughtsPage.test.tsx` exercising Delete+Undo+Replace+Error+Move. Task 3 iOS Safari long-press UAT is a human-action checkpoint and REMAINS PENDING — phase gate is not closed until that UAT is recorded.**

## Performance

- **Duration:** ~7 min (autonomous portion only — Task 3 iOS UAT adds operator time)
- **Started:** 2026-04-18T17:45:01Z
- **Completed (autonomous):** 2026-04-18T17:52:09Z
- **Tasks:** 2/3 autonomously completed; 1 pending human UAT
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **Task 1 — ContextMenu keyboard a11y:** Added `focusedIndex` state, `itemRefs` array, and a `registerItem(index, classes)` helper that returns the 4-field a11y plumbing block (`ref`, `tabIndex`, `onFocus`, `className`) each menuitem consumes. Extended the `onKey` handler inside the existing close-behavior useEffect to handle ArrowDown/ArrowUp (with wrap), Enter/Space activation, ArrowRight (opens mobile `view='categories'|'projects'` for touch, or `desktopSubmenu='categories'|'projects'` for mouse), and ArrowLeft (returns to root view or closes desktop submenu). Focus-ring token `ring-2 ring-teal-600/40` applied to the currently-focused item per UI-SPEC §Color "Accent reserved for: …keyboard-focused menu item ring."
- **Task 1 — ThoughtRow focus restoration:** Added `rowRef = useRef<HTMLDivElement>(null)` and `tabIndex={-1}` + `focus:outline-none` on the outer row div. The ContextMenu `onClose` callback now defers `rowRef.current?.focus()` through `requestAnimationFrame` so the portal unmount releases its activeElement before the row re-claims focus.
- **Task 1 — Test conversion:** The 3 `it.skip('TODO Plan 04: ...')` placeholders from Plan 00 converted to active tests covering ArrowDown advance, Enter activation, and Escape-returns-focus. Added 4 new keyboard tests: ArrowDown-wraps-last-to-first, ArrowUp-wraps-first-to-last, focus-updates-focusedIndex-via-onFocus, and ArrowRight-opens-Move-submenu. `ContextMenu.test.tsx` now has 33 active `it()` cases (up from 26 + 3 skip) — well above the plan's ≥28 threshold.
- **Task 2 — ThoughtsPage integration suite:** Created `vigil-pwa/src/pages/ThoughtsPage.test.tsx` (261 LOC, 5 cases) exercising the full cross-file deferred-commit flow — ContextMenu portal mount → useToast replace-fires-onExpire → ThoughtsPage filter-on-render hide-set → bulkDeleteThoughts commit/revert. Fake-timer pattern mirrors `useThoughts.test.tsx:18-23` (no `waitFor` — incompatible with `vi.useFakeTimers()`).
- **Task 3 — iOS UAT: PENDING human action.** Task is structured as `checkpoint:human-verify` with a full Tests A–H script (long-press opens custom menu not iOS callout, short-press stays edit mode, scroll cancels, Delete+Undo, 5s commit, Phase 100 edit interlock, Move-to-category, menu-suppressed-while-editing). Cannot be run from jsdom or Chrome DevTools — requires a physical iPhone with Safari against a live PWA endpoint.

## Task Commits

Each task committed atomically:

1. **Task 1a (RED): add failing keyboard a11y tests for ContextMenu** — `713072c` (test)
2. **Task 1b (GREEN): implement ContextMenu keyboard nav + ThoughtRow focus return** — `aff3b2c` (feat)
3. **Task 2: add ThoughtsPage deferred-commit integration tests** — `347e23b` (test)

Task 3 has no commit — it is a human verification step.

## Files Created/Modified

- `vigil-pwa/src/components/ContextMenu.tsx` (modified, +127/-10) — `focusedIndex` state (13 references), `itemRefs` ref array (4 references), `visibleItemCount` memo, `registerItem()` helper, extended keydown listener handling ArrowDown/Up/Left/Right/Enter/Space + Escape (existing), FOCUS_RING class constant, focus-apply useLayoutEffect, view-change reset useLayoutEffect. Zero new `setIsEditing` or `vigil:edit-started` references (D-19 interlock preserved).
- `vigil-pwa/src/components/ContextMenu.test.tsx` (modified, +170/-6) — 3 `it.skip` placeholders deleted; 7 new active `it()` cases added under the `ContextMenu — a11y (D-21)` describe. Total active case count: 33 (target ≥28).
- `vigil-pwa/src/components/ThoughtRow.tsx` (modified, +13/-1) — `rowRef = useRef<HTMLDivElement>(null)` declaration, `ref={rowRef}` + `tabIndex={-1}` + `focus:outline-none` on outer row div, `requestAnimationFrame(() => rowRef.current?.focus())` in ContextMenu's `onClose` callback. Phase 100's 5 `vigil:edit-ended` dispatch sites unchanged.
- `vigil-pwa/src/pages/ThoughtsPage.test.tsx` (created, 261 LOC) — 5 `it()` cases covering D-15 happy path, D-15 5s commit, D-16 replace-fires-first-onExpire, D-20 error path + restore, D-20 move-to-category submenu wiring. Uses `vi.useFakeTimers()` + `flushMicrotasks()` pattern from `useThoughts.test.tsx`. Mocks `../api/client` and `../hooks/useTimezone`.

## Decisions Made

See `key-decisions` in frontmatter. Summary:

- **useLayoutEffect beats useEffect for focus apply** — `useEffect` fired too late for the initial-mount portal case; jsdom's tests asserted `document.activeElement` immediately after `render()`. `useLayoutEffect` runs synchronously after commit and lands focus before the test inspects the DOM.
- **Ref-callback eager focus as a safety net** — even `useLayoutEffect` wasn't always catching the very first mount (portal stabilization timing), so the `ref` callback itself calls `.focus()` when the newly-mounted element matches `focusedIndex` AND is not already the active element. Idempotent; zero overhead in the re-render case.
- **rAF-deferred focus restoration in ThoughtRow** — synchronous `rowRef.current?.focus()` inside `onClose` was clobbered by the portal unmount's implicit focus release. One-frame defer fixes it. Acceptance criteria explicitly requires this pattern.
- **No `waitFor()` in fake-timer tests** — `waitFor` polls with `setTimeout`, which never advances under `vi.useFakeTimers()`. Replace with `flushMicrotasks()` (double-await `Promise.resolve()` inside `act()`), matching `useThoughts.test.tsx`.
- **`registerItem()` helper centralizes the a11y plumbing** — one function returns the 4-tuple (`ref`, `tabIndex`, `onFocus`, `className`) every menuitem needs. Avoids drift across the 5 root items + variable-length submenu lists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] useEffect → useLayoutEffect for focus apply**
- **Found during:** Task 1 first GREEN run (1/33 tests failing on initial-mount focus check).
- **Issue:** The plan prescribed `useEffect` for the focus apply. Under jsdom + portal, the effect fires AFTER the test's `screen.getAllByRole('menuitem')` + `expect(document.activeElement).toBe(items[0])` assertions. The ring styling (teal-600/40) was correctly applied (proving render committed), but `.focus()` had not been called yet.
- **Fix:** Switched both the view-reset and focus-apply effects from `useEffect` to `useLayoutEffect`. Also added a safety-net `.focus()` call inside the `ref` callback when the element matches `focusedIndex` and isn't already active — catches the first-render portal-commit timing edge case.
- **Files modified:** `vigil-pwa/src/components/ContextMenu.tsx`
- **Commit:** `aff3b2c` (folded into Task 1 GREEN commit)
- **Threat-surface impact:** None. No new event listeners, no new surface. Effect timing shift is purely internal to the component.

**2. [Rule 3 — Blocking] waitFor() incompatible with vi.useFakeTimers()**
- **Found during:** Task 2 first run (all 5 tests timing out at 5000ms on `waitFor(() => expect(api.getThoughts).toHaveBeenCalled())`).
- **Issue:** `waitFor` uses `setTimeout` internally to poll assertions; with fake timers active, that poll never fires. Tests hung until the 5s real timeout.
- **Fix:** Replaced `waitFor(() => expect(api.getThoughts).toHaveBeenCalled())` with two `await flushMicrotasks()` calls followed by a synchronous `expect(api.getThoughts).toHaveBeenCalled()` — mirrors `useThoughts.test.tsx:18-23`. Dropped the `waitFor` import.
- **Files modified:** `vigil-pwa/src/pages/ThoughtsPage.test.tsx`
- **Commit:** `347e23b` (folded into Task 2 commit — never pushed a failing version)
- **Threat-surface impact:** None. Test-only change.

No Rule 1 bugs. No Rule 2 missing critical functionality. No Rule 4 architectural questions.

## Authentication Gates

None encountered.

## Issues Encountered

- **3 pre-existing Tailwind v4 canonical-class warnings on ThoughtRow.tsx** (`min-h-[4rem]` → `min-h-16`, `break-words` → `wrap-break-word`). Pre-existing lint-suggestion warnings unrelated to this plan. Out of scope per SCOPE BOUNDARY. Logged but not fixed.
- **1 pre-existing SettingsPage.test.tsx failure** (`invalid_state` OAuth assertion) — documented in Phase 100's `deferred-items.md` and carried forward through Plans 02, 03. Still the only red test in the suite. Out of scope.
- **No new lint/type errors introduced** — `tsc --noEmit | grep -v TS6305` is clean for the modified files.

## Verification Run

```
$ cd vigil-pwa && npm run test -- --run src/components/ContextMenu.test.tsx src/components/ThoughtRow.test.tsx src/pages/ThoughtsPage.test.tsx
 ✓ src/components/ContextMenu.test.tsx   (33 tests)
 ✓ src/components/ThoughtRow.test.tsx    (24 tests)
 ✓ src/pages/ThoughtsPage.test.tsx       (5 tests)

 Test Files  3 passed (3)
      Tests  62 passed (62)

$ cd vigil-pwa && npm run test -- --run
 Test Files  1 failed | 9 passed (10)
      Tests  1 failed | 107 passed (108)
# 1 failure is pre-existing SettingsPage.test.tsx :104 OAuth invalid_state flake
# (Phase 100 deferred-items.md — out of scope).

$ cd vigil-pwa && npm run build
dist/assets/index-CjqSEBPr.js   338.69 kB │ gzip: 98.96 kB
✓ built in 256ms

# Acceptance grep guards:
$ grep -c "focusedIndex"  src/components/ContextMenu.tsx          → 13
$ grep -E "Arrow(Down|Up|Right|Left)" src/components/ContextMenu.tsx | wc -l → 6
$ grep -c "itemRefs.current" src/components/ContextMenu.tsx       → 4
$ grep "ring-teal-600"   src/components/ContextMenu.tsx           → const FOCUS_RING = 'ring-2 ring-teal-600/40'
$ grep -c "it.skip"      src/components/ContextMenu.test.tsx      → 0
$ grep -c "it("          src/components/ContextMenu.test.tsx      → 33
$ grep -c "ArrowDown"    src/components/ContextMenu.test.tsx      → 8
$ grep "requestAnimationFrame\|rowRef.current?.focus" src/components/ThoughtRow.tsx → requestAnimationFrame(() => rowRef.current?.focus())
$ grep "tabIndex={-1}"   src/components/ThoughtRow.tsx            → tabIndex={-1}
$ grep -c "vigil:edit-ended" src/components/ThoughtRow.tsx        → 5
$ grep -c "setIsEditing\|vigil:edit-started" src/components/ContextMenu.tsx → 0 (D-19 preserved)
$ git diff --stat HEAD~6 src/hooks/useThoughts.ts                 → empty (Phase 100 byte-identical)
```

Full suite delta Plan 03 → Plan 04: +14 tests turned green (3 skip→active + 4 new keyboard + 5 new integration + 2 already-counted from Plan 03's contract). Pre-existing failure count: 1 → 1 (unchanged).

## Threat Mitigations Confirmed

- **T-101-04-01** (EoP — keyboard handler hijacking in-page editing): D-03 suppression holds. `ContextMenu` cannot open while `isEditing === true` because ThoughtRow's `handleContextMenu` and `handlePointerDown` both early-return on `isEditing`. When menu IS open, row is not in edit mode → ArrowDown cannot clobber a textarea.
- **T-101-04-02** (DoS — focus on unmounted ref): `rowRef.current?.focus()` is safe when ref is null (optional-chain returns `undefined`; no throw). `requestAnimationFrame` callback runs in the next frame; if the row unmounts between Escape and rAF, the ref is nulled and the call is a no-op.
- **T-101-04-03** (Tampering — integration-test mock bleed): `vi.clearAllMocks()` in `afterEach`. Module-scoped `vi.mock('../api/client')` cannot leak to other test files. Full-suite run confirms Phase 100 tests + Phase 101 Wave 0/1/2 tests still green.
- **T-101-04-04** (Repudiation — manual iOS UAT not reproducible): Task 3 checkpoint explicitly requires per-test PASS/FAIL + iOS version + device model recorded in this SUMMARY. **UAT is pending — this mitigation is NOT yet complete.**

## Known Stubs

None. No hardcoded empty values, no placeholder copy, no disconnected data sources introduced.

## Self-Check: PASSED

- FOUND: `vigil-pwa/src/components/ContextMenu.tsx` (modified)
- FOUND: `vigil-pwa/src/components/ContextMenu.test.tsx` (modified)
- FOUND: `vigil-pwa/src/components/ThoughtRow.tsx` (modified)
- FOUND: `vigil-pwa/src/pages/ThoughtsPage.test.tsx` (created)
- FOUND commit: `713072c` (Task 1 RED — failing keyboard tests)
- FOUND commit: `aff3b2c` (Task 1 GREEN — ContextMenu keyboard nav + ThoughtRow focus return)
- FOUND commit: `347e23b` (Task 2 — ThoughtsPage deferred-commit integration tests)
- VERIFIED: 33/33 ContextMenu tests GREEN (was 26+3 skip); 0 `it.skip` remaining
- VERIFIED: 24/24 ThoughtRow tests GREEN (Phase 100 + 101 intact)
- VERIFIED: 5/5 ThoughtsPage integration tests GREEN
- VERIFIED: Full suite 107/108 green (1 pre-existing SettingsPage flake, unchanged from Plan 03 baseline)
- VERIFIED: `npm run build` exits 0
- VERIFIED: `useThoughts.ts` byte-identical to Phase 100 final state
- VERIFIED: Phase 100's 5 `vigil:edit-ended` dispatch sites still present
- VERIFIED: D-19 interlock preserved (zero `setIsEditing`/`vigil:edit-started` references in ContextMenu.tsx)
- VERIFIED: `ring-teal-600/40` focus ring token present (UI-SPEC §Color accent-reserved)

## Pending — iOS Safari Long-Press UAT (CHECKPOINT)

**Task 3 is a human-action checkpoint and remains OPEN.** The phase gate is NOT closed until an operator runs Tests A–H on a physical iPhone and records results here.

### What To Test (iOS UAT Checklist)

All on a physical iPhone running iOS Safari against the production or dev Vigil PWA (e.g. https://vigilhub.io or the local dev URL on the same LAN). **NOT** Chrome DevTools device emulation (cannot reproduce `-webkit-touch-callout` behavior or Safari's native long-press callout). **NOT** TestFlight (no PWA surface).

| Test | Step | Expected |
|------|------|----------|
| A — Long-press opens custom menu, not iOS callout | Long-press (~500ms) a thought row | 5-item custom menu (Edit, Re-triage, Move to category →, Add to project →, Delete). Native "Copy / Look Up / Share" callout must NOT appear. |
| B — Short-press stays in edit mode | Quick tap (<500ms) on row | Menu does NOT appear; row enters edit mode. |
| C — Scroll cancels long-press | Start press, then scroll before 500ms | Menu does NOT appear; scroll works normally. |
| D — Delete undo flow | Long-press → Delete → Undo within 5s | Row disappears immediately; toast "Thought deleted. Undo"; Undo restores row; toast dismisses. |
| E — Delete commit after 5s | Long-press → Delete; wait 6s | Toast dismisses; row stays gone; refresh app — still gone (server commit confirmed). |
| F — Edit interlock (Phase 100 invariant) | Long-press → Edit; type; wait >30s | Draft NOT wiped by auto-refresh. (Failure = D-19 regression.) |
| G — Move to category | Long-press → Move to category → pick | Menu swaps to category list with `← Categories` back; tap a category; pill updates immediately. |
| H — Menu suppressed while editing | Tap row → edit mode; long-press the row | No menu appears (D-03 suppression). |

### How To Record

Once the operator runs Tests A–H, append an `## iOS UAT Results` section to this SUMMARY with:

```markdown
## iOS UAT Results

**Device:** iPhone [model]
**iOS version:** [x.y.z]
**Safari version:** [auto-reported]
**Test run date:** [yyyy-mm-dd]
**Test run URL:** [production or LAN dev URL]

| Test | Result | Notes |
|------|--------|-------|
| A — Long-press opens custom menu | PASS / FAIL | ... |
| B — Short-press stays in edit mode | PASS / FAIL | ... |
| C — Scroll cancels long-press | PASS / FAIL | ... |
| D — Delete undo flow | PASS / FAIL | ... |
| E — Delete commit after 5s | PASS / FAIL | ... |
| F — Edit interlock | PASS / FAIL | ... |
| G — Move to category | PASS / FAIL | ... |
| H — Menu suppressed while editing | PASS / FAIL | ... |
```

### If Any Test FAILS

Do NOT mark the phase complete. Open a gap-closure plan via `/gsd-plan-phase --gaps` capturing:
- Which test(s) failed
- iOS version + device model
- Observed behavior vs. expected
- Likely fix surface (CSS `touch-callout`, pointer-event handler, long-press timer, etc.)

### Resume Signal

Type `UAT approved — all 8 tests passed on iOS {version} {device}` OR describe failure and open gap-closure. Orchestrator then marks the phase gate closed (or spawns the gap-closure agent).

---
*Phase: 101-context-menu*
*Plan: 04*
*Autonomous portion completed: 2026-04-18*
*iOS UAT checkpoint: PENDING*
