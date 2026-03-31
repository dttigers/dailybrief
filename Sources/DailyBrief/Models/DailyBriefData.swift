import Foundation

struct DailyBriefData: Sendable {
    var date: Date
    var workOrders: [WorkOrder]
    var todoItems: [ReminderItem]
    var gameScore: GameScore?
    var upcomingGame: UpcomingGame?
    var standings: [StandingsEntry]
    var affirmation: String

    var dateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d, yyyy"
        return formatter.string(from: date)
    }
}
