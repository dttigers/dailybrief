import Foundation

public struct CalendarEvent: Codable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var startTime: Date
    public var endTime: Date
    public var location: String?
    public var calendarName: String?
    public var isAllDay: Bool

    public init(
        id: String,
        title: String,
        startTime: Date,
        endTime: Date,
        location: String? = nil,
        calendarName: String? = nil,
        isAllDay: Bool = false
    ) {
        self.id = id
        self.title = title
        self.startTime = startTime
        self.endTime = endTime
        self.location = location
        self.calendarName = calendarName
        self.isAllDay = isAllDay
    }

    public var timeString: String {
        if isAllDay {
            return "All Day"
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return "\(formatter.string(from: startTime)) - \(formatter.string(from: endTime))"
    }

    public var durationMinutes: Int {
        Int(endTime.timeIntervalSince(startTime) / 60)
    }
}
