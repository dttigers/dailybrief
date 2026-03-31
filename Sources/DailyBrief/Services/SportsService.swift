import Foundation

actor SportsService {
    private let config: AppConfig.SportsConfig

    init(config: AppConfig.SportsConfig) {
        self.config = config
    }

    func fetchYesterdayGame() async throws -> GameScore? {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateStr = formatter.string(from: yesterday)

        let urlStr = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=\(dateStr)&teamId=\(config.teamId)&hydrate=linescore,team"
        guard let url = URL(string: urlStr) else { return nil }

        let (data, _) = try await URLSession.shared.data(from: url)
        let schedule = try JSONDecoder().decode(MLBScheduleResponse.self, from: data)

        guard let date = schedule.dates.first,
              let game = date.games.first else { return nil }

        let isHome = game.teams.home.team.id == config.teamId
        let homeScore = game.teams.home.score ?? 0
        let awayScore = game.teams.away.score ?? 0
        let tigersScore = isHome ? homeScore : awayScore
        let opponentScore = isHome ? awayScore : homeScore
        let result = tigersScore > opponentScore ? "W" : (tigersScore < opponentScore ? "L" : "T")

        return GameScore(
            homeTeam: game.teams.home.team.name,
            awayTeam: game.teams.away.team.name,
            homeScore: homeScore,
            awayScore: awayScore,
            isHome: isHome,
            result: result,
            venue: game.venue?.name ?? "Unknown",
            gameType: game.gameType == "R" ? "Regular Season" : game.gameType == "S" ? "Spring Training" : game.gameType ?? "Unknown",
            gameDate: yesterday
        )
    }

    func fetchUpcomingGame() async throws -> UpcomingGame? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: Date())
        // Look ahead 7 days to find the next game
        let weekOut = formatter.string(from: Calendar.current.date(byAdding: .day, value: 7, to: Date())!)

        let urlStr = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=\(today)&endDate=\(weekOut)&teamId=\(config.teamId)&hydrate=team"
        guard let url = URL(string: urlStr) else { return nil }

        let (data, _) = try await URLSession.shared.data(from: url)
        let schedule = try JSONDecoder().decode(MLBScheduleResponse.self, from: data)

        // Find the first game that hasn't started yet (or today's game)
        let now = Date()
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoFallback = ISO8601DateFormatter()
        isoFallback.formatOptions = [.withInternetDateTime]

        for date in schedule.dates {
            for game in date.games {
                guard let dateStr = game.gameDate,
                      let gameTime = isoFormatter.date(from: dateStr) ?? isoFallback.date(from: dateStr) else { continue }
                // Skip games that have already finished (score exists and game is in the past)
                let hasScore = game.teams.home.score != nil
                if hasScore && gameTime < now { continue }

                let isHome = game.teams.home.team.id == config.teamId
                return UpcomingGame(
                    homeTeam: game.teams.home.team.name,
                    awayTeam: game.teams.away.team.name,
                    isHome: isHome,
                    venue: game.venue?.name ?? "Unknown",
                    gameType: game.gameType == "R" ? "Regular Season" : game.gameType == "S" ? "Spring Training" : game.gameType ?? "Unknown",
                    gameDate: gameTime
                )
            }
        }
        return nil
    }

    func fetchStandings() async throws -> [StandingsEntry] {
        let year = Calendar.current.component(.year, from: Date())
        let urlStr = "https://statsapi.mlb.com/api/v1/standings?leagueId=\(config.leagueId)&season=\(year)&standingsTypes=regularSeason"
        guard let url = URL(string: urlStr) else { return [] }

        let (data, _) = try await URLSession.shared.data(from: url)
        let response = try JSONDecoder().decode(MLBStandingsResponse.self, from: data)

        let alCentral = response.records.first { record in
            record.division?.id == config.divisionId
        }

        guard let teams = alCentral?.teamRecords else { return [] }

        return teams.map { team in
            StandingsEntry(
                team: team.team.name,
                wins: team.wins,
                losses: team.losses,
                gamesBack: team.gamesBack == "-" ? "—" : team.gamesBack,
                winPct: team.winningPercentage,
                streak: team.streak?.streakCode ?? "",
                divisionRank: Int(team.divisionRank) ?? 0
            )
        }.sorted { $0.divisionRank < $1.divisionRank }
    }
}

// MARK: - MLB API Response Models

struct MLBScheduleResponse: Codable, Sendable {
    var dates: [MLBDate]
    struct MLBDate: Codable, Sendable {
        var games: [MLBGame]
    }
}

struct MLBGame: Codable, Sendable {
    var teams: MLBTeams
    var venue: MLBVenue?
    var gameType: String?
    var gameDate: String?

    struct MLBTeams: Codable, Sendable {
        var home: MLBTeamResult
        var away: MLBTeamResult
    }
    struct MLBTeamResult: Codable, Sendable {
        var team: MLBTeamInfo
        var score: Int?
    }
    struct MLBTeamInfo: Codable, Sendable {
        var id: Int
        var name: String
    }
    struct MLBVenue: Codable, Sendable {
        var name: String
    }
}

struct MLBStandingsResponse: Codable, Sendable {
    var records: [MLBStandingsRecord]
}

struct MLBStandingsRecord: Codable, Sendable {
    var division: MLBDivision?
    var teamRecords: [MLBTeamRecord]
}

struct MLBDivision: Codable, Sendable {
    var id: Int
}

struct MLBTeamRecord: Codable, Sendable {
    var team: MLBGame.MLBTeamInfo
    var wins: Int
    var losses: Int
    var gamesBack: String
    var winningPercentage: String
    var divisionRank: String
    var streak: MLBStreak?
}

struct MLBStreak: Codable, Sendable {
    var streakCode: String
}
