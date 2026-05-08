---
phase: 120-day-1-jsonl-schema-verification-detection-strategy-lock
plan: 03
subsystem: verification
tags: [verify-01, vigil-watch, public-readme, day-1-findings, spec-correct-and-proceed, jsonl-schema-lock]

# Dependency graph
requires:
  - phase: 120
    plan: 01
    provides: "vigil-watch repo + 7-header README skeleton with placeholder sections to fill"
  - phase: 120
    plan: 02
    provides: "verification-log/{corpus-mining,scripted-session}.md + 16 *.jsonl excerpts grounding every claim"
provides:
  - "Public Day-1 findings document at github.com/dttigers/vigil-watch/blob/main/README.md committed as 5273534 — Verdict locked at spec-correct-and-proceed, 8-row mapping table observed-vs-spec, 4 prose answers with field paths, downstream Phase 122/123 implementation notes, 8 hand-curated sanitized excerpts"
  - "Vigil event detection rules (inverse view) embedded as Phase 122 parser source-of-truth: needs_input/task_complete/task_failed/milestone/heartbeat each with field-path detection rule"
  - "VERIFY-01 deliverable structurally satisfied: 'Findings written to vigil-watch repo README before any production-mapping code is written'"
affects: [121, 122, 123]

# Tech tracking
tech-stack:
  added: []
  patterns: [public-readme-as-verdict-document, hand-curated-appendix-excerpts, field-path-detection-rules-over-line-type-matching]

key-files:
  modified:
    - "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/README.md"
  pushed-to-remote:
    - "github.com/dttigers/vigil-watch (commit 5273534, branch main, +180 -24 lines)"

key-decisions:
  - "Verdict: spec-correct-and-proceed (not proceed-as-spec, not fallback). All 5 Vigil events have signal in JSONL — needs_input via tool_use+gap+permissionMode, task_complete via stop_reason+silence, task_failed via is_error:true, milestone via free-text matching, heartbeat via timestamp deltas. No event lacks fundamental signal, so D-06 does not escalate to fallback. However, 4 of the 8 spec-assumed mapping rows are structurally wrong (level-shift from top-level type to inner content[].type, plus session_end has no line type at all), so verdict is spec-correct, not proceed-as-spec."
  - "session_end row marked Missing (not Corrected) because there is genuinely NO line type — but the task_complete Vigil event still has signal via heuristic combination, so the row's Missing status does NOT trigger D-06 fallback escalation. Documented this distinction explicitly in the README's pragmatic-fallback assessment paragraph so future readers understand why a Missing row didn't flip the verdict."
  - "Added a Vigil-event-keyed inverse mapping table beyond the 8-row spec-keyed table. Phase 122 parser will think in terms of Vigil events, not spec types — surfacing the inverse view directly satisfies the parser's needs while also clearing the ≥10 pipe-row acceptance threshold. The two tables are duals, not redundant."
  - "Heavy sanitization on Excerpt 4 (Scenario B Bash output) — the 27-file Desktop listing contained tax document and personal photos. Replaced with `[truncated]` placeholder preserving JSON envelope. Excerpt 8 similarly redacts directory names from the assistant's prose reply. All other excerpts required only structural truncation of `usage`/`thinking`/`attachment` payloads, no PII."
  - "All cwd paths preserved as `/Users/jamesonmorrill/...` per memory (user is documented; the dailybrief working tree path is in this repo's git history already). No cross-user paths encountered. No vk_/sk-ant-/Bearer credentials present in any excerpt — credential redaction grep checks all returned 0."

patterns-established:
  - "Vigil-family verdict documents live in the public-repo README, not in .planning/. The verdict, mapping table, question answers, and excerpt evidence are intentionally publicly-readable so downstream agents (and future contributors) plan against locked findings without needing access to the private dailybrief workspace."
  - "Field-path detection rules (JSONPath-style notation) are the canonical interface between schema-verification and parser-implementation phases. Future schema lock-ins for other Claude Code surfaces should use the same notation."
  - "Hand-curated excerpts > bulk dump. The 16 excerpts in verification-log/excerpts/ are full-fidelity captures with potential PII; the 8 README excerpts are envelope-preserving structural skeletons that ground the field-path claims without republishing user content. This 2-stage extract-curate pattern should apply to any future schema-verification phase."

requirements-completed: [VERIFY-01]
# VERIFY-01 was a milestone-spanning gate across Plans 120.01 / 120.02 / 120.03; this plan
# is the one that structurally satisfies it ("findings written to vigil-watch repo README"),
# so the requirement is now fully complete.

# Metrics
duration: 8min
completed: 2026-05-08
---

# Phase 120 Plan 03 Summary: Day-1 Findings → Public vigil-watch README

**Synthesized Plan 120.02's verification-log into a publicly-readable Day-1 findings document on github.com/dttigers/vigil-watch (commit 5273534). Verdict `spec-correct-and-proceed`, 8-row observed mapping, 4 prose answers with JSONPath references, 8 hand-curated sanitized excerpts. VERIFY-01 deliverable structurally satisfied.**

## Final Verdict

**`spec-correct-and-proceed`** — All 5 Vigil event types have empirical JSONL signal, but the spec's assumed 8-row mapping table is structurally wrong on 4 rows (level-shift from top-level `tool_use`/`tool_result` types to inner `message.content[].type` discriminators; `session_end` line type does not exist; needs_input requires combinatorial inference rather than a single field). No fundamental capability gap → no fallback path → no Phase 122/123 goal shifts. Field-path corrections recorded as Phase 122 implementation notes.

## Mapping Table Status

| Status | Count | Rows |
|---|---|---|
| `Confirmed` | 4 | `user`, `assistant`, silence-row (heartbeat meta-rule), regex-row (milestone meta-rule) |
| `Corrected` | 3 | `tool_use`, `tool_result` (success), `tool_result` (error) |
| `Missing` | 1 | `session_end`/`stop` |

### Per-Corrected-row spec → observed

- `tool_use`: spec assumed `$.type == "tool_use"` with `awaiting_approval` field → observed `$.type == "assistant"` AND `$.message.content[?(@.type == "tool_use")]`. The `awaiting_approval` substring does not exist anywhere in 47,357 corpus lines. `needs_input` detection requires inference: tool_use→tool_result gap exceeding N seconds AND `permissionMode != "bypassPermissions"`.
- `tool_result` (success): spec assumed `$.type == "tool_result"` → observed `$.type == "user"` AND `$.message.content[?(@.type == "tool_result" && @.is_error == false)]`. Sibling `$.toolUseResult` is a structured `{stdout, stderr, interrupted, isImage, noOutputExpected}` object.
- `tool_result` (error): same level-shift as success row + `$.message.content[].is_error == true` is the deterministic single-field discriminator. `$.toolUseResult` remains an object on errors in extension v2.1.133 (NOT a string starting `"Error: …"`).

### Per-Missing-row D-06 rationale

- `session_end`/`stop`: zero JSONL lines have `$.type == "session_end"` or `$.type == "stop"` across 47,357 corpus lines. The corresponding Vigil event `task_complete` still has signal via heuristic combination (`stop_reason == "end_turn"` + sustained silence), so D-06's pragmatic-fallback rule does NOT trigger — the signal is inferred rather than literal, but it exists. Verdict stays `spec-correct-and-proceed`. The README's pragmatic-fallback assessment paragraph explains this distinction inline.

## Spec-Flagged Question Answers (1-sentence each)

1. **Tool-approval prompts in JSONL:** They do not appear as a dedicated line type; the watcher infers from `$.permissionMode != "bypassPermissions"` on the most recent user line + the time gap between an `assistant.message.content[].type == "tool_use"` and the matching `user.message.content[].type == "tool_result"` with the same `tool_use_id`.
2. **Awaiting-input field:** None directly — combinatorial inference required (assistant `tool_use` emitted, no matching `tool_result` within N seconds, permission mode is `default`).
3. **Session end signal:** No line type — file simply stops appending; detector relies on sustained silence + `stop_reason == "end_turn"` heuristic.
4. **Errored tool result structure:** Identical envelope to success, with sole discriminator `$.message.content[?(@.type == "tool_result")].is_error == true`; error text in `content[].content` typically prefixed `"Exit code N\n"`.

## Downstream Phase 122/123 Shifts (none required, but implementation notes captured)

No success-criteria shifts. Phase 122 implementation notes:

- `needs_input` emission: read `$.type == "assistant" AND $.message.content[?(@.type == "tool_use")]` instead of spec's `$.type == "tool_use" AND $.awaiting_approval`. Suppress when `permissionMode == "bypassPermissions"`.
- `task_failed` emission: read `$.type == "user" AND $.message.content[?(@.type == "tool_result" && @.is_error == true)]` instead of spec's top-level rule.
- `task_complete` emission: heuristic — `(now - latestLineTimestamp) > taskCompleteSeconds` + latest line `stop_reason == "end_turn"` + no further user line. Necessarily ambiguous with "user reading reply" — tune threshold separately.
- Project-namespace enumeration: watch ALL `~/.claude/projects/*/` subdirectories, not a single fixed namespace. The `watch.toml` `projects_dir` should default to the parent.
- Line-type noise filtering: 7 non-spec types (`attachment`, `queue-operation`, `file-history-snapshot`, `last-prompt`, `ai-title`, `summary`, `system`) appear in corpus traffic — parser treats as no-ops (advance offset, do not emit).
- Phase 123 unaffected — CLI surface, launchd plist, 24h soak unchanged.

## Excerpt Inventory + Sanitization Summary

8 excerpts, all from the scripted-session JSONL (Phase 120-02 Task 2 capture):

| # | Label | Source line(s) | Sanitization |
|---|---|---|---|
| 1 | user prompt, default permission mode | line 16 | none |
| 2 | assistant with stop_reason end_turn | line 26 | usage object truncated |
| 3 | assistant with inner tool_use | line 11 | usage object truncated |
| 4 | user tool_result success (is_error false) | line 12 | 27-file Desktop listing truncated (PII protection) |
| 5 | user tool_result error (is_error true) | line 20 | none |
| 6 | session tail (no end marker) | lines 32-33 | none |
| 7 | silence gap context (127s) | lines 21-22 | usage object truncated |
| 8 | assistant text content (milestone regex target) | line 13 | usage truncated, directory names redacted in reply text |

**Credential scan:** zero `vk_*`, zero `sk-ant-*`, zero `Bearer …` substrings present in README — no credential redactions needed.
**Path scan:** all `cwd` values are `/Users/jamesonmorrill/...` (user's own home, documented in memory); no cross-user paths encountered.
**Verification-log gitignore boundary:** `git status --porcelain` showed only `M README.md` immediately before commit — verification-log/ stayed gitignored throughout.

## Pushed Commit

- **Local commit SHA:** `5273534ff2d973c146033258f5c1beb79d8b5034`
- **Remote:** `github.com:dttigers/vigil-watch.git` branch `main`
- **Push result:** `45bf950..5273534  main -> main` (succeeded on first attempt)
- **Public-readable confirmation:** `gh api repos/dttigers/vigil-watch/contents/README.md` → 8 Excerpt headings on remote (matches local)
- **Public URL:** https://github.com/dttigers/vigil-watch#day-1-jsonl-schema-verification

## Acceptance Criteria — All Pass

| Criterion | Result |
|---|---|
| All 7 Plan 120.01 section headers preserved verbatim | ✅ grep-verified |
| Exactly 1 verdict line matching the regex | ✅ |
| Zero `_TBD_` placeholders remaining | ✅ |
| Mapping table has 8 data rows in spec order, each with `Confirmed`/`Corrected: …`/`Missing` status | ✅ |
| 4 numbered, bolded spec-flagged questions | ✅ |
| ≥4 JSONPath references | ✅ (27 references) |
| ≥4 Excerpt cross-references | ✅ (8 unique) |
| Downstream Phase Impact section non-empty | ✅ |
| ≥8 hand-curated appendix excerpts | ✅ (exactly 8) |
| Each excerpt has Source/Lines/Captured/Sanitization metadata + fenced jsonl block | ✅ |
| `git status` only `M README.md` (no verification-log/ paths) | ✅ |
| Commit message references VERIFY-01 | ✅ ("Closes VERIFY-01.") |
| `git rev-parse HEAD == origin/main` | ✅ |
| Remote contains ≥8 Excerpt headings (`gh api` confirmation) | ✅ (8) |

---

*Authored by Plan 120-03 (autonomous) on iMac (Morrill House). Verification log stayed gitignored throughout — no user content reached the public repo. VERIFY-01 deliverable: "Findings written to vigil-watch repo README before any production-mapping code is written" — structurally satisfied.*
