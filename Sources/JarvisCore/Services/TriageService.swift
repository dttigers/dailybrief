import Foundation

// MARK: - Errors

/// Errors that can occur during thought triage.
public enum TriageError: Error, LocalizedError {
    /// HTTP or network error from the Claude API.
    case apiError(String)
    /// Failed to parse the API response into a TriageResult.
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail):
            return "Triage API error: \(detail)"
        case .parseError(let detail):
            return "Triage parse error: \(detail)"
        }
    }
}

// MARK: - TriageResult

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

// MARK: - TriageService

/// Service that categorizes thoughts via the Claude API.
public actor TriageService {

    private let apiKey: String
    private let model: String

    /// Creates a TriageService with Claude API credentials.
    public init(apiKey: String, model: String) {
        self.apiKey = apiKey
        self.model = model
    }

    /// Categorizes a thought's content into one of the five thought categories.
    ///
    /// - Parameter content: The thought text to categorize.
    /// - Returns: A `TriageResult` with the assigned category and confidence score.
    /// - Throws: `TriageError.apiError` for HTTP/network errors, `TriageError.parseError` for response parsing failures.
    public func triage(_ content: String) async throws -> TriageResult {
        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 100,
            "system": """
                You are a thought categorizer. Categorize the user's thought into exactly one of these categories:

                - task: actionable to-do item, something to do or buy
                - therapy: feelings, emotions, therapy questions, mental health reflections
                - idea: creative ideas, feature concepts, business ideas, "what if" thoughts
                - reflection: observations, journal entries, life reflections, gratitude
                - project: project notes, technical decisions, work-related context

                Respond with ONLY a JSON object, no other text:
                {"category": "<category>", "confidence": <0.0-1.0>}
                """,
            "messages": [
                ["role": "user", "content": content]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw TriageError.apiError("Claude API returned status \(statusCode)")
        }

        // Parse the outer Claude API response to extract the text content
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let contentArray = json["content"] as? [[String: Any]],
              let text = contentArray.first?["text"] as? String else {
            throw TriageError.parseError("Could not extract text from Claude API response")
        }

        // Parse the inner JSON from Claude's response text
        guard let resultData = text.data(using: .utf8),
              let resultJson = try JSONSerialization.jsonObject(with: resultData) as? [String: Any],
              let categoryString = resultJson["category"] as? String,
              let confidenceValue = resultJson["confidence"] as? Double else {
            throw TriageError.parseError("Could not parse triage JSON from response: \(text)")
        }

        // Map category string to enum (case-insensitive)
        guard let category = ThoughtCategory(rawValue: categoryString.lowercased()) else {
            throw TriageError.parseError("Unknown category: \(categoryString)")
        }

        let confidence = min(1.0, max(0.0, confidenceValue))
        return TriageResult(category: category, confidence: confidence)
    }
}
