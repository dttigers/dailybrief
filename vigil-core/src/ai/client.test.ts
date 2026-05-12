// ── Phase 127 Plan 05.1a Task 2 — GUARD-03 drift detector ────────────────
// Source-content drift detector pinning the wrapper-level + cross-file
// invariants of withBudgetTracking integration:
//
//   1. callClaude / callClaudeConversation / callClaudeMultimodal each wrap
//      their ai.messages.create call in `withBudgetTracking(userId, ...)`
//      — pinned via literal grep `withBudgetTracking(userId,` count === 3.
//
//   2. Each wrapper's options type requires `userId: number`
//      — pinned via literal grep `userId: number` count >= 3.
//
//   3. No un-wrapped `ai.messages.create` / `ai.beta.messages.create` call
//      sites exist in vigil-core/src/{routes,ai}/**/*.ts (excluding *.test.ts)
//      — walked + per-match window scan for `withBudgetTracking(` within the
//      previous 200 chars. Offenders fail the test with file:line lines.
//
// Background:
//   Plan 05 (commit `2cac6d51`) shipped the GUARD-03 storage + helper
//   library. Plan 05.1a Task 1 widened the three callClaude* wrappers to
//   require userId and wrapped each ai.messages.create call in
//   withBudgetTracking(). Plan 05.1a Task 3 closes the Pitfall 4 direct-
//   bypass site at process-audio.ts:82-115 (ai.beta.messages.create) and
//   propagates userId to every wrapper call site.
//
//   This test pins both invariants so a future revert (someone "cleans up"
//   the wrap on a wrapper, or adds a new ai.messages.create call outside
//   withBudgetTracking) trips CI immediately.
//
// Mirrors:
//   - vigil-core/src/__tests__/audio-log-redaction.test.ts (Rail 3 walk + scan)
//   - vigil-core/src/__tests__/mount-order.test.ts (source-content lock convention)
//
// Run: cd vigil-core && npx tsx --test src/ai/client.test.ts
// -----------------------------------------------------------------------------

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

let ROOT = "";
let CLIENT_SRC = "";

before(() => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // src/ai/client.test.ts → src/ is one level up
  ROOT = path.join(here, "..");
  CLIENT_SRC = readFileSync(path.join(ROOT, "ai", "client.ts"), "utf8");
});

function walk(dir: string, files: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("vigil-core/src/ai/client.ts — Phase 127 GUARD-03 wrap pattern", () => {
  // ── Test 1: wrapper-level drift detector (REQUIRED) ────────────────────────
  it("client.ts wraps every messages.create in withBudgetTracking(userId, ...) — count === 3", () => {
    const matches = CLIENT_SRC.match(/withBudgetTracking\(userId,/g);
    const count = matches?.length ?? 0;
    assert.equal(
      count,
      3,
      `Expected exactly 3 \`withBudgetTracking(userId,\` matches (one per ` +
        `wrapper: callClaude, callClaudeConversation, callClaudeMultimodal) — ` +
        `got ${count}. If a wrapper was added or removed, update this test ` +
        `AND ensure the new wrapper goes through withBudgetTracking too. ` +
        `If JSDoc accidentally re-introduced the literal token, soften the ` +
        `prose (mirror Plan 05's DailyBudgetExceededError.code precedent).`,
    );
  });

  // ── Test 2: signature-level drift detector (REQUIRED) ──────────────────────
  it("each wrapper's options type requires userId: number — count >= 3", () => {
    const matches = CLIENT_SRC.match(/userId:\s*number/g);
    const count = matches?.length ?? 0;
    assert.ok(
      count >= 3,
      `Expected at least 3 \`userId: number\` field declarations (one per ` +
        `wrapper's options type) — got ${count}. If userId was made optional ` +
        `on any wrapper, TypeScript would no longer enforce the propagation ` +
        `across call sites and silent un-tracked AI spend would re-emerge.`,
    );
  });
});

describe("vigil-core/src/{routes,ai}/**/*.ts — Phase 127 GUARD-03 cross-file wrap pattern", () => {
  // ── Test 3: cross-file drift detector (REQUIRED) ───────────────────────────
  it("no un-wrapped ai.messages.create or ai.beta.messages.create call sites exist", () => {
    const scanDirs = ["routes", "ai"].map((d) => path.join(ROOT, d));

    // Matches:
    //   await ai.messages.create
    //   await ai!.messages.create
    //   await ai.beta.messages.create
    //   await ai!.beta.messages.create
    // Excludes the type-only `typeof callClaudeMultimodal` references etc.
    const callPattern = /await\s+ai\!?\.(?:beta\.)?messages\.create\b/g;

    const offenders: Array<{ file: string; line: number; snippet: string }> = [];

    for (const dir of scanDirs) {
      const files = walk(dir);
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        // Walk every match of the pattern and check the preceding 200 chars
        // for `withBudgetTracking(`. If absent → offender.
        for (const match of src.matchAll(callPattern)) {
          const matchIdx = match.index ?? 0;
          const windowStart = Math.max(0, matchIdx - 200);
          const windowSlice = src.slice(windowStart, matchIdx);
          if (!windowSlice.includes("withBudgetTracking(")) {
            // Compute the 1-indexed line number of the match
            const before = src.slice(0, matchIdx);
            const line = before.split("\n").length;
            offenders.push({
              file: path.relative(ROOT, file),
              line,
              snippet: match[0],
            });
          }
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `GUARD-03 drift: un-wrapped messages.create call site(s) found — ` +
        `every \`ai.messages.create\` / \`ai.beta.messages.create\` call in ` +
        `routes/ + ai/ MUST be wrapped in \`withBudgetTracking(userId, ...)\`. ` +
        `Pitfall 4 chokepoint. Offenders:\n  ` +
        offenders
          .map((o) => `${o.file}:${o.line} — ${o.snippet}`)
          .join("\n  "),
    );
  });
});
