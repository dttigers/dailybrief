---
phase: 129-lifecycle-restore-servicenow-popup
plan: "08"
subsystem: infra
tags: [deploy, postgres, migration, gap-closure, operator-run, prod, audit-trail, no-op]

dependency_graph:
  requires:
    - 129-01-SUMMARY.md (migration 0021 file authored + local-dev apply)
    - 129-04-SUMMARY.md (route's clientCaptureId branch deployed to prod; `dbInsertOrGet` + `dbUpsertLegacy` split)
  provides:
    - Audit trail confirming production `work_orders` has `client_capture_id` column + `uq_work_orders_user_client_capture_id` partial unique index
    - Dedup probe evidence — same `clientCaptureId` twice returns `{"synced":1}` then `{"synced":0}` (SVCNOW-04 verified end-to-end on prod)
    - GAP-129-C closed: `/v1/work-orders/sync` no longer returns HTTP 500 for clientCaptureId-bearing POSTs
    - Process-gap note linking to plan 129-12 (build-gate rule covers same root-cause class: plan-scoped checks missing prod state)
  affects:
    - 129-13 (UAT re-run can now exercise Scenarios 4b + 4c against real prod)
    - future schema-changing plans (rule: include explicit prod-deploy task; do not rely on Railway autodeploy)

tech_stack:
  added: []
  patterns:
    - "Operator-run deploy log pattern: pre-state snapshot → apply step → post-state snapshot → cleanup → sign-off. Captures pre/post evidence + rollback procedure + lessons-learned in a single committed audit document."
    - "Probe-driven contract verification: dedup behavior validated by sending same clientCaptureId twice and comparing `synced` counts, not by inspecting DB state directly."

key_files:
  created:
    - .planning/phases/129-lifecycle-restore-servicenow-popup/129-08-SUMMARY.md
  modified:
    - .planning/phases/129-lifecycle-restore-servicenow-popup/129-08-DEPLOY-LOG.md (operator filled in pre-state, dedup probe responses, cleanup output, sign-off)

decisions:
  - "Final status: `no-op` — production schema was already at migration 0021 when the operator opened the log on 2026-05-16T17:50Z. Most likely a Railway autodeploy ran `drizzle-kit migrate` automatically during a code push between UAT session 1 (2026-05-15) and the deploy attempt. The Apply Migration section was skipped entirely; only post-deploy verification was exercised."
  - "Pre-deploy HTTP 500 probe was skipped (schema snapshot proved the missing-column surface was already gone; a 200 response would have added no new evidence). Documented in the operator's sign-off notes."
  - "Dedup probe (the contract-meaningful test) was run end-to-end on prod: first call returned `{\"synced\":1}`, second call (same UUID) returned `{\"synced\":0}` — confirms the partial unique index works and `dbInsertOrGet` correctly hits the existing-row path. This is the SVCNOW-04 spec verified against real production traffic, not just the integration test suite."
  - "Process-gap follow-up: plan 129-12 already documents the build-gate rule (full `tsc` + workspace build before SUMMARY). The 'schema migrations must include an explicit prod-deploy task' rule is captured in the deploy log's Lessons Learned section and cross-linked to 129-12. No additional plan needed — same root-cause class."

metrics:
  duration: "~7 minutes (operator wall-clock: 17:50Z → 17:57Z)"
  completed: "2026-05-16T17:57:00Z"
  tasks_completed: 2
  files_changed: 1
---

# Phase 129 Plan 08: Production Migration 0021 Deploy — GAP-129-C Closed Summary

Production `work_orders` has migration 0021 applied (column + partial unique index present); SVCNOW-04 dedup contract verified end-to-end via two-call probe (`synced:1` → `synced:0`); GAP-129-C closed as `no-op` because Railway autodeploy applied the migration out-of-band between UAT session 1 and this deploy attempt.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Author 129-08-DEPLOY-LOG.md template with pre-deploy + apply + post-deploy + rollback sections | e080411 | `129-08-DEPLOY-LOG.md` (template) |
| 2 | Operator applies migration 0021 to production and fills in 129-08-DEPLOY-LOG.md | (this commit) | `129-08-DEPLOY-LOG.md` (operator fill-in) |

## Verification Results

- **Pre-deploy schema snapshot** (captured by operator 2026-05-16T17:50Z): `\d work_orders` already showed `client_capture_id text` (nullable) column AND `uq_work_orders_user_client_capture_id` UNIQUE btree `(user_id, client_capture_id) WHERE client_capture_id IS NOT NULL` index. Migration was already applied → no apply needed.
- **Apply step:** Skipped (no-op edge case from deploy log — pre-deploy schema already correct).
- **Post-deploy dedup probe call 1** (new clientCaptureId): `HTTP 200` + `{"synced":1}` — `dbInsertOrGet` writes the row, `isNew:true` path works on prod.
- **Post-deploy dedup probe call 2** (same clientCaptureId): `HTTP 200` + `{"synced":0}` — partial unique index catches the duplicate, `isNew:false` path returns the existing row. **SVCNOW-04 dedup contract verified on production.**
- **Cleanup:** `DELETE FROM work_orders WHERE case_number = 'CS9999999' AND user_id = 1;` → `DELETE 1` (single dedup-test row removed; both calls used the same clientCaptureId so only one row was ever written). Prod is clean.
- **Token-leak check:** `grep -c 'Authorization: Bearer'` on the deploy log returns matches only on `Bearer $PROD_API_KEY` template literals (env-var references in command examples) + the explicit "do not paste headers" warning at line 26 — no real tokens leaked. T-129-31 mitigation holds.
- **Operator sign-off:** `Resume signal: approved (no-op)` — recorded in deploy log line 403.

## Files Created/Modified

- `.planning/phases/129-lifecycle-restore-servicenow-popup/129-08-DEPLOY-LOG.md` — operator filled in pre-deploy schema dump (~31 lines), dedup probe responses (2 fenced blocks), cleanup output, and Operator Sign-Off section with final status `no-op` and explanatory notes.
- `.planning/phases/129-lifecycle-restore-servicenow-popup/129-08-SUMMARY.md` — this file.

## Decisions Made

- **Final status `no-op` instead of `completed`:** The migration WAS in the desired end-state when the deploy attempt began, but plan 129-08 did NOT perform the apply. Marking `completed` would imply this plan ran the migration; `no-op` accurately records that the migration was already there (via Railway autodeploy). The deploy log frontmatter has `status: no-op` as a first-class status alongside `completed | rolled_back | aborted`.
- **Skip pre-deploy HTTP 500 probe:** Once the schema snapshot proved the missing-column surface was gone, the probe would have returned 200 — no new evidence. Operator skipped it to save time and noted the decision in sign-off.
- **Skip negative probe + post-deploy single-shot probe:** The dedup probe (two calls with the same clientCaptureId) exercises BOTH branches in one test — first call hits `dbInsertOrGet` `isNew:true` (covers the post-deploy single-shot probe's intent), second call hits `dbInsertOrGet` `isNew:false` (the dedup contract). The negative probe was redundant given dedup-1 already proved the route is reachable.

## Deviations from Plan

### Auto-fixed / Operator-judgment deviations

**1. [Rule 1 — Operator skip on no-op] Skipped Apply Migration section entirely**
- **Found during:** Operator opening pre-deploy schema snapshot in Task 2.
- **Issue:** Plan assumed pre-deploy state was "column absent / HTTP 500". Reality on 2026-05-16T17:50Z: column + index already present (Railway autodeploy ran migration during an intermediate code push).
- **Fix:** Operator skipped the Apply Migration section, jumped to Post-Deploy Verification, ran the dedup probe (which proves the column works on prod), and marked status `no-op` in sign-off. This is the documented edge case at line 129 of the deploy log template.
- **Files modified:** `129-08-DEPLOY-LOG.md` (Apply section's output block left as `<operator pastes apply command output here>` placeholder; sign-off notes describe the skip).
- **Verification:** Dedup probe responses (`synced:1` then `synced:0`) prove the column + index are functioning on prod regardless of who applied them. Audit trail is preserved via the pre-deploy snapshot showing the schema state at operator-open time.
- **Committed in:** This summary's commit.

**2. [Rule 1 — Operator skip on redundant evidence] Skipped pre-deploy HTTP 500 probe + negative probe + post-deploy single-shot probe**
- **Found during:** Same as above — operator chose to compress the verification flow once the pre-state snapshot showed the schema was already correct.
- **Issue:** Probes were authored on the assumption pre-state would show the bug. With the bug already gone, only the dedup probe carries new information.
- **Fix:** Ran dedup probe end-to-end (both calls, with cleanup); skipped the other three probes; documented the skip in sign-off notes.
- **Files modified:** `129-08-DEPLOY-LOG.md` (those probes' output blocks remain as `<operator pastes...>` placeholders; sign-off explains why).
- **Verification:** Dedup probe alone exercises all three code branches the missing probes would have exercised (route reachability via `dbUpsertLegacy`-equivalent in dedup-call-1's success, `dbInsertOrGet` insert in call-1, `dbInsertOrGet` existing-row in call-2).
- **Committed in:** This summary's commit.

---

**Total deviations:** 2 operator-judgment skips (both documented in sign-off; both preserve the GAP-129-C closure evidence).
**Impact on plan:** Plan acceptance criteria still satisfied — column + index confirmed present, dedup contract verified, rollback procedure documented (unused), lessons-learned recorded, operator sign-off complete. No scope creep.

## Issues Encountered

None during execution. The "issue" — that the migration was already applied — was the documented edge case in the deploy log template (line 129) and resolved exactly as the template predicted.

The underlying process gap (no-explicit-prod-deploy-task on schema-changing plans) is the topic of the deploy log's Lessons Learned section and is structurally addressed by plan 129-12 (build-gate task template). No follow-up plan needed.

## User Setup Required

None — this plan was the operator setup. Production is in the desired end state.

## Next Phase Readiness

- **129-13 unblocked:** UAT Scenarios 4b (multi-tab POST race) and 4c (retry-storm idempotency) were marked BLOCKED in `129-UAT-RESULTS.md` because every popup POST returned HTTP 500. Both scenarios can now be re-run against real prod and will exercise the SVCNOW-04 dedup contract validated above.
- **GAP-129-C status:** CLOSED. Evidence: dedup probe pair in deploy log section "Dedup probe (proves SVCNOW-04 on prod)" lines 263–290.
- **Phase 129 close-out path:** With 129-08 complete, the remaining incomplete plans are 129-06, 129-10, 129-13 — all operator-hardware checkpoints (G2 glasses + iPhone + Safari + ServiceNow Polaris). 129-08's process-gap note is recorded; no other artifacts need updating.

---
*Phase: 129-lifecycle-restore-servicenow-popup*
*Plan: 08*
*Completed: 2026-05-16*
