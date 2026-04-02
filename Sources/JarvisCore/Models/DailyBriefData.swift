import Foundation

public struct DailyBriefData: Sendable {
    public var date: Date
    public var workOrders: [WorkOrder]
    public var todoItems: [ReminderItem]
    public var gameScore: GameScore?
    public var upcomingGame: UpcomingGame?
    public var standings: [StandingsEntry]
    public var affirmation: String
    public var calendarEvents: [CalendarEvent]

    // Sports config names for dynamic PDF rendering
    public var teamName: String
    public var divisionName: String

    // Captured thoughts for Page 3
    public var unprocessedThoughts: [Thought]
    public var taskThoughts: [Thought]
    public var recentThoughts: [Thought]

    public init(
        date: Date,
        workOrders: [WorkOrder],
        todoItems: [ReminderItem],
        gameScore: GameScore? = nil,
        upcomingGame: UpcomingGame? = nil,
        standings: [StandingsEntry],
        affirmation: String,
        calendarEvents: [CalendarEvent] = [],
        teamName: String = "Detroit Tigers",
        divisionName: String = "AL Central",
        unprocessedThoughts: [Thought] = [],
        taskThoughts: [Thought] = [],
        recentThoughts: [Thought] = []
    ) {
        self.date = date
        self.workOrders = workOrders
        self.todoItems = todoItems
        self.gameScore = gameScore
        self.upcomingGame = upcomingGame
        self.standings = standings
        self.affirmation = affirmation
        self.calendarEvents = calendarEvents
        self.teamName = teamName
        self.divisionName = divisionName
        self.unprocessedThoughts = unprocessedThoughts
        self.taskThoughts = taskThoughts
        self.recentThoughts = recentThoughts
    }

    public var dateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d, yyyy"
        return formatter.string(from: date)
    }
}
