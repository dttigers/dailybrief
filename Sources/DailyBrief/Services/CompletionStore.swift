import Foundation
import JarvisCore

enum CompletionStore {
    private static let path = ConfigLoader.expandPath("~/.config/dailybrief/completed_workorders.json")

    enum WorkOrderStatus: String, Codable {
        case open
        case inProgress
        case done
    }

    // MARK: - Load / Save

    static func load() -> [String: WorkOrderStatus] {
        guard let data = FileManager.default.contents(atPath: path) else { return [:] }

        // Try new format: [String: String] dict
        if let dict = try? JSONDecoder().decode([String: String].self, from: data) {
            var result: [String: WorkOrderStatus] = [:]
            for (key, value) in dict {
                result[key] = WorkOrderStatus(rawValue: value) ?? .open
            }
            return result
        }

        // Fall back to old format: [String] array → all .done
        if let items = try? JSONDecoder().decode([String].self, from: data) {
            var result: [String: WorkOrderStatus] = [:]
            for item in items {
                result[item] = .done
            }
            return result
        }

        return [:]
    }

    static func save(_ statuses: [String: WorkOrderStatus]) {
        // Encode as [String: String] for JSON compatibility
        let encoded = statuses.mapValues { $0.rawValue }
        guard let data = try? JSONEncoder().encode(encoded) else { return }
        try? ConfigLoader.ensureDirectoryExists((path as NSString).deletingLastPathComponent)
        FileManager.default.createFile(atPath: path, contents: data)
    }

    // MARK: - Status Operations

    static func setStatus(_ caseNumber: String, _ status: WorkOrderStatus) {
        var statuses = load()
        statuses[caseNumber] = status
        save(statuses)
    }

    static func status(for caseNumber: String) -> WorkOrderStatus {
        load()[caseNumber] ?? .open
    }

    static func markComplete(_ caseNumber: String) {
        setStatus(caseNumber, .done)
    }

    static func markIncomplete(_ caseNumber: String) {
        setStatus(caseNumber, .open)
    }

    static func listByStatus(_ status: WorkOrderStatus) -> [String] {
        load().filter { $0.value == status }.map { $0.key }.sorted()
    }

    static func listCompleted() -> [String] {
        listByStatus(.done)
    }
}
