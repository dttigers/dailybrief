# Phase 110 — Deferred Items

Out-of-scope issues discovered during Plan 110-03 execution. Not fixed per
scope-boundary rule (only auto-fix issues directly caused by the current
plan's changes).

## Pre-existing SettingsPage.test.tsx failure

- **File:** `vigil-pwa/src/pages/SettingsPage.test.tsx:104`
- **Test:** `SettingsPage > callback > shows error banner with decoded message when ?google_error=invalid_state`
- **Failure:** `Unable to find an element with the text: /invalid_state/i`
- **Root cause:** `SettingsPage.tsx` maps the raw OAuth error code `invalid_state` to the
  user-friendly string `"Connection attempt expired. Please try again."` via the
  WR-03 `GOOGLE_ERROR_MESSAGES` allowlist. The test asserts the raw code string is
  rendered, but the implementation intentionally replaces it. The test is broken
  against the current implementation — not caused by Plan 110-03.
- **Confirmed pre-existing:** `git stash` + `npm test -- SettingsPage.test.tsx` on
  `main` (after commit `4c93cfc` but with Plan 110-03 Task 2 stashed) still fails
  with the same error.
- **Suggested fix (for a future plan):** Update the assertion to
  `screen.findByText(/Connection attempt expired/i)` to match the WR-03
  mapping. This is purely a test-expectation fix — the implementation is correct
  and intentional (prevents UI phishing via crafted redirect params).
