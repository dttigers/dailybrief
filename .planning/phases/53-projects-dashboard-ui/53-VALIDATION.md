---
phase: 53
slug: projects-dashboard-ui
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-08
---

# Phase 53 — Validation Strategy

Populated from RESEARCH.md § Validation Architecture. Phase 53 has no formal test framework; the convention is `npm run build` + `swift build` + curl smoke tests + human click-through (per Phases 29–52 precedent).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — curl smoke tests + tsc/swift compile gates + human click verification |
| **Config file** | none |
| **Quick run command** | `cd vigil-core && npm run build` (Wave 1 tasks) and `swift build` (Wave 2-4 tasks) |
| **Full suite command** | `bash vigil-core/scripts/smoke-test-53.sh` against a one-off `PORT=3098 DATABASE_URL="$DATABASE_PUBLIC_URL" node dist/index.js` instance, then `swift build` |
| **Estimated runtime** | ~30s for `npm run build`; ~60s for smoke-test-53.sh; ~45s for `swift build` |

---

## Sampling Rate

- **After every task commit:** `npm run build` (Wave 1) OR `swift build` (Wave 2-4) — whichever is relevant to the files touched
- **After every plan wave:** Wave 1 → full `smoke-test-53.sh` run. Waves 2-4 → `swift build` + any grep acceptance criteria.
- **Before `/gsd-verify-work`:** all plans green + 53-03 and 53-04 human-verify checkpoints returned "approved"
- **Max feedback latency:** < 2 minutes per task (build + grep)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 53-01-T1 | 01 | 1 | PROJ-02 | T-53-01, T-53-07 | GET query param validation; reject non-positive int; mutex with unassigned | smoke + build | `cd vigil-core && npm run build && grep -c 'isNull(thoughtsTable.projectId)' vigil-core/src/routes/thoughts.ts` | ✓ | ⬜ pending |
| 53-01-T2 | 01 | 1 | PROJ-03, PROJ-04 | T-53-02, T-53-03 | PUT body whitelist + FK existence check; toResponse round-trip | smoke + build | `cd vigil-core && npm run build && grep -c 'project not found' vigil-core/src/routes/thoughts.ts` | ✓ | ⬜ pending |
| 53-01-T3 | 01 | 1 | PROJ-02/03/04 | T-53-01..07 | End-to-end API smoke | smoke | `bash vigil-core/scripts/smoke-test-53.sh` | ❌ Wave 0 (script created in this task) | ⬜ pending |
| 53-02-T1 | 02 | 2 | PROJ-02/03/04/05 | T-53-10 | TLS + bearer reuse via patch helper | build | `swift build && grep -c "public func patch" Sources/JarvisCore/Services/VigilAPIClient.swift` | ✓ | ⬜ pending |
| 53-02-T2 | 02 | 2 | PROJ-03, PROJ-04 | T-53-11 | Dedicated AssignProjectBody; UpdateThoughtBody unchanged | build + manual grep | `swift build && grep -c "AssignProjectBody" Sources/JarvisCore/Storage/APIThoughtStore.swift` | ✓ | ⬜ pending |
| 53-02-T3 | 02 | 2 | — | — | AppDelegate DI | build | `swift build && grep -c "ProjectsAPIStore" Sources/DailyBriefMonitor/AppDelegate.swift` | ✓ | ⬜ pending |
| 53-03-T1 | 03 | 3 | PROJ-02, PROJ-05 | T-53-21 | Exhaustive switch on CategoryFilter | build | `swift build && grep -c "case project(id: Int64)" Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` | ✓ | ⬜ pending |
| 53-03-T2 | 03 | 3 | PROJ-02, PROJ-05 | T-53-20 | Delete Alert with UI-SPEC copy | build + copy grep | `swift build && grep -c \"They won't be deleted\" Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` | ✓ | ⬜ pending |
| 53-03-T3 | 03 | 3 | PROJ-02, PROJ-05 | — | Human verification of sidebar + delete flow | manual | manual click-through per task instructions | manual | ⬜ pending |
| 53-04-T1 | 04 | 4 | PROJ-03 | T-53-30, T-53-31 | NewProjectSheet validation + copy | build + copy grep | `swift build && grep -c '"Name is required"' Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift` | ✓ | ⬜ pending |
| 53-04-T2 | 04 | 4 | PROJ-03, PROJ-04 | T-53-32, T-53-37 | Nested Project menu + optimistic assign + revert | build + grep | `swift build && grep -c "assignThoughtToProject" Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` | ✓ | ⬜ pending |
| 53-04-T3 | 04 | 4 | PROJ-03, PROJ-04 | — | Human verification of assign/move/unassign/create-and-assign/optimistic revert | manual | manual click-through per task instructions | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/scripts/smoke-test-53.sh` — created in Plan 53-01 Task 3. No pre-Wave work required beyond reading the template from Phase 52-02 SUMMARY.
- [ ] `VIGIL_API_BEARER_TOKEN` and `DATABASE_PUBLIC_URL` env vars available at smoke-test time (sourced from `~/.config/dailybrief/config.json` and Railway dashboard).
- [ ] No test framework installation needed — the project convention is intentional (RESEARCH.md Wave 0 Gaps).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Projects sidebar Section renders between Tags and Brief History with correct row rhythm | PROJ-02 | SwiftUI layout — no headless test framework in project | Plan 53-03 Task 3 steps 5-6 |
| Status filter Picker hides/shows project rows per segment | PROJ-05 | SwiftUI rendering | Plan 53-03 Task 3 step 6 |
| Project row shows correct SF Symbol + color per UI-SPEC Status Color Mapping | PROJ-05 | Visual | Plan 53-03 Task 3 step 5 |
| Delete Alert copy matches UI-SPEC verbatim | PROJ-05 | Native Alert rendering | Plan 53-03 Task 3 step 10 |
| Project empty state appears when selected project has zero thoughts | PROJ-02 | Visual | Plan 53-03 Task 3 step 7 |
| NewProjectSheet create + edit modes render and validate correctly | PROJ-03 | Visual + interaction | Plan 53-04 Task 3 steps 2-4, 10 |
| Nested Menu("Project") expands on hover in ThoughtRowView.contextMenu | PROJ-03 | Pitfall P-2 — new pattern, no automated verify | Plan 53-04 Task 3 step 5 |
| Optimistic assign reverts and shows assignmentError banner on simulated failure | PROJ-03, PROJ-04 | Requires fault injection + visual | Plan 53-04 Task 3 step 11 |
| Create-and-assign single-shot flow from row menu | PROJ-03 | Multi-step interaction | Plan 53-04 Task 3 step 9 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (build + grep) OR explicit manual checkpoint with detailed steps
- [x] Sampling continuity: no 3 consecutive tasks without build verify (every code task has `swift build` or `npm run build`)
- [x] Wave 0 covers all MISSING references (smoke-test-53.sh is created inside Plan 53-01 Task 3 with explicit bash -n parse check, so it's self-bootstrapping)
- [x] No watch-mode flags
- [x] Feedback latency reasonable (< 2 min per task)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
