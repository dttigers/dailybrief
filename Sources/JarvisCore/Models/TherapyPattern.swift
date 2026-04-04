import Foundation

// MARK: - TherapyPattern Model

/// A recurring emotional or behavioral pattern detected across therapy thoughts.
public struct TherapyPattern: Codable, Sendable {
    /// The recurring theme name.
    public var theme: String
    /// 1-2 sentence explanation of the pattern.
    public var description: String
    /// How many times this theme appeared.
    public var frequency: Int
    /// Whether the theme is "increasing", "stable", or "decreasing".
    public var trend: String
    /// IDs of thoughts that exhibit this pattern.
    public var relatedThoughtIds: [Int64]
    /// Confidence score from 0.0 to 1.0.
    public var confidence: Double

    public init(
        theme: String,
        description: String,
        frequency: Int,
        trend: String,
        relatedThoughtIds: [Int64] = [],
        confidence: Double
    ) {
        self.theme = theme
        self.description = description
        self.frequency = frequency
        self.trend = trend
        self.relatedThoughtIds = relatedThoughtIds
        self.confidence = min(1.0, max(0.0, confidence))
    }

    // Custom coding keys to match the JSON snake_case from Claude API
    private enum CodingKeys: String, CodingKey {
        case theme
        case description
        case frequency
        case trend
        case relatedThoughtIds = "related_thought_ids"
        case confidence
    }
}
