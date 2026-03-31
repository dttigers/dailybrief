import Foundation

public struct GameScore: Sendable {
    public var homeTeam: String
    public var awayTeam: String
    public var homeScore: Int
    public var awayScore: Int
    public var isHome: Bool
    public var result: String   // "W" or "L"
    public var venue: String
    public var gameType: String // "Regular Season", "Spring Training", etc.
    public var gameDate: Date

    public init(
        homeTeam: String,
        awayTeam: String,
        homeScore: Int,
        awayScore: Int,
        isHome: Bool,
        result: String,
        venue: String,
        gameType: String,
        gameDate: Date
    ) {
        self.homeTeam = homeTeam
        self.awayTeam = awayTeam
        self.homeScore = homeScore
        self.awayScore = awayScore
        self.isHome = isHome
        self.result = result
        self.venue = venue
        self.gameType = gameType
        self.gameDate = gameDate
    }

    public var summaryLine1: String {
        let opponent = isHome ? awayTeam : homeTeam
        let tigersScore = isHome ? homeScore : awayScore
        let opponentScore = isHome ? awayScore : homeScore
        return "\(result)  \(tigersScore) - \(opponentScore)  vs \(opponent)"
    }

    public var summaryLine2: String {
        let homeAway = isHome ? "Home" : "Away"
        return "Final  |  \(homeAway)  |  \(gameType)"
    }
}

public struct UpcomingGame: Sendable {
    public var homeTeam: String
    public var awayTeam: String
    public var isHome: Bool
    public var venue: String
    public var gameType: String
    public var gameDate: Date

    public init(
        homeTeam: String,
        awayTeam: String,
        isHome: Bool,
        venue: String,
        gameType: String,
        gameDate: Date
    ) {
        self.homeTeam = homeTeam
        self.awayTeam = awayTeam
        self.isHome = isHome
        self.venue = venue
        self.gameType = gameType
        self.gameDate = gameDate
    }

    public var opponent: String {
        isHome ? awayTeam : homeTeam
    }

    public var timeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: gameDate)
    }

    public var dateString: String {
        let cal = Calendar.current
        if cal.isDateInToday(gameDate) {
            return "Today"
        } else if cal.isDateInTomorrow(gameDate) {
            return "Tomorrow"
        } else {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEE, MMM d"
            return formatter.string(from: gameDate)
        }
    }

    public var summaryLine: String {
        let homeAway = isHome ? "Home" : "Away"
        return "\(dateString) \(timeString)  |  \(homeAway) vs \(opponent)"
    }
}
