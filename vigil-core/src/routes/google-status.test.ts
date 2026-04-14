import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createGoogleStatusRouter } from "./google-status.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function buildApp(rows: Array<{ scopes: string[] | null }>) {
  const router = createGoogleStatusRouter({
    dbSelectFn: async () => rows,
  });

  const app = new Hono();
  app.route("/", router);

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("GS-01-both-connected: returns calendar=connected and gmail=connected when both scopes stored", async () => {
  const app = buildApp([{ scopes: [CALENDAR_SCOPE, GMAIL_SCOPE] }]);

  const res = await app.request("/google/status");
  assert.equal(res.status, 200, "Expected 200 OK");

  const body = await res.json() as { calendar: string; gmail: string };
  assert.equal(body.calendar, "connected", "calendar must be connected");
  assert.equal(body.gmail, "connected", "gmail must be connected");
});

test("GS-02-calendar-only: returns calendar=connected and gmail=needs_auth for legacy calendar-only token", async () => {
  const app = buildApp([{ scopes: [CALENDAR_SCOPE] }]);

  const res = await app.request("/google/status");
  assert.equal(res.status, 200, "Expected 200 OK");

  const body = await res.json() as { calendar: string; gmail: string };
  assert.equal(body.calendar, "connected", "calendar must be connected");
  assert.equal(body.gmail, "needs_auth", "gmail must be needs_auth for calendar-only token");
});

test("GS-03-no-token: returns both needs_auth when no token row exists", async () => {
  const app = buildApp([]);

  const res = await app.request("/google/status");
  assert.equal(res.status, 200, "Expected 200 OK");

  const body = await res.json() as { calendar: string; gmail: string };
  assert.equal(body.calendar, "needs_auth", "calendar must be needs_auth when no row");
  assert.equal(body.gmail, "needs_auth", "gmail must be needs_auth when no row");
});

test("GS-04-null-scopes: returns both needs_auth when scopes is null (legacy token without scopes column)", async () => {
  const app = buildApp([{ scopes: null }]);

  const res = await app.request("/google/status");
  assert.equal(res.status, 200, "Expected 200 OK");

  const body = await res.json() as { calendar: string; gmail: string };
  assert.equal(body.calendar, "needs_auth", "calendar must be needs_auth when scopes is null");
  assert.equal(body.gmail, "needs_auth", "gmail must be needs_auth when scopes is null");
});
