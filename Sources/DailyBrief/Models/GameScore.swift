import Foundation

struct GameScore: Sendable {
    var homeTeam: String
    var awayTeam: String
    var homeScore: Int
    var awayScore: Int
    var isHome: Bool
    var result: String   // "W" or "L"
    var venue: String
    var gameType: String // "Regular Season", "Spring Training", etc.
    var gameDate: Date

    var summaryLine1: String {
        let opponent = isHome ? awayTeam : homeTeam
        let tigersScore = isHome ? homeScore : awayScore
        let opponentScore = isHome ? awayScore : homeScore
        return "\(result)  \(tigersScore) - \(opponentScore)  vs \(opponent)"
    }

    var summaryLine2: String {
        let homeAway = isHome ? "Home" : "Away"
        return "Final  |  \(homeAway)  |  \(gameType)"
    }
}

struct UpcomingGame: Sendable {
    var homeTeam: String
    var awayTeam: String
    var isHome: Bool
    var venue: String
    var gameType: String
    var gameDate: Date

    var opponent: String {
        isHome ? awayTeam : homeTeam
    }

    var timeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: gameDate)
    }

    var dateString: String {
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

    var summaryLine: String {
        let homeAway = isHome ? "Home" : "Away"
        return "\(dateString) \(timeString)  |  \(homeAway) vs \(opponent)"
    }
}
