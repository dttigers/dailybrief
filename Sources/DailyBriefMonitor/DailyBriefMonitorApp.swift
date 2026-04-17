import SwiftUI
import JarvisCore

@main
struct DailyBriefMonitorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var updater = UpdateService()
    @State private var didConsumeHandoff = false
    @State private var watcherHasFailures = false
    @State private var watcherFailedFiles: [(url: URL, reason: String)] = []
    private let timer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(
                checker: appDelegate.checker,
                updater: updater,
                scheduler: appDelegate.scheduler,
                watcherFailedFiles: watcherFailedFiles,
                onCapture: { appDelegate.toggleCapture() }
            )
                .onAppear {
                    // Consume handoff exactly once per process launch (Pitfall 4 — onAppear fires repeatedly)
                    if !didConsumeHandoff {
                        didConsumeHandoff = true
                        updater.consumeHandoff()
                    }
                    // Poll watcher state on menu open
                    Task {
                        if let watcher = appDelegate.folderWatcher {
                            let failures = await watcher.failedFiles
                            let hasF = await watcher.hasFailures
                            await MainActor.run {
                                watcherFailedFiles = failures
                                watcherHasFailures = hasF
                            }
                        }
                    }
                }
                .onReceive(timer) { _ in
                    appDelegate.checker.refresh()
                    // Poll watcher failure state (actor isolation requires async bridge)
                    Task {
                        if let watcher = appDelegate.folderWatcher {
                            let failures = await watcher.failedFiles
                            let hasF = await watcher.hasFailures
                            await MainActor.run {
                                watcherFailedFiles = failures
                                watcherHasFailures = hasF
                            }
                        }
                    }
                }
        } label: {
            HStack(spacing: 2) {
                Image(systemName: "doc.text")
                if appDelegate.checker.isRunning {
                    Image(systemName: "arrow.triangle.2.circlepath")
                } else if updater.isRunning {
                    // D-10: title-bar icon swap to rotating arrow.triangle.2.circlepath while updating
                    Image(systemName: "arrow.triangle.2.circlepath")
                } else if let success = appDelegate.checker.lastRunSuccess {
                    if success {
                        Image(systemName: "checkmark.circle.fill")
                    } else {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(.red)
                    }
                } else if watcherHasFailures {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
            }
        }
    }
}
