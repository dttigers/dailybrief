---
phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
plan: 03
subsystem: agent-events-bridge
tags: [bash, hook, claude-code, linux, agent-events, redaction, denylist, node-test, tsx-test, drift-detector, watch-enrich-03, jwt-pitfall-4]

# Dependency graph
requires:
  - phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
    plan: 01
    provides: "emit_event helper, --event= dispatch scaffold, VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 test-capture escape hatch"
  - phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
    plan: 02
    provides: "SessionStart → heartbeat / 'session started', Stop → task_complete / 'turn complete' wirings + per-event probe test template"
provides:
  - "Canonical redaction-patterns.json source-of-truth (6 WATCH-ENRICH-03 patterns + max_length=80) — Phase 133 vigil-watch will consume the same file cross-repo"
  - "Sourceable redact.sh with truncate-FIRST-then-binary-redact semantics — Phase 134 owns the WATCH-ENRICH-03 reference implementation"
  - "Wired UserPromptSubmit branch in vigil-agent-bridge.sh — AGENT-LINUX-03 complete; redact_prompt → emit_event 'heartbeat' '$REDACTED'"
  - "redaction-corpus.test.ts table-driven corpus (27 it-blocks): 15 secret-shaped + 10 clean + Pitfall-4 JWT-boundary + D-R2 truncate-first ordering"
  - "Full suite green: 37/37 tests passing in ~940ms (5 body-builder + 5 fail-safe + 27 corpus); zero new runtime dependencies"
affects: [134-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Truncate-FIRST-then-binary-redact via if-gated `[[ =~ ]]` regex (Pitfall 6 mitigation: no `set -euo pipefail`)"
    - "ASCII SOH (\\x01) delimiter between node `JSON.parse` output and bash IFS split — canonical safe handoff for pattern lists"
    - "execFileSync with positional-arg path (`bash -c <script> <name> <arg>`) — defeats shell-quote injection in test invocations"

key-files:
  created:
    - "vigil-linux-hooks/redaction-patterns.json (canonical 6-pattern denylist + max_length=80)"
    - "vigil-linux-hooks/redact.sh (sourceable; defines load_patterns + redact_prompt)"
    - "vigil-linux-hooks/__tests__/redaction-corpus.test.ts (27 it-blocks; 265 lines including the two edge-case docstrings)"
  modified:
    - "vigil-linux-hooks/vigil-agent-bridge.sh (+10/-3 lines: source redact.sh; UserPromptSubmit branch now redacts + emits real prompt)"

key-decisions:
  - "JWT threshold is `{10,}` (NOT `{20,}` per CONTEXT D-R1). RESEARCH Pitfall 4 is authoritative: a JWT-shaped substring starting at offset 68 of an 80-char truncation window has only `ey` + 10 trailing chars — `{20,}` would miss it. The corpus pins this at offset 68 (the actual `{10,}` boundary)."
  - "Pitfall-4 corpus edge-case placement: the test docstring originally said 'offset 70' (matching the brief's wording). Mathematically the `{10,}` boundary is offset 68: a {10,} pattern needs `ey` + 10 chars = 12 chars total in the truncated 80-char slice; that means `ey` must start at offset 80-12=68 at the latest. The test constructs a 68-char prefix + 14-char trailing JWT, and the corpus also includes a 70-char-prefix variant — both pass, the 68-char version is the precise boundary."
  - "D-R2 truncate-first test fixture rewritten mid-execution. First attempt used 2000 chars of `a` as the clean prefix — that incidentally created an 80-char run of `[A-Za-z0-9+/]` which matched the `{40,}` base64 pattern in the truncated slice, redacting the supposedly-clean prefix. Fixed by switching the prefix to a repeating `'hello world. '` phrase (period+space breaks base64-class runs). The test now correctly pins the truncate-FIRST invariant: 4KB prompt with `bearer` at offset 2000 produces the clean truncated 80-char prefix, NOT the redaction literal."
  - "execFileSync with positional bash args chosen over the brief's `bash -c \"... '${prompt.replace(/'/g, ...)}'\"` shell-quote-escape approach. Justification: the brief's escape sequence is brittle for prompts containing embedded `$` or backticks; execFileSync passes the prompt as a fully opaque argv element. RESEARCH §Anti-Pattern shell-quote-injection is satisfied."
  - "redact.sh keeps the header comment line `# patterns loaded from: redaction-patterns.json` verbatim — Rail 2 drift-detector pin (Plan 04 owns the drift detector test that greps for this string)."

patterns-established:
  - "Pattern 134-E: bash sourceable redactor — `_VIGIL_PATTERNS_FILE` constant resolved via `BASH_SOURCE[0]` + `dirname`; `load_patterns` invokes `node -e` with `PFILE=` env var; patterns joined by ASCII SOH for bash IFS split; `redact_prompt` does truncate-FIRST then `if [[ =~ ]]` regex loop. Phase 133 vigil-watch Swift parser will mirror this structure."
  - "Pattern 134-F: table-driven corpus test — `CASES_REDACT: Array<[string, string]>` + `CASES_CLEAN: Array<[string, string]>` arrays, looped into `it(\`label\`)` blocks. Plus explicit named edge-case `it(...)` calls for regression boundaries (Pitfall 4, D-R2). Mirrors vigil-core/src/__tests__/audio-log-redaction.test.ts:212-303 structurally."

requirements-completed:
  - AGENT-LINUX-03

# Metrics
duration: ~10min
completed: 2026-05-19
---

# Phase 134 Plan 03: Redaction subsystem (redact.sh + UserPromptSubmit wire-up + 27-case corpus) Summary

**Landed the WATCH-ENRICH-03 privacy redaction layer: `redaction-patterns.json` canonical source, `redact.sh` truncate-FIRST-then-binary-redact function, UserPromptSubmit branch wired to call redact_prompt → emit heartbeat, and a 27-case table-driven corpus that pins both the Pitfall-4 JWT-boundary regression guard and the D-R2 truncate-first ordering invariant. All 37 tests green in ~940ms.**

## Performance

- **Duration:** ~10 min (Task 1 plain bash + JSON; Task 2 included one debug round-trip on the D-R2 fixture — see Deviations)
- **Started:** 2026-05-19T01:03Z (approximate)
- **Completed:** 2026-05-19T01:13Z
- **Tasks:** 2 / 2
- **Files created:** 3 (`redaction-patterns.json`, `redact.sh`, `redaction-corpus.test.ts`)
- **Files modified:** 1 (`vigil-agent-bridge.sh`, +10/-3 lines)

## Accomplishments

- **AGENT-LINUX-03 closed.** UserPromptSubmit now redacts the operator's prompt before it flows to the wire. Any of the 6 WATCH-ENRICH-03 denylist patterns produces the binary `[redacted: contains sensitive pattern]` literal; clean prompts pass through truncated to ≤80 chars.
- **Canonical denylist source-of-truth landed.** `redaction-patterns.json` is the single file consumed by `redact.sh` at runtime AND (eventually) by Phase 133 vigil-watch's Swift parser. Six patterns in canonical order: `api[_-]?key`, `bearer`, `password`, `vk_`, `ey[A-Za-z0-9_-]{10,}`, `[A-Za-z0-9+/]{40,}={0,2}`. JWT threshold authoritatively `{10,}` per RESEARCH Pitfall 4.
- **Pitfall-4 regression guard pinned.** The corpus's explicit `Pitfall 4: JWT at offset 70 of 80-char truncation still matches with {10,} threshold` it-block constructs a 68-char prefix + 14-char trailing JWT — the exact `{10,}` boundary. If any future commit reverts the threshold to `{20,}`, this test fails immediately.
- **D-R2 truncate-first ordering pinned.** The corpus's explicit `D-R2: truncate-first ordering — a 4KB clean prompt with bearer at offset 2000 is NOT redacted` it-block constructs a ~4KB prompt with a clean 2000-char prefix, `bearer at offset 2000` literal, and trailing padding. The truncated 80-char slice contains zero pattern matches; the offset-2000 `bearer` is discarded BEFORE the regex runs. If ordering ever swaps to redact-then-truncate, this test fails.
- **Zero new runtime dependencies.** `redact.sh` uses only `node -e` (already invoked elsewhere in `vigil-agent-bridge.sh`) and pure-bash builtins. `redaction-corpus.test.ts` uses only `node:test` + `node:child_process` + `node:path` + `node:url` — all already in vigil-linux-hooks's devDeps.
- **Test suite expanded from 10 → 37 tests** (5 body-builder + 5 fail-safe + 27 corpus). Total runtime ~940ms; well under the Plan-04 budget of <2s.

## Task Commits

1. **Task 1: Create redaction-patterns.json and redact.sh** — `df291f4` (feat)
2. **Task 2: Wire UserPromptSubmit branch in vigil-agent-bridge.sh + add redaction-corpus test** — `21b376c` (feat)

## Sample [redacted: …] Body Emitted by the Wired UserPromptSubmit Branch

Captured via the `VIGIL_AGENT_BRIDGE_EMIT_ONLY=1` test-capture path against a JWT-shaped prompt fixture:

```bash
$ printf '{"session_id":"abc12345-0000-4000-8000-000000000002","cwd":"/home/morrillboss/dev/dailybrief","prompt":"Bearer eyJabc12345xyz"}' \
  | VIGIL_API_KEY=vk_test VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 \
    bash vigil-linux-hooks/vigil-agent-bridge.sh --event=UserPromptSubmit
```

```json
{
  "session_id": "abc12345-0000-4000-8000-000000000002",
  "event": "heartbeat",
  "timestamp": "2026-05-19T01:10:54+00:00",
  "label": "dailybrief",
  "host": "morrillhouse",
  "client_event_id": "7d7937a7-4d43-4632-aef7-df284264c229",
  "message": "[redacted: contains sensitive pattern]"
}
```

7-key body, all members of the Phase 121 KNOWN_FIELDS Set. The `message` field is the binary redaction literal — the operator's JWT-shaped prompt is never serialized to the wire.

And the clean-prompt counterpart:

```bash
$ printf '{"session_id":"abc12345-0000-4000-8000-000000000002","cwd":"/home/morrillboss/dev/dailybrief","prompt":"help me refactor this function"}' \
  | VIGIL_API_KEY=vk_test VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 \
    bash vigil-linux-hooks/vigil-agent-bridge.sh --event=UserPromptSubmit
```

```json
{
  "session_id": "abc12345-0000-4000-8000-000000000002",
  "event": "heartbeat",
  "timestamp": "2026-05-19T01:10:55+00:00",
  "label": "dailybrief",
  "host": "morrillhouse",
  "client_event_id": "03917390-d5e7-4ad5-8515-c2fdce4aa352",
  "message": "help me refactor this function"
}
```

30-char message (well under the 80-char truncation cap) — the clean prompt passes through verbatim.

## Final Corpus Size

| Block | Count | Notes |
| ----- | ----- | ----- |
| `CASES_REDACT` entries | 15 | api_key snake/hyphen/no-sep/=-prefix; bearer literal + jwt; password literal + =-prefix; vk_ env-var + token; ey JWT classic + 14-trailing; 50-char base64; 40-char base64 + ==; Pitfall-4 corpus row (offset-70 JWT) |
| `CASES_CLEAN` entries | 10 | Plain dev/English prompts — refactor, weather, Stripe webhooks, rust borrow checker, haiku, test fix, social reply, summary, world clock, shell question |
| Pitfall-4 explicit edge-case it-block | 1 | JWT at offset 68 — the `{10,}` boundary — verifies threshold has NOT regressed to `{20,}` |
| D-R2 explicit edge-case it-block | 1 | 4KB prompt with `bearer` at offset 2000 NOT redacted — verifies truncate-FIRST ordering |
| **TOTAL** | **27** | Exceeds the Plan-03 ≥27 target |

## Patterns Flagged During Testing That Needed Adjustment

**One genuine fixture-construction bug surfaced and was fixed in-flight:**

- **D-R2 test fixture, first attempt:** clean prefix was `"a".repeat(2000)` — incidentally created an 80-char alphanumeric run in the truncated slice, which DID match the `[A-Za-z0-9+/]{40,}` base64 pattern. The supposedly-clean prefix triggered redaction, failing the test.
- **Fix:** rewrote the prefix as a repeating `'hello world. '` phrase. The period+space combo breaks up the alphanumeric run so the truncated 80-char slice contains zero base64-class windows of length 40. Added an explicit precondition assertion (`!/api[_-]?key|bearer|password|vk_|ey[A-Za-z0-9_-]{10,}|[A-Za-z0-9+/]{40,}={0,2}/.test(first80)`) so any future regression in the fixture is caught BEFORE the main assertion.
- **Impact:** none on the redactor itself — this was a fixture-side issue. The redactor was working correctly: the prefix it received DID contain a 40+ char base64-class run, so it correctly redacted. The fix improves the test fixture quality without altering the redactor or its contract.

**No other patterns needed adjustment.** The 6-pattern denylist behaves exactly as the brief specifies — case-sensitive matches on lowercase `api[_-]?key`/`bearer`/`password`/`vk_` plus the two regex-shape patterns (JWT + base64). The corpus uses lowercase forms for the literal patterns per the brief's explicit guidance (CONTEXT D-R1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] D-R2 test fixture used base64-class clean prefix**

- **Found during:** Task 2 verification — `cd vigil-linux-hooks && npm test`
- **Issue:** Initial implementation of the D-R2 edge-case test constructed its 4KB-prompt fixture with `"a".repeat(2000)` as the clean prefix. The truncated 80-char slice was 80 contiguous `a` chars, which matches `[A-Za-z0-9+/]{40,}` — so the redactor (correctly) emitted `[redacted: contains sensitive pattern]` instead of the expected clean-prefix output. The test asserted `notEqual` and failed.
- **Fix:** Replaced the prefix construction with `let cleanPrefix = ""; while (cleanPrefix.length < 2000) cleanPrefix += "hello world. ";`. Period+space breaks the alphanumeric class run; the truncated 80-char slice no longer contains a 40+ char base64 window. Added a precondition assertion that re-applies the 6 patterns to the first-80-char slice to catch any future fixture regression early.
- **Files modified:** `vigil-linux-hooks/__tests__/redaction-corpus.test.ts` (D-R2 edge-case it-block body, ~40 lines rewritten)
- **Commit:** `21b376c` (Task 2 commit — fixture rewrite landed in the same commit as the original test)

### Auth Gates

None. Task 1 and Task 2 ran entirely on local bash + node — no auth-bearing tooling involved.

### Architectural Changes (Rule 4)

None. The plan's spec was implementable verbatim; no structural deviations needed.

## Self-Check: PASSED

- `vigil-linux-hooks/redaction-patterns.json` — FOUND. `node -e` JSON-parse confirms 6 patterns + max_length=80 + `{10,}` threshold (not `{20,}`).
- `vigil-linux-hooks/redact.sh` — FOUND. `bash -n` syntax-check clean. Contains the Rail 2 pin string `redaction-patterns.json` (3 occurrences). Sourcing + `redact_prompt "my password is hunter2"` returns `[redacted: contains sensitive pattern]`. Sourcing + `redact_prompt "help me refactor this function"` returns the input verbatim.
- `vigil-linux-hooks/vigil-agent-bridge.sh` — FOUND. Sources `redact.sh` (1 occurrence). UserPromptSubmit branch wires `redact_prompt "$PROMPT"` → `emit_event "heartbeat" "$REDACTED"` (1 occurrence each). `bash -n` clean.
- `vigil-linux-hooks/__tests__/redaction-corpus.test.ts` — FOUND. 27 it-blocks (15 redact + 10 clean + 2 named edge cases). `grep -c "Pitfall 4"` = 7 (well >=1). `grep -c "truncate-first\|D-R2"` = 6.
- Commit `df291f4` (Task 1) — FOUND in `git log`.
- Commit `21b376c` (Task 2) — FOUND in `git log`.
- Test run: 37/37 passing in ~944ms — verified post-Task-2 commit (5 body-builder + 5 fail-safe + 27 corpus).
- Behavioral capture: JWT-shaped prompt → `message: "[redacted: contains sensitive pattern]"` (captured above). Clean prompt → `message: "help me refactor this function"` (captured above).

## Threat Mitigations Verified

| Threat | Mitigation in this Plan | Verification |
| ------ | ----------------------- | ------------ |
| T-134-R1 (Information Disclosure: novel pattern bypass) | 6-pattern denylist matches WATCH-ENRICH-03 baseline; truncate-FIRST bounds any residual leak to ≤80 bytes; operator can extend `redaction-patterns.json` without code changes (Plan-04 drift detector pins consumers). | All 15 secret-shaped corpus fixtures emit `[redacted: …]`. All 10 clean fixtures pass through with `length <= 80`. |
| T-134-R2 (Information Disclosure: truncation elides JWT) | JWT threshold lowered from `{20,}` to `{10,}` per RESEARCH Pitfall 4. The corpus's `Pitfall 4` it-block pins the regression at offset 68 (the actual `{10,}` boundary). | `Pitfall 4` it-block passes. Reverting the threshold to `{20,}` in `redaction-patterns.json` immediately fails this test. |
| T-134-I3 (Tampering: shell injection via prompt content) | `redact_prompt "$PROMPT"` passes the prompt as a single quoted positional arg to a bash function; the function consumes it as `local input="$1"` — never re-interpreted. The corpus test invokes via `execFileSync("bash", ["-c", script, "redact_test", prompt])` — `prompt` is a fully opaque argv element, not shell-interpolated. | All 27 corpus tests pass with prompts containing embedded `$`, single-quotes, and backticks would still execute correctly (corpus does not currently include such fixtures, but the invocation path is safe by construction). `emit_event` for the wired UserPromptSubmit branch passes `MESSAGE` via `process.env` to `node -e` for `JSON.stringify` — defeats injection at the JSON layer too. |

## Hand-off Notes for Plan 04

- **Drift detector is the last unwired test.** Plan 04 lands `redaction-drift.test.ts` which reads BOTH `redaction-patterns.json` AND `redact.sh`, greps for each pattern string literal, and asserts byte-for-byte parity. The Rail 2 pin (the comment `# patterns loaded from: redaction-patterns.json` in `redact.sh`) is already in place — Plan 04's test will grep for this exact string as evidence the file was deliberately wired together.
- **Phase 133 cross-repo consumer pending.** When Phase 133 ships, its Swift `JSONDecoder` parser of `redaction-patterns.json` becomes the second consumer of this file. Plan 04's drift detector should grow a `fs.existsSync(swiftSource)` guard so the test skips with `console.warn` when Phase 133 hasn't landed yet (mirrors the Phase-127 drift-detector pattern). The current `redaction-patterns.json` file format (top-level `patterns` array + `max_length` integer) is intentionally `JSONDecoder`-friendly — Swift `struct RedactionConfig: Codable { let patterns: [String]; let max_length: Int }` parses it without ceremony.
- **Installer (Plan 04) needs to copy three files now.** `install.js` (Plan 04) must `fs.copyFileSync` all of `vigil-agent-bridge.sh`, `redact.sh`, AND `redaction-patterns.json` into `~/.claude/hooks/`. Missing any of the three at runtime breaks the source-and-load chain (vigil-agent-bridge.sh sources redact.sh, which reads redaction-patterns.json). The RESEARCH Pattern Assignment 4 algorithm already lists all three — Plan 04 just needs to faithfully implement it.
- **`VIGIL_MAX_PROMPT_LEN` env override is plumbed but undocumented.** `redact_prompt` honors `${VIGIL_MAX_PROMPT_LEN:-80}` for the truncation length — provides an escape hatch for operators who need to tune the cap (e.g., for debugging). Plan 04's README should mention this in the troubleshooting section.
- **27 tests in ~840ms is well within budget.** Plan 04's drift detector will add ~3-5 more tests (one source-grep parity assertion per pattern + a `max_length` integer parity assertion). Total post-Plan-04 suite size projected at ~40 tests in <1.5s — comfortably under the project's <2s budget.
