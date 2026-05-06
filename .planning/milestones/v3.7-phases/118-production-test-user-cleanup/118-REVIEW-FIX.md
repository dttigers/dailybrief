---
phase: 118-production-test-user-cleanup
fixed_at: 2026-04-30T00:00:00Z
review_path: .planning/phases/118-production-test-user-cleanup/118-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 4
skipped: 1
status: all_fixed
---

# Phase 118: Code Review Fix Report

**Fixed at:** 2026-04-30
**Source review:** `.planning/phases/118-production-test-user-cleanup/118-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Warning + 4 Info, fix_scope=all)
- Fixed: 4 (WR-01, IN-01, IN-02, IN-04 — each requires human verification per
  logic-bug rule, since semantic correctness depends on prod schema/Drizzle
  runtime behavior not exercised by tsc)
- Skipped: 1 (IN-03 — already resolved out-of-band before this run)

All four fixes verified clean against `npx tsc --noEmit -p tsconfig.json`
(prod tsconfig). The cleanup script is no longer build-deployed (per IN-03
already_resolved), so `npm run build` was not required.

The script already executed successfully against Railway prod on 2026-05-01
and will not re-run; these fixes harden it for future maintainers (drift
guard, single-source-of-truth constants, graceful pool close) but are not
on a production hot path.

## Fixed Issues

### WR-01: Postgres connection pool never closed before `process.exit`

**Files modified:** `vigil-core/scripts/cleanup-test-users.ts`
**Commit:** `1a36a2b`
**Applied fix:** Imported `closeConnection` alongside `db` from
`../src/db/connection.js`. Added `await closeConnection()` at three sites:
(a) end of `main()` success path — let the event loop drain naturally,
removing the prior `process.exit(0)`; (b) inside the genuine-failure branch
of the catch block before `process.exit(1)`; (c) in the top-level
`main().catch(...)` handler, wrapped in a best-effort try/catch so a close
failure can't mask the original error. The hard `process.exit(0)` on the
success path is gone — script now exits naturally once the pool is closed.

### IN-01: `TARGET_IDS` constant declared but never referenced

**Files modified:** `vigil-core/scripts/cleanup-test-users.ts`
**Commit:** `ab9134f`
**Applied fix:** Replaced all 15 literal `inArray(<col>, [3, 44])` call sites
with `inArray(<col>, TARGET_IDS)` (1 pre-flight + 14 transactional deletes).
Also derived the pre-flight `if (found.length !== 2)` check and its
diagnostic string from `TARGET_IDS.length` and `JSON.stringify(TARGET_IDS)`,
so editing `TARGETS` propagates everywhere. Used a non-`as const`
`TARGET_IDS: number[]` type (set up by IN-02) to avoid the `as unknown as
number[]` cast Drizzle would otherwise require.

### IN-02: `EXPECTED_EMAILS` and `TARGET_IDS` could drift

**Files modified:** `vigil-core/scripts/cleanup-test-users.ts`
**Commit:** `2c19a69`
**Applied fix:** Collapsed the two parallel constants to a single `TARGETS`
map (`{3: "upper@case.com", 44: "test+phase104@local.test"}` as const).
Derived `TARGET_IDS: number[] = Object.keys(TARGETS).map(Number)` and
`EXPECTED_EMAILS: Record<number, string> = TARGETS` from it. Edits to
`TARGETS` now propagate to both downstream constants automatically — adding
a third test user is a one-line change instead of three coordinated edits.

### IN-04: Schema-drift footgun has no programmatic guard

**Files modified:** `vigil-core/scripts/cleanup-test-users.ts`
**Commit:** `99596cf`
**Applied fix:** Added `sql` import from `drizzle-orm`. Added
`assertNoSchemaDrift(database)` async function that runs
`SELECT DISTINCT table_name FROM information_schema.columns WHERE
column_name = 'user_id' AND table_schema = 'public'`, compares the result
against `TABLE_ORDER`, and `process.exit(1)`s with a clear "update
TABLE_ORDER, add a tx.delete()" message if drift is detected. Wired it
into `main()` immediately after the `db` null guard and before the banner
print — so the check runs **before any pre-flight or DELETE issues**.
Updated the file-header docblock note on schema drift to point at the new
runtime guard. Implementation matched the existing project pattern
(`db.execute(sql\`...\`)` with `as unknown as Array<{...}>` cast) used in
`src/db/migrate.test.ts`.

**Human verification needed:** the introspection query relies on every
user-scoped table actually using a column literally named `user_id`. If a
future schema introduces (e.g.) `users_id` or `owner_id`, the guard would
miss it. Worth a follow-up review when a 15th user-scoped table is
proposed.

## Skipped Issues

### IN-03: `tsconfig.scripts.json` rebuilds `src/**/*` redundantly

**File:** `vigil-core/tsconfig.scripts.json:9`
**Reason:** already_resolved out-of-band. Commit `ac7de2c`
("fix(vigil-core): revert tsconfig.scripts.json rootDir change that broke
prod build path") landed earlier today and reverted the file to its
original form: `rootDir: "./scripts"`, `include: ["scripts/migrate-102-seed.ts"]`.
`cleanup-test-users.ts` is no longer included in any build-emitting
tsconfig — exactly the outcome IN-03 recommended. No further action
needed; the prompt explicitly directed this as `already_resolved`.

**Original issue:** review flagged that
`include: ["scripts/migrate-102-seed.ts", "scripts/cleanup-test-users.ts", "src/**/*"]`
recompiled `src/**/*` redundantly into `dist/scripts/src/...` and that
`cleanup-test-users.ts` had no compiled-prod npm script consuming the
output. Both concerns are moot now that the file is out of the include.

---

_Fixed: 2026-04-30_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
