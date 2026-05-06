---
phase: 119
plan: 02
subsystem: ops
tags: [dmarc, dns, cloudflare, runbook, ops, email-deliverability, deferred, amendment]
dependency-graph:
  requires:
    - phase: 119-01-author-runbook
      provides: 119-RUNBOOK.md operator scaffold with Section 6 PASS/FAIL/DEFERRED branch templates
    - SEED-003 routine `trig_01RZLcj1jpxvDQAwnFmUG9d9` (existing, fires 2026-05-06)
  provides:
    - Closed plan-loop for Phase 119 via operator-amendment pathway (DEFERRED branch + steady-state acceptance), not via the PASS-branch ramp execution
    - 119-RUNBOOK.md Section 6 fully populated with routine's DEFERRED determination + operator amendment + re-activation conditions
  affects:
    - v3.7 milestone close — Phase 119 no longer blocks, releases /gsd-complete-milestone
    - SEED-003 — stays dormant; routine continues on existing schedule
    - Cloudflare DNS — untouched (`p=none` retained as steady state)
tech-stack:
  added: []
  patterns:
    - Operator-amendment closure pattern for plans whose execution gate is structurally unsatisfiable at current product scale (alternative to forcing synthetic conditions or abandoning the plan outright)
key-files:
  created:
    - .planning/phases/119-dmarc-quarantine-ramp/119-02-SUMMARY.md
  modified:
    - .planning/phases/119-dmarc-quarantine-ramp/119-RUNBOOK.md (Section 6 — routine DEFERRED block + operator amendment + re-activation conditions)
    - .planning/seeds/SEED-003-checkpoint-2026-05-06.md (routine-authored checkpoint)
decisions:
  - Accepted `p=none` as steady-state DMARC posture for v3.7 closeout. Rationale: 8-day rua silence (2026-04-29 → 2026-05-05) is a scale signal, not a transient gate failure — vigilhub.io's single-user volume is below the threshold at which receivers emit daily aggregate reports. ROADMAP SC #1 / #2 (PASS-branch criteria) formally waived; SC #3 (FAIL/DEFERRED branch documented) satisfied via the amendment.
  - Preserved gate routine `trig_01RZLcj1jpxvDQAwnFmUG9d9` rather than deleting it. If conditions ever spontaneously resolve, the routine will fire and open a PR. Next scheduled fire 2026-05-20; abandonment window opens 2026-05-24.
  - Documented three explicit re-activation conditions (volume materializes / spoofing observed / compliance requirement) so the amendment is a structured deferral, not a silent abandonment.
metrics:
  duration: ~10min (orchestrator analysis + amendment authoring + commit)
  completed: 2026-05-06
---

# Phase 119 Plan 02: DMARC Quarantine Ramp Execution Summary

One-liner: Auto-eval routine fired 2026-05-06 and returned DEFERRED (0 of 3 conditions met) due to vigilhub.io's pre-growth email volume; operator amendment at sha `b33a55a` accepts `p=none` as steady-state DMARC posture, formally closing Phase 119 via the runbook's DEFERRED branch rather than the PASS-branch ramp execution path. Cloudflare DNS untouched, routine preserved, three re-activation conditions documented.

## What Happened

This plan was designed for operator-driven execution of the actual DMARC ramp on or after 2026-05-06, gated on `trig_01RZLcj1jpxvDQAwnFmUG9d9` producing a PASS determination. All seven tasks were `checkpoint:human-verify` or `checkpoint:human-action` precisely because each step required real-world interaction (Cloudflare dashboard, Gmail header inspection, prod sends).

The plan correctly anticipated three terminal outcomes: PASS, FAIL, DEFERRED. The DEFERRED branch was the actual path taken.

### Sequence of events

1. **2026-05-06 15:00:06 UTC** — Routine `trig_01RZLcj1jpxvDQAwnFmUG9d9` fired (commit `ddbf6fa` on origin/main, authored by Claude on routine session `01QAHpdbKuczCYyyiBBU73vU`).
2. **2026-05-06 15:04:45 UTC** — Routine wrote `.planning/seeds/SEED-003-checkpoint-2026-05-06.md` and annotated `119-RUNBOOK.md` Section 6 DEFERRED block with verbatim evaluation evidence. Commit `ddbf6fa` pushed to origin/main.
3. **2026-05-06 (later)** — Operator reviewed routine's determination. After analyzing the underlying signal (8-day rua silence since 2026-04-29 indicating near-zero email volume from vigilhub.io), determined the gate is not transiently failing but structurally unsatisfiable at current product scale.
4. **2026-05-06 — sha `b33a55a`** — Operator amendment authored in `119-RUNBOOK.md` Section 6, accepting `p=none` as steady-state, preserving the gate routine, documenting three re-activation conditions. Cloudflare DNS untouched.

### Routine's DEFERRED evaluation (verbatim from commit `ddbf6fa`)

| Condition | Result | Evidence |
|---|---|---|
| C1: ≥7 consecutive daily DMARC aggregate reports | NOT MET | Only 4 Google reports received (2026-04-24, -25, -26, -28); gap on 2026-04-27; 8-day silence 2026-04-29 through 2026-05-05; XML unreadable via Gmail MCP attachment-only constraint. |
| C2: ≥3 days verify-email production traffic | CANNOT CONFIRM | No Resend MCP, Railway CLI unavailable to routine; DMARC silence is strong negative signal; manual UAT (2026-04-26, ~3-4 emails) excluded per seed conditions. |
| C3: ≥50 sends/day in most recent report | CANNOT CONFIRM | XML unreadable; very likely NOT MET given sparse report count and 8-day rua silence. |

**0 of 3 conditions met.** Routine wrote the checkpoint, annotated Section 6, requested operator action to bump `run_once_at` to 2026-05-20.

## Plan Must-Haves Coverage

The plan's `must_haves.truths` had five conditions; the DEFERRED-branch path satisfies the applicable subset:

- ✅ "On or after 2026-05-06, the auto-eval routine produces a PASS / FAIL / DEFERRED determination, and that determination is captured verbatim in 119-RUNBOOK.md Section 6" — **MET via routine commit `ddbf6fa` + amendment `b33a55a`.** Section 6 now contains the routine's DEFERRED block + the operator amendment.
- ✅ "On FAIL or DEFERRED branch: NO Cloudflare DNS edit fires; deferral reason and re-eval date are documented in 119-RUNBOOK.md Section 6" — **MET.** No dashboard touch occurred. Deferral reason documented in routine's DEFERRED block. Re-eval date 2026-05-20 documented. Operator amendment further structures the deferral into three named re-activation conditions.
- N/A: "On PASS branch only: _dmarc.vigilhub.io TXT record on Cloudflare DNS shows ..." — DEFERRED branch, condition does not apply.
- N/A: "On PASS branch: both legs of the D-05 two-path smoke ... show dmarc=pass" — DEFERRED branch, no smoke required.
- N/A: "If any D-06 rollback trigger fires within 14 days post-ramp ..." — no ramp executed, rollback procedure not applicable.

The plan's `must_haves.artifacts` required `119-RUNBOOK.md` Section 6 contain a "PASS|FAIL|DEFERRED branch annotation with date YYYY-MM-DD and operator-pasted evidence" — the routine + operator amendment together satisfy this with the 2026-05-06 date and structured evidence blocks.

## ROADMAP Success-Criteria Coverage

| SC | Criterion | Status |
|---|---|---|
| #1 | Auto-eval routine produces documented PASS/FAIL determination | ✅ Documented as DEFERRED in Section 6 |
| #2 | Post-ramp `dig` verifies `p=quarantine` | ⏸ Formally waived by operator amendment (no ramp executed) |
| #3 | FAIL/DEFERRED branch documents deferral reason + re-eval date | ✅ Routine DEFERRED block + amendment re-activation conditions |
| #4 | Post-ramp `dmarc=pass` for legitimate Vigil mail | ⏸ N/A — no policy change to validate; `p=none` (monitoring-only) does not affect disposition |

The two waived/N/A criteria are explicitly addressed by the operator amendment, which states: "ROADMAP SC #1 / #2 (PASS-branch criteria) are formally waived; SC #3 (FAIL/DEFERRED branch documented) is satisfied by this section."

## What Was Preserved (vs Abandoned)

The amendment is a structured deferral, not an abandonment. Preserved:

- **rua aggregate monitoring** — `_dmarc.vigilhub.io` TXT still emits `rua=mailto:jamesonmorrill1@gmail.com`. If receivers ever emit reports again, they continue to flow into the operator's inbox. Zero cost, zero deploy risk.
- **Gate routine `trig_01RZLcj1jpxvDQAwnFmUG9d9`** — remains scheduled. `last_fired_at: 2026-05-06T15:00:06Z`, `enabled: false` (one-shot fired), `next_run_at: 2026-05-07T15:00:06Z` (bookkeeping). Operator action required: bump `run_once_at` to 2026-05-20 via `/schedule update` if a re-eval is desired.
- **SEED-003** — stays in `.planning/seeds/` with `status: dormant`. Trigger conditions still well-formed; only the v3.7 deadline pressure is released.
- **Section 7 rollback procedure** — left untouched in the runbook for future reference. If a future ramp ever fires, the rollback section applies as originally designed.

## Re-Activation Conditions (from operator amendment)

The runbook now documents three explicit conditions under which the ramp would be reopened (each with a defined response path):

1. **Volume materializes** — rua aggregate reports resume daily flow with ≥50 sends/day for ≥7 consecutive days. Re-arm routine and re-execute Sections 1-5.
2. **Spoofing observed** — rua report shows `disposition=none` with `dkim=fail` AND `spf=fail` from non-Vigil source IP. Sections 1-5 execute under incident response (faster than original SEED-003 evidence bar).
3. **Compliance requirement** — Gmail bulk-sender mandate, Microsoft tenant policy, enterprise customer demand, or similar downstream pressure. Cost/benefit shifts and ramp executes regardless of organic volume.

These are structural enough that future operators (or future Claude sessions) can recognize them without re-deriving the analysis.

## Deviations from Plan

This plan's execution path was structurally redirected by the routine's DEFERRED determination — not a code-level deviation, but a control-flow deviation already anticipated by the plan's branching design.

### Anticipated and handled

- **The plan explicitly listed three terminal outcomes (PASS / FAIL / DEFERRED).** The DEFERRED branch was always a valid completion path, not a deviation.
- **All `must_haves.truths` not applicable to the DEFERRED branch were waived in the plan's design** — they were conditioned on "On PASS branch only:" or "If any D-06 rollback trigger fires:" prefixes.

### Unanticipated, handled by amendment

- **The plan implicitly assumed DEFERRED was a transient state** ("Re-eval scheduled for YYYY-MM-DD typically +7 days" in the original Section 6 template). The actual DEFERRED determination revealed a structural condition that ≥1-2 re-evals would not resolve. The operator amendment adds a steady-state acceptance pathway that the original plan did not enumerate. This is not a plan defect — it's a refinement learned from the routine's empirical signal.

## Authentication Gates

None encountered. The amendment was a markdown edit; no Cloudflare API calls, no Resend API calls, no Railway access, no prod sends. The routine's earlier work (which DID attempt to access Resend / Railway and was blocked by lack of MCP connectors) is documented in `SEED-003-checkpoint-2026-05-06.md`.

## Threat Surface Scan

No new external surface introduced. Threat-model items from `119-02-PLAN.md` are addressed:

- **T-119-02-01 (operator applies wrong TXT value)** — N/A; no DNS edit occurred.
- **T-119-02-02 (smoke leg false-positive)** — N/A; no smoke executed.
- **T-119-02-03 (auto-PR drifts from runbook)** — Mitigated; routine wrote evidence directly to `119-RUNBOOK.md` Section 6 and committed to repo (`ddbf6fa` on main), not to a separate PR. Operator amendment is co-located in same file.
- **T-119-02-04 (operator forgets to log rollback)** — N/A; no rollback occurred.

The `p=none` steady-state preserves the existing threat posture documented in Phase 111: monitoring-only DMARC, no spoofing protection beyond rua visibility. The amendment's "Spoofing observed" re-activation condition (#2) is the explicit escalation path if this posture becomes inadequate.

## Downstream Consumers

1. **`/gsd-complete-milestone`** — Phase 119 now reports complete in roadmap analysis (2/2 plans have summaries); v3.7 close is unblocked.
2. **Future operator (or Claude session) revisiting DMARC posture** — finds the structured re-activation conditions in `119-RUNBOOK.md` Section 6, reads SEED-003 checkpoint for empirical context, can decide whether to re-arm the routine without re-deriving the volume analysis.
3. **`trig_01RZLcj1jpxvDQAwnFmUG9d9` (if re-armed)** — instructions in routine still reference the original 3-condition gate; no changes needed to its job_config since the gate itself is correct, only its applicability at current scale was wrong.

## Self-Check: PASSED

- ✅ FOUND: `.planning/phases/119-dmarc-quarantine-ramp/119-RUNBOOK.md` Section 6 contains routine DEFERRED block + operator amendment + re-activation conditions (lines 167-252)
- ✅ FOUND: `.planning/seeds/SEED-003-checkpoint-2026-05-06.md` (routine's evaluation record, 131 lines)
- ✅ FOUND: commit `ddbf6fa` ("chore(seed-003): 2026-05-06 auto-eval — DEFERRED, re-eval 2026-05-20") on main
- ✅ FOUND: commit `b33a55a` ("docs(119): operator amendment — accept p=none as steady state") on main
- ✅ FOUND: this file (`119-02-SUMMARY.md`)
- ✅ DEFERRED-branch must_haves all addressed (truths #1, #4 met; #2, #3, #5 N/A by branch)
- ✅ ROADMAP SC #1 + #3 satisfied; SC #2 + #4 explicitly waived by amendment
- ✅ Cloudflare DNS unchanged (verified by absence of any DNS-touching command in commits `ddbf6fa` and `b33a55a`)
- ✅ Routine state preserved (queryable via `RemoteTrigger get trig_01RZLcj1jpxvDQAwnFmUG9d9`)
- ✅ SEED-003 still dormant in `.planning/seeds/` (not moved to sprouted/)
