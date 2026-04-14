import { Hono } from "hono";
import { db } from "../db/connection.js";
import { oauthTokens } from "../db/schema.js";
import { eq } from "drizzle-orm";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

type ScopeStatus = "connected" | "needs_auth";

interface GoogleStatusResponse {
  calendar: ScopeStatus;
  gmail: ScopeStatus;
  email?: string | null;
}

// DI interface for testing
export interface GoogleStatusDeps {
  dbSelectFn?: () => Promise<Array<{ scopes: string[] | null; accountEmail?: string | null }>>;
}

export function createGoogleStatusRouter(deps?: GoogleStatusDeps): Hono {
  const router = new Hono();

  router.get("/google/status", async (c) => {
    try {
      let rows: Array<{ scopes: string[] | null; accountEmail?: string | null }>;

      if (deps?.dbSelectFn) {
        rows = await deps.dbSelectFn();
      } else {
        if (!db) {
          return c.json({ error: "database_unavailable" }, 503);
        }
        rows = await db
          .select({ scopes: oauthTokens.scopes, accountEmail: oauthTokens.accountEmail })
          .from(oauthTokens)
          .where(eq(oauthTokens.provider, "google"))
          .limit(1);
      }

      if (rows.length === 0) {
        return c.json<GoogleStatusResponse>({
          calendar: "needs_auth",
          gmail: "needs_auth",
        }, 200);
      }

      const rawScopes = rows[0].scopes;
      const accountEmail = rows[0].accountEmail ?? null;

      // null scopes = very old row with no scopes column data — treat as fully unauthenticated
      if (rawScopes === null) {
        return c.json<GoogleStatusResponse>({
          calendar: "needs_auth",
          gmail: "needs_auth",
        }, 200);
      }

      const scopes: string[] = rawScopes;

      // Back-compat: empty array (not null) = pre-79.1 auth row that had calendar but not gmail
      if (scopes.length === 0) {
        return c.json<GoogleStatusResponse>({
          calendar: "connected",
          gmail: "needs_auth",
          email: accountEmail,
        }, 200);
      }

      return c.json<GoogleStatusResponse>({
        calendar: scopes.includes(CALENDAR_SCOPE) ? "connected" : "needs_auth",
        gmail: scopes.includes(GMAIL_SCOPE) ? "connected" : "needs_auth",
        email: accountEmail,
      }, 200);
    } catch (err) {
      console.error("[google-status] Error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "internal_error" }, 500);
    }
  });

  return router;
}

export const googleStatus = createGoogleStatusRouter();
