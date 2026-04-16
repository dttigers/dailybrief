---
phase: 90-server-side-persistence
reviewed: 2026-04-16T12:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - vigil-core/drizzle/0010_add_ai_cache.sql
  - vigil-core/drizzle/meta/_journal.json
  - vigil-core/src/db/schema.ts
  - vigil-core/src/routes/insights.ts
  - vigil-core/src/routes/therapy.ts
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/hooks/useChat.ts
  - vigil-pwa/src/hooks/useInsights.ts
  - vigil-pwa/src/hooks/useTherapy.ts
  - vigil-pwa/src/pages/InsightsPage.tsx
  - vigil-pwa/src/pages/TherapyPage.tsx
  - vigil-pwa/src/utils/formatRelativeTime.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 90: Code Review Report

**Reviewed:** 2026-04-16T12:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 90 adds server-side AI cache persistence via a new `ai_cache` table and wires cache-first loading into the PWA hooks for insights, therapy patterns, and therapy prep. The implementation is solid overall -- the migration is clean, the upsert logic is correct, the hooks handle cancellation properly, and the UI pages handle loading/error/empty states well. Six issues found: one critical information disclosure in the therapy prep error path, three warnings around error handling and race conditions, and two minor info items.

## Critical Issues

### CR-01: Raw AI response leaked in error payload

**File:** `vigil-core/src/routes/therapy.ts:299`
**Issue:** When `parseAIJson` fails in the `/therapy/prep` endpoint, the raw AI response string is included in the error JSON body (`{ error: "AI response parse error", raw }`). This leaks the full Claude API response to the client, which may contain internal prompt details, model metadata, or unexpected content. The other two endpoints (insights line 108, therapy/patterns line 189) correctly omit the raw response.
**Fix:**
```typescript
// Line 299 — remove `raw` from the response
return c.json({ error: "AI response parse error" }, 502);
```

## Warnings

### WR-01: Stale closure race condition in sendMessage

**File:** `vigil-pwa/src/hooks/useChat.ts:72-117`
**Issue:** `sendMessage` captures `messages` from closure state at callback creation time. If a user sends two messages in rapid succession before the first resolves, the second call will read stale `messages` state (missing the first user message and its response), causing message loss. The dependency array `[messages, activeSessionId]` means a new callback is created on each message change, but between the `setMessages` call on line 76 and React's next render, a second invocation would still see the old array.
**Fix:** Use the functional updater form of `setMessages` or a ref to always read the latest messages:
```typescript
const sendMessage = useCallback(async (content: string) => {
  const userMessage: ChatMessage = { role: 'user', content }
  let newMessages: ChatMessage[] = []
  setMessages((prev) => {
    newMessages = [...prev, userMessage]
    return newMessages
  })
  // ... rest of the function uses newMessages
}, [activeSessionId])
```

### WR-02: Silent error swallowing in outer catch blocks

**File:** `vigil-core/src/routes/insights.ts:141-143`
**Issue:** The outer `catch` block on the insights POST handler returns a generic "AI request failed" error with no logging. If `callClaude` throws for reasons other than a parse failure (network error, timeout, rate limit), there is no server-side log to diagnose the problem. The therapy routes (lines 103-106, 213-216) at least expose `err.message`, but insights discards it entirely.
**Fix:**
```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : "Unknown AI error";
  console.error("[insights] AI request failed:", message);
  return c.json({ error: "AI request failed" }, 502);
}
```

### WR-03: Missing validation of AI-returned array structure

**File:** `vigil-core/src/routes/insights.ts:113-118` and `vigil-core/src/routes/therapy.ts:192`
**Issue:** After `parseAIJson`, the code checks `Array.isArray(parsed)` for insights but does not validate that each element has the expected shape (e.g., `title`, `message`, `confidence` fields). If the AI returns an array of objects missing `confidence`, the `.filter((insight) => insight.confidence >= 0.5)` comparison would evaluate `undefined >= 0.5` as `false`, silently dropping all results. The therapy patterns endpoint has the same gap. This could produce confusing "zero results" responses when the AI returns valid but differently-shaped JSON.
**Fix:** Add a minimal shape check before mapping:
```typescript
const valid = parsed.filter(
  (item) =>
    typeof item.title === 'string' &&
    typeof item.message === 'string' &&
    typeof item.confidence === 'number'
);
if (valid.length === 0) {
  return c.json({ error: "AI returned no valid insights" }, 502);
}
```

## Info

### IN-01: formatRelativeTime does not handle invalid dates

**File:** `vigil-pwa/src/utils/formatRelativeTime.ts:6`
**Issue:** If `iso` is an invalid string, `new Date(iso).getTime()` returns `NaN`, and all subsequent arithmetic produces `NaN`. The function would return `"NaNd ago"`. This is unlikely in normal operation since `generatedAt` comes from the server, but a defensive check would improve robustness.
**Fix:**
```typescript
const time = new Date(iso).getTime()
if (Number.isNaN(time)) return 'unknown'
const diffMs = Date.now() - time
```

### IN-02: generate and regenerate callbacks are near-duplicates

**File:** `vigil-pwa/src/hooks/useInsights.ts:51-82`
**Issue:** `generate` and `regenerate` share identical logic except `regenerate` clears state before calling. This is a minor duplication. Same pattern exists in `useTherapy.ts` (analyzePatterns/regeneratePatterns, generatePrep/regeneratePrep).
**Fix:** Extract a shared helper, e.g.:
```typescript
const doGenerate = useCallback(async (clearFirst: boolean) => {
  if (clearFirst) { setInsights([]); setIsCached(false) }
  setIsLoading(true)
  setError(null)
  try {
    const response = await apiGenerateInsights()
    setInsights(response.insights)
    setIsCached(false)
    setGeneratedAt(response.generatedAt)
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Failed to generate insights')
  } finally {
    setIsLoading(false)
  }
}, [])
const generate = useCallback(() => doGenerate(false), [doGenerate])
const regenerate = useCallback(() => doGenerate(true), [doGenerate])
```

---

_Reviewed: 2026-04-16T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
