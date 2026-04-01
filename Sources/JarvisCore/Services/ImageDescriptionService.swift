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
    public func describe(imageData: Data, mediaType: ImageMediaType) async throws -> String {
        // Validate size (20MB limit)
        guard imageData.count < 20_000_000 else {
            throw ImageDescriptionError.imageTooLarge
        }

        let base64String = imageData.base64EncodedString()

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
                                "media_type": mediaType.mimeType,
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
            throw ImageDescriptionError.apiError("Claude API returned status \(statusCode)")
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
        let data = try Data(contentsOf: imageURL)
        let mediaType = Self.mediaType(for: imageURL)
        return try await describe(imageData: data, mediaType: mediaType)
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
