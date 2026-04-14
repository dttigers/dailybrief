---
phase: 79-gmail-oauth-server-foundation
plan: "01"
subsystem: vigil-core
tags: [oauth, jwt, gmail, google-auth, security]
dependency_graph:
  requires: []
  provides: [google-auth-router, jwt-state-nonce, dual-scopes, scopes-storage]
  affects: [vigil-core/src/index.ts, vigil-core/src/db/schema.ts]
tech_stack:
  added: [jose]
  patterns: [JWT HS256 signed state nonce, DI factory router, jsonb scopes column]
key_files:
  created:
    - vigil-core/src/routes/google-auth.ts
    - vigil-core/src/routes/google-auth.test.ts
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/package.json
    - vigil-core/src/index.ts
  deleted:
    - vigil-core/src/routes/calendar-auth.ts
    - vigil-core/src/routes/calendar-auth.test.ts
decisions:
  - "Use jose SignJWT/jwtVerify (HS256) for stateless OAuth state nonce — eliminates Railway rolling-deploy state loss (OAUTH-04)"
  - "Nullable scopes jsonb column — NULL means legacy token with no scope info (D-04)"
  - "Defensive grantedScopes fallback: tokens.scope?.split(' ') ?? REQUESTED_SCOPES"
  - "Redirect params renamed from calendar_error/calendar_connected to google_error/google_connected (D-07)"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-14"
  tasks_completed: 2
  files_modified: 5
  files_created: 2
  files_deleted: 2
---

# Phase 79 Plan 01: Gmail OAuth Server Foundation Summary

**One-liner:** JWT-signed OAuth state nonce (jose HS256) with gmail.readonly + calendar.readonly dual scopes, scopes stored in new jsonb column, calendar-auth.ts replaced by unified google-auth.ts.

## What Was Built

Replaced the in-memory OAuth state nonce (which was lost on Railway rolling deploys, OAUTH-04) with a stateless JWT signed with GOOGLE_OAUTH_STATE_SECRET. Extended Google OAuth consent to request both `calendar.readonly` and `gmail.readonly` scopes simultaneously. Added a nullable `scopes` jsonb column to the `oauth_tokens` table to record which scopes were actually granted by Google. Renamed the module from `calendar-auth.ts` to `google-auth.ts` as the unified Google OAuth entry point. Updated `index.ts` to use the new module. All redirect params now use `google_error`/`google_connected` instead of the old `calendar_error`/`calendar_connected`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install jose, add scopes column, push to DB | f986e8a | package.json, schema.ts |
| 2 | Replace calendar-auth.ts with google-auth.ts | c36b228 | google-auth.ts, google-auth.test.ts, index.ts |

## Verification Results

- `npm test` — 118 tests, 0 failures
- `grep -c 'gmail.readonly' google-auth.ts` — 1
- `grep -c 'SignJWT|jwtVerify' google-auth.ts` — 3
- `grep 'scopes' schema.ts` — jsonb column present
- `calendar-auth.ts` — deleted
- `grep 'googleAuth' index.ts` — import and route registration confirmed

## Threat Model Coverage

| Threat | Mitigation Applied |
|--------|-------------------|
| T-79-01 Spoofing: forged OAuth state | SignJWT with HS256 + GOOGLE_OAUTH_STATE_SECRET |
| T-79-02 Tampering: JWT state in callback | jwtVerify validates signature; redirects with google_error=invalid_state on failure |
| T-79-03 Replay/Elevation: expired JWT state reuse | JWT has 5-minute expiry via setExpirationTime("5m") |
| T-79-04 Info Disclosure: JWT secret in logs | Only logs err.message, never logs state JWT or secret |
| T-79-05 Info Disclosure: refresh token | AES-256-GCM encryption via existing token-crypto.ts (unchanged) |
| T-79-06 DoS: missing GOOGLE_OAUTH_STATE_SECRET | SignJWT throws on undefined secret; route returns 500 |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data in the OAuth flow.

## Threat Flags

None — no new security surface beyond what is documented in the plan's threat model.

## Self-Check: PASSED

- `vigil-core/src/routes/google-auth.ts` — FOUND
- `vigil-core/src/routes/google-auth.test.ts` — FOUND
- `vigil-core/src/db/schema.ts` scopes column — FOUND
- `vigil-core/src/routes/calendar-auth.ts` — CONFIRMED deleted
- `vigil-core/src/routes/calendar-auth.test.ts` — CONFIRMED deleted
- commit f986e8a — FOUND
- commit c36b228 — FOUND
