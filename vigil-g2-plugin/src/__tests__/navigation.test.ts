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

// ── Phase 129 Plan 09 — GAP-129-F: WORK_ORDERS DOUBLE_CLICK carve-out ──
//
// Test pattern note: this codebase's navigation tests are SOURCE-LEVEL DRIFT
// DETECTORS (grep-on-comment-stripped-source) rather than behavioral tests
// against a FakeBridge. The plan's <interfaces> block referenced a FakeBridge
// + setLastFetchedTasks test seam, but neither exists in this codebase —
// navigation.ts transitively imports api.ts which reads `import.meta.env`,
// making behavioral imports fail under `tsx --test` (Vite-only env access).
// Per the plan's <deviation_handling> guidance ("If the test framework for
// vigil-g2-plugin doesn't have an obvious sim harness, fall back to the
// closest applicable test pattern"), Task 1's RED tests are authored as
// source-level drift assertions — the SAME pattern Phase 124 Plan 07 used
// for the COMPANION DOUBLE_CLICK carve-out at lines 39-63 above.
//
// Hardware behavioral verification of the WORK_ORDERS DOUBLE_CLICK gesture
// lives in Plan 129-13 (re-run UAT Scenario 1 on real G2 hardware).

test("GAP-129-F (case A): navigation.ts contains WORK_ORDERS DOUBLE_CLICK carve-out that enters TASK_DETAIL via navigateToTaskDetail(0, ...)", () => {
  // Pre-condition surface: the carve-out's if-guard MUST match the literal
  // template established by COMPANION (line 252-271) and VOICE_SPIKE
  // (line 287-295) carve-outs — `currentScreen === Screen.WORK_ORDERS`
  // combined with `OsEventTypeList.DOUBLE_CLICK_EVENT`.
  const guardIdx = noComments.indexOf("currentScreen === Screen.WORK_ORDERS");
  assert.ok(
    guardIdx >= 0,
    "WORK_ORDERS DOUBLE_CLICK carve-out guard `currentScreen === Screen.WORK_ORDERS` present in handleNavEvent",
  );
  // The branch within ~1200 chars of the guard must mention DOUBLE_CLICK_EVENT
  // (otherwise the guard belongs to some other unrelated condition).
  const window = noComments.slice(guardIdx, guardIdx + 1200);
  assert.ok(
    window.includes("DOUBLE_CLICK_EVENT"),
    "WORK_ORDERS guard branch references DOUBLE_CLICK_EVENT (hardware-reliable gesture per Phase 45 retro)",
  );
  // Non-empty-list path: the body calls navigateToTaskDetail with index 0
  // (top-of-list convention from Phase 124 D-08 COMPANION).
  assert.ok(
    window.includes("navigateToTaskDetail(0,"),
    "WORK_ORDERS DOUBLE_CLICK branch calls navigateToTaskDetail(0, bridge) for the first task",
  );
  // The branch reads from getLastFetchedTasks() — the same source that
  // navigateToTaskDetail itself reads from (navigation.ts:196).
  assert.ok(
    window.includes("getLastFetchedTasks"),
    "WORK_ORDERS DOUBLE_CLICK branch reads getLastFetchedTasks() to bounds-check the index-0 entry",
  );
});

test("GAP-129-F (case B): WORK_ORDERS DOUBLE_CLICK carve-out falls through on empty list (no early return swallows the event)", () => {
  // Acceptance criterion (plan §<acceptance_criteria> item 3): "The new block
  // FALLS THROUGH (no `else return`) on empty list, allowing the bottom
  // switch to navigate to HOME." The empty-list check must be conditional —
  // either `if (tasks.length === 0) return` would be WRONG (it swallows the
  // event without falling through). The correct shape calls navigateToTaskDetail
  // ONLY inside a `tasks.length` positive branch and otherwise lets execution
  // fall past the carve-out into the default switch at line ~298.
  const guardIdx = noComments.indexOf("currentScreen === Screen.WORK_ORDERS");
  assert.ok(guardIdx >= 0, "WORK_ORDERS DOUBLE_CLICK guard present");
  const window = noComments.slice(guardIdx, guardIdx + 1200);
  // The carve-out must reference `.length` (the bounds check on getLastFetchedTasks).
  assert.ok(
    /tasks\.length|\.length/.test(window),
    "WORK_ORDERS carve-out checks .length on getLastFetchedTasks() before calling navigateToTaskDetail",
  );
  // The default switch BELOW this carve-out must still contain the
  // DOUBLE_CLICK_EVENT → Screen.HOME line — that is the fall-through target
  // for the empty-list path. (Lock the existing default behavior in place.)
  const defaultSwitchIdx = noComments.indexOf("case OsEventTypeList.DOUBLE_CLICK_EVENT:");
  assert.ok(
    defaultSwitchIdx > guardIdx,
    "Default switch `case OsEventTypeList.DOUBLE_CLICK_EVENT:` appears AFTER the WORK_ORDERS carve-out (fall-through target)",
  );
  // The line immediately following the default DOUBLE_CLICK case must assign
  // Screen.HOME — preserving the empty-list fall-through behavior.
  const defaultBranchWindow = noComments.slice(defaultSwitchIdx, defaultSwitchIdx + 200);
  assert.ok(
    defaultBranchWindow.includes("Screen.HOME"),
    "Default DOUBLE_CLICK branch routes to Screen.HOME (the empty-list fall-through target)",
  );
});

test("GAP-129-F: WORK_ORDERS carve-out ordering — appears BEFORE the bottom `let target: ScreenName` switch", () => {
  // Source-ordering invariant from plan §<interfaces> "Insertion point":
  //   1. TASK_DETAIL sub-screen handling
  //   2. HOME DOUBLE_CLICK → shutDownPageContainer
  //   3. COMPANION carve-out
  //   4. VOICE_SPIKE carve-out
  //   5. NEW: WORK_ORDERS carve-out (this plan)
  //   6. Default `let target: ScreenName` switch
  const workOrdersGuardIdx = noComments.indexOf("currentScreen === Screen.WORK_ORDERS");
  const letTargetIdx = noComments.search(/let\s+target\s*:\s*ScreenName/);
  assert.ok(workOrdersGuardIdx > 0, "WORK_ORDERS carve-out present");
  assert.ok(letTargetIdx > 0, "`let target: ScreenName` default-switch declaration present");
  assert.ok(
    workOrdersGuardIdx < letTargetIdx,
    "WORK_ORDERS carve-out MUST appear BEFORE the default switch (otherwise default DOUBLE_CLICK→HOME would intercept the gesture and the carve-out would be unreachable)",
  );
  // Also assert it sits AFTER the VOICE_SPIKE carve-out (the immediately
  // preceding carve-out per the plan's <interfaces> ordering).
  const voiceSpikeIdx = noComments.indexOf("currentScreen === Screen.VOICE_SPIKE");
  assert.ok(voiceSpikeIdx > 0, "VOICE_SPIKE carve-out present (predecessor)");
  assert.ok(
    voiceSpikeIdx < workOrdersGuardIdx,
    "WORK_ORDERS carve-out MUST appear AFTER VOICE_SPIKE (plan-mandated ordering)",
  );
});

test("GAP-129-F: WORK_ORDERS carve-out comment block references Phase 124 D-08, Phase 45, and GAP-129-F", () => {
  // The acceptance criterion (plan §<acceptance_criteria>): "The new comment
  // block references at least: 'Phase 124 D-08', 'Phase 45', 'GAP-129-F'
  // (literal substring matches in the comment text)." Drift detector reads
  // the RAW source (not the comment-stripped variant) because these literals
  // live inside the comment block above the new carve-out.
  // Use a windowed slice around the WORK_ORDERS guard so a stray "Phase 45"
  // reference elsewhere in the file cannot satisfy this check.
  const guardIdx = src.indexOf("currentScreen === Screen.WORK_ORDERS");
  assert.ok(guardIdx >= 0, "WORK_ORDERS DOUBLE_CLICK guard present in raw source");
  // Comment block is the ~2500 chars BEFORE the guard. Width is empirical:
  // the new carve-out's comment header runs ~50 lines and the GAP-129-F
  // literal sits at the top, so a tighter window misses the gap reference.
  const commentWindow = src.slice(Math.max(0, guardIdx - 2500), guardIdx);
  assert.ok(
    commentWindow.includes("Phase 124 D-08"),
    "Comment block above WORK_ORDERS carve-out references Phase 124 D-08 (the structural template)",
  );
  assert.ok(
    commentWindow.includes("Phase 45"),
    "Comment block references Phase 45 retro (CLICK_EVENT sim-only rationale)",
  );
  assert.ok(
    commentWindow.includes("GAP-129-F"),
    "Comment block references GAP-129-F (the gap-closure this implements)",
  );
});
