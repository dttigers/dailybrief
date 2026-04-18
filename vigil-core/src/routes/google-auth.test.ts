import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createGoogleAuthRouter } from "./google-auth.js";

// ── Environment Setup ─────────────────────────────────────────────────────────
process.env["GOOGLE_CLIENT_ID"] = "test-client-id";
process.env["GOOGLE_CLIENT_SECRET"] = "test-secret";
process.env["GOOGLE_REDIRECT_URI"] = "http://localhost:3001/v1/auth/google/callback";
process.env["PWA_URL"] = "http://localhost:5173";
process.env["GOOGLE_TOKEN_ENCRYPTION_KEY"] =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env["GOOGLE_OAUTH_STATE_SECRET"] = "a]".repeat(16); // 32-char test secret

// ── Mock helpers ──────────────────────────────────────────────────────────────

// Minimal id_token payload: base64url(header).base64url({email}).base64url(sig)
const MOCK_ID_TOKEN = [
  Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
  Buffer.from(JSON.stringify({ email: "test@example.com", sub: "12345" })).toString("base64url"),
  "fakesig",
].join(".");

const MOCK_TOKENS = {
  refresh_token: "mock-refresh-token",
  access_token: "mock-access-token",
  expiry_date: Date.now() + 3_600_000,
  scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly",
  id_token: MOCK_ID_TOKEN,
};

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Build an app with DI mocks for testing. */
function buildApp(overrides: {
  signStateFn?: (nonce: string, userId: number) => Promise<string>;
  verifyStateFn?: (token: string) => Promise<{ valid: true; userId: number } | { valid: false }>;
  dbUpsertCapture?: Array<{ userId: number; provider: string; scopes: string[]; accountEmail: string | null }>;
} = {}) {
  const dbCalls: Array<{ userId: number; provider: string; scopes: string[]; accountEmail: string | null }> = overrides.dbUpsertCapture ?? [];

  const router = createGoogleAuthRouter({
    // Phase 102: signStateFn now takes (nonce, userId); verifyStateFn returns userId.
    signStateFn: overrides.signStateFn ?? (async () => "test-jwt"),
    verifyStateFn: overrides.verifyStateFn ?? (async () => ({ valid: true, userId: 42 })),
    getTokenFn: async () => ({ tokens: MOCK_TOKENS }),
    dbUpsertFn: async (userId, provider, _enc, _access, _expires, scopes, accountEmail) => {
      dbCalls.push({ userId, provider, scopes, accountEmail });
    },
  });

  const app = new Hono();
  // Phase 102: /auth/google initiation requires c.get("userId") — mount a tiny
  // middleware that sets it so tests exercise the route without the bearer stack.
  app.use("*", async (c, next) => {
    c.set("userId", 42);
    await next();
  });
  app.route("/", router);

  return { app, dbCalls };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("GA-01-dual-scopes: GET /auth/google returns 302 with Google consent URL containing both calendar.readonly AND gmail.readonly scopes", async () => {
  const { app } = buildApp();
  const res = await app.request("/auth/google");

  assert.equal(res.status, 302, "Expected 302 redirect");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("accounts.google.com"), "Location must point to accounts.google.com");
  assert.ok(location.includes("calendar.readonly"), "Location must include calendar.readonly scope");
  assert.ok(location.includes("gmail.readonly"), "Location must include gmail.readonly scope");
});

test("GA-02-prompt-consent: GET /auth/google returns 302 with prompt=consent and access_type=offline", async () => {
  const { app } = buildApp();
  const res = await app.request("/auth/google");

  assert.equal(res.status, 302, "Expected 302 redirect");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("access_type=offline"), "Location must include access_type=offline");
  assert.ok(location.includes("prompt=consent"), "Location must include prompt=consent");
});

test("GA-03-callback-success: GET /auth/google/callback with valid JWT state and code redirects to PWA with google_connected=true", async () => {
  const { app, dbCalls } = buildApp({ verifyStateFn: async () => ({ valid: true, userId: 42 }) });

  const res = await app.request("/auth/google/callback?code=test_code&state=test-jwt");

  assert.equal(res.status, 302, "Expected 302 redirect after successful exchange");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.startsWith("http://localhost:5173"), "Should redirect to PWA_URL");
  assert.ok(location.includes("google_connected=true"), "Should contain google_connected=true on success");
  assert.ok(!location.includes("google_error"), "Should not contain google_error on success");

  assert.equal(dbCalls.length, 1, "Expected exactly one DB upsert call");
  assert.equal(dbCalls[0].provider, "google", "DB upsert must use 'google' as provider");
});

test("GA-04-scopes-stored: GET /auth/google/callback calls dbUpsertFn with scopes array containing both scopes", async () => {
  const dbCalls: Array<{ userId: number; provider: string; scopes: string[]; accountEmail: string | null }> = [];
  const { app } = buildApp({ dbUpsertCapture: dbCalls, verifyStateFn: async () => ({ valid: true, userId: 42 }) });

  await app.request("/auth/google/callback?code=test_code&state=test-jwt");

  assert.equal(dbCalls.length, 1, "Expected exactly one DB upsert call");
  assert.ok(dbCalls[0].scopes.includes(CALENDAR_SCOPE), "Scopes must include calendar.readonly");
  assert.ok(dbCalls[0].scopes.includes(GMAIL_SCOPE), "Scopes must include gmail.readonly");
});

test("GA-05-error-redirect: GET /auth/google/callback?error=access_denied redirects with google_error=access_denied", async () => {
  const { app } = buildApp();

  const res = await app.request("/auth/google/callback?error=access_denied&state=test-jwt");

  assert.equal(res.status, 302, "Expected 302 redirect on error");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("google_error"), "Location must include google_error param");
  assert.ok(location.includes("access_denied"), "Location must include the error value");
  assert.ok(!location.includes("calendar_error"), "Must not use old calendar_error param name");
});

test("GA-06-no-code: GET /auth/google/callback with no code redirects with google_error=no_code", async () => {
  const { app } = buildApp();

  const res = await app.request("/auth/google/callback");

  assert.equal(res.status, 302, "Expected 302 redirect");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("google_error=no_code"), "Location must include google_error=no_code");
});

test("GA-07-invalid-state: GET /auth/google/callback with expired/invalid JWT state redirects with google_error=invalid_state (OAUTH-04)", async () => {
  const { app } = buildApp({ verifyStateFn: async () => ({ valid: false }) });

  const res = await app.request("/auth/google/callback?code=some_code&state=expired-jwt");

  assert.equal(res.status, 302, "Expected 302 redirect");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("google_error=invalid_state"), "Expired/invalid JWT must produce google_error=invalid_state");
});

test("GA-08-missing-state: GET /auth/google/callback with missing state redirects with google_error=invalid_state", async () => {
  const { app } = buildApp();

  // code present but no state
  const res = await app.request("/auth/google/callback?code=some_code");

  assert.equal(res.status, 302, "Expected 302 redirect");

  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("google_error=invalid_state"), "Missing state must produce google_error=invalid_state");
});

test("GA-09-account-email-stored: callback decodes id_token and passes accountEmail to dbUpsertFn", async () => {
  const dbCalls: Array<{ userId: number; provider: string; scopes: string[]; accountEmail: string | null }> = [];
  const { app } = buildApp({ dbUpsertCapture: dbCalls, verifyStateFn: async () => ({ valid: true, userId: 42 }) });

  await app.request("/auth/google/callback?code=test_code&state=test-jwt");

  assert.equal(dbCalls.length, 1, "Expected exactly one DB upsert call");
  assert.equal(dbCalls[0].accountEmail, "test@example.com", "accountEmail must be decoded from id_token payload");
});
