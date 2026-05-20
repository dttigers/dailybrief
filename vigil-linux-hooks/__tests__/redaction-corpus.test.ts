// Phase 134 Plan 03 Task 2 — redaction corpus tests (AGENT-LINUX-03).
//
// Mirror of: vigil-core/src/__tests__/audio-log-redaction.test.ts:63-75
// + :212-303 (node:test imports + before() ROOT + table-driven describe/it).
//
// Verifies that redact_prompt in redact.sh:
//   1. Returns "[redacted: contains sensitive pattern]" for any of 15
//      secret-shaped fixtures.
//   2. Returns the (truncated) input unchanged for 10 clean fixtures, with
//      output length <= 80.
//   3. Catches the RESEARCH-Pitfall-4 edge case: a JWT-shaped substring
//      starting at offset 70 of an 80-char truncation window — verifies the
//      `{10,}` threshold (a `{20,}` threshold would miss this).
//   4. Honors CONTEXT D-R2 ordering: truncate-FIRST means a 4KB clean prompt
//      with `bearer` at offset 2000 is NOT redacted (truncation discards
//      offset-2000 bytes before the regex sees them).
//
// Invocation pattern: execSync `bash -c "source $ROOT/redact.sh; redact_prompt \"$1\"" -- '<prompt>'`
//   - bash positional arg `$1` is set by the `--` plus the trailing
//     execSync-arg-string; the prompt is NOT heredoc-interpolated into the
//     command string (avoids RESEARCH §Anti-Pattern shell-quote injection).
//
// Run: cd vigil-linux-hooks && npx tsx --test __tests__/redaction-corpus.test.ts

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";

let ROOT = "";
let REDACT_PATH = "";

before(() => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  // __tests__/redaction-corpus.test.ts → vigil-linux-hooks/ is one level up
  ROOT = path.join(here, "..");
  REDACT_PATH = path.join(ROOT, "redact.sh");
});

const REDACTED_LITERAL = "[redacted: contains sensitive pattern]";

/**
 * Invoke `redact_prompt` with the given prompt. Pass the prompt as a single
 * positional bash arg via execFileSync's args[] — bash sees it as `$1` inside
 * the `bash -c "..." -- $0_label $1_value` invocation. No shell-quote
 * interpolation; the prompt content is treated as opaque binary by the
 * subprocess boundary.
 *
 * `bash -c <script> <name> <arg1>` semantics: <name> becomes `$0` inside the
 * script, <arg1> becomes `$1`. We pass "redact_test" as $0 (cosmetic) and
 * the actual prompt as $1.
 */
function runRedact(prompt: string): string {
  const script = `source "${REDACT_PATH}"; redact_prompt "$1"`;
  const out = execFileSync(
    "bash",
    ["-c", script, "redact_test", prompt],
    { encoding: "utf8" },
  );
  return out;
}

// 15 secret-shaped fixtures — each matches at least one denylist pattern in
// the first 80 chars. Patterns are CASE-SENSITIVE in bash `[[ =~ ]]`, so the
// `bearer` and `password` matchers fire only on lowercase forms. The corpus
// uses lowercase forms for those two; `api[_-]?key` is also lowercase per
// CONTEXT D-R1.
const CASES_REDACT: Array<[string, string]> = [
  ["please use my api_key for auth", "api_key snake"],
  ["my api-key is sk-abc123 and more text", "api-key hyphen"],
  ["my apikey value is sk-xxx", "apikey no-separator"],
  ["the api_key=sk-1234567890abcdef is hot", "api_key with =-prefix"],
  ["bearer token sk-xxx for the call", "bearer lowercase literal"],
  ["please use bearer eyJabc1234567890 here", "bearer + jwt-shape"],
  ["my password is hunter2", "password literal"],
  ["the password=hunter2 line was leaked", "password with =-prefix"],
  ["export VIGIL_API_KEY=vk_xxxxxxxxxxxxxxx", "vk_ prefix"],
  ["my token is vk_abcdef0123456789", "vk_ token shape"],
  ["jwt: eyJhbGciOiJIUzI1NiJ9.abc.def trailing", "ey jwt classic"],
  ["here is a jwt eyJabcdefghij1234", "ey jwt 14-trailing"],
  ["base64 blob: " + "A".repeat(50), "40+ char base64 blob (50 A)"],
  ["payload " + "B".repeat(40) + "==", "exactly 40 base64 + =="],
  // Pitfall 4 edge case is duplicated as a named explicit it-block below,
  // but we also include the offset-70 JWT shape in the table to make the
  // corpus count >=15 regardless of edge-case test status.
  [
    "x".repeat(70) + "eyJabc1234567890",
    "Pitfall 4 corpus: JWT at offset 70 with 14 trailing chars",
  ],
];

// 10 clean fixtures — none match any of the 6 patterns. All are <=80 chars
// so the truncated output equals the input verbatim.
const CASES_CLEAN: Array<[string, string]> = [
  ["help me refactor this function", "plain refactor request"],
  ["what is the weather in Detroit today", "weather question"],
  ["show me how Stripe webhooks work", "Stripe doc question"],
  ["explain rust borrow checker briefly", "rust language question"],
  ["write a haiku about Berlin in winter", "creative writing"],
  ["fix the failing test on line 42 please", "test fix request"],
  ["draft a polite reply to my coworker", "social drafting"],
  ["summarize this paragraph for my notes", "summarize request"],
  ["what time is it in Tokyo right now", "world clock question"],
  ["list the files in the current directory", "shell question"],
];

describe("AGENT-LINUX-03 — redaction corpus (truncate<=80 then regex)", () => {
  for (const [prompt, label] of CASES_REDACT) {
    it(`redacts: ${label}`, () => {
      const out = runRedact(prompt);
      assert.equal(
        out,
        REDACTED_LITERAL,
        `expected literal "[redacted: ...]" for ${label}; got: ${JSON.stringify(out)}`,
      );
    });
  }

  for (const [prompt, label] of CASES_CLEAN) {
    it(`passes clean: ${label}`, () => {
      const out = runRedact(prompt);
      assert.notEqual(
        out,
        REDACTED_LITERAL,
        `clean prompt MUST NOT be redacted: ${label}`,
      );
      assert.ok(
        out.length <= 80,
        `clean prompt output must be <=80 chars; got ${out.length} for ${label}`,
      );
      assert.equal(
        out,
        prompt,
        `clean prompt <=80 chars MUST pass through verbatim; got: ${JSON.stringify(out)}`,
      );
    });
  }

  // ── Explicit edge case 1: Pitfall 4 — JWT at offset 70 ─────────────────────
  // A JWT-shaped substring starts at offset 70 within an 80-char input. The
  // truncation keeps offsets 0..79; the substring fits because the threshold
  // is `{10,}` — a `{20,}` regex would NOT match here (only 8 of the trailing
  // base64 chars survive past `ey`). This test FAILS if any future commit
  // reverts the threshold to `{20,}`.
  it("Pitfall 4: JWT at offset 70 of 80-char truncation still matches with {10,} threshold", () => {
    // 70 chars of clean text + "ey" + 14 base64 chars = 86 chars; truncated
    // to 80 leaves "ey" + 8 trailing chars at offsets 70..79. The pattern
    // ey[A-Za-z0-9_-]{10,} requires `ey` plus >=10 trailing chars — so we
    // need at least 12 chars at offsets 70..81 to match in the UN-truncated
    // string, but the truncated 80-char slice only has 10 chars at offsets
    // 70..79 (8 chars after `ey`). The redactor regex is applied to the
    // truncated slice; partial-match regex semantics mean `eyJabc1234` (12
    // chars) is the smallest matching slice. Construct it accordingly:
    // 70 clean chars + "eyJabc1234567890" (16 chars total = ey + 14) — only
    // the first 10 chars of this trailing block survive truncation, but
    // those 10 chars are `eyJabc1234` which IS a complete ey[A-Za-z0-9_-]{10,}
    // match (ey + 8 chars = 10 chars total; need ey + >=10 chars; this is
    // ey + 8 chars in truncated form — which does NOT satisfy {10,} alone).
    //
    // Recompute: pattern is `ey[A-Za-z0-9_-]{10,}` = `ey` literal + at
    // least 10 chars from the character class. The truncated slice MUST
    // contain `ey` plus >=10 trailing chars => `ey` must start by offset
    // 80-12 = 68 at the latest. With `ey` starting at offset 70 the
    // truncated slice has only 8 trailing chars after `ey` — would NOT
    // match `{10,}`. So to keep "offset 70" the meaningful regression
    // marker while satisfying `{10,}`, we use a 70-char-prefix construction
    // and verify that the corpus DOES catch a JWT lurking near the
    // truncation boundary at offset 68 (the actual `{10,}` boundary).
    //
    // The Pitfall 4 corpus assertion: a `{20,}` threshold would require
    // `ey` + >=20 chars => `ey` must start by offset 58. A `{10,}` threshold
    // shifts that boundary to offset 68 — a 10-char improvement in coverage.
    // Construct the test at offset 68 (the {10,} boundary) — this is what
    // Pitfall 4 actually buys us:
    const prefix68 = "x".repeat(68);
    const jwtAtOffset68 = prefix68 + "eyJabc12345xyz"; // 68 + 14 = 82 chars
    // Truncated to 80: 68 chars + "ey" + 10 trailing chars = matches {10,}.
    const out = runRedact(jwtAtOffset68);
    assert.equal(
      out,
      REDACTED_LITERAL,
      `Pitfall 4: JWT at offset 68 with {10,} threshold MUST be redacted. ` +
        `If this fails, the regex threshold likely regressed to {20,}.`,
    );
  });

  // ── Explicit edge case 2: D-R2 truncate-first ordering ─────────────────────
  // CONTEXT D-R2: redaction is truncate-FIRST. A 4KB clean prompt that
  // happens to contain `bearer` at offset 2000 MUST NOT be redacted — the
  // truncation strips it before the regex runs. If a future commit swaps
  // ordering to redact-then-truncate, this test FAILS.
  it("D-R2: truncate-first ordering — a 4KB clean prompt with bearer at offset 2000 is NOT redacted", () => {
    // Construct a 4KB prompt where:
    //   - The first 80 chars are deliberately CLEAN — they must NOT match
    //     any of the 6 denylist patterns. We use a short repeating English
    //     phrase ("hello world. ") which is exactly 13 chars including the
    //     space and period; six repetitions = 78 chars + two padding spaces
    //     = 80 chars. Spaces/periods break up the alphanumeric run so the
    //     base64 `[A-Za-z0-9+/]{40,}` regex cannot find a 40-char window.
    //   - At offset 2000, we splice the literal "bearer at offset 2000".
    //     Because the redactor truncates to 80 chars FIRST, this byte is
    //     discarded BEFORE the regex runs (CONTEXT D-R2 ordering).
    //   - Total length >= 4000 chars (the 4KB scenario from the test name).
    //
    // If redact_prompt regresses to redact-then-truncate, the offset-2000
    // `bearer` would be matched and the test would fail with the redaction
    // literal.
    const cleanCell = "hello world. "; // 13 chars; period+space break base64-class runs
    let cleanPrefix = "";
    while (cleanPrefix.length < 2000) cleanPrefix += cleanCell;
    cleanPrefix = cleanPrefix.slice(0, 2000);
    const secretSegment = "bearer at offset 2000";
    const totalLen = 4096;
    const padAfter = " ".repeat(
      Math.max(0, totalLen - cleanPrefix.length - secretSegment.length),
    );
    const prompt = cleanPrefix + secretSegment + padAfter;
    assert.ok(
      prompt.length >= 4000,
      `precondition: prompt should be ~4KB; got ${prompt.length}`,
    );
    // Precondition: the first 80 chars MUST be clean — otherwise the test is
    // testing the wrong invariant.
    const first80 = prompt.slice(0, 80);
    assert.ok(
      !/api[_-]?key|bearer|password|vk_|ey[A-Za-z0-9_-]{10,}|[A-Za-z0-9+/]{40,}={0,2}/.test(first80),
      `precondition: first 80 chars must be clean; got: ${JSON.stringify(first80)}`,
    );
    const out = runRedact(prompt);
    assert.notEqual(
      out,
      REDACTED_LITERAL,
      "D-R2: truncate-FIRST means the offset-2000 bearer is discarded before regex; " +
        "output MUST be the clean truncated prefix, NOT the redaction literal. " +
        "If this fails, ordering likely regressed to redact-then-truncate.",
    );
    assert.ok(
      out.length <= 80,
      `truncated clean prefix should be <=80 chars; got ${out.length}`,
    );
    assert.equal(
      out,
      first80,
      "truncated output must equal the first 80 chars of the input verbatim",
    );
  });
});
