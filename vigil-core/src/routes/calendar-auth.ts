import { Hono } from "hono";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { encryptToken } from "../utils/token-crypto.js";
import { db } from "../db/connection.js";
import { oauthTokens } from "../db/schema.js";

// ── Dependency injection interface (enables unit testing without real Google API / DB) ──

export interface GoogleStatusRow {
  provider: string;
  // Phase 79.1: `scopes` (jsonb string[]) and `accountEmail` (nullable text) are
  // now persisted columns on `oauth_tokens`. Status handler reads them directly;
  // back-compat branch (granted.length === 0) preserved for legacy pre-79.1 rows.
  scopes?: string[];
  accountEmail?: string | null;
}

export interface CalendarAuthDeps {
  getTokenFn?: (client: OAuth2Client, code: string) => Promise<{ tokens: Tokens }>;
  dbUpsertFn?: (
    provider: string,
    encryptedRefreshToken: string,
    accessToken: string,
    expiresAt: Date | null,
    scopes: string[],
    accountEmail: string | null
  ) => Promise<void>;
  stateStore?: Map<string, number>; // state nonce -> timestamp (ms)
  /**
   * Status lookup for GET /v1/google/status. Returns null when no row exists (→ 404).
   * Override in tests to simulate connected / disconnected / scope-gap states.
   */
  statusFn?: () => Promise<GoogleStatusRow | null>;
  /**
   * Delete handler for DELETE /v1/google/tokens. Override in tests to avoid real DB access.
   */
  deleteFn?: () => Promise<void>;
}

interface Tokens {
  refresh_token?: string | null;
  access_token?: string | null;
  expiry_date?: number | null;
  id_token?: string | null;
  scope?: string | null;
}

// ── State nonce expiry (5 minutes) ────────────────────────────────────────────

const STATE_TTL_MS = 5 * 60 * 1000;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createCalendarAuthRouter(deps?: CalendarAuthDeps): Hono {
  // In-memory state store: nonce -> timestamp. Shared per router instance.
  const stateStore: Map<string, number> = deps?.stateStore ?? new Map();

  const router = new Hono();

  // ── GET /auth/google — initiate OAuth consent flow ────────────────────────
  router.get("/auth/google", (c) => {
    const clientId = process.env["GOOGLE_CLIENT_ID"];
    const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
    const redirectUri = process.env["GOOGLE_REDIRECT_URI"];

    const client = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Generate and store state nonce (T-74-03 CSRF mitigation)
    const stateNonce = randomBytes(16).toString("hex");
    stateStore.set(stateNonce, Date.now());

    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      state: stateNonce,
    });

    return c.redirect(url);
  });

  // ── GET /auth/google/callback — exchange code, store tokens ──────────────
  router.get("/auth/google/callback", async (c) => {
    const pwaUrlRaw = process.env["PWA_URL"] ?? "http://localhost:5173";
    // Strip trailing slash so `${pwaBase}/settings` never produces `//settings`
    const pwaBase = pwaUrlRaw.replace(/\/$/, "");
    const code = c.req.query("code");
    const error = c.req.query("error");
    const state = c.req.query("state");

    // Handle OAuth error from Google
    if (error || !code) {
      return c.redirect(`${pwaBase}/settings?google_error=${encodeURIComponent(error ?? "no_code")}`);
    }

    // Validate state nonce (CSRF protection, T-74-03)
    if (!state || !stateStore.has(state)) {
      return c.redirect(`${pwaBase}/settings?google_error=invalid_state`);
    }
    const stateTs = stateStore.get(state)!;
    if (Date.now() - stateTs > STATE_TTL_MS) {
      stateStore.delete(state);
      return c.redirect(`${pwaBase}/settings?google_error=invalid_state`);
    }
    stateStore.delete(state); // one-time use

    try {
      const clientId = process.env["GOOGLE_CLIENT_ID"];
      const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
      const redirectUri = process.env["GOOGLE_REDIRECT_URI"];
      const client = new OAuth2Client(clientId, clientSecret, redirectUri);

      // Exchange authorization code for tokens
      const getTokenFn =
        deps?.getTokenFn ??
        ((oauthClient: OAuth2Client, authCode: string) => oauthClient.getToken(authCode));

      const { tokens } = await getTokenFn(client, code);

      if (!tokens.refresh_token) {
        return c.redirect(`${pwaBase}/settings?google_error=no_refresh_token`);
      }

      // Encrypt refresh token before storage (T-74-01 mitigation)
      const encrypted = encryptToken(tokens.refresh_token);
      const accessToken = tokens.access_token ?? "";
      const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

      // T-79.1-01 mitigation: grantedScopes comes from Google's server-to-server token
      // response, never from request params. Google returns `scope` as a
      // space-separated string; split on whitespace (one-or-more) to get the array.
      const grantedScopes: string[] =
        typeof tokens.scope === "string" && tokens.scope.length > 0
          ? tokens.scope.split(/\s+/).filter((s) => s.length > 0)
          : [];

      // T-79.1-02 mitigation: account email is decoded from the id_token JWT claim,
      // which Google signs. We do a payload decode (not signature verify) because
      // the id_token arrived over the authenticated server-to-server token
      // exchange — the channel itself is the trust anchor (T-79.1-06 accepted).
      // If id_token is absent (e.g. openid scope not granted), accountEmail stays
      // null (nullable column).
      let accountEmail: string | null = null;
      if (typeof tokens.id_token === "string" && tokens.id_token.length > 0) {
        const parts = tokens.id_token.split(".");
        if (parts.length === 3) {
          try {
            const payloadJson = Buffer.from(parts[1]!, "base64url").toString("utf8");
            const payload = JSON.parse(payloadJson) as { email?: unknown };
            if (typeof payload.email === "string" && payload.email.length > 0) {
              accountEmail = payload.email;
            }
          } catch {
            // Malformed id_token — leave accountEmail null, do not fail the flow.
          }
        }
      }

      // Upsert into oauth_tokens table
      const dbUpsertFn =
        deps?.dbUpsertFn ??
        (async (
          provider: string,
          encryptedRefreshToken: string,
          storedAccessToken: string,
          storedExpiresAt: Date | null,
          scopes: string[],
          storedAccountEmail: string | null
        ) => {
          if (!db) {
            throw new Error("Database not available");
          }
          await db
            .insert(oauthTokens)
            .values({
              provider,
              encryptedRefreshToken,
              accessToken: storedAccessToken,
              expiresAt: storedExpiresAt,
              calendarSelections: [],
              scopes,
              accountEmail: storedAccountEmail,
            })
            .onConflictDoUpdate({
              target: oauthTokens.provider,
              set: {
                encryptedRefreshToken,
                accessToken: storedAccessToken,
                expiresAt: storedExpiresAt,
                scopes,
                accountEmail: storedAccountEmail,
                updatedAt: new Date(),
              },
            });
        });

      await dbUpsertFn("google", encrypted, accessToken, expiresAt, grantedScopes, accountEmail);

      return c.redirect(`${pwaBase}/settings?google_connected=true`);
    } catch (err) {
      console.error("[calendar-auth] Token exchange error:", err instanceof Error ? err.message : String(err));
      return c.redirect(`${pwaBase}/settings?google_error=server_error`);
    }
  });

  // ── GET /google/status — Phase 81 D-07 / OAUTH-03 ─────────────────────────
  // Returns connection status for the Google provider row.
  // 404 when no oauth_tokens row for provider='google' (PWA renders empty-state card).
  // Phase 79.1: reads oauth_tokens.scopes + account_email directly. Back-compat
  // branch for legacy pre-79.1 rows (granted.length === 0) preserved below.
  router.get("/google/status", async (c) => {
    const statusFn =
      deps?.statusFn ??
      (async (): Promise<GoogleStatusRow | null> => {
        if (!db) {
          throw new Error("Database not available");
        }
        const rows = await db
          .select({
            provider: oauthTokens.provider,
            scopes: oauthTokens.scopes,
            accountEmail: oauthTokens.accountEmail,
          })
          .from(oauthTokens)
          .where(eq(oauthTokens.provider, "google"))
          .limit(1);
        if (rows.length === 0) return null;
        const row = rows[0]!;
        return {
          provider: row.provider,
          scopes: Array.isArray(row.scopes) ? row.scopes : [],
          accountEmail: row.accountEmail ?? null,
        };
      });

    try {
      const row = await statusFn();
      if (row === null) {
        return c.json({ error: "not_connected" }, 404);
      }
      const granted = Array.isArray(row.scopes) ? row.scopes : [];
      const hasScope = (needle: string) => granted.some((g) => g.includes(needle));
      // Back-compat: when scopes column is absent (pre-Phase-79), default to
      // calendar=connected (row presence implies calendar.readonly granted by /auth/google),
      // gmail=needs_auth. Once Phase 79 writes the scopes array on every upsert,
      // granted.length > 0 and this branch is skipped automatically.
      const calendar =
        granted.length === 0 || hasScope("calendar") ? "connected" : "needs_auth";
      const gmail = granted.length === 0 ? "needs_auth" : hasScope("gmail") ? "connected" : "needs_auth";
      return c.json({
        calendar,
        gmail,
        email: row.accountEmail ?? undefined,
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // ── DELETE /google/tokens — Phase 81 OAUTH-02 ─────────────────────────────
  // Disconnect Google: delete the oauth_tokens row for provider='google'.
  // Bearer-auth enforced by index.ts /v1/* middleware (path does NOT start with
  // /v1/auth/google, so the OAuth bypass does not apply — T-81-05 mitigation).
  router.delete("/google/tokens", async (c) => {
    const deleteFn =
      deps?.deleteFn ??
      (async () => {
        if (!db) {
          throw new Error("Database not available");
        }
        await db.delete(oauthTokens).where(eq(oauthTokens.provider, "google"));
      });

    try {
      await deleteFn();
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  return router;
}

// ── Production export ─────────────────────────────────────────────────────────

export const calendarAuth = createCalendarAuthRouter();
