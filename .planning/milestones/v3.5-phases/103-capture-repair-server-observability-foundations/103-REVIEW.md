---
phase: 103-capture-repair-server-observability-foundations
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - vigil-core/src/analytics/posthog.test.ts
  - vigil-core/src/analytics/posthog.ts
  - vigil-core/src/routes/me.test.ts
  - vigil-core/src/routes/me.ts
  - vigil-core/src/routes/process-photo.test.ts
  - vigil-core/src/routes/process-photo.ts
  - vigil-core/src/routes/triage.ts
  - vigil-core/src/types/heic-convert.d.ts
  - vigil-core/src/index.ts
  - vigil-core/package.json
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 103: Code Review Report

**Reviewed:** 2026-04-19
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 103 introduces three meaningful additions: the PostHog analytics module with sensitive-route redaction, the `/v1/me` identity endpoint, and HEIC conversion + parallel triage in `/v1/process-photo`. The code is well-structured with good dep-injection surfaces throughout. The major finding is a TRIAGE_SYSTEM_PROMPT duplication bug that will silently diverge over time. Four warnings and three informational items follow.

---

## Warnings

### WR-01: TRIAGE_SYSTEM_PROMPT duplicated — two independent copies will drift

**File:** `vigil-core/src/routes/triage.ts:7` and `vigil-core/src/routes/thoughts.ts:11`

**Issue:** `TRIAGE_SYSTEM_PROMPT` is defined verbatim in both `triage.ts` and `thoughts.ts`. `process-photo.ts` now calls `triageThought()` (which uses `triage.ts`'s copy), while the POST `/v1/triage` route and thoughts.ts each carry their own copy. The comment in `triage.ts` (line 24) already warns "if the prompt or model parameters change, update BOTH the route and this helper together" — but "both" is actually "three". When a future plan changes the prompt in one place, the other(s) will silently produce inconsistent classifications.

**Fix:** Export `TRIAGE_SYSTEM_PROMPT` from `triage.ts` as a named constant and import it in `thoughts.ts`:

```typescript
// triage.ts — export the constant
export const TRIAGE_SYSTEM_PROMPT = `...`;

// thoughts.ts — import instead of redefining
import { TRIAGE_SYSTEM_PROMPT } from "./triage.js";
```

---

### WR-02: `triage.ts` POST handler leaks raw AI text in 502 response body

**File:** `vigil-core/src/routes/triage.ts:74`

**Issue:** When `parseAIJson` throws, the handler returns `{ error: "AI response parse error", raw }` where `raw` is the full Claude response string. Depending on the failure mode, `raw` could contain partial user content that was echoed back, or internal Anthropic error text. This is inconsistent with the principle applied elsewhere in the codebase (see process-photo.ts WR-01 fix at line 414) where raw SDK/AI text is never forwarded to the client.

**Fix:** Log `raw` server-side, return a generic body to the client:

```typescript
} catch {
  console.error("[vigil-core] /v1/triage parse error, raw:", raw);
  return c.json({ error: "AI response parse error" }, 502);
}
```

---

### WR-03: `me.ts` error branch distinguishes `db_unavailable` by string matching — fragile

**File:** `vigil-core/src/routes/me.ts:65`

**Issue:** The `db_unavailable` check at line 65 does `msg === "db_unavailable"` string equality to decide whether to return 503. If the `defaultDeps` `userLookupFn` ever changes the error message (e.g., adds punctuation, changes wording), or if a legitimate DB error message coincidentally contains "db_unavailable" as a substring after a wrapping operation, the branch silently misfires — either returning 500 (bad) or swallowing a real error as 503 (also bad).

**Fix:** Use a typed sentinel error class instead of string matching:

```typescript
class DbUnavailableError extends Error {
  constructor() { super("db_unavailable"); }
}

// In defaultDeps:
if (!defaultDb) throw new DbUnavailableError();

// In handler:
if (err instanceof DbUnavailableError) {
  return c.json({ error: "Database unavailable" }, 503);
}
```

---

### WR-04: `process-photo.ts` `insertRows` passes `confidence` as the Claude vision confidence, then `triagedRows` overwrites it — but only on success

**File:** `vigil-core/src/routes/process-photo.ts:451-453`

**Issue:** At line 451-453, `insertRows` is built with `confidence: transformed.confidence` (the page-level Claude vision confidence). On a successful triage call, `dbUpdateTriageFn` then updates the DB row with `result.confidence` (per-thought triage confidence), and the in-memory `triagedRow` is reconstructed with `confidence: t.confidence`. However, the `dbInsertFn` call at step 9 (line 458) stores `transformed.confidence` in the database first. If `dbUpdateTriageFn` later fails (the catch at line 489), the DB row retains the vision confidence but the in-memory fallback row (returned in the response) uses the original `row` from `insertedRows`, which also has vision confidence. This is internally consistent but the test at RT-1 line 268 explicitly asserts `t.confidence === 0.9` (triage confidence), while the insert passes `transformed.confidence === 0.92`. The test passes only because the fake `dbInsertFn` ignores the inserted `confidence` and the fake `triageFn` returns `0.9` which overwrites it. In production, a triage update failure would leave the DB with vision confidence `0.92` while returning `0.9` in the response body — a subtle DB/response inconsistency that could confuse sync.

**Fix:** Initialize `insertRows` with `confidence: null` (or omit the field) and let the triage update be the single source of truth for per-thought confidence. The vision confidence belongs at the page level only (`paperType`/`confidence` in the response envelope):

```typescript
const insertRows = transformed.thoughts.map((content) => ({
  userId,
  content,
  source: "image" as const,
  confidence: null,           // triage will populate this
  cloudKitRecordID: crypto.randomUUID(),
}));
```

---

## Info

### IN-01: `me.test.ts` test assertions are too permissive — 503 is accepted for cases that should fail with a specific status

**File:** `vigil-core/src/routes/me.test.ts:34-38` and `53-55`

**Issue:** Both tests in the "D-16/D-17/D-18" describe block accept either the expected status code or `503` with a comment "db unavailable in test env". This means a regression that breaks the handler and always returns 503 would not be caught by the test suite. The dep-injection describe block at the bottom (`createMeRouter`) goes unused for actual assertions — `me.ts` exports `createMeRouter` (line 47) but the tests never call it with a fake `userLookupFn`.

**Fix:** Add a test that calls `createMeRouter({ userLookupFn: async () => null })` directly (user not found → 401) and `createMeRouter({ userLookupFn: async () => ({ id: 1, email: "a@b.com" }) })` (found → 200). This eliminates the 503 escape hatch and makes the dep-injection surface actually exercised.

---

### IN-02: `posthog.ts` comment says call sites MUST NOT import `posthog` directly, but the singleton is still exported

**File:** `vigil-core/src/analytics/posthog.ts:8` and `51`

**Issue:** The module comment (line 8) warns "Call sites MUST NOT import { posthog } directly — the singleton export exists only for test setup assertions." TypeScript has no mechanism to enforce this comment. A future engineer may import `posthog` directly for a one-off capture, bypassing the `redactEvent` / null-guard wrapper.

**Fix:** Consider exporting `posthog` only from a barrel (`posthog.test-utils.ts`) or using a `/* @internal */` JSDoc tag. Alternatively, add an ESLint rule (e.g., `no-restricted-imports`) targeting `posthog` named import from the analytics module. Low priority for a solo-dev codebase, but worth noting before the team grows.

---

### IN-03: `index.ts` SIGINT handler is structurally identical to SIGTERM — no deduplication

**File:** `vigil-core/src/index.ts:203-212`

**Issue:** The SIGINT and SIGTERM handlers at lines 192-201 and 203-212 are byte-for-byte identical. A future change (e.g., adding a new service to stop) must be applied in two places.

**Fix:** Extract to a shared function:

```typescript
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`[vigil-core] ${signal} received, stopping services...`);
  await shutdownPosthog();
  generateScheduler.stop();
  gmailWorkOrders.stop();
  await closeConnection();
  process.exit(0);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
```

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
