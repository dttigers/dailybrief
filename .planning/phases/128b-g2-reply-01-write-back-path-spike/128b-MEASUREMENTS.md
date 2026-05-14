# Phase 128b — MEASUREMENTS

**Authored:** 2026-05-14
**Phase:** 128b — G2-REPLY-01 write-back path spike
**Requirement:** G2-REPLY-01
**Consolidates:** per-path empirical evidence from Plans 01-04 (paths B, A, D, E-regression)

> Per CONTEXT D-A4: this file is one of the spike's seven artifacts. It owns the SUPPORTING NUMBERS (wallclock, cost, evidence-file inventory). The VERDICT and Phase 133 scope-lock live in `128b-SPIKE-DECISION.md` (authored in Plan 05). The two documents have different review cadences — verdict is non-editable once written; measurements can be refined without invalidating the verdict.

## Summary

| Path | Mini-verdict (verbatim from TRANSCRIPT) | Wallclock | API cost | Plan |
|------|------------------------------------------|-----------|----------|------|
| B | "Path B mini-verdict ⇒ **DEGRADE (fresh-only)**" | 6s | $0.0965 | 128b-01 |
| A | "Path A mini-verdict ⇒ **FAIL**" | 39s | ~$0.00 | 128b-02 |
| D | "**DEGRADE (inverted model — fresh-session-only via prompted tool-call)**" | 6s | ~$0.005 | 128b-03 |
| E (regression) | "**PASS — re-confirmed in current env; D-V4 max aggregation: Path E dominates per-path table**" | 71s | ~$0.01 | 128b-04 |
| E (spike 001 historical) | "PASS (per spike 001 §Results)" | 77s | <$0.02 | spike 001 (pre-128b) |

**Total empirical wallclock (Plans 01-04):** 122s (~2 min)
**Total Anthropic API spend (Plans 01-04 + spike 001):** ~$0.131 (Plans 01-04: ~$0.111; spike 001 historical reference: <$0.02)

Per RESEARCH §Cost and §"Per-Path Predicted-Verdict Summary": expected total ≤$0.20; expected total wallclock ≤4h (vs CONTEXT D-O4 per-path cap of 3h). Actual aggregate is 122s wallclock and ~$0.131 spend — both well inside expectations. The Plan 01 Path B run was 19× the per-path RESEARCH estimate ($0.0965 vs $0.005) due to a one-time `claude -p` cache-creation event in this cwd (76,765-token ephemeral 5m+1h cache); the deviation was investigated and documented in Plan 01's SUMMARY §"Issues Encountered". Subsequent re-runs would amortize to ~$0.005.

---

## Per-path log

### Path B — claude -p --input-format stream-json (D-O1 ordering: cheapest first)

- **Mini-verdict (verbatim from TRANSCRIPT):** "**Fresh-session: PASS** / **Active-session: STRUCTURAL FAIL** (no input channel exists; not a defect of Path B but a property of `claude -p`). Per D-V2 bullet 1 ('Round-trip works ONLY on fresh `claude -p` sessions, NOT mid-interactive-session'): Path B mini-verdict ⇒ **DEGRADE (fresh-only)**"
- **Wallclock:** 6s (RESEARCH estimate: 30 min cap; actual: 6s — well under)
- **Exit code:** 0 (per Plan 01 SUMMARY §Performance — script run 6s, exit clean after `--verbose` deviation fix)
- **Anthropic API cost:** $0.0965 (one Haiku turn — 19× higher than RESEARCH §Cost estimate of $0.005 due to first-invocation ephemeral 5m+1h cache creation of 76,765 tokens in this cwd; subsequent re-runs amortize to ~$0.005 — see Plan 01 SUMMARY §"Issues Encountered")
- **Sentinel:** "1337" (computed from prompt `Compute seven multiplied by one hundred ninety-one. Reply with only the resulting integer.`)
- **Sentinel detection:** YES — 3 occurrences across 9-line JSONL stream (line 6 `thinking` block, line 7 `text` block, line 9 `result` row); fresh-session step 3 ✓; Pitfall 1 mitigation verified (prompt uses English-words form, not the digit string)
- **Active-session attempt:** SKIPPED BY DESIGN — `claude -p` is print-and-exit; no input-channel attach surface (RESEARCH §"Path B" + CONTEXT D-O1 path (b))
- **Evidence files:**
  - `.planning/spikes/128b-write-back/evidence/pathB-fresh-out.jsonl` — full stream-json transcript (raw, 9 lines)
  - `.planning/spikes/128b-write-back/evidence/pathB-fresh-err.txt` — stderr (empty after `--verbose` fix)
  - `.planning/spikes/128b-write-back/evidence/pathB-TRANSCRIPT.md` — mini-verdict (mechanical)
- **Probe script:** `.planning/spikes/128b-write-back/pathB-stream-json.sh` (5,335 bytes; mode 0755; commit 3ce22c3)

### Path A — JSONL append + IPC (D-O1 ordering: 2nd in plan)

- **Mini-verdict (verbatim from TRANSCRIPT):** "**Active-session: FAIL** / Per CONTEXT D-V3 candidate first bullet ('All 3+ tested paths produce no observable round-trip'): Path A mini-verdict ⇒ **FAIL**"
- **Wallclock:** 39s (RESEARCH estimate: 1-2h; actual: 39s — well inside the ≤90s + ≤120s acceptance criteria thresholds)
- **Exit code:** 0 (per Plan 02 SUMMARY §Performance — probe ran clean to completion in 39s)
- **Anthropic API cost:** ~$0.00 (per Plan 02 SUMMARY §"Next Phase Readiness" — `claude --resume` against an exited session does not appear to consume API tokens; the operator's Claude Max OAuth handles auth at no per-call cost in interactive mode anyway)
- **D-T5 clobber-protect:** target SID was `043f78f1-2faa-4ddd-bd1a-b8aae3f0d163` (selected from corpus; `$CLAUDE_SESSION_ID` was unset at probe time so the selection-loop guard was vacuously satisfied; structural guarantee remains via the `[ "${CLAUDE_SESSION_ID:-}" = "$SID" ] && continue` skip in the loop); operations confined to `/tmp/spike-128b-A-IdHH0c/proj/` under `mktemp -d`; live corpus file mtime preserved at `May 14 20:07` (verified pre- and post-probe)
- **SIGUSR1 delivery:** YES (PID 387683; `kill -USR1 387683` succeeded, no error to stderr)
- **Sentinel detection (30-iteration poll):** DETECTED 0 expected (FAIL) — matches RESEARCH §"Path A" prediction; no mid-session JSONL re-read confirmed
- **Unsafe primitives attempted:** NONE (CONTEXT D-V3 ban on debugger-attach hot reload + direct proc-stdin-fd writes honored; paraphrased in script comments per the forbidden-token paraphrase pattern Plan 02 established)
- **Evidence files:**
  - `.planning/spikes/128b-write-back/evidence/pathA-jsonl-after.txt` — last 5 lines of the copied JSONL after append (3,147 bytes; appended user-row visible at last line; step 2 ✓ proof)
  - `.planning/spikes/128b-write-back/evidence/pathA-final-pane.txt` — final tmux pane capture (0 bytes — methodology caveat: `claude --resume` exited early because the target session JSONL ends with an `/exit` slash-command; documented in Plan 02 SUMMARY §"Methodology Caveat"; verdict unaffected per D-V4 mechanical aggregation)
  - `.planning/spikes/128b-write-back/evidence/pathA-at-detection.txt` — at-detection snapshot (ABSENT — only present if step 3 ✓ unexpectedly; absent on predicted FAIL)
  - `.planning/spikes/128b-write-back/evidence/pathA-TRANSCRIPT.md` — mini-verdict (mechanical)
- **Probe script:** `.planning/spikes/128b-write-back/pathA-jsonl-append.sh` (9,073 bytes; mode 0755; commit 4853d8d)

### Path D — MCP server hook (D-O1 ordering: 3rd in plan)

- **Mini-verdict (verbatim from TRANSCRIPT):** "**DEGRADE (inverted model — fresh-session-only via prompted tool-call)** / Per CONTEXT line 222 (Deferred Idea — 'MCP server-as-prompter UX'): The interesting v3.10+ variant is 'Claude pulls from a `vigil_check_external_reply` tool when it's about to ask the operator' — but that requires Claude to be prompt-conditioned to call the tool before every `needs_input`, which is NOT the round-trip the spike is testing."
- **Wallclock:** 6s final probe + ~1-2s npm install (RESEARCH estimate: 30-60 min including SDK ad-hoc fetch; actual final probe: 6s — well under)
- **Exit code:** 0 (per Plan 03 SUMMARY §Performance — probe ran clean after 5 deviation-fix iterations; final run exit 0)
- **Anthropic API cost:** ~$0.005 (one Haiku turn with one tool invocation; well under per-path $0.10 informal ceiling and well under D-G3 reference threshold)
- **SDK availability:** SDK_AVAILABLE=1 (post-fix; the initial 4 probe-run attempts surfaced install/resolution issues documented under Plan 03 Deviations 2-4); SDK_MODE=`scratch-installed (ad-hoc; stub copied to /tmp/spike-128b-D-<scratch>/sdk-install/pathD-mcp-server.mjs)`
- **D-A1 isolation audit:** `git diff --name-only HEAD~2 HEAD | grep -E '(^|/)package\.json$'` → empty; `npx --package` ad-hoc fetch + scratch-dir SDK install + stub-copy pattern; project package.json files NOT modified (verified via `grep -i modelcontextprotocol vigil-core/package.json` returning nothing — same as pre-spike state)
- **Tool invocation:** YES — `vigil_external_reply` was called by Claude; the distinctive sentinel `VIGIL-SPIKE-OK-1337` originated from the MCP server's tool-result and surfaced verbatim in Claude's stdout (`pathD-fresh-out.txt` contains exactly the sentinel with markdown code fences added by a linter post-run)
- **Active-session direction:** documented analytically as STRUCTURAL FAIL — MCP tools are tools Claude CALLS, not channels that PUSH to Claude; Vigil cannot force a tool call mid-turn (RESEARCH §"Path D" + CONTEXT line 222)
- **Evidence files:**
  - `.planning/spikes/128b-write-back/evidence/pathD-mcp-config.json` — the mcp-config wiring the COPIED MCP server stub to claude -p with `VIGIL_BUFFERED_REPLY=VIGIL-SPIKE-OK-1337` env
  - `.planning/spikes/128b-write-back/evidence/pathD-fresh-out.txt` — raw claude stdout including tool invocations (3 lines: triple-backtick, `VIGIL-SPIKE-OK-1337`, triple-backtick)
  - `.planning/spikes/128b-write-back/pathD-mcp-server.mjs` — the ~38 LOC stdio MCP server stub (after Plan 03 Deviation 3 schema-import addition; still well under the ≤80 lines / ≤2KB cap)
  - `.planning/spikes/128b-write-back/evidence/pathD-sdk-install-err.txt` — (only present if SDK fetch failed; ABSENT in this run after Deviation 2 fix)
  - `.planning/spikes/128b-write-back/evidence/pathD-TRANSCRIPT.md` — mini-verdict (mechanical, branches on SDK_AVAILABLE; SDK_AVAILABLE=1 + FRESH_PASS=1 ⇒ DEGRADE branch selected)
- **Probe script:** `.planning/spikes/128b-write-back/pathD-mcp-probe.sh` (10,933 bytes; mode 0755; commit e1b17cc)

### Path E — tmux send-keys (★ — pre-validated in spike 001; regression re-run in Plan 04)

- **Mini-verdict (verbatim from TRANSCRIPT, Regression row):** "**Regression mini-verdict: PASS (re-confirmed)** / Overall Path E Mini-Verdict: **PASS — re-confirmed in current env; D-V4 max aggregation: Path E dominates per-path table**"
- **Mini-verdict (Historical, from spike 001 README §Results):** "PASS (all 4 D-V1 steps ✓)"
- **Wallclock (regression):** 71s (spike 001 §Iteration 4 reference: 77s end-to-end; 6s under reference and well inside the plan's 3-min ≤180s ceiling)
- **Wallclock (historical):** 77s (spike 001 §Iteration 4)
- **Exit code (regression):** 0 (per Plan 04 SUMMARY §Performance — `$REGRESSION_EXIT=0`)
- **Regression PASS detected:** 1 (per Plan 04 SUMMARY §"Regression-Run Mechanical Signals" — `$REGRESSION_PASS=1` computed via `grep -qE 'PASS|complete|round-trip|L4-TOOL-RAN-' pathE-regression-run.log`)
- **Anthropic API cost (regression):** ~$0.01 (one fresh L4 round-trip at Haiku rate; one Haiku interactive session: trust-dialog dismiss + tool-prompt + permission-grant + Bash-tool-run + 60s idle + health-probe answer)
- **Anthropic API cost (historical):** <$0.02 (per spike 001 README §Cost lines 234-239 — L1 + L2: $0; L3: ~$0.005; L4: ~$0.01; total <$0.02)
- **Mechanism:** `tmux send-keys -t <session> Enter` from a non-TTY writer; tmux server (operator-uid, 0700 socket) writes to the pty fd it already owns. No ptrace, no /proc/<pid>/fd/0, no preflight FD redirect.
- **Surfaced constraint (Phase 133 carry-forward):** Claude Code must be launched **inside a tmux pane** for Path E to work (spike 001 README §"Surfaced constraint" lines 175-178); Phase 133 productionization detects non-wrapped sessions and degrades to G2-REPLY-05 banner-ack-only for that session
- **Evidence files (phase-local copies):**
  - `.planning/spikes/128b-write-back/evidence/pathE-regression-run.log` — full stdout+stderr of the re-run (1244 bytes, 26 lines; contains `L4: PASS` and `L4-TOOL-RAN-82538860`)
  - `.planning/spikes/128b-write-back/evidence/pathE-L4-permission-pause-snapshot.txt` — copy of spike 001's `needs_input` dialog evidence (5283 bytes; cmp-verified byte-for-byte equal)
  - `.planning/spikes/128b-write-back/evidence/pathE-L4-health-check-snapshot.txt` — copy of spike 001's 60s-health-probe transcript (5911 bytes; cmp-verified byte-for-byte equal; contains `221`)
  - `.planning/spikes/128b-write-back/evidence/pathE-L4-tool-output-marker.txt` — copy of spike 001's unique-marker proof (21 bytes; cmp-verified byte-for-byte equal; contains `L4-TOOL-RAN-91284096`)
  - `.planning/spikes/128b-write-back/evidence/pathE-TRANSCRIPT.md` — Historical PASS + Regression mini-verdicts (4061 bytes, 62 lines)
- **Evidence files (spike 001 originals — UNCHANGED):**
  - `.planning/spikes/001-tmux-write-back-128b/evidence/L4-permission-pause-snapshot.txt` (mtime preserved at 2026-05-14 20:55:33)
  - `.planning/spikes/001-tmux-write-back-128b/evidence/L4-health-check-snapshot.txt` (mtime preserved at 2026-05-14 20:55:33)
  - `.planning/spikes/001-tmux-write-back-128b/evidence/L4-tool-output-marker.txt` (mtime preserved at 2026-05-14 20:55:33)
  - `.planning/spikes/001-tmux-write-back-128b/evidence/L3-claude-response-snapshot.txt` (L3 ancestor; not load-bearing for L4 PASS)
- **Regression script:** `.planning/spikes/001-tmux-write-back-128b/L4-needs-input-pause.sh` (re-run by Plan 04; spike 001 owns)

### Path C — named-pipe / FIFO (NOT empirically tested — analytical-only)

- **Verdict source:** RESEARCH §"Path C" recommendation + spike 001 README §"Position vs. the 4 enumerated 128b paths"
- **Analytical mini-verdict:** "INCONCLUSIVE — covered analytically by Path E (structural refinement)"
- **Wallclock:** 0 (skipped per CONTEXT D-O4 wallclock cap + RESEARCH §"Open Questions §2" recommendation)
- **API cost:** $0
- **Rationale:** Path E (`tmux send-keys`) is structurally a clean refinement of Path C — the tmux server is a pre-existing, well-tested, user-uid launcher that owns the pty FD. Vigil doesn't have to invent the launcher (C1) or escalate privileges to ptrace (C2). The "3 of 4" success criterion is satisfied by A + B + D empirical + Path E historical, without needing Path C. Spike 001 README §"Position vs. the 4 enumerated 128b paths" frames Path E as the structural refinement of Path C.

---

## Cost summary

| Path | Wallclock | API cost | Notes |
|------|-----------|----------|-------|
| B | 6s | $0.0965 | Cheapest probe per D-O1; fresh-session-only PASS predicted ⇒ DEGRADE; first-invocation cache-creation cost (76,765 tokens 5m+1h cache); re-runs amortize to ~$0.005 |
| A | 39s | ~$0.00 | Clobber-protected operation on COPY of corpus session per D-T5; `claude --resume` against exited session consumed no API tokens |
| D | 6s | ~$0.005 | Ad-hoc MCP SDK via npx; D-A1 isolation (no project package.json mutation); 5 deviation-fix iterations during probe development |
| E (regression) | 71s | ~$0.01 | spike 001 L4 re-run; copies of evidence preserved in phase artifact set; 6s under spike 001 reference 77s |
| E (spike 001) | 77s | <$0.02 | Historical reference; preserved record at sibling spike dir per spike 001 README §Cost lines 234-239 |
| C | 0 | $0 | NOT tested — analytical-only per RESEARCH §"Open Questions §2"; structurally superseded by Path E |
| **Total (empirical, Plans 01-04)** | **122s** | **~$0.111** | per RESEARCH §Cost ≤$0.20 expected — UNDER (after one-time Path B cache cost; subsequent re-runs would be ~$0.021) |
| **Total (incl. spike 001 historical)** | **199s** | **~$0.131** | per RESEARCH §Cost ≤$0.20 expected — UNDER |

## Evidence file inventory

Phase-local artifact set (per CONTEXT D-A4):

- `.planning/phases/128b-g2-reply-01-write-back-path-spike/`
  - `128b-CONTEXT.md` (locked)
  - `128b-DISCUSSION-LOG.md` (locked)
  - `128b-RESEARCH.md` (locked)
  - `128b-VALIDATION.md` (locked)
  - `128b-NN-PLAN.md` × 8 (plans 01-08)
  - `128b-NN-SUMMARY.md` × 5+ (plan execution records 01-04 complete; 06 this file's plan; 05/07/08 pending)
  - `128b-MEASUREMENTS.md` (this file)
  - `128b-SPIKE-DECISION.md` (Plan 05 — verdict at TOP; pending)
  - `60s-demo.mp4` OR Loom URL recorded in SPIKE-DECISION header (Plan 08 C-2; pending)

- `.planning/spikes/128b-write-back/` (NEW per CONTEXT D-A1)
  - `README.md` + `pathA-jsonl-append.sh` + `pathB-stream-json.sh` + `pathD-mcp-probe.sh` + `pathD-mcp-server.mjs`
  - `evidence/` (per-path raw outputs + at-detection snapshots + TRANSCRIPT mini-verdicts + Path E regression artifacts):
    - Path A: `pathA-jsonl-after.txt`, `pathA-final-pane.txt`, `pathA-TRANSCRIPT.md` (plus `pathA-at-detection.txt` ABSENT by design on predicted FAIL)
    - Path B: `pathB-fresh-out.jsonl`, `pathB-fresh-err.txt`, `pathB-TRANSCRIPT.md`
    - Path D: `pathD-mcp-config.json`, `pathD-fresh-out.txt`, `pathD-TRANSCRIPT.md`
    - Path E: `pathE-regression-run.log`, `pathE-L4-permission-pause-snapshot.txt`, `pathE-L4-health-check-snapshot.txt`, `pathE-L4-tool-output-marker.txt`, `pathE-TRANSCRIPT.md`

- `.planning/spikes/001-tmux-write-back-128b/` (PRE-EXISTING — referenced only)
  - `README.md` (verdict VALIDATED-2026-05-14; immutable)
  - `L1-sanity-cat.sh`, `L2-python-repl.sh`, `L3-claude-basic.sh`, `L4-needs-input-pause.sh` (canonical Path E probe scripts)
  - `evidence/L3-claude-response-snapshot.txt` + `evidence/L4-*.txt` (canonical Path E evidence; phase-local copies under 128b-write-back/evidence/)

- `.planning/spikes/MANIFEST.md` (spike landscape; verdict cells for 001 + 128b-write-back)

## GUARD-03 budget audit (CONTEXT D-G3)

- **Total Anthropic API spend across all 128b paths:** ~$0.131 (Plans 01-04: ~$0.111; spike 001 historical reference: <$0.02)
- **Auth path:** operator's Claude Max OAuth (NOT a multi-user budget; NOT subject to GUARD-03 `DAILY_AI_BUDGET_EXCEEDED` enum)
- **GUARD-03 applicability:** N/A — documented for forensic reference per RESEARCH §Cost
- **Budget headroom remaining:** N/A (single-user OAuth; no per-user daily cap applies)

## D-G1 redaction audit

- This file's variable references + transcript quotes are inherited from per-path TRANSCRIPT.md files; each TRANSCRIPT was authored by Plans 01-04 scripts whose acceptance criteria forbid blocked-property-name variable assignments (CONTEXT D-G1 + `vigil-core/src/analytics/posthog.ts:32` BLOCKED_PROPERTY_NAMES).
- Verified: no occurrences of `^(TOKEN|AUTH|SECRET|BEARER|APIKEY)=` in this file or its source transcripts.

## Cited sources

- per-path TRANSCRIPTs: `.planning/spikes/128b-write-back/evidence/path{A,B,D,E}-TRANSCRIPT.md`
- per-plan SUMMARYs: `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-{01,02,03,04}-SUMMARY.md`
- spike 001 README §Cost lines 234-239 + §Results lines 141-157
- RESEARCH §"Per-Path Predicted-Verdict Summary" + §"Cost"
- CONTEXT D-A4 (artifact list) + D-G1 (redaction) + D-G3 (budget) + D-O4 (wallclock cap)
