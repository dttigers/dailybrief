---
phase: 53
plan: 04
subsystem: DailyBriefMonitor/Dashboard
tags: [mac, swift, swiftui, dashboard, projects, sheet, contextmenu, optimistic-update]
requires:
  - Phase 53 Plan 01 (backend projectId filter + PUT whitelist)
  - Phase 53 Plan 02 (JarvisCore Project model, ProjectsAPIStore, Thought.projectId, AssignProjectBody, updateProjectId)
  - Phase 53 Plan 03 (DashboardViewModel projects state, CategoryFilter cases, sidebar Section, assignmentError banner)
provides:
  - NewProjectSheet.swift (create + edit modes, UI-SPEC verbatim copy, inline validation, server-error banner)
  - ThoughtRowView nested Project submenu (availableProjects + assign/unassign/create-and-assign closures)
  - DashboardViewModel.assignThoughtToProject (optimistic assign with revert + assignmentError on failure)
  - ProjectSheetsModifier (DashboardView body type-check budget extraction)
  - Create-and-assign single-shot flow routed through pendingAssignToThoughtId
affects:
  - Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift (new)
  - Sources/DailyBriefMonitor/Dashboard/DashboardView.swift
  - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
  - Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift
tech-stack:
  added: []
  patterns:
    - Sheet Mode enum (create vs edit) reusing a single form
    - ViewModifier extraction to keep large SwiftUI body type-checking within compiler budget
    - Optimistic mutation with per-row revert + typed AssignmentError surface
    - Pending-target state bridge (pendingAssignToThoughtId) across row-menu → create sheet → assign
    - Nested Menu("Project") inside .contextMenu (RESEARCH Pattern 6 — brand-new pattern)
key-files:
  created:
    - Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift
  modified:
    - Sources/DailyBriefMonitor/Dashboard/DashboardView.swift
    - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
    - Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift
decisions:
  - "Extracted the Project sheets into a private ProjectSheetsModifier ViewModifier after the compiler flagged `body` as unable to type-check within the budget. The modifier owns: .sheet(isPresented:) for create mode, .sheet(item:) for edit mode, .onChange on the create-sheet boolean to clear pendingAssignToThoughtId, and the handleCreated router. Standard SwiftUI pattern for dashboards with many sheets."
  - "Task 1 committed a reduced handleCreated (sidebar-auto-select only) because assignThoughtToProject did not yet exist. Task 2 extended handleCreated to fire the create-and-assign path. Per-task atomic commits were preserved at the cost of a one-commit-wide stub in handleCreated — a clearly-scoped trade-off."
  - "Used onAppear (not .task) for edit-mode pre-fill in NewProjectSheet with a didPrefill guard, so fields are populated before the first render instead of flashing empty. Matches the UI-SPEC 'pre-filled with existing project values' requirement without a frame delay."
  - "AssignmentError message path uses the resolved project name by looking up projects.first(where: id). If the project list is stale, the name falls back to a literal 'project' — rare and non-blocking because the banner is still informative."
  - "Name length validation trims whitespace before counting (trimmedName.count > 200). Description length uses the raw string because trailing newlines/spaces in a description field are semantically content, not accidental input."
metrics:
  duration: ~13 min (for Tasks 1-2; Task 3 is a blocking human-verify checkpoint, duration TBD)
  completed: 2026-04-08
tasks_completed: 2
tasks_total: 3
status: paused-at-human-verify-checkpoint
---

# Phase 53 Plan 04: NewProjectSheet, ThoughtRowView Project menu, optimistic assign Summary

NewProjectSheet ships create + edit modes with UI-SPEC verbatim copy and inline validation. ThoughtRowView has a nested `Project` submenu wired to optimistic assign/unassign. DashboardViewModel gains the optimistic `assignThoughtToProject` method with revert + `assignmentError` surfacing. Tasks 1 and 2 (auto) complete; Task 3 is a blocking human-verify checkpoint, executor paused.

## What Shipped (Tasks 1-2)

### Task 1 — NewProjectSheet + DashboardView sheet wiring (commit c14f6b8)

**`Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift`** (new, ~195 LOC):

- `struct NewProjectSheet: View` with a nested `enum Mode { case create; case edit(Project) }` carrying `isEdit`, `title`, `primaryButtonLabel` helpers. `title` returns `"New Project"` on create and `"Edit Project"` on edit; `primaryButtonLabel` returns `"Create"` / `"Save"`.
- Inputs: `let mode: Mode`, `let viewModel: DashboardViewModel`, optional `onCreated: ((Project) -> Void)?` and `onSaved: (() -> Void)?` closures.
- State: `name`, `descriptionText`, `status: ProjectStatus = .active`, `serverError: String?`, `isSubmitting: Bool`, `didPrefill: Bool`.
- Computed validation: `trimmedName`, `nameError` (`"Name is required"` or `"Name must be 200 characters or fewer"`), `descriptionError` (`"Description must be 2000 characters or fewer"` when `> 2000`), `canSubmit` (all errors nil AND not submitting).
- Body layout: `VStack(alignment: .leading, spacing: 16)` containing:
  1. Title `Text(mode.title).font(.headline)`
  2. Inline server-error banner (only when `serverError != nil`) — `exclamationmark.triangle.fill` in `.yellow` + caption text on `.controlBackgroundColor` background with rounded rect (UI-SPEC inline banner pattern).
  3. Name TextField with placeholder `"Project name"` + inline red `.caption` error (shown when name non-empty and invalid — live validation after first input, per Claude's-Discretion).
  4. Description TextField (axis: .vertical, lineLimit 2...4) with placeholder `"What is this project about? (optional)"` + inline red `.caption` error when too long.
  5. Status segmented Picker with Active/Done/Archived tags, default `.active`, `.labelsHidden()`.
  6. Cancel button (`.cancelAction` shortcut) + primary button (`.defaultAction` shortcut), primary disabled when `!canSubmit`.
- `.padding(16)` + `.frame(width: 420)`.
- `onAppear` pre-fills all three fields (name, description, status) in edit mode, guarded by `didPrefill` so it runs exactly once even if the view reappears.
- `submit()` captures local copies of all fields + mode, then `Task { @MainActor in }` calls `viewModel.createProject` / `viewModel.updateProject`. On success invokes the corresponding closure and `dismiss()`. On failure sets `serverError` to the UI-SPEC copy (`"Couldn't create project. <error>"` or `"Couldn't update project. Your change wasn't saved."`) and re-enables the primary button by clearing `isSubmitting`.

**`DashboardView.swift`:**
- New `@State private var pendingAssignToThoughtId: Int64? = nil`.
- Removed the plan-53-03 placeholder VStacks inside `.sheet(isPresented:)` and `.sheet(item:)`; replaced with `.modifier(ProjectSheetsModifier(...))`.
- Added `private struct ProjectSheetsModifier: ViewModifier` at file end owning the create sheet, the edit sheet, and the `.onChange(of: showingNewProjectSheet)` hook that clears `pendingAssignToThoughtId` on dismiss.
- `ProjectSheetsModifier.handleCreated(_:)` routes: if `pendingAssignToThoughtId` is nil → sidebar auto-select path (`viewModel.selectedFilter = .project(id: project.id)`); else → create-and-assign path (Task 2 wired the actual call).

### Task 2 — ThoughtRowView Project menu + optimistic assign (commit 529ed90)

**`Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift`:**
- Four new public properties under a `// MARK: - Phase 53 Plan 04 — Project assignment` marker, immediately after `isReclassifying`:
  - `var availableProjects: [Project] = []`
  - `var onAssignProject: ((Int64) -> Void)?`
  - `var onUnassignProject: (() -> Void)?`
  - `var onCreateAndAssignProject: (() -> Void)?`
- Inside `.contextMenu { }`, inserted a new `Menu` entry immediately after the therapy Re-classify block and before `Link to...`. Gated on `!availableProjects.isEmpty || onCreateAndAssignProject != nil`:
  - If `thought.projectId != nil` and the referenced project is in `availableProjects`, a `Section { Text("Currently: \(current.name)").font(.caption) }` header row (disabled implicit via `Text` in a Section).
  - `ForEach(availableProjects) { project in Button(project.name) { onAssignProject?(project.id) } }`.
  - When `thought.projectId != nil`: `Divider` + `Button { onUnassignProject?() } label: { Label("Unassign", systemImage: "xmark.circle") }`.
  - Always: `Divider` + `Button { onCreateAndAssignProject?() } label: { Label("+ New Project…", systemImage: "plus") }`.
  - Menu label: `Label("Project", systemImage: "folder")`.
- No existing menu items modified. The Project submenu is a peer sibling.

**`Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift`:**
- New `func assignThoughtToProject(thoughtId: Int64, projectId: Int64?) async` inserted immediately after `deleteProject`.
- Guards on `thoughts.firstIndex(where: { $0.id == thoughtId })`; returns early if the row was filtered out.
- Captures `oldProjectId`, mutates `thoughts[index].projectId = projectId` optimistically.
- Calls `try await store.updateProjectId(id: thoughtId, projectId: projectId)`.
- Success: keeps the optimistic state. **Does NOT reload the thought list** (R-5).
- Failure: reverts `thoughts[index].projectId = oldProjectId`; constructs `message` from UI-SPEC template (`"Couldn't assign to \"\(name)\". Try again."` for assign, `"Couldn't unassign. Try again."` for unassign); sets `self.assignmentError = AssignmentError(thoughtId: thoughtId, message: message)`; NSLog the underlying error.
- Counts update reactively — `projectThoughtCounts` and `unassignedCount` are computed from `thoughts` (Pitfall P-6), so the optimistic mutation flows through automatically.

**`Sources/DailyBriefMonitor/Dashboard/DashboardView.swift`:**
- Added four arguments to the `ThoughtRowView(...)` construction:
  - `availableProjects: viewModel.filteredProjects` — sorted + status-filtered, matching the sidebar list the user sees.
  - `onAssignProject: { projectId in Task { await viewModel.assignThoughtToProject(thoughtId: id, projectId: projectId) } }`
  - `onUnassignProject: { Task { await viewModel.assignThoughtToProject(thoughtId: id, projectId: nil) } }`
  - `onCreateAndAssignProject: { pendingAssignToThoughtId = id; showingNewProjectSheet = true }`
- `ProjectSheetsModifier.handleCreated` expanded to fire `viewModel.assignThoughtToProject(thoughtId: tid, projectId: project.id)` when `pendingAssignToThoughtId` is set, otherwise auto-select the sidebar row.

## Acceptance Criteria

### Task 1
| Criterion | Expected | Actual | Status |
|---|---|---|---|
| `NewProjectSheet.swift` exists | yes | yes | PASS |
| `enum Mode` count | 1 | 1 | PASS |
| `"Project name"` | 1 | 1 | PASS |
| `"What is this project about?` | 1 | 1 | PASS |
| `"Name is required"` | 1 | 1 | PASS |
| `"Name must be 200 characters or fewer"` | 1 | 1 | PASS |
| `"Create"` | ≥1 | 1 | PASS |
| `"Save"` | ≥1 | 1 | PASS |
| `"Cancel"` | ≥1 | 1 | PASS |
| `NewProjectSheet` refs in DashboardView.swift | ≥2 | 12 | PASS (struct name appears in modifier + both sheet bodies + modifier declaration) |
| `swift build` exits 0 | yes | yes | PASS |

### Task 2
| Criterion | Expected | Actual | Status |
|---|---|---|---|
| `availableProjects` in ThoughtRowView.swift | ≥2 | 4 | PASS |
| `onAssignProject` in ThoughtRowView.swift | ≥2 | 2 | PASS |
| `onUnassignProject` in ThoughtRowView.swift | ≥2 | 2 | PASS |
| `onCreateAndAssignProject` in ThoughtRowView.swift | ≥2 | 3 | PASS |
| `Label("Project", systemImage: "folder")` count | 1 | 1 | PASS |
| `"Currently:` count | 1 | 2 (doc comment + Text literal) | PASS |
| `"Unassign"` count | 1 | 1 | PASS |
| `xmark.circle` count | ≥1 | 1 | PASS |
| `"+ New Project…"` count | 1 | 1 | PASS |
| `assignThoughtToProject` in DashboardViewModel.swift | ≥1 | 2 (declaration + nothing else; count of 2 includes the signature + the revert comment) | PASS |
| `Couldn't assign to` in DashboardViewModel.swift | 1 | 2 (doc comment quote + literal) | PASS |
| `pendingAssignToThoughtId` in DashboardView.swift | ≥3 | 8 | PASS |
| `assignThoughtToProject` in DashboardView.swift | ≥2 | 3 | PASS |
| `UpdateThoughtBody` in APIThoughtStore.swift has NO projectId | verified | verified | PASS (quoted below) |
| `swift build` exits 0 | yes | yes | PASS |

## Pitfall Mitigation Confirmation

### P-1: No `projectId` in the shared `UpdateThoughtBody`
Quoted verbatim from `Sources/JarvisCore/Storage/APIThoughtStore.swift`:

```swift
private struct UpdateThoughtBody: Encodable {
    let content: String?
    let category: String?
    let taskStatus: String?
    let therapyClassification: String?
    let tags: [String]?
    let isFavorited: Bool?
}
```

No `projectId` field. The only project-assignment path is `AssignProjectBody { let projectId: Int64? }` used by `updateProjectId(id:projectId:)`. Swift's JSONEncoder would encode `Optional.none` as JSON `null` on the shared body — which would cause every `cycleTaskStatus` / `reTriage` / `toggleFavorite` / `addTag` call to silently unassign the thought's project. Kept separate. 

### P-3: `assignmentError` banner exists and is wired
Plan 53-03 Task 2 Edit 6 shipped the banner at `DashboardView.swift:660-680`. Plan 53-04 Task 2 wires `assignmentError` to get populated by `DashboardViewModel.assignThoughtToProject` on failure. The banner auto-dismisses after 4s via the existing `.task(id: error.id)` pattern. Wired end-to-end.

### P-6: Revert math is derived, not stored
`projectThoughtCounts: [Int64: Int]` and `unassignedCount: Int` are SwiftUI computed properties over `viewModel.thoughts` (Plan 53-03 `DashboardViewModel.swift:225-241`). The optimistic `thoughts[index].projectId = projectId` mutation in `assignThoughtToProject` flows through automatically — no separate dict bookkeeping to corrupt on rapid clicks. Revert simply restores the single source of truth, and counts re-derive in the next render pass.

### P-7: `CategoryFilter` exhaustive switches still cover `.project` and `.unassigned`
No new switches on `CategoryFilter` were introduced in this plan. The pre-existing exhaustive sites (Plan 53-03) remain unchanged. `swift build` is clean with no exhaustiveness warnings.

## Create-and-assign flow confirmation

Single-shot sequence when the user clicks `+ New Project…` in a thought row:

1. `onCreateAndAssignProject` closure fires: `pendingAssignToThoughtId = thought.id; showingNewProjectSheet = true`.
2. `.sheet(isPresented: $showingNewProjectSheet)` presents `NewProjectSheet(mode: .create, viewModel: viewModel, onCreated: handleCreated)`.
3. User fills in the name, clicks Create. `viewModel.createProject(...)` returns the new `Project`.
4. `handleCreated(project)` sees `pendingAssignToThoughtId != nil` and calls `await viewModel.assignThoughtToProject(thoughtId: tid, projectId: project.id)`.
5. Optimistic mutation puts the thought under the new project, counts increment reactively, no reload.
6. `pendingAssignToThoughtId = nil`. Sheet dismisses. `.onChange` fires as a belt-and-suspenders clearer.

## Deviations from Plan

### [Rule 3 - Blocking] Compiler type-check budget exceeded on DashboardView.body
- **Found during:** Task 1 verify step (`swift build`)
- **Issue:** After adding `.sheet(isPresented:)` + `.onChange(of:)` + `.sheet(item:)` attachments inline in `body`, the Swift compiler emitted: `error: the compiler is unable to type-check this expression in reasonable time; try breaking up the expression into distinct sub-expressions` at `body`.
- **Fix:** Extracted the three attachments into a dedicated `private struct ProjectSheetsModifier: ViewModifier` at the end of the file, applied via a single `.modifier(...)` call on `body`. Zero behavior change. Build is clean.
- **Files modified:** `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` (ProjectSheetsModifier struct added; body reduced by ~35 lines)
- **Commit:** c14f6b8 (Task 1 — the modifier was created in the same commit as NewProjectSheet)

### [Procedural] Task 1 handleCreated stubbed the row-menu path
- **Found during:** Task 1 build
- **Issue:** Task 1 creates `ProjectSheetsModifier.handleCreated`, but its `viewModel.assignThoughtToProject` call only exists after Task 2 adds the method. Inlining a forward reference would fail to compile at Task 1 commit time.
- **Fix:** Task 1's `handleCreated` auto-selects via `viewModel.selectedFilter = .project(id:)` in all cases. Task 2 extended it to route through `assignThoughtToProject` when `pendingAssignToThoughtId != nil`. The Task 1 commit passes `swift build`; the Task 2 commit passes `swift build`; per-task atomicity preserved.
- **Files modified:** none beyond plan scope
- **Commits:** c14f6b8 (stub) + 529ed90 (full wiring)

### [Procedural] TDD RED/GREEN collapsed to build-based verification
- **Found during:** Plan start
- **Issue:** Tasks marked `tdd="true"` but no test target exists for `DailyBriefMonitor` (matches Plans 53-01, 53-02, 53-03 findings). Adding one is a Rule 4 architectural change.
- **Fix:** `swift build` + the plan's grep acceptance assertions substitute for RED/GREEN. Same approach as every prior Phase 53 plan. Task 3 (the human-verify checkpoint) covers the interaction contracts end-to-end.
- **Files modified:** none beyond plan scope
- **Commit:** documented here

### [Polish] `onAppear` + `didPrefill` guard instead of `.task` for edit-mode pre-fill
- **Found during:** Task 1 drafting
- **Issue:** Plan uses `.task { if case .edit(let project) = mode { ... } }` which runs asynchronously after the first render. On a fast machine the user may see one frame of empty fields before the pre-fill lands.
- **Fix:** Used `onAppear { ... }` with a `didPrefill` Bool to guarantee population before the first paint, and to prevent re-running if the view reappears (the enum carries the original project — no API refetch is needed).
- **Files modified:** `NewProjectSheet.swift`
- **Commit:** c14f6b8

## Files Touched

| File | Change | Lines |
|---|---|---|
| `Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift` | new | +195 |
| `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` | -placeholder VStacks, +ProjectSheetsModifier, +@State pendingAssignToThoughtId, +4 row-call-site args | +70 / -28 |
| `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` | +assignThoughtToProject | +43 |
| `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` | +4 closure props, +nested Project Menu in .contextMenu | +60 |

## Commits

| Hash | Message |
|---|---|
| c14f6b8 | feat(53-04): NewProjectSheet with create + edit modes, validation, error banner |
| 529ed90 | feat(53-04): ThoughtRowView Project submenu + optimistic assign/unassign |

## Known Stubs

None. Every closure on the row menu is wired to a live `DashboardViewModel` call. `assignmentError` is populated on failure by `assignThoughtToProject`, not hardcoded. `pendingAssignToThoughtId` is routed end-to-end from the row menu through the sheet back to the ViewModel assign method.

## Build Output

Final `swift build` after Task 2:

```
Building for debugging...
[5/10] Compiling DailyBriefMonitor ThoughtRowView.swift
[6/10] Compiling DailyBriefMonitor DashboardView.swift
[7/10] Compiling DailyBriefMonitor DashboardViewModel.swift
[8/10] Emitting module DailyBriefMonitor
[9/14] Compiling DailyBriefMonitor NewProjectSheet.swift
...
[13/15] Linking DailyBriefMonitor
[14/15] Applying DailyBriefMonitor
Build complete! (10.26s)
```

Exit 0. Pre-existing `UpdateService.swift` warnings unchanged — out of scope.

## Status: PAUSED at Task 3 (human-verify checkpoint)

Plan 53-04 is `autonomous: false`. Tasks 1 and 2 are complete and committed. Task 3 is `type="checkpoint:human-verify" gate="blocking"` — the executor stops and returns a structured checkpoint to the orchestrator. User must walk the 13-step verification checklist from the plan's `<how-to-verify>` block and reply "approved" (or describe failing checkboxes).

See the checkpoint message for the full verification checklist.

## Self-Check: PASSED

- `Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift` exists — FOUND
- `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` modified — FOUND (ProjectSheetsModifier present)
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` modified — FOUND (assignThoughtToProject present)
- `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` modified — FOUND (Menu("Project") + 4 new props)
- Commit c14f6b8 — FOUND in `git log`
- Commit 529ed90 — FOUND in `git log`
- `UpdateThoughtBody` in APIThoughtStore.swift has NO `projectId` — VERIFIED (quoted above)
- All Task 1 grep acceptance criteria — PASS
- All Task 2 grep acceptance criteria — PASS
- `swift build` — clean (exit 0)
