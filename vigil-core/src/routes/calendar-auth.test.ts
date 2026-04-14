import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createCalendarAuthRouter } from "./calendar-auth.js";

// ── Environment Setup ─────────────────────────────────────────────────────────
process.env["GOOGLE_CLIENT_ID"] = "test-client-id";
process.env["GOOGLE_CLIENT_SECRET"] = "test-secret";
process.env["GOOGLE_REDIRECT_URI"] = "http://localhost:3001/v1/auth/google/callback";
process.env["PWA_URL"] = "http://localhost:5173";
process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"] =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// ── Mock helpers ──────────────────────────────────────────────────────────────

const MOCK_TOKENS = {
  refresh_token: "mock-refresh-token",
  access_token: "mock-access-token",
  expiry_date: Date.now() + 3_600_000,
};

function buildValidStateStore(stateNonce: string): Map<string, number> {
  const store = new Map<string, number>();
  store.set(stateNonce, Date.now());
  return store;
}

function buildExpiredStateStore(stateNonce: string): Map<string, number> {
  const store = new Map<string, number>();
  // 6 minutes ago — beyond the 5-min TTL
  store.set(stateNonce, Date.now() - 6 * 60 * 1000);
  return store;
}

/** Wrap the router in a /v1 mount so paths match index.ts registration. */
function buildApp(stateStore?: Map<string, number>): { app: Hono; dbCalls: Array<{ provider: string }> } {
  const dbCalls: Array<{ provider: string }> = [];

  const router = createCalendarAuthRouter({
    getTokenFn: async () => ({ tokens: MOCK_TOKENS }),
    dbUpsertFn: async (provider) => {
      dbCalls.push({ provider });
    },
    stateStore,
  });

  const app = new Hono();
  app.route("/", router);

  return { app, dbCalls };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("CAL-01-redirect: GET /auth/google returns 302 with Google consent URL", async () => {
  const { app } = buildApp();
  const res = await app.request("/auth/google");

  assert.equal(res.status, 302, "Expected 302 redirect");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("accounts.google.com"), "Location must point to accounts.google.com");
  assert.ok(location.includes("calendar.readonly"), "Location must include calendar.readonly scope");
  assert.ok(location.includes("access_type=offline"), "Location must include access_type=offline");
  assert.ok(location.includes("prompt=consent"), "Location must include prompt=consent");
});

test("CAL-01-callback-success: GET /auth/google/callback with valid code redirects to PWA", async () => {
  const stateNonce = "validstatenonce123";
  const { app, dbCalls } = buildApp(buildValidStateStore(stateNonce));

  const res = await app.request(`/auth/google/callback?code=test_code&state=${stateNonce}`);

  assert.equal(res.status, 302, "Expected 302 redirect after successful exchange");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.startsWith("http://localhost:5173"), "Should redirect to PWA_URL");
  assert.ok(location.includes("/settings"), "Should land on /settings path (D-10)");
  assert.ok(location.includes("google_connected=true"), "Should include google_connected=true on success");
  assert.ok(!location.includes("google_error"), "Should not contain google_error on success");
  assert.ok(!/calendar[_]error/.test(location), "Should not contain legacy calendar-error param (D-11 rename)");

  assert.equal(dbCalls.length, 1, "Expected exactly one DB upsert call");
  assert.equal(dbCalls[0].provider, "google", "DB upsert must use 'google' as provider");
});

test("CAL-01-callback-error: GET /auth/google/callback?error=access_denied redirects with google_error (D-11)", async () => {
  const stateNonce = "validstatenonce456";
  const { app } = buildApp(buildValidStateStore(stateNonce));

  const res = await app.request(`/auth/google/callback?error=access_denied&state=${stateNonce}`);

  assert.equal(res.status, 302, "Expected 302 redirect on error");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("/settings?google_error="), "Location must land on /settings with google_error param (D-10, D-11)");
  assert.ok(location.includes("access_denied"), "Location must include the error value");
});

test("CAL-01-callback-no-code: GET /auth/google/callback with no code or error redirects with no_code", async () => {
  const { app } = buildApp();

  const res = await app.request("/auth/google/callback");

  assert.equal(res.status, 302, "Expected 302 redirect");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("/settings?google_error=no_code"), "Location must include /settings?google_error=no_code");
});

test("CAL-01-state-mismatch: missing state param redirects with invalid_state", async () => {
  const { app } = buildApp();

  // code present but no state
  const res = await app.request("/auth/google/callback?code=some_code");

  assert.equal(res.status, 302, "Expected 302 redirect");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("/settings?google_error=invalid_state"), "Location must include /settings?google_error=invalid_state");
});

test("CAL-01-state-mismatch: wrong state value redirects with invalid_state", async () => {
  const stateNonce = "correctnonce789";
  const { app } = buildApp(buildValidStateStore(stateNonce));

  const res = await app.request("/auth/google/callback?code=some_code&state=wrongnonce");

  assert.equal(res.status, 302, "Expected 302 redirect");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("/settings?google_error=invalid_state"), "Wrong state must produce /settings?google_error=invalid_state");
});

// ── Phase 81-02 — GET /google/status + DELETE /google/tokens ─────────────────

test("81-02-status-404: GET /google/status returns 404 when no oauth row exists", async () => {
  const router = createCalendarAuthRouter({
    statusFn: async () => null,
  });
  const app = new Hono();
  app.route("/", router);
  const res = await app.request("/google/status");
  assert.equal(res.status, 404, "Missing row must return 404 (D-07 contract)");
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, "not_connected");
});

test("81-02-status-connected: GET /google/status returns calendar=connected, gmail=needs_auth when pre-scope row exists", async () => {
  // Pre-Phase-79 back-compat path: row exists but scopes column not populated.
  const router = createCalendarAuthRouter({
    statusFn: async () => ({ provider: "google", scopes: undefined, accountEmail: null }),
  });
  const app = new Hono();
  app.route("/", router);
  const res = await app.request("/google/status");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { calendar: string; gmail: string; email?: string };
  assert.equal(body.calendar, "connected", "Row presence implies calendar scope granted pre-Phase-79");
  assert.equal(body.gmail, "needs_auth", "Gmail requires Phase 79 scope upgrade");
});

test("81-02-status-both-scopes: GET /google/status returns both connected when scopes include gmail + calendar", async () => {
  const router = createCalendarAuthRouter({
    statusFn: async () => ({
      provider: "google",
      scopes: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      accountEmail: "user@example.com",
    }),
  });
  const app = new Hono();
  app.route("/", router);
  const res = await app.request("/google/status");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { calendar: string; gmail: string; email?: string };
  assert.equal(body.calendar, "connected");
  assert.equal(body.gmail, "connected");
  assert.equal(body.email, "user@example.com");
});

test("81-02-delete-ok: DELETE /google/tokens invokes deleteFn and returns { ok: true }", async () => {
  let deleteCalls = 0;
  const router = createCalendarAuthRouter({
    deleteFn: async () => {
      deleteCalls++;
    },
  });
  const app = new Hono();
  app.route("/", router);
  const res = await app.request("/google/tokens", { method: "DELETE" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok?: boolean };
  assert.equal(body.ok, true);
  assert.equal(deleteCalls, 1, "deleteFn must be invoked exactly once");
});

test("81-02-delete-500: DELETE /google/tokens returns 500 when deleteFn throws", async () => {
  const router = createCalendarAuthRouter({
    deleteFn: async () => {
      throw new Error("boom");
    },
  });
  const app = new Hono();
  app.route("/", router);
  const res = await app.request("/google/tokens", { method: "DELETE" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, "boom");
});

test("81-02-D10: trailing slash on PWA_URL is normalized before /settings concat", async () => {
  const origPwaUrl = process.env["PWA_URL"];
  process.env["PWA_URL"] = "http://localhost:5173/";
  try {
    const { app } = buildApp();
    const res = await app.request("/auth/google/callback");
    const location = res.headers.get("location") ?? "";
    assert.ok(
      location.startsWith("http://localhost:5173/settings?"),
      `Expected normalized /settings concat, got: ${location}`
    );
    assert.ok(!location.includes("//settings"), "Must not contain // before settings path");
  } finally {
    process.env["PWA_URL"] = origPwaUrl;
  }
});
