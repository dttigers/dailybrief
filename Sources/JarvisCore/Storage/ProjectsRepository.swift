import Foundation

/// Protocol abstracting the projects data layer, mirroring `ThoughtRepository`'s
/// actor-isolation pattern. Phase 53 ships a single API-backed implementation
/// (`ProjectsAPIStore`); the protocol exists so Wave 3-4 UI code can depend on
/// the abstraction and tests can substitute a fake.
public protocol ProjectsRepository: Actor {

    /// Fetch every project the authenticated caller can see.
    func listProjects() async throws -> [Project]

    /// Create a new project and return the server-assigned row.
    func createProject(
        name: String,
        description: String?,
        status: ProjectStatus?
    ) async throws -> Project

    /// Update the mutable fields of a project. Nil fields are omitted from the
    /// request body (the server applies partial-update semantics via PATCH).
    @discardableResult
    func updateProject(
        id: Int64,
        name: String?,
        description: String?,
        status: ProjectStatus?
    ) async throws -> Project

    /// Delete a project. The server cascades `project_id` on thoughts to NULL
    /// (Phase 52 D-03 `ON DELETE SET NULL`).
    func deleteProject(id: Int64) async throws
}
