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

    // MARK: - Sports (Multi-Sport)

    // MLB
    var mlbEnabled: Bool = true
    var mlbSelectedTeamId: Int = 116

    var mlbTeamName: String {
        MLBTeamData.team(forId: mlbSelectedTeamId)?.name ?? "Unknown"
    }
    var mlbDivisionName: String {
        MLBTeamData.team(forId: mlbSelectedTeamId)?.divisionName ?? "Unknown"
    }
    var mlbLeagueName: String {
        MLBTeamData.team(forId: mlbSelectedTeamId)?.leagueName ?? "Unknown"
    }

    // NFL
    var nflEnabled: Bool = false
    var nflSelectedTeamId: Int = 8

    var nflTeamName: String {
        NFLTeamData.team(forId: nflSelectedTeamId)?.name ?? "Unknown"
    }
    var nflDivisionName: String {
        NFLTeamData.team(forId: nflSelectedTeamId)?.divisionName ?? "Unknown"
    }
    var nflConferenceName: String {
        NFLTeamData.team(forId: nflSelectedTeamId)?.conferenceName ?? "Unknown"
    }

    // NBA
    var nbaEnabled: Bool = false
    var nbaSelectedTeamId: Int = 8

    var nbaTeamName: String {
        NBATeamData.team(forId: nbaSelectedTeamId)?.name ?? "Unknown"
    }
    var nbaDivisionName: String {
        NBATeamData.team(forId: nbaSelectedTeamId)?.divisionName ?? "Unknown"
    }
    var nbaConferenceName: String {
        NBATeamData.team(forId: nbaSelectedTeamId)?.conferenceName ?? "Unknown"
    }

    // NHL
    var nhlEnabled: Bool = false
    var nhlSelectedTeamId: Int = 5

    var nhlTeamName: String {
        NHLTeamData.team(forId: nhlSelectedTeamId)?.name ?? "Unknown"
    }
    var nhlDivisionName: String {
        NHLTeamData.team(forId: nhlSelectedTeamId)?.divisionName ?? "Unknown"
    }
    var nhlConferenceName: String {
        NHLTeamData.team(forId: nhlSelectedTeamId)?.conferenceName ?? "Unknown"
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
    var autoDeleteAfterProcessing: Bool = false

    // MARK: - Insights
    var insightsEnabled: Bool = true
    var insightsLookbackDays: Int = 7

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

        mlbEnabled = config.sports.mlb.enabled
        mlbSelectedTeamId = config.sports.mlb.teamId

        nflEnabled = config.sports.nfl.enabled
        nflSelectedTeamId = config.sports.nfl.teamId

        nbaEnabled = config.sports.nba.enabled
        nbaSelectedTeamId = config.sports.nba.teamId

        nhlEnabled = config.sports.nhl.enabled
        nhlSelectedTeamId = config.sports.nhl.teamId

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
        autoDeleteAfterProcessing = config.folderWatching.autoDeleteAfterProcessing

        insightsEnabled = config.insights.enabled
        insightsLookbackDays = config.insights.lookbackDays

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
                let mlbTeam = MLBTeamData.team(forId: mlbSelectedTeamId)
                let nflTeam = NFLTeamData.team(forId: nflSelectedTeamId)
                let nbaTeam = NBATeamData.team(forId: nbaSelectedTeamId)
                let nhlTeam = NHLTeamData.team(forId: nhlSelectedTeamId)
                return .init(
                    mlb: .init(
                        enabled: mlbEnabled,
                        teamId: mlbSelectedTeamId,
                        divisionId: mlbTeam?.divisionId ?? 202,
                        conferenceId: mlbTeam?.leagueId ?? 103,
                        teamName: mlbTeam?.name ?? "Detroit Tigers",
                        divisionName: mlbTeam?.divisionName ?? "AL Central"
                    ),
                    nfl: .init(
                        enabled: nflEnabled,
                        teamId: nflSelectedTeamId,
                        divisionId: nflTeam?.divisionId ?? 10,
                        conferenceId: nflTeam?.conferenceId ?? 7,
                        teamName: nflTeam?.name ?? "Detroit Lions",
                        divisionName: nflTeam?.divisionName ?? "NFC North"
                    ),
                    nba: .init(
                        enabled: nbaEnabled,
                        teamId: nbaSelectedTeamId,
                        divisionId: nbaTeam?.divisionId ?? 2,
                        conferenceId: nbaTeam?.conferenceId ?? 5,
                        teamName: nbaTeam?.name ?? "Detroit Pistons",
                        divisionName: nbaTeam?.divisionName ?? "Central"
                    ),
                    nhl: .init(
                        enabled: nhlEnabled,
                        teamId: nhlSelectedTeamId,
                        divisionId: nhlTeam?.divisionId ?? 32,
                        conferenceId: nhlTeam?.conferenceId ?? 7,
                        teamName: nhlTeam?.name ?? "Detroit Red Wings",
                        divisionName: nhlTeam?.divisionName ?? "Atlantic"
                    )
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
                imageFolderPath: imageFolderPath,
                autoDeleteAfterProcessing: autoDeleteAfterProcessing
            ),
            insights: .init(
                enabled: insightsEnabled,
                lookbackDays: insightsLookbackDays
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
