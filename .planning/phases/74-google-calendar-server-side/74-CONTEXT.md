# Phase 74: Google Calendar Server-Side - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

OAuth-based Google Calendar integration: user authorizes from PWA via redirect flow, server stores encrypted refresh token in PostgreSQL, fetches today's events via Google Calendar API, and silently refreshes expired access tokens. No Mac app required — fully server-side.

</domain>

<decisions>
## Implementation Decisions

### OAuth Flow UX
- **D-01:** Full-page redirect flow — PWA links to vigil-core `/v1/auth/google` which redirects to Google consent screen, Google redirects back to `/v1/auth/google/callback`
- **D-02:** After successful authorization, callback redirects user back to PWA home/dashboard (not settings page, not a confirmation page)
- **D-03:** OAuth scopes: `calendar.readonly` (read-only access to calendar events and calendar list)

### Token Storage & Encryption
- **D-04:** Single-row `oauth_tokens` table in PostgreSQL — upsert on re-authorization. Upgradeable to multi-row later if needed.
- **D-05:** Refresh token encrypted at rest using AES-256-GCM with a `GOOGLE_TOKEN_ENCRYPTION_KEY` env var on Railway
- **D-06:** Access token stored alongside (shorter-lived, may be stored plaintext or encrypted — Claude's discretion)
- **D-07:** Schema includes: provider (always 'google' for now), encrypted_refresh_token, access_token, expires_at, calendar_selections (JSONB), created_at, updated_at

### Calendar Event Scope
- **D-08:** User-selected calendars — need a calendar list endpoint (`GET /v1/calendar/list`) that returns available calendars after authorization
- **D-09:** Calendar selection stored in the oauth_tokens row as JSONB array of calendar IDs (calendar selection UI is Phase 77 PWA scope)
- **D-10:** Event fields returned: title, start time, end time, location, calendar name/color. No attendees, descriptions, or conference links needed.
- **D-11:** Events endpoint (`GET /v1/calendar/events`) fetches today's events from selected calendars (or all if no selection saved)

### Error & Revocation Handling
- **D-12:** When tokens are revoked or refresh fails, return `{ status: "needs_reauth" }` instead of events — graceful degradation, not an error
- **D-13:** PWA can check this status and show a "Reconnect Google Calendar" prompt (PWA implementation is Phase 77)
- **D-14:** When Google API is unreachable (network error), return `{ status: "error", error: "..." }` with descriptive message — same pattern as sports service

### Claude's Discretion
- Access token encryption (plaintext vs encrypted — tradeoff is complexity vs marginal security for short-lived tokens)
- Exact Drizzle migration structure
- Google API client library choice (googleapis npm vs raw HTTP)
- Token refresh timing strategy (on-demand vs background)

</decisions>

<specifics>
## Specific Ideas

- Follow the same DI factory pattern as sports-service and work-order-status for testability
- Calendar endpoint should mirror sports endpoint shape where possible (status field, partial flag pattern)
- Single-user system — no multi-tenant concerns, but table schema should not hardcode single-user assumption (just happens to have one row)

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above and REQUIREMENTS.md (CAL-01, CAL-02, CAL-03).

### Existing patterns to follow
- `vigil-core/src/services/sports-service.ts` — DI factory pattern, error status shapes
- `vigil-core/src/routes/work-order-status.ts` — Route + service separation pattern
- `vigil-core/src/db/schema.ts` — Drizzle schema conventions, table patterns
- `vigil-core/src/middleware/auth.ts` — Bearer auth middleware (calendar routes must be behind this)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Bearer auth middleware: all `/v1/*` routes already protected — calendar routes inherit this
- Drizzle ORM + PostgreSQL: established connection, migration, and schema patterns
- DI factory pattern: `createSportsService({ fetchFn })` pattern for injectable dependencies

### Established Patterns
- Route files export both a factory function and a production instance
- Services handle their own error wrapping (try/catch → status objects)
- Tests use injectable fetch/deps for isolation

### Integration Points
- `vigil-core/src/index.ts` — new calendar routes registered here
- `vigil-core/src/db/schema.ts` — new `oauth_tokens` table added here
- Railway env vars — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_REDIRECT_URI`

</code_context>

<deferred>
## Deferred Ideas

- Calendar selection UI in PWA — Phase 77
- Calendar event caching (avoid redundant Google API calls) — could be added later if rate limits are hit
- Support for other calendar providers (Outlook, CalDAV) — future milestone

</deferred>

---

*Phase: 74-google-calendar-server-side*
*Context gathered: 2026-04-12*
