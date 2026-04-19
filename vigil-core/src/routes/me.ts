// vigil-core/src/routes/me.ts
// Phase 103 Plan 03 — AUTH-08 minimal identity endpoint.
//
// GET /v1/me — returns the authenticated caller's {userId, email}.
// D-16: minimal response shape {userId: string, email: string}
// D-17: bearerAuth three-path (vk_ / JWT) symmetry — both paths set
//       c.get("userId") identically, so no branching needed here.
// D-18: valid userId but missing users row → 401 {error:"invalid_user"}.
//       NOT 404 (auth-state problem, not resource-not-found).
//       NOT 500 (defensive handling — PWA treats 401 as re-auth trigger).
// IDOR mitigation: userId read ONLY from c.get("userId") — never from body/query.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "../db/connection.js";
import { users } from "../db/schema.js";

/**
 * Dep-injection surface for unit tests (follows createProcessPhotoRouter pattern).
 * Production uses the default that queries the real Postgres users table.
 */
export interface MeDeps {
  /**
   * Returns {id, email} for the given userId, or null when the row does not exist.
   * null is the D-18 signal → 401 invalid_user.
   * Throws when the DB is unavailable → caller returns 503.
   */
  userLookupFn: (userId: number) => Promise<{ id: number; email: string } | null>;
}

/** Typed sentinel thrown when the DB connection is unavailable at call time. */
class DbUnavailableError extends Error {
  constructor() {
    super("db_unavailable");
    this.name = "DbUnavailableError";
  }
}

const defaultDeps: MeDeps = {
  userLookupFn: async (userId) => {
    if (!defaultDb) throw new DbUnavailableError();
    const [row] = await defaultDb
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  },
};

/**
 * Build an isolated `/me` router with injected deps. Tests pass fakes;
 * production uses defaults.
 */
export function createMeRouter(deps: MeDeps = defaultDeps): Hono {
  const router = new Hono();

  router.get("/me", async (c) => {
    const userId = c.get("userId");
    // bearerAuth guarantees userId is a positive integer — defensive recheck
    // protects against misconfigured mounts (Pitfall 10).
    if (!Number.isInteger(userId) || userId <= 0) {
      return c.json({ error: "invalid_user" }, 401);
    }

    let row: { id: number; email: string } | null;
    try {
      row = await deps.userLookupFn(userId);
    } catch (err) {
      // DB lookup failed (connection, not logic). Surface as 503, not 500,
      // so PWA can retry rather than force re-auth.
      if (err instanceof DbUnavailableError) {
        return c.json({ error: "Database unavailable" }, 503);
      }
      // Unknown error — rethrow so app.onError (Plan 04) captures to PostHog.
      throw err;
    }

    if (!row) {
      // D-18: valid JWT but users row deleted → treat as expired auth.
      return c.json({ error: "invalid_user" }, 401);
    }

    // D-16: minimal response shape. userId as string matches JWT sub convention.
    return c.json({ userId: String(row.id), email: row.email }, 200);
  });

  return router;
}

/** Production singleton — what Plan 04 mounts in index.ts via app.route("/v1", me). */
export const me: Hono = createMeRouter();
