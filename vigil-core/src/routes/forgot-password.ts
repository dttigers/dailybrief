// ── Phase 112 Plan 02 — POST /v1/auth/forgot-password (AUTH-10) ──────────────
// Unauthenticated endpoint. ALWAYS returns 200 with the same enum-safe body
// per CONTEXT D-03 (regardless of whether the email maps to a user OR whether
// the request was rate-limited). Two stacked enumeration-safety mitigations:
//   (a) D-03: identical response body and status across hit/miss/rate-limited
//   (b) D-05: dummy argon2 verify on miss path → wall-clock parity within ~30%
//
// Mounted in vigil-core/src/index.ts BEFORE the bearerAuth dispatcher (Plan 02
// Task 3). The dispatcher's exempt list (lines 117-123) is also extended with
// `/v1/auth/forgot-password` to skip the bearer requirement.
//
// Contracts:
//   D-04: dual-axis rate limit (per-IP AND per-email, 5/h sliding window each)
//   D-06: invalidate prior unused tokens before issuing a new one (most recent wins)
//   D-07: token = base64url(crypto.randomBytes(32)) ~43 chars / 256 bits entropy
//   D-08: SHA-256 hex hash stored; raw token never touches DB
//   D-21: resetUrl = `${VIGIL_APP_BASE_URL || prod-fallback}/auth/reset?token=<raw>`
//
// DI seam via createForgotPasswordRoute(deps) — tests inject sendEmailFn spy
// and (rarely) nowFn; production singleton uses real sendPasswordResetEmail.
// -----------------------------------------------------------------------------

import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import * as crypto from "node:crypto";
import { db } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";
import { verifyPassword } from "../utils/password.js";
import { sendPasswordResetEmail as realSendPasswordResetEmail } from "../services/email-service.js";

// ── DUMMY_HASH (D-05 timing-attack mitigation) ────────────────────────────────
// Keep in sync with vigil-core/src/routes/auth.ts:17 — same OPTIONS
// (Argon2id, m=19456, t=2, p=1). RESEARCH §A2 verified params match
// utils/password.ts:OPTIONS exactly. Plaintext "never-matches" verifies in
// ~100-200ms wall-clock (argon2 is deliberately slow); this dominates the
// miss-path budget so timing approximates the hit-path within ~30%.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWw$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXk";

// ── Constants ────────────────────────────────────────────────────────────────
const TOKEN_TTL_MS = 60 * 60 * 1000;             // D-21: 1h expiry
// Phase 117 (AUTH-13 D-05): per-axis caps split. Per-IP raised 5 → 20 to
// tolerate household-NAT retry patterns. Per-email STAYS at 5 — that axis
// is the enum-safety defense (a single email getting 5+ attempts/hr is
// suspicious and the existing 200-enum-safe response shape masks it).
// Both axes still resolve to the same 200-enum-safe response on trip per
// D-04 from Phase 112 (preserved).
const RATE_LIMIT_MAX_IP = 20;                     // Phase 117 D-05: raised 5 → 20
const RATE_LIMIT_MAX_EMAIL = 5;                   // Phase 117 D-05: UNCHANGED — enum-safety guard
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;      // D-04: 1h sliding window

// ── Enumeration-safe response body (D-03 verbatim) ──────────────────────────
// Same body, same status, same wall-clock time on hit AND miss paths.
// String literal duplicated in tests by design — drift detection.
const ENUM_SAFE_BODY = {
  ok: true,
  message: "If your account exists, a reset link has been sent.",
} as const;

// ── In-process sliding-window rate limit buckets (RESEARCH §Pattern-3) ──────
// Per-IP and per-email tracked independently; "whichever fires first" wins
// (D-04). Single-instance scale only — fine for v3.6 Railway deployment.
// Multi-instance scale-out would need Redis (deferred to v3.7+).
const ipBuckets = new Map<string, number[]>();
const emailBuckets = new Map<string, number[]>();

// Periodic sweep — drop entries whose newest timestamp is outside the window.
// .unref() so the timer doesn't keep the test process alive (matches
// rate-limit.ts:21 pattern).
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [k, arr] of ipBuckets) {
    const last = arr[arr.length - 1];
    if (arr.length === 0 || (last !== undefined && last < cutoff)) {
      ipBuckets.delete(k);
    }
  }
  for (const [k, arr] of emailBuckets) {
    const last = arr[arr.length - 1];
    if (arr.length === 0 || (last !== undefined && last < cutoff)) {
      emailBuckets.delete(k);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// Phase 117 (AUTH-13 D-05): max is now a per-call parameter so per-IP and
// per-email axes can have different caps (20 vs 5).
function takeSlot(map: Map<string, number[]>, key: string, now: number, max: number): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (map.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= max) {
    map.set(key, arr);
    return false;
  }
  arr.push(now);
  map.set(key, arr);
  return true;
}

// Test-only helper. Must NOT be called from production code.
export function __resetBucketsForTest(): void {
  ipBuckets.clear();
  emailBuckets.clear();
}

// ── Factory + default singleton ──────────────────────────────────────────────
export interface ForgotPasswordDeps {
  /** DI seam for tests — defaults to email-service.sendPasswordResetEmail */
  sendEmailFn?: typeof realSendPasswordResetEmail;
  /** DI seam for tests — defaults to Date.now */
  nowFn?: () => number;
}

export function createForgotPasswordRoute(deps?: ForgotPasswordDeps): Hono {
  const sendEmailFn = deps?.sendEmailFn ?? realSendPasswordResetEmail;
  const nowFn = deps?.nowFn ?? Date.now;
  const router = new Hono();

  router.post("/auth/forgot-password", async (c) => {
    // Body parse — invalid JSON → 200 enum-safe (no shape leak).
    // Skips rate-limit slot consumption so a parse error can't be used to
    // probe the bucket state; defensive choice per RESEARCH §code-example.
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(ENUM_SAFE_BODY, 200);
    }

    const rawEmail = (body as { email?: unknown })?.email;
    const email = typeof rawEmail === "string" ? rawEmail.toLowerCase().trim() : null;

    // Dual-axis rate limit — exceed either → 200 enum-safe (per orchestrator
    // resolution of RESEARCH §Open-Question-1: hide both which-axis-fired AND
    // that limiting occurred at all; 200 preferred at single-user scale).
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const now = nowFn();
    const ipOk = takeSlot(ipBuckets, ip, now, RATE_LIMIT_MAX_IP);
    const emailOk = email ? takeSlot(emailBuckets, email, now, RATE_LIMIT_MAX_EMAIL) : true;
    if (!ipOk || !emailOk) {
      return c.json(ENUM_SAFE_BODY, 200);
    }

    // Missing email → 200 enum-safe (no shape leak)
    if (!email) {
      return c.json(ENUM_SAFE_BODY, 200);
    }

    // DB null = treat as miss-path (no lookup possible → no user found).
    // Production should never see this (boot fails without DATABASE_URL),
    // but tests run without a connection — and even if prod ever did,
    // surfacing 503 here would leak DB availability through response shape,
    // breaking enumeration safety. Dummy argon2 keeps wall-clock parity.
    let user: { id: number; email: string } | undefined;
    if (db) {
      [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
    }

    if (!user) {
      // D-05: timing-attack mitigation — burn ~100-200ms argon2 verify on miss.
      // Same OPTIONS (Argon2id, m=19456, t=2, p=1) as hashPassword in
      // utils/password.ts. RESEARCH §A2 confirms params identity.
      await verifyPassword("never-matches", DUMMY_HASH);
      return c.json(ENUM_SAFE_BODY, 200);
    }

    // Past this point user exists, so db is non-null (the lookup that
    // populated user already deref'd it). Still narrow for the type
    // checker — drizzle types `db` as `... | null`.
    if (!db) {
      // Unreachable in practice; keeps TS happy without a non-null assertion.
      await verifyPassword("never-matches", DUMMY_HASH);
      return c.json(ENUM_SAFE_BODY, 200);
    }

    // D-05: timing-parity — hit-path also runs the argon2 verify so that
    // wall-clock dominates the response time on BOTH paths. Without this,
    // miss-path runs argon2 (~100-200ms) while hit-path does only fast DB
    // writes + a mocked-fast email send → hit-path would be MEASURABLY
    // FASTER than miss-path → enumeration leak. Test "wall-clock parity"
    // (SC#1) asserts the medians stay within 1.5x.
    await verifyPassword("never-matches", DUMMY_HASH);

    // D-06: "most recent link wins" — invalidate prior unused tokens for
    // (user_id, 'password_reset') BEFORE issuing a fresh one. Keeps single-use
    // semantics tight; user only has one valid link in inbox at a time.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date(now) })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          eq(passwordResetTokens.type, "password_reset"),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    // D-07: 32 random bytes (256 bits entropy) base64url-encoded.
    // D-08: SHA-256 hex of raw token is what gets stored (raw NEVER touches DB).
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      type: "password_reset",
      expiresAt: new Date(now + TOKEN_TTL_MS),
    });

    // D-21: VIGIL_APP_BASE_URL with prod fallback (matches Phase 111
    // smoke-test-email.ts:21 origin shape verbatim — `||` not `??` so
    // empty-string treats as unset).
    const origin = process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";
    const resetUrl = `${origin}/auth/reset?token=${rawToken}`;

    // WR-01: fire-and-forget email send so D-05 wall-clock parity is bounded
    // by local ops (argon2 + DB writes) on BOTH paths. Awaiting Resend here
    // would stack 50-300ms of network latency on the hit path only — making
    // the hit path measurably slower than the miss path (which runs argon2
    // alone). The send itself is invoked synchronously (so test spies record
    // the call before the response is returned), but the returned promise is
    // intentionally not awaited. Errors are already captured inside
    // email-service via captureException; the .catch() here exists only to
    // prevent Node's unhandledRejection from firing if the send throws.
    // D-03 invariant preserved: response shape never reflects send outcome.
    sendEmailFn(user.email, resetUrl).catch((err) => {
      console.error("[forgot-password] email send failed (background):", err);
    });

    return c.json(ENUM_SAFE_BODY, 200);
  });

  return router;
}

// Default singleton — what index.ts mounts.
export const forgotPassword = createForgotPasswordRoute();
