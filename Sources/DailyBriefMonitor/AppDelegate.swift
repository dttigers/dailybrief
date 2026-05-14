import AppKit
import Carbon
import SafariServices
import SwiftUI
import JarvisCore

private struct PrintScheduleResponse: Decodable {
    let hour: Int
    let minute: Int
    let enabled: Bool
}

private let kSafariExtensionBundleID = "io.vigilhub.extension.Extension"
private let kSafariNudgeShownKey = "vigil.safariExtensionNudgeShown"

/// Application delegate that initializes the JarvisCore data stack and manages the capture panel.
final class AppDelegate: NSObject, NSApplicationDelegate, @unchecked Sendable {

    private(set) var capturePanel: CapturePanel!
    private var captureService: CaptureService?
    private var triageService: (any TriageProviding)?
    private var thoughtStore: (any ThoughtRepository)?
    private var vigilAPIClient: VigilAPIClient?
    private var globalHotKey: GlobalHotKey?

    // Audio & image services
    private var transcriptionService: TranscriptionService?
    private var imageDescriptionService: (any ImageDescriptionProviding)?

    // Folder watcher (Phase 61)
    private(set) var folderWatcher: FolderWatcherService?

    // Scheduler + status checker — created at launch, exposed to the App struct
    let checker = StatusChecker()
    private(set) var scheduler: BriefScheduler?

    // Stored so the wake handler can re-fetch without reloading config
    private var scheduleAPIURL: URL?
    private var scheduleAPIKey: String?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSLog("DailyBriefMonitor: applicationDidFinishLaunching started")

        // Create transcription service (uses Apple SFSpeechRecognizer)
        let transcription = TranscriptionService()
        self.transcriptionService = transcription

        NSLog("DailyBriefMonitor: initializing data store...")
        do {
            let config = try ConfigLoader.load()

            // Create scheduler immediately with defaults, then fetch the real schedule from the API.
            // This happens at process launch — before any menu interaction — so the timer is correct
            // even if the user never opens the menu bar popover.
            let sched = BriefScheduler(checker: checker)
            self.scheduler = sched
            self.scheduleAPIURL = URL(string: "\(config.apiBaseUrl)/v1/settings/print-schedule")
            self.scheduleAPIKey = config.apiKey
            fetchAndApplySchedule()

            // Re-fetch on wake so a schedule change made while the Mac was sleeping takes effect
            // before the next print time — covers the "never logged off" case.
            NSWorkspace.shared.notificationCenter.addObserver(
                self,
                selector: #selector(handleSystemWake),
                name: NSWorkspace.didWakeNotification,
                object: nil
            )
            let client = VigilAPIClient(
                baseURL: URL(string: config.apiBaseUrl)!,
                apiKey: config.apiKey
            )
            self.vigilAPIClient = client

            // AI services — all API-backed
            NSLog("DailyBriefMonitor: loading API AI services...")
            self.triageService = APITriageService(client: client)
            self.imageDescriptionService = APIImageDescriptionService(client: client)

            // Thought store — API-backed
            let repository: any ThoughtRepository = APIThoughtStore(client: client)
            let thoughtStore = repository
            self.thoughtStore = thoughtStore

            let service = CaptureService(store: thoughtStore)
            captureService = service

            // Folder watcher — headless file feeder (Phase 61)
            if let imgService = self.imageDescriptionService as? APIImageDescriptionService {
                let watcher = FolderWatcherService(
                    imageService: imgService,
                    transcriptionService: transcription,
                    captureService: service,
                    triageService: self.triageService,
                    thoughtStore: thoughtStore,
                    config: config.folderWatching
                )
                self.folderWatcher = watcher
                Task { await watcher.start() }
            } else {
                NSLog("DailyBriefMonitor: folder watcher skipped — image service not available")
            }

            NSLog("DailyBriefMonitor: creating capture panel...")
            let panel = CapturePanel()
            panel.contentView = NSHostingView(
                rootView: CaptureView(
                    onCapture: { text in
                        let thought = try await service.captureText(text)
                        return thought
                    },
                    onTriage: self.triageService.map { triage in
                        return { thoughtId, content in
                            do {
                                let result = try await triage.triage(content)
                                if var thought = try await thoughtStore.fetch(id: thoughtId) {
                                    thought.category = result.category
                                    thought.confidence = result.confidence
                                    if result.category == .task && thought.taskStatus == nil {
                                        thought.taskStatus = .open
                                    }
                                    try await thoughtStore.update(thought)
                                }
                                return result
                            } catch {
                                NSLog("Triage failed: \(error.localizedDescription)")
                                return nil
                            }
                        }
                    },
                    onOverride: { thoughtId, category in
                        do {
                            if var thought = try await thoughtStore.fetch(id: thoughtId) {
                                thought.category = category
                                thought.confidence = 1.0
                                if category == .task && thought.taskStatus == nil {
                                    thought.taskStatus = .open
                                }
                                try await thoughtStore.update(thought)
                            }
                        } catch {
                            NSLog("Category override failed: \(error.localizedDescription)")
                        }
                    },
                    onDismiss: { [weak panel] in
                        panel?.hidePanel()
                    }
                )
            )
            capturePanel = panel
        } catch {
            // Log error but don't crash — capture button will be non-functional
            NSLog("DailyBriefMonitor: FATAL startup error: %@", error.localizedDescription)

            // Create panel anyway so toggle doesn't crash, but capture will fail
            let panel = CapturePanel()
            panel.contentView = NSHostingView(
                rootView: CaptureView(
                    onCapture: { _ in
                        throw CaptureError.emptyContent // Placeholder — config unavailable
                    },
                    onDismiss: { [weak panel] in
                        panel?.hidePanel()
                    }
                )
            )
            capturePanel = panel
        }

        registerGlobalHotKey()
        nudgeSafariExtensionOnce()
        NSLog("DailyBriefMonitor: startup complete")
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let watcher = folderWatcher {
            let semaphore = DispatchSemaphore(value: 0)
            Task {
                await watcher.stop()
                semaphore.signal()
            }
            semaphore.wait(timeout: .now() + 2)
        }
        globalHotKey?.unregister()
    }

    /// Toggles the floating capture panel.
    @MainActor
    func toggleCapture() {
        capturePanel?.toggle()
    }

    // MARK: - Private

    /// Opens Safari Settings → Extensions on first launch so the user can enable
    /// the embedded Vigil Capture web extension. The .appex ships inside
    /// DailyBriefMonitor.app/Contents/PlugIns/ but Safari won't surface it in
    /// Settings until the host app has run at least once. Gated by UserDefaults
    /// so subsequent launches don't re-pop the window.
    private func nudgeSafariExtensionOnce() {
        guard !UserDefaults.standard.bool(forKey: kSafariNudgeShownKey) else { return }
        UserDefaults.standard.set(true, forKey: kSafariNudgeShownKey)
        SFSafariApplication.showPreferencesForExtension(
            withIdentifier: kSafariExtensionBundleID
        ) { error in
            if let error {
                NSLog("DailyBriefMonitor: Safari extension nudge failed — %@", error.localizedDescription)
            }
        }
    }

    @objc private func handleSystemWake() {
        NSLog("DailyBriefMonitor: system wake — re-fetching print schedule")
        fetchAndApplySchedule()
    }

    private func fetchAndApplySchedule() {
        guard let url = scheduleAPIURL, let key = scheduleAPIKey, let sched = scheduler else { return }
        Task {
            var req = URLRequest(url: url, timeoutInterval: 5)
            req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
            guard let (data, resp) = try? await URLSession.shared.data(for: req),
                  let http = resp as? HTTPURLResponse,
                  http.statusCode == 200,
                  let decoded = try? JSONDecoder().decode(PrintScheduleResponse.self, from: data)
            else { return }
            await MainActor.run {
                sched.reschedule(hour: decoded.hour, minute: decoded.minute, enabled: decoded.enabled)
            }
            NSLog("DailyBriefMonitor: schedule applied — %02d:%02d enabled=%d", decoded.hour, decoded.minute, decoded.enabled ? 1 : 0)
        }
    }

    private func registerGlobalHotKey() {
        // kVK_ANSI_J = 0x26, Cmd+Shift
        let panel = capturePanel!
        let hotKey = GlobalHotKey(
            keyCode: 0x26,
            modifiers: GlobalHotKey.cmdShiftModifiers
        ) {
            Task { @MainActor in
                panel.toggle()
            }
        }
        hotKey.register()
        globalHotKey = hotKey
    }
}
