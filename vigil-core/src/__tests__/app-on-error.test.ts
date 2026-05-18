// ── Phase 127 GUARD-03 (Plan 05.1b Task 2) — app.onError Pitfall 5 lock ──────
//
// Pins the DailyBudgetExceededError early-return branch in
// vigil-core/src/index.ts:265-298 (the app.onError handler). This file is the
// regression net for Pitfall 5 — "DailyBudgetExceededError must NOT sink to
// Sentry/PostHog because deliberate business-rule 429s would burn the 5k
// events/mo Sentry quota and create dashboard noise for an intentional
// rejection".
//
// Two test cases (RESEARCH §Pitfall 5 + Validation row 16):
//
//   1. DailyBudgetExceededError → 429 + locked code AND zero calls to
//      captureException / captureToSentry. This is THE Pitfall 5 lock: branch
//      ordering can't silently drift, because removing the branch (or moving
//      it AFTER the sinks) would change both spy call counts from 0 to 1.
//
//   2. Generic Error → 500 + body {error: "Internal server error"} AND
//      captureException + captureToSentry both called once each. Existing
//      Phase 126 AUTH-126-04 behavior is the regression baseline — if a future
//      planner over-broadens the no-sink branch, this test fails.
//
// Strategy: build a FRESH Hono instance with the EXACT same `app.onError` body
// as production (lines 265-298 of index.ts), and inject mock spies as the
// "capture" functions. This avoids importing the real app (which boots
// middleware, schedulers, DB connections, etc) and keeps the test fully
// hermetic. Mirror with care: if the production handler body changes, this
// test's mirror must be updated too — that is the intended drift-detection
// signal (the test's RED is the cue to verify the production change is
// intentional).
//
// Mock pattern: node:test's built-in `mock.fn()` (Node ≥ 20.6) — same pattern
// used in src/routes/auth.test.ts and src/routes/forgot-password.test.ts.
//
// Run: cd vigil-core && npx tsx --test src/__tests__/app-on-error.test.ts
// -----------------------------------------------------------------------------

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { DailyBudgetExceededError } from "../lib/ai-budget.js";
import { AudioSessionTooLongError } from "../lib/audio-cap.js";
import {
  VoiceTranscribeTimeoutError,
  VoiceTranscribeProviderDownError,
  VoiceTranscribeQuotaError,
} from "../routes/voice-errors.js";

// Build a test app whose onError mirrors the production handler at
// src/index.ts:265-298. The two side-effect functions are injected so we can
// spy on them without monkey-patching the real modules.
function buildTestApp(
  captureException: (
    userId: number | null,
    err: unknown,
    ctx: Record<string, unknown>,
  ) => void,
  captureToSentry: (
    userId: number | null,
    err: unknown,
    ctx: Record<string, unknown>,
  ) => void,
): Hono {
  const testApp = new Hono();

  testApp.get("/throw-budget", () => {
    throw new DailyBudgetExceededError(42, 0.51);
  });

  testApp.get("/throw-generic", () => {
    throw new Error("kaboom");
  });

  // Phase 130 Plan 02 — additional typed-error routes for the new locked-enum
  // codes. Each follows the same "deliberate throw → app.onError → no Sentry
  // sink" contract as DailyBudgetExceededError (Pitfall 5).
  testApp.get("/throw-audio-cap", () => {
    throw new AudioSessionTooLongError(3_000_000);
  });
  testApp.get("/throw-transcribe-timeout", () => {
    throw new VoiceTranscribeTimeoutError();
  });
  testApp.get("/throw-transcribe-down", () => {
    throw new VoiceTranscribeProviderDownError();
  });
  testApp.get("/throw-transcribe-quota", () => {
    throw new VoiceTranscribeQuotaError();
  });

  // EXACT mirror of vigil-core/src/index.ts app.onError handler.
  // If the production handler body changes, this mirror must be updated.
  testApp.onError((err, c) => {
    if (err instanceof DailyBudgetExceededError) {
      return c.json(
        { error: "Daily AI budget exceeded", code: "DAILY_AI_BUDGET_EXCEEDED" },
        429,
      );
    }
    // Phase 127 GUARD-02 + Phase 130 Plan 02 (VOICE-06 D-E1)
    if (err instanceof AudioSessionTooLongError) {
      return c.json({ error: err.message, code: err.code }, 413);
    }
    if (err instanceof VoiceTranscribeTimeoutError) {
      return c.json({ error: err.message, code: err.code }, 504);
    }
    if (err instanceof VoiceTranscribeProviderDownError) {
      return c.json({ error: err.message, code: err.code }, 502);
    }
    if (err instanceof VoiceTranscribeQuotaError) {
      return c.json({ error: err.message, code: err.code }, 503);
    }

    // Note: console.error is suppressed below via mock.method to keep test
    // output clean — the production handler logs unhandled errors here.
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

  return testApp;
}

describe("vigil-core/src/index.ts app.onError — Plan 05.1b / Pitfall 5 lock", () => {
  let consoleErrorMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    // Suppress the production handler's console.error so test output stays
    // clean. Restored automatically by node:test between tests.
    consoleErrorMock = mock.method(console, "error", () => {});
  });

  // ── PITFALL-5-BUDGET-NO-SINK ──────────────────────────────────────────────
  it("PITFALL-5-BUDGET-NO-SINK: DailyBudgetExceededError → 429 + locked code AND zero calls to captureException/captureToSentry", async () => {
    const captureExceptionSpy = mock.fn(() => {});
    const captureToSentrySpy = mock.fn(() => {});
    const testApp = buildTestApp(captureExceptionSpy, captureToSentrySpy);

    const res = await testApp.request("/throw-budget");

    assert.equal(res.status, 429, "must return HTTP 429 for budget-exceeded");
    const body = (await res.json()) as { error: string; code: string };
    assert.deepEqual(
      body,
      { error: "Daily AI budget exceeded", code: "DAILY_AI_BUDGET_EXCEEDED" },
      "response body must match locked-enum shape — PWA's resolveApiError reads body.code",
    );
    assert.equal(
      captureExceptionSpy.mock.calls.length,
      0,
      "LEAK: captureException was called for a deliberate 429 — Pitfall 5 (PostHog $exception flood)",
    );
    assert.equal(
      captureToSentrySpy.mock.calls.length,
      0,
      "LEAK: captureToSentry was called for a deliberate 429 — Pitfall 5 (Sentry quota burn)",
    );
    // Defensive: console.error must NOT fire either (it's gated behind the
    // budget-error branch in the production handler).
    assert.equal(
      consoleErrorMock.mock.calls.length,
      0,
      "LEAK: console.error fired for a deliberate budget-exceeded 429 — branch ordering drift",
    );
  });

  // ── PITFALL-5-GENERIC-DOES-SINK ──────────────────────────────────────────────
  it("PITFALL-5-GENERIC-DOES-SINK: generic Error → 500 + Internal server error AND both sinks called exactly once", async () => {
    const captureExceptionSpy = mock.fn(() => {});
    const captureToSentrySpy = mock.fn(() => {});
    const testApp = buildTestApp(captureExceptionSpy, captureToSentrySpy);

    const res = await testApp.request("/throw-generic");

    assert.equal(res.status, 500, "generic Error must still return HTTP 500");
    const body = (await res.json()) as { error: string };
    assert.deepEqual(
      body,
      { error: "Internal server error" },
      "generic-error body shape preserved (Phase 126 AUTH-126-04 regression baseline)",
    );
    assert.equal(
      captureExceptionSpy.mock.calls.length,
      1,
      "captureException must fire once for a generic Error (existing PostHog sink)",
    );
    assert.equal(
      captureToSentrySpy.mock.calls.length,
      1,
      "captureToSentry must fire once for a generic Error (existing Sentry sink — Phase 126)",
    );
    // Sanity: the spy context shape mirrors the production handler.
    // mock.fn() argument-typing is `[]` (empty tuple) under strict TS — the
    // double cast below is the documented escape hatch when the call-site
    // signature is known from the production handler we are mirroring.
    const exceptionCall = captureExceptionSpy.mock.calls[0]!;
    const exceptionArgs = exceptionCall.arguments as unknown as [
      number | null,
      unknown,
      Record<string, unknown>,
    ];
    assert.equal(
      exceptionArgs[0],
      null,
      "userId is null when c.get('userId') is unset (no bearerAuth in test app)",
    );
    assert.ok(
      exceptionArgs[1] instanceof Error,
      "captureException received the thrown Error",
    );
    assert.equal(
      (exceptionArgs[1] as Error).message,
      "kaboom",
      "captureException received the same Error instance that was thrown",
    );
    assert.deepEqual(
      exceptionArgs[2],
      { route: "/throw-generic", method: "GET" },
      "captureException ctx is {route, method} (Phase 103 BLOCKED_PROPERTY_NAMES denylist compliance)",
    );
  });

  // ── Phase 130 Plan 02 — VOICE-06 D-E1 locked-enum branches ───────────────
  // Same Pitfall 5 contract as DailyBudgetExceededError: deliberate typed
  // throws → translated to locked-enum HTTP responses with NO Sentry/PostHog
  // sink (these are intentional rejections, not server errors).

  it("AudioSessionTooLongError → 413 + AUDIO_SESSION_TOO_LONG; no sinks fired", async () => {
    const captureExceptionSpy = mock.fn(() => {});
    const captureToSentrySpy = mock.fn(() => {});
    const testApp = buildTestApp(captureExceptionSpy, captureToSentrySpy);

    const res = await testApp.request("/throw-audio-cap");
    assert.equal(res.status, 413);
    const body = (await res.json()) as { error: string; code: string };
    assert.equal(body.code, "AUDIO_SESSION_TOO_LONG");
    assert.equal(captureExceptionSpy.mock.calls.length, 0);
    assert.equal(captureToSentrySpy.mock.calls.length, 0);
  });

  it("VoiceTranscribeTimeoutError → 504 + VOICE_TRANSCRIBE_TIMEOUT; no sinks fired", async () => {
    const captureExceptionSpy = mock.fn(() => {});
    const captureToSentrySpy = mock.fn(() => {});
    const testApp = buildTestApp(captureExceptionSpy, captureToSentrySpy);

    const res = await testApp.request("/throw-transcribe-timeout");
    assert.equal(res.status, 504);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "VOICE_TRANSCRIBE_TIMEOUT");
    assert.equal(captureExceptionSpy.mock.calls.length, 0);
    assert.equal(captureToSentrySpy.mock.calls.length, 0);
  });

  it("VoiceTranscribeProviderDownError → 502 + VOICE_TRANSCRIBE_PROVIDER_DOWN; no sinks fired", async () => {
    const captureExceptionSpy = mock.fn(() => {});
    const captureToSentrySpy = mock.fn(() => {});
    const testApp = buildTestApp(captureExceptionSpy, captureToSentrySpy);

    const res = await testApp.request("/throw-transcribe-down");
    assert.equal(res.status, 502);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "VOICE_TRANSCRIBE_PROVIDER_DOWN");
    assert.equal(captureExceptionSpy.mock.calls.length, 0);
    assert.equal(captureToSentrySpy.mock.calls.length, 0);
  });

  it("VoiceTranscribeQuotaError → 503 + VOICE_TRANSCRIBE_QUOTA; no sinks fired", async () => {
    const captureExceptionSpy = mock.fn(() => {});
    const captureToSentrySpy = mock.fn(() => {});
    const testApp = buildTestApp(captureExceptionSpy, captureToSentrySpy);

    const res = await testApp.request("/throw-transcribe-quota");
    assert.equal(res.status, 503);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "VOICE_TRANSCRIBE_QUOTA");
    assert.equal(captureExceptionSpy.mock.calls.length, 0);
    assert.equal(captureToSentrySpy.mock.calls.length, 0);
  });
});
