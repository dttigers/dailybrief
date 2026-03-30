@preconcurrency import EventKit
import Foundation

actor RemindersService {
    private let listName: String

    init(config: AppConfig.RemindersConfig) {
        self.listName = config.listName
    }

    func fetchTodoItems() async throws -> [ReminderItem] {
        // Try EventKit first, fall back to AppleScript
        let store = EKEventStore()
        let granted = try await store.requestFullAccessToReminders()

        if granted {
            return try await fetchViaEventKit(store: store)
        } else {
            Logger.log("EventKit denied, trying AppleScript fallback")
            return try fetchViaAppleScript()
        }
    }

    private func fetchViaEventKit(store: EKEventStore) async throws -> [ReminderItem] {
        let calendars = store.calendars(for: .reminder)
        guard let todoCalendar = calendars.first(where: { $0.title == listName }) else {
            Logger.log("Reminders list '\(listName)' not found")
            return []
        }

        let predicate = store.predicateForIncompleteReminders(
            withDueDateStarting: nil,
            ending: nil,
            calendars: [todoCalendar]
        )

        let items = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<[ReminderItem], Error>) in
            store.fetchReminders(matching: predicate) { result in
                let mapped = (result ?? []).map { reminder in
                    ReminderItem(
                        title: reminder.title ?? "Untitled",
                        dueDate: reminder.dueDateComponents?.date,
                        priority: reminder.priority,
                        notes: reminder.notes
                    )
                }
                cont.resume(returning: mapped)
            }
        }

        return items
    }

    private func fetchViaAppleScript() throws -> [ReminderItem] {
        let script = """
        tell application "Reminders"
            set todoList to list "\(listName)"
            set output to ""
            repeat with r in (reminders of todoList whose completed is false)
                set output to output & name of r & "|||"
            end repeat
            return output
        end tell
        """

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()

        try process.run()
        process.waitUntilExit()

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !output.isEmpty else { return [] }

        return output.components(separatedBy: "|||")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .map { ReminderItem(title: $0, dueDate: nil, priority: 0, notes: nil) }
    }
}
