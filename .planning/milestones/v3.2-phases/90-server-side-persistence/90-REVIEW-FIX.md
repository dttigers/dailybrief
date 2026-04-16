---
phase: 90-server-side-persistence
fixed_at: 2026-04-16T12:15:00Z
review_path: .planning/phases/90-server-side-persistence/90-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 90: Code Review Fix Report

**Fixed at:** 2026-04-16T12:15:00Z
**Source review:** .planning/phases/90-server-side-persistence/90-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Raw AI response leaked in error payload

**Files modified:** `vigil-core/src/routes/therapy.ts`
**Commit:** c9d0593
**Applied fix:** Removed `raw` from the JSON error response in the `/therapy/prep` parse-error handler (line 299). The endpoint now returns only `{ error: "AI response parse error" }` without leaking the full Claude API response, matching the pattern used by the other two endpoints.

### WR-01: Stale closure race condition in sendMessage

**Files modified:** `vigil-pwa/src/hooks/useChat.ts`
**Commit:** 6c9ebdc
**Applied fix:** Changed `sendMessage` to use the functional updater form of `setMessages` to capture the latest messages state. The `newMessages` array is now built inside the `setMessages` callback via `prev`, ensuring rapid successive sends always see the most recent state. Removed `messages` from the dependency array since the callback no longer reads it from closure scope.

### WR-02: Silent error swallowing in outer catch blocks

**Files modified:** `vigil-core/src/routes/insights.ts`
**Commit:** 4dab132
**Applied fix:** Added `err` parameter to the outer catch block, extracted the error message with an `instanceof Error` check, and added a `console.error("[insights] AI request failed:", message)` log line. The client-facing response remains generic ("AI request failed") to avoid leaking internals.

### WR-03: Missing validation of AI-returned array structure

**Files modified:** `vigil-core/src/routes/insights.ts`, `vigil-core/src/routes/therapy.ts`
**Commit:** 226360e
**Applied fix:** Added shape validation filters before the confidence-based filtering in both the insights and therapy patterns endpoints. For insights, each item must have `title` (string), `message` (string), and `confidence` (number). For therapy patterns, each item must have `theme` (string), `description` (string), and `confidence` (number). If zero items pass validation, a 502 error is returned instead of silently producing empty results.

---

_Fixed: 2026-04-16T12:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
