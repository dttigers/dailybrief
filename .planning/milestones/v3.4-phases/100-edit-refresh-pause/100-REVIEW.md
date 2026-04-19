---
phase: 100-edit-refresh-pause
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - vigil-pwa/src/components/ThoughtRow.test.tsx
  - vigil-pwa/src/components/ThoughtRow.tsx
  - vigil-pwa/src/hooks/useThoughts.test.tsx
  - vigil-pwa/src/hooks/useThoughts.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 100: Code Review Report

**Reviewed:** 2026-04-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The Phase 100 edit-refresh pause implementation is correct, well-tested, and matches the decisions in `100-CONTEXT.md`. The `Set<number>` refcount design (D-02), three dispatch sites in `ThoughtRow` plus the unmount-during-edit cleanup (D-11, D-12), and the stop-on-pause / catch-up-on-resume pattern (D-08, D-09) all land cleanly. Seven tests directly cover the stated acceptance behavior, including the sharp edges called out in context (stray end, duplicate starts, concurrent edits, unmount mid-edit).

No critical issues. Three warnings concern type accuracy at the `onUpdate` callback boundary and unhandled-rejection paths when `handleSave` is invoked from synchronous event handlers. Four info items flag small defensive redundancies and a missing test case; none block ship.

## Warnings

### WR-01: `onUpdate` prop type declares `void` but implementation awaits it

**File:** `vigil-pwa/src/components/ThoughtRow.tsx:6`
**Issue:** The prop type is declared as `onUpdate: (id: number, patch: { ... }) => void`, but `handleSave` awaits it at line 145 (`await onUpdate(thought.id, { content: trimmed })`) and the test mocks it with `mockResolvedValue(undefined)`. TypeScript permits `await` on a non-Promise, so the compiler is silent, but the declared contract lies — consumers reading the prop type cannot tell that async failures in `onUpdate` will reject the save flow and leave `isSaving` dangling if the caller doesn't handle them. `ThoughtList.tsx:9` mirrors the same incorrect type, and `ThoughtsPage.tsx:282` wires `handleUpdate` which is almost certainly async.
**Fix:**
```tsx
onUpdate: (
  id: number,
  patch: { content?: string; category?: string; taskStatus?: string }
) => void | Promise<void>
```
(and mirror in `ThoughtList.tsx:9`).

### WR-02: `handleSave` called without `await` from synchronous event handlers creates unhandled rejection path

**File:** `vigil-pwa/src/components/ThoughtRow.tsx:167,244`
**Issue:** `handleKeyDown` calls `handleSave()` (line 167) and the textarea's `onBlur={handleSave}` (line 244) both invoke an async function without catching rejection. The `try/finally` at line 144-153 correctly guarantees `setIsEditing(false)`, `setIsSaving(false)`, and the `vigil:edit-ended` dispatch even when `onUpdate` throws, but the rejection itself escapes. In the browser this surfaces as an unhandled promise rejection (console error, potential `unhandledrejection` listener trigger). The pause-gate invariant is preserved (edit-ended still fires from `finally`), but the user sees a red console error and any top-level rejection monitor registers a crash. This is a correctness gap inherited from pre-phase code, but the new edit-ended dispatch in `finally` makes it tempting to rely on it as the "only" error path — it isn't.
**Fix:** Add a catch in `handleSave`, or log at the call sites:
```tsx
// in handleSave, replace the try/finally with try/catch/finally:
try {
  await onUpdate(thought.id, { content: trimmed })
} catch (err) {
  console.error('[ThoughtRow] save failed', err)
  // optionally: setDraft(thought.content) to revert, or keep draft for retry
} finally {
  setIsEditing(false)
  setIsSaving(false)
  window.dispatchEvent(
    new CustomEvent('vigil:edit-ended', { detail: { id: thought.id } }),
  )
}
```

### WR-03: No test covers `handleSave` rejection path (onUpdate throws)

**File:** `vigil-pwa/src/components/ThoughtRow.test.tsx:48-102`
**Issue:** The edit-lifecycle suite tests the happy path (`mockResolvedValue(undefined)`) and the no-change early-exit path, but does not verify that `vigil:edit-ended` still fires when `onUpdate` rejects. Given D-11's explicit decision — "fire even if onUpdate threw — the edit session is over either way" (line 149 comment) — this is the most important invariant to pin with a test. A regression that moves the dispatch out of `finally` would slip past the current suite.
**Fix:**
```tsx
it('dispatches vigil:edit-ended even when onUpdate rejects', async () => {
  const onUpdate = vi.fn().mockRejectedValue(new Error('network'))
  const { getByText, getByRole } = render(
    <ThoughtRow thought={baseThought} onUpdate={onUpdate} />,
  )
  fireEvent.click(getByText('hello'))
  startSpy.mockClear()
  endSpy.mockClear()

  const textarea = getByRole('textbox') as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: 'newvalue' } })
  fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

  await waitFor(() => expect(endSpy).toHaveBeenCalledTimes(1))
  const ev = endSpy.mock.calls[0][0] as CustomEvent<{ id: number }>
  expect(ev.detail).toEqual({ id: 42 })
})
```
Pair with a `vi.spyOn(console, 'error').mockImplementation(() => {})` if WR-02's catch is added, to avoid noisy test output.

## Info

### IN-01: `thoughtIdRef` mirror is defensive redundancy

**File:** `vigil-pwa/src/components/ThoughtRow.tsx:80-83`
**Issue:** `thoughtIdRef` tracks `thought.id` via `useEffect`, but `thought.id` is the React key for the row — if it changes, the component unmounts and remounts, so the unmount cleanup would fire with the old id anyway (which is correct behavior). The ref + effect pair is defensive but adds two render-phase effects and extra reasoning surface. Not wrong, just noise.
**Fix:** Capture `thought.id` in a closure on mount and trust the key-stability invariant:
```tsx
useEffect(() => {
  const id = thought.id
  return () => {
    if (isEditingRef.current) {
      window.dispatchEvent(
        new CustomEvent('vigil:edit-ended', { detail: { id } }),
      )
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```
Minor — keep as-is if the team prefers the explicit ref pattern.

### IN-02: Interval callback double-gates on `activeEdits.size`

**File:** `vigil-pwa/src/hooks/useThoughts.ts:85-87`
**Issue:** The interval callback contains `if (activeEdits.size === 0) refetch()`, but `handleEditStarted` already calls `stopPoll()` which `clearInterval`s the poll. Under normal operation the guard is never hit because the interval is dead when `size > 0`. This is intentional belt-and-suspenders (per D-09, either implementation is acceptable), but a future reader may wonder if the guard is load-bearing. A comment would pay for itself.
**Fix:** Add a comment:
```ts
pollId = setInterval(() => {
  // Defensive: interval should be cleared before a start fires, but if a
  // race ever slips an interval tick between add(id) and stopPoll(), skip.
  if (activeEdits.size === 0) refetch()
}, 30_000)
```

### IN-03: `filtersKey` via `JSON.stringify` silently skips polling resets for non-enumerable filter additions

**File:** `vigil-pwa/src/hooks/useThoughts.ts:21,62`
**Issue:** `JSON.stringify(filters)` is used as a stable dep key. This is a pre-existing pattern not introduced by Phase 100, but it interacts with the new pause gate: if `filters` ever gains a non-serializable field (function, Date, Map), the `filtersKey` will silently lose information and the data-fetch effect won't re-run on that field's change, while the pause-gate effect (keyed on `[refetch]` only) will stay pinned. Not a bug today — all current fields serialize — but a footgun for whoever adds a filter next.
**Fix:** No change required for this phase. Consider a follow-up that either (a) enumerates the dep list explicitly, or (b) uses a stable deep-equal memo (e.g., `useDeepCompareMemo`) so TypeScript surfaces added fields.

### IN-04: `filtersKey` ordering is serializer-dependent

**File:** `vigil-pwa/src/hooks/useThoughts.ts:21`
**Issue:** `JSON.stringify` preserves key-insertion order; if callers construct `filters` with the same fields in different orders (`{ a, b }` vs `{ b, a }`), the key differs and the fetch fires unnecessarily. Pre-existing, not introduced here, but worth noting when the next Phase touches this hook.
**Fix:** If it ever becomes a flicker source, sort keys:
```ts
const filtersKey = filters
  ? JSON.stringify(filters, Object.keys(filters).sort())
  : ''
```
No action required this phase.

---

_Reviewed: 2026-04-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
