// PHASE 128a SPIKE — TOSSABLE. Phase 130 owns hardening; this file is spike-only and MUST be deleted or rewritten before Phase 130 lands.
//
// Wave 0 smoke test for /v1/voice/transcribe. Was RED in Plan 128a-01 (route
// did not exist); turns GREEN once Plan 128a-02 lands voice-spike.ts +
// transcribe-spike.ts (Nyquist test-first rail per 128A-VALIDATION.md).
// Drift-detector tests EXPLICITLY out of scope (CONTEXT line 132).
//
// JWT_SECRET preamble — mirrors agent-stream.test.ts:1-5 self-contained safety.
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Lazy import after env is set (mirror agent-stream.test.ts:12-13).
// Plan 128a-02 introduced the factory `createVoiceSpikeRoute(deps)` seam —
// the canonical vigil-core test-injection precedent (agent-stream.ts /
// quiet-mode.ts). ESM live-binding makes `mock.method` on the bare
// `transcribeWav` export throw "Cannot redefine property"; factory injection
// sidesteps the issue without touching production transcribe-spike.ts.
const { createVoiceSpikeRoute } = await import("../voice-spike.js");

function makeApp(opts: { userId: number; transcribeText?: string }): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId" as never, opts.userId as never);
    await next();
  });
  const route = createVoiceSpikeRoute({
    transcribeWav: async () => opts.transcribeText ?? "hello world",
  });
  app.route("/", route);
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
