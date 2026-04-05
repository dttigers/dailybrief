import Foundation

// MARK: - API AI Services
//
// Vigil Core API-backed implementations of the 6 AI service protocols.
// Each actor delegates to VigilAPIClient instead of calling Anthropic directly.
// Follows the same pattern as APIThoughtStore from Phase 34.

// MARK: - APITriageService

/// Vigil Core API-backed triage service.
public actor APITriageService: TriageProviding {

    private let client: VigilAPIClient

    public init(client: VigilAPIClient) {
        self.client = client
    }

    // DTO matching Vigil Core response shape
    private struct TriageRequest: Encodable {
        let content: String
    }

    private struct TriageResponse: Decodable {
        let category: String
        let confidence: Double
    }

    public func triage(_ content: String) async throws -> TriageResult {
        let response: TriageResponse
        do {
            response = try await client.post(
                path: "/triage",
                body: TriageRequest(content: content)
            )
        } catch let error as VigilAPIError {
            throw TriageError.apiError(error.localizedDescription)
        }

        guard let category = ThoughtCategory(rawValue: response.category.lowercased()) else {
            throw TriageError.parseError("Unknown category: \(response.category)")
        }

        return TriageResult(category: category, confidence: response.confidence)
    }
}

// MARK: - APIInsightService

/// Vigil Core API-backed insight generation service.
public actor APIInsightService: InsightProviding {

    private let client: VigilAPIClient

    public init(client: VigilAPIClient) {
        self.client = client
    }

    // Request DTOs
    private struct ThoughtDTO: Encodable {
        let id: Int64
        let content: String
        let category: String
        let createdAt: String
    }

    private struct InsightsRequest: Encodable {
        let thoughts: [ThoughtDTO]
        let days: Int
    }

    // Response DTOs — Vigil Core returns camelCase
    private struct InsightDTO: Decodable {
        let type: String
        let title: String
        let message: String
        let confidence: Double
        let relatedThoughtIds: [Int64]
    }

    private struct InsightsResponse: Decodable {
        let insights: [InsightDTO]
    }

    public func generateInsights(thoughts: [Thought], lookbackDays: Int) async throws -> [Insight] {
        guard thoughts.count >= 3 else { return [] }

        let formatter = ISO8601DateFormatter()
        let thoughtDTOs = thoughts.map { thought in
            ThoughtDTO(
                id: thought.id ?? 0,
                content: thought.content,
                category: thought.category?.rawValue ?? "uncategorized",
                createdAt: formatter.string(from: thought.createdAt)
            )
        }

        let response: InsightsResponse
        do {
            response = try await client.post(
                path: "/insights",
                body: InsightsRequest(thoughts: thoughtDTOs, days: lookbackDays)
            )
        } catch let error as VigilAPIError {
            throw InsightError.apiError(error.localizedDescription)
        }

        return response.insights.compactMap { dto in
            guard let type = InsightType(rawValue: dto.type) else { return nil }
            return Insight(
                type: type,
                title: dto.title,
                message: dto.message,
                confidence: dto.confidence,
                relatedThoughtIds: dto.relatedThoughtIds
            )
        }
    }
}

// MARK: - APIImageDescriptionService

/// Vigil Core API-backed image description service.
public actor APIImageDescriptionService: ImageDescriptionProviding {

    private let client: VigilAPIClient

    public init(client: VigilAPIClient) {
        self.client = client
    }

    private struct DescribeImageRequest: Encodable {
        let image: String
        let mediaType: String
    }

    private struct DescribeImageResponse: Decodable {
        let description: String
    }

    public func describe(imageData: Data, mediaType: ImageMediaType) async throws -> String {
        let base64String = imageData.base64EncodedString()

        let response: DescribeImageResponse
        do {
            response = try await client.post(
                path: "/describe-image",
                body: DescribeImageRequest(image: base64String, mediaType: mediaType.mimeType)
            )
        } catch let error as VigilAPIError {
            throw ImageDescriptionError.apiError(error.localizedDescription)
        }

        let description = response.description.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !description.isEmpty else {
            throw ImageDescriptionError.parseError("API returned an empty description")
        }

        return description
    }

    public func describe(imageURL: URL) async throws -> String {
        let data = try Data(contentsOf: imageURL)
        let mediaType = Self.mediaType(for: imageURL)
        return try await describe(imageData: data, mediaType: mediaType)
    }

    /// Detects the image media type from a file extension.
    private static func mediaType(for url: URL) -> ImageMediaType {
        switch url.pathExtension.lowercased() {
        case "jpg", "jpeg": return .jpeg
        case "png": return .png
        case "gif": return .gif
        case "webp": return .webp
        default: return .jpeg
        }
    }
}

// MARK: - APITherapyClassificationService

/// Vigil Core API-backed therapy classification service.
public actor APITherapyClassificationService: TherapyClassifyProviding {

    private let client: VigilAPIClient

    public init(client: VigilAPIClient) {
        self.client = client
    }

    private struct ClassifyRequest: Encodable {
        let content: String
    }

    private struct ClassifyResponse: Decodable {
        let classification: String
        let confidence: Double
        let reasoning: String
    }

    public func classify(_ content: String) async throws -> TherapyClassificationResult {
        let response: ClassifyResponse
        do {
            response = try await client.post(
                path: "/therapy/classify",
                body: ClassifyRequest(content: content)
            )
        } catch let error as VigilAPIError {
            throw TherapyClassificationError.apiError(error.localizedDescription)
        }

        guard let classification = TherapyClassification(rawValue: response.classification) else {
            throw TherapyClassificationError.parseError("Unknown classification: \(response.classification)")
        }

        return TherapyClassificationResult(
            classification: classification,
            confidence: response.confidence,
            reasoning: response.reasoning
        )
    }
}

// MARK: - APITherapyPatternService

/// Vigil Core API-backed therapy pattern detection service.
public actor APITherapyPatternService: TherapyPatternProviding {

    private let client: VigilAPIClient

    public init(client: VigilAPIClient) {
        self.client = client
    }

    private struct PatternThoughtDTO: Encodable {
        let id: Int64
        let content: String
        let therapyClassification: String
        let createdAt: String
    }

    private struct PatternsRequest: Encodable {
        let thoughts: [PatternThoughtDTO]
        let days: Int
    }

    private struct PatternDTO: Decodable {
        let theme: String
        let description: String
        let frequency: Int
        let trend: String
        let relatedThoughtIds: [Int64]
        let confidence: Double
    }

    private struct PatternsResponse: Decodable {
        let patterns: [PatternDTO]
    }

    public func detectPatterns(thoughts: [Thought], lookbackDays: Int) async throws -> [TherapyPattern] {
        guard thoughts.count >= 5 else { return [] }

        let formatter = ISO8601DateFormatter()
        let thoughtDTOs = thoughts.map { thought in
            PatternThoughtDTO(
                id: thought.id ?? 0,
                content: thought.content,
                therapyClassification: thought.therapyClassification?.rawValue ?? "unclassified",
                createdAt: formatter.string(from: thought.createdAt)
            )
        }

        let response: PatternsResponse
        do {
            response = try await client.post(
                path: "/therapy/patterns",
                body: PatternsRequest(thoughts: thoughtDTOs, days: lookbackDays)
            )
        } catch let error as VigilAPIError {
            throw TherapyPatternError.apiError(error.localizedDescription)
        }

        return response.patterns.map { dto in
            TherapyPattern(
                theme: dto.theme,
                description: dto.description,
                frequency: dto.frequency,
                trend: dto.trend,
                relatedThoughtIds: dto.relatedThoughtIds,
                confidence: dto.confidence
            )
        }
    }
}

// MARK: - APITherapyPrepService

/// Vigil Core API-backed therapy session prep generation service.
public actor APITherapyPrepService: TherapyPrepProviding {

    private let client: VigilAPIClient

    public init(client: VigilAPIClient) {
        self.client = client
    }

    private struct PrepThoughtDTO: Encodable {
        let id: Int64
        let content: String
        let createdAt: String
    }

    private struct PrepPatternDTO: Encodable {
        let theme: String
        let trend: String
        let confidence: Double
        let description: String
    }

    private struct PrepRequest: Encodable {
        let thoughts: [PrepThoughtDTO]
        let patterns: [PrepPatternDTO]
    }

    private struct PrepItemDTO: Decodable {
        let topic: String
        let context: String
        let urgency: String
        let relatedThoughtIds: [Int64]
    }

    private struct PrepResponse: Decodable {
        let items: [PrepItemDTO]
        let overallThemes: [String]
        let suggestedFocus: String
    }

    public func generatePrep(thoughts: [Thought], patterns: [TherapyPattern]) async throws -> TherapyPrep {
        guard !thoughts.isEmpty else {
            return TherapyPrep()
        }

        let formatter = ISO8601DateFormatter()
        let thoughtDTOs = thoughts.map { thought in
            PrepThoughtDTO(
                id: thought.id ?? 0,
                content: thought.content,
                createdAt: formatter.string(from: thought.createdAt)
            )
        }

        let patternDTOs = patterns.map { pattern in
            PrepPatternDTO(
                theme: pattern.theme,
                trend: pattern.trend,
                confidence: pattern.confidence,
                description: pattern.description
            )
        }

        let response: PrepResponse
        do {
            response = try await client.post(
                path: "/therapy/prep",
                body: PrepRequest(thoughts: thoughtDTOs, patterns: patternDTOs)
            )
        } catch let error as VigilAPIError {
            throw TherapyPrepError.apiError(error.localizedDescription)
        }

        return TherapyPrep(
            items: response.items.map { dto in
                TherapyPrepItem(
                    topic: dto.topic,
                    context: dto.context,
                    urgency: dto.urgency,
                    relatedThoughtIds: dto.relatedThoughtIds
                )
            },
            overallThemes: response.overallThemes,
            suggestedFocus: response.suggestedFocus
        )
    }
}
