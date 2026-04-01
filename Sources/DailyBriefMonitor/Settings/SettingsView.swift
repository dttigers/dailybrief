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
            }

            Divider()

            bottomBar
                .padding(12)
        }
        .frame(width: 500, height: 400)
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
            Stepper("Team ID: \(viewModel.sportsTeamId)", value: $viewModel.sportsTeamId, in: 1...999)
            Stepper("Division ID: \(viewModel.sportsDivisionId)", value: $viewModel.sportsDivisionId, in: 1...999)
            Stepper("League ID: \(viewModel.sportsLeagueId)", value: $viewModel.sportsLeagueId, in: 1...999)
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
