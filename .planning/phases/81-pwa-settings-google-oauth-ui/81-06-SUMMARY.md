---
phase: 81
plan: 06
subsystem: pwa
tags: [pwa, oauth, google, settings, ui, react-router-v7]
wave: 2
depends_on: [81-04]
requires:
  - vigil-pwa/src/hooks/useGoogleStatus.ts (Plan 04)
  - vigil-pwa/src/hooks/GoogleStatusContext.tsx (Plan 04)
  - vigil-pwa/src/api/client.ts — getGoogleStatus, disconnectGoogle, redirectToGoogleAuth, GoogleStatus (Plan 03)
  - vigil-pwa/src/pages/SettingsPage.test.tsx — red stub (Plan 01)
  - vigil-core redirect target /settings?google_connected=true (Plan 02)
provides:
  - /settings route in authenticated PWA
  - Google integration card covering empty/connected/scope-gap states
  - Inline disconnect confirmation UX
  - OAuth callback banner + URL strip
affects:
  - vigil-pwa/src/App.tsx (route registration)
tech_stack:
  added: []
  patterns:
    - useSearchParams + history.replaceState once on mount (Pattern 2)
    - Inline confirm state machine (no modal, no window.confirm)
    - Auto-dismissing banner via setTimeout + cleanup (no toast lib dep)
key_files:
  created:
    - vigil-pwa/src/pages/SettingsPage.tsx
  modified:
    - vigil-pwa/src/pages/SettingsPage.test.tsx (stubs flipped to real tests)
    - vigil-pwa/src/App.tsx (route registered)
decisions:
  - Bundled TDD RED + GREEN into a single Task 1 as plan specified (test rewrite + implementation co-dependent)
  - Rendered `google_error` as React text node (auto-escaped) instead of any HTML path — XSS mitigation for T-81-15
  - Used `data-testid="scope-dot-{calendar|gmail}"` so tests can disambiguate scope rows without brittle text matching
metrics:
  completed: 2026-04-13
  duration_minutes: ~8
  tasks_total: 1
  tasks_completed: 1
  files_created: 1
  files_modified: 2
  tests_added: 6
---

# Phase 81 Plan 06: SettingsPage Implementation Summary

Google OAuth integration Settings page landing all four states (empty, connected, scope gap, loading/error) with inline disconnect, callback query-param handling, and auto-dismissing banner — wired into `/settings` via the authenticated App.tsx Routes block.

## What Shipped

- **SettingsPage.tsx** (~200 lines): card-based UI with per-scope rows (Calendar, Gmail), green/red status dots, per-row Re-connect buttons when a scope needs re-auth, inline-confirm Disconnect pattern (first click flips button to Confirm/Cancel pair — no modal, no `window.confirm`), loading/error inline copy, and scope fine-print + primary "Connect Google" button in empty state.
- **Callback param handling:** mount-only `useEffect` reads `google_connected=true` or `google_error=...`, triggers banner + `refetch()` on success / decoded error message on failure, then calls `history.replaceState({}, '', location.pathname)` exactly once to prevent reload replay (D-11, Pitfall 4).
- **Banner:** styled after OfflineBanner (Tailwind teal for success, red for error), auto-dismisses after 5s via `setTimeout` with cleanup, manual dismiss via `×` button, ARIA `role="alert"` — no new npm dep (D-12).
- **Route wiring:** `<Route path="/settings" element={<SettingsPage />} />` added inside the `GoogleStatusProvider`-wrapped authenticated `<Routes>` block in App.tsx.
- **Tests:** `SettingsPage.test.tsx` stubs flipped to 6 real tests (empty, connected, scope gap, disconnect inline-confirm, callback success, callback error) — all green.

## Commits

| Hash     | Type | Message                                                                 |
| -------- | ---- | ----------------------------------------------------------------------- |
| 8a749a1  | test | test(81-06): flip SettingsPage test stubs to real failing tests         |
| b34b13a  | feat | feat(81-06): add SettingsPage with Google OAuth UI + callback handling  |

## Verification Results

| Gate                                                             | Result |
| ---------------------------------------------------------------- | ------ |
| `npx vitest run src/pages/SettingsPage.test.tsx`                 | PASS — 6/6 tests green |
| `grep path="/settings" src/App.tsx`                              | PASS — route registered |
| `grep react-router-dom src/{App.tsx,pages/SettingsPage.tsx}`     | PASS — zero hits |
| `grep window.confirm\|dangerouslySetInnerHTML SettingsPage.tsx`  | PASS — only found in code comments explicitly noting their absence |
| `grep history.replaceState SettingsPage.tsx`                     | PASS |
| `grep redirectToGoogleAuth SettingsPage.tsx`                     | PASS |
| `grep disconnectGoogle SettingsPage.tsx`                         | PASS |
| `npm run build` (vigil-pwa)                                      | PASS — 59 modules, 304.98 kB bundle, PWA precache generated |

## Success Criteria (Phase 81 ROADMAP)

1. ✓ "Connect Google" button when no token (empty state)
2. ✓ After connect, page shows connected account + per-scope rows with green dots
3. ✓ Disconnect button removes token (DELETE /v1/google/tokens) + refetch updates UI
4. ✓ Scope gap (calendar-only) shows Gmail "needs re-authorization" + per-row Re-connect
5. ✓ Callback lands on /settings and banner + URL strip work (manual iOS E2E is separate, Plan 02 shipped the server redirect)

**Requirements:** OAUTH-01, OAUTH-02, OAUTH-03 — satisfied.

## Deviations from Plan

None — plan executed exactly as written.

The plan nominally splits into "TDD RED" then "TDD GREEN" but is authored as a single Task 1 that produces both. I commit-split anyway (RED → GREEN) to keep the TDD trail intact, matching the intent of `tdd="true"`.

## Deferred / Out of Scope

- **Layout.test.tsx failures** (3 tests: "gear dot for null status / needs_auth / connected") — these are Plan 05's territory (gear icon in Layout). Wave-2 context explicitly instructed NOT to touch Layout.tsx. Plan 05 will flip these green.
- **Pre-existing TSC6305 warnings** from stale composite-build declaration files surface when running `tsc --noEmit` against the root tsconfig (no `include`, so `**/*` picks up build artifacts). This is a repo-wide build-config issue unrelated to Plan 06. `npm run build` is clean. Not in Plan 06 scope — logging here for visibility only.

## Known Stubs

None — every rendered element has a real data source (status via context, email from status payload, scope state from payload, banner from URL params, disconnect call hits real API client).

## Threat Flags

None — the surface introduced (one new route, one new DELETE call via existing `disconnectGoogle` helper, one new read of URL params) is fully covered by the plan's existing `<threat_model>` (T-81-15 through T-81-20). All mitigations verified:

- T-81-15 (XSS via google_error): `decodeURIComponent` → React text node; no `dangerouslySetInnerHTML` (grep-verified)
- T-81-17 (callback replay): `history.replaceState` on mount
- T-81-18 (CSRF on disconnect): uses bearer-token `vigilFetch` helper, not cookie-based

## Self-Check: PASSED

**Files:**
- FOUND: vigil-pwa/src/pages/SettingsPage.tsx
- FOUND: vigil-pwa/src/pages/SettingsPage.test.tsx (flipped)
- FOUND: vigil-pwa/src/App.tsx (route registered — verified via `grep 'path="/settings"'`)

**Commits:**
- FOUND: 8a749a1 (test stubs flipped)
- FOUND: b34b13a (feat SettingsPage + route)

**Tests:** 6/6 SettingsPage tests green. `npm run build` clean.
