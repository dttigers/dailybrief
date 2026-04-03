import Foundation

public struct NFLTeam: Sendable {
    public let id: Int
    public let name: String
    public let abbreviation: String
    public let divisionId: Int
    public let divisionName: String
    public let conferenceId: Int
    public let conferenceName: String
}

public enum NFLTeamData {

    // MARK: - All Teams

    public static let allTeams: [NFLTeam] = [
        // AFC East (divisionId 4, conferenceId 8)
        NFLTeam(id: 2,  name: "Buffalo Bills",            abbreviation: "BUF", divisionId: 4,  divisionName: "AFC East",  conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 15, name: "Miami Dolphins",           abbreviation: "MIA", divisionId: 4,  divisionName: "AFC East",  conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 17, name: "New England Patriots",     abbreviation: "NE",  divisionId: 4,  divisionName: "AFC East",  conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 20, name: "New York Jets",            abbreviation: "NYJ", divisionId: 4,  divisionName: "AFC East",  conferenceId: 8, conferenceName: "AFC"),

        // AFC North (divisionId 12, conferenceId 8)
        NFLTeam(id: 33, name: "Baltimore Ravens",         abbreviation: "BAL", divisionId: 12, divisionName: "AFC North", conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 4,  name: "Cincinnati Bengals",       abbreviation: "CIN", divisionId: 12, divisionName: "AFC North", conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 5,  name: "Cleveland Browns",         abbreviation: "CLE", divisionId: 12, divisionName: "AFC North", conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 23, name: "Pittsburgh Steelers",      abbreviation: "PIT", divisionId: 12, divisionName: "AFC North", conferenceId: 8, conferenceName: "AFC"),

        // AFC South (divisionId 13, conferenceId 8)
        NFLTeam(id: 34, name: "Houston Texans",           abbreviation: "HOU", divisionId: 13, divisionName: "AFC South", conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 11, name: "Indianapolis Colts",       abbreviation: "IND", divisionId: 13, divisionName: "AFC South", conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 30, name: "Jacksonville Jaguars",     abbreviation: "JAX", divisionId: 13, divisionName: "AFC South", conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 10, name: "Tennessee Titans",         abbreviation: "TEN", divisionId: 13, divisionName: "AFC South", conferenceId: 8, conferenceName: "AFC"),

        // AFC West (divisionId 6, conferenceId 8)
        NFLTeam(id: 7,  name: "Denver Broncos",           abbreviation: "DEN", divisionId: 6,  divisionName: "AFC West",  conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 12, name: "Kansas City Chiefs",       abbreviation: "KC",  divisionId: 6,  divisionName: "AFC West",  conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 13, name: "Las Vegas Raiders",        abbreviation: "LV",  divisionId: 6,  divisionName: "AFC West",  conferenceId: 8, conferenceName: "AFC"),
        NFLTeam(id: 24, name: "Los Angeles Chargers",     abbreviation: "LAC", divisionId: 6,  divisionName: "AFC West",  conferenceId: 8, conferenceName: "AFC"),

        // NFC East (divisionId 1, conferenceId 7)
        NFLTeam(id: 6,  name: "Dallas Cowboys",           abbreviation: "DAL", divisionId: 1,  divisionName: "NFC East",  conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 19, name: "New York Giants",          abbreviation: "NYG", divisionId: 1,  divisionName: "NFC East",  conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 21, name: "Philadelphia Eagles",      abbreviation: "PHI", divisionId: 1,  divisionName: "NFC East",  conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 28, name: "Washington Commanders",    abbreviation: "WSH", divisionId: 1,  divisionName: "NFC East",  conferenceId: 7, conferenceName: "NFC"),

        // NFC North (divisionId 10, conferenceId 7)
        NFLTeam(id: 3,  name: "Chicago Bears",            abbreviation: "CHI", divisionId: 10, divisionName: "NFC North", conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 8,  name: "Detroit Lions",            abbreviation: "DET", divisionId: 10, divisionName: "NFC North", conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 9,  name: "Green Bay Packers",        abbreviation: "GB",  divisionId: 10, divisionName: "NFC North", conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 16, name: "Minnesota Vikings",        abbreviation: "MIN", divisionId: 10, divisionName: "NFC North", conferenceId: 7, conferenceName: "NFC"),

        // NFC South (divisionId 11, conferenceId 7)
        NFLTeam(id: 1,  name: "Atlanta Falcons",          abbreviation: "ATL", divisionId: 11, divisionName: "NFC South", conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 29, name: "Carolina Panthers",        abbreviation: "CAR", divisionId: 11, divisionName: "NFC South", conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 18, name: "New Orleans Saints",       abbreviation: "NO",  divisionId: 11, divisionName: "NFC South", conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 27, name: "Tampa Bay Buccaneers",     abbreviation: "TB",  divisionId: 11, divisionName: "NFC South", conferenceId: 7, conferenceName: "NFC"),

        // NFC West (divisionId 3, conferenceId 7)
        NFLTeam(id: 22, name: "Arizona Cardinals",        abbreviation: "ARI", divisionId: 3,  divisionName: "NFC West",  conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 14, name: "Los Angeles Rams",         abbreviation: "LAR", divisionId: 3,  divisionName: "NFC West",  conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 25, name: "San Francisco 49ers",      abbreviation: "SF",  divisionId: 3,  divisionName: "NFC West",  conferenceId: 7, conferenceName: "NFC"),
        NFLTeam(id: 26, name: "Seattle Seahawks",         abbreviation: "SEA", divisionId: 3,  divisionName: "NFC West",  conferenceId: 7, conferenceName: "NFC"),
    ]

    // MARK: - Helpers

    public static func team(forId id: Int) -> NFLTeam? {
        allTeams.first { $0.id == id }
    }

    public static func teams(inDivision divisionId: Int) -> [NFLTeam] {
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
