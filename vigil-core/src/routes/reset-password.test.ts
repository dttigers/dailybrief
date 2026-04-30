// ── Phase 112 Plan 03 — TDD RED-state tests (12 cases) ───────────────────────
// Pins the public surface of POST /v1/auth/reset-password against CONTEXT
// decisions D-09..D-13 and orchestrator constraint #3 (D-11 ordering):
//   - D-09: body { token, newPassword }
//   - D-10: atomic UPDATE-RETURNING claim FIRST; 0-row → 400
//   - D-11: state-mutation order — claim → password update → 200; if step 2
//           throws, token IS burned (Test 11 mock-DB injection)
//   - D-12: success body has NO JWT, NO auto-login, NO user object
//   - D-13: per-IP rate limit (5/h sliding window)
//   - SC#3: single-use enforcement (Test 5)
//   - SC#4: passwordChangedAt bump on success (Test 2 — enables Phase 110 gate)
//   - T-112-03-07: validation BEFORE claim — token NOT burned on length failure
//
// DI seam: `createResetPasswordRoute({ dbOverride, nowFn })` factory produces a
// fresh Hono router per `beforeEach`. `__resetBucketsForTest()` clears the
// per-IP rate-limit Map so accumulation across tests doesn't fire 429 mid-suite.
//
// DB requirement: tests 1, 2, 3, 4, 5, 6, 8, 9, 11 require a live DATABASE_URL
// with the 0016 migration applied (Plan 01). Without DATABASE_URL the per-test
// guard calls `t.skip(...)`. Tests 7, 10, 12 are pure-validation/rate-limit and
// run without DB.
//
// Test runner: `cd vigil-core && npx tsx --test src/routes/reset-password.test.ts`
// -----------------------------------------------------------------------------

// Set JWT_SECRET BEFORE importing the route — utils/jwt.ts exits at import time
// without it (per index.ts:61-64 and the auth.test.ts pattern at line 21).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import * as crypto from "node:crypto";

import {
  createResetPasswordRoute,
  __resetBucketsForTest as resetResetBuckets,
} from "./reset-password.js";
import { db } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function seedUser(
  email: string,
  password = "InitialPass123!",
): Promise<{ id: number; email: string; passwordHash: string; passwordChangedAt: Date }> {
  if (!db) throw new Error("DB unavailable in tests");
  const passwordHash = await hashPassword(password);
  await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      passwordChangedAt: new Date(),
    })
    .onConflictDoNothing();
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!u) throw new Error(`Failed to seed user ${email}`);
  return u as {
    id: number;
    email: string;
    passwordHash: string;
    passwordChangedAt: Date;
  };
}

async function seedToken(
  userId: number,
  opts?: { expiresAt?: Date; usedAt?: Date | null },
): Promise<{ rawToken: string; tokenHash: string }> {
  if (!db) throw new Error("DB unavailable in tests");
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(rawToken);
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    type: "password_reset",
    expiresAt: opts?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    usedAt: opts?.usedAt ?? null,
  });
  return { rawToken, tokenHash };
}

describe("POST /v1/auth/reset-password", () => {
  let app: Hono;

  beforeEach(() => {
    resetResetBuckets();
    const route = createResetPasswordRoute();
    app = new Hono();
    app.route("/v1", route);
  });

  // ── Test 1: valid token + valid password → 200 success ──────────────────────
  it("valid token + valid new password returns 200 success body", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL required");
      return;
    }
    const u = await seedUser(`reset-1-${Date.now()}-${Math.random()}@example.com`);
    const { rawToken } = await seedToken(u.id);
    const res = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "ValidNewPass123!" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      ok: true,
      message: "Password reset successful. You can now log in.",
    });
  });

  // ── Test 2: SC#4 — successful reset bumps users.password_changed_at ────────
  it("successful reset bumps users.password_changed_at", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL required");
      return;
    }
    const u = await seedUser(`reset-2-${Date.now()}-${Math.random()}@example.com`);
    const before = u.passwordChangedAt;
    // Ensure clock advances so the bump is observable (some PG installs have
    // millisecond-resolution timestamps).
    await new Promise((r) => setTimeout(r, 10));
    const { rawToken } = await seedToken(u.id);
    const res = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "ValidNewPass123!" }),
    });
    assert.equal(res.status, 200);
    const [after] = await db
      .select({ pca: users.passwordChangedAt })
      .from(users)
      .where(eq(users.id, u.id))
      .limit(1);
    const beforeMs = before instanceof Date ? before.getTime() : new Date(before).getTime();
    const afterMs = after!.pca!.getTime();
    assert.ok(
      afterMs > beforeMs,
      `password_changed_at should be bumped (before=${beforeMs} after=${afterMs})`,
    );
  });

  // ── Test 3: new password_hash verifies; old plaintext no longer works ──────
  it("successful reset stores a new password_hash that verifyPassword accepts", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL required");
      return;
    }
    const u = await seedUser(
      `reset-3-${Date.now()}-${Math.random()}@example.com`,
      "InitialPass123!",
    );
    const { rawToken } = await seedToken(u.id);
    const newPw = "BrandNewPassword123!";
    const res = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: newPw }),
    });
    assert.equal(res.status, 200);
    const [refreshed] = await db
      .select({ ph: users.passwordHash })
      .from(users)
      .where(eq(users.id, u.id))
      .limit(1);
    assert.equal(
      await verifyPassword(newPw, refreshed!.ph),
      true,
      "new password should verify against stored hash",
    );
    assert.equal(
      await verifyPassword("InitialPass123!", refreshed!.ph),
      false,
      "old password should NOT verify against new hash",
    );
  });

  // ── Test 4: D-12 — success response contains NO JWT and NO user object ─────
  it("D-12 success response contains NO JWT and NO token", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL required");
      return;
    }
    const u = await seedUser(`reset-4-${Date.now()}-${Math.random()}@example.com`);
    const { rawToken } = await seedToken(u.id);
    const res = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "ValidNewPass123!" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(body).sort(),
      ["message", "ok"],
      "response body must contain ONLY 'ok' and 'message' keys",
    );
    assert.equal(
      (body.message as string).includes("eyJ"),
      false,
      "message must not contain a JWT-shaped substring",
    );
    assert.equal("token" in body, false, "no 'token' field in response");
    assert.equal("jwt" in body, false, "no 'jwt' field in response");
    assert.equal("user" in body, false, "no 'user' field in response");
  });

  // ── Test 5: SC#3 — single-use enforcement ──────────────────────────────────
  it("single-use: second claim with same token returns 400 'Invalid or expired token'", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL required");
      return;
    }
    const u = await seedUser(`reset-5-${Date.now()}-${Math.random()}@example.com`);
    const { rawToken, tokenHash } = await seedToken(u.id);
    const res1 = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "ValidNewPass123!" }),
    });
    assert.equal(res1.status, 200);
    const res2 = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "AnotherValidPass!" }),
    });
    assert.equal(res2.status, 400);
    assert.deepEqual(await res2.json(), { error: "Invalid or expired token" });

    const [row] = await db
      .select({ usedAt: passwordResetTokens.usedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    assert.notEqual(row!.usedAt, null, "used_at must be non-NULL after first claim");
  });

  // ── Test 6: expired token returns 400 ───────────────────────────────────────
  it("expired token returns 400 'Invalid or expired token'", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL required");
      return;
    }
    const u = await seedUser(`reset-6-${Date.now()}-${Math.random()}@example.com`);
    const { rawToken } = await seedToken(u.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "ValidNewPass123!" }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid or expired token" });
  });

  // ── Test 7: unknown / random token returns 400 (no DB seed needed) ─────────
  it("unknown / random token returns 400 'Invalid or expired token'", async () => {
    const res = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "totally-random-no-way-this-matches-xyz",
        newPassword: "ValidNewPass123!",
      }),
    });
    // If DB is unavailable the handler returns 503; the single-bucket UX is
    // only meaningful when DB is reachable. Skip DB-availability path here:
    // 400 is the correct answer when the row simply doesn't exist.
    if (res.status === 503) {
      return; // DB unavailable — out of scope for this test
    }
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid or expired token" });
  });

  // ── Test 8: T-112-03-07 — validation BEFORE claim, token NOT burned ────────
  it("newPassword < 12 chars returns 400 with length error AND token is NOT burned", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL required");
      return;
    }
    const u = await seedUser(`reset-8-${Date.now()}-${Math.random()}@example.com`);
    const { rawToken, tokenHash } = await seedToken(u.id);
    const res = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "short" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Password must be 12-128 characters/);

    // CRITICAL: validation must happen BEFORE the atomic claim.
    const [row] = await db
      .select({ usedAt: passwordResetTokens.usedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    assert.equal(
      row!.usedAt,
      null,
      "validation failure must NOT burn the token (T-112-03-07)",
    );
  });

  // ── Test 9: same as 8 but on the other end (>128 chars) ────────────────────
  it("newPassword > 128 chars returns 400 AND token is NOT burned", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL required");
      return;
    }
    const u = await seedUser(`reset-9-${Date.now()}-${Math.random()}@example.com`);
    const { rawToken, tokenHash } = await seedToken(u.id);
    const res = await app.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "X".repeat(129) }),
    });
    assert.equal(res.status, 400);
    const [row] = await db
      .select({ usedAt: passwordResetTokens.usedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    assert.equal(row!.usedAt, null);
  });

  // ── Test 10: per-IP rate limit (20/h, raised in Phase 117 AUTH-13 D-03) — 21st call returns 429 ──
  it("per-IP rate limit (20/h) — 21st call from same IP returns 429", async () => {
    let last: Response | null = null;
    const ipForThisTest = `10.0.0.${Math.floor(Math.random() * 200) + 1}`;
    for (let i = 0; i < 21; i++) {
      last = await app.request("/v1/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ipForThisTest,
        },
        body: JSON.stringify({
          token: `unknown-${i}-${Date.now()}-${Math.random()}`,
          newPassword: "ValidNewPass123!",
        }),
      });
    }
    assert.equal(last!.status, 429);
    assert.deepEqual(await last!.json(), { error: "Too many requests" });
    assert.ok(
      last!.headers.get("Retry-After") !== null,
      "Retry-After header should be set on 429",
    );
  });

  // ── AUTH-13-R-CAP-20: lock the per-IP cap constant against accidental drift ─
  it("AUTH-13-R-CAP-20: source file declares RATE_LIMIT_MAX = 20 verbatim (drift detector)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "reset-password.ts"), "utf8");
    assert.match(
      src,
      /const RATE_LIMIT_MAX = 20;/,
      "reset-password.ts must declare RATE_LIMIT_MAX = 20 verbatim (Phase 117 AUTH-13 D-03 lock)",
    );
  });

  // ── AUTH-13-R-FIRST-20-OK: first 20 requests from a fresh IP do NOT trip 429 ─
  it("AUTH-13-R-FIRST-20-OK: first 20 POSTs from a single IP all return non-429", async () => {
    const route = createResetPasswordRoute();
    const { Hono: HonoClass } = await import("hono");
    const localApp = new HonoClass();
    localApp.route("/v1", route);
    const uniqueIp = `10.117.2.${Math.floor(Math.random() * 200) + 10}`;
    for (let i = 0; i < 20; i++) {
      const res = await localApp.request("/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp },
        body: JSON.stringify({
          token: crypto.randomBytes(32).toString("base64url"),
          newPassword: "ValidNewPass123!",
        }),
      });
      assert.notEqual(
        res.status,
        429,
        `request ${i + 1} of 20 must NOT be rate-limited (cap is 20/hr)`,
      );
    }
  });

  // ── Test 11: D-11 ORDERING PIN — mock DB throws on user.update ─────────────
  // This is the LOAD-BEARING test for the plan. Pins the constraint that the
  // atomic claim happens BEFORE the password update. If the password update
  // throws, the token IS already burned (used_at non-NULL) — the user must
  // request a fresh reset. Accepted failure mode per CONTEXT D-11 last
  // paragraph and orchestrator constraint #3.
  it("D-11 ordering: mock DB throws on user.update — token IS burned (accepted failure mode)", async (t) => {
    if (!process.env["DATABASE_URL"] || !db) {
      t.skip("DATABASE_URL required");
      return;
    }
    const u = await seedUser(`reset-11-${Date.now()}-${Math.random()}@example.com`);
    const { rawToken, tokenHash } = await seedToken(u.id);

    // Mock DB: pass-through .update(passwordResetTokens) (the atomic claim)
    // but throw on the second .update() call (the users update). Drizzle's
    // chainable API makes this awkward — we count update() calls and route
    // call #1 through the real DB, call #2 throws synchronously.
    let updateCalls = 0;
    const realDb = db;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockDb: any = new Proxy(realDb, {
      get(target, prop, receiver) {
        if (prop === "update") {
          return (table: unknown) => {
            updateCalls++;
            if (updateCalls === 1) {
              // claim — succeeds via real DB
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (target as any).update(table);
            }
            throw new Error(
              "simulated PG failure on user update (D-11 ordering test)",
            );
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const route = createResetPasswordRoute({ dbOverride: mockDb });
    const localApp = new Hono();
    localApp.route("/v1", route);

    const res = await localApp.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "ValidNewPass123!" }),
    });
    assert.ok(
      res.status >= 500,
      `expected 5xx after user.update throw, got ${res.status}`,
    );

    // Verify token IS burned — the FIRST step succeeded against the REAL DB.
    const [row] = await realDb
      .select({ usedAt: passwordResetTokens.usedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    assert.notEqual(
      row!.usedAt,
      null,
      "D-11 acceptance: token IS burned even when step 2 fails",
    );
  });

  // ── Test 12: missing field → 400 ───────────────────────────────────────────
  it("missing 'token' or 'newPassword' field returns 400", async () => {
    for (const body of [
      JSON.stringify({ token: "x" }),
      JSON.stringify({ newPassword: "ValidNewPass123!" }),
      JSON.stringify({}),
    ]) {
      const res = await app.request("/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      assert.equal(res.status, 400);
      const json = (await res.json()) as { error: string };
      assert.match(json.error, /token and newPassword are required/);
    }
  });
});
