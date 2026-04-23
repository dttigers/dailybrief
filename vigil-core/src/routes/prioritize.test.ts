// Unit tests for prioritize.ts cache-key scoping (Phase 109 SCHED-01 D-15).
// Run with: npx tsx --test src/routes/prioritize.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { getCacheKey, type WorkOrder } from "./prioritize.js";

// ── Fixture ─────────────────────────────────────────────────────────────────

function makeWorkOrders(): WorkOrder[] {
  return [
    {
      caseNumber: "CS0353601",
      store: "Store 1234",
      shortDescription: "HVAC not cooling",
      trade: "HVAC",
      location: "Back room",
      equipment: "Rooftop unit",
      priority: "High",
      contact: "John Doe",
      state: "Open",
    },
    {
      caseNumber: "CS0353598",
      store: "Store 5678",
      shortDescription: "Leaking faucet",
      trade: "Plumbing",
      location: "Men's restroom",
      equipment: "Faucet",
      priority: "Medium",
      contact: "Jane Roe",
      state: "Open",
    },
  ];
}

// ── CACHE-01: cross-user isolation (D-15 literal) ──────────────────────────

test("CACHE-01: getCacheKey yields different filenames for different userIds with identical workOrders", () => {
  const wo = makeWorkOrders();
  const keyForUser1 = getCacheKey(1, wo);
  const keyForUser2 = getCacheKey(2, wo);
  assert.notEqual(
    keyForUser1,
    keyForUser2,
    `cache filenames must differ by userId; got identical key ${keyForUser1} for both users`,
  );
  // Additional belt-and-suspenders: userId appears literally in the filename.
  assert.ok(keyForUser1.includes("-1-"), `user 1 cache key must contain '-1-'; got ${keyForUser1}`);
  assert.ok(keyForUser2.includes("-2-"), `user 2 cache key must contain '-2-'; got ${keyForUser2}`);
});

// ── CACHE-02: filename shape matches D-08 pattern ──────────────────────────

test("CACHE-02: getCacheKey filename matches the wo-priority-{userId}-{YYYY-MM-DD}-{hex}.json pattern", () => {
  const key = getCacheKey(1, makeWorkOrders());
  // Pattern: wo-priority-<userId:digits>-<YYYY-MM-DD>-<32-hex>.json
  const pattern = /^wo-priority-\d+-\d{4}-\d{2}-\d{2}-[a-f0-9]{32}\.json$/;
  assert.match(key, pattern, `cache filename shape mismatch; got ${key}`);
  assert.ok(key.startsWith("wo-priority-1-"), `filename must start with 'wo-priority-1-'; got ${key}`);
  assert.ok(key.endsWith(".json"), `filename must end with '.json'; got ${key}`);
});
