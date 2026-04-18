import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db/connection.js";
import { apiKeys, users } from "../src/db/schema.js";

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const name = parseArg("--name");
  const emailArg = parseArg("--email");

  if (!name || !emailArg) {
    console.error(
      `Usage: npx tsx scripts/generate-key.ts --name "my-client" --email "owner@example.com"`,
    );
    console.error(
      `  --email is REQUIRED: api_keys.user_id is NOT NULL post-Phase-102 (Pitfall 4).`,
    );
    process.exit(1);
  }

  if (!db) {
    console.error("DATABASE_URL not set — cannot generate API key");
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim(); // Pitfall 5
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    console.error(`No user found for email: ${email}`);
    console.error(
      `Create the user via POST /v1/auth/register first, or verify VIGIL_SEED_USER_EMAIL.`,
    );
    process.exit(1);
  }

  // Generate a 32-byte random key prefixed with vk_
  const rawBytes = crypto.randomBytes(32).toString("hex");
  const rawKey = `vk_${rawBytes}`;

  // Hash with SHA-256 for storage
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  // First 8 chars of the key (after vk_ prefix) for log-safe identification
  const keyPrefix = rawKey.slice(0, 11); // "vk_" + first 8 hex chars

  await db
    .insert(apiKeys)
    .values({ userId: user.id, name, keyHash, keyPrefix });

  console.log("");
  console.log("API key generated successfully!");
  console.log(`  Owner: ${user.email} (id=${user.id})`);
  console.log(`  Name:  ${name}`);
  console.log(`  Prefix: ${keyPrefix}...`);
  console.log("");
  console.log(`  Key: ${rawKey}`);
  console.log("");
  console.log("Save this key now — it cannot be recovered after this.");
  console.log("");

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to generate API key:", err);
  process.exit(1);
});
