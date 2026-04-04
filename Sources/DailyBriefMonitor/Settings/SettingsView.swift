import AppKit
import JarvisCore
import SwiftUI

struct SettingsView: View {
    @Bindable var viewModel: SettingsViewModel

    var body: some View {
        VStack(spacing: 0) {
            TabView {
                aiTab
                    .tabItem { Label("AI", systemImage: "brain") }

                emailTab
                    .tabItem { Label("Email / IMAP", systemImage: "envelope") }

                sportsTab
                    .tabItem { Label("Sports", systemImage: "sportscourt") }

                pdfTab
                    .tabItem { Label("PDF", systemImage: "doc.richtext") }

                printingTab
                    .tabItem { Label("Printing", systemImage: "printer") }

                remindersTab
                    .tabItem { Label("Reminders", systemImage: "checklist") }

                calendarTab
                    .tabItem { Label("Calendar", systemImage: "calendar") }

                foldersTab
                    .tabItem { Label("Folders", systemImage: "folder.badge.gearshape") }

                cloudSyncTab
                    .tabItem { Label("Cloud Sync", systemImage: "icloud") }

                insightsTab
                    .tabItem { Label("Insights", systemImage: "lightbulb") }
            }

            Divider()

            bottomBar
                .padding(12)
        }
        .frame(minWidth: 850, idealWidth: 850, minHeight: 500)
    }

    // MARK: - Tabs

    private var aiTab: some View {
        Form {
            SecureField("API Key", text: $viewModel.claudeApiKey)
            TextField("Model", text: $viewModel.claudeModel)
        }
        .padding()
    }

    private var emailTab: some View {
        ScrollView {
        Form {
            Section("Connection") {
                TextField("IMAP Host", text: $viewModel.imapHost, prompt: Text("imap.gmail.com"))
                TextField("IMAP Port", value: $viewModel.imapPort, format: .number)
                Toggle("Use TLS", isOn: $viewModel.useTLS)
            }

            Section("Authentication") {
                Picker("Auth Type", selection: $viewModel.emailAuthType) {
                    Text("App Password").tag("app_password")
                    Text("OAuth2 (Microsoft 365)").tag("oauth2")
                }
                .pickerStyle(.segmented)
            }

            Section("Credentials") {
                TextField("Email Address", text: $viewModel.emailAddress)

                if viewModel.emailAuthType == "app_password" {
                    SecureField("IMAP Password", text: $viewModel.emailAppPassword)
                } else {
                    TextField("Client ID", text: $viewModel.oauth2ClientId)
                    TextField("Tenant ID", text: $viewModel.oauth2TenantId)
                    HStack {
                        if viewModel.oauth2RefreshToken.isEmpty {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.red)
                            Text("Refresh Token: Not configured")
                                .foregroundStyle(.secondary)
                        } else {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Text("Refresh Token: Configured")
                                .foregroundStyle(.secondary)
                        }
                    }
                    Text("Run `dailybrief email-auth` in terminal to authenticate")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Search") {
                TextField("Search Subject Pattern", text: $viewModel.emailSearchSubjectPattern)
                Stepper("Lookback Days: \(viewModel.emailLookbackDays)", value: $viewModel.emailLookbackDays, in: 1...30)
            }
        }
        .padding()
        }
    }

    private var sportsTab: some View {
        ScrollView {
        Form {
            // MLB Section
            Section {
                Toggle("Enabled", isOn: $viewModel.mlbEnabled)
                if viewModel.mlbEnabled {
                    Picker("Team", selection: $viewModel.mlbSelectedTeamId) {
                        ForEach(MLBTeamData.divisionNames, id: \.self) { division in
                            Section(division) {
                                ForEach(MLBTeamData.teams(inDivision:
                                    MLBTeamData.allTeams.first { $0.divisionName == division }!.divisionId
                                ), id: \.id) { team in
                                    Text(team.name).tag(team.id)
                                }
                            }
                        }
                    }
                    LabeledContent("Division") {
                        Text("\(viewModel.mlbDivisionName) | \(viewModel.mlbLeagueName)")
                            .foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("MLB")
            }

            // NFL Section
            Section {
                Toggle("Enabled", isOn: $viewModel.nflEnabled)
                if viewModel.nflEnabled {
                    Picker("Team", selection: $viewModel.nflSelectedTeamId) {
                        ForEach(NFLTeamData.divisionNames, id: \.self) { division in
                            Section(division) {
                                ForEach(NFLTeamData.teams(inDivision:
                                    NFLTeamData.allTeams.first { $0.divisionName == division }!.divisionId
                                ), id: \.id) { team in
                                    Text(team.name).tag(team.id)
                                }
                            }
                        }
                    }
                    LabeledContent("Division") {
                        Text("\(viewModel.nflDivisionName) | \(viewModel.nflConferenceName)")
                            .foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("NFL")
            }

            // NBA Section
            Section {
                Toggle("Enabled", isOn: $viewModel.nbaEnabled)
                if viewModel.nbaEnabled {
                    Picker("Team", selection: $viewModel.nbaSelectedTeamId) {
                        ForEach(NBATeamData.divisionNames, id: \.self) { division in
                            Section(division) {
                                ForEach(NBATeamData.teams(inDivision:
                                    NBATeamData.allTeams.first { $0.divisionName == division }!.divisionId
                                ), id: \.id) { team in
                                    Text(team.name).tag(team.id)
                                }
                            }
                        }
                    }
                    LabeledContent("Division") {
                        Text("\(viewModel.nbaDivisionName) | \(viewModel.nbaConferenceName)")
                            .foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("NBA")
            }

            // NHL Section
            Section {
                Toggle("Enabled", isOn: $viewModel.nhlEnabled)
                if viewModel.nhlEnabled {
                    Picker("Team", selection: $viewModel.nhlSelectedTeamId) {
                        ForEach(NHLTeamData.divisionNames, id: \.self) { division in
                            Section(division) {
                                ForEach(NHLTeamData.teams(inDivision:
                                    NHLTeamData.allTeams.first { $0.divisionName == division }!.divisionId
                                ), id: \.id) { team in
                                    Text(team.name).tag(team.id)
                                }
                            }
                        }
                    }
                    LabeledContent("Division") {
                        Text("\(viewModel.nhlDivisionName) | \(viewModel.nhlConferenceName)")
                            .foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("NHL")
            }
        }
        .padding()
        }
    }

    private var pdfTab: some View {
        Form {
            TextField("Output Directory", text: $viewModel.pdfOutputDirectory)
            Stepper("Keep Days: \(viewModel.pdfKeepDays)", value: $viewModel.pdfKeepDays, in: 1...365)
        }
        .padding()
    }

    private var printingTab: some View {
        Form {
            Toggle("Enabled", isOn: $viewModel.printingEnabled)
            TextField("Printer Name", text: $viewModel.printerName)
            Stepper("Copies: \(viewModel.printingCopies)", value: $viewModel.printingCopies, in: 1...10)
        }
        .padding()
    }

    private var remindersTab: some View {
        Form {
            TextField("List Name", text: $viewModel.remindersListName)
        }
        .padding()
    }

    private var calendarTab: some View {
        ScrollView {
        Form {
            Toggle("Enable Google Calendar", isOn: $viewModel.googleCalendarEnabled)

            if viewModel.googleCalendarEnabled {
                TextField("Client ID", text: $viewModel.googleCalendarClientId)
                SecureField("Client Secret", text: $viewModel.googleCalendarClientSecret)

                if viewModel.isAuthorizing {
                    HStack {
                        ProgressView()
                            .controlSize(.small)
                        Text("Authorizing...")
                            .foregroundStyle(.secondary)
                    }
                } else if viewModel.isAuthorized {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("Connected")
                            .foregroundStyle(.green)
                        Spacer()
                        Button("Disconnect") {
                            viewModel.disconnectGoogleCalendar()
                        }
                    }

                    if !viewModel.availableCalendars.isEmpty {
                        Section("Calendars") {
                            ForEach(viewModel.availableCalendars, id: \.id) { cal in
                                Toggle(cal.name, isOn: Binding(
                                    get: { viewModel.selectedCalendarIds.contains(cal.id) },
                                    set: { selected in
                                        if selected {
                                            viewModel.selectedCalendarIds.append(cal.id)
                                        } else {
                                            viewModel.selectedCalendarIds.removeAll { $0 == cal.id }
                                        }
                                    }
                                ))
                            }
                        }
                    }

                    Button("Refresh Calendars") {
                        Task { await viewModel.fetchAvailableCalendars() }
                    }
                } else {
                    Button("Connect Google Calendar") {
                        Task { await viewModel.authorizeGoogleCalendar() }
                    }
                    .disabled(
                        viewModel.googleCalendarClientId.isEmpty
                        || viewModel.googleCalendarClientSecret.isEmpty
                    )
                }

                if let error = viewModel.authError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .padding()
        }
    }

    private var foldersTab: some View {
        ScrollView {
        Form {
            Toggle("Enable Folder Watching", isOn: $viewModel.folderWatchingEnabled)

            if viewModel.folderWatchingEnabled {
                Toggle("Auto-delete files after processing", isOn: $viewModel.autoDeleteAfterProcessing)
                Text("Removes audio and image files from watched folders after they've been successfully captured as thoughts.")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Text("Restart Jarvis to apply folder watching changes")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            Section("Audio Folder") {
                HStack {
                    TextField("Path", text: $viewModel.audioFolderPath)
                    Button("Choose...") {
                        if let url = showFolderPicker() {
                            viewModel.audioFolderPath = url.path.replacingOccurrences(
                                of: NSHomeDirectory(), with: "~"
                            )
                        }
                    }
                }
                Text("Drop audio files here (.wav, .mp3, .m4a, .aiff) for auto-transcription")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Image Folder") {
                HStack {
                    TextField("Path", text: $viewModel.imageFolderPath)
                    Button("Choose...") {
                        if let url = showFolderPicker() {
                            viewModel.imageFolderPath = url.path.replacingOccurrences(
                                of: NSHomeDirectory(), with: "~"
                            )
                        }
                    }
                }
                Text("Drop images here (.jpg, .png, .gif, .webp) for AI description")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        }
    }

    private var cloudSyncTab: some View {
        Form {
            Toggle("Enable iCloud Sync", isOn: $viewModel.cloudSyncEnabled)

            if viewModel.cloudSyncEnabled {
                Picker("Sync every", selection: $viewModel.cloudSyncIntervalMinutes) {
                    Text("5 minutes").tag(5)
                    Text("10 minutes").tag(10)
                    Text("15 minutes").tag(15)
                    Text("30 minutes").tag(30)
                    Text("60 minutes").tag(60)
                }

                Text("Syncs thoughts across your Macs via iCloud")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text("Restart Jarvis to apply cloud sync changes")
                    .font(.caption)
                    .foregroundStyle(.orange)
            } else {
                Text("Enable to sync thoughts across your Macs via iCloud")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    private var insightsTab: some View {
        Form {
            Toggle("Enable Smart Suggestions", isOn: $viewModel.insightsEnabled)

            if viewModel.insightsEnabled {
                Stepper("Lookback Days: \(viewModel.insightsLookbackDays)", value: $viewModel.insightsLookbackDays, in: 1...30)
            }

            Text("AI analyzes your recent thoughts to surface patterns, connections, and action suggestions")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
    }

    private func showFolderPicker() -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        if panel.runModal() == .OK {
            return panel.url
        }
        return nil
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack {
            if let error = viewModel.saveError {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            } else if viewModel.showSaveSuccess {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Saved")
                    .font(.caption)
                    .foregroundStyle(.green)
            }

            Spacer()

            Button("Save") {
                viewModel.save()
            }
            .keyboardShortcut("s", modifiers: .command)
            .disabled(viewModel.isSaving)
        }
    }
}
