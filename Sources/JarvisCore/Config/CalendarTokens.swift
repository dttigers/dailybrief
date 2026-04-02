import Foundation

public struct CalendarTokens: Codable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    public var expiresAt: Date

    public init(accessToken: String, refreshToken: String, expiresAt: Date) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
    }

    /// Token is considered expired if less than 60 seconds remain
    public var isExpired: Bool {
        expiresAt < Date().addingTimeInterval(60)
    }

    public static var tokenFilePath: String {
        NSString("~/.config/dailybrief/google_calendar_tokens.json").expandingTildeInPath
    }

    public static func load() -> CalendarTokens? {
        let path = tokenFilePath
        guard FileManager.default.fileExists(atPath: path) else { return nil }
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return nil }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .secondsSince1970
        return try? decoder.decode(CalendarTokens.self, from: data)
    }

    public static func save(_ tokens: CalendarTokens) throws {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .secondsSince1970
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(tokens)

        let directory = (tokenFilePath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(
            atPath: directory,
            withIntermediateDirectories: true
        )
        try data.write(to: URL(fileURLWithPath: tokenFilePath))
    }
}
