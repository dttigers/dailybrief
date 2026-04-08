import SwiftUI
import AppKit

struct MenuBarView: View {
    @Bindable var checker: StatusChecker
    @Bindable var updater: UpdateService
    var scheduler: BriefScheduler?
    var onDashboard: () -> Void
    var onCapture: () -> Void
    var onSettings: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("DailyBrief")
                .font(.headline)

            Divider()

            // Update status row (D-10: status row at top of dropdown)
            HStack {
                updateStatusIcon
                VStack(alignment: .leading) {
                    Text("Update")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(updateStatusText)
                        .font(.caption)
                }
            }

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

            // Schedule info
            if let scheduler = scheduler {
                HStack {
                    Image(systemName: "clock")
                        .foregroundStyle(.secondary)
                    if scheduler.isScheduleEnabled, let nextRun = scheduler.nextRunTime {
                        Text(formatNextRunTime(nextRun))
                            .font(.caption)
                    } else {
                        Text("Schedule: Off")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Divider()

            // Actions
            Button {
                onDashboard()
            } label: {
                Label("Dashboard", systemImage: "rectangle.grid.1x2")
            }
            .keyboardShortcut("d", modifiers: .command)

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

            // Update Vigil button (D-10 — mirrors Run Now exactly)
            Button {
                updater.updateNow()
            } label: {
                Label(updateButtonLabel, systemImage: updateButtonIcon)
            }
            .disabled(updater.isRunning)

            // Failure tail + Open Full Log (D-12)
            if case .failed(let tail) = updater.status {
                Text(tail)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.red)
                    .lineLimit(20)
                    .textSelection(.enabled)
                    .padding(4)
                    .background(Color.red.opacity(0.08))
                Button {
                    NSWorkspace.shared.open(URL(fileURLWithPath: updater.logFilePath))
                } label: {
                    Label("Open Full Log", systemImage: "doc.text.magnifyingglass")
                }
            }

            Button {
                NSWorkspace.shared.open(URL(fileURLWithPath: checker.logFilePath))
            } label: {
                Label("View Log", systemImage: "text.page")
            }

            Button {
                onSettings()
            } label: {
                Label("Settings", systemImage: "gear")
            }

            Divider()

            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
            .keyboardShortcut("q")
        }
        .padding(8)
    }

    // Update button label cycling (D-10)
    private var updateButtonLabel: String {
        switch updater.status {
        case .idle: return "Update Vigil"
        case .running: return "Updating…"
        case .upToDate: return "✓ Up to date"
        case .updated(let sha): return "✓ Updated to \(sha)"
        case .failed: return "✗ Build failed"
        }
    }

    private var updateButtonIcon: String {
        updater.isRunning ? "arrow.triangle.2.circlepath" : "arrow.down.circle"
    }

    // Update status row text + icon
    private var updateStatusText: String {
        switch updater.status {
        case .idle: return "Idle"
        case .running: return "Updating…"
        case .upToDate: return "Up to date"
        case .updated(let sha): return "Installed: \(sha)"
        case .failed: return "Last attempt failed"
        }
    }

    @ViewBuilder
    private var updateStatusIcon: some View {
        switch updater.status {
        case .running:
            Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(.blue)
        case .upToDate, .updated:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed:
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.red)
        case .idle:
            Image(systemName: "arrow.down.circle").foregroundStyle(.secondary)
        }
    }

    private func formatNextRunTime(_ date: Date) -> String {
        let calendar = Calendar.current
        let timeFormatter = DateFormatter()
        timeFormatter.timeStyle = .short
        timeFormatter.dateStyle = .none

        let timeString = timeFormatter.string(from: date)

        if calendar.isDateInToday(date) {
            return "Next brief: \(timeString)"
        } else if calendar.isDateInTomorrow(date) {
            return "Next brief: Tomorrow \(timeString)"
        } else {
            let dateFormatter = DateFormatter()
            dateFormatter.dateStyle = .short
            dateFormatter.timeStyle = .short
            return "Next brief: \(dateFormatter.string(from: date))"
        }
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
