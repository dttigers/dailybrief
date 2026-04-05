import Foundation
import JarvisCore

protocol AIProvider: Sendable {
    func generateAffirmation(recentThoughts: [String]) async throws -> String
}

// MARK: - API-backed AIProvider (Vigil Core)

/// AIProvider that calls the Vigil Core `/affirmation` endpoint instead of Anthropic directly.
actor APIAIProvider: AIProvider {
    private let client: VigilAPIClient

    init(client: VigilAPIClient) {
        self.client = client
    }

    func generateAffirmation(recentThoughts: [String]) async throws -> String {
        let requestBody = AffirmationRequest(recentThoughts: recentThoughts)
        do {
            let response: AffirmationResponse = try await client.post(path: "/affirmation", body: requestBody)
            return response.affirmation
        } catch {
            Logger.error("APIAIProvider affirmation failed: \(error.localizedDescription)")
            return "You are capable, you are enough, and today is full of possibility."
        }
    }

    private struct AffirmationRequest: Encodable {
        let recentThoughts: [String]
    }

    private struct AffirmationResponse: Decodable {
        let affirmation: String
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
