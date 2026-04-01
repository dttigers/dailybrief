import SwiftUI
import AppKit

struct MenuBarView: View {
    @Bindable var checker: StatusChecker
    var onCapture: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("DailyBrief")
                .font(.headline)

            Divider()

            // Status
            HStack {
                statusIcon
                VStack(alignment: .leading) {
                    Text("Last run")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(checker.lastRunTime)
                        .font(.caption)
                }
            }

            Divider()

            // Actions
            Button {
                onCapture()
            } label: {
                Label("Quick Capture", systemImage: "plus.bubble")
            }
            .keyboardShortcut("n", modifiers: .command)

            Button {
                if let path = checker.todaysPDFPath() ?? checker.latestPDFPath() {
                    NSWorkspace.shared.open(URL(fileURLWithPath: path))
                }
            } label: {
                Label("Open Latest PDF", systemImage: "doc.richtext")
            }
            .disabled(checker.todaysPDFPath() == nil && checker.latestPDFPath() == nil)

            Button {
                checker.runNow()
            } label: {
                if checker.isRunning {
                    Label("Running...", systemImage: "arrow.triangle.2.circlepath")
                } else {
                    Label("Run Now", systemImage: "play.fill")
                }
            }
            .disabled(checker.isRunning)

            Button {
                NSWorkspace.shared.open(URL(fileURLWithPath: checker.logFilePath))
            } label: {
                Label("View Log", systemImage: "text.page")
            }

            Button {
                NSWorkspace.shared.open(URL(fileURLWithPath: checker.configFilePath))
            } label: {
                Label("Open Config", systemImage: "gear")
            }

            Divider()

            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
        .padding(8)
    }

    @ViewBuilder
    private var statusIcon: some View {
        if checker.isRunning {
            Image(systemName: "arrow.triangle.2.circlepath")
                .foregroundStyle(.blue)
        } else if let success = checker.lastRunSuccess {
            Image(systemName: success ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .foregroundStyle(success ? .green : .red)
        } else {
            Image(systemName: "questionmark.circle")
                .foregroundStyle(.secondary)
        }
    }
}
