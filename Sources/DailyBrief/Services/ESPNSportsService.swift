import Foundation
import JarvisCore

/// Fetches scores, upcoming games, and standings from the ESPN public API
/// for any supported sport (NFL, NBA, NHL).
actor ESPNSportsService {
    private let sportPath: String  // e.g. "football/nfl", "basketball/nba", "hockey/nhl"
    private let config: AppConfig.SportsConfig.SportLeagueConfig

    init(sport sportPath: String, config: AppConfig.SportsConfig.SportLeagueConfig) {
        self.sportPath = sportPath
        self.config = config
    }

    // MARK: - Public API

    func fetchYesterdayGame() async throws -> GameScore? {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        let dateStr = Self.espnDateString(from: yesterday)

        let url = URL(string: "https://site.api.espn.com/apis/site/v2/sports/\(sportPath)/scoreboard?dates=\(dateStr)")!
        let (data, _) = try await URLSession.shared.data(from: url)
        let response = try JSONDecoder().decode(ESPNScoreboardResponse.self, from: data)

        guard let event = response.events.first(where: { eventMatchesTeam($0) }),
              let competition = event.competitions.first else { return nil }

        return mapToGameScore(competition: competition, event: event, gameDate: yesterday)
    }

    func fetchUpcomingGame() async throws -> UpcomingGame? {
        let today = Date()

        // Check today and tomorrow in parallel first
        async let todayResult = fetchScoreboardForDate(today)
        async let tomorrowResult = fetchScoreboardForDate(Calendar.current.date(byAdding: .day, value: 1, to: today)!)

        if let game = findUpcomingGame(in: try await todayResult, after: today) {
            return game
        }
        if let game = findUpcomingGame(in: try await tomorrowResult, after: today) {
            return game
        }

        // Expand search day-by-day for days 2-7
        for dayOffset in 2...7 {
            let date = Calendar.current.date(byAdding: .day, value: dayOffset, to: today)!
            let response = try await fetchScoreboardForDate(date)
            if let game = findUpcomingGame(in: response, after: today) {
                return game
            }
        }

        return nil
    }

    func fetchStandings() async throws -> [StandingsEntry] {
        let url = URL(string: "https://site.api.espn.com/apis/v2/sports/\(sportPath)/standings")!
        let (data, _) = try await URLSession.shared.data(from: url)
        let response = try JSONDecoder().decode(ESPNStandingsResponse.self, from: data)

        // Navigate: children (conferences) -> children (divisions) -> standings -> entries
        // Find the division matching our config's divisionId, or find the team's division
        for conference in response.children {
            for division in conference.children {
                let entries = division.standings.entries
                let matchesDivision = entries.contains { entry in
                    entry.team.id == String(config.teamId)
                }
                // If divisionId is configured, we could match by name, but matching by team presence is more reliable
                guard matchesDivision else { continue }

                return entries.enumerated().map { (index, entry) in
                    let wins = entry.statValue("wins")
                    let losses = entry.statValue("losses")
                    let gb = entry.statDisplayValue("gamesBehind") ?? entry.statDisplayValue("pointsFromPlayoffSpot") ?? "---"
                    let streak = entry.statDisplayValue("streak") ?? ""

                    // Calculate win percentage
                    let totalGames = wins + losses
                    let winPct: String
                    if totalGames > 0 {
                        winPct = String(format: "%.3f", Double(wins) / Double(totalGames))
                    } else {
                        winPct = ".000"
                    }

                    // For NHL, use points as an additional indicator
                    let isHockey = sportPath.contains("hockey")
                    let displayStreak: String
                    if isHockey {
                        let pts = entry.statValue("points")
                        let otl = entry.statValue("otLosses")
                        displayStreak = "PTS: \(pts)" + (streak.isEmpty ? "" : " (\(streak))")
                        _ = otl // OTL available if needed later
                    } else {
                        displayStreak = streak
                    }

                    return StandingsEntry(
                        team: entry.team.displayName,
                        wins: wins,
                        losses: losses,
                        gamesBack: gb == "-" ? "---" : gb,
                        winPct: winPct,
                        streak: displayStreak,
                        divisionRank: index + 1
                    )
                }
            }
        }

        return []
    }

    // MARK: - Helpers

    private func fetchScoreboardForDate(_ date: Date) async throws -> ESPNScoreboardResponse {
        let dateStr = Self.espnDateString(from: date)
        let url = URL(string: "https://site.api.espn.com/apis/site/v2/sports/\(sportPath)/scoreboard?dates=\(dateStr)")!
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode(ESPNScoreboardResponse.self, from: data)
    }

    private func eventMatchesTeam(_ event: ESPNEvent) -> Bool {
        guard let competition = event.competitions.first else { return false }
        return competition.competitors.contains { $0.id == String(config.teamId) }
    }

    private func findUpcomingGame(in response: ESPNScoreboardResponse, after now: Date) -> UpcomingGame? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoFallback = ISO8601DateFormatter()
        isoFallback.formatOptions = [.withInternetDateTime]

        for event in response.events {
            guard eventMatchesTeam(event),
                  let competition = event.competitions.first else { continue }

            // Skip completed games
            if competition.status?.type.completed == true { continue }

            // Parse game date
            guard let gameDate = isoFormatter.date(from: event.date) ?? isoFallback.date(from: event.date) else { continue }
            guard gameDate > now else { continue }

            let homeCompetitor = competition.competitors.first { $0.homeAway == "home" }
            let awayCompetitor = competition.competitors.first { $0.homeAway == "away" }
            let isHome = homeCompetitor?.id == String(config.teamId)

            return UpcomingGame(
                homeTeam: homeCompetitor?.team.displayName ?? "TBD",
                awayTeam: awayCompetitor?.team.displayName ?? "TBD",
                isHome: isHome,
                venue: competition.venue?.fullName ?? "Unknown",
                gameType: event.season?.type == 2 ? "Regular Season" : event.season?.type == 3 ? "Playoffs" : "Preseason",
                gameDate: gameDate
            )
        }
        return nil
    }

    private func mapToGameScore(competition: ESPNCompetition, event: ESPNEvent, gameDate: Date) -> GameScore? {
        let homeCompetitor = competition.competitors.first { $0.homeAway == "home" }
        let awayCompetitor = competition.competitors.first { $0.homeAway == "away" }

        guard let home = homeCompetitor, let away = awayCompetitor else { return nil }

        let homeScore = Int(home.score ?? "0") ?? 0
        let awayScore = Int(away.score ?? "0") ?? 0
        let isHome = home.id == String(config.teamId)
        let teamScore = isHome ? homeScore : awayScore
        let opponentScore = isHome ? awayScore : homeScore
        let result = teamScore > opponentScore ? "W" : (teamScore < opponentScore ? "L" : "T")

        return GameScore(
            homeTeam: home.team.displayName,
            awayTeam: away.team.displayName,
            homeScore: homeScore,
            awayScore: awayScore,
            isHome: isHome,
            result: result,
            venue: competition.venue?.fullName ?? "Unknown",
            gameType: event.season?.type == 2 ? "Regular Season" : event.season?.type == 3 ? "Playoffs" : "Preseason",
            gameDate: gameDate
        )
    }

    private static func espnDateString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd"
        return formatter.string(from: date)
    }
}

// MARK: - ESPN API Response Models

struct ESPNScoreboardResponse: Codable, Sendable {
    var events: [ESPNEvent]

    init(events: [ESPNEvent] = []) {
        self.events = events
    }
}

struct ESPNEvent: Codable, Sendable {
    var competitions: [ESPNCompetition]
    var date: String
    var season: ESPNSeason?
}

struct ESPNCompetition: Codable, Sendable {
    var competitors: [ESPNCompetitor]
    var venue: ESPNVenue?
    var status: ESPNStatus?
}

struct ESPNCompetitor: Codable, Sendable {
    var id: String
    var homeAway: String
    var team: ESPNTeam
    var score: String?
}

struct ESPNTeam: Codable, Sendable {
    var displayName: String
}

struct ESPNVenue: Codable, Sendable {
    var fullName: String
}

struct ESPNStatus: Codable, Sendable {
    var type: ESPNStatusType
}

struct ESPNStatusType: Codable, Sendable {
    var completed: Bool
}

struct ESPNSeason: Codable, Sendable {
    var type: Int
}

// MARK: - ESPN Standings Response Models

struct ESPNStandingsResponse: Codable, Sendable {
    var children: [ESPNConference]
}

struct ESPNConference: Codable, Sendable {
    var name: String
    var children: [ESPNDivision]
}

struct ESPNDivision: Codable, Sendable {
    var name: String
    var standings: ESPNDivisionStandings
}

struct ESPNDivisionStandings: Codable, Sendable {
    var entries: [ESPNStandingsEntry]
}

struct ESPNStandingsEntry: Codable, Sendable {
    var team: ESPNStandingsTeam
    var stats: [ESPNStat]

    func statValue(_ name: String) -> Int {
        Int(stats.first { $0.name == name }?.value ?? 0)
    }

    func statDisplayValue(_ name: String) -> String? {
        stats.first { $0.name == name }?.displayValue
    }
}

struct ESPNStandingsTeam: Codable, Sendable {
    var id: String
    var displayName: String
}

struct ESPNStat: Codable, Sendable {
    var name: String
    var value: Double?
    var displayValue: String?
}
