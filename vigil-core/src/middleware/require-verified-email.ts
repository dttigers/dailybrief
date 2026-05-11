/**
 * require-verified-email — AUTH-126-03 / D-02 (Phase 126 Plan 04)
 *
 * Soft-to-strict email-verification gate with a 24h grace window anchored at
 * users.createdAt. For 24h after signup, unverified users can use /v1/* freely.
 * After 24h, the middleware returns 403 EMAIL_NOT_VERIFIED with a
 * verified_after_iso body field so the PWA can render a countdown UX.
 *
 * Purpose: close AUTH-126-03. The users.email_verified_at column exists from
 * Phase 113 migration 0017 (with seed-user backfill = created_at, so existing
 * accounts pass unconditionally — zero regression risk). Until Phase 126 the
 * column was written on /v1/auth/verify-email but never read for gating any
 * /v1/* surface — this middleware is the read side.
 *
 * Mount-order contract (Plan 06 enforces in index.ts):
 *   bearerAuth dispatcher (sets c.set("userId", ...))
 *     → requireVerifiedEmailWithGrace   ← THIS MODULE
 *       → metricsMiddleware
 *         → protected /v1/* route mounts
 *
 * That ordering is load-bearing: c.get("userId") is consumed below as a number
 * and is only populated after bearerAuth runs. Mounting this BEFORE bearerAuth
 * would create a silent auth bypass; mounting it AFTER the protected routes
 * would leave them ungated.
 *
 * Grace anchor — createdAt only (R5 lock):
 *   The grace window is anchored at users.createdAt — never at the Phase 110
 *   AUTH-09 password-change timestamp. Anchoring at the password-change column
 *   would silently re-arm the 24h window every time a user changed their
 *   password (claim-flow seed users would also re-arm on first password set).
 *   createdAt is "signup time" and matches the user's mental model. The
 *   bypass-by-construction for pre-Phase-113 seed users (emailVerifiedAt
 *   backfilled non-null) keeps them safe regardless of createdAt age.
 *   R5 drift detector forbids any reference to the password-change column
 *   token in this file — comment phrasing avoids it for that reason.
 *
 * Bypass list — defense in depth with the index.ts bearerAuth dispatcher:
 *   - /v1/health: monitoring endpoint, must be unauthenticated and unconditional
 *   - /v1/auth/*: login, logout, resend-verification, verify-email — the user
 *     MUST be able to reach resend-verification specifically while in the
 *     post-grace 403 state, otherwise they cannot escape the gate
 *   Exact-equality on /v1/health (not startsWith) prevents a path-crafting
 *   bypass like /v1/health/admin (T-126-04-05). /v1/auth/ uses startsWith
 *   because that prefix is owned by auth.ts route mounts and cannot be
 *   colonized by other handlers.
 *
 * D-04 enum extension — INVALID_TOKEN_SUBJECT:
 *   This file introduces INVALID_TOKEN_SUBJECT as a NEW extension code per the
 *   D-04 additivity clause (planner MAY add codes, MAY NOT remove). It fires
 *   on the defensive "JWT validated by bearerAuth but the users row is gone"
 *   branch (deleted mid-session). It is intentionally DISTINCT from the locked
 *   INVALID_CREDENTIALS enum — the latter is reserved for login-only generic
 *   security-best-practice 401s ("Invalid email or password" UX). Conflating
 *   would surface a misleading credentials-error message to a user whose
 *   session is structurally broken. Plan 07 maps INVALID_TOKEN_SUBJECT in the
 *   PWA ERROR_CODE_MAP with copy "Session expired — please sign in again."
 *   plus CTA to /auth.
 *
 * Phase 124 /v1/agent-stream — INTENTIONALLY NOT bypassed (RESEARCH Open-Q-2):
 *   vigil-watch is an operator-only daemon. The operator's account is
 *   verified-from-day-zero (Phase 113 backfill), so the SSE handshake never
 *   trips the 403 in practice. If a future operator setup somehow runs the
 *   daemon against an unverified account inside the 24h grace, the SSE
 *   endpoint surfaces the SAME EMAIL_NOT_VERIFIED 403 the PWA sees, with the
 *   same verified_after_iso body — that's the CORRECT UX. Adding a bypass
 *   here would silently weaken the gate for the one surface where ambient
 *   automation could mask a compromised session.
 */

import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";

/**
 * 24-hour grace window in milliseconds. Literal expression locked verbatim
 * (Plan 04 drift detector). Do NOT extract to a named time-unit helper — the
 * drift detector pins this exact arithmetic shape.
 */
const GRACE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Shape returned by the user-lookup function consumed by this middleware.
 * Subset of the users table columns this gate needs.
 */
export interface VerifyEmailUserRow {
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

/**
 * Production user lookup — single SELECT by primary key against the users
 * table. Returns null when no row exists (deleted mid-session). Returns null
 * when db is unavailable so the caller can short-circuit on 503.
 */
async function realLookupUserById(
  userId: number,
): Promise<VerifyEmailUserRow | null | "db-unavailable"> {
  if (!db) return "db-unavailable";
  const [user] = await db
    .select({
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

// DI seam — tests inject a fake lookup via __setUserLookupForTest. Mirrors
// the auth.ts:32 __setSendEmailVerificationEmailForTest pattern verbatim
// (module-scope `let` reassigned by the setter; reset restores the real fn).
// Wave 0 require-verified-email.test.ts uses this seam to stub user rows
// without spinning up Postgres.
let userLookupFn: (
  userId: number,
) => Promise<VerifyEmailUserRow | null | "db-unavailable"> = realLookupUserById;
export function __setUserLookupForTest(
  fn: (userId: number) => Promise<VerifyEmailUserRow | null | "db-unavailable">,
): void {
  userLookupFn = fn;
}
export function __resetUserLookupForTest(): void {
  userLookupFn = realLookupUserById;
}

/**
 * Bypass list — paths that MUST be reachable by unverified users even after
 * the grace window expires.
 *
 *   - "/v1/health": exact-match (T-126-04-05 — no path-crafting like
 *     /v1/health/admin should slip past)
 *   - "/v1/auth/": prefix-match — login/logout/resend-verification/verify-email
 *     all live under /v1/auth/ and must stay reachable so users can escape
 *     the 403 state
 *
 * Defense-in-depth with the index.ts bearerAuth dispatcher (which also
 * short-circuits these prefixes). Both literals are pinned by the Plan 04
 * AUTH-126-VERIFY-BYPASS drift detector.
 *
 * NO /v1/agent-stream bypass — see module-header Open-Q-2 note.
 */
function isBypass(path: string): boolean {
  if (path === "/v1/health") return true;
  if (path.startsWith("/v1/auth/")) return true;
  return false;
}

/**
 * Email-verification gate with 24h grace window (D-02).
 *
 * Decision tree (in order):
 *   1. Bypass list hit                 → next()
 *   2. !db                             → 503 SERVER_NOT_CONFIGURED
 *   3. User row not found              → 401 INVALID_TOKEN_SUBJECT (extension)
 *   4. emailVerifiedAt !== null        → next() (verified — pass regardless of age)
 *   5. now < createdAt + 24h           → next() (within grace — pass)
 *   6. else                            → 403 EMAIL_NOT_VERIFIED + verified_after_iso
 *
 * Null-check uses `!== null` (NOT truthy guard) — `new Date(0)` is truthy but
 * defensively we want strict null semantics even though the Phase 113 backfill
 * never produces 0 timestamps.
 */
export const requireVerifiedEmailWithGrace: MiddlewareHandler = async (c, next) => {
  if (isBypass(c.req.path)) return next();

  const userId = c.get("userId") as number;

  const lookup = await userLookupFn(userId);

  if (lookup === "db-unavailable") {
    return c.json(
      { error: "Database unavailable", code: "SERVER_NOT_CONFIGURED" },
      503,
    );
  }

  const user = lookup;

  if (!user) {
    // Defensive — bearerAuth (which ran first) should have rejected, but a
    // user row deleted between bearerAuth's lookup and ours is structurally
    // possible. INVALID_TOKEN_SUBJECT extension code per D-04 additivity;
    // distinct from INVALID_CREDENTIALS (login-only, locked). Plan 07 maps
    // this in the PWA ERROR_CODE_MAP.
    return c.json(
      {
        error: "Session expired — please sign in again",
        code: "INVALID_TOKEN_SUBJECT",
      },
      401,
    );
  }

  if (user.emailVerifiedAt !== null) {
    return next();
  }

  const verifiedAfter = user.createdAt.getTime() + GRACE_WINDOW_MS;
  if (Date.now() < verifiedAfter) {
    return next();
  }

  return c.json(
    {
      error: "Verify your email to continue",
      code: "EMAIL_NOT_VERIFIED",
      verified_after_iso: new Date(verifiedAfter).toISOString(),
    },
    403,
  );
};
