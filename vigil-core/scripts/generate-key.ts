import crypto from "node:crypto";
import { db } from "../src/db/connection.js";
import { apiKeys } from "../src/db/schema.js";

async function main() {
  const nameIdx = process.argv.indexOf("--name");
  if (nameIdx === -1 || !process.argv[nameIdx + 1]) {
    console.error('Usage: npx tsx scripts/generate-key.ts --name "my-client"');
    process.exit(1);
  }

  const name = process.argv[nameIdx + 1];

  if (!db) {
    console.error("DATABASE_URL not set — cannot generate API key");
    process.exit(1);
  }

  // Generate a 32-byte random key prefixed with vk_
  const rawBytes = crypto.randomBytes(32).toString("hex");
  const rawKey = `vk_${rawBytes}`;

  // Hash with SHA-256 for storage
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  // First 8 chars of the key (after vk_ prefix) for log-safe identification
  const keyPrefix = rawKey.slice(0, 11); // "vk_" + first 8 hex chars

  await db.insert(apiKeys).values({ name, keyHash, keyPrefix });

  console.log("");
  console.log("API key generated successfully!");
  console.log(`  Name:   ${name}`);
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
