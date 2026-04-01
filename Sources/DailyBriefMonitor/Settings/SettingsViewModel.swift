import Foundation
import JarvisCore

@MainActor
@Observable
final class SettingsViewModel {

    // MARK: - Gmail
    var gmailEmail: String = ""
    var gmailAppPassword: String = ""
    var gmailSearchSubjectPattern: String = "Case CS"
    var gmailLookbackDays: Int = 3

    // MARK: - Sports
    var sportsTeamId: Int = 116
    var sportsDivisionId: Int = 202
    var sportsLeagueId: Int = 103

    // MARK: - AI
    var claudeApiKey: String = ""
    var claudeModel: String = "claude-sonnet-4-20250514"

    // MARK: - PDF
    var pdfOutputDirectory: String = "~/Documents/DailyBrief"
    var pdfKeepDays: Int = 30

    // MARK: - Printing
    var printingEnabled: Bool = true
    var printerName: String = ""
    var printingCopies: Int = 1

    // MARK: - Reminders
    var remindersListName: String = "To Do"

    // MARK: - Save state
    var isSaving: Bool = false
    var saveError: String?
    var showSaveSuccess: Bool = false

    init() {
        loadConfig()
    }

    func loadConfig() {
        guard let config = try? ConfigLoader.load() else { return }

        gmailEmail = config.gmail.email
        gmailAppPassword = config.gmail.appPassword
        gmailSearchSubjectPattern = config.gmail.searchSubjectPattern
        gmailLookbackDays = config.gmail.lookbackDays

        sportsTeamId = config.sports.teamId
        sportsDivisionId = config.sports.divisionId
        sportsLeagueId = config.sports.leagueId

        claudeApiKey = config.ai.claudeApiKey
        claudeModel = config.ai.claudeModel

        pdfOutputDirectory = config.pdf.outputDirectory
        pdfKeepDays = config.pdf.keepDays

        printingEnabled = config.printing.enabled
        printerName = config.printing.printerName
        printingCopies = config.printing.copies

        remindersListName = config.reminders.listName
    }

    func save() {
        isSaving = true
        saveError = nil
        showSaveSuccess = false

        let config = AppConfig(
            gmail: .init(
                email: gmailEmail,
                appPassword: gmailAppPassword,
                searchSubjectPattern: gmailSearchSubjectPattern,
                lookbackDays: gmailLookbackDays
            ),
            reminders: .init(listName: remindersListName),
            sports: .init(
                teamId: sportsTeamId,
                divisionId: sportsDivisionId,
                leagueId: sportsLeagueId
            ),
            ai: .init(
                claudeApiKey: claudeApiKey,
                claudeModel: claudeModel
            ),
            pdf: .init(
                outputDirectory: pdfOutputDirectory,
                keepDays: pdfKeepDays
            ),
            printing: .init(
                enabled: printingEnabled,
                printerName: printerName,
                copies: printingCopies
            )
        )

        do {
            try ConfigLoader.save(config)
            showSaveSuccess = true
        } catch {
            saveError = error.localizedDescription
        }

        isSaving = false
    }
}
