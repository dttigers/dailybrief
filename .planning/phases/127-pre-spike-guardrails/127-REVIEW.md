---
phase: 127-pre-spike-guardrails
reviewed: 2026-05-12T00:00:00Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - vigil-core/drizzle/0020_add_ai_usage_daily.sql
  - vigil-core/src/__tests__/audio-log-redaction.test.ts
  - vigil-core/src/__tests__/app-on-error.test.ts
  - vigil-core/src/__tests__/migration-drift.test.ts
  - vigil-core/src/ai/client.test.ts
  - vigil-core/src/ai/client.ts
  - vigil-core/src/analytics/posthog.test.ts
  - vigil-core/src/analytics/posthog.ts
  - vigil-core/src/db/schema.ts
  - vigil-core/src/index.ts
  - vigil-core/src/integration/cross-user-isolation.test.ts
  - vigil-core/src/lib/ai-budget.test.ts
  - vigil-core/src/lib/ai-budget.ts
  - vigil-core/src/lib/audio-cap.test.ts
  - vigil-core/src/lib/audio-cap.ts
  - vigil-core/src/lib/sentry.test.ts
  - vigil-core/src/lib/sentry.ts
  - vigil-core/src/routes/affirmation.ts
  - vigil-core/src/routes/chat.ts
  - vigil-core/src/routes/describe-image.ts
  - vigil-core/src/routes/insights.ts
  - vigil-core/src/routes/prioritize.ts
  - vigil-core/src/routes/process-audio.ts
  - vigil-core/src/routes/process-photo.ts
  - vigil-core/src/routes/therapy.ts
  - vigil-core/src/routes/thoughts.ts
  - vigil-core/src/routes/triage.ts
  - vigil-core/src/services/brief-assembly-service.ts
  - vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts
  - vigil-g2-plugin/src/lib/audio-session-guard.ts
  - vigil-pwa/package.json
  - vigil-pwa/scripts/denylist-parity-ci.mjs
  - vigil-pwa/src/__tests__/denylist-parity.test.ts
  - vigil-pwa/src/__tests__/sentry-init.test.ts
  - vigil-pwa/src/analytics/posthog.ts
  - vigil-pwa/src/lib/api-error-codes.test.ts
  - vigil-pwa/src/lib/api-error-codes.ts
  - vigil-pwa/src/lib/sentry-redact.test.ts
  - vigil-pwa/src/lib/sentry-redact.ts
  - vigil-pwa/src/main.tsx
findings:
  critical: 4
  warning: 7
  info: 4
  total: 15
status: issues_found
---

# Phase 127: Code Review Report

**Reviewed:** 2026-05-12
**Depth:** standard
**Files Reviewed:** 41
**Status:** issues_found

## Summary

Phase 127 ships four structural guardrails: GUARD-01 audio-log redaction (PostHog/Sentry beforeSend + cross-workspace denylist parity), GUARD-02 audio session cap helper (greenfield, no callers yet), GUARD-03 per-user AI budget (ai_usage_daily table + `requireAiBudget` + `withBudgetTracking` + app.onError 429 branch), and GUARD-04 schema-vs-migration drift detector.

The guardrails are well-tested with drift detectors and source-grep locks. Two notably correct decisions: (1) the app.onError DailyBudgetExceededError branch is ordered before captureException/captureToSentry (verified by app-on-error.test.ts mirror), and (2) the accumulator uses atomic `INSERT ... ON CONFLICT DO UPDATE` (race-safe under concurrent requests).

However, four critical correctness defects undermine the budget guardrail's contract:

1. **GUARD-03 cap-enforcement coverage hole**: Only `chat.ts` and `process-audio.ts` call `requireAiBudget`. Nine other AI invocation paths bypass the pre-flight gate entirely — including `/v1/insights`, `/v1/describe-image`, `/v1/therapy/*` (3 endpoints), `/v1/triage`, `/v1/process-photo`, `/v1/affirmation`, `/v1/prioritize`, the `/v1/thoughts` auto-triage path, and the brief-assembly scheduler. The accumulator still tracks spend, but a user who hits the cap can keep burning Anthropic dollars on every endpoint except chat and process-audio.

2. **`callClaude` signature accepts `userId: number` but route handlers pass `undefined` for unauthenticated/exempt paths**: `c.get("userId")` is typed as `number` via ContextVariableMap augmentation, but when `bearerAuth` is bypassed (e.g., the public endpoints exempted in index.ts:168-174) it is actually `undefined`. Every AI route is mounted after the bearerAuth dispatcher so this is currently safe; however the `as number` cast convention is missing in 11 of 12 sites — TypeScript silently accepts `undefined` flowing into `withBudgetTracking(userId, …)` and would write `null` user_id to the FK column, triggering the catch-and-log path.

3. **Token-cost undercount**: `withBudgetTracking` only sums `input_tokens + output_tokens`. The Anthropic SDK Usage type also exposes `cache_creation_input_tokens` and `cache_read_input_tokens` (both billed, see `node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:663-667`). For any model with prompt caching the watermark systematically underestimates spend, defeating the cap.

4. **GUARD-04 drift detector races migration system**: `npx drizzle-kit generate` writes files into `drizzle/` by default. The test asserts on stdout "No schema changes" but if the schema HAS drifted, the test fails AND the drift detector itself creates a new migration file in the source tree. CI then has an uncommitted file. This is a destructive side effect of a read-style assertion.

Plus seven quality warnings (signature widening leaves `userId` un-asserted in routes, `getAIClientFn?: () => any` in brief-assembly DI surface, code duplication of `TRIAGE_SYSTEM_PROMPT` between process-audio and triage, etc.) and four info items.

## Critical Issues

### CR-01: `requireAiBudget` pre-flight gate is missing from 9 of 11 AI route paths — budget cap is non-binding on most endpoints

**File:** `vigil-core/src/routes/insights.ts:33-98`, `vigil-core/src/routes/describe-image.ts:16-76`, `vigil-core/src/routes/therapy.ts:62-114,131-238,254-351`, `vigil-core/src/routes/triage.ts:50-95`, `vigil-core/src/routes/process-photo.ts:298-411`, `vigil-core/src/routes/affirmation.ts:37-95`, `vigil-core/src/routes/prioritize.ts:59-123`, `vigil-core/src/routes/thoughts.ts:330-356`, `vigil-core/src/services/brief-assembly-service.ts:340-475`

**Issue:** Per the locked invariants in `vigil-core/src/lib/ai-budget.ts:32-37`:

> Route handlers MUST call `await requireAiBudget(c.get("userId"))` AFTER bearerAuth (which sets `userId` on the context) and BEFORE any AI-incurring work.

A repo-wide grep for `requireAiBudget` shows only two production call sites (`chat.ts:32`, `process-audio.ts:53`). The remaining nine AI-touching routes and the three brief-assembly helpers (`fetchAffirmation`, `fetchPrioritization`, `fetchInsights`) all skip the gate. The `withBudgetTracking` wrapper still accumulates spend AFTER the call, so the daily watermark continues to climb correctly, but the cap is only enforced on `/v1/chat` and `/v1/process-audio`. A user past the cap can still burn arbitrary Anthropic dollars via `/v1/triage`, `/v1/insights`, `/v1/describe-image`, the three `/v1/therapy/*` endpoints, `/v1/process-photo`, `/v1/affirmation`, `/v1/prioritize`, the auto-triage fire-and-forget on POST `/v1/thoughts`, and every brief generated by the scheduler. The cap-enforcement contract documented in `ai-budget.ts` and the PWA error-code message (`api-error-codes.ts:158-160` — "You've hit today's AI processing limit") is therefore misleading: AI features do NOT actually stop at the cap on the majority of endpoints.

There is no drift detector pinning the `requireAiBudget` coverage either — `client.test.ts` only enforces the `withBudgetTracking` wrap pattern.

**Fix:** Add `await requireAiBudget(userId);` after `c.get("userId")` and the `getAIClient()` 503 check in each of the nine routes, and once at the top of `assembleAndRender(dateStr, userId)` in `brief-assembly-service.ts`. Mirror the chat.ts:32 placement. Then ship a drift detector mirroring `client.test.ts` — source-grep `requireAiBudget(userId)` count must be ≥ 11 across `routes/` + `services/`:

```typescript
// vigil-core/src/routes/insights.ts (and the 8 other sites)
insights.post("/insights", async (c) => {
  if (!getAIClient()) {
    return c.json({ error: "AI service unavailable" }, 503);
  }
  if (!db) return c.json({ error: "Database not available" }, 503);

  const userId = c.get("userId");
  await requireAiBudget(userId);  // ← ADD: pre-flight gate
  // ... rest unchanged
});
```

```typescript
// vigil-core/src/__tests__/budget-gate-coverage.test.ts (new drift detector)
it("every AI route calls requireAiBudget(userId) before callClaude*", () => {
  const required = [
    "routes/insights.ts", "routes/describe-image.ts", "routes/therapy.ts",
    "routes/triage.ts", "routes/process-photo.ts", "routes/affirmation.ts",
    "routes/prioritize.ts", "routes/thoughts.ts", "routes/chat.ts",
    "routes/process-audio.ts", "services/brief-assembly-service.ts",
  ];
  for (const f of required) {
    const src = readFileSync(path.join(ROOT, f), "utf8");
    assert.match(src, /await\s+requireAiBudget\(/, `${f} must call requireAiBudget`);
  }
});
```

---

### CR-02: `withBudgetTracking` does not account for `cache_creation_input_tokens` / `cache_read_input_tokens` — watermark undercounts spend whenever prompt caching is active

**File:** `vigil-core/src/lib/ai-budget.ts:218-228`

**Issue:** The generic constraint on `withBudgetTracking` is:

```typescript
T extends {
  usage?: { input_tokens?: number; output_tokens?: number };
}
```

and the math reads:

```typescript
const input_tokens = response.usage?.input_tokens ?? 0;
const output_tokens = response.usage?.output_tokens ?? 0;
const usd = computeUsd(input_tokens, output_tokens, "claude-sonnet-4");
```

But the Anthropic SDK's `Usage` shape (verified live in `vigil-core/node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts:663-675`) carries four token counters:

```typescript
cache_creation_input_tokens: number | null;
cache_read_input_tokens: number | null;
input_tokens: number | null;
output_tokens: number;
```

The Anthropic docstring at line 649 makes this explicit: "Total input tokens in a request is the summation of `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`."

Cache-write tokens bill at $3.75/1M (1.25x input) and cache-read tokens bill at $0.30/1M (0.1x input) on Sonnet 4. When the scheduler regenerates a brief and reuses a cached prompt, the accumulator captures only the uncached delta — the watermark systematically lags real spend. The same applies to any future call site that opts into the prompt-caching beta. The cap (default $0.50/day) is therefore a soft ceiling, not the documented hard cap.

Also: `input_tokens` is `number | null` in the SDK type but the wrapper's generic constraint allows it to be `undefined`, not `null`. Today `null` is coerced via `??` (truthy fallback for both), but TypeScript would not catch a future SDK that emits `null` if the wrapper's constraint tightened.

**Fix:**

```typescript
// vigil-core/src/lib/ai-budget.ts

const CACHE_WRITE_PRICE_PER_TOKEN = 3.75 / 1_000_000;  // Sonnet 4 cache-creation rate
const CACHE_READ_PRICE_PER_TOKEN  = 0.30 / 1_000_000;  // Sonnet 4 cache-read rate

function computeUsd(
  input_tokens: number,
  output_tokens: number,
  cache_creation_input_tokens: number = 0,
  cache_read_input_tokens: number = 0,
  _model: string = "claude-sonnet-4",
): number {
  return (
    input_tokens * INPUT_PRICE_PER_TOKEN +
    output_tokens * OUTPUT_PRICE_PER_TOKEN +
    cache_creation_input_tokens * CACHE_WRITE_PRICE_PER_TOKEN +
    cache_read_input_tokens * CACHE_READ_PRICE_PER_TOKEN
  );
}

export async function withBudgetTracking<
  T extends {
    usage?: {
      input_tokens?: number | null;
      output_tokens?: number;
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };
  },
>(userId: number, fn: () => Promise<T>): Promise<T> {
  const response = await fn();
  try {
    const u = response.usage;
    const input_tokens  = u?.input_tokens  ?? 0;
    const output_tokens = u?.output_tokens ?? 0;
    const cache_write   = u?.cache_creation_input_tokens ?? 0;
    const cache_read    = u?.cache_read_input_tokens     ?? 0;
    const usd = computeUsd(input_tokens, output_tokens, cache_write, cache_read);
    // ... rest unchanged
```

Update `__computeUsdForTest` re-export and `ai-budget.test.ts` Test 7 to cover the four-counter math.

---

### CR-03: `c.get("userId")` is `undefined` for routes that bypass bearerAuth — the `userId: number` cast across 12 sites would write `null` user_id to ai_usage_daily under any future mount-order regression

**File:** `vigil-core/src/routes/affirmation.ts:41`, `vigil-core/src/routes/chat.ts:20`, `vigil-core/src/routes/describe-image.ts:22`, `vigil-core/src/routes/insights.ts:14,41`, `vigil-core/src/routes/process-audio.ts:45`, `vigil-core/src/routes/process-photo.ts:299`, `vigil-core/src/routes/therapy.ts:21,66,141,264`, `vigil-core/src/routes/triage.ts:54` — and the ContextVariableMap declaration at `vigil-core/src/middleware/auth.ts:11-15`

**Issue:** The Hono `ContextVariableMap` is augmented in `middleware/auth.ts:12-14`:

```typescript
declare module "hono" {
  interface ContextVariableMap {
    userId: number;
  }
}
```

This tells TypeScript that `c.get("userId")` returns `number`. But the actual runtime value is set only by the bearerAuth dispatcher inside `auth.ts` — for paths exempted at `index.ts:168-174` (health, login, register, forgot-password, reset-password, verify-email, OAuth callback), the value is `undefined`. The type system lies. `index.ts:285` itself relies on this:

```typescript
const userId = (c.get("userId") as number | undefined) ?? null;
```

— the explicit `as number | undefined` cast confirms the maintainers know the runtime can be `undefined`. But the 12 Phase 127-touched route handlers all do:

```typescript
const userId = c.get("userId");          // typed as number, runtime might be undefined
await requireAiBudget(userId);            // chat.ts only
await callClaude({ ..., userId });        // 11 other sites
```

If any AI route is ever mounted before the bearerAuth dispatcher (a real-world risk — index.ts has 14 protected route mounts after auth and 4 public routes before, all relying on developer discipline), `userId` becomes `undefined`, `requireAiBudget(undefined as number)` issues `WHERE user_id = NULL` (matches nothing — accidental pass), and `withBudgetTracking(undefined as number, ...)` issues `INSERT INTO ai_usage_daily (user_id, ...) VALUES (NULL, ...)` which fails the NOT NULL constraint — catch-and-log silently swallows it, and the spend is never tracked for that user. The cap is silently disabled until someone reads the server logs.

The drift detector at `client.test.ts` checks that the wrapper signature requires `userId: number`, but does NOT check that route handlers narrow the type or use the explicit-cast convention from `index.ts:285`. Phase 109's existing precedent in `prioritize.ts:64` is the correct shape:

```typescript
const userId = c.get("userId") as number;  // explicit narrowing
```

— but `prioritize.ts` is the only Phase 127-touched file that uses it. The other 11 sites rely on the augmented type alone.

**Fix:** Either (a) tighten the ContextVariableMap declaration to `userId: number | undefined` and force every route to narrow it before use, or (b) add an explicit `as number` cast at each Phase 127-touched extraction site, matching the prioritize.ts:64 precedent. Option (b) is the lower-blast-radius fix:

```typescript
// 11 sites — pattern repeats
const userId = c.get("userId") as number;  // ← ADD `as number`
```

Then ship a drift detector matching `client.test.ts` style:

```typescript
it("every Phase 127-touched route narrows c.get('userId') via 'as number' cast", () => {
  const routes = ["affirmation", "chat", "describe-image", "insights",
                  "process-audio", "process-photo", "therapy", "triage"];
  for (const r of routes) {
    const src = readFileSync(path.join(ROOT, "routes", `${r}.ts`), "utf8");
    assert.match(
      src,
      /c\.get\("userId"\)\s+as\s+number/,
      `${r}.ts must narrow c.get("userId") via "as number" cast (matches index.ts:285 precedent)`,
    );
  }
});
```

Preferred long-term fix: change the ContextVariableMap augmentation to express the runtime reality, accept the TS error storm, and add explicit narrow-or-throw guards in protected handlers.

---

### CR-04: `migration-drift.test.ts` shells out to `npx drizzle-kit generate` which WRITES new migration files into the source tree on drift — a "read-style" CI assertion with destructive side effects

**File:** `vigil-core/src/__tests__/migration-drift.test.ts:51-74`

**Issue:** The drift detector asserts on `drizzle-kit generate` stdout matching `/No schema changes/i`. But `drizzle-kit generate` is the same command that writes new migration files to `drizzle/` — when schema.ts has actually drifted (the failure mode this test is designed to catch), running this test:

1. Generates a new migration file `drizzle/0021_*.sql` AS A SIDE EFFECT.
2. Asserts on stdout — fails.
3. Leaves the new file dirty in the git working tree.

On CI this means a schema-drift failure also pollutes the workspace with an uncommitted file in `drizzle/`. On developer machines running the test, the same happens. If the developer then runs `npm test` again, the drift detector now PASSES because the new file makes drizzle-kit report "No schema changes" — the test becomes self-healing and stops detecting future drift. The "Re-run safe" comment in `drizzle/0020_add_ai_usage_daily.sql:15-16` does not apply to migration files that the test itself silently created.

The test's header comment at line 25 acknowledges the test "never touches the DB" — but it elides the FS write side-effect. The CI workflow would need a `git diff --exit-code drizzle/` step to catch this, but none of the planning artifacts mention adding one.

**Fix:** Two options, both required:

1. Use `drizzle-kit check` (the read-only diff command — see drizzle-kit CLI docs) instead of `generate`. `check` compares schema.ts against drizzle/ snapshots without writing anything.

2. If `check` is unavailable on `drizzle-kit@0.31.10` (per RESEARCH §A2's verified-live notes the team should confirm), wrap `generate` with a workspace snapshot/restore:

```typescript
const before = readdirSync(join(VIGIL_CORE_ROOT, "drizzle"));
try {
  const out = execSync("npx drizzle-kit generate", { /* ... */ });
  assert.match(out, /No schema changes/i, /* ... */);
} finally {
  const after = readdirSync(join(VIGIL_CORE_ROOT, "drizzle"));
  for (const f of after) {
    if (!before.includes(f)) {
      // Delete any file drizzle-kit just wrote
      unlinkSync(join(VIGIL_CORE_ROOT, "drizzle", f));
    }
  }
}
```

The snapshot/restore version is order-dependent and racy across parallel test runs — `drizzle-kit check` is the right answer if it exists in the pinned version.

---

## Warnings

### WR-01: `withBudgetTracking` swallows BOTH the budget INSERT failure AND any error from `fn()` itself if the catch block is reached — the response is returned even when the upstream call failed

**File:** `vigil-core/src/lib/ai-budget.ts:222-246`

**Issue:** The function shape is:

```typescript
const response = await fn();   // ← throws propagate naturally (good)
try {
  const usd = computeUsd(...);
  if (usd > 0 && db) {
    await db.execute(sql`INSERT ... ON CONFLICT ...`);
  }
} catch (err) {
  console.error("[vigil-core] withBudgetTracking accumulator failed (non-fatal):", ...);
}
return response;
```

If `computeUsd` ever throws (e.g., a future Anthropic SDK response shape that returns `Infinity` tokens — not impossible, vendor APIs misbehave), the catch swallows it and the accumulator silently skips. Same for any future code that gets added inside the try-block that needs to throw. The catch is too wide for the comment's stated intent ("INSERT failure is non-fatal" — only the INSERT). The `Number.isFinite` guard against negative cap (`ai-budget.ts:141`) shows the team thinks about this defensively for `readCapUsd`, but not for `computeUsd` here.

**Fix:** Narrow the try-block to the INSERT only:

```typescript
const response = await fn();
const input_tokens = response.usage?.input_tokens ?? 0;
const output_tokens = response.usage?.output_tokens ?? 0;
const usd = computeUsd(input_tokens, output_tokens, "claude-sonnet-4");
if (usd > 0 && db) {
  try {
    await db.execute(sql`INSERT INTO ai_usage_daily ...`);
  } catch (err) {
    console.error("[vigil-core] withBudgetTracking accumulator failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}
return response;
```

---

### WR-02: `app-on-error.test.ts` is a hand-rolled MIRROR of the production handler, not an exercise of it — mirror drift is silent

**File:** `vigil-core/src/__tests__/app-on-error.test.ts:45-92`

**Issue:** The test header (lines 22-29) explicitly notes:

> Strategy: build a FRESH Hono instance with the EXACT same `app.onError` body as production (lines 265-298 of index.ts), and inject mock spies as the "capture" functions. Mirror with care: if the production handler body changes, this test's mirror must be updated too — that is the intended drift-detection signal (the test's RED is the cue to verify the production change is intentional).

But there is NO automated comparison between the mirror and the production handler. If a future planner edits `index.ts:266-299` to, say, REMOVE the DailyBudgetExceededError branch entirely (regressing Pitfall 5), the mirror in `app-on-error.test.ts:69-89` keeps the branch — test passes, prod regresses. The "intended drift-detection signal" relies on the future planner manually re-reading the test file's mirror, which is exactly the manual-discipline pattern Phase 127's other drift detectors are designed to replace.

This is the same anti-pattern that other Phase 127 detectors avoid: `audio-log-redaction.test.ts` greps the actual production source for `beforeSend`; `client.test.ts` greps for `withBudgetTracking(userId,`. The app.onError handler is a one-liner branch — it can be source-grepped just as readily.

**Fix:** Replace the hand-rolled mirror with a source-grep drift detector that pins the literal branch in `index.ts`:

```typescript
it("index.ts app.onError contains the DailyBudgetExceededError branch BEFORE captureException", () => {
  const src = readFileSync(path.join(ROOT, "index.ts"), "utf8");
  const onErrorIdx = src.indexOf("app.onError(");
  const captureIdx = src.indexOf("captureException(userId,", onErrorIdx);
  const budgetBranchIdx = src.indexOf("DailyBudgetExceededError", onErrorIdx);
  assert.ok(budgetBranchIdx !== -1, "DailyBudgetExceededError branch must exist in app.onError");
  assert.ok(
    budgetBranchIdx < captureIdx,
    "DailyBudgetExceededError branch MUST appear BEFORE captureException — Pitfall 5 lock",
  );
  // Also pin the 429 status and code literal:
  const slice = src.slice(budgetBranchIdx, captureIdx);
  assert.match(slice, /429/);
  assert.match(slice, /DAILY_AI_BUDGET_EXCEEDED/);
});
```

Keep the existing hermetic Hono-fetch test if desired — but as a behavior assertion, not the structural lock.

---

### WR-03: `brief-assembly-service.ts` has 8 `any` types in the budget-touched signature — the GUARD-03 widening did not propagate type safety into the DI surface

**File:** `vigil-core/src/services/brief-assembly-service.ts:44,54-55,276,290,304,318,479,504`

**Issue:** The Phase 127 widening at line 42 correctly types `callClaudeFn`:

```typescript
callClaudeFn?: (opts: { system: string; userMessage: string; maxTokens: number; userId: number }) => Promise<string>;
```

But the surrounding DI surface still uses `any`:

```typescript
getAIClientFn?: () => any;              // line 44
_workOrderRows?: any[];                 // line 54
_workOrderStatusRows?: any[];           // line 55
async function fetchTaskThoughts(db: any, ...)        // line 276
async function fetchRecentThoughts(db: any, ...)      // line 290
async function fetchUnprocessedThoughts(db: any, ...) // line 304
async function fetchWorkOrdersWithStatus(db: any, ...) // line 318
async function getUserTimezone(db: any, ...)          // line 479
async function getUserSportsSelections(db: any, ...)  // line 504
```

The `db: any` allows the helpers to call `.where(...)`, `.from(...)`, `.select(...)`, etc. with no type-checking — if a future refactor changes the Drizzle query builder signature (or accidentally passes a string instead of a column reference), the test suite catches it only at runtime via integration tests. The brief-assembly-service is the single largest AI-spend consumer (3 callClaude calls per brief × N users via the scheduler) — a typo in the userId-scoping filter here would be a cross-user data leak that bypasses the W-01 lock in cross-user-isolation.test.ts (the integration test doesn't exercise the scheduler path).

Out-of-scope for v1 review (CR-01 covers the same files for the higher-severity issue), but this is the type-safety subset of the same problem. Phase 127 advertises "widening the wrapper signature" but stopped at the entrypoint.

**Fix:** Type the `db` parameter as `PostgresJsDatabase<typeof schema>` (the project's own type from line 26):

```typescript
async function fetchTaskThoughts(
  db: PostgresJsDatabase<typeof schema>,
  start: Date,
  end: Date,
  userId: number,
): Promise<BriefThought[]> {
  // ...
}
```

`getAIClientFn?: () => any` — replace with `() => Anthropic | null` from the SDK. `_workOrderRows`/`_workOrderStatusRows` — leave as `any[]` if they truly carry shapeshifting test fixtures, but at minimum narrow to `Array<typeof workOrdersTable.$inferSelect>`.

---

### WR-04: `requireAiBudget` numeric parsing uses `Number(rows[0]?.usd)` which silently converts non-numeric strings to NaN, then NaN >= cap is false — Postgres returning a malformed numeric would let a user past the cap

**File:** `vigil-core/src/lib/ai-budget.ts:189-190`

**Issue:**

```typescript
const current = rows[0]?.usd ? Number(rows[0].usd) : 0;
if (current >= cap) throw new DailyBudgetExceededError(userId, current);
```

`drizzle-orm/postgres-js` returns `numeric(12,6)` columns as a string (correctly noted in the comment at lines 173-176). `Number("abc")` returns NaN; `NaN >= 0.5` is `false`. If a future Postgres extension, custom type, or a corrupted row returns a malformed numeric string, the cap silently lifts for that user. This is unlikely with Postgres's strict numeric type — but the helper's whole purpose is defensive cap enforcement, and `Number.isFinite` is already used at line 141 for `readCapUsd`. Inconsistent defensive shape.

Also: `rows[0]?.usd ? Number(...) : 0` treats the string `"0"` as falsy (the `0` case actually works because the `: 0` branch returns 0), so this happens to be correct, but only by coincidence. The truthy check on a numeric string is the wrong test — `"0.0"` is truthy, `"0"` is truthy, but `"" ` is falsy. The intended semantic is "row exists" not "spend is non-zero".

**Fix:**

```typescript
const rawUsd = rows[0]?.usd;
const parsed = rawUsd === undefined ? 0 : Number(rawUsd);
if (!Number.isFinite(parsed)) {
  // Defensive: malformed numeric → log + assume hit-cap (fail-closed)
  console.error(`[vigil-core] requireAiBudget: malformed usd_estimate for user ${userId}: ${rawUsd}`);
  throw new DailyBudgetExceededError(userId, NaN);  // fail-closed
}
if (parsed >= cap) throw new DailyBudgetExceededError(userId, parsed);
```

Fail-closed semantics match the rest of the codebase (e.g., the JWT_SECRET guard at index.ts:72-75 exits the process; this throws a recoverable error).

---

### WR-05: GUARD-04 drift detector relies on `DATABASE_URL=postgres://noop@localhost/noop` env override — drizzle-kit may resolve this differently in future versions, masking real schema drift

**File:** `vigil-core/src/__tests__/migration-drift.test.ts:52-58`

**Issue:** The test uses a placeholder `DATABASE_URL` to satisfy `drizzle.config.ts`'s config load. Per the inline comment (lines 19-22, citing RESEARCH §A4) `drizzle-kit generate` never touches the DB. This is verified for `drizzle-kit@0.31.10` (RESEARCH §A2). But a future drizzle-kit version that ADDS a DB roundtrip during `generate` (e.g., to fetch the live schema for comparison) would:

1. Open a Postgres connection to `localhost:5432/noop`.
2. Get ECONNREFUSED on CI.
3. The test fails with a connection error, NOT a "schema drifted" error.
4. CI is broken until someone investigates — and the failure message points to "noop" rather than the real schema issue.

The 10s timeout (line 49) plus the assumption that "no DB roundtrip" stays true in perpetuity is brittle.

**Fix:** Add an upper-bound version constraint and an explicit assertion that the failure modes are distinguished:

```typescript
const out = execSync("npx drizzle-kit generate", { /* ... */ }).toString();
// If drizzle-kit ever starts connecting to the DB, the exec will fail with
// ECONNREFUSED — surface that as a distinct failure, not as "schema drift".
// (Wrap in try/catch with branch on err.message containing "ECONNREFUSED")
```

And pin `drizzle-kit` to a tight range in `package.json` so a future version upgrade is intentional.

Additionally consider preferring `drizzle-kit check` if/when it lands in the project's drizzle-kit version — see CR-04 for the same root cause.

---

### WR-06: `withBudgetTracking` in process-audio.ts wraps `ai.beta.messages.create` BUT not `ai.beta.files.upload` — file upload IS billed to Anthropic and silently bypasses tracking

**File:** `vigil-core/src/routes/process-audio.ts:100,109-133`

**Issue:** The route uploads audio bytes via `ai.beta.files.upload({ file })` (line 100), then references the file in `ai.beta.messages.create`. Only the `messages.create` is wrapped in `withBudgetTracking` (line 109-133). The inline comment at lines 106-108 explicitly claims:

> `ai.beta.files.upload` above is NOT wrapped — file upload is not token-billed (Anthropic billing surface).

This claim is unverified — the comment doesn't cite the Anthropic billing docs version, and the `beta.files` API is still in beta. The Files API on Anthropic's pricing page (verify against the current docs at https://docs.claude.com/en/docs/build-with-claude/files) does mention storage cost but the team should confirm the "no upload billing" assumption. If wrong, audio uploads up to ~10 MB are silently consumed without watermark contribution.

This is also the only place in Phase 127 where a route explicitly opts a specific Anthropic call OUT of `withBudgetTracking` — a precedent that future planners may copy without re-verifying the billing assumption.

**Fix:** (a) Verify the upload-billing claim against Anthropic's current pricing documentation; (b) annotate with the verification date + URL, matching the verification-comment style in `lib/sentry.ts:62`. If upload is in fact billed, replace the unwrapped call with `withBudgetTracking(userId, () => ai.beta.files.upload(...))` — but note that `beta.files.upload`'s response shape may not match the `Usage` interface, requiring either an SDK-shape fork in withBudgetTracking or a separate accumulator helper.

---

### WR-07: `__readCapUsdForTest` is exported with `__` prefix as a test-only marker — but is reachable from production imports via simple `import { __readCapUsdForTest } from ...`

**File:** `vigil-core/src/lib/ai-budget.ts:147-160`

**Issue:** The convention comment at lines 152-158:

> The `__` prefix marks these as test-only entry points the rest of the codebase MUST NOT import from production paths (CONTEXT D-03 Claude's Discretion naming convention). No linter enforces this — the convention is "if a non-test caller imports a `__`-prefixed name, you have a bug."

This is documentation-only. A typo in a future plan ("use `__computeUsdForTest` directly so the prod path stays untouched") would compile and ship. The phase-127 README celebrates drift detectors as the structural answer to "people forget the rules"; this convention is the exact pattern that drift detectors exist to replace.

**Fix:** Either (a) accept the documentation-only enforcement (current state, but mark it as accept in the SUMMARY for future planners), or (b) add an ESLint custom rule:

```js
// .eslintrc — disallow __ prefix imports from non-test files
{
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["**/lib/ai-budget*"],
        importNames: ["__computeUsdForTest", "__readCapUsdForTest"],
        message: "Test-only exports — use requireAiBudget/withBudgetTracking instead",
      }],
    }],
  },
  overrides: [{
    files: ["**/*.test.ts"],
    rules: { "no-restricted-imports": "off" },
  }],
}
```

Or move the test-only helpers to a separate `ai-budget.testing.ts` module that is git-ignored from the production build path.

---

## Info

### IN-01: `TRIAGE_SYSTEM_PROMPT` is duplicated verbatim between `routes/triage.ts:7-20` and `routes/process-audio.ts:14-27`

**File:** `vigil-core/src/routes/triage.ts:7-20`, `vigil-core/src/routes/process-audio.ts:14-27`

**Issue:** The 13-line `TRIAGE_SYSTEM_PROMPT` literal exists in both files. The triage.ts version is exported at module-scope (line 7); process-audio.ts redefines it as a module-private const (line 14). Process-audio.ts already imports `callClaude` from `../ai/client.js` and could just as easily import `TRIAGE_SYSTEM_PROMPT` from `../routes/triage.js` (or better, from a shared `prompts/triage-prompt.ts`). Pre-existing, not Phase 127-introduced, but Phase 127 touched both files for userId-threading and could have closed it.

**Fix:** Move the prompt to `vigil-core/src/ai/prompts.ts` (or similar) and import from both routes.

---

### IN-02: `audio-cap.ts` is shipped with ZERO callers — the helper is greenfield and untested against any real route

**File:** `vigil-core/src/lib/audio-cap.ts`

**Issue:** The header comment (lines 6-9) acknowledges:

> Phase 127 ships the helper with ZERO callers — Phase 130 VOICE-02 (push-to-record gesture handler) is the first consumer.

The audio-cap.test.ts suite is solid (boundary at the cap, +1 over cap, empty string), but the helper has no production integration test. When Phase 130 wires the helper into `/v1/voice/transcribe`, an integration regression like "the helper is called AFTER decode rather than before" would slip through unit tests. Acceptable for a structural pre-spike guardrail, but the team should ensure Phase 130's integration test exercises the cap rejection path end-to-end.

**Fix:** Add a TODO comment at the top of `audio-cap.ts` referencing the Phase 130 plan ID that must integrate the helper, so the helper-without-caller state surfaces in a search for unconnected modules.

---

### IN-03: `BLOCKED_PROPERTY_NAMES` denylist parity is enforced by a Vitest test AND a `.mjs` sibling script — both run "the same diff" but maintain separate copies of `extractBlockedNames`

**File:** `vigil-pwa/src/__tests__/denylist-parity.test.ts:53-73`, `vigil-pwa/scripts/denylist-parity-ci.mjs:44-63`

**Issue:** The two extractor implementations are visually identical but maintained in parallel. If a future planner updates one (e.g., to tolerate trailing-comma differences), the other silently drifts. The Vitest test's header explicitly cites the .mjs script as a "defense-in-depth" sibling, but the two could share extraction logic from a `scripts/extract-denylist.mjs` ESM module imported by both.

Pre-existing pattern in the codebase (multiple drift detectors with shared logic), low priority.

**Fix:**

```js
// vigil-pwa/scripts/extract-denylist.mjs (shared)
export function extractBlockedNames(src) { /* ... */ }
```

Import from both the .mjs script (via `import`) and the Vitest test (via `import` — .ts can import .mjs).

---

### IN-04: `Number.parseFloat("5")` followed by `assert.equal(__readCapUsdForTest(), 5)` in `ai-budget.test.ts:96-101` is technically fragile — `parseFloat` returns `5` (number) but TS strict-equality on `number === 5` is brittle if the test fixture changes

**File:** `vigil-core/src/lib/ai-budget.test.ts:96-101`

**Issue:** Cosmetic. The test passes today because `Number.parseFloat("5") === 5`. If the cap is ever switched to a numeric type that requires explicit `.toFixed()` rounding (e.g., the Decimal.js library), the equality check breaks. Use `assert.equal(__readCapUsdForTest(), 5.0)` to make the floating-point intent explicit.

**Fix:** Trivial — write the integer cap as `5.0` to signal float-equality intent.

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
