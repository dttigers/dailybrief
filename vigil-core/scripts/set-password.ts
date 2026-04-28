/**
 * set-password — out-of-band password rotation helper.
 *
 * Usage:
 *   npm run set-password -- --email <email> --password <newpassword>
 *
 * Purpose:
 *   D-05 claim-via-npm-script fallback. Acts as:
 *     (a) the "reset the seed user's placeholder hash" tool before Plan 03's register/claim endpoint exists;
 *     (b) the only password-change path until AUTH-07 adds a PWA profile UI in a later phase.
 *
 * Requires:
 *   - DATABASE_URL set (prod: Railway Postgres; local: your own dev DB or Railway URL from .env)
 *   - JWT_SECRET set — utils/password.ts does NOT require it, but importing from the vigil-core tree
 *     pulls in the utils/jwt.ts boot-check transitively through shared tsconfig. Setting it keeps
 *     the tool usable before a real production JWT_SECRET is chosen. The value is NOT used here.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db/connection.js";
import { users } from "../src/db/schema.js";
import { hashPassword } from "../src/utils/password.js";

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const rawEmail = parseArg("--email");
  const password = parseArg("--password");

  if (!rawEmail || !password) {
    console.error("Usage: npm run set-password -- --email <email> --password <newpassword>");
    console.error("  Must be an existing user (seed user or previously registered).");
    console.error("  Password must be 12-128 chars.");
    process.exit(1);
  }

  // Pitfall 5: email is case-insensitive — normalize both at query and at insert time.
  // Must match the lowercasing done by migrate-102-seed.ts and the future register/login endpoints.
  const email = rawEmail.toLowerCase().trim();

  // Consistent with the register endpoint's length gate (D-16 + Pitfall 9).
  if (password.length < 12 || password.length > 128) {
    console.error(`Password must be 12-128 characters (got ${password.length})`);
    process.exit(1);
  }

  if (!db) {
    console.error("DATABASE_URL not set — cannot run");
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`No user found for email: ${email}`);
    console.error(`(Emails are case-insensitive; tried: ${email})`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();
  await db
    .update(users)
    .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
    .where(eq(users.id, user.id));

  console.log(`Password updated for ${email} (id=${user.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error("set-password failed:", err);
  process.exit(1);
});
