import Foundation

// MARK: - AI Service Types
//
// Shared types used by AI service protocols and their implementations.

/// The result of AI-powered thought categorization.
public struct TriageResult: Codable, Sendable {
    /// The assigned category for the thought.
    public var category: ThoughtCategory
    /// Confidence score from 0.0 to 1.0.
    public var confidence: Double

    public init(category: ThoughtCategory, confidence: Double) {
        self.category = category
        self.confidence = min(1.0, max(0.0, confidence))
    }
}

/// Errors that can occur during thought triage.
public enum TriageError: Error, LocalizedError {
    case apiError(String)
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail): return "Triage API error: \(detail)"
        case .parseError(let detail): return "Triage parse error: \(detail)"
        }
    }
}

/// Supported image media types for description services.
public enum ImageMediaType: String, Sendable {
    case jpeg, png, gif, webp

    /// The MIME type string for this media type.
    public var mimeType: String {
        switch self {
        case .jpeg: return "image/jpeg"
        case .png: return "image/png"
        case .gif: return "image/gif"
        case .webp: return "image/webp"
        }
    }
}

/// Errors that can occur during image description.
public enum ImageDescriptionError: Error, LocalizedError {
    case apiError(String)
    case parseError(String)
    case imageTooLarge

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail): return "Image description API error: \(detail)"
        case .parseError(let detail): return "Image description parse error: \(detail)"
        case .imageTooLarge: return "Image data exceeds the 20MB size limit"
        }
    }
}

/// The result of AI-powered therapy thought classification.
public struct TherapyClassificationResult: Codable, Sendable {
    /// The assigned classification for the therapy thought.
    public var classification: TherapyClassification
    /// Confidence score from 0.0 to 1.0.
    public var confidence: Double
    /// Brief explanation for user transparency.
    public var reasoning: String

    public init(classification: TherapyClassification, confidence: Double, reasoning: String) {
        self.classification = classification
        self.confidence = min(1.0, max(0.0, confidence))
        self.reasoning = reasoning
    }
}

/// Errors that can occur during therapy classification.
public enum TherapyClassificationError: Error, LocalizedError {
    case apiError(String)
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail): return "Therapy classification API error: \(detail)"
        case .parseError(let detail): return "Therapy classification parse error: \(detail)"
        }
    }
}

/// Errors that can occur during insight generation.
public enum InsightError: Error, LocalizedError {
    case apiError(String)
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail): return "Insight API error: \(detail)"
        case .parseError(let detail): return "Insight parse error: \(detail)"
        }
    }
}

/// Errors that can occur during therapy pattern detection.
public enum TherapyPatternError: Error, LocalizedError {
    case apiError(String)
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail): return "Therapy pattern API error: \(detail)"
        case .parseError(let detail): return "Therapy pattern parse error: \(detail)"
        }
    }
}

/// Errors that can occur during therapy prep generation.
public enum TherapyPrepError: Error, LocalizedError {
    case apiError(String)
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail): return "Therapy prep API error: \(detail)"
        case .parseError(let detail): return "Therapy prep parse error: \(detail)"
        }
    }
}

// MARK: - AI Service Protocols
//
// Protocol abstractions for all AI services, enabling swappable backends
// (local Claude API calls vs. Vigil Core API) without changing consumer code.

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
    /// Analyzes an image and returns multiple descriptions when the image contains
    /// multiple distinct subjects (e.g., a notebook page with several topics).
    func describeSubjects(imageData: Data, mediaType: ImageMediaType) async throws -> [String]
    /// Analyzes an image file and returns multiple descriptions for distinct subjects.
    func describeSubjects(imageURL: URL) async throws -> [String]
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
