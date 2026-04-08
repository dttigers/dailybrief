---
phase: 53
slug: projects-dashboard-ui
status: draft
shadcn_initialized: false
preset: not applicable
created: 2026-04-08
---

# Phase 53 — UI Design Contract

> Visual and interaction contract for the Projects Dashboard UI. Native SwiftUI / macOS 14+ — extends the existing `DashboardView` (NavigationSplitView + List) built in Phases 4, 16, 24–28, 47, 50. shadcn is not applicable; the "design system" is Apple HIG + SF Symbols + macOS system colors. This spec locks the delta this phase adds on top of the already-shipped conventions.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (native SwiftUI, not React/Next/Vite) |
| Preset | not applicable |
| Component library | SwiftUI system controls (`NavigationSplitView`, `List`, `Label`, `Menu`, `Button(role: .destructive)`, `Picker`) |
| Icon library | SF Symbols (system) |
| Font | `.system` — San Francisco via SwiftUI `.font()` semantic styles (`.body`, `.subheadline`, `.caption`, `.caption2`, `.headline`, `.largeTitle`) |

**Canonical reference (downstream agents MUST read before implementing):**
- `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` — sidebar + detail patterns this phase extends
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` — @Observable state pattern + `.task { await refresh() }` lifecycle
- `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` — row-level action conventions (edit, link, favorite, delete)

This phase MUST NOT introduce a new visual language. Every new surface reuses existing tokens.

---

## Spacing Scale

Declared values (SwiftUI point units, multiples of 4):

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs | 2pt | `.padding(.vertical, 2)` — sidebar row vertical rhythm (matches existing filter pills) |
| sm | 4pt | Sidebar icon-to-label gap, count capsule vertical padding |
| md | 6pt | `HStack(spacing: 6)` for sidebar rows, count capsule horizontal padding |
| base | 8pt | Picker / form field spacing, filter chip spacing, bulk bar padding |
| content | 12pt | Detail pane horizontal and vertical section padding (`.padding(.horizontal, 12)`) |
| lg | 16pt | Sheet content padding, form section gaps |
| xl | 24pt | Empty state vertical gap between icon/heading/body |

**Exceptions:**
- `.padding(.vertical, 2)` for sidebar button rows — intentional, matches Source/Date/Tags sections already in `DashboardView`. Do NOT bump to 4pt; it breaks visual density parity with the existing sidebar.
- Sidebar column width: `navigationSplitViewColumnWidth(min: 160, ideal: 200, max: 260)` — locked to match existing dashboard.

---

## Typography

All values via SwiftUI semantic font styles — do NOT introduce raw `.font(.system(size:))` declarations. Dynamic Type must keep working.

| Role | SwiftUI Style | Weight | Usage in this phase |
|------|---------------|--------|---------------------|
| Body | `.subheadline` | `.regular` | Sidebar row labels (project name), picker options, row labels in sheets |
| Label | `.caption` | `.regular` | Count capsules, status labels under project name, helper text |
| Label emphasis | `.subheadline` | `.medium` via `.fontWeight(.medium)` | "N selected" bulk bar text, active filter chip label (when used) |
| Heading | `.headline` | `.semibold` (default for `.headline`) | Empty state heading ("No projects yet"), sheet titles ("New Project", "Rename Project") |
| Display | `.largeTitle` | `.regular` | Empty state SF Symbol glyph only (icon sizing, not text) |

**Two weights maximum in use this phase:** regular (default) and semibold (via `.headline`). Medium appears ONLY on the bulk-action bar count, reusing an already-shipped exception. No new weights.

**Line heights:** SwiftUI system default — do not override. macOS system fonts ship with platform-tuned leading; manual `lineSpacing` breaks HIG alignment.

---

## Color

All colors via SwiftUI / AppKit semantic tokens — NEVER raw hex. This is non-negotiable for dark mode parity.

| Role | Token | Usage in this phase |
|------|-------|---------------------|
| Dominant (60%) | `Color(nsColor: .windowBackgroundColor)` (default List background) | Sidebar, detail pane, sheet backgrounds |
| Secondary (30%) | `Color(nsColor: .controlBackgroundColor)` | Header/toolbar strips above the project thought list, bulk action bar, count capsule backdrop via `.quaternaryLabelColor` |
| Accent (10%) | `.tint` / `Color.accentColor` (system accent — user's macOS preference) | Selected project row highlight (automatic via List selection), primary "New Project" action button, drop-target overlay border (existing pattern) |
| Destructive | `.red` via `Button(role: .destructive)` | "Delete Project" menu item, destructive confirmation button |

**Accent reserved for:**
1. The currently selected project in the sidebar (automatic via `List(selection:)` — do not override)
2. The primary "New Project" action button in the sidebar header (SF Symbol `plus.circle.fill` tinted with `.tint`)
3. Drop-target overlays (reuses existing `dropOverlay` pattern)

**Accent NOT allowed on:** status badges, count capsules, project row hover, filter pills, or any other decorative surface. Status is conveyed through SF Symbol + semantic color (see Status Color Mapping below), not accent.

### Status Color Mapping (locked)

The project status field (`active` / `archived` / `done`) uses the same palette pattern as the existing task status (`TaskStatus.displayColor`):

| Status | SF Symbol | Color |
|--------|-----------|-------|
| `active` | `circle` | `.secondary` (neutral — it's the default, doesn't need to shout) |
| `done` | `checkmark.circle.fill` | `.green` |
| `archived` | `archivebox` | `.secondary` with `.opacity(0.6)` applied to the whole row |
| `nil` (unset) | `circle.dotted` | `.tertiary` |

Rationale: mirrors `TaskStatus` vocabulary already shipped in `ThoughtRowView`. Green for done is the only "positive" color this phase introduces and it matches the existing done-task affordance.

---

## Copywriting Contract

All copy is ADHD-founder voice: direct, action-first, no filler words, no marketing fluff. Matches existing dashboard copy.

### Sidebar Projects section

| Element | Copy |
|---------|------|
| Sidebar section header | `Projects` |
| Primary CTA (in-section button) | `+ New Project` (SF Symbol `plus.circle.fill` + label "New Project") |
| Empty-section inline label | `No projects yet` (italicized `.caption` secondary — matches "No tags yet" pattern already in `DashboardView`) |
| Status filter label (segmented picker) | `Status` with segments: `All` / `Active` / `Done` / `Archived` |

### Project creation sheet

| Element | Copy |
|---------|------|
| Sheet title | `New Project` |
| Name field placeholder | `Project name` |
| Description field placeholder | `What is this project about? (optional)` |
| Status field label | `Status` (default selection: `Active`) |
| Primary button | `Create` |
| Secondary button | `Cancel` |
| Validation error (empty name) | `Name is required` (inline below field, `.caption` in `.red`) |
| Validation error (name too long) | `Name must be 200 characters or fewer` |

### Project detail / empty-thoughts state

| Element | Copy |
|---------|------|
| Empty state heading | `No thoughts yet` |
| Empty state body | `Assign thoughts to "{project.name}" from any thought row.` |
| Empty state icon | SF Symbol `folder` at `.largeTitle`, `.secondary` |

### Thought row — project assignment menu

Shown via existing row-level Menu control (same place as Re-categorize / Re-triage).

| Element | Copy |
|---------|------|
| Menu label | `Project` (SF Symbol `folder`) |
| Menu section header (when assigned) | `Currently: {project.name}` (disabled row, `.caption`) |
| Menu item — assign | `{project.name}` (one per project) |
| Menu item — unassign | `Unassign` (shown only when `thought.project_id != nil`; SF Symbol `xmark.circle`) |
| Menu item — create new | `+ New Project…` (opens the creation sheet; returns and assigns on success) |

### Destructive actions

| Action | Trigger | Confirmation copy |
|--------|---------|-------------------|
| Delete project | Menu item on project row (context menu) | Native `Alert` — title: `Delete "{project.name}"?` — message: `Thoughts assigned to this project will be unassigned. They won't be deleted.` — destructive button: `Delete` — cancel: `Cancel` |

This matches the FK `ON DELETE SET NULL` behavior locked in Phase 52 D-03. The copy must state the preservation guarantee explicitly — the user needs to know hitting Delete does not nuke their thoughts.

### Error states (API failures)

| Scenario | Copy (inline banner, `.controlBackgroundColor` background, `.yellow` exclamation-mark icon) |
|----------|---------------------------------------------------------------------------------------------|
| GET /v1/projects failed | `Couldn't load projects. Check your Vigil connection and retry.` + `Retry` button |
| POST /v1/projects failed | `Couldn't create project. {error message from API, if present}` |
| PATCH (rename / change status) failed | `Couldn't update project. Your change wasn't saved.` + `Retry` button |
| DELETE failed | `Couldn't delete project. Try again.` |
| Thought → project assignment failed | Existing thought-row error pattern (toast-style) — copy: `Couldn't assign to "{project.name}". Try again.` |

**No generic "An error occurred" copy.** Every failure names the operation and the recovery path.

---

## Component Inventory (this phase)

Locked component delta for Phase 53. Executor implements these exactly — no additional new surfaces.

| Component | File (suggested) | Role |
|-----------|-----------------|------|
| `ProjectsSection` | extend `DashboardView.swift` sidebar | New `Section("Projects")` block between existing `Tags` and `Brief History` sections |
| `ProjectStatusFilter` | `DashboardView.swift` sidebar | Inline segmented `Picker` inside the Projects section, 4 segments (All/Active/Done/Archived) |
| `NewProjectSheet` | `Sources/DailyBriefMonitor/Dashboard/NewProjectSheet.swift` | Modal sheet (`.sheet`) for create + edit (same form, reused) |
| `ProjectPickerMenu` | extend `ThoughtRowView.swift` | New `Menu("Project")` entry added alongside existing Re-categorize/Re-triage menus |
| `ProjectEmptyStateView` | `DashboardView.swift` private view | Shown in detail pane when a project has zero thoughts (reuses existing `emptyState` pattern, different copy and icon) |
| `CategoryFilter` enum extension | `DashboardViewModel.swift` | Add `.project(id: Int64)` case — parallels existing `.all` and `.specific(ThoughtCategory)` |

**Reused (unchanged) components — do NOT fork or duplicate:**
- `ThoughtRowView` — the existing row is the container for the new Project menu item; no row-level structural change
- The detail `List(viewModel.thoughts)` — a project-scoped view just populates this list with a filtered query; no new list renderer
- `emptyState` private view — the project empty state is a *sibling* pattern, not a modification of the existing one
- The sidebar count-capsule pattern (`.quaternaryLabelColor` backdrop, `.caption`, `Capsule()` clip) — reused verbatim for project thought counts

---

## Interaction Contracts

### Project selection

- Clicking a project row in the sidebar sets `viewModel.selectedFilter = .project(id:)`.
- The detail pane updates to show only thoughts where `project_id == id`, via a new `GET /v1/thoughts?projectId=X` query (requires the Phase 53 planner to add this query param to the existing `/thoughts` route — this is listed in Phase 52 summary's "Phase 53+ extension points").
- Switching the filter resets `selectedThoughtIds`, mirrors the existing `.onChange(of: viewModel.selectedFilter)` block.

### Creating a project

- `+ New Project` button opens `NewProjectSheet` as a `.sheet`.
- On `Create`: calls `POST /v1/projects`, on success closes the sheet and automatically selects the new project (sets `selectedFilter = .project(id: newId)`).
- On validation failure: error inline under the field, sheet stays open.
- On network failure: inline banner at top of sheet, `Create` button re-enabled.

### Editing a project (rename / change status / edit description)

- Context menu on the sidebar project row → `Edit…` → reopens `NewProjectSheet` in edit mode (same form, `Save` button instead of `Create`).
- Uses `PATCH /v1/projects/:id`.
- Status can also be changed inline via a secondary context menu shortcut (`Set status → Active / Done / Archived`) without opening the sheet — this is the hot path for marking a project `done`.

### Assigning a thought to a project

- Opens from `ThoughtRowView` Menu → `Project` submenu.
- Menu lazily shows the current projects list (pulled from `viewModel.projects`, fetched once on dashboard load + refetched after any project CRUD).
- Selecting a project calls `PATCH /v1/thoughts/:id` with `{ projectId: X }` — this requires the Phase 52 `thoughts` route to accept `project_id` in its update payload (confirm in planner phase; the FK column exists but the route may need to whitelist it).
- Selecting `Unassign` sends `{ projectId: null }`.
- On success: row updates optimistically, the old-project thought count decrements, the new-project count increments.
- On failure: revert optimistic update, show row-level error toast.

### Deleting a project

- Context menu → `Delete…` → native `Alert` with the confirmation copy above.
- On confirm: `DELETE /v1/projects/:id`.
- On success: if the deleted project was the active filter, reset to `.all`. Refresh thought list (any previously-assigned thoughts now show unassigned, per FK SET NULL).
- On failure: banner error, no state change.

### Status filter

- Segmented `Picker` inside the Projects sidebar section.
- Default: `All`.
- Changing the filter hides projects whose status does not match. Does NOT affect the currently-selected project's thought list (filter is on the project list itself, not thoughts).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none (native SwiftUI) | n/a | not applicable — no third-party component registry |

No third-party Swift packages introduced in this phase. All UI uses stock SwiftUI + SF Symbols.

---

## Out of Scope (explicitly deferred)

Per CONTEXT.md conventions, these are captured so they don't creep into Phase 53:

- **Per-project color picker.** Phase 52 D-01 locked a lean schema without a `color` column. Status color mapping above is sufficient for v2.3. Add a color column in Phase 54+ if the dashboard feels visually flat in daily use.
- **Drag-and-drop thought-to-project assignment.** Menu-based assignment ships in Phase 53; drag-drop is a power-user nicety deferred until the menu flow is proven.
- **Project thought count computed server-side.** The `thoughtCount` field is not in the Phase 52 response shape. Phase 53 computes it client-side from the already-loaded thought list. If the count becomes slow or stale, revisit and add it server-side (listed in Phase 52 summary extension points).
- **Bulk move thoughts between projects.** Existing bulk action bar gets a `Move to project…` action only if the single-row Menu flow proves too slow; defer to Phase 53 retro.
- **Project creation from the capture panel.** Out of scope — capture stays frictionless, project assignment happens in the dashboard after triage.
- **Reordering projects.** No sort order field in Phase 52 schema. Alphabetical by name for v2.3.
- **Archived project visual treatment beyond row opacity.** No separate "Archive" section — the Status filter segmented picker handles visibility.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
