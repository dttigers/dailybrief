# Phase 96: PWA Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 96-pwa-fixes
**Areas discussed:** Chat 400 debugging, Task hiding scope, Chat error resilience

---

## Chat 400 Debugging

| Option | Description | Selected |
|--------|-------------|----------|
| Every message | Chat is completely broken — no messages go through at all | ✓ |
| First message only | First message in a new session fails, but retry works | |
| After some messages | Works initially, then breaks mid-conversation | |
| Not sure | Haven't narrowed it down | |

**User's choice:** Every message — completely broken
**Notes:** Points to systematic issue (auth, route mounting, payload shape)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Just fix the bug | Get chat working again, current error message is fine | ✓ |
| Fix bug + show specific errors | Fix 400 and surface actual error reason in chat UI | |

**User's choice:** Just fix the bug
**Notes:** No UI embellishments needed

---

## Task Hiding Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, hide from search too | Consistent behavior — done tasks invisible everywhere | ✓ |
| No, search shows everything | Search as power-user escape hatch | |
| You decide | Let Claude pick | |

**User's choice:** Yes, hide from search too
**Notes:** Consistent behavior across all views including search

---

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side | Add default excludeDone=true to GET /v1/thoughts | ✓ |
| Client-side only | Extend useThoughts filter — only fixes PWA | |
| You decide | Let Claude pick | |

**User's choice:** Server-side filtering
**Notes:** Ensures all clients get consistent behavior. Tasks tab can override with explicit taskStatus param.

---

## Chat Error Resilience

| Option | Description | Selected |
|--------|-------------|----------|
| No retry needed | User can just hit send again. Keep it simple. | ✓ |
| Auto-retry once | Automatically retry once after short delay | |
| Show retry button | Explicit retry button next to failed message | |

**User's choice:** No retry needed
**Notes:** The 400 is a bug that will be fixed; transient errors are rare enough for manual retry

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep generic | One message: 'Failed to send message' | ✓ |
| Differentiate key errors | Show different messages for 503 vs 502 vs other | |

**User's choice:** Keep generic
**Notes:** User doesn't need to know internal error codes

---

## Claude's Discretion

- Implementation approach for chat 400 root cause (whatever the bug is)
- Exact query parameter naming for server-side done-task exclusion

## Deferred Ideas

None — discussion stayed within phase scope
