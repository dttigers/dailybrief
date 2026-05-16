---
phase: 129-lifecycle-restore-servicenow-popup
plan: 11
subsystem: docs
tags: [docs, terminology, gap-closure, g2-plugin, refactor, no-runtime-impact]

# Dependency graph
requires:
  - phase: 129-lifecycle-restore-servicenow-popup
    provides: 129-02 SUMMARY.md (D-AUTO-01 deviation: task.id vs task.caseNumber); 129-06 UAT-RESULTS (GAP-129-E root cause)
provides:
  - Updated 129-CONTEXT.md with <terminology_note> distinguishing G2 task (TASK_DETAIL → thoughts table) from ServiceNow work order (work_orders table + /v1/work-orders/sync)
  - Updated 129-RESEARCH.md with Probe 7 explicitly identifying G2 openTasks source = thoughts table; SVCNOW-side refs preserved
  - Updated 129-UAT-RUNBOOK.md Scenarios 1 + 1b language (WORK_ORDER_DETAIL → TASK_DETAIL); new pre-condition block before Scenario 1 explaining G2 task entities + DOUBLE_CLICK entry gesture
  - Renamed vigil-g2-plugin/src/screens/work-orders.ts → screens/tasks.ts (file now matches what it renders — thought-tasks, not ServiceNow work_orders)
affects: 130+ (future phases inherit clean terminology); future-129 GAP-followups (TASK_DETAIL restore, drift-banner fix, API-key entry UI restore)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Terminology preservation rule: 'work order' kept where it refers to the ServiceNow work_orders table; replaced where it refers to the G2 thought-task screen — applied surgically per occurrence, never global-replaced."
    - "File rename + stale-comment audit pattern: when renaming a file, audit other files for comments referencing the old name; update or remove."

key-files:
  created:
    - vigil-g2-plugin/src/screens/tasks.ts (rename of work-orders.ts; identical content)
  modified:
    - .planning/phases/129-lifecycle-restore-servicenow-popup/129-CONTEXT.md
    - .planning/phases/129-lifecycle-restore-servicenow-popup/129-RESEARCH.md
    - .planning/phases/129-lifecycle-restore-servicenow-popup/129-UAT-RUNBOOK.md
    - vigil-g2-plugin/src/navigation.ts (import path: ./screens/work-orders.ts → ./screens/tasks.ts)
    - vigil-g2-plugin/src/screens/companion.ts (stale comment fix)
    - .planning/phases/129-lifecycle-restore-servicenow-popup/deferred-items.md (logged pre-existing test failure)
  deleted:
    - vigil-g2-plugin/src/screens/work-orders.ts (renamed to tasks.ts; git tracks as rename with 100% similarity)

key-decisions:
  - "Preserve Screen.WORK_ORDERS enum identifier unchanged in navigation.ts — renaming the enum would touch drift tests, restoreScreenFn fallback logic, and the plan-129-09 DOUBLE_CLICK carve-out. The file rename only updates the import path; the enum value 'work-orders' remains the screen identifier."
  - "Preserve the file's internal content (display copy 'No work orders open. Capture one when it finds you.' and container names like 'wo-header'/'wo-footer'/'wo-list') unchanged. Plan said don't modify the file's content — only the file name."
  - "Add the comment update in companion.ts:58 (referenced the old file path) as Rule 2 (correctness — stale doc pointer would mislead future maintainers). Same atomic commit as the rename so revert is single-step."

patterns-established:
  - "Two-entity Phase 129 vocabulary: G2 task (TASK_DETAIL, sourced from thoughts table via /v1/brief openTasks) vs ServiceNow work order (work_orders table + /v1/work-orders/sync). Future phases must not blend these. Reference: 129-CONTEXT.md <terminology_note> and 129-RESEARCH.md Probe 7."
  - "DOUBLE_CLICK on WORK_ORDERS list = G2 entry gesture for TASK_DETAIL (per plan 129-09). Documented in 129-UAT-RUNBOOK.md pre-condition block."

requirements-completed: []

# Metrics
duration: 17 min
completed: 2026-05-16
---

# Phase 129 Plan 11: Terminology cleanup (work_orders vs openTasks) Summary

**Doc-only terminology pass + 1 surgical file rename: 129-CONTEXT/RESEARCH/UAT-RUNBOOK no longer conflate the G2 task screen with the ServiceNow work_orders table; `screens/work-orders.ts` → `screens/tasks.ts` makes the file name match its actual rendered content (thought-tasks).**

## Performance

- **Duration:** 17 min
- **Started:** 2026-05-16T17:08:00Z (approx)
- **Completed:** 2026-05-16T17:25:32Z
- **Tasks:** 4 of 4 (Task 4 executed because gate check passed — 1 import site, well below ≤5 threshold)
- **Files modified:** 6 (3 planning docs + 1 navigation.ts import path + 1 stale comment + 1 deferred-items.md log)
- **Files renamed:** 1 (work-orders.ts → tasks.ts, 100% git rename detection)

## Accomplishments

- Closed GAP-129-E: Phase 129 planning copy now correctly distinguishes G2 task (TASK_DETAIL screen, sourced from `thoughts` table via `/v1/brief` openTasks) from ServiceNow work order (`work_orders` table + `/v1/work-orders/sync` route).
- Added permanent `<terminology_note>` reference block at the top of 129-CONTEXT.md so future-phase planners don't re-introduce the conflation.
- Added Probe 7 to 129-RESEARCH.md explicitly documenting the G2 openTasks data source with audit-trail references to GAP-129-E and 129-02's D-AUTO-01 deviation.
- Rewrote Scenarios 1 + 1b in 129-UAT-RUNBOOK.md so the next operator UAT pass doesn't repeat the GAP-129-E confusion; added a pre-condition block that also surfaces the DOUBLE_CLICK entry gesture from plan 129-09.
- Renamed `vigil-g2-plugin/src/screens/work-orders.ts` → `screens/tasks.ts`. The file always rendered thought-tasks, not ServiceNow work orders; the name now matches reality.

## Task Commits

Each task was committed atomically:

1. **Task 1: Update 129-CONTEXT.md terminology + add terminology_note section** — `eb575df` (docs)
2. **Task 2: Update 129-RESEARCH.md terminology + add G2 openTasks source clarification (Probe 7)** — `469aa61` (docs)
3. **Task 3: Update 129-UAT-RUNBOOK.md Scenario 1 + 1b language + pre-condition block** — `6166ed2` (docs)
4. **Task 4: File rename — screens/work-orders.ts → screens/tasks.ts (+ companion.ts stale-comment fix)** — `2c9cfe4` (refactor)

## Files Created/Modified

### Planning docs
- `.planning/phases/129-lifecycle-restore-servicenow-popup/129-CONTEXT.md` — New `<terminology_note>` after frontmatter; D-07 heading dropped WORK_ORDER_DETAIL, body clarified WORK_ORDERS-list parenthetical; G2 operator scenario in `<specifics>` rewritten (WO #1234 → task id 1234, "WORK_ORDERS detail" → "TASK_DETAIL"); deferred-ideas G2 popup bullet updated.
- `.planning/phases/129-lifecycle-restore-servicenow-popup/129-RESEARCH.md` — New Probe 7 ("G2 openTasks data source — VERIFIED") above the renumbered Probe 6; D-07 line in user_constraints clarified with parenthetical; Q2 resolution corrected to use `task.id` not `task.caseNumber` (matches the thoughts-table source).
- `.planning/phases/129-lifecycle-restore-servicenow-popup/129-UAT-RUNBOOK.md` — New "Pre-condition for Scenarios 1, 1b, 2, 3" block before Scenario 1 (G2 task entities + DOUBLE_CLICK gesture); Scenarios 1, 1b, 3 language updated (WORK_ORDER_DETAIL → TASK_DETAIL, WO → task id, "work order" → "thought-task"); Scenarios 4/4b/4c/5/6 untouched.
- `.planning/phases/129-lifecycle-restore-servicenow-popup/deferred-items.md` — Created/appended entry for pre-existing TTL drift test failure surfaced during Task 4 validation.

### Source code
- `vigil-g2-plugin/src/screens/tasks.ts` — New file; content verbatim from old `work-orders.ts` (display copy + container names preserved per plan rule).
- `vigil-g2-plugin/src/screens/work-orders.ts` — Deleted (git tracks as rename to tasks.ts with 100% similarity).
- `vigil-g2-plugin/src/navigation.ts` — Single import path update at line 13: `./screens/work-orders.ts` → `./screens/tasks.ts`.
- `vigil-g2-plugin/src/screens/companion.ts` — Single comment update at line 58: `(work-orders.ts:14-20 precedent)` → `(tasks.ts:14-20 precedent — renamed from work-orders.ts in 129-11)`.

### Per-file occurrence audit (changed vs preserved)

**129-CONTEXT.md:**
- ✏️ Line 34 heading "Parameterized screen restore (WORK_ORDER_DETAIL, TASK_DETAIL, etc.)" → "Parameterized screen restore (TASK_DETAIL, etc.)" — G2-side identifier no longer in scope.
- ✏️ Line 35 D-07: "(e.g. WORK_ORDERS)" → "(e.g. WORK_ORDERS — the G2 list screen that displays thought-tasks from /v1/brief; see <terminology_note>)" — clarified, enum identifier kept.
- ✏️ Line 112 G2 operator scenario: full rewrite — "WORK_ORDERS detail screen for WO #1234" → "TASK_DETAIL screen for one of their thought-tasks (e.g., task id 1234, sourced from /v1/brief openTasks → thoughts table)".
- ✏️ Line 120 deferred ideas: "re-open WORK_ORDER_DETAIL" → "re-open TASK_DETAIL".
- ➕ New `<terminology_note>` section after frontmatter (full G2-task vs ServiceNow-work-order contrast).
- ✅ Preserved (SVCNOW-side): Line 13 (D-02 description with /v1/work-orders/sync), Line 27 (D-03 close on /v1/work-orders/sync), Line 42 (D-12 `client_capture_id` on `work_orders`), Line 75 (route reference), Line 93 (route POST body shape).

**129-RESEARCH.md:**
- ✏️ Line 19 user_constraints D-07: "(e.g. WORK_ORDERS)" → "(e.g. WORK_ORDERS — the G2 list screen that displays thought-tasks from /v1/brief openTasks; NOT the ServiceNow work_orders table — see Probe 7 below)".
- ✏️ Line 695 (Q2 Resolution): corrected `args: { id: task.caseNumber }` to `args: { id: task.id }` — openTasks come from thoughts table where `id` is the canonical key (not `caseNumber`, which is a property of the ServiceNow work_orders table).
- ➕ New Probe 7 inserted before existing Probe 6 ("G2 openTasks data source — VERIFIED") with audit-trail refs to GAP-129-E and D-AUTO-01.
- ✅ Preserved (SVCNOW-side, unchanged): every reference to `work_orders` table (Probe 5 schema discussion, migration SQL, schema.ts edit, etc.), `/v1/work-orders/sync` route mentions, the entire SVCNOW-04 dedup column discussion, the 0021 migration filename, the Pitfall 6 multi-user-stomp warning. Also preserved: test fixture strings `'work-orders'` in screen-state-restore.test.ts (those are the `Screen.WORK_ORDERS` enum value, NOT a copy reference).

**129-UAT-RUNBOOK.md:**
- ➕ New "Pre-condition for Scenarios 1, 1b, 2, 3" block (G2 task entities + DOUBLE_CLICK entry gesture) inserted before Scenario 1.
- ✏️ Scenario 1 prereq + steps + expected + pass/fail rule: "WORK_ORDER_DETAIL" → "TASK_DETAIL", "work order WO-XXXX" / "WO ID" → "task id N", "work order" → "thought-task".
- ✏️ Scenario 1b prereq + step 1 + fail rule: same pattern.
- ✏️ Scenario 3 prereq + fail rule: WORK_ORDER_DETAIL example replaced with TASK_DETAIL example.
- ✅ Preserved (SVCNOW-side, unchanged): Scenarios 4, 4b, 4c, 5, 6 in their entirety. Also preserved: the "PWA work-orders list" references in steps 9 / 11 / 8 / 22 (those refer to the PWA's work-orders dashboard page, which IS populated by the actual `work_orders` table — correct usage).

**vigil-g2-plugin/src/navigation.ts:**
- ✏️ Line 13: import path string changed; everything else (Screen enum, all screen handler code) untouched.
- ✅ Preserved: `Screen.WORK_ORDERS: 'work-orders'` enum identifier and value (per plan interfaces note — renaming the enum is out of scope; drift tests, fallback logic, and 129-09 carve-out all depend on the string `'work-orders'`).

**vigil-g2-plugin/src/screens/companion.ts:**
- ✏️ Line 58 comment: pointed at the renamed file path (Rule 2 correctness fix — stale comment in cross-referenced module).

## Decisions Made

- **Renamed instead of deferred:** Gate check confirmed only 1 import site (`navigation.ts:13`), well within the plan's ≤5 threshold. Build-gate (`npm run build`) returned exit 0 — clean tsc + vite build. Mechanical rename was safe; doing it now avoids creating a separate follow-up sub-plan.
- **Preserved Screen.WORK_ORDERS enum identifier unchanged:** Plan interfaces note pinned this. The enum value `'work-orders'` is referenced by drift tests, the `restoreScreenFn` fallback path, and the plan-129-09 DOUBLE_CLICK carve-out. Renaming it would be a separate, larger surgery.
- **Preserved file content verbatim:** Plan said "Plan does NOT modify any source code in `vigil-g2-plugin/src/screens/work-orders.ts` content itself". The container names (`wo-header`, `wo-footer`, `wo-list`) and the display string "No work orders open. Capture one when it finds you." remain unchanged in `tasks.ts`. Updating those is a separate cosmetic concern.
- **Inserted Probe 7 BEFORE the existing Probe 6 (Polaris title format):** Probe 6 is the empirically-unconfirmed item; Probe 7 is empirically-confirmed (via code inspection of `/v1/brief` and `screens/work-orders.ts`). Placing the verified item above the unverified one improves the reader's confidence flow. The Probe 6 heading was left intact (renumbering would have caused unnecessary downstream diff churn).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] Updated stale comment in `vigil-g2-plugin/src/screens/companion.ts:58`**
- **Found during:** Task 4 (post-rename audit with `grep -rn 'work-orders' src/`)
- **Issue:** companion.ts line 58 had a comment "Module-level state cache (work-orders.ts:14-20 precedent)" referencing the renamed file. After the rename, this comment pointed to a non-existent file path, which would mislead future maintainers.
- **Fix:** Updated the comment to `(tasks.ts:14-20 precedent — renamed from work-orders.ts in 129-11)` so future readers can still follow the historical reference while seeing the current canonical file.
- **Files modified:** vigil-g2-plugin/src/screens/companion.ts
- **Verification:** `cd vigil-g2-plugin && npm run build` returns exit 0; the comment fix is content-only and does not affect compilation.
- **Committed in:** `2c9cfe4` (Task 4 commit — bundled with the rename so a single revert removes both).

**2. [Rule 1 — Bug] Corrected `task.caseNumber` to `task.id` in 129-RESEARCH.md Q2 Resolution paragraph**
- **Found during:** Task 2 (RESEARCH.md audit for "work order" references)
- **Issue:** The Q2 Resolution paragraph (line 695) said "{ screen: Screen.TASK_DETAIL, args: { id: task.caseNumber }, savedAt: Date.now() }". But openTasks come from the `thoughts` table (per Probe 7); thought-tasks don't have a `caseNumber` property. The real implementation uses `task.id` (number, thought ID) — confirmed by 129-02 SUMMARY's D-AUTO-01 deviation note. The doc was prescribing a non-existent field.
- **Fix:** Changed the paragraph to use `task.id` with an explicit note that openTasks come from the thoughts table per Probe 7.
- **Files modified:** .planning/phases/129-lifecycle-restore-servicenow-popup/129-RESEARCH.md
- **Verification:** Re-read paragraph; consistent with Probe 7 statement and 129-02 SUMMARY's deviation note.
- **Committed in:** `469aa61` (Task 2 commit).

---

**Total deviations:** 2 auto-fixed (1 missing-critical staleness, 1 documentation bug)
**Impact on plan:** Both auto-fixes were directly downstream of the plan's own audit work — neither introduced scope creep. The companion.ts comment update kept the same atomic commit as the rename so revert remains single-step. The RESEARCH.md Q2 correction is the kind of doc bug the plan's audit pass was designed to catch.

## Issues Encountered

**Pre-existing test failure (out-of-scope, logged in deferred-items.md):**
The plan's Task 4 verify command (`npm run build`) returned exit 0. When the broader test suite ran (`npx tsx --test "src/**/*.test.ts"`) 111 of 112 tests passed; the one failure is a drift test in `vigil-g2-plugin/src/__tests__/main.test.ts:263` ("D-129 drift: TTL constant 30 * 60 * 1000 present in helpers"). This test asserts `launch-source-helpers.ts` contains `TTL_MS` or `30 * 60 * 1000`. Commit `ca91f60` (2026-05-16, pre-129-11; "fix(129-02): add missing navigateTo import + drop unused TTL_MS") correctly dropped that import — TTL logic lives in `pickRestoredScreen` inside `screen-state-restore.ts` instead. The drift test was not updated; the failure pre-dates Plan 129-11 by hours, on the same branch, and is independent of any change made by this plan. Logged to `deferred-items.md` with a suggested follow-up (update the drift test to reflect the new layout, or delete it as redundant with the direct TTL boundary tests in `screen-state-restore.test.ts`).

## User Setup Required

None — Plan 129-11 is a documentation + mechanical rename plan with no runtime impact, no new dependencies, no env vars, and no external service configuration.

## Next Phase Readiness

- Phase 129 planning artifacts now consistently distinguish G2 task entities from ServiceNow work orders. Future Phase 129 follow-ups (GAP-129-A, B, C, D, F, G, H) can build on cleaner terminology.
- The renamed `vigil-g2-plugin/src/screens/tasks.ts` provides a clean foundation for any future task-screen refactor (e.g., if a future phase renames `Screen.WORK_ORDERS` enum to `Screen.TASKS`, the file name will already match).
- Pre-existing TTL drift test failure (`main.test.ts:263`) tracked in `deferred-items.md` — a follow-up plan should align the drift test with the post-`ca91f60` code layout or delete it as redundant with the direct boundary tests in `screen-state-restore.test.ts`.

## Self-Check: PASSED

Verified after writing this SUMMARY:

- ✅ `.planning/phases/129-lifecycle-restore-servicenow-popup/129-CONTEXT.md` modified (commit eb575df present in git log).
- ✅ `.planning/phases/129-lifecycle-restore-servicenow-popup/129-RESEARCH.md` modified (commit 469aa61 present in git log).
- ✅ `.planning/phases/129-lifecycle-restore-servicenow-popup/129-UAT-RUNBOOK.md` modified (commit 6166ed2 present in git log).
- ✅ `vigil-g2-plugin/src/screens/tasks.ts` exists; `vigil-g2-plugin/src/screens/work-orders.ts` does NOT exist (commit 2c9cfe4, git rename 100% similarity).
- ✅ Plan verification command: `grep -c 'WORK_ORDER_DETAIL' 129-CONTEXT.md` returns 0, `0` from RESEARCH.md, `0` from UAT-RUNBOOK.md (all three at 0:0:0).
- ✅ Build-gate (Task 4): `cd vigil-g2-plugin && npm run build` → exit 0.

---
*Phase: 129-lifecycle-restore-servicenow-popup*
*Completed: 2026-05-16*
