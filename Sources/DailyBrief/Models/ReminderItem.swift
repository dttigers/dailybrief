import Foundation

struct ReminderItem: Sendable {
    var title: String
    var dueDate: Date?
    var priority: Int
    var notes: String?
}
