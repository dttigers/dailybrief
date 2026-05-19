// Phase 134 Plan 04 Task 2 — redaction-drift detector (AGENT-LINUX-06).
//
// Source-grep parity test across three sources:
//   Rail 0: anti-trivial-pass smoke test — `required[]` is 6-long AND
//           contains the literal `ey[A-Za-z0-9_-]{10,}` (NOT {20,}).
//   Rail 1: redaction-patterns.json contains all 6 canonical patterns +
//           max_length === 80 (T-134-R3 mitigation).
//   Rail 2: redact.sh references the canonical JSON file (no hardcoded
//           pattern list inline — drift detector pin per CONTEXT D-R4).
//   Rail 3: (cross-repo) vigil-watch/Sources/VigilWatch/Redactor.swift
//           contains every pattern. SOFT-SKIP with console.warn when the
//           file is absent (Phase 133 not yet shipped).
//
// When Phase 133 lands, the cross-repo plan flips Rail 3 from soft-skip
// to hard-fail to enforce byte-for-byte parity across Linux hook + macOS
// daemon.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

let ROOT = "";
before(() => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // __tests__/redaction-drift.test.ts → vigil-linux-hooks/ is one level up
  ROOT = path.join(here, "..");
});

// The 6 canonical WATCH-ENRICH-03 patterns. The JWT threshold MUST be
// `{10,}` per RESEARCH Pitfall 4 — a JWT-shaped substring starting at
// offset 68 of the 80-char truncation window only has 12 trailing chars
// (ey + 10); `{20,}` would miss it.
const required = [
  "api[_-]?key",
  "bearer",
  "password",
  "vk_",
  "ey[A-Za-z0-9_-]{10,}",
  "[A-Za-z0-9+/]{40,}={0,2}",
];

describe("AGENT-LINUX-06 — redaction pattern parity", () => {
  it("Rail 0: required[] array contains 6 patterns — anti-trivial-pass guard", () => {
    assert.equal(required.length, 6, "required[] must contain exactly 6 patterns");
    assert.ok(
      required.includes("ey[A-Za-z0-9_-]{10,}"),
      "JWT threshold must be {10,} — reverting to {20,} fails Pitfall 4 corpus"
    );
    assert.equal(
      required.includes("ey[A-Za-z0-9_-]{20,}"),
      false,
      "JWT threshold must NOT be {20,} (anti-regression guard)"
    );
  });

  it("Rail 1: redaction-patterns.json contains all six WATCH-ENRICH-03 patterns", () => {
    const json = JSON.parse(
      readFileSync(path.join(ROOT, "redaction-patterns.json"), "utf8")
    );
    for (const p of required) {
      assert.ok(
        json.patterns.includes(p),
        `redaction-patterns.json must contain "${p}" per AGENT-LINUX-06`
      );
    }
    assert.equal(
      json.max_length,
      80,
      "max_length must be 80 per AGENT-LINUX-03 (WATCH-ENRICH-03 truncation cap)"
    );
  });

  it("Rail 2: redact.sh references redaction-patterns.json (no hardcoded list)", () => {
    const src = readFileSync(path.join(ROOT, "redact.sh"), "utf8");
    assert.match(
      src,
      /redaction-patterns\.json/,
      "redact.sh must read from canonical JSON source — drift-detector pin (CONTEXT D-R4)"
    );
  });

  it("Rail 3: (cross-repo) vigil-watch source contains same pattern list — SKIP if not yet shipped", () => {
    // Phase 133 cross-repo coordination — the Swift redactor will land in a
    // separate repo. Soft-skip with console.warn when the file is absent so
    // CI on the Linux box does not require vigil-watch to be checked out.
    const watchPath = path.join(
      ROOT,
      "..",
      "..",
      "vigil-watch",
      "Sources",
      "VigilWatch",
      "Redactor.swift"
    );
    let src: string;
    try {
      src = readFileSync(watchPath, "utf8");
    } catch {
      console.warn(
        "[skip] vigil-watch not present — Phase 133 not yet shipped"
      );
      return;
    }
    const json = JSON.parse(
      readFileSync(path.join(ROOT, "redaction-patterns.json"), "utf8")
    );
    for (const p of json.patterns) {
      // Escape regex metacharacters in p so we can grep for the LITERAL
      // pattern string in the Swift source (the Swift source contains the
      // raw regex literal as a String). The replace() escapes . * + ? ^ $
      // { } ( ) | [ ] \ — the canonical regex-escape idiom.
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(
        src,
        new RegExp(escaped),
        `vigil-watch Redactor.swift must contain pattern "${p}" (Phase 133 cross-repo parity)`
      );
    }
  });
});
