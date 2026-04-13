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
