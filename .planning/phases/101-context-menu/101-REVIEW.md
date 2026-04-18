---
phase: 101-context-menu
reviewed: 2026-04-18T19:21:48Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - vigil-pwa/src/App.tsx
  - vigil-pwa/src/components/BulkActionBar.tsx
  - vigil-pwa/src/components/ContextMenu.tsx
  - vigil-pwa/src/components/ThoughtList.tsx
  - vigil-pwa/src/components/ThoughtRow.tsx
  - vigil-pwa/src/components/ToastHost.tsx
  - vigil-pwa/src/constants/categories.ts
  - vigil-pwa/src/hooks/useToast.tsx
  - vigil-pwa/src/pages/ThoughtsPage.tsx
  - vigil-pwa/src/test/setup.ts
findings:
  critical: 0
  warning: 4
  info: 10
  total: 14
status: findings
---

# Phase 101: Code Review Report

**Reviewed:** 2026-04-18T19:21:48Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** findings (no critical; warnings and info only)

## Summary

Phase 101 lands a well-structured, portaled context menu with disciplined a11y, defensive focus management, and a deferred-commit delete flow that correctly reuses the Phase 100 edit-lifecycle events. The D-19 interlock is preserved byte-for-byte: `ContextMenu.tsx` contains **zero** `setIsEditing` or `vigil:edit-started` references, and the Edit menu item routes through `ThoughtRow.handleContentClick` (ThoughtRow.tsx:438). The late-phase D-21 focus-race fix (ThoughtRow.tsx:421-432) is also well-reasoned — the `rAF` defer + "skip if focus already inside row" guard correctly prevents the just-mounted `<textarea autoFocus>` from being stolen back by the trigger-row focus return.

No critical or security findings. No XSS vectors (confirmed — only `dangerouslySetInnerHTML` match in the whole PWA is a comment in `SettingsPage.tsx` documenting the ABSENCE of one). No hardcoded secrets. No unsafe deserialization.

The warnings are mostly React-correctness nits and one effect-churn concern on the keyboard-nav listener. The info items are style/maintainability observations and one submenu-overflow UX gap that is out of scope for v1 but worth noting for a follow-up.

Highlights worth calling out:

- **D-19 interlock fidelity** — verified via grep and by tracing `onStartEdit` → `handleContentClick` → `vigil:edit-started` dispatch. Trap-test from Plan 00 still holds.
- **D-21 focus-race fix** — the late-stage ThoughtRow.tsx:421-432 patch is correct. The `document.activeElement` check covers the textarea-just-mounted case cleanly, and `rAF` defers past the portal unmount as intended.
- **Event listener hygiene** — ContextMenu's `useEffect` cleanup removes all four window listeners; no leaks. ThoughtRow's long-press timer is cleared on unmount (ThoughtRow.tsx:286).
- **Toast commit semantics** — `useToast` correctly fires `onExpire` on timer AND on replace-while-showing (D-16), but NOT on manual `dismiss()` (which is the user-action path). The invariant is load-bearing for deferred-commit deletes and is correctly enforced at useToast.tsx:53-59 and 62-82.

## Warnings

### WR-01: Keyboard-nav keydown listener rebinds on every arrow keystroke

**File:** `vigil-pwa/src/components/ContextMenu.tsx:175-245`
**Issue:** The `useEffect` that installs the `keydown`, `scroll`, `resize`, and `pointerdown` window listeners depends on `[onClose, view, focusedIndex, openedVia, desktopSubmenu, visibleItemCount]`. Since `focusedIndex` changes on every ArrowUp/Down press, the cleanup runs and all four `window.addEventListener` calls re-fire on every keystroke. This is not a correctness bug (React effects run synchronously, so there is no async gap a key event can slip through), but it is wasted work — in particular, the `scroll, true` listener in capture phase is re-bound four times per second during rapid navigation. It also makes the dep list brittle: a reviewer reading this effect has to verify that every listed dep actually needs to re-read freshly, and the current handler DOES read `focusedIndex` inside `Enter`/`Arrow` branches.
**Fix:** Store `view`, `focusedIndex`, `desktopSubmenu`, `visibleItemCount` in refs kept in sync via a lightweight `useEffect(() => { ref.current = value }, [value])`, then drop them from the listener effect's dep array so it mounts once per ContextMenu instance:
```ts
const focusedIndexRef = useRef(focusedIndex)
useEffect(() => { focusedIndexRef.current = focusedIndex }, [focusedIndex])
// ...
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    // read refs instead of closure values
    const idx = focusedIndexRef.current
    // ...
  }
  window.addEventListener('keydown', onKey)
  // ...
  return () => { /* cleanup */ }
}, [onClose]) // only re-bind if the close callback identity changes
```
Alternative (smaller change): accept the re-bind cost and add a comment explaining it is intentional so a future reader does not "optimize" the deps incorrectly.

### WR-02: Cleanup effect captures `cancelLongPress` by closure, not by ref

**File:** `vigil-pwa/src/components/ThoughtRow.tsx:286`
**Issue:** `useEffect(() => () => cancelLongPress(), [])` captures `cancelLongPress` from the first render. This currently works because the function only touches refs (`longPressTimerRef`, `longPressStartRef`) that persist across renders, but the `react-hooks/exhaustive-deps` lint rule would flag it and a future editor may add reactive state inside `cancelLongPress` without realising the unmount handler still points at the stale copy. The effect is also redundant with the pointerup/pointercancel handlers in most cases — it only fires for unmount-while-pressed (which is the T-101-03-07 scenario it was added for).
**Fix:** Either move `cancelLongPress` inside the cleanup effect (so it captures refs directly) or lift it to a `useCallback([])`:
```ts
useEffect(() => {
  return () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = null
    longPressStartRef.current = null
  }
}, [])
```
Lower priority — this is preventative.

### WR-03: Revert-on-error branch silently no-ops when previous state is missing

**File:** `vigil-pwa/src/pages/ThoughtsPage.tsx:183-194` (and symmetric at `196-207`)
**Issue:** `handleMoveToCategory` does `const prev = thoughts.find((t) => t.id === id)?.category` then, on error, `if (prev !== undefined) updateLocal(id, { category: prev })`. If the thought is not in the current `thoughts` array (which *shouldn't* happen — the id comes from a rendered row — but could under race conditions like a concurrent filter switch), `prev === undefined`, the revert is skipped, and the optimistic state sticks even though the API call failed. The user sees the category stay changed but the server never committed it. The error toast ("Couldn't move. Try again.") fires, so the user is notified, but the UI is out of sync.

The `handleAssignProject` variant at `196-207` is slightly safer — it reverts to `prev ?? null`, which at least resets to "no project assigned" — but `null` is still wrong if the original `projectId` was a real number and the thought simply wasn't found in `thoughts`.
**Fix:** Either (a) short-circuit if `prev === undefined` (don't apply the optimistic update at all when we can't snapshot the pre-state), or (b) trigger a refetch on error to resync from the server:
```ts
async function handleMoveToCategory(id: number, category: string) {
  const prev = thoughts.find((t) => t.id === id)?.category
  if (prev === undefined) return // nothing to optimistically update against
  updateLocal(id, { category })
  try {
    await updateThought(id, { category })
  } catch (err) {
    console.error('[ThoughtsPage] move to category failed', err)
    updateLocal(id, { category: prev })
    showToast({ body: "Couldn't move. Try again.", variant: 'error' })
  }
}
```

### WR-04: `handleRetriage` has no error handling and leaks rejection on therapy classification

**File:** `vigil-pwa/src/pages/ThoughtsPage.tsx:105-126`
**Issue:** The primary `triageThought` + `updateThought` calls on lines 108-109 have no try/catch. If either throws (network error, 5xx, auth expiry), the rejection escapes to `window.onunhandledrejection` because `handleRetriage` is invoked as `onRetriage={(id) => onRetriage?.(id)}` in ThoughtRow.tsx:439 — a synchronous wrapper over an async function. The user sees nothing happen and gets no feedback.

Secondary concern: the retriage flow changes a thought's category silently — if it succeeds the category flips with no UI confirmation, and if it fails the local state at `updateLocal(id, { category: result.category })` never fires (because the preceding `await updateThought` threw). This is a pre-existing Phase-100-era bug but is worth flagging because the new context-menu Re-triage item increases the surface area for it (now two triggers — menu + row icon).
**Fix:** Wrap in try/catch with a toast on failure (the toast infrastructure is now available from Phase 101):
```ts
async function handleRetriage(id: number) {
  const thought = thoughts.find((t) => t.id === id)
  if (!thought) return
  try {
    const result = await triageThought(thought.content)
    await updateThought(id, { category: result.category })
    updateLocal(id, { category: result.category, confidence: result.confidence })
    // ... therapy classification unchanged
  } catch (err) {
    console.error('[ThoughtsPage] retriage failed', err)
    showToast({ body: "Couldn't re-triage. Try again.", variant: 'error' })
  }
}
```
Lower priority — this is adjacent-to-phase-101 maintenance on a pre-existing code path. Decide whether to fold into Phase 101 or defer.

## Info

### IN-01: Stale comment on `ALPHABETICAL_CATEGORIES`

**File:** `vigil-pwa/src/components/ContextMenu.tsx:40-43`
**Issue:** The comment says "The CATEGORIES source tuple preserves historical BulkActionBar order; the menu sorts for scanability." This is correct but slightly misleading — a reader skimming might think the menu shows them in BulkActionBar order. Add a clarifying example.
**Fix:** Rewrite as `// The shared CATEGORIES tuple preserves v2.5 BulkActionBar order (task, therapy, idea, reflection, project); this submenu sorts alphabetically (idea, project, reflection, task, therapy) for scanability per D-13.`

### IN-02: Inline-wrapped callbacks defeat ContextMenu's useCallback memoization

**File:** `vigil-pwa/src/components/ThoughtRow.tsx:438-442`
**Issue:** `onStartEdit={handleContentClick}` passes a stable reference, but `onRetriage={(id) => onRetriage?.(id)}`, `onMoveToCategory={(id, c) => onMoveToCategory?.(id, c)}`, etc. create fresh arrow functions on every ThoughtRow render. This causes ContextMenu's `handleRetriage`/`handleMoveCategory`/`handleAssignProject` `useCallback` memos to churn (their deps include the callback prop identity). Since ContextMenu is only mounted while the menu is open, the practical impact is zero — but the useCallback wrappers are now mostly decorative.
**Fix:** Either pass the optional callbacks directly (TypeScript allows `onRetriage?: (id: number) => void` at both ends), or drop the useCallback wrappers inside ContextMenu. Prefer the former:
```tsx
onStartEdit={handleContentClick}
onRetriage={onRetriage ?? (() => {})}
onMoveToCategory={onMoveToCategory ?? (() => {})}
onAssignProject={onAssignProject ?? (() => {})}
onDelete={onDelete ?? (() => {})}
```
Trivial — cosmetic.

### IN-03: Desktop submenu has no viewport-overflow flip

**File:** `vigil-pwa/src/components/ContextMenu.tsx:140-150`
**Issue:** The root menu's position is clamped against `vw` and `vh` (lines 115-136), but the desktop submenu is anchored at `rootRect.right + SUBMENU_GAP` with no check that `rootRect.right + submenu.width` exceeds `vw`. On a narrow viewport, the submenu will clip off the right edge. This is a UX gap, not a correctness bug — the menu is fully functional, the items are just not all visible.
**Fix:** Mirror the root-menu flip logic into the submenu-position effect: after measuring `submenuRef.current`, if `left + width > vw - VIEWPORT_PADDING`, flip to `rootRect.left - width - SUBMENU_GAP` (open to the LEFT of the root menu). Out of scope for v1.

### IN-04: `onScroll`/`onResize` wrappers are unnecessary

**File:** `vigil-pwa/src/components/ContextMenu.tsx:225-226`
**Issue:** `const onScroll = () => onClose(); const onResize = () => onClose()` — these can be replaced with passing `onClose` directly since they take no arguments the handler cares about.
**Fix:**
```ts
window.addEventListener('scroll', onClose, true)
window.addEventListener('resize', onClose)
```
Minor style nit.

### IN-05: `useRef<T | undefined>(undefined)` is verbose for `useRef<T>()`

**File:** `vigil-pwa/src/hooks/useToast.tsx:43`
**Issue:** `const expireRef = useRef<(() => void) | undefined>(undefined)` — in React 18+, `useRef<T>()` with no argument defaults to `T | undefined`. The explicit `| undefined` + initial `undefined` is redundant.
**Fix:** `const expireRef = useRef<() => void>()` — or keep as-is for explicitness. Not a bug.

### IN-06: Fallback open-state path in ThoughtRow is test-only scaffolding

**File:** `vigil-pwa/src/components/ThoughtRow.tsx:107-110`
**Issue:** `parentManagesOpenState = onOpenMenu !== undefined`. In production, `ThoughtList` always passes `onOpenMenu`, so the `false` branch of `isActuallyOpen` (anchor-presence-only) is only exercised by unit tests that render `ThoughtRow` standalone. The comment at 101-103 acknowledges this. Not a bug — just a reminder that if unit tests ever stop mounting standalone ThoughtRow instances, this branch becomes dead code and can be deleted.
**Fix:** None needed. Document as known.

### IN-07: `globalThis.fetch` stub has a non-matching signature

**File:** `vigil-pwa/src/test/setup.ts:45-47`
**Issue:** `globalThis.fetch = () => Promise.reject(new Error('fetch not mocked'))` — the real fetch signature is `(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>`. This works at runtime because JS ignores extra args, but TypeScript will not catch callers that misuse it. Pre-existing test infra, not new in this phase.
**Fix:** None — the stub is a backstop for "you forgot to mock fetch"; type-correctness would only help error messages, not behavior.

### IN-08: `CATEGORIES` cross-repo drift risk

**File:** `vigil-pwa/src/constants/categories.ts:6-8`
**Issue:** The comment correctly flags that `vigil-core/src/routes/thoughts.ts VALID_CATEGORIES` must be kept in sync, but there is no automated check. A contract test could import both lists and assert `expect([...CATEGORIES].sort()).toEqual([...VALID_CATEGORIES].sort())` — but the two live in different repos, so the test would have to live inside a build script or a dedicated integration harness. Worth a tracked-todo entry.
**Fix:** Defer to a follow-up phase. Log as known drift surface.

### IN-09: `BulkActionBar` + `ThoughtsPage` inconsistency — `window.confirm` vs undo toast

**File:** `vigil-pwa/src/components/BulkActionBar.tsx:24` (`window.confirm`) vs `vigil-pwa/src/pages/ThoughtsPage.tsx:138-181` (undo toast)
**Issue:** Single-row delete uses the new undo-toast pattern (per D-15); bulk delete from BulkActionBar uses a blocking `window.confirm`. Intentional per Phase 101 scope (D-15 applies to single-row only), but worth logging for future consistency — a UX reviewer might flag the asymmetry. Not a defect in Phase 101.
**Fix:** Defer. Log as "bulk delete should adopt toast pattern" in a later phase.

### IN-10: ToastHost only renders when `current` is set — no exit animation

**File:** `vigil-pwa/src/components/ToastHost.tsx:20-21`
**Issue:** `if (!current) return null` + `transition-all duration-150` on the surface. The `duration-150` only applies while mounted — when `current` flips to null, the element unmounts instantly, defeating the transition. Cosmetic; user sees an abrupt disappearance instead of a fade-out. Intentional per UI-SPEC (no mention of exit animation), but worth flagging.
**Fix:** Use an unmount-delay pattern (render the toast for an extra ~150ms with `opacity-0`) if an exit animation is desired. Not needed per spec.

---

_Reviewed: 2026-04-18T19:21:48Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
