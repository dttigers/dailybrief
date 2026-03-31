import Foundation

public struct AppConfig: Codable, Sendable {
    public var gmail: GmailConfig
    public var reminders: RemindersConfig
    public var sports: SportsConfig
    public var ai: AIConfig
    public var pdf: PDFConfig
    public var printing: PrintingConfig

    public init(
        gmail: GmailConfig,
        reminders: RemindersConfig,
        sports: SportsConfig,
        ai: AIConfig,
        pdf: PDFConfig,
        printing: PrintingConfig
    ) {
        self.gmail = gmail
        self.reminders = reminders
        self.sports = sports
        self.ai = ai
        self.pdf = pdf
        self.printing = printing
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

        public init(
            teamId: Int = 116,
            divisionId: Int = 202,
            leagueId: Int = 103
        ) {
            self.teamId = teamId
            self.divisionId = divisionId
            self.leagueId = leagueId
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
}
