import AppKit
import Foundation

// MARK: - ImageMediaType

/// Supported image media types for the Claude vision API.
public enum ImageMediaType: String, Sendable {
    case jpeg
    case png
    case gif
    case webp

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

// MARK: - Errors

/// Errors that can occur during image description.
public enum ImageDescriptionError: Error, LocalizedError {
    /// HTTP or network error from the Claude API.
    case apiError(String)
    /// Failed to parse the API response.
    case parseError(String)
    /// Image data exceeds the 20MB limit.
    case imageTooLarge

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail):
            return "Image description API error: \(detail)"
        case .parseError(let detail):
            return "Image description parse error: \(detail)"
        case .imageTooLarge:
            return "Image data exceeds the 20MB size limit"
        }
    }
}

// MARK: - ImageDescriptionService

/// Service that generates text descriptions from images via the Claude multimodal API.
public actor ImageDescriptionService {

    private let apiKey: String
    private let model: String

    /// Creates an ImageDescriptionService with Claude API credentials.
    public init(apiKey: String, model: String) {
        self.apiKey = apiKey
        self.model = model
    }

    /// Describes an image by sending it to Claude's vision API.
    ///
    /// - Parameters:
    ///   - imageData: The raw image data (must be under 20MB).
    ///   - mediaType: The image format.
    /// - Returns: A concise text description of the image.
    /// - Throws: `ImageDescriptionError` on failure.
    /// Maximum base64-encoded size the Claude API accepts (5MB).
    private static let maxBase64Size = 5_242_880

    /// Target size for compression — 1MB is plenty for vision descriptions.
    private static let targetSize = 1_048_576

    public func describe(imageData: Data, mediaType: ImageMediaType) async throws -> String {
        // Always compress images above target size for faster uploads and lower cost
        let finalData: Data
        let finalMediaType: ImageMediaType
        if imageData.count > Self.targetSize {
            guard let compressed = Self.compress(imageData, targetSize: Self.targetSize) else {
                throw ImageDescriptionError.imageTooLarge
            }
            finalData = compressed
            finalMediaType = .jpeg
        } else {
            finalData = imageData
            finalMediaType = mediaType
        }

        let base64String = finalData.base64EncodedString()

        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 300,
            "messages": [
                [
                    "role": "user",
                    "content": [
                        [
                            "type": "image",
                            "source": [
                                "type": "base64",
                                "media_type": finalMediaType.mimeType,
                                "data": base64String
                            ]
                        ],
                        [
                            "type": "text",
                            "text": "Describe this image concisely in 1-2 sentences. Focus on what is shown and any text visible in the image. This will be stored as a thought capture."
                        ]
                    ]
                ] as [String: Any]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let errorBody = String(data: data, encoding: .utf8) ?? "(no body)"
            NSLog("ImageDescriptionService: HTTP \(statusCode) — \(errorBody)")
            throw ImageDescriptionError.apiError("Claude API returned status \(statusCode): \(errorBody)")
        }

        // Parse outer Claude API response to extract text content
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let contentArray = json["content"] as? [[String: Any]],
              let text = contentArray.first?["text"] as? String else {
            throw ImageDescriptionError.parseError("Could not extract text from Claude API response")
        }

        let description = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !description.isEmpty else {
            throw ImageDescriptionError.parseError("Claude returned an empty description")
        }

        return description
    }

    /// Describes an image from a file URL.
    ///
    /// Reads the image data and detects the media type from the file extension.
    ///
    /// - Parameter imageURL: A file URL pointing to an image.
    /// - Returns: A concise text description of the image.
    /// - Throws: `ImageDescriptionError` on failure.
    public func describe(imageURL: URL) async throws -> String {
        let didAccess = imageURL.startAccessingSecurityScopedResource()
        defer { if didAccess { imageURL.stopAccessingSecurityScopedResource() } }

        let data = try Data(contentsOf: imageURL)
        let mediaType = Self.mediaType(for: imageURL)
        return try await describe(imageData: data, mediaType: mediaType)
    }

    // MARK: - Multi-Subject Description

    /// The prompt used to extract multiple subjects from notebook/notes images.
    private static let multiSubjectPrompt = """
        Analyze this image of handwritten notes or a notebook page. Identify each distinct subject, \
        topic, or thought present. Return a JSON array where each element represents one distinct subject:

        [{"subject": "brief topic label", "content": "full description of this subject/thought"}]

        If the image contains only one subject, return a single-element array. \
        If it's not a notebook/notes image, return a single element describing what you see. \
        Return ONLY the JSON array, no other text.
        """

    /// Analyzes an image and returns multiple descriptions when the image contains
    /// multiple distinct subjects (e.g., a notebook page with several topics).
    public func describeSubjects(imageData: Data, mediaType: ImageMediaType) async throws -> [String] {
        let finalData: Data
        let finalMediaType: ImageMediaType
        if imageData.count > Self.targetSize {
            guard let compressed = Self.compress(imageData, targetSize: Self.targetSize) else {
                throw ImageDescriptionError.imageTooLarge
            }
            finalData = compressed
            finalMediaType = .jpeg
        } else {
            finalData = imageData
            finalMediaType = mediaType
        }

        let base64String = finalData.base64EncodedString()

        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 1000,
            "messages": [
                [
                    "role": "user",
                    "content": [
                        [
                            "type": "image",
                            "source": [
                                "type": "base64",
                                "media_type": finalMediaType.mimeType,
                                "data": base64String
                            ]
                        ],
                        [
                            "type": "text",
                            "text": Self.multiSubjectPrompt
                        ]
                    ]
                ] as [String: Any]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let errorBody = String(data: data, encoding: .utf8) ?? "(no body)"
            NSLog("ImageDescriptionService: HTTP \(statusCode) — \(errorBody)")
            throw ImageDescriptionError.apiError("Claude API returned status \(statusCode): \(errorBody)")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let contentArray = json["content"] as? [[String: Any]],
              let text = contentArray.first?["text"] as? String else {
            throw ImageDescriptionError.parseError("Could not extract text from Claude API response")
        }

        return Self.parseSubjects(from: text)
    }

    /// Analyzes an image file and returns multiple descriptions for distinct subjects.
    public func describeSubjects(imageURL: URL) async throws -> [String] {
        let didAccess = imageURL.startAccessingSecurityScopedResource()
        defer { if didAccess { imageURL.stopAccessingSecurityScopedResource() } }

        let data = try Data(contentsOf: imageURL)
        let mediaType = Self.mediaType(for: imageURL)
        return try await describeSubjects(imageData: data, mediaType: mediaType)
    }

    /// Parses the JSON array response from the multi-subject prompt into an array of description strings.
    /// Falls back to returning the raw text as a single element if JSON parsing fails.
    internal static func parseSubjects(from text: String) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)

        // Try to parse as JSON array
        guard let jsonData = trimmed.data(using: .utf8),
              let array = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]] else {
            // Fallback: return the raw text as a single description
            guard !trimmed.isEmpty else { return [] }
            return [trimmed]
        }

        let descriptions = array.compactMap { entry -> String? in
            let subject = entry["subject"] as? String
            let content = entry["content"] as? String
            guard let content, !content.isEmpty else { return nil }
            if let subject, !subject.isEmpty {
                return "\(subject): \(content)"
            }
            return content
        }

        return descriptions.isEmpty ? [trimmed] : descriptions
    }

    /// Downscales and JPEG-compresses image data to fit within `targetSize` bytes.
    private static func compress(_ data: Data, targetSize: Int) -> Data? {
        guard let image = NSImage(data: data),
              let tiffData = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData) else {
            return nil
        }

        // Try progressively lower JPEG quality
        for quality in stride(from: 0.7, through: 0.1, by: -0.1) {
            if let jpeg = bitmap.representation(using: .jpeg, properties: [.compressionFactor: quality]),
               jpeg.count <= targetSize {
                return jpeg
            }
        }

        // Still too big — downscale to 50% and retry
        let newW = image.size.width * 0.5
        let newH = image.size.height * 0.5
        let resized = NSImage(size: NSSize(width: newW, height: newH))
        resized.lockFocus()
        image.draw(in: NSRect(x: 0, y: 0, width: newW, height: newH))
        resized.unlockFocus()

        guard let resizedTiff = resized.tiffRepresentation,
              let resizedBitmap = NSBitmapImageRep(data: resizedTiff) else {
            return nil
        }

        for quality in stride(from: 0.7, through: 0.1, by: -0.1) {
            if let jpeg = resizedBitmap.representation(using: .jpeg, properties: [.compressionFactor: quality]),
               jpeg.count <= targetSize {
                return jpeg
            }
        }

        return nil
    }

    /// Detects the image media type from a file extension.
    private static func mediaType(for url: URL) -> ImageMediaType {
        switch url.pathExtension.lowercased() {
        case "jpg", "jpeg":
            return .jpeg
        case "png":
            return .png
        case "gif":
            return .gif
        case "webp":
            return .webp
        default:
            return .jpeg
        }
    }
}

// MARK: - Protocol Conformance

extension ImageDescriptionService: ImageDescriptionProviding {}
