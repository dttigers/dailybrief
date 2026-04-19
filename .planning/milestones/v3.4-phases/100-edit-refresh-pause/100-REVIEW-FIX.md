---
phase: 100-edit-refresh-pause
fixed_at: 2026-04-17T00:00:00Z
review_path: .planning/phases/100-edit-refresh-pause/100-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 100: Code Review Fix Report

**Fixed at:** 2026-04-17T00:00:00Z
**Source review:** `.planning/phases/100-edit-refresh-pause/100-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (0 critical, 3 warning; Info findings excluded per `fix_scope=critical_warning`)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `onUpdate` prop type declares `void` but implementation awaits it

**Files modified:** `vigil-pwa/src/components/ThoughtRow.tsx`, `vigil-pwa/src/components/ThoughtList.tsx`
**Commit:** `d5c5daa`
**Applied fix:** Widened the `onUpdate` prop contract in both `ThoughtRow` and `ThoughtList` from `=> void` to `=> void | Promise<void>` so the declared type accurately reflects the async save path. Also aligned `ThoughtList`'s patch shape with `ThoughtRow` (adding the missing `taskStatus?: string` field) so both surfaces match and downstream `ThoughtsPage` consumers can type-check correctly. Verified no new `tsc --noEmit` errors in the modified files or their consumers (existing `TS6305` noise is stale `.d.ts` artifacts, unrelated).

### WR-02: `handleSave` unhandled rejection path

**Files modified:** `vigil-pwa/src/components/ThoughtRow.tsx`
**Commit:** `a90d714`
**Applied fix:** Added a `catch` block between the existing `try` and `finally` in `handleSave`. The catch logs via `console.error('[ThoughtRow] save failed', err)` so failures remain debuggable, while the existing `finally` still guarantees `setIsEditing(false)`, `setIsSaving(false)`, and the `vigil:edit-ended` dispatch — preserving D-11's invariant. This closes the unhandled-rejection path that escaped when `handleKeyDown` (line 167) or `onBlur` (line 244) invoked `handleSave()` without `await`. Comment references WR-02 and D-11 for future readers.

### WR-03: No test covers `handleSave` rejection path

**Files modified:** `vigil-pwa/src/components/ThoughtRow.test.tsx`
**Commit:** `226f023`
**Applied fix:** Added the suggested test `'dispatches vigil:edit-ended even when onUpdate rejects'` using `vi.fn().mockRejectedValue(new Error('network'))` and `fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })` to trigger the save path. Asserts `endSpy` fires exactly once with `{ id: 42 }` and that `onUpdate` was called with the new content. Paired with `vi.spyOn(console, 'error').mockImplementation(() => {})` (wrapped in try/finally with `mockRestore`) so WR-02's catch log doesn't pollute test output. Full suite runs 7/7 passing (6 original + 1 new).

---

_Fixed: 2026-04-17T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
