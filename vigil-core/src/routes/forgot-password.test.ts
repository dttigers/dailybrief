// ── Phase 112 Plan 02 — TDD RED-state tests (10 cases) ────────────────────────
// Pins the public surface of POST /v1/auth/forgot-password against CONTEXT
// decisions D-03..D-08, D-21:
//   - D-03: identical 200 enum-safe body on hit AND miss AND rate-limited paths
//   - D-04: dual-axis rate limit (5/h per-IP AND per-email)
//   - D-05: dummy argon2 verify on miss path → wall-clock parity within ~30%
//   - D-06: invalidate-prior-tokens on second forgot-password (most-recent-link-wins)
//   - D-07: token = base64url(crypto.randomBytes(32)) ≈ 43 chars
//   - D-08: SHA-256 hex hash stored; raw token NEVER touches DB
//   - D-21: resetUrl = `${VIGIL_APP_BASE_URL || prod-fallback}/auth/reset?token=<raw>`
//
// DI seam: `createForgotPasswordRoute({ sendEmailFn, nowFn })` factory produces
// a fresh Hono router per `beforeEach` so the in-process rate-limit Maps are
// shared across tests in this file but reset between tests via
// `__resetBucketsForTest()`. Tests that exercise rate limits use the same
// (email, IP) pair so the buckets accumulate; tests that don't use unique
// emails / IPs to dodge bucket collisions.
//
// DB requirement: tests 2, 4, 5, 6, 7, 8 require a live DATABASE_URL with the
// 0016 migration applied (Plan 01). Without DATABASE_URL the per-test guard
// calls `t.skip(...)` — matches the pattern at auth.test.ts:79-82.
//
// Test runner: `cd vigil-core && npx tsx --test src/routes/forgot-password.test.ts`
// Full suite:  `cd vigil-core && npm test`
// -----------------------------------------------------------------------------

// Set JWT_SECRET BEFORE importing the route — utils/jwt.ts exits at import time
// without it (per index.ts:61-64 and the auth.test.ts pattern at line 21).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import * as crypto from "node:crypto";

import {
  createForgotPasswordRoute,
  __resetBucketsForTest,
} from "./forgot-password.js";
import { db } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function seedUser(email: string): Promise<void> {
  if (!db) throw new Error("DB unavailable in tests");
  // Argon2id placeholder hash — same OPTIONS shape the real codebase uses
  // (m=19456, t=2, p=1). Not a valid login password but valid argon2 syntax.
  const placeholderHash =
    "$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHR0ZXN0c2FsdA$dGVzdGhhc2h0ZXN0aGFzaHRlc3RoYXNodGVzdA";
  await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash: placeholderHash,
      passwordChangedAt: new Date(),
    })
    .onConflictDoNothing();
}

async function clearTokensFor(email: string): Promise<void> {
  if (!db) return;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (u) {
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, u.id));
  }
}

describe("POST /v1/auth/forgot-password", () => {
  let sendSpy: ReturnType<typeof mock.fn>;
  let app: Hono;

  beforeEach(() => {
    __resetBucketsForTest();
    sendSpy = mock.fn(async () => ({ status: "sent" as const, id: "test_id" }));
    const route = createForgotPasswordRoute({
      sendEmailFn: sendSpy as unknown as NonNullable<
        Parameters<typeof createForgotPasswordRoute>[0]
      >["sendEmailFn"],
    });
    app = new Hono();
    app.route("/v1", route);
  });

  // ── Test 1: unknown email → 200 enum-safe body ──────────────────────────────
  it("unknown email returns 200 with enum-safe body", async () => {
    const res = await app.request("/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `no-such-user-${Date.now()}-${Math.random()}@example.com`,
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; message: string };
    assert.equal(body.ok, true);
    assert.equal(
      body.message,
      "If your account exists, a reset link has been sent.",
    );
  });

  // ── Test 2: known email returns IDENTICAL body ─────────────────────────────
  it("known email returns 200 with IDENTICAL enum-safe body", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    if (!db) {
      t.skip("db not initialized");
      return;
    }
    const email = `known-user-${Date.now()}-${Math.random()}@example.com`;
    await seedUser(email);
    const res = await app.request("/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      ok: true,
      message: "If your account exists, a reset link has been sent.",
    });
  });

  // ── Test 3: timing approximation (hit/miss within 1.5x; median of 3) ───────
  it("hit-path and miss-path wall-clock times are within 1.5x (median of 3 runs)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    if (!db) {
      t.skip("db not initialized");
      return;
    }
    const knownEmail = `timing-user-${Date.now()}-${Math.random()}@example.com`;
    await seedUser(knownEmail);
    await clearTokensFor(knownEmail);

    // Reset per-call so the rate-limit buckets don't fire mid-suite.
    // Without this, calls 6+ hit the per-IP limit and short-circuit to ~0.4ms,
    // skewing the median of misses below the median of hits.
    async function timeOne(email: string): Promise<number> {
      __resetBucketsForTest();
      const t0 = process.hrtime.bigint();
      await app.request("/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const t1 = process.hrtime.bigint();
      return Number(t1 - t0) / 1_000_000; // ms
    }
    const median = (a: number[]): number => {
      const sorted = a.slice().sort((x, y) => x - y);
      return sorted[Math.floor(sorted.length / 2)]!;
    };

    // Warmup — first argon2 call is slower than steady-state due to JIT.
    await timeOne(`warmup-${Date.now()}@example.com`);

    const hits = [
      await timeOne(knownEmail),
      await timeOne(knownEmail),
      await timeOne(knownEmail),
    ];
    const misses = [
      await timeOne(`miss-1-${Date.now()}-${Math.random()}@example.com`),
      await timeOne(`miss-2-${Date.now()}-${Math.random()}@example.com`),
      await timeOne(`miss-3-${Date.now()}-${Math.random()}@example.com`),
    ];
    const hitMedian = median(hits);
    const missMedian = median(misses);
    const ratio =
      Math.max(hitMedian, missMedian) / Math.min(hitMedian, missMedian);
    // SC#1: APPROXIMATE parity per CONTEXT D-05 ("Approximate, not constant-time").
    // Both hit AND miss paths run argon2 verify against DUMMY_HASH (handler
    // adds verify on hit path explicitly to match miss-path cost). On native
    // @node-rs/argon2 the dominant op is ~18-19ms; DB writes add ~5-10ms;
    // measured ratio settles around 1.1-1.3x with the rate-limit bucket reset
    // in timeOne(). 1.5x leaves headroom for steady-state variance.
    assert.ok(
      ratio < 1.5,
      `hit/miss ratio ${ratio.toFixed(2)} (hit=${hitMedian.toFixed(1)}ms miss=${missMedian.toFixed(1)}ms) exceeds 1.5x — enumeration safety degraded`,
    );
  });

  // ── Test 4: raw token never in DB; only SHA-256 hash ───────────────────────
  it("raw token never appears in DB; only SHA-256 hex hash is stored", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    if (!db) {
      t.skip("db not initialized");
      return;
    }
    const email = `token-storage-${Date.now()}-${Math.random()}@example.com`;
    await seedUser(email);
    await clearTokensFor(email);

    const res = await app.request("/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 200);

    assert.equal(sendSpy.mock.callCount(), 1);
    const [, resetUrl] = sendSpy.mock.calls[0]!.arguments as [string, string];
    const rawToken = new URL(resetUrl).searchParams.get("token")!;
    assert.match(rawToken, /^[A-Za-z0-9_-]+$/, "rawToken must be base64url-shaped");

    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    const [row] = await db
      .select({ tokenHash: passwordResetTokens.tokenHash })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, u!.id))
      .limit(1);
    assert.equal(
      row!.tokenHash,
      sha256Hex(rawToken),
      "stored token_hash must equal sha256(rawToken)",
    );
    assert.notEqual(
      row!.tokenHash,
      rawToken,
      "stored token_hash must NOT equal rawToken",
    );
    assert.equal(row!.tokenHash.length, 64, "SHA-256 hex is 64 chars");
  });

  // ── Test 5: D-06 invalidate-prior on second forgot-password ─────────────────
  it("prior unused tokens for the user are invalidated when issuing a new one (D-06)", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    if (!db) {
      t.skip("db not initialized");
      return;
    }
    const email = `d06-${Date.now()}-${Math.random()}@example.com`;
    await seedUser(email);
    await clearTokensFor(email);

    // First request — creates token A
    await app.request("/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    // Second request — must invalidate A AND create B
    await app.request("/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    const rows = await db
      .select({
        tokenHash: passwordResetTokens.tokenHash,
        usedAt: passwordResetTokens.usedAt,
        createdAt: passwordResetTokens.createdAt,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, u!.id))
      .orderBy(passwordResetTokens.createdAt);
    assert.equal(rows.length, 2, "should have 2 rows after two forgot-password calls");
    assert.notEqual(
      rows[0]!.usedAt,
      null,
      "first (older) token must be invalidated (used_at != null)",
    );
    assert.equal(
      rows[1]!.usedAt,
      null,
      "second (newer) token must be unused (used_at IS NULL)",
    );
  });

  // ── Test 6: sendPasswordResetEmail called with email + reset URL ──────────
  it("hit-path calls sendPasswordResetEmail with the user's email and a reset URL containing the rawToken", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    if (!db) {
      t.skip("db not initialized");
      return;
    }
    const email = `email-spy-${Date.now()}-${Math.random()}@example.com`;
    await seedUser(email);
    await clearTokensFor(email);
    sendSpy.mock.resetCalls();

    await app.request("/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    assert.equal(sendSpy.mock.callCount(), 1);
    const [to, url] = sendSpy.mock.calls[0]!.arguments as [string, string];
    assert.equal(to, email.toLowerCase().trim());
    assert.ok(url.startsWith("http"), `resetUrl must start with http: ${url}`);
    assert.ok(
      url.includes("/auth/reset?token="),
      `resetUrl must include /auth/reset?token=: ${url}`,
    );
    const token = new URL(url).searchParams.get("token")!;
    assert.match(token, /^[A-Za-z0-9_-]+$/, "token must be base64url");
    assert.ok(
      token.length >= 40 && token.length <= 50,
      `base64url(32 bytes) ~= 43 chars; got ${token.length}`,
    );
  });

  // ── Test 7: per-email rate limit (5/h) — 6th call still 200 enum-safe ─────
  it("per-email rate limit fires after 5 requests within 1 hour for the same email", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    if (!db) {
      t.skip("db not initialized");
      return;
    }
    const email = `rl-email-${Date.now()}-${Math.random()}@example.com`;
    await seedUser(email);
    await clearTokensFor(email);
    sendSpy.mock.resetCalls();

    for (let i = 0; i < 6; i++) {
      const res = await app.request("/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      assert.equal(
        res.status,
        200,
        `call ${i + 1} must be 200 (enum-safe even on rate limit)`,
      );
      const body = await res.json();
      assert.deepEqual(body, {
        ok: true,
        message: "If your account exists, a reset link has been sent.",
      });
    }
    assert.ok(
      sendSpy.mock.callCount() <= 5,
      `sendPasswordResetEmail called ${sendSpy.mock.callCount()} times — must be <= 5 (per-email cap)`,
    );
  });

  // ── Test 8: per-IP rate limit (5/h) across different emails ───────────────
  it("per-IP rate limit fires after 5 requests within 1 hour from the same IP across DIFFERENT emails", async (t) => {
    if (!process.env["DATABASE_URL"]) {
      t.skip("DATABASE_URL required");
      return;
    }
    if (!db) {
      t.skip("db not initialized");
      return;
    }
    sendSpy.mock.resetCalls();
    const baseTs = Date.now();
    const ipForThisTest = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;
    for (let i = 0; i < 6; i++) {
      const email = `rl-ip-${baseTs}-${Math.random()}-${i}@example.com`;
      await seedUser(email);
      const res = await app.request("/v1/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ipForThisTest,
        },
        body: JSON.stringify({ email }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, {
        ok: true,
        message: "If your account exists, a reset link has been sent.",
      });
    }
    assert.ok(
      sendSpy.mock.callCount() <= 5,
      `sendPasswordResetEmail called ${sendSpy.mock.callCount()} times — must be <= 5 (per-IP cap)`,
    );
  });

  // ── Test 9: invalid JSON body returns 200 enum-safe ───────────────────────
  it("invalid JSON body returns 200 enum-safe (no shape leak)", async () => {
    const res = await app.request("/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      ok: true,
      message: "If your account exists, a reset link has been sent.",
    });
  });

  // ── Test 10: missing email field returns 200 enum-safe ────────────────────
  it("missing 'email' field returns 200 enum-safe (no shape leak)", async () => {
    const res = await app.request("/v1/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      ok: true,
      message: "If your account exists, a reset link has been sent.",
    });
  });
});
