import Foundation

public enum ConfigLoader {
    public static let configDirectory = NSString("~/.config/dailybrief").expandingTildeInPath
    public static let configPath = (configDirectory as NSString).appendingPathComponent("config.json")

    public static func load(from path: String? = nil) throws -> AppConfig {
        let filePath = path ?? configPath
        let url = URL(fileURLWithPath: filePath)

        guard FileManager.default.fileExists(atPath: filePath) else {
            throw ConfigError.fileNotFound(filePath)
        }

        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        do {
            return try decoder.decode(AppConfig.self, from: data)
        } catch {
            throw ConfigError.invalidFormat(error.localizedDescription)
        }
    }

    /// Loads existing config or creates a default config file if none exists.
    /// Used by the menu bar app to ensure config always exists on startup.
    public static func loadOrCreate() throws -> AppConfig {
        if FileManager.default.fileExists(atPath: configPath) {
            return try load()
        }
        // Create default config
        let defaultConfig = AppConfig(
            email: .init(emailAddress: "", appPassword: ""),
            reminders: .init(),
            sports: .init(),
            ai: .init(claudeApiKey: ""),
            pdf: .init(),
            printing: .init()
        )
        try save(defaultConfig)
        return defaultConfig
    }

    public static func save(_ config: AppConfig) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.keyEncodingStrategy = .convertToSnakeCase

        let data = try encoder.encode(config)

        // Ensure directory exists
        try FileManager.default.createDirectory(
            atPath: configDirectory,
            withIntermediateDirectories: true
        )

        let url = URL(fileURLWithPath: configPath)
        try data.write(to: url)
    }

    public static func expandPath(_ path: String) -> String {
        NSString(string: path).expandingTildeInPath
    }

    public static func ensureDirectoryExists(_ path: String) throws {
        let expanded = expandPath(path)
        try FileManager.default.createDirectory(
            atPath: expanded,
            withIntermediateDirectories: true
        )
    }
}

public enum ConfigError: LocalizedError {
    case fileNotFound(String)
    case invalidFormat(String)

    public var errorDescription: String? {
        switch self {
        case .fileNotFound(let path):
            return "Config file not found at \(path). Run with --setup to create one."
        case .invalidFormat(let detail):
            return "Invalid config format: \(detail)"
        }
    }
}
