import Foundation

// MARK: - InsightType

/// The kind of insight surfaced from thought analysis.
public enum InsightType: String, Codable, Sendable {
    case pattern
    case connection
    case actionPrompt
    case trend
}

// MARK: - Insight Model

/// An AI-generated insight derived from captured thought history.
public struct Insight: Codable, Sendable {
    /// What kind of insight this is.
    public var type: InsightType
    /// Short headline (e.g., "Recurring Theme Detected").
    public var title: String
    /// The insight body (1-2 sentences).
    public var message: String
    /// Confidence score from 0.0 to 1.0.
    public var confidence: Double
    /// IDs of thoughts that informed this insight.
    public var relatedThoughtIds: [Int64]

    public init(
        type: InsightType,
        title: String,
        message: String,
        confidence: Double,
        relatedThoughtIds: [Int64] = []
    ) {
        self.type = type
        self.title = title
        self.message = message
        self.confidence = min(1.0, max(0.0, confidence))
        self.relatedThoughtIds = relatedThoughtIds
    }

    // Custom coding keys to match the JSON snake_case from Claude API
    private enum CodingKeys: String, CodingKey {
        case type
        case title
        case message
        case confidence
        case relatedThoughtIds = "related_thought_ids"
    }
}
