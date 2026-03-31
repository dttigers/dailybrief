import Foundation

public struct ReminderItem: Sendable {
    public var title: String
    public var dueDate: Date?
    public var priority: Int
    public var notes: String?

    public init(title: String, dueDate: Date? = nil, priority: Int, notes: String? = nil) {
        self.title = title
        self.dueDate = dueDate
        self.priority = priority
        self.notes = notes
    }
}
