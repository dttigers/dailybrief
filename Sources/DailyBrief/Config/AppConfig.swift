import Foundation

struct AppConfig: Codable, Sendable {
    var gmail: GmailConfig
    var reminders: RemindersConfig
    var sports: SportsConfig
    var ai: AIConfig
    var pdf: PDFConfig
    var printing: PrintingConfig

    struct GmailConfig: Codable, Sendable {
        var email: String
        var appPassword: String
        var searchSubjectPattern: String = "Case CS"
        var lookbackDays: Int = 3
    }

    struct RemindersConfig: Codable, Sendable {
        var listName: String = "To Do"
    }

    struct SportsConfig: Codable, Sendable {
        var teamId: Int = 116         // Detroit Tigers
        var divisionId: Int = 202     // AL Central
        var leagueId: Int = 103       // American League
    }

    struct AIConfig: Codable, Sendable {
        var claudeApiKey: String
        var claudeModel: String = "claude-sonnet-4-20250514"
    }

    struct PDFConfig: Codable, Sendable {
        var outputDirectory: String = "~/Documents/DailyBrief"
        var keepDays: Int = 30
    }

    struct PrintingConfig: Codable, Sendable {
        var enabled: Bool = true
        var printerName: String = ""
        var copies: Int = 1
    }
}
