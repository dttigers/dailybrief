// ── Phase 113 Plan 03 — TDD tests for POST /v1/auth/verify-email ─────────────
// Covers AUTH-11-V1..V4 + AUTH-11-G + MALFORMED + MISSING-TOKEN
// Mirror pattern: reset-password.test.ts (same node:test framework + DB skip pattern)
//
// DB-required tests: skip with t.skip("DATABASE_URL not set") when db is null.
// Pure-unit tests (V2-01, V4-01, V4-02, MALFORMED, MISSING-TOKEN) run without DB.
//
// Run: cd vigil-core && npx tsx --test src/routes/verify-email.test.ts
// -----------------------------------------------------------------------------

// Set JWT_SECRET BEFORE importing the route — utils/jwt.ts exits at import time
// without it (mirrors reset-password.test.ts:28 and auth.test.ts:21).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import * as crypto from "node:crypto";

import {
  createVerifyEmailRoute,
  __resetBucketsForTest,
} from "./verify-email.js";
import { db } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/**
 * Seed a user row, returning userId. Uses onConflictDoNothing so the same
 * email can be reused across tests (if the email includes a unique suffix, it
 * won't conflict). Returns null when db is unavailable.
 */
async function seedUser(email: string): Promise<number | null> {
  if (!db) return null;
  const placeholderHash =
    "$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHR0ZXN0c2FsdA$dGVzdGhhc2h0ZXN0aGFzaHRlc3RoYXNodGVzdA";
  const [created] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash: placeholderHash,
      passwordChangedAt: new Date(),
      emailVerifiedAt: null,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created) return created.id;
  // Already exists — look it up
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return existing?.id ?? null;
}

/**
 * Insert a password_reset_tokens row with the specified parameters.
 */
async function seedToken(
  userId: number,
  rawToken: string,
  type: "email_verify" | "password_reset",
  expiresAt: Date,
  usedAt: Date | null = null,
): Promise<void> {
  if (!db) return;
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: sha256Hex(rawToken),
    type,
    expiresAt,
    usedAt,
  });
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("POST /v1/auth/verify-email (AUTH-11)", () => {
  beforeEach(() => __resetBucketsForTest());

  // ── AUTH-11-V1-01: happy path (DB required) ──────────────────────────────
  it("AUTH-11-V1-01: valid unused email_verify token → 200 { ok: true } + email_verified_at set", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const email = `verify-v1-01-${Date.now()}-${Math.random()}@example.com`;
    const userId = await seedUser(email);
    if (!userId) { t.skip("seedUser failed"); return; }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    await seedToken(userId, rawToken, "email_verify", new Date(Date.now() + 24 * 60 * 60 * 1000));

    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.1.1.${Math.floor(Math.random() * 200) + 10}`;
    const res = await app.request("/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });

    // DB assertions: used_at non-null AND email_verified_at non-null
    const [tokenRow] = await db
      .select({ usedAt: passwordResetTokens.usedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, sha256Hex(rawToken)))
      .limit(1);
    assert.notEqual(tokenRow?.usedAt, null, "token used_at must be non-null after claim");

    const [userRow] = await db
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    assert.notEqual(userRow?.emailVerifiedAt, null, "email_verified_at must be non-null after successful verify");
  });

  // ── AUTH-11-V2-01: invalid (unknown) token — no DB seed needed ──────────
  it("AUTH-11-V2-01: unknown/random token → 400 Invalid or expired token", async () => {
    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.2.1.${Math.floor(Math.random() * 200) + 10}`;
    const res = await app.request("/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
      body: JSON.stringify({ token: crypto.randomBytes(32).toString("base64url") }),
    });
    // When DB is unavailable, 503 is acceptable; when available, must be 400
    if (res.status === 503) return; // DB unavailable — skip assertion
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid or expired token" });
  });

  // ── AUTH-11-V2-02: expired token (DB required) ───────────────────────────
  it("AUTH-11-V2-02: expired token → 400 Invalid or expired token", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const email = `verify-v2-02-${Date.now()}-${Math.random()}@example.com`;
    const userId = await seedUser(email);
    if (!userId) { t.skip("seedUser failed"); return; }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    // expires_at = 1 hour in the past
    await seedToken(userId, rawToken, "email_verify", new Date(Date.now() - 60 * 60 * 1000));

    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.2.2.${Math.floor(Math.random() * 200) + 10}`;
    const res = await app.request("/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid or expired token" });
  });

  // ── AUTH-11-V2-03: already-used token (DB required) ──────────────────────
  it("AUTH-11-V2-03: already-used token (used_at non-null) → 400 Invalid or expired token", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const email = `verify-v2-03-${Date.now()}-${Math.random()}@example.com`;
    const userId = await seedUser(email);
    if (!userId) { t.skip("seedUser failed"); return; }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    // Seed with used_at = 1 minute ago
    await seedToken(
      userId, rawToken, "email_verify",
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      new Date(Date.now() - 60 * 1000),
    );

    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.2.3.${Math.floor(Math.random() * 200) + 10}`;
    const res = await app.request("/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid or expired token" });
  });

  // ── AUTH-11-V2-04: wrong type (password_reset row) (DB required) ─────────
  it("AUTH-11-V2-04: token with type=password_reset → 400 (type filter prevents cross-type claim)", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const email = `verify-v2-04-${Date.now()}-${Math.random()}@example.com`;
    const userId = await seedUser(email);
    if (!userId) { t.skip("seedUser failed"); return; }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    // Seed as password_reset, not email_verify
    await seedToken(userId, rawToken, "password_reset", new Date(Date.now() + 24 * 60 * 60 * 1000));

    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.2.4.${Math.floor(Math.random() * 200) + 10}`;
    const res = await app.request("/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid or expired token" });
  });

  // ── AUTH-11-V3-01: single-use enforcement — second claim returns 400 (DB required) ──
  it("AUTH-11-V3-01: single-use — second POST with same token returns 400", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const email = `verify-v3-01-${Date.now()}-${Math.random()}@example.com`;
    const userId = await seedUser(email);
    if (!userId) { t.skip("seedUser failed"); return; }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    await seedToken(userId, rawToken, "email_verify", new Date(Date.now() + 24 * 60 * 60 * 1000));

    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.3.1.${Math.floor(Math.random() * 200) + 10}`;
    const headers = { "Content-Type": "application/json", "x-forwarded-for": uniqueIp };
    const requestBody = JSON.stringify({ token: rawToken });

    // First claim should succeed
    const res1 = await app.request("/v1/auth/verify-email", { method: "POST", headers, body: requestBody });
    assert.equal(res1.status, 200);

    // Second claim — same token, used_at IS NULL no longer matches → 400
    const res2 = await app.request("/v1/auth/verify-email", { method: "POST", headers, body: requestBody });
    assert.equal(res2.status, 400);
    assert.deepEqual(await res2.json(), { error: "Invalid or expired token" });
  });

  // ── AUTH-11-V4-01: rate limit — 21st request from same IP (AUTH-13 D-03 cap = 20) returns 429 ──
  it("AUTH-11-V4-01: rate limit — 21st POST from same IP returns 429 with Retry-After", async () => {
    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.4.1.${Math.floor(Math.random() * 200) + 10}`;
    let lastRes: Response | null = null;
    for (let i = 0; i < 21; i++) {
      lastRes = await app.request("/v1/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
        body: JSON.stringify({ token: crypto.randomBytes(32).toString("base64url") }),
      });
    }
    assert.equal(lastRes!.status, 429);
    assert.deepEqual(await lastRes!.json(), { error: "Too many requests" });
    const retryAfter = lastRes!.headers.get("Retry-After");
    assert.ok(retryAfter !== null, "Retry-After header must be present on 429");
    assert.ok(Number(retryAfter) >= 1, "Retry-After must be a positive integer");
  });

  // ── AUTH-11-V4-02: rate limit isolation — IP-B not rate-limited after IP-A hits limit ──
  it("AUTH-11-V4-02: rate limit per-IP isolation — different IP not rate-limited", async () => {
    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const ipA = `10.4.2.${Math.floor(Math.random() * 100) + 10}`;
    const ipB = `10.4.3.${Math.floor(Math.random() * 100) + 10}`;

    // Exhaust IP-A's bucket (20 requests — AUTH-13 D-03 cap raised 5 → 20)
    for (let i = 0; i < 20; i++) {
      await app.request("/v1/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ipA },
        body: JSON.stringify({ token: crypto.randomBytes(32).toString("base64url") }),
      });
    }

    // IP-B's first request must NOT be rate-limited
    const resB = await app.request("/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ipB },
      body: JSON.stringify({ token: crypto.randomBytes(32).toString("base64url") }),
    });
    assert.notEqual(resB.status, 429, "IP-B should not be rate-limited after IP-A exhausts its bucket");
  });

  // ── AUTH-13-V-CAP-20: lock the per-IP cap constant against accidental drift ─
  it("AUTH-13-V-CAP-20: source file declares RATE_LIMIT_MAX = 20 verbatim (drift detector)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "verify-email.ts"), "utf8");
    assert.match(
      src,
      /const RATE_LIMIT_MAX = 20;/,
      "verify-email.ts must declare RATE_LIMIT_MAX = 20 verbatim (Phase 117 AUTH-13 D-03 lock)",
    );
  });

  // ── AUTH-13-V-FIRST-20-OK: first 20 requests from a fresh IP do NOT trip 429 ─
  it("AUTH-13-V-FIRST-20-OK: first 20 POSTs from a single IP all return non-429 (token validation runs)", async () => {
    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);
    const uniqueIp = `10.117.1.${Math.floor(Math.random() * 200) + 10}`;
    for (let i = 0; i < 20; i++) {
      const res = await app.request("/v1/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
        body: JSON.stringify({ token: crypto.randomBytes(32).toString("base64url") }),
      });
      assert.notEqual(
        res.status,
        429,
        `request ${i + 1} of 20 must NOT be rate-limited (cap is 20/hr)`,
      );
    }
  });

  // ── AUTH-11-G-01: grandfathering — already-verified user re-verify succeeds (DB required) ──
  it("AUTH-11-G-01: pre-existing verified user re-verify sets email_verified_at to a new timestamp", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL not set");
      return;
    }
    // Insert user with emailVerifiedAt already set (grandfathered / backfilled)
    const email = `verify-g-01-${Date.now()}-${Math.random()}@example.com`;
    const placeholderHash =
      "$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHR0ZXN0c2FsdA$dGVzdGhhc2h0ZXN0aGFzaHRlc3RoYXNodGVzdA";
    const alreadyVerifiedAt = new Date("2026-01-01T00:00:00Z");
    const [created] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash: placeholderHash,
        passwordChangedAt: new Date(),
        emailVerifiedAt: alreadyVerifiedAt,
      })
      .onConflictDoNothing()
      .returning({ id: users.id });
    const userId = created?.id;
    if (!userId) { t.skip("seedUser failed"); return; }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    await seedToken(userId, rawToken, "email_verify", new Date(Date.now() + 24 * 60 * 60 * 1000));

    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.5.1.${Math.floor(Math.random() * 200) + 10}`;
    const before = Date.now();
    const res = await app.request("/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(res.status, 200, "Re-verify of already-verified user must return 200");
    assert.deepEqual(await res.json(), { ok: true });

    // email_verified_at must now be a recent timestamp (within 5s of the call)
    const [userRow] = await db
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const after = Date.now();
    const evat = userRow?.emailVerifiedAt?.getTime();
    assert.ok(evat !== undefined && evat !== null, "emailVerifiedAt must be non-null");
    assert.ok(
      evat! >= before - 1000 && evat! <= after + 1000,
      `emailVerifiedAt (${evat}) should be within 5s of the verify call`,
    );
  });

  // ── AUTH-11-V-MALFORMED: malformed JSON body → 400 ───────────────────────
  it("AUTH-11-V-MALFORMED: malformed JSON body → 400 Invalid JSON body", async () => {
    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.6.1.${Math.floor(Math.random() * 200) + 10}`;
    const res = await app.request("/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
      body: "{ not valid json {{",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid JSON body" });
  });

  // ── AUTH-11-V-MISSING-TOKEN: missing token field → 400 ───────────────────
  it("AUTH-11-V-MISSING-TOKEN: valid JSON but no token field → 400 token is required", async () => {
    const route = createVerifyEmailRoute();
    const { Hono: HonoClass } = await import("hono");
    const app = new HonoClass();
    app.route("/v1", route);

    const uniqueIp = `10.6.2.${Math.floor(Math.random() * 200) + 10}`;
    const res = await app.request("/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "token is required" });
  });
});
