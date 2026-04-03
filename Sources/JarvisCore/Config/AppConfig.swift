import Foundation

public struct AppConfig: Codable, Sendable {
    public var gmail: GmailConfig
    public var reminders: RemindersConfig
    public var sports: SportsConfig
    public var ai: AIConfig
    public var pdf: PDFConfig
    public var printing: PrintingConfig
    public var googleCalendar: GoogleCalendarConfig
    public var folderWatching: FolderWatchingConfig
    public var insights: InsightsConfig
    public var cloudSync: CloudSyncConfig

    public init(
        gmail: GmailConfig,
        reminders: RemindersConfig,
        sports: SportsConfig,
        ai: AIConfig,
        pdf: PDFConfig,
        printing: PrintingConfig,
        googleCalendar: GoogleCalendarConfig = .init(),
        folderWatching: FolderWatchingConfig = .init(),
        insights: InsightsConfig = .init(),
        cloudSync: CloudSyncConfig = .init()
    ) {
        self.gmail = gmail
        self.reminders = reminders
        self.sports = sports
        self.ai = ai
        self.pdf = pdf
        self.printing = printing
        self.googleCalendar = googleCalendar
        self.folderWatching = folderWatching
        self.insights = insights
        self.cloudSync = cloudSync
    }

    // Custom Decodable to make googleCalendar, folderWatching, and insights optional for backward compatibility
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        gmail = try container.decode(GmailConfig.self, forKey: .gmail)
        reminders = try container.decode(RemindersConfig.self, forKey: .reminders)
        sports = try container.decode(SportsConfig.self, forKey: .sports)
        ai = try container.decode(AIConfig.self, forKey: .ai)
        pdf = try container.decode(PDFConfig.self, forKey: .pdf)
        printing = try container.decode(PrintingConfig.self, forKey: .printing)
        googleCalendar = try container.decodeIfPresent(GoogleCalendarConfig.self, forKey: .googleCalendar) ?? .init()
        folderWatching = try container.decodeIfPresent(FolderWatchingConfig.self, forKey: .folderWatching) ?? .init()
        insights = try container.decodeIfPresent(InsightsConfig.self, forKey: .insights) ?? .init()
        cloudSync = try container.decodeIfPresent(CloudSyncConfig.self, forKey: .cloudSync) ?? .init()
    }

    public struct GmailConfig: Codable, Sendable {
        public var email: String
        public var appPassword: String
        public var searchSubjectPattern: String
        public var lookbackDays: Int

        public init(
            email: String,
            appPassword: String,
            searchSubjectPattern: String = "Case CS",
            lookbackDays: Int = 3
        ) {
            self.email = email
            self.appPassword = appPassword
            self.searchSubjectPattern = searchSubjectPattern
            self.lookbackDays = lookbackDays
        }
    }

    public struct RemindersConfig: Codable, Sendable {
        public var listName: String

        public init(listName: String = "To Do") {
            self.listName = listName
        }
    }

    public struct SportsConfig: Codable, Sendable {
        public var mlb: SportLeagueConfig
        public var nfl: SportLeagueConfig
        public var nba: SportLeagueConfig
        public var nhl: SportLeagueConfig

        /// Generic per-league configuration.
        public struct SportLeagueConfig: Codable, Sendable {
            public var enabled: Bool
            public var teamId: Int
            public var divisionId: Int
            public var conferenceId: Int
            public var teamName: String
            public var divisionName: String

            public init(
                enabled: Bool = false,
                teamId: Int = 0,
                divisionId: Int = 0,
                conferenceId: Int = 0,
                teamName: String = "",
                divisionName: String = ""
            ) {
                self.enabled = enabled
                self.teamId = teamId
                self.divisionId = divisionId
                self.conferenceId = conferenceId
                self.teamName = teamName
                self.divisionName = divisionName
            }
        }

        public init(
            mlb: SportLeagueConfig = .init(enabled: true, teamId: 116, divisionId: 202, conferenceId: 103, teamName: "Detroit Tigers", divisionName: "AL Central"),
            nfl: SportLeagueConfig = .init(enabled: false, teamId: 8, divisionId: 10, conferenceId: 7, teamName: "Detroit Lions", divisionName: "NFC North"),
            nba: SportLeagueConfig = .init(enabled: false, teamId: 8, divisionId: 2, conferenceId: 5, teamName: "Detroit Pistons", divisionName: "Central"),
            nhl: SportLeagueConfig = .init(enabled: false, teamId: 5, divisionId: 32, conferenceId: 7, teamName: "Detroit Red Wings", divisionName: "Atlantic")
        ) {
            self.mlb = mlb
            self.nfl = nfl
            self.nba = nba
            self.nhl = nhl
        }

        /// List of enabled sport keys.
        public var enabledSports: [String] {
            var result: [String] = []
            if mlb.enabled { result.append("mlb") }
            if nfl.enabled { result.append("nfl") }
            if nba.enabled { result.append("nba") }
            if nhl.enabled { result.append("nhl") }
            return result
        }

        // Custom Decodable for backward compatibility with old flat config format
        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)

            // Try new multi-sport format first
            if let mlbConfig = try container.decodeIfPresent(SportLeagueConfig.self, forKey: .mlb) {
                mlb = mlbConfig
                nfl = try container.decodeIfPresent(SportLeagueConfig.self, forKey: .nfl)
                    ?? .init(enabled: false, teamId: 8, divisionId: 10, conferenceId: 7, teamName: "Detroit Lions", divisionName: "NFC North")
                nba = try container.decodeIfPresent(SportLeagueConfig.self, forKey: .nba)
                    ?? .init(enabled: false, teamId: 8, divisionId: 2, conferenceId: 5, teamName: "Detroit Pistons", divisionName: "Central")
                nhl = try container.decodeIfPresent(SportLeagueConfig.self, forKey: .nhl)
                    ?? .init(enabled: false, teamId: 5, divisionId: 32, conferenceId: 7, teamName: "Detroit Red Wings", divisionName: "Atlantic")
                return
            }

            // Fall back to old flat format: teamId, divisionId, leagueId at top level
            let teamId = try container.decode(Int.self, forKey: .teamId)
            let divisionId = try container.decode(Int.self, forKey: .divisionId)
            let leagueId = try container.decode(Int.self, forKey: .leagueId)
            let teamName = try container.decodeIfPresent(String.self, forKey: .teamName)
                ?? MLBTeamData.team(forId: teamId)?.name
                ?? "Detroit Tigers"
            let divisionName = try container.decodeIfPresent(String.self, forKey: .divisionName)
                ?? MLBTeamData.team(forId: teamId)?.divisionName
                ?? "AL Central"

            mlb = SportLeagueConfig(enabled: true, teamId: teamId, divisionId: divisionId, conferenceId: leagueId, teamName: teamName, divisionName: divisionName)
            nfl = .init(enabled: false, teamId: 8, divisionId: 10, conferenceId: 7, teamName: "Detroit Lions", divisionName: "NFC North")
            nba = .init(enabled: false, teamId: 8, divisionId: 2, conferenceId: 5, teamName: "Detroit Pistons", divisionName: "Central")
            nhl = .init(enabled: false, teamId: 5, divisionId: 32, conferenceId: 7, teamName: "Detroit Red Wings", divisionName: "Atlantic")
        }

        // Encode only the new nested format
        public func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(mlb, forKey: .mlb)
            try container.encode(nfl, forKey: .nfl)
            try container.encode(nba, forKey: .nba)
            try container.encode(nhl, forKey: .nhl)
        }

        // CodingKeys to support both old flat format and new nested format
        private enum CodingKeys: String, CodingKey {
            case mlb, nfl, nba, nhl
            // Old flat format keys
            case teamId, divisionId, leagueId, teamName, divisionName
        }
    }

    public struct AIConfig: Codable, Sendable {
        public var claudeApiKey: String
        public var claudeModel: String

        public init(
            claudeApiKey: String,
            claudeModel: String = "claude-sonnet-4-20250514"
        ) {
            self.claudeApiKey = claudeApiKey
            self.claudeModel = claudeModel
        }
    }

    public struct PDFConfig: Codable, Sendable {
        public var outputDirectory: String
        public var keepDays: Int

        public init(
            outputDirectory: String = "~/Documents/DailyBrief",
            keepDays: Int = 30
        ) {
            self.outputDirectory = outputDirectory
            self.keepDays = keepDays
        }
    }

    public struct PrintingConfig: Codable, Sendable {
        public var enabled: Bool
        public var printerName: String
        public var copies: Int

        public init(
            enabled: Bool = true,
            printerName: String = "",
            copies: Int = 1
        ) {
            self.enabled = enabled
            self.printerName = printerName
            self.copies = copies
        }
    }

    public struct GoogleCalendarConfig: Codable, Sendable {
        public var enabled: Bool
        public var clientId: String
        public var clientSecret: String
        public var selectedCalendarIds: [String]

        public init(
            enabled: Bool = false,
            clientId: String = "",
            clientSecret: String = "",
            selectedCalendarIds: [String] = []
        ) {
            self.enabled = enabled
            self.clientId = clientId
            self.clientSecret = clientSecret
            self.selectedCalendarIds = selectedCalendarIds
        }
    }

    public struct FolderWatchingConfig: Codable, Sendable {
        public var enabled: Bool
        public var audioFolderPath: String
        public var imageFolderPath: String
        public var autoDeleteAfterProcessing: Bool

        public init(
            enabled: Bool = false,
            audioFolderPath: String = "~/Jarvis/Audio",
            imageFolderPath: String = "~/Jarvis/Images",
            autoDeleteAfterProcessing: Bool = false
        ) {
            self.enabled = enabled
            self.audioFolderPath = audioFolderPath
            self.imageFolderPath = imageFolderPath
            self.autoDeleteAfterProcessing = autoDeleteAfterProcessing
        }
    }

    public struct InsightsConfig: Codable, Sendable {
        public var enabled: Bool
        public var lookbackDays: Int

        public init(
            enabled: Bool = true,
            lookbackDays: Int = 7
        ) {
            self.enabled = enabled
            self.lookbackDays = lookbackDays
        }
    }

    public struct CloudSyncConfig: Codable, Sendable {
        public var enabled: Bool
        public var autoSyncIntervalMinutes: Int

        public init(
            enabled: Bool = false,
            autoSyncIntervalMinutes: Int = 15
        ) {
            self.enabled = enabled
            self.autoSyncIntervalMinutes = autoSyncIntervalMinutes
        }
    }
}
