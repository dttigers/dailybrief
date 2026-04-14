---
phase: 81-pwa-settings-google-oauth-ui
verified: 2026-04-14T20:30:00Z
status: verified
score: 5/5 must-haves verified
overrides_applied: 1
human_verification:
  - test: "iOS PWA standalone OAuth callback round-trip"
    status: PASSED
    result: "Connect/disconnect worked. Google consent completed and redirected back to Vigil inside PWA standalone shell (not Safari). 2026-04-14."
  - test: "Desktop OAuth callback round-trip end-to-end"
    status: PASSED
    result: "Verified by operator during Phase 79 live testing. Connected card shows both scope rows + email. 2026-04-14."
  - test: "Scope-gap re-authorization UX"
    status: PASSED
    result: "Verified on desktop — Gmail row shows needs re-authorization with Re-connect button; Calendar row stays green. 2026-04-14."
  - test: "Gear icon red-dot regression on real device"
    status: PASSED
    result: "Verified on desktop. Gear dot absent after connect, reappears after scope-gap and disconnect. 2026-04-14."
  - test: "iOS scope-gap injection"
    status: SKIPPED
    result: "Requires DB mutation not feasible from mobile. Desktop scope-gap test (same code path) already verified — skipping iOS-specific repeat."
---

# Phase 81: PWA Settings + Google OAuth UI Verification Report

**Phase Goal:** Users can connect and disconnect their Google account from the PWA Settings page, see per-scope authorization status, and trigger OAuth re-authorization when gmail scope is missing.

**Verified:** 2026-04-13T18:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "Connect Google" button when no token stored (empty state) | ✓ VERIFIED | `SettingsPage.tsx:230-240` renders "Connect Google" button when `isEmpty=true` (status===null). Test `SettingsPage.test.tsx › empty › renders Connect Google button when status is null (404)` GREEN. |
| 2 | After connect, page shows "Connected" with authorized scopes listed | ✓ VERIFIED | `SettingsPage.tsx` renders `ScopeRow` per scope w/ green dot (`bg-teal-500`) when `state==='connected'`. `aria-label='Calendar connected'` / `'Gmail connected'`. Test `connected › renders both scope rows as connected` GREEN. |
| 3 | Disconnect button removes stored token + immediately updates UI | ✓ VERIFIED | Inline-confirm pattern: `setConfirming(true)` → Confirm → `disconnectGoogle()` → `refetch()`. Server: `DELETE /v1/google/tokens` deletes `provider='google'` row (calendar-auth.ts). Test `disconnect › inline confirm: Disconnect → Confirm calls disconnectGoogle()` GREEN (asserts DELETE call). |
| 4 | Scope gap (calendar OK, gmail missing) shows "Gmail: needs re-authorization" + re-connect, calendar unaffected | ✓ VERIFIED | `ScopeRow` renders "needs re-authorization" + Re-connect button when `state==='needs_auth'`. Test `scope gap › renders Re-connect button on Gmail row when gmail=needs_auth` asserts exactly 1 Re-connect button (Calendar row unchanged). Server back-compat in calendar-auth.ts handles pre-Phase-79 rows. |
| 5 | OAuth callback redirects cleanly to PWA Settings on desktop AND iOS standalone | ⚠ PARTIAL (server side verified; live device test deferred to human) | Server: `calendar-auth.ts` 6 redirects target `${pwaBase}/settings?google_(connected\|error)=...` w/ trailing-slash normalization. PWA: `useEffect` reads `searchParams`, sets banner, calls `history.replaceState` once. **iOS standalone behavior cannot be JSDOM-tested** → routed to human verification. |

**Score:** 5/5 truths VERIFIED at code level. SC#5 iOS-standalone confirmation requires real device — see human_verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-pwa/vitest.config.ts` | jsdom test config | ✓ VERIFIED | Exists, jsdom env + setupFiles |
| `vigil-pwa/src/test/setup.ts` | jest-dom matchers + localStorage shim | ✓ VERIFIED | Exists; localStorage polyfill prevents Node 24 native shadow |
| `vigil-pwa/src/api/client.ts` | getGoogleStatus, disconnectGoogle, redirectToGoogleAuth, GoogleStatus | ✓ VERIFIED | Lines 457-495; 4 exports present, 404→null, DELETE method, /v1/auth/google URL |
| `vigil-pwa/src/hooks/GoogleStatusContext.tsx` | Provider + hook w/ refetch | ✓ VERIFIED | 73 lines; useEffect with cancelled flag; status/isLoading/error/refetch contract |
| `vigil-pwa/src/hooks/useGoogleStatus.ts` | Re-export | ✓ VERIFIED | Exists |
| `vigil-pwa/src/components/Layout.tsx` | Gear icon + status dot reading shared context | ✓ VERIFIED | 101 lines; `to="/settings"`, `data-testid="google-status-dot"`, `needsAttention` derived from useGoogleStatus(). Sign Out preserved. Zero `react-router-dom`. |
| `vigil-pwa/src/pages/SettingsPage.tsx` | All 4 states + callback + inline disconnect + banner | ✓ VERIFIED | 213 lines (>100 floor); all required APIs present; no window.confirm; no dangerouslySetInnerHTML |
| `vigil-pwa/src/App.tsx` | /settings route inside GoogleStatusProvider | ✓ VERIFIED | GoogleStatusProvider wraps Routes (lines 39, 53); Route path="/settings" at line 50 |
| `vigil-core/src/routes/calendar-auth.ts` | DELETE /google/tokens + GET /google/status + /settings redirects | ✓ VERIFIED | 247 lines; both endpoints present; 6 occurrences of `/settings?google_(connected\|error)`; zero `calendar_error`; back-compat for pre-Phase-79 rows |
| `vigil-pwa/src/api/client.test.ts` | 5 client tests | ✓ VERIFIED | 5/5 GREEN |
| `vigil-pwa/src/components/Layout.test.tsx` | 3 gear tests | ✓ VERIFIED | 3/3 GREEN |
| `vigil-pwa/src/hooks/useGoogleStatus.test.tsx` | 4 hook tests | ✓ VERIFIED | 4/4 GREEN |
| `vigil-pwa/src/pages/SettingsPage.test.tsx` | 6 page tests | ✓ VERIFIED | 6/6 GREEN |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| Server OAuth callback | PWA /settings route | `c.redirect(\`${pwaBase}/settings?google_(connected\|error)=...\`)` | ✓ WIRED | 6 redirect sites in calendar-auth.ts |
| `DELETE /v1/google/tokens` | oauthTokens table | `db.delete(oauthTokens).where(eq(provider, 'google'))` | ✓ WIRED | calendar-auth.ts factory; bearer-auth gated (index.ts:77 bypass excludes /v1/google/*) |
| `getGoogleStatus` | `/v1/google/status` | vigilFetch w/ bearer | ✓ WIRED | client.ts:471; 404→null path verified by test |
| `disconnectGoogle` | `/v1/google/tokens` | vigilFetch DELETE | ✓ WIRED | client.ts:481; method:'DELETE' verified by test |
| `redirectToGoogleAuth` | `${API_BASE}/v1/auth/google` | window.location.href | ✓ WIRED | client.ts:494; URL consistent across plans 02/03/06 |
| App.tsx authenticated branch | GoogleStatusProvider | wraps `<Layout>` | ✓ WIRED | App.tsx:39-53 |
| useGoogleStatus hook | getGoogleStatus from api/client | useEffect + cancelled flag | ✓ WIRED | GoogleStatusContext.tsx |
| Layout gear `<Link>` | useGoogleStatus context | `needsAttention` derived from status | ✓ WIRED | Layout.tsx |
| SettingsPage mount | useSearchParams + history.replaceState | useEffect [] reads params, strips query | ✓ WIRED | SettingsPage.tsx; verified by `callback › ... replaceState` test |
| Connect button click | redirectToGoogleAuth | full-page redirect | ✓ WIRED | SettingsPage.tsx handleConnect |
| Disconnect confirmed | refetch() + status update | disconnectGoogle() then refetch() | ✓ WIRED | SettingsPage.tsx handleConfirmDisconnect |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| SettingsPage card states | `status` from useGoogleStatus | `getGoogleStatus()` → `vigilFetch('/v1/google/status')` → DB query in calendar-auth.ts | Yes (DB-backed: `db.select().from(oauthTokens).where(eq(provider,'google'))`) | ✓ FLOWING |
| Layout red dot | `status` from useGoogleStatus | Same shared context (Pitfall 5 mitigated — single fetch) | Yes | ✓ FLOWING |
| Banner text | `searchParams` from URL | Server callback redirect populates query string | Yes | ✓ FLOWING |
| ScopeRow state | `status.calendar` / `status.gmail` | Status endpoint scope mapping (with Phase-79 back-compat branch) | Yes (interim: calendar='connected', gmail='needs_auth' until Phase 79 writes scopes) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| PWA test suite green | `cd vigil-pwa && npx vitest run` | 4 files, 18/18 tests passed | ✓ PASS |
| vigil-core test suite green (per SUMMARY 02) | `cd vigil-core && npm test` | 122/122 passed (per Plan 02 summary) | ✓ PASS (reported by user, plan SUMMARY 02 confirms) |
| PWA build clean | `cd vigil-pwa && npm run build` | 306 kB bundle, clean (per user verification) | ✓ PASS |
| No `react-router-dom` leakage in src | grep across vigil-pwa/src | 0 hits | ✓ PASS |
| No `window.confirm` / `dangerouslySetInnerHTML` in SettingsPage | grep | 0 hits | ✓ PASS |
| `calendar_error` removed from server routes | grep vigil-core/src/routes | 0 hits | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| OAUTH-01 | 81-01, 81-02, 81-03, 81-06 | User can connect Google account from PWA Settings (gmail.readonly + calendar.readonly) | ✓ SATISFIED | SettingsPage Connect button → redirectToGoogleAuth → /v1/auth/google. Note: gmail.readonly scope expansion is Phase 79's responsibility; Phase 81 wires the UI surface and depends on scope writer. Status endpoint back-compat reports calendar=connected on existing rows. |
| OAUTH-02 | 81-01, 81-02, 81-03, 81-06 | User can disconnect Google account | ✓ SATISFIED | DELETE /v1/google/tokens (calendar-auth.ts) + inline-confirm Disconnect (SettingsPage.tsx) + refetch on success. Test asserts DELETE call fires. |
| OAUTH-03 | 81-01, 81-03, 81-04, 81-05, 81-06 | PWA displays Google connection status (connected, needs re-auth, disconnected) | ✓ SATISFIED | 4-state matrix in SettingsPage (empty/connected/scope-gap/loading-error) + gear red dot in Layout for at-a-glance surfacing. Shared context prevents fetch drift (Pitfall 5). |

All 3 requirement IDs accounted for; no orphaned requirements for Phase 81.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none in scope) | — | — | — | — |

No TODO/FIXME/placeholder/stub patterns introduced. Pre-existing TS errors in unrelated files (BriefHistoryPage, main.tsx, import.meta.env typing, stale .d.ts artifacts) are out of scope per multiple SUMMARY notes — not Phase 81 regressions.

### Human Verification Required

See frontmatter `human_verification` block. Four items require real-device or live-OAuth testing:

1. **iOS PWA standalone OAuth callback round-trip** — SC#5 explicitly references iOS standalone mode; cannot be JSDOM-tested.
2. **Desktop OAuth callback round-trip end-to-end** — Live Google consent + redirect URI registration cannot be programmatically faked.
3. **Scope-gap re-authorization UX** — SC#4 visible behavior; requires DB mutation + brief generation regression check.
4. **Gear icon red-dot regression on real device** — Visual/positional verification on actual viewport.

### Gaps Summary

No code-level gaps. All 5 ROADMAP success criteria are satisfied at the implementation, test, and key-link levels:

- All 4 PWA test files green (18/18) — empty / connected / scope-gap / disconnect / callback paths covered.
- vigil-core 122/122 green per Plan 02 SUMMARY (server redirect + DELETE + status endpoints).
- Build clean (306 kB bundle).
- All 3 requirement IDs (OAUTH-01/02/03) implemented and traceable to plans.
- All 11 key links verified at the source level.
- Data flows DB → API → context → UI for both Layout dot and SettingsPage card with single shared fetch (Pitfall 5 mitigated).

**Status is `human_needed` (not `passed`)** because SC#5 iOS-standalone behavior, live OAuth handshake, scope-gap re-auth UX, and visual gear-dot regression all require real-device / operator verification before declaring goal achieved. Code-level evidence is complete; the OAuth flow itself is trust-boundary-traversing and demands a human round-trip.

---

_Verified: 2026-04-13T18:15:00Z_
_Verifier: Claude (gsd-verifier)_
