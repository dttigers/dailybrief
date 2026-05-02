---
created: 2026-04-26T18:14:00.000Z
completed: 2026-05-02T22:42:00Z
title: ThoughtRow collapses newlines in displayed content (whitespace-pre-line missing)
area: ui
files:
  - vigil-pwa/src/components/ThoughtRow.tsx:399 (already fixed in Phase 115-03)
  - vigil-pwa/src/components/ThoughtAssignmentRow.tsx:32
  - vigil-pwa/src/pages/PhotoUploadPage.tsx:183 (audit-discovered third instance)
---

## Resolution (2026-05-02)

- `ThoughtRow.tsx:399` — already had `whitespace-pre-line` from Phase 115-03 D-16 (extension multi-line capture display fix). No change needed; verified in current source.
- `ThoughtAssignmentRow.tsx:32` — added `whitespace-pre-line` to the `<p>` className.
- `PhotoUploadPage.tsx:183` — surfaced via audit grep for `thought.content` rendering; OCR'd photo thoughts can be multi-line, so same fix applied for consistency.

Three instances now consistent. Pure CSS change, no risk, no migration. Untested visually — flagged for the next time you `npm run dev` on the PWA. The pre-existing `M vigil-pwa/src/index.css` change is unrelated.

## Problem

Phase 114 UAT (2026-04-26) surfaced this regression: when the Safari/Chrome
extension captures a thought with the "Include page URL" box checked, the
captured content is stored verbatim per D-06: `${typed text}\n\n${tab.title}: ${tab.url}`.
DB confirms the two newlines are preserved (thought id=625, content_len=59,
two newlines between "test" and "Hacker News").

But the PWA renders this as a single space between the typed text and the
URL line. Source: `vigil-pwa/src/components/ThoughtRow.tsx:399`:

```tsx
<p className="text-gray-100 text-sm leading-relaxed line-clamp-3 break-words cursor-text">
  {thought.content}
</p>
```

Default HTML / React behavior collapses whitespace including newlines into
a single space when no `white-space` CSS rule is applied. The same pattern
likely affects `ThoughtAssignmentRow.tsx:32` (also renders `thought.content`
with `line-clamp-2 leading-snug` and no whitespace handling).

This is a long-standing display issue (predates Phase 114 — the rendering
component is from Phase 50/53 era). It only became visible because the
Chrome+Safari extensions are the first systematic source of multi-line
thoughts in production. Voice/image captures land as single-line OCR/transcript;
typed PWA captures are usually one-line; folder-watch captures are filenames.

## Solution

**One-line fix:** add `whitespace-pre-line` to the className on
`ThoughtRow.tsx:399`:

```tsx
<p className="text-gray-100 text-sm leading-relaxed line-clamp-3 break-words cursor-text whitespace-pre-line">
  {thought.content}
</p>
```

`whitespace-pre-line` preserves newlines (`\n` rendered as `<br>`) while
still collapsing other whitespace (multiple spaces stay single). This is
the right balance for thought content (which should never have meaningful
double-spaces, but DOES have meaningful newlines from extension captures
and multi-paragraph notes).

**Apply same fix to `ThoughtAssignmentRow.tsx:32`** for consistency.

**Edit case:** `ThoughtRow.tsx` also has a textarea at line 92+ for inline
editing — that already preserves newlines (textareas always do). No change
needed there.

**Optional:** also audit other components that render `thought.content`
or similar user-supplied multi-line text. Likely candidates:
- `ChatPage` if it shows thought previews
- Brief rendering (PDF / preview)
- Any "recent thoughts" widget in dashboard

**Risk:** none. `whitespace-pre-line` is a pure CSS-level change. No data
mutation, no API change, no migration. Affects only how existing content
displays — and only IMPROVES display fidelity for content that already
contains newlines.

## Reference

- Phase 114 HUMAN-UAT.md SC#5 §URL append test — the empirical observation
- Phase 50 / 53 — original Thoughts list component
- Tailwind `whitespace-*` utilities: https://tailwindcss.com/docs/whitespace
