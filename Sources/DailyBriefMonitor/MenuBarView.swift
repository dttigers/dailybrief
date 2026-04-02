import SwiftUI
import AppKit

struct MenuBarView: View {
    @Bindable var checker: StatusChecker
    var scheduler: BriefScheduler?
    var onDashboard: () -> Void
    var onCapture: () -> Void
    var onSettings: () -> Void

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
