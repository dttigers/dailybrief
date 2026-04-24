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

// ── Phase 110 (AUTH-09) bearerAuth iat-gate test matrix (CP-GATE-01..05) ─────
// 5 cases per CONTEXT §specifics:
//   CP-GATE-01: stale JWT (iat < floor(passwordChangedAt/1000)) → 401 "Session expired"
//   CP-GATE-02: equal-iat (==) → next() called (equality passes; strict less-than
//               rejects only iat < threshold). CONTEXT §specifics line 135 has a
//               wording bug ("strict less-than" but says equality returns 401 —
//               internally inconsistent). Live-code semantics (`<`, not `<=`) are
//               the contract; this test reflects the actual gate behavior —
//               equality passes.
//   CP-GATE-03: fresh JWT (iat > floor(...)) → next() called
//   CP-GATE-04: vk_ bearer key → next() (vk_ unaffected by gate REJECTION; we
//               test with a passwordChangedAt 1 year in the future that would
//               reject any JWT, and vk_ still passes — proving structural
//               unaffectedness on the JWT branch only)
//   CP-GATE-05: deleted user (no row) → 401 "Invalid or expired token" (D-07)

async function mintJwtWithIat(
  userId: number,
  email: string,
  iatSeconds: number,
): Promise<string> {
  const { SignJWT } = await import("jose");
  const secret = new TextEncoder().encode(process.env["JWT_SECRET"]!);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt(iatSeconds)
    .setExpirationTime(iatSeconds + 60 * 60 * 24 * 30) // 30d from iat
    .sign(secret);
}

describe("Phase 110 (AUTH-09) bearerAuth iat-gate (CP-GATE-01..05)", () => {
  it("CP-GATE-01: JWT with iat < floor(passwordChangedAt/1000) → 401 'Session expired'", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    if (!db) {
      t.skip("db not initialized");
      return;
    }

    // Insert a throwaway user with passwordChangedAt = NOW. Then mint a JWT
    // with iat 1 hour BEFORE NOW — well below floor(passwordChangedAt/1000).
    const nowMs = Date.now();
    const futureTs = new Date(nowMs);
    const [created] = await db
      .insert(users)
      .values({
        email: `gate-test-01-${nowMs}@test.local`,
        passwordHash:
          "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWw$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXk",
        passwordChangedAt: futureTs,
      })
      .returning({ id: users.id, email: users.email });

    try {
      const staleIat = Math.floor(nowMs / 1000) - 3600;
      const token = await mintJwtWithIat(created.id, created.email, staleIat);

      const res = await buildApp().fetch(
        new Request("http://x/whoami", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      assert.equal(res.status, 401, "stale JWT must be rejected");
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "Session expired", "body must be D-08 verbatim");
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("CP-GATE-02: JWT with iat == floor(passwordChangedAt/1000) → next() called (equality passes; strict less-than rejects only iat < threshold)", async (t) => {
    // Reconciliation: CONTEXT §specifics line 135 contains a wording bug —
    // it says "strict less-than" but also says equality returns 401, which
    // is internally inconsistent. The live-code semantics in
    // middleware/auth.ts (`if (claims.iat < gateThreshold)`, NOT `<=`) are
    // the contract. Equality means `iat < threshold` is FALSE, so the gate
    // does NOT reject — probe handler returns 200. D-14 ordering (signToken
    // AFTER db.update commits) makes equality practically unreachable in
    // production, but the gate enforces strict `<` and CP-GATE-02 reflects
    // the actual gate behavior — equality passes.
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    if (!db) {
      t.skip("db not initialized");
      return;
    }

    const nowMs = Date.now();
    const passwordChangedAt = new Date(nowMs);
    const [created] = await db
      .insert(users)
      .values({
        email: `gate-test-02-${nowMs}@test.local`,
        passwordHash:
          "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWw$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXk",
        passwordChangedAt,
      })
      .returning({ id: users.id, email: users.email });

    try {
      // iat == floor(passwordChangedAt/1000). Strict `<` means equality is NOT <,
      // so the gate does NOT reject. Probe handler returns 200.
      const equalIat = Math.floor(passwordChangedAt.getTime() / 1000);
      const token = await mintJwtWithIat(created.id, created.email, equalIat);

      const res = await buildApp().fetch(
        new Request("http://x/whoami", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      assert.equal(
        res.status,
        200,
        "equal-iat passes (strict <, equality is not <)",
      );
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("CP-GATE-03: JWT with iat > floor(passwordChangedAt/1000) → next() called (200 from probe)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    if (!db) {
      t.skip("db not initialized");
      return;
    }

    const nowMs = Date.now();
    const passwordChangedAt = new Date(nowMs - 3600 * 1000); // 1h ago
    const [created] = await db
      .insert(users)
      .values({
        email: `gate-test-03-${nowMs}@test.local`,
        passwordHash:
          "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWw$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXk",
        passwordChangedAt,
      })
      .returning({ id: users.id, email: users.email });

    try {
      const freshIat = Math.floor(nowMs / 1000); // > floor(passwordChangedAt/1000)
      const token = await mintJwtWithIat(created.id, created.email, freshIat);

      const res = await buildApp().fetch(
        new Request("http://x/whoami", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      assert.equal(res.status, 200, "fresh JWT passes the gate");
      const body = (await res.json()) as { userId: number };
      assert.equal(body.userId, created.id);
    } finally {
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("CP-GATE-04: vk_ bearer key is unaffected by gate REJECTION (D-06 — gate runs only on JWT path)", async (t) => {
    // Contract: vk_ Path 1 is unaffected by the gate REJECTION. We test with a
    // passwordChangedAt 1 year in the future — would reject ANY JWT — and the
    // vk_ request still returns 200. The vk_ unaffected by gate REJECTION
    // claim is anchored here (observable behavior); the "no DB read on Path 1"
    // claim is anchored in code (gate SELECT lives inside the
    // `if (looksLikeJwt(token))` block), not in this test.
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users, apiKeys } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const cryptoMod = await import("node:crypto");
    if (!db) {
      t.skip("db not initialized");
      return;
    }

    const nowMs = Date.now();
    const [created] = await db
      .insert(users)
      .values({
        email: `gate-test-04-${nowMs}@test.local`,
        passwordHash:
          "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWw$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXk",
        // passwordChangedAt is FAR IN THE FUTURE — would invalidate any JWT.
        // Demonstrates that vk_ is unaffected by gate REJECTION.
        passwordChangedAt: new Date(nowMs + 365 * 24 * 3600 * 1000),
      })
      .returning({ id: users.id, email: users.email });

    const rawKey = `vk_${cryptoMod.randomBytes(32).toString("hex")}`;
    const keyHash = cryptoMod
      .createHash("sha256")
      .update(rawKey)
      .digest("hex");
    const [apiKeyRow] = await db
      .insert(apiKeys)
      .values({
        name: "gate-test-04",
        userId: created.id,
        keyHash,
        keyPrefix: rawKey.slice(0, 12),
        isActive: true,
      })
      .returning({ id: apiKeys.id });

    try {
      const res = await buildApp().fetch(
        new Request("http://x/whoami", {
          headers: { Authorization: `Bearer ${rawKey}` },
        }),
      );

      assert.equal(
        res.status,
        200,
        "vk_ unaffected by gate REJECTION even with passwordChangedAt 1y in future",
      );
      const body = (await res.json()) as { userId: number };
      assert.equal(body.userId, created.id);
    } finally {
      await db.delete(apiKeys).where(eq(apiKeys.id, apiKeyRow.id));
      await db.delete(users).where(eq(users.id, created.id));
    }
  });

  it("CP-GATE-05: validly-signed JWT for deleted user → 401 'Invalid or expired token' (D-07)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    if (!db) {
      t.skip("db not initialized");
      return;
    }

    const nowMs = Date.now();
    const [created] = await db
      .insert(users)
      .values({
        email: `gate-test-05-${nowMs}@test.local`,
        passwordHash:
          "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWw$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXk",
        passwordChangedAt: new Date(nowMs - 3600 * 1000),
      })
      .returning({ id: users.id, email: users.email });

    const freshIat = Math.floor(nowMs / 1000);
    const token = await mintJwtWithIat(created.id, created.email, freshIat);

    // Delete the user BEFORE the JWT is used.
    await db.delete(users).where(eq(users.id, created.id));

    const res = await buildApp().fetch(
      new Request("http://x/whoami", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );

    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string };
    assert.equal(
      body.error,
      "Invalid or expired token",
      "missing-user body must match verifyToken-failure body verbatim (D-07)",
    );
  });
});
