// ── Phase 127 GUARD-04 — schema-vs-migration drift detector ──────────────────
// Fails CI if a future commit edits `vigil-core/src/db/schema.ts` (adds a
// column, renames a type, drops a table) WITHOUT writing the corresponding
// hand-crafted migration file under `vigil-core/drizzle/`. This is the
// structural mitigation for T-127-04 (silent schema drift).
//
// Mechanism:
//   1. Shell out to `npx drizzle-kit generate` (plain — no extra flags; the
//      "dry run" form referenced in CONTEXT.md is fictional in
//      drizzle-kit@^0.31.10; see RESEARCH §Pitfall 1).
//   2. Capture stdout.
//   3. Assert the stdout matches /No schema changes/i (regex form is
//      emoji-tolerant per RESEARCH §A2 — the verified-live sentinel is
//      "No schema changes, nothing to migrate 😴" but a future minor version
//      may strip the emoji or reword slightly; the regex tolerates that).
//
// CI-friendliness:
//   - drizzle-kit `generate` reads only `schema.ts` + `drizzle/meta/*.json`
//     and never touches the DB (RESEARCH §A4, verified live 2026-05-11).
//     A fake DATABASE_URL `postgres://noop@localhost/noop` satisfies the
//     config load so the test runs in CI without a reachable Postgres.
//   - Per-test timeout of 10s gives ~3-5x headroom over the verified
//     1-3s drizzle-kit boot time (RESEARCH §Pitfall 10).
//
// If this test fails:
//   - Inspect the captured stdout (printed in the assertion message). It
//     will list every column/table drizzle-kit thinks should change.
//   - Hand-craft a new 0021+ migration matching those changes (Phase 121
//     Plan 01 lock: hand-crafted SQL with `IF NOT EXISTS`, NOT verbatim
//     `drizzle-kit generate` output).
//   - Re-run this test until it passes.
//
// Run: cd vigil-core && DATABASE_URL=postgres://noop@localhost/noop \
//        npx tsx --test src/__tests__/migration-drift.test.ts
// -----------------------------------------------------------------------------

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
// src/__tests__/migration-drift.test.ts  →  vigil-core/ is two levels up
const VIGIL_CORE_ROOT = join(here, "..", "..");

describe("GUARD-04 schema-vs-migration drift detector", () => {
  it(
    "drizzle-kit generate reports no pending changes against current schema.ts",
    { timeout: 10_000 },
    () => {
      const env = {
        ...process.env,
        // RESEARCH §A4: `generate` reads only schema.ts + drizzle/meta/*.json,
        // never contacts the DB. A fake URL satisfies the drizzle.config.ts load.
        DATABASE_URL:
          process.env.DATABASE_URL ?? "postgres://noop@localhost/noop",
      };
      const out = execSync("npx drizzle-kit generate", {
        cwd: VIGIL_CORE_ROOT,
        env,
        encoding: "utf8",
      });
      // Sentinel from RESEARCH §Pitfall 1 — verified live against
      // drizzle-kit@0.31.10 2026-05-11: "No schema changes, nothing to migrate 😴".
      // Regex `/No schema changes/i` per RESEARCH §A2 (emoji-tolerant + minor-
      // version-resilient). Do NOT tighten to a literal-string compare.
      assert.match(
        out,
        /No schema changes/i,
        `Expected drizzle-kit generate to report "No schema changes, nothing to migrate" against current schema.ts.\n\nGot stdout:\n${out}\n\nThis means src/db/schema.ts has diverged from drizzle/. Hand-craft a new 0021+ migration before proceeding (Phase 121 Plan 01 lock — hand-crafted SQL with IF NOT EXISTS, NOT verbatim drizzle-kit output).`,
      );
    },
  );
});
