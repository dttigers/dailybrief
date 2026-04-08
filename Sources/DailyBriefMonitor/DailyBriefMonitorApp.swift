import SwiftUI

@main
struct DailyBriefMonitorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var checker = StatusChecker()
    @State private var updater = UpdateService()
    @State private var scheduler: BriefScheduler?
    @State private var didConsumeHandoff = false
    private let timer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(
                checker: checker,
                updater: updater,
                scheduler: scheduler,
                onDashboard: { appDelegate.openDashboard() },
                onCapture: { appDelegate.toggleCapture() },
                onSettings: { appDelegate.openSettings() }
            )
                .onAppear {
                    if scheduler == nil {
                        scheduler = BriefScheduler(checker: checker)
                    }
                    // Consume handoff exactly once per process launch (Pitfall 4 — onAppear fires repeatedly)
                    if !didConsumeHandoff {
                        didConsumeHandoff = true
                        updater.consumeHandoff()
                    }
                }
                .onReceive(timer) { _ in
                    checker.refresh()
                }
        } label: {
            HStack(spacing: 2) {
                Image(systemName: "doc.text")
                if checker.isRunning {
                    Image(systemName: "arrow.triangle.2.circlepath")
                } else if updater.isRunning {
                    // D-10: title-bar icon swap to rotating arrow.triangle.2.circlepath while updating
                    Image(systemName: "arrow.triangle.2.circlepath")
                } else if let success = checker.lastRunSuccess {
                    Image(systemName: success ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                }
            }
        }
    }
}
