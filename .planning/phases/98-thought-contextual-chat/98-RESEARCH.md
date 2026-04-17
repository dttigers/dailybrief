# Phase 98: Thought-Contextual Chat - Research

**Researched:** 2026-04-16
**Domain:** React Router navigation + React hook extension + PWA UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Chat Entry Point:** Add an inline icon button (chat bubble icon) to ThoughtRow alongside the existing favorite and re-triage buttons. One tap to chat about any thought. Consistent with the established action button pattern.

**D-02 — Context Injection:** Inject the thought text as the user's first message in the chat, then auto-send it to get an AI response. The thought appears as a regular user message — no special system-level injection or pinned headers.

**D-03 — Session Handling:** Always create a new chat session when chatting about a thought. Title the session with a truncated version of the thought content. No thought-to-session linking or reuse logic needed.

**D-04 — Chat Page Behavior:** When arriving from a thought, the AI auto-responds immediately. Thought becomes user message, AI responds, user sees both right away. No extra confirmation step.

**D-05 — Navigation:** Navigate from ThoughtRow to ChatPage using React Router with query params (e.g., `/chat?thoughtId=123`). ChatPage reads the param, fetches the thought, creates a new session, injects thought as first message, and auto-sends. The `useSearchParams()` pattern is already established in SettingsPage.

### Claude's Discretion

- Icon choice for the chat button (speech bubble variant)
- Exact session title format (truncation length, prefix)
- Whether to pass `focusedThoughtId` to the server API or handle entirely client-side
- Loading state while the AI generates its first response

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-01 | User can open chat from an individual thought, with that thought injected as conversation context | D-01 through D-05 + existing sendMessage(), createChatSession(), useSearchParams() all confirmed usable |
</phase_requirements>

---

## Summary

Phase 98 wires the existing thought list and the existing chat system together via three small, focused changes: a chat icon button on ThoughtRow, a navigation call using `useNavigate`, and a mount-time effect in ChatPage that reads `?thoughtId=` from the URL, fetches the thought, and calls `sendMessage()` to auto-send it as the first user message.

No server changes are required. The `sendChatMessage()` function already accepts any array of `ChatMessage` objects. The `createChatSession(title)` API already accepts an optional title. The `useSearchParams()` pattern already exists in SettingsPage. The action-button pattern (inline icon, `onClick` handler) already exists on ThoughtRow for favorite and re-triage.

The one gap that must be bridged: there is **no `getThought(id)` function in `client.ts`**. ChatPage will need to either add this thin wrapper (one `vigilFetch` call to `GET /v1/thoughts/:id`) or fetch the thought content from the thought passed through navigation state. The simplest path is to pass the thought content directly through React Router's `navigate()` `state` option, avoiding an extra network round-trip entirely.

**Primary recommendation:** Pass thought content via `navigate('/chat', { state: { thoughtText, thoughtId } })` rather than using `?thoughtId=` + a server fetch. This is simpler, avoids adding a new API function, and the thought content is already available in ThoughtRow's props. Keep `?thoughtId=` in the URL as a fallback/bookmark signal only if needed for history display.

---

## Standard Stack

### Core (all already in use — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-router | v7 (already installed) | `useNavigate`, `useSearchParams`, `useLocation` | Project standard — already used in App.tsx, SettingsPage, AuthPage, Layout |
| React hooks | 18 (already installed) | `useEffect` for mount-time auto-send, `useRef` for stale-closure safety | Project standard — sendMessage already uses messagesRef pattern |

### No new dependencies required

**Installation:** None — all required packages already present in `vigil-pwa`.

---

## Architecture Patterns

### Recommended File Touch List
```
vigil-pwa/src/
├── components/
│   └── ThoughtRow.tsx        # Add onChat prop + chat icon button
├── components/
│   └── ThoughtList.tsx       # Thread onChat prop down from ThoughtsPage
├── pages/
│   └── ThoughtsPage.tsx      # Define handleChat(id), navigate to /chat with state
├── pages/
│   └── ChatPage.tsx          # Read location.state on mount, auto-send thought
└── hooks/
    └── useChat.ts            # (Optional) expose clearAndSend helper — or ChatPage handles inline
```

### Pattern 1: Navigate with Router State (No extra API call)

**What:** ThoughtsPage calls `navigate('/chat', { state: { thoughtText: thought.content, thoughtId: thought.id } })`. ChatPage reads `useLocation().state` on mount.

**When to use:** When data is already available at the call site (ThoughtRow has the full thought object). Avoids a round-trip fetch in ChatPage.

**Example:**
```typescript
// Source: [VERIFIED: vigil-pwa/src/pages/AuthPage.tsx + React Router docs pattern]

// In ThoughtsPage — handleChat handler:
function handleChat(thought: ThoughtApiResponse) {
  navigate('/chat', {
    state: { thoughtText: thought.content, thoughtId: thought.id },
  })
}

// In ChatPage — mount effect:
import { useLocation } from 'react-router'

const location = useLocation()

useEffect(() => {
  const state = location.state as { thoughtText?: string; thoughtId?: number } | null
  if (state?.thoughtText) {
    // Clear any auto-resumed session first, then send
    sendMessage(state.thoughtText)
    // Clear location.state to prevent re-trigger on tab switch
    window.history.replaceState({}, '')
  }
}, []) // intentionally empty — mount only
```

**Why `useLocation().state` over `useSearchParams()`:** The thought text can be arbitrarily long and contain special characters. Putting it in a query param requires encoding and risks URL length limits. Router state is designed for exactly this use case. The `?thoughtId=` pattern mentioned in D-05 is fine as supplemental, but the content itself should travel via state.

### Pattern 2: ThoughtRow Action Button (Established Pattern)

**What:** Inline icon button with `onClick` handler, matching heart and re-triage buttons.

**Example:**
```typescript
// Source: [VERIFIED: vigil-pwa/src/components/ThoughtRow.tsx lines 154-178]

// Existing pattern for reference:
{onRetriage && (
  <button
    onClick={async () => { ... }}
    disabled={isTriaging}
    className="text-gray-400/50 hover:text-teal-400 transition-colors cursor-pointer disabled:opacity-40"
    title="Re-triage with AI"
  >
    {isTriaging ? '...' : '↻'}
  </button>
)}

// New chat button follows same conditional pattern:
{onChat && (
  <button
    onClick={() => onChat(thought.id, thought.content)}
    className="text-gray-400/50 hover:text-teal-400 transition-colors cursor-pointer"
    title="Chat about this thought"
  >
    💬
  </button>
)}
```

**Note on icon:** The `↻` and `♡` buttons use Unicode text. A speech bubble Unicode character (`💬` or `🗨`) is the simplest approach consistent with the pattern. Alternatively use a simple SVG inline or a character like `✦`. Claude's discretion applies per CONTEXT.md.

### Pattern 3: ChatPage Mount Effect — Timing Gotcha

**What:** The `useChat` hook auto-resumes the most recent session on mount (line 41-49 of useChat.ts). The thought-context auto-send must fire AFTER session load or clear. The `loadSession` call is async.

**Risk:** If ChatPage fires `sendMessage(thoughtText)` immediately on mount, the `activeSessionId` inside `useChat` may still be null (session load in-flight), causing `sendMessage` to auto-create a new session — which is actually the desired behavior (D-03: always create a new session). However, the timing of `messagesRef.current` matters.

**Resolution:** The cleanest approach is to call `clearChat()` first (resets state synchronously), then call `sendMessage(thoughtText)` in a chained step. Since `clearChat` is synchronous and `sendMessage` reads `messagesRef.current` (which is always current), this is safe:

```typescript
// In ChatPage useEffect for thought context:
useEffect(() => {
  const state = location.state as { thoughtText?: string } | null
  if (!state?.thoughtText) return

  // Clear any auto-resumed session (synchronous state reset)
  clearChat()

  // sendMessage reads messagesRef.current which is [] after clearChat
  // It will auto-create a new session on first message (useChat lines 114-119)
  sendMessage(state.thoughtText)

  // Prevent replay on re-render / tab switch
  window.history.replaceState({}, '')
}, []) // mount-only — intentional empty deps
// eslint-disable-next-line react-hooks/exhaustive-deps
```

**Alternative:** Add a `clearAndSend(text: string)` method to `useChat` that atomically clears and sends. This is cleaner but modifies the hook. Either approach is valid; the inline approach avoids hook API surface expansion.

### Pattern 4: Prop Threading — ThoughtList needs `onChat`

**What:** ThoughtsPage defines `handleChat`, passes to ThoughtList as `onChat`, ThoughtList threads to each ThoughtRow. ThoughtList and ThoughtRow both need the new optional prop.

**Example (prop shape):**
```typescript
// ThoughtRow — add to ThoughtRowProps interface:
onChat?: (id: number, content: string) => void

// ThoughtList — add to ThoughtListProps interface:
onChat?: (id: number, content: string) => void

// ThoughtList — pass through in JSX:
<ThoughtRow ... onChat={onChat} />
```

### Anti-Patterns to Avoid

- **Fetching the thought in ChatPage via API:** ThoughtRow already has the thought object. Passing it through router state avoids a round-trip and the need to add `getThought(id)` to client.ts.
- **Reading `?thoughtId=` from URL for the content:** Long thought text doesn't belong in a URL query param. Use router state for content, reserve params for serializable IDs.
- **Calling `sendMessage()` before `clearChat()`:** The auto-resume-on-mount behavior in `useChat` loads the previous session. Sending before clearing would append the thought to the old session.
- **Using empty deps array with ESLint exhaustive-deps without suppression comment:** The mount-only `useEffect` intentionally ignores `sendMessage` and `clearChat` from deps. Add the suppression comment to avoid lint warnings that confuse future readers.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session creation | Custom fetch logic | `createChatSession(title)` already in client.ts | Handles auth headers, error throwing |
| Message sending | Direct API call | `sendMessage()` from `useChat` | Handles messagesRef stale-closure fix, session persistence, error recovery |
| Navigation state passing | `localStorage` or URL encoding | `navigate(path, { state })` React Router built-in | Clean, type-safe, not persisted beyond session |
| Thought fetch in ChatPage | New `getThought(id)` function | Pass content via router state | Simpler, no extra API call, avoids adding new client.ts surface |

---

## Common Pitfalls

### Pitfall 1: Session Auto-Resume Races With Auto-Send
**What goes wrong:** `useChat` loads the most recent session asynchronously on mount. If `sendMessage` fires before the session state settles, the message may be appended to the wrong session, or `activeSessionId` is wrong causing unexpected persistence behavior.
**Why it happens:** The `getChatSessions()` call in `useChat`'s mount effect is async. ChatPage's mount effect also runs after mount, but both happen in the same React commit cycle.
**How to avoid:** Call `clearChat()` before `sendMessage()`. `clearChat()` is synchronous and sets `activeSessionId` to null immediately, so `sendMessage()` will always hit the "no activeSessionId → auto-create" branch (useChat lines 114-119).
**Warning signs:** Chat session history shows thought appended to an existing conversation instead of a fresh one.

### Pitfall 2: Mount Effect Replays on Tab Switch
**What goes wrong:** User opens chat from a thought, navigates to another tab, then back. The location.state persists and the mount effect re-fires, sending the thought again.
**Why it happens:** React Router preserves location state across renders if the component stays mounted.
**How to avoid:** Call `window.history.replaceState({}, '')` after reading the state to clear it. This is the same pattern used in SettingsPage for OAuth callback params (line 58-66 of SettingsPage.tsx).
**Warning signs:** Thought message is sent twice when user navigates away and back.

### Pitfall 3: `useNavigate` Called From ThoughtRow Directly
**What goes wrong:** If `useNavigate()` is called inside ThoughtRow, it works but creates tight coupling. The component then requires a Router context (already true, but harder to test).
**Why it happens:** Developer convenience — putting navigation inside the component that has the data.
**How to avoid:** Pass `onChat` as a prop from ThoughtsPage (which owns navigation). This matches the established `onRetriage` and `onToggleFavorite` prop pattern — ThoughtRow is a pure display component that calls handlers upward.

### Pitfall 4: Thought Content Missing From State on Navigation
**What goes wrong:** ChatPage reads `location.state.thoughtText` but it's undefined.
**Why it happens:** `navigate('/chat', { state: {...} })` called with wrong property name, or called without `state` option.
**How to avoid:** Define a shared type for the navigation state (e.g., `type ChatNavigationState = { thoughtText: string; thoughtId: number }`) and use it in both ThoughtsPage and ChatPage.

---

## Code Examples

### Full Data Flow (Verified Against Codebase)

```typescript
// Step 1: ThoughtsPage.tsx — handler + navigate
// Source: [VERIFIED: vigil-pwa/src/pages/ThoughtsPage.tsx pattern + react-router useNavigate]
import { useNavigate } from 'react-router'

const navigate = useNavigate()

function handleChat(thought: ThoughtApiResponse) {
  navigate('/chat', {
    state: {
      thoughtText: thought.content,
      thoughtId: thought.id,
    },
  })
}

// Pass down: <ThoughtList ... onChat={handleChat} />
```

```typescript
// Step 2: ThoughtList.tsx — thread the prop
// Source: [VERIFIED: vigil-pwa/src/components/ThoughtList.tsx]
// Add to ThoughtListProps:
onChat?: (thought: ThoughtApiResponse) => void

// Add to ThoughtRow call:
<ThoughtRow ... onChat={onChat ? () => onChat(thought) : undefined} />
```

```typescript
// Step 3: ThoughtRow.tsx — chat icon button
// Source: [VERIFIED: vigil-pwa/src/components/ThoughtRow.tsx action button pattern]
// Add to ThoughtRowProps:
onChat?: () => void

// Add button in action button area (after onRetriage button):
{onChat && (
  <button
    onClick={onChat}
    className="text-gray-400/50 hover:text-teal-400 transition-colors cursor-pointer"
    title="Chat about this thought"
  >
    💬
  </button>
)}
```

```typescript
// Step 4: ChatPage.tsx — mount effect reads state and auto-sends
// Source: [VERIFIED: vigil-pwa/src/pages/ChatPage.tsx + useChat.ts clearChat/sendMessage]
import { useLocation } from 'react-router'

// Inside ChatPage():
const { sendMessage, clearChat, /* ...existing */ } = useChat()
const location = useLocation()

useEffect(() => {
  const state = location.state as { thoughtText?: string; thoughtId?: number } | null
  if (!state?.thoughtText) return

  clearChat()         // synchronous — resets activeSessionId to null
  sendMessage(state.thoughtText)  // auto-creates new session (useChat lines 114-119)
  window.history.replaceState({}, '')  // prevent replay
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])  // mount-only intentional
```

### Session Title Truncation (Claude's Discretion)
```typescript
// useChat.ts already truncates to 50 chars on first message (lines 98-100):
const title = newMessages.length === 1
  ? content.slice(0, 50) + (content.length > 50 ? '...' : '')
  : undefined

// No custom title logic needed in ChatPage — sendMessage() handles it automatically
// when createChatSession is called with no title (auto-creates, then updates on first send)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useState functional updater for messages | messagesRef (useRef + useEffect sync) | Phase 96 | Avoids React 18 concurrent mode stale closure in sendMessage |

**No deprecated patterns in scope for this phase.**

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely client-side code changes with no external dependencies beyond what's already running. The vigil-core server (providing `/v1/chat`) is a prerequisite confirmed working since Phase 96 (FIX-01 resolved).

---

## Validation Architecture

Config has `workflow.nyquist_validation` absent — treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in vigil-pwa (no jest.config, no vitest.config, no test/ directory) |
| Config file | None |
| Quick run command | Manual browser test — navigate to Thoughts, tap chat icon on a thought |
| Full suite command | Manual smoke test of full flow |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01a | Chat button appears on each ThoughtRow | visual/manual | — | ❌ no test infra |
| CHAT-01b | Tapping chat button navigates to /chat | manual | — | ❌ no test infra |
| CHAT-01c | Thought text appears as first user message | manual | — | ❌ no test infra |
| CHAT-01d | AI responds to thought in same session | manual | — | ❌ no test infra |
| CHAT-01e | Multi-turn conversation continues after initial exchange | manual | — | ❌ no test infra |

### Wave 0 Gaps
No test framework exists in vigil-pwa. All validation is manual browser testing. This is consistent with how all prior phases have been validated in this project.

*(Manual verification steps: open PWA → Thoughts tab → tap 💬 icon on any thought → confirm thought text appears as first message → confirm AI responds → confirm user can send follow-up messages)*

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `window.history.replaceState({}, '')` clears React Router location.state | Pitfall 2 / Code Examples | Mount effect could replay; mitigation: use a ref flag as backup |
| A2 | `clearChat()` followed synchronously by `sendMessage()` is race-free because clearChat sets state synchronously | Pitfall 1 / Pattern 3 | Thought message could land in wrong session; verify in browser |

---

## Open Questions

1. **Should `onChat` on ThoughtList/ThoughtRow receive `(id, content)` or the full `ThoughtApiResponse`?**
   - What we know: ThoughtsPage passes the full thought to `handleRetriage` (by ID only), but for chat we need the content.
   - What's unclear: Whether future uses of `onChat` might need more thought fields.
   - Recommendation: Pass the full `ThoughtApiResponse` to `handleChat` in ThoughtsPage; ThoughtList threads it as `() => onChat(thought)` — ThoughtRow calls `onChat()` with no args (closure handles it). This keeps ThoughtRow's interface minimal.

2. **Does `clearChat()` need to wait for the `getChatSessions()` auto-load to complete before being useful?**
   - What we know: `clearChat()` resets local state synchronously. The `getChatSessions()` call in useChat's mount effect is async and runs in parallel.
   - What's unclear: If `getChatSessions()` resolves AFTER `sendMessage()` fires, does the `setSessions` call interfere?
   - Recommendation: The `getChatSessions()` effect only calls `setSessions` and `loadSession` — it doesn't touch `messages` or `activeSessionId` if `clearChat()` has already reset them... actually `loadSession` does set `activeSessionId`. This is a potential race. Safer: add a ref flag `ignoreAutoLoad` that ChatPage sets when arriving from a thought, preventing the auto-load from firing. Or simply: call `clearChat()` in a `useLayoutEffect` which runs before the `useEffect` that auto-loads. **Flag this for the planner to decide.**

---

## Sources

### Primary (HIGH confidence)
- `[VERIFIED: vigil-pwa/src/hooks/useChat.ts]` — full hook implementation read; sendMessage, clearChat, startNewSession, auto-session-create behavior confirmed
- `[VERIFIED: vigil-pwa/src/pages/ChatPage.tsx]` — full page implementation read; current structure, useChat usage confirmed
- `[VERIFIED: vigil-pwa/src/components/ThoughtRow.tsx]` — action button pattern, prop interface confirmed
- `[VERIFIED: vigil-pwa/src/components/ThoughtList.tsx]` — prop threading pattern confirmed
- `[VERIFIED: vigil-pwa/src/pages/ThoughtsPage.tsx]` — handler delegation pattern (handleRetriage, handleToggleFavorite) confirmed
- `[VERIFIED: vigil-pwa/src/api/client.ts]` — all API functions read; no standalone getThought(id) exists; createChatSession(title?) confirmed
- `[VERIFIED: vigil-pwa/src/pages/SettingsPage.tsx]` — useSearchParams and history.replaceState pattern confirmed (lines 49, 58-66)
- `[VERIFIED: vigil-pwa/src/App.tsx]` — /chat route registered, no wildcard conflicts
- `[VERIFIED: vigil-core/src/routes/chat.ts]` — server auto-injects recent thoughts; first message must have role:'user'; no server changes needed

### Secondary (MEDIUM confidence)
- `[ASSUMED]` React Router v7 `navigate(path, { state })` + `useLocation().state` pattern — consistent with React Router v6+ documentation and confirmed by project using react-router (not react-router-dom) based on imports

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, verified in codebase
- Architecture: HIGH — all patterns verified against live source files
- Pitfalls: HIGH (race condition in Pitfall 1) / MEDIUM (A1, A2 in assumptions log)
- No server changes needed: HIGH — confirmed by reading chat.ts

**Research date:** 2026-04-16
**Valid until:** 60 days (stable codebase, no fast-moving dependencies)
