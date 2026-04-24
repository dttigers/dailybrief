import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// ── Phase 102 Wave 0 — RED-by-default scaffold ────────────────────────────────
// Tests the EXTENDED bearerAuth that Plan 03 will build on top of the current
// SHA256-only middleware. Two auth paths (D-01/D-02):
//   1. vk_... prefix  → SHA256 lookup in api_keys → c.set('userId', row.userId)
//   2. two-dot JWT    → jose.jwtVerify HS256      → c.set('userId', Number(claims.sub))
//   3. anything else  → 401 "Unrecognized token format"
//
// The `bearerAuth` import succeeds today (file exists), but `../utils/jwt.js`
// does NOT exist — so the JWT path tests fail at module resolution. That's the
// Wave 0 RED signal for this file.
// -----------------------------------------------------------------------------

process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

const { bearerAuth } = await import("./auth.js");
const { signToken } = await import("../utils/jwt.js"); // Plan 02 creates this

// Build a mini app for dispatch tests
function buildApp() {
  const app = new Hono();
  app.use("*", bearerAuth);
  app.get("/whoami", (c) => c.json({ userId: c.get("userId") }));
  return app;
}

describe("bearerAuth — token-type detection (D-01, D-02)", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await buildApp().fetch(new Request("http://x/whoami"));
    assert.equal(res.status, 401);
  });

  it("returns 401 when Authorization header has no Bearer prefix", async () => {
    const res = await buildApp().fetch(
      new Request("http://x/whoami", { headers: { Authorization: "Basic abc" } }),
    );
    assert.equal(res.status, 401);
  });

  it("returns 401 when Authorization header is 'Bearer ' with empty token", async () => {
    const res = await buildApp().fetch(
      new Request("http://x/whoami", { headers: { Authorization: "Bearer " } }),
    );
    assert.equal(res.status, 401);
  });

  it("JWT path: valid HS256 token → 200 + c.get('userId') matches claim sub (D-02)", async (t) => {
    // Phase 110 (AUTH-09) note: Plan 02 inserted the passwordChangedAt iat-gate
    // in Path 2, which adds a SELECT against the users table on every JWT request.
    // When DATABASE_URL is unset, `db` is null and the gate returns 503. Skip the
    // happy-path assertion in that environment. The CP-GATE-01..05 suite below
    // exercises this path with a real DB.
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required (Phase 110 gate adds users-table SELECT on JWT path)");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    if (!db) {
      t.skip("db not initialized");
      return;
    }

    // Insert a throwaway user with passwordChangedAt 1h ago so a freshly-minted
    // JWT (iat = now) passes the strict-less-than gate.
    const nowMs = Date.now();
    const [created] = await db
      .insert(users)
      .values({
        email: `jwt-pass-${nowMs}@test.local`,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWw$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXk",
        passwordChangedAt: new Date(nowMs - 3600 * 1000),
      })
      .returning({ id: users.id, email: users.email });

    try {
      const tok = await signToken(created.id, created.email);
      const res = await buildApp().fetch(
        new Request("http://x/whoami", {
          headers: { Authorization: `Bearer ${tok}` },
        }),
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as { userId: number };
      assert.equal(body.userId, created.id);
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("JWT path: tampered signature → 401", async () => {
    const tok = await signToken(42, "e@t.local");
    const parts = tok.split(".");
    const tampered = `${parts[0]}.${parts[1]}.AAAAA`;
    const res = await buildApp().fetch(
      new Request("http://x/whoami", {
        headers: { Authorization: `Bearer ${tampered}` },
      }),
    );
    assert.equal(res.status, 401);
  });

  it("JWT path: expired token → 401", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env["JWT_SECRET"]!);
    const expired = await new SignJWT({ email: "e@t.local" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);
    const res = await buildApp().fetch(
      new Request("http://x/whoami", {
        headers: { Authorization: `Bearer ${expired}` },
      }),
    );
    assert.equal(res.status, 401);
  });

  it("Malformed path: neither vk_ prefix nor 2-dot shape → 401 'Unrecognized token format' (D-02)", async () => {
    const res = await buildApp().fetch(
      new Request("http://x/whoami", {
        headers: { Authorization: "Bearer garbage" },
      }),
    );
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string };
    assert.match(
      body.error,
      /Unrecognized token format|Invalid/,
      "D-02 error copy not pinned",
    );
  });

  it("Malformed path: 'vk_' prefix with dots (e.g. vk_abc.def) → 401 rejected pre-lookup", async () => {
    const res = await buildApp().fetch(
      new Request("http://x/whoami", {
        headers: { Authorization: "Bearer vk_abc.def.ghi" },
      }),
    );
    assert.equal(res.status, 401);
  });

  it("vk_ path: unknown key hash → 401 (skips gracefully if DATABASE_URL unset)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const res = await buildApp().fetch(
      new Request("http://x/whoami", {
        headers: {
          Authorization:
            "Bearer vk_0000000000000000000000000000000000000000000000000000000000000000",
        },
      }),
    );
    assert.equal(res.status, 401);
  });

  it.skip("TODO Plan 03: vk_ path with valid key sets c.get('userId') to row.userId", () => {
    // Requires live DB seed + api_keys row with known userId. Wired in Plan 03.
  });

  it.skip("TODO Plan 03: vk_ path where row has NULL userId returns 500 (Pitfall 4 — pre-migration orphan)", () => {
    // Defensive: post-migration NOT NULL should prevent this, but fail-loud in middleware.
  });
});
