---
phase: 103-capture-repair-server-observability-foundations
fixed_at: 2026-04-19T00:00:00Z
review_path: .planning/phases/103-capture-repair-server-observability-foundations/103-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 103: Code Review Fix Report

**Fixed at:** 2026-04-19
**Source review:** .planning/phases/103-capture-repair-server-observability-foundations/103-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: TRIAGE_SYSTEM_PROMPT duplicated — two independent copies will drift

**Files modified:** `vigil-core/src/routes/triage.ts`, `vigil-core/src/routes/thoughts.ts`
**Commit:** fd07307
**Applied fix:** Added `export` keyword to `TRIAGE_SYSTEM_PROMPT` in `triage.ts`. Removed the verbatim redefinition from `thoughts.ts` and replaced it with `import { TRIAGE_SYSTEM_PROMPT } from "./triage.js"`. There are now zero duplicate copies; all three callers (triage route, `triageThought` helper, thoughts auto-triage) share the single exported constant.

---

### WR-02: `triage.ts` POST handler leaks raw AI text in 502 response body

**Files modified:** `vigil-core/src/routes/triage.ts`
**Commit:** 6c55a1f
**Applied fix:** Added `console.error("[vigil-core] /v1/triage parse error, raw:", raw)` before the return and changed the response body from `{ error: "AI response parse error", raw }` to `{ error: "AI response parse error" }`. Raw Claude output is now logged server-side only, consistent with the pattern already in `process-photo.ts`.

---

### WR-03: `me.ts` error branch distinguishes `db_unavailable` by string matching — fragile

**Files modified:** `vigil-core/src/routes/me.ts`
**Commit:** 1e28647
**Applied fix:** Introduced a `DbUnavailableError extends Error` class above `defaultDeps`. The `defaultDeps.userLookupFn` now throws `new DbUnavailableError()` instead of `new Error("db_unavailable")`. The handler catch block uses `err instanceof DbUnavailableError` instead of string equality on the message. This is robust against message wording changes and coincidental string matches.

---

### WR-04: `process-photo.ts` `insertRows` passes vision confidence, triage overwrites it — inconsistency on triage failure

**Files modified:** `vigil-core/src/routes/process-photo.ts`
**Commit:** 02fb002
**Applied fix:** Changed `confidence: transformed.confidence` to `confidence: null` in the `insertRows` map (step 8). Added a comment explaining that triage is the single source of truth for per-thought confidence and the page-level vision confidence belongs only in the response envelope. On triage update failure the DB row now consistently has `null` confidence, matching the in-memory fallback row returned in the response.

---

_Fixed: 2026-04-19_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
