import { Hono } from "hono";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { encryptToken } from "../utils/token-crypto.js";
import { db } from "../db/connection.js";
import { oauthTokens } from "../db/schema.js";

// ── Dependency injection interface (enables unit testing without real Google API / DB) ──

export interface CalendarAuthDeps {
  getTokenFn?: (client: OAuth2Client, code: string) => Promise<{ tokens: Tokens }>;
  dbUpsertFn?: (
    provider: string,
    encryptedRefreshToken: string,
    accessToken: string,
    expiresAt: Date | null
  ) => Promise<void>;
  stateStore?: Map<string, number>; // state nonce -> timestamp (ms)
}

interface Tokens {
  refresh_token?: string | null;
  access_token?: string | null;
  expiry_date?: number | null;
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
      scope: ["https://www.googleapis.com/auth/calendar.readonly"],
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

      // Upsert into oauth_tokens table
      const dbUpsertFn =
        deps?.dbUpsertFn ??
        (async (
          provider: string,
          encryptedRefreshToken: string,
          storedAccessToken: string,
          storedExpiresAt: Date | null
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
            })
            .onConflictDoUpdate({
              target: oauthTokens.provider,
              set: {
                encryptedRefreshToken,
                accessToken: storedAccessToken,
                expiresAt: storedExpiresAt,
                updatedAt: new Date(),
              },
            });
        });

      await dbUpsertFn("google", encrypted, accessToken, expiresAt);

      return c.redirect(`${pwaBase}/settings?google_connected=true`);
    } catch (err) {
      console.error("[calendar-auth] Token exchange error:", err instanceof Error ? err.message : String(err));
      return c.redirect(`${pwaBase}/settings?google_error=server_error`);
    }
  });

  return router;
}

// ── Production export ─────────────────────────────────────────────────────────

export const calendarAuth = createCalendarAuthRouter();
