import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { apiKeys, users } from "../db/schema.js";
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
    // WR-01 (Phase 110 review fix): verifyToken is the ONLY call that may
    // legitimately produce a 401 here. Wrap just that in try/catch so that
    // downstream DB errors (connection pool exhaustion, network blip,
    // timeout) bubble to the global error handler (→ 500) instead of being
    // misread as auth failures. A 500 tells the PWA / ops dashboards that
    // infra is degraded; a 401 would silently force spurious sign-outs and
    // hide real outages.
    let claims: Awaited<ReturnType<typeof verifyToken>>;
    try {
      claims = await verifyToken(token);
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    const userId = Number(claims.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return c.json({ error: "Invalid token subject" }, 401);
    }

    // Phase 110 (AUTH-09 D-05/D-06/D-07/D-08): password_changed_at iat gate.
    // Single PK-indexed SELECT per JWT request — at current scale (1-few users,
    // 100 req/60s global rate limit) the round-trip is negligible.
    // Gate runs only on Path 2 (JWT). vk_ keys (Path 1) are structurally
    // unaffected — no passwordChangedAt read on this branch (D-06).
    if (!db) {
      return c.json({ error: "Database unavailable" }, 503);
    }
    const [user] = await db
      .select({ id: users.id, passwordChangedAt: users.passwordChangedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      // D-07: missing users row for a validly-signed JWT (user deleted
      // mid-session). Return the SAME body as verifyToken failure to keep
      // the response surface symmetric.
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    // D-05: strict less-than. Truncate postgres microsecond timestamp to
    // whole seconds to match JWT RFC 7519 iat resolution. Any JWT minted
    // AFTER passwordChangedAt has iat >= floor(ts/1000) and passes; any
    // JWT minted BEFORE has iat < floor(ts/1000) and fails. Equality
    // (iat == floor(ts/1000)) PASSES because the comparison is strict <,
    // not <=. D-14 ordering (signToken after db.update) makes the equality
    // case practically unreachable in production but the gate enforces
    // the exact contract documented here.
    const gateThreshold = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (claims.iat < gateThreshold) {
      // D-08: distinct body so PWA can route on it specifically (Plan 03 D-19
      // global 401 handler). No user enumeration concern — gate runs AFTER
      // JWT verify, caller is known-authenticated.
      return c.json({ error: "Session expired" }, 401);
    }

    c.set("userId", userId);
    return next();
  }

  // ── Path 3: malformed ─────────────────────────────────────────────────────
  return c.json({ error: "Unrecognized token format" }, 401);
};
