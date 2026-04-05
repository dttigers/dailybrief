import Foundation

// MARK: - Errors

/// Errors that can occur during therapy classification.
public enum TherapyClassificationError: Error, LocalizedError {
    /// HTTP or network error from the Claude API.
    case apiError(String)
    /// Failed to parse the API response into a TherapyClassificationResult.
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail):
            return "Therapy classification API error: \(detail)"
        case .parseError(let detail):
            return "Therapy classification parse error: \(detail)"
        }
    }
}

// MARK: - TherapyClassificationResult

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

// MARK: - TherapyClassificationService

/// Service that classifies therapy-category thoughts via the Claude API.
/// Determines whether a thought can be worked through independently
/// or should be brought to a therapist session.
public actor TherapyClassificationService {

    private let apiKey: String
    private let model: String

    /// Creates a TherapyClassificationService with Claude API credentials.
    public init(apiKey: String, model: String) {
        self.apiKey = apiKey
        self.model = model
    }

    /// Classifies a therapy thought as self-learnable or bring-to-therapist.
    ///
    /// - Parameter content: The therapy thought text to classify.
    /// - Returns: A `TherapyClassificationResult` with classification, confidence, and reasoning.
    /// - Throws: `TherapyClassificationError.apiError` for HTTP/network errors,
    ///   `TherapyClassificationError.parseError` for response parsing failures.
    public func classify(_ content: String) async throws -> TherapyClassificationResult {
        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 150,
            "system": """
                You are a therapy thought classifier for a personal journaling tool. Your role is to help the user understand which thoughts they can explore independently vs which would benefit from discussing with their therapist.

                IMPORTANT: You are a categorization tool, NOT a therapist. Your classifications are suggestions to help organize therapy prep, not clinical advice.

                Classify the thought into one of two categories:

                - selfLearnable: The user can likely work through this independently. Includes: self-reflection exercises, mindfulness practices, journaling prompts, cognitive reframing the user could do alone, gratitude practices, goal-setting, habit tracking observations, general emotional check-ins.

                - bringToTherapist: This would benefit from professional guidance. Includes: recurring distressing patterns, trauma-related content, relationship conflicts needing mediation perspective, feelings of hopelessness or being stuck, topics the user keeps circling back to without resolution, strong emotional reactions they don't understand, anything involving safety concerns.

                When in doubt, classify as bringToTherapist — it's better to over-recommend professional support than under-recommend.

                Respond with ONLY a JSON object:
                {"classification": "<selfLearnable|bringToTherapist>", "confidence": <0.0-1.0>, "reasoning": "<1 sentence explaining why>"}
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
            throw TherapyClassificationError.apiError("Claude API returned status \(statusCode)")
        }

        // Parse the outer Claude API response to extract the text content
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let contentArray = json["content"] as? [[String: Any]],
              let text = contentArray.first?["text"] as? String else {
            throw TherapyClassificationError.parseError("Could not extract text from Claude API response")
        }

        // Parse the inner JSON from Claude's response text
        guard let resultData = text.data(using: .utf8),
              let resultJson = try JSONSerialization.jsonObject(with: resultData) as? [String: Any],
              let classificationString = resultJson["classification"] as? String,
              let confidenceValue = resultJson["confidence"] as? Double,
              let reasoning = resultJson["reasoning"] as? String else {
            throw TherapyClassificationError.parseError("Could not parse classification JSON from response: \(text)")
        }

        // Map classification string to enum
        guard let classification = TherapyClassification(rawValue: classificationString) else {
            throw TherapyClassificationError.parseError("Unknown classification: \(classificationString)")
        }

        let confidence = min(1.0, max(0.0, confidenceValue))
        return TherapyClassificationResult(classification: classification, confidence: confidence, reasoning: reasoning)
    }
}

// MARK: - Protocol Conformance

extension TherapyClassificationService: TherapyClassifyProviding {}
