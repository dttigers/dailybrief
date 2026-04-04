import Foundation
import GRDB

/// A bidirectional link between two thoughts.
/// Links are local-only (not synced to CloudKit) for v1.
public struct ThoughtLink: Codable, Sendable, FetchableRecord, PersistableRecord {

    // MARK: Database Table

    public static let databaseTableName = "thought_links"

    // MARK: Properties

    /// Auto-increment primary key. Nil before first insert.
    public var id: Int64?

    /// The source thought in this link pair.
    public var sourceThoughtId: Int64

    /// The target thought in this link pair.
    public var targetThoughtId: Int64

    /// When this link was created.
    public var createdAt: Date

    // MARK: Initialization

    public init(
        id: Int64? = nil,
        sourceThoughtId: Int64,
        targetThoughtId: Int64,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.sourceThoughtId = sourceThoughtId
        self.targetThoughtId = targetThoughtId
        self.createdAt = createdAt
    }
}
