import Foundation

protocol AIProvider: Sendable {
    func generateAffirmation() async throws -> String
}

actor ClaudeAIProvider: AIProvider {
    private let apiKey: String
    private let model: String
    private let cacheDir: String

    init(config: AppConfig.AIConfig) {
        self.apiKey = config.claudeApiKey
        self.model = config.claudeModel
        self.cacheDir = NSString("~/.cache/dailybrief").expandingTildeInPath
    }

    func generateAffirmation() async throws -> String {
        // Check daily cache first
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        let cachePath = (cacheDir as NSString).appendingPathComponent("affirmation-\(today).txt")

        if let cached = try? String(contentsOfFile: cachePath, encoding: .utf8) {
            return cached
        }

        let affirmation = try await callClaude()

        // Cache for today
        try? FileManager.default.createDirectory(atPath: cacheDir, withIntermediateDirectories: true)
        try? affirmation.write(toFile: cachePath, atomically: true, encoding: .utf8)

        return affirmation
    }

    private func callClaude() async throws -> String {
        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 200,
            "system": """
                Generate a brief, warm ADHD-specific affirmation (2-3 sentences). \
                Address themes like focus, time management, self-worth, or embracing \
                how your brain works. Be encouraging but not patronizing. \
                Vary the theme each day. Return only the affirmation text.
                """,
            "messages": [
                ["role": "user", "content": "Give me today's ADHD affirmation."]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw AIError.apiError("Claude API returned status \(statusCode)")
        }

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let content = json?["content"] as? [[String: Any]]
        let text = content?.first?["text"] as? String

        return text ?? "You are capable, you are enough, and today is full of possibility."
    }
}

enum AIError: LocalizedError {
    case apiError(String)
    var errorDescription: String? {
        switch self {
        case .apiError(let msg): return msg
        }
    }
}
