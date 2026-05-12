# Phase 127 Deferred Items

## Pre-existing TS errors (not caused by Phase 127 work)

### src/lib/ai-budget.test.ts:138 — `{ ok: boolean }` doesn't satisfy `T extends { usage?: ... }` generic constraint

- **Found during:** Plan 05.1a Task 1 typecheck verification
- **Origin:** Predates Plan 05.1a — landed in commit `2cac6d51` (Plan 05 Task 3 itself)
- **Impact:** TypeScript narrowing error; the test runs fine under `tsx --test` (transpile-only), so all 17 subtests pass at runtime
- **Why deferred:** Pre-existing in Plan 05's own test file; out of scope per executor SCOPE BOUNDARY rule. Plan 05 considered tests passing under tsx --test as the bar, not strict tsc check
- **Suggested fix (future):** Type the test's `fn` argument as `() => Promise<{ ok: boolean; usage?: never }>` or widen the generic constraint

### src/lib/ai-budget.test.ts — "console.error captures 'withBudgetTracking accumulator failed' sentinel" fails without DATABASE_URL

- **Found during:** Plan 05.1a Task 3 regression check
- **Origin:** Predates Plan 05.1a — landed in commit `2cac6d51` (Plan 05 Task 3)
- **Impact:** Test asserts the accumulator FK-failure log path; requires a live Postgres connection so the catch branch fires. Without DATABASE_URL, db is null, the INSERT is skipped, no error is logged, assertion fails.
- **Why deferred:** Pre-existing — confirmed by running on a stashed working tree without Plan 05.1a's changes; identical 11 pass / 1 fail outcome. Plan 05 SUMMARY claimed "all 7 tests pass" but that was on a machine with DATABASE_URL set.
- **Suggested fix (future):** Either skip the test when `db === null` (preferred — match the other env-gated tests) or split out into `ai-budget.integration.test.ts`
