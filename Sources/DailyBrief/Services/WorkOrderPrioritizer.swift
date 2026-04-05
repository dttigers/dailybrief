import Foundation
import JarvisCore

/// Protocol for work order prioritization implementations.
protocol WorkOrderPrioritizing: Sendable {
    func prioritize(workOrders: [WorkOrder]) async throws -> [String]?
}

/// Errors that can occur during work order prioritization.
enum PrioritizationError: Error, LocalizedError {
    case apiError(String)
    case parseError(String)

    var errorDescription: String? {
        switch self {
        case .apiError(let detail):
            return "Prioritization API error: \(detail)"
        case .parseError(let detail):
            return "Prioritization parse error: \(detail)"
        }
    }
}

/// AI-powered work order prioritizer that uses Claude to rank open work orders by urgency.
actor WorkOrderPrioritizer: WorkOrderPrioritizing {

    private let apiKey: String
    private let model: String
    private let cacheDir: String

    /// Creates a WorkOrderPrioritizer with Claude API credentials.
    init(config: AppConfig.AIConfig) {
        self.apiKey = config.claudeApiKey
        self.model = config.claudeModel
        self.cacheDir = NSString("~/.cache/dailybrief").expandingTildeInPath
    }

    /// Analyzes work orders and returns case numbers in AI-recommended priority order (highest urgency first).
    ///
    /// - Parameter workOrders: The open work orders to prioritize.
    /// - Returns: Array of case numbers in priority order, or nil on failure.
    func prioritize(workOrders: [WorkOrder]) async throws -> [String]? {
        guard !workOrders.isEmpty else { return nil }

        // Build a hash of the current work order set for cache keying
        let caseNumbers = workOrders.map { $0.caseNumber }.sorted()
        let hashInput = caseNumbers.joined(separator: ",")
        let cacheHash = stableHash(hashInput)

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        let cachePath = (cacheDir as NSString).appendingPathComponent("wo-priority-\(today)-\(cacheHash).json")

        // Check cache first
        if let cachedData = FileManager.default.contents(atPath: cachePath),
           let cached = try? JSONDecoder().decode([String].self, from: cachedData) {
            Logger.log("Using cached WO priority order (\(cached.count) items)")
            return cached
        }

        // Call Claude for prioritization
        let priorityOrder = try await callClaude(workOrders: workOrders)

        // Cache the result
        try? FileManager.default.createDirectory(atPath: cacheDir, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(priorityOrder) {
            FileManager.default.createFile(atPath: cachePath, contents: data)
            Logger.log("Cached WO priority order to \(cachePath)")
        }

        return priorityOrder
    }

    // MARK: - Private

    private func callClaude(workOrders: [WorkOrder]) async throws -> [String] {
        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        // Format work orders as a numbered list
        var woList = ""
        for (index, wo) in workOrders.enumerated() {
            woList += """
                \(index + 1). Case: \(wo.caseNumber)
                   Store: \(wo.store)
                   Description: \(wo.shortDescription)
                   Trade: \(wo.trade)
                   Location: \(wo.location)
                   Equipment: \(wo.equipment)
                   Priority: \(wo.priority)
                   Contact: \(wo.contact)
                   State: \(wo.state)

                """
        }

        let body: [String: Any] = [
            "model": model,
            "max_tokens": 500,
            "system": """
                You are a facilities management assistant. Analyze these work orders and rank them \
                by urgency. Consider: safety hazards (electrical, water, gas), customer/business \
                impact (HVAC in extreme weather, security issues, food safety), time-sensitivity \
                (perishable equipment, active leaks), and trade complexity. \
                Respond with ONLY a JSON array of case numbers in priority order (highest urgency first), \
                e.g. ["CS0353601", "CS0353598"]. No other text.
                """,
            "messages": [
                ["role": "user", "content": "Rank these work orders by urgency:\n\n\(woList)"]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw PrioritizationError.apiError("Claude API returned status \(statusCode)")
        }

        // Parse outer Claude API response
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let contentArray = json["content"] as? [[String: Any]],
              let text = contentArray.first?["text"] as? String else {
            throw PrioritizationError.parseError("Could not extract text from Claude API response")
        }

        // Parse inner JSON array from Claude's response
        guard let resultData = text.data(using: .utf8),
              let resultArray = try JSONSerialization.jsonObject(with: resultData) as? [String] else {
            throw PrioritizationError.parseError("Could not parse priority JSON array from response: \(text)")
        }

        return resultArray
    }

    /// Simple stable hash for cache key derivation.
    private func stableHash(_ input: String) -> String {
        var hash: UInt64 = 5381
        for byte in input.utf8 {
            hash = ((hash &<< 5) &+ hash) &+ UInt64(byte)
        }
        return String(hash, radix: 16)
    }
}

// MARK: - API-backed WorkOrderPrioritizer (Vigil Core)

/// WorkOrderPrioritizer that calls the Vigil Core `/prioritize` endpoint instead of Anthropic directly.
actor APIWorkOrderPrioritizer: WorkOrderPrioritizing {
    private let client: VigilAPIClient

    init(client: VigilAPIClient) {
        self.client = client
    }

    func prioritize(workOrders: [WorkOrder]) async throws -> [String]? {
        guard !workOrders.isEmpty else { return nil }

        let requestBody = PrioritizeRequest(workOrders: workOrders)
        do {
            let response: PrioritizeResponse = try await client.post(path: "/prioritize", body: requestBody)
            return response.prioritizedCaseNumbers
        } catch {
            Logger.error("APIWorkOrderPrioritizer failed: \(error.localizedDescription)")
            return nil
        }
    }

    private struct PrioritizeRequest: Encodable {
        let workOrders: [WorkOrder]
    }

    private struct PrioritizeResponse: Decodable {
        let prioritizedCaseNumbers: [String]
    }
}
