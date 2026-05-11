// ── Phase 126 Wave 0 — RED-by-default scaffold (AUTH-126-03 / D-02 / Plan 126-04) ─
// Pins the public surface of vigil-core/src/middleware/require-verified-email.ts
// BEFORE Wave 1 creates the production module. Until then every behavior test
// fails at module resolution. The two drift detectors fail with ENOENT until
// the source file lands. That is the intended RED state.
//
// Behavior matrix (CONTEXT D-02 — 24h grace window):
//   - verified user (emailVerifiedAt non-null) on /v1/sessions → next() → 200
//   - unverified user signed up 5min ago    → next() (within grace) → 200
//   - unverified user signed up 25h ago     → 403 EMAIL_NOT_VERIFIED + verified_after_iso
//   - bypass /v1/health                      → 200 even with unverified+expired user
//   - bypass /v1/auth/resend-verification    → 200 even with unverified+expired user
//
// Drift detectors:
//   - AUTH-126-VERIFY-BYPASS: source contains literal "/v1/health" AND "/v1/auth/"
//   - AUTH-126-VERIFY-TOKEN-SUBJECT-CODE: source contains "INVALID_TOKEN_SUBJECT"
//     (Plan 04 extension code — distinct from D-04 INVALID_CREDENTIALS which is
//     login-only; this code is the middleware's "JWT sub claim isn't a user id"
//     short-circuit).
//
// Test app composition: minimal Hono app injects a fake bearerAuth stub that
// sets c.set('userId', ...) and an in-memory users-table stub keyed by userId.
// The require-verified-email middleware reads from c.get('userId') and queries
// the (stubbed) users table. We do NOT exercise the real db here — that's
// Wave 1's integration concern; Wave 0 locks the contract shape.
//
// Run: cd vigil-core && npx tsx --test src/middleware/require-verified-email.test.ts
// -----------------------------------------------------------------------------

process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// The `./require-verified-email.js` module is created by Plan 126-04.
// DI seam (__setUserLookupForTest) lets us stub the users-table lookup
// without spinning up Postgres in unit tests — mirror of the auth.ts
// __setSendEmailVerificationEmailForTest pattern.
const verifyModule = await import("./require-verified-email.js");
const {
  requireVerifiedEmailWithGrace,
  __setUserLookupForTest,
  __resetUserLookupForTest,
} = verifyModule as {
  requireVerifiedEmailWithGrace: import("hono").MiddlewareHandler;
  __setUserLookupForTest: (
    fn: (
      userId: number,
    ) => Promise<
      | { emailVerifiedAt: Date | null; createdAt: Date }
      | null
      | "db-unavailable"
    >,
  ) => void;
  __resetUserLookupForTest: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
// Build a mini app with a fake bearerAuth that injects a known userId, then
// mount the middleware under test, then a stub /v1/sessions handler returning 200.

interface FakeUser {
  id: number;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

function buildApp(injectedUser: FakeUser | null) {
  // Stub the user lookup so the middleware reads from the in-memory fake
  // instead of hitting Postgres. Reset is callers' responsibility (handled
  // by the per-test `__resetUserLookupForTest()` call below).
  __setUserLookupForTest(async (userId: number) => {
    if (!injectedUser) return null;
    if (userId !== injectedUser.id) return null;
    return {
      emailVerifiedAt: injectedUser.emailVerifiedAt,
      createdAt: injectedUser.createdAt,
    };
  });
  const app = new Hono();
  // Fake bearerAuth: set userId to 42 (matches injectedUser.id) on every request.
  app.use("/v1/*", async (c, next) => {
    if (injectedUser) c.set("userId" as never, injectedUser.id as never);
    await next();
  });
  app.use("/v1/*", requireVerifiedEmailWithGrace);
  app.get("/v1/sessions", (c) => c.json({ ok: true, sessions: [] }));
  app.get("/v1/health", (c) => c.json({ ok: true }));
  app.post("/v1/auth/resend-verification", (c) => c.json({ ok: true }));
  return app;
}

async function get(app: ReturnType<typeof buildApp>, path: string): Promise<Response> {
  return app.fetch(
    new Request(`http://x${path}`, {
      method: "GET",
      headers: { Authorization: "Bearer fake-token" },
    }),
  );
}

describe("requireVerifiedEmailWithGrace — AUTH-126-03 / D-02 (24h grace matrix)", () => {
  // node:test has no built-in beforeEach/afterEach when using describe/it
  // import style without t.beforeEach — buildApp() reinjects the lookup at
  // the top of every test (overwriting any prior state) and a final reset
  // restores the real DB lookup so other suites aren't polluted.
  // Cleanup runs implicitly when this module's tests finish (no other suite
  // imports this DI seam directly), but we still expose __resetUserLookupForTest
  // for any future suite that mounts the middleware in a different shape.

  it("AUTH-126-VERIFY-PASS-VERIFIED: verified user (emailVerifiedAt non-null) → next() → 200", async () => {
    const user: FakeUser = {
      id: 42,
      emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const app = buildApp(user);
    const res = await get(app, "/v1/sessions");
    assert.equal(res.status, 200, "verified user must pass — middleware calls next() regardless of createdAt age");
  });

  it("AUTH-126-VERIFY-PASS-IN-GRACE: unverified user signed up 5min ago → next() (within 24h grace) → 200", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const user: FakeUser = {
      id: 42,
      emailVerifiedAt: null,
      createdAt: fiveMinAgo,
    };
    const app = buildApp(user);
    const res = await get(app, "/v1/sessions");
    assert.equal(res.status, 200, "unverified user within 24h grace must pass");
  });

  it("AUTH-126-VERIFY-GATE-POST-GRACE: unverified user signed up 25h ago → 403 EMAIL_NOT_VERIFIED + verified_after_iso", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const user: FakeUser = {
      id: 42,
      emailVerifiedAt: null,
      createdAt: twentyFiveHoursAgo,
    };
    const app = buildApp(user);
    const res = await get(app, "/v1/sessions");
    assert.equal(res.status, 403, "unverified user past 24h grace must be gated");
    const body = (await res.json()) as {
      error?: string;
      code?: string;
      verified_after_iso?: string;
    };
    assert.equal(body.code, "EMAIL_NOT_VERIFIED", "response must include code:'EMAIL_NOT_VERIFIED'");
    assert.equal(
      typeof body.verified_after_iso,
      "string",
      "response must include verified_after_iso ISO timestamp so PWA can show countdown",
    );
    // Sanity: ISO parses to a date in the past (createdAt + 24h relative to 25h-ago test)
    const parsed = body.verified_after_iso ? new Date(body.verified_after_iso) : null;
    assert.ok(
      parsed && !Number.isNaN(parsed.getTime()),
      "verified_after_iso must be a parseable ISO 8601 string",
    );
  });

  it("AUTH-126-VERIFY-BYPASS-HEALTH: /v1/health bypasses the gate even with unverified+expired user", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const user: FakeUser = {
      id: 42,
      emailVerifiedAt: null,
      createdAt: twentyFiveHoursAgo,
    };
    const app = buildApp(user);
    const res = await get(app, "/v1/health");
    assert.equal(res.status, 200, "/v1/health must bypass the verify gate (smoke endpoint)");
  });

  it("AUTH-126-VERIFY-BYPASS-RESEND: /v1/auth/resend-verification bypasses the gate", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const user: FakeUser = {
      id: 42,
      emailVerifiedAt: null,
      createdAt: twentyFiveHoursAgo,
    };
    const app = buildApp(user);
    const res = await app.fetch(
      new Request("http://x/v1/auth/resend-verification", {
        method: "POST",
        headers: { Authorization: "Bearer fake-token" },
      }),
    );
    assert.equal(
      res.status,
      200,
      "/v1/auth/resend-verification must bypass the verify gate — otherwise users can't escape the gate",
    );
  });

  // ── AUTH-126-VERIFY-BYPASS: drift detector ─────────────────────────────────
  it("AUTH-126-VERIFY-BYPASS: source contains both '/v1/health' AND '/v1/auth/' literals (bypass list lock)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "require-verified-email.ts"), "utf8");
    assert.match(
      src,
      /"\/v1\/health"|'\/v1\/health'/,
      "require-verified-email.ts must declare '/v1/health' literal in bypass list",
    );
    assert.match(
      src,
      /"\/v1\/auth\/"|'\/v1\/auth\/'/,
      "require-verified-email.ts must declare '/v1/auth/' prefix literal in bypass list",
    );
  });

  // ── Cleanup: restore real DB lookup so suite ordering doesn't leak the
  //    in-memory fake into any subsequent test file that imports this
  //    middleware via the production singleton. Lives as its own it() block
  //    because node:test lacks a top-level afterEach hook with this describe
  //    style. Test always passes — the side-effect IS the assertion.
  it("cleanup: restore real DB lookup", () => {
    __resetUserLookupForTest();
  });

  // ── AUTH-126-VERIFY-TOKEN-SUBJECT-CODE: drift detector ────────────────────
  it("AUTH-126-VERIFY-TOKEN-SUBJECT-CODE: source contains literal 'INVALID_TOKEN_SUBJECT' (Plan 04 extension code)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "require-verified-email.ts"), "utf8");
    assert.match(
      src,
      /"INVALID_TOKEN_SUBJECT"|'INVALID_TOKEN_SUBJECT'/,
      "require-verified-email.ts must declare 'INVALID_TOKEN_SUBJECT' extension code — distinct from D-04 INVALID_CREDENTIALS (login-only)",
    );
  });
});
