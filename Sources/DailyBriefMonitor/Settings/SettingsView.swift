import AppKit
import JarvisCore
import SwiftUI

/// Settings item for the sidebar list.
private enum SettingsPane: String, CaseIterable, Identifiable {
    case ai = "AI"
    case email = "Email / IMAP"
    case sports = "Sports"
    case pdf = "PDF"
    case printing = "Printing"
    case reminders = "Reminders"
    case calendar = "Calendar"
    case folders = "Folders"
    case cloudSync = "Cloud Sync"
    case insights = "Insights"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .ai: return "brain"
        case .email: return "envelope"
        case .sports: return "sportscourt"
        case .pdf: return "doc.richtext"
        case .printing: return "printer"
        case .reminders: return "checklist"
        case .calendar: return "calendar"
        case .folders: return "folder.badge.gearshape"
        case .cloudSync: return "icloud"
        case .insights: return "lightbulb"
        }
    }
}

struct SettingsView: View {
    @Bindable var viewModel: SettingsViewModel
    @State private var selectedPane: SettingsPane = .ai

    var body: some View {
        VStack(spacing: 0) {
            NavigationSplitView {
                List(SettingsPane.allCases, selection: $selectedPane) { pane in
                    Label(pane.rawValue, systemImage: pane.icon)
                        .tag(pane)
                }
                .navigationSplitViewColumnWidth(min: 140, ideal: 160, max: 200)
            } detail: {
                ScrollView {
                    detailContent
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            Divider()

            bottomBar
                .padding(12)
        }
        .frame(minWidth: 700, idealWidth: 750, minHeight: 450)
    }

    // MARK: - Detail Router

    @ViewBuilder
    private var detailContent: some View {
        switch selectedPane {
        case .ai: aiTab
        case .email: emailTab
        case .sports: sportsTab
        case .pdf: pdfTab
        case .printing: printingTab
        case .reminders: remindersTab
        case .calendar: calendarTab
        case .folders: foldersTab
        case .cloudSync: cloudSyncTab
        case .insights: insightsTab
        }
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

    private var sportsTab: some View {
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

    private var pdfTab: some View {
        Form {
            Section("Output") {
                TextField("Output Directory", text: $viewModel.pdfOutputDirectory)
                Stepper("Keep Days: \(viewModel.pdfKeepDays)", value: $viewModel.pdfKeepDays, in: 1...365)
            }

            Section("Paper Size") {
                Picker("Size", selection: $viewModel.pdfPaperSize) {
                    Text("Notebook (3.75\" × 7.5\")").tag("notebook")
                    Text("A5 (5.8\" × 8.3\")").tag("a5")
                    Text("Half Letter (5.5\" × 8.5\")").tag("half-letter")
                    Text("Full Letter (8.5\" × 11\")").tag("letter")
                    Text("Custom").tag("custom")
                }

                if viewModel.pdfPaperSize == "custom" {
                    HStack {
                        TextField("Width (inches)", value: $viewModel.pdfCustomWidthInches, format: .number)
                        Text("×")
                        TextField("Height (inches)", value: $viewModel.pdfCustomHeightInches, format: .number)
                    }
                }

                Text(paperSizeDescription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Layout") {
                HStack {
                    Text("Margins: \(Int(viewModel.pdfMarginPoints))pt")
                    Slider(value: $viewModel.pdfMarginPoints, in: 4...36, step: 2)
                }

                HStack {
                    Text("Font Scale: \(viewModel.pdfFontScale, specifier: "%.2f")×")
                    Slider(value: $viewModel.pdfFontScale, in: 0.75...1.5, step: 0.05)
                }

                Text("Font scale adjusts all text sizes proportionally")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Sections") {
                Toggle("Work Orders", isOn: sectionBinding("workOrders"))
                Toggle("To Do List", isOn: sectionBinding("todo"))
                Toggle("Calendar", isOn: sectionBinding("calendar"))
                Toggle("Sports", isOn: sectionBinding("sports"))
                Toggle("Affirmation", isOn: sectionBinding("affirmation"))
                Toggle("Captured Thoughts", isOn: sectionBinding("thoughts"))
                Toggle("AI Insights", isOn: sectionBinding("insights"))
                Toggle("Therapy Prep", isOn: sectionBinding("therapyPrep"))

                Text("Disabled sections are omitted from the PDF")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }

    private var paperSizeDescription: String {
        switch viewModel.pdfPaperSize {
        case "notebook": return "Prints on letter paper with centered 3.75\" × 7.5\" content area (trim to notebook size)"
        case "a5": return "Standard A5 paper (148mm × 210mm)"
        case "half-letter": return "Half US Letter (5.5\" × 8.5\")"
        case "letter": return "Full US Letter (8.5\" × 11\")"
        case "custom": return "Custom dimensions — content fills page minus margins"
        default: return ""
        }
    }

    private func sectionBinding(_ section: String) -> Binding<Bool> {
        Binding(
            get: { viewModel.pdfEnabledSections.contains(section) },
            set: { enabled in
                if enabled {
                    if !viewModel.pdfEnabledSections.contains(section) {
                        viewModel.pdfEnabledSections.append(section)
                    }
                } else {
                    viewModel.pdfEnabledSections.removeAll { $0 == section }
                }
            }
        )
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

    private var foldersTab: some View {
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
