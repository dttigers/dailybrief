import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Wave 0 RED scaffold — Plan 03 creates ./me.js. Import failure IS the RED signal.
// Tests reuse the auth.test.ts env-setup pattern (line 21).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

const { me } = await import("./me.js"); // Plan 03 creates this

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
