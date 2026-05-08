---
phase: 120-day-1-jsonl-schema-verification-detection-strategy-lock
plan: 02
subsystem: verification
tags: [jsonl-schema, corpus-mining, scripted-session, verification-log, gitignored, vigil-watch, claude-code-jsonl]

# Dependency graph
requires:
  - phase: 120
    plan: 01
    provides: "vigil-watch repo with /verification-log/ entry in .gitignore (T-120-01 mitigation already in place); README skeleton awaiting findings"
provides:
  - "verification-log/corpus-mining.md (483 lines, captured 2026-05-07) with 9 distinct top-level type values across 184 files; 10 spec-flagged tokens tabulated; cross-project sanity check confirms D-07 host-independence assumption"
  - "verification-log/scripted-session.md (captured 2026-05-08T18:15Z) mapping all 5 D-02 scenarios to JSONL line ranges with reproducible excerpt evidence"
  - "verification-log/excerpts/ directory with 16 *.jsonl excerpt files (11 corpus + 5 scripted) — every claim in either log grounded in a verbatim line-range citation"
  - "Empirical answers to all 4 spec-flagged questions, ready for Plan 120.03 to synthesize into the public README"
  - "Tentative verdict input: spec-correct-and-proceed (NOT fallback) — the JSONL has signal for all 5 Vigil event types; field-path corrections are needed (top-level `tool_use`/`tool_result` are wrong; reality is inner `content[].type`) but no fundamental capability gap"
affects: [120-03]

# Tech tracking
tech-stack:
  added: [permissionMode-detection, project-namespace-enumeration]
  patterns: [empirical-corpus-mining, scripted-checkpoint-capture, per-scenario-excerpt-curation, cwd-namespace-partitioning]

key-files:
  created:
    - "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/verification-log/scripted-session.md"
    - "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/verification-log/excerpts/scripted-A-tool-approval-lines3-13.jsonl"
    - "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/verification-log/excerpts/scripted-B-tool-result-success-lines12-13.jsonl"
    - "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/verification-log/excerpts/scripted-C-tool-result-error-lines16-21.jsonl"
    - "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/verification-log/excerpts/scripted-D-idle-context-lines21-22.jsonl"
    - "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/verification-log/excerpts/scripted-E-session-end-lines24-33.jsonl"
  pre-existing:
    - "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/verification-log/corpus-mining.md (captured 2026-05-07T19:45:53Z by an earlier execution attempt that completed Task 1 only; verified intact and acceptance-criteria-passing this run, no rewrite needed)"
    - "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch/verification-log/excerpts/corpus-*.jsonl (11 files, all referenced links resolve)"

key-decisions:
  - "Re-used the existing 2026-05-07 corpus-mining.md output rather than redoing Task 1 — file is comprehensive (483 lines, 9 distinct types, 10 token rows, cross-project check) and meets every Task 1 acceptance criterion. JSONL schema does not change daily so the prior-day capture remains valid for Day-1 verification purposes."
  - "Located the scripted-session JSONL by widening the search beyond the dailybrief project namespace. The user opened a fresh VS Code session at the parent folder /Users/jamesonmorrill/Desktop/Local AI rather than /Local AI/dailybrief, so Claude Code created a NEW project namespace -Users-jamesonmorrill-Desktop-Local-AI. The runbook's pre/post-snapshot diff missed this — fix-forward was a find across all ~/.claude/projects/*/ subdirectories with mtime in the scripted window."
  - "Captured Scenario A's permissionMode:bypassPermissions deviation as a finding rather than retrying. The corpus mining did NOT surface permissionMode as a per-line field; the scripted session did, AND it directly answers spec-flagged Question 1 in a way the corpus alone could not. The deviation strengthened the verification rather than weakening it."
  - "Captured Scenario E's missed End-Conversation affordance as confirmatory evidence rather than retrying. The user did not visibly use a close-affordance, but the resulting JSONL tail (last-prompt + ai-title + then nothing) is exactly what the corpus mining predicted (80% of corpus files end on last-prompt and have no dedicated session_end marker). This is sufficient evidence for spec-flagged Question 3 — the absence-of-marker is the finding."

patterns-established:
  - "Watcher daemon must enumerate ALL ~/.claude/projects/*/ subdirectories — Claude Code partitions JSONL by cwd-derived namespace, and a single user can produce JSONL into N different namespaces over time (this Phase 120 work alone touched 2 namespaces: -Users-jamesonmorrill-Desktop-Local-AI and -Users-jamesonmorrill-Desktop-Local-AI-dailybrief). Plan 120.03 must surface this as a downstream Phase 122 implementation requirement."
  - "permissionMode is a load-bearing per-user-line field that gates needs_input emission. When permissionMode=bypassPermissions the watcher must NOT emit needs_input for tool_use→tool_result gaps (those are bypass-mode executions, not awaiting state)."
  - "Detection rules use field paths and combinatorial logic, not literal type values. Spec-assumed top-level tool_use and tool_result line types are WRONG; reality is inner content[].type discriminators on assistant/user lines respectively. Field-rename + level-shift is the consistent pattern for the entire 8-row spec mapping table."

requirements-completed: []
# Note: VERIFY-01 spans Plans 120.01 / 120.02 / 120.03 — fully satisfied only when 120.03 commits the verdict + findings to the public README.

# Metrics
duration: 12min
completed: 2026-05-08
---

# Phase 120 Plan 02 Summary: JSONL Verification Log Capture

**Empirical capture of Claude Code's JSONL schema via two passes: (1) corpus mining of 184 existing JSONL files spanning 30 days of natural usage on iMac, and (2) a 33-line scripted session covering 5 D-02 scenarios with verbatim line-range mapping and reproducible excerpt evidence — all written into the gitignored vigil-watch/verification-log/ directory ready for Plan 120.03 synthesis into the public README.**

## Performance

- **Duration:** ~12 min (interactive mode)
- **Started:** 2026-05-08T17:58:00Z
- **Completed:** 2026-05-08T18:15:00Z
- **Tasks:** 2 (Task 1 was already complete from a prior execution attempt; Task 2 ran fresh end-to-end with a blocking human-verify checkpoint)
- **Files created/refreshed:** 6 new in `vigil-watch/verification-log/` (1 markdown + 5 scripted excerpts); 12 pre-existing files validated intact (1 markdown + 11 corpus excerpts)
- **JSONL lines analyzed:** 47,357 corpus + 33 scripted = 47,390 verbatim event lines

## Accomplishments

### Task 1 — Corpus mining (autonomous, pre-existing, validated)

`verification-log/corpus-mining.md` was authored 2026-05-07T19:45:53Z by an earlier execution attempt and confirmed intact this run. All Task 1 acceptance criteria pass:

- 184 *.jsonl files inventoried, 9 distinct top-level `type` values across 47,357 event lines
- Spec-flagged token table has all 10 required rows (`awaiting_approval`, `tool_use`, `tool_result`, `is_error`, `error`, `session_end`, `stop_reason`, `result`, `summary`, `subtype`)
- 11 corpus exemplar excerpts saved to `excerpts/corpus-*.jsonl`, all markdown links resolve
- Cross-project sanity check (`-Users-jamesonmorrill/` namespace, 1 file) confirms D-07 host-independence assumption
- Gap List explicitly named the 3 corpus blind spots that Task 2 had to fill: missing `awaiting_approval`, missing `session_end`, no naturally-clean errored tool_result

**Critical corpus findings (already locked in 120.03's input):**

- The spec's assumed top-level `tool_use` and `tool_result` types DO NOT EXIST in the corpus. They live as inner `message.content[].type` discriminators on `assistant` and `user` lines respectively. Field-path correction (not fallback) needed for those rows.
- No JSONL line has `type: "session_end"` — zero hits in 47,357 lines. The 9 substring hits are spec-text echoes from prior sessions reading the v3.8 spec or 120-CONTEXT.md.
- 7 additional non-spec line types observed: `attachment`, `queue-operation`, `file-history-snapshot`, `last-prompt`, `ai-title`, `summary`, `system`.

### Task 2 — Scripted session (human-verify checkpoint)

`verification-log/scripted-session.md` and 5 scripted-* excerpt files capture the user-driven 5-scenario session in 33 JSONL lines from `~/.claude/projects/-Users-jamesonmorrill-Desktop-Local-AI/2072cbce-9eb3-4f2d-a69d-a219d997aa2a.jsonl` (extension v2.1.133, session start 12:07 MT, file mtime 12:11 MT).

| Scenario | Outcome | Lines | Key empirical signal |
|---|---|---|---|
| A: tool-approval | Partial (`bypassPermissions` mode skipped approval) | 3-13 | `permissionMode` is a load-bearing user-line field; tool_use→tool_result gap was 0.765s (no approval prompt shown) |
| B: success result | Confirmed | 12-13 | `is_error:false` boolean, `toolUseResult` is a structured object with `stdout/stderr/interrupted/isImage/noOutputExpected` |
| C: error result | Confirmed | 16-21 | `is_error:true` is the deterministic signal; `permissionMode:default` here gave a clean 5.241s approval interaction gap |
| D: ≥60s idle | Confirmed | gap 21→22 | 127.605s of silence captured between consecutive lines — heartbeat threshold empirically observable |
| E: clean session end | Partial (no End-Conversation affordance used) | 24-33 | NO dedicated session_end line type — confirmed; cluster at 27-31 is a `/extra-usage` slash-cmd echo (system.subtype:local_command) NOT a close signal |

**Critical scripted-session findings (NEW vs corpus):**

1. **`permissionMode` field on `user` lines** — top-level value `bypassPermissions` or `default`. This is a load-bearing detection input that the corpus mining missed. Watcher must track per-session and use it to gate `needs_input` emission.
2. **`cwd`-derived project-namespace partitioning** — the same user produced JSONL into 2 different `~/.claude/projects/*/` subdirectories during this Phase 120 alone (one per opened-folder root). Watcher daemon must enumerate ALL subdirectories, not just one.
3. **Even an explicitly-typed "Thanks, that's all for now." + AI reply produces NO session_end signal** — confirming the corpus pattern. Detection of session-end is necessarily heuristic in JSONL.

## Task Commits

Plan 120-02 produces NO commits to the public vigil-watch repo because all `files_modified` paths fall under `verification-log/`, which is gitignored per Plan 120.01's T-120-01 mitigation (`.gitignore` line 72: `/verification-log/`). The work product is the on-disk verification log, intentionally isolated from git history to prevent accidental publishing of user JSONL content. Plan 120.03 will hand-curate redacted excerpts from this log into the public README.

In the **dailybrief repo**, this SUMMARY.md is the only artifact this plan commits.

## Verification

| Acceptance criterion (paraphrased) | Result |
|---|---|
| `corpus-mining.md` exists and is non-empty | ✅ 483 lines |
| Required corpus section headers present | ✅ all 5 grep-verified |
| Files-inventoried table has ≥3 real filename rows | ✅ 10 rows |
| Spec-flagged-token table has 10 rows | ✅ exactly 10 |
| `excerpts/` has ≥3 corpus-*.jsonl files | ✅ 11 files |
| `scripted-session.md` exists | ✅ |
| Scenario-to-line-range table covers all 5 scenarios | ✅ A/B/C/D/E mapped |
| All 5 `### Scenario X:` per-scenario sections present | ✅ grep-verified |
| ≥1 scripted-*.jsonl excerpt per scenario | ✅ 5 files |
| Every excerpt link in markdown resolves to a file on disk | ✅ 16/16 resolve |
| `git status --porcelain \| grep verification-log` returns empty | ✅ verified |
| `verification-log/` is in .gitignore (T-120-01 mitigation) | ✅ `git check-ignore -v` confirms `.gitignore:72:/verification-log/` |

## Downstream Hand-off (Plan 120.03 input)

Plan 120.03 reads from this verification log to write the public README. Key inputs already pre-digested:

- **Verdict input (D-06 pragmatic-fallback rule):** `spec-correct-and-proceed`. The JSONL has empirical signal for all 5 Vigil event types (`needs_input` via tool_use+gap+permissionMode, `task_complete` via stop_reason:end_turn + sustained silence, `task_failed` via is_error:true, `heartbeat` via timestamp deltas, `milestone` via free-text matching on assistant.content[].text). No fundamental capability gap. Field-path corrections are needed for the spec's 8-row table; no fallback path required.
- **8-row mapping table inputs:** corpus mining + scripted session combined have evidence for every row. The 4 spec-correction rows are: `tool_use` (top-level → inner content[].type on assistant), `tool_result success` (top-level → inner content[].type on user), `tool_result error` (same correction + `is_error:true` discriminator), `session_end` (does not exist as type → use sustained silence + stop_reason heuristic).
- **4 spec-flagged questions:** all 4 answered with field-path evidence in `scripted-session.md` §"Empirical answers to spec-flagged questions". 120.03 just needs to lift those answers into prose with [Excerpt N] references.
- **Appendix excerpt curation:** Plan 120.03 must hand-pick from the 16 excerpt files, redact any incidental user content (e.g., the `~/Desktop` ls output in Scenario B excerpt has 27 personal filenames), and include ≥8 fenced jsonl blocks (one per mapping-table row minimum). NO bulk-copy from `verification-log/excerpts/`.
- **Downstream Phase 122/123 impact:** Verdict is `spec-correct-and-proceed` so the README's "Downstream Phase Impact" section will list specific corrected mapping rows Phase 122 must implement (the 4 corrections above, plus the new `permissionMode` and `cwd`-namespace requirements). NO success-criteria shifts for Phase 122/123 goals — those phases proceed against the corrected mapping.

---

*Captured by Plan 120-02 on iMac (Morrill House) per D-07. Empirical input for Plan 120.03 ready in `vigil-watch/verification-log/`. The verification log lives gitignored on the local working tree only — Plan 120.03 hand-curates a redacted subset into the public README.*
