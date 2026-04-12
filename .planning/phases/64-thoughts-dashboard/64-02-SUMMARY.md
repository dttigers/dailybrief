---
phase: 64-thoughts-dashboard
plan: "02"
subsystem: vigil-pwa
tags: [react, typescript, capture, inline-edit, triage, pwa]
dependency_graph:
  requires: [64-01]
  provides: [THOUGHT-03, THOUGHT-04]
  affects: [vigil-pwa/src/components, vigil-pwa/src/pages]
tech_stack:
  added: []
  patterns:
    - fire-and-forget triage (createThought → prependThought → triageThought+updateThought in background)
    - optimistic local update via updateLocal after API success
    - controlled textarea with autoFocus + ref.select() for inline editing
key_files:
  created:
    - vigil-pwa/src/components/CaptureBar.tsx
  modified:
    - vigil-pwa/src/components/ThoughtRow.tsx
    - vigil-pwa/src/pages/ThoughtsPage.tsx
decisions:
  - "onUpdate in ThoughtsPage calls updateThought(API) then updateLocal — ThoughtRow stays pure (no direct API calls)"
  - "Triage errors silently swallowed via .catch(() => {}) — capture is never blocked"
  - "Empty draft on blur reverts rather than saving an empty thought"
  - "Tailwind v4 canonical class warnings (min-h-[4rem], break-words) left as-is — plan spec used them and they are functionally correct"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 3
---

# Phase 64 Plan 02: Thought Capture and Inline Edit Summary

**One-liner:** Sticky CaptureBar with fire-and-forget AI triage + ThoughtRow inline textarea editing — completing THOUGHT-03 and THOUGHT-04.

---

## Tasks Completed

### Task 1: CaptureBar component with create + triage flow (commit: 9b5e156)

Created `vigil-pwa/src/components/CaptureBar.tsx` — a sticky bottom input bar with the following flow:

1. User types content and presses Enter or clicks Save
2. `createThought(trimmed)` POSTs to `/v1/thoughts` → get `ThoughtApiResponse`
3. `onCapture(thought)` calls `prependThought` in ThoughtsPage — thought appears at top of list immediately
4. Input cleared, `isSubmitting` reset
5. Background: `triageThought(content).then(r => updateThought(id, { category: r.category }).then(() => onCategoryUpdate(id, r.category))).catch(() => {})` — category badge updates in place after AI triage; 503/502 errors silently swallowed

Error state: if `createThought` itself fails, an inline red error message appears below the input and the content is preserved for retry.

Updated `ThoughtsPage.tsx` to:
- Import and render `<CaptureBar>` below the ThoughtList
- Wire `onCapture={prependThought}` and `onCategoryUpdate={(id, category) => updateLocal(id, { category })}`
- Restructure layout with `flex flex-col min-h-[calc(100vh-8rem)]` so CaptureBar stays sticky at bottom

### Task 2: Inline editing in ThoughtRow (commit: 5b86233)

Updated `vigil-pwa/src/components/ThoughtRow.tsx`:
- Added `isEditing`, `draft`, `isSaving` state
- Click on content `<p>` → `setIsEditing(true)`, `setDraft(thought.content)`
- In edit mode: renders `<textarea>` with `autoFocus`, selects all text on mount via `useRef` + `useEffect`
- `onBlur` → save (or revert if draft is empty)
- `Cmd/Ctrl+Enter` → save
- `Escape` → revert draft, exit edit mode
- Plain `Enter` → allows newlines (no save)
- `isSaving` indicator: "Saving..." shown next to timestamp while PUT is in-flight
- `line-clamp-3` only in display mode; textarea shows full content

Updated `ThoughtsPage.tsx` to add `handleUpdate` callback:
```typescript
async function handleUpdate(id: number, patch: { content?: string; category?: string }) {
  await updateThought(id, patch)
  updateLocal(id, patch)
}
```
This ensures the API is called first, then the local list is updated optimistically. Passed as `onUpdate` to `ThoughtList` → `ThoughtRow`.

### Task 3: Human verification checkpoint — PENDING

**Status:** checkpoint: pending human verification

This task requires the user to open the PWA and verify the complete thoughts dashboard end-to-end:
1. Thought list loads with category filtering and search
2. CaptureBar at bottom: type a thought, click Save — appears at top, category badge appears after triage
3. Click a thought's content — enters inline edit textarea
4. Edit and blur/Cmd+Enter — saves; Escape — reverts
5. Reload — captured and edited thoughts persist

To verify, open https://app.vigilhub.io (or run `cd vigil-pwa && npm run dev` locally) and follow the steps in the plan's `how-to-verify` section.

---

## Build Verification

```
vite v8.0.8 building client environment for production...
✓ 35 modules transformed.
✓ built in 196ms
```

`cd vigil-pwa && npm run build` exits 0. No new TypeScript errors introduced.

---

## Deviations from Plan

### Auto-fixed Issues

None.

### Notes

- ThoughtList's `onUpdate` type is `(id: number, patch: { content?: string; category?: string }) => void` (synchronous signature). ThoughtsPage's `handleUpdate` is `async` — this is compatible because TypeScript allows assigning an async function where a void-returning function is expected (the returned Promise is ignored by ThoughtList/ThoughtRow, which is correct — ThoughtRow awaits `onUpdate` directly using its own `isSaving` state).

---

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-64-04: Tampering via CaptureBar | `input.trim()` checked before calling `createThought`; button disabled when empty |
| T-64-05: Tampering via inline edit | `draft.trim()` checked before `updateThought`; only `content` field sent in PUT body |
| T-64-06: Triage error disclosure | `.catch(() => {})` silently swallows all triage errors — no server details exposed |
| T-64-07: Category spoofing | Category rendered as React text node (auto-escaped) |

---

## Self-Check

Files exist:
- vigil-pwa/src/components/CaptureBar.tsx: FOUND
- vigil-pwa/src/components/ThoughtRow.tsx: FOUND (modified)
- vigil-pwa/src/pages/ThoughtsPage.tsx: FOUND (modified)

Commits:
- 9b5e156: FOUND
- 5b86233: FOUND

## Self-Check: PASSED
