# Path E — Per-Path D-V1 Mini-Verdict (★ — pre-validated in spike 001)

Regression run: 2026-05-14T22:46:49+00:00
Regression script: .planning/spikes/001-tmux-write-back-128b/L4-needs-input-pause.sh
Regression log: .planning/spikes/128b-write-back/evidence/pathE-regression-run.log
Regression exit code: 0
Regression success markers detected: 1

Original spike: spike 001 (tmux-write-back-128b) — 2026-05-14
Original verdict: VALIDATED (PASS — all 4 D-V1 steps)

## D-V1 Four-Step Gate — Historical (spike 001 L4)

| Step | Description | Verdict | Evidence |
|------|-------------|---------|----------|
| 1    | Reply originates from non-TTY writer | ✓ | spike 001 README §Results step 1 — bash script outside the tmux pane |
| 2    | String reaches input channel | ✓ | pathE-L4-permission-pause-snapshot.txt — dialog state change captured |
| 3    | Claude processes as next user turn | ✓ | pathE-L4-tool-output-marker.txt — Bash tool produced its output file (L4-TOOL-RAN-91284096) only possible after permission was granted via injected Enter |
| 4    | Session continues healthy ≥60s | ✓ | pathE-L4-health-check-snapshot.txt — health probe `13 * 17` returned `221` after 60s idle |

**Historical mini-verdict: PASS (all 4 steps ✓ — fresh AND active session both ✓ per D-V1)**

## D-V1 Four-Step Gate — Regression Re-Run (2026-05-14)

| Step | Description | Verdict | Evidence |
|------|-------------|---------|----------|
| All  | (full round-trip — script asserts each step internally) | ✓ (regression PASSED — exit 0 + success markers in log) | pathE-regression-run.log |

**Regression mini-verdict: PASS (re-confirmed)**

## Overall Path E Mini-Verdict

**PASS — re-confirmed in current env; D-V4 max aggregation: Path E dominates per-path table**

Per CONTEXT D-V4 (mechanical verdict): if the regression re-run FAILed, Plan 05's SPIKE-DECISION MUST adopt the regression result (FAIL) for Path E's row in the per-path table, NOT the historical PASS. The historical evidence remains preserved (pathE-L4-*.txt files) for forensic comparison, but the verdict cell follows the current empirical signal.

## Surfaced constraint (preserved from spike 001 README §"Surfaced constraint" lines 175-178)

Claude Code must be launched **inside a tmux pane** for Path E to work. This is a launcher-UX surface that Phase 133 must address (NOT this spike's concern):
- Operator launches `claude` via a `vigil-claude` wrapper (or aliases `claude` to wrap in tmux).
- If launched directly (no tmux), `vigil-tmux-bridge` cannot reach the input channel.
- Phase 133 productionization detects non-wrapped sessions (e.g., absence of `VIGIL_TMUX_SESSION` env in claude's process tree) and degrades to G2-REPLY-05 banner-ack-only for that session.

## Evidence (copies under this phase's evidence dir — originals preserved at spike 001)

- `pathE-regression-run.log` — full stdout/stderr of the re-run
- `pathE-L4-permission-pause-snapshot.txt` — copy of spike 001's preserved `needs_input` dialog evidence
- `pathE-L4-health-check-snapshot.txt` — copy of spike 001's preserved 60s-health-probe transcript (`221`)
- `pathE-L4-tool-output-marker.txt` — copy of spike 001's preserved unique-marker proof of Bash tool execution

Originals at: `.planning/spikes/001-tmux-write-back-128b/evidence/L4-*.txt` (untouched by this plan)

## Privilege & portability sketch — REFERENCED, not re-derived

Per RESEARCH §"Criteria Mapping" criterion 4 + CONTEXT D-A2: the spike 001 README §"Privilege & portability sketch (D-A2 — markdown only)" lines 182-218 ALREADY contains a complete D-A2-compliant TypeScript pseudo-code form of the 5-string allowlist + privilege-drop + send-keys injection. Plan 05 SPIKE-DECISION reuses that sketch by reference; THIS plan does not re-derive it.

## Cited

- spike 001 README §Results — historical D-V1 four-step mapping (PASS)
- spike 001 evidence/L4-*.txt — preserved 2026-05-14
- CONTEXT D-V1 / D-V4 / D-T5
- RESEARCH §"Path E" lines 500-523 + §"Criteria Mapping" criterion 3
