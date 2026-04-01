import SwiftUI

@main
struct DailyBriefMonitorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var checker = StatusChecker()
    private let timer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(checker: checker, onCapture: { appDelegate.toggleCapture() })
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
