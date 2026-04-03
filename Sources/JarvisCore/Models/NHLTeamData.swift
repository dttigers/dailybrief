import Foundation

public struct NHLTeam: Sendable {
    public let id: Int
    public let name: String
    public let abbreviation: String
    public let divisionId: Int
    public let divisionName: String
    public let conferenceId: Int
    public let conferenceName: String
}

public enum NHLTeamData {

    // MARK: - All Teams

    public static let allTeams: [NHLTeam] = [
        // Atlantic (divisionId 32, conferenceId 7 Eastern)
        NHLTeam(id: 1,      name: "Boston Bruins",          abbreviation: "BOS",  divisionId: 32, divisionName: "Atlantic",       conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 2,      name: "Buffalo Sabres",         abbreviation: "BUF",  divisionId: 32, divisionName: "Atlantic",       conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 5,      name: "Detroit Red Wings",      abbreviation: "DET",  divisionId: 32, divisionName: "Atlantic",       conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 26,     name: "Florida Panthers",       abbreviation: "FLA",  divisionId: 32, divisionName: "Atlantic",       conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 10,     name: "Montreal Canadiens",     abbreviation: "MTL",  divisionId: 32, divisionName: "Atlantic",       conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 14,     name: "Ottawa Senators",        abbreviation: "OTT",  divisionId: 32, divisionName: "Atlantic",       conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 20,     name: "Tampa Bay Lightning",    abbreviation: "TB",   divisionId: 32, divisionName: "Atlantic",       conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 21,     name: "Toronto Maple Leafs",    abbreviation: "TOR",  divisionId: 32, divisionName: "Atlantic",       conferenceId: 7, conferenceName: "Eastern"),

        // Metropolitan (divisionId 33, conferenceId 7 Eastern)
        NHLTeam(id: 7,      name: "Carolina Hurricanes",    abbreviation: "CAR",  divisionId: 33, divisionName: "Metropolitan",   conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 29,     name: "Columbus Blue Jackets",  abbreviation: "CBJ",  divisionId: 33, divisionName: "Metropolitan",   conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 11,     name: "New Jersey Devils",      abbreviation: "NJ",   divisionId: 33, divisionName: "Metropolitan",   conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 12,     name: "New York Islanders",     abbreviation: "NYI",  divisionId: 33, divisionName: "Metropolitan",   conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 13,     name: "New York Rangers",       abbreviation: "NYR",  divisionId: 33, divisionName: "Metropolitan",   conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 15,     name: "Philadelphia Flyers",    abbreviation: "PHI",  divisionId: 33, divisionName: "Metropolitan",   conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 16,     name: "Pittsburgh Penguins",    abbreviation: "PIT",  divisionId: 33, divisionName: "Metropolitan",   conferenceId: 7, conferenceName: "Eastern"),
        NHLTeam(id: 23,     name: "Washington Capitals",    abbreviation: "WSH",  divisionId: 33, divisionName: "Metropolitan",   conferenceId: 7, conferenceName: "Eastern"),

        // Central (divisionId 31, conferenceId 8 Western)
        NHLTeam(id: 4,      name: "Chicago Blackhawks",     abbreviation: "CHI",  divisionId: 31, divisionName: "Central",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 17,     name: "Colorado Avalanche",     abbreviation: "COL",  divisionId: 31, divisionName: "Central",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 9,      name: "Dallas Stars",           abbreviation: "DAL",  divisionId: 31, divisionName: "Central",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 30,     name: "Minnesota Wild",         abbreviation: "MIN",  divisionId: 31, divisionName: "Central",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 27,     name: "Nashville Predators",    abbreviation: "NSH",  divisionId: 31, divisionName: "Central",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 19,     name: "St. Louis Blues",        abbreviation: "STL",  divisionId: 31, divisionName: "Central",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 129764, name: "Utah Mammoth",           abbreviation: "UTAH", divisionId: 31, divisionName: "Central",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 28,     name: "Winnipeg Jets",          abbreviation: "WPG",  divisionId: 31, divisionName: "Central",        conferenceId: 8, conferenceName: "Western"),

        // Pacific (divisionId 30, conferenceId 8 Western)
        NHLTeam(id: 25,     name: "Anaheim Ducks",          abbreviation: "ANA",  divisionId: 30, divisionName: "Pacific",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 3,      name: "Calgary Flames",         abbreviation: "CGY",  divisionId: 30, divisionName: "Pacific",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 6,      name: "Edmonton Oilers",        abbreviation: "EDM",  divisionId: 30, divisionName: "Pacific",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 8,      name: "Los Angeles Kings",      abbreviation: "LA",   divisionId: 30, divisionName: "Pacific",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 18,     name: "San Jose Sharks",        abbreviation: "SJ",   divisionId: 30, divisionName: "Pacific",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 124292, name: "Seattle Kraken",          abbreviation: "SEA",  divisionId: 30, divisionName: "Pacific",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 22,     name: "Vancouver Canucks",      abbreviation: "VAN",  divisionId: 30, divisionName: "Pacific",        conferenceId: 8, conferenceName: "Western"),
        NHLTeam(id: 37,     name: "Vegas Golden Knights",   abbreviation: "VGK",  divisionId: 30, divisionName: "Pacific",        conferenceId: 8, conferenceName: "Western"),
    ]

    // MARK: - Helpers

    public static func team(forId id: Int) -> NHLTeam? {
        allTeams.first { $0.id == id }
    }

    public static func teams(inDivision divisionId: Int) -> [NHLTeam] {
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
