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
