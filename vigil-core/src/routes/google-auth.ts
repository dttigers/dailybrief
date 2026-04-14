import { Hono } from "hono";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { encryptToken } from "../utils/token-crypto.js";
import { db } from "../db/connection.js";
import { oauthTokens } from "../db/schema.js";

// ── Scope constants ────────────────────────────────────────────────────────────

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const REQUESTED_SCOPES = [CALENDAR_SCOPE, GMAIL_SCOPE];

// ── Dependency injection interface (enables unit testing without real Google API / DB) ──

export interface GoogleAuthDeps {
  getTokenFn?: (client: OAuth2Client, code: string) => Promise<{ tokens: Tokens }>;
  dbUpsertFn?: (
    provider: string,
    encryptedRefreshToken: string,
    accessToken: string,
    expiresAt: Date | null,
    scopes: string[]
  ) => Promise<void>;
  signStateFn?: (nonce: string) => Promise<string>;
  verifyStateFn?: (token: string) => Promise<boolean>;
}

interface Tokens {
  refresh_token?: string | null;
  access_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGoogleAuthRouter(deps?: GoogleAuthDeps): Hono {
  const router = new Hono();

  // ── GET /auth/google — initiate OAuth consent flow ────────────────────────
  router.get("/auth/google", async (c) => {
    const clientId = process.env["GOOGLE_CLIENT_ID"];
    const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
    const redirectUri = process.env["GOOGLE_REDIRECT_URI"];

    const client = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Generate JWT state nonce (T-79-01, T-79-02, T-79-03 mitigations)
    let stateJwt: string;
    if (deps?.signStateFn) {
      stateJwt = await deps.signStateFn(randomBytes(16).toString("hex"));
    } else {
      const secret = new TextEncoder().encode(process.env["GOOGLE_OAUTH_STATE_SECRET"]!);
      const nonce = randomBytes(16).toString("hex");
      stateJwt = await new SignJWT({ nonce })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(secret);
    }

    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: REQUESTED_SCOPES,
      state: stateJwt,
    });

    return c.redirect(url);
  });

  // ── GET /auth/google/callback — exchange code, store tokens ──────────────
  router.get("/auth/google/callback", async (c) => {
    const pwaUrl = process.env["PWA_URL"] ?? "http://localhost:5173";
    const code = c.req.query("code");
    const error = c.req.query("error");
    const state = c.req.query("state");

    // Handle OAuth error from Google or missing code (per D-07)
    if (error || !code) {
      return c.redirect(
        `${pwaUrl}?google_error=${encodeURIComponent(error ?? "no_code")}`
      );
    }

    // Validate JWT state (T-79-01, T-79-02, T-79-03 mitigations)
    if (!state) {
      return c.redirect(`${pwaUrl}?google_error=invalid_state`);
    }

    try {
      let stateValid: boolean;
      if (deps?.verifyStateFn) {
        stateValid = await deps.verifyStateFn(state);
      } else {
        const secret = new TextEncoder().encode(process.env["GOOGLE_OAUTH_STATE_SECRET"]!);
        try {
          await jwtVerify(state, secret);
          stateValid = true;
        } catch {
          stateValid = false;
        }
      }

      if (!stateValid) {
        return c.redirect(`${pwaUrl}?google_error=invalid_state`);
      }
    } catch {
      return c.redirect(`${pwaUrl}?google_error=invalid_state`);
    }

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
        return c.redirect(`${pwaUrl}?google_error=no_refresh_token`);
      }

      // Encrypt refresh token before storage (T-74-01 mitigation, T-79-05 accepted)
      const encrypted = encryptToken(tokens.refresh_token);
      const accessToken = tokens.access_token ?? "";
      const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

      // Determine granted scopes (defensive per RESEARCH.md)
      const grantedScopes = tokens.scope?.split(" ") ?? [];

      // Upsert into oauth_tokens table with scopes (D-04)
      const dbUpsertFn =
        deps?.dbUpsertFn ??
        (async (
          provider: string,
          encryptedRefreshToken: string,
          storedAccessToken: string,
          storedExpiresAt: Date | null,
          scopes: string[]
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
            })
            .onConflictDoUpdate({
              target: oauthTokens.provider,
              set: {
                encryptedRefreshToken,
                accessToken: storedAccessToken,
                expiresAt: storedExpiresAt,
                scopes,
                updatedAt: new Date(),
              },
            });
        });

      await dbUpsertFn("google", encrypted, accessToken, expiresAt, grantedScopes);

      // Redirect to PWA with success param (per D-07: google_connected not calendar_connected)
      return c.redirect(`${pwaUrl}?google_connected=true`);
    } catch (err) {
      console.error(
        "[google-auth] Token exchange error:",
        err instanceof Error ? err.message : String(err)
      );
      return c.redirect(`${pwaUrl}?google_error=server_error`);
    }
  });

  return router;
}

// ── Production export ─────────────────────────────────────────────────────────

export const googleAuth = createGoogleAuthRouter();
