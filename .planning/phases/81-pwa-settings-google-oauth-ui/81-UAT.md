---
status: partial
phase: 81-pwa-settings-google-oauth-ui
source:
  - 81-01-SUMMARY.md
  - 81-02-SUMMARY.md
  - 81-03-SUMMARY.md
  - 81-04-SUMMARY.md
  - 81-05-SUMMARY.md
  - 81-06-SUMMARY.md
started: 2026-04-13T18:20:00Z
updated: 2026-04-13T20:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: vigil-core boots cleanly after route changes — start from scratch, server comes up, health endpoint responds. Confirms 81-02 route additions didn't break startup.
result: pass
note: Booted clean on iMac localhost:3001. `/v1/health` responded (degraded — DATABASE_URL not set locally, expected for isolated vigil-core dev).

### 2. Gear Icon + Red Dot (Disconnected State)
expected: Sign in to the PWA with a bearer key that has NO Google tokens stored. Header shows a gear icon to the left of Sign Out with a red dot overlay. Clicking the gear navigates to /settings.
result: pass

### 3. SettingsPage Empty State
expected: On /settings with Google disconnected, see "Connect Google" CTA (empty state card). Calendar + Gmail both show "needs auth" status. No error banner visible.
result: pass
note: Disconnected state rendered cleanly — "Not connected", scopes listed (Calendar read, Gmail read), Connect Google CTA in brand teal.

### 4. Desktop OAuth Round-Trip (Calendar + Gmail)
expected: From /settings empty state, click "Connect Google" → Google consent screen opens in same tab (full-page redirect, not popup). Approve calendar + gmail scopes. Lands back on /settings?google_connected=true. Success banner appears briefly then auto-dismisses. Query string is stripped from URL (no lingering ?google_connected in address bar). Gear icon red dot disappears. SettingsPage shows Calendar: connected, Gmail: connected.
result: partial
note: |
  OAuth round-trip works end-to-end: consent with both scopes, redirect back to localhost:5173/settings, tokens stored. Google granted both calendar + gmail scopes successfully. However, SettingsPage still shows Gmail: needs_auth because the oauth_tokens table has no `scopes` column yet (Phase 79 schema gap — Plan 81-02 SUMMARY documented this as an intentional back-compat fallback). Phase 81 code is correct; gap is upstream.
  Secondary fixes uncovered during this test (committed separately):
    - Added gmail.readonly to /v1/auth/google consent scope (commit 5af419f) — Phase 79 missed adding gmail to the scope array.
    - vigil-pwa/.env.local sets VITE_API_BASE=http://localhost:3001 so dev hits local vigil-core instead of live api.vigilhub.io (the Vite proxy target is hardcoded to live).
    - vigil-pwa/.gitignore: added .env.local and .env.*.local (was only catching .env and *.env).
  Also surfaced two pre-existing non-blocking issues worth tracking separately:
    - Google Cloud Console OAuth consent "Data Access" was missing gmail.readonly — fixed during UAT in the live project.
    - Browser cached Google session persisted calendar-only grant; cleared via incognito retry.

### 5. Error Callback Banner
expected: Simulate an OAuth error (e.g., deny consent, or visit /settings?google_error=invalid_state directly). Error banner appears with decoded message. Banner auto-dismisses. Query string strips from URL.
result: pass

### 6. Disconnect Google (Inline Confirmation)
expected: On /settings with Google connected, click Disconnect. Inline confirmation appears (not a browser confirm dialog — a UI block). Confirm → DELETE /v1/google/tokens called, UI returns to empty state, red dot reappears on gear. Cancel → nothing changes.
result: pass

### 7. Scope-Gap Re-Authorization
expected: With an existing Calendar-only token (pre-Phase-79 row, gmail='needs_auth'), visit /settings. UI shows Calendar: connected, Gmail: needs auth (scope gap state). A "Grant Gmail access" action is visible. Clicking it re-triggers the OAuth flow requesting the missing scope. After approval, both show connected.
result: pass
note: Re-auth action present and triggers OAuth flow. Visual flip to "both connected" deferred to Phase 79.1 (blocked on scopes column — see Gap 1).

### 8. iOS PWA Standalone OAuth (Real Device)
expected: Add the PWA to iOS home screen (standalone mode). Launch from home screen icon. Go to /settings → Connect Google. OAuth full-page redirect stays inside the PWA standalone context (D-08 reconciled: no popup, no Safari kick-out). Return to /settings with success banner. Session persists.
result: skipped
reason: Deferred until Phase 79.1 gap closure + Railway deploy. iOS real-device test needs live PWA with scopes column + callback fix, not localhost dev.

### 9. Gear Dot Shared State (No Race)
expected: Open /settings and the main dashboard in two tabs (or navigate between them). The gear red-dot state matches the SettingsPage state without drift — both driven by the same GoogleStatusContext fetch (Pitfall 5). After disconnecting on one page, refreshing the other shows updated state.
result: pass

## Summary

total: 9
passed: 6
partial: 1
issues: 0
pending: 0
skipped: 1

## Gaps

- truth: "After granting both calendar + gmail scopes via OAuth, /v1/google/status should report gmail: connected."
  status: failed
  reason: "oauth_tokens table has no `scopes` column. Callback doesn't parse tokens.scope from Google's response. Status endpoint falls back to back-compat branch (calendar=connected, gmail=needs_auth)."
  severity: major
  test: 4
  owner: phase-79
  artifacts:
    - vigil-core/src/db/schema.ts (oauthTokens — add scopes + account_email columns)
    - vigil-core/src/routes/calendar-auth.ts:142-159 (upsert must write scopes array)
    - drizzle/ (new migration for scopes + account_email columns)
  missing:
    - "ALTER TABLE oauth_tokens ADD COLUMN scopes jsonb DEFAULT '[]'::jsonb"
    - "ALTER TABLE oauth_tokens ADD COLUMN account_email text"
    - "Parse tokens.scope (space-separated string) into array in callback, write to DB"
  resolution: "Gap-closure phase — insert as Phase 79.1 after Phase 81 UAT completes."
