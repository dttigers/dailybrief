import * as crypto from "node:crypto";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users, passwordResetTokens } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";
import { sendEmailVerificationEmail as realSendEmailVerificationEmail } from "../services/email-service.js";

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
    return c.json({ error: "Registration not configured" }, 503);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { email: rawEmail, password } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };

  if (typeof rawEmail !== "string" || typeof password !== "string") {
    return c.json({ error: "email and password are required" }, 400);
  }
  if (!isValidEmailShape(rawEmail)) {
    return c.json({ error: "Invalid email format" }, 400);
  }
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return c.json(
      { error: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters` },
      400,
    );
  }

  const email = rawEmail.toLowerCase().trim();

  // D-08: 403 generic — must not echo the allowlist
  if (!isAllowlistedEmail(email)) {
    return c.json({ error: "Registration is not open to this address" }, 403);
  }

  if (!db) return c.json({ error: "Database unavailable" }, 503);

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
    const now = Date.now();
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
  return c.json({ error: "Unable to register with those credentials" }, 409);
});

// ── POST /auth/login ───────────────────────────────────────────────────────
auth.post("/auth/login", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const { email: rawEmail, password } = (body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };

  if (typeof rawEmail !== "string" || typeof password !== "string") {
    return c.json({ error: "email and password are required" }, 400);
  }
  const email = rawEmail.toLowerCase().trim();

  if (!db) return c.json({ error: "Database unavailable" }, 503);

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
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // Seed user must claim via register first — placeholder hash means password unset
  if (user.passwordHash.startsWith(PLACEHOLDER_HASH_PREFIX)) {
    return c.json({ error: "Invalid credentials" }, 401);
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
