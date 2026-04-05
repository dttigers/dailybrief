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
    private var localThoughtStore: ThoughtStore?  // Concrete store for sync-only operations
    private var globalHotKey: GlobalHotKey?
    private var dashboardWindow: NSWindow?
    private var settingsWindow: NSWindow?

    // Audio & image services
    private var transcriptionService: TranscriptionService?
    private var imageDescriptionService: (any ImageDescriptionProviding)?

    // Folder watching
    private var folderWatcher: FolderWatcherService?

    // Insights
    private var insightService: (any InsightProviding)?

    // Therapy classification
    private var therapyClassificationService: (any TherapyClassifyProviding)?

    // Therapy pattern detection & session prep
    private var therapyPatternService: (any TherapyPatternProviding)?
    private var therapyPrepService: (any TherapyPrepProviding)?

    // Cloud sync
    private var syncService: SyncService?
    private var syncTimer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSLog("DailyBriefMonitor: applicationDidFinishLaunching started")

        // Create transcription service (uses Apple SFSpeechRecognizer)
        let transcription = TranscriptionService()
        self.transcriptionService = transcription

        NSLog("DailyBriefMonitor: initializing data store...")
        do {
            // Check if Vigil API mode is enabled
            let useVigilAPI = (try? ConfigLoader.load())?.vigil?.useAPI == true
            let apiBaseURL = (try? ConfigLoader.load())?.vigil?.apiBaseURL ?? "http://localhost:3001/v1"

            // Load AI services — API-backed or local Claude depending on config
            NSLog("DailyBriefMonitor: loading AI services...")
            var concreteTriageService: TriageService?
            var concreteImageDescService: ImageDescriptionService?
            var concreteTherapyClassService: TherapyClassificationService?

            if useVigilAPI {
                NSLog("DailyBriefMonitor: using Vigil API AI services")
                let client = VigilAPIClient(baseURL: URL(string: apiBaseURL)!)
                self.triageService = APITriageService(client: client)
                self.imageDescriptionService = APIImageDescriptionService(client: client)
                self.insightService = APIInsightService(client: client)
                self.therapyClassificationService = APITherapyClassificationService(client: client)
                self.therapyPatternService = APITherapyPatternService(client: client)
                self.therapyPrepService = APITherapyPrepService(client: client)
            } else if let config = try? ConfigLoader.load() {
                NSLog("DailyBriefMonitor: using local Claude AI services")
                let localTriage = TriageService(apiKey: config.ai.claudeApiKey, model: config.ai.claudeModel)
                concreteTriageService = localTriage
                self.triageService = localTriage

                let localImageDesc = ImageDescriptionService(apiKey: config.ai.claudeApiKey, model: config.ai.claudeModel)
                concreteImageDescService = localImageDesc
                self.imageDescriptionService = localImageDesc

                self.insightService = InsightService(apiKey: config.ai.claudeApiKey, model: config.ai.claudeModel)

                let localTherapyClass = TherapyClassificationService(apiKey: config.ai.claudeApiKey, model: config.ai.claudeModel)
                concreteTherapyClassService = localTherapyClass
                self.therapyClassificationService = localTherapyClass

                self.therapyPatternService = TherapyPatternService(apiKey: config.ai.claudeApiKey, model: config.ai.claudeModel)
                self.therapyPrepService = TherapyPrepService(apiKey: config.ai.claudeApiKey, model: config.ai.claudeModel)
            }

            let repository: any ThoughtRepository
            let localStore: ThoughtStore?

            if useVigilAPI {
                NSLog("DailyBriefMonitor: using Vigil API backend at %@", apiBaseURL)
                let client = VigilAPIClient(baseURL: URL(string: apiBaseURL)!)
                repository = APIThoughtStore(client: client)
                localStore = nil
            } else {
                NSLog("DailyBriefMonitor: using local GRDB backend")
                let dbManager = try DatabaseManager()
                let store = ThoughtStore(database: dbManager)
                repository = store
                localStore = store
            }

            let thoughtStore = repository
            self.thoughtStore = thoughtStore
            self.localThoughtStore = localStore
            let service = CaptureService(store: thoughtStore)
            captureService = service

            NSLog("DailyBriefMonitor: creating capture panel...")
            let panel = CapturePanel()
            panel.contentView = NSHostingView(
                rootView: CaptureView(
                    onCapture: { [weak self] text in
                        let thought = try await service.captureText(text)
                        // Trigger sync after capture (non-blocking)
                        if let syncService = self?.syncService {
                            Task { try? await syncService.sync() }
                        }
                        return thought
                    },
                    onTriage: self.triageService.map { triage in
                        return { [weak self] thoughtId, content in
                            do {
                                let result = try await triage.triage(content)
                                if var thought = try await thoughtStore.fetch(id: thoughtId) {
                                    thought.category = result.category
                                    thought.confidence = result.confidence
                                    if result.category == .task && thought.taskStatus == nil {
                                        thought.taskStatus = .open
                                    }
                                    try await thoughtStore.update(thought)
                                    // Trigger sync after triage (non-blocking)
                                    if let syncService = self?.syncService {
                                        Task { try? await syncService.sync() }
                                    }
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

            // Start folder watcher if enabled
            NSLog("DailyBriefMonitor: checking folder watcher config...")
            do {
                let fwConfig = try ConfigLoader.load()
                NSLog("DailyBriefMonitor: folder watcher enabled=%d, autoDelete=%d, audio=%@, image=%@",
                      fwConfig.folderWatching.enabled ? 1 : 0,
                      fwConfig.folderWatching.autoDeleteAfterProcessing ? 1 : 0,
                      fwConfig.folderWatching.audioFolderPath,
                      fwConfig.folderWatching.imageFolderPath)
            } catch {
                NSLog("DailyBriefMonitor: config load failed: %@", error.localizedDescription)
            }
            if let config = try? ConfigLoader.load(), config.folderWatching.enabled, let localStore {
                let watcher = FolderWatcherService(
                    transcriptionService: transcription,
                    imageDescriptionService: concreteImageDescService,
                    captureService: service,
                    triageService: concreteTriageService,
                    therapyClassificationService: concreteTherapyClassService,
                    thoughtStore: localStore,
                    config: config.folderWatching
                )
                self.folderWatcher = watcher
                Task { await watcher.start() }
            }

            // Start cloud sync if enabled (only in local GRDB mode)
            NSLog("DailyBriefMonitor: checking cloud sync config...")
            if let config = try? ConfigLoader.load(), config.cloudSync.enabled, CloudKitManager.isAvailable, let localStore {
                let cloudKitManager = CloudKitManager()
                let syncService = SyncService(cloudKit: cloudKitManager, store: localStore)
                self.syncService = syncService
                Task { try? await syncService.sync() }
                let interval = TimeInterval(config.cloudSync.autoSyncIntervalMinutes * 60)
                syncTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
                    guard let syncService = self?.syncService else { return }
                    Task { try? await syncService.sync() }
                }
            }
        } catch {
            // Log error but don't crash — capture button will be non-functional
            NSLog("DailyBriefMonitor: FATAL startup error: %@", error.localizedDescription)

            // Create panel anyway so toggle doesn't crash, but capture will fail
            let panel = CapturePanel()
            panel.contentView = NSHostingView(
                rootView: CaptureView(
                    onCapture: { _ in
                        throw CaptureError.emptyContent // Placeholder — DB unavailable
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
        globalHotKey?.unregister()
        if let watcher = folderWatcher {
            Task { await watcher.stop() }
        }
        syncTimer?.invalidate()
        if let syncService {
            Task { try? await syncService.sync() }
        }
    }

    /// Toggles the floating capture panel.
    @MainActor
    func toggleCapture() {
        capturePanel?.toggle()
    }

    /// Opens (or brings to front) the central dashboard window.
    @MainActor
    func openDashboard() {
        // Bring existing window to front if visible
        if let window = dashboardWindow, window.isVisible {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        guard let store = thoughtStore else {
            let alert = NSAlert()
            alert.messageText = "Dashboard Unavailable"
            alert.informativeText = "The database failed to initialize. Please check logs and restart."
            alert.alertStyle = .warning
            alert.runModal()
            return
        }

        let viewModel = DashboardViewModel(
            store: store,
            captureService: captureService,
            transcriptionService: transcriptionService,
            imageDescriptionService: imageDescriptionService,
            triageService: triageService,
            insightService: insightService,
            therapyClassificationService: therapyClassificationService,
            therapyPatternService: therapyPatternService,
            therapyPrepService: therapyPrepService
        )
        let dashboardView = DashboardView(viewModel: viewModel)
        let hostingView = NSHostingView(rootView: dashboardView)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Jarvis Dashboard"
        window.contentView = hostingView
        window.minSize = NSSize(width: 600, height: 400)
        window.center()
        window.isReleasedWhenClosed = false

        // MenuBarExtra apps are accessory-type by default — promote to regular
        // so the window can accept keyboard focus (search field, etc.)
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        dashboardWindow = window
    }

    /// Opens (or brings to front) the settings window.
    @MainActor
    func openSettings() {
        if let window = settingsWindow, window.isVisible {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let viewModel = SettingsViewModel()
        let settingsView = SettingsView(viewModel: viewModel)
        let hostingView = NSHostingView(rootView: settingsView)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 750, height: 500),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Jarvis Settings"
        window.contentView = hostingView
        window.center()
        window.isReleasedWhenClosed = false

        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        settingsWindow = window
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
