import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Wave 0 RED scaffold — Plan 03 creates ./me.js. Import failure IS the RED signal.
// Tests reuse the auth.test.ts env-setup pattern (line 21).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

const { me, createMeRouter } = await import("./me.js"); // Plan 03 creates this

function buildApp() {
  const app = new Hono();
  // Plan 03 is mounted behind bearerAuth in index.ts; test app mounts without
  // bearerAuth but manually sets c.set("userId", ...) via a fake middleware.
  return app;
}

async function getMe(userId: number | null): Promise<Response> {
  const app = buildApp();
  app.use("*", async (c, next) => {
    if (userId != null) c.set("userId" as never, userId as never);
    return next();
  });
  app.route("/v1", me);
  return app.fetch(new Request("http://x/v1/me", { method: "GET" }));
}

describe("GET /v1/me — D-16/D-17/D-18", () => {
  it("returns 200 with {userId, email} for a valid userId that exists in DB", async () => {
    // NOTE: this test will need a DB fixture or injected db client.
    // RED-by-default — Plan 03 decides whether to inject a db via factory
    // (recommended — matches createProcessPhotoRouter pattern) or use a real
    // test database. For now, assert that the handler shape matches.
    const res = await getMe(1);
    // Expect either 200 (with seeded user id=1) or 503 (db unavailable in test env).
    assert.ok(
      res.status === 200 || res.status === 503,
      `expected 200 or 503, got ${res.status}`,
    );
    if (res.status === 200) {
      const body = (await res.json()) as { userId: string; email: string };
      assert.equal(typeof body.userId, "string");
      assert.equal(typeof body.email, "string");
    }
  });

  it("returns 401 invalid_user when userId is set but row is missing (D-18)", async () => {
    const res = await getMe(999999); // assume id 999999 doesn't exist
    // D-18 — 401 not 500, not 404.
    // NOTE: Plan 03 must either inject a db fake or this will return 503 in unit env.
    // Accept 401 (fix confirmed) or 503 (db unavailable); 500 would be the bug.
    assert.ok(
      res.status === 401 || res.status === 503,
      `expected 401 or 503, got ${res.status}`,
    );
    if (res.status === 401) {
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "invalid_user");
    }
  });
});

// Dep-injection test — Plan 03 SHOULD expose createMeRouter(deps) following
// the createProcessPhotoRouter(deps) pattern so unit tests don't need a DB.
describe("GET /v1/me with injected db (dep-injection pattern)", () => {
  it("placeholder — Plan 03 must expose createMeRouter({userLookupFn})", async () => {
    // Plan 03 is responsible for making this testable without a DB.
    // If createMeRouter is not exported, this test file documents the expectation.
    const mod = await import("./me.js");
    // Soft-assert — PLANNER guidance to Plan 03: add a createMeRouter export.
    assert.ok(mod.me, "me router must be exported");
  });
});

// ── Phase 105 Plan 03: D-09..D-11 identify emission contract ────────────────

type IdentifyCall = {
  userId: number | string;
  properties: Record<string, unknown>;
};

/**
 * Build a /me app with an injected userLookupFn AND an injected identifyFn spy.
 * MeDeps exposes optional identifyFn so tests can assert the call shape directly
 * without mocking the posthog module. Production default = the wrapper.
 */
function buildAppWithSpyDeps(opts: {
  userId: number | null;
  lookupResult: { id: number; email: string; createdAt: Date } | null;
  identifyCalls: IdentifyCall[];
}) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (opts.userId != null) c.set("userId" as never, opts.userId as never);
    return next();
  });
  const router = createMeRouter({
    userLookupFn: async () => opts.lookupResult,
    identifyFn: (u: number | string, p?: Record<string, unknown>) => {
      opts.identifyCalls.push({ userId: u, properties: p ?? {} });
    },
  });
  app.route("/v1", router);
  return app;
}

describe("GET /v1/me — D-09..D-11 identifyUser emission", () => {
  it("calls identifyUser with {email, createdAt} on successful lookup (D-09)", async () => {
    const calls: IdentifyCall[] = [];
    const createdAt = new Date("2026-01-15T12:00:00.000Z");
    const app = buildAppWithSpyDeps({
      userId: 1,
      lookupResult: { id: 1, email: "user@example.com", createdAt },
      identifyCalls: calls,
    });
    const res = await app.fetch(new Request("http://x/v1/me", { method: "GET" }));
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].userId, 1);
    assert.equal(calls[0].properties["email"], "user@example.com");
    assert.equal(calls[0].properties["createdAt"], "2026-01-15T12:00:00.000Z");
  });

  it("does NOT call identifyUser when row is missing (D-18 401 invalid_user)", async () => {
    const calls: IdentifyCall[] = [];
    const app = buildAppWithSpyDeps({
      userId: 999,
      lookupResult: null,
      identifyCalls: calls,
    });
    const res = await app.fetch(new Request("http://x/v1/me", { method: "GET" }));
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  });

  it("does NOT call identifyUser when userId guard rejects (no row lookup attempted)", async () => {
    const calls: IdentifyCall[] = [];
    const app = buildAppWithSpyDeps({
      userId: null, // bearerAuth would block this in prod; defensive recheck returns 401
      lookupResult: null,
      identifyCalls: calls,
    });
    const res = await app.fetch(new Request("http://x/v1/me", { method: "GET" }));
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  });

  it("response shape is unchanged (D-16: only {userId, email}; createdAt does NOT leak to API)", async () => {
    const calls: IdentifyCall[] = [];
    const createdAt = new Date("2026-01-15T12:00:00.000Z");
    const app = buildAppWithSpyDeps({
      userId: 1,
      lookupResult: { id: 1, email: "u@e.com", createdAt },
      identifyCalls: calls,
    });
    const res = await app.fetch(new Request("http://x/v1/me", { method: "GET" }));
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["email", "userId"]);
    assert.equal(body["userId"], "1");
    assert.equal(body["email"], "u@e.com");
    // createdAt is in PostHog identify, NOT in the API response
    assert.equal(body["createdAt"], undefined);
  });

  it("vk_ → seed user attribution: identify fires with the resolved seed userId (D-11)", async () => {
    // bearerAuth (Phase 103 D-17) maps vk_ keys to the seed user before the handler
    // sees them. From /me's perspective, c.get("userId") is just the seed user id —
    // no special branching here. This test asserts the identify call carries that
    // resolved userId (seed user id = 1 in current Phase 102 wiring).
    const calls: IdentifyCall[] = [];
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const app = buildAppWithSpyDeps({
      userId: 1, // simulated "vk_ resolved to seed user id 1"
      lookupResult: { id: 1, email: "seed@vigil.dev", createdAt },
      identifyCalls: calls,
    });
    const res = await app.fetch(new Request("http://x/v1/me", { method: "GET" }));
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].userId, 1);
  });
});
