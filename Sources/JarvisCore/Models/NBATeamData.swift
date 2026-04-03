import Foundation

public struct NBATeam: Sendable {
    public let id: Int
    public let name: String
    public let abbreviation: String
    public let divisionId: Int
    public let divisionName: String
    public let conferenceId: Int
    public let conferenceName: String
}

public enum NBATeamData {

    // MARK: - All Teams

    public static let allTeams: [NBATeam] = [
        // Atlantic (divisionId 1, conferenceId 5 Eastern)
        NBATeam(id: 2,  name: "Boston Celtics",           abbreviation: "BOS",  divisionId: 1,  divisionName: "Atlantic",  conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 17, name: "Brooklyn Nets",            abbreviation: "BKN",  divisionId: 1,  divisionName: "Atlantic",  conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 18, name: "New York Knicks",          abbreviation: "NY",   divisionId: 1,  divisionName: "Atlantic",  conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 20, name: "Philadelphia 76ers",       abbreviation: "PHI",  divisionId: 1,  divisionName: "Atlantic",  conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 28, name: "Toronto Raptors",          abbreviation: "TOR",  divisionId: 1,  divisionName: "Atlantic",  conferenceId: 5, conferenceName: "Eastern"),

        // Central (divisionId 2, conferenceId 5 Eastern)
        NBATeam(id: 4,  name: "Chicago Bulls",            abbreviation: "CHI",  divisionId: 2,  divisionName: "Central",   conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 5,  name: "Cleveland Cavaliers",      abbreviation: "CLE",  divisionId: 2,  divisionName: "Central",   conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 8,  name: "Detroit Pistons",          abbreviation: "DET",  divisionId: 2,  divisionName: "Central",   conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 11, name: "Indiana Pacers",           abbreviation: "IND",  divisionId: 2,  divisionName: "Central",   conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 15, name: "Milwaukee Bucks",          abbreviation: "MIL",  divisionId: 2,  divisionName: "Central",   conferenceId: 5, conferenceName: "Eastern"),

        // Southeast (divisionId 9, conferenceId 5 Eastern)
        NBATeam(id: 1,  name: "Atlanta Hawks",            abbreviation: "ATL",  divisionId: 9,  divisionName: "Southeast", conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 30, name: "Charlotte Hornets",        abbreviation: "CHA",  divisionId: 9,  divisionName: "Southeast", conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 14, name: "Miami Heat",               abbreviation: "MIA",  divisionId: 9,  divisionName: "Southeast", conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 19, name: "Orlando Magic",            abbreviation: "ORL",  divisionId: 9,  divisionName: "Southeast", conferenceId: 5, conferenceName: "Eastern"),
        NBATeam(id: 27, name: "Washington Wizards",       abbreviation: "WSH",  divisionId: 9,  divisionName: "Southeast", conferenceId: 5, conferenceName: "Eastern"),

        // Northwest (divisionId 11, conferenceId 6 Western)
        NBATeam(id: 7,  name: "Denver Nuggets",           abbreviation: "DEN",  divisionId: 11, divisionName: "Northwest", conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 16, name: "Minnesota Timberwolves",   abbreviation: "MIN",  divisionId: 11, divisionName: "Northwest", conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 25, name: "Oklahoma City Thunder",    abbreviation: "OKC",  divisionId: 11, divisionName: "Northwest", conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 22, name: "Portland Trail Blazers",   abbreviation: "POR",  divisionId: 11, divisionName: "Northwest", conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 26, name: "Utah Jazz",                abbreviation: "UTAH", divisionId: 11, divisionName: "Northwest", conferenceId: 6, conferenceName: "Western"),

        // Pacific (divisionId 4, conferenceId 6 Western)
        NBATeam(id: 9,  name: "Golden State Warriors",    abbreviation: "GS",   divisionId: 4,  divisionName: "Pacific",   conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 12, name: "LA Clippers",              abbreviation: "LAC",  divisionId: 4,  divisionName: "Pacific",   conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 13, name: "Los Angeles Lakers",       abbreviation: "LAL",  divisionId: 4,  divisionName: "Pacific",   conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 21, name: "Phoenix Suns",             abbreviation: "PHX",  divisionId: 4,  divisionName: "Pacific",   conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 23, name: "Sacramento Kings",         abbreviation: "SAC",  divisionId: 4,  divisionName: "Pacific",   conferenceId: 6, conferenceName: "Western"),

        // Southwest (divisionId 10, conferenceId 6 Western)
        NBATeam(id: 6,  name: "Dallas Mavericks",         abbreviation: "DAL",  divisionId: 10, divisionName: "Southwest", conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 10, name: "Houston Rockets",          abbreviation: "HOU",  divisionId: 10, divisionName: "Southwest", conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 29, name: "Memphis Grizzlies",        abbreviation: "MEM",  divisionId: 10, divisionName: "Southwest", conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 3,  name: "New Orleans Pelicans",     abbreviation: "NO",   divisionId: 10, divisionName: "Southwest", conferenceId: 6, conferenceName: "Western"),
        NBATeam(id: 24, name: "San Antonio Spurs",        abbreviation: "SA",   divisionId: 10, divisionName: "Southwest", conferenceId: 6, conferenceName: "Western"),
    ]

    // MARK: - Helpers

    public static func team(forId id: Int) -> NBATeam? {
        allTeams.first { $0.id == id }
    }

    public static func teams(inDivision divisionId: Int) -> [NBATeam] {
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
