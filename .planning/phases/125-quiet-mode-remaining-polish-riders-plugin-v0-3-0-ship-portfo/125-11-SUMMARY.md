---
phase: 125
plan: 11
subsystem: portfolio-demo-recording
tags: [phase-125, wallclock, operator, demo-recording, portfolio, skeleton-only]
status: skeleton-only
operator_pending: true
requires:
  - "125-09-SUMMARY (hardware retest skeleton — Scenario 5 dry-run gates the actual recording)"
  - "125-08-SUMMARY (vigil.ehpk v0.3.0 + 5-doc cascade with D-08 double-tap amendment)"
provides:
  - "Phase artifacts pointer to portfolio demo clip in iCloud Drive — clip itself NOT committed"
  - "Operator backfill harness — 5 D-10 shot list checkboxes + recording metadata fields + post-production attestation"
affects:
  - ".planning/phases/125-.../artifacts/demo-clip-manifest.md (NEW skeleton)"
tech-stack:
  added: []
  patterns:
    - "Wallclock checkpoint pattern per memory feedback_wallclock_checkpoint_exempt — autonomous: false enforces operator gate; yolo mode does NOT bypass"
    - "Plan 09 VERIFICATION skeleton precedent — executor scaffolds the operator-fillable checklist, operator runs physical action and back-fills"
    - "Out-of-repo binary artifact pattern per CONTEXT Claude's Discretion — manifest .md is the in-repo handle; large binary stays in iCloud Drive per memory reference_brand_guidelines"
key-files:
  created:
    - ".planning/phases/125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo/artifacts/demo-clip-manifest.md"
  modified: []
decisions:
  - "Skeleton-only execution: AGENT-DEMO-01 deliberately NOT marked complete by the executor — physical recording is operator wallclock per execution_config + memory feedback_wallclock_checkpoint_exempt"
  - "All D-10 shot list checkboxes left unchecked — operator ticks post-recording as part of manifest backfill"
  - "Three high-yield prompt candidates documented in §'Prompt staging' per RESEARCH Pitfall 7 — operator picks one and tests 2x before recording"
metrics:
  duration_seconds: 66
  duration_human: "~1 min"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
  completed: 2026-05-10
requirements_pending_operator:
  - "AGENT-DEMO-01 — operator must record 60s clip on real G2, save to iCloud path, and backfill manifest fields before marking complete"
---

# Phase 125 Plan 11: Portfolio Demo Recording — Skeleton Only

Plan 125-11 is `autonomous: false` per the v3.8 wallclock policy (memory `feedback_wallclock_checkpoint_exempt`). The executor pre-stages the demo clip manifest skeleton so the operator has an operator-fillable harness to land on after the physical 60-second recording. The recording itself — real G2 hardware, real Claude Code session, real `needs_input` event, real double-tap ack — is the operator's wallclock work item and is explicitly NOT executable by the agent (memory `project_g2_tap_expand_broken`: no sim-only ships, even in portfolio framing).

## Skeleton scope

The new `.planning/phases/125-.../artifacts/demo-clip-manifest.md`:

- Frontmatter: `status: pending`, all metadata fields as `<fill>` placeholders, three attestations (single-shot real-hardware, phone-screen-recording-of-worn-G2, D-08 double-tap-ack-matches-ship-reality)
- §"Recording metadata" — date, operator, hardware confirmation, plugin version, iPhone, Mac, clip duration, takes count, post-production note (all `(fill)`)
- §"Shot list verification (D-10)" — 5 unchecked boxes mapping verbatim to CONTEXT D-10 timing (0:00–0:10 VS Code start, 0:10–0:25 walk away, 0:25–0:35 needs_input banner, 0:35–0:45 double-tap ack, 0:45–0:60 task_complete toast)
- §"Prompt staging (Pitfall 7)" — three high-yield prompt candidates documented per RESEARCH §Pitfall 7 ("Demo single-shot fragility"); operator picks one and tests 2x before recording
- §"Clip path" — canonical iCloud path `~/Library/CloudStorage/iCloud Drive/Vigil/portfolio/2026-05-vigil-v3.8-demo.mp4` + operator-side verification command; clip is intentionally NOT committed to git per CONTEXT Claude's Discretion + memory `reference_brand_guidelines`
- §"Operator wallclock steps" — 5-step procedure (pre-flight, recording, post-production, manifest backfill, mark-complete)
- §"Acceptance gate" — 6 final checkboxes the operator ticks before AGENT-DEMO-01 is closed
- §"Notes / caveats" — operator backfill for future demo recordings

## Plan Step 1 deviation note

The plan's Step 1 asks the executor to assert that Plan 09 Scenario 5 disposition is GREEN before proceeding. Live state of Scenario 5 in `125-VERIFICATION.md` is still `⬜ pending` — Plan 09 is `skeleton-only` with `operator_pending: true`, so the hardware retest itself has not yet been run by the operator. Per the execution_config in the executor prompt (`mode: wallclock-skeleton (autonomous: false plan, but auto-task pre-stages the manifest)`), the skeleton portion proceeds regardless; the operator gates the actual recording on Scenario 5 dry-run pass per the manifest's §"Operator wallclock steps" item 1.

This is tracked as **Deviation [Rule 3 — Blocking-issue resolution]** in the §"Deviations from Plan" section below.

## Files created

- `.planning/phases/125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo/artifacts/demo-clip-manifest.md` — 143-line skeleton with frontmatter, recording metadata, D-10 shot list, prompt staging guidance, clip path, operator wallclock steps, acceptance gate, notes section

## Commits

- `4e41efc` — `docs(125-11): pre-stage demo clip manifest skeleton for operator backfill`

## Deviations from Plan

### Auto-fixed / clarified

**1. [Rule 3 — Blocking-issue resolution] Skeleton-only execution despite Scenario 5 pending**

- **Found during:** Task 1 Step 1 (Scenario 5 disposition check)
- **Issue:** Plan Step 1 expects Scenario 5 disposition to be "green" before pre-staging the manifest. Live state of `125-VERIFICATION.md` shows `Scenario 5 Status: ⬜ pending` because Plan 09 is itself `skeleton-only` / `operator_pending: true` — the physical retest has not yet been run by the operator.
- **Fix:** Proceeded with manifest skeleton creation only (the `auto` portion) per execution_config directive `mode: wallclock-skeleton (autonomous: false plan, but auto-task pre-stages the manifest)`. The manifest's §"Operator wallclock steps" Step 1 explicitly gates the physical recording on Scenario 5 dry-run being green — that's the operator's responsibility before they begin filming.
- **Files modified:** `.planning/phases/125-.../artifacts/demo-clip-manifest.md` (created)
- **Commit:** `4e41efc`
- **Why this is correct:** Executor scaffolds; operator runs the physical wallclock action. The skeleton being present is the prerequisite for the operator's backfill — same pattern as Plan 09 (VERIFICATION.md skeleton authored by executor, scenarios run by operator). Without the skeleton, the operator would have to author it post-recording, which is the wrong order.

### No other deviations

No bug fixes (Rule 1), no missing critical functionality (Rule 2), no architectural changes (Rule 4) were encountered.

## Self-Check: PASSED

Verified post-commit:

- File exists: `.planning/phases/125-.../artifacts/demo-clip-manifest.md` — PASS (verified via `test -f`)
- File contains `2026-05-vigil-v3.8-demo.mp4` (4 occurrences) — PASS (plan acceptance requires ≥ 1)
- File contains memory citation `feedback_wallclock_checkpoint_exempt` (1 occurrence) — PASS (plan acceptance requires ≥ 1)
- Commit `4e41efc` exists in `git log` — PASS (`git log --oneline | grep 4e41efc`)
- No file deletions in commit — PASS (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty)
- No untracked files post-commit — PASS (`git status --short` clean)
- Working tree clean — PASS

## Operator wallclock work item — pending

Phase 125 close is now blocked on a single operator wallclock action:

1. **Confirm Plan 09 Scenario 5 dry-run is green** before physical recording (run scenario, fill `125-VERIFICATION.md` §"Scenario 5" Status / Evidence / Notes, achieve green disposition).
2. **Pre-stage prompt + test 2x** without recording (RESEARCH Pitfall 7).
3. **Record the 60s clip** per D-10 shot list on real G2 firmware 2.2.0.28 with iPhone screen recording.
4. **Trim to ≤ 60s** in post (no composites, no overlays).
5. **Save** to `~/Library/CloudStorage/iCloud Drive/Vigil/portfolio/2026-05-vigil-v3.8-demo.mp4`.
6. **Backfill manifest** — fill all `<fill>` / `(fill)` fields, tick all 5 D-10 boxes, flip frontmatter `status: pending` → `status: complete`.
7. **Commit backfilled manifest** as `docs(125-11): backfill demo clip manifest with recording metadata`.
8. **Mark AGENT-DEMO-01 complete** — `gsd-sdk query requirements.mark-complete AGENT-DEMO-01`.

The executor explicitly does NOT mark AGENT-DEMO-01 complete in this commit; that mark belongs to the operator after physical evidence exists.

## Requirements

This plan does NOT mark any requirements complete. AGENT-DEMO-01 is gated by the operator's physical recording landing in iCloud + manifest backfill. Phase requirement IDs declared in the execution_config (AGENT-HUD-03, G2-POLISH-05, G2-POLISH-08, G2-PLUGIN-01, AGENT-DEMO-01) are owned by earlier plans (Plan 02–08) and the operator wallclock retest (Plan 09 + 10 + 11); the close-out marker for each lives in the operator-driven plans, not here.

## Phase 125 close path

Plan 11 is the final phase plan. After the operator records + backfills + marks AGENT-DEMO-01 complete, Phase 125 close criteria are satisfied:

- AGENT-HUD-03 ✅ (operator post-Plan-09 Scenario 1)
- G2-POLISH-05 ✅ (operator post-Plan-09 Scenario 3)
- G2-POLISH-08 ✅ (helper landed Plan 04; no operator retest needed)
- G2-PLUGIN-01 ✅ (Plan 08 pack + operator post-Plan-10 upload)
- AGENT-DEMO-01 ✅ (operator post-Plan-11 recording + backfill)

At that point the phase is closeable via `/gsd-close-phase`.
