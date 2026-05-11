import * as crypto from "node:crypto";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";
import { sendEmailVerificationEmail as realSendEmailVerificationEmail } from "../services/email-service.js";
import { verifyTurnstileToken as realVerifyTurnstileToken } from "../lib/turnstile.js";

// D-11 claim-flow trigger: any users row whose password_hash startsWith this is a pre-claim seed row.
// Keep in sync with scripts/migrate-102-seed.ts which sets this exact prefix on the seed user.
export const PLACEHOLDER_HASH_PREFIX =
  "$argon2id$v=19$m=19456,t=2,p=1$UExBQ0VIT0xERVJTQUxU";

// Dummy argon2 hash for timing-safe login on unknown email. Must be a real argon2id hash so verify()
// doesn't short-circuit — but the plaintext is random bytes that will never match user input.
// Generated via @node-rs/argon2 hash("never-matches-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", { memoryCost:19456, timeCost:2, parallelism:1 }).
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXlzYWw$ZHVtbXloYXNoZHVtbXloYXNoZHVtbXloYXNoZHVtbXk";

const MIN_PASSWORD = 12;
const MAX_PASSWORD = 128;

// Phase 113 (AUTH-11 D-06): TTL for email_verify tokens = 24h.
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// ── Phase 126 (D-03 / AUTH-126-01) — dual-counter rate limit on /auth/register ──
// Mirror of forgot-password.ts:48-50 verbatim. Drift-detector tests assert the
// two literal cap declarations below appear in source (per-IP cap of twenty
// per hour; per-email cap of five per hour — see Phase 126 CONTEXT D-03).
const RATE_LIMIT_MAX_IP = 20;                     // Phase 126 D-03 — mirrors forgot-password.ts:48
const RATE_LIMIT_MAX_EMAIL = 5;                   // Phase 126 D-03 — mirrors forgot-password.ts:49
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;      // 1h sliding window

// In-memory sliding-window buckets — renamed (registerXxxBuckets) so the
// /auth/register limiter cannot collide with forgot-password.ts's bucket Maps
// in the same single-process Railway instance.
const registerIpBuckets = new Map<string, number[]>();
const registerEmailBuckets = new Map<string, number[]>();

// Periodic cleanup sweep — mirror of forgot-password.ts:70-84. .unref() so the
// timer doesn't keep the Node test process alive (R8).
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [k, arr] of registerIpBuckets) {
    const last = arr[arr.length - 1];
    if (arr.length === 0 || (last !== undefined && last < cutoff)) {
      registerIpBuckets.delete(k);
    }
  }
  for (const [k, arr] of registerEmailBuckets) {
    const last = arr[arr.length - 1];
    if (arr.length === 0 || (last !== undefined && last < cutoff)) {
      registerEmailBuckets.delete(k);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// Mirror of forgot-password.ts:88-98 — per-call max so per-IP/per-email caps
// can diverge (20 vs 5).
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

// Test-only — clears both bucket Maps. Distinct name from forgot-password's
// `__resetBucketsForTest` so test imports can't ambiguate which router's
// counters they're zeroing.
export function __resetRegisterBucketsForTest(): void {
  registerIpBuckets.clear();
  registerEmailBuckets.clear();
}

// ── Phase 126 (D-01 / AUTH-126-02) — Turnstile route-level DI seam ──
// Route-level seam: replaces the Turnstile call performed inside /auth/register.
// Distinct from turnstile.ts's helper-unit seam (the lib-level setter exported by
// vigil-core/src/lib/turnstile.ts, which stubs the lower-level helper). Route
// tests import THIS seam; helper-unit tests import the other. Identically-named
// seams across the two modules would be a maintenance footgun — a future
// maintainer could stub the wrong layer and accidentally exercise live
// Cloudflare from route tests.
let registerTurnstileFn = realVerifyTurnstileToken;

/**
 * Route-level seam: replaces the Turnstile call performed inside /auth/register.
 * Distinct from turnstile.ts's helper-unit seam (which stubs the lower-level
 * helper). Route tests import THIS; helper tests import the other.
 */
export function __setRegisterTurnstileFnForTest(
  fn: typeof realVerifyTurnstileToken,
): void {
  registerTurnstileFn = fn;
}
export function __resetRegisterTurnstileFnForTest(): void {
  registerTurnstileFn = realVerifyTurnstileToken;
}

// DI seam — tests inject a spy via __setSendEmailVerificationEmailForTest;
// production singleton uses the real wrapper. Lives at module scope (not
// inside the handler) so test-time patching is observable across both
// register code paths (fresh + claim).
let sendEmailVerificationEmailFn = realSendEmailVerificationEmail;
export function __setSendEmailVerificationEmailForTest(
  fn: typeof realSendEmailVerificationEmail,
): void {
  sendEmailVerificationEmailFn = fn;
}
export function __resetSendEmailVerificationEmailForTest(): void {
  sendEmailVerificationEmailFn = realSendEmailVerificationEmail;
}

// Phase 113 (AUTH-11 D-06): generate raw base64url token + SHA-256 hex hash,
// insert email_verify row, return raw token for URL construction. Mirrors
// forgot-password.ts:195-203 token-issuance shape verbatim.
async function issueEmailVerifyToken(
  userId: number,
  now: number,
): Promise<string> {
  if (!db) throw new Error("Database unavailable for token issuance");
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    type: "email_verify",
    expiresAt: new Date(now + VERIFY_TOKEN_TTL_MS),
  });
  return rawToken;
}

// Phase 113 (AUTH-11 D-08): fire-and-forget email send. Mirrors
// forgot-password.ts:221-223 verbatim — `.catch()` attached synchronously
// BEFORE c.json(...) returns, but the awaited send promise resolves AFTER.
// Register response time stays at hash + INSERT cost (~50-150ms); Resend
// network latency invisible to caller.
function fireVerifyEmailInBackground(toEmail: string, rawToken: string): void {
  const origin =
    process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";
  const verifyUrl = `${origin}/auth/verify?token=${rawToken}`;
  sendEmailVerificationEmailFn(toEmail, verifyUrl).catch((err) => {
    console.error("[register] email send failed (background):", err);
  });
}

function isAllowlistedEmail(email: string): boolean {
  const list = process.env["VIGIL_ALLOWED_EMAILS"];
  if (!list) return false; // D-10 fail-closed
  const allowed = list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  if (allowed.includes("*")) return true;  // Phase 126 (AUTH-126-08): wildcard kill-switch
  return allowed.includes(email.toLowerCase()); // Pitfall 5
}

function isValidEmailShape(email: string): boolean {
  // Minimal shape check — not RFC 5321 validation. Reject obvious garbage; defer to allowlist for trust.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export const auth = new Hono();

// ── POST /auth/register ────────────────────────────────────────────────────
auth.post("/auth/register", async (c) => {
  // D-10: fail-closed when env var unset
  if (!process.env["VIGIL_ALLOWED_EMAILS"]) {
    return c.json(
      { error: "Registration not configured", code: "SERVER_NOT_CONFIGURED" },
      503,
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body", code: "INVALID_JSON" }, 400);
  }
  const { email: rawEmail, password, turnstileToken } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
    turnstileToken?: unknown;
  };

  if (typeof rawEmail !== "string" || typeof password !== "string") {
    return c.json(
      { error: "email and password are required", code: "INVALID_REQUEST" },
      400,
    );
  }

  // ── Phase 126 (D-03 / AUTH-126-01) — dual-counter rate limit FIRST ──
  // RESEARCH §AUTH-126-01 mount-order constraint: rate-limit must precede
  // Turnstile siteverify so attackers cannot burn Cloudflare quota per
  // attempt by spamming registrations from one IP. Email-axis key is the
  // lowercase+trimmed email shape (same normalization used downstream by
  // isAllowlistedEmail / users table writes).
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const ipOk = takeSlot(registerIpBuckets, ip, now, RATE_LIMIT_MAX_IP);
  const emailOk = takeSlot(
    registerEmailBuckets,
    rawEmail.toLowerCase().trim(),
    now,
    RATE_LIMIT_MAX_EMAIL,
  );
  if (!ipOk || !emailOk) {
    const retryAfterSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
    c.header("Retry-After", String(retryAfterSeconds));
    return c.json(
      {
        error: "Too many registration attempts",
        code: "RATE_LIMITED",
        retry_after_seconds: retryAfterSeconds,
      },
      429,
    );
  }

  // ── Phase 126 (D-01 / AUTH-126-02) — Turnstile token shape ──
  // Missing/empty token short-circuits BEFORE allowlist consultation so
  // 400 CAPTCHA_FAILED is the only signal observable from an unattested
  // request (CONTEXT test case #3 — allowlist must NEVER leak via timing).
  if (typeof turnstileToken !== "string" || turnstileToken.length === 0) {
    return c.json(
      { error: "Captcha verification failed", code: "CAPTCHA_FAILED" },
      400,
    );
  }

  // ── Phase 126 (D-01 / AUTH-126-02) — Turnstile siteverify ──
  // Network/timeout errors throw → 503 (NO fail-open per D-01).
  // success: false → 400 CAPTCHA_FAILED. Test seam: registerTurnstileFn.
  let captchaResult;
  try {
    captchaResult = await registerTurnstileFn(turnstileToken, ip);
  } catch {
    return c.json(
      {
        error: "Captcha service unavailable, please retry",
        code: "CAPTCHA_FAILED",
      },
      503,
    );
  }
  if (!captchaResult.ok) {
    return c.json(
      { error: "Captcha verification failed", code: "CAPTCHA_FAILED" },
      400,
    );
  }

  if (!isValidEmailShape(rawEmail)) {
    return c.json(
      { error: "Invalid email format", code: "INVALID_EMAIL_FORMAT" },
      400,
    );
  }
  // SPLIT the password-length branch into TOO_SHORT vs TOO_LONG — PWA needs
  // the distinction to render a precise ctaLabel ("use a longer password" vs
  // "trim to 128 characters").
  if (password.length < MIN_PASSWORD) {
    return c.json(
      {
        error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`,
        code: "PASSWORD_TOO_SHORT",
      },
      400,
    );
  }
  if (password.length > MAX_PASSWORD) {
    return c.json(
      {
        error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`,
        code: "PASSWORD_TOO_LONG",
      },
      400,
    );
  }

  const email = rawEmail.toLowerCase().trim();

  // D-08: 403 generic — must not echo the allowlist
  if (!isAllowlistedEmail(email)) {
    return c.json(
      {
        error: "Registration is not open to this address",
        code: "REG_NOT_ALLOWED",
      },
      403,
    );
  }

  if (!db)
    return c.json(
      { error: "Database unavailable", code: "SERVER_NOT_CONFIGURED" },
      503,
    );

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Fresh registration (no existing row for this email)
  if (!existing) {
    const passwordHash = await hashPassword(password);
    // Phase 110 (AUTH-09): passwordChangedAt column added in Plan 01 is NOT NULL
    // with no DEFAULT — fresh register must set it. Semantically "password set at
    // account creation" matches the D-03 backfill literal for pre-migration users.
    // (Reusing the outer `now` captured at rate-limit gate — Phase 126.)
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash, passwordChangedAt: new Date(now) })
      .returning({ id: users.id, email: users.email });
    // Phase 113 (AUTH-11 D-06): issue email_verify token row BEFORE response.
    // Token is durable in DB before 201 returns, so a crashed/failed background
    // send still leaves the user able to hit Resend later (Plan 03).
    const rawToken = await issueEmailVerifyToken(created.id, now);
    // Phase 113 (AUTH-11 D-08): fire-and-forget AFTER token row commits, BEFORE response.
    fireVerifyEmailInBackground(created.email, rawToken);
    return c.json({ id: created.id, email: created.email }, 201);
  }

  // D-11: claim-flow — seed user with placeholder hash overwrites with the real password
  if (existing.passwordHash.startsWith(PLACEHOLDER_HASH_PREFIX)) {
    const passwordHash = await hashPassword(password);
    // Phase 110 (AUTH-09): claim-flow IS a password set — bump passwordChangedAt
    // alongside updatedAt so any JWT issued pre-claim (there shouldn't be any, but
    // defensive) is gate-rejected and the caller must go through /auth/login.
    const nowDate = new Date();
    await db
      .update(users)
      .set({ passwordHash, passwordChangedAt: nowDate, updatedAt: nowDate })
      .where(eq(users.id, existing.id));
    // Phase 113 (AUTH-11 D-07): claim-flow ALSO issues a verify token + email,
    // but ONLY if existing.emailVerifiedAt IS NULL. After Plan 01's 0017
    // migration backfills the seed user to email_verified_at = created_at,
    // this check correctly skips the email send for the existing seed user.
    // Defensive guard for the edge case where a seed user was inserted
    // between migration and claim.
    if (existing.emailVerifiedAt === null) {
      const rawToken = await issueEmailVerifyToken(existing.id, nowDate.getTime());
      fireVerifyEmailInBackground(existing.email, rawToken);
    }
    return c.json(
      { id: existing.id, email: existing.email, claimed: true },
      201,
    );
  }

  // Existing user with real hash — conflict. Generic body so no asymmetric response vs 403.
  return c.json(
    {
      error: "Unable to register with those credentials",
      code: "EMAIL_TAKEN",
    },
    409,
  );
});

// ── POST /auth/login ───────────────────────────────────────────────────────
auth.post("/auth/login", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body", code: "INVALID_JSON" }, 400);
  }
  const { email: rawEmail, password } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };

  if (typeof rawEmail !== "string" || typeof password !== "string") {
    return c.json(
      { error: "email and password are required", code: "INVALID_REQUEST" },
      400,
    );
  }
  const email = rawEmail.toLowerCase().trim();

  if (!db)
    return c.json(
      { error: "Database unavailable", code: "SERVER_NOT_CONFIGURED" },
      503,
    );

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Timing-safe: always invoke verifyPassword, even when user is unknown.
  // Pitfall 6 context: response time must not leak "user exists" vs "user does not exist".
  const stored = user?.passwordHash ?? DUMMY_HASH;
  const ok = await verifyPassword(password, stored);

  if (!user || !ok) {
    return c.json(
      { error: "Invalid credentials", code: "INVALID_CREDENTIALS" },
      401,
    );
  }

  // Seed user must claim via register first — placeholder hash means password unset
  if (user.passwordHash.startsWith(PLACEHOLDER_HASH_PREFIX)) {
    return c.json(
      { error: "Invalid credentials", code: "INVALID_CREDENTIALS" },
      401,
    );
  }

  const token = await signToken(user.id, user.email);
  // Phase 113 (AUTH-11 D-26): additive — emailVerifiedAt as ISO string or null.
  // PWA reads this on login to render the Settings banner state without
  // a second round-trip. Backwards-compatible: existing destructures
  // { id, email } continue to work; the new field is just additional.
  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt
        ? user.emailVerifiedAt.toISOString()
        : null,
    },
  });
});
