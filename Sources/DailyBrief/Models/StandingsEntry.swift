import Foundation

struct StandingsEntry: Sendable {
    var team: String
    var wins: Int
    var losses: Int
    var gamesBack: String
    var winPct: String
    var streak: String
    var divisionRank: Int
}
