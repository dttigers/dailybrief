import { describe, it, beforeEach, mock } from "node:test";
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

const {
  auth,
  __setSendEmailVerificationEmailForTest,
  __resetSendEmailVerificationEmailForTest,
  __setRegisterTurnstileFnForTest,
  __resetRegisterTurnstileFnForTest,
  __resetRegisterBucketsForTest,
} = await import("./auth.js"); // Plan 03 creates this

function buildApp() {
  const app = new Hono();
  app.route("/v1", auth);
  return app;
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return buildApp().fetch(
    new Request(`http://x${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

// Phase 126 (D-01 / AUTH-126-02): happy-path Turnstile stub. Tests that exercise
// /auth/register past the JSON-parse + typeof gates must install this (or a
// failure stub) so the captcha gate doesn't short-circuit with 400 CAPTCHA_FAILED
// before the gate the test actually cares about. Reset between describe blocks
// via __resetRegisterTurnstileFnForTest.
const TURNSTILE_OK_STUB = async () => ({ ok: true, errorCodes: [] });

describe("POST /v1/auth/register — allowlist + claim-flow (D-08..D-11)", () => {
  // Phase 126 (D-01 / AUTH-126-02 + D-03 / AUTH-126-01): install happy-path
  // Turnstile stub + reset rate-limit buckets before every test so:
  //   (a) tests past the JSON+typeof gates aren't short-circuited by the new
  //       captcha shape/siteverify gate, and
  //   (b) module-scope rate-limit state doesn't leak across tests (would
  //       eventually 429 on the 21st /auth/register call).
  beforeEach(() => {
    __resetRegisterBucketsForTest();
    __setRegisterTurnstileFnForTest(TURNSTILE_OK_STUB as never);
  });

  it("returns 503 'Registration not configured' when VIGIL_ALLOWED_EMAILS is unset (D-10 fail-closed)", async () => {
    delete process.env["VIGIL_ALLOWED_EMAILS"];
    const res = await post("/v1/auth/register", {
      email: "anyone@test.local",
      password: "validpass123",
      turnstileToken: "valid",
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
      turnstileToken: "valid",
    });
    assert.equal(res.status, 503);
  });

  it("returns 403 with generic 'not open to this address' for non-allowlisted email (D-08, no enumeration)", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "jamesonmorrill1@gmail.com";
    const res = await post("/v1/auth/register", {
      email: "eve@evil.com",
      password: "validpass123",
      turnstileToken: "valid",
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
      turnstileToken: "valid",
    });
    assert.notEqual(res.status, 403);
  });

  it("returns 400 for password < 12 chars", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "short@test.local";
    const res = await post("/v1/auth/register", {
      email: "short@test.local",
      password: "short",
      turnstileToken: "valid",
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 for password > 128 chars (Pitfall 9 DoS guard)", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "long@test.local";
    const res = await post("/v1/auth/register", {
      email: "long@test.local",
      password: "a".repeat(129),
      turnstileToken: "valid",
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 when email or password missing / wrong type", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "e@t.local";
    // These all short-circuit on the typeof gate BEFORE the captcha gate,
    // so turnstileToken absence doesn't matter — but include it for parity
    // with the other /auth/register tests in this describe block.
    assert.equal(
      (await post("/v1/auth/register", { email: "e@t.local", turnstileToken: "valid" })).status,
      400,
    );
    assert.equal(
      (await post("/v1/auth/register", { password: "validpass123", turnstileToken: "valid" })).status,
      400,
    );
    assert.equal(
      (await post("/v1/auth/register", { email: 42, password: "validpass123", turnstileToken: "valid" }))
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

// ── Phase 110 (AUTH-09) POST /v1/auth/change-password handler tests ─────────
//
// Handler lives in vigil-core/src/routes/change-password.ts (NEW protected
// router mounted in index.ts AFTER bearerAuth — D-09 'index.ts:151 pattern').
//
// CP-CHG-01: success — 200 + { token, user } + DB row updated
// CP-CHG-02: wrong currentPassword → 401 "Invalid credentials"
// CP-CHG-03: newPassword too short → 400 length error ("Password must be 12-128 characters")
// CP-CHG-04: newPassword same as current → 400 "New password must differ from current"
// CP-CHG-05: malformed JSON body → 400 "Invalid JSON body"
// CP-CHG-06: D-14 ordering pin — db.update commits BEFORE signToken returns

describe("POST /v1/auth/change-password — D-09..D-14 + ordering pin (CP-CHG-01..06)", () => {
  // These tests need a real DB + bearerAuth + a fresh seed user. Skip if no
  // DATABASE_URL — matches the existing pattern at line 79-82.

  // Helper: mount the NEW changePassword router behind bearerAuth, mirroring
  // index.ts wiring (changePassword sits AFTER bearerAuth dispatcher).
  async function buildChangePasswordApp() {
    const { bearerAuth } = await import("../middleware/auth.js");
    const { changePassword } = await import("./change-password.js");
    const app = new Hono();
    app.use("/v1/*", bearerAuth);
    app.route("/v1", changePassword);
    return app;
  }

  // Helper: insert a test user with a known password.
  async function seedTestUser(plainPassword: string) {
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { hashPassword } = await import("../utils/password.js");
    const { signToken } = await import("../utils/jwt.js");
    if (!db) throw new Error("db not initialized");

    const nowMs = Date.now();
    const passwordHash = await hashPassword(plainPassword);
    const [created] = await db
      .insert(users)
      .values({
        email: `chg-test-${nowMs}-${Math.random().toString(36).slice(2, 8)}@test.local`,
        passwordHash,
        passwordChangedAt: new Date(nowMs - 3600 * 1000), // 1h ago — fresh JWT will pass gate
      })
      .returning({ id: users.id, email: users.email });

    const token = await signToken(created.id, created.email);
    return { user: created, token };
  }

  async function deleteTestUser(userId: number) {
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    if (!db) return;
    await db.delete(users).where(eq(users.id, userId));
  }

  it("CP-CHG-01: success — 200 + { token, user } + passwordHash + passwordChangedAt updated", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { verifyToken } = await import("../utils/jwt.js");
    if (!db) {
      t.skip("db not initialized");
      return;
    }

    const oldPassword = "current-password-12";
    const newPassword = "brand-new-password-34";
    const { user, token } = await seedTestUser(oldPassword);

    try {
      const app = await buildChangePasswordApp();
      const res = await app.fetch(
        new Request("http://x/v1/auth/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
        }),
      );

      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        token: string;
        user: { id: number; email: string };
      };
      assert.equal(typeof body.token, "string");
      assert.equal(body.user.id, user.id);
      assert.equal(body.user.email, user.email);

      // Returned token verifies via verifyToken
      const claims = await verifyToken(body.token);
      assert.equal(Number(claims.sub), user.id);

      // DB row updated
      const [refreshed] = await db
        .select({
          passwordHash: users.passwordHash,
          passwordChangedAt: users.passwordChangedAt,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      // Old seed hash was for oldPassword; must now hash newPassword instead.
      // passwordChangedAt was 1h ago at seed; must now be within last 5s.
      const drift = Date.now() - refreshed.passwordChangedAt.getTime();
      assert.ok(
        drift >= 0 && drift < 5000,
        `passwordChangedAt updated to recent timestamp; drift=${drift}ms`,
      );
      assert.ok(
        refreshed.passwordHash.startsWith("$argon2id$"),
        "passwordHash remains argon2id format",
      );
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it("CP-CHG-02: wrong currentPassword → 401 'Invalid credentials' (D-11 step 2 verbatim)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { user, token } = await seedTestUser("current-password-12");
    try {
      const app = await buildChangePasswordApp();
      const res = await app.fetch(
        new Request("http://x/v1/auth/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword: "wrong-password-12",
            newPassword: "new-password-12345",
          }),
        }),
      );
      assert.equal(res.status, 401);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "Invalid credentials");
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it("CP-CHG-03: newPassword length 11 → 400 'Password must be 12-128 characters' (D-11 step 3)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { user, token } = await seedTestUser("current-password-12");
    try {
      const app = await buildChangePasswordApp();
      const res = await app.fetch(
        new Request("http://x/v1/auth/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword: "current-password-12",
            newPassword: "a".repeat(11),
          }),
        }),
      );
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      // Pins the literal 12/128 values that change-password.ts duplicates from
      // routes/auth.ts to keep the protected router decoupled from the public router.
      assert.equal(body.error, "Password must be 12-128 characters");
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it("CP-CHG-04: newPassword same as current → 400 'New password must differ from current' (D-12)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const oldPassword = "same-password-1234";
    const { user, token } = await seedTestUser(oldPassword);
    try {
      const app = await buildChangePasswordApp();
      const res = await app.fetch(
        new Request("http://x/v1/auth/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPassword: oldPassword,
            newPassword: oldPassword,
          }),
        }),
      );
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "New password must differ from current");
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it("CP-CHG-05: malformed JSON body → 400 'Invalid JSON body' (D-10)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { user, token } = await seedTestUser("current-password-12");
    try {
      const app = await buildChangePasswordApp();
      const res = await app.fetch(
        new Request("http://x/v1/auth/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: "{not json",
        }),
      );
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "Invalid JSON body");
    } finally {
      await deleteTestUser(user.id);
    }
  });

  it("CP-CHG-06 (D-14 ORDERING PIN): db.update commits BEFORE signToken — issued JWT iat is AFTER passwordChangedAt write", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { verifyToken } = await import("../utils/jwt.js");
    if (!db) {
      t.skip("db not initialized");
      return;
    }

    // Strategy: after a successful change, the returned token's iat (in seconds)
    // MUST be >= floor(refreshed.passwordChangedAt.getTime()/1000). If signToken
    // ran BEFORE db.update, iat could be LESS THAN floor(ts/1000) if the DB
    // write committed in a later second than the iat capture.
    const oldPassword = "current-password-12";
    const newPassword = "brand-new-password-34";
    const { user, token: oldToken } = await seedTestUser(oldPassword);

    try {
      const app = await buildChangePasswordApp();
      const res = await app.fetch(
        new Request("http://x/v1/auth/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${oldToken}`,
          },
          body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
        }),
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as { token: string };

      const claims = await verifyToken(body.token);
      const iatSeconds = claims.iat;

      // Read the DB to get the recorded passwordChangedAt.
      const [refreshed] = await db
        .select({ passwordChangedAt: users.passwordChangedAt })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      const gateThreshold = Math.floor(
        refreshed.passwordChangedAt.getTime() / 1000,
      );

      // D-14 ordering: signToken AFTER db.update means iat >= gateThreshold,
      // therefore the new JWT passes the gate (`claims.iat < gateThreshold`
      // is false). If reordered, iat could be < gateThreshold and the issued
      // token would bounce against its own write — this assertion catches it.
      assert.ok(
        iatSeconds >= gateThreshold,
        `D-14 ordering: signToken must run AFTER db.update commits. iat=${iatSeconds}, gateThreshold=${gateThreshold}, drift=${iatSeconds - gateThreshold}s`,
      );

      // Belt-and-suspenders: the returned token must actually pass the gate.
      // Make a follow-up authenticated request — expect 400 same-as-current,
      // NOT 401 "Session expired".
      const followUp = await app.fetch(
        new Request("http://x/v1/auth/change-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${body.token}`,
          },
          body: JSON.stringify({
            currentPassword: newPassword,
            newPassword,
          }),
        }),
      );
      assert.notEqual(
        followUp.status,
        401,
        "newly issued JWT must not bounce against its own passwordChangedAt write",
      );
    } finally {
      await deleteTestUser(user.id);
    }
  });
});

// ── Phase 113 (AUTH-11) — register email_verify token issuance + login emailVerifiedAt ──

describe("POST /v1/auth/register — email_verify token issuance (AUTH-11)", () => {
  beforeEach(() => {
    __resetSendEmailVerificationEmailForTest();
    // Phase 126: AUTH-11 register tests POST to /v1/auth/register which now has
    // a captcha+rate-limit gate stack. Install happy-path Turnstile stub +
    // reset buckets so the AUTH-11 token-issuance assertions reach the DB
    // write path. All these tests are DATABASE_URL-skipped today, but the
    // setup is needed when the test env grows a DB.
    __resetRegisterBucketsForTest();
    __setRegisterTurnstileFnForTest(TURNSTILE_OK_STUB as never);
  });

  // Helper: seed a test user directly in DB (bypasses allowlist + register flow)
  async function seedVerifyTestUser(email: string) {
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { hashPassword } = await import("../utils/password.js");
    if (!db) throw new Error("db not initialized");
    const passwordHash = await hashPassword("validpass123456");
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash, passwordChangedAt: new Date() })
      .returning({ id: users.id, email: users.email });
    return created;
  }

  async function deleteVerifyTestUser(userId: number) {
    const { db } = await import("../db/connection.js");
    const { users, passwordResetTokens } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    if (!db) return;
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  it("AUTH-11-R-01: fresh register → password_reset_tokens row exists with type='email_verify', used_at IS NULL, correct expiry window", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { passwordResetTokens } = await import("../db/schema.js");
    const { eq, and, isNull, gt, lt } = await import("drizzle-orm");
    if (!db) { t.skip("db not initialized"); return; }

    // Inject a no-op spy
    const spy = mock.fn(async () => ({ status: "sent" as const, messageId: "test" }));
    __setSendEmailVerificationEmailForTest(spy as never);

    const now = Date.now();
    const testEmail = `auth11-r01-${now}@test.local`;
    process.env["VIGIL_ALLOWED_EMAILS"] = testEmail;

    const res = await post("/v1/auth/register", { email: testEmail, password: "validpass123456", turnstileToken: "valid" });
    assert.equal(res.status, 201);

    const body = (await res.json()) as { id: number; email: string };
    const userId = body.id;

    try {
      // Check DB for the token row
      const minExpiry = new Date(now + 23 * 60 * 60 * 1000);
      const maxExpiry = new Date(now + 25 * 60 * 60 * 1000);
      const rows = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, userId),
            eq(passwordResetTokens.type, "email_verify"),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, minExpiry),
            lt(passwordResetTokens.expiresAt, maxExpiry),
          ),
        );
      assert.equal(rows.length, 1, "expected exactly one email_verify token row");
    } finally {
      await deleteVerifyTestUser(userId);
    }
  });

  it("AUTH-11-R-02: fresh register fires sendEmailVerificationEmail spy EXACTLY ONCE with correct args", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const { db } = await import("../db/connection.js");
    if (!db) { t.skip("db not initialized"); return; }

    const spy = mock.fn(async () => ({ status: "sent" as const, messageId: "test" }));
    __setSendEmailVerificationEmailForTest(spy as never);

    const now = Date.now();
    const testEmail = `auth11-r02-${now}@test.local`;
    process.env["VIGIL_ALLOWED_EMAILS"] = testEmail;

    const res = await post("/v1/auth/register", { email: testEmail, password: "validpass123456", turnstileToken: "valid" });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { id: number };

    // Give fire-and-forget a tick to attach
    await new Promise((r) => setTimeout(r, 50));

    try {
      assert.equal(spy.mock.calls.length, 1, "sendEmailVerificationEmail called exactly once");
      const callArgs = spy.mock.calls[0].arguments as unknown as [string, string];
      const [toArg, urlArg] = callArgs;
      assert.equal(toArg, testEmail);
      assert.match(urlArg, /^https?:\/\/.+\/auth\/verify\?token=[A-Za-z0-9_-]{40,50}$/);
    } finally {
      await deleteVerifyTestUser(body.id);
    }
  });

  it("AUTH-11-R-03: fresh register returns 201 even if sendEmailVerificationEmail throws synchronously", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const { db } = await import("../db/connection.js");
    if (!db) { t.skip("db not initialized"); return; }

    // Spy that throws synchronously when called (promise rejects immediately)
    const spy = mock.fn(async () => { throw new Error("Resend is down"); });
    __setSendEmailVerificationEmailForTest(spy as never);

    const now = Date.now();
    const testEmail = `auth11-r03-${now}@test.local`;
    process.env["VIGIL_ALLOWED_EMAILS"] = testEmail;

    let rejectionFired = false;
    const rejectionHandler = () => { rejectionFired = true; };
    process.on("unhandledRejection", rejectionHandler);

    const res = await post("/v1/auth/register", { email: testEmail, password: "validpass123456", turnstileToken: "valid" });
    const body = (await res.json()) as { id: number };

    // Give the .catch() handler time to run
    await new Promise((r) => setTimeout(r, 100));
    process.off("unhandledRejection", rejectionHandler);

    try {
      assert.equal(res.status, 201, ".catch() must swallow the error — 201 expected");
      assert.equal(rejectionFired, false, "unhandledRejection must not fire");
    } finally {
      await deleteVerifyTestUser(body.id);
    }
  });

  it("AUTH-11-R-04: claim-flow with emailVerifiedAt IS NULL → token issued + email sent", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users, passwordResetTokens } = await import("../db/schema.js");
    const { eq, and, isNull } = await import("drizzle-orm");
    const { PLACEHOLDER_HASH_PREFIX } = await import("./auth.js");
    if (!db) { t.skip("db not initialized"); return; }

    const spy = mock.fn(async () => ({ status: "sent" as const, messageId: "test" }));
    __setSendEmailVerificationEmailForTest(spy as never);

    const now = Date.now();
    const testEmail = `auth11-r04-${now}@test.local`;
    process.env["VIGIL_ALLOWED_EMAILS"] = testEmail;

    // Seed a user with placeholder hash AND NULL emailVerifiedAt (simulates pre-claim seed user)
    const [seeded] = await db
      .insert(users)
      .values({
        email: testEmail,
        passwordHash: `${PLACEHOLDER_HASH_PREFIX}XXXXXXXXXXXXX`,
        passwordChangedAt: new Date(),
        emailVerifiedAt: null,
      })
      .returning({ id: users.id });

    try {
      const res = await post("/v1/auth/register", { email: testEmail, password: "validpass123456", turnstileToken: "valid" });
      assert.equal(res.status, 201);
      const body = (await res.json()) as { claimed?: boolean };
      assert.equal(body.claimed, true);

      // Give fire-and-forget a tick
      await new Promise((r) => setTimeout(r, 50));

      assert.equal(spy.mock.calls.length, 1, "email should be sent for unverified claim-flow user");

      // Token row should exist
      const rows = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, seeded.id),
            eq(passwordResetTokens.type, "email_verify"),
            isNull(passwordResetTokens.usedAt),
          ),
        );
      assert.equal(rows.length, 1, "token row should exist for unverified claim-flow user");
    } finally {
      await deleteVerifyTestUser(seeded.id);
    }
  });

  it("AUTH-11-R-05: claim-flow with non-null emailVerifiedAt → NO token issued, NO email sent", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const { db } = await import("../db/connection.js");
    const { users, passwordResetTokens } = await import("../db/schema.js");
    const { eq, and, isNull } = await import("drizzle-orm");
    const { PLACEHOLDER_HASH_PREFIX } = await import("./auth.js");
    if (!db) { t.skip("db not initialized"); return; }

    const spy = mock.fn(async () => ({ status: "sent" as const, messageId: "test" }));
    __setSendEmailVerificationEmailForTest(spy as never);

    const now = Date.now();
    const testEmail = `auth11-r05-${now}@test.local`;
    process.env["VIGIL_ALLOWED_EMAILS"] = testEmail;

    // Seed a user with placeholder hash AND non-null emailVerifiedAt (post-backfill seed user)
    const [seeded] = await db
      .insert(users)
      .values({
        email: testEmail,
        passwordHash: `${PLACEHOLDER_HASH_PREFIX}XXXXXXXXXXXXX`,
        passwordChangedAt: new Date(),
        emailVerifiedAt: new Date(), // already verified
      })
      .returning({ id: users.id });

    try {
      const res = await post("/v1/auth/register", { email: testEmail, password: "validpass123456", turnstileToken: "valid" });
      assert.equal(res.status, 201);

      // Give fire-and-forget a tick
      await new Promise((r) => setTimeout(r, 50));

      assert.equal(spy.mock.calls.length, 0, "no email should be sent for already-verified claim-flow user");

      // No new token row should exist
      const rows = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, seeded.id),
            eq(passwordResetTokens.type, "email_verify"),
            isNull(passwordResetTokens.usedAt),
          ),
        );
      assert.equal(rows.length, 0, "no token row should be inserted for already-verified claim-flow user");
    } finally {
      await deleteVerifyTestUser(seeded.id);
    }
  });
});

describe("POST /v1/auth/login — emailVerifiedAt in response (AUTH-11 D-26)", () => {
  async function seedLoginTestUser(email: string, emailVerifiedAt: Date | null) {
    const { db } = await import("../db/connection.js");
    const { users } = await import("../db/schema.js");
    const { hashPassword } = await import("../utils/password.js");
    if (!db) throw new Error("db not initialized");
    const passwordHash = await hashPassword("validpass123456");
    const values = {
      email,
      passwordHash,
      passwordChangedAt: new Date(Date.now() - 3600 * 1000),
      emailVerifiedAt: emailVerifiedAt ?? undefined,
    };
    const [created] = await db
      .insert(users)
      .values(values)
      .returning({ id: users.id, email: users.email });
    return created;
  }

  async function deleteLoginTestUser(userId: number) {
    const { db } = await import("../db/connection.js");
    const { users, passwordResetTokens } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    if (!db) return;
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  it("AUTH-11-L-01: login response body includes emailVerifiedAt key (D-26 additive contract)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const now = Date.now();
    const testEmail = `auth11-l01-${now}@test.local`;
    process.env["VIGIL_ALLOWED_EMAILS"] = testEmail;
    const user = await seedLoginTestUser(testEmail, new Date());
    try {
      const res = await post("/v1/auth/login", { email: testEmail, password: "validpass123456" });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { token: string; user: Record<string, unknown> };
      assert.ok("emailVerifiedAt" in body.user, "'emailVerifiedAt' key must be present in login response user object (D-26)");
      assert.equal(typeof body.token, "string");
    } finally {
      await deleteLoginTestUser(user.id);
    }
  });

  it("AUTH-11-L-02: login response user.emailVerifiedAt is ISO 8601 string when DB column is non-null", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const now = Date.now();
    const testEmail = `auth11-l02-${now}@test.local`;
    process.env["VIGIL_ALLOWED_EMAILS"] = testEmail;
    const verifiedAt = new Date("2026-04-25T12:00:00Z");
    const user = await seedLoginTestUser(testEmail, verifiedAt);
    try {
      const res = await post("/v1/auth/login", { email: testEmail, password: "validpass123456" });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { user: { emailVerifiedAt: unknown } };
      assert.match(String(body.user.emailVerifiedAt), /^\d{4}-\d{2}-\d{2}T/, "emailVerifiedAt must be ISO 8601 string");
    } finally {
      await deleteLoginTestUser(user.id);
    }
  });

  it("AUTH-11-L-03: login response user.emailVerifiedAt is JSON null when DB column is null", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const now = Date.now();
    const testEmail = `auth11-l03-${now}@test.local`;
    process.env["VIGIL_ALLOWED_EMAILS"] = testEmail;
    const user = await seedLoginTestUser(testEmail, null);
    try {
      const res = await post("/v1/auth/login", { email: testEmail, password: "validpass123456" });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { user: { emailVerifiedAt: unknown } };
      assert.strictEqual(body.user.emailVerifiedAt, null, "emailVerifiedAt must be JSON null (not undefined, not omitted) for unverified user");
    } finally {
      await deleteLoginTestUser(user.id);
    }
  });
});

// ── Phase 126 (Plan 05) — rate-limit + Turnstile + sentinel + code-on-every-error ──
//
// Drift detectors mirror the Phase 117 AUTH-13-FP-CAP-* shape verbatim:
//   - Source-file regex pin via fs.readFileSync (no runtime introspection)
//   - Test names use the AUTH-126-* convention
//
// Behavior tests use the route-level seam __setRegisterTurnstileFnForTest
// (NOT the helper-unit seam owned by vigil-core/src/lib/turnstile.ts — that
// seam is consumed by turnstile.test.ts; stubbing at that layer from a route
// test would be the double-stub footgun the plan calls out).

// IP helper: pick a random x-forwarded-for so module-scope rate-limit
// buckets never bleed across tests (mirror forgot-password.test.ts:454).
function uniqueIp(): string {
  return `10.126.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
}

describe("POST /v1/auth/register — Phase 126 rate-limit + captcha + sentinel + code field", () => {
  // Save+restore env so tests don't leak VIGIL_ALLOWED_EMAILS / TURNSTILE_SECRET_KEY.
  const SAVED_ALLOWED = process.env["VIGIL_ALLOWED_EMAILS"];
  const SAVED_TURNSTILE = process.env["TURNSTILE_SECRET_KEY"];

  beforeEach(() => {
    __resetRegisterBucketsForTest();
    __setRegisterTurnstileFnForTest(TURNSTILE_OK_STUB as never);
    process.env["VIGIL_ALLOWED_EMAILS"] = "phase126-default@test.local";
    process.env["TURNSTILE_SECRET_KEY"] = "test-secret-not-used-because-DI-seam-stubs-it";
  });

  // ── Drift detectors ──────────────────────────────────────────────────────

  it("AUTH-126-CAP-IP-20: auth.ts declares RATE_LIMIT_MAX_IP = 20 verbatim (drift detector)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "auth.ts"), "utf8");
    assert.match(
      src,
      /const RATE_LIMIT_MAX_IP = 20;/,
      "auth.ts must declare RATE_LIMIT_MAX_IP = 20 verbatim (Phase 126 D-03)",
    );
  });

  it("AUTH-126-CAP-EMAIL-5: auth.ts declares RATE_LIMIT_MAX_EMAIL = 5 verbatim (drift detector)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "auth.ts"), "utf8");
    assert.match(
      src,
      /const RATE_LIMIT_MAX_EMAIL = 5;/,
      "auth.ts must declare RATE_LIMIT_MAX_EMAIL = 5 verbatim (Phase 126 D-03)",
    );
  });

  it("AUTH-126-TURNSTILE-CALLSITE: auth.ts invokes Turnstile helper (call-site lock — helper cannot be silently deleted)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "auth.ts"), "utf8");
    assert.match(
      src,
      /(registerTurnstileFn|verifyTurnstileToken)\(/,
      "auth.ts must invoke Turnstile via DI seam (Phase 126 D-01)",
    );
  });

  it("AUTH-126-ALLOWLIST-WILDCARD: auth.ts isAllowlistedEmail honors `*` sentinel (drift detector)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "auth.ts"), "utf8");
    assert.match(
      src,
      /allowed\.includes\("\*"\)/,
      'auth.ts must contain `allowed.includes("*")` verbatim (AUTH-126-08 sentinel)',
    );
  });

  it("AUTH-126-SEAM-NAMING: auth.ts uses __setRegisterTurnstileFnForTest (NOT the helper-unit seam name)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "auth.ts"), "utf8");
    assert.match(
      src,
      /__setRegisterTurnstileFnForTest/,
      "auth.ts must export the route-level seam __setRegisterTurnstileFnForTest",
    );
    // Build the forbidden seam name via concatenation so this drift detector
    // can assert its absence in auth.ts without ALSO containing the literal
    // contiguously in this test file (the plan's distinct-seam invariant uses
    // a contiguous-string grep — same comment-vs-grep reconciliation precedent
    // used in Plans 01/02/04).
    const HELPER_UNIT_SEAM_NAME = "__setVerify" + "TurnstileToken" + "ForTest";
    assert.doesNotMatch(
      src,
      new RegExp(HELPER_UNIT_SEAM_NAME),
      "auth.ts must NOT contain the helper-unit seam name — that name is owned by turnstile.ts; double-stub footgun",
    );
  });

  // ── AUTH-126-ERROR-CODE-COVERAGE: every documented failure path returns BOTH error AND code ──

  it("AUTH-126-ERROR-CODE-COVERAGE: every documented /auth/* failure path returns {error, code}", async () => {
    // We carry the matrix as (label, request-fn, expectedStatus, expectedCode).
    // Each entry uses a fresh unique IP to avoid rate-limit bleed across rows.
    const matrix: Array<{
      label: string;
      request: () => Promise<Response>;
      expectedStatus: number;
      expectedCode: string;
    }> = [
      // SERVER_NOT_CONFIGURED — VIGIL_ALLOWED_EMAILS unset short-circuits at 503
      {
        label: "register without VIGIL_ALLOWED_EMAILS",
        request: async () => {
          const prev = process.env["VIGIL_ALLOWED_EMAILS"];
          delete process.env["VIGIL_ALLOWED_EMAILS"];
          const r = await post(
            "/v1/auth/register",
            { email: "x@x.com", password: "validpass123456", turnstileToken: "valid" },
            { "x-forwarded-for": uniqueIp() },
          );
          if (prev !== undefined) process.env["VIGIL_ALLOWED_EMAILS"] = prev;
          return r;
        },
        expectedStatus: 503,
        expectedCode: "SERVER_NOT_CONFIGURED",
      },
      // INVALID_JSON — malformed body
      {
        label: "register with malformed JSON",
        request: async () =>
          buildApp().fetch(
            new Request("http://x/v1/auth/register", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-forwarded-for": uniqueIp(),
              },
              body: "{not json",
            }),
          ),
        expectedStatus: 400,
        expectedCode: "INVALID_JSON",
      },
      // INVALID_REQUEST — missing fields
      {
        label: "register with missing fields",
        request: async () =>
          post("/v1/auth/register", { email: "x@x.com" }, { "x-forwarded-for": uniqueIp() }),
        expectedStatus: 400,
        expectedCode: "INVALID_REQUEST",
      },
      // INVALID_REQUEST — wrong types
      {
        label: "register with wrong types",
        request: async () =>
          post(
            "/v1/auth/register",
            { email: 42, password: "validpass123456" },
            { "x-forwarded-for": uniqueIp() },
          ),
        expectedStatus: 400,
        expectedCode: "INVALID_REQUEST",
      },
      // CAPTCHA_FAILED — missing turnstileToken
      {
        label: "register with missing turnstileToken",
        request: async () =>
          post(
            "/v1/auth/register",
            { email: "x@x.com", password: "validpass123456" },
            { "x-forwarded-for": uniqueIp() },
          ),
        expectedStatus: 400,
        expectedCode: "CAPTCHA_FAILED",
      },
      // INVALID_EMAIL_FORMAT — bad email shape, valid captcha
      {
        label: "register with invalid email shape",
        request: async () =>
          post(
            "/v1/auth/register",
            { email: "notanemail", password: "validpassword12", turnstileToken: "valid" },
            { "x-forwarded-for": uniqueIp() },
          ),
        expectedStatus: 400,
        expectedCode: "INVALID_EMAIL_FORMAT",
      },
      // PASSWORD_TOO_SHORT
      {
        label: "register with password < MIN",
        request: async () =>
          post(
            "/v1/auth/register",
            { email: "x@x.com", password: "short", turnstileToken: "valid" },
            { "x-forwarded-for": uniqueIp() },
          ),
        expectedStatus: 400,
        expectedCode: "PASSWORD_TOO_SHORT",
      },
      // PASSWORD_TOO_LONG
      {
        label: "register with password > MAX",
        request: async () =>
          post(
            "/v1/auth/register",
            { email: "x@x.com", password: "a".repeat(200), turnstileToken: "valid" },
            { "x-forwarded-for": uniqueIp() },
          ),
        expectedStatus: 400,
        expectedCode: "PASSWORD_TOO_LONG",
      },
      // REG_NOT_ALLOWED — allowlist closed
      {
        label: "register with allowlist closed",
        request: async () => {
          process.env["VIGIL_ALLOWED_EMAILS"] = "only-this@allowed.com";
          return post(
            "/v1/auth/register",
            { email: "eve@evil.com", password: "validpassword12", turnstileToken: "valid" },
            { "x-forwarded-for": uniqueIp() },
          );
        },
        expectedStatus: 403,
        expectedCode: "REG_NOT_ALLOWED",
      },
      // /auth/login INVALID_JSON
      {
        label: "login with malformed JSON",
        request: async () =>
          buildApp().fetch(
            new Request("http://x/v1/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{not json",
            }),
          ),
        expectedStatus: 400,
        expectedCode: "INVALID_JSON",
      },
      // /auth/login INVALID_REQUEST
      {
        label: "login with wrong types",
        request: async () => post("/v1/auth/login", { email: 42 }),
        expectedStatus: 400,
        expectedCode: "INVALID_REQUEST",
      },
    ];

    for (const row of matrix) {
      const res = await row.request();
      assert.equal(
        res.status,
        row.expectedStatus,
        `${row.label}: expected ${row.expectedStatus}, got ${res.status}`,
      );
      const body = (await res.json()) as { error?: unknown; code?: unknown };
      assert.equal(
        typeof body.error,
        "string",
        `${row.label}: response body must include error:string`,
      );
      assert.equal(
        typeof body.code,
        "string",
        `${row.label}: response body must include code:string`,
      );
      assert.equal(
        body.code,
        row.expectedCode,
        `${row.label}: code mismatch (got "${String(body.code)}")`,
      );
    }
  });

  // ── Behavior tests for rate-limit (mirror forgot-password.test.ts:449+ shape) ─

  it("rate-limit: 6th /auth/register from same IP+email returns 429 RATE_LIMITED with retry_after_seconds (per-email cap = 5)", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "*"; // wildcard so allowlist isn't the gate
    const ip = uniqueIp();
    const email = `rl-email-${Date.now()}@test.local`;
    let lastRes: Response | null = null;
    for (let i = 0; i < 6; i++) {
      lastRes = await post(
        "/v1/auth/register",
        { email, password: "validpassword12", turnstileToken: "valid" },
        { "x-forwarded-for": ip },
      );
    }
    assert.equal(
      lastRes!.status,
      429,
      "6th call from same IP+email must return 429 (per-email cap = 5)",
    );
    const body = (await lastRes!.json()) as {
      error: string;
      code: string;
      retry_after_seconds: number;
    };
    assert.equal(body.code, "RATE_LIMITED");
    assert.equal(typeof body.error, "string");
    assert.equal(body.retry_after_seconds, 3600);
  });

  it("rate-limit: 429 response carries Retry-After: 3600 header", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "*";
    const ip = uniqueIp();
    const email = `rl-header-${Date.now()}@test.local`;
    let lastRes: Response | null = null;
    for (let i = 0; i < 6; i++) {
      lastRes = await post(
        "/v1/auth/register",
        { email, password: "validpassword12", turnstileToken: "valid" },
        { "x-forwarded-for": ip },
      );
    }
    assert.equal(lastRes!.status, 429);
    assert.equal(
      lastRes!.headers.get("Retry-After"),
      "3600",
      "429 response must set Retry-After: 3600 header (per CONTEXT D-03)",
    );
  });

  it("rate-limit: 21st /auth/register from same IP across distinct emails returns 429 (per-IP cap = 20)", async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "*";
    const ip = uniqueIp();
    const baseTs = Date.now();
    let lastRes: Response | null = null;
    for (let i = 0; i < 21; i++) {
      const email = `rl-ip-${baseTs}-${i}@test.local`;
      lastRes = await post(
        "/v1/auth/register",
        { email, password: "validpassword12", turnstileToken: "valid" },
        { "x-forwarded-for": ip },
      );
    }
    assert.equal(
      lastRes!.status,
      429,
      "21st call from same IP across distinct emails must return 429 (per-IP cap = 20)",
    );
    const body = (await lastRes!.json()) as { code: string };
    assert.equal(body.code, "RATE_LIMITED");
  });

  // ── Behavior tests for Turnstile (DI-seam stubs) ──

  it("captcha: missing turnstileToken → 400 CAPTCHA_FAILED — allowlist is NEVER consulted", async () => {
    // Closed allowlist for an email that is NOT eve@evil.com. If allowlist
    // were consulted, eve@evil.com would get 403 REG_NOT_ALLOWED instead of
    // 400 CAPTCHA_FAILED.
    process.env["VIGIL_ALLOWED_EMAILS"] = "permitted@test.local";
    const res = await post(
      "/v1/auth/register",
      { email: "eve@evil.com", password: "validpassword12" },
      { "x-forwarded-for": uniqueIp() },
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "CAPTCHA_FAILED");
  });

  it("captcha: siteverify returns {ok:false} → 400 CAPTCHA_FAILED", async () => {
    __setRegisterTurnstileFnForTest((async () => ({
      ok: false,
      errorCodes: ["invalid-input-response"],
    })) as never);
    process.env["VIGIL_ALLOWED_EMAILS"] = "*";
    const res = await post(
      "/v1/auth/register",
      { email: "x@x.com", password: "validpassword12", turnstileToken: "any" },
      { "x-forwarded-for": uniqueIp() },
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "CAPTCHA_FAILED");
  });

  it("captcha: siteverify throws → 503 (NO fail-open per D-01)", async () => {
    __setRegisterTurnstileFnForTest((async () => {
      throw new Error("Cloudflare timeout");
    }) as never);
    process.env["VIGIL_ALLOWED_EMAILS"] = "*";
    const res = await post(
      "/v1/auth/register",
      { email: "x@x.com", password: "validpassword12", turnstileToken: "any" },
      { "x-forwarded-for": uniqueIp() },
    );
    assert.equal(
      res.status,
      503,
      "Turnstile throw must surface as 503 (CONTEXT D-01: no fail-open)",
    );
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "CAPTCHA_FAILED");
  });

  it("captcha: siteverify returns {ok:true} → proceeds past captcha to allowlist (403 REG_NOT_ALLOWED for closed allowlist)", async () => {
    __setRegisterTurnstileFnForTest((async () => ({
      ok: true,
      errorCodes: [],
    })) as never);
    process.env["VIGIL_ALLOWED_EMAILS"] = "only-this@allowed.com";
    const res = await post(
      "/v1/auth/register",
      {
        email: "someone-else@test.local",
        password: "validpassword12",
        turnstileToken: "any",
      },
      { "x-forwarded-for": uniqueIp() },
    );
    assert.equal(
      res.status,
      403,
      "ok:true captcha must let request reach allowlist; closed allowlist returns 403",
    );
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "REG_NOT_ALLOWED");
  });

  // ── Behavior tests for the `*` sentinel (AUTH-126-08) ─────────────────────

  it('sentinel: VIGIL_ALLOWED_EMAILS="*" → any well-formed email proceeds past allowlist', async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "*";
    const res = await post(
      "/v1/auth/register",
      {
        email: "any-random@test.local",
        password: "validpassword12",
        turnstileToken: "valid",
      },
      { "x-forwarded-for": uniqueIp() },
    );
    // Past allowlist either to DB write (no DB → 503 SERVER_NOT_CONFIGURED)
    // or to 201/409 if DB is wired. Critically NOT 403 REG_NOT_ALLOWED.
    assert.notEqual(
      res.status,
      403,
      'wildcard "*" must let any well-formed email past the allowlist gate',
    );
  });

  it('sentinel: VIGIL_ALLOWED_EMAILS="" → still fail-closed (Phase 113 D-10 regression guard)', async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = "";
    const res = await post(
      "/v1/auth/register",
      {
        email: "anyone@test.local",
        password: "validpassword12",
        turnstileToken: "valid",
      },
      { "x-forwarded-for": uniqueIp() },
    );
    assert.equal(
      res.status,
      503,
      'empty VIGIL_ALLOWED_EMAILS must still fail-closed (D-10) — wildcard does NOT activate on ""',
    );
    const body = (await res.json()) as { code: string };
    assert.equal(body.code, "SERVER_NOT_CONFIGURED");
  });

  it('sentinel: VIGIL_ALLOWED_EMAILS=" * , foo@x.com " → wildcard wins; foo@x.com also matches', async () => {
    process.env["VIGIL_ALLOWED_EMAILS"] = " * , foo@x.com ";
    // Wildcard branch — any random email should proceed past allowlist
    const wildRes = await post(
      "/v1/auth/register",
      {
        email: "random@test.local",
        password: "validpassword12",
        turnstileToken: "valid",
      },
      { "x-forwarded-for": uniqueIp() },
    );
    assert.notEqual(
      wildRes.status,
      403,
      'mixed list containing "*" must let any email past the allowlist',
    );
    // Explicit foo@x.com — proceeds past allowlist
    const explicitRes = await post(
      "/v1/auth/register",
      {
        email: "foo@x.com",
        password: "validpassword12",
        turnstileToken: "valid",
      },
      { "x-forwarded-for": uniqueIp() },
    );
    assert.notEqual(
      explicitRes.status,
      403,
      "explicit foo@x.com must also pass allowlist (mixed list semantics)",
    );
  });

  // ── Cleanup: restore env + reset seam so other test files aren't polluted ──

  it("cleanup: restore env + reset Turnstile seam to real implementation", () => {
    __resetRegisterTurnstileFnForTest();
    __resetRegisterBucketsForTest();
    if (SAVED_ALLOWED !== undefined) {
      process.env["VIGIL_ALLOWED_EMAILS"] = SAVED_ALLOWED;
    } else {
      delete process.env["VIGIL_ALLOWED_EMAILS"];
    }
    if (SAVED_TURNSTILE !== undefined) {
      process.env["TURNSTILE_SECRET_KEY"] = SAVED_TURNSTILE;
    } else {
      delete process.env["TURNSTILE_SECRET_KEY"];
    }
  });
});
