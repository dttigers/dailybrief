process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createAuthMeRouter } from "./auth-me.js";

function buildAppWithUserId(router: Hono, userId: number | undefined): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (userId !== undefined) c.set("userId", userId);
    await next();
  });
  app.route("/v1", router);
  return app;
}

describe("GET /v1/auth/me (AUTH-11 D-27)", () => {
  it("AUTH-11-ME-01: returns id+email+emailVerifiedAt (ISO) for verified user", async () => {
    const router = createAuthMeRouter({
      userLookupFn: async () => ({
        id: 42,
        email: "u@x.io",
        emailVerifiedAt: new Date("2026-04-25T12:00:00Z"),
      }),
    });
    const app = buildAppWithUserId(router, 42);
    const res = await app.request("/v1/auth/me");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, 42);
    assert.equal(typeof body.id, "number"); // NOT string — distinct from /v1/me
    assert.equal(body.email, "u@x.io");
    assert.equal(body.emailVerifiedAt, "2026-04-25T12:00:00.000Z");
  });

  it("AUTH-11-ME-02: emailVerifiedAt === null when DB column is null", async () => {
    const router = createAuthMeRouter({
      userLookupFn: async () => ({ id: 7, email: "u@x.io", emailVerifiedAt: null }),
    });
    const res = await buildAppWithUserId(router, 7).request("/v1/auth/me");
    const body = await res.json();
    assert.strictEqual(body.emailVerifiedAt, null);
  });

  it("AUTH-11-ME-03: 401 invalid_user when row does not exist", async () => {
    const router = createAuthMeRouter({ userLookupFn: async () => null });
    const res = await buildAppWithUserId(router, 999).request("/v1/auth/me");
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "invalid_user" });
  });

  it("AUTH-11-ME-04: 401 when c.get('userId') is missing", async () => {
    const router = createAuthMeRouter({
      userLookupFn: async () => {
        throw new Error("must not call");
      },
    });
    const res = await buildAppWithUserId(router, undefined).request("/v1/auth/me");
    assert.equal(res.status, 401);
  });

  it("AUTH-11-ME-05: response body has exactly 3 keys (D-27 minimal)", async () => {
    const router = createAuthMeRouter({
      userLookupFn: async () => ({ id: 1, email: "a@b.c", emailVerifiedAt: null }),
    });
    const res = await buildAppWithUserId(router, 1).request("/v1/auth/me");
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["email", "emailVerifiedAt", "id"]);
  });
});
