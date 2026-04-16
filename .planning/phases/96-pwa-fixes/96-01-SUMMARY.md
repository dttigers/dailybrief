---
phase: 96-pwa-fixes
plan: 01
subsystem: ui
tags: [react, hooks, useRef, useCallback, stale-closure, chat]

# Dependency graph
requires:
  - phase: 90-chat-sessions
    provides: chat sessions persistence and useChat hook

provides:
  - Fixed sendMessage in useChat — messages array is never empty when sent to API
  - messagesRef pattern for accessing current state inside stable useCallback

affects: [chat, pwa-chat-context]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useRef + useEffect sync pattern: track state in a ref inside useCallback to avoid stale closures without listing state in deps"

key-files:
  created: []
  modified:
    - vigil-pwa/src/hooks/useChat.ts

key-decisions:
  - "Used messagesRef (useRef) synced via useEffect instead of reading messages state directly, avoiding stale closure while keeping useCallback dep-array stable"
  - "Root cause was React 18 concurrent mode: setState(fn) updater is called during commit phase, not synchronously during the setState call, so newMessages=[] at the time of the API call"

patterns-established:
  - "messagesRef pattern: when a stable useCallback needs current state, maintain a ref and sync it via useEffect rather than adding state to deps or using functional updaters"

requirements-completed: [FIX-01]

# Metrics
duration: 20min
completed: 2026-04-16
---

# Phase 96 Plan 01: Chat 400 Fix Summary

**Fixed PWA chat 400 error by replacing setState functional updater with messagesRef — React 18 concurrent mode does not call the updater synchronously, so newMessages was always [] at the time sendChatMessage was called**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-16T22:04:00Z
- **Completed:** 2026-04-16T22:20:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Root-caused the chat 400 error: React 18 concurrent mode batches setState calls, calling the functional updater during the commit phase (async), not synchronously — so `o=[]` was still empty when `sendChatMessage(o)` was called immediately after `setMessages(fn)`
- Added `messagesRef = useRef<ChatMessage[]>([])` kept in sync with `messages` state via `useEffect`, used in `sendMessage` to read current messages without stale closure or updater timing issues
- Verified fix: POST /v1/chat returns 200 for both single-message and multi-turn requests
- PWA builds cleanly with TypeScript; pushed to main

## Task Commits

Each task was committed atomically:

1. **Task 1: Diagnose and fix the chat 400 error** - `10d0206` (fix)
2. **Task 2: Verify end-to-end chat in PWA** - (no separate commit; verification only, build confirmed clean)

**Plan metadata:** (see final commit)

## Files Created/Modified
- `vigil-pwa/src/hooks/useChat.ts` — Added `messagesRef` + sync effect; replaced functional updater in `sendMessage` with `[...messagesRef.current, userMessage]`

## Decisions Made
- Used `useRef` + `useEffect` sync pattern rather than adding `messages` back to `useCallback` deps (which would recreate `sendMessage` on every message and was the reason for the prior stale-closure fix `6c9ebdc`)
- Root cause analysis: confirmed server works correctly (curl returns 200), identified the bug as a client-side React 18 concurrent mode timing issue in `useChat.ts`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

**PWA deployment blocked by missing Cloudflare auth token.** `npx wrangler pages deploy` requires `CLOUDFLARE_API_TOKEN` or an active `wrangler login` session. Neither is present in this environment. Code fix is committed and pushed to main; user must run `npx wrangler pages deploy dist --project-name vigil-pwa` from `vigil-pwa/` after authenticating.

## User Setup Required

**Deploy the PWA to make the fix live:**
```bash
cd vigil-pwa
npx wrangler login   # authenticate once
npx wrangler pages deploy dist --project-name vigil-pwa
```

Or set `CLOUDFLARE_API_TOKEN` env var before running the deploy command.

## Known Stubs

None.

## Next Phase Readiness
- Chat 400 fix is code-complete; PWA deploy needed to make it live for users
- FIX-01 is resolved at the code level; Railway deploy not needed (server-side code unchanged)
- Phase 96-02 can proceed once PWA is deployed

## Self-Check: PASSED

- SUMMARY.md: exists
- useChat.ts: exists
- Commit 10d0206: confirmed in git history

---
*Phase: 96-pwa-fixes*
*Completed: 2026-04-16*
