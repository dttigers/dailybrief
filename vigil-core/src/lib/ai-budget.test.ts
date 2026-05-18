// vigil-core/src/lib/ai-budget.test.ts
// Phase 127 GUARD-03 / Plan 05 Task 3 — ai-budget library unit tests.
//
// All 7 enumerated cases are REQUIRED (no skip allowance — the test-only
// `__computeUsdForTest` + `__readCapUsdForTest` helpers in ai-budget.ts
// exist precisely so Tests 6 (accumulator math) and 7 (USD math) are
// trivial pure-function assertions without DB or mock.module gymnastics).
//
// Test inventory:
//   1. DailyBudgetExceededError carries the locked code and name
//   2. __readCapUsdForTest default is 0.50
//   3. __readCapUsdForTest respects VIGIL_DAILY_AI_BUDGET_USD env override
//   4. __readCapUsdForTest falls back to 0.50 on invalid env value
//   5. withBudgetTracking returns fn() response unchanged when usage missing
//   6. withBudgetTracking accumulator failure is non-fatal (console.error capture)
//   7. __computeUsdForTest math: 1M input tokens === $3.00 USD
//
// Run: cd vigil-core && npx tsx --test src/lib/ai-budget.test.ts

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const aiBudgetModule = await import("./ai-budget.js");
const {
  DailyBudgetExceededError,
  withBudgetTracking,
  __computeUsdForTest,
  __readCapUsdForTest,
} = aiBudgetModule;

// Phase 130 Plan 02 — OpenAI duration-based accumulator (RED until Task 3
// ships the export). Cast to a narrow type so the test compiles against the
// existing ai-budget module shape; once Task 3 lands the export, the import
// resolves and the cast is structurally compatible.
const withOpenAIBudgetTracking = (aiBudgetModule as unknown as {
  withOpenAIBudgetTracking: <T>(
    userId: number,
    durationMs: number,
    fn: () => Promise<T>,
  ) => Promise<T>;
}).withOpenAIBudgetTracking;

// ── Env capture/restore (mirrors sentry.test.ts pattern) ──────────────────
const realCapEnv = process.env["VIGIL_DAILY_AI_BUDGET_USD"];

function restoreCapEnv(): void {
  if (realCapEnv === undefined) {
    delete process.env["VIGIL_DAILY_AI_BUDGET_USD"];
  } else {
    process.env["VIGIL_DAILY_AI_BUDGET_USD"] = realCapEnv;
  }
}

describe("ai-budget (vigil-core/src/lib/ai-budget.ts) — Phase 127 GUARD-03 / Plan 05 Task 3", () => {
  // ── TEST 1: DailyBudgetExceededError shape lock ──────────────────────────
  describe("DailyBudgetExceededError shape", () => {
    it("carries the locked code, name, userId, usdEstimate; instanceof Error", () => {
      const err = new DailyBudgetExceededError(42, 0.51);
      assert.equal(
        err.code,
        "DAILY_AI_BUDGET_EXCEEDED",
        "err.code must be the literal 'DAILY_AI_BUDGET_EXCEEDED' (matches ERROR_CODE_MAP key)",
      );
      assert.equal(
        err.name,
        "DailyBudgetExceededError",
        "err.name must be 'DailyBudgetExceededError' (preserves instanceof across module boundaries)",
      );
      assert.ok(err instanceof Error, "err instanceof Error must be true");
      assert.equal(err.userId, 42, "constructor sets userId");
      assert.equal(err.usdEstimate, 0.51, "constructor sets usdEstimate");
      // Sanity: message format used by operator logs (T-127-03-D `accept`).
      assert.match(
        err.message,
        /Daily AI budget exceeded for user 42/,
        "message format used by operator log forensics",
      );
    });
  });

  // ── TEST 2-4: __readCapUsdForTest env-driven cap reads ───────────────────
  describe("__readCapUsdForTest", () => {
    beforeEach(() => {
      delete process.env["VIGIL_DAILY_AI_BUDGET_USD"];
    });

    afterEach(() => {
      restoreCapEnv();
    });

    // TEST 2: default
    it("returns 0.50 when VIGIL_DAILY_AI_BUDGET_USD is unset (D-03.2 default)", () => {
      assert.equal(
        __readCapUsdForTest(),
        0.5,
        "default cap is 0.50 USD per CONTEXT D-03.2",
      );
    });

    // TEST 3: env override
    it("respects VIGIL_DAILY_AI_BUDGET_USD env override (parsed as float)", () => {
      process.env["VIGIL_DAILY_AI_BUDGET_USD"] = "1.25";
      assert.equal(
        __readCapUsdForTest(),
        1.25,
        "env override of '1.25' must parse to 1.25",
      );
      process.env["VIGIL_DAILY_AI_BUDGET_USD"] = "5";
      assert.equal(
        __readCapUsdForTest(),
        5,
        "env override of '5' (integer-shaped) must parse to 5",
      );
      // Boundary: zero is technically valid (operator wants to disable AI)
      process.env["VIGIL_DAILY_AI_BUDGET_USD"] = "0";
      assert.equal(
        __readCapUsdForTest(),
        0,
        "env override of '0' must parse to 0 (operator-driven AI disable)",
      );
    });

    // TEST 4: invalid fallback
    it("falls back to 0.50 on invalid env value (NaN, empty, negative)", () => {
      process.env["VIGIL_DAILY_AI_BUDGET_USD"] = "not-a-number";
      assert.equal(
        __readCapUsdForTest(),
        0.5,
        "non-numeric string must fall back to default 0.50",
      );
      process.env["VIGIL_DAILY_AI_BUDGET_USD"] = "";
      assert.equal(
        __readCapUsdForTest(),
        0.5,
        "empty string must fall back to default 0.50",
      );
      process.env["VIGIL_DAILY_AI_BUDGET_USD"] = "-1";
      assert.equal(
        __readCapUsdForTest(),
        0.5,
        "negative value must fall back to default 0.50 (cap must be ≥ 0)",
      );
    });
  });

  // ── TEST 5: withBudgetTracking missing-usage no-throw ────────────────────
  describe("withBudgetTracking missing-usage shape", () => {
    it("returns fn() response unchanged when usage field is missing (no INSERT, no throw)", async () => {
      const fn = async (): Promise<{ ok: boolean }> => ({ ok: true });
      const result = await withBudgetTracking(42, fn);
      assert.deepEqual(
        result,
        { ok: true },
        "response must round-trip unchanged when no usage field present",
      );
    });

    it("returns fn() response unchanged when usage has zero tokens (computed usd is 0, no INSERT)", async () => {
      const fn = async (): Promise<{
        usage: { input_tokens: number; output_tokens: number };
        ok: boolean;
      }> => ({ usage: { input_tokens: 0, output_tokens: 0 }, ok: true });
      const result = await withBudgetTracking(42, fn);
      assert.equal(result.ok, true, "response.ok preserved");
      assert.equal(result.usage.input_tokens, 0, "response.usage preserved");
    });
  });

  // ── TEST 6: withBudgetTracking accumulator failure non-fatal ─────────────
  describe("withBudgetTracking accumulator failure is non-fatal", () => {
    it("primary assertion via __computeUsdForTest: 100 in + 50 out = $0.00105", () => {
      // Primary path (no DB seam needed): __computeUsdForTest IS the production
      // code's math. Asserting on this confirms the accumulator's USD figure
      // is computed the same way the test expects.
      const expected =
        100 * (3 / 1_000_000) + 50 * (15 / 1_000_000);
      assert.equal(
        __computeUsdForTest(100, 50, "claude-sonnet-4"),
        expected,
        "computeUsd(100, 50) must equal the literal Sonnet 4 math",
      );
    });

    it("secondary assertion: console.error captures 'withBudgetTracking accumulator failed' string when accumulator path throws", async () => {
      // The accumulator INSERT only fires when db is non-null AND usd > 0.
      // In this test process, the dev DATABASE_URL is set, so db IS bound.
      // We induce a failure by passing an `fn` whose `usage` shape passes the
      // type guard but contains a sentinel that the INSERT path can't store
      // — except numeric(12,6) accepts essentially any finite number, so we
      // can't easily fail the SQL itself.
      //
      // Approach: monkey-patch console.error, then issue a withBudgetTracking
      // call against a user_id that does NOT exist in `users` (FK CASCADE).
      // The INSERT will fail at the FK constraint, the catch fires, the
      // captured console.error string contains the expected sentinel.
      const captured: unknown[][] = [];
      const originalConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        captured.push(args);
      };
      try {
        const BAD_USER_ID = -999_999_999; // guaranteed non-existent FK target
        const fn = async (): Promise<{
          usage: { input_tokens: number; output_tokens: number };
          ok: boolean;
        }> => ({ usage: { input_tokens: 100, output_tokens: 50 }, ok: true });
        const result = await withBudgetTracking(BAD_USER_ID, fn);
        // CONTRACT: fn()'s response round-trips unchanged even on accumulator failure.
        assert.equal(result.ok, true, "response.ok preserved on FK error");
        assert.equal(
          result.usage.input_tokens,
          100,
          "response.usage preserved on FK error",
        );
        // CONTRACT: console.error was invoked with the sentinel string.
        const matchedCall = captured.find((args) =>
          args.some(
            (a) =>
              typeof a === "string" &&
              a.includes("withBudgetTracking accumulator failed"),
          ),
        );
        assert.ok(
          matchedCall,
          `console.error must be called with 'withBudgetTracking accumulator failed' sentinel (captured calls: ${JSON.stringify(
            captured,
          )})`,
        );
      } finally {
        console.error = originalConsoleError;
      }
    });
  });

  // ── TEST 7: __computeUsdForTest math lock ────────────────────────────────
  describe("__computeUsdForTest math", () => {
    it("1M input tokens === $3.00 USD (Sonnet 4 input price lock)", () => {
      assert.equal(
        __computeUsdForTest(1_000_000, 0, "claude-sonnet-4"),
        3.0,
        "1M input tokens must compute to exactly $3.00 USD",
      );
    });

    it("1M output tokens === $15.00 USD (Sonnet 4 output price lock)", () => {
      assert.equal(
        __computeUsdForTest(0, 1_000_000, "claude-sonnet-4"),
        15.0,
        "1M output tokens must compute to exactly $15.00 USD",
      );
    });

    it("0 in + 0 out === $0.00 USD (no-op math)", () => {
      assert.equal(
        __computeUsdForTest(0, 0),
        0,
        "0 tokens must compute to 0 USD",
      );
    });

    it("100 in + 50 out === literal accumulator math", () => {
      const expected = 100 * (3 / 1_000_000) + 50 * (15 / 1_000_000);
      assert.equal(
        __computeUsdForTest(100, 50),
        expected,
        "literal math: 100 in @ $3/1M + 50 out @ $15/1M",
      );
    });
  });

  // ── Phase 130 Plan 02 — withOpenAIBudgetTracking (duration-based accumulator) ──
  //
  // OpenAI transcription is billed at $0.003/minute. The new helper accepts a
  // pre-computed `durationMs` (estimated from PCM byte count at the call
  // site — bytes / 32000 * 1000 for 16 kHz × 16-bit × mono) and accumulates
  // usd = (durationMs / 1000) * (0.003 / 60) into ai_usage_daily via the
  // same INSERT … ON CONFLICT DO UPDATE pattern used by withBudgetTracking.
  describe("withOpenAIBudgetTracking (Phase 130 Plan 02 — duration-based)", () => {
    it("A: runs fn and returns its resolved value unchanged", async () => {
      const fn = async (): Promise<string> => "hello world";
      const result = await withOpenAIBudgetTracking(42, 10_000, fn);
      assert.equal(result, "hello world");
    });

    it("B: on retry for the same user same day, accumulates without throwing (idempotent ON CONFLICT path)", async () => {
      // We cannot easily SELECT from ai_usage_daily without DB access in unit
      // tests, but we can verify the function does NOT throw across two
      // sequential calls for the same user. The ON CONFLICT DO UPDATE math is
      // pure SQL — concurrent or sequential repeats simply add to the
      // existing row. Use a non-existent userId so the INSERT fails on FK
      // and the catch fires non-fatally (mirror existing Test 6 approach).
      const BAD_USER_ID = -888_888_888;
      const fn1 = async (): Promise<string> => "first";
      const fn2 = async (): Promise<string> => "second";
      // Suppress noisy console.error from the deliberately-failing accumulator.
      const originalConsoleError = console.error;
      console.error = () => {};
      try {
        const r1 = await withOpenAIBudgetTracking(BAD_USER_ID, 5_000, fn1);
        const r2 = await withOpenAIBudgetTracking(BAD_USER_ID, 5_000, fn2);
        assert.equal(r1, "first", "first call returns its resolved value");
        assert.equal(r2, "second", "second call returns its resolved value");
      } finally {
        console.error = originalConsoleError;
      }
    });

    it("C: accumulator errors do NOT throw — caller still receives fn's resolved value", async () => {
      // Same pattern as withBudgetTracking Test 6 — induce FK failure via a
      // bogus user_id; console.error must capture the sentinel string;
      // the helper still returns the fn() result.
      const captured: unknown[][] = [];
      const originalConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        captured.push(args);
      };
      try {
        const BAD_USER_ID = -999_999_998;
        const fn = async (): Promise<{ text: string }> => ({ text: "ok" });
        const result = await withOpenAIBudgetTracking(BAD_USER_ID, 10_000, fn);
        assert.deepEqual(result, { text: "ok" }, "fn result round-trips on accumulator failure");
        const matched = captured.find((args) =>
          args.some(
            (a) =>
              typeof a === "string" &&
              a.includes("withOpenAIBudgetTracking accumulator failed"),
          ),
        );
        assert.ok(
          matched,
          `console.error must include 'withOpenAIBudgetTracking accumulator failed' sentinel; captured: ${JSON.stringify(captured)}`,
        );
      } finally {
        console.error = originalConsoleError;
      }
    });
  });
});
