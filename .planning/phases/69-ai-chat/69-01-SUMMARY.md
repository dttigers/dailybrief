---
phase: 69-ai-chat
plan: "01"
subsystem: vigil-pwa
tags: [chat, ai, pwa, react]
dependency_graph:
  requires: []
  provides: [chat-ui, chat-api-client, chat-hook]
  affects: [vigil-pwa]
tech_stack:
  added: []
  patterns: [useCallback-hook, multi-turn-conversation, optimistic-ui]
key_files:
  created:
    - vigil-pwa/src/hooks/useChat.ts
    - vigil-pwa/src/pages/ChatPage.tsx
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/App.tsx
    - vigil-pwa/src/components/Layout.tsx
    - .gitignore
decisions:
  - "In-memory conversation history only — no localStorage persistence per phase scope"
  - "Send button disabled during isLoading to prevent duplicate requests (T-69-03)"
  - "On send failure: remove the optimistically-appended user message and surface error banner"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-12T20:58:35Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 4
---

# Phase 69 Plan 01: AI Chat Summary

**One-liner:** Multi-turn AI chat page in Vigil PWA backed by POST /v1/chat with automatic thought-context injection and in-memory conversation state.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Chat API function, useChat hook, and ChatPage component | f0bb1c0 | client.ts, useChat.ts, ChatPage.tsx |
| 2 | Wire chat route and navigation tab | 6ee8f9c | App.tsx, Layout.tsx |
| — | Housekeeping: gitignore node_modules/dist | 3c71667 | .gitignore |

## What Was Built

### sendChatMessage (vigil-pwa/src/api/client.ts)

Added `ChatMessage`, `ChatResponse` interfaces and `sendChatMessage(messages, includeContext)` function that POSTs to `/v1/chat` via `vigilFetch`. Bearer auth is handled transparently by `vigilFetch` (T-69-01 mitigation).

### useChat hook (vigil-pwa/src/hooks/useChat.ts)

Manages in-memory `ChatMessage[]` conversation state. `sendMessage(content)` appends the user message, calls the API with the full history (enabling multi-turn context), then appends the assistant reply. On error, removes the failed user message and surfaces an error string. `clearChat()` resets everything. Both callbacks are wrapped in `useCallback` for stable references.

### ChatPage (vigil-pwa/src/pages/ChatPage.tsx)

Full chat UI with:
- Scrollable message list (user messages right/indigo, assistant left/slate-800)
- `whitespace-pre-wrap` for formatted responses
- Auto-scroll to bottom via `useRef` + `useEffect`
- Empty state with prompt text
- Pulsing `...` loading bubble while awaiting response
- Context badge ("Using context from N recent thoughts") when `contextUsed > 0`
- Red error banner above input on failure
- "Clear chat" button (only shown when messages exist)
- Input disabled during loading; Send button disabled when empty or loading

### Route + Nav (App.tsx, Layout.tsx)

`/chat` route added after `/projects`. `Chat` tab appended to TABS array in Layout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing node_modules in worktree**
- **Found during:** Task 2 build verification
- **Issue:** `npm run build` failed because worktree had no `node_modules/`. Worktrees share git history but not installed packages.
- **Fix:** Ran `npm install` in worktree vigil-pwa; added `node_modules/` and `dist/` to root `.gitignore` (was a pre-existing gap).
- **Files modified:** .gitignore
- **Commit:** 3c71667

**2. [Rule 3 - Blocking] File edits to wrong path**
- **Found during:** Task 1 commit
- **Issue:** Initial edits went to main repo path (`/dailybrief/vigil-pwa/`) rather than the worktree path (`/dailybrief/.claude/worktrees/agent-a2378982/vigil-pwa/`). Git status in the worktree showed no changes.
- **Fix:** Rewrote all files to the correct worktree-relative absolute paths.
- **Files modified:** All Task 1 files (re-written to correct path)

## Build Verification

```
vite v8.0.8 — 46 modules transformed
dist/assets/index-C9E9KGso.css   25.40 kB
dist/assets/index-BfNo4one.js   265.04 kB
PWA precache: 12 entries (287.63 KiB)
✓ built in 243ms
```

TypeScript: no real type errors (only pre-existing TS6305 declaration file noise unrelated to this plan).

## Threat Surface Scan

No new endpoints introduced from the PWA side. All chat messages route through the existing `/v1/chat` endpoint already registered in vigil-core. Threats T-69-01 through T-69-04 addressed as specified in the plan's threat model.

## Known Stubs

None — chat page is fully wired to the live `/v1/chat` backend endpoint.

## Self-Check: PASSED

- vigil-pwa/src/api/client.ts — modified, committed in f0bb1c0
- vigil-pwa/src/hooks/useChat.ts — created, committed in f0bb1c0
- vigil-pwa/src/pages/ChatPage.tsx — created, committed in f0bb1c0
- vigil-pwa/src/App.tsx — modified, committed in 6ee8f9c
- vigil-pwa/src/components/Layout.tsx — modified, committed in 6ee8f9c
- npm run build — succeeded (46 modules, 0 errors)
