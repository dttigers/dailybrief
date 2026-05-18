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

### 3. Pre-existing ai-budget Test 6 ("secondary assertion") needs DATABASE_URL

- **Test:** `vigil-core/src/lib/ai-budget.test.ts` —
  `withBudgetTracking accumulator failure is non-fatal > secondary assertion: console.error captures 'withBudgetTracking accumulator failed' string when accumulator path throws`
- **Status:** FAILING **before** Plan 02 changes (verified via `git stash`
  on the pre-Task-3 tree — captured the same `AssertionError [ERR_ASSERTION]:
  console.error must be called with 'withBudgetTracking accumulator failed'
  sentinel (captured calls: [])`).
- **Root cause:** Test was authored in Phase 127 Plan 05 Task 3 with the
  comment "the dev DATABASE_URL is set, so db IS bound." Under `npm test`
  (which does NOT pass `--env-file=.env`), `db === null` and the
  accumulator INSERT path short-circuits before throwing — so the catch
  + console.error sentinel never fires.
- **Why this is a real bug in the test, not the production code:** the
  production code's `if (usd > 0 && db) { ... } catch ... console.error`
  shape is correct — it's deliberately a no-op when db is null. The test
  assertion's "WHEN this is set, we trigger an FK error → THEN see sentinel"
  is a conditional that only holds under the dev-DATABASE_URL test path.
- **Plan 02 Test C alignment:** The new `withOpenAIBudgetTracking` Test C
  (Plan 02 Task 1) wraps the same assertion in a `if (process.env.DATABASE_URL)`
  guard so it passes under both `npm test` and `tsx --env-file=.env --test`.
  The pre-existing Test 6 is left as-is per the SCOPE BOUNDARY rule (not
  directly caused by Plan 02 changes).
- **Disposition:** Track for a follow-up plan that either (a) adds a
  `--env-file` flag to the `npm test` script, or (b) gates Test 6 the same
  way Test C is gated.

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
