import Foundation

public struct SportData: Sendable {
    public var sport: String  // "mlb", "nfl", "nba", "nhl"
    public var sportDisplayName: String  // "MLB", "NFL", "NBA", "NHL"
    public var teamName: String
    public var divisionName: String
    public var gameScore: GameScore?
    public var upcomingGame: UpcomingGame?
    public var standings: [StandingsEntry]

    public init(
        sport: String,
        sportDisplayName: String,
        teamName: String,
        divisionName: String,
        gameScore: GameScore? = nil,
        upcomingGame: UpcomingGame? = nil,
        standings: [StandingsEntry] = []
    ) {
        self.sport = sport
        self.sportDisplayName = sportDisplayName
        self.teamName = teamName
        self.divisionName = divisionName
        self.gameScore = gameScore
        self.upcomingGame = upcomingGame
        self.standings = standings
    }
}

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

    // Additional sports beyond MLB
    public var additionalSports: [SportData]

    // Work order status map (caseNumber -> status)
    public var workOrderStatuses: [String: String]

    // Captured thoughts for Page 3
    public var unprocessedThoughts: [Thought]
    public var taskThoughts: [Thought]
    public var recentThoughts: [Thought]

    // AI-generated insights
    public var insights: [Insight]

    // AI-recommended work order priority (case numbers in urgency order)
    public var workOrderPriorityOrder: [String]?

    // Therapy prep data
    public var therapyPatterns: [TherapyPattern]
    public var therapyPrep: TherapyPrep?

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
        additionalSports: [SportData] = [],
        workOrderStatuses: [String: String] = [:],
        unprocessedThoughts: [Thought] = [],
        taskThoughts: [Thought] = [],
        recentThoughts: [Thought] = [],
        insights: [Insight] = [],
        workOrderPriorityOrder: [String]? = nil,
        therapyPatterns: [TherapyPattern] = [],
        therapyPrep: TherapyPrep? = nil
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
        self.additionalSports = additionalSports
        self.workOrderStatuses = workOrderStatuses
        self.unprocessedThoughts = unprocessedThoughts
        self.taskThoughts = taskThoughts
        self.recentThoughts = recentThoughts
        self.insights = insights
        self.workOrderPriorityOrder = workOrderPriorityOrder
        self.therapyPatterns = therapyPatterns
        self.therapyPrep = therapyPrep
    }

    public var dateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d, yyyy"
        return formatter.string(from: date)
    }
}
