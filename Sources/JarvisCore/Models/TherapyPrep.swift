import Foundation

// MARK: - TherapyPrepItem

/// A single discussion topic for therapy session preparation.
public struct TherapyPrepItem: Codable, Sendable {
    /// Discussion topic for the therapist.
    public var topic: String
    /// Brief context/background for the topic.
    public var context: String
    /// Urgency level: "high", "medium", or "low".
    public var urgency: String
    /// IDs of thoughts related to this topic.
    public var relatedThoughtIds: [Int64]

    public init(
        topic: String,
        context: String,
        urgency: String,
        relatedThoughtIds: [Int64] = []
    ) {
        self.topic = topic
        self.context = context
        self.urgency = urgency
        self.relatedThoughtIds = relatedThoughtIds
    }

    // Custom coding keys to match the JSON snake_case from Claude API
    private enum CodingKeys: String, CodingKey {
        case topic
        case context
        case urgency
        case relatedThoughtIds = "related_thought_ids"
    }
}

// MARK: - TherapyPrep

/// A structured therapy session preparation summary.
public struct TherapyPrep: Codable, Sendable {
    /// Ordered list of discussion topics.
    public var items: [TherapyPrepItem]
    /// High-level themes across all items.
    public var overallThemes: [String]
    /// AI suggestion for what to focus on in the session.
    public var suggestedFocus: String

    public init(
        items: [TherapyPrepItem] = [],
        overallThemes: [String] = [],
        suggestedFocus: String = ""
    ) {
        self.items = items
        self.overallThemes = overallThemes
        self.suggestedFocus = suggestedFocus
    }

    // Custom coding keys to match the JSON snake_case from Claude API
    private enum CodingKeys: String, CodingKey {
        case items
        case overallThemes = "overall_themes"
        case suggestedFocus = "suggested_focus"
    }
}
