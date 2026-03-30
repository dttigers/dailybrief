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
