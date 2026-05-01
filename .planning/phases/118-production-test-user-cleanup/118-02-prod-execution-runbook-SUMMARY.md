---
phase: 118-production-test-user-cleanup
plan: 02
subsystem: ops
tags: [railway, postgres, ops-tooling, runbook, production-cleanup, drizzle]

# Dependency graph
requires:
  - phase: 118-01-cleanup-script
    provides: idempotent vigil-core/scripts/cleanup-test-users.ts with --dry-run/--commit gate, D-03 pre-flight email assertion, single-tx delete order across 14 user-scoped tables
  - phase: 102-multi-user-foundation
    provides: users table + 14 user-scoped tables with FK onDelete:restrict (script must DELETE children-first)
provides:
  - Live Railway prod execution of the cleanup script (dry-run + commit) with verbatim stdout captured in 118-RUN-LOG.txt
  - 22 rows deleted across 14 tables (10 brief_pdfs + 10 briefs + 2 users); 12 other tables already 0
  - 118-RUNBOOK.md as the OPS-01 audit trail (invocation commands, before/after table, smoke-pass checklist, rollback notes, observations, cross-references)
  - Smoke-pass evidence proving SC#4 (no collateral damage to seed user jamesonmorrill1@gmail.com)
  - Corrected canonical invocation form for any future re-run from a developer laptop (railway run --service Postgres + DATABASE_PUBLIC_URL remap)
affects:
  - Phase 119 (DMARC quarantine ramp — final v3.7 closeout, runs after this phase)
  - Future ops phases needing the Railway-CLI-injection invocation pattern

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-artifact ops audit trail: machine-readable {phase}-RUN-LOG.txt (verbatim stdout) + human-readable {phase}-RUNBOOK.md (checklist+table+notes)"
    - "Postgres-service public URL remap for laptop-side ops scripts: railway run --service Postgres -- bash -c 'DATABASE_URL=\"$DATABASE_PUBLIC_URL\" ...' preserves D-01 (no DATABASE_URL on disk) while bypassing internal-only postgres.railway.internal"
    - "Inline sed redaction in tee'd pipelines as defense-in-depth against credential leak (T-118-02-03)"
    - "Inferred-exit-code annotation pattern when destructive operations cannot be silent-re-run (PIPESTATUS scoping bug workaround)"

key-files:
  created:
    - .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md
  modified:
    - .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt

key-decisions:
  - "Deviation Rule 3: corrected plan invocation from `railway run` (vigil-core service, internal-only DATABASE_URL) to `railway run --service Postgres + DATABASE_PUBLIC_URL remap` — D-01 invariant preserved, DNS resolution works from developer laptop"
  - "Inferred COMMIT EXIT CODE: 0 (Option A annotation): script's TRANSACTION COMMITTED banner only writes on success-path + all-zero AFTER SELECTs cross-validate; silent re-run rejected because pre-flight assertion would now fail post-cleanup"
  - "Documented Postgres password rotation as a follow-up todo (NOT part of Phase 118 deliverables) after `railway variables --service Postgres --kv` emitted plaintext into agent context — verified the credential never reached the run log; rotation is defense-in-depth"
  - "Smoke-pass methodology pinned in runbook: GET /v1/thoughts must use ?window=all&excludeDone=false to bypass the route's default-window filter and surface unambiguous total count (mid-verification false-alarm captured for posterity)"
  - "Row-count drift between dry-run (TOTAL=18) and commit (TOTAL=22) ~17 hours apart attributed to scheduled brief-generation job creating 2 additional briefs/brief_pdfs for test users overnight; D-03 email assertion re-ran identically at COMMIT and passed — not a defect"

patterns-established:
  - "Plan automated verification gates structured as 11 grep/test pairs covering section headings + reference cross-links + placeholder absence — green light for OPS-01 closeout"
  - "Runbook cross-reference block pointing to REQUIREMENTS.md/ROADMAP.md/CONTEXT.md/script/run-log forms the canonical audit-trail link cluster for future ops phases"

requirements-completed: [OPS-01]

# Metrics
duration: 25min
completed: 2026-05-01
---

# Phase 118 Plan 02: Production Cleanup Execution Runbook Summary

**Live execution of cleanup-test-users.ts against Railway prod (dry-run + human-issued --commit), 22 rows deleted across 14 tables, smoke-pass green for seed user, OPS-01 audit trail committed as 118-RUNBOOK.md + 118-RUN-LOG.txt.**

## Performance

- **Duration:** ~25 min wall-clock (Task 1 dry-run on 2026-04-30T23:03Z; Task 2 human-checkpoint resolved 2026-05-01; Task 3 runbook authored same day)
- **Started:** 2026-04-30T23:03:57Z (dry-run captured)
- **Completed:** 2026-05-01 (final commit timestamp; runbook + summary committed)
- **Tasks:** 3 (Task 1 auto, Task 2 checkpoint:human-action, Task 3 auto)
- **Files modified:** 2 (118-RUN-LOG.txt — annotated; 118-RUNBOOK.md — created)

## Accomplishments

- Cleanup script ran successfully against Railway prod via `railway run --service Postgres + DATABASE_PUBLIC_URL` remap — pre-flight email assertion (D-03) passed both at dry-run and at commit, ROLLBACK and COMMIT banners present, exit codes captured/inferred as 0.
- **22 rows deleted across 14 tables**: 10 brief_pdfs + 10 briefs + 2 users (ids 3 + 44). The 12 other user-scoped tables (thought_links, thoughts, projects, api_keys, chat_sessions, work_order_statuses, work_orders, oauth_tokens, app_settings, ai_cache, password_reset_tokens) showed 0 rows — test users had no other data.
- **Smoke-pass: PASS** — seed user (id=1, jamesonmorrill1@gmail.com) login + /v1/auth/me + /v1/thoughts (total=194, most-recent 2026-04-30T17:39Z) + PWA dashboard load all green; no collateral damage. User-1 row counts intact (`thoughts=607, briefs=21, brief_pdfs=15`).
- **All 4 phase success criteria evidenced**:
  - SC#1 (`SELECT * FROM users WHERE id IN (3, 44) → 0 rows`) ✅ — verified via psql post-commit + COMMIT EXIT CODE: 0 banner.
  - SC#2 (no orphaned child rows) ✅ — 13 per-table COUNT(*) entries in runbook's After column, all 0.
  - SC#3 (runbook committed under `.planning/phases/118-*/`) ✅ — 118-RUNBOOK.md + 118-RUN-LOG.txt both committed (commits `179f9b8` + `70bf9b2`).
  - SC#4 (no collateral damage — seed user works) ✅ — Smoke-Pass Checklist marked PASS in runbook.

## Task Commits

1. **Task 1: Run dry-run against Railway prod and capture output** — `d02234e` (chore) — first attempt via vigil-core service hit `getaddrinfo ENOTFOUND postgres.railway.internal`; corrected via Postgres service + DATABASE_PUBLIC_URL remap; pre-flight OK, ROLLBACK banner, exit 0 captured via silent re-run.
2. **Task 2: Human runs --commit against Railway prod** — `(no agent commit; user wrote to log directly via tee on 2026-05-01)` + `70bf9b2` (chore — annotated inferred COMMIT EXIT CODE: 0). User executed --commit after inspecting dry-run output; 22 rows deleted; SC#1, SC#2, SC#4 confirmed via BEFORE/AFTER psql + smoke-pass.
3. **Task 3: Write 118-RUNBOOK.md audit trail** — `179f9b8` (docs)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified

- `.planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md` — Created. OPS-01 audit trail. Sections: Invocation Commands (corrected canonical form documented), Before/After Row Counts (14 data rows + TOTAL: 22→0), Smoke-Pass Checklist (5 items, PASS), Rollback Notes (PITR-only, per CONTEXT.md), Observations (5 items: drift, deviation, PIPESTATUS bug, security finding, smoke detour), Cross-References.
- `.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt` — Modified. Added line 116-120 annotation inferring `COMMIT EXIT CODE: 0` from successful TRANSACTION COMMITTED banner + all-zero AFTER SELECTs; preserved verbatim stdout for both dry-run and commit invocations.

## Decisions Made

See `key-decisions` frontmatter (5 items). Highlights:

- **Plan invocation deviation (Rule 3 — Blocking):** Corrected `railway run` form from `vigil-core` service to `--service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" ...'`. The plan's documented form fails on a developer laptop because the vigil-core service exposes only the internal-only `postgres.railway.internal` hostname. D-01 invariant preserved (Railway CLI still injects credentials at invocation; nothing on disk).
- **Inferred-exit-code annotation (Option A approved by user):** Both invocations emitted empty `EXIT CODE:` lines due to bash PIPESTATUS scoping inside the tee'd pipeline. Dry-run: silent re-run captured `0`. Commit: silent re-run is unsafe post-cleanup, so exit code is **inferred as 0** from (a) `MODE: COMMIT — TRANSACTION COMMITTED (rows deleted)` banner (only emitted on success-path) and (b) all-zero AFTER verification SELECTs.
- **Postgres password rotation queued as follow-up:** `railway variables --service Postgres --kv` emitted plaintext into the agent context during URL discovery. Verified it did NOT reach `118-RUN-LOG.txt` (T-118-02-03 anti-leak grep clean), but rotation is recommended as defense-in-depth. Captured as runbook follow-up note (Observation #4); user should `/gsd-add-todo` to track.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan invocation form failed DNS on developer laptop**

- **Found during:** Task 1 (first dry-run attempt)
- **Issue:** `railway run npx tsx scripts/cleanup-test-users.ts --dry-run` (linked to vigil-core service per plan) failed with `getaddrinfo ENOTFOUND postgres.railway.internal` — vigil-core service's `DATABASE_URL` points at the internal-only Railway hostname which is only resolvable from inside Railway's private network.
- **Fix:** Re-invoked via `railway run --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx scripts/cleanup-test-users.ts --dry-run|--commit'`. The Postgres service exposes a parallel `DATABASE_PUBLIC_URL` via `hopper.proxy.rlwy.net` pointing at the same database (credential parity). Inline remap keeps the public URL in process.env only for the script's lifetime — D-01 (no DATABASE_URL on disk) preserved.
- **Files modified:** none (canonical form documented in 118-RUNBOOK.md "Invocation Commands" section + 118-RUN-LOG.txt deviation block)
- **Verification:** Pre-flight OK + ROLLBACK banner + exit 0 (re-confirmed via silent re-run); commit invocation succeeded with TRANSACTION COMMITTED banner + 22-row total
- **Committed in:** `d02234e` (Task 1, with deviation block in run log)

**2. [Rule 3 — Blocking] PIPESTATUS scoping silently dropped exit codes inside tee'd pipeline**

- **Found during:** Task 1 dry-run + Task 2 commit (same bug, both invocations)
- **Issue:** `cmd | tee -a log` under default bash exits with `tee`'s status, not `cmd`'s. Both `--- DRY-RUN/COMMIT EXIT CODE: ---` lines emitted empty.
- **Fix:** Dry-run resolved by silent re-run of identical invocation (`>/dev/null 2>&1; echo $?` → 0) and annotation. Commit cannot safely silent-re-run (target users now deleted; pre-flight assertion would fail) — annotated as **inferred 0** with cross-evidence from `TRANSACTION COMMITTED` banner + all-zero AFTER SELECTs.
- **Files modified:** `.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt` (line 82-85 dry-run annotation; lines 116-120 commit annotation)
- **Verification:** `grep -F "COMMIT EXIT CODE: 0" 118-RUN-LOG.txt` → match (Task 2 plan automated gate green)
- **Committed in:** `d02234e` (dry-run annotation) + `70bf9b2` (commit annotation)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — Blocking)
**Impact on plan:** Both deviations were necessary to satisfy the plan's own automated verification gates against the realities of the developer-laptop execution environment (Railway internal-only hostname + bash PIPESTATUS default semantics). No scope creep — outcomes match plan intent.

## Issues Encountered

- **Smoke-pass false alarm (Observation #5 in runbook):** First `/v1/thoughts` probe returned `count: 0` because the route's default-window filter masked the user's 194 thoughts. Re-probed with `?window=all&excludeDone=false` and the correct `data` response key — total=194 returned, no data loss. Worth noting because the route's default-window-filter behavior surprised us mid-verification; future smoke-passes should use the explicit query string for unambiguous attestation.
- **Incidental security finding (Observation #4 in runbook):** `railway variables --service Postgres --kv` printed the plaintext Postgres password to the agent's stdout during URL discovery. Verified absent from `118-RUN-LOG.txt` (T-118-02-03 grep clean). Recommend rotating the Railway Postgres password as defense-in-depth follow-up via `/gsd-add-todo`.

## User Setup Required

None at plan boundary. Operational follow-up (NOT a Phase 118 deliverable): rotate Railway Postgres password — see runbook Observation #4 for procedure (Railway dashboard → Postgres service → Settings → Reset password).

## Next Phase Readiness

- **Phase 119 (DMARC quarantine ramp)** is now unblocked from a sequencing perspective (118 → 119 closeout). Phase 119 itself is gated on the **2026-05-06 auto-eval routine** (≥7 days clean DMARC aggregate reports + ≥3 days verify-email production volume) — implementation can land any time, ramp action only fires after gate passes.
- **OPS-01 closed:** REQUIREMENTS.md OPS-01 already marked `[x]` (set during Plan 01 completion). Traceability table shows OPS-01 → Phase 118 → Complete.
- **v3.7 milestone progress:** 4/5 phases complete after this plan ships (115, 116, 116.1, 117, **118**). Only Phase 119 remains.
- **Audit trail durability:** Both artifacts (118-RUNBOOK.md + 118-RUN-LOG.txt) are git-committed, providing tamper-evident history (T-118-02-06 mitigation).

## Cross-References

- Requirement: REQUIREMENTS.md OPS-01 (status: Complete)
- Roadmap: ROADMAP.md "Phase 118: Production test-user cleanup"
- Decisions: 118-CONTEXT.md D-01 through D-05
- Script: vigil-core/scripts/cleanup-test-users.ts (Plan 01 deliverable)
- Plan 01 summary: 118-01-cleanup-script-SUMMARY.md
- Run log: 118-RUN-LOG.txt
- Runbook: 118-RUNBOOK.md

## Self-Check: PASSED

**Files exist:**
- `.planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md` — FOUND
- `.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt` — FOUND (annotated)

**Commits exist:**
- `d02234e` (Task 1: chore(118-02): capture dry-run output against Railway prod) — FOUND in `git log`
- `70bf9b2` (Task 2 annotation: chore(118-02): annotate inferred commit exit code in run log) — FOUND in `git log`
- `179f9b8` (Task 3: docs(118-02): write production cleanup runbook) — FOUND in `git log`

**Plan automated gates (all 11 PASS):**
- File exists ✓
- 6 section heading greps (Invocation Commands, Before/After Row Counts, Smoke-Pass Checklist, Rollback Notes, Observations, 118-RUN-LOG.txt cross-ref) ✓
- thought_links row with `0` after-count ✓
- users row with `2` before / `0` after ✓
- No `{N}` placeholder ✓
- No `{placeholder}` text ✓

**Run-log gates (all 4 PASS):**
- `COMMIT INVOCATION` present ✓
- `MODE: COMMIT — TRANSACTION COMMITTED` present ✓
- `COMMIT EXIT CODE: 0` present ✓
- T-118-02-03 anti-leak: no `postgresql://` substrings outside redacted form ✓

**Phase success criteria (all 4 evidenced):**
- SC#1 (zero rows for ids 3+44 in users) ✓ via runbook + COMMIT EXIT CODE banner
- SC#2 (zero rows in 13 child tables for ids 3+44) ✓ via runbook After column
- SC#3 (runbook committed under .planning/phases/118-*/) ✓ via commit `179f9b8`
- SC#4 (smoke-pass green; no collateral damage) ✓ via runbook Smoke-Pass Checklist marked PASS

---
*Phase: 118-production-test-user-cleanup*
*Completed: 2026-05-01*
