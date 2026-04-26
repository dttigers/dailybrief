// ── Phase 113 Plan 03 — POST /v1/auth/resend-verification (AUTH-11) ──────────
// bearerAuth required (D-15). Body: empty {}. userId from JWT (c.get("userId")).
//
// Behavior (D-16, D-17, D-18):
//   1. D-18: idempotency — read users.email_verified_at; if non-null, return
//      200 { ok: true, already_verified: true } and skip everything else.
//      (Checked BEFORE rate limit consumption so already-verified users
//      don't burn rate limit slots — T-113-IDEM-01.)
//   2. D-16: per-userId rate limit 3/hour with key `verify-resend:userId:{id}`.
//      429 + Retry-After on excess.
//   3. D-17: most-recent-link wins — UPDATE password_reset_tokens
//      SET used_at = now() WHERE user_id = $1 AND type = 'email_verify'
//      AND used_at IS NULL. Then INSERT a new email_verify row (24h expiry).
//   4. Fire-and-forget sendEmailVerificationEmail.catch() (D-08 mirror).
//   5. Return 200 { ok: true }.
//
// DI factory mirrors forgot-password.ts shape: createResendVerificationRoute(deps?)
// accepts sendEmailFn (test spy) + dbOverride + nowFn + userLookupFn. Production
// singleton uses the real wrappers/db.
// -----------------------------------------------------------------------------

import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import * as crypto from "node:crypto";
import { db as defaultDb } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";
import { sendEmailVerificationEmail as realSendEmailVerificationEmail } from "../services/email-service.js";

// ── Constants ────────────────────────────────────────────────────────────────
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h (matches Plan 02 register helper)
const RATE_LIMIT_MAX = 3;                          // D-16: 3 per hour per userId
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_KEY_PREFIX = "verify-resend:userId:";   // D-16 exact format — namespacing prevents Map collisions

// ── Per-userId rate limit (mirrors reset-password.ts:48-87 shape) ────────────
const userBuckets = new Map<string, number[]>();

// Periodic sweep — drop entries whose newest timestamp is outside the window.
// .unref() so the timer doesn't keep the test process alive.
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [k, arr] of userBuckets) {
    const last = arr[arr.length - 1];
    if (arr.length === 0 || (last !== undefined && last < cutoff)) {
      userBuckets.delete(k);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

function takeSlot(
  key: string,
  now: number,
): { ok: boolean; retryAfterSec: number } {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (userBuckets.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= RATE_LIMIT_MAX) {
    const oldest = arr[0]!;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000),
    );
    userBuckets.set(key, arr);
    return { ok: false, retryAfterSec };
  }
  arr.push(now);
  userBuckets.set(key, arr);
  return { ok: true, retryAfterSec: 0 };
}

/** Test-only helper. MUST NOT be called from production code. */
export function __resetBucketsForTest(): void {
  userBuckets.clear();
}

// ── Factory + default singleton ─────────────────────────────────────────────
export interface ResendVerificationDeps {
  /** DI seam — defaults to email-service.sendEmailVerificationEmail */
  sendEmailFn?: typeof realSendEmailVerificationEmail;
  /** DI seam — defaults to the real `db` from connection.js */
  dbOverride?: typeof defaultDb;
  /** DI seam — defaults to Date.now */
  nowFn?: () => number;
  /**
   * DI seam — replaces the SELECT users WHERE id=$1 lookup. Tests use this
   * to inject already-verified vs unverified states without seeding the DB.
   * Returns null when the user row does not exist → 401 invalid_user.
   */
  userLookupFn?: (
    userId: number,
  ) => Promise<{ email: string; emailVerifiedAt: Date | null } | null>;
}

export function createResendVerificationRoute(
  deps?: ResendVerificationDeps,
): Hono {
  const sendEmailFn = deps?.sendEmailFn ?? realSendEmailVerificationEmail;
  const db = deps?.dbOverride ?? defaultDb;
  const nowFn = deps?.nowFn ?? Date.now;

  const defaultLookup = async (
    userId: number,
  ): Promise<{ email: string; emailVerifiedAt: Date | null } | null> => {
    if (!db) return null;
    const [u] = await db
      .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return u ?? null;
  };
  const userLookupFn = deps?.userLookupFn ?? defaultLookup;

  const router = new Hono();

  router.post("/auth/resend-verification", async (c) => {
    const userId = c.get("userId") as number | undefined;
    if (!Number.isInteger(userId) || (userId as number) <= 0) {
      return c.json({ error: "invalid_user" }, 401);
    }

    const now = nowFn();

    // D-18: idempotency — read users.email_verified_at FIRST (before rate
    // limit slot consumption, so an already-verified user doesn't burn
    // their rate limit on a no-op). T-113-IDEM-01: awk acceptance check
    // verifies `already_verified` return appears BEFORE `takeSlot` call.
    const user = await userLookupFn(userId as number);
    if (!user) {
      return c.json({ error: "invalid_user" }, 401);
    }
    if (user.emailVerifiedAt !== null) {
      return c.json({ ok: true, already_verified: true }, 200);
    }

    // D-16: per-userId rate limit 3/hour. Key prefixed `verify-resend:userId:{id}`
    // to prevent Map collisions if other endpoints ever share a Map (defensive
    // namespacing — RESEARCH Pitfall 6).
    const slot = takeSlot(`${RATE_KEY_PREFIX}${userId}`, now);
    if (!slot.ok) {
      c.header("Retry-After", String(slot.retryAfterSec));
      return c.json({ error: "Too many requests" }, 429);
    }

    if (!db) {
      return c.json({ error: "Database unavailable" }, 503);
    }

    // D-17: invalidate prior unused email_verify tokens — most-recent-link wins.
    // Mirrors forgot-password.ts:182-191 verbatim with type filter changed.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date(now) })
      .where(
        and(
          eq(passwordResetTokens.userId, userId as number),
          eq(passwordResetTokens.type, "email_verify"),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    // Generate raw + hash + INSERT new email_verify row (24h expiry).
    // Same shape as Plan 02's issueEmailVerifyToken helper. Not extracted
    // to a shared module yet — Claude's Discretion (CONTEXT) — defer until
    // call-site count justifies; revisit in v3.7.
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    await db.insert(passwordResetTokens).values({
      userId: userId as number,
      tokenHash,
      type: "email_verify",
      expiresAt: new Date(now + VERIFY_TOKEN_TTL_MS),
    });

    // Fire-and-forget send (D-08 mirror) — .catch() attached synchronously
    // before the response so a synchronously-throwing spy still returns 200.
    const origin =
      process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";
    const verifyUrl = `${origin}/auth/verify?token=${rawToken}`;
    sendEmailFn(user.email, verifyUrl).catch((err) => {
      console.error("[resend-verification] email send failed (background):", err);
    });

    return c.json({ ok: true }, 200);
  });

  return router;
}

/** Default singleton — what index.ts mounts. */
export const resendVerification = createResendVerificationRoute();
