import Foundation

public struct StandingsEntry: Sendable {
    public var team: String
    public var wins: Int
    public var losses: Int
    public var gamesBack: String
    public var winPct: String
    public var streak: String
    public var divisionRank: Int

    public init(
        team: String,
        wins: Int,
        losses: Int,
        gamesBack: String,
        winPct: String,
        streak: String,
        divisionRank: Int
    ) {
        self.team = team
        self.wins = wins
        self.losses = losses
        self.gamesBack = gamesBack
        self.winPct = winPct
        self.streak = streak
        self.divisionRank = divisionRank
    }
}
