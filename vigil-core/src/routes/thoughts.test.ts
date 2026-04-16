/**
 * Integration tests for GET /thoughts week-window default + bypasses.
 *
 * Harness approach: DEGRADED (no shared test-DB infrastructure exists in this
 * repo). Tests split into three tiers:
 *
 *   1. RO-08 — file-contents sentinel (zero deps; always runs).
 *   2. RO-06, RO-07 — unit tests of the exported `shouldBypassWindow` pure
 *      predicate. No DB, no HTTP server needed.
 *   3. RO-01..RO-05 — seed-and-query integration tests. Skipped until a shared
 *      test-DB harness is introduced. Manual verification: see RESEARCH.md
 *      §"ROLLOVER-01 route-level verification" for the curl probe commands.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldBypassWindow } from "./thoughts.js";

// ── RO-01..RO-05: Seed-and-query (skipped — no test DB harness) ───────────────

test.skip("RO-01: bare GET /thoughts returns only current-week thoughts (no harness)", () => {
  // Seed: thought at now (expect returned) + thought at now-60d (expect excluded).
  // Verify: bare GET without query params returns only the recent thought.
  // Manual probe: curl -s "$VIGIL_URL/v1/thoughts" -H "Authorization: Bearer $KEY" | jq '.total'
});

test.skip("RO-02: GET /thoughts?q=oldterm bypasses window — both new and 60d-old thoughts returned", () => {
  // Seed two thoughts containing "oldterm" at now and now-60d.
  // Both should appear because ?q= bypasses the window.
});

test.skip("RO-03: GET /thoughts?after=1970-01-01T00:00:00Z bypasses window — both thoughts returned", () => {
  // Explicit ?after= causes bypassWindow = true regardless of date age.
});

test.skip("RO-04: GET /thoughts?before=2099-01-01T00:00:00Z bypasses window — both thoughts returned", () => {
  // Explicit ?before= causes bypassWindow = true regardless of date age.
});

test.skip("RO-05: GET /thoughts?window=all bypasses window — both thoughts returned", () => {
  // ?window=all is the explicit escape hatch (D-07).
});

// ── RO-06: shouldBypassWindow — invalid ?window value does NOT bypass ─────────

test("RO-06: shouldBypassWindow — window=anything-else does NOT bypass (falls through to default)", () => {
  // Only "all" is special; any other string (including misspellings, "current", "week")
  // must return false so the default window is applied.
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: undefined, category: undefined, window: "current" }), false);
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: undefined, category: undefined, window: "week" }), false);
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: undefined, category: undefined, window: "ALL" }), false, "case-sensitive: 'ALL' must not bypass");
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: undefined, category: undefined, window: "" }), false, "empty string must not bypass");
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: undefined, category: undefined, window: undefined }), false, "undefined (absent param) must not bypass");
});

test("RO-06b: shouldBypassWindow — window=all DOES bypass", () => {
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: undefined, category: undefined, window: "all" }), true);
});

test("RO-06c: shouldBypassWindow — category=idea bypasses window (ideas are open-ended)", () => {
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: undefined, category: "idea", window: undefined }), true);
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: undefined, category: "task", window: undefined }), false, "non-idea categories still use window");
});

// ── RO-07: shouldBypassWindow — ?q, ?after, ?before each bypass independently ─

test("RO-07: shouldBypassWindow — q bypasses window", () => {
  assert.equal(shouldBypassWindow({ q: "searchterm", after: undefined, before: undefined, category: undefined, window: undefined }), true);
});

test("RO-07b: shouldBypassWindow — after bypasses window", () => {
  assert.equal(shouldBypassWindow({ q: undefined, after: "2024-01-01T00:00:00Z", before: undefined, category: undefined, window: undefined }), true);
});

test("RO-07c: shouldBypassWindow — before bypasses window", () => {
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: "2099-01-01T00:00:00Z", category: undefined, window: undefined }), true);
});

test("RO-07d: shouldBypassWindow — no params = no bypass (default window applies)", () => {
  assert.equal(shouldBypassWindow({ q: undefined, after: undefined, before: undefined, category: undefined, window: undefined }), false);
});

// ── RO-08: Chat.ts sentinel — ROLLOVER-03 lock ────────────────────────────────

test("RO-08: chat.ts does not route through /thoughts (ROLLOVER-03 sentinel)", () => {
  // Chat uses a direct Drizzle query (db.select().from(thoughtsTable)...), NOT
  // the HTTP /thoughts route. If a future refactor accidentally routes Chat
  // through GET /thoughts it would apply the week-window filter, breaking Chat
  // context injection. This assertion locks that regression in as a test failure.
  const chatSrc = readFileSync(
    new URL("./chat.ts", import.meta.url),
    "utf8"
  );
  assert.equal(
    chatSrc.includes("getCurrentWeekWindow"),
    false,
    "chat.ts must not import or call getCurrentWeekWindow — Chat bypasses the week window by design"
  );
  assert.equal(
    chatSrc.includes("window=all"),
    false,
    "chat.ts must not use window=all — Chat uses direct Drizzle, not the /thoughts HTTP route"
  );
});
