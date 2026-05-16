---
phase: 129-lifecycle-restore-servicenow-popup
plan: "06"
subsystem: testing
tags: [uat, hardware, operator-run, runbook, results, gap-discovery, partial-close]

dependency_graph:
  requires:
    - 129-02-SUMMARY.md (G2-LIFECYCLE-01/02/03 — restore wired on sim-side)
    - 129-03-SUMMARY.md (SVCNOW-01/02/03 — extension popup + service worker + content script)
    - 129-04-SUMMARY.md (SVCNOW-04 — server-side dedup via clientCaptureId)
    - 129-05-SUMMARY.md (SVCNOW-05 — Safari lock-step parity)
  provides:
    - 129-UAT-RUNBOOK.md — 9 hardware scenarios (1, 1b, 2, 3, 4, 4b, 4c, 5, 6) mapped 1-to-1 to the 5 ROADMAP Phase 129 success criteria
    - 129-UAT-RESULTS.md — Session 1 results (2026-05-15): 1 PASS, 1 FAIL, 2 BLOCKED, 4 DEFERRED, 1 not-yet-formalized — paired with a Gap Inventory of GAP-129-A through GAP-129-H
    - Empirical resolution of RESEARCH Open Question 1 / Probe 6 / Assumption A1: Polaris title shape is `CS0361233 | Case | ServiceNow`; existing `/\bCS\d{7}\b/` regex correctly extracts it (Scenario 4 PASS)
    - Discovery of 8 actionable gaps that became plans 129-07 (extension housekeeping) through 129-13 (close-out UAT re-run); the gap-closure cycle is the audit trail for this plan's "failures"
  affects:
    - 129-07 through 129-12 (gap-closure plans spawned by Session 1's findings)
    - 129-13 (Session 2 close-out re-run that delivers the actual PASS verdicts on the deferred / blocked / failed scenarios)
    - Future hardware-UAT plans (template + structure proven; pattern: "run, surface gaps, route to gap-closure, re-run for close-out")

tech_stack:
  added: []
  patterns:
    - "Operator hardware UAT pattern: session-1 runbook captures every result regardless of PASS/FAIL, gaps surface as a GAP-{PHASE}-{LETTER} inventory in the results file, follow-up plans take their numbers from where the original plan set left off, session-2 re-run closes the gaps + final PASS verdicts."
    - "Scenario edge-case policy table: long-wait scenarios (Scenario 1b 31-min TTL) and platform-specific scenarios (Scenario 5 Xcode Copy Bundle Resources, Scenario 5 chrome.action shim) get explicit DEFERRED / conditional-pass / log-and-followup policies in the runbook so the operator doesn't conflate platform plumbing issues with feature regressions."

key_files:
  created:
    - .planning/phases/129-lifecycle-restore-servicenow-popup/129-UAT-RUNBOOK.md (authored in Task 1, augmented by 129-11 + 129-13)
    - .planning/phases/129-lifecycle-restore-servicenow-popup/129-UAT-RESULTS.md (Session 1 results from Task 2, augmented by 129-13's Session 2)
  modified:
    - (none — all subsequent edits to the runbook + results files are owned by downstream plans)

decisions:
  - "Plan close-out semantics: 129-06's must_haves are 'runbook exists', 'results file records pass/fail per scenario with observed regressions', 'Polaris probe captures actual document.title shape', 'Safari shim issue is logged for follow-up if it surfaces'. Session 1 (2026-05-15) satisfied ALL FOUR — even though only 1 of 9 scenarios reached PASS, every scenario produced a recorded result + observation. The plan's deliverable was 'run UAT and capture evidence', not 'pass all UAT'. Treating the discovered gaps as 129-06 failures would mis-frame what was actually a successful UAT discovery cycle."
  - "Delegate Session 2 re-run to plan 129-13: rather than expanding 129-06's scope to include retry-after-gap-closure, the gap inventory was elevated to its own phase-scoped plan (129-13) with explicit depends_on [129-07..129-12]. 129-06 closes once Session 1 is recorded; 129-13 closes once Session 2 is recorded. Both plans are needed for full audit-trail granularity."
  - "Preserve Session 1 results in 129-UAT-RESULTS.md as the historical record. Plan 129-13's session-2 section is added ABOVE Session 1 (most-recent-first) but does not overwrite. This matches the augment-not-overwrite pattern documented in 129-13 Task 1's runbook update."

metrics:
  duration: "Task 1: ~30 minutes (Claude, autonomous, runbook authoring on 2026-05-15). Task 2: ~3 hours (operator wall-clock on 2026-05-15, including hardware setup, sideload, and gap-discovery across all 9 scenarios)."
  completed: "2026-05-15T22:00:00Z (approximate — operator's end-of-session pause on 2026-05-15)"
  tasks_completed: 2
  files_changed: 2
---

# Phase 129 Plan 06: Operator Hardware UAT — Session 1 Discovery Cycle Summary

Session 1 (2026-05-15) executed all 9 hardware scenarios from the runbook on real G2 + iPhone Even Hub + Chrome + ServiceNow; 1 PASS (Polaris CS# extraction), 1 FAIL (drift banner — GAP-129-D), 2 BLOCKED (prod 500s — GAP-129-C), 4 DEFERRED (cascade from GAP-129-G + session-end), surfaced 8 gaps (A-H) that became plans 129-07 through 129-13 — the Session 2 close-out re-run is delegated to 129-13.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Author 129-UAT-RUNBOOK.md (6 original scenarios mapped to ROADMAP success criteria) | (earlier in session, prior to 2026-05-15) | `129-UAT-RUNBOOK.md` |
| 2 | Operator runs UAT Session 1 + records results + identifies gaps | (recorded in `129-UAT-RESULTS.md` directly; operator-authored session log committed in earlier session) | `129-UAT-RESULTS.md` |

## Verification Results — Session 1 Scenarios (2026-05-15)

| Scenario | Outcome | Notes |
|----------|---------|-------|
| 1 — G2 force-quit-iPhone restore (degraded path) | **FAIL** | Plugin lands on HOME instead of restoring screen — root cause unknown at session end → GAP-129-G |
| 1b — TTL 30-min boundary | DEFERRED | Depends on GAP-129-G fix; cannot meaningfully test TTL when every relaunch lands on HOME |
| 2 — Phone-background → foreground Companion HUD cache | DEFERRED | Session-end pause; different code path (`setBackgroundState` / `onBackgroundRestore`) — worth re-testing fresh in Session 2 |
| 3 — Glasses-menu launch precedence (Phase 124 D-10 invariant) | DEFERRED | Inconclusive — restore was bypassed for every launch source per the failing GAP-129-G, can't distinguish "glassesMenu correctly skipped restore" from "all paths fall to HOME" |
| 4 — Polaris CS# extraction + popup pre-fill | **PASS** | Confirmed `CS0361233 \| Case \| ServiceNow` title shape; existing `/\bCS\d{7}\b/` regex extracts it correctly; resolves RESEARCH Open Question 1 / Probe 6 / Assumption A1 |
| 4b — Multi-tab POST race (operator-friction acceptance) | BLOCKED | Production returns HTTP 500 on every clientCaptureId-bearing POST → GAP-129-C |
| 4c — Retry-storm idempotency (strict dedup) | BLOCKED | Same root cause as 4b — GAP-129-C |
| 5 — Safari extension parity smoke | DEFERRED | Xcode Copy Bundle Resources step + Safari install pending; independent of G2 fixes, can run in parallel after Xcode step |
| 6 — Title drift banner (CS# changed mid-flight) | **FAIL** | Full-reload Polaris navigation kills content-script state → no banner fires → GAP-129-D |

## Gap Inventory Surfaced (became plans 129-07 through 129-13)

| Gap | Severity | One-line | Resolution Plan |
|-----|----------|----------|-----------------|
| GAP-129-A | medium | `__tests__` blocks Chrome unpacked load | 129-07 Task 1 |
| GAP-129-B | high | API-key entry UI removed — restore inline setup view | 129-07 Task 2 |
| GAP-129-C | high | Production missing migration 0021 — `dbInsertOrGet` 500s | 129-08 |
| GAP-129-D | medium | Drift detector loses state on full-reload — persist via `chrome.storage.session` | 129-07 Task 3 |
| GAP-129-E | medium | Runbook/RESEARCH conflate `work_orders` with thought-task `openTasks` — terminology | 129-11 |
| GAP-129-F | high | No hardware-validated entry gesture for TASK_DETAIL — wire DOUBLE_CLICK on WORK_ORDERS | 129-09 |
| GAP-129-G | high | G2-LIFECYCLE-02 broken on hardware (lands on HOME after force-quit) | 129-10 |
| GAP-129-H | high | Plan 129-02 build-breakers from missing imports — process gap: require full `tsc` before SUMMARY | 129-12 |

Closure of all 8 gaps + final PASS verdicts on the FAIL / DEFERRED / BLOCKED scenarios is delegated to **plan 129-13** (Session 2 close-out re-run, depends_on [129-07..129-12]).

## Files Created/Modified

- `.planning/phases/129-lifecycle-restore-servicenow-popup/129-UAT-RUNBOOK.md` — 9 original scenarios + edge-case policy table. Subsequent edits by 129-11 (terminology), 129-13 (Scenarios 7 + 8 for gap-closure confirmations).
- `.planning/phases/129-lifecycle-restore-servicenow-popup/129-UAT-RESULTS.md` — Session 1 partial results + Gap Inventory. Session 2 will augment ABOVE Session 1 (most-recent-first).
- `.planning/phases/129-lifecycle-restore-servicenow-popup/129-06-SUMMARY.md` — this file.

## Decisions Made

- **PASS criterion was "run UAT and capture evidence", not "all scenarios PASS".** Session 1 captured evidence for every scenario (PASS, FAIL, BLOCKED, DEFERRED — all with observations). That satisfies 129-06's must_haves. The 8 discovered gaps are a successful diagnostic outcome, not a 129-06 failure — they are the exact "any failure here re-opens the corresponding plan as a `--gaps` closure pass" mechanism the plan's `<objective>` predicted.
- **Delegate Session 2 to 129-13.** Rather than expanding 129-06's scope to include the re-run after gap closure, the gap inventory was elevated to a dedicated plan (129-13) with explicit dependencies on the gap-closure plans. This gives a cleaner audit trail (Session 1 = 129-06 outcome; Session 2 = 129-13 outcome) and aligns with the "re-opens as a `--gaps` closure pass" pattern.
- **Preserve Session 1 results unmodified.** 129-13 augments above Session 1 in `129-UAT-RESULTS.md`; nothing in Session 1 is rewritten. Historical record matters for the operator's ability to reconstruct the discovery cycle later.

## Deviations from Plan

### Auto-fixed / Operator-judgment deviations

**1. [Rule 1 — Operator judgment, scope-handoff] Session 2 re-run delegated to 129-13 instead of being part of 129-06**
- **Found during:** Task 2 (operator's end-of-Session-1 close-out), when the gap inventory was too large to retry within the same plan.
- **Issue:** 129-06's `<objective>` says "Any failure here re-opens the corresponding plan as a `--gaps` closure pass" — but with 8 distinct gaps, the cleaner structure was to spawn a coordinated set of gap-closure plans (129-07..129-12) + a single re-run plan (129-13) rather than retrying 129-06's Task 2 N times.
- **Fix:** Operator (or planner) created plans 129-07 through 129-13 via `/gsd:plan-phase 129 --gaps`. 129-06 SUMMARY (this file) acknowledges the close-out.
- **Files modified:** None to 129-06's own deliverables — the handoff is recorded here only.
- **Verification:** Plan 129-13 exists and has `depends_on: [129-07, 129-08, 129-09, 129-10, 129-11, 129-12]`. When 129-13's Session 2 completes, all 8 gaps will be closed and the 5 ROADMAP success criteria will be validated on hardware.
- **Committed in:** This summary's commit (and the prior gap-closure-plan commits already in the phase log).

---

**Total deviations:** 1 scope-handoff (planned-and-documented; no rework of 129-06's actual deliverables).
**Impact on plan:** None — all must_haves satisfied by Session 1. Close-out cycle continues in 129-13.

## Issues Encountered

The 8 discovered gaps are the meaningful "issues" from this plan, but they are the plan's value — not failures of execution. Each is itemized in the Gap Inventory above and routed to a dedicated follow-up plan. The plan-runner experience itself was clean (sideload worked, Web Inspector attached, ServiceNow Polaris probe ran without auth issues, the Companion HUD scenarios surfaced because the session paused — not because of code-level problems).

## User Setup Required

None for 129-06 directly. Plan 129-13 will require the operator to re-engage hardware for Session 2.

## Next Phase Readiness

- **129-13 ready:** All upstream gap-closure plans (129-07, 129-08, 129-09, 129-10, 129-11, 129-12) are tracked separately. Session 2 can start as soon as each of those has a SUMMARY.
- **129-06 contributes to phase close:** This SUMMARY plus 129-13's eventual SUMMARY together close out the operator-side UAT cycle for Phase 129. The autonomous gap-closure plans contribute the code/process fixes; the two UAT plans contribute the empirical PASS evidence.
- **Phase 129 close criteria:** Will be triggered by `/gsd-execute-phase` after both 129-10 (operator hardware diagnostic + fix loop) and 129-13 (operator Session 2 re-run) reach `has_summary: true`. At that point ROADMAP Phase 129's 5 success criteria are all validated and Phase 129 moves to Complete.

---
*Phase: 129-lifecycle-restore-servicenow-popup*
*Plan: 06*
*Completed: 2026-05-15 (Session 1 end-of-session pause; SUMMARY authored 2026-05-16 as part of close-out)*
