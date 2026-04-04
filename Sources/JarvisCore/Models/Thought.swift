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
public enum ThoughtCategory: String, Codable, Sendable, CaseIterable, DatabaseValueConvertible {
    case task
    case therapy
    case idea
    case reflection
    case project
}

/// Task lifecycle status for task-category thoughts.
public enum TaskStatus: String, Codable, Sendable, DatabaseValueConvertible {
    case open
    case inProgress
    case done
}

/// Therapy classification for therapy-category thoughts.
/// Indicates whether a thought can be worked through independently
/// or should be brought to a therapist session.
public enum TherapyClassification: String, Codable, Sendable, DatabaseValueConvertible {
    case selfLearnable
    case bringToTherapist
}

/// Sync state for CloudKit synchronization.
public enum SyncStatus: String, Codable, Sendable, DatabaseValueConvertible {
    /// Needs upload to CloudKit (new or modified locally).
    case pending
    /// Matches CloudKit record.
    case synced
    /// Deleted locally; deletion needs syncing to CloudKit.
    case pendingDeletion
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
        public static let cloudKitRecordID = Column(CodingKeys.cloudKitRecordID)
        public static let taskStatus = Column(CodingKeys.taskStatus)
        public static let therapyClassification = Column(CodingKeys.therapyClassification)
        public static let syncStatus = Column(CodingKeys.syncStatus)
        public static let lastSyncedAt = Column(CodingKeys.lastSyncedAt)
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

    /// UUID string used as CKRecord.ID name. Generated once on creation, never changes.
    public var cloudKitRecordID: String

    /// Tracks sync state for CloudKit synchronization.
    public var syncStatus: SyncStatus

    /// Task lifecycle status. Nil for non-task thoughts.
    public var taskStatus: TaskStatus?

    /// Therapy classification. Nil for non-therapy thoughts and therapy thoughts not yet classified.
    public var therapyClassification: TherapyClassification?

    /// When this thought was last synced to CloudKit. Nil if never synced.
    public var lastSyncedAt: Date?

    // MARK: Initialization

    public init(
        id: Int64? = nil,
        content: String,
        category: ThoughtCategory? = nil,
        confidence: Double? = nil,
        source: CaptureSource = .text,
        createdAt: Date = Date(),
        modifiedAt: Date = Date(),
        taskStatus: TaskStatus? = nil,
        therapyClassification: TherapyClassification? = nil,
        cloudKitRecordID: String = UUID().uuidString,
        syncStatus: SyncStatus = .pending,
        lastSyncedAt: Date? = nil
    ) {
        self.id = id
        self.content = content
        self.category = category
        self.confidence = confidence
        self.source = source
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.taskStatus = taskStatus
        self.therapyClassification = therapyClassification
        self.cloudKitRecordID = cloudKitRecordID
        self.syncStatus = syncStatus
        self.lastSyncedAt = lastSyncedAt
    }

    // MARK: MutablePersistableRecord

    public mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}
