import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createSettingsRouter } from "./settings.js";

// ── Test helpers (print-schedule) ─────────────────────────────────────────────

function buildApp(row: { hour: number; minute: number; enabled: boolean } | null) {
  const router = createSettingsRouter({
    dbGetFn: async () => row,
    dbUpsertFn: async (_s) => {},
  });
  const app = new Hono();
  app.route("/", router);
  return app;
}

function buildAppWithUpsert(
  row: { hour: number; minute: number; enabled: boolean } | null,
  onUpsert: (s: { hour: number; minute: number; enabled: boolean }) => void,
) {
  const router = createSettingsRouter({
    dbGetFn: async () => row,
    dbUpsertFn: async (s) => { onUpsert(s); },
  });
  const app = new Hono();
  app.route("/", router);
  return app;
}

// ── Test helpers (timezone) ───────────────────────────────────────────────────

function buildTzApp(row: string | null) {
  const router = createSettingsRouter({
    dbGetTimezoneFn: async () => row,
    dbUpsertTimezoneFn: async (_tz) => {},
  });
  const app = new Hono();
  app.route("/", router);
  return app;
}

function buildTzAppWithUpsert(
  row: string | null,
  onUpsert: (tz: string) => void,
) {
  const router = createSettingsRouter({
    dbGetTimezoneFn: async () => row,
    dbUpsertTimezoneFn: async (tz) => { onUpsert(tz); },
  });
  const app = new Hono();
  app.route("/", router);
  return app;
}

// ── Test helpers (generate-schedule) ──────────────────────────────────────────

function buildGenApp(row: { hour: number; minute: number; enabled: boolean } | null) {
  const router = createSettingsRouter({
    dbGetGenerateFn: async () => row,
    dbUpsertGenerateFn: async (_s) => {},
  });
  const app = new Hono();
  app.route("/", router);
  return app;
}

function buildGenAppWithUpsert(
  row: { hour: number; minute: number; enabled: boolean } | null,
  onUpsert: (s: { hour: number; minute: number; enabled: boolean }) => void,
) {
  const router = createSettingsRouter({
    dbGetGenerateFn: async () => row,
    dbUpsertGenerateFn: async (s) => { onUpsert(s); },
  });
  const app = new Hono();
  app.route("/", router);
  return app;
}

// ── Tests: print-schedule (PS-01..PS-06) ──────────────────────────────────────

test("PS-01: GET with no row stored returns default schedule { hour: 6, minute: 0, enabled: true }", async () => {
  const app = buildApp(null);

  const res = await app.request("/settings/print-schedule");
  assert.equal(res.status, 200, "Expected 200 OK");

  const body = await res.json() as { hour: number; minute: number; enabled: boolean };
  assert.equal(body.hour, 6, "Default hour must be 6");
  assert.equal(body.minute, 0, "Default minute must be 0");
  assert.equal(body.enabled, true, "Default enabled must be true");
});

test("PS-02: PUT valid schedule returns { ok: true }; GET returns updated values", async () => {
  let stored: { hour: number; minute: number; enabled: boolean } | null = null;

  const router = createSettingsRouter({
    dbGetFn: async () => stored,
    dbUpsertFn: async (s) => { stored = s; },
  });
  const app = new Hono();
  app.route("/", router);

  const putRes = await app.request("/settings/print-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: 7, minute: 30, enabled: true }),
  });
  assert.equal(putRes.status, 200, "Expected 200 OK on PUT");

  const putBody = await putRes.json() as { ok: boolean };
  assert.equal(putBody.ok, true, "PUT response must be { ok: true }");

  const getRes = await app.request("/settings/print-schedule");
  assert.equal(getRes.status, 200, "Expected 200 OK on GET");

  const getBody = await getRes.json() as { hour: number; minute: number; enabled: boolean };
  assert.equal(getBody.hour, 7, "GET must return updated hour");
  assert.equal(getBody.minute, 30, "GET must return updated minute");
  assert.equal(getBody.enabled, true, "GET must return updated enabled");
});

test("PS-03: PUT with hour: 24 returns 400 { error: 'invalid_input' }", async () => {
  const app = buildApp(null);

  const res = await app.request("/settings/print-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: 24, minute: 0, enabled: true }),
  });
  assert.equal(res.status, 400, "Expected 400 for hour: 24");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_input", "Error must be invalid_input");
});

test("PS-04: PUT with minute: 60 returns 400 { error: 'invalid_input' }", async () => {
  const app = buildApp(null);

  const res = await app.request("/settings/print-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: 6, minute: 60, enabled: true }),
  });
  assert.equal(res.status, 400, "Expected 400 for minute: 60");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_input", "Error must be invalid_input");
});

test("PS-05: PUT with hour: -1 returns 400 { error: 'invalid_input' }", async () => {
  const app = buildApp(null);

  const res = await app.request("/settings/print-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: -1, minute: 0, enabled: true }),
  });
  assert.equal(res.status, 400, "Expected 400 for hour: -1");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_input", "Error must be invalid_input");
});

test("PS-06: PUT with missing enabled field returns 400 { error: 'invalid_input' }", async () => {
  const app = buildApp(null);

  const res = await app.request("/settings/print-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: 6, minute: 0 }),
  });
  assert.equal(res.status, 400, "Expected 400 when enabled is missing");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_input", "Error must be invalid_input");
});

// ── Tests: generate-schedule (GS-01..GS-06) ───────────────────────────────────

test("GS-01: GET with no row stored returns default schedule { hour: 4, minute: 0, enabled: true }", async () => {
  const app = buildGenApp(null);

  const res = await app.request("/settings/generate-schedule");
  assert.equal(res.status, 200, "Expected 200 OK");

  const body = await res.json() as { hour: number; minute: number; enabled: boolean };
  assert.equal(body.hour, 4, "Default generate hour must be 4");
  assert.equal(body.minute, 0, "Default generate minute must be 0");
  assert.equal(body.enabled, true, "Default generate enabled must be true");
});

test("GS-02: PUT valid schedule returns { ok: true }; onUpsert captures values; GET returns updated", async () => {
  let stored: { hour: number; minute: number; enabled: boolean } | null = null;

  const router = createSettingsRouter({
    dbGetGenerateFn: async () => stored,
    dbUpsertGenerateFn: async (s) => { stored = s; },
  });
  const app = new Hono();
  app.route("/", router);

  const putRes = await app.request("/settings/generate-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: 5, minute: 15, enabled: true }),
  });
  assert.equal(putRes.status, 200, "Expected 200 OK on PUT");

  const putBody = await putRes.json() as { ok: boolean };
  assert.equal(putBody.ok, true, "PUT response must be { ok: true }");

  assert.ok(stored !== null, "onUpsert must have been called");
  const captured = stored as { hour: number; minute: number; enabled: boolean };
  assert.equal(captured.hour, 5, "onUpsert captured hour");
  assert.equal(captured.minute, 15, "onUpsert captured minute");
  assert.equal(captured.enabled, true, "onUpsert captured enabled");

  const getRes = await app.request("/settings/generate-schedule");
  assert.equal(getRes.status, 200, "Expected 200 OK on GET");

  const getBody = await getRes.json() as { hour: number; minute: number; enabled: boolean };
  assert.equal(getBody.hour, 5, "GET must return updated hour");
  assert.equal(getBody.minute, 15, "GET must return updated minute");
  assert.equal(getBody.enabled, true, "GET must return updated enabled");
});

test("GS-03: PUT with hour: 24 returns 400 { error: 'invalid_input' }", async () => {
  const app = buildGenApp(null);

  const res = await app.request("/settings/generate-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: 24, minute: 0, enabled: true }),
  });
  assert.equal(res.status, 400, "Expected 400 for hour: 24");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_input", "Error must be invalid_input");
});

test("GS-04: PUT with minute: 60 returns 400 { error: 'invalid_input' }", async () => {
  const app = buildGenApp(null);

  const res = await app.request("/settings/generate-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: 5, minute: 60, enabled: true }),
  });
  assert.equal(res.status, 400, "Expected 400 for minute: 60");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_input", "Error must be invalid_input");
});

test("GS-05: PUT with hour: -1 returns 400 { error: 'invalid_input' }", async () => {
  const app = buildGenApp(null);

  const res = await app.request("/settings/generate-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: -1, minute: 0, enabled: true }),
  });
  assert.equal(res.status, 400, "Expected 400 for hour: -1");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_input", "Error must be invalid_input");
});

test("GS-06: PUT with missing enabled field returns 400 { error: 'invalid_input' }", async () => {
  const app = buildGenApp(null);

  const res = await app.request("/settings/generate-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hour: 5, minute: 0 }),
  });
  assert.equal(res.status, 400, "Expected 400 when enabled is missing");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_input", "Error must be invalid_input");
});

// ── Tests: timezone (TZ-01..TZ-04) ────────────────────────────────────────────

test("TZ-01: GET with no row stored returns default timezone America/New_York", async () => {
  const app = buildTzApp(null);

  const res = await app.request("/settings/timezone");
  assert.equal(res.status, 200, "Expected 200 OK");

  const body = await res.json() as { timezone: string };
  assert.equal(body.timezone, "America/New_York", "Default timezone must be America/New_York");
});

test("TZ-02: PUT valid timezone returns { ok: true }; onUpsert captures; GET returns updated", async () => {
  let stored: string | null = null;

  const router = createSettingsRouter({
    dbGetTimezoneFn: async () => stored,
    dbUpsertTimezoneFn: async (tz) => { stored = tz; },
  });
  const app = new Hono();
  app.route("/", router);

  const putRes = await app.request("/settings/timezone", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timezone: "Europe/London" }),
  });
  assert.equal(putRes.status, 200, "Expected 200 OK on PUT");

  const putBody = await putRes.json() as { ok: boolean };
  assert.equal(putBody.ok, true, "PUT response must be { ok: true }");

  assert.equal(stored, "Europe/London", "onUpsert captured timezone string exactly");

  const getRes = await app.request("/settings/timezone");
  assert.equal(getRes.status, 200, "Expected 200 OK on GET");

  const getBody = await getRes.json() as { timezone: string };
  assert.equal(getBody.timezone, "Europe/London", "GET must return updated timezone");
});

test("TZ-03: PUT with invalid IANA timezone returns 400 { error: 'invalid_timezone' }; onUpsert NOT called", async () => {
  let upsertCalled = false;
  const app = buildTzAppWithUpsert(null, () => { upsertCalled = true; });

  const res = await app.request("/settings/timezone", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timezone: "Not/A_Real_Zone" }),
  });
  assert.equal(res.status, 400, "Expected 400 for invalid timezone");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_timezone", "Error must be invalid_timezone");
  assert.equal(upsertCalled, false, "onUpsert must NOT have been called for invalid input");
});

test("TZ-04: PUT with empty string timezone returns 400 { error: 'invalid_timezone' }", async () => {
  const app = buildTzApp(null);

  const res = await app.request("/settings/timezone", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timezone: "" }),
  });
  assert.equal(res.status, 400, "Expected 400 for empty timezone");

  const body = await res.json() as { error: string };
  assert.equal(body.error, "invalid_timezone", "Error must be invalid_timezone");
});
