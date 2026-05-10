// Phase 124 Plan 08 — main.ts drift detectors + hasActiveSession unit tests.
//
// W-1 portability fix (cf. Plan 07 navigation.test.ts): comment-stripped
// source content is the asserted surface — BSD grep / GNU grep parity on
// macOS + CI.
//
// Why hasActiveSession is imported from `../lib/launch-source-helpers.ts`
// (NOT `../main.ts`):
//   - main.ts has top-level side effects from the Even Hub SDK
//     (`EvenAppBridge.getInstance()` + `bridge.onLaunchSource(...)` +
//     `createSseClient(...)`) that ONLY work inside a WKWebView host.
//   - `await import("../main.ts")` from `node:test` would crash at
//     module-eval time. Plan 08 anticipated this and prescribed the
//     extraction-into-helpers escape hatch.
//   - main.ts re-exports `hasActiveSession` + `pickInitialScreen` from the
//     helpers file, so the public-facing import contract is preserved.
//   - The test imports the helper directly (clean, side-effect-free) and
//     asserts the drift detectors against `main.ts` source content.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { hasActiveSession } from "../lib/launch-source-helpers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_SRC = resolve(__dirname, "../main.ts");
const HELPERS_SRC = resolve(__dirname, "../lib/launch-source-helpers.ts");
const mainSrc = readFileSync(MAIN_SRC, "utf-8");
const helpersSrc = readFileSync(HELPERS_SRC, "utf-8");
// Strip both line + block comments so doc-comment mentions cannot mask a
// real code regression. Mirrors Phase 124 Plan 04 home.test.ts +
// Plan 07 navigation.test.ts idiom.
function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
const mainNoComments = stripComments(mainSrc);
const helpersNoComments = stripComments(helpersSrc);

// ── Drift detectors (CONTEXT D-06 + D-07) ───────────────────────────

test("D-07 drift: bridge.onLaunchSource is registered at MODULE SCOPE (top-level, before init)", () => {
  // The registration call must appear OUTSIDE any function declaration.
  // Heuristic: the line containing `onLaunchSource(` must come BEFORE
  // the first `function init` declaration. If a future ride-along
  // refactor moves the registration inside init(), the SDK's one-shot
  // launch-source push (fired ONCE after page-ready) will race the
  // registration and the value can be missed → wrong landing screen
  // on glassesMenu.
  const onLaunchIdx = mainNoComments.indexOf("onLaunchSource(");
  const initIdx = mainNoComments.search(/(?:async\s+)?function\s+init\s*\(/);
  assert.ok(onLaunchIdx > 0, "onLaunchSource registration found in main.ts");
  assert.ok(initIdx > 0, "init() declaration found");
  assert.ok(
    onLaunchIdx < initIdx,
    `onLaunchSource registration MUST precede function init() (D-07 module-scope)`,
  );
});

test("D-07 drift: launchSourcePromise declared at module scope", () => {
  // The Promise wrapper must live at module scope so the SDK push (fired
  // synchronously inside the bridge's queue, possibly before init() runs)
  // is captured into a queryable Promise. Inside init(), reach is too
  // late.
  assert.match(
    mainNoComments,
    /^const\s+launchSourcePromise/m,
    "launchSourcePromise declared at module scope",
  );
});

test("D-07 drift: 500ms timeout fallback resolves to 'appMenu'", () => {
  assert.match(
    mainNoComments,
    /setTimeout\s*\(\s*\(\s*\)\s*=>\s*r\(['"]appMenu['"]\)\s*,\s*500\s*\)/,
    "500ms timeout that resolves to 'appMenu' present",
  );
});

test("D-07 drift: init() uses Promise.race for launch-source timeout", () => {
  assert.match(
    mainNoComments,
    /Promise\.race/,
    "Promise.race wraps launchSourcePromise + timeout fallback",
  );
});

test("D-06 drift: 5-minute cutoff constant + terminal-event set in helpers", () => {
  // Literals live in launch-source-helpers.ts (extracted from main.ts so
  // node:test can import without SDK side effects). main.ts re-exports
  // the helpers, so the public-facing contract is preserved.
  assert.match(helpersNoComments, /5\s*\*\s*60\s*\*\s*1000/, "5-min cutoff");
  assert.match(
    helpersNoComments,
    /['"]task_complete['"]\s*,\s*['"]task_failed['"]/,
    "terminal-event filter set",
  );
});

test("D-06 drift: main.ts re-exports hasActiveSession + pickInitialScreen", () => {
  // The plan's public-facing contract is `import { hasActiveSession,
  // pickInitialScreen } from './main.ts'` — the extraction-into-helpers
  // is a private implementation detail. Re-exports preserve the contract.
  assert.match(
    mainNoComments,
    /export\s*\{[\s\S]*?hasActiveSession[\s\S]*?\}\s*from\s*['"]\.\/lib\/launch-source-helpers\.ts['"]/,
    "main.ts re-exports hasActiveSession from helpers",
  );
  assert.match(
    mainNoComments,
    /export\s*\{[\s\S]*?pickInitialScreen[\s\S]*?\}\s*from\s*['"]\.\/lib\/launch-source-helpers\.ts['"]/,
    "main.ts re-exports pickInitialScreen from helpers",
  );
});

test("Ordering: sseClient.connect() AFTER bridge.createStartUpPageContainer(", () => {
  // First paint must NOT block on SSE — the SSE client connects only
  // after the initial container is rendered. T-124-08-02 mitigation.
  const createIdx = mainNoComments.indexOf("createStartUpPageContainer(");
  const connectIdx = mainNoComments.indexOf("sseClient.connect(");
  assert.ok(createIdx > 0 && connectIdx > 0, "both calls present");
  assert.ok(
    connectIdx > createIdx,
    "SSE connects AFTER first paint to keep landing non-blocking",
  );
});

test("Bearer hygiene: main.ts contains no console.* references to Authorization/Bearer/vk_/API_KEY", () => {
  // T-124-08-03 mitigation. Drift detector replicating the security
  // posture from Plan 06 (sse-client.ts) at the main.ts level — covers
  // the SSE event handler's catch block.
  const banned = /console\.(log|warn|error|info)\s*\([^)]*(Authorization|Bearer|vk_|VITE_API_KEY|API_KEY|apiKey)/i;
  assert.ok(
    !banned.test(mainNoComments),
    "no bearer/API-key references in console logging",
  );
});

// ── Helper unit tests (D-06 active-session filter) ─────────────────

type AnyRow = {
  sessionId: string;
  label: string;
  host: string;
  lastEvent: { event: string; message: string | null; eventTimestamp: string };
  eventCount: number;
};

function fakeRow(
  over: Partial<AnyRow> & { event?: string; ageMs?: number } = {},
): AnyRow {
  const ageMs = over.ageMs ?? 0;
  const event = over.event ?? "heartbeat";
  return {
    sessionId: over.sessionId ?? "sid",
    label: over.label ?? "lbl",
    host: over.host ?? "host",
    lastEvent: {
      event,
      message: null,
      eventTimestamp: new Date(Date.now() - ageMs).toISOString(),
    },
    eventCount: over.eventCount ?? 1,
  };
}

test("hasActiveSession: heartbeat 2min ago → true", () => {
  const result = hasActiveSession(
    [fakeRow({ ageMs: 2 * 60 * 1000, event: "heartbeat" })] as never,
  );
  assert.equal(result, true);
});

test("hasActiveSession: heartbeat 6min ago → false (outside 5-min cutoff)", () => {
  const result = hasActiveSession(
    [fakeRow({ ageMs: 6 * 60 * 1000, event: "heartbeat" })] as never,
  );
  assert.equal(result, false);
});

test("hasActiveSession: task_complete 1min ago → false (terminal filter)", () => {
  const result = hasActiveSession(
    [fakeRow({ ageMs: 60 * 1000, event: "task_complete" })] as never,
  );
  assert.equal(result, false);
});

test("hasActiveSession: task_failed 30sec ago → false (terminal filter)", () => {
  const result = hasActiveSession(
    [fakeRow({ ageMs: 30 * 1000, event: "task_failed" })] as never,
  );
  assert.equal(result, false);
});

test("hasActiveSession: needs_input 1min ago → true", () => {
  const result = hasActiveSession(
    [fakeRow({ ageMs: 60 * 1000, event: "needs_input" })] as never,
  );
  assert.equal(result, true);
});

test("hasActiveSession: empty list → false", () => {
  assert.equal(hasActiveSession([] as never), false);
});

test("hasActiveSession: any-active wins (1 active + 1 terminal → true)", () => {
  const result = hasActiveSession([
    fakeRow({ sessionId: "old", event: "task_complete", ageMs: 60 * 1000 }),
    fakeRow({ sessionId: "new", event: "heartbeat", ageMs: 60 * 1000 }),
  ] as never);
  assert.equal(result, true);
});

test("hasActiveSession: now-injection — 5-min cutoff respects passed-in now", () => {
  // The ageMs path renders the timestamp relative to Date.now() at the
  // time fakeRow is called. If we pass in a `futureNow` that is 1h ahead
  // of when the row was generated, the row appears stale (1h old)
  // relative to `futureNow` and falls outside the 5-min cutoff.
  const row = fakeRow({ ageMs: 0, event: "heartbeat" });
  const futureNow = Date.now() + 60 * 60 * 1000; // 1h in the future
  const result = hasActiveSession([row] as never, futureNow);
  assert.equal(
    result,
    false,
    "5-min cutoff is relative to passed-in now (cutoff = futureNow - 5min)",
  );
});
