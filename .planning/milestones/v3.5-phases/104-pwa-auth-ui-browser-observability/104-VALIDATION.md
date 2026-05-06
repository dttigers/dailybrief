---
phase: 104
slug: pwa-auth-ui-browser-observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 104 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 + @testing-library/react 16.3.2 |
| **Config file** | `vigil-pwa/vitest.config.ts` |
| **Quick run command** | `cd vigil-pwa && npm test` |
| **Full suite command** | `cd vigil-pwa && npm test` |
| **Estimated runtime** | ~15 seconds |

**Baseline:** 1 failing test pre-existing (SettingsPage `invalid_state` banner — unrelated to Phase 104), 108 passing. Accepted as known failure for phase gate.

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-pwa && npm test`
- **After every plan wave:** Run `cd vigil-pwa && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (1 pre-existing failure accepted)
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 104-01-01 | 01 | 1 | AUTH-06/07 | T-104-01 | `getStoredKey()` reads sessionStorage `vigil_jwt`, NOT localStorage | unit | `cd vigil-pwa && npm test` | ❌ W0: update `client.test.ts` | ⬜ pending |
| 104-01-02 | 01 | 1 | AUTH-06/07 | T-104-01 | `clearKey()` removes `vigil_jwt` from sessionStorage AND `vigil_api_key` from localStorage | unit | `cd vigil-pwa && npm test` | ❌ W0: update `client.test.ts` | ⬜ pending |
| 104-01-03 | 01 | 1 | AUTH-06/07 | — | Existing tests that use `localStorage.setItem('vigil_api_key', ...)` updated to `sessionStorage.setItem('vigil_jwt', ...)` | unit | `cd vigil-pwa && npm test` | ❌ W0: update 3 test files | ⬜ pending |
| 104-02-01 | 02 | 1 | AUTH-07 | T-104-02 | Login form submits `{ email, password }` to `POST /v1/auth/login`, stores JWT in sessionStorage, redirects to `/` | unit | `cd vigil-pwa && npm test` | ❌ W0: `AuthPage.test.tsx` | ⬜ pending |
| 104-02-02 | 02 | 1 | AUTH-06 | T-104-02 | Signup form calls register then login (two-step), stores JWT, redirects to `/` | unit | `cd vigil-pwa && npm test` | ❌ W0: `AuthPage.test.tsx` | ⬜ pending |
| 104-02-03 | 02 | 1 | AUTH-06/07 | T-104-03 | Wrong credentials show identical generic error for all 4xx — no user enumeration | unit | `cd vigil-pwa && npm test` | ❌ W0: `AuthPage.test.tsx` | ⬜ pending |
| 104-03-01 | 03 | 2 | ANLY-01 | T-104-04 | `captureException` no-ops when `ph` is null (key absent in dev) | unit | `cd vigil-pwa && npm test` | ❌ W0: `posthog.test.ts` | ⬜ pending |
| 104-03-02 | 03 | 2 | ANLY-01 | T-104-04 | `ErrorBoundary.componentDidCatch` calls `captureException(error, { boundary: 'root' })` | unit | `cd vigil-pwa && npm test` | ❌ W0: `ErrorBoundary.test.tsx` | ⬜ pending |
| 104-03-03 | 03 | 2 | ANLY-01 | — | posthog module imported in main.tsx before React renders (side-effect import ordering) | manual | Read `vigil-pwa/src/main.tsx` — `./analytics/posthog` import appears before `createRoot` call | N/A | ⬜ pending |
| 104-04-01 | 04 | 2 | AUTH-07 | — | SettingsPage "Vigil Account" section calls `GET /v1/me`, displays email as `text-gray-400 text-sm` | unit | `cd vigil-pwa && npm test` | ❌ W0: update `SettingsPage.test.tsx` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-pwa/src/test/setup.ts` — add `sessionStorage` memory shim alongside existing `localStorage` shim (reuse `createMemoryStorage()`)
- [ ] `vigil-pwa/src/api/client.test.ts` — migrate `localStorage.setItem('vigil_api_key', 'test-key')` → `sessionStorage.setItem('vigil_jwt', 'test-key')`
- [ ] `vigil-pwa/src/hooks/useGoogleStatus.test.tsx` — update stubbed Map key from `vigil_api_key` to `vigil_jwt` (sessionStorage)
- [ ] `vigil-pwa/src/pages/SettingsPage.test.tsx` — update auth setup to `sessionStorage.setItem('vigil_jwt', ...)`
- [ ] `vigil-pwa/src/pages/AuthPage.test.tsx` — NEW: stubs for AUTH-06 + AUTH-07 login/signup form behavior
- [ ] `vigil-pwa/src/components/ErrorBoundary.test.tsx` — NEW: stubs for ANLY-01 boundary capture
- [ ] `vigil-pwa/src/analytics/posthog.test.ts` — NEW: stubs for captureException null-guard + identifyUser null-guard

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| JWT stored in sessionStorage, not localStorage | SC#5 | DevTools visual verification — not easily unit-testable in jsdom | Open DevTools → Application → Session Storage → check `vigil_jwt` present; Local Storage → no `vigil_jwt` |
| React render errors appear in PostHog | SC#4 | Requires live PostHog Cloud connection | Temporarily add `throw new Error('test')` in App.tsx render, reload, check PostHog dashboard for event |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
