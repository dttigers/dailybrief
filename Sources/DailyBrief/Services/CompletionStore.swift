import Foundation
import JarvisCore

enum CompletionStore {
    private static let path = ConfigLoader.expandPath("~/.config/dailybrief/completed_workorders.json")

    static func load() -> Set<String> {
        guard let data = FileManager.default.contents(atPath: path),
              let items = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return Set(items)
    }

    static func save(_ completed: Set<String>) {
        let sorted = completed.sorted()
        guard let data = try? JSONEncoder().encode(sorted) else { return }
        try? ConfigLoader.ensureDirectoryExists((path as NSString).deletingLastPathComponent)
        FileManager.default.createFile(atPath: path, contents: data)
    }

    static func markComplete(_ caseNumber: String) {
        var completed = load()
        completed.insert(caseNumber)
        save(completed)
    }

    static func markIncomplete(_ caseNumber: String) {
        var completed = load()
        completed.remove(caseNumber)
        save(completed)
    }

    static func listCompleted() -> [String] {
        load().sorted()
    }
}
