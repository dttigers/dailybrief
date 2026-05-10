// Phase 124 Plan 04 — G2-POLISH-07 drift detector + signature pin.
// Locks the 4-line body invariant via SOURCE-CONTENT inspection (mirror
// Phase 123 Plan 03's drift-detector pattern: fs.readFileSync + regex
// assertion). Pure-content tests do not exercise the SDK, so they run
// fast and offline.
//
// What this catches BEFORE reaching hardware:
//   1. bodyContent array regrowing past 4 entries (overflow regression)
//   2. DIVIDER constant returning to home.ts code (T-124-04-01 Tampering)
//   3. affirmation parameter creeping back into the function signature
//   4. buildHomeScreen export accepting >1 parameter
//
// Together with Task 3's byte-identical sim PNG comparison, this lays
// down a structural lock for the v3.5 HARDWARE-DIVERGENCE Divergence 4
// regression (210px container scroll-position non-determinism).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME_SRC = resolve(__dirname, "../home.ts");
const src = readFileSync(HOME_SRC, "utf-8");

// Strip line + block comments so a doc-comment mention of DIVIDER /
// affirmation cannot mask a real code regression. Mirrors the comment-
// stripping idiom used in Phase 123 Plan 03 drift detectors.
const noComments = src
  .replace(/\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

test("G2-POLISH-07 drift: bodyContent array has exactly 4 entries", () => {
  // Match between `const bodyContent = [` and the matching `].join`.
  const m = src.match(/const\s+bodyContent\s*=\s*\[([\s\S]*?)\]\.join/);
  assert.ok(m, "bodyContent array literal found");
  const body = m![1];
  // Count top-level array entries: split on commas, ignoring commas
  // that fall inside template-string backticks (heuristic — the codebase's
  // simple shape — template strings + plain string literals — does not
  // currently use nested brackets/parens inside entries).
  const entries = body
    .split(/,(?![^`]*`)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  assert.equal(
    entries.length,
    4,
    `bodyContent should have 4 entries; got ${entries.length}: ${JSON.stringify(entries)}`,
  );
});

test("G2-POLISH-07 drift: home.ts does not reference DIVIDER (excluding comments)", () => {
  assert.equal(
    noComments.includes("DIVIDER"),
    false,
    "DIVIDER reference removed from home.ts code (comments allowed)",
  );
});

test("G2-POLISH-07 drift: home.ts does not reference affirmation parameter", () => {
  // The Affirmation SCREEN still exists in a different file; the
  // VigilAffirmation type still exists in types.ts. Here we forbid:
  //   - `affirmation.affirmation` field access
  //   - `: VigilAffirmation` type annotation (parameter type)
  assert.equal(
    /affirmation\.affirmation/.test(noComments),
    false,
    "no affirmation.affirmation field access in home.ts",
  );
  assert.equal(
    /:\s*VigilAffirmation/.test(noComments),
    false,
    "VigilAffirmation type annotation removed from home.ts",
  );
});

test("G2-POLISH-07 drift: buildHomeScreen takes one parameter (summary)", () => {
  const m = noComments.match(/export\s+function\s+buildHomeScreen\s*\(([^)]*)\)/);
  assert.ok(m, "buildHomeScreen export found");
  const params = m![1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.equal(
    params.length,
    1,
    `buildHomeScreen should take 1 param; got ${params.length}: ${m![1]}`,
  );
  assert.ok(/summary/.test(params[0]!), `param should be summary; got: ${params[0]}`);
});
