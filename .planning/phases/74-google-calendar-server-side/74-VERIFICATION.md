---
phase: 74-google-calendar-server-side
verified: 2026-04-12T00:00:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Complete OAuth flow from PWA — click Connect Google Calendar, complete Google consent, land back at PWA"
    expected: "Browser redirects to accounts.google.com with calendar.readonly scope; after consent, returns to PWA without error; subsequent /v1/calendar/events call returns real events"
    why_human: "Requires real Google Cloud credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI set in Railway), live Google account, and deployed API endpoint. CSRF state nonce lives in-memory; can only be exercised end-to-end."
  - test: "Verify Railway migration applied — confirm oauth_tokens table exists in production PostgreSQL"
    expected: "drizzle-kit push was skipped locally (no DATABASE_URL); migration 0007_melted_silhouette.sql generated instead. Railway must have run migrate.ts on next deploy to create the table before the OAuth callback can upsert tokens."
    why_human: "Cannot verify remote Railway PostgreSQL table existence without DB credentials. Schema push was deferred to Railway auto-deploy."
---

# Phase 74: Google Calendar Server-Side Verification Report

**Phase Goal:** Users can authorize Google Calendar from the PWA, and the server stores, refreshes, and uses OAuth tokens to fetch today's events — no Mac app required
**Verified:** 2026-04-12
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | oauth_tokens table exists in PostgreSQL with all required columns | VERIFIED (migration) | `vigil-core/drizzle/0007_melted_silhouette.sql` creates all columns: provider (UNIQUE), encrypted_refresh_token, access_token, expires_at, calendar_selections (jsonb), created_at, updated_at |
| 2 | Refresh tokens are encrypted with AES-256-GCM before storage | VERIFIED | `token-crypto.ts` uses `aes-256-gcm`, random 12-byte IV, output `ivHex:tagHex:ciphertextHex`; 5/5 unit tests pass |
| 3 | GET /v1/auth/google redirects to Google consent with calendar.readonly scope | VERIFIED | `calendar-auth.ts` line 54: `scope: ["https://www.googleapis.com/auth/calendar.readonly"]`, `access_type: "offline"`, `prompt: "consent"`; 6/6 route tests pass |
| 4 | GET /v1/auth/google/callback exchanges code, encrypts refresh token, upserts oauth_tokens, redirects to PWA | VERIFIED | `calendar-auth.ts` lines 91-140: calls `getTokenFn`, `encryptToken`, `onConflictDoUpdate`; CAL-01-callback-success test asserts DB upsert with provider="google" |
| 5 | Auth routes are NOT behind bearerAuth middleware | VERIFIED | `index.ts` line 67: `app.route("/v1", calendarAuth)` at line 67, `app.use("/v1/*", bearerAuth)` at line 70; explicit skip `c.req.path.startsWith("/v1/auth/google")` at line 72 |
| 6 | GET /v1/calendar/events returns today's events with correct shape | VERIFIED | `calendar-service.ts` returns `CalendarEvent` with id, title, startTime, endTime, allDay, location, calendarId, calendarName, calendarColor; CAL-03-events test passes |
| 7 | GET /v1/calendar/list returns available calendars with id, name, color, primary fields | VERIFIED | `calendar-service.ts` `fetchCalendarList()` returns `CalendarInfo[]` with all fields; CAL-03-calendar-list test passes |
| 8 | When access token is expired, server silently refreshes before fetching events | VERIFIED | `getValidAccessToken()` in `calendar-service.ts` checks `expiresAt` with 5-min buffer, calls `doRefresh()`, updates DB; CAL-02-refresh test confirms refreshFn and dbUpdateFn are called |
| 9 | When refresh token is revoked/invalid, response is { status: "needs_reauth" } | VERIFIED | `calendar-service.ts` catches `TokenNotFoundError` and `TokenRevokedError`, returns `{ status: "needs_reauth" }`; CAL-02-refresh-failure and CAL-02-no-token-row tests pass |
| 10 | When Google API is unreachable, response is { status: "error", error: "..." } | VERIFIED | `fetchTodaysEvents()` catches TypeError from network failure, returns `{ status: "error", error: "Google Calendar API unreachable" }`; CAL-03-network-error test passes |
| 11 | All-day events are correctly handled (allDay: true, startTime from start.date) | VERIFIED | `normalizeEvent()` checks `!raw.start.dateTime` for allDay, uses `raw.start.date` as fallback for startTime; CAL-03-allday test confirms event2 has allDay=true |

**Score:** 11/11 truths verified

### Roadmap Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | User clicks "Connect Google Calendar" in PWA and completes OAuth flow without leaving browser | NEEDS HUMAN | Server-side OAuth flow implemented; requires live Google credentials + deployed Railway instance to verify end-to-end |
| 2 | After authorization, server stores encrypted refresh token in PostgreSQL | VERIFIED | `onConflictDoUpdate` with `encryptedRefreshToken` field; migration 0007 generates the table; Railway must apply migrate.ts |
| 3 | Server fetches today's calendar events via API without prompting user again | VERIFIED | `/v1/calendar/events` route returns events using stored access token; bearerAuth protects the route |
| 4 | When access token expires, server silently refreshes using stored refresh token | VERIFIED | `getValidAccessToken()` handles refresh transparently; 10/10 calendar-service tests pass |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/db/schema.ts` | oauthTokens table definition | VERIFIED | Lines 172-189: `export const oauthTokens = pgTable(...)` with all 8 columns |
| `vigil-core/src/utils/token-crypto.ts` | AES-256-GCM encrypt/decrypt | VERIFIED | Exports `encryptToken`, `decryptToken`; uses `aes-256-gcm`, `GOOGLE_TOKEN_ENCRYPTION_KEY` env var |
| `vigil-core/src/routes/calendar-auth.ts` | OAuth redirect and callback routes | VERIFIED | Exports `createCalendarAuthRouter`, `calendarAuth`; full CSRF state-nonce implementation |
| `vigil-core/src/index.ts` | calendarAuth registered before bearerAuth | VERIFIED | Line 67 (calendarAuth) precedes line 70 (bearerAuth middleware); explicit `/v1/auth/google` skip at line 72 |
| `vigil-core/src/services/calendar-service.ts` | DI factory with token refresh | VERIFIED | Exports `createCalendarService`, `CalendarEvent`, `CalendarInfo`, `CalendarEventsResponse`, `CalendarListResponse` |
| `vigil-core/src/routes/calendar.ts` | GET /calendar/events and GET /calendar/list | VERIFIED | Exports `createCalendarRouter`, `calendar`; both routes present; HTTP 200 for all statuses |
| `vigil-core/src/services/calendar-service.test.ts` | Unit tests with CAL-02, CAL-03 | VERIFIED | 10 tests covering all behavior specs; all pass |
| `vigil-core/src/routes/calendar.test.ts` | Route-level tests with CAL-03 | VERIFIED | 5 tests covering ok/needs_reauth/error paths; all pass |
| `vigil-core/drizzle/0007_melted_silhouette.sql` | Migration for oauth_tokens | VERIFIED | CREATE TABLE with all columns and UNIQUE constraint on provider |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `calendar-auth.ts` | `token-crypto.ts` | `import { encryptToken }` | WIRED | Line 4: `import { encryptToken } from "../utils/token-crypto.js"` — called at line 102 |
| `calendar-auth.ts` | `schema.ts` | `import { oauthTokens }` | WIRED | Line 6: `import { oauthTokens } from "../db/schema.js"` — used in `onConflictDoUpdate` at line 119 |
| `index.ts` | `calendar-auth.ts` | route registration before bearerAuth | WIRED | Line 32 import, line 67 `app.route("/v1", calendarAuth)` — precedes bearerAuth at line 70 |
| `calendar-service.ts` | `token-crypto.ts` | `import { decryptToken }` | WIRED | Line 8: `import { decryptToken } from "../utils/token-crypto.js"` — called at line 179 |
| `calendar-service.ts` | `schema.ts` | `import { oauthTokens }` | WIRED | Line 6: `import { oauthTokens } from "../db/schema.js"` — used in `db.select().from(oauthTokens)` |
| `calendar.ts` | `calendar-service.ts` | `import { createCalendarService }` | WIRED | Line 2-3: imported; instantiated at line 8 in factory |
| `index.ts` | `calendar.ts` | `app.route("/v1", calendar)` | WIRED | Line 31 import, line 99 registration — after bearerAuth middleware |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `calendar.ts` `/calendar/events` | `result` from `service.fetchTodaysEvents()` | `calendar-service.ts` → Google Calendar API via `fetchFn` → `oauthTokens` DB row | Yes — real fetch to `googleapis.com/calendar/v3/calendars/{id}/events` with Bearer token; DB query via `db.select().from(oauthTokens)` | FLOWING |
| `calendar.ts` `/calendar/list` | `result` from `service.fetchCalendarList()` | `calendar-service.ts` → Google Calendar API `/users/me/calendarList` | Yes — real fetch with Bearer token; maps to `CalendarInfo[]` | FLOWING |
| `calendar-auth.ts` `/auth/google/callback` | `encrypted` refresh token | `encryptToken(tokens.refresh_token)` → `db.insert(oauthTokens)` | Yes — real upsert to PostgreSQL via Drizzle `onConflictDoUpdate` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (79 tests) | `cd vigil-core && npm test` | 79 pass, 0 fail | PASS |
| token-crypto roundtrip | Covered by CAL-02 tests in suite | 5/5 pass | PASS |
| OAuth redirect route | Covered by CAL-01-redirect test | Returns 302 with accounts.google.com + calendar.readonly | PASS |
| Calendar events route | Covered by CAL-03-events-route test | Returns 200 with { status: "ok", events: [...], fetchedAt } | PASS |
| Token refresh on expiry | Covered by CAL-02-refresh test | refreshFn + dbUpdateFn called; status: ok | PASS |

Note: End-to-end spot-check skipped — requires live Railway server with Google OAuth credentials. Routes are not reachable without deployed DATABASE_URL and GOOGLE_CLIENT_ID.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CAL-01 | Plan 01 | User can authorize Google Calendar access via OAuth flow initiated from PWA | SATISFIED | `/auth/google` redirect + `/auth/google/callback` exchange implemented; 6 tests pass |
| CAL-02 | Plans 01, 02 | Server stores OAuth tokens encrypted in PostgreSQL with auto-refresh | SATISFIED | AES-256-GCM encryption, `oauth_tokens` table, `getValidAccessToken()` with auto-refresh; 5+4 tests pass |
| CAL-03 | Plan 02 | Server can fetch today's calendar events for brief generation | SATISFIED | `/calendar/events` and `/calendar/list` routes; graceful degradation; 10 service + 5 route tests pass |

No orphaned requirements — REQUIREMENTS.md maps CAL-01, CAL-02, CAL-03 exclusively to Phase 74, and all three are covered by the two plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `calendar-service.ts` | 289 | `calendarName: calendarId, calendarColor: null` | Info | calendarName is set to calendarId (not display name), calendarColor is always null per event. SUMMARY acknowledges this: "Phase 76 can enrich by joining calendar list." Not a stub — the field is populated; enrichment is intentional future work. |

No blockers or warnings. The calendarName/calendarColor limitation is documented in the SUMMARY as a known design decision, not a stub.

### Human Verification Required

#### 1. End-to-End OAuth Flow

**Test:** Deploy the current Railway build. Open the PWA. Click "Connect Google Calendar." Complete Google consent in the browser. Observe the redirect back to PWA_URL. Then call `GET /v1/calendar/events` with a valid API key.
**Expected:** Browser redirects to accounts.google.com. After consent, returns to PWA without a `calendar_error` query param. `GET /v1/calendar/events` returns `{ status: "ok", events: [...] }` with real events from the authorized Google account.
**Why human:** Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and GOOGLE_TOKEN_ENCRYPTION_KEY set in Railway environment. State nonce is in-memory — only exercisable in a live server process. Google OAuth consent screen requires a real Google account.

#### 2. Railway Migration Confirmation

**Test:** After the next Railway deploy, check that migration 0007 was applied by querying the production database or checking Railway deploy logs for `migrate.ts` output.
**Expected:** `oauth_tokens` table exists in production PostgreSQL with all 8 columns and the UNIQUE constraint on `provider`.
**Why human:** Schema push was deferred to Railway auto-deploy. The migration file `0007_melted_silhouette.sql` exists and is correct, but cannot verify remote DB state programmatically without DATABASE_URL credentials.

### Gaps Summary

No gaps. All 11 observable truths are verified by code inspection, artifact analysis, and test results (79/79 passing). Two items require human verification for end-to-end confirmation — the OAuth flow through a live Google account and confirmation that Railway applied the Drizzle migration.

---

_Verified: 2026-04-12_
_Verifier: Claude (gsd-verifier)_
