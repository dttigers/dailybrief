import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createSettingsRouter } from "./settings.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

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
