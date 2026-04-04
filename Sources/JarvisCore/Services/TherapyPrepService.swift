import Foundation

// MARK: - Errors

/// Errors that can occur during therapy prep generation.
public enum TherapyPrepError: Error, LocalizedError {
    /// HTTP or network error from the Claude API.
    case apiError(String)
    /// Failed to parse the API response into therapy prep.
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail):
            return "Therapy prep API error: \(detail)"
        case .parseError(let detail):
            return "Therapy prep parse error: \(detail)"
        }
    }
}

// MARK: - TherapyPrepService

/// Service that generates structured therapy session preparation summaries
/// from thoughts marked for therapist discussion.
public actor TherapyPrepService {

    private let apiKey: String
    private let model: String

    /// Creates a TherapyPrepService with Claude API credentials.
    public init(apiKey: String, model: String) {
        self.apiKey = apiKey
        self.model = model
    }

    /// Generates a structured therapy session prep from recent thoughts.
    ///
    /// - Parameters:
    ///   - thoughts: Recent bringToTherapist thoughts to organize.
    ///   - patterns: Optional detected patterns for additional context (can be empty).
    /// - Returns: A `TherapyPrep` with organized topics, themes, and suggested focus.
    /// - Throws: `TherapyPrepError.apiError` for HTTP/network errors,
    ///   `TherapyPrepError.parseError` for response parsing failures.
    public func generatePrep(thoughts: [Thought], patterns: [TherapyPattern] = []) async throws -> TherapyPrep {
        // Need at least one thought to generate prep
        guard !thoughts.isEmpty else {
            return TherapyPrep()
        }

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
            let date = formatter.string(from: thought.createdAt)
            return "[\(id)] (\(date)) \(thought.content)"
        }.joined(separator: "\n")

        var userMessage = """
            Here are my recent thoughts marked for discussion with my therapist:

            \(thoughtList)
            """

        // Add patterns context if available
        if !patterns.isEmpty {
            let patternList = patterns.map { pattern -> String in
                return "- \(pattern.theme) (\(pattern.trend), confidence: \(String(format: "%.1f", pattern.confidence))): \(pattern.description)"
            }.joined(separator: "\n")

            userMessage += """


                Detected recurring patterns for additional context:

                \(patternList)
                """
        }

        userMessage += """


            Generate a structured therapy session prep. Return a JSON object:
            {"items": [{"topic": "...", "context": "...", "urgency": "high|medium|low", "related_thought_ids": []}], "overall_themes": ["..."], "suggested_focus": "..."}

            Return ONLY the JSON object, no other text.
            """

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 1024,
            "system": """
                You are organizing the user's own thoughts for their therapy prep, NOT \
                providing therapy or clinical advice.

                Generate a structured therapy session preparation from the user's recent \
                thoughts that they marked for therapist discussion. Your job is to:

                - Organize thoughts into clear discussion topics
                - Provide brief context for each topic so the user can reference it quickly
                - Assign urgency levels (high/medium/low) based on emotional intensity \
                and how pressing the topic seems
                - If recurring patterns are provided, use them to add context about themes \
                that keep appearing
                - Identify overall themes across all topics
                - Suggest a session focus based on what seems most pressing or important

                Keep topics concise and actionable. The user should be able to glance at \
                this prep before their session and know exactly what to discuss.
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
            throw TherapyPrepError.apiError("Claude API returned status \(statusCode)")
        }

        // Parse the outer Claude API response to extract the text content
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let contentArray = json["content"] as? [[String: Any]],
              let text = contentArray.first?["text"] as? String else {
            throw TherapyPrepError.parseError("Could not extract text from Claude API response")
        }

        // Parse the JSON object from Claude's response text
        guard let resultData = text.data(using: .utf8) else {
            throw TherapyPrepError.parseError("Could not convert response text to data")
        }

        do {
            return try JSONDecoder().decode(TherapyPrep.self, from: resultData)
        } catch {
            throw TherapyPrepError.parseError("Could not parse therapy prep JSON: \(error.localizedDescription). Response: \(text)")
        }
    }
}
