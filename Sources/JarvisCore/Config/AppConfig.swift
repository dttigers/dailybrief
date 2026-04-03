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
        public var teamId: Int
        public var divisionId: Int
        public var leagueId: Int
        public var teamName: String
        public var divisionName: String

        public init(
            teamId: Int = 116,
            divisionId: Int = 202,
            leagueId: Int = 103,
            teamName: String = "Detroit Tigers",
            divisionName: String = "AL Central"
        ) {
            self.teamId = teamId
            self.divisionId = divisionId
            self.leagueId = leagueId
            self.teamName = teamName
            self.divisionName = divisionName
        }

        // Custom Decodable for backward compatibility with configs missing teamName/divisionName
        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            teamId = try container.decode(Int.self, forKey: .teamId)
            divisionId = try container.decode(Int.self, forKey: .divisionId)
            leagueId = try container.decode(Int.self, forKey: .leagueId)
            teamName = try container.decodeIfPresent(String.self, forKey: .teamName)
                ?? MLBTeamData.team(forId: try container.decode(Int.self, forKey: .teamId))?.name
                ?? "Detroit Tigers"
            divisionName = try container.decodeIfPresent(String.self, forKey: .divisionName)
                ?? MLBTeamData.team(forId: try container.decode(Int.self, forKey: .teamId))?.divisionName
                ?? "AL Central"
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
