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
    var sportsSelectedTeamId: Int = 116

    var sportsTeamName: String {
        MLBTeamData.team(forId: sportsSelectedTeamId)?.name ?? "Unknown"
    }

    var sportsDivisionName: String {
        MLBTeamData.team(forId: sportsSelectedTeamId)?.divisionName ?? "Unknown"
    }

    var sportsLeagueName: String {
        MLBTeamData.team(forId: sportsSelectedTeamId)?.leagueName ?? "Unknown"
    }

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

    // MARK: - Folder Watching
    var folderWatchingEnabled: Bool = false
    var audioFolderPath: String = "~/Jarvis/Audio"
    var imageFolderPath: String = "~/Jarvis/Images"

    // MARK: - Cloud Sync
    var cloudSyncEnabled: Bool = false
    var cloudSyncIntervalMinutes: Int = 15

    // MARK: - Google Calendar
    var googleCalendarEnabled: Bool = false
    var googleCalendarClientId: String = ""
    var googleCalendarClientSecret: String = ""
    var selectedCalendarIds: [String] = []
    var isAuthorized: Bool = false
    var isAuthorizing: Bool = false
    var authError: String?
    var availableCalendars: [(id: String, name: String)] = []

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

        sportsSelectedTeamId = config.sports.teamId

        claudeApiKey = config.ai.claudeApiKey
        claudeModel = config.ai.claudeModel

        pdfOutputDirectory = config.pdf.outputDirectory
        pdfKeepDays = config.pdf.keepDays

        printingEnabled = config.printing.enabled
        printerName = config.printing.printerName
        printingCopies = config.printing.copies

        remindersListName = config.reminders.listName

        folderWatchingEnabled = config.folderWatching.enabled
        audioFolderPath = config.folderWatching.audioFolderPath
        imageFolderPath = config.folderWatching.imageFolderPath

        cloudSyncEnabled = config.cloudSync.enabled
        cloudSyncIntervalMinutes = config.cloudSync.autoSyncIntervalMinutes

        googleCalendarEnabled = config.googleCalendar.enabled
        googleCalendarClientId = config.googleCalendar.clientId
        googleCalendarClientSecret = config.googleCalendar.clientSecret
        selectedCalendarIds = config.googleCalendar.selectedCalendarIds
        isAuthorized = CalendarTokens.load() != nil
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
            sports: {
                let team = MLBTeamData.team(forId: sportsSelectedTeamId)
                return .init(
                    teamId: sportsSelectedTeamId,
                    divisionId: team?.divisionId ?? 202,
                    leagueId: team?.leagueId ?? 103,
                    teamName: team?.name ?? "Detroit Tigers",
                    divisionName: team?.divisionName ?? "AL Central"
                )
            }(),
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
            ),
            googleCalendar: .init(
                enabled: googleCalendarEnabled,
                clientId: googleCalendarClientId,
                clientSecret: googleCalendarClientSecret,
                selectedCalendarIds: selectedCalendarIds
            ),
            folderWatching: .init(
                enabled: folderWatchingEnabled,
                audioFolderPath: audioFolderPath,
                imageFolderPath: imageFolderPath
            ),
            cloudSync: .init(
                enabled: cloudSyncEnabled,
                autoSyncIntervalMinutes: cloudSyncIntervalMinutes
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

    // MARK: - Google Calendar Auth

    func authorizeGoogleCalendar() async {
        isAuthorizing = true
        authError = nil

        do {
            _ = try await GoogleCalendarAuth.authorize(
                clientId: googleCalendarClientId,
                clientSecret: googleCalendarClientSecret
            )
            isAuthorized = true
            await fetchAvailableCalendars()
        } catch {
            authError = error.localizedDescription
        }

        isAuthorizing = false
    }

    func fetchAvailableCalendars() async {
        guard isAuthorized else { return }
        let config = AppConfig.GoogleCalendarConfig(
            enabled: googleCalendarEnabled,
            clientId: googleCalendarClientId,
            clientSecret: googleCalendarClientSecret,
            selectedCalendarIds: selectedCalendarIds
        )
        let service = GoogleCalendarService(config: config)
        do {
            let calendars = try await service.fetchCalendarList()
            availableCalendars = calendars
        } catch {
            authError = "Failed to load calendars: \(error.localizedDescription)"
        }
    }

    func disconnectGoogleCalendar() {
        let path = CalendarTokens.tokenFilePath
        try? FileManager.default.removeItem(atPath: path)
        isAuthorized = false
        availableCalendars = []
        selectedCalendarIds = []
        authError = nil
    }
}
