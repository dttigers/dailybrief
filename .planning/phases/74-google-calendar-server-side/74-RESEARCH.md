# Phase 74: Google Calendar Server-Side - Research

**Researched:** 2026-04-12
**Domain:** OAuth 2.0 server-side flow, Google Calendar API, token encryption (Node.js crypto), Drizzle ORM migration
**Confidence:** HIGH

## Summary

This phase implements a full server-side OAuth 2.0 authorization code flow for Google Calendar. The user initiates the flow from the PWA by navigating to `/v1/auth/google`, gets redirected to Google's consent screen, and is redirected back to `/v1/auth/google/callback` where the server exchanges the code for tokens. The refresh token is encrypted with AES-256-GCM using Node.js built-in `crypto` (no external dependency) and stored in a new `oauth_tokens` PostgreSQL table. All endpoints follow the established DI factory pattern.

The most critical decisions are already locked in CONTEXT.md: use `access_type: 'offline'` and `prompt: 'consent'` (documented in STATE.md as mandatory after token expiry lessons), use `google-auth-library` rather than the full `googleapis` package (lighter weight, OAuth2Client is sufficient), and encrypt the refresh token with AES-256-GCM using a Railway env var key.

**Primary recommendation:** Use `google-auth-library` (OAuth2Client) for auth + raw fetch against the Calendar REST API for event/calendar-list fetches. This keeps the dependency footprint minimal while following the existing pattern of injectable fetch deps for testability.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Full-page redirect flow — PWA links to vigil-core `/v1/auth/google` which redirects to Google consent screen, Google redirects back to `/v1/auth/google/callback`
**D-02:** After successful authorization, callback redirects user back to PWA home/dashboard (not settings page, not a confirmation page)
**D-03:** OAuth scopes: `calendar.readonly` (read-only access to calendar events and calendar list)
**D-04:** Single-row `oauth_tokens` table in PostgreSQL — upsert on re-authorization. Upgradeable to multi-row later if needed.
**D-05:** Refresh token encrypted at rest using AES-256-GCM with a `GOOGLE_TOKEN_ENCRYPTION_KEY` env var on Railway
**D-06:** Access token stored alongside (shorter-lived — Claude's discretion on plaintext vs encrypted)
**D-07:** Schema includes: provider (always 'google' for now), encrypted_refresh_token, access_token, expires_at, calendar_selections (JSONB), created_at, updated_at
**D-08:** User-selected calendars — need a calendar list endpoint (`GET /v1/calendar/list`) that returns available calendars after authorization
**D-09:** Calendar selection stored in the oauth_tokens row as JSONB array of calendar IDs
**D-10:** Event fields returned: title, start time, end time, location, calendar name/color. No attendees, descriptions, or conference links.
**D-11:** Events endpoint (`GET /v1/calendar/events`) fetches today's events from selected calendars (or all if no selection saved)
**D-12:** When tokens are revoked or refresh fails, return `{ status: "needs_reauth" }` — graceful degradation
**D-13:** PWA can check this status and show "Reconnect Google Calendar" prompt (PWA implementation is Phase 77)
**D-14:** When Google API is unreachable, return `{ status: "error", error: "..." }` with descriptive message

### Claude's Discretion

- Access token encryption (plaintext vs encrypted — tradeoff is complexity vs marginal security for short-lived tokens)
- Exact Drizzle migration structure
- Google API client library choice (googleapis npm vs raw HTTP)
- Token refresh timing strategy (on-demand vs background)

### Deferred Ideas (OUT OF SCOPE)

- Calendar selection UI in PWA — Phase 77
- Calendar event caching (avoid redundant Google API calls) — could be added later if rate limits are hit
- Support for other calendar providers (Outlook, CalDAV) — future milestone
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAL-01 | User can authorize Google Calendar access via OAuth flow initiated from PWA | Auth routes `/v1/auth/google` + `/v1/auth/google/callback`, OAuth2Client from google-auth-library |
| CAL-02 | Server stores OAuth tokens encrypted in PostgreSQL with auto-refresh | AES-256-GCM via Node.js `crypto`, `oauth_tokens` Drizzle table, on-demand token refresh with `refreshAccessToken()` |
| CAL-03 | Server can fetch today's calendar events for brief generation | `GET /v1/calendar/events` using Calendar REST API with `timeMin`/`timeMax` for today's window |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| google-auth-library | 10.6.2 | OAuth2Client — generateAuthUrl, getToken, setCredentials, refreshAccessToken | Official Google auth library, lighter than full googleapis (no unused API surface) [VERIFIED: npm registry] |
| node:crypto (built-in) | Node.js 25.2.1 | AES-256-GCM encryption for refresh token | Zero dependency, already used in auth.ts for SHA-256 key hashing [VERIFIED: codebase, Node.js built-in] |
| hono | ^4.7.0 (existing) | Route handling for auth flow + calendar endpoints | Already in project [VERIFIED: vigil-core/package.json] |
| drizzle-orm | ^0.45.2 (existing) | oauth_tokens table schema + migrations | Already in project [VERIFIED: vigil-core/package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| googleapis | 171.4.0 | Full Google API client | NOT recommended — too large; google-auth-library alone is sufficient [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| google-auth-library | Raw HTTP OAuth flow | Raw HTTP requires manually building auth URLs, exchanging codes, and handling token refresh — google-auth-library handles all of this correctly with proper edge cases |
| google-auth-library | googleapis full package | googleapis is 171.x and pulls in all Google API clients; google-auth-library is focused, lightweight, and sufficient for OAuth2 + Calendar REST fetch |
| node:crypto AES-256-GCM | libsodium-wrappers | libsodium is superior cryptography but adds a dependency; AES-256-GCM via node:crypto is standard and sufficient for token-at-rest use case |

**Installation:**
```bash
npm install google-auth-library
```

**Version verification:** [VERIFIED: npm registry — `npm view google-auth-library version` → 10.6.2]

---

## Architecture Patterns

### Recommended Project Structure
```
vigil-core/src/
├── routes/
│   ├── calendar-auth.ts        # GET /v1/auth/google + GET /v1/auth/google/callback
│   ├── calendar-auth.test.ts   # Tests for auth flow routes
│   ├── calendar.ts             # GET /v1/calendar/list + GET /v1/calendar/events
│   └── calendar.test.ts        # Tests for calendar fetch routes
├── services/
│   └── calendar-service.ts     # DI factory — fetchCalendarList, fetchTodaysEvents
├── db/
│   └── schema.ts               # Add oauth_tokens table (new export)
drizzle/
└── 0007_*.sql                  # Migration for oauth_tokens table
```

### Pattern 1: Auth Routes (Full-Page Redirect)

The OAuth flow is NOT protected by bearerAuth — it must be reachable by the browser during the redirect. Register it BEFORE the bearerAuth middleware in index.ts. Post-auth callback redirects to PWA (environment-configurable URL).

```typescript
// Source: CONTEXT.md D-01, D-02 — verified against Google OAuth docs
// vigil-core/src/routes/calendar-auth.ts

import { Hono } from "hono";
import { OAuth2Client } from "google-auth-library";
import { db } from "../db/connection.js";
import { oauthTokens } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { encryptToken, decryptToken } from "../utils/token-crypto.js";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

export function createCalendarAuthRouter(): Hono {
  const router = new Hono();

  function makeClient(): OAuth2Client {
    return new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  // Step 1: Redirect to Google consent
  router.get("/auth/google", (c) => {
    const client = makeClient();
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",          // D-05 note from STATE.md: REQUIRED for refresh token
      scope: SCOPES,
    });
    return c.redirect(url);
  });

  // Step 2: Handle callback — exchange code, store tokens, redirect to PWA
  router.get("/auth/google/callback", async (c) => {
    const code = c.req.query("code");
    const error = c.req.query("error");

    if (error || !code) {
      // Redirect to PWA with error flag
      const pwaUrl = process.env.PWA_URL ?? "http://localhost:5173";
      return c.redirect(`${pwaUrl}?calendar_error=${error ?? "no_code"}`);
    }

    const client = makeClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Should not happen with prompt=consent, but guard it
      const pwaUrl = process.env.PWA_URL ?? "http://localhost:5173";
      return c.redirect(`${pwaUrl}?calendar_error=no_refresh_token`);
    }

    // Encrypt refresh token before storage (D-05)
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

    await db!.insert(oauthTokens)
      .values({
        provider: "google",
        encryptedRefreshToken,
        accessToken: tokens.access_token ?? "",
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarSelections: [],
      })
      .onConflictDoUpdate({
        target: oauthTokens.provider,
        set: {
          encryptedRefreshToken,
          accessToken: tokens.access_token ?? "",
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          updatedAt: new Date(),
        },
      });

    const pwaUrl = process.env.PWA_URL ?? "http://localhost:5173";
    return c.redirect(pwaUrl);
  });

  return router;
}

export const calendarAuth = createCalendarAuthRouter();
```

### Pattern 2: Token Encryption Utility

AES-256-GCM with a 32-byte key (256 bits). The key is stored as a 64-character hex string in `GOOGLE_TOKEN_ENCRYPTION_KEY`. Each encrypt call generates a random 12-byte IV (prepended to ciphertext as hex). Decryption reads IV from the first 24 chars of the stored string.

```typescript
// Source: Node.js crypto docs, standard AES-256-GCM pattern [ASSUMED for exact IV format]
// vigil-core/src/utils/token-crypto.ts

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV — recommended for GCM

function getKey(): Buffer {
  const hex = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: hex(iv) + ":" + hex(tag) + ":" + hex(ciphertext)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(stored: string): string {
  const [ivHex, tagHex, cipherHex] = stored.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(cipherHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
```

### Pattern 3: Calendar Service (DI Factory)

Mirrors `createSportsService` pattern. Injectable `fetchFn` and `dbFn` for testability. On-demand token refresh — check `expires_at` before calling Calendar API, refresh if within 5 minutes of expiry.

```typescript
// Source: CONTEXT.md specifics, mirrors sports-service.ts DI factory pattern
// vigil-core/src/services/calendar-service.ts

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;      // ISO 8601
  endTime: string;        // ISO 8601
  allDay: boolean;
  location: string | null;
  calendarId: string;
  calendarName: string;
  calendarColor: string | null;
}

export interface CalendarInfo {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
}

export type CalendarEventsResponse =
  | { status: "ok"; events: CalendarEvent[]; fetchedAt: string }
  | { status: "needs_reauth" }
  | { status: "error"; error: string };

export type CalendarListResponse =
  | { status: "ok"; calendars: CalendarInfo[] }
  | { status: "needs_reauth" }
  | { status: "error"; error: string };
```

### Pattern 4: Drizzle Schema Addition

New `oauth_tokens` table. The `provider` column is the unique key (single-row per provider). JSONB `calendar_selections` defaults to empty array.

```typescript
// Source: Follows vigil-core/src/db/schema.ts conventions [VERIFIED: codebase]
// Add to vigil-core/src/db/schema.ts

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull().unique(), // always 'google' for now
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    accessToken: text("access_token").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    calendarSelections: jsonb("calendar_selections").$type<string[]>().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_oauth_tokens_provider").on(table.provider),
  ],
);
```

### Pattern 5: Route Registration (index.ts)

Auth routes (`/v1/auth/google`, `/v1/auth/google/callback`) must be registered BEFORE the bearerAuth middleware since the browser initiates these requests without an API key. Calendar data routes (`/v1/calendar/*`) are protected by bearerAuth as normal.

```typescript
// Register auth routes before bearerAuth middleware
app.route("/v1", calendarAuth);    // BEFORE app.use("/v1/*", bearerAuth)

// Calendar data routes go with other protected routes
app.route("/v1", calendar);        // AFTER bearerAuth
```

### Anti-Patterns to Avoid

- **Registering auth routes behind bearerAuth:** The OAuth redirect from Google does not carry a Bearer token. Auth callback will return 401 if behind bearerAuth.
- **Not using `prompt: 'consent'`:** Without `prompt: 'consent'`, Google only returns a refresh token on the first authorization. Re-authorization without it returns no refresh token, breaking token refresh. STATE.md explicitly calls this out.
- **Storing encryption key in DB or code:** The AES key must live in `GOOGLE_TOKEN_ENCRYPTION_KEY` env var only — never in schema, logs, or responses.
- **Logging tokens:** Never log access_token, refresh_token, or the encryption key. Follow sports-service pattern: log URLs + status codes only.
- **Synchronous token refresh:** Block request if token is expired, but don't do background refresh — on-demand is simpler and sufficient for this use case.
- **Using googleapis full package:** At 171.x it's huge and pulls in the entire API client surface. `google-auth-library` alone handles OAuth2 and the Calendar API can be called with plain fetch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth URL generation | Custom auth URL builder | `OAuth2Client.generateAuthUrl()` | Handles state, scope encoding, PKCE, URL formation correctly |
| Authorization code exchange | Custom token exchange POST | `OAuth2Client.getToken(code)` | Handles token endpoint, error parsing, token typing |
| Token refresh | Custom refresh HTTP call | `OAuth2Client.refreshAccessToken()` | Handles expiry detection, grant_type=refresh_token, error codes |
| AES-256-GCM encryption | Custom encryption scheme | `node:crypto` createCipheriv with GCM | Built-in, well-tested, GCM provides authentication tag preventing tampering |
| Calendar API HTTP | Custom Google Calendar client | Raw fetch with access token header | Calendar API is simple REST — no wrapper needed once auth is handled |

**Key insight:** OAuth has many subtle correctness requirements (state validation, refresh token handling, token expiry). `google-auth-library` handles these correctly with 10+ years of production use. Hand-rolling any of it introduces security risks.

---

## Common Pitfalls

### Pitfall 1: Missing Refresh Token on Re-Authorization
**What goes wrong:** Google only issues a refresh token the FIRST time a user authorizes, unless `prompt: 'consent'` is set. On subsequent authorizations without it, `tokens.refresh_token` is `null`, crashing the callback.
**Why it happens:** Google's consent screen defaults to `prompt: 'select_account'` — it shows the account chooser but skips the consent page if already granted, and omits the refresh token.
**How to avoid:** Always set both `access_type: 'offline'` AND `prompt: 'consent'` in `generateAuthUrl()`. Explicitly documented in STATE.md.
**Warning signs:** `tokens.refresh_token` is null after callback.

### Pitfall 2: Auth Routes Behind bearerAuth
**What goes wrong:** When Google redirects to `/v1/auth/google/callback?code=...`, the request has no `Authorization: Bearer` header. The middleware returns 401 before the callback handler runs.
**Why it happens:** The `/v1/*` middleware is applied broadly in index.ts — the auth routes are `/v1/auth/google*`.
**How to avoid:** Register `calendarAuth` router BEFORE the `app.use("/v1/*", bearerAuth)` middleware call. Alternatively, add `/v1/auth/google` and `/v1/auth/google/callback` to the existing skip-list pattern (like `/v1/health`).
**Warning signs:** OAuth flow always returns 401 on callback.

### Pitfall 3: Google OAuth App in "Testing" Mode
**What goes wrong:** Tokens issued to apps in "Testing" mode expire after 7 days regardless of refresh token use.
**Why it happens:** Google's OAuth consent screen has a "Publishing status" — Testing vs Production. Testing restricts token lifetime.
**How to avoid:** Publish the consent screen to Production before UAT. STATE.md documents this decision. Does not require Google's full verification process for personal-use apps.
**Warning signs:** Refresh tokens stop working after 7 days exactly.

### Pitfall 4: GOOGLE_REDIRECT_URI Mismatch
**What goes wrong:** Google returns `redirect_uri_mismatch` error — the redirect URI used in `generateAuthUrl()` must exactly match one of the URIs registered in Google Cloud Console.
**Why it happens:** Trailing slashes, http vs https, port numbers — any character difference causes rejection.
**How to avoid:** Set `GOOGLE_REDIRECT_URI` env var explicitly. Register the exact value in Google Cloud Console. On Railway this will be `https://api.vigilhub.io/v1/auth/google/callback`.
**Warning signs:** OAuth callback returns `error=redirect_uri_mismatch` in query string.

### Pitfall 5: Calendar API Returns All-Day Events as Date (not DateTime)
**What goes wrong:** All-day events have `start.date` (e.g. `"2026-04-12"`) instead of `start.dateTime`. Code that always reads `start.dateTime` will get `undefined` for all-day events.
**Why it happens:** Google Calendar distinguishes timed events (`start.dateTime` + timezone) from all-day events (`start.date` only).
**How to avoid:** Check for `start.date` vs `start.dateTime` when normalizing event response. Set `allDay: true` when only `start.date` is present.
**Warning signs:** All-day events appear with undefined start times.

### Pitfall 6: `singleEvents: true` Required for Today's Events
**What goes wrong:** Recurring events appear as a single entry rather than individual instances. A weekly standup returns one event with recurrence rules instead of today's instance.
**Why it happens:** Without `singleEvents=true`, the API returns the underlying recurring event objects.
**How to avoid:** Always pass `singleEvents=true` and `orderBy=startTime` when fetching today's events.
**Warning signs:** Recurring events missing from today's event list, or wrong start times.

---

## Code Examples

### Fetching Today's Calendar Events (Raw Fetch)

```typescript
// Source: Google Calendar API v3 reference — events.list [CITED: developers.google.com/calendar/api/v3/reference/events/list]
// Using raw fetch (injectable for tests) rather than googleapis client

async function fetchEventsForCalendar(
  calendarId: string,
  accessToken: string,
  fetchFn: typeof fetch,
): Promise<GoogleCalendarEvent[]> {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: todayStart.toISOString(),
    timeMax: todayEnd.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) throw new TokenRevokedError();
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);

  const data = await res.json() as { items: GoogleCalendarEvent[] };
  return data.items ?? [];
}
```

### On-Demand Token Refresh

```typescript
// Source: google-auth-library OAuth2Client pattern [CITED: github.com/googleapis/google-auth-library-nodejs]

async function getValidAccessToken(db: DbType): Promise<string> {
  const row = await db.select().from(oauthTokens)
    .where(eq(oauthTokens.provider, "google"))
    .limit(1)
    .then(r => r[0]);

  if (!row) throw new TokenRevokedError();

  // Refresh if expired or within 5 minutes of expiry
  const fiveMinFromNow = Date.now() + 5 * 60 * 1000;
  const isExpired = !row.expiresAt || row.expiresAt.getTime() < fiveMinFromNow;

  if (!isExpired) return row.accessToken;

  // Refresh
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  const refreshToken = decryptToken(row.encryptedRefreshToken);
  client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) throw new TokenRevokedError();

  // Persist updated access token
  await db.update(oauthTokens)
    .set({
      accessToken: credentials.access_token,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      updatedAt: new Date(),
    })
    .where(eq(oauthTokens.provider, "google"));

  return credentials.access_token;
}
```

### AES-256-GCM Key Generation (for Railway setup)

```bash
# Generate a 32-byte (256-bit) random key as 64-char hex string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v25.2.1 | — |
| node:crypto | AES-256-GCM encryption | ✓ | built-in | — |
| PostgreSQL (Railway) | oauth_tokens table | ✓ (Railway) | 15.x (Railway-managed) | — |
| google-auth-library | OAuth2 flow | needs install | 10.6.2 | — |
| GOOGLE_CLIENT_ID | OAuth | not set locally | env var | set on Railway |
| GOOGLE_CLIENT_SECRET | OAuth | not set locally | env var | set on Railway |
| GOOGLE_REDIRECT_URI | OAuth | not set locally | env var | set on Railway |
| GOOGLE_TOKEN_ENCRYPTION_KEY | Token encryption | not set locally | env var | generate + set on Railway |
| PWA_URL | Post-auth redirect | not set locally | env var | default http://localhost:5173 |

**Missing dependencies with no fallback:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — must be created in Google Cloud Console before UAT. These are not blockers for code implementation (guarded with env checks), but OAuth flow cannot be tested without them.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` — must be generated and set on Railway before first auth attempt.

**Missing dependencies with fallback:**
- Local env vars — all are absent locally but the OAuth flow only works on Railway (with the registered redirect URI), so local testing uses mocked deps in unit tests.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | none — uses `"test": "tsx --test \"src/**/*.test.ts\""` in package.json |
| Quick run command | `cd vigil-core && npm test -- --test-name-pattern "CAL"` |
| Full suite command | `cd vigil-core && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAL-01 | Redirect to Google consent from `/auth/google` | unit | `npm test -- --test-name-pattern "CAL-01"` | ❌ Wave 0 |
| CAL-01 | Callback stores tokens and redirects to PWA | unit | `npm test -- --test-name-pattern "CAL-01"` | ❌ Wave 0 |
| CAL-01 | Callback with OAuth error redirects to PWA with error flag | unit | `npm test -- --test-name-pattern "CAL-01"` | ❌ Wave 0 |
| CAL-02 | Refresh token is encrypted (stored value differs from plaintext) | unit | `npm test -- --test-name-pattern "CAL-02"` | ❌ Wave 0 |
| CAL-02 | Expired access token triggers refresh before API call | unit | `npm test -- --test-name-pattern "CAL-02"` | ❌ Wave 0 |
| CAL-02 | Re-authorization upserts (not duplicates) the oauth_tokens row | unit | `npm test -- --test-name-pattern "CAL-02"` | ❌ Wave 0 |
| CAL-03 | GET /v1/calendar/events returns today's events in correct shape | unit | `npm test -- --test-name-pattern "CAL-03"` | ❌ Wave 0 |
| CAL-03 | GET /v1/calendar/events with revoked token returns `needs_reauth` | unit | `npm test -- --test-name-pattern "CAL-03"` | ❌ Wave 0 |
| CAL-03 | GET /v1/calendar/events with network error returns `error` status | unit | `npm test -- --test-name-pattern "CAL-03"` | ❌ Wave 0 |
| CAL-03 | All-day events correctly detected via start.date vs start.dateTime | unit | `npm test -- --test-name-pattern "CAL-03"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd vigil-core && npm test` (full suite runs in < 10s)
- **Per wave merge:** `cd vigil-core && npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vigil-core/src/routes/calendar-auth.test.ts` — covers CAL-01
- [ ] `vigil-core/src/routes/calendar.test.ts` — covers CAL-03
- [ ] `vigil-core/src/services/calendar-service.test.ts` — covers CAL-02, CAL-03
- [ ] `vigil-core/src/utils/token-crypto.test.ts` — covers CAL-02 (encrypt/decrypt roundtrip)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | OAuth 2.0 via google-auth-library OAuth2Client |
| V3 Session Management | no | No session state — stateless API with Bearer tokens |
| V4 Access Control | yes | bearerAuth middleware on calendar data routes; auth routes intentionally public |
| V5 Input Validation | yes | `code` query param validated (presence check); provider field hardcoded to 'google' |
| V6 Cryptography | yes | AES-256-GCM via node:crypto — never hand-roll |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stolen refresh token from DB | Spoofing/Disclosure | AES-256-GCM encryption with Railway env key (D-05) |
| OAuth CSRF (forged callback) | Tampering | Add `state` parameter to `generateAuthUrl()` — random nonce verified on callback |
| Token leakage in logs | Information Disclosure | Never log access_token, refresh_token, or encryption key — follow sports-service pattern |
| Calendar data exposure | Disclosure | bearerAuth middleware on all `/v1/calendar/*` routes |
| Refresh token in transit | Disclosure | HTTPS only on Railway (api.vigilhub.io) |

**Security note on OAuth CSRF (`state` parameter):** The CONTEXT.md does not mention a `state` parameter. This is a standard OAuth security control (ASVS V2). For a single-user system the risk is low, but the mitigation is trivial (generate a short-lived random nonce, store in a transient cookie or in-memory, verify on callback). The planner should include this as a task. [ASSUMED: low risk given single-user system, but state param is best practice]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| googleapis full package | google-auth-library alone | N/A — project choice | Smaller bundle, focused API surface |
| Client-side OAuth (PKCE in browser) | Server-side authorization code flow | Project decision (D-01) | Tokens never exposed to browser; server controls refresh |
| Access token in browser storage | Token stored server-side only | Project decision | No XSS risk to tokens |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Access token stored plaintext (not encrypted) is acceptable — marginal security gain for short-lived tokens | Standard Stack / Token Encryption | If Railway DB is compromised, access token briefly usable until expiry (typically 1h). Refresh token is encrypted, so long-term access requires key compromise. |
| A2 | On-demand token refresh (check on every request, refresh if expiring) is preferred over background refresh | Architecture Patterns | If wrong: access token expires mid-request if refresh is async/delayed. On-demand is simpler and avoids background job complexity. |
| A3 | OAuth `state` parameter is best practice but low-risk omission for single-user system | Security Domain | If wrong: CSRF attack could force unauthorized re-authorization. Mitigation is trivial — planner should include it. |
| A4 | IV format: `ivHex:tagHex:cipherHex` colon-delimited is a clean storage format | Code Examples | If format changes, existing encrypted tokens cannot be decrypted. Format must be consistent — document clearly in code. |
| A5 | `PWA_URL` env var controls the post-auth redirect destination | Architecture Patterns | If hardcoded, redirect breaks on local dev vs production. Env var allows flexibility. |

---

## Open Questions (RESOLVED)

1. **Should `state` CSRF protection be included in the auth flow?** — RESOLVED: Plan 74-01 Task 2 implements state CSRF with in-memory Map, 5-minute expiry, one-time use. Test coverage in calendar-auth.test.ts (CAL-01-state-mismatch).

2. **What is the CORS_ORIGINS env var value on Railway?** — RESOLVED: Plan 74-01 user_setup section documents PWA_URL env var setup on Railway. Auth callback from Google has no Origin header (not a CORS concern).

3. **Is there a Google Cloud Console project already set up?** — RESOLVED: Plan 74-01 user_setup.dashboard_config documents all Google Cloud Console steps (create project, enable Calendar API, create OAuth 2.0 Client ID, add redirect URI, publish consent screen).

---

## Sources

### Primary (HIGH confidence)
- `vigil-core/src/services/sports-service.ts` — DI factory pattern, error status shapes, injectable fetch
- `vigil-core/src/routes/work-order-status.ts` — Route + factory function pattern
- `vigil-core/src/db/schema.ts` — Drizzle table conventions, pgTable, timestamp, jsonb, uniqueIndex
- `vigil-core/src/middleware/auth.ts` — bearerAuth pattern, node:crypto SHA-256 usage
- `vigil-core/src/index.ts` — Route registration order, middleware application
- `vigil-core/drizzle/meta/_journal.json` — Migration numbering (next: 0007)
- `vigil-core/package.json` — Existing dependencies, test script
- npm registry — google-auth-library@10.6.2, googleapis@171.4.0 [VERIFIED]

### Secondary (MEDIUM confidence)
- Google OAuth 2.0 Web Server Flow docs — authorization code exchange, offline access, prompt=consent [CITED: developers.google.com/identity/protocols/oauth2/web-server]
- Google Calendar API events.list reference — timeMin/timeMax, singleEvents, orderBy, response shape [CITED: developers.google.com/calendar/api/v3/reference/events/list]
- google-auth-library GitHub README — OAuth2Client API, generateAuthUrl, getToken, refreshAccessToken [CITED: github.com/googleapis/google-auth-library-nodejs]

### Tertiary (LOW confidence)
- None — all critical claims verified via codebase inspection or official documentation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry verified, codebase examined
- Architecture: HIGH — follows verified existing patterns in codebase
- Pitfalls: HIGH — several verified from STATE.md decisions (prompt=consent, Google Testing mode)
- Security: MEDIUM — ASVS framework verified, state param recommendation is assumed best practice

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable Google OAuth APIs; google-auth-library is actively maintained)
