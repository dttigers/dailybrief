import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { apiKeys } from "../db/schema.js";

/**
 * Bearer token authentication middleware.
 * Validates API key by hashing the provided token and looking up
 * the hash in the api_keys table. Updates lastUsedAt fire-and-forget.
 */
export const bearerAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { error: "Missing or invalid Authorization header" },
      401,
    );
  }

  const token = authHeader.slice(7); // Strip "Bearer "

  if (!token) {
    return c.json(
      { error: "Missing or invalid Authorization header" },
      401,
    );
  }

  if (!db) {
    return c.json({ error: "Database unavailable" }, 503);
  }

  const keyHash = crypto.createHash("sha256").update(token).digest("hex");

  const [key] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!key) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  // Update lastUsedAt fire-and-forget (non-blocking)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .then(() => {})
    .catch(() => {});

  await next();
};
