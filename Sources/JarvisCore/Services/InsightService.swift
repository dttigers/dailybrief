import Foundation

// MARK: - Errors

/// Errors that can occur during insight generation.
public enum InsightError: Error, LocalizedError {
    /// HTTP or network error from the Claude API.
    case apiError(String)
    /// Failed to parse the API response into insights.
    case parseError(String)

    public var errorDescription: String? {
        switch self {
        case .apiError(let detail):
            return "Insight API error: \(detail)"
        case .parseError(let detail):
            return "Insight parse error: \(detail)"
        }
    }
}

// MARK: - InsightService

/// Service that analyzes captured thought history via Claude to surface patterns,
/// connections, and action prompts.
public actor InsightService {

    private let apiKey: String
    private let model: String

    /// Creates an InsightService with Claude API credentials.
    public init(apiKey: String, model: String) {
        self.apiKey = apiKey
        self.model = model
    }

    /// Analyzes recent thoughts and generates actionable insights.
    ///
    /// - Parameters:
    ///   - thoughts: The thoughts to analyze.
    ///   - lookbackDays: Number of days of history being considered (for context in the prompt).
    /// - Returns: An array of `Insight` values with confidence >= 0.5.
    /// - Throws: `InsightError.apiError` for HTTP/network errors, `InsightError.parseError` for response parsing failures.
    public func generateInsights(thoughts: [Thought], lookbackDays: Int) async throws -> [Insight] {
        // Not enough data for meaningful insights
        guard thoughts.count >= 3 else { return [] }

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
            let category = thought.category?.rawValue ?? "uncategorized"
            let date = formatter.string(from: thought.createdAt)
            return "[\(id)] (\(category), \(date)) \(thought.content)"
        }.joined(separator: "\n")

        let userMessage = """
            Here are my captured thoughts from the last \(lookbackDays) days:

            \(thoughtList)

            Analyze these thoughts and return a JSON array of insights. Each insight should be:
            [{"type": "pattern|connection|actionPrompt|trend", "title": "...", "message": "...", "confidence": 0.0-1.0, "related_thought_ids": []}]

            Return ONLY the JSON array, no other text.
            """

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 1024,
            "system": """
                You are a personal insight engine for someone with ADHD. Analyze their recent \
                captured thoughts and surface useful patterns, connections between ideas, and \
                actionable suggestions. Focus on being genuinely helpful, not generic. Return \
                a JSON array of insights.
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
            throw InsightError.apiError("Claude API returned status \(statusCode)")
        }

        // Parse the outer Claude API response to extract the text content
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let contentArray = json["content"] as? [[String: Any]],
              let text = contentArray.first?["text"] as? String else {
            throw InsightError.parseError("Could not extract text from Claude API response")
        }

        // Parse the JSON array from Claude's response text
        guard let resultData = text.data(using: .utf8) else {
            throw InsightError.parseError("Could not convert response text to data")
        }

        let insights: [Insight]
        do {
            insights = try JSONDecoder().decode([Insight].self, from: resultData)
        } catch {
            throw InsightError.parseError("Could not parse insights JSON: \(error.localizedDescription). Response: \(text)")
        }

        // Filter insights below 0.5 confidence
        return insights.filter { $0.confidence >= 0.5 }
    }
}
