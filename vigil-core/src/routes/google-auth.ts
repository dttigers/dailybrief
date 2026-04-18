import { Hono } from "hono";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { encryptToken } from "../utils/token-crypto.js";
import { db } from "../db/connection.js";
import { oauthTokens } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

// ── Scope constants ────────────────────────────────────────────────────────────

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const REQUESTED_SCOPES = ["openid", "email", CALENDAR_SCOPE, GMAIL_SCOPE];

// ── Dependency injection interface (enables unit testing without real Google API / DB) ──

export interface GoogleAuthDeps {
  getTokenFn?: (client: OAuth2Client, code: string) => Promise<{ tokens: Tokens }>;
  dbUpsertFn?: (
    userId: number,
    provider: string,
    encryptedRefreshToken: string,
    accessToken: string,
    expiresAt: Date | null,
    scopes: string[],
    accountEmail: string | null
  ) => Promise<void>;
  // Phase 102 RESEARCH Open Q3: state JWT carries {nonce, userId}; initiation
  // route requires bearer (mounted behind auth in src/index.ts); callback
  // stays public and extracts userId from verified state.
  signStateFn?: (nonce: string, userId: number) => Promise<string>;
  verifyStateFn?: (token: string) => Promise<{ valid: true; userId: number } | { valid: false }>;
}

interface Tokens {
  refresh_token?: string | null;
  access_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  id_token?: string | null;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGoogleAuthRouter(deps?: GoogleAuthDeps): Hono {
  const router = new Hono();

  // ── GET /auth/google — initiate OAuth consent flow (bearer-required) ──────
  // Phase 102 RESEARCH Open Q3: state JWT now carries {nonce, userId}. Route
  // is mounted behind bearerAuth in src/index.ts so c.get("userId") is set.
  router.get("/auth/google", async (c) => {
    const userId = c.get("userId");
    const clientId = process.env["GOOGLE_CLIENT_ID"];
    const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
    const redirectUri = process.env["GOOGLE_REDIRECT_URI"];

    const client = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Generate JWT state nonce (T-79-01, T-79-02, T-79-03 mitigations).
    // State JWT carries {nonce, userId} — callback extracts userId for oauthTokens upsert.
    let stateJwt: string;
    if (deps?.signStateFn) {
      stateJwt = await deps.signStateFn(randomBytes(16).toString("hex"), userId);
    } else {
      const secret = new TextEncoder().encode(process.env["GOOGLE_OAUTH_STATE_SECRET"]!);
      const nonce = randomBytes(16).toString("hex");
      stateJwt = await new SignJWT({ nonce, userId })
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

    // Phase 102: state verification must also extract userId. The sole trust
    // anchor is jwtVerify — attacker without GOOGLE_OAUTH_STATE_SECRET cannot mint.
    let verifiedUserId: number;
    try {
      let verifyResult: { valid: true; userId: number } | { valid: false };
      if (deps?.verifyStateFn) {
        verifyResult = await deps.verifyStateFn(state);
      } else {
        const secret = new TextEncoder().encode(process.env["GOOGLE_OAUTH_STATE_SECRET"]!);
        try {
          const { payload } = await jwtVerify(state, secret, { algorithms: ["HS256"] });
          if (typeof payload.userId !== "number" || payload.userId <= 0) {
            verifyResult = { valid: false };
          } else {
            verifyResult = { valid: true, userId: payload.userId };
          }
        } catch {
          verifyResult = { valid: false };
        }
      }

      if (!verifyResult.valid) {
        return c.redirect(`${pwaUrl}?google_error=invalid_state`);
      }
      verifiedUserId = verifyResult.userId;
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

      // Decode account email from id_token payload (no signature verify — TLS is trust anchor).
      // SECURITY NOTE (CR-03): The RS256 signature on the id_token is NOT verified here.
      // This is an accepted risk: the token exchange itself happens over TLS to accounts.google.com,
      // so a forged id_token payload requires a network-level MITM or a compromised DI mock in tests.
      // CONSTRAINT: accountEmail is DISPLAY-ONLY (shown in the Settings UI).
      // It MUST NOT be used for any access-control, authorization, or identity-gating decisions.
      // If email-based gating is ever needed, replace this block with google-auth-library verifyIdToken().
      let accountEmail: string | null = null;
      if (tokens.id_token) {
        try {
          const payload = JSON.parse(
            Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf-8")
          ) as { email?: string };
          accountEmail = payload.email ?? null;
        } catch {
          // non-fatal — email stays null
        }
      }

      // Upsert into oauth_tokens table with scopes and email (D-04).
      // Phase 102: composite unique is (userId, provider) per uq_oauth_tokens_user_provider.
      const dbUpsertFn =
        deps?.dbUpsertFn ??
        (async (
          upsertUserId: number,
          provider: string,
          encryptedRefreshToken: string,
          storedAccessToken: string,
          storedExpiresAt: Date | null,
          scopes: string[],
          email: string | null
        ) => {
          if (!db) {
            throw new Error("Database not available");
          }
          await db
            .insert(oauthTokens)
            .values({
              userId: upsertUserId,
              provider,
              encryptedRefreshToken,
              accessToken: storedAccessToken,
              expiresAt: storedExpiresAt,
              // calendarSelections omitted — column default [] applies only on first insert
              scopes,
              accountEmail: email,
            })
            .onConflictDoUpdate({
              target: [oauthTokens.userId, oauthTokens.provider],
              set: {
                encryptedRefreshToken,
                accessToken: storedAccessToken,
                expiresAt: storedExpiresAt,
                scopes,
                accountEmail: email,
                updatedAt: new Date(),
                // calendarSelections intentionally omitted — preserve existing user selections
              },
            });
        });

      await dbUpsertFn(verifiedUserId, "google", encrypted, accessToken, expiresAt, grantedScopes, accountEmail);

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
