import Foundation

// MARK: - Supporting Types

/// How a thought was captured into the system.
public enum CaptureSource: String, Codable, Sendable {
    case text
    case voice
    case image
}

/// AI-assigned category for a triaged thought.
public enum ThoughtCategory: String, Codable, Sendable, CaseIterable {
    case task
    case therapy
    case idea
    case reflection
    case project
}

/// Task lifecycle status for task-category thoughts.
public enum TaskStatus: String, Codable, Sendable {
    case open
    case inProgress
    case done
}

/// Therapy classification for therapy-category thoughts.
/// Indicates whether a thought can be worked through independently
/// or should be brought to a therapist session.
public enum TherapyClassification: String, Codable, Sendable {
    case selfLearnable
    case bringToTherapist
}

// MARK: - Thought Model

/// A captured thought — the core data unit of Vigil.
public struct Thought: Codable, Sendable, Identifiable {

    // MARK: Properties

    /// Primary key. Nil before first insert.
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

    /// Task lifecycle status. Nil for non-task thoughts.
    public var taskStatus: TaskStatus?

    /// Therapy classification. Nil for non-therapy thoughts and therapy thoughts not yet classified.
    public var therapyClassification: TherapyClassification?

    /// User-assigned tags for organization. Nil means no tags (distinct from empty array).
    public var tags: [String]?

    /// Whether the user has marked this thought as a favorite.
    public var isFavorited: Bool

    /// Foreign key into the `projects` table. Nil means unassigned.
    /// Round-trips through the `/v1/thoughts` response (Phase 53 Plan 01).
    public var projectId: Int64?

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
        tags: [String]? = nil,
        isFavorited: Bool = false,
        projectId: Int64? = nil
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
        self.tags = tags
        self.isFavorited = isFavorited
        self.projectId = projectId
    }
}
