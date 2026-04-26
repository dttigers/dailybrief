// ── Phase 113 Plan 03 — POST /v1/auth/verify-email (AUTH-11) ─────────────────
// Unauthenticated endpoint. Closes the AUTH-11 verify-email flow:
//   - D-12: in the bearerAuth bypass list (token IS the auth credential).
//   - D-13: rate limit 5/hour per-IP only (no per-user axis — body has no
//     user identifier; per-IP defends against brute-force token guessing
//     on top of 256-bit token entropy).
//   - D-10: atomic single-use UPDATE-RETURNING claim with type='email_verify'
//     filter — first DB op. PG row-lock makes it safe under concurrent
//     claims without a transaction wrapper.
//   - D-11 mutation order (LOAD-BEARING):
//       1. Atomic claim (UPDATE password_reset_tokens RETURNING user_id)
//       2. UPDATE users SET email_verified_at = now()
//       3. Return 200 { ok: true }
//     If step 2 fails AFTER step 1, the token is already burned. User
//     requests a fresh link via /resend-verification. Acceptable failure
//     mode — mirrors Phase 112 reset-password.ts D-11.
//   - D-14: 200 { ok: true }. NO JWT, NO auto-login, NO token in response.
//
// Single-bucket error UX (D-21 mirror): every failure path → 400
// { error: "Invalid or expired token" } — no expired/used/invalid/wrong-
// type differentiation. Prevents info leak; simplifies state machine.
//
// DI seam via createVerifyEmailRoute(deps) — tests inject `dbOverride` to
// simulate failures and `nowFn` for deterministic time. Production
// singleton uses real `db` from connection.js.
// -----------------------------------------------------------------------------

import { Hono } from "hono";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import * as crypto from "node:crypto";
import { db as defaultDb } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";

// ── Rate limit (D-13: per-IP only, 5/h, sliding window) ─────────────────────
// Mirrors reset-password.ts:48-87 verbatim. No per-user axis — body has no
// email/userId field; the token IS the auth credential. Per-IP catches
// brute-force token guessing (although 256-bit entropy makes that
// effectively impossible — belt-and-suspenders against T-113-02).
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const ipBuckets = new Map<string, number[]>();

// Periodic sweep — drop entries whose newest timestamp is outside the window.
// .unref() so the timer doesn't keep the test process alive.
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

/** Test-only helper. MUST NOT be called from production code. */
export function __resetBucketsForTest(): void {
  ipBuckets.clear();
}

// ── Factory + default singleton ─────────────────────────────────────────────
export interface VerifyEmailDeps {
  /** DI seam for tests — defaults to the real `db` from connection.js */
  dbOverride?: typeof defaultDb;
  /** DI seam for tests — defaults to Date.now */
  nowFn?: () => number;
}

export function createVerifyEmailRoute(deps?: VerifyEmailDeps): Hono {
  const db = deps?.dbOverride ?? defaultDb;
  const nowFn = deps?.nowFn ?? Date.now;
  const router = new Hono();

  router.post("/auth/verify-email", async (c) => {
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
    const { token } = (body ?? {}) as { token?: unknown };
    if (typeof token !== "string" || token.length === 0) {
      return c.json({ error: "token is required" }, 400);
    }

    if (!db) {
      return c.json({ error: "Database unavailable" }, 503);
    }

    // D-10: atomic single-use claim via UPDATE-RETURNING.
    // PostgreSQL row-lock makes the WHERE+SET atomic — concurrent requests
    // serialize and only the first sees `used_at IS NULL` true. The second's
    // WHERE no longer matches (used_at was just set), so it returns 0 rows.
    // No transaction wrapper needed. type='email_verify' filter prevents
    // cross-type claim against a password_reset row.
    //
    // gt(expiresAt, sql`now()`) uses PG clock for byte-exact symmetry with
    // CONTEXT D-10. JS clock would drift sub-millisecond; sql`now()` is
    // the documented choice (mirrors reset-password.ts:168).
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const claimed = await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date(now) })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          eq(passwordResetTokens.type, "email_verify"),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });

    if (claimed.length === 0) {
      // Single-bucket: invalid OR expired OR used OR wrong-type. Prevents
      // info leak; one error string for the PWA to render (D-21 mirror).
      return c.json({ error: "Invalid or expired token" }, 400);
    }

    // D-11 step 2: UPDATE users SET email_verified_at = now().
    // Mutation order (LOAD-BEARING): claim BEFORE this update BEFORE 200.
    // If THIS update throws AFTER the claim succeeded above, the token is
    // already burned. User requests a fresh link via /resend-verification.
    // Acceptable failure mode (mirrors reset-password.ts:185-196).
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date(now) })
      .where(eq(users.id, claimed[0]!.userId));

    // D-14: 200 { ok: true }. NO JWT, NO auto-login, NO token in response.
    // PWA reads the 200 and swaps to success state in place (Plan 04 D-19).
    return c.json({ ok: true }, 200);
  });

  return router;
}

/** Default singleton — what index.ts mounts. */
export const verifyEmail = createVerifyEmailRoute();
