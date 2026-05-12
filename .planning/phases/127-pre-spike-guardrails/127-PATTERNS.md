# Phase 127: Pre-spike guardrails — Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 23 (10 new, 13 modified)
**Analogs found:** 23 / 23 (every file has a close in-repo precedent)

**Key invariant the planner MUST preserve from RESEARCH.md:**
GUARD-04 is **re-scoped** — the four `work_orders` drift columns already landed in `vigil-core/drizzle/0013_work_orders_drift_repair.sql:6-12`. Do NOT write `0020_reconcile_work_orders_107_1.sql`. The `0020` slot is reserved for `ai_usage_daily` (GUARD-03 storage). The drift-detector test is the *only* GUARD-04 deliverable, plus a `STATE.md:389` cleanup.

---

## File Classification

| File | Status | Role | Data Flow | Closest Analog | Match Quality |
|------|--------|------|-----------|----------------|---------------|
| `vigil-core/src/lib/audio-cap.ts` | NEW | utility (pure) | pure (validation) | `vigil-core/src/routes/process-audio.ts:58-62` (MAX_AUDIO_B64_CHARS) | role-match (pattern only — first dedicated cap helper) |
| `vigil-core/src/lib/audio-cap.test.ts` | NEW | test (unit, pure) | pure | `vigil-core/src/lib/quiet-mode-suppression.test.ts` | exact (node:test, pure-helper) |
| `vigil-core/src/lib/ai-budget.ts` | NEW | service (gate + helper) | DB read | `vigil-core/src/lib/sentry.ts` (env-gate + module-state) + `vigil-core/src/lib/quiet-mode-suppression.ts` (in-memory state) | role-match |
| `vigil-core/src/lib/ai-budget.test.ts` | NEW | test (unit) | DB stub | `vigil-core/src/lib/sentry.test.ts` (env-mutation + dynamic import) | exact (node:test, env-gated module) |
| `vigil-core/src/__tests__/audio-log-redaction.test.ts` | NEW | test (drift detector) | source-grep | `vigil-core/src/__tests__/mount-order.test.ts` | exact (fs.readFileSync source-content drift) |
| `vigil-core/src/__tests__/migration-drift.test.ts` | NEW | test (shell-out) | child_process | NO direct analog — `vigil-core/src/db/migrate.test.ts` is closest precedent | novel (shells `drizzle-kit generate`); `mount-order.test.ts` provides drift-detector outer shape |
| `vigil-core/src/__tests__/app-on-error.test.ts` | NEW (per RESEARCH Validation Architecture) | test (handler unit) | mocked Sentry/PostHog | `vigil-core/src/lib/sentry.test.ts` | role-match |
| `vigil-core/src/ai/client.test.ts` | NEW (per RESEARCH Wave 0 gaps) | test (wrapper unit) | mocked SDK + DB | `vigil-core/src/lib/quiet-mode-suppression.test.ts` | role-match |
| `vigil-core/drizzle/0020_add_ai_usage_daily.sql` | NEW | migration | DDL | `vigil-core/drizzle/0019_add_users_quiet_mode.sql` (CREATE-style adapt from 0013) | exact (hand-crafted, IF NOT EXISTS, `--> statement-breakpoint`) |
| `vigil-g2-plugin/src/lib/audio-session-guard.ts` | NEW | utility (lifecycle wrapper) | event-driven | `vigil-g2-plugin/src/lib/deduped-device-status.ts` (module shape) + `vigil-g2-plugin/src/main.ts:221-260` (`onEvenHubEvent` registration) | role-match |
| `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` | NEW | test (unit, mocked SDK) | event-driven | `vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts` | exact (node:test, mocked Even SDK enum) |
| `vigil-pwa/src/lib/sentry-redact.ts` | NEW | utility (pure) | pure (event scrub) | `vigil-core/src/analytics/posthog.ts:54-64` (`redactEvent`) | exact (pure function + before_send/beforeSend) |
| `vigil-pwa/src/lib/sentry-redact.test.ts` | NEW | test (unit, pure) | pure | `vigil-pwa/src/lib/api-error-codes.test.ts` (Vitest pattern) | role-match (Vitest runner; pure-function input/output) |
| `vigil-core/src/analytics/posthog.ts` | EDIT | service (denylist) | pure | self (extending existing Set at line 32) | self |
| `vigil-core/src/analytics/posthog.test.ts` | EDIT | test (size lock) | self | self (bump `expected.size === 8` → `14` at line 103, add 6 keys to literal Set lines 93-102) | self |
| `vigil-core/src/lib/sentry.ts` | EDIT | service (init) | event filter | `vigil-core/src/analytics/posthog.ts:54-77` (mirror `before_send: redactEvent` → `beforeSend: redactSentryEvent`) | exact |
| `vigil-core/src/lib/sentry.test.ts` | EDIT | test (unit + drift) | mocked event | self (add it-blocks per RESEARCH Pattern 1 + Pitfall 3 defensive shapes) | self |
| `vigil-core/src/ai/client.ts` | EDIT | service (SDK chokepoint) | request-response | self (wrap each `ai.messages.create` with `withBudgetTracking`) | self |
| `vigil-core/src/routes/chat.ts` | EDIT | controller | request-response | self (add `await requireAiBudget(userId)` after `c.get("userId")` at line 19) | self |
| `vigil-core/src/routes/process-audio.ts` | EDIT | controller | request-response | self (add `await requireAiBudget(userId)` after line 44 + wrap lines 82-115 `ai.beta.*` path through `withBudgetTracking` — Pitfall 4) | self |
| `vigil-core/src/index.ts` | EDIT | bootstrap (app.onError) | error funnel | self (add `DailyBudgetExceededError` branch BEFORE captureException/captureToSentry at lines 265-280 — Pitfall 5) | self |
| `vigil-core/src/db/schema.ts` | EDIT | model (Drizzle) | DDL | `vigil-core/src/db/schema.ts:244-258` (`workOrderStatuses` composite PK + `idx_*_user_id`) | exact in-file |
| `vigil-core/src/integration/cross-user-isolation.test.ts` | EDIT | test (W-01 lock) | DB | self (add `ai_usage_daily` row per Phase 121/124 D-D2 lock blocks at lines 499-585) | self |
| `vigil-pwa/src/lib/api-error-codes.ts` | EDIT | model (locked enum) | pure | self (add `AUDIO_SESSION_TOO_LONG` + `DAILY_AI_BUDGET_EXCEEDED` to EXTENSION block at line 119+) | self |
| `vigil-pwa/src/lib/api-error-codes.test.ts` | EDIT | test (locked-enum pin) | Vitest | self (mirror `AUTH-126-CODE-MAP-LOCKED-ENUM` at lines 61-78 for the two new EXTENSION keys) | self |
| `vigil-pwa/src/main.tsx` | EDIT | bootstrap (Sentry init) | event filter | `vigil-core/src/lib/sentry.ts:81-87` (add `beforeSend: redactSentryEvent` to `Sentry.init({...})` body at lines 16-20) | role-match (Browser SDK, same hook name) |
| `vigil-pwa/src/analytics/posthog.ts` | EDIT (per RESEARCH Open Q3) | service (denylist parity) | pure | `vigil-core/src/analytics/posthog.ts:32` (mirror the 14-key Set OR duplicate-with-drift-test) | exact |
| `.planning/STATE.md` | EDIT | docs | text | self (delete the stale "Phase 107.1 work_orders schema drift" carried-blocker line near line 389) | self |

---

## Pattern Assignments

### `vigil-core/src/lib/audio-cap.ts` (utility, pure)

**Analog (pattern only):** `vigil-core/src/routes/process-audio.ts:58-62` — the only existing PCM size-guard in the codebase.

**Size-guard pattern to mirror (lines 58-62 of analog):**
```typescript
// 2b. Size guard — 10 MB base64 limit
const MAX_AUDIO_B64_CHARS = Math.ceil(10 * 1024 * 1024 * 4 / 3);
if (body.audio.length > MAX_AUDIO_B64_CHARS) {
  return c.json({ error: "audio exceeds maximum size (10 MB)" }, 413);
}
```

**Concrete elements the new module must preserve:**
- `Math.ceil(BYTES * 4 / 3)` formula verbatim — base64 conversion is `ceil(n*4/3)`.
- HTTP **413** status code for "Payload Too Large" (NOT 400). Required by RESEARCH §"Phase Requirements → Test Map" `AUDIO_SESSION_TOO_LONG`.
- The constant lives at module top, exported (not inlined). Phase 130's `/v1/voice/transcribe` will import it.

**New constants (RESEARCH §Pattern + CONTEXT D-02.1):**
```typescript
// Even SDK PCM lock: 16 kHz × 16-bit LE × mono = 32 KB/s
export const MAX_PCM_BYTES = 60 * 16_000 * 2;  // 1_920_000
export const MAX_AUDIO_B64_CHARS_60S = Math.ceil(MAX_PCM_BYTES * 4 / 3); // ≈ 2_560_000
```

**Public helper signature (locked by CONTEXT D-02.1 + RESEARCH Validation):**
```typescript
// Throws or returns an Error-like discriminator; route handler then returns 413.
// (Decision: return a {ok, error?} discriminant OR throw + catch in handler.
//  Both shapes appear in the codebase; planner picks one. The locked-enum code
//  must always be "AUDIO_SESSION_TOO_LONG".)
export function assertAudioSessionWithinCap(b64: string): void
```

**Locked: HTTP body shape returned by callers** (RESEARCH §"Phase Requirements → Test Map"):
```typescript
return c.json(
  { error: "Audio session exceeds 60s cap", code: "AUDIO_SESSION_TOO_LONG" },
  413,
);
```

---

### `vigil-core/src/lib/audio-cap.test.ts` (test, unit)

**Analog:** `vigil-core/src/lib/quiet-mode-suppression.test.ts` (closest pure-helper test under `src/lib/`).

**Imports/setup pattern (lines 1-13 of analog):**
```typescript
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const { suppressionQueue } = await import("./quiet-mode-suppression.js");
```

**Elements to preserve:**
- `node:test` + `node:assert/strict` (vigil-core convention — RESEARCH §"Test Framework").
- Dynamic `await import()` (matches sentry.test.ts:30, posthog.test.ts:8 — required when test mutates `process.env` before module load).
- No top-level describe needed (use bare `test(...)` calls as in analog).

**Test cases to land (RESEARCH §"Phase Requirements → Test Map" row 7):**
- `assertAudioSessionWithinCap("a".repeat(MAX_AUDIO_B64_CHARS_60S))` — succeeds at exact boundary.
- `assertAudioSessionWithinCap("a".repeat(MAX_AUDIO_B64_CHARS_60S + 1))` — rejects (throws / returns error).
- Constant identity: `MAX_PCM_BYTES === 1_920_000`, `MAX_AUDIO_B64_CHARS_60S === 2_560_000` (literal lock — Phase 103 D-04 pattern).

---

### `vigil-core/src/lib/ai-budget.ts` (service, DB read + error class)

**Primary analog (module shape, env-gate, null-DB-no-op):** `vigil-core/src/lib/sentry.ts` (entire file).

**Env-gate pattern (sentry.ts:78-89):**
```typescript
export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;
  Sentry.init({...});
  initialized = true;
}
```

**Elements to preserve in ai-budget.ts:**
- Module-scope helper that reads env at call time (RESEARCH §A3 confirms `process.env` reads are sub-microsecond, no caching needed).
- `if (!db) return;` early-return for local-dev no-DB shape (mirrors sentry.ts `if (!dsn) return;`).
- Default constant at module top: `const DEFAULT_CAP_USD = 0.50;` (CONTEXT D-03.2).

**Error class shape (RESEARCH §Pattern 2):**
```typescript
export class DailyBudgetExceededError extends Error {
  readonly code = "DAILY_AI_BUDGET_EXCEEDED" as const;
  constructor(public readonly userId: number, public readonly usdEstimate: number) {
    super(`Daily AI budget exceeded for user ${userId} (${usdEstimate} USD)`);
    this.name = "DailyBudgetExceededError";
  }
}
```

**Elements to preserve:**
- Hard-coded literal `"DAILY_AI_BUDGET_EXCEEDED"` matches `ERROR_CODE_MAP` key verbatim (locked-enum pin).
- `extends Error` + `this.name = "DailyBudgetExceededError"` so `instanceof` matches across module boundaries (Pitfall 5 — `app.onError` branches on `err instanceof DailyBudgetExceededError`).

**Pre-flight query shape (RESEARCH §Pattern 2 + W-01 lock):**
```typescript
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { aiUsageDaily } from "../db/schema.js";

export async function requireAiBudget(userId: number): Promise<void> {
  if (!db) return;
  const cap = readCapUsd();
  const rows = await db
    .select({ usd: aiUsageDaily.usdEstimate })
    .from(aiUsageDaily)
    .where(and(
      eq(aiUsageDaily.userId, userId),                   // W-01 lock
      sql`${aiUsageDaily.usageDate} = CURRENT_DATE`,     // UTC rollover per CONTEXT D-03.6
    ));
  const current = rows[0]?.usd ? Number(rows[0].usd) : 0;
  if (current >= cap) throw new DailyBudgetExceededError(userId, current);
}
```

**Critical W-01 / Phase 121 D-D2 invariants (carried forward):**
- `eq(aiUsageDaily.userId, userId)` — every read filters by caller's userId.
- `userId` comes from caller (route handler will pass `c.get("userId")`), NEVER from body/query.

**`withBudgetTracking` accumulator (RESEARCH §Pattern 3):**
```typescript
const INPUT_PRICE_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_PRICE_PER_TOKEN = 15 / 1_000_000;

export async function withBudgetTracking<T extends { usage?: { input_tokens?: number; output_tokens?: number } }>(
  userId: number,
  fn: () => Promise<T>,
): Promise<T> {
  const response = await fn();
  try {
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const usd = inputTokens * INPUT_PRICE_PER_TOKEN + outputTokens * OUTPUT_PRICE_PER_TOKEN;
    if (usd > 0 && db) {
      await db.execute(sql`
        INSERT INTO ai_usage_daily (user_id, usage_date, usd_estimate, updated_at)
        VALUES (${userId}, CURRENT_DATE, ${usd}, NOW())
        ON CONFLICT (user_id, usage_date) DO UPDATE
          SET usd_estimate = ai_usage_daily.usd_estimate + EXCLUDED.usd_estimate,
              updated_at = NOW()
      `);
    }
  } catch (err) {
    // CONTEXT D-03.3 failure mode: telemetry, not gating. Log and continue.
    console.error("[vigil-core] withBudgetTracking accumulator failed (non-fatal):", err);
  }
  return response;
}
```

**Locked invariants (do NOT change):**
- Accumulator INSERT is **awaited** (CONTEXT Claude's Discretion #2 + RESEARCH Open Q2 recommendation).
- Failure is non-fatal — `try/catch` wraps DB write, `console.error` logs, function still returns `response`. Mirrors `analytics/posthog.ts:139-149` `trackEvent` WR-01 catch-and-log.
- `ON CONFLICT (user_id, usage_date) DO UPDATE` is atomic — never read-modify-write.
- Price constants hard-coded in source (CONTEXT D-03.3; A1 in RESEARCH flags re-verifying against Anthropic pricing page at plan time).

---

### `vigil-core/src/lib/ai-budget.test.ts` (test, unit)

**Analog:** `vigil-core/src/lib/sentry.test.ts` (entire file — env-gated module testing).

**Imports + env-mutation pattern (lines 25-45 of analog):**
```typescript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const sentryModule = await import("./sentry.js");
const { initSentry, captureToSentry } = sentryModule as {...};

const realDsn = process.env["SENTRY_DSN"];

function restoreDsn(): void {
  if (realDsn === undefined) delete process.env["SENTRY_DSN"];
  else process.env["SENTRY_DSN"] = realDsn;
}
```

**Elements to preserve:**
- Capture-restore pattern for env vars (`VIGIL_DAILY_AI_BUDGET_USD` follows the same shape).
- Dynamic import of the module-under-test AFTER env mutations.
- `describe`/`it`/`beforeEach`/`afterEach` from `node:test`.

**Test cases to land (RESEARCH §"Phase Requirements → Test Map" rows 13-14):**
- `requireAiBudget(userId)` no-DB shape returns silently when `db == null`.
- `requireAiBudget(userId)` throws `DailyBudgetExceededError` when the read returns `usd_estimate >= cap`.
- `DailyBudgetExceededError.code === "DAILY_AI_BUDGET_EXCEEDED"` (literal lock).
- `VIGIL_DAILY_AI_BUDGET_USD` env override is honored.
- `withBudgetTracking` doesn't throw when `usage` field is missing (Pitfall 9 defensive shape).
- Accumulator catch-and-log keeps `fn()` result returning successfully even on DB error.

---

### `vigil-core/src/__tests__/audio-log-redaction.test.ts` (test, drift detector — 3 rails)

**Analog:** `vigil-core/src/__tests__/mount-order.test.ts` (entire file — drift-detector pattern with `fs.readFileSync` source-string assertions).

**Setup pattern (lines 21-33 of analog):**
```typescript
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let indexSrc: string = "";

before(async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  indexSrc = fs.readFileSync(path.join(here, "..", "index.ts"), "utf8");
});
```

**Drift-detector assertion pattern (lines 36-43 of analog):**
```typescript
it("AUTH-126-MOUNT-SENTRY-BEFORE-HONO: initSentry() must precede `new Hono()` ...", () => {
  const sentryIdx = indexSrc.indexOf("initSentry()");
  const honoIdx = indexSrc.indexOf("new Hono()");
  assert.ok(
    sentryIdx !== -1 && honoIdx !== -1 && sentryIdx < honoIdx,
    `initSentry() must appear BEFORE 'new Hono()' (got sentryIdx=${sentryIdx}, honoIdx=${honoIdx}) — Phase 126 AUTH-126-04 D-LOAD-BEARING`,
  );
});
```

**Elements to preserve verbatim:**
- `import { describe, it, before } from "node:test"` — `before` (not `beforeEach`) for one-time source read.
- `path.dirname(url.fileURLToPath(import.meta.url))` — ESM-safe `__dirname` equivalent.
- `assert.ok(condition, "human-readable error message including the bad indices")` — keeps CI failures debuggable.
- Detailed error string: phase ID + rationale + raw indices (debugging signature for future drift).

**Three rails to pin (CONTEXT D-01.4):**
1. **Rail 1 — Set membership.** `dynamic import("../analytics/posthog.js")` then loop over 6 audio keys, assert each is in `BLOCKED_PROPERTY_NAMES`. Pattern from `posthog.test.ts:91-117`.
2. **Rail 2 — `Sentry.init({...})` body contains `beforeSend`.** `fs.readFileSync(path.join(here, "..", "lib", "sentry.ts"))`, find `Sentry.init({` and matching `});`, assert `/\bbeforeSend\b/` matches the slice between. Pattern from `mount-order.test.ts:36-43`.
3. **Rail 3 — Source-grep for `console.*(audio|pcm)`.** Walk `src/{routes,lib,ai,middleware}` recursively, exclude test files + denylist sources (`analytics/posthog.ts`, `lib/audio-cap.ts`, `lib/ai-budget.ts`), regex-match `/console\.(log|info|warn|error|debug)[^)\n]*(audio|pcm)/i`, fail if any match.

**Full RESEARCH-provided implementation already in `127-RESEARCH.md:457-518` — copy that into the test.**

---

### `vigil-core/src/__tests__/migration-drift.test.ts` (test, novel — shells `drizzle-kit generate`)

**Outer shell analog:** `vigil-core/src/__tests__/mount-order.test.ts` (drift-detector test layout).

**No direct analog for `child_process.execSync` shell-out** — this is novel for the vigil-core codebase. The pattern is documented in RESEARCH §Pitfall 1 + §Pitfall 10. Key implementation notes:

**CRITICAL re-scope (RESEARCH §Pitfall 1, Pitfall 2):**
- **`drizzle-kit generate --dry` IS NOT A SUPPORTED FLAG.** Do NOT use it.
- Use `drizzle-kit generate` (no flag) and parse stdout for the sentinel `No schema changes, nothing to migrate 😴`.
- A fake `DATABASE_URL=postgres://noop@localhost/noop` satisfies the config load (RESEARCH §A4 verified live).

**Implementation skeleton (locked):**
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const VIGIL_CORE_ROOT = join(here, "..", "..");

describe("GUARD-04 schema-vs-migration drift detector", () => {
  it("drizzle-kit generate reports no pending changes against current schema.ts", { timeout: 10_000 }, () => {
    const out = execSync(
      "npx drizzle-kit generate",
      {
        cwd: VIGIL_CORE_ROOT,
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgres://noop@localhost/noop" },
        encoding: "utf8",
      },
    );
    // Sentinel from RESEARCH §Pitfall 1 — verified live against drizzle-kit@0.31.10
    assert.match(
      out,
      /No schema changes/i,
      `Expected drizzle-kit generate to report 'No schema changes, nothing to migrate'.\nGot:\n${out}\n\nThis means schema.ts diverges from drizzle/ migrations. Hand-craft a new 0021+ migration before proceeding.`,
    );
  });
});
```

**Locked elements (RESEARCH §Pitfall 1 + §Pitfall 10 + §A2):**
- Regex `/No schema changes/i` (version-resilient — emoji-tolerant). NOT a literal-string compare against the exact `No schema changes, nothing to migrate 😴` sentinel.
- `{ timeout: 10_000 }` per-test option (RESEARCH §Pitfall 10 — drizzle-kit boots in ~1-3s).
- Fake `DATABASE_URL` fallback in `env:` (RESEARCH §A4: `generate` operates entirely off `schema.ts` + `drizzle/meta/*.json`).
- `cwd: VIGIL_CORE_ROOT` — drizzle-kit needs to find `drizzle.config.ts`.

---

### `vigil-core/src/__tests__/app-on-error.test.ts` (test, handler unit)

**Analog:** `vigil-core/src/lib/sentry.test.ts` (env-gated module + mocked-side-effect testing).

**Test cases to pin (RESEARCH §Pitfall 5 + §"Phase Requirements → Test Map" row 16):**
- `app.onError` (or the handler at `index.ts:265-280`) translates `DailyBudgetExceededError` to HTTP 429 with body `{error: "Daily AI budget exceeded", code: "DAILY_AI_BUDGET_EXCEEDED"}`.
- `captureToSentry` and `captureException` (PostHog) are NOT called when the error is a `DailyBudgetExceededError` (Pitfall 5 — don't burn Sentry quota on deliberate 429s).
- Other errors still flow through both sinks (existing behavior preserved).

**Mocking pattern (mirror `vigil-core/src/lib/sentry.test.ts:75-102` Error/non-Error variants).**

---

### `vigil-core/src/ai/client.test.ts` (test, NEW — wrapper unit)

**Analog:** `vigil-core/src/lib/quiet-mode-suppression.test.ts` (pure-helper test with controlled inputs).

**No tests exist today for `vigil-core/src/ai/client.ts`** (verified by file listing). This is a Wave 0 gap per RESEARCH §"Wave 0 Gaps".

**Test cases (RESEARCH §"Phase Requirements → Test Map" row 15):**
- `withBudgetTracking(userId, fn)` returns `fn()`'s response unchanged when no usage field.
- `withBudgetTracking(userId, fn)` issues the INSERT `ON CONFLICT … DO UPDATE` SQL when `usage.input_tokens / output_tokens` present.
- DB failure in accumulator is caught + logged (non-fatal — function still returns `fn()` result).
- USD math: `inputTokens × 3/1M + outputTokens × 15/1M` (literal numeric assertion per Pitfall 9 — verify the sub-cent rounding decision).

---

### `vigil-core/drizzle/0020_add_ai_usage_daily.sql` (migration, NEW)

**Analog:** `vigil-core/drizzle/0019_add_users_quiet_mode.sql` (most recent migration; same `--> statement-breakpoint` convention).

**Hand-crafted SQL pattern (0019 full body):**
```sql
-- Phase 125 (AGENT-HUD-03 / D-05): users.quiet_mode boolean for HUD DND filter.
-- D-05 explicit: "default false" — no backfill needed beyond the column DEFAULT.
-- Optional users.quiet_mode_since timestamptz carries the {since: ISO} payload
-- emitted on quiet_mode_changed SSE frames. NULL when quiet_mode = false.
--
-- Re-run safe: ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "quiet_mode" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "quiet_mode_since" timestamp with time zone;
```

**Elements to preserve verbatim:**
- Phase ID + decision-ID header comment block (1-5 lines).
- `--> statement-breakpoint` separator (Drizzle CLI convention; required for the migrator's statement splitter).
- `IF NOT EXISTS` everywhere (CONTEXT D-04.2 + RESEARCH §"Mount-order contract #3" — Railway partial-fail-on-restart safety).
- Quoted identifiers (`"users"`, `"quiet_mode"`) — drizzle convention even when unambiguous.

**Locked content (CONTEXT D-03.1 + RESEARCH §Pitfall 9 — bump `numeric(10,4)` → `numeric(12,6)`):**
```sql
-- Phase 127 GUARD-03 — ai_usage_daily table for per-user daily AI cost watermark.
-- D-03.1: composite PK (user_id, usage_date) is the W-01 cross-user-isolation
-- pattern. Daily rollover happens naturally by usage_date key (CURRENT_DATE) —
-- no cron, no nightly job.
--
-- Pitfall 9: usd_estimate is numeric(12,6), NOT numeric(10,4) per CONTEXT D-03.1.
-- Sonnet-4 micro-requests produce values like 0.000003 which round to 0 at 4
-- decimal places. Six decimals capture micro-cents losslessly.
--
-- Re-run safe: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS idempotent.

CREATE TABLE IF NOT EXISTS "ai_usage_daily" (
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "usage_date" date NOT NULL,
  "usd_estimate" numeric(12,6) NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "usage_date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_daily_date"
  ON "ai_usage_daily" ("usage_date");
```

**Critical decisions baked in (Pitfall 2 — re-scope of GUARD-04):**
- File is named `0020_add_ai_usage_daily.sql`, NOT `0020_reconcile_work_orders_107_1.sql`. The drift was already migrated in `0013`.
- `numeric(12,6)` overrides CONTEXT D-03.1's `numeric(10,4)` per RESEARCH §Pitfall 9.

**Also remember (RESEARCH §"Runtime State Inventory"):**
- `drizzle/meta/_journal.json` and `drizzle/meta/0020_snapshot.json` are auto-generated by `drizzle-kit generate`. Hand-edit only the `.sql`; let drizzle-kit produce the meta.

---

### `vigil-g2-plugin/src/lib/audio-session-guard.ts` (utility, lifecycle wrapper)

**Module-shape analog:** `vigil-g2-plugin/src/lib/deduped-device-status.ts` (closest existing `vigil-g2-plugin/src/lib/` module — module header + single exported function + closure-captured state).

**Module shape pattern (entire 25-line analog):**
```typescript
import type { DeviceStatus, DeviceConnectType } from '@evenrealities/even_hub_sdk'

/**
 * Phase 125 (G2-POLISH-08 / D-12): dedupe consecutive device-status events ...
 * D-12: helper ships in v3.8 with no live consumer. First consumer ... is a v3.9+ candidate.
 */
export function createDedupedDeviceStatusListener(
  callback: (status: DeviceStatus) => void,
): (status: DeviceStatus) => void {
  let lastSeenConnectType: DeviceConnectType | null = null
  return (status: DeviceStatus) => {
    if (status.connectType === lastSeenConnectType) return
    lastSeenConnectType = status.connectType
    callback(status)
  }
}
```

**Elements to preserve:**
- `import type { ... } from '@evenrealities/even_hub_sdk'` — Even SDK is imported, not duplicated.
- Phase + decision-ID JSDoc comment block above the export.
- Closure-captured module state (`let lastSeenConnectType`); idempotency via "if same, return early."
- No live consumer in Phase 127 (CONTEXT D-02.3 + RESEARCH §"Integration Points" — "module is created in Phase 127 but has zero callers until Phase 130 VOICE-02"). The `deduped-device-status` precedent literally documents this "helper-only ship" pattern.

**Event-handler registration analog:** `vigil-g2-plugin/src/main.ts:221-260` (the only existing `bridge.onEvenHubEvent` registration site in the codebase).

**Registration pattern from main.ts:221-260:**
```typescript
bridge.onEvenHubEvent((event) => {
  if (event.listEvent?.eventType === OsEventTypeList.CLICK_EVENT && ...) {...}
  if (event.sysEvent && bridge) {
    const eventType = event.sysEvent.eventType
    if (eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {...}
    else if (eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {...}
  }
})
```

**Elements to mirror in `safeAudioControl`'s registration block:**
- Use `event.sysEvent?.eventType` for the two exit events (`ABNORMAL_EXIT_EVENT`, `SYSTEM_EXIT_EVENT` are `OsEventTypeList` enum values).
- Named-enum import: `import { OsEventTypeList } from '@evenrealities/even_hub_sdk'` (RESEARCH §A6 — hard-coded integers `6`/`7` will silently break on SDK renumber).

**Four-exit-event registration (CONTEXT D-02.3 + RESEARCH §Pitfall 7):**
```typescript
let audioActive = false
let cleanupRegistered = false

export async function safeAudioControl(on: boolean): Promise<void> {
  if (!cleanupRegistered && on) {
    // Idempotent registration: fires once per process lifetime on the FIRST true call.
    cleanupRegistered = true

    bridge.onEvenHubEvent((ev) => {
      const t = ev.sysEvent?.eventType
      if (t === OsEventTypeList.ABNORMAL_EXIT_EVENT
       || t === OsEventTypeList.SYSTEM_EXIT_EVENT) {
        if (audioActive) { audioActive = false; bridge.audioControl(false).catch(() => {}) }
      }
    })

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        if (audioActive) { audioActive = false; bridge.audioControl(false).catch(() => {}) }
      })
    }

    // RESEARCH §Pitfall 7: setBackgroundState snapshots state for replay in a new
    // Headless WebView; onBackgroundRestore reads the snapshot and closes the mic
    // defensively if it was open at backgrounding.
    bridge.setBackgroundState("vigil-audio-guard", () => ({ audioActive }))
    bridge.onBackgroundRestore("vigil-audio-guard", (saved: unknown) => {
      const s = saved as { audioActive?: boolean }
      if (s.audioActive) {
        bridge.audioControl(false).catch(() => {})
        audioActive = false
      }
    })
  }

  audioActive = on
  await bridge.audioControl(on)
}
```

**Locked invariants:**
- Named enum constants from `@evenrealities/even_hub_sdk` (RESEARCH §A6).
- `setBackgroundState` snapshot returns `{ audioActive }` — JSON-serializable plain object only (RESEARCH §Pitfall 7).
- `onBackgroundRestore` handler IS REGISTERED ALONGSIDE `setBackgroundState` (RESEARCH §Pitfall 7 — snapshot alone doesn't auto-fire cleanup).
- Cleanup callback is idempotent — calling `audioControl(false)` when already off is a no-op at SDK level.
- `bridge.audioControl(...)` calls use `.catch(() => {})` — best-effort; mic-close failure is logged but not rethrown.

---

### `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` (test, unit)

**Analog:** `vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts` (entire file — node:test + mocked Even SDK enum).

**Imports + bare-test pattern (lines 1-14 of analog):**
```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDedupedDeviceStatusListener } from '../deduped-device-status.ts'
import { DeviceConnectType } from '@evenrealities/even_hub_sdk'
import type { DeviceStatus } from '@evenrealities/even_hub_sdk'

function makeStatus(connectType: DeviceConnectType): DeviceStatus {
  return { sn: 'TEST', connectType } as DeviceStatus
}

test('createDedupedDeviceStatusListener — 5×"none" fires once', () => {
  const calls: DeviceConnectType[] = []
  ...
})
```

**Elements to preserve:**
- `node:test` + `node:assert/strict`.
- Real `OsEventTypeList` enum import from `@evenrealities/even_hub_sdk` (per RESEARCH §A6 — use the enum, don't hard-code 6/7).
- `.ts` extension in relative import (TS-NodeNext config).
- `function makeXxx()` helper for synthesizing typed SDK objects with `as DeviceStatus` casts.
- Bare `test(name, () => { ... })` calls (no surrounding `describe`).

**Four exit-event test cases (RESEARCH §Pitfall 7 — "four independent it-blocks"):**
1. `osEvent.eventType === OsEventTypeList.ABNORMAL_EXIT_EVENT` → fake-emit, assert `bridge.audioControl(false)` was called.
2. `osEvent.eventType === OsEventTypeList.SYSTEM_EXIT_EVENT` → same assertion.
3. `window.dispatchEvent(new Event("beforeunload"))` → same assertion. (Tests run in node:test → `window` must be polyfilled or shimmed; consider `globalThis.window = { addEventListener, dispatchEvent }` minimal stub.)
4. `onBackgroundRestore` handler receives `{audioActive: true}` snapshot → assert cleanup fires.

Plus the idempotency case (CONTEXT D-02.3):
- `safeAudioControl(true)` called twice — listeners registered only once.

**Mock bridge stub pattern (locked):**
```typescript
function fakeBridge() {
  const calls: Array<{ on: boolean }> = []
  let handler: ((ev: any) => void) | null = null
  let bgStateSnapshot: (() => unknown) | null = null
  let bgRestoreHandler: ((saved: unknown) => void) | null = null
  return {
    calls,
    onEvenHubEvent: (h: (ev: any) => void) => { handler = h },
    audioControl: async (on: boolean) => { calls.push({ on }) },
    setBackgroundState: (_key: string, fn: () => unknown) => { bgStateSnapshot = fn },
    onBackgroundRestore: (_key: string, fn: (saved: unknown) => void) => { bgRestoreHandler = fn },
    fire: (ev: any) => { handler?.(ev) },
    restore: (saved: unknown) => { bgRestoreHandler?.(saved) },
    snapshot: () => bgStateSnapshot?.(),
  }
}
```

---

### `vigil-pwa/src/lib/sentry-redact.ts` (utility, pure — Browser side)

**Analog:** `vigil-core/src/analytics/posthog.ts:54-64` (`redactEvent` pure function).

**Pure function shape (lines 54-64 of analog):**
```typescript
export function redactEvent(event: EventMessage | null): EventMessage | null {
  if (!event) return event;
  const props = (event.properties ?? {}) as Record<string, unknown>;
  const route = props["route"];
  if (typeof route === "string" && SENSITIVE_ROUTES.has(route)) {
    const { request_body: _body, headers: _headers, ...rest } = props;
    return { ...event, properties: rest };
  }
  return event;
}
```

**Elements to mirror in `redactSentryEvent`:**
- Pure function — no side effects, no module state.
- Exported for unit testing (D-14 / D-15 carryforward — `Exported for tests and to make the rule grep-visible`).
- `null`-tolerant at top (`if (!event) return event;`).
- Return type matches input type (`event | null` for Sentry).

**Defensive shape (RESEARCH §Pitfall 3 — Sentry-specific):**
```typescript
// vigil-pwa/src/lib/sentry-redact.ts
import type { ErrorEvent, EventHint } from "@sentry/react";
import { BLOCKED_PROPERTY_NAMES } from "./blocked-property-names"  // see "duplicate-with-parity" note below

export function redactSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  try {
    if (!event) return event;
    const stripFromBag = (bag: unknown): void => {
      if (typeof bag !== "object" || bag === null) return;  // Pitfall 3 type-guard
      const rec = bag as Record<string, unknown>;
      for (const key of Object.keys(rec)) {
        if (BLOCKED_PROPERTY_NAMES.has(key)) delete rec[key];
      }
    };
    stripFromBag(event.extra);
    if (event.contexts) {
      for (const ctxName of Object.keys(event.contexts)) {
        stripFromBag(event.contexts[ctxName]);
      }
    }
    if (Array.isArray(event.breadcrumbs)) {
      for (const bc of event.breadcrumbs) stripFromBag(bc.data);
    }
    return event;
  } catch {
    // Pitfall 3: on internal error, return the original event unchanged
    // (non-redacted event > no event; defense-in-depth lives at source boundaries).
    return event;
  }
}
```

**Locked invariants (RESEARCH §Pitfall 3):**
- Type-guard before iterating each bag (`typeof bag !== "object" || bag === null`).
- Full `try/catch` wrapper — on throw, return original event unchanged (NOT `undefined`).
- Return type annotation `ErrorEvent | null` — never `undefined`.

**Note on `BLOCKED_PROPERTY_NAMES` source (RESEARCH §Open Q3):**
- Decision deferred to planner. Options:
  - (a) Import from `vigil-core/src/analytics/posthog.ts` (monorepo allows it).
  - (b) **Recommended:** Duplicate in `vigil-pwa/src/analytics/posthog.ts` (already has the 8 LOCKED keys — extend with 6 audio keys, mirror the parent file). Add a drift-detector test that compares both literal Sets.

---

### `vigil-pwa/src/lib/sentry-redact.test.ts` (test, Vitest)

**Analog:** `vigil-pwa/src/lib/api-error-codes.test.ts` (Vitest runner pattern).

**Imports + describe-block pattern (lines 22-28 of analog):**
```typescript
import { describe, it, expect } from 'vitest'

import { resolveApiError, ERROR_CODE_MAP } from './api-error-codes'

describe('resolveApiError + ERROR_CODE_MAP — AUTH-126-05 / D-04', () => {
  it('AUTH-126-CODE-MAP-CAPTCHA: ...', () => {
    const ux = resolveApiError({ error: 'raw', code: 'CAPTCHA_FAILED' }, 'fallback')
    expect(ux.message.toLowerCase()).toContain('captcha')
  })
})
```

**Elements to preserve:**
- Vitest (`describe`/`it`/`expect`) NOT `node:test` — PWA convention.
- File-naming `.test.ts`.

**Test cases to land (RESEARCH §"Phase Requirements → Test Map" + §Pitfall 3):**
- `redactSentryEvent({extra: {audioPcm: "x", ok: 1}, ...})` → strips `audioPcm`, preserves `ok`.
- `redactSentryEvent({contexts: {os: "primitive-string"}})` → does NOT throw (Pitfall 3 type-guard).
- `redactSentryEvent({breadcrumbs: [{data: {pcm: "..."}}]})` → strips `pcm` from breadcrumb data.
- `redactSentryEvent(null)` → returns `null`.
- Internal throw → returns original event unchanged (use a `Proxy` or getter that throws to exercise the catch).

---

### `vigil-core/src/analytics/posthog.ts` (EDIT — extend denylist)

**Self-analog:** lines 32-41 (the existing 8-key Set).

**Current state:**
```typescript
export const BLOCKED_PROPERTY_NAMES = new Set<string>([
  "content",
  "body",
  "text",
  "message",
  "description",
  "title",
  "note",
  "transcript",
]);
```

**Required edit (CONTEXT D-01.1 + RESEARCH §Pitfall 6 — adds 6 keys; size becomes 14):**
```typescript
export const BLOCKED_PROPERTY_NAMES = new Set<string>([
  // ── LOCKED as of Phase 103 D-04 ──
  "content",
  "body",
  "text",
  "message",
  "description",
  "title",
  "note",
  "transcript",
  // ── Phase 127 GUARD-01 EXTENSION — audio PCM denylist (D-01.1) ──
  "audioPcm",
  "audio_pcm",
  "pcm",
  "audio",
  "audioBuffer",
  "audio_buffer",
]);
```

**Locked invariant:** preserve the LOCKED-vs-EXTENSION comment block split — mirrors the `ERROR_CODE_MAP` lock-precedent at `vigil-pwa/src/lib/api-error-codes.ts:84-119`.

---

### `vigil-core/src/analytics/posthog.test.ts` (EDIT — bump size, add 6 keys)

**Self-analog:** lines 91-117 (existing literal-Set test).

**Current state (line 103):**
```typescript
assert.equal(BLOCKED_PROPERTY_NAMES.size, expected.size);   // size==8
```

**Required edit (RESEARCH §Pitfall 6):**
- Add the 6 audio keys to the literal `expected` Set at lines 93-102.
- Size becomes 14. Existing `assert.equal(BLOCKED_PROPERTY_NAMES.size, expected.size)` survives unchanged because both sides scale together.
- Existing `assert.ok(BLOCKED_PROPERTY_NAMES.has(name), ...)` loop covers each new key automatically.

**No new test cases needed in this file** — the `audio-log-redaction.test.ts` drift detector pins the audio-key presence specifically.

---

### `vigil-core/src/lib/sentry.ts` (EDIT — add `beforeSend: redactSentryEvent`)

**Self-analog:** lines 78-89 (current `initSentry` body) + analytics/posthog.ts:54-77 (`redactEvent` shape to mirror).

**Current state (lines 78-89):**
```typescript
export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0,
  });
  initialized = true;
}
```

**Required edits (CONTEXT D-01.2 + RESEARCH §Pattern 1):**

1. Add import at top:
```typescript
import type { ErrorEvent, EventHint } from "@sentry/node";
import { BLOCKED_PROPERTY_NAMES } from "../analytics/posthog.js";
```

2. Export the new pure function `redactSentryEvent(event, hint)` BEFORE `initSentry` (mirrors posthog.ts:54 layout — `redactEvent` defined before `posthog` singleton). Use the defensive shape from RESEARCH §Pitfall 3 (see `vigil-pwa/src/lib/sentry-redact.ts` pattern above — identical body, swap `@sentry/react` types for `@sentry/node` types).

3. Register the hook in `Sentry.init({...})`:
```typescript
Sentry.init({
  dsn,
  environment: process.env["NODE_ENV"] ?? "development",
  tracesSampleRate: 0,
  beforeSend: redactSentryEvent,  // Phase 127 GUARD-01.2 addition
});
```

**Locked invariants:**
- `beforeSend` is registered with the function reference (NOT an inline arrow) — required for the drift detector at `audio-log-redaction.test.ts` to grep `Sentry.init({...})` body for the literal `beforeSend` token.
- `redactSentryEvent` is **exported** (CONTEXT D-01.2: "Implementation is a small pure function `redactSentryEvent(event)` exported for unit testing").
- `sendDefaultPii` is NOT added (Sentry v10 default is false — preserve T-126-03-01 lock).

---

### `vigil-core/src/lib/sentry.test.ts` (EDIT — add `beforeSend` pin + redactor unit tests)

**Self-analog:** Lines 104-117 (existing `AUTH-126-SENTRY-PROPNAMES` source-grep drift detector).

**Add three new test groups:**

1. **`beforeSend` registration pin** — grep `sentry.ts` source for `beforeSend` token inside `Sentry.init({...})` body. Same pattern as `audio-log-redaction.test.ts` Rail 2.

2. **`redactSentryEvent` pure-function unit tests** — same four-shape coverage from RESEARCH §Pitfall 3:
   - Valid event with `extra: {audioPcm: "x", ok: 1}` → strips audio key, preserves `ok`.
   - Primitive `contexts.os = "string-value"` → does NOT throw (type-guard).
   - Missing `extra` field → no throw, returns event unchanged.
   - Circular `breadcrumbs[].data` → no throw (Pitfall 3 defensive catch).

3. **Defensive `try/catch` shape** — pass an event whose getter throws; assert return value is the original event reference.

---

### `vigil-core/src/ai/client.ts` (EDIT — wrap with `withBudgetTracking`)

**Self-analog:** Lines 20-90 (the three existing `callClaude*` wrappers, each calling `await ai.messages.create({...})`).

**Current state (callClaude lines 20-42):**
```typescript
export async function callClaude(options: {...}): Promise<string> {
  const ai = getAIClient();
  if (!ai) throw new Error("AI client not available");
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
  const response = await ai.messages.create({
    model,
    max_tokens: options.maxTokens,
    system: options.system,
    messages: [{ role: "user", content: options.userMessage }],
  });
  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected response type: ${block.type}`);
  }
  return block.text;
}
```

**Required edits (CONTEXT D-03.3 + RESEARCH §Pitfall 4 + §Pattern 3):**

1. **Signature widen — add `userId: number` as a new option** on each of the three `callClaude*` wrappers. Every call site currently knows `userId` (verified by `chat.ts:19` `c.get("userId")` precedent).

2. **Wrap each `ai.messages.create` call with `withBudgetTracking(userId, () => ai.messages.create(...))`** — preserves return shape (the wrapper returns `T` of the inner promise).

3. **Pitfall 4 critical fix — `process-audio.ts:82-115` calls `ai.beta.files.upload` + `ai.beta.messages.create` DIRECTLY** (bypasses the three wrappers). Two options per RESEARCH §Pitfall 4:
   - **Option B (recommended):** Add a new exported wrapper `callClaudeFile(userId, {...})` to `client.ts` that internally calls `ai.beta.files.upload` + `ai.beta.messages.create` inside `withBudgetTracking`. `process-audio.ts` then imports `callClaudeFile`.
   - **Option C (simpler):** Wrap the `beta.messages.create` block in `process-audio.ts:93-115` directly with `withBudgetTracking(userId, () => ai.beta.messages.create({...}))`.

**Drift-detector test recommended in RESEARCH §Pitfall 4 (added to Wave 0 gaps for the planner):**
- A test that greps `vigil-core/src/routes/**/*.ts` for `ai.messages.create` or `ai.beta.messages.create` and asserts every match is inside a `withBudgetTracking(...)` block.

---

### `vigil-core/src/routes/chat.ts` (EDIT — call `requireAiBudget`)

**Self-analog:** Line 19 — `const userId = c.get("userId");`.

**Required edit (CONTEXT D-03.4 + RESEARCH §Pattern 2):**
```typescript
chat.post("/chat", async (c) => {
  if (!getAIClient()) {
    return c.json({ error: "AI service unavailable" }, 503);
  }
  const userId = c.get("userId");
  await requireAiBudget(userId);   // ← Phase 127 GUARD-03.4 — throws → app.onError → 429
  // … existing logic …
});
```

**Locked invariants:**
- `requireAiBudget(userId)` is called AFTER `c.get("userId")` (it needs the value) and BEFORE any AI work (CONTEXT D-03.4 — "TOP of route handlers ... before any AI work").
- The `getAIClient()` 503 check stays BEFORE the budget check — no point checking budget if the AI client is missing.
- Throw → `app.onError` translates → 429 response. The handler does NOT catch `DailyBudgetExceededError` locally (RESEARCH §Anti-pattern).
- New import: `import { requireAiBudget } from "../lib/ai-budget.js";`.

---

### `vigil-core/src/routes/process-audio.ts` (EDIT — call `requireAiBudget` + Pitfall 4 wrap)

**Self-analog:** Line 44 — `const userId = c.get("userId");`.

**Two required edits:**

1. **Add `requireAiBudget` call at top (CONTEXT D-03.4):**
```typescript
processAudio.post("/process-audio", async (c) => {
  const userId = c.get("userId");
  await requireAiBudget(userId);   // ← Phase 127 GUARD-03.4
  // … existing body parse logic at lines 45-79 …
});
```
   Position: between `c.get("userId")` and the JSON body parse. (Order vs body parse is flexible — but BEFORE any AI client call.)

2. **Pitfall 4 — wrap the direct `ai.beta.*` path** (lines 82-115 of `process-audio.ts`):
```typescript
// Phase 127 GUARD-03.3 (Pitfall 4): wrap the direct ai.beta.messages.create
// call through withBudgetTracking so audio transcription costs accumulate
// alongside chat costs in ai_usage_daily.usd_estimate.
const response = await withBudgetTracking(userId, () => ai.beta.messages.create({
  model,
  max_tokens: 4096,
  betas: ["files-api-2025-04-14"],
  messages: [...],
}));
```

**New imports:**
```typescript
import { requireAiBudget, withBudgetTracking } from "../lib/ai-budget.js";
```

**Locked invariants:**
- `withBudgetTracking` wraps `ai.beta.messages.create` (the token-billable call), NOT `ai.beta.files.upload` (file upload doesn't bill tokens directly per RESEARCH §Pattern 3).
- The existing `await ai.beta.files.upload({file})` at line 90 stays unwrapped.
- The 10 MB size guard at lines 58-62 stays — it's for `/v1/process-audio` (legacy audio format); `/v1/voice/transcribe` will use the new `MAX_AUDIO_B64_CHARS_60S` cap (Phase 130 scope).

---

### `vigil-core/src/index.ts` (EDIT — `DailyBudgetExceededError` branch in `app.onError`)

**Self-analog:** Lines 263-281 (current `app.onError` handler).

**Current state (lines 265-281):**
```typescript
app.onError((err, c) => {
  console.error("[vigil-core] unhandled error:", err);
  const userId = (c.get("userId") as number | undefined) ?? null;
  captureException(userId, err, {
    route: c.req.path,
    method: c.req.method,
  });
  captureToSentry(userId, err, {
    route: c.req.path,
    method: c.req.method,
  });
  return c.json({ error: "Internal server error" }, 500);
});
```

**Required edit (CONTEXT D-03.4 + RESEARCH §Pitfall 5):**
```typescript
app.onError((err, c) => {
  // Phase 127 GUARD-03 (D-03.4 + Pitfall 5): DailyBudgetExceededError is a
  // deliberate business-rule 429 — must NOT sink to Sentry/PostHog (would
  // burn the 5k events/mo Sentry quota on intentional rejections).
  if (err instanceof DailyBudgetExceededError) {
    return c.json(
      { error: "Daily AI budget exceeded", code: "DAILY_AI_BUDGET_EXCEEDED" },
      429,
    );
  }

  console.error("[vigil-core] unhandled error:", err);
  const userId = (c.get("userId") as number | undefined) ?? null;
  captureException(userId, err, { route: c.req.path, method: c.req.method });
  captureToSentry(userId, err, { route: c.req.path, method: c.req.method });
  return c.json({ error: "Internal server error" }, 500);
});
```

**Locked invariants (RESEARCH §Pitfall 5):**
- Branch order matters — `instanceof DailyBudgetExceededError` check FIRST, then unconditional sink for other errors.
- HTTP 429 status code (not 503, not 500, not 400). Standard rate-limit status.
- Response body `{error, code}` shape matches `ERROR_CODE_MAP` lookup convention (PWA's `resolveApiError` reads `body.code`).
- New import: `import { DailyBudgetExceededError } from "./lib/ai-budget.js";`.

---

### `vigil-core/src/db/schema.ts` (EDIT — add `aiUsageDaily` table)

**Self-analog:** `vigil-core/src/db/schema.ts:244-258` (`workOrderStatuses` table — composite PK + index pattern, ON DELETE convention).

**Composite PK pattern (lines 244-258 of analog):**
```typescript
export const workOrderStatuses = pgTable(
  "work_order_statuses",
  {
    caseNumber: text("case_number").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("open"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.caseNumber] }),
    index("idx_work_order_statuses_user_id").on(table.userId),
  ],
);
```

**Required new export (CONTEXT D-03.1 + RESEARCH §Pitfall 9 — numeric(12,6) precision):**
```typescript
// ── ai_usage_daily table (Phase 127 GUARD-03 — per-user daily AI cost watermark) ──
// Composite PK (userId, usageDate) is the W-01 cross-user-isolation pattern.
// Daily rollover happens by usage_date = CURRENT_DATE (no cron).
// numeric(12,6) per RESEARCH §Pitfall 9 — sub-cent precision for micro-token calls.

export const aiUsageDaily = pgTable(
  "ai_usage_daily",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    usdEstimate: numeric("usd_estimate", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.usageDate] }),
    index("idx_ai_usage_daily_date").on(table.usageDate),
  ],
);
```

**Locked invariants:**
- `onDelete: "cascade"` — CONTEXT D-03.1 explicit (`ON DELETE CASCADE`). NOTE: this is DIFFERENT from `workOrderStatuses` which uses `"restrict"`. Mirror the SQL exactly.
- Composite PK `(userId, usageDate)` mirrors `(userId, caseNumber)` shape.
- `idx_ai_usage_daily_date` on `usageDate` alone (not user_id — separate from the implicit PK index).
- New imports needed in schema.ts header (lines 1-16): `numeric` and `date` from `drizzle-orm/pg-core` (check imports list).

**Verify Drizzle imports** — `date` and `numeric` are present in schema.ts imports already (line 5 imports `date`; verify `numeric` — may need adding).

---

### `vigil-core/src/integration/cross-user-isolation.test.ts` (EDIT — add `ai_usage_daily` W-01 lock)

**Self-analog:** Lines 421-455 (`work-orders isolation` test) — the closest existing in-file precedent for a CRUD-shaped scoped table.

**Required additions:**
1. **W-01 query-grep pin** — Phase 127 D-03.7 says "Add `ai_usage_daily` to … grep allowlist." The current file is a DB-integration test (live Postgres), NOT a source-grep test. The "allowlist" framing in CONTEXT refers to the test file at `vigil-core/src/__tests__/cross-user-isolation.test.ts` per CONTEXT D-03.7 — but **that file does not exist** (verified by `find`). The current test lives at `vigil-core/src/integration/cross-user-isolation.test.ts`. The planner must decide: extend the integration file, or create the source-grep file CONTEXT references.

   **Recommendation (defer to plan-phase):** Add an `ai_usage_daily isolation` test block to the existing integration file (mirrors the work-orders lock block at lines 421-455) AND add a source-grep assertion that every read on `aiUsageDaily` in `vigil-core/src/lib/ai-budget.ts` includes `eq(aiUsageDaily.userId, userId)` in its WHERE clause.

2. **Integration-style test block (mirror of lines 421-455):**
```typescript
it("ai-usage-daily isolation — userA's row never returned for userB's query", async (t) => {
  if (!DB_READY) { t.skip("DATABASE_URL required"); return; }
  const { db: d } = await import("../db/connection.js");
  const { aiUsageDaily } = await import("../db/schema.js");
  // Seed userA's daily usage row
  await d!.insert(aiUsageDaily).values({
    userId: userA.id,
    usageDate: new Date().toISOString().slice(0, 10),
    usdEstimate: "0.45",
  });
  try {
    // Read as userB — must return empty
    const rows = await d!
      .select()
      .from(aiUsageDaily)
      .where(eq(aiUsageDaily.userId, userB.id));
    assert.equal(rows.length, 0, "LEAK: ai_usage_daily query returned userA's row to userB");
  } finally {
    await d!.delete(aiUsageDaily).where(eq(aiUsageDaily.userId, userA.id));
  }
});
```

---

### `vigil-pwa/src/lib/api-error-codes.ts` (EDIT — add 2 EXTENSION keys)

**Self-analog:** Lines 119-138 (existing Phase 126 EXTENSION block).

**Current EXTENSION-block tail (line 119+):**
```typescript
  // ── EXTENSION (Phase 126; D-04 additivity grants this authority) ──
  INVALID_REQUEST: {
    message: "Please fill out all required fields and try again.",
  },
  INVALID_JSON: { ... },
  SERVER_NOT_CONFIGURED: { ... },
  INVALID_TOKEN_SUBJECT: { ... },
}
```

**Required additions (CONTEXT D-02.4 + D-03.5):**
```typescript
  // ── EXTENSION (Phase 127 GUARD-02 + GUARD-03 — D-04 additivity) ──
  AUDIO_SESSION_TOO_LONG: {
    message: "Recording is too long. Voice clips must be 60 seconds or less.",
  },
  DAILY_AI_BUDGET_EXCEEDED: {
    message: "You've hit today's AI processing limit. Capture still works — AI features resume at midnight UTC.",
  },
}
```

**Locked invariants:**
- New keys land in the EXTENSION block (NOT the LOCKED 9-key block at lines 84-117).
- No `ctaLabel`/`ctaHref` — CONTEXT D-02.4 + D-03.5 both say "No CTA."
- Copy is verbatim from CONTEXT (operator can tune; recommended default).

---

### `vigil-pwa/src/lib/api-error-codes.test.ts` (EDIT — pin 2 new EXTENSION keys)

**Self-analog:** Lines 61-78 (existing `AUTH-126-CODE-MAP-LOCKED-ENUM` test).

**Pattern to mirror (lines 61-78):**
```typescript
it('AUTH-126-CODE-MAP-LOCKED-ENUM: ERROR_CODE_MAP contains all 9 LOCKED keys (D-04 lock)', () => {
  const LOCKED_KEYS = [...] as const
  for (const key of LOCKED_KEYS) {
    expect(ERROR_CODE_MAP, `... must contain LOCKED key "${key}"`).toHaveProperty(key)
    const entry = ERROR_CODE_MAP[key]
    expect(typeof entry.message).toBe('string')
    expect(entry.message.length).toBeGreaterThan(0)
  }
})
```

**Required new test (GUARD-127-EXTENSION):**
```typescript
it('GUARD-127-CODE-MAP-EXTENSION: Phase 127 EXTENSION keys present (AUDIO_SESSION_TOO_LONG, DAILY_AI_BUDGET_EXCEEDED)', () => {
  const PHASE_127_KEYS = ['AUDIO_SESSION_TOO_LONG', 'DAILY_AI_BUDGET_EXCEEDED'] as const
  for (const key of PHASE_127_KEYS) {
    expect(ERROR_CODE_MAP, `ERROR_CODE_MAP must contain Phase 127 EXTENSION key "${key}"`).toHaveProperty(key)
    const entry = ERROR_CODE_MAP[key]
    expect(typeof entry.message).toBe('string')
    expect(entry.message.length).toBeGreaterThan(0)
    // CONTEXT D-02.4 + D-03.5: no CTA on these two keys.
    expect(entry.ctaLabel).toBeUndefined()
    expect(entry.ctaHref).toBeUndefined()
  }
})
```

---

### `vigil-pwa/src/main.tsx` (EDIT — register `beforeSend` in Sentry init)

**Self-analog:** Lines 15-21 (current `Sentry.init` block).

**Current state:**
```typescript
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}
```

**Required edit (CONTEXT D-01.5):**
```typescript
import { redactSentryEvent } from './lib/sentry-redact'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    beforeSend: redactSentryEvent,   // ← Phase 127 GUARD-01.5
  });
}
```

---

### `vigil-pwa/src/analytics/posthog.ts` (EDIT — denylist parity, per RESEARCH Open Q3)

**Self-analog (peer):** `vigil-core/src/analytics/posthog.ts:32-41`.

**Required edit:** mirror the 14-key Set. Same LOCKED-vs-EXTENSION comment split. (Per RESEARCH Open Q3, the recommendation is duplicate-with-drift-test; planner decides whether to create a cross-file source-grep drift test that asserts the two literal Sets match.)

---

### `.planning/STATE.md` (EDIT — delete stale Phase 107.1 blocker line)

**Required edit (RESEARCH §Pitfall 2 — drift was closed by `0013`):**
- Delete or update the line at `.planning/STATE.md:389` (currently reads):
  > "Phase 107.1 work_orders schema drift — columns notes/archived_at/last_change_at/last_change_summary defined in schema.ts but never migrated"
- Recommended replacement (one line above the line being removed): a single closing-note like "Phase 107.1 work_orders drift resolved by `0013_work_orders_drift_repair.sql` 2026-04-22; rediscovered during Phase 127 scout (RESEARCH §Pitfall 2)."

This is the GUARD-04 "stale docs" half of the re-scoped success criterion.

---

## Shared Patterns

### W-01 / Phase 121 D-D2 cross-user-isolation pattern

**Source:** `vigil-core/src/db/schema.ts:244-258` (`workOrderStatuses` composite PK).

**Apply to:** Every new table (`ai_usage_daily` for GUARD-03), every new query (`requireAiBudget`, `withBudgetTracking`).

**Invariants the planner MUST preserve:**
- `userId` comes from `c.get("userId")`, NEVER from request body/query (Phase 121 D-D2.1 lock).
- Every `db.select()`/`update()`/`delete()` on a user-scoped table has `eq(table.userId, userId)` in `WHERE`.
- Every `db.insert()` sets `.userId = userId` from the caller's bearer token, never from `body.userId`.
- Composite PK `(userId, X)` where row-uniqueness depends on per-user scope.

**Test pattern:** `vigil-core/src/integration/cross-user-isolation.test.ts:421-455` (work-orders lock block).

### Mount-order contract (`bearerAuth` precedes everything)

**Source:** `vigil-core/src/index.ts:166` (the bearerAuth dispatcher).

**Apply to:** No NEW middleware added in Phase 127 (CONTEXT D-03.4 explicitly chose in-handler `requireAiBudget` to sidestep mount-order risk). But the existing rule means:
- `requireAiBudget(c.get("userId"))` is called INSIDE handlers (after bearerAuth set userId), NOT as middleware.
- Drift-detector test at `vigil-core/src/__tests__/mount-order.test.ts` continues to pass after Phase 127's `index.ts` edit (the new `DailyBudgetExceededError` branch in `app.onError` does not affect the bearerAuth ordering).

### Hand-crafted Drizzle SQL with `IF NOT EXISTS`

**Source:** `vigil-core/drizzle/0019_add_users_quiet_mode.sql` (entire file).

**Apply to:** `vigil-core/drizzle/0020_add_ai_usage_daily.sql`.

**Invariants:**
- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` everywhere (Railway partial-fail-on-restart safety per Phase 125 Plan 02 lock).
- `--> statement-breakpoint` between statements (Drizzle migrator splitter convention).
- Quoted identifiers (`"ai_usage_daily"`).
- Phase + decision-ID header comment (Phase 127 / GUARD-03).
- Hand-edit `.sql` only — let `drizzle-kit generate` produce `meta/0020_snapshot.json` and `meta/_journal.json` (RESEARCH §"Runtime State Inventory").

### Source-grep drift detector pattern

**Source:** `vigil-core/src/__tests__/mount-order.test.ts:21-69`.

**Apply to:**
- `vigil-core/src/__tests__/audio-log-redaction.test.ts` (three rails — GUARD-01.4).
- `vigil-core/src/__tests__/migration-drift.test.ts` (drizzle-kit generate stdout parse — GUARD-04.3).
- Recommended addition per RESEARCH §Pitfall 4: a drift detector pinning every `ai.messages.create` / `ai.beta.messages.create` is wrapped in `withBudgetTracking`.

**Invariants:**
- `node:test` + `node:assert/strict`.
- `before(async () => { ... })` for one-time `fs.readFileSync` setup.
- ESM-safe `path.dirname(url.fileURLToPath(import.meta.url))` for `__dirname`.
- `assert.ok(condition, "human-readable error message including phase ID + bad indices")`.

### Locked-enum + EXTENSION-block pattern

**Source:** `vigil-pwa/src/lib/api-error-codes.ts:83-138` + `vigil-pwa/src/lib/api-error-codes.test.ts:61-78`.

**Apply to:**
- `vigil-pwa/src/lib/api-error-codes.ts` (add 2 new EXTENSION keys).
- `vigil-core/src/analytics/posthog.ts` (the `BLOCKED_PROPERTY_NAMES` Set has the same lock-vs-extend shape).

**Invariants:**
- LOCKED block keys never change (forbidden by D-04 contracts).
- EXTENSION block additions get a presence-pin test analogous to `AUTH-126-CODE-MAP-LOCKED-ENUM`.

### Pure function + pre-network hook pattern

**Source:** `vigil-core/src/analytics/posthog.ts:54-77` (`redactEvent` + `before_send: redactEvent`).

**Apply to:**
- `vigil-core/src/lib/sentry.ts` (`redactSentryEvent` + `beforeSend: redactSentryEvent` — Node side).
- `vigil-pwa/src/lib/sentry-redact.ts` (`redactSentryEvent` + `beforeSend: redactSentryEvent` — Browser side).

**Invariants (RESEARCH §Pitfall 3):**
- Pure function — no side effects, no module state.
- `null`-tolerant at top.
- Exported for unit testing.
- Defensive try/catch — return original event unchanged on internal throw (NOT `undefined`).
- Type-guard each bag before iterating (handles primitive `contexts.os` shapes).

### Env-gate + null-singleton pattern (no-DB / no-DSN / no-API-KEY local dev shape)

**Source:** `vigil-core/src/analytics/posthog.ts:71-80` (POSTHOG_API_KEY null-singleton) + `vigil-core/src/lib/sentry.ts:78-89` (SENTRY_DSN env-gate).

**Apply to:** `vigil-core/src/lib/ai-budget.ts` (`requireAiBudget` early-returns on `if (!db) return;`).

**Invariants:**
- Local-dev shape is a silent no-op (no warnings, no errors).
- Env var read at call time (not cached) — sub-microsecond cost (RESEARCH §A3).

---

## No Analog Found

| File | Reason | Mitigation |
|------|--------|------------|
| `vigil-core/src/__tests__/migration-drift.test.ts` | No existing test shells `child_process.execSync` for an external CLI. `vigil-core/src/db/migrate.test.ts` is the closest precedent but tests our own `migrate.ts`, not the drizzle-kit CLI. | Use the outer shell of `mount-order.test.ts` (drift-detector layout) and the full implementation in RESEARCH §Pitfall 1 + §Pitfall 10. Set `{ timeout: 10_000 }`, use fake `DATABASE_URL`, parse `/No schema changes/i` (NOT exact-string compare to the emoji sentinel). |

---

## Metadata

**Analog search scope:**
- `vigil-core/src/{lib,routes,ai,analytics,db,__tests__,integration}/**/*.ts`
- `vigil-core/drizzle/*.sql`
- `vigil-pwa/src/{lib,analytics}/**/*.{ts,tsx}`
- `vigil-g2-plugin/src/{lib,screens,__tests__}/**/*.ts`
- `.planning/STATE.md`

**Files scanned:** 42 (24 vigil-core, 6 vigil-pwa, 12 vigil-g2-plugin, plus STATE.md)

**Pattern extraction date:** 2026-05-11

**Critical re-scopes for planner attention (from RESEARCH.md):**
1. **GUARD-04 is NOT "write 0020_reconcile_work_orders_107_1.sql"** — drift already migrated in `0013`. Plan only writes the drift-detector test + STATE.md cleanup. The `0020` slot goes to `ai_usage_daily` (GUARD-03).
2. **`drizzle-kit generate --dry` flag does NOT exist** — use `drizzle-kit generate` (no flag) + `/No schema changes/i` regex.
3. **`usd_estimate numeric(10,4)` rounds sub-cent values to 0** — use `numeric(12,6)` instead (Pitfall 9).
4. **`process-audio.ts:82-115` bypasses the `callClaude*` wrappers** — Pitfall 4 wrap is required, not optional.
5. **`app.onError` Sentry-sink branch order matters** — `DailyBudgetExceededError` check FIRST, before captureToSentry/captureException (Pitfall 5).
6. **`cross-user-isolation.test.ts` lives at `src/integration/`, not `src/__tests__/`** (CONTEXT D-03.7 path is stale) — extend the integration file.
7. **No `vigil-pwa/src/lib/sentry-redact.ts` analog exists** — the PWA-side Sentry wrapper is new. Borrow Pattern 1 from RESEARCH § (mirrors the Node-side pure function with `@sentry/react` types).
