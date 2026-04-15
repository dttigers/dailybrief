import AppKit
import Carbon
import SwiftUI
import JarvisCore

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

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSLog("DailyBriefMonitor: applicationDidFinishLaunching started")

        // Create transcription service (uses Apple SFSpeechRecognizer)
        let transcription = TranscriptionService()
        self.transcriptionService = transcription

        NSLog("DailyBriefMonitor: initializing data store...")
        do {
            let config = try ConfigLoader.load()
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
