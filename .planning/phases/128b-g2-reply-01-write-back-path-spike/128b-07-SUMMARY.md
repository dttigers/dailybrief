---
phase: 128b-g2-reply-01-write-back-path-spike
plan: 07
subsystem: spike-wallclock-checkpoint
tags: [128b, write-back, spike, wallclock, operator, c-1, ubuntu, live-claude-session, path-e]

requires:
  - phase: 128b-04
    provides: Path E autonomous regression PASS — primary signal that vigil-claude-c1-spike confirms in live form
  - phase: 128b-05
    provides: SPIKE-DECISION verdict-at-TOP PASS — operator confirms before driving C-1
  - phase: 128b-06
    provides: MEASUREMENTS.md Cited-sources tail — appendix lands cleanly after this section

provides:
  - Operator-driven live `claude` interactive session round-trip on Ubuntu workstation (D-T1 primary test target)
  - MEASUREMENTS.md `## Operator C-1 wallclock` appendix with all 13 observation fields populated
  - Empirical confirmation that Path E `tmux send-keys` primitive works against the operator's-style live session, not just probe-script-spawned disposable sessions
  - Phase 133 carry-forward note on Ubuntu architecture parity

affects: [phase-133, vigil-tmux-bridge, g2-reply-04]

tech-stack:
  added: []
  patterns:
    - "C-1 disposable tmux session pattern: vigil-claude-c1-spike-<timestamp> namespace cannot collide with operator's primary work tmux sessions OR with probe-script spike-128b-pathX-$$ pattern (D-T5 clobber-protect by convention)"
    - "Operator-driven wallclock checkpoint resume signals: c1-done / c1-blocked / c1-fail (with c1-fail triggering Phase 128b.1 per CONTEXT D-V4)"

key-files:
  created:
    - .planning/phases/128b-g2-reply-01-write-back-path-spike/128b-07-SUMMARY.md
  modified:
    - .planning/phases/128b-g2-reply-01-write-back-path-spike/128b-MEASUREMENTS.md

key-decisions:
  - "C-1 verdict: PASS — round-trip observed live; matches Plan 04 autonomous regression as expected"
  - "claude version drift +1 patch (2.1.142 vs plan's expected 2.1.141): no behavior delta; D-V1 four-step gate held identically"
  - "Disposable session name vigil-claude-c1-spike-1778800583 used; cleaned up before resume signal"

patterns-established:
  - "C-1 confirmatory-vs-authoritative distinction: SPIKE-DECISION verdict is determined by Plan 04 autonomous regression (reproducible, auditable); C-1 is a confirmatory live test. A C-1 FAIL would NOT change the SPIKE-DECISION verdict but WOULD trigger Phase 128b.1 per CONTEXT D-V4. C-1 PASS this run aligns with Plan 04 PASS — no follow-up phase needed."

requirements-completed: [G2-REPLY-01]

duration: ~7min
completed: 2026-05-14
---

# Phase 128b Plan 07: Operator C-1 Wallclock Summary

**Live `claude` interactive session round-trip on Ubuntu workstation confirms Path E `tmux send-keys` primitive works against an operator-driven session — matches the autonomous Plan 04 regression PASS exactly, no Phase 128b.1 follow-up needed.**

## Performance

- **Duration:** ~7 min wallclock (env verify + tmux setup + drive + inject + verify + 60s health probe wait + cleanup)
- **Started:** 2026-05-14T~23:24Z (env verify step)
- **Completed:** 2026-05-14T23:31:10Z (cleanup confirmed)
- **Tasks:** 1/1 (single checkpoint:human-verify task)
- **Files modified:** 2 (MEASUREMENTS.md appendix + this SUMMARY.md)
- **Operator resume signal:** **c1-done**

## Accomplishments

- Operator-driven live `claude` round-trip executed end-to-end on Ubuntu workstation (`morrillhouse`)
- All 4 D-V1 gate steps PASSed: permission dialog surfaced → `tmux send-keys Enter` from separate shell dismissed it → gated Bash tool ran (marker file `C1-MARKER` written to `/tmp/c1-test.out`) → 60s health probe (`What is 13 multiplied by 17?`) returned `221` correctly
- MEASUREMENTS.md `## Operator C-1 wallclock (D-T1 — live `claude` interactive session)` appendix authored with all 13 observation fields (no placeholders)
- D-T5 clobber-protect honored: `vigil-claude-c1-spike-1778800583` namespace never collided with operator's primary work sessions; cleanup verified `tmux ls | grep vigil-claude-c1-spike-` empty before resume signal

## Runbook step outcomes

| Step | Action | Outcome | Notes |
|------|--------|---------|-------|
| 1 | Env verify (`which tmux`, `tmux -V`, `which claude`, `claude --version`, `$CLAUDE_SESSION_ID`) | yes | tmux 3.4 ✓, claude 2.1.142 (+1 patch from expected 2.1.141), `$CLAUDE_SESSION_ID` unset ✓ |
| 2 | Disposable session start (`tmux new-session -d -s vigil-claude-c1-spike-$(date +%s) "claude --model haiku"`) | yes | Session: `vigil-claude-c1-spike-1778800583`; workspace-trust dialog absorbed by `sleep 5 + tmux send-keys Enter` |
| 3 | Drive claude to needs_input pause (typed `Run the bash command: echo 'C1-MARKER' > /tmp/c1-test.out`) | yes | Bash permission dialog surfaced as expected |
| 4 | `tmux send-keys -t "$SESSION" Enter` from SEPARATE shell | yes | Operator confirmed verbatim: "cleared the permissions on terminal 1" |
| 5 | `cat /tmp/c1-test.out` (expect `C1-MARKER`) | yes | PASS — gated Bash tool ran, marker file written |
| 6 | 60s health probe — type `What is 13 multiplied by 17?` in live pane (expect `221`) | yes | PASS — claude responded `221` within ~3s |
| 7 | Cleanup (`tmux kill-session`, `rm /tmp/c1-test.out`) | yes | Operator confirmed "cleanup ran clean"; `tmux ls` returned empty for the vigil-claude-c1-spike namespace |

## C-1 vs Plan 04 regression — PARITY

| Test | Path E primitive | Outcome |
|------|------------------|---------|
| Plan 04 autonomous regression (`L4-needs-input-pause.sh`) | `tmux send-keys` against probe-spawned disposable claude session | PASS (71s wallclock) |
| Plan 07 C-1 operator wallclock | `tmux send-keys` against operator-driven live claude session | PASS (~7 min wallclock incl. setup/cleanup) |

Per CONTEXT D-V4 mechanical-verdict + max-aggregation: Plan 04 is the authoritative signal. C-1 PASS this run aligns and confirms the live-session case behaves identically. SPIKE-DECISION verdict (PASS) stands without modification.

## Task Commits

Each task was committed atomically:

1. **Task 1: OPERATOR WALLCLOCK C-1 — Live `claude` interactive session round-trip** — captured by single commit landing this SUMMARY.md + the MEASUREMENTS.md appendix together (operator-driven artifact pair).

## Files Created/Modified

- `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-07-SUMMARY.md` — this file (operator wallclock log per plan's `<output>` spec)
- `.planning/phases/128b-g2-reply-01-write-back-path-spike/128b-MEASUREMENTS.md` — appended `## Operator C-1 wallclock (D-T1 — live `claude` interactive session)` section after `## Cited sources`; 13 observation fields populated; D-G1 redaction posture preserved (no secret tokens, no auth credentials, no blocked-property-name assignments)

## Acceptance criteria audit

- [x] MEASUREMENTS.md contains the C-1 appendix with all 13 observation fields (concrete values, no placeholders)
- [x] Appendix passes D-G1 redaction check: no `sk-[a-zA-Z0-9_-]{20,}` matches, no `[Bb]earer [A-Za-z0-9_.-]+` matches, no `^(TOKEN|AUTH|SECRET|BEARER|APIKEY)=` assignments
- [x] Disposable tmux session killed before resume signal (operator-confirmed)
- [x] `/tmp/c1-test.out` removed before resume signal (operator-confirmed)
- [x] Resume signal: **c1-done** (live test PASSed; appendix committed)

## Phase 133 carry-forward note

The Ubuntu architecture shift (post 2026-05-14 SURFACE-MAP.md) introduced no observable behavior delta for the Path E primitive. Specifically:

- **tmux behavior:** tmux 3.4 on Ubuntu handled `send-keys -t <session> Enter` identically to spike 001's reference environment. No timing adjustments required.
- **claude version:** 2.1.142 (one patch ahead of plan's expected 2.1.141) showed no surface differences for the four-step gate. Phase 133 vigil-tmux-bridge can pin against `claude >= 2.1.141` (validated lower bound) without ceiling.
- **Workspace-trust dialog:** the `sleep 5 + tmux send-keys Enter` startup pre-step in the runbook absorbed the workspace-trust dialog cleanly. Phase 133 G2-REPLY-04 launcher-wrapping should reproduce this pre-step (or pre-trust the workspace at install time) to avoid an extra Enter on first session.
- **No new failure modes surfaced** that aren't already documented in spike 001's L4 reference.

Phase 133 G2-REPLY-04 (vigil-tmux-bridge productionization) inherits the same `tmux send-keys` primitive validated here. The only delta is the trigger source: C-1 = operator's hand from a second shell; Phase 133 = launcher-wrapped writer process subscribing to `agent_stream` SSE. The 5-string allowlist `['yes', 'no', 'continue', 'abort', 'defer']` from spike 001 README lines 182-218 (carried into SPIKE-DECISION) bounds the production blast radius identically.

## Self-Check

- [x] All 4 D-V1 gate steps PASSed live (permission dismissed → tool ran → marker written → 60s health probe answered correctly)
- [x] All 13 MEASUREMENTS appendix fields populated with concrete values
- [x] D-G1 redaction check passes (no secrets, no blocked-property-name assignments)
- [x] D-T5 cleanup verified (disposable session killed, marker file removed)
- [x] Resume signal `c1-done` recorded
- [x] Phase 133 carry-forward note authored
- [x] No SPIKE-DECISION verdict modification needed (C-1 PASS aligns with Plan 04 PASS)
