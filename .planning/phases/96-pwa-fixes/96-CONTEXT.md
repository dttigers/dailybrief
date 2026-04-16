# Phase 96: PWA Fixes - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix two broken daily workflows in the PWA: (1) chat returns 400 on every message — completely non-functional, and (2) completed tasks (status=done) leak into All Thoughts, category views, and search results instead of being hidden.

</domain>

<decisions>
## Implementation Decisions

### Chat 400 Fix
- **D-01:** The 400 error occurs on every message — chat is completely broken. This is a systematic issue, not intermittent. Root cause investigation should focus on request payload shape, route mounting, auth middleware, or Content-Type handling across the full POST /v1/chat path.
- **D-02:** Just fix the underlying bug. No UI embellishments — the current generic error message is fine once chat works again.

### Task Hiding
- **D-03:** Done tasks must be hidden from ALL views: All Thoughts, category sidebar views, and search results. Consistent behavior everywhere.
- **D-04:** Filtering must be server-side — add a default `excludeDone=true` behavior to GET /v1/thoughts. The Tasks tab can explicitly pass `taskStatus=done` or `taskStatus=all` to override. This ensures all clients (PWA, future apps) get consistent behavior.
- **D-05:** The existing Tasks tab Open/Done/All filter (Phase 91) must not regress — it should continue to work as-is by overriding the default exclude.

### Chat Error Resilience
- **D-06:** No retry capability needed — user can just hit send again. Keep it simple.
- **D-07:** Keep generic error messages — no need to differentiate 502 vs 503 vs other failures.

### Claude's Discretion
- Implementation approach for the chat 400 root cause fix (whatever the bug turns out to be)
- Exact query parameter naming for the server-side done-task exclusion

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Chat system
- `vigil-core/src/routes/chat.ts` — POST /v1/chat handler with message validation and 400 paths
- `vigil-pwa/src/api/client.ts` §257-267 — sendChatMessage() client function
- `vigil-pwa/src/hooks/useChat.ts` — Chat hook with session management and error handling
- `vigil-core/src/ai/client.ts` — callClaudeConversation() AI client (chat depends on this)

### Thoughts/task filtering
- `vigil-core/src/routes/thoughts.ts` §106-159 — GET /v1/thoughts query param handling and filter conditions
- `vigil-pwa/src/hooks/useThoughts.ts` §39-47 — Client-side task status filtering (currently task-category-only)
- `vigil-pwa/src/pages/ThoughtsPage.tsx` — Main thoughts page with category tabs and filter wiring
- `vigil-pwa/src/components/StatusFilterTabs.tsx` — Task status filter UI component

### Route mounting
- `vigil-core/src/index.ts` §114 — Chat route mounted at /v1

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vigilFetch()` in client.ts — standardized fetch wrapper with auth headers, used by all API calls
- `StatusFilterTabs` component — existing Open/Done/All filter UI for the Tasks tab
- Server-side `taskStatus` query param already exists in GET /v1/thoughts — can be extended

### Established Patterns
- Hono route handlers with JSON body parsing and structured error responses
- Client-side hooks (useThoughts, useChat) with optimistic updates and error state
- Server-synced filter preferences via settings endpoint (task_status_filter)

### Integration Points
- GET /v1/thoughts query params — where server-side excludeDone will be added
- useThoughts hook — may need minor adjustment to pass new query params
- Tasks tab filter — must continue to override the default exclusion

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for both fixes.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 96-pwa-fixes*
*Context gathered: 2026-04-16*
