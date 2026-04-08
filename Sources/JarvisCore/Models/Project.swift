import Foundation

// MARK: - Project Status

/// Lifecycle state of a Project. Raw values match the server-side status column
/// defined by Phase 52 (`active` / `archived` / `done`).
public enum ProjectStatus: String, Codable, Sendable, CaseIterable, Hashable {
    case active
    case archived
    case done
}

// MARK: - Project

/// A user-defined project that can have thoughts assigned to it.
///
/// Mirrors the `/v1/projects` response shape shipped in Phase 52 (camelCase JSON,
/// ISO 8601 dates — decoded via `VigilAPIClient`'s custom date strategy).
public struct Project: Codable, Sendable, Identifiable, Hashable {

    // MARK: Properties

    /// Server-assigned primary key.
    public var id: Int64

    /// Human-readable project name (required, non-empty).
    public var name: String

    /// Optional freeform description.
    public var description: String?

    /// Lifecycle state. Nil only defensively — the server always populates it.
    public var status: ProjectStatus?

    /// When the project row was created server-side.
    public var createdAt: Date

    /// When the project row was last updated server-side.
    public var updatedAt: Date

    // MARK: Initialization

    public init(
        id: Int64,
        name: String,
        description: String? = nil,
        status: ProjectStatus? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
