import AppKit
@preconcurrency import Dispatch
import Foundation
import JarvisCore
import Network

/// Thread-safe one-shot guard for continuation resumption.
private final class ContinuationGuard: @unchecked Sendable {
    private let lock = NSLock()
    private var _resumed = false

    /// Returns `true` exactly once; all subsequent calls return `false`.
    func tryResume() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if _resumed { return false }
        _resumed = true
        return true
    }
}

@MainActor
final class GoogleCalendarAuth {

    enum AuthError: LocalizedError {
        case noAvailablePort
        case listenerFailed(String)
        case timeout
        case noAuthCode
        case tokenExchangeFailed(String)
        case invalidTokenResponse

        var errorDescription: String? {
            switch self {
            case .noAvailablePort:
                return "Could not find an available port for OAuth redirect."
            case .listenerFailed(let detail):
                return "OAuth redirect listener failed: \(detail)"
            case .timeout:
                return "OAuth authorization timed out after 120 seconds."
            case .noAuthCode:
                return "No authorization code received from Google."
            case .tokenExchangeFailed(let detail):
                return "Token exchange failed: \(detail)"
            case .invalidTokenResponse:
                return "Invalid token response from Google."
            }
        }
    }

    static func authorize(clientId: String, clientSecret: String) async throws -> CalendarTokens {
        // 1. Find an available port and start a one-shot HTTP server
        let (authCode, port) = try await startListenerAndWaitForCode(clientId: clientId)

        // 2. Exchange auth code for tokens
        let tokens = try await exchangeCodeForTokens(
            code: authCode,
            clientId: clientId,
            clientSecret: clientSecret,
            redirectURI: "http://localhost:\(port)"
        )

        // 3. Save tokens
        try CalendarTokens.save(tokens)

        return tokens
    }

    // MARK: - Localhost Redirect Server

    private static func startListenerAndWaitForCode(clientId: String) async throws -> (code: String, port: UInt16) {
        // Try ports 8089-8099 to find one available
        for port in UInt16(8089)...UInt16(8099) {
            do {
                let code = try await listenOnPort(port: port, clientId: clientId)
                return (code, port)
            } catch let error as AuthError where error.localizedDescription.contains("listener") {
                continue // Try next port
            }
        }
        throw AuthError.noAvailablePort
    }

    private static func listenOnPort(port: UInt16, clientId: String) async throws -> String {
        return try await withCheckedThrowingContinuation { continuation in
            let params = NWParameters.tcp
            let listener: NWListener
            do {
                listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
            } catch {
                continuation.resume(throwing: AuthError.listenerFailed(error.localizedDescription))
                return
            }

            let guard_ = ContinuationGuard()

            // Timeout after 120 seconds
            let timeoutItem = DispatchWorkItem { [guard_] in
                if guard_.tryResume() {
                    listener.cancel()
                    continuation.resume(throwing: AuthError.timeout)
                }
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + 120, execute: timeoutItem)

            @Sendable func safeResume(_ result: Result<String, Error>) {
                guard guard_.tryResume() else { return }
                timeoutItem.cancel()
                switch result {
                case .success(let code):
                    continuation.resume(returning: code)
                case .failure(let error):
                    continuation.resume(throwing: error)
                }
            }

            listener.newConnectionHandler = { connection in
                connection.start(queue: .global())
                connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, _, _ in
                    defer {
                        listener.cancel()
                    }

                    guard let data = data, let request = String(data: data, encoding: .utf8) else {
                        safeResume(.failure(AuthError.noAuthCode))
                        return
                    }

                    // Parse GET /?code=...&scope=... HTTP/1.1
                    guard let firstLine = request.split(separator: "\r\n").first,
                          let pathPart = firstLine.split(separator: " ").dropFirst().first,
                          let components = URLComponents(string: String(pathPart)),
                          let code = components.queryItems?.first(where: { $0.name == "code" })?.value else {

                        // Check for error parameter
                        let errorMsg: String
                        if let components = URLComponents(string: String(request.split(separator: " ").dropFirst().first ?? "")),
                           let errParam = components.queryItems?.first(where: { $0.name == "error" })?.value {
                            errorMsg = errParam
                        } else {
                            errorMsg = "No code parameter in redirect"
                        }

                        // Send error response
                        let errorHTML = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h2>Authorization Failed</h2><p>\(errorMsg)</p><p>You can close this tab.</p></body></html>"
                        connection.send(content: errorHTML.data(using: .utf8), completion: .contentProcessed { _ in
                            connection.cancel()
                        })

                        safeResume(.failure(AuthError.noAuthCode))
                        return
                    }

                    // Send success response
                    let successHTML = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h2>Authorization Successful!</h2><p>You can close this tab and return to DailyBrief settings.</p></body></html>"
                    connection.send(content: successHTML.data(using: .utf8), completion: .contentProcessed { _ in
                        connection.cancel()
                    })

                    safeResume(.success(code))
                }
            }

            listener.stateUpdateHandler = { state in
                switch state {
                case .failed(let error):
                    safeResume(.failure(AuthError.listenerFailed(error.localizedDescription)))
                case .ready:
                    // Listener is ready — open browser to OAuth URL
                    let redirectURI = "http://localhost:\(port)"
                    var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
                    components.queryItems = [
                        URLQueryItem(name: "client_id", value: clientId),
                        URLQueryItem(name: "redirect_uri", value: redirectURI),
                        URLQueryItem(name: "response_type", value: "code"),
                        URLQueryItem(name: "scope", value: "https://www.googleapis.com/auth/calendar.readonly"),
                        URLQueryItem(name: "access_type", value: "offline"),
                        URLQueryItem(name: "prompt", value: "consent"),
                    ]
                    if let url = components.url {
                        DispatchQueue.main.async {
                            NSWorkspace.shared.open(url)
                        }
                    }
                default:
                    break
                }
            }

            listener.start(queue: .global())
        }
    }

    // MARK: - Token Exchange

    private static func exchangeCodeForTokens(
        code: String,
        clientId: String,
        clientSecret: String,
        redirectURI: String
    ) async throws -> CalendarTokens {
        let url = URL(string: "https://oauth2.googleapis.com/token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "code=\(code)",
            "client_id=\(clientId)",
            "client_secret=\(clientSecret)",
            "redirect_uri=\(redirectURI)",
            "grant_type=authorization_code",
        ].joined(separator: "&")
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.tokenExchangeFailed("Invalid response")
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "unknown"
            throw AuthError.tokenExchangeFailed("HTTP \(httpResponse.statusCode): \(body)")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = json["access_token"] as? String,
              let refreshToken = json["refresh_token"] as? String,
              let expiresIn = json["expires_in"] as? Int else {
            throw AuthError.invalidTokenResponse
        }

        return CalendarTokens(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date().addingTimeInterval(TimeInterval(expiresIn))
        )
    }
}
