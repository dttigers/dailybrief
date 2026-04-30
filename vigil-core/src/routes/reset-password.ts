// ── Phase 112 Plan 03 — POST /v1/auth/reset-password (AUTH-10) ───────────────
// Unauthenticated endpoint. Closes the AUTH-10 forgot-password flow:
//   - Atomic single-use UPDATE-RETURNING claim against password_reset_tokens
//     (CONTEXT D-02/D-10) — first DB op; PostgreSQL row-lock makes it safe
//     under concurrent claims without a transaction wrapper.
//   - On 1-row claim, hash newPassword and update users.password_hash +
//     password_changed_at + updated_at. The password_changed_at bump
//     invalidates all pre-reset JWTs via Phase 110's bearerAuth iat-gate
//     (vigil-core/src/middleware/auth.ts:110-145) — automatic, no new gate
//     code in this plan.
//   - D-12: 200 { ok, message } success body — NO JWT, NO auto-login,
//     NO token in response. PWA navigates to /auth?reason=password_reset
//     on this 200 (Plan 04).
//
// State-mutation order (D-11 / orchestrator constraint #3) is LOAD-BEARING:
//   1. Atomic claim (UPDATE password_reset_tokens RETURNING user_id)
//   2. UPDATE users (password_hash + password_changed_at + updated_at)
//   3. Return 200
// If step 2 fails AFTER step 1 succeeded, the token is already burned
// (used_at non-NULL). User requests a fresh /forgot-password. Acceptable
// failure mode — pinned by Test 11 in reset-password.test.ts (mock-DB throw).
//
// Length validation appears BEFORE the atomic claim (T-112-03-07): a too-
// short / too-long newPassword must NOT consume the token. Tests 8 + 9 enforce.
//
// Mounted in vigil-core/src/index.ts BEFORE the bearerAuth dispatcher (Plan 03
// Task 3). The dispatcher's exempt list is also extended with
// `/v1/auth/reset-password`.
//
// DI seam via createResetPasswordRoute(deps) — tests inject `dbOverride` to
// simulate PG failures (Test 11). Production singleton uses real `db` from
// connection.js. `nowFn` is a secondary seam rarely overridden.
// -----------------------------------------------------------------------------

import { Hono } from "hono";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import * as crypto from "node:crypto";
import { db as defaultDb } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";
import { hashPassword } from "../utils/password.js";

// ── Constants ────────────────────────────────────────────────────────────────
// Keep in sync with vigil-core/src/routes/auth.ts:19-20. Plan 02 took the same
// approach for DUMMY_HASH (drift detection by file-search).
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 128;

// ── Rate limit (D-13 + Phase 117 D-03: per-IP only, 20/h, sliding window) ──
// No per-email axis — the body has no email field; the token IS the auth.
// Per-IP defends against brute-force token guessing (although 256-bit entropy
// makes that effectively impossible — belt-and-suspenders).
//
// Phase 117 (AUTH-13 D-03): raised 5 → 20 to tolerate household-NAT retry
// patterns. Brute-force protection structurally preserved — 20/hr per-IP
// still hard-blocks 100/min abuse. Token entropy is 256-bit, mirroring
// verify-email.ts cap policy verbatim (kept in sync intentionally —
// both endpoints share the same threat profile per CONTEXT D-03).
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const ipBuckets = new Map<string, number[]>();

// Periodic sweep — drop entries whose newest timestamp is outside the window.
// .unref() so the timer doesn't keep the test process alive (matches
// Plan 02 forgot-password.ts pattern).
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [k, arr] of ipBuckets) {
    const last = arr[arr.length - 1];
    if (arr.length === 0 || (last !== undefined && last < cutoff)) {
      ipBuckets.delete(k);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

function takeSlot(
  key: string,
  now: number,
): { ok: boolean; retryAfterSec: number } {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (ipBuckets.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= RATE_LIMIT_MAX) {
    const oldest = arr[0]!;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    ipBuckets.set(key, arr);
    return { ok: false, retryAfterSec };
  }
  arr.push(now);
  ipBuckets.set(key, arr);
  return { ok: true, retryAfterSec: 0 };
}

// Test-only helper. Must NOT be called from production code.
export function __resetBucketsForTest(): void {
  ipBuckets.clear();
}

// ── Factory + default singleton ─────────────────────────────────────────────
export interface ResetPasswordDeps {
  /** DI seam for tests — defaults to the real `db` from connection.js */
  dbOverride?: typeof defaultDb;
  /** DI seam for tests — defaults to Date.now */
  nowFn?: () => number;
}

export function createResetPasswordRoute(deps?: ResetPasswordDeps): Hono {
  const db = deps?.dbOverride ?? defaultDb;
  const nowFn = deps?.nowFn ?? Date.now;
  const router = new Hono();

  router.post("/auth/reset-password", async (c) => {
    // D-13: per-IP rate limit FIRST — token-guessing brute force is the threat.
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const now = nowFn();
    const slot = takeSlot(ip, now);
    if (!slot.ok) {
      c.header("Retry-After", String(slot.retryAfterSec));
      return c.json({ error: "Too many requests" }, 429);
    }

    // Body parse
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const { token, newPassword } = (body ?? {}) as {
      token?: unknown;
      newPassword?: unknown;
    };

    // Field guards — exact error string per plan must_haves
    if (typeof token !== "string" || typeof newPassword !== "string") {
      return c.json({ error: "token and newPassword are required" }, 400);
    }

    // T-112-03-07: length validation BEFORE atomic claim — a too-short / too-
    // long newPassword must NOT burn the token. Tests 8 + 9 enforce; the
    // ordering check in the plan's verification awk script anchors this at
    // file level.
    if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
      return c.json(
        { error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters` },
        400,
      );
    }

    if (!db) {
      return c.json({ error: "Database unavailable" }, 503);
    }

    // D-10: atomic single-use claim via UPDATE-RETURNING. RESEARCH §Pattern-2.
    // PostgreSQL row-lock makes the WHERE+SET atomic — concurrent requests
    // serialize and only the first sees `used_at IS NULL` true. The second's
    // WHERE no longer matches (used_at was just set), so it returns 0 rows.
    // No transaction wrapper needed.
    //
    // gt(expiresAt, sql`now()`) uses PG clock for byte-exact symmetry with
    // CONTEXT D-02's spec. JS clock would drift sub-millisecond at single-
    // instance scale — sql`now()` is the documented choice.
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const claimed = await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date(now) })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          eq(passwordResetTokens.type, "password_reset"),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });

    if (claimed.length === 0) {
      // Single-bucket: invalid OR expired OR used. D-20 (PWA single-bucket
      // UX) mirrored on the server — prevents info leak, keeps the state
      // machine simple.
      return c.json({ error: "Invalid or expired token" }, 400);
    }

    // D-11 step 2: update password + bump password_changed_at + updatedAt.
    // Phase 110 D-12: passwordChangedAt bump invalidates pre-reset JWTs via
    // the bearerAuth iat-gate (vigil-core/src/middleware/auth.ts:110-145).
    // No new gate code in this plan — the gate fires automatically on next
    // request from any pre-reset JWT.
    //
    // CONTEXT D-11 last paragraph: if THIS UPDATE throws AFTER the claim
    // succeeded above, the token is already burned. User requests a fresh
    // reset via /forgot-password. Acceptable failure mode — Test 11 mocks
    // a DB throw here and asserts (a) response is 5xx and (b) token row's
    // used_at IS non-NULL after the failed call.
    const newHash = await hashPassword(newPassword);
    const ts = new Date(now);
    await db
      .update(users)
      .set({ passwordHash: newHash, passwordChangedAt: ts, updatedAt: ts })
      .where(eq(users.id, claimed[0]!.userId));

    // D-12: NO JWT, NO auto-login, NO token in response. PWA navigates to
    // /auth?reason=password_reset on this 200 (Plan 04).
    return c.json({
      ok: true,
      message: "Password reset successful. You can now log in.",
    });
  });

  return router;
}

// Default singleton — what index.ts mounts.
export const resetPassword = createResetPasswordRoute();
