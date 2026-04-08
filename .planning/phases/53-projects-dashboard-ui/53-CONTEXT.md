# Phase 53: Projects Dashboard UI - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 53 (interactive, recommendations confirmed)

<domain>
## Phase Boundary

User can manage projects and assign thoughts to them entirely from the Mac dashboard. Native SwiftUI extension of `DashboardView` (NavigationSplitView + List), consuming the projects API shipped in Phase 52.

This phase delivers:
1. A small Phase 52 backend extension: `GET /thoughts?projectId=X` (and `unassigned=true`) + accept `project_id` in `PATCH /thoughts/:id` body
2. A `Projects` section in the dashboard sidebar with project rows, status filter, an `Unassigned` row, and a `+ New Project` action
3. `NewProjectSheet` for create/edit, with validation, status picker, error states
4. `ProjectPickerMenu` on `ThoughtRowView` for assign / unassign / create-and-assign
5. `.project(id:)` and `.unassigned` cases on `CategoryFilter`, driving the detail pane
6. Project delete with `Alert` confirmation; relies on Phase 52 D-03 `ON DELETE SET NULL`
7. The full visual / copy / component contract locked in `53-UI-SPEC.md`

**Out of scope (deferred):**
- Per-project color, sort order, drag-drop assignment, bulk move-to-project (see Deferred)
- One-time migration UI for legacy `category="project"` thoughts (D-04 below)
- Server-side `thoughtCount` (D-08 below)

</domain>

<decisions>
## Implementation Decisions

### Backend route extensions (in scope this phase)

#### D-01: `GET /thoughts` accepts `projectId` and `unassigned`
**Locked.** Extends the existing `vigil-core/src/routes/thoughts.ts` route in a Phase 53 Wave 1 plan, BEFORE any Mac UI plans run.

- New optional query params on `GET /thoughts`:
  - `projectId=<int>` — filters to thoughts where `project_id = X`
  - `unassigned=true` — filters to thoughts where `project_id IS NULL`
  - The two are mutually exclusive; sending both returns `400 { error: "projectId and unassigned are mutually exclusive" }`
- Combines with the existing `category` and `q` filters via `AND`
- No new index needed beyond the `idx_thoughts_project_id` Phase 52 already created
- Mirrors the existing query-param style on the route — minimal surface change

**Why:** UI-SPEC project selection and the new Unassigned row both depend on this. Splitting it into a separate phase would block every UI plan for no benefit.

#### D-02: `PATCH /thoughts/:id` accepts `project_id` (or `projectId`) in body
**Locked.**

- Whitelist `project_id` (snake_case to match DB column convention) in the PATCH validator alongside the existing fields
- Accepts `null` (unassign) or a positive integer (assign)
- Validates that the referenced project exists when non-null; returns `400 { error: "project not found" }` if it doesn't
- On success returns the updated thought with `project_id` populated in the response
- Does NOT touch `category` — this is a separate field per Phase 52 D-04

**Why:** The `ProjectPickerMenu` interaction in UI-SPEC sends this PATCH on every assign/unassign. The FK column already exists from Phase 52 — only the route whitelist needs updating.

#### D-03: Backend changes ship as Wave 1 plan (gating)
**Locked.** Plan ordering:
- Wave 1: Backend route extensions (D-01 + D-02), with smoke tests
- Wave 2: Mac UI plans (sidebar section, NewProjectSheet, ProjectPickerMenu, CategoryFilter extension) — depend on Wave 1
- Wave 3 (optional): Polish / edge-case plan if Wave 2 produces too many tasks for one plan

### Legacy data handling

#### D-04: Pure manual cleanup of `category="project"` thoughts
**Locked.** No special migration UI. Users assign legacy `category="project"` thoughts to real projects via the standard `ProjectPickerMenu` on each thought row. They're already accessible via the existing `category=project` filter.

**Why:** Single-user app, the legacy count is small. A migration banner adds a one-shot surface that disappears forever after first use. The standard menu is the same affordance and stays useful indefinitely. If the cleanup proves painful in retro, add a sidebar shortcut later.

### Sidebar structure

#### D-05: Unassigned row in the Projects section
**Locked.** Above the project list, inside the `Projects` sidebar section.

- New row: SF Symbol `tray`, label `Unassigned`, count capsule (same `.quaternaryLabelColor` pattern as other counts)
- Selecting it sets `viewModel.selectedFilter = .unassigned`
- Detail pane queries `GET /thoughts?unassigned=true` and renders the standard thought list
- New `CategoryFilter.unassigned` enum case alongside the existing `.all` and `.specific(category:)` and the Phase 53 `.project(id:)` case
- Visible whenever the Projects section is visible — does not toggle off if zero unassigned

**Why:** Without this, the user has no way to find orphaned thoughts after a project delete (which sets `project_id = NULL`). Critical recovery surface, costs nothing.

### Refresh + counts strategy

#### D-06: Lazy refresh — load + after-CRUD only
**Locked.** Projects list is fetched on dashboard load and refetched after every project create / edit / delete. No window-focus refresh, no polling timer.

- `viewModel.projects: [Project]` populated by `GET /projects` in `.task { await refresh() }` on `DashboardView`
- After `POST /projects`, `PATCH /projects/:id`, or `DELETE /projects/:id`: refetch the list before closing the sheet / dismissing the alert
- After `DELETE /projects/:id` specifically: also force-refetch the current thought list (the deleted project's thoughts now have `project_id = NULL` and may need to disappear from a project-scoped view or appear in the Unassigned view)

**Why:** Single-user app, no other client mutates the API. Polling adds noise without benefit.

#### D-07: Project thought counts derived client-side
**Locked.** Counts in the sidebar capsules are computed reactively from `viewModel.thoughts` (which holds the currently-loaded list) — group by `project_id`.

- This means the count reflects what's loaded, not the full server total. For Phase 53 the dashboard always loads the full thought list per filter, so client-side count is accurate.
- If the count ever feels stale or wrong, revisit and add server-side `thoughtCount` (see D-08).

#### D-08: No server-side `thoughtCount` field this phase
**Deferred.** Phase 52 D-07 deliberately deferred this. Phase 53 sticks with the client-side computation. Add a `thoughtCount` to the project response only if D-07 proves insufficient in daily use.

#### D-09: Optimistic project assignment with revert-on-failure
**Locked.** Already in UI-SPEC, restated here for the planner.

- Selecting a project from `ProjectPickerMenu` immediately:
  1. Updates the thought row's local `project_id`
  2. Decrements the old project's count (if any), increments the new project's count
  3. Fires `PATCH /thoughts/:id`
- On success: keep the optimistic state
- On failure: revert all three local changes, show row-level error toast (existing thought-row error pattern, copy from UI-SPEC)
- The thought row's existing modifier methods (used by re-categorize / re-triage) are the model — match them

### Claude's Discretion

- Exact Swift type for `project_id` on the local `Thought` model — match what the existing JSON decoder pattern expects (probably `Int64?` to mirror the server `serial`)
- Whether to add a dedicated `ProjectsService` actor or extend the existing dashboard view model — the planner picks based on existing service organization in `Sources/DailyBriefMonitor/Services/`
- Sheet field validation order and live vs on-submit validation — match `NewProjectSheet` UI-SPEC copy, but the trigger timing is open
- Whether `EditProjectSheet` is a separate file or a mode flag on `NewProjectSheet` — UI-SPEC suggests reusing the same form; the planner picks the cleanest Swift expression
- Keyboard shortcuts on the Projects section — none specified, planner can add `⌘N` for New Project inside the section context if it doesn't collide with existing shortcuts (planner verifies)
- Error toast plumbing in the thought row — use the existing pattern from re-categorize/re-triage failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI design contract (this phase)
- `.planning/phases/53-projects-dashboard-ui/53-UI-SPEC.md` — visuals, copy, component inventory, interaction contracts. Locked. Every planner and executor reads this first.

### Mac client — Dashboard surfaces being extended
- `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` — sidebar + detail patterns. The `Projects` section sits between existing `Tags` and `Brief History` sections.
- `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` — `@Observable`, `CategoryFilter` enum (extend with `.project(id:)` and `.unassigned`), `selectedFilter`, `selectedThoughtIds`, `.task { await refresh() }` lifecycle
- `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` — row-level Menu pattern (re-categorize, re-triage). The new `ProjectPickerMenu` plugs in here using the same pattern.
- `Sources/DailyBriefMonitor/Services/` — wherever the existing API client + thought repository lives. Add the projects API client here.

### Backend — routes being extended
- `vigil-core/src/routes/thoughts.ts` — add `projectId` / `unassigned` query params (D-01) and whitelist `project_id` in PATCH body (D-02). Gold-standard reference for validation, error shape, response shape.
- `vigil-core/src/routes/projects.ts` — created in Phase 52. Phase 53 only consumes; no changes.
- `vigil-core/src/db/schema.ts` — `projects` table + `thoughts.project_id` FK column shipped in Phase 52. No schema changes this phase.

### Phase 52 deliverables this phase consumes
- `.planning/phases/52-projects-backend/52-CONTEXT.md` — locked decisions, especially D-03 (`ON DELETE SET NULL`), D-04 (legacy `category="project"` untouched), D-07 (no `thoughtCount`)
- `.planning/phases/52-projects-backend/52-01-SUMMARY.md` and `52-02-SUMMARY.md` — what actually shipped (response shapes, error format, field names)

### Roadmap and requirements
- `.planning/ROADMAP.md` Phase 53 section — goal and 4 success criteria
- `.planning/REQUIREMENTS.md` PROJ-02 .. PROJ-05 — the requirements this phase satisfies

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`NavigationSplitView` sidebar Section pattern** — `DashboardView` already has Source / Date / Tags / Brief History sections. The Projects section reuses the same `Section { ... } header: { ... }` shape, count capsules, and `.padding(.vertical, 2)` row rhythm.
- **`@Observable DashboardViewModel`** — single source of truth for filters, selected ids, and the loaded thought list. Extend it with `projects: [Project]` and the new `CategoryFilter` cases rather than creating a parallel store.
- **Existing thought-row Menu pattern** — re-categorize and re-triage menus already live on `ThoughtRowView`. The `ProjectPickerMenu` is a sibling, not a redesign.
- **`emptyState` private view in `DashboardView`** — pattern reused (different copy + icon) for the project's empty-thoughts state.
- **`vigil-core/src/routes/thoughts.ts`** — the route already has the validation shape, the auth middleware wrap, and the response mapper. D-01 + D-02 are tiny diffs against this file.

### Established Patterns
- **API responses** — snake_case in DB / on the wire (Phase 52), camelCase in Swift via `JSONDecoder.keyDecodingStrategy = .convertFromSnakeCase` (or however the existing decoder is configured — planner verifies)
- **Validation in routes** — collect errors, return `400 { error: "<specific message>" }` on first failure (mirrors thoughts route)
- **Optimistic UI for thought mutations** — re-categorize and re-triage already do this; copy the pattern verbatim for project assignment

### Integration Points
- `DashboardView` sidebar — new `Section("Projects")` insertion point between Tags and Brief History
- `DashboardViewModel.CategoryFilter` enum — add `.project(id: Int64)` and `.unassigned` cases
- `DashboardViewModel.refresh()` — extend to fetch projects in parallel with thoughts
- `ThoughtRowView` row Menu — new `Menu("Project")` entry alongside existing menus
- `vigil-core/src/routes/thoughts.ts` GET handler — add query param parsing
- `vigil-core/src/routes/thoughts.ts` PATCH handler — extend whitelist + add FK existence check

</code_context>

<specifics>
## Specific Ideas

- The visual contract in `53-UI-SPEC.md` is non-negotiable. If the planner sees a conflict between this CONTEXT.md and UI-SPEC, UI-SPEC wins for visuals/copy/components and CONTEXT.md wins for behavior/data flow.
- Phase 52 made the FK index `idx_thoughts_project_id` — use it. The new `GET /thoughts?projectId=X` query should hit the index directly.
- The existing thought row's Menu has constrained vertical space. The Project submenu lazily renders the project list — if the user has 50 projects this should still feel snappy. Match the pattern used by Re-categorize (which also shows a list).
- Phase 52 D-04 says legacy `category="project"` thoughts stay queryable via `category=project`. The Projects section in the sidebar does NOT show those by default — they only appear once the user manually assigns them via the menu (see D-04 here).
- Validation errors on `NewProjectSheet` come in two flavors: client-side (empty name → instant feedback, no API call) and server-side (relayed from API error response → inline banner at top of sheet).

</specifics>

<deferred>
## Deferred Ideas

**Captured for the roadmap backlog — do NOT implement in Phase 53:**

- **Per-project color picker** — UI-SPEC already deferred this; status colors are sufficient for v2.3
- **Drag-and-drop thought-to-project assignment** — menu flow ships first, drag-drop after the menu is proven
- **Server-side `thoughtCount` on project responses** — defer per D-08; add only if client-side count proves insufficient
- **Bulk move thoughts between projects** — deferred unless retro shows the per-row menu is too slow
- **Project creation from the capture panel** — out of scope; capture stays frictionless, assignment happens during dashboard triage
- **Reordering projects** — alphabetical for v2.3; no sort order field in the schema
- **Archived project visual treatment beyond row opacity** — Status filter handles visibility
- **Migration banner / sidebar shortcut for legacy `category="project"` thoughts** — pure manual per D-04; revisit only if cleanup proves painful
- **Window-focus / polling refresh of projects** — single-user app, lazy refresh per D-06 is enough
- **Keyboard shortcut for `+ New Project`** — planner's discretion to add `⌘N` if no collision; not a hard requirement

</deferred>

---

*Phase: 53-projects-dashboard-ui*
*Context gathered: 2026-04-08 via interactive /gsd-discuss-phase*
