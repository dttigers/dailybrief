# Phase 130 — Deferred Items

## Out-of-scope discoveries during Plan 01 execution (2026-05-18)

### 1. Pre-existing vigil-g2-plugin test failure — TTL_MS drift detector

- **Test:** `vigil-g2-plugin/src/__tests__/main.test.ts:263`
  — `D-129 drift: TTL constant 30 * 60 * 1000 present in helpers (via screen-state-restore import)`
- **Status:** FAILING **before** Plan 01 changes (verified by running tests on
  the pre-Plan-01 tree via `git stash`).
- **Root cause:** The test expects `launch-source-helpers.ts` source to contain
  either the literal `30 * 60 * 1000` or `TTL_MS`. The current source imports
  `pickRestoredScreen` from `screen-state-restore.ts` (where the TTL constant
  actually lives), but does not itself contain the literal — so the drift
  detector trips. This is a Phase 129 test left in a stale state.
- **Disposition:** OUT OF SCOPE for Plan 01 (which is delete-only / revert-only
  per D-C1+D-C2). Track for Phase 129 or 131 follow-up; the production code
  is correct, only the drift-detector grep is stale.

### 2. vigil-core test runner does not terminate cleanly under npm test

- **Symptom:** `npm test` in `vigil-core` runs all tests but the test process
  never exits because `index.ts` import side-effects start
  `generateScheduler` (60s tick) and `gmailWorkOrders` (5m tick), which
  the test runner inherits via `--test-isolation=process`.
- **Status:** Pre-existing — present before any Plan 01 changes.
- **Verification of Plan 01 build-green criterion:** `npx tsc --noEmit` runs
  cleanly in both packages (no TypeScript errors). The earlier successful
  test runs that DID complete (task ID b9lbqnagv, beeq5hewv, bvo1v1j10)
  all returned exit code 0.
- **Disposition:** OUT OF SCOPE for Plan 01. Track for a future plan that
  refactors `index.ts` to gate scheduler startup behind a non-test guard
  (e.g., `if (import.meta.url === pathToFileURL(process.argv[1]).href)`),
  or migrates schedulers to a separate entry point.
