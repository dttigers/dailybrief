---
phase: 128b-g2-reply-01-write-back-path-spike
plan: 01
subsystem: spike

tags: [128b, write-back, spike, path-b, stream-json, claude-code, g2-reply-01]

requires:
  - phase: 128b-CONTEXT
    provides: D-V1 four-step gate, D-V2 DEGRADE bullets, D-A1 verbatim spike-dir name (.planning/spikes/128b-write-back/), D-G1 redaction, D-O1 path ordering
  - phase: 128b-RESEARCH
    provides: Path B concrete probe shape (lines 305-323), predicted verdict DEGRADE (fresh-only), false-positive-resistant sentinel pattern (1337 from 7×191)
  - phase: spike-001-tmux-write-back-128b
    provides: TOSSABLE-header convention, layered probe pattern, false-positive-resistant sentinel template, mechanical verdict computation precedent

provides:
  - .planning/spikes/128b-write-back/ directory scaffold (README + evidence/) per CONTEXT D-A1
  - .planning/spikes/MANIFEST.md row "128b-WB | 128b-write-back | phase-spike | … | 🚧 in-progress"
  - .planning/spikes/128b-write-back/pathB-stream-json.sh — Path B probe (TOSSABLE, mechanical D-V1 mini-verdict generator)
  - .planning/spikes/128b-write-back/evidence/pathB-fresh-out.jsonl — raw stream-json transcript (9 lines, sentinel 1337 present at line 6 thinking + line 7 text + line 9 result)
  - .planning/spikes/128b-write-back/evidence/pathB-fresh-err.txt — stderr (empty after --verbose fix)
  - .planning/spikes/128b-write-back/evidence/pathB-TRANSCRIPT.md — Path B mini-verdict ⇒ DEGRADE (fresh-only)

affects:
  - 128b-02 (Path A JSONL append — same spike dir, README/Layout already documents it)
  - 128b-03 (Path D MCP — same spike dir, README/Layout already documents it)
  - 128b-05 (SPIKE-DECISION aggregation — consumes pathB-TRANSCRIPT.md as the empirical Path B row in the per-path verdict table)
  - 128b-06 (MEASUREMENTS — consumes pathB-fresh-out.jsonl + transcript for consolidated per-path log + cost ledger)

tech-stack:
  added: []
  patterns:
    - Mechanical D-V1 mini-verdict via heredoc using FRESH_PASS computed from grep (Pitfall 5 — no subjective override; reviewer can re-run script and confirm)
    - Per-path TRANSCRIPT.md cohabits with raw evidence in spikes/<dir>/evidence/, decoupling probe execution from SPIKE-DECISION aggregation
    - Negative-finding documentation (active-session structurally impossible — claude -p is print-and-exit) recorded as ✗ in the D-V1 table rather than as a missing test (D-V3 unsafe-primitive ban honored)

key-files:
  created:
    - .planning/spikes/128b-write-back/README.md
    - .planning/spikes/128b-write-back/evidence/.gitkeep
    - .planning/spikes/128b-write-back/pathB-stream-json.sh (mode 0755)
    - .planning/spikes/128b-write-back/evidence/pathB-fresh-out.jsonl
    - .planning/spikes/128b-write-back/evidence/pathB-fresh-err.txt
    - .planning/spikes/128b-write-back/evidence/pathB-TRANSCRIPT.md
  modified:
    - .planning/spikes/MANIFEST.md (appended 128b-WB row; 001 row untouched)

key-decisions:
  - "Path B mini-verdict empirically resolves to DEGRADE (fresh-only) — matches RESEARCH §Path B prediction; feeds Plan 05 SPIKE-DECISION per-path table"
  - "Active-session question for Path B documented as STRUCTURAL FAIL, not as a missing test (claude -p is print-and-exit by design; no input channel exists; ptrace/proc-fd attacks forbidden by D-V3)"
  - "claude CLI requires --verbose with --print + --output-format=stream-json (Rule 3 deviation; documented inline in script and below)"

patterns-established:
  - "Per-path probe + per-path TRANSCRIPT.md pattern: each plan in 128b-02..04 will follow the same shape (probe script writes its own TRANSCRIPT into spike-dir/evidence/; SPIKE-DECISION aggregator consumes them in plan 05 without re-running probes)"
  - "Mechanical-verdict heredoc: TRANSCRIPT generation uses shell variables computed from grep (FRESH_PASS), eliminating reviewer-side subjective override"

requirements-completed: [G2-REPLY-01]

duration: ~4min
completed: 2026-05-14
---

# Phase 128b Plan 01: Path B (claude stream-json) write-back spike — DEGRADE (fresh-only)

**Path B (`claude -p --input-format stream-json --output-format stream-json --verbose --model haiku`) empirically PASSES on a fresh subprocess (sentinel 1337 detected from 7×191 compute prompt) and STRUCTURALLY FAILS on active-session (no input channel exists — `-p` is print-and-exit by design); per D-V2 bullet 1 mini-verdict ⇒ DEGRADE (fresh-only), confirming RESEARCH prediction and giving Plan 05 SPIKE-DECISION its first per-path empirical row.**

## Performance

- **Duration:** ~4 min wallclock (script run 6s; remainder spike-dir scaffolding + commit prep)
- **Started:** 2026-05-14T22:07:00Z
- **Completed:** 2026-05-14T22:10:33Z
- **Tasks:** 2 / 2
- **Files created:** 6
- **Files modified:** 1
- **Anthropic API spend:** $0.0965 (1 Haiku turn — see "Issues Encountered" for why this was 19× higher than RESEARCH §Cost estimate of $0.005)

## Accomplishments

- New spike directory `.planning/spikes/128b-write-back/` per CONTEXT D-A1, distinct from sibling spike `001-tmux-write-back-128b/` which owns Path E
- Bidirectional cross-link: README.md `## Sibling spike` section + MANIFEST.md row, both in place
- Path B probe script (TOSSABLE header, `set -euo pipefail`, descriptive var names per D-G1, no `--bare` per Pitfall 3) runs to completion in 6 seconds and produces three evidence files
- Mechanical D-V1 mini-verdict ⇒ **DEGRADE (fresh-only)** — matches RESEARCH prediction; feeds Plan 05 SPIKE-DECISION aggregation
- Probe is reproducible: any reviewer can re-run `bash .planning/spikes/128b-write-back/pathB-stream-json.sh` and re-derive the same TRANSCRIPT (Pitfall 5 mitigation)

## Task Commits

1. **Task 1: Create spike directory + README + MANIFEST row** — `1725b65` (docs)
2. **Task 2: Write + run pathB-stream-json.sh probe; capture evidence + transcript** — `3ce22c3` (feat)

_Plan metadata commit follows below this SUMMARY's authorship._

## Files Created/Modified

- `.planning/spikes/128b-write-back/README.md` — phase-spike landing page; cross-links spike 001 + phase artifacts; Layout previews paths A/D for plans 02/03
- `.planning/spikes/128b-write-back/evidence/.gitkeep` — single-line CONVENTIONS.md citation; preserves the empty `evidence/` dir in git
- `.planning/spikes/128b-write-back/pathB-stream-json.sh` — Path B probe (mode 0755); RUN from repo root
- `.planning/spikes/128b-write-back/evidence/pathB-fresh-out.jsonl` — raw stream-json transcript (9 lines)
- `.planning/spikes/128b-write-back/evidence/pathB-fresh-err.txt` — stderr (empty)
- `.planning/spikes/128b-write-back/evidence/pathB-TRANSCRIPT.md` — mechanical mini-verdict (DEGRADE fresh-only)
- `.planning/spikes/MANIFEST.md` — appended one row (128b-WB / 128b-write-back / phase-spike / … / 🚧 in-progress); 001 row untouched

## Decisions Made

- **Active-session row in D-V1 table = ✗ at step 2 (no input channel), not "untested".** Per CONTEXT D-V3 unsafe-primitive ban, ptrace and `/proc/<pid>/fd/0` writes are explicitly forbidden as PASS evidence. The negative finding is structural (claude -p is print-and-exit by design), not a defect of effort.
- **`--model haiku` retained** for cost control even though actual run cost ($0.0965) was 19× the RESEARCH estimate due to ephemeral 5m + 1h cache creation on the first invocation; subsequent re-runs would hit the cache and cost ~$0.005. Documented for Plan 06 MEASUREMENTS.
- **Cost: $0.0965 for one turn** — well under the per-path $0.10 informal ceiling and the spike-total ~$0.20 GUARD-03 reference cap (D-G3 N/A per CONTEXT but documented anyway).

## Verbatim Mini-Verdict (from `pathB-TRANSCRIPT.md`)

> **Fresh-session: PASS**
> **Active-session: STRUCTURAL FAIL** (no input channel exists; not a defect of Path B but a property of `claude -p`).
>
> **Per D-V2 bullet 1** ("Round-trip works ONLY on fresh `claude -p` sessions, NOT mid-interactive-session"):
> Path B mini-verdict ⇒ **DEGRADE (fresh-only)**

## Sentinel-Detection Result

**Sentinel `1337` detected ⇒ YES** (3 occurrences across 9-line JSONL stream).

Quoted matches from `pathB-fresh-out.jsonl`:

- **Line 6** (assistant `thinking` block):
  > `"thinking":"The user is asking me to compute 7 × 191 and reply with only the resulting integer.\n\nLet me calculate:\n7 × 191 = 7 × (190 + 1) = 7 × 190 + 7 × 1 = 1330 + 7 = 1337\n\nSo the answer is 1337."`
- **Line 7** (assistant `text` block):
  > `"text":"1337"`
- **Line 9** (`result` row):
  > `"result":"1337"`

Pitfall 1 mitigation **verified**: the prompt text `"Compute seven multiplied by one hundred ninety-one. Reply with only the resulting integer."` contains the English-words form, NOT the digit string `1337`. The grep matches Claude's reply, NOT echoed prompt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `--verbose` flag to `claude -p ... --output-format=stream-json` invocation**

- **Found during:** Task 2 (probe script first run)
- **Issue:** RESEARCH §"Path B" lines 312-314 specify `claude -p --input-format stream-json --output-format stream-json --model haiku`. The current claude CLI (2.1.141) rejects this with stderr `"Error: When using --print, --output-format=stream-json requires --verbose"`. RESEARCH was authored before this CLI surface change.
- **Fix:** Added `--verbose` to the claude invocation. Verbose output adds extra system rows to the stream-json stream (e.g., system init), but the grep-for-`1337` sentinel check is order-independent and tolerates the extra rows without modification. Probe semantics — does the model receive the prompt and emit a reply containing the computed value? — are unchanged.
- **Files modified:** `.planning/spikes/128b-write-back/pathB-stream-json.sh` (commit `3ce22c3`)
- **Verification:** Re-ran probe; exit 0 in 6s; sentinel 1337 detected; transcript correctly computed `DEGRADE (fresh-only)`.
- **Committed in:** `3ce22c3` (Task 2 commit, with fix already in initial committed version of script)
- **Documented inline:** Yes — the `# DEVIATION FROM RESEARCH (Rule 3 — Blocking issue, auto-fixed):` comment block in the script explains the flag and why the semantics are preserved.

**2. [Rule 3 - Blocking] Added `|| true` to the claude pipeline so the script always emits a TRANSCRIPT regardless of claude exit code**

- **Found during:** Task 2 (probe script first run)
- **Issue:** With `set -euo pipefail`, the original script aborted on the `claude -p` line when claude returned non-zero (the `--verbose`-required error before fix #1). The transcript was never written, defeating the plan's spec point 12: "the script runs to completion regardless of FRESH_PASS — the transcript records the mini-verdict either way".
- **Fix:** Appended `|| true` to the printf-into-claude pipeline. The grep-for-`1337` sentinel check then naturally records FRESH_PASS=0 if the JSONL is empty/error, and the heredoc emits `**Fresh-session: FAIL**` accordingly. Mechanical verdict integrity preserved.
- **Files modified:** `.planning/spikes/128b-write-back/pathB-stream-json.sh`
- **Verification:** Same as fix #1 (re-run produced exit 0 + correct DEGRADE verdict; if claude were to fail in the future, the transcript would record `FAIL` rather than crashing the script).
- **Committed in:** `3ce22c3`
- **Documented inline:** Yes — same comment block.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — Blocking)
**Impact on plan:** Both fixes are CLI-surface-version corrections to a probe spec drafted weeks earlier; semantics of the empirical test are unchanged. The mini-verdict (DEGRADE fresh-only) matches the RESEARCH prediction exactly. No scope creep.

## Issues Encountered

- **Anthropic API cost was 19× the RESEARCH estimate** (actual $0.0965 vs estimated $0.005). Root cause: first invocation of `claude -p --model haiku` in this cwd triggered ephemeral 5m + 1h cache creation of 76,765 tokens (the project + memory + plugins context). Subsequent re-runs would amortize this cost. Documented for Plan 06 MEASUREMENTS so the consolidated cost ledger reflects empirical truth, not the pre-spike estimate. Still well under any meaningful spend cap; well under D-G3 reference threshold.
- No other issues. Probe ran clean; stderr file is zero bytes after the `--verbose` fix.

## User Setup Required

None — probe ran against the operator's existing `claude` CLI (Claude Max OAuth via `~/.local/bin/claude 2.1.141`); no env vars, no extra installs, no dashboard steps.

## Next Phase Readiness

- Plan 02 (Path A — JSONL append) can drop `pathA-jsonl-append.sh` into `.planning/spikes/128b-write-back/` without further scaffolding; the README Layout section already lists it.
- Plan 03 (Path D — MCP) can drop `pathD-mcp-probe.sh` + `pathD-mcp-server.mjs` into the same dir; README Layout lists those too.
- Plan 05 (SPIKE-DECISION) has its first per-path empirical row available: `Path B = DEGRADE (fresh-only)`, evidence at `.planning/spikes/128b-write-back/evidence/pathB-TRANSCRIPT.md`.
- Plan 06 (MEASUREMENTS) has Path B's wallclock (6s) + cost ($0.0965 first-run, ~$0.005 cache-warm) + JSONL line count (9) ready for consolidation.

## Handoff

- **Plan 02** owns `pathA-jsonl-append.sh` — same spike dir, mirror this script's structure (TOSSABLE header, set -euo pipefail, descriptive vars, mechanical TRANSCRIPT heredoc). Path A operates on a copy of a real session JSONL from `~/.claude/projects/-home-morrillboss-dev-dailybrief/` per CONTEXT D-T5 clobber-protection.
- **Plan 03** owns `pathD-mcp-probe.sh` + `pathD-mcp-server.mjs` — same spike dir, hand-rolled stdio MCP server stub (~30 LOC per CONTEXT line 177); test whether Claude Code can be configured to auto-call a `vigil_external_reply` tool.
- **Plan 04** owns the per-path verdict aggregation glue (if any beyond the per-plan TRANSCRIPTs).
- **Plan 05** authors `128b-SPIKE-DECISION.md` — VERDICT at top, per-path table includes `Path B | DEGRADE (fresh-only) | pathB-TRANSCRIPT.md`. Per D-V4 max rule and spike 001's Path E PASS, overall verdict is mechanically PASS.
- **Plan 06** authors `128b-MEASUREMENTS.md` — per-path wallclock + cost + evidence-line-count consolidated; uses pathB-TRANSCRIPT.md + pathB-fresh-out.jsonl directly.

## Self-Check: PASSED

Verified before commit:

- `.planning/spikes/128b-write-back/README.md` — FOUND
- `.planning/spikes/128b-write-back/evidence/.gitkeep` — FOUND
- `.planning/spikes/128b-write-back/pathB-stream-json.sh` — FOUND (mode 0755)
- `.planning/spikes/128b-write-back/evidence/pathB-fresh-out.jsonl` — FOUND (non-empty, 9 lines)
- `.planning/spikes/128b-write-back/evidence/pathB-fresh-err.txt` — FOUND (empty after --verbose fix)
- `.planning/spikes/128b-write-back/evidence/pathB-TRANSCRIPT.md` — FOUND (contains D-V1 table, "Per D-V2 bullet 1", and the mini-verdict line "DEGRADE (fresh-only)")
- Commit `1725b65` (Task 1) — FOUND in `git log`
- Commit `3ce22c3` (Task 2) — FOUND in `git log`
- MANIFEST 128b-WB row — FOUND; 001 row untouched (verified by `grep -c '| 001 '` returning 1)

---
*Phase: 128b-g2-reply-01-write-back-path-spike*
*Completed: 2026-05-14*
