import Foundation

// MARK: - Error Types

/// Errors thrown by VigilAPIClient operations.
public enum VigilAPIError: Error, LocalizedError {
    case networkError(Error)
    case httpError(statusCode: Int, message: String)
    case decodingError(Error)
    case serverUnavailable

    public var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .httpError(let statusCode, let message):
            return "HTTP \(statusCode): \(message)"
        case .decodingError(let error):
            return "Decoding error: \(error.localizedDescription)"
        case .serverUnavailable:
            return "Vigil Core API server is unavailable"
        }
    }
}

// MARK: - Response Types

/// Paginated response wrapper for list endpoints.
public struct PaginatedResponse<T: Decodable & Sendable>: Decodable, Sendable {
    public let data: [T]
    public let total: Int
    public let limit: Int
    public let offset: Int
}

/// Response for bulk update operations.
public struct CountResponse: Decodable, Sendable {
    public let updated: Int
}

// MARK: - VigilAPIClient

/// Typed HTTP client for Vigil Core API.
///
/// Provides generic GET, POST, PUT, DELETE helpers with ISO 8601 date handling
/// and structured error reporting.
public actor VigilAPIClient {

    // MARK: Properties

    private let baseURL: URL
    private let session: URLSession
    private let apiKey: String?

    private let jsonDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            if let date = formatter.date(from: dateString) {
                return date
            }
            // Fallback without fractional seconds
            let basic = ISO8601DateFormatter()
            basic.formatOptions = [.withInternetDateTime]
            if let date = basic.date(from: dateString) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode date: \(dateString)")
        }
        return decoder
    }()

    private let jsonEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    // MARK: Initialization

    /// Creates a VigilAPIClient targeting the given base URL.
    /// - Parameters:
    ///   - baseURL: The Vigil Core API base URL (e.g., `https://vigil-core-production.up.railway.app/v1`).
    ///   - apiKey: Optional API key for Bearer authentication. When non-nil and non-empty, an Authorization header is sent.
    ///   - session: URLSession to use for requests. Defaults to `.shared`.
    public init(baseURL: URL, apiKey: String? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.session = session
    }

    // MARK: HTTP Methods

    /// Apply common headers (Accept, Authorization) to a request.
    private func applyHeaders(_ request: inout URLRequest) {
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let apiKey, !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
    }

    /// Perform a GET request and decode the response.
    /// - Parameters:
    ///   - path: API path relative to baseURL (e.g., `/thoughts`).
    ///   - query: Optional query parameters.
    /// - Returns: Decoded response of type `T`.
    public func get<T: Decodable>(path: String, query: [String: String] = [:]) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        applyHeaders(&request)

        return try await perform(request)
    }

    /// Perform a POST request with a JSON body and decode the response.
    /// - Parameters:
    ///   - path: API path relative to baseURL.
    ///   - body: Encodable request body.
    /// - Returns: Decoded response of type `T`.
    public func post<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyHeaders(&request)
        request.httpBody = try encodeBody(body)

        return try await perform(request)
    }

    /// Perform a PUT request with a JSON body and decode the response.
    /// - Parameters:
    ///   - path: API path relative to baseURL.
    ///   - body: Encodable request body.
    /// - Returns: Decoded response of type `T`.
    public func put<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyHeaders(&request)
        request.httpBody = try encodeBody(body)

        return try await perform(request)
    }

    /// Perform a DELETE request.
    /// - Parameter path: API path relative to baseURL.
    public func delete(path: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "DELETE"
        applyHeaders(&request)

        let (data, response) = try await executeRequest(request)
        try validateResponse(data: data, response: response)
    }

    /// Perform a POST request with a JSON body, returning just the HTTP status code.
    /// Useful for operations that don't return a meaningful response body.
    /// - Parameters:
    ///   - path: API path relative to baseURL.
    ///   - body: Encodable request body.
    /// - Returns: HTTP status code.
    public func postNoResponse<B: Encodable>(path: String, body: B) async throws -> Int {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        applyHeaders(&request)
        request.httpBody = try encodeBody(body)

        let (data, response) = try await executeRequest(request)
        try validateResponse(data: data, response: response)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw VigilAPIError.serverUnavailable
        }
        return httpResponse.statusCode
    }

    /// Perform a GET request and return raw Data (no JSON decoding).
    /// Useful for non-JSON responses like CSV or Markdown exports.
    /// - Parameters:
    ///   - path: API path relative to baseURL (e.g., `/export`).
    ///   - query: Optional query parameters.
    ///   - accept: Accept header value (e.g., `text/csv`). Defaults to `application/json`.
    /// - Returns: Raw response Data.
    public func getRawData(path: String, query: [String: String] = [:], accept: String = "application/json") async throws -> Data {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        request.setValue(accept, forHTTPHeaderField: "Accept")
        if let apiKey, !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await executeRequest(request)
        try validateResponse(data: data, response: response)
        return data
    }

    // MARK: Private Helpers

    /// Execute a URLRequest, wrapping URLSession errors.
    private func executeRequest(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch let error as URLError where error.code == .cannotConnectToHost || error.code == .timedOut {
            throw VigilAPIError.serverUnavailable
        } catch {
            throw VigilAPIError.networkError(error)
        }
    }

    /// Validate an HTTP response, throwing on non-2xx status codes.
    private func validateResponse(data: Data, response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw VigilAPIError.serverUnavailable
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw VigilAPIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }
    }

    /// Perform a request, validate the response, and decode the body.
    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await executeRequest(request)
        try validateResponse(data: data, response: response)

        do {
            return try jsonDecoder.decode(T.self, from: data)
        } catch {
            throw VigilAPIError.decodingError(error)
        }
    }

    /// Encode a request body to JSON data.
    private func encodeBody<B: Encodable>(_ body: B) throws -> Data {
        do {
            return try jsonEncoder.encode(body)
        } catch {
            throw VigilAPIError.decodingError(error)
        }
    }
}
