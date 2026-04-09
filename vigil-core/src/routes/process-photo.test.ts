import { test } from "node:test";
import assert from "node:assert/strict";
import { processClaudeResponse } from "./process-photo.js";

test("PHOTO-01/PHOTO-02: lined paper returns multi-thought split with confidence", () => {
  const raw = JSON.stringify({
    paperType: "lined",
    confidence: 0.92,
    thoughts: ["- call mom", "- pay rent", "- email dave"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "lined");
  assert.equal(result.confidence, 0.92);
  assert.equal(result.thoughts.length, 3);
  assert.deepEqual(result.thoughts, ["- call mom", "- pay rent", "- email dave"]);
});

test("PHOTO-03: gridded paper returns exactly one thought", () => {
  const raw = JSON.stringify({
    paperType: "gridded",
    confidence: 0.88,
    thoughts: ["Long design note about architecture..."],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "gridded");
  assert.equal(result.thoughts.length, 1);
});

test("PHOTO-04: verbatim preserved — strict string equality, no rewrite", () => {
  const raw = JSON.stringify({
    paperType: "lined",
    confidence: 0.9,
    thoughts: ["I need to call mom"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.thoughts[0], "I need to call mom");
});

test("D-04: confidence<0.5 with gridded label is treated as lined (split preserved)", () => {
  const raw = JSON.stringify({
    paperType: "gridded",
    confidence: 0.3,
    thoughts: ["item a", "item b", "item c"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "gridded"); // preserved for UI transparency
  assert.equal(result.confidence, 0.3);
  assert.equal(result.thoughts.length, 3); // but effective behavior = lined split
});

test("D-04: paperType 'unknown' falls back to lined split", () => {
  const raw = JSON.stringify({
    paperType: "unknown",
    confidence: 0.9,
    thoughts: ["a", "b"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.thoughts.length, 2);
});

test("D-04 defensive: high-confidence gridded with >1 thoughts collapses to one", () => {
  const raw = JSON.stringify({
    paperType: "gridded",
    confidence: 0.95,
    thoughts: ["one", "two", "three"],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.thoughts.length, 1);
  assert.ok(result.thoughts[0].includes("one"));
  assert.ok(result.thoughts[0].includes("three"));
});

test("D-08: parse failure on preamble prose falls back to single raw thought", () => {
  const raw = "Here is the JSON: a shopping list I guess";
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "unknown");
  assert.equal(result.confidence, 0);
  assert.equal(result.thoughts.length, 1);
  assert.equal(result.thoughts[0], raw.trim());
});

test("D-08: truncated JSON falls back to raw text", () => {
  const raw = '{"paperType":"lined","confidence":0.9,"thoughts":["call mom';
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "unknown");
  assert.equal(result.thoughts.length, 1);
});

test("D-08: empty thoughts array falls back to raw text", () => {
  const raw = JSON.stringify({
    paperType: "lined",
    confidence: 0.9,
    thoughts: [],
  });
  const result = processClaudeResponse(raw);
  assert.equal(result.thoughts.length, 1);
});

test("D-08: missing paperType and confidence default safely", () => {
  const raw = JSON.stringify({ thoughts: ["x"] });
  const result = processClaudeResponse(raw);
  assert.equal(result.paperType, "unknown");
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.thoughts, ["x"]);
});

test("thought strings are trimmed; empty-after-trim entries are dropped", () => {
  const raw = JSON.stringify({
    paperType: "lined",
    confidence: 0.9,
    thoughts: ["  item 1  ", "\n- item 2\n", "   "],
  });
  const result = processClaudeResponse(raw);
  assert.deepEqual(result.thoughts, ["item 1", "- item 2"]);
});
