import AppKit
import Carbon
import SwiftUI
import JarvisCore

/// Application delegate that initializes the JarvisCore data stack and manages the capture panel.
final class AppDelegate: NSObject, NSApplicationDelegate, @unchecked Sendable {

    private(set) var capturePanel: CapturePanel!
    private var captureService: CaptureService?
    private var triageService: TriageService?
    private var thoughtStore: ThoughtStore?
    private var globalHotKey: GlobalHotKey?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Load config for AI credentials (optional — triage disabled without config)
        var triageService: TriageService?
        if let config = try? ConfigLoader.load() {
            triageService = TriageService(apiKey: config.ai.claudeApiKey, model: config.ai.claudeModel)
            self.triageService = triageService
        }

        do {
            let dbManager = try DatabaseManager()
            let thoughtStore = ThoughtStore(database: dbManager)
            self.thoughtStore = thoughtStore
            let service = CaptureService(store: thoughtStore)
            captureService = service

            let panel = CapturePanel()
            panel.contentView = NSHostingView(
                rootView: CaptureView(
                    onCapture: { text in
                        return try await service.captureText(text)
                    },
                    onTriage: triageService.map { triage in
                        return { content in
                            do {
                                let result = try await triage.triage(content)
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
            NSLog("Failed to initialize JarvisCore database: \(error.localizedDescription)")

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
    }

    func applicationWillTerminate(_ notification: Notification) {
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
