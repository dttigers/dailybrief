import Foundation

// MARK: - Errors

/// Errors that can occur during therapy pattern detection.
public enum TherapyPatternError: Error, LocalizedError {
    /// HTTP or network error from the Claude API.
    case apiError(String)
    /// Failed to parse the API response into therapy patterns.
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail):
            return "Therapy pattern API error: \(detail)"
        case .parseError(let detail):
            return "Therapy pattern parse error: \(detail)"
        }
    }
}

// MARK: - TherapyPatternService

/// Service that detects recurring emotional and behavioral patterns across therapy thoughts
/// via the Claude API.
public actor TherapyPatternService {

    private let apiKey: String
    private let model: String

    /// Creates a TherapyPatternService with Claude API credentials.
    public init(apiKey: String, model: String) {
        self.apiKey = apiKey
        self.model = model
    }

    /// Detects recurring patterns across therapy thoughts.
    ///
    /// - Parameters:
    ///   - thoughts: The therapy thoughts to analyze.
    ///   - lookbackDays: Number of days of history being considered (for context in the prompt).
    /// - Returns: An array of `TherapyPattern` values with confidence >= 0.5.
    /// - Throws: `TherapyPatternError.apiError` for HTTP/network errors,
    ///   `TherapyPatternError.parseError` for response parsing failures.
    public func detectPatterns(thoughts: [Thought], lookbackDays: Int) async throws -> [TherapyPattern] {
        // Need minimum data for meaningful pattern detection
        guard thoughts.count >= 5 else { return [] }

        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        // Format thoughts for the prompt
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short

        let thoughtList = thoughts.map { thought -> String in
            let id = thought.id.map { String($0) } ?? "?"
            let classification = thought.therapyClassification?.rawValue ?? "unclassified"
            let date = formatter.string(from: thought.createdAt)
            return "[\(id)] (\(classification), \(date)) \(thought.content)"
        }.joined(separator: "\n")

        let userMessage = """
            Here are my therapy-related thoughts from the last \(lookbackDays) days:

            \(thoughtList)

            Analyze these thoughts and identify recurring patterns. Return a JSON array:
            [{"theme": "...", "description": "...", "frequency": N, "trend": "increasing|stable|decreasing", "related_thought_ids": [], "confidence": 0.0-1.0}]

            Return ONLY the JSON array, no other text.
            """

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 1024,
            "system": """
                You are a pattern detection tool, NOT a therapist. Your role is to surface \
                observations to help the user prepare for therapy sessions.

                Analyze the user's therapy-related thoughts and identify recurring emotional \
                themes, behavioral patterns, and unresolved concerns. For each pattern:

                - Name the theme concisely
                - Describe what you observe in 1-2 sentences
                - Count how many thoughts relate to this theme
                - Note whether the theme appears to be increasing, stable, or decreasing \
                in frequency based on timestamps
                - List the thought IDs that exhibit this pattern
                - Rate your confidence (0.0-1.0) in the pattern being genuine, not \
                surface-level

                Focus on genuine patterns, not surface-level observations. Look for:
                - Recurring emotional states or triggers
                - Behavioral cycles (avoidance, rumination, etc.)
                - Unresolved concerns that keep appearing
                - Relationship dynamics that repeat
                - Progress or regression in specific areas
                """,
            "messages": [
                ["role": "user", "content": userMessage]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw TherapyPatternError.apiError("Claude API returned status \(statusCode)")
        }

        // Parse the outer Claude API response to extract the text content
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let contentArray = json["content"] as? [[String: Any]],
              let text = contentArray.first?["text"] as? String else {
            throw TherapyPatternError.parseError("Could not extract text from Claude API response")
        }

        // Parse the JSON array from Claude's response text
        guard let resultData = text.data(using: .utf8) else {
            throw TherapyPatternError.parseError("Could not convert response text to data")
        }

        let patterns: [TherapyPattern]
        do {
            patterns = try JSONDecoder().decode([TherapyPattern].self, from: resultData)
        } catch {
            throw TherapyPatternError.parseError("Could not parse patterns JSON: \(error.localizedDescription). Response: \(text)")
        }

        // Filter patterns below 0.5 confidence
        return patterns.filter { $0.confidence >= 0.5 }
    }
}

// MARK: - Protocol Conformance

extension TherapyPatternService: TherapyPatternProviding {}
