import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";

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
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash, passwordChangedAt: new Date() })
      .returning({ id: users.id, email: users.email });
    return c.json({ id: created.id, email: created.email }, 201);
  }

  // D-11: claim-flow — seed user with placeholder hash overwrites with the real password
  if (existing.passwordHash.startsWith(PLACEHOLDER_HASH_PREFIX)) {
    const passwordHash = await hashPassword(password);
    // Phase 110 (AUTH-09): claim-flow IS a password set — bump passwordChangedAt
    // alongside updatedAt so any JWT issued pre-claim (there shouldn't be any, but
    // defensive) is gate-rejected and the caller must go through /auth/login.
    const now = new Date();
    await db
      .update(users)
      .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
      .where(eq(users.id, existing.id));
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
  return c.json({ token, user: { id: user.id, email: user.email } });
});
