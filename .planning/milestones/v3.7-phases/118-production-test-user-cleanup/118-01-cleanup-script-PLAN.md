---
phase: 118-production-test-user-cleanup
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - vigil-core/scripts/cleanup-test-users.ts
  - vigil-core/package.json
autonomous: true
requirements: [OPS-01]
must_haves:
  truths:
    - "Script `vigil-core/scripts/cleanup-test-users.ts` exists, parses --dry-run (default) and --commit flags via process.argv"
    - "Script aborts with non-zero exit if pre-flight assertion fails (count != 2 OR id=3 email != 'upper@case.com' OR id=44 email != 'test+phase104@local.test')"
    - "All 14 DELETEs run inside a single db.transaction(); --dry-run throws inside the tx to force ROLLBACK; --commit returns normally to allow COMMIT"
    - "Script logs a uniform per-table row-count line for all 14 tables in the D-05 delete order"
    - "Re-running the script after a successful --commit logs zero deletes for every table (idempotent)"
  artifacts:
    - path: "vigil-core/scripts/cleanup-test-users.ts"
      provides: "Idempotent cleanup script with dry-run/commit gate"
      contains: "WHERE id IN (3, 44)"
    - path: "vigil-core/package.json"
      provides: "Optional npm script entries for ergonomic invocation"
  key_links:
    - from: "vigil-core/scripts/cleanup-test-users.ts"
      to: "vigil-core/src/db/connection.ts"
      via: "import { db } from '../src/db/connection.js'"
      pattern: "from \"../src/db/connection.js\""
    - from: "vigil-core/scripts/cleanup-test-users.ts"
      to: "vigil-core/src/db/schema.ts"
      via: "import schema tables for typed Drizzle deletes"
      pattern: "from \"../src/db/schema.js\""
---

<objective>
Build `vigil-core/scripts/cleanup-test-users.ts` — an idempotent, dry-run-by-default cleanup script for the two known test users (id=3 `upper@case.com`, id=44 `test+phase104@local.test`) and all their child rows across 14 user-scoped tables.

Purpose: This is the executable artifact behind OPS-01. Plan 02 invokes this script against Railway prod with `railway run`. Safety mechanisms (D-01, D-02, D-03, D-05) must be wired in here, not bolted on later.

Output:
- `vigil-core/scripts/cleanup-test-users.ts` — TypeScript script invoked via `npx tsx scripts/cleanup-test-users.ts [--dry-run|--commit]`
- (Optional, Claude's discretion) `vigil-core/package.json` npm script entries
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/118-production-test-user-cleanup/118-CONTEXT.md
@vigil-core/src/db/schema.ts
@vigil-core/src/db/connection.ts
@vigil-core/scripts/seed-local.ts
@vigil-core/scripts/set-password.ts
@vigil-core/src/routes/links.ts

<interfaces>
<!-- Key contracts the executor needs. Extracted from codebase. No exploration required. -->

From vigil-core/src/db/connection.ts:
```typescript
export const db = client ? drizzle(client, { schema }) : null;
// IMPORTANT: db can be null when DATABASE_URL is unset — guard before use (see seed-local.ts pattern)
// Drizzle exposes db.transaction(async (tx) => { ... }); throwing inside the callback triggers ROLLBACK
```

From vigil-core/src/db/schema.ts (14 user-scoped tables in D-05 delete order):
```typescript
export const thoughtLinks   // children of thoughts + users
export const briefPdfs       // children of briefs + users (PK = briefId)
export const briefs
export const thoughts        // children of projects + users
export const projects
export const apiKeys
export const chatSessions
export const workOrderStatuses // composite PK (userId, caseNumber)
export const workOrders        // PK = caseNumber, FK userId restrict
export const oauthTokens
export const appSettings       // composite PK (userId, key)
export const aiCache
export const passwordResetTokens // FK userId CASCADE (still explicit per D-05)
export const users             // parent — last
```

Drizzle delete + count pattern:
```typescript
import { eq, inArray, sql } from "drizzle-orm";
// .returning() returns the deleted rows; .length gives the count
const deleted = await tx.delete(thoughtLinks).where(inArray(thoughtLinks.userId, TARGET_IDS)).returning({ id: thoughtLinks.id });
console.log(`thought_links: ${deleted.length} rows`);
```

Existing argv pattern (set-password.ts):
```typescript
function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) return undefined;
  return process.argv[idx + 1];
}
// Boolean flag check: process.argv.includes("--commit")
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Write cleanup-test-users.ts with safety mechanisms</name>
  <files>vigil-core/scripts/cleanup-test-users.ts</files>
  <read_first>
    - vigil-core/src/db/schema.ts (14-table FK + onDelete inventory; do NOT trust memory, verify table exports match D-05 list)
    - vigil-core/src/db/connection.ts (the `db` export to import; note `db` may be null)
    - vigil-core/scripts/seed-local.ts (script shape: db null guard, console.log, process.exit semantics)
    - vigil-core/scripts/set-password.ts (parseArg pattern; argv-direct, no commander/yargs)
    - vigil-core/src/routes/links.ts (lines 60-77: `db.transaction(async (tx) => { ... })` reference pattern in this codebase)
    - .planning/phases/118-production-test-user-cleanup/118-CONTEXT.md (D-01 through D-05 — the locked decisions)
  </read_first>
  <behavior>
    - Test 1 (manual, post-write): Running with no flag is treated as `--dry-run` (default per D-02); script logs row counts then ROLLBACK marker; exits 0; users id=3 and id=44 still present.
    - Test 2 (manual): Running with `--commit` against a DB where ids 3 and 44 do NOT have the expected emails aborts with non-zero exit and logs the mismatched id+email; no DELETE issued.
    - Test 3 (manual): Running with `--commit` against a DB where ids 3 and 44 have the expected emails deletes all child rows + parent rows in a single tx; second invocation logs `users: 0 rows`, `thoughts: 0 rows`, etc., for every table.
    - Test 4 (manual): If only ONE of the two ids exists (count = 1), script aborts with non-zero exit (D-03 count assertion).
  </behavior>
  <action>
Create `vigil-core/scripts/cleanup-test-users.ts` implementing the locked decisions verbatim:

**1. File header docblock** — describe purpose, usage, the two-step gate, and reference D-01/D-02/D-03/D-05.

**2. Imports:**
```typescript
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db/connection.js";
import {
  thoughtLinks,
  briefPdfs,
  briefs,
  thoughts,
  projects,
  apiKeys,
  chatSessions,
  workOrderStatuses,
  workOrders,
  oauthTokens,
  appSettings,
  aiCache,
  passwordResetTokens,
  users,
} from "../src/db/schema.js";
```

**3. Constants (verbatim from D-03 + D-05):**
```typescript
const TARGET_IDS = [3, 44] as const;
const EXPECTED_EMAILS: Record<number, string> = {
  3: "upper@case.com",
  44: "test+phase104@local.test",
};
```

**4. parseArg / flag detection:** Use `process.argv.includes("--commit")` to decide mode. Default = dry-run. Accept literal `--dry-run` as explicit-default-OK. If BOTH flags present → abort with non-zero exit and message "Cannot pass both --dry-run and --commit". If any unknown flag (anything starting with `--` not in {`--dry-run`,`--commit`}) → abort.

**5. db null guard:** If `db` is null (DATABASE_URL unset) → `console.error("DATABASE_URL not set — cannot run. Use 'railway run npx tsx scripts/cleanup-test-users.ts ...' per D-01"); process.exit(1);`

**6. Pre-flight assertion (D-03 — runs BEFORE entering the transaction):**
```typescript
const found = await db.select({ id: users.id, email: users.email })
  .from(users)
  .where(inArray(users.id, [3, 44]));

if (found.length !== 2) {
  console.error(`Pre-flight FAILED: expected 2 rows for ids [3, 44], found ${found.length}`);
  console.error(`  Found: ${JSON.stringify(found)}`);
  console.error(`  Aborting per D-03 (no DELETE issued).`);
  process.exit(1);
}
for (const row of found) {
  const expected = EXPECTED_EMAILS[row.id];
  if (row.email !== expected) {
    console.error(`Pre-flight FAILED: id=${row.id} email='${row.email}' but expected '${expected}'`);
    console.error(`  Aborting per D-03 (no DELETE issued).`);
    process.exit(1);
  }
}
console.log(`Pre-flight OK: id=3 -> upper@case.com, id=44 -> test+phase104@local.test`);
```

**7. Single transaction wrapping all 14 deletes (D-02 + D-05) — IN THIS EXACT ORDER:**
```typescript
const counts: Record<string, number> = {};

class DryRunRollback extends Error {
  constructor() { super("DRY_RUN_ROLLBACK"); }
}

try {
  await db.transaction(async (tx) => {
    // 1. thought_links (children of thoughts + users)
    counts.thought_links = (await tx.delete(thoughtLinks).where(inArray(thoughtLinks.userId, [3, 44])).returning({ id: thoughtLinks.id })).length;
    // 2. brief_pdfs (children of briefs + users)
    counts.brief_pdfs = (await tx.delete(briefPdfs).where(inArray(briefPdfs.userId, [3, 44])).returning({ briefId: briefPdfs.briefId })).length;
    // 3. briefs
    counts.briefs = (await tx.delete(briefs).where(inArray(briefs.userId, [3, 44])).returning({ id: briefs.id })).length;
    // 4. thoughts
    counts.thoughts = (await tx.delete(thoughts).where(inArray(thoughts.userId, [3, 44])).returning({ id: thoughts.id })).length;
    // 5. projects
    counts.projects = (await tx.delete(projects).where(inArray(projects.userId, [3, 44])).returning({ id: projects.id })).length;
    // 6. api_keys
    counts.api_keys = (await tx.delete(apiKeys).where(inArray(apiKeys.userId, [3, 44])).returning({ id: apiKeys.id })).length;
    // 7. chat_sessions
    counts.chat_sessions = (await tx.delete(chatSessions).where(inArray(chatSessions.userId, [3, 44])).returning({ id: chatSessions.id })).length;
    // 8. work_order_statuses (composite PK — return userId+caseNumber)
    counts.work_order_statuses = (await tx.delete(workOrderStatuses).where(inArray(workOrderStatuses.userId, [3, 44])).returning({ caseNumber: workOrderStatuses.caseNumber })).length;
    // 9. work_orders
    counts.work_orders = (await tx.delete(workOrders).where(inArray(workOrders.userId, [3, 44])).returning({ caseNumber: workOrders.caseNumber })).length;
    // 10. oauth_tokens
    counts.oauth_tokens = (await tx.delete(oauthTokens).where(inArray(oauthTokens.userId, [3, 44])).returning({ id: oauthTokens.id })).length;
    // 11. app_settings (composite PK — return key)
    counts.app_settings = (await tx.delete(appSettings).where(inArray(appSettings.userId, [3, 44])).returning({ key: appSettings.key })).length;
    // 12. ai_cache
    counts.ai_cache = (await tx.delete(aiCache).where(inArray(aiCache.userId, [3, 44])).returning({ id: aiCache.id })).length;
    // 13. password_reset_tokens (FK CASCADE but explicit per D-05)
    counts.password_reset_tokens = (await tx.delete(passwordResetTokens).where(inArray(passwordResetTokens.userId, [3, 44])).returning({ id: passwordResetTokens.id })).length;
    // 14. users (parent — last)
    counts.users = (await tx.delete(users).where(inArray(users.id, [3, 44])).returning({ id: users.id })).length;

    // D-02: throw to force ROLLBACK in dry-run mode; return normally for --commit
    const isCommit = process.argv.includes("--commit");
    if (!isCommit) {
      throw new DryRunRollback();
    }
  });
  // Reaches here only on --commit success
} catch (err) {
  if (err instanceof DryRunRollback) {
    // Expected — dry-run path. counts populated; tx rolled back.
  } else {
    console.error("Transaction failed — ROLLED BACK. No prod mutation.");
    console.error(err);
    process.exit(1);
  }
}
```

**8. Output format (Claude discretion per CONTEXT but MUST be parseable in 118-RUN-LOG.txt):**
Print a header banner indicating mode (`DRY-RUN (no commit)` vs `COMMIT (live delete)`). Then print a fixed-width table:
```
TABLE                       ROWS DELETED
--------------------------  ------------
thought_links               <count>
brief_pdfs                  <count>
briefs                      <count>
thoughts                    <count>
projects                    <count>
api_keys                    <count>
chat_sessions               <count>
work_order_statuses         <count>
work_orders                 <count>
oauth_tokens                <count>
app_settings                <count>
ai_cache                    <count>
password_reset_tokens       <count>
users                       <count>
--------------------------  ------------
TOTAL                       <sum>
```
Print closing banner: `MODE: DRY-RUN — TRANSACTION ROLLED BACK (no prod mutation)` OR `MODE: COMMIT — TRANSACTION COMMITTED (rows deleted)`.

**9. Exit:** `process.exit(0)` on success path. Both dry-run and commit return 0 when their respective flow completes cleanly. Pre-flight failure, unknown-flag, or tx error returns non-zero.

**10. Top-level error handler** (matches set-password.ts shape):
```typescript
main().catch((err) => {
  console.error("cleanup-test-users: FAILED");
  console.error(err);
  process.exit(1);
});
```

**Optional (Claude discretion per CONTEXT):** add to `vigil-core/package.json`:
```json
"cleanup:test-users:dry-run": "tsx scripts/cleanup-test-users.ts --dry-run",
"cleanup:test-users:commit": "tsx scripts/cleanup-test-users.ts --commit"
```
Note: these npm scripts do NOT load `.env` (no `--env-file` flag) — Plan 02 explicitly invokes via `railway run` so DATABASE_URL is injected by Railway. Adding `--env-file=.env` here would defeat D-01 ("no DATABASE_URL on local disk").
  </action>
  <verify>
    <automated>cd vigil-core &amp;&amp; npx tsc --noEmit -p tsconfig.scripts.json 2>&amp;1 | tee /tmp/118-tsc.log &amp;&amp; grep -c "cleanup-test-users.ts" /tmp/118-tsc.log; test $? -ne 0 || grep -v error /tmp/118-tsc.log</automated>
    <automated>grep -F "WHERE id IN" vigil-core/scripts/cleanup-test-users.ts || grep -F "[3, 44]" vigil-core/scripts/cleanup-test-users.ts</automated>
    <automated>grep -F "upper@case.com" vigil-core/scripts/cleanup-test-users.ts &amp;&amp; grep -F "test+phase104@local.test" vigil-core/scripts/cleanup-test-users.ts</automated>
    <automated>grep -F "db.transaction" vigil-core/scripts/cleanup-test-users.ts</automated>
    <automated>grep -E "thought_links|thoughtLinks" vigil-core/scripts/cleanup-test-users.ts &amp;&amp; grep -E "passwordResetTokens|password_reset_tokens" vigil-core/scripts/cleanup-test-users.ts &amp;&amp; grep -F "users" vigil-core/scripts/cleanup-test-users.ts</automated>
    <automated>grep -F "from \"../src/db/connection.js\"" vigil-core/scripts/cleanup-test-users.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `vigil-core/scripts/cleanup-test-users.ts` exists
    - File contains the literal string `[3, 44]` (TARGET_IDS array)
    - File contains the literal string `upper@case.com`
    - File contains the literal string `test+phase104@local.test`
    - File contains the literal string `db.transaction(`
    - File imports all 14 schema exports: `thoughtLinks`, `briefPdfs`, `briefs`, `thoughts`, `projects`, `apiKeys`, `chatSessions`, `workOrderStatuses`, `workOrders`, `oauthTokens`, `appSettings`, `aiCache`, `passwordResetTokens`, `users` (verifiable via `grep` per import)
    - File imports `db` from `"../src/db/connection.js"` (NOT `client.js` — that file does not exist)
    - File contains a check for `--commit` flag via `process.argv.includes("--commit")`
    - File contains a check that aborts on both flags present (`--dry-run` AND `--commit`)
    - File contains a pre-flight `select` from `users` filtered by `inArray(users.id, [3, 44])` BEFORE entering the `db.transaction` block (verifiable: line number of first `select(` from `users` is BEFORE line number of `db.transaction(`)
    - File contains both expected-email assertions: id=3 → upper@case.com, id=44 → test+phase104@local.test
    - File contains a throw inside the transaction to force ROLLBACK on dry-run (custom error class or `throw new Error(...)`)
    - `cd vigil-core && npx tsc --noEmit -p tsconfig.scripts.json` exits 0 (no TypeScript errors in the new script)
    - `cd vigil-core && npx tsx scripts/cleanup-test-users.ts --dry-run --commit` exits non-zero with message about both flags
    - `cd vigil-core && npx tsx scripts/cleanup-test-users.ts --bogus-flag` exits non-zero (unknown flag rejection)
    - Running with no DATABASE_URL exits non-zero with message referencing `railway run` (D-01 guidance)
  </acceptance_criteria>
  <done>
    Script compiles cleanly under tsconfig.scripts.json. All 14 schema imports present. Pre-flight email assertion runs BEFORE transaction. All 14 DELETEs run inside `db.transaction()` in the D-05 order (thought_links → users last). Dry-run path throws to ROLLBACK; commit path returns to COMMIT. Both-flag, unknown-flag, and missing-DB cases exit non-zero with actionable messages. Script ready for Plan 02 to invoke via `railway run`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local shell → Railway prod Postgres | Railway CLI injects DATABASE_URL into the script's env; the script issues DELETE statements that mutate prod data |
| script argv → execution mode | Presence of `--commit` flag flips ROLLBACK to COMMIT; this is the trust boundary between safe inspection and destructive action |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-118-01-01 | Tampering | DATABASE_URL env value | mitigate | D-01: Railway CLI is the only mechanism that injects DATABASE_URL; no local `.env` carries it. Plan 02 invokes via `railway run`. The script's null-guard exits 1 if DATABASE_URL is unset, with a message pointing at `railway run`. |
| T-118-01-02 | Tampering | id drift — ids 3 and 44 reassigned to real users | mitigate | D-03: pre-flight `SELECT id, email FROM users WHERE id IN (3, 44)` enforces count == 2 AND each row's email matches the expected literal. Mismatch → process.exit(1) BEFORE any DELETE issued. (HIGH severity — main blast-radius mitigation.) |
| T-118-01-03 | Denial of Service | Partial delete leaves orphaned children | mitigate | D-02: all 14 DELETEs wrapped in `db.transaction()`. Any thrown error inside aborts → Drizzle issues ROLLBACK → no partial state. Drizzle's transaction primitive is already used in routes/links.ts and routes/brief-generate.ts (verified pattern). |
| T-118-01-04 | Elevation of Privilege | Accidental `--commit` invocation | mitigate | D-02: dry-run is the default; `--commit` is explicit and cannot be confused with `--dry-run`. Both-flag-passed aborts. D-03's email assertion is second-line defense — even on accidental --commit, mismatch aborts before DELETE. |
| T-118-01-05 | Information Disclosure | Script logs deleted row contents to stdout | accept | Script logs counts only (`thought_links: 12 rows`), not row payloads. `.returning({ id: ... })` selects only the PK, not user content. Stdout will be captured to 118-RUN-LOG.txt in Plan 02 — only id-level information persists in git. |
| T-118-01-06 | Tampering | Schema drift adds a 15th user-scoped table not in the script | accept | Defense: future schema phase MUST add the new table to this script. Documented in script header. Detection: post-cleanup verification SELECTs in Plan 02 will check for orphans across known tables; a missed table would surface as orphaned children in a future `users` re-insert. Low severity for the v3.7 closeout cleanup window. |

**HIGH severity items:** T-118-01-02 (id drift). Mitigated structurally via D-03 pre-flight; abort path is unconditional.
</threat_model>

<verification>
- TypeScript compile clean (`npx tsc --noEmit -p tsconfig.scripts.json` exits 0)
- All 14 schema table imports present in cleanup script
- Pre-flight email assertion appears textually BEFORE the `db.transaction(` call
- Dry-run+commit double-flag rejected
- Unknown-flag rejected
- Missing DATABASE_URL rejected with `railway run` guidance message
</verification>

<success_criteria>
- `vigil-core/scripts/cleanup-test-users.ts` compiles cleanly
- Script contains literal strings `upper@case.com`, `test+phase104@local.test`, `[3, 44]`
- All 14 user-scoped tables targeted by DELETE in the D-05 order, inside a single `db.transaction()`
- Dry-run is the default mode; `--commit` is explicit and cannot collide with `--dry-run`
- Pre-flight email assertion gates the transaction; mismatch aborts with exit 1 BEFORE any DELETE issued
- Script ready for Plan 02 invocation via `railway run npx tsx scripts/cleanup-test-users.ts --dry-run` and `--commit`
</success_criteria>

<output>
After completion, create `.planning/phases/118-production-test-user-cleanup/118-01-cleanup-script-SUMMARY.md` capturing:
- Final form of the script (key structure, not the full code)
- Any deviations from this plan (e.g., chose JSON-line logging over table — record + rationale)
- The exact npm script entries added (or rationale for skipping)
- Confirmation tsc clean and all grep acceptance criteria pass
</output>
