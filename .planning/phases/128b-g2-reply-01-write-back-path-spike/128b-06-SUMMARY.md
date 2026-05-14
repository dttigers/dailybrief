---
phase: 128b-g2-reply-01-write-back-path-spike
plan: 06
subsystem: spike

tags: [128b, write-back, spike, measurements, evidence-aggregation, cost-ledger]

requires:
  - phase: 128b-CONTEXT
    provides: D-A4 artifact-list (MEASUREMENTS owns per-path supporting numbers; SPIKE-DECISION owns the verdict), D-G1 redaction-safe authoring, D-G3 GUARD-03 N/A but documented for forensic reference, D-O4 wallclock cap reference
  - phase: 128b-RESEARCH
    provides: §"Per-Path Predicted-Verdict Summary" + §"Cost" expected-≤$0.20 ceiling + per-path haiku-rate cost references
  - phase: 128b-01
    provides: Path B mini-verdict (DEGRADE fresh-only) + wallclock 6s + cost $0.0965 (first-invocation cache) + evidence file inventory
  - phase: 128b-02
    provides: Path A mini-verdict (FAIL) + wallclock 39s + cost ~$0.00 + D-T5 clobber-protect target SID + evidence file inventory
  - phase: 128b-03
    provides: Path D mini-verdict (DEGRADE inverted-model fresh-only) + wallclock 6s + cost ~$0.005 + SDK ad-hoc-install + D-A1 isolation audit + evidence file inventory
  - phase: 128b-04
    provides: Path E regression mini-verdict (PASS re-confirmed) + regression wallclock 71s + cost ~$0.01 + spike 001 historical reference (77s, <$0.02) + evidence file inventory (4 phase-local copies + 4 spike 001 originals)
  - phase: spike-001-tmux-write-back-128b
    provides: README §Cost lines 234-239 (historical Path E cost reference: L1+L2 $0, L3 ~$0.005, L4 ~$0.01, total <$0.02)

provides:
  - .planning/phases/128b-g2-reply-01-write-back-path-spike/128b-MEASUREMENTS.md — consolidated per-path empirical record (Summary + Per-path log + Cost summary + Evidence inventory + GUARD-03 audit + D-G1 redaction audit)

affects:
  - 128b-05 (SPIKE-DECISION — its `## Cost summary` section can read this file's Cost summary table verbatim and its `## Evidence file inventory` cross-references can be cited by reference)

tech-stack:
  added: []
  patterns:
    - "Mechanical-extraction quotation: each per-path mini-verdict in MEASUREMENTS is grep-F-able against the literal source TRANSCRIPT line — no paraphrase, no re-interpretation. Reviewer can run `grep -F '<quoted line>' evidence/path*-TRANSCRIPT.md` and confirm 1+ match per path."
    - "Two-document separation of concerns: MEASUREMENTS owns supporting numbers (refinable on re-run); SPIKE-DECISION owns the verdict (non-editable once written, per CONTEXT D-V4). The two documents have different review cadences and different authorship gates."
    - "Self-contained phase artifact set with cross-link preservation: MEASUREMENTS lists BOTH the phase-local copies of spike 001 evidence AND the original spike 001 paths (cmp-verified byte-for-byte equal post-Plan 04), so a downstream reader gets one-stop navigation without losing the historical-immutability of the original spike."

key-files:
  created:
    - .planning/phases/128b-g2-reply-01-write-back-path-spike/128b-MEASUREMENTS.md
  modified: []

key-decisions:
  - "Total empirical cost ~$0.131 (Plans 01-04 + spike 001) is UNDER the RESEARCH §Cost ≤$0.20 expected ceiling — confirmed inline in MEASUREMENTS Cost summary Notes column with overage attribution: Path B's first-invocation 76,765-token ephemeral cache contributed $0.0925 of the variance from RESEARCH's $0.005-per-Haiku-call estimate; subsequent re-runs would amortize to ~$0.021 total"
  - "Path C's analytical-only treatment (cost $0, wallclock $0) preserved per RESEARCH §'Open Questions §2' — Path E (`tmux send-keys`) is a structural refinement of Path C (the tmux server is the pre-existing user-uid launcher that owns the pty FD); the '3 of 4' G2-REPLY-01 success criterion is satisfied by A + B + D empirical + Path E historical without needing Path C"
  - "Source-quote audit verified before commit: all 4 mini-verdicts (B, A, D, E-regression) `grep -F` match the literal lines in their respective TRANSCRIPT.md sources; Path E also includes the historical PASS row from spike 001"

requirements-completed: [G2-REPLY-01]

duration: ~6min
completed: 2026-05-14
---

# Phase 128b Plan 06: MEASUREMENTS — per-path consolidated evidence + cost ledger

**`128b-MEASUREMENTS.md` consolidates per-path empirical evidence from Plans 01-04 (paths B, A, D, E-regression) into a single readable record; total empirical wallclock 122s and total Anthropic API spend ~$0.131 (incl. spike 001 historical) — both well inside RESEARCH §Cost expectations (≤$0.20) and CONTEXT D-O4 wallclock cap (≤3h per path); each per-path mini-verdict quoted verbatim from the corresponding TRANSCRIPT (4-of-4 source-quote audit PASS) so Plan 05 SPIKE-DECISION's `## Cost summary` section can be populated by reference.**

## Performance

- **Duration:** ~6 min wallclock (file authoring + verification + commit)
- **Started:** 2026-05-14T22:54:05Z
- **Completed:** 2026-05-14T23:00Z (approximate)
- **Tasks:** 1 / 1
- **Files created:** 1
- **Files modified:** 0

## Total wallclock and total API cost for the spike

**Total empirical wallclock (Plans 01-04):** 122s (~2 minutes)
- Path B: 6s
- Path A: 39s
- Path D: 6s (final probe; ~1-2s npm install)
- Path E (regression): 71s

**Total wallclock incl. spike 001 historical Path E:** 199s (122s + 77s spike 001 §Iteration 4 reference)

**Total Anthropic API spend (Plans 01-04):** ~$0.111
- Path B: $0.0965 (one-time first-invocation cache cost; re-runs ~$0.005)
- Path A: ~$0.00 (`claude --resume` against exited session consumed no tokens)
- Path D: ~$0.005 (one Haiku turn with one tool invocation)
- Path E (regression): ~$0.01 (one Haiku interactive session: trust-dialog dismiss + tool-prompt + permission-grant + Bash-tool-run + 60s idle + health-probe answer)

**Total spend incl. spike 001 historical Path E:** ~$0.131 (~$0.111 + spike 001's <$0.02)

## Cost vs RESEARCH expectation

**Actual total cost (~$0.131) is UNDER the RESEARCH §Cost ≤$0.20 expected ceiling.**

Per-path attribution of the variance from RESEARCH's per-path haiku-rate estimates (~$0.005/call):

- **Path B drove the variance** — actual $0.0965 vs RESEARCH-estimated $0.005 = 19× over-run. Root cause documented in Plan 01 SUMMARY §"Issues Encountered": first invocation of `claude -p --model haiku` in this cwd triggered ephemeral 5m + 1h cache creation of 76,765 tokens (the project + memory + plugins context). Subsequent re-runs amortize against the cache and would cost ~$0.005, matching the RESEARCH estimate.
- **All other paths matched or undercut their RESEARCH estimates:**
  - Path A: ~$0.00 (RESEARCH estimate $0.01-$0.05 was for a hypothetical successful active-session run; the empirical FAIL meant `claude --resume` exited before consuming tokens against an `/exit`-terminated session)
  - Path D: ~$0.005 (RESEARCH ≤$0.05; actual at the bottom of the range)
  - Path E (regression): ~$0.01 (matches spike 001 §Cost L4 reference exactly)

**No overage drove the total above the ≤$0.20 ceiling.** Even after Path B's first-invocation cache cost, the total stayed at ~$0.131 (66% of the ceiling). The MEASUREMENTS Cost summary table's Notes column documents this attribution inline; no separate overage explanation is required.

## Source-quote audit

Each per-path mini-verdict in MEASUREMENTS was verified before commit by `grep -F`-ing the literal quoted line against the corresponding source TRANSCRIPT. All four PASS:

- **Path B:** `grep -F "Path B mini-verdict ⇒ **DEGRADE (fresh-only)**" .planning/spikes/128b-write-back/evidence/pathB-TRANSCRIPT.md` → 1 match
- **Path A:** `grep -F "Path A mini-verdict ⇒ **FAIL**" .planning/spikes/128b-write-back/evidence/pathA-TRANSCRIPT.md` → 1 match
- **Path D:** `grep -F "DEGRADE (inverted model — fresh-session-only via prompted tool-call)" .planning/spikes/128b-write-back/evidence/pathD-TRANSCRIPT.md` → 1 match
- **Path E (regression):** `grep -F "Regression mini-verdict: PASS (re-confirmed)"` → 1 match AND `grep -F "PASS — re-confirmed in current env; D-V4 max aggregation: Path E dominates per-path table"` → 1 match — both lines from the same `pathE-TRANSCRIPT.md`

The MEASUREMENTS quote-strings are mechanical extractions of the source TRANSCRIPT mini-verdict lines (no paraphrase, no re-interpretation). Reviewer can re-run the four `grep -F` commands above and confirm reproducibility.

Path C is documented as analytical-only with the verdict quoted from RESEARCH §"Path C" / spike 001 README §"Position vs. the 4 enumerated 128b paths" — no TRANSCRIPT exists for Path C because no probe was run (per RESEARCH §"Open Questions §2" recommendation + CONTEXT D-O4 wallclock cap discipline).

## Handoff to Plan 05

Plan 05 SPIKE-DECISION should read these MEASUREMENTS sections:

1. **`## Cost summary` table** — Plan 05's own `## Cost summary` section can copy this table verbatim or cite by reference (`see 128b-MEASUREMENTS.md §Cost summary`). The 6-row format (B / A / D / E-regression / E-spike-001 / C) + Total row matches the per-path verdict-table shape Plan 05 will use for its empirical-evidence column.
2. **`## Per-path log`** — Plan 05's per-path verdict-table rows can pull the Mini-verdict, Wallclock, Exit code, Cost, and Evidence-files columns directly from each H3 path section. The verbatim TRANSCRIPT quotes are reviewer-verifiable (re-run the source-quote audit `grep -F` commands above).
3. **`## Evidence file inventory`** — Plan 05's "Cited evidence" or "Per-path artifacts" section can cross-link any of the 5 phase-local TRANSCRIPTs + the 5 phase-local raw outputs + the 4 spike 001 cross-referenced originals from this single inventory.
4. **`## GUARD-03 budget audit`** — Plan 05 may inherit the N/A determination directly (single-user OAuth scope; not subject to multi-user `DAILY_AI_BUDGET_EXCEEDED` enum); no separate analysis needed.
5. **`## D-G1 redaction audit`** — Plan 05's redaction-safety claim about its own SPIKE-DECISION body can cite this audit's inheritance chain (per-path TRANSCRIPTs already comply with D-G1 acceptance criteria; MEASUREMENTS aggregates them; SPIKE-DECISION aggregates MEASUREMENTS).

**Per CONTEXT D-V4 mechanical-verdict rule:** Plan 05's overall verdict is mechanically `MAX(per-path-verdict, ordered PASS > DEGRADE > FAIL > INCONCLUSIVE)`. With Path E's PASS (re-confirmed) and Paths B/D's DEGRADE and Path A's FAIL, the max is PASS. Plan 05 writes that verdict at the TOP of `128b-SPIKE-DECISION.md` and is non-editable thereafter (per CONTEXT D-V4 + Phase 128a precedent).

## Deviations from Plan

None - plan executed exactly as written.

The single Task 1 ran to completion: read all 4 source TRANSCRIPTs + 4 source SUMMARYs + spike 001 README §Cost; authored MEASUREMENTS.md per the verbatim template in the plan; replaced all `<placeholder>` markers with values from the source artifacts (no fabricated values; no remaining placeholder strings); ran the plan's automated verification command end-to-end (returned `MEASUREMENTS structure verified`); ran the source-quote audit before commit (4-of-4 PASS).

No Rule 1-4 deviations triggered.

## Issues Encountered

- **None.** The aggregation was purely mechanical: read per-path TRANSCRIPTs → quote mini-verdict lines verbatim → read per-path SUMMARYs → extract wallclock + cost + evidence-file lists → compose into the 6-section MEASUREMENTS structure → run automated verification → run source-quote audit → commit. All source artifacts existed and were complete (Plans 01-04 ran cleanly; spike 001 README has the §Cost reference at lines 234-239).

## User Setup Required

None — this plan touched only `.planning/` markdown; no env vars, no extra installs, no dashboard steps.

## Threat Mitigations Honored

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|---------------|
| T-128b-06-01 (Information Disclosure — variable names) | mitigate | Plan's automated verification grep `! grep -E "(TOKEN\|AUTH\|SECRET\|BEARER\|APIKEY)="` returned 0 matches against MEASUREMENTS.md; the file inherits redaction safety from per-path TRANSCRIPTs (Plans 01-04 acceptance criteria forbid blocked-property-name variable assignments) and adds no new variable assignments of its own. |
| T-128b-06-02 (Repudiation — cost figures) | mitigate | Each per-path cost cell is sourced from a Plan 01-04 SUMMARY (which in turn references the probe wallclock + token count). Total row arithmetic is verifiable: sum of B ($0.0965) + A (~$0.00) + D (~$0.005) + E-regression (~$0.01) + E-spike-001 (<$0.02) = ~$0.131. No fabricated values; no `<placeholder>` strings remained per the plan's substitution rules. |
| T-128b-06-03 (Tampering — post-hoc edits) | accept | Per the plan's threat register: MEASUREMENTS can be refined (re-runs may produce new numbers); the TRANSCRIPT mini-verdict is the authoritative per-path signal. Plan 05's verdict computation reads the TRANSCRIPTs directly, not this file, so edits here cannot change the verdict. |
| T-128b-06-04 (Information Disclosure — spike 001 cross-references) | accept | Spike 001 evidence files were committed by the spike 001 verdict-validation process; their content is already public in the planning repo. MEASUREMENTS only references the file paths and quotes the canonical `221` (health probe) and `L4-TOOL-RAN-<id>` (unique marker) — no new disclosure. |

## Next Phase Readiness

- **Plan 05 (SPIKE-DECISION)** can now author `128b-SPIKE-DECISION.md` with its `## Cost summary` section reading directly from this MEASUREMENTS file's table. Per-path verdict-table rows have all the supporting columns (mini-verdict, wallclock, exit code, cost, evidence) ready for citation.
- **Plan 07 (60s portfolio Loom recording, C-2 wallclock checkpoint)** is operator-driven; this plan's MEASUREMENTS provides the cost + wallclock context the demo can reference if needed.
- **Plan 08 (final spike closeout)** can cite this MEASUREMENTS file as the canonical per-path evidence aggregation in its self-containment audit.

## Handoff

- **Plan 05** owns `128b-SPIKE-DECISION.md` — VERDICT at top, per-path verdict table populated from this MEASUREMENTS file's `## Per-path log` H3 sections; `## Cost summary` populated from this file's `## Cost summary` table. Per CONTEXT D-V4 max rule and spike 001's Path E PASS (re-confirmed by Plan 04), overall verdict is mechanically `PASS` ⇒ scope-locks Phase 133 to full G2-REPLY-02..04 reply UX (per CONTEXT D-V1 PASS-gate scope-lock rule).
- **Plans 07-08** consume this MEASUREMENTS file as the canonical per-path evidence aggregation for any cross-referenced documentation.

## Self-Check: PASSED

Verified before commit:

- `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-MEASUREMENTS.md` — FOUND
- Plan's automated verification command: `MEASUREMENTS structure verified` (all 6 H2 sections + 5 H3 path sections present; no blocked-property-name patterns; spike 001 cross-link present)
- Placeholder-replacement check: `grep -E "<placeholder>|<sum_s>|<sum_usd>|<USD>|<int>|<s>"` returned 0 matches (all template markers replaced)
- Source-quote audit: 4-of-4 mini-verdicts `grep -F`-match their literal source TRANSCRIPT lines
- Commit `54da727` (Task 1) — FOUND in `git log`
- No file deletions in commit (`git diff --diff-filter=D --name-only HEAD~1 HEAD` returned empty)

---
*Phase: 128b-g2-reply-01-write-back-path-spike*
*Completed: 2026-05-14*
