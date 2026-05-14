---
phase: 128b-g2-reply-01-write-back-path-spike
plan: 05
subsystem: spike

tags: [128b, write-back, spike, spike-decision, verdict, pass, phase-133-handoff]

requires:
  - phase: 128b-CONTEXT
    provides: D-V1 four-step gate, D-V4 mechanical-aggregation rule, D-A4 artifact list, D-G3 GUARD-03 N/A determination
  - phase: 128b-RESEARCH
    provides: §"Per-Path Predicted-Verdict Summary", §"Criteria Mapping" (lines 539-547), §"Phase 133 Scope-Lock Implications" (lines 548-601), §"Trust-Model Asymmetry" (lines 603-614)
  - phase: 128b-01
    provides: Path B mini-verdict ⇒ DEGRADE (fresh-only)
  - phase: 128b-02
    provides: Path A mini-verdict ⇒ FAIL
  - phase: 128b-03
    provides: Path D mini-verdict ⇒ DEGRADE (inverted model — fresh-session-only via prompted tool-call)
  - phase: 128b-04
    provides: Path E regression mini-verdict ⇒ PASS (re-confirmed) — the PASS driver per D-V4 max aggregation
  - phase: 128b-06
    provides: Cost summary table + per-path wallclock + evidence inventory (consumed by SPIKE-DECISION §Cost summary)
  - phase: spike-001-tmux-write-back-128b
    provides: README §"Privilege & portability sketch" lines 182-218 (verbatim copy source for SPIKE-DECISION §Privilege & portability sketch); README §"Three Phase 133 implications" lines 228-232

provides:
  - .planning/phases/128b-g2-reply-01-write-back-path-spike/128b-SPIKE-DECISION.md — verdict at TOP + per-path table + criteria mapping + privilege sketch (referenced) + Phase 133 scope-lock + trust posture + INBOUND/OUTBOUND asymmetry + three Phase 133 implications + cost summary
  - .planning/spikes/128b-write-back/README.md frontmatter `verdict: VALIDATED-PASS` (was `in-progress`)
  - .planning/spikes/MANIFEST.md row `128b-WB` Verdict cell `✓ VALIDATED-PASS` (was `🚧 in-progress`)

affects:
  - 128b-07 (60s portfolio Loom recording, C-2 wallclock checkpoint) — Loom shape now confirmed as success-demo per PASS verdict (not failure-mode documentation)
  - 128b-08 (final spike closeout) — can cite SPIKE-DECISION verdict at TOP as the gate that resolves the phase
  - Phase 133 (G2 closeout bundle) — scope-locked to FULL G2-REPLY-02..04 reply UX (per CONTEXT D-V1 PASS-gate scope-lock rule); reads SPIKE-DECISION §"Phase 133 Scope-Lock Implications" §1 for writer-process location (vigil-tmux-bridge on Ubuntu, NOT vigil-watch on Mac); reads §Privilege & portability sketch for the 5-string allowlist constant to pin via drift-detector test (G2-REPLY-04)
  - REQUIREMENTS.md G2-REPLY-01 — marked complete (success criteria 1-4 all satisfied with artifact mapping)

tech-stack:
  added: []
  patterns:
    - "Verdict-at-TOP invariant (Phase 128a D-V1 precedent): file's first non-frontmatter line matches the regex `^\\*\\*VERDICT: (PASS|DEGRADE|BLOCK)\\*\\*$`; non-editable thereafter; re-tests that contradict open Phase 128b.1 (NOT edit-this-line)"
    - "Mechanical D-V4 aggregation: overall_verdict = MAX_BY_ORDER(PASS > DEGRADE > FAIL > INCONCLUSIVE, [pathA, pathB, pathC, pathD, pathE]); reviewer can re-compute by opening per-path TRANSCRIPT files"
    - "Reuse-by-reference (D-A2 + RESEARCH §Criteria Mapping #4): privilege/portability sketch copied verbatim from spike 001 README lines 182-218 with citation marker; NOT re-derived in any plan in this phase (drift-elimination)"
    - "Verbatim cross-document copy with attribution: SURFACE-MAP §'Recent architecture shift (2026-05-14)' Before/After block copied verbatim into SPIKE-DECISION §'Phase 133 Scope-Lock Implications §1'; reviewer can `diff` against canonical source"
    - "Three-location verdict consistency: SPIKE-DECISION line 1 + spike-dir README frontmatter + MANIFEST table row all agree (mechanical mapping PASS ⇒ VALIDATED-PASS); spike 001 row preserved (verdict-locked posture)"

key-files:
  created:
    - .planning/phases/128b-g2-reply-01-write-back-path-spike/128b-SPIKE-DECISION.md
  modified:
    - .planning/spikes/128b-write-back/README.md (frontmatter `verdict:` field only)
    - .planning/spikes/MANIFEST.md (128b-WB row Verdict column only; 001 row UNCHANGED)

key-decisions:
  - "Verdict at TOP is mechanically PASS per D-V4 max aggregation: Path E PASS (re-confirmed by Plan 04) dominates; A=FAIL, B=DEGRADE, D=DEGRADE, C=INCONCLUSIVE all subsumed. Author did NOT decide subjectively (CONTEXT D-V4 invariant honored)."
  - "Privilege & portability sketch copied verbatim from spike 001 README lines 182-218 — NOT re-derived. Cited inline with framing 'copied below verbatim from <path> §<section> lines 182-218. NOT re-derived (D-A2 + RESEARCH §Criteria Mapping criterion 4 reuse-by-reference posture).' This eliminates drift risk; the canonical source remains the single source of truth."
  - "Re-activation conditions section is the SINGLE-LINE N/A marker (per CONTEXT D-V3 + SEED-003 DMARC pattern: re-activation conditions only apply to BLOCK or DEGRADE; PASS verdict gets the N/A marker, NOT a bulleted enumeration with empty placeholders)."
  - "Phase 133 scope-lock §1 copies SURFACE-MAP §'Recent architecture shift (2026-05-14)' Before/After block verbatim — establishes that vigil-tmux-bridge on Ubuntu (NOT vigil-watch on Mac) owns write-back productionization. This is a HANDOFF clarification, NOT a 128b re-scope (CONTEXT D-A3 correctly leaves writer-process location unspecified)."
  - "INBOUND/OUTBOUND asymmetry section EXPLICITLY states `<thought> delimiter pattern does NOT apply` so reviewers cannot conflate Pitfall 6 (INBOUND, captured-thoughts injection) with this phase (OUTBOUND, write-back to Claude Code). Defense pattern split is structural: content wrapping vs string-set restriction."

patterns-established:
  - "Plan 05 SPIKE-DECISION authoring: 10-section template with verdict at TOP, per-path table, criteria mapping, privilege sketch (referenced), Phase 133 scope-lock (5 sub-sections), trust-model asymmetry, three implications, cost summary, re-activation conditions (N/A on PASS). Reusable template for any future phase-spike that closes a `gates Phase NNN` requirement."
  - "Mechanical verdict propagation: SPIKE-DECISION line 1 is the source of truth; spike-dir README frontmatter + MANIFEST table cell are mechanical mappings (PASS ⇒ VALIDATED-PASS, DEGRADE ⇒ DEGRADED-banner-ack-only, BLOCK ⇒ BLOCKED). No subjective interpretation; reviewer can verify all three locations agree by `diff`-style inspection."

requirements-completed: [G2-REPLY-01]

duration: ~12min
completed: 2026-05-14
---

# Phase 128b Plan 05: SPIKE-DECISION authoring — VERDICT PASS

**`128b-SPIKE-DECISION.md` authored with verdict `**VERDICT: PASS**` at TOP (Phase 128a D-V1 verdict-at-TOP invariant honored); D-V4 mechanical max-aggregation `MAX(PASS, DEGRADE, FAIL, DEGRADE, INCONCLUSIVE) = PASS` driven by Path E re-confirmation (Plan 04 regression PASS, 71s vs spike 001 §Iteration 4 reference 77s); 10-section structure populated from per-path TRANSCRIPTs + RESEARCH §Phase 133 Scope-Lock + spike 001 README §Privilege sketch (verbatim copy with citation, NOT re-derived); spike-dir README frontmatter + MANIFEST 128b-WB row mechanically updated to `VALIDATED-PASS` (spike 001 row preserved at `✓ VALIDATED`); G2-REPLY-01 satisfied with all 4 success criteria mapped to artifacts; Phase 133 scope-locked to FULL G2-REPLY-02..04 reply UX (per CONTEXT D-V1 PASS-gate rule).**

## Performance

- **Duration:** ~12 min wallclock (file authoring + verification + 2 commits)
- **Started:** 2026-05-14T23:01:00Z (approximate)
- **Completed:** 2026-05-14T23:13:00Z (approximate)
- **Tasks:** 2 / 2
- **Files created:** 1 (128b-SPIKE-DECISION.md)
- **Files modified:** 2 (.planning/spikes/128b-write-back/README.md frontmatter only; .planning/spikes/MANIFEST.md 128b-WB row Verdict cell only)

## Accomplishments

- Authored `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-SPIKE-DECISION.md` (193 lines, 10 sections) — the phase's primary deliverable, the gate that scope-locks Phase 133
- **Verdict at TOP** (first line: `**VERDICT: PASS**`) — Phase 128a D-V1 verdict-at-TOP invariant honored; non-editable thereafter
- **Per-path table** populated from the four per-path TRANSCRIPT.md files + Path C's analytical row — 5 rows, verdict cells mechanically extracted (NOT subjectively edited)
- **Privilege & portability sketch** copied VERBATIM from spike 001 README lines 182-218 with explicit citation marker — D-A2-compliant; reuse-by-reference per RESEARCH §"Criteria Mapping" #4; NOT re-derived (drift-elimination)
- **Phase 133 Scope-Lock Implications** (5 sub-sections) authored verbatim from RESEARCH §"Phase 133 Scope-Lock Implications" lines 548-601; §1 copies SURFACE-MAP §"Recent architecture shift (2026-05-14)" Before/After block verbatim
- **Trust-Model Asymmetry** section (INBOUND vs OUTBOUND injection) authored verbatim from RESEARCH §"Trust-Model Asymmetry" lines 603-614; explicitly states `<thought> delimiter pattern does NOT apply`
- **Three Phase 133 implications** copied verbatim from spike 001 README §"Three Phase 133 implications" lines 228-232
- **Cost summary** populated from Plan 06 MEASUREMENTS — total ~$0.131 incl. spike 001 historical (~$0.111 empirical Plans 01-04); UNDER RESEARCH ≤$0.20 ceiling
- **Re-activation conditions** section is the SINGLE-LINE N/A marker (per CONTEXT D-V3 + SEED-003 DMARC pattern — PASS verdict)
- Spike-dir README frontmatter `verdict:` field updated from `in-progress` to `VALIDATED-PASS`
- MANIFEST 128b-WB row Verdict column updated from `🚧 in-progress` to `✓ VALIDATED-PASS`; spike 001 row UNCHANGED (verdict-locked posture preserved)
- Plan's automated verification command ran end-to-end and emitted `SPIKE-DECISION structure verified` + `Verdict propagated: PASS` (both Tasks 1 and 2 verifications passed)

## Task Commits

1. **Task 1: Author 128b-SPIKE-DECISION.md (verdict at TOP, per-path table, criteria mapping, privilege sketch reference, Phase 133 scope-lock, trust posture, asymmetry, implications, cost summary)** — `6c2b8d0` (docs)
2. **Task 2: Update spike-dir README + MANIFEST verdict cell** — `14aa7c3` (docs)

_Plan metadata commit follows below this SUMMARY's authorship._

## Files Created/Modified

- **Created:** `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-SPIKE-DECISION.md` (193 lines, 10 sections per Phase 128a D-V1 precedent + RESEARCH §"Phase 133 Scope-Lock Implications" + CONTEXT §"Phase Boundary" success criteria 1-4)
- **Modified:** `.planning/spikes/128b-write-back/README.md` — frontmatter `verdict:` field only, in-progress → VALIDATED-PASS; body of README unchanged (no scope creep)
- **Modified:** `.planning/spikes/MANIFEST.md` — 128b-WB row Verdict column only (🚧 in-progress → ✓ VALIDATED-PASS); 001 row UNCHANGED (still `✓ VALIDATED`)

## Verbatim Verdict Computation (from `128b-SPIKE-DECISION.md` §"Verdict computation")

| Path | Per-path mini-verdict | Source |
|------|------------------------|--------|
| A — JSONL append + IPC | **FAIL** | `pathA-TRANSCRIPT.md` |
| B — stream-json (claude -p) | **DEGRADE (fresh-only)** | `pathB-TRANSCRIPT.md` |
| C — named-pipe / FIFO | INCONCLUSIVE — covered analytically by Path E | spike 001 README + RESEARCH §"Open Questions §2" |
| D — MCP server hook | **DEGRADE (inverted model — fresh-session-only via prompted tool-call)** | `pathD-TRANSCRIPT.md` |
| E ★ — tmux send-keys | **PASS (re-confirmed)** | `pathE-TRANSCRIPT.md` + spike 001 evidence |

**Aggregation:** `MAX(PASS > DEGRADE > FAIL > INCONCLUSIVE)` = **PASS**.

## Verdict surprise check

**Surprise: NO.** The computed verdict (PASS) matches the predicted verdict from RESEARCH §"Per-Path Predicted-Verdict Summary" exactly. Path E's PASS (re-confirmed) was the dominant predicted outcome; Plan 04 regression re-run confirmed it empirically with `REGRESSION_EXIT=0`, `REGRESSION_PASS=1`, 71s wallclock (6s under spike 001 §Iteration 4 reference 77s). The other per-path verdicts (A=FAIL, B=DEGRADE fresh-only, D=DEGRADE inverted, C=INCONCLUSIVE-by-design) all match RESEARCH predictions exactly — they are mechanically subsumed by Path E's PASS regardless.

**No Phase 128b.1 follow-up required.** Per CONTEXT D-V4: the verdict is non-editable once written; if a re-test contradicts, open Phase 128b.1. No re-test contradicted; no follow-up needed.

## Phase 133 handoff

Phase 133 planner reads `128b-SPIKE-DECISION.md` for the following gate-resolved decisions:

- **Scope-lock confirmation:** PASS verdict ⇒ Phase 133 implements **full G2-REPLY-02..04 reply UX** (DOUBLE_CLICK enter reply mode → cycle 5 prefabs → DOUBLE_CLICK send → reply lands), per CONTEXT D-V1 PASS-gate scope-lock rule. NOT G2-REPLY-05 banner-ack-only (which would have been the DEGRADE/BLOCK fallback).
- **Writer-process location:** `vigil-tmux-bridge` (Ubuntu daemon, NEW), NOT `vigil-watch` (Mac, presentation-only after the 2026-05-14 shift). Source: SPIKE-DECISION §"Phase 133 Scope-Lock Implications §1" (verbatim from SURFACE-MAP §"Recent architecture shift (2026-05-14)").
- **5-string allowlist (G2-REPLY-04 source-of-truth):** `['yes', 'no', 'continue', 'abort', 'defer']`. Phase 133 G2-REPLY-04 implementation pins this verbatim from SPIKE-DECISION §"Privilege & portability sketch" (which in turn cites spike 001 README lines 182-218). Drift-detector test pins at the source-of-truth call site per RESEARCH §"Criteria Mapping" criterion 4.
- **Trust posture:** vigil-tmux-bridge MUST be a pull-based consumer of `agent_stream` SSE outbound — never inbound-exposed. Bounded blast radius if vigil-core (Railway) is compromised: 5 strings only. Source: SPIKE-DECISION §"Phase 133 Scope-Lock Implications §2" (per the unknown-user-profile incident 2026-05-14).
- **Operator workflow target:** Ubuntu, not Mac. The "live Claude Code session" the spike validates against IS the Ubuntu tmux. Phase 133 productionizes against `claude` running inside a `vigil-claude` launcher wrapper (uniquely-named tmux pane, `vigil-claude-<timestamp>` prefix). Source: SPIKE-DECISION §"Phase 133 Scope-Lock Implications §3".
- **Launcher wrapper UX:** Phase 133 onboarding step requires operator launches Claude Code via `vigil-claude` (or equivalent). If launched directly (no tmux wrapper), `vigil-tmux-bridge` cannot reach the input channel; degrade to G2-REPLY-05 banner-ack-only for that session. Source: SPIKE-DECISION §"Phase 133 Scope-Lock Implications §4" + §"Three Phase 133 implications #2".
- **INBOUND vs OUTBOUND defense asymmetry:** Phase 133 does NOT need `<thought>` delimiter sanitization for the 5-string write-back path; the defense is string-set restriction (only 5 strings can be sent, full stop). Source: SPIKE-DECISION §"Trust-Model Asymmetry" (per RESEARCH §"Trust-Model Asymmetry" + PITFALLS.md §"Pitfall 6").

## Citation audit

Each cited source resolves to an existing file/section before commit:

| Cited source | Resolution check |
|--------------|------------------|
| `.planning/spikes/001-tmux-write-back-128b/README.md` lines 182-218 (Privilege & portability sketch) | RESOLVED — `sed -n '182,218p'` returns the verbatim TypeScript pseudo-code starting `// PSEUDO-CODE — Phase 133 productionizes (G2-REPLY-04)` and the `ALLOWED_REPLIES = ['yes', 'no', 'continue', 'abort', 'defer']` constant |
| `.planning/spikes/001-tmux-write-back-128b/README.md` §"Three Phase 133 implications" lines 228-232 | RESOLVED — `grep -n "Three Phase 133 implications"` returns line 228 |
| `.planning/research/SURFACE-MAP.md` §"Recent architecture shift (2026-05-14)" | RESOLVED — `grep -n "Recent architecture shift"` returns line 51 |
| `.planning/research/PITFALLS.md` §"Pitfall 6" lines 167-194 | RESOLVED — `grep -n "Pitfall 6"` returns line 167 |
| `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-RESEARCH.md` §"Phase 133 Scope-Lock Implications" lines 548-601 | RESOLVED — section header at line 548 |
| `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-RESEARCH.md` §"Trust-Model Asymmetry" lines 603-614 | RESOLVED — section header at line 603 |
| `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-RESEARCH.md` §"Criteria Mapping" lines 539-547 | RESOLVED — section header at line 537 (table starts immediately after) |
| `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-MEASUREMENTS.md` §"Cost summary" | RESOLVED — Plan 06 SUMMARY confirms file authored with §"Cost summary" table populated |
| `.planning/spikes/128b-write-back/evidence/path{A,B,D,E}-TRANSCRIPT.md` (4 per-path TRANSCRIPTs) | RESOLVED — Plans 01-04 SUMMARYs all confirm TRANSCRIPT authoring; per-path mini-verdict lines verbatim-quoted in SPIKE-DECISION's per-path table |

All citations resolve to existing files; no broken references.

## Deviations from Plan

None - plan executed exactly as written.

The two action steps ran cleanly to completion:

1. Task 1: read all four per-path TRANSCRIPT.md files; computed verdict mechanically per D-V4 (Path E PASS dominates); authored `128b-SPIKE-DECISION.md` per the exact 10-section template with substitution rules applied; ran the plan's automated verification command (`SPIKE-DECISION structure verified`) end-to-end. No Rule 1-4 deviations triggered.
2. Task 2: read first line of `128b-SPIKE-DECISION.md` to extract verdict (`PASS`); applied mechanical mapping to README frontmatter (`VALIDATED-PASS`) and MANIFEST table cell (`✓ VALIDATED-PASS`); ran the plan's automated verification command (`Verdict propagated: PASS`) end-to-end; spike 001 row UNCHANGED (verified by post-edit grep showing `✓ VALIDATED` is preserved).

No Rule 1-4 deviations triggered.

## Issues Encountered

- **None.** The aggregation was purely mechanical: read four TRANSCRIPTs → extract mini-verdicts → apply D-V4 max → write verdict at TOP → populate per-path table → copy verbatim sections from RESEARCH/SURFACE-MAP/spike 001 README → run automated verification → commit. All source artifacts existed and were complete (Plans 01-04 + Plan 06 ran cleanly; spike 001 README has the §Privilege sketch + §Three implications + §Results sections).
- One incidental note: the SPIKE-DECISION body contains the literal substring `/v1/agent-stream` (a canonical Vigil API URL path) which `grep -E 'v1|v2|simplified version|placeholder|TBD|TODO'` flags as a `v1` match. This is a URL path, NOT a "v1 simplified version" scope-reduction marker — the regex over-matches API URLs by design. Acceptable; documented for forensic reference.

## User Setup Required

None — this plan touched only `.planning/` markdown; no env vars, no extra installs, no dashboard steps.

## Threat Mitigations Honored

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|---------------|
| T-128b-05-01 (Tampering — verdict-at-TOP invariant, Phase 128a D-V1 precedent) | mitigate | Acceptance criterion: file's first line matches `^\*\*VERDICT: (PASS|DEGRADE|BLOCK)\*\*$`. Verified: `head -1 ... ⇒ **VERDICT: PASS**`. Phase 128b.1 procedure (NOT this plan) is the only mechanism to revise. |
| T-128b-05-02 (Repudiation — subjective verdict override, Pitfall 5; D-V4 violation) | mitigate | Verdict computed by reading the per-path TRANSCRIPT mini-verdicts (literal quotes from `pathA/B/D/E-TRANSCRIPT.md`) and applying `MAX(PASS > DEGRADE > FAIL > INCONCLUSIVE)`. Reviewer can re-compute by opening the four TRANSCRIPT files; no subjective override. |
| T-128b-05-03 (Spoofing — 5-string allowlist drift, G2-REPLY-04 future drift-detector dependency) | mitigate | The allowlist is reproduced verbatim from spike 001 README lines 182-218 with citation marker; the production source-of-truth call site (Phase 133 G2-REPLY-04 implementation) will pin via drift-detector test. THIS document is informational; the binding is Phase 133's code. |
| T-128b-05-04 (Information Disclosure — Phase 133 scope-lock leaks operator infrastructure details) | accept | All cited content is from already-public planning docs (SURFACE-MAP.md, RESEARCH.md). No new operator-specific secrets introduced. |
| T-128b-05-05 (Tampering — spike 001 evidence-by-reference rot if sibling dir is later moved) | accept | Plan 04 already copied evidence into `.planning/spikes/128b-write-back/evidence/pathE-L4-*.txt` (self-containment); Plan 05's citations point to BOTH the copies (canonical for this phase) AND the originals (canonical for spike 001). If spike 001 dir is later archived, the phase-local copies remain intact. |
| T-128b-05-06 (Repudiation — INBOUND/OUTBOUND asymmetry conflated by future reader) | mitigate | The asymmetry section EXPLICITLY states `<thought> delimiter pattern does NOT apply` and the table makes the threat-model split structural (content wrapping vs string-set restriction). Reviewer cannot conflate without ignoring the section. |

## Next Phase Readiness

- **Plan 07 (60s portfolio Loom recording, C-2 wallclock checkpoint)** — Loom shape now confirmed as success-demo (PASS verdict ⇒ portfolio piece showing the round-trip empirically), NOT failure-mode documentation (which would have been the DEGRADE/BLOCK fallback shape). Spike author can record from-curl-to-Mac OFFline OR end-to-end from-G2-to-Mac on local network — either form satisfies success criterion #3 per CONTEXT §"D-N1" + §"specifics" §"60s Loom demonstration shape".
- **Plan 08 (final spike closeout)** — can cite SPIKE-DECISION verdict at TOP as the gate that resolves the phase; can cite the 10-section structure as the template for any future phase-spike that closes a `gates Phase NNN` requirement.
- **Phase 133 (G2 closeout bundle, gated on 128b PASS)** — scope-locked to FULL G2-REPLY-02..04 reply UX. Phase 133 planner reads SPIKE-DECISION §"Phase 133 Scope-Lock Implications" for the writer-process location (vigil-tmux-bridge on Ubuntu), the trust posture (pull-based outbound consumer), the operator workflow target (Ubuntu, not Mac), the launcher-wrapper UX requirement, and the local-network constraint shape change. Phase 133 G2-REPLY-04 implementation pins the 5-string allowlist verbatim from §"Privilege & portability sketch".

## Handoff

- **Plan 07** owns 60s portfolio Loom (operator-driven C-2 wallclock checkpoint). Reads SPIKE-DECISION verdict at TOP; success-demo shape confirmed (PASS).
- **Plan 08** owns final spike closeout. Reads SPIKE-DECISION as the canonical gate artifact; Plan 06 MEASUREMENTS as the canonical evidence-aggregation artifact.
- **Phase 133 planner** reads SPIKE-DECISION §"Phase 133 Scope-Lock Implications" + §"Privilege & portability sketch" + §"Three Phase 133 implications" for the writer-process location, allowlist constant, and onboarding-UX requirements. Phase 133 G2-REPLY-04 implementation pins the 5-string allowlist via drift-detector test at the source-of-truth call site.
- **No new code or vigil-core/vigil-g2-plugin/vigil-watch changes** introduced by this plan — touch is `.planning/` markdown + spike-landscape MANIFEST only, per CONTEXT §"specifics" line 207 ("spike runs on `main` branch directly; commits are documentation-only — this plan touches NO production code").

## Self-Check: PASSED

Verified before commit (and re-verified post-commit):

- `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-SPIKE-DECISION.md` — FOUND (193 lines, 10 sections; first line matches `^\*\*VERDICT: PASS\*\*$`)
- Plan's automated verification command (Task 1): `SPIKE-DECISION structure verified` (all 9 grep checks PASS — verdict-at-TOP, per-path table, G2-REPLY-01 mapping, privilege sketch, allowlist constant, Phase 133 scope-lock, vigil-tmux-bridge, recent architecture shift, trust-model asymmetry, INBOUND, OUTBOUND, three implications, Path E recommended primary, launcher wrapper required, cost summary, 5-string allowlist OR bounded blast radius)
- Plan's automated verification command (Task 2): `Verdict propagated: PASS` (verdict extraction PASSES; README frontmatter no longer `in-progress`; MANIFEST no longer `🚧 in-progress`; one of VALIDATED-PASS/DEGRADED-banner-ack-only/BLOCKED present in README; 001 row preserved)
- Acceptance criteria spot-checks: per-path table has 5 rows (A/B/C/D/E ★); criteria mapping table has 4 rows (criteria 1-4); Phase 133 scope-lock has 5 numbered sub-sections; Trust-Model Asymmetry has 2-row table (INBOUND, OUTBOUND); Three Phase 133 implications enumerated with the three load-bearing literal phrases (`Path E is the recommended primary path`, `Launcher wrapper is required`, `Path E generalizes beyond Claude Code`); Cost summary populated with values from Plan 06 MEASUREMENTS (≤$0.20 total); Re-activation conditions section is the single-line N/A marker (verdict is PASS)
- Commit `6c2b8d0` (Task 1) — FOUND in `git log` (`docs(128b-05): author 128b-SPIKE-DECISION.md — VERDICT PASS`)
- Commit `14aa7c3` (Task 2) — FOUND in `git log` (`docs(128b-05): propagate VERDICT PASS to spike-dir README + MANIFEST`)
- Spike 001 MANIFEST row UNCHANGED — `grep "001 " .planning/spikes/MANIFEST.md` returns `✓ VALIDATED` (still verdict-locked, NOT touched)
- No file deletions in either commit (per `git diff --diff-filter=D --name-only HEAD~2 HEAD` returning empty)

---
*Phase: 128b-g2-reply-01-write-back-path-spike*
*Completed: 2026-05-14*
