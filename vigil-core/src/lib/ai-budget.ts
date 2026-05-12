// vigil-core/src/lib/ai-budget.ts
// Phase 127 GUARD-03 (T-127-03 mitigation): per-user daily AI spend watermark.
//
// Two public entry points plus one error class:
//
//   requireAiBudget(userId)       — Pre-flight gate. Reads today's
//                                   ai_usage_daily row for `userId` and
//                                   throws DailyBudgetExceededError when
//                                   usd_estimate >= cap. No-op when DB
//                                   is null (local dev / Plan 05 RED state).
//
//   withBudgetTracking(userId, fn) — Wraps an Anthropic SDK call. Awaits
//                                    fn(), reads `response.usage.input_tokens`
//                                    + `response.usage.output_tokens`, and
//                                    atomically accumulates the USD estimate
//                                    into ai_usage_daily via INSERT … ON
//                                    CONFLICT (user_id, usage_date) DO UPDATE.
//                                    Returns the original response unchanged.
//                                    Accumulator failures are non-fatal
//                                    (logged via console.error; user request
//                                    still succeeds — telemetry, not gating).
//
//   DailyBudgetExceededError       — Thrown by requireAiBudget when the cap
//                                    is hit. Carries the locked code literal
//                                    (matches ERROR_CODE_MAP key verbatim —
//                                    Plan 06 PWA-side extension)
//                                    and `name: "DailyBudgetExceededError"`
//                                    so `instanceof` survives module
//                                    boundaries (Plan 05.1b app.onError
//                                    branch relies on this).
//
// Mount-order contract (load-bearing — Plan 05.1b wires this):
//   Route handlers MUST call `await requireAiBudget(c.get("userId"))` AFTER
//   bearerAuth (which sets `userId` on the context) and BEFORE any
//   AI-incurring work. The W-01 cross-user-isolation pattern is enforced by
//   the per-userId WHERE filter below — Plan 05.1b's
//   cross-user-isolation.test.ts extension greps the exact W-01 literal.
//
// Env-gate behavior:
//   DATABASE_URL unset      → db is null → requireAiBudget no-ops silently
//                             (matches sentry.ts `if (!dsn) return;` shape)
//   VIGIL_DAILY_AI_BUDGET_USD unset / invalid / negative
//                           → cap defaults to 0.50 USD (D-03.2)
//
// Pricing constants (D-03.3 / Claude Sonnet 4):
//   Input  $3 per 1M tokens  → 3 / 1_000_000 per token
//   Output $15 per 1M tokens → 15 / 1_000_000 per token
//
//   (Audio tokens billed as input per Anthropic's audio billing — the
//    same INPUT_PRICE_PER_TOKEN constant applies. Phase 130 may add an
//    audio-specific branch if the audio rate diverges from text input.)
//
// Property-name denylist awareness:
//   This module never emits `audio*` or `pcm*` shaped logs. The console.error
//   strings below reference "withBudgetTracking accumulator failed" which is
//   audio-free. audio-log-redaction.test.ts Rail 3 safe-lists `lib/ai-budget.ts`
//   pre-emptively (Plan 01 Task 3) so the drift detector ignores any future
//   imports that happen to include the words "audio" elsewhere — but the
//   only stub-emit pattern in this file is `console.error` which is on the
//   approved logger surface for the catch-and-log convention.

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { aiUsageDaily } from "../db/schema.js";

// ── Pricing constants (D-03.3 — Claude Sonnet 4) ──────────────────────────
//
// Hard-coded per CONTEXT D-03.3. RESEARCH §A1 flags this for re-verification
// against the Anthropic pricing page when the next phase plans (130 voice
// transcribe, 131 chat context expansion) revisit cost math. Keep the
// constants in this file (not env-driven) — drift between assumed price and
// actual bill is a known foot-gun; if Anthropic changes pricing, we want
// the diff to land as a code commit + test update, not silently via env.
const INPUT_PRICE_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_PRICE_PER_TOKEN = 15 / 1_000_000;

// ── Cap default (D-03.2) ──────────────────────────────────────────────────
//
// $0.50/day per user. With Sonnet 4 at $3/$15 per 1M tokens, this gives
// roughly: 10k input tokens + 30k output tokens / day before tripping, or
// equivalently ~6-8 insight regens + 10-20 chat turns + 30-40 voice clips.
const DEFAULT_CAP_USD = 0.50;

// ── Error class (Plan 05.1b app.onError branches on `instanceof`) ─────────
//
// Locked invariants:
//   - readonly code is the literal ERROR_CODE_MAP key landed in Plan 06
//     (vigil-pwa). DO NOT abbreviate or shorten.
//   - name = "DailyBudgetExceededError" — preserves `instanceof` across
//     module boundaries / dynamic imports / hot-reload scenarios.
//     `app.onError(err)` branches on `err instanceof DailyBudgetExceededError`
//     and falls back to `err.name === "DailyBudgetExceededError"` for
//     belt-and-braces (Pitfall 5 — don't burn Sentry quota on deliberate
//     429s).
//   - Message includes `userId` and `usdEstimate` for operator log
//     forensics. T-127-03-D `accept` — these never reach the client; the
//     app.onError handler strips them out of the JSON response body
//     (Plan 05.1b).
export class DailyBudgetExceededError extends Error {
  readonly code = "DAILY_AI_BUDGET_EXCEEDED" as const;

  constructor(
    public readonly userId: number,
    public readonly usdEstimate: number,
  ) {
    super(
      `Daily AI budget exceeded for user ${userId} (${usdEstimate} USD)`,
    );
    this.name = "DailyBudgetExceededError";
  }
}

// ── Pure helpers (the math the production paths use) ──────────────────────
//
// Both functions are pure (no I/O, no shared state). They exist as named
// functions specifically so the test-only re-exports below
// (`__computeUsdForTest` / `__readCapUsdForTest`) are identity-equal to the
// production code paths — i.e., the unit tests exercise the SAME math the
// route handlers will hit at runtime, not a re-implementation.
//
// The `_model` parameter is currently unused (Phase 127 ships Sonnet 4
// only) but accepted to keep the signature forward-compatible. Phase 130
// may add audio-billed branches; the parameter lets that change happen
// without a public-API break.

function computeUsd(
  input_tokens: number,
  output_tokens: number,
  _model: string = "claude-sonnet-4",
): number {
  return (
    input_tokens * INPUT_PRICE_PER_TOKEN +
    output_tokens * OUTPUT_PRICE_PER_TOKEN
  );
}

function readCapUsd(): number {
  const raw = process.env["VIGIL_DAILY_AI_BUDGET_USD"];
  if (raw === undefined || raw === "") return DEFAULT_CAP_USD;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_CAP_USD;
  return parsed;
}

// ── Test-only re-exports (REQUIRED per Plan 05 frontmatter `exports`) ─────
//
// Production code paths (requireAiBudget / withBudgetTracking) call the
// `computeUsd` / `readCapUsd` functions above directly. These `__`-prefixed
// aliases re-export the SAME function references so unit tests can assert
// the math/env-read behavior without a live DB or mock.module gymnastics.
//
// The `__` prefix marks these as test-only entry points the rest of the
// codebase MUST NOT import from production paths (CONTEXT D-03 Claude's
// Discretion naming convention). No linter enforces this — the convention
// is "if a non-test caller imports a `__`-prefixed name, you have a bug."
//
// **DO NOT IMPORT FROM PRODUCTION CODE** — use the public `requireAiBudget`
// / `withBudgetTracking` entry points instead.
export const __computeUsdForTest = computeUsd;
export const __readCapUsdForTest = readCapUsd;

// ── requireAiBudget (D-03.4 pre-flight gate) ──────────────────────────────
//
// Locked invariants:
//   - The where() clause uses the W-01 cross-user-isolation lock literal
//     below. Plan 05.1b cross-user-isolation.test.ts greps the exact form.
//   - `CURRENT_DATE` — Postgres function, NOT JavaScript date math.
//     CONTEXT D-03.6 — UTC 00:00 rollover comes for free.
//   - `if (!db) return;` — local-dev shape. DATABASE_URL unset → no-op
//     silently (mirrors sentry.ts `if (!dsn) return;`).
//   - Cap comes from `readCapUsd()` (not inline `process.env.…` parse) so
//     `__readCapUsdForTest` is identity-equal to the production code path.
//   - Numeric cast: drizzle-orm/postgres-js returns `numeric` columns as
//     string. `Number(rows[0]?.usd)` parses, with a `?? 0` fallback for
//     the no-row case (first request of the day before any accumulator
//     run).
export async function requireAiBudget(userId: number): Promise<void> {
  if (!db) return;
  const cap = readCapUsd();
  const rows = await db
    .select({ usd: aiUsageDaily.usdEstimate })
    .from(aiUsageDaily)
    .where(
      and(
        eq(aiUsageDaily.userId, userId),
        sql`${aiUsageDaily.usageDate} = CURRENT_DATE`,
      ),
    );
  const current = rows[0]?.usd ? Number(rows[0].usd) : 0;
  if (current >= cap) throw new DailyBudgetExceededError(userId, current);
}

// ── withBudgetTracking (D-03.3 / D-03.4 post-call accumulator) ────────────
//
// Locked invariants:
//   - Accumulator INSERT is AWAITED (CONTEXT Claude's Discretion 2).
//     Fire-and-forget would let bursts squeak past the cap.
//   - The INSERT below uses ON CONFLICT DO UPDATE (atomic upsert keyed on
//     the composite PK). Never read-modify-write — that would race under
//     concurrent requests.
//   - Failure mode is NON-FATAL (D-03.3 — telemetry, not gating).
//     console.error + return response. Mirrors analytics/posthog.ts:139-149
//     trackEvent catch-and-log pattern. The cap-enforcement workhorse is
//     requireAiBudget; missed accumulation widens the burst window by one
//     request, not the whole day.
//   - Computes USD via `computeUsd(...)` (not inline math) so
//     `__computeUsdForTest` is identity-equal to the production code path.
//   - Defaults `input_tokens` / `output_tokens` to 0 when missing —
//     ai.beta.* responses can shape-shift; we never throw on a
//     missing-usage response (the user request already succeeded by the
//     time we reach the accumulator).
//   - Skips the INSERT when `usd === 0 || !db` — avoids a zero-impact write
//     in the no-usage edge case (e.g., `fn` returned a non-AI response).
//
// Generic shape: <T extends { usage?: { input_tokens?: number; output_tokens?: number } }>
// — keeps the response type intact so callers retain full Anthropic SDK
// types without `as any` casts.
export async function withBudgetTracking<
  T extends {
    usage?: { input_tokens?: number; output_tokens?: number };
  },
>(userId: number, fn: () => Promise<T>): Promise<T> {
  const response = await fn();
  try {
    const input_tokens = response.usage?.input_tokens ?? 0;
    const output_tokens = response.usage?.output_tokens ?? 0;
    const usd = computeUsd(input_tokens, output_tokens, "claude-sonnet-4");
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
    // CONTEXT D-03.3 failure mode: telemetry, not gating. Log + continue.
    // Mirrors analytics/posthog.ts:139-149 `trackEvent` catch-and-log.
    console.error(
      "[vigil-core] withBudgetTracking accumulator failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
  return response;
}
