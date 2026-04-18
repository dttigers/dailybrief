# Phase 100 Deferred Items

## Pre-existing test failure (out of scope)

**File:** `vigil-pwa/src/pages/SettingsPage.test.tsx`
**Test:** `renders invalid_state error from callback redirect`
**Line:** 104 — `expect(await screen.findByText(/invalid_state/i))...`
**Status:** Fails on main BEFORE Phase 100 changes (verified via git stash).
**Impact:** None to Phase 100 — failure is in unrelated OAuth callback error-display logic.
**Action:** Not fixed in this phase (SCOPE BOUNDARY). Should be addressed in a dedicated
Settings page test-fix phase.

## Pre-existing tsc --noEmit errors (out of scope)

`npx tsc --noEmit` emits TS6305 errors for stale `.d.ts` files across src/ — the project
committed build output alongside source, and tsc flags the duplication. These are
repo-hygiene issues unrelated to Phase 100 logic.

**Verification that Phase 100 source is type-clean:**
- `useThoughts.ts` and the new test file compile cleanly when checked alone:
  `npx tsc --noEmit -p . --skipLibCheck` still reports only the pre-existing TS6305s;
  no new errors introduced by this phase.
- `npm run build` succeeds (see SUMMARY).
