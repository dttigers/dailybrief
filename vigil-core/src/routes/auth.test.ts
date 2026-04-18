import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// ── Phase 102 Wave 0 — RED-by-default scaffold ────────────────────────────────
// Tests POST /v1/auth/register + POST /v1/auth/login end-to-end via app.fetch
// dispatch (no listening port — matches calendar.test.ts / settings.test.ts).
//
// Pins:
//   - D-08:  VIGIL_ALLOWED_EMAILS env var gates registration; 403 generic msg if non-allowed
//   - D-10:  Allowlist unset → 503 "Registration not configured" (fail-closed)
//   - D-11:  Seed-user claim flow — register over placeholder-hash = 201; any other existing = 409
//   - D-12:  Login issues HS256 JWT, 30d exp
//   - Pitfall 5: Email case-insensitive on both allowlist AND DB insert
//   - Pitfall 9: password.length > 128 → 400 before argon2 invocation
//
// The `./auth.js` module does NOT exist yet — Plan 03 creates it. Import
// failure IS the Wave 0 RED signal for this file.
// -----------------------------------------------------------------------------

process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";
// Test-only — each test sets/unsets VIGIL_ALLOWED_EMAILS as needed.

const { auth } = await import("./auth.js"); // Plan 03 creates this

function buildApp() {
  const app = new Hono();
  app.route("/v1", auth);
  return app;
}

async function post(path: string, body: unknown) {
  return buildApp().fetch(
    new Request(`http://x${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /v1/auth/register — allowlist + claim-flow (D-08..D-11)", () => {
  it("returns 503 'Registration not configured' when VIGIL_ALLOWED_EMAILS is unset (D-10 fail-closed)", async () => {
    delete process.env["VIGIL_ALLOWED_EMAILS"];
    const res = await post("/v1/auth/register", {
      email: "anyone@test.local",
      password: "validpass123",
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Registration not configured/);
  });

  it("returns 503 when VIGIL_ALLOWED_EMAILS is empty string (D-10 fail-closed)", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "";
    const res = await post("/v1/auth/register", {
      email: "anyone@test.local",
      password: "validpass123",
    });
    assert.equal(res.status, 503);
  });

  it("returns 403 with generic 'not open to this address' for non-allowlisted email (D-08, no enumeration)", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "jamesonmorrill1@gmail.com";
    const res = await post("/v1/auth/register", {
      email: "eve@evil.com",
      password: "validpass123",
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    // Generic — must NOT reveal allowlist contents
    assert.ok(
      !body.error.toLowerCase().includes("jamesonmorrill1"),
      "403 body leaked allowlist contents",
    );
  });

  it("allowlist is lowercase-matched — submit 'UPPER@CASE.com', allowlist 'upper@case.com' → not 403 (Pitfall 5)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    process.env["VIGIL_ALLOWED_EMAILS"] = "upper@case.com";
    // Expect NOT 403 (may be 201 or 409 depending on DB state; the point is allowlist didn't reject)
    const res = await post("/v1/auth/register", {
      email: "UPPER@CASE.com",
      password: "validpass123",
    });
    assert.notEqual(res.status, 403);
  });

  it("returns 400 for password < 12 chars", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "short@test.local";
    const res = await post("/v1/auth/register", {
      email: "short@test.local",
      password: "short",
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 for password > 128 chars (Pitfall 9 DoS guard)", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "long@test.local";
    const res = await post("/v1/auth/register", {
      email: "long@test.local",
      password: "a".repeat(129),
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 when email or password missing / wrong type", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "e@t.local";
    assert.equal(
      (await post("/v1/auth/register", { email: "e@t.local" })).status,
      400,
    );
    assert.equal(
      (await post("/v1/auth/register", { password: "validpass123" })).status,
      400,
    );
    assert.equal(
      (await post("/v1/auth/register", { email: 42, password: "validpass123" }))
        .status,
      400,
    );
  });

  it.skip("TODO Plan 03: claim-flow — seed user with placeholder hash → register overwrites, returns 201 + claimed:true (D-11)", () => {
    // Requires DB seeded with placeholder argon2id hash ($argon2id$v=19$m=19456,t=2,p=1$PLACEHOLDER...)
  });

  it.skip("TODO Plan 03: existing user with REAL hash → 409 with generic body (no existence leak)", () => {
    // 403 + 409 must share generic copy to prevent allowlist-membership enumeration via error asymmetry.
  });

  it.skip("TODO Plan 03: brand-new allowlisted user → 201 + { id, email } (happy path)", () => {
    // Requires DB insert + users table (Plan 01). Skipped until live DB wired.
  });

  it.skip("TODO Plan 03: register response does NOT include a JWT (RESEARCH Anti-Patterns — login is the JWT-issuing endpoint)", () => {});
});

describe("POST /v1/auth/login — generic errors + JWT mint (D-12..D-15)", () => {
  it("returns 400 for malformed payload (email wrong type)", async () => {
    const res = await post("/v1/auth/login", { email: 42 });
    assert.equal(res.status, 400);
  });

  it("returns 400 for missing password", async () => {
    const res = await post("/v1/auth/login", { email: "e@t.local" });
    assert.equal(res.status, 400);
  });

  it.skip("TODO Plan 03: valid credentials → 200 + { token, user: { id, email } } where token verifies via verifyToken()", () => {});

  it.skip("TODO Plan 03: wrong password → 401 'Invalid credentials' (generic)", () => {});

  it.skip("TODO Plan 03: nonexistent email → 401 'Invalid credentials' (SAME body as wrong password — no enumeration)", () => {});

  it.skip("TODO Plan 03: placeholder-hash user → 401 (must claim via register first, D-11)", () => {});

  it.skip("TODO Plan 03: login response time is within 3x of a miss (timing-safe via dummy-hash verify on miss)", () => {});
});
