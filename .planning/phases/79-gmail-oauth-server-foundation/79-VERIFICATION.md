---
phase: 79-gmail-oauth-server-foundation
verified: 2026-04-14T19:00:00Z
status: human_needed
score: 3/4 must-haves verified
overrides_applied: 0
deferred:
  - truth: "Calling the Gmail API with the stored token returns data — not a 403 insufficientPermissions error"
    addressed_in: "Phase 80"
    evidence: "Phase 80 goal: 'vigil-core exposes Gmail inbox list, thread read, search...all using the existing oauthTokens row'; SC1: 'GET /v1/gmail/messages returns a list of recent messages...fetched' proves token works end-to-end with the stored credentials"
human_verification:
  - test: "Trigger the OAuth flow against a real Google account, complete consent, then confirm google_connected=true appears in the PWA redirect URL and the oauth_tokens row contains non-null scopes in the database"
    expected: "Row exists in oauth_tokens with provider='google', scopes contains both 'https://www.googleapis.com/auth/calendar.readonly' and 'https://www.googleapis.com/auth/gmail.readonly', and the browser was redirected to ?google_connected=true"
    why_human: "Unit tests use DI mocks for the Google token exchange and DB upsert — the real OAuth round-trip (Google consent screen, actual token grant, live DB write) cannot be verified programmatically without a browser and a real Google account"
  - test: "After a Railway rolling deploy (or simulating it by restarting the server process), initiate the OAuth flow and complete the callback using the state JWT generated before the restart"
    expected: "Callback succeeds — JWT is validated correctly because the secret lives in GOOGLE_OAUTH_STATE_SECRET env var (not in-memory), so the state survives the restart"
    why_human: "The JWT nonce statelessness is the core OAUTH-04 fix. Unit tests verify JWT sign/verify logic in isolation; the actual Railway rolling-deploy survival requires a live Railway environment or a controlled server restart test"
---

# Phase 79: Gmail OAuth Server Foundation Verification Report

**Phase Goal:** The server can authorize Gmail API access using the existing Google OAuth infrastructure — scope expanded to include gmail.readonly, CSRF nonce survives Railway rolling deploys, and the server can report per-scope authorization status to any client
**Verified:** 2026-04-14T19:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The OAuth authorization URL includes both `calendar.readonly` and `gmail.readonly` scopes | ✓ VERIFIED | `google-auth.ts` defines `CALENDAR_SCOPE` and `GMAIL_SCOPE` constants, both in `REQUESTED_SCOPES`, passed to `generateAuthUrl`; GA-01 test asserts both scopes appear in redirect URL; 122/122 tests pass |
| 2 | After a Railway rolling deploy, the OAuth callback succeeds — state validates via JWT nonce, no in-memory map | ✓ VERIFIED | `jose` SignJWT/jwtVerify (HS256) used; secret comes from `GOOGLE_OAUTH_STATE_SECRET` env var (stateless); `stateStore` Map removed; GA-07 and GA-08 tests verify expired/tampered/missing state produces `google_error=invalid_state` |
| 3 | `GET /v1/google/status` returns structured per-scope authorization state | ✓ VERIFIED | `google-status.ts` exists, exports `googleStatus`; reads `oauthTokens.scopes` column via DI; registered at line 107 of `index.ts`, AFTER `bearerAuth` middleware at line 76; GS-01 through GS-04 tests cover all 4 scenarios; 122 tests pass |
| 4 | Calling the Gmail API with the stored token returns data — not a 403 insufficientPermissions error | DEFERRED | See Deferred Items — Phase 80 SC1 proves token works end-to-end with `GET /v1/gmail/messages` |

**Score:** 3/4 truths verified (SC4 deferred to Phase 80)

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Calling the Gmail API with the stored token returns data — not a 403 insufficientPermissions error | Phase 80 | Phase 80 goal states it uses "the existing oauthTokens row"; SC1: "GET /v1/gmail/messages returns a list of recent messages...fetched with format: metadata" |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/routes/google-auth.ts` | Unified Google OAuth flow with JWT nonce and dual scopes | ✓ VERIFIED | 193 lines; exports `createGoogleAuthRouter` and `googleAuth`; imports `SignJWT, jwtVerify` from `jose`; uses `REQUESTED_SCOPES = [CALENDAR_SCOPE, GMAIL_SCOPE]`; redirect params use `google_error`/`google_connected` |
| `vigil-core/src/routes/google-auth.test.ts` | Tests for JWT sign/verify, dual scopes, callback flow, error redirects | ✓ VERIFIED | 148 lines (min 80); 8 tests: GA-01 through GA-08 covering all required scenarios |
| `vigil-core/src/db/schema.ts` | oauthTokens table with scopes jsonb column | ✓ VERIFIED | Line 183: `scopes: jsonb("scopes").$type<string[]>()` — nullable, no default |
| `vigil-core/src/routes/google-status.ts` | GET /v1/google/status endpoint | ✓ VERIFIED | 63 lines; exports `createGoogleStatusRouter` and `googleStatus`; reads scopes column; no outbound API calls |
| `vigil-core/src/routes/google-status.test.ts` | Tests for all 3 scope-state scenarios | ✓ VERIFIED | 67 lines (min 50); 4 tests: GS-01 through GS-04 |
| `vigil-core/src/routes/calendar-auth.ts` | Must NOT exist (deleted) | ✓ VERIFIED | File absent |
| `vigil-core/src/routes/calendar-auth.test.ts` | Must NOT exist (deleted) | ✓ VERIFIED | File absent |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `google-auth.ts` | `jose` | `import { SignJWT, jwtVerify } from "jose"` | ✓ WIRED | Line 4; used at lines 57, 100 |
| `google-auth.ts` | `vigil-core/src/db/schema.ts` | `oauthTokens.scopes` in upsert | ✓ WIRED | Lines 154-171; `scopes` included in `.values()` and `onConflictDoUpdate.set` |
| `vigil-core/src/index.ts` | `google-auth.ts` | `import { googleAuth }` | ✓ WIRED | Line 32; `app.route("/v1", googleAuth)` at line 73 (before auth middleware — correct, OAuth is unauthenticated) |
| `google-status.ts` | `vigil-core/src/db/schema.ts` | `oauthTokens.scopes` in select | ✓ WIRED | Lines 35-38; `db.select({ scopes: oauthTokens.scopes }).from(oauthTokens).where(eq(oauthTokens.provider, "google"))` |
| `vigil-core/src/index.ts` | `google-status.ts` | `import { googleStatus }` | ✓ WIRED | Line 33; `app.route("/v1", googleStatus)` at line 107 (after `bearerAuth` at line 76 — protected) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `google-status.ts` | `rows` (scopes column) | `db.select({ scopes: oauthTokens.scopes }).from(oauthTokens)` | Yes — live DB query with `where(eq(oauthTokens.provider, "google"))` | ✓ FLOWING |
| `google-auth.ts` | `grantedScopes` | `tokens.scope?.split(" ") ?? REQUESTED_SCOPES` | Yes — populated from real Google token response at callback time | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All tests pass (122 tests) | `cd vigil-core && npm test` | 122 pass, 0 fail | ✓ PASS |
| jose is importable | `grep '"jose"' vigil-core/package.json` | `"jose": "^6.2.2"` in dependencies | ✓ PASS |
| calendar-auth.ts deleted | `test -f vigil-core/src/routes/calendar-auth.ts` | File absent | ✓ PASS |
| calendarAuth not in index.ts | `grep calendarAuth vigil-core/src/index.ts` | No matches | ✓ PASS |
| googleStatus after bearerAuth | Line order in index.ts | `app.use("/v1/*"...bearerAuth)` at line 76, `app.route("/v1", googleStatus)` at line 107 | ✓ PASS |
| Real OAuth round-trip with browser | Manual | Not tested | ? SKIP (human needed) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OAUTH-04 | 79-01-PLAN.md, 79-02-PLAN.md | JWT nonce replacing in-memory OAuth state to survive Railway rolling deploys | ✓ SATISFIED | JWT SignJWT/jwtVerify implemented in `google-auth.ts`; `stateStore` Map removed; GA-07/GA-08 tests cover invalid/expired state; 122 tests pass |

**Note on OAUTH-04 traceability:** `OAUTH-04` is referenced in the ROADMAP.md (line 274) as the requirement for Phase 79, but does NOT appear in `REQUIREMENTS.md`'s formal requirement list or traceability table. `REQUIREMENTS.md` covers v3.0 requirements (SPORT-*, CAL-*, PDF-*, BRIEF-*, PWA-*, CLI-*); OAUTH-04 is a v3.1 requirement not yet added to the formal registry. This is an orphaned requirement — the implementation exists and is correct, but the requirements document should be updated to include OAUTH-04 in the traceability table.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODOs, FIXMEs, placeholder comments, stub implementations, or empty returns found in the modified files. The DB upsert, JWT logic, and status read all have real implementations.

### Human Verification Required

#### 1. Real OAuth Round-Trip (Google Consent + Token Exchange + DB Write)

**Test:** From a browser, navigate to `GET /v1/auth/google`. Complete the Google consent screen selecting both calendar and Gmail permissions. Confirm the browser is redirected back to the PWA with `?google_connected=true`. Then query the database: `SELECT provider, scopes FROM oauth_tokens WHERE provider = 'google'`.
**Expected:** Row exists with `scopes` containing both `https://www.googleapis.com/auth/calendar.readonly` and `https://www.googleapis.com/auth/gmail.readonly`.
**Why human:** Unit tests inject DI mocks for `getTokenFn` and `dbUpsertFn` — the real Google token exchange (OAuth consent screen, actual scope grant, live DB write with real encrypted refresh token) requires a browser session and a real Google account.

#### 2. JWT State Survives Server Restart (Railway Rolling Deploy Simulation)

**Test:** Start `vigil-core` locally, hit `GET /v1/auth/google` to generate a state JWT, capture the `state` parameter from the redirect URL, restart the server process, then manually craft a callback request `GET /v1/auth/google/callback?code=...&state={captured_jwt}`.
**Expected:** The callback does NOT redirect with `google_error=invalid_state` — it proceeds to token exchange (or fails on the code if using a real Google code). The key outcome: state validation passes after restart because the secret is in env, not memory.
**Why human:** Testing rolling-deploy resilience requires a live server process restart. Automated unit tests cover the logic with DI; the process-restart scenario requires a live environment.

### Gaps Summary

No blocking gaps found. Three of four roadmap success criteria are fully verified in code and tests. SC4 (calling the Gmail API end-to-end) is cleanly deferred to Phase 80, which is explicitly designed to prove token functionality with live Gmail API calls.

Two items require human verification: the real OAuth round-trip and the Railway rolling-deploy state survival. These are environment and integration concerns that cannot be covered by unit tests.

The OAUTH-04 requirement is satisfied in implementation but is orphaned in REQUIREMENTS.md — the formal traceability table does not include it. This is a documentation gap, not a code gap.

---

_Verified: 2026-04-14T19:00:00Z_
_Verifier: Claude (gsd-verifier)_
