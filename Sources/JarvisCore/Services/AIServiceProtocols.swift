import Foundation

// MARK: - AI Service Protocols
//
// Protocol abstractions for all AI services, enabling swappable backends
// (local Claude API calls vs. Vigil Core API) without changing consumer code.
// Follows the same pattern as ThoughtRepository protocol from Phase 34.

/// Protocol for thought categorization services.
public protocol TriageProviding: Actor {
    /// Categorizes a thought's content into one of the five thought categories.
    func triage(_ content: String) async throws -> TriageResult
}

/// Protocol for insight generation services.
public protocol InsightProviding: Actor {
    /// Analyzes recent thoughts and generates actionable insights.
    func generateInsights(thoughts: [Thought], lookbackDays: Int) async throws -> [Insight]
}

/// Protocol for image description services.
public protocol ImageDescriptionProviding: Actor {
    /// Describes an image from raw data.
    func describe(imageData: Data, mediaType: ImageMediaType) async throws -> String
    /// Describes an image from a file URL.
    func describe(imageURL: URL) async throws -> String
}

/// Protocol for therapy thought classification services.
public protocol TherapyClassifyProviding: Actor {
    /// Classifies a therapy thought as self-learnable or bring-to-therapist.
    func classify(_ content: String) async throws -> TherapyClassificationResult
}

/// Protocol for therapy pattern detection services.
public protocol TherapyPatternProviding: Actor {
    /// Detects recurring patterns across therapy thoughts.
    func detectPatterns(thoughts: [Thought], lookbackDays: Int) async throws -> [TherapyPattern]
}

/// Protocol for therapy session prep generation services.
public protocol TherapyPrepProviding: Actor {
    /// Generates a structured therapy session prep from recent thoughts.
    func generatePrep(thoughts: [Thought], patterns: [TherapyPattern]) async throws -> TherapyPrep
}
