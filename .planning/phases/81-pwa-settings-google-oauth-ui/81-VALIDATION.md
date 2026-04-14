---
phase: 81
slug: pwa-settings-google-oauth-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 81 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (to be installed in Wave 0 — no test framework in vigil-pwa yet) |
| **Config file** | `vigil-pwa/vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `cd vigil-pwa && npx vitest run --reporter=dot` |
| **Full suite command** | `cd vigil-pwa && npx vitest run` |
| **Estimated runtime** | ~10 seconds (small component/unit suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-pwa && npx vitest run --reporter=dot`
- **After every plan wave:** Run `cd vigil-pwa && npx vitest run` + `cd vigil-pwa && npx tsc --noEmit` + `cd vigil-pwa && npm run build`
- **Before `/gsd-verify-work`:** Full suite + manual iOS PWA checklist items must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD — planner fills | — | 0 | — | — | Wave 0 installs vitest + RTL | infra | `cd vigil-pwa && npx vitest --version` | ❌ W0 | ⬜ pending |
| TBD | API client | — | OAUTH-01/02/03 | — | Status/disconnect methods return typed shapes and handle 404 as empty | unit | `npx vitest run src/api/client.test.ts` | ❌ W0 | ⬜ pending |
| TBD | SettingsPage empty state | — | OAUTH-01 | — | "Connect Google" CTA renders when no token | component | `npx vitest run src/pages/SettingsPage.test.tsx -t "empty"` | ❌ W0 | ⬜ pending |
| TBD | SettingsPage connected | — | OAUTH-03 | — | Both scope rows render "connected" when status = {calendar:'connected', gmail:'connected'} | component | `npx vitest run src/pages/SettingsPage.test.tsx -t "connected"` | ❌ W0 | ⬜ pending |
| TBD | SettingsPage scope gap | — | OAUTH-03 | — | Gmail row shows "needs re-authorization" + re-connect button without breaking calendar row | component | `npx vitest run src/pages/SettingsPage.test.tsx -t "scope gap"` | ❌ W0 | ⬜ pending |
| TBD | SettingsPage disconnect | — | OAUTH-02 | — | Inline confirm → confirm click calls `disconnectGoogle()` → UI flips to empty state | component | `npx vitest run src/pages/SettingsPage.test.tsx -t "disconnect"` | ❌ W0 | ⬜ pending |
| TBD | SettingsPage callback banner | — | OAUTH-01 | — | `?google_connected=true` → success banner + replaceState strips param; `?google_error=X` → error banner | component | `npx vitest run src/pages/SettingsPage.test.tsx -t "callback"` | ❌ W0 | ⬜ pending |
| TBD | Layout gear icon | — | OAUTH-03 | — | Status dot renders red when any scope is needs_auth or no token | component | `npx vitest run src/components/Layout.test.tsx -t "gear"` | ❌ W0 | ⬜ pending |
| TBD | Server callback redirect | — | OAUTH-01 | — | calendar-auth.ts redirects to `${PWA_URL}/settings?google_connected=true` (success) and `${PWA_URL}/settings?google_error=...` (error) | unit | `cd vigil-core && npm test -- calendar-auth` (or grep check if no test present) | ✅ (server has tests) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-pwa/package.json` — install `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` as devDependencies
- [ ] `vigil-pwa/vitest.config.ts` — jsdom environment + setup file
- [ ] `vigil-pwa/src/test/setup.ts` — `@testing-library/jest-dom` extend-expect + fetch mock shim
- [ ] `vigil-pwa/package.json` — add `"test": "vitest run"` and `"test:watch": "vitest"` scripts
- [ ] Planner may stub test files before implementation so Wave 1 tasks start ❌ red and flip ✅ green as work lands.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS standalone PWA OAuth round-trip | OAUTH-01 | Safari standalone mode + Apple auth quirks not reproducible in jsdom | 1) Add PWA to Home Screen on iOS device. 2) Open Settings. 3) Tap "Connect Google". 4) Complete consent on both scopes. 5) Confirm redirect lands on `/settings` inside the standalone shell (not Safari). 6) Verify both scope rows = connected, banner auto-dismisses. |
| Desktop callback redirect | OAUTH-01 | Cross-browser Chrome/Safari behavior differs from Node test env | Click Connect in Chrome desktop → complete consent → land on `/settings?google_connected=true` → banner shows → reload page → banner does NOT reappear (replaceState worked). |
| Stored API key survives OAuth round-trip | OAUTH-01 | localStorage persistence across full-page redirect is environment-dependent | Note API key in devtools before Connect click; after return, confirm key still in localStorage and next request succeeds. |
| Red status dot visibility | OAUTH-03 | Visual contrast + accessibility cannot be grep-verified | Disconnect → reload header → red dot visible on gear icon at desktop + mobile widths. |
| Service worker not serving stale bundle | — | SW caching behavior is runtime-only | After deploy, hard-reload once; confirm new `/settings` route is reachable without a manual cache clear. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (vitest install)
- [ ] No watch-mode flags (using `vitest run`, not `vitest`)
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter once planner fills Task IDs

**Approval:** pending
