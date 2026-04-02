import Foundation

public actor GoogleCalendarService {
    private let config: AppConfig.GoogleCalendarConfig

    public init(config: AppConfig.GoogleCalendarConfig) {
        self.config = config
    }

    // MARK: - Public API

    public func fetchTodayEvents() async throws -> [CalendarEvent] {
        let accessToken = try await refreshTokenIfNeeded()

        let calendarIds = config.selectedCalendarIds.isEmpty ? ["primary"] : config.selectedCalendarIds
        var allEvents: [CalendarEvent] = []

        let (timeMin, timeMax) = todayTimeRange()

        for calendarId in calendarIds {
            let events = try await fetchEvents(
                calendarId: calendarId,
                timeMin: timeMin,
                timeMax: timeMax,
                accessToken: accessToken
            )
            allEvents.append(contentsOf: events)
        }

        return allEvents.sorted { $0.startTime < $1.startTime }
    }

    public func fetchCalendarList() async throws -> [(id: String, name: String)] {
        let accessToken = try await refreshTokenIfNeeded()

        let urlStr = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
        guard let url = URL(string: urlStr) else {
            throw GoogleCalendarError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateResponse(response)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = json["items"] as? [[String: Any]] else {
            throw GoogleCalendarError.invalidResponse
        }

        return items.compactMap { item in
            guard let id = item["id"] as? String,
                  let summary = item["summary"] as? String else { return nil }
            return (id: id, name: summary)
        }
    }

    // MARK: - Token Management

    private func refreshTokenIfNeeded() async throws -> String {
        guard let tokens = CalendarTokens.load() else {
            throw GoogleCalendarError.notAuthorized
        }

        if !tokens.isExpired {
            return tokens.accessToken
        }

        // Token expired — refresh it
        let url = URL(string: "https://oauth2.googleapis.com/token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = [
            "grant_type=refresh_token",
            "refresh_token=\(tokens.refreshToken)",
            "client_id=\(config.clientId)",
            "client_secret=\(config.clientSecret)"
        ].joined(separator: "&")
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateResponse(response)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let newAccessToken = json["access_token"] as? String,
              let expiresIn = json["expires_in"] as? Int else {
            throw GoogleCalendarError.tokenRefreshFailed
        }

        let updatedTokens = CalendarTokens(
            accessToken: newAccessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: Date().addingTimeInterval(TimeInterval(expiresIn))
        )
        try CalendarTokens.save(updatedTokens)

        return newAccessToken
    }

    // MARK: - Event Fetching

    private func fetchEvents(
        calendarId: String,
        timeMin: String,
        timeMax: String,
        accessToken: String
    ) async throws -> [CalendarEvent] {
        let encodedCalendarId = calendarId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? calendarId
        var components = URLComponents(string: "https://www.googleapis.com/calendar/v3/calendars/\(encodedCalendarId)/events")!
        components.queryItems = [
            URLQueryItem(name: "timeMin", value: timeMin),
            URLQueryItem(name: "timeMax", value: timeMax),
            URLQueryItem(name: "singleEvents", value: "true"),
            URLQueryItem(name: "orderBy", value: "startTime"),
            URLQueryItem(name: "maxResults", value: "50")
        ]

        guard let url = components.url else {
            throw GoogleCalendarError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateResponse(response)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = json["items"] as? [[String: Any]] else {
            return []
        }

        let calendarName = (json["summary"] as? String) ?? calendarId

        return items.compactMap { item in
            parseEvent(from: item, calendarName: calendarName)
        }
    }

    private func parseEvent(from item: [String: Any], calendarName: String) -> CalendarEvent? {
        guard let id = item["id"] as? String,
              let title = item["summary"] as? String,
              let start = item["start"] as? [String: Any],
              let end = item["end"] as? [String: Any] else {
            return nil
        }

        let isAllDay: Bool
        let startTime: Date
        let endTime: Date

        if let startDateStr = start["dateTime"] as? String,
           let endDateStr = end["dateTime"] as? String {
            // Timed event
            isAllDay = false
            guard let s = parseISO8601(startDateStr),
                  let e = parseISO8601(endDateStr) else { return nil }
            startTime = s
            endTime = e
        } else if let startDateStr = start["date"] as? String,
                  let endDateStr = end["date"] as? String {
            // All-day event
            isAllDay = true
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            dateFormatter.timeZone = TimeZone.current
            guard let s = dateFormatter.date(from: startDateStr),
                  let e = dateFormatter.date(from: endDateStr) else { return nil }
            startTime = s
            endTime = e
        } else {
            return nil
        }

        let location = item["location"] as? String

        return CalendarEvent(
            id: id,
            title: title,
            startTime: startTime,
            endTime: endTime,
            location: location,
            calendarName: calendarName,
            isAllDay: isAllDay
        )
    }

    // MARK: - Helpers

    private func todayTimeRange() -> (timeMin: String, timeMax: String) {
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return (formatter.string(from: startOfDay), formatter.string(from: endOfDay))
    }

    private func parseISO8601(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw GoogleCalendarError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw GoogleCalendarError.httpError(httpResponse.statusCode)
        }
    }
}

// MARK: - Errors

public enum GoogleCalendarError: LocalizedError {
    case notAuthorized
    case tokenRefreshFailed
    case invalidURL
    case invalidResponse
    case httpError(Int)

    public var errorDescription: String? {
        switch self {
        case .notAuthorized:
            return "Google Calendar not authorized. Run OAuth setup to connect your account."
        case .tokenRefreshFailed:
            return "Failed to refresh Google Calendar access token."
        case .invalidURL:
            return "Invalid Google Calendar API URL."
        case .invalidResponse:
            return "Invalid response from Google Calendar API."
        case .httpError(let code):
            return "Google Calendar API returned HTTP \(code)."
        }
    }
}
