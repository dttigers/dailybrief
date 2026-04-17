# Phase 98: Thought-Contextual Chat - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can open a chat session pre-loaded with a specific thought so they can discuss, explore, or act on that thought with AI. The Chat tab must already work (Phase 96 fixed the 400 error). This phase adds the thought-to-chat wiring only — no new chat features, no thought editing changes.

</domain>

<decisions>
## Implementation Decisions

### Chat Entry Point
- **D-01:** Add an inline icon button (chat bubble icon) to ThoughtRow alongside the existing favorite and re-triage buttons. One tap to chat about any thought. Consistent with the established action button pattern.

### Context Injection
- **D-02:** Inject the thought text as the user's first message in the chat, then auto-send it to get an AI response. The thought appears as a regular user message — no special system-level injection or pinned headers.

### Session Handling
- **D-03:** Always create a new chat session when chatting about a thought. Title the session with a truncated version of the thought content. No thought-to-session linking or reuse logic needed.

### Chat Page Behavior
- **D-04:** When arriving from a thought, the AI auto-responds immediately. Thought becomes user message, AI responds, user sees both right away. No extra confirmation step.

### Navigation
- **D-05:** Navigate from ThoughtRow to ChatPage using React Router with query params (e.g., `/chat?thoughtId=123`). ChatPage reads the param, fetches the thought, creates a new session, injects thought as first message, and auto-sends. The `useSearchParams()` pattern is already established in SettingsPage.

### Claude's Discretion
- Icon choice for the chat button (speech bubble variant)
- Exact session title format (truncation length, prefix)
- Whether to pass `focusedThoughtId` to the server API or handle entirely client-side
- Loading state while the AI generates its first response

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Chat system
- `vigil-pwa/src/pages/ChatPage.tsx` — Chat page component, session history, message rendering
- `vigil-pwa/src/hooks/useChat.ts` — Chat state hook: sessions, messages, sendMessage(), session CRUD
- `vigil-pwa/src/api/client.ts` — API client: sendChatMessage(), chat session CRUD functions
- `vigil-core/src/routes/chat.ts` — POST /v1/chat endpoint, auto-injects recent thoughts as context
- `vigil-core/src/routes/chat-sessions.ts` — Chat session CRUD endpoints

### Thought system
- `vigil-pwa/src/components/ThoughtRow.tsx` — Individual thought component with action buttons (favorite, re-triage, task status)
- `vigil-pwa/src/components/ThoughtList.tsx` — Thought list container
- `vigil-pwa/src/hooks/useThoughts.ts` — Thought state hook: thoughts array, filters, CRUD
- `vigil-pwa/src/pages/ThoughtsPage.tsx` — Thoughts page with category sidebar

### Navigation
- `vigil-pwa/src/App.tsx` — React Router v7 route definitions (/chat, /, etc.)
- `vigil-pwa/src/components/Layout.tsx` — Tab navigation (Thoughts, Work Orders, Chat)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useChat()` hook: self-contained chat state with `sendMessage()`, session auto-create, message persistence
- `ThoughtRow.tsx` action button pattern: inline icon buttons (heart, re-triage) with click handlers
- `useSearchParams()` pattern established in SettingsPage for URL-based state passing
- `sendChatMessage(messages, includeContext)` API function already available in client.ts
- `createChatSession(title)` API function for session creation

### Established Patterns
- Action buttons on ThoughtRow are inline icons with `onClick` handlers
- Chat sessions persist via API calls to `/v1/chat-sessions` endpoints (JSONB messages in DB)
- Navigation uses `useNavigate()` from React Router v7
- Chat API auto-injects recent thoughts as context (up to `contextLimit`)

### Integration Points
- ThoughtRow needs new chat icon button wired to `navigate('/chat?thoughtId=...')`
- ChatPage needs `useSearchParams()` to detect thought context on mount
- useChat hook needs to support creating a session and auto-sending the first message programmatically
- No server-side changes strictly required — client can fetch thought and inject as message

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard approaches apply. The flow is: tap chat icon on thought -> navigate to /chat?thoughtId=N -> ChatPage creates session, injects thought as first user message, auto-sends, AI responds.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 98-thought-contextual-chat*
*Context gathered: 2026-04-16*
