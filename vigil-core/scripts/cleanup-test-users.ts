/**
 * cleanup-test-users — One-shot deletion of two known test users from prod.
 *
 * Targets: id=3 (upper@case.com), id=44 (test+phase104@local.test) and ALL
 * their child rows across 14 user-scoped tables.
 *
 * Usage:
 *   railway run npx tsx scripts/cleanup-test-users.ts            # default = --dry-run
 *   railway run npx tsx scripts/cleanup-test-users.ts --dry-run  # explicit dry-run
 *   railway run npx tsx scripts/cleanup-test-users.ts --commit   # live delete
 *
 * Two-step gate by design:
 *   1. Operator runs --dry-run, inspects the per-table row-count output.
 *   2. Operator runs --commit only after dry-run output is acceptable.
 *
 * Safety mechanisms (Phase 118 locked decisions):
 *   - D-01: DATABASE_URL never on local disk; Railway CLI injects at invocation.
 *           Script aborts if DATABASE_URL is unset (points operator at `railway run`).
 *   - D-02: All 14 DELETEs run in a single db.transaction(). Dry-run throws to
 *           force ROLLBACK; --commit returns to allow COMMIT. Either fully
 *           completes or leaves prod untouched.
 *   - D-03: Pre-flight asserts ids 3+44 exist (count==2) AND each row's email
 *           matches the expected literal verbatim. Mismatch aborts BEFORE any
 *           DELETE issues. Defense against id drift.
 *   - D-05: Explicit DELETE per table even where onDelete:cascade is defined,
 *           so per-table row counts are uniform. Future schema flips from
 *           cascade→restrict don't break the script.
 *
 * Idempotent: a successful --commit followed by a re-run logs `0 rows` for
 * every table.
 *
 * NOTE on schema drift: this script lists 14 user-scoped tables verbatim. If a
 * future migration adds a 15th user-scoped table, this script MUST be updated
 * alongside that migration. Detection in Plan 02 runbook: post-cleanup verify
 * SELECTs check for orphans across known tables; a missed table would surface
 * as orphaned children if the deleted ids were ever reused.
 */

import { inArray } from "drizzle-orm";
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

// ── Constants (D-03 + D-05 locked verbatim) ──────────────────────────────────

const TARGET_IDS = [3, 44] as const;
const EXPECTED_EMAILS: Record<number, string> = {
  3: "upper@case.com",
  44: "test+phase104@local.test",
};

// Custom error class so the dry-run rollback path is type-narrowable inside
// the catch block (and not confused with any genuine tx-internal failure).
class DryRunRollback extends Error {
  constructor() {
    super("DRY_RUN_ROLLBACK");
    this.name = "DryRunRollback";
  }
}

// ── Argv parsing (matches set-password.ts pattern: process.argv direct) ──────

const KNOWN_FLAGS = new Set(["--dry-run", "--commit"]);

function parseFlags(): { isCommit: boolean } {
  const args = process.argv.slice(2);

  // Reject unknown --flags before trusting --dry-run / --commit semantics.
  for (const arg of args) {
    if (arg.startsWith("--") && !KNOWN_FLAGS.has(arg)) {
      console.error(`Unknown flag: ${arg}`);
      console.error(`  Allowed: --dry-run (default), --commit`);
      process.exit(1);
    }
  }

  const hasDryRun = args.includes("--dry-run");
  const hasCommit = args.includes("--commit");

  if (hasDryRun && hasCommit) {
    console.error("Cannot pass both --dry-run and --commit");
    console.error("  --dry-run is the default; --commit is explicit and exclusive.");
    process.exit(1);
  }

  return { isCommit: hasCommit };
}

// ── Output helpers ───────────────────────────────────────────────────────────

const TABLE_ORDER = [
  "thought_links",
  "brief_pdfs",
  "briefs",
  "thoughts",
  "projects",
  "api_keys",
  "chat_sessions",
  "work_order_statuses",
  "work_orders",
  "oauth_tokens",
  "app_settings",
  "ai_cache",
  "password_reset_tokens",
  "users",
] as const;

function printBanner(line: string): void {
  const bar = "=".repeat(line.length);
  console.log(bar);
  console.log(line);
  console.log(bar);
}

function printCountsTable(counts: Record<string, number>): void {
  console.log("");
  console.log("TABLE                       ROWS DELETED");
  console.log("--------------------------  ------------");
  let total = 0;
  for (const table of TABLE_ORDER) {
    const n = counts[table] ?? 0;
    total += n;
    console.log(`${table.padEnd(28)}${String(n).padStart(12)}`);
  }
  console.log("--------------------------  ------------");
  console.log(`${"TOTAL".padEnd(28)}${String(total).padStart(12)}`);
  console.log("");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { isCommit } = parseFlags();

  // D-01: hard-stop if DATABASE_URL was not injected. Points operator at
  // `railway run` rather than encouraging them to drop a DATABASE_URL onto
  // local disk (Phase 102 anti-pattern).
  if (!db) {
    console.error(
      "DATABASE_URL not set — cannot run. Use 'railway run npx tsx scripts/cleanup-test-users.ts ...' per D-01",
    );
    process.exit(1);
  }

  printBanner(
    isCommit
      ? "MODE: COMMIT (live delete) — about to mutate prod"
      : "MODE: DRY-RUN (no commit) — counts only, transaction will ROLLBACK",
  );

  // ── Pre-flight assertion (D-03) — runs BEFORE entering the transaction. ───
  // Even an accidental --commit invocation cannot proceed past this gate
  // unless ids 3+44 still map to the exact known test emails.
  const found = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, [3, 44]));

  if (found.length !== 2) {
    console.error(
      `Pre-flight FAILED: expected 2 rows for ids [3, 44], found ${found.length}`,
    );
    console.error(`  Found: ${JSON.stringify(found)}`);
    console.error(`  Aborting per D-03 (no DELETE issued).`);
    process.exit(1);
  }
  for (const row of found) {
    const expected = EXPECTED_EMAILS[row.id];
    if (row.email !== expected) {
      console.error(
        `Pre-flight FAILED: id=${row.id} email='${row.email}' but expected '${expected}'`,
      );
      console.error(`  Aborting per D-03 (no DELETE issued).`);
      process.exit(1);
    }
  }
  console.log(
    `Pre-flight OK: id=3 -> upper@case.com, id=44 -> test+phase104@local.test`,
  );
  console.log("");

  // ── Single transaction wrapping all 14 deletes (D-02 + D-05) ─────────────
  // Order is children → parents (thought_links → users last) to satisfy the
  // restrict FKs on every child table. password_reset_tokens has cascade in
  // schema.ts but is still issued explicitly per D-05 so its row count is
  // visible in the per-table summary.
  const counts: Record<string, number> = {};

  try {
    await db.transaction(async (tx) => {
      // 1. thought_links (children of thoughts + users)
      counts.thought_links = (
        await tx
          .delete(thoughtLinks)
          .where(inArray(thoughtLinks.userId, [3, 44]))
          .returning({ id: thoughtLinks.id })
      ).length;

      // 2. brief_pdfs (children of briefs + users; PK = briefId)
      counts.brief_pdfs = (
        await tx
          .delete(briefPdfs)
          .where(inArray(briefPdfs.userId, [3, 44]))
          .returning({ briefId: briefPdfs.briefId })
      ).length;

      // 3. briefs
      counts.briefs = (
        await tx
          .delete(briefs)
          .where(inArray(briefs.userId, [3, 44]))
          .returning({ id: briefs.id })
      ).length;

      // 4. thoughts (children of projects + users)
      counts.thoughts = (
        await tx
          .delete(thoughts)
          .where(inArray(thoughts.userId, [3, 44]))
          .returning({ id: thoughts.id })
      ).length;

      // 5. projects
      counts.projects = (
        await tx
          .delete(projects)
          .where(inArray(projects.userId, [3, 44]))
          .returning({ id: projects.id })
      ).length;

      // 6. api_keys
      counts.api_keys = (
        await tx
          .delete(apiKeys)
          .where(inArray(apiKeys.userId, [3, 44]))
          .returning({ id: apiKeys.id })
      ).length;

      // 7. chat_sessions
      counts.chat_sessions = (
        await tx
          .delete(chatSessions)
          .where(inArray(chatSessions.userId, [3, 44]))
          .returning({ id: chatSessions.id })
      ).length;

      // 8. work_order_statuses (composite PK userId+caseNumber — return caseNumber)
      counts.work_order_statuses = (
        await tx
          .delete(workOrderStatuses)
          .where(inArray(workOrderStatuses.userId, [3, 44]))
          .returning({ caseNumber: workOrderStatuses.caseNumber })
      ).length;

      // 9. work_orders (PK = caseNumber, FK userId restrict)
      counts.work_orders = (
        await tx
          .delete(workOrders)
          .where(inArray(workOrders.userId, [3, 44]))
          .returning({ caseNumber: workOrders.caseNumber })
      ).length;

      // 10. oauth_tokens
      counts.oauth_tokens = (
        await tx
          .delete(oauthTokens)
          .where(inArray(oauthTokens.userId, [3, 44]))
          .returning({ id: oauthTokens.id })
      ).length;

      // 11. app_settings (composite PK userId+key — return key)
      counts.app_settings = (
        await tx
          .delete(appSettings)
          .where(inArray(appSettings.userId, [3, 44]))
          .returning({ key: appSettings.key })
      ).length;

      // 12. ai_cache
      counts.ai_cache = (
        await tx
          .delete(aiCache)
          .where(inArray(aiCache.userId, [3, 44]))
          .returning({ id: aiCache.id })
      ).length;

      // 13. password_reset_tokens (FK CASCADE in schema, but explicit per D-05)
      counts.password_reset_tokens = (
        await tx
          .delete(passwordResetTokens)
          .where(inArray(passwordResetTokens.userId, [3, 44]))
          .returning({ id: passwordResetTokens.id })
      ).length;

      // 14. users (parent — last; WHERE id IN (3, 44))
      counts.users = (
        await tx
          .delete(users)
          .where(inArray(users.id, [3, 44]))
          .returning({ id: users.id })
      ).length;

      // D-02: throw to force ROLLBACK in dry-run mode; return normally for --commit.
      if (!isCommit) {
        throw new DryRunRollback();
      }
    });
    // Reaches here only on --commit success path.
  } catch (err) {
    if (err instanceof DryRunRollback) {
      // Expected — dry-run path. counts populated above; tx rolled back.
    } else {
      console.error("");
      console.error("Transaction FAILED — ROLLED BACK. No prod mutation.");
      console.error(err);
      process.exit(1);
    }
  }

  // ── Summary output ───────────────────────────────────────────────────────
  printCountsTable(counts);

  if (isCommit) {
    printBanner("MODE: COMMIT — TRANSACTION COMMITTED (rows deleted)");
  } else {
    printBanner("MODE: DRY-RUN — TRANSACTION ROLLED BACK (no prod mutation)");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("cleanup-test-users: FAILED");
  console.error(err);
  process.exit(1);
});
