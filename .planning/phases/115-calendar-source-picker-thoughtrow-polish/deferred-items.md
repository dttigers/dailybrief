# Phase 115 — Deferred Items

## Pre-existing issues found during execution (NOT caused by Phase 115 changes)

### TS6305 stale .d.ts warnings in vigil-pwa (70 occurrences)

**Discovered during:** Plan 115-03, Task 1 verification (`npx tsc --noEmit`)
**Status:** Pre-existing — confirmed by stash-and-rerun (70 TS6305 before AND after the className change; 0 non-TS6305 errors).
**Cause:** Stale `.d.ts` and `.tsbuildinfo` artifacts from an earlier `tsc --build` (or vitest's emit step) sit alongside the source `.tsx`/`.ts` files in `vigil-pwa/src/`. Tsc's default include `**/*` picks them up and complains they weren't built from source.
**Why deferred:** Out of scope per `<scope_boundary>` — these warnings predate this plan, are unrelated to the single-line className change in `ThoughtRow.tsx:399`, and exist throughout `vigil-pwa/src/**` (every page/component/util has a stale `.d.ts`).
**Impact on Plan 115-03:** None. Tsc still exits non-zero (because of TS6305), but no real type errors exist for the modified file. Verification ran via `vitest` instead, which passed cleanly.
**Recommended fix (separate cleanup):** `cd vigil-pwa && find src -name '*.d.ts' -delete && rm -f tsconfig.tsbuildinfo` then re-run `npx tsc --noEmit` to confirm clean exit.

### Pre-existing failing SettingsPage test: `?google_error=invalid_state`

**Discovered during:** Plan 115-02, Task 3 verification (`npx vitest run src/pages/SettingsPage.test.tsx`)
**Status:** Pre-existing — confirmed: 16/17 baseline before any Plan 115-02 edits, 21/22 after Plan 115-02 (16 prior pass + 5 new CAL-01 tests pass; same 1 test still fails).
**Cause:** Unknown — the test asserts `findByText(/invalid_state/i)` but the SettingsPage maps `invalid_state` → "Connection attempt expired. Please try again." via the `GOOGLE_ERROR_MESSAGES` allowlist (line 23-29). The test appears to assert the raw code, but the live UI renders the mapped message. Likely the test was written before the WR-03 allowlist mapping was added and the test was never updated.
**Why deferred:** Out of scope per `<scope_boundary>` — pre-dates Plan 115-02 changes (api/client.ts + SettingsPage.tsx + SettingsPage.test.tsx CAL-01 additions only).
**Impact on Plan 115-02:** None. All 5 new CAL-01 tests pass, all 16 prior-passing tests continue to pass.
**Recommended fix (separate ticket):** Update the test to assert the user-visible mapped string `Connection attempt expired. Please try again.` instead of the raw `invalid_state` token.

### Pre-existing failing client.test.ts: `redirectToGoogleAuth sets window.location.href to /v1/auth/google`

**Discovered during:** Phase 115 regression gate (vigil-pwa full vitest run after all 3 plans complete)
**Status:** Pre-existing — broken by hotfix `1df403d fix(google-oauth): add POST /v1/auth/google/init for header-on-redirect bug (Phase 102 regression)` on 2026-04-26 (one day before Phase 115 started).
**Cause:** The hotfix made `redirectToGoogleAuth` async and routed through `POST /v1/auth/google/init` to attach the bearer Authorization header (Phase 102 server change moved `GET /v1/auth/google` behind bearerAuth). The unit test at `vigil-pwa/src/api/client.test.ts:56-66` still assumes a synchronous `window.location.href = '/v1/auth/google'` assignment — it never awaits, never mocks `vigilFetch`, and asserts the legacy URL. `vigilFetch` then sees `res === undefined` and throws `Cannot read properties of undefined (reading 'status')` from the unmocked fetch path.
**Why deferred:** Out of scope — this test broke at `1df403d` (2026-04-26), one day before Phase 115's first commit (`c03269a` 2026-04-27). Phase 115-02 only added new helpers to client.ts; it did not touch `redirectToGoogleAuth`.
**Impact on Phase 115:** None. 171/173 tests pass; the only two failures are this one and the `?google_error=invalid_state` test above, both pre-existing.
**Recommended fix (separate ticket):** Rewrite the test to (a) mock `vigilFetch` to return `{ ok: true, json: async () => ({ redirect_url: 'https://accounts.google.com/...' }) }`, (b) `await` the call, and (c) assert `window.location.href` matches the mocked `redirect_url`.
