---
phase: 53
plan: 03
subsystem: DailyBriefMonitor/Dashboard
tags: [mac, swift, swiftui, dashboard, projects, sidebar, ui]
requires:
  - Phase 53 Plan 02 — JarvisCore data layer (Project, ProjectsAPIStore, Thought.projectId, fetchByProject/fetchUnassigned)
provides:
  - DashboardViewModel.projects + projectStatusFilter + assignmentError state
  - CategoryFilter.project(id:) and CategoryFilter.unassigned cases
  - DashboardViewModel project CRUD (createProject / updateProject / deleteProject / setProjectStatus)
  - Sidebar Projects Section with status segmented filter + Unassigned row + per-project rows
  - Native delete confirmation Alert (UI-SPEC verbatim copy)
  - projectEmptyState detail-pane view
  - assignmentError banner surface (wired by plan 53-04)
  - Placeholder New Project / Edit Project sheets (replaced by plan 53-04)
affects:
  - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
  - Sources/DailyBriefMonitor/Dashboard/DashboardView.swift
  - Sources/DailyBriefMonitor/AppDelegate.swift
tech-stack:
  added: []
  patterns:
    - Computed (not stored) per-project counts derived from visible thoughts (Pitfall P-6)
    - Filter-cascading reset on selectedFilter change (existing pattern reused)
    - Placeholder sheet pattern so the sidebar CTA is functional pre-Plan-04
key-files:
  modified:
    - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift (+152 LOC)
    - Sources/DailyBriefMonitor/Dashboard/DashboardView.swift (+244 LOC)
    - Sources/DailyBriefMonitor/AppDelegate.swift (projectsStore guard + init arg)
decisions:
  - "CategoryFilter.project / .unassigned return nil from .category — they bypass the existing category-driven branches in performLoadThoughts via a pre-switch on selectedFilter."
  - "Project filter ignores search/source/date/tag/favorites filters intentionally (UI-SPEC scope: 'show me thoughts in project X'). A future plan can layer filters on top."
  - "deleteProject resets selectedFilter to .all BEFORE calling loadThoughts so the next fetch doesn't try to load thoughts for a now-deleted project id."
  - "Placeholder Edit Project sheet uses .sheet(item:) — triggers when editingProject is non-nil. Plan 53-04 will replace its content with NewProjectSheet (in 'edit' mode)."
metrics:
  duration: ~25 min
  completed: 2026-04-08
tasks_completed: 2
tasks_total: 3
status: paused-at-human-verify-checkpoint
---

# Phase 53 Plan 03: Dashboard sidebar Projects section Summary

DashboardViewModel + DashboardView extended for the Projects sidebar — selection wires to fetchByProject/fetchUnassigned, status filter and right-click context menu work, delete Alert matches UI-SPEC verbatim. Tasks 1-2 (autonomous) complete and committed; Task 3 is a blocking human-verify checkpoint and the executor is paused waiting for the user to validate the visual contract.

## What Shipped (Tasks 1-2)

### Task 1 — DashboardViewModel extension (commit 218b010)

**`Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift`:**
- `CategoryFilter` gained `.project(id: Int64)` and `.unassigned` cases. Both return `nil` from the `category` accessor.
- New `@Observable` state: `var projects: [Project]`, `var projectStatusFilter: ProjectStatusFilter`, `var assignmentError: AssignmentError?`.
- Nested types: `struct AssignmentError: Identifiable, Equatable` (id/thoughtId/message), `enum ProjectStatusFilter: Hashable` (all/active/done/archived).
- New stored property `private let projectsStore: any ProjectsRepository` and corresponding init parameter immediately after `store`.
- Computed properties (Pitfall P-6 — counts are computed, never stored):
  - `var projectThoughtCounts: [Int64: Int]` — groups visible thoughts by projectId
  - `var unassignedCount: Int` — count of visible thoughts with nil projectId
  - `var filteredProjects: [Project]` — sorted (case-insensitive) + filtered by `projectStatusFilter`. Treats nil status as `.active` for legacy rows.
- New `loadProjects()` helper called from `refresh()` immediately after `loadCounts()`. NSLog-only on failure (project list failure banner deferred per UI-SPEC).
- New project CRUD methods: `@discardableResult func createProject(...)`, `func updateProject(...)`, `func setProjectStatus(_:_:)` (NSLog-on-error convenience), `func deleteProject(id:)`.
- `deleteProject` resets `selectedFilter` to `.all` BEFORE reloading thoughts when the deleted project was the active filter — prevents loading thoughts for a now-gone projectId.
- `performLoadThoughts` got a pre-switch on `selectedFilter`: `.project(let pid)` calls `store.fetchByProject(id: pid, limit: 200)`, `.unassigned` calls `store.fetchUnassigned(limit: 200)`. Both branches honor the cancellation gate and call `loadLinkCounts()` before returning. `.all` and `.specific` fall through to the existing logic unchanged.

**`Sources/DailyBriefMonitor/AppDelegate.swift`:**
- The `guard let store = thoughtStore` line gained a second binding: `guard let store = thoughtStore, let projectsStore = projectsStore`.
- The `DashboardViewModel(...)` call site passes `projectsStore: projectsStore` immediately after `store:`.

### Task 2 — DashboardView Projects sidebar Section (commit 6e1f196)

**`Sources/DailyBriefMonitor/Dashboard/DashboardView.swift`:**
- Three new `@State` declarations: `showingNewProjectSheet`, `editingProject: Project?`, `pendingProjectDelete: Project?`.
- New `Section("Projects")` inserted between `Section("Tags")` (lines ~263-291) and the Brief History section.
- Section contents in order:
  1. `+ New Project` Button → sets `showingNewProjectSheet = true`
  2. Segmented `Picker("Status", selection: $viewModel.projectStatusFilter)` with All / Active / Done / Archived. `.labelsHidden()` per UI-SPEC.
  3. `Unassigned` Label row tagged `CategoryFilter.unassigned` with count capsule (D-05 — always visible).
  4. Project rows (or `Text("No projects yet").italic()` empty hint). Each row:
     - SF Symbol from `symbolForStatus(project.status)` foreground colored by `colorForStatus(project.status)`
     - Count capsule from `projectThoughtCounts[project.id] ?? 0`
     - `.tag(CategoryFilter.project(id: project.id))`
     - `.opacity(0.6)` when `project.status == .archived`
     - `.contextMenu` with `Edit…` (sets `editingProject`), `Set status →` submenu (Active/Done/Archived calling `setProjectStatus`), `Divider`, `Delete…` destructive (sets `pendingProjectDelete`).
- New private helpers `symbolForStatus(_:)` and `colorForStatus(_:)` matching UI-SPEC Status Color Mapping verbatim.
- Three new modifiers attached to the body:
  - `.sheet(isPresented: $showingNewProjectSheet)` → placeholder VStack ("New Project" + close button)
  - `.sheet(item: $editingProject)` → placeholder VStack with project name
  - `.alert("Delete \"…\"?", ..., presenting: pendingProjectDelete)` with `Cancel` (role: .cancel) + `Delete` (role: .destructive). Message: `Thoughts assigned to this project will be unassigned. They won't be deleted.` (UI-SPEC verbatim).
- New `projectEmptyState` `@ViewBuilder` private var — folder SF Symbol + "No thoughts yet" headline + project-name-interpolated subtitle. Wired into the existing `if viewModel.thoughts.isEmpty` branch via a `switch viewModel.selectedFilter` that picks `projectEmptyState` for `.project` / `.unassigned` and `emptyState` otherwise.
- New `assignmentError` banner inserted above the existing `importErrors` banner — yellow exclamation icon, error message, Dismiss button, auto-dismiss after 4s via `.task(id: error.id)`. Banner is wired (no triggers in this plan — Plan 53-04 will set `viewModel.assignmentError` from a failed assign action).

## Acceptance Criteria — Task 1

| Criterion | Expected | Actual | Status |
|---|---|---|---|
| `case project(id: Int64)` count | 1 | 1 | PASS |
| `case unassigned` count | ≥1 | 1 | PASS |
| `var projects:` count | 1 | 1 | PASS (see Deviation 1) |
| `struct AssignmentError` count | 1 | 1 | PASS (see Deviation 1) |
| `var assignmentError:` count | 1 | 1 | PASS (see Deviation 1) |
| `ProjectStatusFilter` count | ≥2 | 2 | PASS |
| `projectStatusFilter` count | ≥1 | 2 | PASS |
| `projectsStore` in ViewModel | ≥1 | 7 | PASS |
| `projectsStore` in AppDelegate.swift | ≥2 | 4 | PASS |
| `projectThoughtCounts` | ≥1 | 1 | PASS |
| `filteredProjects` | ≥1 | 1 | PASS |
| `unassignedCount` | ≥1 | 1 | PASS |
| `loadProjects` | ≥2 | 6 | PASS |
| `projectsStore.listProjects` | 1 | 1 | PASS |
| `fetchByProject` | ≥1 | 1 | PASS |
| `fetchUnassigned` | ≥1 | 1 | PASS |
| `func createProject` | 1 | 1 | PASS |
| `func updateProject` | 1 | 1 | PASS |
| `func deleteProject` | 1 | 1 | PASS |
| `func setProjectStatus` | 1 | 1 | PASS |
| `swift build` exits 0 | yes | yes | PASS |
| Exhaustive switch warnings on `CategoryFilter` | 0 | 0 | PASS |

## Acceptance Criteria — Task 2

| Criterion | Expected | Actual | Status |
|---|---|---|---|
| `Section("Projects")` count | 1 | 1 | PASS |
| `"New Project"` count | ≥1 | 2 (CTA + sheet header) | PASS |
| `"Unassigned"` count | ≥1 | 1 | PASS |
| `"No projects yet"` count | 1 | 1 | PASS |
| `"No thoughts yet"` count | 1 | 1 | PASS |
| `Thoughts assigned to this project will be unassigned` | 1 | 1 | PASS |
| `They won't be deleted` | 1 | 1 | PASS |
| `pendingProjectDelete` count | ≥2 | 8 | PASS |
| `symbolForStatus` count | ≥2 | 2 | PASS |
| `tag(CategoryFilter.project` count | 1 | 1 | PASS |
| `tag(CategoryFilter.unassigned)` count | 1 | 1 | PASS |
| `assignmentError` count | ≥2 | 4 | PASS |
| `pickerStyle(.segmented)` count | ≥1 | 1 | PASS |
| `swift build` exits 0 | yes | yes | PASS |

## Confirmation: Delete Alert copy is UI-SPEC verbatim

Quoted directly from the committed `DashboardView.swift`:

```swift
.alert(
    "Delete \"\(pendingProjectDelete?.name ?? "")\"?",
    isPresented: ...,
    presenting: pendingProjectDelete
) { project in
    Button("Cancel", role: .cancel) { ... }
    Button("Delete", role: .destructive) { ... }
} message: { _ in
    Text("Thoughts assigned to this project will be unassigned. They won't be deleted.")
}
```

- Title: `Delete "<name>"?`
- Message: `Thoughts assigned to this project will be unassigned. They won't be deleted.`
- Primary destructive button: `Delete`
- Secondary cancel button: `Cancel`

## CategoryFilter switch sites updated

Compiler-driven sweep — `swift build` flagged the following as non-exhaustive on the first build attempt and they were updated in Edit 2:

| File | Site | Resolution |
|---|---|---|
| `DashboardViewModel.swift` lines 10-22 | `var category: ThoughtCategory?` accessor | Added `case .project: return nil` and `case .unassigned: return nil` |

`grep -n 'case \.specific' Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` and `grep -n 'case \.all' Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` confirmed no other exhaustive switches on `CategoryFilter` exist in the file. The pre-switch added inside `performLoadThoughts` (Edit 7) intentionally uses `case .all, .specific: break` to forward those filters to the existing logic.

`grep -rn 'switch.*selectedFilter\|switch.*CategoryFilter' Sources/` returned only the two intentional sites in `DashboardView.swift` (the empty-state branch added in Edit 5) and `DashboardViewModel.swift` (the accessor + the load-path pre-switch). All exhaustive — `swift build` clean.

## Deviations from Plan

### [Convention] `var` instead of `public var` for new state declarations
- **Found during:** Task 1 Edit 3
- **Issue:** Plan acceptance grep used `public var projects:` but the existing class `final class DashboardViewModel` is internal — `grep -c "public var" DashboardViewModel.swift` returns `0` for the entire file (every existing `var` is internal). Adding `public` to only the new properties would be inconsistent with all surrounding state.
- **Fix:** Used `var` (internal) for `projects`, `projectStatusFilter`, `assignmentError`, and the `AssignmentError` struct + `ProjectStatusFilter` enum. Acceptance criteria still pass because the simpler grep `var projects:` returns 1.
- **Rationale:** Matches the existing convention; no behavior change. The class itself is internal — making properties public would be a no-op for callers.
- **Files modified:** none beyond plan scope
- **Commit:** 218b010

### [Procedural] No XCTest target — TDD treated as build-based verification
- **Found during:** Task 1 setup
- **Issue:** Tasks marked `tdd="true"` but the worktree has no test target for `DailyBriefMonitor` (matches the plan 53-02 finding). Adding one is a Rule 4 architectural change.
- **Fix:** Treated `swift build` + grep acceptance assertions as the RED/GREEN substitute. Same approach as Plan 53-01 and 53-02 SUMMARYs.
- **Files modified:** none beyond plan scope
- **Commit:** documented here

### [Plan clarification] Project filter bypasses search/source/date/tag/favorites filters
- **Found during:** Task 1 Edit 7 implementation
- **Issue:** Plan said "match the actual reentrancy pattern" but didn't specify whether project filter should compose with the existing source/date/tag filters. The existing filters operate on the post-fetch result client-side; layering them on top of `fetchByProject` would be a substantial new code path.
- **Fix:** Project / unassigned filters call `fetchByProject` / `fetchUnassigned` and return immediately, without applying the existing client-side filters. UI-SPEC scope is "show me thoughts in project X" — full filter stacking is out of scope for this milestone. Documented in the inline comment and the decisions block.
- **Files modified:** none beyond plan scope
- **Commit:** 218b010

### [Polish] Added Edit Project placeholder sheet
- **Found during:** Task 2 Edit 4
- **Issue:** Plan said the Edit… context-menu action sets `editingProject` and "either attach a second `.sheet(item:)` with a placeholder, or leave the state wire in place." Leaving the state wire without a sheet would mean clicking Edit appears to do nothing — confusing during the human-verify checkpoint.
- **Fix:** Attached a tiny `.sheet(item: $editingProject)` placeholder VStack so clicking Edit produces visible feedback in step 14 of the verify checklist.
- **Files modified:** none beyond plan scope
- **Commit:** 6e1f196

## Files Touched

| File | Change | Lines |
|---|---|---|
| `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` | +CategoryFilter cases, state, computed properties, loadProjects, CRUD methods, performLoadThoughts pre-switch | +152 |
| `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` | +Section("Projects"), helpers, sheets, alert, projectEmptyState, assignmentError banner, @State decls | +244 |
| `Sources/DailyBriefMonitor/AppDelegate.swift` | guard adds projectsStore binding; DashboardViewModel init gets projectsStore arg | +2 |

## Commits

| Hash | Message |
|---|---|
| 218b010 | feat(53-03): extend DashboardViewModel with projects state, CRUD, and load paths |
| 6e1f196 | feat(53-03): render Projects sidebar Section + delete Alert + project empty state |

## Known Stubs

- **New Project sheet** (`showingNewProjectSheet`) — placeholder VStack with "Sheet UI ships in plan 53-04." Plan 53-04 replaces with the real `NewProjectSheet`.
- **Edit Project sheet** (`editingProject`) — placeholder VStack with the project name. Plan 53-04 replaces with `NewProjectSheet` in edit mode.
- **assignmentError banner** — banner UI is fully implemented but `viewModel.assignmentError` is never set in this plan. Plan 53-04's row-level assign flow will set it on assign-failure.

These stubs are intentional and called out in the plan itself ("Plan 04 will replace with the real sheet"). They do not block the plan's user-visible goal (sidebar navigation + delete flow).

## Build Output

Final `swift build` after Task 2:
```
[5/8] Compiling DailyBriefMonitor DashboardView.swift
[6/8] Emitting module DailyBriefMonitor
[7/9] Compiling DailyBriefMonitor AppDelegate.swift
[8/10] Linking DailyBriefMonitor
[9/10] Applying DailyBriefMonitor
Build complete! (57.18s)
```

Exit 0. Pre-existing `UpdateService.swift` warnings unchanged — out of scope.

## Status: PAUSED at Task 3 (human-verify checkpoint)

Plan 53-03 is marked `autonomous: false`. Tasks 1 and 2 (auto) are complete and committed. Task 3 is a blocking `checkpoint:human-verify` covering the visual + interaction contract from UI-SPEC. The executor has stopped and is awaiting the user's "approved" signal (or a list of failing checkboxes).

See the checkpoint message returned to the orchestrator for the verification checklist (10 numbered steps + 14 UI-SPEC checkboxes).

## Self-Check: PASSED

- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` modified — FOUND
- `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` modified — FOUND
- `Sources/DailyBriefMonitor/AppDelegate.swift` modified — FOUND
- Commit 218b010 — FOUND in `git log`
- Commit 6e1f196 — FOUND in `git log`
- All Task 1 grep assertions — PASS (with the documented `var` vs `public var` deviation)
- All Task 2 grep assertions — PASS
- `swift build` — clean (exit 0, no new warnings)
