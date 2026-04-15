
## Pre-existing test failure (discovered during 86-03)

**File:** `vigil-pwa/src/pages/SettingsPage.test.tsx` (line 104)
**Test:** "shows error banner with decoded message when ?google_error=invalid_state"
**Issue:** Asserts `findByText(/invalid_state/i)` but SettingsPage uses `GOOGLE_ERROR_MESSAGES` lookup which maps `invalid_state` → "Connection attempt expired. Please try again." (no raw code in rendered text).
**Status:** Pre-existing — reproduces on clean HEAD without 86-03 changes. Out of scope per Rule: Scope Boundary. 5/6 tests pass.
**Fix direction:** Either assert against the mapped message ("Connection attempt expired") or loosen to `/connection attempt/i`.
