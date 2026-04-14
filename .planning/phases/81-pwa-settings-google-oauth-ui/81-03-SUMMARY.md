---
phase: 81
plan: 03
subsystem: vigil-pwa
tags: [pwa, oauth, google, api-client, wave-1]
provides:
  - getGoogleStatus (vigil-pwa/src/api/client.ts)
  - disconnectGoogle (vigil-pwa/src/api/client.ts)
  - redirectToGoogleAuth (vigil-pwa/src/api/client.ts)
  - GoogleStatus interface
requires:
  - Phase 79 /v1/google/status endpoint (vigil-core)
  - Phase 79 DELETE /v1/google/tokens endpoint (vigil-core)
  - Phase 79 GET /v1/auth/google OAuth entry (vigil-core)
  - Plan 81-01 vitest harness + client.test.ts stub (merged separately)
affects:
  - vigil-pwa/src/api/client.ts
tech-stack:
  added:
    - vitest@^2
    - "@testing-library/react@^16"
    - "@testing-library/user-event@^14"
    - "@testing-library/jest-dom@^6"
    - "@testing-library/dom@^10"
    - jsdom@^25
  patterns:
    - "vigilFetch + bearer-from-localStorage (existing)"
    - "404 → null (disconnect) vs throw (error) differentiation"
    - "full-page redirect (window.location.href) — iOS PWA standalone safe"
key-files:
  created:
    - vigil-pwa/src/api/client.test.ts
    - vigil-pwa/vitest.config.ts
    - vigil-pwa/src/test/setup.ts
    - .planning/phases/81-pwa-settings-google-oauth-ui/81-03-SUMMARY.md
  modified:
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/package.json
    - vigil-pwa/package-lock.json
decisions:
  - "D-07: 404 from /v1/google/status → return null (disconnected), not throw"
  - "D-08 reconciliation: redirect URL is /v1/auth/google (mount point is /v1 per vigil-core/src/index.ts:72)"
metrics:
  tasks_completed: 1
  duration_minutes: ~8
  completed: 2026-04-13
---

# Phase 81 Plan 03: Google OAuth PWA API Client Methods — Summary

Three new exports in `vigil-pwa/src/api/client.ts` (`getGoogleStatus`,
`disconnectGoogle`, `redirectToGoogleAuth`) plus the `GoogleStatus` type
unblock SettingsPage (Plan 06) and GoogleStatusContext (Plan 04). All five
`client.test.ts` tests transition from red stubs (Plan 01) to green.

## What Shipped

- `getGoogleStatus(): Promise<GoogleStatus | null>` — hits `/v1/google/status`,
  returns `null` on 404 (D-07 / Pitfall 6: disconnected is not an error),
  throws on other non-ok responses, returns parsed JSON on 200.
- `disconnectGoogle(): Promise<void>` — issues `DELETE /v1/google/tokens`
  through the existing `vigilFetch` helper (bearer auth in Authorization
  header, never in query string — mitigates T-81-08).
- `redirectToGoogleAuth(): void` — full-page redirect to
  `${API_BASE}/v1/auth/google`. No popup (iOS PWA standalone safe — D-08).
  Function takes no input, so T-81-10 (EoP via attacker-controlled redirect)
  is structurally impossible.
- `interface GoogleStatus` — `{ calendar: 'connected' | 'needs_auth'; gmail: 'connected' | 'needs_auth'; email?: string }`.

All additions live at the bottom of `client.ts` in a new
"Google OAuth (Phase 81 Plan 03)" section, matching the file's existing
section-comment style.

## Tests

`vigil-pwa/src/api/client.test.ts` — 5 tests, all green:

1. `getGoogleStatus returns null on 404`
2. `getGoogleStatus returns parsed body on 200`
3. `getGoogleStatus throws on 500`
4. `disconnectGoogle calls DELETE /v1/google/tokens with bearer auth`
   (also asserts `Authorization: Bearer test-key` header is sent)
5. `redirectToGoogleAuth sets window.location.href to /v1/auth/google`

Run: `cd vigil-pwa && npx vitest run src/api/client.test.ts` → 5 passed.

## Commits

- `f0d90dd` feat(81-03): add Google OAuth client methods to PWA api client

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] vitest harness not yet merged from parallel Plan 01**

- **Found during:** Task 1 verification (parallel wave 1 execution)
- **Issue:** Plan 81-03 `depends_on: [81-01]`, but Plan 01 runs in a
  sibling worktree under parallel execution. This worktree started from
  the shared base `5e4d0cd` without vitest installed, so the verify step
  `npx vitest run src/api/client.test.ts` could not execute.
- **Fix:** Installed the same devDependencies Plan 01 specifies
  (`vitest@^2`, `@testing-library/react@^16`, `@testing-library/user-event@^14`,
  `@testing-library/jest-dom@^6`, `jsdom@^25`) and created
  `vitest.config.ts` + `src/test/setup.ts` using the exact content Plan 01
  prescribes. Both worktrees writing the same bytes means the orchestrator
  merge resolves as no-conflict identical content.
- **Files modified:** vigil-pwa/package.json, vigil-pwa/package-lock.json,
  vigil-pwa/vitest.config.ts, vigil-pwa/src/test/setup.ts
- **Commit:** f0d90dd

**2. [Rule 3 — Blocking] `@testing-library/dom` peer dep missing**

- **Found during:** first `vitest run` after installing RTL v16
- **Issue:** `@testing-library/react@16` declares `@testing-library/dom` as
  a **peer** dependency rather than a direct dep; npm v10 didn't auto-install
  it, so the first test run blew up with
  `Cannot find module '@testing-library/dom'`.
- **Fix:** `npm install -D @testing-library/dom@^10`.
- **Commit:** f0d90dd

**3. [Rule 3 — Blocking] jsdom 25 + vitest 2 leaves `localStorage` unusable**

- **Found during:** second `vitest run` — `TypeError: localStorage.setItem is not a function`
- **Issue:** Vitest emits a `--localstorage-file was provided without a
  valid path` warning and the resulting `localStorage` surface is a
  non-functional stub (no `setItem`/`getItem`/`removeItem`). Without a
  working `localStorage`, the test `beforeEach(() => localStorage.setItem('vigil_api_key', 'test-key'))`
  crashed every case. `vigilFetch` reads the bearer from `localStorage`,
  so every real code path depends on this working.
- **Fix:** Added a deterministic in-memory `Storage` shim in
  `src/test/setup.ts` that installs on both `globalThis` and `window`.
  Chose an in-memory polyfill over swapping to `happy-dom` because the
  entire PWA is already written against jsdom semantics and any
  environment swap would ripple to later Wave 1 / Wave 2 tests.
- **Files modified:** vigil-pwa/src/test/setup.ts
- **Commit:** f0d90dd

### Scope Note

Plan 01's canonical `src/test/setup.ts` is a minimal jest-dom import. The
version in this commit adds the localStorage shim on top. When the
parallel merge reconciles the two worktrees' setup files, the shim
**must be retained** — Wave 1 / Wave 2 tests that touch `getStoredKey()`
will fail without it. If Plan 01's executor wrote the minimal version
verbatim, the orchestrator should pick this plan's version on conflict.

## Known Stubs

None. Every new function has a concrete implementation wired to a real
vigil-core endpoint or a real `window.location` side-effect.

## Acceptance Criteria

- [x] `vigil-pwa/src/api/client.ts` exports `getGoogleStatus`,
      `disconnectGoogle`, `redirectToGoogleAuth`, and type `GoogleStatus`
      (verified: `grep -c "export (async )?function (getGoogleStatus|disconnectGoogle|redirectToGoogleAuth)" = 3`)
- [x] `getGoogleStatus` contains `if (res.status === 404) return null`
- [x] `disconnectGoogle` contains `method: 'DELETE'` and path `/v1/google/tokens`
- [x] `redirectToGoogleAuth` contains `window.location.href` and
      `/v1/auth/google` (NOT `/auth/google`)
- [x] URL consistency across plans: Plans 02, 03, 06 all agree on
      `/v1/auth/google`; no drift introduced
- [x] `npx vitest run src/api/client.test.ts` → 5 passed
- [x] No new TypeScript errors introduced (pre-existing repo errors in
      `BriefHistoryPage.tsx`, `main.tsx`, and `import.meta.env` typing are
      out of scope per the plan's scope boundary)

## Threat Flags

None — surface added (status fetch, token revoke, OAuth entry redirect)
is exactly what the plan's threat model already enumerates (T-81-08
through T-81-10), and each is mitigated structurally:

- **T-81-08** (API key in query string): mitigated by using existing
  `vigilFetch` helper — bearer stays in Authorization header.
- **T-81-09** (Status response spoofing): accepted — same-origin-via-bearer
  trust model is pre-existing, no new trust surface.
- **T-81-10** (EoP via redirect): mitigated — `redirectToGoogleAuth`
  takes zero parameters; the URL is a hardcoded template literal.

## Self-Check: PASSED

- FOUND: vigil-pwa/src/api/client.ts (modified — 3 new exports + type)
- FOUND: vigil-pwa/src/api/client.test.ts (created — 5 tests green)
- FOUND: vigil-pwa/vitest.config.ts (created)
- FOUND: vigil-pwa/src/test/setup.ts (created)
- FOUND: commit f0d90dd on branch worktree-agent-af375a43
- VERIFIED: `npx vitest run src/api/client.test.ts` → 5 passed
- VERIFIED: 3 exports present via grep
