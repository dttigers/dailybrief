import AppKit
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

// MARK: - Photo Processing Types (Phase 60 Plan 02)

/// Paper type classification sent to / returned from `/v1/process-photo`.
/// The client-side enum only expresses the two values the user can force
/// (the backend may ALSO return "unknown" as a raw string, which we keep in
/// `ProcessedPhotoResponse.paperType: String` without forcing a third case).
public enum PaperType: String, Codable, Sendable {
    case lined
    case gridded

    /// Human-readable label for UI display.
    public var displayName: String {
        switch self {
        case .lined: return "Lined"
        case .gridded: return "Gridded"
        }
    }
}

/// A single thought in a `/v1/process-photo` response. In preview mode, `id` is
/// nil and the commit-only fields are absent. In commit mode, the backend returns
/// a full `ThoughtApiResponse` shape — all "extra" fields are optional so the same
/// struct decodes both.
public struct PreviewThought: Codable, Sendable {
    public let id: Int64?
    public let content: String
    public let source: String
    public let confidence: Double?
    public let projectId: Int64?

    public init(id: Int64?, content: String, source: String, confidence: Double?, projectId: Int64?) {
        self.id = id
        self.content = content
        self.source = source
        self.confidence = confidence
        self.projectId = projectId
    }
}

/// Response shape from `/v1/process-photo` in both preview and commit modes.
public struct ProcessedPhotoResponse: Codable, Sendable {
    public let paperType: String       // "lined" | "gridded" | "unknown"
    public let confidence: Double
    public let thoughts: [PreviewThought]

    public init(paperType: String, confidence: Double, thoughts: [PreviewThought]) {
        self.paperType = paperType
        self.confidence = confidence
        self.thoughts = thoughts
    }
}

/// Typed error surface for the photo-processing path. Kept separate from
/// `ImageDescriptionError` so the dashboard can pattern-match on HTTP status
/// codes and map each one to its Phase 60 D-08 friendly banner text.
public enum ProcessPhotoError: Error, LocalizedError {
    /// File extension could not be mapped to a supported media type.
    case unsupportedMediaType
    /// Backend returned a non-2xx HTTP status. Status code preserved for D-08 mapping.
    case httpStatus(Int)
    /// Underlying network / URLSession / decoding error.
    case transport(Error)

    public var errorDescription: String? {
        switch self {
        case .unsupportedMediaType: return "Image format not supported"
        case .httpStatus(let code): return "HTTP \(code)"
        case .transport(let err): return err.localizedDescription
        }
    }
}

// MARK: - APIImageDescriptionService

/// Vigil Core API-backed image description service.
public actor APIImageDescriptionService: ImageDescriptionProviding {

    private let client: VigilAPIClient

    /// Target size for compression — 1MB raw keeps base64 under Claude's 5MB limit.
    private static let targetSize = 1_048_576

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

    /// Compresses image data if needed and returns (finalData, finalMediaType).
    private func prepareImage(_ imageData: Data, mediaType: ImageMediaType) throws -> (Data, ImageMediaType) {
        if imageData.count > Self.targetSize {
            guard let compressed = Self.compress(imageData, targetSize: Self.targetSize) else {
                throw ImageDescriptionError.imageTooLarge
            }
            return (compressed, .jpeg)
        }
        return (imageData, mediaType)
    }

    public func describe(imageData: Data, mediaType: ImageMediaType) async throws -> String {
        let (finalData, finalMediaType) = try prepareImage(imageData, mediaType: mediaType)
        let base64String = finalData.base64EncodedString()

        let response: DescribeImageResponse
        do {
            response = try await client.post(
                path: "/describe-image",
                body: DescribeImageRequest(image: base64String, mediaType: finalMediaType.mimeType)
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

    // MARK: - Multi-Subject Description

    private struct DescribeSubjectsResponse: Decodable {
        let descriptions: [String]
    }

    public func describeSubjects(imageData: Data, mediaType: ImageMediaType) async throws -> [String] {
        let (finalData, finalMediaType) = try prepareImage(imageData, mediaType: mediaType)
        let base64String = finalData.base64EncodedString()

        let response: DescribeSubjectsResponse
        do {
            response = try await client.post(
                path: "/describe-image",
                body: DescribeImageRequest(image: base64String, mediaType: finalMediaType.mimeType)
            )
        } catch let error as VigilAPIError {
            throw ImageDescriptionError.apiError(error.localizedDescription)
        }

        let descriptions = response.descriptions.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !descriptions.isEmpty else {
            throw ImageDescriptionError.parseError("API returned no descriptions")
        }

        return descriptions
    }

    public func describeSubjects(imageURL: URL) async throws -> [String] {
        let data = try Data(contentsOf: imageURL)
        let mediaType = Self.mediaType(for: imageURL)
        return try await describeSubjects(imageData: data, mediaType: mediaType)
    }

    // MARK: - Smart Photo Upload (Phase 60 Plan 02)

    /// Request body for `POST /v1/process-photo`.
    /// `forcePaperType` is omitted from the encoded body when nil (conditional
    /// encoding via `encodeIfPresent`) so the backend cannot see a spurious
    /// `"forcePaperType": null` field.
    private struct ProcessPhotoRequest: Encodable {
        let image: String
        let mediaType: String
        let forcePaperType: String?

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(image, forKey: .image)
            try c.encode(mediaType, forKey: .mediaType)
            try c.encodeIfPresent(forcePaperType, forKey: .forcePaperType)
        }

        private enum CodingKeys: String, CodingKey {
            case image, mediaType, forcePaperType
        }
    }

    /// Calls `POST /v1/process-photo` with optional preview + forcePaperType override.
    ///
    /// - Parameters:
    ///   - imageData: Raw image bytes. Will be compressed via `prepareImage` if
    ///     larger than the 1MB soft cap (same compression path as describeSubjects).
    ///   - mediaType: Source media type (jpeg/png/gif/webp). If compression runs,
    ///     the final media type will be .jpeg regardless.
    ///   - preview: When true, appends `?preview=true` and the backend skips the
    ///     DB insert. PreviewThought.id will be nil in the returned array.
    ///   - forcePaperType: Optional override. When nil, the field is omitted from
    ///     the body entirely (NOT sent as null).
    /// - Returns: The decoded `ProcessedPhotoResponse` on 2xx.
    /// - Throws: `ProcessPhotoError.httpStatus(code)` on non-2xx; the caller maps
    ///   each code to its D-08 banner string. Other failures bubble up as
    ///   `ProcessPhotoError.transport(_)`.
    public func processPhoto(
        imageData: Data,
        mediaType: ImageMediaType,
        preview: Bool,
        forcePaperType: PaperType?
    ) async throws -> ProcessedPhotoResponse {
        let (finalData, finalMediaType) = try prepareImage(imageData, mediaType: mediaType)
        let base64String = finalData.base64EncodedString()

        let requestBody = ProcessPhotoRequest(
            image: base64String,
            mediaType: finalMediaType.mimeType,
            forcePaperType: forcePaperType?.rawValue
        )

        do {
            if preview {
                let response: ProcessedPhotoResponse = try await client.post(
                    path: "/process-photo",
                    query: ["preview": "true"],
                    body: requestBody
                )
                return response
            } else {
                let response: ProcessedPhotoResponse = try await client.post(
                    path: "/process-photo",
                    body: requestBody
                )
                return response
            }
        } catch let error as VigilAPIError {
            // Map HTTP failures to the typed dashboard error so the view-model
            // can switch on the status code for D-08 banner mapping. Raw server
            // bodies are NOT surfaced to the caller (Phase 60 T-60-12).
            switch error {
            case .httpError(let statusCode, _):
                throw ProcessPhotoError.httpStatus(statusCode)
            case .networkError(let underlying):
                throw ProcessPhotoError.transport(underlying)
            case .decodingError(let underlying):
                throw ProcessPhotoError.transport(underlying)
            case .encodingError(let underlying):
                throw ProcessPhotoError.transport(underlying)
            case .serverUnavailable:
                throw ProcessPhotoError.transport(error)
            }
        }
    }

    /// Convenience overload that reads bytes from a file URL.
    public func processPhoto(
        imageURL: URL,
        preview: Bool,
        forcePaperType: PaperType?
    ) async throws -> ProcessedPhotoResponse {
        let data: Data
        do {
            data = try Data(contentsOf: imageURL)
        } catch {
            throw ProcessPhotoError.transport(error)
        }
        let mediaType = Self.mediaType(for: imageURL)
        return try await processPhoto(
            imageData: data,
            mediaType: mediaType,
            preview: preview,
            forcePaperType: forcePaperType
        )
    }

    // MARK: - Compression

    /// Downscales and JPEG-compresses image data to fit within `targetSize` bytes.
    private static func compress(_ data: Data, targetSize: Int) -> Data? {
        guard let image = NSImage(data: data) else { return nil }

        var currentImage = image
        for _ in 0..<4 {
            guard let tiffData = currentImage.tiffRepresentation,
                  let bitmap = NSBitmapImageRep(data: tiffData) else {
                return nil
            }

            for quality in stride(from: 0.7, through: 0.1, by: -0.1) {
                if let jpeg = bitmap.representation(using: .jpeg, properties: [.compressionFactor: quality]),
                   jpeg.count <= targetSize {
                    return jpeg
                }
            }

            let newW = currentImage.size.width * 0.5
            let newH = currentImage.size.height * 0.5
            guard newW >= 100 && newH >= 100 else { return nil }
            let resized = NSImage(size: NSSize(width: newW, height: newH))
            resized.lockFocus()
            currentImage.draw(in: NSRect(x: 0, y: 0, width: newW, height: newH))
            resized.unlockFocus()
            currentImage = resized
        }

        return nil
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

// MARK: - Chat Types

/// A single message in a chat conversation.
public struct ChatMessage: Codable, Sendable {
    public let role: String
    public let content: String

    public init(role: String, content: String) {
        self.role = role
        self.content = content
    }
}

/// Response from the chat endpoint.
public struct ChatResponse: Decodable, Sendable {
    public let response: String
    public let contextUsed: Int
}

/// Errors thrown by chat operations.
public enum ChatError: Error, LocalizedError {
    case apiError(String)
    case emptyResponse

    public var errorDescription: String? {
        switch self {
        case .apiError(let message):
            return "Chat error: \(message)"
        case .emptyResponse:
            return "The assistant returned an empty response"
        }
    }
}

/// Protocol for chat service providers.
public protocol ChatProviding: Sendable {
    func chat(messages: [ChatMessage], includeContext: Bool) async throws -> ChatResponse
}

// MARK: - APIChatService

/// Vigil Core API-backed chat service.
public actor APIChatService: ChatProviding {

    private let client: VigilAPIClient

    public init(client: VigilAPIClient) {
        self.client = client
    }

    private struct ChatRequest: Encodable {
        let messages: [ChatMessage]
        let includeContext: Bool
        let contextLimit: Int
    }

    public func chat(messages: [ChatMessage], includeContext: Bool) async throws -> ChatResponse {
        let response: ChatResponse
        do {
            response = try await client.post(
                path: "/chat",
                body: ChatRequest(messages: messages, includeContext: includeContext, contextLimit: 20)
            )
        } catch let error as VigilAPIError {
            throw ChatError.apiError(error.localizedDescription)
        }

        guard !response.response.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ChatError.emptyResponse
        }

        return response
    }
}
