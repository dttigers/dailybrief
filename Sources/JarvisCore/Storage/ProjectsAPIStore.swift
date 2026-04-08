import Foundation

/// A `ProjectsRepository`-conforming actor that talks to the `/v1/projects`
/// endpoints shipped in Phase 52. Reuses `VigilAPIClient`'s auth / transport /
/// date decoding so no new HTTP machinery is introduced here.
///
/// Routing correctness:
/// - Create  -> `POST   /projects`
/// - List    -> `GET    /projects`
/// - Update  -> `PATCH  /projects/:id`  (via `client.patch`)
/// - Delete  -> `DELETE /projects/:id`
///
/// The projects route uses PATCH for updates; the thoughts route uses PUT.
/// Do not cross the wires — see Phase 53 RESEARCH R-1 and Plan 53-01 summary.
public actor ProjectsAPIStore: ProjectsRepository {

    private let client: VigilAPIClient

    public init(client: VigilAPIClient) {
        self.client = client
    }

    // MARK: - Wire DTO

    /// Decodable mirror of the JSON shape documented in 52-02-SUMMARY.
    /// `createdAt`/`updatedAt` are decoded via `VigilAPIClient`'s custom
    /// ISO 8601 strategy, which handles both fractional and non-fractional forms.
    private struct APIProjectResponse: Decodable, Sendable {
        let id: Int64
        let name: String
        let description: String?
        let status: String?
        let createdAt: Date
        let updatedAt: Date
    }

    private func toProject(_ r: APIProjectResponse) -> Project {
        Project(
            id: r.id,
            name: r.name,
            description: r.description,
            status: r.status.flatMap { ProjectStatus(rawValue: $0) },
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
        )
    }

    // MARK: - List

    public func listProjects() async throws -> [Project] {
        let response: [APIProjectResponse] = try await client.get(path: "/projects")
        return response.map(toProject)
    }

    // MARK: - Create

    private struct CreateProjectBody: Encodable {
        let name: String
        let description: String?
        let status: String?
    }

    public func createProject(
        name: String,
        description: String?,
        status: ProjectStatus?
    ) async throws -> Project {
        let body = CreateProjectBody(
            name: name,
            description: description,
            status: status?.rawValue
        )
        let response: APIProjectResponse = try await client.post(path: "/projects", body: body)
        return toProject(response)
    }

    // MARK: - Update

    private struct UpdateProjectBody: Encodable {
        let name: String?
        let description: String?
        let status: String?
    }

    @discardableResult
    public func updateProject(
        id: Int64,
        name: String?,
        description: String?,
        status: ProjectStatus?
    ) async throws -> Project {
        let body = UpdateProjectBody(
            name: name,
            description: description,
            status: status?.rawValue
        )
        let response: APIProjectResponse = try await client.patch(
            path: "/projects/\(id)",
            body: body
        )
        return toProject(response)
    }

    // MARK: - Delete

    public func deleteProject(id: Int64) async throws {
        try await client.delete(path: "/projects/\(id)")
    }
}
