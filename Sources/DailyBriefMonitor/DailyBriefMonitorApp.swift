import SwiftUI
import JarvisCore

private struct PrintScheduleResponse: Decodable {
    let hour: Int
    let minute: Int
    let enabled: Bool
}

@main
struct DailyBriefMonitorApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var checker = StatusChecker()
    @State private var updater = UpdateService()
    @State private var scheduler: BriefScheduler?
    @State private var didConsumeHandoff = false
    @State private var watcherHasFailures = false
    @State private var watcherFailedFiles: [(url: URL, reason: String)] = []
    private let timer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(
                checker: checker,
                updater: updater,
                scheduler: scheduler,
                watcherFailedFiles: watcherFailedFiles,
                onCapture: { appDelegate.toggleCapture() }
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
                    checker.refresh()
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
                .task {
                    // Fetch schedule from API. Scheduler is already initialized with defaults by .onAppear.
                    // This task fires once at app launch. Silent fallback on any error.
                    guard let config = try? ConfigLoader.load() else { return }
                    guard let url = URL(string: "\(config.apiBaseUrl)/settings/print-schedule") else { return }
                    var req = URLRequest(url: url, timeoutInterval: 5)
                    req.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
                    guard let (data, resp) = try? await URLSession.shared.data(for: req),
                          let http = resp as? HTTPURLResponse,
                          http.statusCode == 200,
                          let decoded = try? JSONDecoder().decode(PrintScheduleResponse.self, from: data)
                    else { return }
                    await MainActor.run {
                        scheduler?.reschedule(hour: decoded.hour, minute: decoded.minute, enabled: decoded.enabled)
                    }
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
                } else if watcherHasFailures {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
            }
        }
    }
}
