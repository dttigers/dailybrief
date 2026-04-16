---
phase: 89-7-day-analysis-scope
fixed_at: 2026-04-16T13:42:03Z
review_path: .planning/phases/89-7-day-analysis-scope/89-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 89: Code Review Fix Report

**Fixed at:** 2026-04-16T13:42:03Z
**Source review:** .planning/phases/89-7-day-analysis-scope/89-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Raw AI output leaked in error response body

**Files modified:** `vigil-core/src/routes/therapy.ts`
**Commit:** bb4c244
**Applied fix:** Removed `raw` from both 502 error responses (classify at line 71, patterns at line 161). Added `console.error` server-side logging in both catch blocks so the raw output is still observable in server logs without being exposed to HTTP clients.

---

### WR-01: Bearer header sends literal string "null" when no API key is stored

**Files modified:** `vigil-pwa/src/api/client.ts`
**Commit:** 818331b
**Applied fix:** Replaced unconditional `Authorization: \`Bearer ${key}\`` with a conditional `authHeaders` object — set to `{ Authorization: \`Bearer ${key}\` }` when `key` is truthy, empty object `{}` otherwise. Header is now omitted entirely when no key is stored.

---

### WR-02: `patternSection` is dead code — pattern context never reaches the prep prompt

**Files modified:** `vigil-core/src/routes/therapy.ts`
**Commit:** 3ce5b67
**Applied fix:** Applied Option A — removed the always-empty `patternSection` constant and its interpolation from the `userMessage` template string. The prompt now reads cleanly from `thoughtLines` directly. Option B (wiring up a `patterns` body param) is deferred until the feature is intentionally implemented.

---

### WR-03: `/therapy/patterns` query includes `selfLearnable` thoughts but prompt says "therapy-related thoughts"

**Files modified:** `vigil-core/src/routes/therapy.ts`
**Commit:** f4fdd6c
**Applied fix:** Updated the `userMessage` framing from "Here are my therapy-related thoughts" to "Here are my classified thoughts from the last 7 days (both self-learnable and therapy-relevant)" to accurately describe the broader dataset the query returns. The query scope (`isNotNull(therapyClassification)`) was left unchanged — narrowing to `bringToTherapist` only would reduce the pattern dataset and is a product decision, not a bug fix.

---

_Fixed: 2026-04-16T13:42:03Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
