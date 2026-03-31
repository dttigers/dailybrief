import Foundation
import GRDB

// MARK: - Supporting Types

/// How a thought was captured into the system.
public enum CaptureSource: String, Codable, Sendable, DatabaseValueConvertible {
    case text
    case voice
    case image
}

/// AI-assigned category for a triaged thought.
public enum ThoughtCategory: String, Codable, Sendable, DatabaseValueConvertible {
    case task
    case therapy
    case idea
    case reflection
    case project
}

// MARK: - Thought Model

/// A captured thought — the core data unit of Jarvis.
public struct Thought: Codable, Sendable, Identifiable, FetchableRecord, MutablePersistableRecord {

    // MARK: Database Table

    public static let databaseTableName = "thoughts"

    /// Type-safe column references for GRDB queries.
    public enum Columns {
        public static let id = Column(CodingKeys.id)
        public static let content = Column(CodingKeys.content)
        public static let category = Column(CodingKeys.category)
        public static let confidence = Column(CodingKeys.confidence)
        public static let source = Column(CodingKeys.source)
        public static let createdAt = Column(CodingKeys.createdAt)
        public static let modifiedAt = Column(CodingKeys.modifiedAt)
    }

    // MARK: Properties

    /// Auto-increment primary key. Nil before first insert.
    public var id: Int64?

    /// The captured thought text (required, non-empty).
    public var content: String

    /// AI-assigned category. Nil until triage processes the thought.
    public var category: ThoughtCategory?

    /// Triage confidence score (0.0–1.0). Nil until triaged.
    public var confidence: Double?

    /// How the thought was captured.
    public var source: CaptureSource

    /// When the thought was first captured.
    public var createdAt: Date

    /// When the thought was last modified.
    public var modifiedAt: Date

    // MARK: Initialization

    public init(
        id: Int64? = nil,
        content: String,
        category: ThoughtCategory? = nil,
        confidence: Double? = nil,
        source: CaptureSource = .text,
        createdAt: Date = Date(),
        modifiedAt: Date = Date()
    ) {
        self.id = id
        self.content = content
        self.category = category
        self.confidence = confidence
        self.source = source
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
    }

    // MARK: MutablePersistableRecord

    public mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}
