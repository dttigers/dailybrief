---
phase: 53
plan: 01
subsystem: vigil-core/routes
tags: [backend, projects, thoughts, filter, fk]
requires:
  - phase 52 projects table + thoughts.project_id FK + idx_thoughts_project_id
provides:
  - GET /v1/thoughts?projectId=X filter
  - GET /v1/thoughts?unassigned=true filter
  - PUT /v1/thoughts/:id projectId body field with FK existence check
  - projectId field round-trips in every thought response
affects:
  - vigil-core/src/routes/thoughts.ts
  - vigil-core/scripts/smoke-test-53.sh (new)
tech-stack:
  added: []
  patterns:
    - drizzle isNull condition
    - strict-undefined whitelist gate (Pitfall P-1)
    - FK-existence pre-check before update (mirrors projects.ts)
key-files:
  created:
    - vigil-core/scripts/smoke-test-53.sh
  modified:
    - vigil-core/src/routes/thoughts.ts
decisions:
  - "Used PUT /thoughts/:id (existing route), NOT a new PATCH route — CONTEXT D-02 / UI-SPEC reference 'PATCH' but the server uses PUT (verified at thoughts.ts:219). Plan called this out via RESEARCH R-1; no UI-SPEC edit performed in this plan (deferred to UI plans in Wave 2)."
  - "No vitest infrastructure present in vigil-core. TDD-style unit tests skipped — smoke-test-53.sh is the integration test of record (consistent with phase 52-02 pattern)."
metrics:
  duration: ~12 min
  completed: 2026-04-08
tasks_completed: 3
tasks_total: 3
---

# Phase 53 Plan 01: Backend project filter + assignment Summary

PUT /v1/thoughts/:id now accepts a projectId field with FK existence check, GET /v1/thoughts gains projectId/unassigned filters, and every thought response round-trips projectId.

## What Shipped

### Task 1 — GET filter (commit 8aeb6c4)
Extended `vigil-core/src/routes/thoughts.ts` GET handler:
- Added `isNull` to the drizzle-orm import.
- Parsed `projectId` and `unassigned` query params.
- Validation: 400 `{error: "projectId and unassigned are mutually exclusive"}` when both are present; 400 `{error: "projectId must be a positive integer"}` for non-positive-integer values (rejects abc, -1, NaN, Infinity, floats).
- Pushed `eq(thoughtsTable.projectId, projectIdNum)` and `isNull(thoughtsTable.projectId)` into the existing dynamic-conditions array — ANDs cleanly with category/q/source/etc.

### Task 2 — PUT body whitelist + FK + toResponse (commit 79c4848)
Extended the same file:
- Added `projects as projectsTable` to the schema import.
- Extended `ThoughtApiResponse` with `projectId: number | null`.
- Extended `toResponse` mapper with `projectId: row.projectId ?? null`.
- In the PUT handler, after the existing existence check and category validation, added a strict `!== undefined` whitelist gate that accepts both `body.projectId` and `body.project_id`. `null` = explicit unassign; positive integer = assign (after a `SELECT id FROM projects WHERE id = $1 LIMIT 1` FK existence check that 400s with `{error: "project not found"}` on miss). Bad type → 400 `{error: "projectId must be a positive integer or null"}`.
- Added `if (projectIdUpdate !== undefined) updates.projectId = projectIdUpdate;` to the updates assembly.

### Task 3 — smoke-test-53.sh (commit 3896096)
Created `vigil-core/scripts/smoke-test-53.sh`, an executable bash script following the phase 52-02 model:
- Spins up a one-off `node dist/index.js` on PORT=3098 with `DATABASE_URL=$DATABASE_PUBLIC_URL`, traps SIGEXIT to clean up the PID.
- 9 assertions (53a–53i): create project, pick first thought, PUT projectId (valid FK), GET filter, PUT 999999 (FK miss → 400), PUT null (unassign), unassigned filter contains the row, mutex 400, abc 400. Cleanup step (53j) deletes the test project.
- Reads `VIGIL_API_BEARER_TOKEN` and `DATABASE_PUBLIC_URL` from env — no secrets in the file.
- `bash -n` parses cleanly; `test -x` passes; all four required string checks present.

## Acceptance Criteria

| Criterion | Status |
|---|---|
| `npm run build` exits 0 after Tasks 1 + 2 | PASS |
| Task 1: 5 grep assertions | PASS (isNull import 2, mutex msg 2, positive integer 1, isNull cond 1, eq cond 1) |
| Task 2: 8 grep assertions | PASS (projectsTable import 1, "project not found" 1, "positive integer or null" 1, mapper 1, updates line 1, response field 1, no thoughts.patch 0, build clean) |
| Task 3: script exists, executable, syntax valid, 10 echo blocks, 3 string checks | PASS |
| No regression on existing GET params | PASS — only additive changes |
| No new PATCH route added | PASS (`grep -c "thoughts.patch" thoughts.ts` = 0) |

## Deviations from Plan

### [Rule 3 - Blocking] Skipped TDD red/green/refactor — no test framework in vigil-core
- **Found during:** Task 1 setup
- **Issue:** Plan tasks marked `tdd="true"` but `vigil-core/package.json` has no vitest/jest/mocha — only `npm run smoke-test` (an end-to-end script). Adding a test framework would be a Rule 4 architectural change.
- **Fix:** Treated `smoke-test-53.sh` (Task 3) as the integration test of record, consistent with how phase 52-02 verified its work. Build (`tsc --noEmit`) plus the grep assertions in `<acceptance_criteria>` substitute for unit-level RED/GREEN.
- **Files modified:** none beyond plan scope
- **Commit:** documented here (no separate test-infra commit)

### [Procedural] Smoke test not executed against live DB from this worktree
- **Reason:** Running the script requires `VIGIL_API_BEARER_TOKEN` and `DATABASE_PUBLIC_URL` exported in the env, plus a free PORT=3098, neither of which are guaranteed inside the parallel-agent worktree shell. Phase 52-02 followed the same pattern (script committed, executor noted "run from a normal shell").
- **Verification done instead:** `npm run build` (clean), `bash -n` (clean), `test -x` (pass), all grep acceptance criteria (pass).
- **Follow-up:** Operator must export the two env vars and run `./vigil-core/scripts/smoke-test-53.sh` from a normal shell before merging Wave 2 plans against the live API. Railway auto-deploy verification is also a post-merge step.

### [Plan-vs-reality] CONTEXT D-02 / UI-SPEC reference "PATCH /thoughts/:id"
- **Found during:** Task 2 — already pre-flagged in the plan via RESEARCH R-1.
- **Resolution:** Used the existing PUT route as instructed. No PATCH handler added. UI-SPEC alignment edit is explicitly deferred to a Wave 2 UI plan.

## Files Touched

| File | Change | Lines |
|---|---|---|
| `vigil-core/src/routes/thoughts.ts` | added isNull import, projectsTable import, query param parsing/validation, conditions, ThoughtApiResponse field, toResponse field, PUT body whitelist + FK check + updates line | +65 / -2 |
| `vigil-core/scripts/smoke-test-53.sh` | new — 9-assertion smoke test | +69 |

## Commits

| Hash | Message |
|---|---|
| 8aeb6c4 | feat(53-01): GET /thoughts supports projectId and unassigned filters |
| 79c4848 | feat(53-01): PUT /thoughts/:id accepts projectId with FK check |
| 3896096 | test(53-01): smoke-test-53.sh covers GET filter + PUT projectId |

## Open Items For Operator

1. Export `VIGIL_API_BEARER_TOKEN` and `DATABASE_PUBLIC_URL`, run `./vigil-core/scripts/smoke-test-53.sh`, capture output, paste into this summary under a new "Smoke test run" section before declaring the phase done.
2. After merge to main, monitor Railway auto-deploy and re-run the same assertions against `https://vigil-core-production.up.railway.app/v1` (the script's `BASE` const can be temporarily overridden).

## Self-Check: PASSED

- `vigil-core/src/routes/thoughts.ts` exists — FOUND
- `vigil-core/scripts/smoke-test-53.sh` exists and executable — FOUND
- Commit 8aeb6c4 — FOUND
- Commit 79c4848 — FOUND
- Commit 3896096 — FOUND
- `npm run build` — clean
- All grep acceptance criteria — pass
