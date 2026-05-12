// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is spike-only and MUST be deleted or rewritten before Phase 130 lands.
//
// Wave 0 smoke test for /v1/voice/transcribe. Intentionally RED until Plan
// 128a-02 lands voice-spike.ts (Nyquist test-first rail per 128A-VALIDATION.md).
// Drift-detector tests EXPLICITLY out of scope (CONTEXT line 132).
//
// JWT_SECRET preamble — mirrors agent-stream.test.ts:1-5 self-contained safety.
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Stub the OpenAI-backed transcription service BEFORE the route imports it.
// Plan 128a-02 will create transcribe-spike.ts exporting transcribeWav.
const transcribeSpike = await import("../../ai/transcribe-spike.js");
mock.method(transcribeSpike, "transcribeWav", async () => "hello world");

// Lazy import after env + stub are set (mirror agent-stream.test.ts:12-13).
const { voiceSpike } = await import("../voice-spike.js");

function makeApp(opts: { userId: number }): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId" as never, opts.userId as never);
    await next();
  });
  app.route("/", voiceSpike);
  return app;
}

test("POST /voice/transcribe — rejects empty body with 400", async () => {
  const app = makeApp({ userId: 1 });
  const res = await app.request("/voice/transcribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test("POST /voice/transcribe — happy path returns 201 with {id, content}", async () => {
  const app = makeApp({ userId: 1 });
  const b64 = Buffer.from("RIFF____WAVEfmt _".repeat(2)).toString("base64");
  const res = await app.request("/voice/transcribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audio: b64 }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { id: number; content: string };
  assert.equal(typeof body.id, "number");
  assert.equal(typeof body.content, "string");
});
