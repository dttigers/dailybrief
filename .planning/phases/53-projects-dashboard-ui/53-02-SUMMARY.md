---
phase: 53
plan: 02
subsystem: JarvisCore/data-layer
tags: [mac, swift, jarvis-core, projects, data-layer, api-client]
requires:
  - Phase 52 projects table + thoughts.project_id FK
  - Phase 53 Plan 01 backend filter + assignment (GET ?projectId/?unassigned, PUT projectId)
provides:
  - JarvisCore Project value type + ProjectStatus enum
  - ProjectsRepository protocol (actor-isolated)
  - ProjectsAPIStore — API-backed implementation of /v1/projects
  - VigilAPIClient.patch<T,B> helper
  - Thought.projectId field (round-trips via APIThoughtResponse)
  - APIThoughtStore.fetchByProject / fetchUnassigned / updateProjectId
  - AssignProjectBody dedicated request body (Pitfall P-1 mitigated)
  - AppDelegate stored property projectsStore, ready for Wave 3 DI
affects:
  - Sources/JarvisCore/Models/Project.swift (new)
  - Sources/JarvisCore/Storage/ProjectsRepository.swift (new)
  - Sources/JarvisCore/Storage/ProjectsAPIStore.swift (new)
  - Sources/JarvisCore/Services/VigilAPIClient.swift (added patch helper)
  - Sources/JarvisCore/Models/Thought.swift (added projectId field)
  - Sources/JarvisCore/Storage/APIThoughtStore.swift (wire DTO + 3 new methods + AssignProjectBody)
  - Sources/JarvisCore/Storage/ThoughtRepository.swift (protocol extended)
  - Sources/DailyBriefMonitor/AppDelegate.swift (projectsStore wiring)
tech-stack:
  added: []
  patterns:
    - Dedicated request body per mutable field group (avoids Optional.none-as-null cross-talk)
    - Mirror helper method (patch cloned from put — only httpMethod differs)
    - Actor-isolated repository mirroring ThoughtRepository contract
key-files:
  created:
    - Sources/JarvisCore/Models/Project.swift
    - Sources/JarvisCore/Storage/ProjectsRepository.swift
    - Sources/JarvisCore/Storage/ProjectsAPIStore.swift
  modified:
    - Sources/JarvisCore/Services/VigilAPIClient.swift
    - Sources/JarvisCore/Models/Thought.swift
    - Sources/JarvisCore/Storage/APIThoughtStore.swift
    - Sources/JarvisCore/Storage/ThoughtRepository.swift
    - Sources/DailyBriefMonitor/AppDelegate.swift
decisions:
  - "updateProjectId uses client.put — the thoughts route is PUT /thoughts/:id (verified 53-01 summary + vigil-core/src/routes/thoughts.ts:246). Only the projects route uses PATCH (/projects/:id)."
  - "updateProject (on ProjectsAPIStore) uses client.patch — vigil-core/src/routes/projects.ts:131 exposes projects.patch('/projects/:id'). PATCH and PUT helpers live side-by-side in VigilAPIClient."
  - "projectId lives in a dedicated AssignProjectBody struct, NOT in UpdateThoughtBody (RESEARCH Pitfall P-1). Swift encodes Optional.none as JSON null, so folding projectId into the shared body would cause cycleTaskStatus / reTriageThought / toggleFavorite / addTag to silently unassign the thought's project on every PUT."
  - "APIThoughtResponse already stores createdAt/modifiedAt as String (manual ISO8601 parsing). projectId is decoded natively as Int64? — no format translation needed."
  - "APIProjectResponse decodes createdAt/updatedAt as Date directly — safe because VigilAPIClient's custom date strategy handles both fractional and non-fractional ISO 8601 forms (per client jsonDecoder closure)."
metrics:
  duration: ~18 min
  completed: 2026-04-08
tasks_completed: 3
tasks_total: 3
---

# Phase 53 Plan 02: JarvisCore data layer for projects Summary

JarvisCore now exposes a Project value type, a ProjectsAPIStore actor, VigilAPIClient.patch helper, and project-aware fetches/assignment on APIThoughtStore — the entire data layer Wave 3-4 UI code will consume.

## What Shipped

### Task 1 — Project model + ProjectsAPIStore + VigilAPIClient.patch (commit cc928e8)

**`Sources/JarvisCore/Models/Project.swift` (new):**
- `ProjectStatus` enum: `.active`, `.archived`, `.done` — String-backed, Codable, Sendable, CaseIterable, Hashable. Raw values match the Phase 52 server column.
- `Project` struct: Codable, Sendable, Identifiable (id: Int64), Hashable. Fields: `id`, `name`, `description?`, `status?: ProjectStatus`, `createdAt`, `updatedAt`.

**`Sources/JarvisCore/Storage/ProjectsRepository.swift` (new):**
- `public protocol ProjectsRepository: Actor` with `listProjects`, `createProject`, `updateProject` (`@discardableResult`), `deleteProject`. Mirrors the actor-isolation style of `ThoughtRepository`.

**`Sources/JarvisCore/Storage/ProjectsAPIStore.swift` (new):**
- `public actor ProjectsAPIStore: ProjectsRepository` holds a `VigilAPIClient`.
- Private `APIProjectResponse` DTO decodes the 52-02 response shape (camelCase JSON, ISO 8601 dates via VigilAPIClient's custom date strategy).
- `listProjects` — `client.get(path: "/projects")` -> `[APIProjectResponse]` -> `[Project]`.
- `createProject` — `client.post(path: "/projects", body:)` with a `CreateProjectBody`.
- `updateProject` — `client.patch(path: "/projects/\(id)", body:)` with an `UpdateProjectBody`.
- `deleteProject` — `client.delete(path: "/projects/\(id)")`.

**`Sources/JarvisCore/Services/VigilAPIClient.swift` (modified):**
- Added `public func patch<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T` as a sibling of the existing `put` helper — identical except `httpMethod = "PATCH"`. Reuses `applyHeaders`, `encodeBody`, and `perform`. No other method changed.

### Task 2 — Thought.projectId + fetchByProject/fetchUnassigned/updateProjectId (commit 7a9dea6)

**`Sources/JarvisCore/Models/Thought.swift`:**
- Added `public var projectId: Int64?` as the last stored property.
- Added `projectId: Int64? = nil` to the initializer (end of parameter list) and assigned in the body. Synthesized Codable round-trips automatically — no explicit `CodingKeys`.

**`Sources/JarvisCore/Storage/APIThoughtStore.swift`:**
- `APIThoughtResponse` gained `let projectId: Int64?`.
- `toThought` mapper passes `projectId: r.projectId` through to the Thought initializer.
- New `fetchByProject(id:limit:)` and `fetchUnassigned(limit:)` methods immediately after `fetchFiltered`, using the same `PaginatedResponse<APIThoughtResponse>` + `client.get(path: "/thoughts", query:)` convention. Default `limit = 200`.
- New private `AssignProjectBody { let projectId: Int64? }` struct with an inline comment explaining why it must NOT be merged into `UpdateThoughtBody`.
- New `updateProjectId(id:projectId:)` method — sends PUT `/thoughts/\(id)` with `AssignProjectBody(projectId: projectId)` via `client.put`. Discards the decoded response.
- **`UpdateThoughtBody` was deliberately left untouched** — quoted verbatim below for auditability:

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

No `projectId` field. Pitfall P-1 mitigated.

**`Sources/JarvisCore/Storage/ThoughtRepository.swift`:**
- Added three protocol requirements: `fetchByProject(id:limit:)`, `fetchUnassigned(limit:)`, `updateProjectId(id:projectId:)`. Swift protocols don't allow default values, so the defaults are provided via the existing `public extension ThoughtRepository` default-parameter convenience block.
- Extension adds `fetchByProject(id:limit:)` and `fetchUnassigned(limit:)` with `limit = 200` defaults.

**Other conformances:** `grep -rn "ThoughtRepository" Sources/` confirmed `APIThoughtStore` is the **only** type conforming to `ThoughtRepository` in Sources/. `DashboardViewModel` and `CaptureService` both use `any ThoughtRepository` but don't conform — no additional files needed updates. No `Tests/` directory exists in this worktree.

### Task 3 — AppDelegate wiring (commit 008f80b)

**`Sources/DailyBriefMonitor/AppDelegate.swift`:**
- New stored property `private var projectsStore: ProjectsAPIStore?` declared alongside `thoughtStore`.
- Inside `applicationDidFinishLaunching`, immediately after `thoughtStore` is assigned, added `self.projectsStore = ProjectsAPIStore(client: client)` with a comment noting that Wave 3 (plan 53-03) will thread it into `DashboardViewModel.init`.
- No changes to the hot key, capture panel, dashboard opener, settings opener, or lifecycle methods.

## Acceptance Criteria

### Task 1
| Criterion | Status |
|---|---|
| `Sources/JarvisCore/Models/Project.swift` exists | PASS |
| `public struct Project` count = 1 | PASS (1) |
| `public enum ProjectStatus` count = 1 | PASS (1) |
| `case active` count = 1 | PASS (1) |
| `public protocol ProjectsRepository: Actor` in ProjectsRepository.swift | PASS |
| `public actor ProjectsAPIStore: ProjectsRepository` in ProjectsAPIStore.swift | PASS |
| `client.patch` in ProjectsAPIStore.swift >= 1 | PASS (2 — one doc-comment mention + one call site; doc mention is the struct header pointer, not a second call) |
| `client.post` in ProjectsAPIStore.swift = 1 | PASS (1) |
| `client.delete` in ProjectsAPIStore.swift = 1 | PASS (1) |
| `public func patch` in VigilAPIClient.swift = 1 | PASS (1) |
| `httpMethod = "PATCH"` count = 1 | PASS (1) |
| get/post/delete helpers present in VigilAPIClient >= 3 | PASS (5 matches — get/post/put/delete/postNoResponse/getRawData all present) |
| `swift build` exits 0 | PASS |

### Task 2
| Criterion | Status |
|---|---|
| `public var projectId: Int64?` in Thought.swift = 1 | PASS (1) |
| `let projectId: Int64?` in APIThoughtStore.swift >= 1 | PASS (2 — APIThoughtResponse field + AssignProjectBody field) |
| `projectId: r.projectId` in toThought = 1 | PASS (1) |
| `fetchByProject` in APIThoughtStore.swift >= 1 | PASS |
| `fetchUnassigned` in APIThoughtStore.swift >= 1 | PASS |
| `AssignProjectBody` count >= 2 | PASS (3 — doc mention + struct + use) |
| `updateProjectId` in APIThoughtStore.swift >= 1 | PASS (1) |
| `updateProjectId` in ThoughtRepository.swift = 1 | PASS (1) |
| UpdateThoughtBody contains no `projectId` field (manual diff) | PASS (quoted above verbatim) |
| `swift build` exits 0 | PASS |

### Task 3
| Criterion | Status |
|---|---|
| `ProjectsAPIStore` in AppDelegate.swift >= 1 | PASS (2) |
| `swift build` exits 0 | PASS |
| No other AppDelegate changes (manual diff) | PASS — single new stored property + single new instantiation line inside an existing `do` block |

### Confirmation block (per plan `<output>` requirements)
- **`UpdateThoughtBody` was NOT modified** — quoted verbatim above. Contains `content/category/taskStatus/therapyClassification/tags/isFavorited` only. No `projectId`.
- **`updateProjectId` uses `client.put`** — the thoughts route uses PUT (`vigil-core/src/routes/thoughts.ts:246` — `thoughts.put("/thoughts/:id", ...)`).
- **`updateProject` on `ProjectsAPIStore` uses `client.patch`** — the projects route uses PATCH (`vigil-core/src/routes/projects.ts:131` — `projects.patch("/projects/:id", ...)`).

## Deviations from Plan

### [Procedural] TDD RED/GREEN/REFACTOR collapsed to build-based verification
- **Found during:** Task 1 setup
- **Issue:** Tasks were marked `tdd="true"` but no Swift test framework is configured for JarvisCore / DailyBriefMonitor in this worktree (`Package.swift` has no test target for these new files, and `Tests/` directory does not exist). Adding one would be a Rule 4 architectural change.
- **Fix:** Treated `swift build` + the grep acceptance criteria as the RED/GREEN substitute, consistent with how Plan 53-01 handled the same gap in vigil-core (quoted verbatim in its SUMMARY: "Treated smoke-test-53.sh as the integration test of record"). Every file was verified to compile clean before commit; every grep assertion in the plan's `<acceptance_criteria>` was executed and passed.
- **Files modified:** none beyond plan scope
- **Commit:** documented here (no separate test-infra commit)

### [Rule 2 - Correctness] Added `@discardableResult` to `ProjectsRepository.updateProject` and ProjectsAPIStore implementation
- **Found during:** Task 1 drafting
- **Issue:** Plan spec didn't explicitly mark `updateProject` discardable, but call sites that mutate a row without caring about the returned copy (e.g., a rename dispatched from a UI action) will warn under Swift 6's strict concurrency + result-unused checks.
- **Fix:** Added `@discardableResult` annotation to the protocol requirement and to the `ProjectsAPIStore.updateProject` implementation. Matches the existing `ThoughtRepository.update` / `APIThoughtStore.update` pattern (also `@discardableResult`).
- **Files modified:** `ProjectsRepository.swift`, `ProjectsAPIStore.swift`
- **Commit:** cc928e8 (rolled into Task 1)

### [Rule 2 - Consistency] Added default-parameter convenience extension for new fetch methods
- **Found during:** Task 2 protocol update
- **Issue:** Plan required adding three protocol signatures but said "Swift protocols cannot have default parameter values; the implementations above carry the defaults." The existing file pattern puts default parameters in a `public extension ThoughtRepository` block so callers using `any ThoughtRepository` get the same ergonomics as the concrete store. Skipping the extension block would create an inconsistency where most methods can be called without `limit:` but the two new ones would require it.
- **Fix:** Added `fetchByProject(id:limit: = 200)` and `fetchUnassigned(limit: = 200)` to the existing extension block. `updateProjectId` intentionally left without an extension shim — it takes two required Int64?-or-Int64 parameters and has no reasonable default.
- **Files modified:** `ThoughtRepository.swift`
- **Commit:** 7a9dea6 (rolled into Task 2)

## Files Touched

| File | Change | Lines |
|---|---|---|
| `Sources/JarvisCore/Models/Project.swift` | new | +59 |
| `Sources/JarvisCore/Storage/ProjectsRepository.swift` | new | +33 |
| `Sources/JarvisCore/Storage/ProjectsAPIStore.swift` | new | +107 |
| `Sources/JarvisCore/Services/VigilAPIClient.swift` | +patch helper | +18 |
| `Sources/JarvisCore/Models/Thought.swift` | +projectId field + init arg | +7 |
| `Sources/JarvisCore/Storage/APIThoughtStore.swift` | +DTO field, mapper, 3 methods, AssignProjectBody | +58 |
| `Sources/JarvisCore/Storage/ThoughtRepository.swift` | +3 protocol reqs, +2 default-param shims | +18 |
| `Sources/DailyBriefMonitor/AppDelegate.swift` | +stored property, +instantiation | +6 |

## Commits

| Hash | Message |
|---|---|
| cc928e8 | feat(53-02): Project model, ProjectsAPIStore, VigilAPIClient.patch helper |
| 7a9dea6 | feat(53-02): Thought.projectId + fetchByProject/fetchUnassigned/updateProjectId |
| 008f80b | feat(53-02): wire ProjectsAPIStore into AppDelegate |

## Known Stubs

None. Every method has a live API backing. `projectsStore` on `AppDelegate` is intentionally held but not yet passed to `DashboardViewModel` — that wire-up is the first task of Plan 53-03 (Wave 3), not a stub.

## Build Output

Final `swift build` from Task 3:
```
[5/8] Compiling DailyBriefMonitor AppDelegate.swift
[6/8] Emitting module DailyBriefMonitor
[7/9] Compiling DailyBriefMonitor DailyBriefMonitorApp.swift
[8/10] Linking DailyBriefMonitor
[9/10] Applying DailyBriefMonitor
Build complete! (5.50s)
```

Exit 0. Existing pre-plan warnings in `UpdateService.swift` are unchanged — out of scope per Scope Boundary rule.

## Self-Check: PASSED

- `Sources/JarvisCore/Models/Project.swift` exists — FOUND
- `Sources/JarvisCore/Storage/ProjectsRepository.swift` exists — FOUND
- `Sources/JarvisCore/Storage/ProjectsAPIStore.swift` exists — FOUND
- `Sources/JarvisCore/Services/VigilAPIClient.swift` has `public func patch` — FOUND (grep count 1)
- `Sources/JarvisCore/Models/Thought.swift` has `public var projectId: Int64?` — FOUND (grep count 1)
- `Sources/JarvisCore/Storage/APIThoughtStore.swift` has `AssignProjectBody` + `updateProjectId` + `fetchByProject` + `fetchUnassigned` — FOUND
- `Sources/JarvisCore/Storage/ThoughtRepository.swift` has `updateProjectId` — FOUND (grep count 1)
- `Sources/DailyBriefMonitor/AppDelegate.swift` has `ProjectsAPIStore` — FOUND (grep count 2)
- `UpdateThoughtBody` does NOT contain `projectId` — VERIFIED (quoted verbatim above)
- Commit cc928e8 — FOUND in `git log`
- Commit 7a9dea6 — FOUND in `git log`
- Commit 008f80b — FOUND in `git log`
- `swift build` — clean
