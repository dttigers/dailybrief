---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 09
subsystem: testing
tags: [phase-124, e2e, verification, checkpoint, operator-pending, sse, agent-events, hud, g2-polish]

# Dependency graph
requires:
  - phase: 124-02
    provides: agent-events-bus.ts per-userId EventEmitter Map + 100-cycle no-leak invariant (closes T-124-09 reconnect-storm structural gate)
  - phase: 124-03
    provides: GET /v1/agent-stream SSE route + bus.emit hook + Last-Event-ID 24h replay + cross-user-isolation.test.ts Block 4 (closes AGENT-API-03 structural gate)
  - phase: 124-04
    provides: home.ts 4-line trim + drift detector (closes G2-POLISH-07 structural gate; D-14 byte-identical PNG operator-pending in Plan 04 todo)
  - phase: 124-05
    provides: ROADMAP SC #2 narrowed to D-08 reality + SEED-011 deferral (closes AGENT-HUD-02 doc gate)
  - phase: 124-06
    provides: vigil-g2-plugin sse-client.ts shim with bearer-in-header / BACKOFF_MS / Last-Event-ID localStorage / AbortController disconnect / QuotaExceededError survival (closes plugin-side AGENT-API-03 gate)
  - phase: 124-07
    provides: Companion screen + ContainerIDs 13/14/15 + banner state machine + N/M indicator + offline indicator + nav DOUBLE_CLICK Companion branch (closes AGENT-HUD-01 + AGENT-HUD-02 structural gates)
  - phase: 124-08
    provides: main.ts module-scope onLaunchSource + 500ms timeout + active-session landing + SSE wiring (closes G2-POLISH-06 structural gate)
provides:
  - 124-VERIFICATION.md skeleton (committed; awaiting operator-filled runtime fields under each REQ-ID section)
  - Operator-action todo at .planning/todos/pending/2026-05-10-phase-124-09-e2e-verification-operator-run.md (verbatim runbook for the 8-section E2E run)
  - Operator decision tree for outcome routing (PASS / approved-with-deferrals / blocked) at end of 124-VERIFICATION.md
affects: [phase-124-closeout, phase-125-launch, milestone-v3.8-closeout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wallclock/physical-host checkpoint deferral (mirror Phase 123 Plan 05): autonomous prerequisites land + .planning/todos/pending/ runbook + partial SUMMARY.md cross-references; plan ships in `partial` state, not failed (per memory feedback_wallclock_checkpoint_exempt)"
    - "Multi-todo cross-reference pattern: Plan 09 §G2-POLISH-07 cross-references Plan 04's PNG-equality todo as canonical record; one operator session, two SUMMARY pastes (124-04-SUMMARY + 124-VERIFICATION)"
    - "Prerequisite distinction: Phase 123 24h soak is PARALLEL track (vigil-watch must be installed + running, but NOT 24h-runtime-tested) — Plan 09 explicitly disambiguates so operator doesn't sequentially block on the wrong gate"

key-files:
  created:
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md
    - .planning/todos/pending/2026-05-10-phase-124-09-e2e-verification-operator-run.md
  modified: []

key-decisions:
  - "Mirror Phase 123 Plan 05 wallclock-deferral pattern verbatim: autonomous Task 1 lands the VERIFICATION skeleton + decision tree + cross-refs; operator Task 2 deferred via .planning/todos/pending/ runbook; partial SUMMARY.md ships in `partial` state with chain-of-evidence preserved"
  - "Phase 123 24h soak is a PARALLEL operator track, not a sequential blocker for Phase 124. Plan 09 verification needs vigil-watch INSTALLED + running for `swift run vigil-watch test` E2E vehicle, but does NOT need 24h of runtime data. Both phases close on independent operator evidence."
  - "Plan 09 §G2-POLISH-07 cross-references Plan 04's existing D-14 PNG-equality operator todo as the canonical record. Combine evenhub-simulator captures into ONE operator session, paste cmp output into BOTH summaries. Avoids duplicate operator runs."
  - "Threat-register T-124-09-02 mitigation locked verbatim: vk_<sha-prefix> placeholder convention in 124-VERIFICATION.md cross-user-isolation runbook; do NOT paste real bearer keys (per memory feedback_railway_variables_leak)"
  - "Operator decision tree codified at end of 124-VERIFICATION.md: 8 outcome rows mapping section-fail-cases to STATE.md/ROADMAP.md/blocker-routing actions. Removes 'now what?' ambiguity for the operator."

patterns-established:
  - "Wallclock/physical-host checkpoint deferral pattern v2 (after Phase 123 Plan 05 v1): partial SUMMARY ships when autonomous prereqs land; operator runbook is the bridge document; STATE.md/ROADMAP.md updates encode the partial state explicitly"
  - "Cross-todo coordination for compound operator gates: when one operator action satisfies multiple plan checkpoints (Plan 04 PNG + Plan 09 G2-POLISH-07), each consuming plan cross-references the shared canonical record so the operator runs ONE session and pastes results into all consumers"
  - "Verification frontmatter expansion: human_verification array with test/expected/why_human triples enables `/gsd-verify-work` to surface operator-pending items distinctly from autonomous gates"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-05-10
---

# Phase 124 Plan 09: End-to-End Verification Skeleton + Operator Runbook Summary

**`124-VERIFICATION.md` skeleton committed with all 5 REQ-ID sections + reconnect storm + operator decision tree; Task 2 E2E execution deferred to operator via `.planning/todos/pending/2026-05-10-phase-124-09-e2e-verification-operator-run.md` (mirrors Phase 123 Plan 05 wallclock-deferral pattern; Phase 124 closes when operator fills the skeleton + signs off).**

## Status

**Partial — Task 1 autonomous-complete, Task 2 deferred to operator (CHECKPOINT REACHED).**

This plan ships in the same partial state Phase 123 Plan 05 used: the
autonomous prerequisites are committed, the operator runbook is in place,
the `124-VERIFICATION.md` skeleton has all sections pre-allocated for
operator paste, and a `.planning/todos/pending/` entry tracks the operator
follow-through. Phase 124 closes when the operator runs the 8-section E2E
verification and back-fills the skeleton.

## Performance

- **Duration:** 4min (autonomous portion)
- **Started:** 2026-05-10T02:25:03Z
- **Completed (autonomous portion):** 2026-05-10T02:29:36Z
- **Tasks:** 1 of 2 (Task 2 deferred to operator)
- **Files modified:** 2 (1 phase verification skeleton, 1 operator todo)

## Accomplishments

- **Task 1 (autonomous):** `124-VERIFICATION.md` skeleton committed with 6+ sections covering all 5 REQ-IDs (AGENT-API-03 split into single-user smoke / Last-Event-ID resume / cross-user isolation live; AGENT-HUD-01 5-event banner state machine; AGENT-HUD-02 DOUBLE_CLICK three-branch; G2-POLISH-06 launch-source three-case; G2-POLISH-07 byte-identical PNG cross-referencing Plan 04 todo) + reconnect storm + deferred-items + sign-off checklist + operator decision tree
- **Cross-references locked:** Phase 123 24h soak todo (PARALLEL prerequisite), Plan 04 D-14 PNG todo (G2-POLISH-07 canonical record)
- **Operator todo created:** `.planning/todos/pending/2026-05-10-phase-124-09-e2e-verification-operator-run.md` with verbatim 8-section runbook + closeout flow + failure path + structural-safety justification
- **Threat mitigations preserved:** T-124-09-02 (vk_<prefix> placeholder convention) + T-124-09-03 (single-user data acceptance) baked into VERIFICATION.md + operator todo
- **Decision tree authored:** 8-row outcome map at end of 124-VERIFICATION.md routes each section-fail-case to its appropriate STATE.md/ROADMAP.md/blocker action

## Task Commits

1. **Task 1: Scaffold 124-VERIFICATION.md skeleton** — `7e0c68f` (feat)

**Plan metadata commit:** [pending — will be added after STATE.md/ROADMAP.md updates]

**Task 2 (operator-driven E2E verification):** DEFERRED to
`.planning/todos/pending/2026-05-10-phase-124-09-e2e-verification-operator-run.md`.
Mirrors Phase 123 Plan 05 Task 5.4 deferral pattern.

## Files Created/Modified

- `.planning/phases/124-.../124-VERIFICATION.md` (NEW, 318 lines) — operator-fillable skeleton with 5 REQ-ID sections + reconnect storm + deferred-items + sign-off + decision tree; status: `pending`
- `.planning/todos/pending/2026-05-10-phase-124-09-e2e-verification-operator-run.md` (NEW) — operator runbook for the 8-section E2E run; cross-references both prerequisite todos (Phase 123 24h soak + Plan 04 D-14 PNG)

## Decisions Made

1. **Wallclock/physical-host checkpoint deferral pattern repeated verbatim from Phase 123 Plan 05** — autonomous Task 1 lands the structural artifact (VERIFICATION skeleton with all section anchors + decision tree); operator Task 2 deferred via `.planning/todos/pending/` runbook; partial SUMMARY.md ships in `partial` state with chain-of-evidence preserved. Distinct from `mode: yolo / skip_checkpoints: true` which only auto-skips confirmation gates — checkpoints whose payload requires real-world physical-host actions (3 concurrent processes, GUI capture, visual UI verification) are exempt per memory `feedback_wallclock_checkpoint_exempt`.

2. **Phase 123 24h soak is a PARALLEL operator track for Plan 09 verification, not a sequential blocker.** vigil-watch must be INSTALLED + running for `swift run vigil-watch test` to be the E2E vehicle, but Phase 124 does NOT block on Phase 123's 24h gate completing. Both phases close on independent operator evidence. The 124-VERIFICATION.md frontmatter `prerequisites:` field codifies this distinction so the operator doesn't sequentially block on the wrong gate.

3. **Plan 09 §G2-POLISH-07 cross-references Plan 04's existing D-14 PNG-equality operator todo as the canonical record.** Combine `evenhub-simulator` captures into ONE operator session; paste `cmp` output into BOTH 124-04-SUMMARY.md AND 124-VERIFICATION.md §G2-POLISH-07 Result line. Avoids duplicate operator runs and keeps the canonical record in Plan 04's todo (which is the more atomic/specific gate).

4. **Threat-register T-124-09-02 mitigation: `vk_<sha-prefix>` placeholder convention.** 124-VERIFICATION.md cross-user-isolation runbook explicitly tells the operator NOT to paste real bearer keys (per memory `feedback_railway_variables_leak`). Use placeholder references when documenting two-bearer test results.

5. **Operator decision tree codified at the end of 124-VERIFICATION.md.** 8-row outcome map covers PASS / APPROVED-WITH-DEFERRALS / BLOCKED routing per section. Removes ambiguity for the operator about what to do on failure: each row points to specific STATE.md / ROADMAP.md / blocker-routing actions.

## Deviations from Plan

**None — plan executed exactly as written.** The plan's `<action>` block was the verbatim file content for `124-VERIFICATION.md`; Task 1 wrote it as specified plus appended an operator decision tree section (additive, not contradicting any plan instruction; closes a known operator-ergonomics gap noted in the threat register T-124-09-01 disposition).

The decision-tree addition is structurally consistent with Rule 2 (auto-add missing critical functionality) — without it, the operator gets the right runbook but no clear "now what" routing on failure, which is the same operator-ergonomics gap that motivated Phase 123 Plan 05's failure-path branch tree. Mirrors that prior pattern.

## Issues Encountered

None — autonomous portion landed first-try. Task 1's `<verify>` block grep returned 38 hits (well above the required 5+ unique REQ-IDs); all 8 acceptance criteria green:

- File exists ✓
- All 5 REQ-IDs present (38 grep hits across sections + frontmatter + cross-refs) ✓
- `Last-Event-ID resume` section ✓ (5 mentions)
- `Cross-user isolation` section ✓ (2 section + 1 prerequisite mention)
- `Reconnect storm test` section ✓ (4 mentions)
- `Deferred items` section ✓ (1 mention with SEED-011 ref + 3 SEED-011 cross-refs total)
- `Sign-off` checklist ✓ (1 section, 9 checkboxes)
- frontmatter `status: pending` ✓

## User Setup Required

**External operator action required to complete Plan 09 + close Phase 124.**
See `.planning/todos/pending/2026-05-10-phase-124-09-e2e-verification-operator-run.md`
for the verbatim 8-section operator runbook. Cross-references:

- `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` (parallel prerequisite — vigil-watch installation)
- `.planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md` (combine PNG capture with §G2-POLISH-07)

## Self-Check: PASSED

- File `.planning/phases/124-.../124-VERIFICATION.md` exists ✓
- File `.planning/todos/pending/2026-05-10-phase-124-09-e2e-verification-operator-run.md` exists ✓
- Commit `7e0c68f` exists in `git log --all` ✓
- All 8 acceptance criteria from Task 1 `<acceptance_criteria>` block green ✓

## Next Phase Readiness

**Phase 124 closes when operator completes E2E verification per the runbook** and:

1. Fills `124-VERIFICATION.md` with verbatim outputs in each REQ-ID section's Result line
2. Sets frontmatter `status:` to `approved` or `approved-with-deferrals` (or `blocked` on failure)
3. Ticks the 9 sign-off checkboxes (or marks deferred where applicable)
4. Updates STATE.md per the operator decision tree
5. Updates ROADMAP.md Phase 124 row to `Complete`
6. Marks REQUIREMENTS.md AGENT-API-03 / AGENT-HUD-01 / AGENT-HUD-02 / G2-POLISH-06 / G2-POLISH-07 complete
7. Moves both this plan's todo AND Plan 04's PNG todo to `.planning/todos/completed/`

**Phase 125 unblocks** once Phase 124 frontmatter `status:` is `approved` or `approved-with-deferrals`. Phase 125 covers Quiet mode (AGENT-HUD-03) + remaining polish riders (G2-POLISH-05/08) + plugin v0.3.0 ship (G2-PLUGIN-01) + 60s portfolio demo (AGENT-DEMO-01) — closes the v3.8 milestone.

**Concurrent operator track:** Phase 123 24h soak (`.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md`) is in parallel; closing it does NOT block Phase 124, but both must close before v3.8 milestone is fully sign-off-ready.

---
*Phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish*
*Plan: 09*
*Completed (autonomous portion): 2026-05-10*
*State: partial — Task 2 operator-pending; mirrors Phase 123 Plan 05 v1 pattern*
