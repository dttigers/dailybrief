import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { apiKeys } from "../db/schema.js";
import { verifyToken } from "../utils/jwt.js";

// Hono context type augmentation — downstream routes call `c.get("userId")` and TypeScript
// knows it is `number`. This augmentation lives here (single source of truth) rather than
// in a separate types/ file so middleware and consumers are in the same compilation unit.
declare module "hono" {
  interface ContextVariableMap {
    userId: number;
  }
}

/**
 * Token-type detection (RESEARCH §Pattern 1).
 *   vk_ keys: "vk_" + 64 hex chars, zero dots.
 *   JWTs:     exactly two dots (header.payload.signature) and NOT starting with vk_.
 *   Anything else → malformed.
 */
function isVkKey(token: string): boolean {
  return token.startsWith("vk_") && !token.includes(".");
}

function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3 && !token.startsWith("vk_");
}

/**
 * Bearer token authentication middleware.
 * Dispatches to one of three paths:
 *   1. vk_  → SHA256 hash lookup in api_keys, set userId from row.userId
 *   2. JWT  → jose.jwtVerify (HS256), set userId from Number(claims.sub)
 *   3. else → 401 "Unrecognized token format"
 */
export const bearerAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  // ── Path 1: vk_ key ───────────────────────────────────────────────────────
  if (isVkKey(token)) {
    if (!db) {
      return c.json({ error: "Database unavailable" }, 503);
    }

    const keyHash = crypto.createHash("sha256").update(token).digest("hex");

    const [row] = await db
      .select({ id: apiKeys.id, userId: apiKeys.userId })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
      .limit(1);

    if (!row) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    // Pitfall 4: defensive guard. Post-migration, every apiKeys row has NOT NULL userId.
    // If an orphan slipped through, fail loud (500) rather than silently treating as "no data".
    if (row.userId == null) {
      console.error(
        "[auth] api_key row has NULL userId — migration incomplete or generate-key.ts regression",
      );
      return c.json({ error: "Server misconfiguration" }, 500);
    }

    c.set("userId", row.userId);

    // fire-and-forget lastUsedAt update (preserved from pre-Phase-102 behavior)
    db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.id))
      .then(() => {})
      .catch(() => {});

    return next();
  }

  // ── Path 2: JWT ───────────────────────────────────────────────────────────
  if (looksLikeJwt(token)) {
    try {
      const claims = await verifyToken(token);
      const userId = Number(claims.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        return c.json({ error: "Invalid token subject" }, 401);
      }
      c.set("userId", userId);
      return next();
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  }

  // ── Path 3: malformed ─────────────────────────────────────────────────────
  return c.json({ error: "Unrecognized token format" }, 401);
};
