---
phase: 74-google-calendar-server-side
plan: "01"
subsystem: vigil-core
tags: [oauth, google-calendar, encryption, postgresql, hono]
dependency_graph:
  requires: []
  provides: [oauth-tokens-schema, token-crypto-utility, calendar-auth-routes]
  affects: [vigil-core/src/index.ts, vigil-core/src/db/schema.ts]
tech_stack:
  added: [google-auth-library@10.6.2]
  patterns: [factory-router-with-injected-deps, aes-256-gcm-encryption, state-nonce-csrf]
key_files:
  created:
    - vigil-core/src/utils/token-crypto.ts
    - vigil-core/src/utils/token-crypto.test.ts
    - vigil-core/src/routes/calendar-auth.ts
    - vigil-core/src/routes/calendar-auth.test.ts
    - vigil-core/drizzle/0007_melted_silhouette.sql
    - vigil-core/drizzle/meta/0007_snapshot.json
  modified:
    - vigil-core/src/db/schema.ts
    - vigil-core/src/index.ts
    - vigil-core/package.json
    - vigil-core/package-lock.json
    - vigil-core/drizzle/meta/_journal.json
decisions:
  - "Schema push skipped locally (no DATABASE_URL) — drizzle-kit generate used instead; migration 0007 will be applied by Railway's programmatic migrate.ts on deploy"
  - "calendarAuth route registered at line 66, bearerAuth middleware at line 69 — correct pre-auth ordering confirmed"
  - "access_token stored plaintext (short-lived 1h); encrypting adds complexity for marginal gain (T-74-05 accept)"
metrics:
  duration: "~15 minutes"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 5
  completed_date: "2026-04-13"
---

# Phase 74 Plan 01: Google Calendar OAuth Pipeline Summary

Google OAuth token storage pipeline with AES-256-GCM refresh token encryption, state-nonce CSRF protection, and Drizzle schema migration for Railway deploy.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema + token encryption utility with tests | 8af92b4 | schema.ts, token-crypto.ts, token-crypto.test.ts, package.json |
| 2 | OAuth auth routes + tests + schema push + index.ts registration | b7bff80 | calendar-auth.ts, calendar-auth.test.ts, index.ts, drizzle/0007_*.sql |

## What Was Built

**oauthTokens table** (`vigil-core/src/db/schema.ts`): PostgreSQL table with `provider` (unique, single row per provider), `encrypted_refresh_token` (AES-256-GCM ciphertext), `access_token` (plaintext, short-lived), `expires_at`, `calendar_selections` (JSONB array), `created_at`, `updated_at`.

**token-crypto utility** (`vigil-core/src/utils/token-crypto.ts`): `encryptToken` and `decryptToken` using AES-256-GCM with random 12-byte IV. Output format: `ivHex:tagHex:ciphertextHex`. Key sourced from `GOOGLE_TOKEN_ENCRYPTION_KEY` env var (64-char hex = 32 bytes). AUTH tag provides tampering detection — wrong key throws on `decipher.final()`.

**calendar-auth routes** (`vigil-core/src/routes/calendar-auth.ts`):
- `GET /auth/google` — generates state nonce (stored in-memory Map with 5-min TTL), redirects to Google consent with `access_type=offline`, `prompt=consent`, `scope=calendar.readonly`
- `GET /auth/google/callback` — validates state nonce (one-time use, expiry checked), exchanges code via `OAuth2Client.getToken()`, encrypts refresh token, upserts `oauth_tokens` with `onConflictDoUpdate`, redirects to `PWA_URL`
- Error paths all redirect to `${PWA_URL}?calendar_error=<reason>` (never 500 in browser redirect flow)

**index.ts registration**: `calendarAuth` route at `/v1` registered before `app.use("/v1/*", bearerAuth)`. Auth middleware updated to skip `/v1/auth/google` paths explicitly.

**Drizzle migration** `0007_melted_silhouette.sql`: `CREATE TABLE "oauth_tokens"` with all columns and `UNIQUE` constraint on `provider`. Railway will apply via `migrate.ts` on next deploy.

## Test Results

- token-crypto: 5/5 pass (CAL-02 tests)
- calendar-auth: 6/6 pass (CAL-01 tests)
- Full suite: 64/64 pass (all existing tests preserved)

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|------------|
| T-74-01: refresh token disclosure | AES-256-GCM encryption via GOOGLE_TOKEN_ENCRYPTION_KEY — implemented in encryptToken() |
| T-74-02: token logging | Error handler logs only `err.message`, never token values |
| T-74-03: OAuth CSRF | State nonce: random 16-byte hex, 5-min TTL, one-time use via Map.delete() |
| T-74-04: code spoofing | redirect_uri must match registered URI in Google Cloud Console |
| T-74-05: access_token plaintext | Accepted (short-lived, marginal security benefit) |

## Deviations from Plan

### Auto-fixed Issues

None.

### Schema Push Note

The plan called for `npx drizzle-kit push` (live DB push). `DATABASE_URL` is not available in the local worktree environment — this is expected since the production DB is on Railway. Used `drizzle-kit generate` instead to produce migration file `0007_melted_silhouette.sql`. This migration will be applied automatically by Railway's `migrate.ts` on next deploy, consistent with how all previous migrations have been applied (see `vigil-core/src/db/migrate.ts`).

## Known Stubs

None — all functionality is fully wired. The `calendarSelections: []` default is correct initial state for a newly connected provider (no calendars selected yet; calendar selection UI will be implemented in a future plan).

## Threat Flags

No new security surface beyond what is modeled in the plan's threat register.

## Self-Check: PASSED

Files confirmed present:
- vigil-core/src/utils/token-crypto.ts — FOUND
- vigil-core/src/utils/token-crypto.test.ts — FOUND
- vigil-core/src/routes/calendar-auth.ts — FOUND
- vigil-core/src/routes/calendar-auth.test.ts — FOUND
- vigil-core/drizzle/0007_melted_silhouette.sql — FOUND

Commits confirmed:
- 8af92b4 — FOUND (feat(74-01): add oauthTokens schema...)
- b7bff80 — FOUND (feat(74-01): OAuth calendar-auth routes...)
