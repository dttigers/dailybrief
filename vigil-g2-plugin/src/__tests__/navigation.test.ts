// Phase 124 Plan 07 — navigation.ts drift detectors.
// Locks the D-08 SDK-reality constraints structurally:
//   - DOUBLE_CLICK is the only Companion tap event handled.
//   - LONG_PRESS_EVENT is never referenced (not in OsEventTypeList anyway,
//     but a future ride-along could re-introduce dead spec wording —
//     drift detector trips before that lands).
//   - SCREEN_ORDER carries [HOME, COMPANION, WORK_ORDERS, AFFIRMATION,
//     VOICE_SPIKE] in this exact order.
//     Phase 128a SPIKE — TOSSABLE: slot 4 (VOICE_SPIKE) was added by the
//     PCM feasibility spike and MUST be removed when Phase 130 lands
//     (revert slot count to 4 + drop the VOICE_SPIKE assertion below).
//
// W-1 portability fix (from plan-checker): comment-stripped source content
// is the asserted surface — BSD grep / GNU grep parity on macOS + CI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NAV_SRC = resolve(__dirname, "../navigation.ts");
const src = readFileSync(NAV_SRC, "utf-8");
// Strip both line + block comments so doc-comment mentions cannot mask a
// real code regression. Mirrors Phase 124 Plan 04 home.test.ts idiom.
const noComments = src
  .replace(/\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

test("D-08 drift: navigation.ts does NOT reference LONG_PRESS_EVENT", () => {
  assert.equal(
    noComments.includes("LONG_PRESS_EVENT"),
    false,
    "LONG_PRESS_EVENT is not in OsEventTypeList; phase 124 must not pretend it exists",
  );
});

test("D-08 drift: navigation.ts handles DOUBLE_CLICK_EVENT for Companion", () => {
  // Both substrings must appear and be associated.
  assert.ok(
    noComments.includes("Screen.COMPANION"),
    "Screen.COMPANION referenced",
  );
  assert.ok(
    noComments.includes("DOUBLE_CLICK_EVENT"),
    "DOUBLE_CLICK_EVENT referenced",
  );
  // The Companion DOUBLE_CLICK branch is identified by the literal guard
  // `currentScreen === Screen.COMPANION` (handleNavEvent if-block, NOT the
  // SCREEN_ORDER literal nor the buildScreen case). A window starting at
  // that guard must reference DOUBLE_CLICK_EVENT.
  const idx = noComments.indexOf("currentScreen === Screen.COMPANION");
  assert.ok(
    idx >= 0,
    "Companion DOUBLE_CLICK guard `currentScreen === Screen.COMPANION` present",
  );
  const window = noComments.slice(idx, idx + 1200);
  assert.ok(
    window.includes("DOUBLE_CLICK_EVENT"),
    "Companion branch handles DOUBLE_CLICK_EVENT",
  );
});

test("SCREEN_ORDER lock: [HOME, COMPANION, WORK_ORDERS, AFFIRMATION, VOICE_SPIKE] exact order", () => {
  // Locate the SCREEN_ORDER literal
  const m = noComments.match(/SCREEN_ORDER[^=]*=\s*\[([\s\S]*?)\]/);
  assert.ok(m, "SCREEN_ORDER literal found");
  const body = m![1];
  // Strip whitespace, split on commas, filter empty
  const entries = body
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Phase 128a SPIKE — TOSSABLE: slot 4 (VOICE_SPIKE) was added by the PCM
  // feasibility spike. When Phase 130 lands and the spike is removed,
  // revert this to `4` entries and drop the slot-4 assertion below.
  assert.equal(
    entries.length,
    5,
    `expected 5 SCREEN_ORDER entries, got ${entries.length}: ${JSON.stringify(entries)}`,
  );
  assert.ok(/Screen\.HOME/.test(entries[0]!), `slot 0: ${entries[0]}`);
  assert.ok(
    /Screen\.COMPANION/.test(entries[1]!),
    `slot 1: ${entries[1]}`,
  );
  assert.ok(
    /Screen\.WORK_ORDERS/.test(entries[2]!),
    `slot 2: ${entries[2]}`,
  );
  assert.ok(
    /Screen\.AFFIRMATION/.test(entries[3]!),
    `slot 3: ${entries[3]}`,
  );
  // Phase 128a SPIKE — TOSSABLE assertion (drop when Phase 130 removes spike).
  assert.ok(
    /Screen\.VOICE_SPIKE/.test(entries[4]!),
    `slot 4: ${entries[4]}`,
  );
});

test("Companion DOUBLE_CLICK branch references hasActiveBanner / cycleSession / getActiveSessions", () => {
  // The DOUBLE_CLICK Companion branch should consult banner state +
  // session count before falling through to navigateTo HOME. Locate
  // the `currentScreen === Screen.COMPANION` branch (the if-guard for
  // the Companion handler) and inspect its body.
  const idx = noComments.indexOf("currentScreen === Screen.COMPANION");
  assert.ok(
    idx >= 0,
    "currentScreen === Screen.COMPANION guard present",
  );
  const window = noComments.slice(idx, idx + 1200);
  assert.ok(window.includes("hasActiveBanner"), "banner check present");
  assert.ok(window.includes("cycleSession"), "session cycle present");
  assert.ok(
    window.includes("getActiveSessions"),
    "active-sessions check present",
  );
});

test("W-6 lock: navigation.ts exports getCurrentScreen + rebuildCurrentScreen for Plan 08 SSE wiring", () => {
  assert.ok(
    /export\s+function\s+getCurrentScreen/.test(noComments),
    "getCurrentScreen export present",
  );
  assert.ok(
    /export\s+async\s+function\s+rebuildCurrentScreen/.test(noComments),
    "rebuildCurrentScreen export present",
  );
});
