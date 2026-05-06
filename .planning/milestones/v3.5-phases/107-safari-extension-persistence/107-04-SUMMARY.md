---
phase: 107-safari-extension-persistence
plan: 04
subsystem: testing
tags: [human-uat, nyquist, smappservice, launch-source-heuristic, storyboard, visibleatlaunch]

requires:
  - phase: 107-03
    provides: persistence-pill WebView UI and SMAppService status bridge
  - phase: 107-05
    provides: gated window suppression closing gap_107_1 before human checkpoint
provides:
  - Finalized 107-HUMAN-UAT.md with build metadata, Tests 3+4 passed, Tests 1+2+5 pending reboot, tradeoff_107_1 and tradeoff_107_2 documented
  - 107-VALIDATION.md flipped to nyquist_compliant=true with final per-task verification map (107-00-01 … 107-04-02)
  - Main.storyboard hotfix (visibleAtLaunch="NO") resolving Test 3 residual storyboard pre-render flash not covered by Plan 05's runtime orderOut

affects: [safari-extension, future-mac-accessory-phases, 107-verification]

tech-stack:
  added: []
  patterns:
    - "Human-verify checkpoint with automated osascript probe + visual user confirmation"
    - "ship-with-uat-pending D-06 pattern: Tests 1/2/5 (reboot-dependent) left pending in HUMAN-UAT without blocking phase completion"
    - "Accepted-tradeoff documentation pattern (tradeoff_* blocks alongside gap_* blocks) for deliberate UX cost/benefit decisions"

key-files:
  created:
    - .planning/phases/107-safari-extension-persistence/107-04-SUMMARY.md
  modified:
    - .planning/phases/107-safari-extension-persistence/107-HUMAN-UAT.md (Test 3 flash rework by Plan 05; Tests 3+4 flipped to passed this plan; tradeoff_107_2 added; build metadata finalized)
    - .planning/phases/107-safari-extension-persistence/107-VALIDATION.md (Task 1 landed before Plan 05: nyquist_compliant=true, wave_0_complete=true, final task-ID map)
    - vigil-safari-extension/Vigil Capture/Base.lproj/Main.storyboard (Task 2 hotfix: visibleAtLaunch="NO" on window IQv-IB-iLA)

key-decisions:
  - "[Plan 107-04] Task 1 shipped BEFORE Plan 05 closed gap_107_1 — the nyquist_compliant flip and task-ID map landed on the trunk at commit f74c7cb; the human checkpoint (Task 2) paused when gap_107_1 was observed; Plan 05 ran to closure; Task 2 resumed and completed post-Plan-05."
  - "[Plan 107-04] Inverted wave execution order — Plan 05 (wave 4) ran BEFORE Plan 04 Task 2 (wave 3) because 05's fix unblocked 04's human checkpoint. Wave numbers in frontmatter preserved for archival correctness; actual execution order documented here and in commit history."
  - "[Plan 107-04] Accepted tradeoff_107_2 (sub-perceptual manual-relaunch flash) instead of removing Plan 05's uptime heuristic. Rationale: tightening the gate would regress tradeoff_107_1 further, and D-04 pill can't be validated yet due to a separate Safari-extension-visibility follow-up item."
  - "[Plan 107-04] Storyboard hotfix (visibleAtLaunch=NO) chosen over NSWindowController.loadWindow override — single-attribute XML edit, no Swift code, zero API surface growth."
  - "[Plan 107-04] Test 4's original contract ('no window on subsequent launch') reconciled with Plan 05's gated-reveal design via tradeoff_107_2 rather than by gate rewrite. This is a phase-level design posture decision: gated-reveal is the intent; Test 4's residual flash is acceptable because Login Item boot path (Test 1, SC#1 critical path) is gate-CLOSED."

patterns-established:
  - "Pattern: plan-level gap closure ordering can invert wave numbers when gap_closure plans unblock preceding human checkpoints. Orchestrator confirms with user before inverting; wave numbers in frontmatter preserve planning history; actual execution order documented in commits + SUMMARY."
  - "Pattern: inline hotfixes inside an active checkpoint are OK for single-attribute XML/config edits that emerge during live human UAT. Keep them in-scope of the parent plan's SUMMARY rather than spawning a micro-plan file when the fix is < 5 lines."

requirements-completed: [EXT-01]

duration: ~45min (including Plan 05 orchestration, live human UAT, hotfix + rebuild, and documentation)
completed: 2026-04-20
---

# Plan 107-04: Final assembly + human checkpoint Summary

**Phase 107 shipped as `ship-with-uat-pending`: automated harness + storyboard hotfix + gated-reveal close gap_107_1; Tests 3+4 human-verified passed; Tests 1, 2, 5 remain pending user reboot per D-06.**

## Performance

- **Duration:** ~45 min end-to-end (Plan 05 spawn: 6m 55s, interactive UAT + hotfix rebuild + commits: ~10 min, remaining was Plan 04 Task 1 landed earlier at commit f74c7cb)
- **Started:** 2026-04-20T19:40:00Z (Task 1 — Plan 00 placeholder superseded by Plan 04 actual start)
- **Completed:** 2026-04-20T23:04:36Z
- **Tasks:** 2/2 (Task 1: run full verify + finalize HUMAN-UAT + flip VALIDATION to nyquist_compliant; Task 2: human-verify checkpoint + storyboard hotfix)
- **Files modified:** 3 (107-HUMAN-UAT.md, 107-VALIDATION.md, Main.storyboard)

## Accomplishments

### Task 1 — Verify harness + finalization (commit f74c7cb, shipped before Plan 05)

- Ran `bash scripts/verify-phase-107.sh --static` → exit 0 (later sfltool grep direction fix at 499bc2d)
- Updated `107-HUMAN-UAT.md` frontmatter `updated:` to real ISO timestamp; Current Test note pointing at built `.app` path
- Flipped `107-VALIDATION.md` frontmatter `nyquist_compliant: false → true` and `wave_0_complete: false → true`
- Rewrote Per-Task Verification Map with final task IDs (107-00-01 through 107-04-02); Approval line updated to `approved (ship-with-uat-pending — Test 1/2/5 reboot pending user action)`

### Task 2 — Human-verify checkpoint (commits ce5abd3 + 6e55f24, post Plan 05)

**First attempt** (pre-Plan-05): Test 3 failed — user observed storyboard window rendering behind the NSAlert. gap_107_1 recorded (commit 9940568). Checkpoint paused.

**Plan 05 ran** (wave 4 inverted ahead of wave 3 by orchestrator with user consent): gated-reveal implementation landed (commits b4f5e1a, 5b645fe, d9656e8, c3fcead). WINDOWS_FIRST=1 (was 2).

**Second attempt** (post-Plan-05):
- Rebuilt app at `/Users/jamesonmorrill/Library/Developer/Xcode/DerivedData/Vigil_Capture-ecqueqzbhctzqhcfrasvarwjuont/Build/Products/Debug/Vigil Capture.app` (xcodebuild Debug exit 0)
- Reset UserDefaults flag; launched app; osascript window count = 1 (NSAlert only)
- **Test 3 initial user report:** "small square 'program' flashes up and then gone" behind the alert — storyboard pre-render leak, not gated-reveal
- **Inline hotfix:** `visibleAtLaunch="NO"` added to `<window>` element in `Base.lproj/Main.storyboard:80` (commit ce5abd3). Rebuilt. Re-probed.
- **Test 3 user confirmation:** passed
- **Test 4 user confirmation:** passed with tradeoff_107_2 accepted (sub-perceptual manual-relaunch flash is the intended gated-reveal behavior; Login Item boot path unaffected because uptime < 120s keeps gate closed)
- Flipped 107-HUMAN-UAT.md Test 3+4 to passed; Summary counts to `passed:2 / issues:0 / pending:3`; added `tradeoff_107_2` alongside `tradeoff_107_1`; frontmatter status stays `ship-with-uat-pending` (commit 6e55f24)

## Verification Results

**Automated (Plan 00 harness):**
- `bash scripts/verify-phase-107.sh --static` → exit 0 (5 static checks: LSUIElement, deployment_target, appdelegate_register, first_launch_alert, window_suppression)
- `bash scripts/verify-phase-107.sh --runtime` → xcodebuild exit 0, post-launch SMAppService status probe green (Plan 05 — probe (a) WINDOWS_FIRST=1)
- Static suite elapsed: < 1 s (well under 30 s nyquist budget)

**Human UAT (this plan):**
| Test | Description | Result |
|------|-------------|--------|
| 3 | First-launch NSAlert + no visible window (SC#2) | ✓ passed |
| 4 | Subsequent-launch no NSAlert (SC#2 corollary) | ✓ passed (tradeoff_107_2 accepted) |
| 1 | Reboot persistence (SC#1) | ⏳ ship-with-uat-pending |
| 2 | Login Items entry (SC#1 corollary) | ⏳ ship-with-uat-pending |
| 5 | End-to-end capture after reboot (EXT-01) | ⏳ ship-with-uat-pending |

## Issues / Notes

- **Plan 05 → Plan 04 inversion** documented above under key-decisions. Waves 3 and 4 ran out of order for good reason; callers running `/gsd-progress` or auditing ROADMAP will see Plan 04 close last in wall-clock time even though its wave is lower.
- **Test 4 residual flash** accepted as tradeoff_107_2 rather than fixed. Alternative (remove uptime heuristic in AppDelegate.suppressStoryboardWindows) was considered and rejected in-session; rationale in 107-HUMAN-UAT.md §tradeoff_107_2.
- **Safari extension not visible** observed during Bonus D-04 pill attempt — Vigil Capture does not appear under Safari → Settings → Extensions. Likely causes: Safari Develop menu "Allow Unsigned Extensions" toggled off, or DerivedData path vs `/Applications` issue, or Safari extension cache needing a Safari relaunch. Classified as a follow-up (non-blocking for Phase 107 completion because D-04 pill was a Bonus, not a blocking test). Not added as a gap; will be surfaced via the verifier's human_verification gate or captured as a separate phase/issue.

## Next steps (for the orchestrator)

1. Code review gate on this phase's source changes (expects mostly Swift + 1 storyboard XML attr + 1 bash script line change).
2. Regression gate on prior phases' test files (no Swift tests in tree; likely PWA/vitest regressions to check).
3. Phase verification (gsd-verifier) — goal-backward check against EXT-01 must_haves.
4. ROADMAP.md + STATE.md — mark phase 107 complete; advance to phase 108 (or whatever v3.5 has next) or milestone close.
5. Safari-extension-visibility follow-up — not part of this phase; capture as a todo or new phase.

User reboot UAT obligations (Tests 1, 2, 5) will surface automatically in `/gsd-progress` and `/gsd-audit-uat` until the user flips them post-`sudo reboot`.
