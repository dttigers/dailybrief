# Phase 53: Projects Dashboard UI — Research

**Researched:** 2026-04-07
**Domain:** Cross-stack feature — Hono/Drizzle backend route extensions + native SwiftUI dashboard surfaces consuming the Phase 52 projects API
**Confidence:** HIGH (codebase fully read; all integration points verified against actual files)

## Summary

Phase 53 is a two-wave cross-stack phase. **Wave 1** is a tiny vigil-core diff: extend the existing `/thoughts` route with `projectId=` / `unassigned=true` query params and accept a `projectId` field in the existing **PUT** handler (the server already uses PUT, not PATCH — see Risk R-1). Wave 2 is the SwiftUI dashboard work: add `projectId` to the `Thought` model + API DTO, add a `Project` model + `ProjectsAPIStore` actor, extend `DashboardViewModel` with `projects: [Project]` and two new `CategoryFilter` cases (`.project(id:)`, `.unassigned`), insert a `Projects` Section in `DashboardView` between Tags and Brief History, build `NewProjectSheet` (create + edit), and add a nested `Menu("Project")` to `ThoughtRowView.contextMenu` (a brand-new pattern at the row level — see Pitfall P-2).

The whole feature is built against existing patterns: `APIThoughtStore` is the gold reference for an actor-based repository; `DashboardView`'s sidebar Sections (Tags, Source, Date, etc.) are the visual template for the new Projects Section; `VigilAPIClient` already handles bearer auth, ISO 8601 dates, and 4xx/5xx error wrapping; the existing `emptyState` private view is the template for the project empty state.

**Primary recommendation:** Plan as 4 plans across 2 waves. Wave 1 = one plan: backend route extensions + smoke test. Wave 2 = three plans: (a) JarvisCore — Project model + ProjectsAPIStore + Thought.projectId field + APIThoughtStore plumbing + VigilAPIClient.patch helper; (b) DashboardViewModel + DashboardView Projects Section + filter wiring + delete confirmation; (c) NewProjectSheet + ThoughtRowView Project Menu + optimistic update + error toasts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Backend route extensions (Phase 53 Wave 1):**

- **D-01: `GET /thoughts` accepts `projectId` and `unassigned`** — Extends `vigil-core/src/routes/thoughts.ts` BEFORE any Mac UI plans run. New optional query params: `projectId=<int>` (filters `project_id = X`); `unassigned=true` (filters `project_id IS NULL`). Mutually exclusive — sending both returns `400 { error: "projectId and unassigned are mutually exclusive" }`. Combines with existing `category` and `q` filters via `AND`. No new index needed (Phase 52 created `idx_thoughts_project_id`). Mirrors existing query-param style.
- **D-02: `PATCH /thoughts/:id` accepts `project_id` (or `projectId`) in body** — Whitelist `project_id` (snake_case to match DB column) in the validator. Accepts `null` (unassign) or positive integer (assign). Validates referenced project exists when non-null; returns `400 { error: "project not found" }` if not. On success returns updated thought with `project_id` populated. Does NOT touch `category`. **NOTE:** CONTEXT says "PATCH" but the actual server uses PUT — see Risk R-1.
- **D-03: Wave 1 backend ships first (gating)** — Wave 1: backend route extensions (D-01 + D-02) with smoke tests. Wave 2: Mac UI plans depending on Wave 1. Wave 3 (optional): polish/edge-case plan if Wave 2 produces too many tasks.

**Legacy data:**

- **D-04: Pure manual cleanup of `category="project"` thoughts** — No special migration UI. Users assign legacy thoughts via the standard `ProjectPickerMenu`. Already accessible via existing `category=project` filter.

**Sidebar:**

- **D-05: Unassigned row in Projects section** — Above the project list. SF Symbol `tray`, label `Unassigned`, count capsule. Selecting → `viewModel.selectedFilter = .unassigned`. Detail pane queries `GET /thoughts?unassigned=true`. New `CategoryFilter.unassigned` enum case. Visible always (does not toggle off if zero unassigned).

**Refresh + counts:**

- **D-06: Lazy refresh — load + after-CRUD only** — Projects fetched on dashboard load and refetched after every project create/edit/delete. No window-focus refresh, no polling. After DELETE: also force-refetch the current thought list.
- **D-07: Project thought counts derived client-side** — Computed reactively from `viewModel.thoughts` grouped by `project_id`. Reflects what's loaded.
- **D-08: No server-side `thoughtCount` this phase** — Deferred.
- **D-09: Optimistic project assignment with revert-on-failure** — Selecting a project from `ProjectPickerMenu` immediately: (1) updates local `project_id`, (2) decrements old project's count / increments new, (3) fires PUT. On success keep optimistic state. On failure: revert all three changes, show row-level error toast (UI-SPEC copy).

### Claude's Discretion

- Exact Swift type for `project_id` on local `Thought` model — **recommendation: `Int64?`** to mirror server `serial` and match existing `id: Int64?` convention
- Whether to add a dedicated `ProjectsService` actor or extend `DashboardViewModel` — **recommendation: dedicated `ProjectsAPIStore` actor** mirroring `APIThoughtStore`. View model holds `projects: [Project]` but delegates I/O to the actor. This matches the existing `ThoughtRepository` separation cleanly.
- Sheet field validation order and live vs on-submit validation — match `NewProjectSheet` UI-SPEC copy, trigger timing open
- Whether `EditProjectSheet` is separate file or mode flag on `NewProjectSheet` — **recommendation: single `NewProjectSheet` with a `mode: Mode` enum** (`.create` / `.edit(Project)`); button label and submit handler switch on the mode. Same form, less code.
- Keyboard shortcuts on the Projects section — none specified, planner can add `⌘N` if no collision
- Error toast plumbing in the thought row — **see Risk R-3**: there is NO existing row-level error toast pattern. Existing failures (re-triage, re-categorize) are silently logged via `NSLog`. The "use the existing pattern" instruction can't be followed literally. The planner must invent a minimal toast surface, OR fall back to inline state on the row.

### Deferred Ideas (OUT OF SCOPE)

- Per-project color picker, drag-and-drop assignment, bulk move-to-project, server-side `thoughtCount`, project creation from capture panel, project reordering, archived project visual treatment beyond row opacity, migration banner for legacy thoughts, window-focus / polling refresh, keyboard shortcut for `+ New Project` (planner discretion if no collision)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-02 | Each project has its own dashboard view showing only the thoughts assigned to it | Wave 1 GET `/thoughts?projectId=X` query param + Wave 2 `CategoryFilter.project(id:)` case + `APIThoughtStore.fetchFiltered` extension to pass `projectId` query |
| PROJ-03 | User can manually assign any thought to a project (or leave it unassigned) from the dashboard | Wave 1 PUT `/thoughts/:id` whitelist `project_id` + Wave 2 `ProjectPickerMenu` nested in `ThoughtRowView.contextMenu` + `Thought.projectId` field + optimistic update path in DashboardViewModel |
| PROJ-04 | User can move a thought between projects or unassign it | Same path as PROJ-03 — single PUT call sets `project_id` to a new int (move) or `null` (unassign). Optimistic decrement-old / increment-new bookkeeping in DashboardViewModel |
| PROJ-05 | Each project has an optional status (active / archived / done) that filters dashboard views | `ProjectStatusFilter` segmented Picker inside Projects sidebar section. Filter operates on the in-memory `projects: [Project]` array — no API roundtrip. Status field already exists in Phase 52 schema and route response |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` file exists in the repository. No `.claude/skills/` or `.agents/skills/` directory exists. No additional project-level enforcement rules to honor beyond what is in CONTEXT.md and UI-SPEC.md.

## Standard Stack

This phase introduces **zero new dependencies** on either side of the stack. Everything reuses existing libraries.

### Backend (vigil-core, already present)

| Library | Version (lockfile) | Purpose | Why |
|---------|-------------------|---------|-----|
| Hono | already installed | HTTP router | Existing convention; matches `routes/thoughts.ts` and `routes/projects.ts` |
| Drizzle ORM | already installed | Query builder + types | Already used everywhere; the FK column from Phase 52 (`thoughts.projectId`) is already in `schema.ts` |
| `drizzle-orm` operators (`eq`, `and`, `ne`, `isNull`, `sql`) | already imported in thoughts.ts | WHERE clause composition | `isNull` is needed for the `unassigned=true` branch but is NOT yet imported in `thoughts.ts` — planner adds it [VERIFIED: read of file lines 1-5] |

### Mac client (JarvisCore + DailyBriefMonitor, already present)

| Library | Purpose | Why standard |
|---------|---------|--------------|
| SwiftUI (`NavigationSplitView`, `List(selection:)`, `Section`, `Menu`, `Picker(.segmented)`, `.sheet`, `.alert`, `Button(role: .destructive)`) | All UI surfaces in this phase | Existing dashboard convention; UI-SPEC explicitly forbids new visual language |
| SF Symbols (`tray`, `folder`, `plus.circle.fill`, `circle`, `checkmark.circle.fill`, `archivebox`, `circle.dotted`, `xmark.circle`) | Iconography per UI-SPEC | Locked in UI-SPEC Status Color Mapping |
| `@Observable` macro (Swift 5.9+ / macOS 14+) | DashboardViewModel state | Existing pattern in `DashboardViewModel.swift` line 46 |
| `VigilAPIClient` (existing actor) | HTTP I/O for projects API | Existing client; need to add a `patch` helper — see "Don't Hand-Roll" below |

**No `npm install` or `swift package add` is required.** The phase is purely additive code.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `APIThoughtStore` and adding `ProjectsAPIStore` | Putting project I/O directly in `DashboardViewModel` | Direct in VM is faster to write but breaks the existing `actor`-based repository abstraction. The `ThoughtRepository` protocol exists exactly so the VM doesn't know about HTTP. **Recommend: keep the abstraction** — add a new `ProjectsRepository` protocol + `ProjectsAPIStore` actor. |
| Server-side `isNull` filter | Application-level `WHERE project_id IS NULL` SQL | Drizzle's `isNull(thoughtsTable.projectId)` is the idiomatic option and emits the same SQL. Use `isNull`. |
| New PATCH endpoint for `/thoughts/:id` | Extend existing PUT handler to whitelist `projectId` | UI-SPEC and CONTEXT D-02 say "PATCH" but the server uses PUT for thought updates. Adding a new PATCH route doubles the surface. **Recommend: extend existing PUT.** Document the spec discrepancy so UI-SPEC can be aligned in a follow-up edit. |

## Architecture Patterns

### Recommended File Layout

```
vigil-core/src/routes/
└── thoughts.ts              # MODIFY — extend GET query params, extend PUT body whitelist + FK check

Sources/JarvisCore/Models/
└── Project.swift            # NEW — public struct Project: Codable, Sendable, Identifiable, Hashable

Sources/JarvisCore/Models/
└── Thought.swift            # MODIFY — add `public var projectId: Int64?`

Sources/JarvisCore/Storage/
├── ProjectsRepository.swift # NEW — public protocol ProjectsRepository: Actor (CRUD + list)
├── ProjectsAPIStore.swift   # NEW — public actor ProjectsAPIStore: ProjectsRepository (mirrors APIThoughtStore)
└── APIThoughtStore.swift    # MODIFY — add projectId to APIThoughtResponse + UpdateThoughtBody;
                             #           add projectId/unassigned params to fetchFiltered;
                             #           add updateProjectId(id:projectId:) method

Sources/JarvisCore/Services/
└── VigilAPIClient.swift     # MODIFY — add `patch<T,B>(path:body:)` helper (mirrors `put`)

Sources/DailyBriefMonitor/Dashboard/
├── DashboardViewModel.swift # MODIFY — extend CategoryFilter enum (.project, .unassigned);
                             #           add `projects: [Project]`, `projectStatusFilter`,
                             #           CRUD methods, optimistic assignProject(thought:projectId:)
├── DashboardView.swift      # MODIFY — insert ProjectsSection between Tags and Brief History;
                             #           add project-empty-state private view
├── ThoughtRowView.swift     # MODIFY — add nested Menu("Project") inside .contextMenu;
                             #           plumb new closures (onAssignProject, onUnassignProject, onCreateAndAssign)
└── NewProjectSheet.swift    # NEW — sheet for create + edit (mode enum)

Sources/DailyBriefMonitor/
└── AppDelegate.swift        # MODIFY — instantiate ProjectsAPIStore alongside APIThoughtStore;
                             #           inject into DashboardViewModel
```

### Pattern 1: Hono Route Extension — query param parsing (D-01)

The existing `GET /thoughts` handler builds a `conditions: SQL[]` array and ANDs them together. The new params slot in identically.

```typescript
// Source: vigil-core/src/routes/thoughts.ts lines 56-145 [VERIFIED: full file read]

// ADD to imports at line 5:
import { eq, and, ne, gte, lte, desc, count, sql, isNull } from "drizzle-orm";

// INSIDE the GET handler, after the existing query reads (around line 71):
const projectIdParam = c.req.query("projectId");
const unassignedParam = c.req.query("unassigned");

// Mutual-exclusion check — fail-fast like the date validation above:
if (projectIdParam !== undefined && unassignedParam === "true") {
  return c.json(
    { error: "projectId and unassigned are mutually exclusive" },
    400,
  );
}

// Parse + validate projectId:
let projectIdNum: number | undefined;
if (projectIdParam !== undefined) {
  projectIdNum = Number(projectIdParam);
  if (!Number.isInteger(projectIdNum) || projectIdNum <= 0) {
    return c.json({ error: "projectId must be a positive integer" }, 400);
  }
}

// INSIDE the conditions builder (after the existing `if (favoritesOnly === "true")` block):
if (projectIdNum !== undefined) {
  conditions.push(eq(thoughtsTable.projectId, projectIdNum));
}
if (unassignedParam === "true") {
  conditions.push(isNull(thoughtsTable.projectId));
}
```

### Pattern 2: Hono Route Extension — PUT body whitelist + FK check (D-02)

The existing PUT handler at `vigil-core/src/routes/thoughts.ts` lines 219-282 already builds a `Partial<typeof thoughtsTable.$inferInsert>` updates object. The new field plugs in identically, but with one extra step: an FK existence check.

```typescript
// Source: vigil-core/src/routes/thoughts.ts lines 219-282 [VERIFIED]
// At top of file, ADD to imports:
import { projects as projectsTable } from "../db/schema.js";

// INSIDE the PUT handler, AFTER the existing existence check (line 237) and AFTER body parse:

// Validation block — accept "projectId" (camelCase, matching the rest of the API) AND tolerate "project_id"
// for safety. Per D-02 the wire field is project_id but UI-SPEC sends projectId — accept both, prefer
// projectId if both present.
let projectIdUpdate: number | null | undefined = undefined;
const rawProjectId =
  body.projectId !== undefined ? body.projectId :
  body.project_id !== undefined ? body.project_id :
  undefined;

if (rawProjectId !== undefined) {
  if (rawProjectId === null) {
    projectIdUpdate = null; // explicit unassign
  } else if (typeof rawProjectId === "number" && Number.isInteger(rawProjectId) && rawProjectId > 0) {
    // FK existence check — single-row select
    const projectExists = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, rawProjectId))
      .limit(1);
    if (projectExists.length === 0) {
      return c.json({ error: "project not found" }, 400);
    }
    projectIdUpdate = rawProjectId;
  } else {
    return c.json({ error: "projectId must be a positive integer or null" }, 400);
  }
}

// Then in the updates assembly (around line 257):
if (projectIdUpdate !== undefined) updates.projectId = projectIdUpdate;
```

**Critical:** The check `projectIdUpdate !== undefined` is what distinguishes "field absent in body" from "field is null in body". JavaScript `undefined` == "no key in JSON" since `JSON.parse` does not create keys for missing fields. JSON `null` parses to JavaScript `null`. The TypeScript code must use this strict undefined check throughout — see Pitfall P-1.

Also: the existing `toResponse` mapper at lines 35-52 does NOT include `projectId`. **MUST add `projectId: row.projectId` to the response interface and mapper** so the field round-trips. The Phase 52 SUMMARY confirms `thoughts.projectId` exists in the Drizzle schema.

### Pattern 3: SwiftUI Repository Actor (mirror of `APIThoughtStore`)

```swift
// Source pattern: Sources/JarvisCore/Storage/APIThoughtStore.swift [VERIFIED — 515 lines read]

// Sources/JarvisCore/Models/Project.swift — NEW
import Foundation

public enum ProjectStatus: String, Codable, Sendable, CaseIterable {
    case active
    case archived
    case done
}

public struct Project: Codable, Sendable, Identifiable, Hashable {
    public var id: Int64
    public var name: String
    public var description: String?
    public var status: ProjectStatus?
    public var createdAt: Date
    public var updatedAt: Date

    public init(id: Int64, name: String, description: String? = nil,
                status: ProjectStatus? = nil, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id; self.name = name; self.description = description
        self.status = status; self.createdAt = createdAt; self.updatedAt = updatedAt
    }
}

// Sources/JarvisCore/Storage/ProjectsRepository.swift — NEW
public protocol ProjectsRepository: Actor {
    func listProjects() async throws -> [Project]
    func createProject(name: String, description: String?, status: ProjectStatus?) async throws -> Project
    func updateProject(id: Int64, name: String?, description: String?, status: ProjectStatus?) async throws -> Project
    func deleteProject(id: Int64) async throws
}

// Sources/JarvisCore/Storage/ProjectsAPIStore.swift — NEW
public actor ProjectsAPIStore: ProjectsRepository {
    private let client: VigilAPIClient

    public init(client: VigilAPIClient) { self.client = client }

    private struct APIProjectResponse: Decodable, Sendable {
        let id: Int64
        let name: String
        let description: String?
        let status: String?
        let createdAt: Date  // VigilAPIClient's custom decoder handles ISO 8601
        let updatedAt: Date
    }

    private func toProject(_ r: APIProjectResponse) -> Project {
        Project(id: r.id, name: r.name, description: r.description,
                status: r.status.flatMap { ProjectStatus(rawValue: $0) },
                createdAt: r.createdAt, updatedAt: r.updatedAt)
    }

    public func listProjects() async throws -> [Project] {
        let response: [APIProjectResponse] = try await client.get(path: "/projects")
        return response.map(toProject)
    }

    private struct CreateProjectBody: Encodable {
        let name: String
        let description: String?
        let status: String?
    }

    public func createProject(name: String, description: String?, status: ProjectStatus?) async throws -> Project {
        let body = CreateProjectBody(name: name, description: description, status: status?.rawValue)
        let r: APIProjectResponse = try await client.post(path: "/projects", body: body)
        return toProject(r)
    }

    private struct UpdateProjectBody: Encodable {
        let name: String?
        let description: String?
        let status: String?
    }

    public func updateProject(id: Int64, name: String?, description: String?, status: ProjectStatus?) async throws -> Project {
        let body = UpdateProjectBody(name: name, description: description, status: status?.rawValue)
        let r: APIProjectResponse = try await client.patch(path: "/projects/\(id)", body: body)  // NEW patch helper
        return toProject(r)
    }

    public func deleteProject(id: Int64) async throws {
        try await client.delete(path: "/projects/\(id)")
    }
}
```

**Note on JSONDecoder dates:** VigilAPIClient uses a `dateDecodingStrategy = .custom` block (lines 56-71) that handles ISO 8601 with and without fractional seconds. So `createdAt: Date` decodes correctly automatically. **There is NO snake_case conversion** — the server already returns camelCase keys via its `toResponse` mapper.

### Pattern 4: VigilAPIClient `patch` helper (NEW — must add)

```swift
// Source: Sources/JarvisCore/Services/VigilAPIClient.swift lines 140-148 (existing put helper) [VERIFIED]

/// Perform a PATCH request with a JSON body and decode the response.
public func patch<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
    var request = URLRequest(url: baseURL.appendingPathComponent(path))
    request.httpMethod = "PATCH"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    applyHeaders(&request)
    request.httpBody = try encodeBody(body)
    return try await perform(request)
}
```

This is a verbatim copy of the existing `put` method with `httpMethod = "PATCH"`. Required because the projects router uses PATCH (not PUT) for `/projects/:id`. The thoughts router still uses PUT for `/thoughts/:id`, so the existing `put` helper continues to be used for thought updates including `projectId` assignment.

### Pattern 5: SwiftUI sidebar Section — copy the `Tags` section structure

The closest existing analog is `Section("Tags")` at `DashboardView.swift` lines 263-291 [VERIFIED]. It has the exact pattern the Projects Section needs: a header label, a `ForEach` over a dynamic list, an empty-state branch (`if viewModel.allTags.isEmpty { Text("No tags yet") }`), per-row Button-as-row with `.buttonStyle(.plain)`, `.padding(.vertical, 2)`, opacity for selected state.

```swift
// Insert AFTER the Tags section (line 291) and BEFORE the Brief History section (line 294).

Section("Projects") {
    // Header CTA — "+ New Project" (UI-SPEC copy)
    Button {
        showingNewProjectSheet = true
    } label: {
        HStack(spacing: 6) {
            Image(systemName: "plus.circle.fill")
                .font(.caption)
                .foregroundStyle(.tint)
            Text("New Project")
                .font(.subheadline)
            Spacer()
        }
    }
    .buttonStyle(.plain)
    .padding(.vertical, 2)

    // Status filter — segmented Picker (UI-SPEC: All / Active / Done / Archived)
    Picker("Status", selection: $viewModel.projectStatusFilter) {
        Text("All").tag(ProjectStatusFilter.all)
        Text("Active").tag(ProjectStatusFilter.active)
        Text("Done").tag(ProjectStatusFilter.done)
        Text("Archived").tag(ProjectStatusFilter.archived)
    }
    .pickerStyle(.segmented)
    .padding(.vertical, 2)

    // Unassigned row (D-05) — always visible
    Label {
        HStack {
            Text("Unassigned")
            Spacer()
            Text("\(viewModel.unassignedCount)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color(nsColor: .quaternaryLabelColor))
                .clipShape(Capsule())
        }
    } icon: {
        Image(systemName: "tray")
            .foregroundStyle(.secondary)
    }
    .tag(CategoryFilter.unassigned)

    // Project rows
    if viewModel.filteredProjects.isEmpty {
        Text("No projects yet")
            .font(.caption)
            .foregroundStyle(.secondary)
    } else {
        ForEach(viewModel.filteredProjects) { project in
            Label {
                HStack {
                    Text(project.name)
                        .lineLimit(1)
                    Spacer()
                    Text("\(viewModel.projectThoughtCounts[project.id] ?? 0)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(nsColor: .quaternaryLabelColor))
                        .clipShape(Capsule())
                }
            } icon: {
                Image(systemName: project.statusSymbol)
                    .foregroundStyle(project.statusColor)
                    .font(.caption)
            }
            .tag(CategoryFilter.project(id: project.id))
            .opacity(project.status == .archived ? 0.6 : 1.0)
            .contextMenu {
                Button {
                    editingProject = project
                } label: { Label("Edit…", systemImage: "pencil") }
                Menu("Set status") {
                    Button("Active") { Task { await viewModel.setProjectStatus(project, .active) } }
                    Button("Done") { Task { await viewModel.setProjectStatus(project, .done) } }
                    Button("Archived") { Task { await viewModel.setProjectStatus(project, .archived) } }
                }
                Divider()
                Button(role: .destructive) {
                    pendingProjectDelete = project
                } label: { Label("Delete…", systemImage: "trash") }
            }
        }
    }
}
```

### Pattern 6: ThoughtRowView nested Menu

The existing `.contextMenu` block at `ThoughtRowView.swift` lines 340-390 is a flat list of `Button`s — there is **no existing nested Menu pattern** at the row level. The bulk action bar in `DashboardView` lines 602-612 has a `Menu { ForEach(ThoughtCategory.allCases) ... }` for re-categorize, but that's at the toolbar level, not the row.

**This is a brand-new pattern.** SwiftUI does support nested `Menu` inside `.contextMenu` natively — just nest the `Menu` view as a peer to the existing Buttons:

```swift
// Insert in ThoughtRowView.swift contextMenu block, after the Re-categorize Button
// (around line 371) and before the Re-classify therapy block.

if !availableProjects.isEmpty || onCreateAndAssignProject != nil {
    Menu {
        // "Currently: …" disabled label when assigned (UI-SPEC)
        if let assignedId = thought.projectId,
           let current = availableProjects.first(where: { $0.id == assignedId }) {
            Section {
                Text("Currently: \(current.name)")
                    .font(.caption)
            }
        }

        ForEach(availableProjects) { project in
            Button(project.name) {
                onAssignProject?(project.id)
            }
        }

        if thought.projectId != nil {
            Divider()
            Button {
                onUnassignProject?()
            } label: {
                Label("Unassign", systemImage: "xmark.circle")
            }
        }

        Divider()
        Button {
            onCreateAndAssignProject?()
        } label: {
            Label("+ New Project…", systemImage: "plus")
        }
    } label: {
        Label("Project", systemImage: "folder")
    }
}
```

The closures `onAssignProject: ((Int64) -> Void)?`, `onUnassignProject: (() -> Void)?`, `onCreateAndAssignProject: (() -> Void)?`, and `availableProjects: [Project]` are added to `ThoughtRowView`'s public properties (mirroring how `onRetriage`, `onReClassify`, `allUniqueTags` are already plumbed at lines 31-46).

### Anti-Patterns to Avoid

- **Adding a new `PATCH /thoughts/:id` route** instead of extending the existing PUT. The thoughts route already accepts partial updates via PUT (despite being named PUT — the handler builds an `updates` object only from fields present in the body). Doubling the surface fragments the API.
- **Doing project I/O directly inside `DashboardViewModel`**. There is a clean `actor`-based repository abstraction (`ThoughtRepository` + `APIThoughtStore`). The Projects feature should follow the same pattern, not bypass it.
- **Using `JSONDecoder.keyDecodingStrategy = .convertFromSnakeCase` in a separate decoder for projects.** The existing `VigilAPIClient` decoder does NOT do snake_case conversion — it expects the server to send camelCase. The Phase 52 projects route already returns camelCase keys (`createdAt`, `updatedAt`). Don't introduce a divergent decoder.
- **Forgetting to add `projectId` to the existing `APIThoughtResponse` struct + `toThought` mapper in `APIThoughtStore.swift`.** Without this, the field comes back from the server but is silently dropped at the decoder boundary, and the dashboard will think every thought is unassigned forever.
- **Encoding `projectId: nil` and expecting the server to ignore it.** Swift's default `JSONEncoder` encodes `Optional.none` as JSON `null`, not as "key absent". So `UpdateThoughtBody(projectId: nil)` sends `{"projectId": null}`, which the server will interpret as "unassign" (not "leave alone"). This is the right semantic for the explicit unassign call but breaks any other PUT path (like `cycleTaskStatus` → `updateTaskStatus`) that doesn't intend to touch projectId. **Solution:** Add `projectId` to a new dedicated `AssignProjectBody` struct used ONLY by the assignment path; do NOT add it to the catch-all `UpdateThoughtBody`. Or use two separate Swift bodies with `encodeIfPresent` semantics (manual `encode(to:)` implementation).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client with bearer auth + ISO 8601 dates | A new URLSession wrapper | `VigilAPIClient` (add `patch` helper as 8-line copy of `put`) | Already handles auth, error wrapping (`VigilAPIError.httpError`), `serverUnavailable` mapping for `URLError.cannotConnectToHost`/`.timedOut`, and ISO 8601 with/without fractional seconds |
| Date parsing | A new `ISO8601DateFormatter` | The custom decoder block in `VigilAPIClient` lines 56-71 | Handles both fractional and non-fractional ISO 8601; reused everywhere |
| Drizzle WHERE composition | Raw SQL strings | `eq` / `and` / `isNull` from `drizzle-orm` | Existing convention; `isNull(thoughtsTable.projectId)` is the canonical spelling for the `unassigned=true` branch |
| Hono route mounting | A new sub-app | The existing `app.route("/v1", thoughts)` mount in `vigil-core/src/index.ts` | Phase 53 modifies existing routes — no new mount needed for Wave 1 |
| FK existence check | A trigger or stored proc | An app-level `SELECT id FROM projects WHERE id = $1 LIMIT 1` before update | Mirrors how `projects.ts` lines 137-145 already does the existence check before PATCH |
| Sidebar count capsule | A custom shape | The existing `.background(Color(nsColor: .quaternaryLabelColor)).clipShape(Capsule())` pattern at `DashboardView.swift` lines 132-138 | Locked by UI-SPEC; reused verbatim everywhere in the sidebar |
| Status confirmation alert | A custom modal | `.alert(_:isPresented:presenting:actions:message:)` | Native SwiftUI; matches UI-SPEC "native Alert" requirement |

**Key insight:** This phase is almost entirely "extend the existing thing", not "build a new thing". The only genuinely new file is `NewProjectSheet.swift` and the new `Project*.swift` model/store/protocol files in JarvisCore. Everything else is line-level edits to known files.

## Common Pitfalls

### Pitfall P-1: JSON `undefined` vs `null` semantics in PUT body whitelist
**What goes wrong:** TypeScript code uses `if (body.projectId !== undefined)` to gate "the client sent this field". JSON parsing gives `undefined` for absent keys and `null` for explicit `null`. Swift's default `JSONEncoder.encode(Optional.none)` → JSON `null`, not absent. So a Swift call site that passes `nil` for projectId gets interpreted as "unassign", not "leave alone".
**Why it happens:** Swift and JavaScript have different defaults for encoding optionals.
**How to avoid:** On the server, the gate stays `!== undefined` (correct for "is the key present"). On the client, use TWO separate body structs:
- `AssignProjectBody { let projectId: Int64? }` — used only by the explicit assign/unassign path; `nil` correctly maps to JSON `null` = unassign
- The existing `UpdateThoughtBody` — do NOT add `projectId` to it. None of its existing call sites should ever touch projectId.
**Warning sign:** A re-categorize or task-status-toggle call inadvertently clears the project assignment.

### Pitfall P-2: There is no existing nested-Menu pattern in `ThoughtRowView`
**What goes wrong:** CONTEXT D-09 and the user task description say "use the existing thought-row error pattern" and "match the pattern used by Re-categorize". But the existing `ThoughtRowView.contextMenu` (lines 340-390 [VERIFIED]) is a flat list of Buttons. The "Re-categorize" entry is a single Button that calls `onRetriage` (an AI re-triage action). There is NO existing `Menu` inside `.contextMenu` at the row level.
**Why it happens:** The user is conflating the bulk-action toolbar Menu (which IS a nested Menu, at lines 602-612 of DashboardView.swift) with the row-level context menu (which is not).
**How to avoid:** Plan Pattern 6 above as a brand-new pattern. SwiftUI supports it natively (`Menu` inside `.contextMenu` works), but verify on macOS 14+ at execution time. Reference: Apple docs on `ContextMenu` allow any Views including `Menu`.
**Warning sign:** Compiler accepts the code but the submenu doesn't expand on click — this is rare on macOS but worth a manual smoke test.

### Pitfall P-3: There is no existing row-level error toast pattern
**What goes wrong:** UI-SPEC and CONTEXT D-09 say "show row-level error toast (existing thought-row error pattern)". But the existing failure paths in `DashboardViewModel` (`reTriageThought`, `cycleTaskStatus`, `toggleFavorite`, `addTag`, etc., lines 348-918) all use `NSLog(...)` and silently swallow errors. There IS no toast surface to copy from.
**Why it happens:** The dashboard was built with optimistic-success assumptions; failures were always treated as "log and move on" because the local GRDB store didn't fail in practice.
**How to avoid:** The planner must invent a minimal error surface specifically for this phase. **Recommended approach:** Add an `assignmentError: (thoughtId: Int64, message: String)?` field to `DashboardViewModel`. Render it as an inline `HStack { Image(systemName: "exclamationmark.triangle.fill"); Text(message); Button("Dismiss") }` ABOVE the row in the List, similar to how `viewModel.importErrors` is rendered at `DashboardView.swift` lines 495-518. This is the existing closest analog. Auto-dismiss after 4 seconds via a `Task.sleep`. Document this as a new pattern that subsequent phases should adopt for other row-level failures.
**Warning sign:** Copy-paste of any "error toast" idiom from elsewhere in the codebase will fail because none exists.

### Pitfall P-4: Mac client points at Railway production
**What goes wrong:** `AppConfig.swift` lines 14-29 [VERIFIED] hard-defaults `apiBaseUrl` to `https://vigil-core-production.up.railway.app/v1`. The launchd-managed local vigil-core on port 3001 has no DATABASE_URL (per Phase 52-02 SUMMARY). So Wave 1 backend changes deploy to PRODUCTION the moment the SQL/route changes hit `main` and Railway redeploys. Wave 2 Mac code is then verified against production.
**Why it happens:** Local-server-with-no-db is a deliberate config from Phase 39+; all data flows through Railway.
**How to avoid:** Wave 1 plan must explicitly note: "merging to main triggers Railway auto-deploy. Smoke-test against `https://vigil-core-production.up.railway.app/v1` before merging Wave 2." The Phase 52-02 smoke test pattern (one-off `node dist/index.js` on port 3098 with `DATABASE_PUBLIC_URL`) is the model for pre-merge validation.
**Warning sign:** Wave 2 plans assume a local dev server they can change without consequences. There isn't one for vigil-core; everything is prod.

### Pitfall P-5: Forgetting the `toResponse` mapper
**What goes wrong:** Server adds `projectId` to the GET filter and the PUT whitelist, but the `toResponse` function at `thoughts.ts` lines 35-52 still returns the old shape. Clients see `null` projectId on every fetch even after a successful assign.
**Why it happens:** The mapper is easy to overlook because it's a private helper, not part of the route signature.
**How to avoid:** Plan task explicitly says "modify `ThoughtApiResponse` interface AND `toResponse` function — both must include `projectId: row.projectId`".
**Warning sign:** Smoke test does `PUT /thoughts/77 { projectId: 4 }` → 200, then `GET /thoughts/77` → response missing `projectId`. The DB has the value but the API hides it.

### Pitfall P-6: Optimistic update revert math
**What goes wrong:** Optimistic assign decrements old project's count, increments new project's count. On error, the revert must undo both — but if the user clicks fast and queues a second assign before the first error returns, the counts diverge.
**Why it happens:** Counts are derived from `viewModel.thoughts` (D-07). If `thoughts` is mutated optimistically, the derived counts are inherently consistent. So the safer pattern is to mutate ONLY `thoughts[index].projectId`, let counts re-derive, and on error mutate it back. Don't maintain a separate `projectThoughtCounts` cache that has to be kept in sync.
**How to avoid:** Compute `projectThoughtCounts` as a SwiftUI computed property over `thoughts`, not a stored dict. The Tags section already does this conceptually (`viewModel.allTags` is computed once on `loadCounts`, but the display is purely declarative).
**Warning sign:** Counts drift from reality after several rapid assigns. Refresh fixes it but there shouldn't be drift.

### Pitfall P-7: `CategoryFilter` exhaustive switch breakage
**What goes wrong:** Adding `.project(id: Int64)` and `.unassigned` cases to `CategoryFilter` breaks every exhaustive switch. There is currently exactly ONE switch on `CategoryFilter`: the computed property `var category: ThoughtCategory?` at `DashboardViewModel.swift` lines 10-15 [VERIFIED]. The switch must add the new cases to return `nil` (since project filters are NOT category filters).
**Why it happens:** Swift's exhaustive switch is the right behavior — it surfaces the work that must be done. Just need to find every site.
**How to avoid:** Grep for `case .all` and `case .specific` across `Sources/` before claiming completion. There are also implicit dependencies: the `loadThoughts` call path at lines 199-324 reads `selectedFilter.category` to decide which fetch method to use. The new cases need explicit handling — `.project(id:)` calls a NEW `fetchByProject(id:)` path; `.unassigned` calls a NEW `fetchUnassigned()` path. Both bypass the `category == .task` and `category == .therapy` special branches.
**Warning sign:** Compiler error in `performLoadThoughts`. Good — it's telling you what to fix.

## Runtime State Inventory

This phase involves modifications to a deployed service plus client schema changes. Inventory:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 52 already added `thoughts.project_id` column (nullable, all NULL) and `idx_thoughts_project_id` index on Railway PostgreSQL. The 4 existing `category="project"` thoughts have `project_id=NULL` per Phase 52-01 verification. No data migration needed. | Code-only changes; existing rows unaffected |
| Live service config | Railway vigil-core deployment auto-deploys on `git push origin main` (per `project_railway_deploy` memory). The `Dockerfile` `CMD` runs `node dist/db/migrate.js && node dist/index.js` so Drizzle migrations apply automatically — but Phase 53 has NO new migrations (the column exists). Only code changes. | None — code-only deploy via existing CI |
| OS-registered state | LaunchAgent `com.jamesonmorrill.vigilcore.plist` runs the local on-disk vigil-core on port 3001 with NO `DATABASE_URL` set (per Phase 52-02 SUMMARY) — it's effectively a dev server that never touches the DB. Mac app talks to Railway directly. | None — local launchd plist is unaffected by route changes |
| Secrets/env vars | Railway `DATABASE_URL`, `DATABASE_PUBLIC_URL`, `VIGIL_API_BEARER_TOKEN`, `ANTHROPIC_API_KEY` already configured. Mac client `~/.config/dailybrief/config.json` has `apiBaseUrl` (defaults to Railway prod) and `apiKey` (bearer token). No new secrets needed. | None |
| Build artifacts | `vigil-core/dist/` is rebuilt by Railway on deploy. Mac `.build/` is rebuilt by `swift build`. No stale artifacts referencing old types — Phase 53 only adds fields, doesn't rename. | None — clean rebuild on next `swift build` and next Railway deploy |

**Nothing in any category requires migration scripts or manual remediation.** Phase 53 is a pure additive code change.

## Common Pitfalls (already covered above — see P-1 through P-7)

## Code Examples

### Example 1: Drizzle `isNull` for the unassigned filter

```typescript
// Source: drizzle-orm exports — verified via existing imports in projects.ts and thoughts.ts
import { isNull } from "drizzle-orm";

// Inside the conditions builder:
if (unassignedParam === "true") {
  conditions.push(isNull(thoughtsTable.projectId));
}
```

### Example 2: Mac client calling the new GET filters

```swift
// Source: Sources/JarvisCore/Storage/APIThoughtStore.swift fetchFiltered pattern lines 216-237 [VERIFIED]
// Add a new method (mirrors fetchFiltered):

public func fetchByProject(id: Int64, limit: Int = 200) async throws -> [Thought] {
    let query: [String: String] = [
        "projectId": "\(id)",
        "limit": "\(limit)"
    ]
    let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
    return response.data.map(toThought)
}

public func fetchUnassigned(limit: Int = 200) async throws -> [Thought] {
    let query: [String: String] = [
        "unassigned": "true",
        "limit": "\(limit)"
    ]
    let response: PaginatedResponse<APIThoughtResponse> = try await client.get(path: "/thoughts", query: query)
    return response.data.map(toThought)
}
```

These methods need to be added to the `ThoughtRepository` protocol with default `limit` parameters.

### Example 3: Optimistic assign with revert

```swift
// Source pattern: matches the structure of cycleTaskStatus (lines 348-363 of DashboardViewModel.swift)
// but with explicit local mutation BEFORE the await, and revert in catch.

func assignThoughtToProject(thoughtId: Int64, projectId: Int64?) async {
    guard let index = thoughts.firstIndex(where: { $0.id == thoughtId }) else { return }
    let oldProjectId = thoughts[index].projectId

    // Optimistic update
    thoughts[index].projectId = projectId

    do {
        try await store.updateProjectId(id: thoughtId, projectId: projectId)
        // Success — keep optimistic state
    } catch {
        // Revert
        thoughts[index].projectId = oldProjectId
        // Show row-level error toast (see Pitfall P-3 for the toast surface)
        let projectName = projects.first(where: { $0.id == projectId })?.name ?? "project"
        assignmentError = AssignmentError(
            thoughtId: thoughtId,
            message: "Couldn't assign to \"\(projectName)\". Try again."
        )
        NSLog("Dashboard: project assignment failed for thought %lld — %@", thoughtId, error.localizedDescription)
    }
}
```

`store.updateProjectId(id:projectId:)` is a new method on `APIThoughtStore` that wraps a PUT to `/thoughts/:id` with an `AssignProjectBody { let projectId: Int64? }` payload. Swift's default JSONEncoder encodes `Optional.none` as JSON `null`, which is exactly the unassign semantic the server expects.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Local GRDB store directly inside ViewModel | `ThoughtRepository` actor protocol with API-backed implementation | v2.1 (Phase 42) | All new repository work follows the actor protocol — Project work must too |
| Hono router with separate routes per action | Single Hono router per resource with conditional WHERE composition | Phase 29-30 | Phase 53 extends the existing thoughts router rather than adding a new one |
| Snake_case DB columns + manual JSON serialization | Drizzle `$inferSelect` types + explicit `toResponse` mapper translating to camelCase | Phase 52 (cemented for projects) | Phase 53 must add `projectId` to BOTH the response interface AND the mapper, or the field silently disappears |
| `category="project"` as the project mechanism | Real `projects` table + FK + named projects | Phase 52 | Both coexist — the old category remains queryable via `?category=project`, new projects via `?projectId=X` |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + npm | vigil-core build/test | ✓ (assumed — Phase 52 shipped from this machine) | — | — |
| `vigil-core/node_modules` | Hono, drizzle-orm, postgres | ✓ (installed during Phase 52) | — | `npm install` |
| TypeScript / `tsc` | vigil-core build (`npm run build`) | ✓ | — | — |
| `swift build` toolchain | DailyBriefMonitor + JarvisCore compile | ✓ (Phase 51 built and installed binaries) | macOS 14+ | — |
| Railway production access | Wave 1 smoke test against deployed backend | ✓ | https://vigil-core-production.up.railway.app/v1 | One-off `node dist/index.js` with `DATABASE_PUBLIC_URL` (Phase 52-02 pattern) |
| `psql` | Direct DB inspection | ✗ | — | Node.js `postgres` package introspection (Phase 52-01 pattern) |
| Test framework (Jest / Vitest / XCTest) | Automated tests | ✗ | — | Smoke tests via curl + tsc + swift build (existing convention — see Validation Architecture below) |

**Missing dependencies with no fallback:** none — phase is fully executable on the current machine.

**Missing dependencies with fallback:** `psql` (use Node.js introspection per Phase 52 precedent); automated test framework (use the established curl smoke test + tsc compile + swift build verification convention).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — vigil-core has no Jest/Vitest setup; Sources/ has no XCTest target. The convention from Phases 29-52 is "tsc compiles + swift build compiles + curl smoke tests against a running instance" |
| Config file | none |
| Quick run command | `cd vigil-core && npm run build` (TypeScript compile) and `swift build` (Mac client compile) |
| Full suite command | `cd vigil-core && npm run build && PORT=3098 DATABASE_URL="$DATABASE_PUBLIC_URL" node dist/index.js &` followed by curl smoke tests, then `kill %1` |
| Phase gate | All curl smoke tests green, both `npm run build` and `swift build` exit 0, manual click-test of the dashboard sidebar |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PROJ-02 | `GET /thoughts?projectId=X` returns only thoughts with that project_id | smoke (curl) | `curl -H "Authorization: Bearer $T" "http://localhost:3098/v1/thoughts?projectId=4"` and assert all returned `data[].projectId === 4` | ❌ Wave 0 — needs new smoke test script |
| PROJ-02 | `GET /thoughts?unassigned=true` returns only thoughts with project_id IS NULL | smoke (curl) | `curl ... "/v1/thoughts?unassigned=true"` and assert `data[].projectId === null` | ❌ Wave 0 |
| PROJ-02 | Sending both `projectId` and `unassigned=true` returns 400 | smoke (curl) | `curl ... "/v1/thoughts?projectId=4&unassigned=true"` → expect HTTP 400 with `{error: "projectId and unassigned are mutually exclusive"}` | ❌ Wave 0 |
| PROJ-02 | `CategoryFilter.project(id:)` selection populates the detail pane via the new fetchByProject path | manual click | open dashboard, click a project, observe filtered list | ✓ visual |
| PROJ-03 | `PUT /thoughts/:id { projectId: 4 }` whitelists the field and updates the row | smoke (curl) | `curl -X PUT ... -d '{"projectId":4}' /v1/thoughts/77`; then `GET /v1/thoughts/77` and assert `projectId === 4` | ❌ Wave 0 |
| PROJ-03 | `PUT /thoughts/:id { projectId: 999999 }` (non-existent FK) returns 400 with `project not found` | smoke (curl) | `curl -X PUT ... -d '{"projectId":999999}' /v1/thoughts/77` → expect 400 | ❌ Wave 0 |
| PROJ-03 | `PUT /thoughts/:id { projectId: null }` unassigns | smoke (curl) | `curl -X PUT ... -d '{"projectId":null}' /v1/thoughts/77`; GET asserts `projectId === null` | ❌ Wave 0 |
| PROJ-03 | `ProjectPickerMenu` on a thought row appears, lists projects, selecting one fires PUT | manual click | open dashboard, right-click thought, hover Project, click a project name | ✓ visual |
| PROJ-04 | Re-selecting a different project from the menu changes the assignment | manual click | sequential clicks on two different projects from the same row | ✓ visual |
| PROJ-04 | Optimistic update reverts on simulated failure | manual + injected fault | temporarily point Mac client at unreachable URL, attempt assign, observe revert + error banner | ✓ manual fault injection |
| PROJ-05 | `ProjectStatusFilter` segmented Picker hides projects whose status doesn't match | manual click | create projects in 3 statuses, switch the Picker through all 4 segments | ✓ visual |
| PROJ-05 | Status changes via inline `Set status →` context menu fire `PATCH /v1/projects/:id` | smoke (curl) + manual | curl test the route directly; manual test the menu | ❌ Wave 0 (curl) |
| (FK cascade) | `DELETE /v1/projects/:id` nulls thoughts.project_id (already verified Phase 52-02) | regression | re-run Phase 52-02 cascade test | ✓ existing |
| (UI sidebar) | New `Projects` Section renders between Tags and Brief History | manual visual | observe sidebar order | ✓ visual |
| (UI Unassigned row) | Always visible, shows count, drives `.unassigned` filter | manual visual | observe + click | ✓ visual |
| (UI delete confirm) | Native Alert appears with UI-SPEC copy | manual visual | right-click project → Delete… → observe Alert | ✓ visual |

### Sampling Rate

- **Per task commit:** `cd vigil-core && npm run build` (Wave 1 tasks) OR `swift build` (Wave 2 tasks). Both must exit 0.
- **Per wave merge:** Wave 1 — full curl smoke test script against `localhost:3098` with `DATABASE_PUBLIC_URL`. Wave 2 — `swift build` plus manual click-through of all interaction contracts in UI-SPEC § Interaction Contracts.
- **Phase gate:** All curl smoke tests pass + both builds clean + manual click-through of every UI-SPEC interaction (project create, edit, status change, delete with confirmation, status filter, project selection, thought assign, thought move, thought unassign, create-and-assign-from-menu, optimistic revert).

### Wave 0 Gaps

- [ ] `vigil-core/scripts/smoke-test-53.sh` — curl-driven smoke test script covering all PROJ-02/03 backend assertions above. Model after the inline smoke tests in Phase 52-02 SUMMARY.
- [ ] No test framework needs installation. The existing convention is sufficient given the project's solo-dev / fast-feedback constraints. If the planner wants a more durable test surface, that's a backlog item, not a Phase 53 requirement.

## Security Domain

**Note:** `.planning/config.json` does not contain a `security_enforcement` key. Per the GSD default (absent = enabled), the section is included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing bearer auth middleware on `/v1/*` (Phase 38). Phase 53 inherits unchanged. |
| V3 Session Management | no | Stateless API; no sessions |
| V4 Access Control | partial | Single-user app; the existing T-52-12 (per-user authZ) acceptance is unchanged. New routes inherit the same model — any holder of the bearer token can access any project/thought |
| V5 Input Validation | yes | New `projectId` query param: `Number()` coerce + `Number.isInteger && > 0` check + 400 on failure. New PUT body field: same numeric validation + FK existence check + null tolerance for unassign |
| V6 Cryptography | no | No new crypto |

### Known Threat Patterns for vigil-core

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via `projectId` query param | Tampering | Drizzle `eq(thoughtsTable.projectId, projectIdNum)` is parameterized; `projectIdNum` is `Number()`-coerced and integer-validated before use |
| FK injection (assign to non-existent project) | Tampering | Server-side existence check (`SELECT id FROM projects WHERE id = $1 LIMIT 1`) before update — pattern from `projects.ts` lines 137-145 |
| Mass assignment via PUT body | Tampering | Existing PUT handler uses an explicit allowlist (`if (body.X !== undefined) updates.X = body.X`) — Phase 53 adds `projectId` to this allowlist; extra fields continue to be silently dropped (existing pattern at thoughts.ts lines 257-265) |
| Auth bypass | Spoofing | Bearer middleware unchanged from Phase 38 |
| Information disclosure via verbose errors | Information disclosure | Existing pattern: detailed errors go to `console.error`, user gets `{error: "<short>"}` |
| DoS via unbounded `projectId` value | DoS | `Number.isInteger && > 0` rejects floats, negatives, NaN, Infinity. Drizzle parameterized |

## Sources

### Primary (HIGH confidence — direct file reads in this session)

- [VERIFIED] `vigil-core/src/routes/thoughts.ts` (315 lines) — full file read; PUT/GET handler logic, validation pattern, `toResponse` mapper, conditions composition
- [VERIFIED] `vigil-core/src/routes/projects.ts` (225 lines) — full file read; CRUD pattern, FK existence check pattern, `isValidStatus` type guard
- [VERIFIED] `vigil-core/src/db/schema.ts` (135 lines) — projects table, thoughts.projectId FK, idx_thoughts_project_id index
- [VERIFIED] `Sources/JarvisCore/Models/Thought.swift` — Thought struct missing projectId field
- [VERIFIED] `Sources/JarvisCore/Storage/ThoughtRepository.swift` — protocol surface; no project methods
- [VERIFIED] `Sources/JarvisCore/Storage/APIThoughtStore.swift` (515 lines) — full file read; APIThoughtResponse shape, all CRUD wire formats, fetchFiltered pattern
- [VERIFIED] `Sources/JarvisCore/Services/VigilAPIClient.swift` (253 lines) — full file read; missing PATCH helper, custom date decoder, no snake_case conversion
- [VERIFIED] `Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift` (1026 lines) — read in chunks; CategoryFilter enum, refresh/loadThoughts/loadCounts paths, error handling pattern (NSLog only)
- [VERIFIED] `Sources/DailyBriefMonitor/Dashboard/DashboardView.swift` (957 lines) — sidebar Section pattern, Tags section closest analog, importErrors banner pattern at lines 495-518, emptyState at 876-896
- [VERIFIED] `Sources/DailyBriefMonitor/Dashboard/ThoughtRowView.swift` (458 lines) — contextMenu lines 340-390, no existing nested Menu
- [VERIFIED] `Sources/DailyBriefMonitor/AppDelegate.swift` lines 11-60 — VigilAPIClient + APIThoughtStore wiring
- [VERIFIED] `Sources/JarvisCore/Config/AppConfig.swift` lines 14-95 — apiBaseUrl defaults to Railway production
- [VERIFIED] `.planning/phases/52-projects-backend/52-01-SUMMARY.md` and `52-02-SUMMARY.md` — what shipped in Phase 52
- [VERIFIED] `.planning/phases/53-projects-dashboard-ui/53-CONTEXT.md` and `53-UI-SPEC.md` — locked decisions and visual contract

### Secondary (MEDIUM confidence)

- [CITED: drizzle-orm docs] `isNull(column)` operator is the canonical spelling for `WHERE column IS NULL` — confirmed by existing usage of `eq`, `and`, `ne`, `gte`, `lte` from the same package in `thoughts.ts`

### Tertiary (LOW confidence)

- None — every claim above is sourced from a file read in this session

## Risks / Unknowns

### R-1: CONTEXT D-02 says "PATCH /thoughts/:id" but the server uses PUT
**Risk:** Confusion in plans and PRs. UI-SPEC's "Interaction Contracts → Assigning a thought to a project" says "calls `PATCH /v1/thoughts/:id`". The actual route at `vigil-core/src/routes/thoughts.ts` line 219 is `thoughts.put("/thoughts/:id", ...)`. There is NO PATCH handler for `/thoughts/:id`.
**Resolution:** Plan should EXTEND THE EXISTING PUT HANDLER, not add a new PATCH route. Document the spec discrepancy in the plan and propose a minor edit to UI-SPEC after Wave 1 ships. The user-facing semantics are identical (partial update with explicit field allowlist).

### R-2: Swift JSON encoding of `nil` projectId
**Risk:** Default `JSONEncoder` encodes `Optional.none` as JSON `null`, which the server will (correctly) interpret as "unassign". Any code path that uses a shared `UpdateThoughtBody` and accidentally leaves `projectId` as `nil` will inadvertently unassign every thought it touches.
**Resolution:** Use a dedicated `AssignProjectBody { let projectId: Int64? }` struct ONLY for the explicit assign/unassign code path. Do NOT add `projectId` to the existing `UpdateThoughtBody`. See Pitfall P-1.

### R-3: No row-level error toast pattern exists
**Risk:** UI-SPEC and CONTEXT D-09 reference an "existing thought-row error pattern" that doesn't exist. The current convention is silent NSLog. The planner can't copy a non-existent pattern.
**Resolution:** Plan a new minimal `assignmentError` field on DashboardViewModel + an inline banner above the relevant row, modeled on the existing `viewModel.importErrors` banner at `DashboardView.swift` lines 495-518. Document this as a new pattern. See Pitfall P-3.

### R-4: Wave 1 deploys to production immediately on merge to main
**Risk:** Mac client points at `vigil-core-production.up.railway.app` by default. Merging Wave 1 changes the production API's behavior the moment Railway redeploys (~1 min). Wave 2 plans must validate against the now-deployed Wave 1.
**Resolution:** Wave 1 plan explicitly notes deploy timing. Smoke-test against a one-off `node dist/index.js` (Phase 52-02 pattern) BEFORE pushing to main. Treat the production deploy as "verified by curl smoke test on equivalent code" rather than "tested on a separate dev server".

### R-5: `loadThoughts` cancellation race during optimistic update
**Risk:** `DashboardViewModel.loadThoughts` is reentrancy-safe (lines 199-324) — it cancels in-flight loads. If the user clicks "assign to project" and the assign triggers an optimistic mutation followed by a `loadThoughts()` call (from D-06's after-CRUD refresh), an in-flight load may stomp the optimistic state.
**Resolution:** The optimistic assign must NOT call `loadThoughts()` on success — keeping the optimistic state IS the success path. Only call `loadThoughts()` on the project-CRUD paths (create/edit/delete project), where a full refresh is both wanted and expected. Document this in the plan: "do NOT refresh after successful assign; the optimistic mutation IS the new state."

### R-6: Sidebar `List(selection:)` and the `Section { Picker }` interaction
**Risk:** Putting a `Picker(.segmented)` inside a `List(selection: $viewModel.selectedFilter)` may cause the segmented control to interfere with the List's selection binding. SwiftUI's `List` selection treats children as selectable rows.
**Resolution:** Wrap the Picker in a row that has no `.tag(...)` modifier so the List doesn't treat it as selectable. Verify at execution time. The existing `Section("Source")` and `Section("Date")` both use plain `Button` rows without tags successfully (lines 183-234 of DashboardView.swift), so the pattern works. The Picker is a slightly different beast — keep an eye on it during Wave 2.

### R-7: `ThoughtRowView` requires `availableProjects: [Project]` parameter — passed from where?
**Risk:** Adding a new parameter to `ThoughtRowView`'s public interface means every call site has to be updated. There's exactly one: `DashboardView.swift` line 746 inside the `List(viewModel.thoughts) { thought in ThoughtRowView(...) }` block. The closure has access to `viewModel` so it can pass `viewModel.filteredProjects`.
**Resolution:** Add the parameter as a non-optional `[Project]` defaulting to `[]` so no other test or preview file needs updating. Update the single DashboardView call site.

### R-8: New plan files vs renaming existing — none needed
**Risk:** The Wave 2 plan needs new files (NewProjectSheet.swift, ProjectsAPIStore.swift, ProjectsRepository.swift, Project.swift). Need to ensure they're added to `Package.swift` if it has explicit source lists.
**Resolution:** Verify whether the project's `Package.swift` enumerates files explicitly or uses default folder discovery. If explicit, the plan must include adding the new files to it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Package.swift` uses default folder discovery (no explicit file enumeration) | R-8 | Plan needs an extra task to update `Package.swift` for the 4 new Swift files |
| A2 | macOS 14+ supports nested `Menu` inside `.contextMenu` rendering correctly | Pattern 6 / Pitfall P-2 | Submenu doesn't expand on click; would need to fall back to a flat Project list (one Button per project, hard limit of ~10 visible) |
| A3 | Drizzle-orm `isNull` is exported from `drizzle-orm` (top-level), not a sub-path | Pattern 1 | Import path needs adjustment; trivial fix |
| A4 | Swift `JSONEncoder` default behavior encodes `Optional.none` as JSON `null` (not absent key) | R-2 / Pitfall P-1 | If actually omits the key, the explicit unassign path silently fails (server treats as no-op). Validate at execution time with a curl + manual verification of the wire format |
| A5 | Railway auto-deploy runs `node dist/db/migrate.js && node dist/index.js` on every push to main | Runtime State Inventory | If auto-migrate is OFF, no migration is needed anyway (Phase 53 has no new SQL). Worst case = no impact. |

**Assumptions A2 and A4 are the load-bearing ones.** Both should be validated with a 5-minute spike at the start of Wave 2.

## Open Questions (RESOLVED)

1. **Should `Project` be `Identifiable` by `Int64` or wrap an optional?** — Server `serial` is non-null, so `id: Int64` (non-optional) is correct. Different from `Thought` which has `Int64?` because client creates Thoughts before insert. The planner should verify this distinction is preserved.

   **RESOLVED:** `Project.id` is non-optional `Int64` (server serial is non-null). `Thought.id` remains `Int64?` for the unsaved-client-side case. Implemented in 53-02 Task 1 (`Sources/JarvisCore/Models/Project.swift`).

2. **Should the `+ New Project…` menu item in `ProjectPickerMenu` open the same `NewProjectSheet` and auto-assign on success?** — UI-SPEC implies yes. The flow: user clicks "+ New Project…" from a thought row → `NewProjectSheet` opens with a `pendingAssignToThoughtId` flag → on Create success, the new project is created AND immediately assigned to the originating thought via the assign code path. Plan should make this single-shot atomic from the user's POV (one sheet, one click, both project and assignment happen).

   **RESOLVED:** Yes — `+ New Project…` opens `NewProjectSheet` and auto-assigns on success via a single-shot `pendingAssignToThoughtId` state. Implemented in 53-04 Task 2 Edit 3.

3. **Where does the `assignmentError` banner render?** — Above the entire thought list? Or above the specific row? Above the row is more contextual but harder (requires per-row state). Above the list is simpler. **Recommend: above the list, with the offending thought's content snippet in the message.** Auto-dismiss after 4 seconds.

   **RESOLVED:** Above the thought list, with 4-second auto-dismiss. Implemented in 53-03 Task 2 Edit 6.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; everything verified against package.json/Package.swift conventions in the codebase
- Architecture: HIGH — every file path verified, every pattern read first-hand
- Pitfalls: HIGH — each pitfall is grounded in a specific verified file path or behavior
- Validation: MEDIUM — no test framework exists; the curl + manual click model is the documented project convention but is not a "test framework" in the usual sense

**Research date:** 2026-04-07
**Valid until:** 2026-04-21 (14 days — fast-moving project; revalidate if not started by then)
