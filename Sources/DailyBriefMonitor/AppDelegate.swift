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
    private var dashboardWindow: NSWindow?
    private var settingsWindow: NSWindow?

    // Audio & image services
    private var transcriptionService: TranscriptionService?
    private var imageDescriptionService: (any ImageDescriptionProviding)?

    // Insights
    private var insightService: (any InsightProviding)?

    // Therapy classification
    private var therapyClassificationService: (any TherapyClassifyProviding)?

    // Therapy pattern detection & session prep
    private var therapyPatternService: (any TherapyPatternProviding)?
    private var therapyPrepService: (any TherapyPrepProviding)?

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
            self.insightService = APIInsightService(client: client)
            self.therapyClassificationService = APITherapyClassificationService(client: client)
            self.therapyPatternService = APITherapyPatternService(client: client)
            self.therapyPrepService = APITherapyPrepService(client: client)

            // Thought store — API-backed
            let repository: any ThoughtRepository = APIThoughtStore(client: client)
            let thoughtStore = repository
            self.thoughtStore = thoughtStore
            let service = CaptureService(store: thoughtStore)
            captureService = service

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
        globalHotKey?.unregister()
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
        let briefHistoryVM = vigilAPIClient.map { BriefHistoryViewModel(apiClient: $0) }
        let chatVM = vigilAPIClient.map { ChatViewModel(chatService: APIChatService(client: $0)) }
        let dashboardView = DashboardView(viewModel: viewModel, briefHistoryViewModel: briefHistoryVM, chatViewModel: chatVM)
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
