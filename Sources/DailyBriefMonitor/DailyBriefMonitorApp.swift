import SwiftUI

@main
struct DailyBriefMonitorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var checker = StatusChecker()
    @State private var scheduler: BriefScheduler?
    private let timer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(checker: checker, scheduler: scheduler, onDashboard: { appDelegate.openDashboard() }, onCapture: { appDelegate.toggleCapture() }, onSettings: { appDelegate.openSettings() })
                .onAppear {
                    if scheduler == nil {
                        scheduler = BriefScheduler(checker: checker)
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
                } else if let success = checker.lastRunSuccess {
                    Image(systemName: success ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                }
            }
        }
    }
}
