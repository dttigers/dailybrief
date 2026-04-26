// ── Phase 113 Plan 02 — GET /v1/auth/me (AUTH-11 D-27) ─────────────────────
// Distinct from /v1/me (Phase 103, me.ts) — different path, different shape,
// different consumers:
//   /v1/me          -> { userId: string, email: string }       (App.tsx + SettingsPage existing)
//   /v1/auth/me     -> { id: number, email: string, emailVerifiedAt: string | null }
//                      (Settings banner — Plan 04)
//
// RESEARCH Pitfall 2: do NOT modify me.ts to add emailVerifiedAt. App.tsx's
// PostHog identify reads { userId, email } and would break on shape change.
// The two endpoints coexist; SettingsPage will fetch BOTH on mount (D-28).
//
// Auth: bearerAuth required (mounted under the dispatcher in index.ts —
// protected route). Body always reflects c.get("userId") from the JWT,
// never from request body/query (IDOR mitigation matches me.ts:13).

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "../db/connection.js";
import { users } from "../db/schema.js";

/**
 * DI seam for unit tests. Production uses the real Postgres `db`.
 */
export interface AuthMeDeps {
  /**
   * Returns { id, email, emailVerifiedAt } for the given userId, or null
   * when the row does not exist. null -> 401 invalid_user (D-27 / me.ts D-18).
   * Throws when DB is unavailable -> 503 surface for the caller.
   */
  userLookupFn: (
    userId: number,
  ) => Promise<{ id: number; email: string; emailVerifiedAt: Date | null } | null>;
}

/** Typed sentinel for DB unavailability (mirrors me.ts pattern). */
class DbUnavailableError extends Error {
  constructor() {
    super("db_unavailable");
    this.name = "DbUnavailableError";
  }
}

const defaultDeps: AuthMeDeps = {
  userLookupFn: async (userId) => {
    if (!defaultDb) throw new DbUnavailableError();
    const [row] = await defaultDb
      .select({
        id: users.id,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  },
};

export function createAuthMeRouter(deps: AuthMeDeps = defaultDeps): Hono {
  const router = new Hono();

  router.get("/auth/me", async (c) => {
    const userId = c.get("userId") as number | undefined;
    // bearerAuth dispatcher in index.ts guarantees userId on protected paths;
    // defensive recheck protects against misconfigured mount order (mirrors me.ts:77).
    if (!Number.isInteger(userId) || (userId as number) <= 0) {
      return c.json({ error: "invalid_user" }, 401);
    }

    let row: { id: number; email: string; emailVerifiedAt: Date | null } | null;
    try {
      row = await deps.userLookupFn(userId as number);
    } catch (err) {
      if (err instanceof DbUnavailableError) {
        return c.json({ error: "Database unavailable" }, 503);
      }
      throw err; // app.onError captures
    }

    if (!row) {
      return c.json({ error: "invalid_user" }, 401);
    }

    // D-27: minimal field set — id (number), email, emailVerifiedAt (ISO|null).
    // No passwordHash, no passwordChangedAt, no createdAt. Future fields
    // get added when a feature needs them.
    return c.json(
      {
        id: row.id,
        email: row.email,
        emailVerifiedAt: row.emailVerifiedAt
          ? row.emailVerifiedAt.toISOString()
          : null,
      },
      200,
    );
  });

  return router;
}

/** Production singleton — Plan 02 Task 3 mounts this in index.ts via app.route("/v1", authMe). */
export const authMe: Hono = createAuthMeRouter();
