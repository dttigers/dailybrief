# Phase 79: Gmail OAuth Server Foundation - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand the existing Google OAuth infrastructure to include `gmail.readonly` scope alongside `calendar.readonly`, replace the in-memory state nonce with a JWT-based state parameter that survives Railway rolling deploys, and add a `GET /v1/google/status` endpoint that reports per-scope authorization state. No Gmail API reading or PWA UI in this phase — just server plumbing.

</domain>

<decisions>
## Implementation Decisions

### JWT Nonce Strategy
- **D-01:** Use `jose` library (ESM-native, zero dependencies) — not `jsonwebtoken`. Aligns with Hono's modern ESM stack.
- **D-02:** JWT state token payload contains: random nonce + 5-minute expiry + intended redirect_uri. The callback validates all three fields.
- **D-03:** Signing secret is a dedicated `GOOGLE_OAUTH_STATE_SECRET` env var in Railway. No derivation from other secrets. Must be verified in Railway before deploy.

### Scope-Gap Detection
- **D-04:** Add a `scopes` jsonb column to the `oauth_tokens` table. Record the granted scopes at authorization time. The `/v1/google/status` endpoint reads this column — no API call needed.
- **D-05:** Single `provider='google'` row. One Google account for both Calendar and Gmail. User will forward work order emails from their separate work-order Gmail to their personal Gmail. No multi-account support needed.
- **D-06:** Status response shape: `{ calendar: 'connected'|'needs_auth', gmail: 'connected'|'needs_auth' }`. Per-scope status derived from the stored scopes column.

### OAuth Redirect UX
- **D-07:** After OAuth callback, redirect to `PWA_URL?google_connected=true` (or `?google_error=...`). Same pattern as current calendar flow. Phase 81 will update the redirect target to `/settings` when that page exists.
- **D-08:** Unify the auth route — rename `calendar-auth.ts` to `google-auth.ts`. Single `/auth/google` entry point and `/auth/google/callback` handler for both scopes. No separate gmail-auth route.

### Scope Request Approach
- **D-09:** Always request both scopes together: `calendar.readonly` + `gmail.readonly`. Single consent screen, `prompt: 'consent'` forces re-grant. No incremental authorization.
- **D-10:** When an existing calendar-only token is detected (scope gap), the status endpoint reports `gmail: 'needs_auth'`. The PWA (Phase 81) will show a "re-connect Google" button that triggers the full OAuth flow again. No auto-redirect.

### Claude's Discretion
- Error handling patterns and HTTP status codes for the status endpoint
- Test structure (unit tests for JWT sign/verify, integration tests for the callback flow)
- Migration approach for adding the `scopes` column (Drizzle migration)
- Whether to store the account email in the token row for display in status

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OAuth Infrastructure (existing)
- `vigil-core/src/routes/calendar-auth.ts` — Current OAuth flow with in-memory nonce (to be replaced/renamed)
- `vigil-core/src/services/calendar-service.ts` — DI factory pattern for Google API, token refresh logic (pattern to follow)
- `vigil-core/src/db/schema.ts` — `oauthTokens` table definition (needs `scopes` column addition)
- `vigil-core/src/utils/token-crypto.ts` — Token encryption/decryption utilities (reuse for refresh token storage)

### Requirements
- `.planning/REQUIREMENTS.md` §OAUTH-04 — JWT nonce requirement

### Accumulated Context
- `.planning/STATE.md` §Accumulated Context — Prior decisions from Phase 74, blockers/concerns for Phase 79

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `calendar-service.ts` DI factory pattern: dependency injection interface with `fetchFn`, `dbSelectFn`, `dbUpdateFn`, `refreshFn` — follow this same pattern for any new service
- `token-crypto.ts`: `encryptToken()` / `decryptToken()` for refresh token storage — already used, no changes needed
- `calendar-auth.ts` route structure: Hono router factory with `createCalendarAuthRouter(deps?)` — extend this pattern for the unified google-auth route
- `OAuth2Client` from `google-auth-library` — already installed, used for token exchange and refresh

### Established Patterns
- Token storage: single row per provider in `oauth_tokens`, upsert on conflict with `onConflictDoUpdate`
- Token refresh: `getValidAccessToken()` checks expiry, decrypts refresh token, calls Google OAuth2Client, updates DB
- Route registration: `app.route("/v1", router)` in `index.ts`, OAuth routes placed before auth middleware

### Integration Points
- `vigil-core/src/index.ts:72` — Where `calendarAuth` is registered (will become `googleAuth`)
- `vigil-core/src/db/schema.ts:174` — `oauthTokens` table (add `scopes` column)
- Railway env vars — `GOOGLE_OAUTH_STATE_SECRET` must be added

</code_context>

<specifics>
## Specific Ideas

- Work order emails are forwarded from a separate work-order Gmail to the user's personal Gmail. The personal Gmail account is the one connected via OAuth for both Calendar and Gmail reading.
- `gmail.readonly` is a restricted scope (not sensitive) — app stays in Google OAuth Testing/personal-use mode, no CASA audit required.
- Existing calendar-only refresh token will 403 on Gmail API calls — the scope-gap detection must handle this gracefully and direct user to re-authorize.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 79-gmail-oauth-server-foundation*
*Context gathered: 2026-04-13*
