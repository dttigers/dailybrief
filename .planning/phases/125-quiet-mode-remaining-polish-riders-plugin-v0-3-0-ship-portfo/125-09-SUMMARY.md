---
phase: 125
plan: 09
subsystem: hardware-retest-skeleton
tags: [phase-125, wallclock, operator, hardware-retest, e2e, skeleton-only]
status: skeleton-only
operator_pending: true
requires:
  - "125-08-SUMMARY (vigil.ehpk v0.3.0 packed)"
  - "125-07-SUMMARY (PWA Quiet-mode toggle live)"
  - "125-05-SUMMARY (vigil-core /v1/quiet-mode endpoint live)"
provides:
  - "Hardware retest VERIFICATION.md skeleton — 5 scenario sections, operator fills findings"
  - "artifacts/ directory committed via .gitkeep — evidence drop site"
affects:
  - ".planning/phases/125-.../125-VERIFICATION.md (NEW skeleton)"
  - ".planning/phases/125-.../artifacts/.gitkeep (NEW)"
tech-stack:
  added: []
  patterns:
    - "Phase 124 VERIFICATION.md structure mirrored (operator-filled E2E findings + sign-off + disposition)"
    - "Wallclock checkpoint per memory feedback_wallclock_checkpoint_exempt — autonomous: false enforces operator gate"
key-files:
  created:
    - ".planning/phases/125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo/125-VERIFICATION.md"
    - ".planning/phases/125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo/artifacts/.gitkeep"
  modified: []
decisions: []
metrics:
  duration_seconds: 102
  duration_human: "~2 min"
  tasks_completed: 1
  tasks_total: 1
  files_created: 2
  files_modified: 0
  completed: 2026-05-10
requirements_pending_operator:
  - "AGENT-HUD-03 — operator must verify Scenario 1 on real G2 before marking complete"
  - "G2-PLUGIN-01 — operator must verify Scenarios 2/4 on real G2 before marking complete"
  - "G2-POLISH-05 — operator must verify Scenario 3 footer-hint on real G2 before marking complete"
  - "AGENT-DEMO-01 — operator must verify Scenario 5 dry run before Plan 11 recording"
---

# Phase 125 Plan 09: Hardware Retest Skeleton Summary

Phase 125 Plan 09 scaffolds the operator wallclock retest gate: a 5-scenario `125-VERIFICATION.md` skeleton plus an `artifacts/` evidence drop directory. The plan is `autonomous: false` per memory `feedback_wallclock_checkpoint_exempt` — the executor produces the checklist; the operator runs the physical retest on real G2 firmware 2.2.0.28 and back-fills findings before Plan 10 (Even Hub upload) or Plan 11 (60-second portfolio demo) can proceed.

## Skeleton scope

The `125-VERIFICATION.md` skeleton mirrors the Phase 124 VERIFICATION.md structure (operator-filled E2E findings + Status / Evidence / Notes per scenario + Operator sign-off + final Disposition). Each of the 5 scenarios is wired to:

- The exact requirement ID it gates
- The corresponding row in `125-VALIDATION.md` §"Manual-Only Verifications"
- The corresponding gate in `125-UI-SPEC.md` Surface 2 §"Verification Gates"
- The Phase 124 invariant being carried forward (D-08 ack, D-14 home byte-identity)

## Five retest scenarios staged

| # | Scenario | Gates | Evidence target |
|---|----------|-------|-----------------|
| 1 | AGENT-HUD-03 Quiet mode E2E (PWA toggle → SSE → HUD `Q` glyph filter → replay) | AGENT-HUD-03 | Screenshots / photos / video of toggle on/off, suppression, replay |
| 2 | Companion HUD ack (Phase 124 D-08 carry-forward) | G2-PLUGIN-01 | Photos of `[NEEDS INPUT]` banner pre/post double-tap, multi-session ack |
| 3 | Work-orders exit gesture (D-06 fallback footer-hint) | G2-POLISH-05 | Photo of `() double-tap to exit` footer + photo of post-exit Home |
| 4 | Home body D-14 byte-identity carry-forward | G2-PLUGIN-01 | Pair of PNG captures + `cmp` verdict |
| 5 | needs_input → ack flow (AGENT-DEMO-01 dry run) | AGENT-DEMO-01 | Phone video clip < 60s |

## Files created

- `.planning/phases/125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo/125-VERIFICATION.md` — 231-line skeleton with frontmatter, pre-flight checklist, 5 scenario sections, disposition block, cross-references
- `.planning/phases/125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo/artifacts/.gitkeep` — empty marker so the directory is committed before operator drops evidence

## Commits

- `6f9e82f` — `docs(125-09): scaffold hardware retest VERIFICATION skeleton + artifacts/`

## Deviations from Plan

None — plan executed exactly as written. Plan Step 4 ("OPERATOR — wallclock") is intentionally NOT executed by the executor; that is the operator's physical retest pass.

## Self-Check: PASSED

Verified post-commit:

- File exists: `.planning/phases/125-.../125-VERIFICATION.md` ✅
- Directory exists with `.gitkeep`: `.planning/phases/125-.../artifacts/` ✅
- File contains `Scenario 1` through `Scenario 5` (5 matches) ✅
- File contains memory citation `feedback_wallclock_checkpoint_exempt` (2 matches) ✅
- Operator sign-off + Disposition fields present ✅
- Commit `6f9e82f` exists in git log ✅

## Operator next action — pending

Plan 10 (Even Hub upload) and Plan 11 (portfolio demo recording) remain BLOCKED until the operator runs the 5 scenarios and back-fills `Status:` / `Evidence:` / `Notes:` plus the final `Disposition:` line.

The operator gate work item:

1. Pre-flight (G2 paired, PWA bearer signed in, vigil-watch running, plugin sideloaded from `vigil-g2-plugin/vigil.ehpk` v0.3.0)
2. Run Scenarios 1–5 (instructions verbatim in VERIFICATION.md)
3. Save evidence files to `.planning/phases/125-.../artifacts/scenario-N-<slug>-2026-MM-DD/`
4. Update each scenario's `Status:` / `Evidence:` / `Notes:`
5. Set `Operator sign-off:` + `Disposition:` at file bottom (green / yellow / red)
6. Commit VERIFICATION.md + artifacts together

If any scenario reds, operator MUST surface the failure to the user before any further plans run.

## Plan 10 / Plan 11 unblock status

- **Plan 10 (Even Hub upload):** ⬜ NOT YET UNBLOCKED — waits on operator green/yellow disposition
- **Plan 11 (portfolio demo recording):** ⬜ NOT YET UNBLOCKED — waits on Scenario 5 dry-run pass; physical recording is itself a wallclock checkpoint

## Requirements

This plan does NOT mark requirements complete. AGENT-HUD-03, G2-PLUGIN-01, G2-POLISH-05, AGENT-DEMO-01 are all gated by the operator's physical retest disposition. The operator (or a follow-up state recorder) marks them complete after the disposition is filled green.
