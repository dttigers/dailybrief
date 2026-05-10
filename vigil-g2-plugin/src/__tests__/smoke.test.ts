// Phase 124 Plan 01 — smoke test: confirms node:test + tsx runner works.
// Mirrors vigil-core/src/routes/agent-events.test.ts:1-15 import pattern.
import { test } from "node:test";
import assert from "node:assert/strict";

test("smoke: node:test runner executes", () => {
  assert.equal(1 + 1, 2);
});

test("smoke: TypeScript types compile under tsx loader", () => {
  const x: number = 42;
  assert.equal(x, 42);
});
