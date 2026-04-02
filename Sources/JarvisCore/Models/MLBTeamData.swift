import Foundation

public struct MLBTeam: Sendable {
    public let id: Int
    public let name: String
    public let abbreviation: String
    public let divisionId: Int
    public let divisionName: String
    public let leagueId: Int
    public let leagueName: String
}

public enum MLBTeamData {

    // MARK: - All Teams

    public static let allTeams: [MLBTeam] = [
        // AL East (201, leagueId 103)
        MLBTeam(id: 110, name: "Baltimore Orioles",    abbreviation: "BAL", divisionId: 201, divisionName: "AL East",    leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 111, name: "Boston Red Sox",        abbreviation: "BOS", divisionId: 201, divisionName: "AL East",    leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 147, name: "New York Yankees",      abbreviation: "NYY", divisionId: 201, divisionName: "AL East",    leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 139, name: "Tampa Bay Rays",        abbreviation: "TB",  divisionId: 201, divisionName: "AL East",    leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 141, name: "Toronto Blue Jays",     abbreviation: "TOR", divisionId: 201, divisionName: "AL East",    leagueId: 103, leagueName: "American League"),

        // AL Central (202, leagueId 103)
        MLBTeam(id: 145, name: "Chicago White Sox",     abbreviation: "CWS", divisionId: 202, divisionName: "AL Central", leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 114, name: "Cleveland Guardians",   abbreviation: "CLE", divisionId: 202, divisionName: "AL Central", leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 116, name: "Detroit Tigers",        abbreviation: "DET", divisionId: 202, divisionName: "AL Central", leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 118, name: "Kansas City Royals",    abbreviation: "KC",  divisionId: 202, divisionName: "AL Central", leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 142, name: "Minnesota Twins",       abbreviation: "MIN", divisionId: 202, divisionName: "AL Central", leagueId: 103, leagueName: "American League"),

        // AL West (200, leagueId 103)
        MLBTeam(id: 117, name: "Houston Astros",        abbreviation: "HOU", divisionId: 200, divisionName: "AL West",    leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 108, name: "Los Angeles Angels",    abbreviation: "LAA", divisionId: 200, divisionName: "AL West",    leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 133, name: "Oakland Athletics",     abbreviation: "OAK", divisionId: 200, divisionName: "AL West",    leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 136, name: "Seattle Mariners",      abbreviation: "SEA", divisionId: 200, divisionName: "AL West",    leagueId: 103, leagueName: "American League"),
        MLBTeam(id: 140, name: "Texas Rangers",         abbreviation: "TEX", divisionId: 200, divisionName: "AL West",    leagueId: 103, leagueName: "American League"),

        // NL East (204, leagueId 104)
        MLBTeam(id: 144, name: "Atlanta Braves",        abbreviation: "ATL", divisionId: 204, divisionName: "NL East",    leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 146, name: "Miami Marlins",         abbreviation: "MIA", divisionId: 204, divisionName: "NL East",    leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 121, name: "New York Mets",         abbreviation: "NYM", divisionId: 204, divisionName: "NL East",    leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 143, name: "Philadelphia Phillies", abbreviation: "PHI", divisionId: 204, divisionName: "NL East",    leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 120, name: "Washington Nationals",  abbreviation: "WSH", divisionId: 204, divisionName: "NL East",    leagueId: 104, leagueName: "National League"),

        // NL Central (205, leagueId 104)
        MLBTeam(id: 112, name: "Chicago Cubs",          abbreviation: "CHC", divisionId: 205, divisionName: "NL Central", leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 113, name: "Cincinnati Reds",       abbreviation: "CIN", divisionId: 205, divisionName: "NL Central", leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 158, name: "Milwaukee Brewers",     abbreviation: "MIL", divisionId: 205, divisionName: "NL Central", leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 134, name: "Pittsburgh Pirates",    abbreviation: "PIT", divisionId: 205, divisionName: "NL Central", leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 138, name: "St. Louis Cardinals",   abbreviation: "STL", divisionId: 205, divisionName: "NL Central", leagueId: 104, leagueName: "National League"),

        // NL West (203, leagueId 104)
        MLBTeam(id: 109, name: "Arizona Diamondbacks",  abbreviation: "ARI", divisionId: 203, divisionName: "NL West",    leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 115, name: "Colorado Rockies",      abbreviation: "COL", divisionId: 203, divisionName: "NL West",    leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 119, name: "Los Angeles Dodgers",   abbreviation: "LAD", divisionId: 203, divisionName: "NL West",    leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 135, name: "San Diego Padres",      abbreviation: "SD",  divisionId: 203, divisionName: "NL West",    leagueId: 104, leagueName: "National League"),
        MLBTeam(id: 137, name: "San Francisco Giants",  abbreviation: "SF",  divisionId: 203, divisionName: "NL West",    leagueId: 104, leagueName: "National League"),
    ]

    // MARK: - Helpers

    public static func team(forId id: Int) -> MLBTeam? {
        allTeams.first { $0.id == id }
    }

    public static func teams(inDivision divisionId: Int) -> [MLBTeam] {
        allTeams.filter { $0.divisionId == divisionId }
    }

    /// Unique division names in display order.
    public static var divisionNames: [String] {
        var seen = Set<String>()
        return allTeams.compactMap { team in
            if seen.insert(team.divisionName).inserted {
                return team.divisionName
            }
            return nil
        }
    }
}
