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

                gmailTab
                    .tabItem { Label("Gmail", systemImage: "envelope") }

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
        .frame(width: 700, height: 500)
    }

    // MARK: - Tabs

    private var aiTab: some View {
        Form {
            SecureField("API Key", text: $viewModel.claudeApiKey)
            TextField("Model", text: $viewModel.claudeModel)
        }
        .padding()
    }

    private var gmailTab: some View {
        Form {
            TextField("Email", text: $viewModel.gmailEmail)
            SecureField("App Password", text: $viewModel.gmailAppPassword)
            TextField("Search Subject Pattern", text: $viewModel.gmailSearchSubjectPattern)
            Stepper("Lookback Days: \(viewModel.gmailLookbackDays)", value: $viewModel.gmailLookbackDays, in: 1...30)
        }
        .padding()
    }

    private var sportsTab: some View {
        Form {
            Picker("Team", selection: $viewModel.sportsSelectedTeamId) {
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
                Text("\(viewModel.sportsDivisionName) | \(viewModel.sportsLeagueName)")
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
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
