import AppKit

/// A floating NSPanel for quick thought capture — stays above other windows.
final class CapturePanel: NSPanel {

    override init(
        contentRect: NSRect,
        styleMask style: NSWindow.StyleMask,
        backing backingStoreType: NSWindow.BackingStoreType,
        defer flag: Bool
    ) {
        super.init(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        isFloatingPanel = true
        level = .floating
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
        isMovableByWindowBackground = true
        backgroundColor = .windowBackgroundColor
        isReleasedWhenClosed = false
        hidesOnDeactivate = false
        becomesKeyOnlyIfNeeded = false
    }

    /// Creates a CapturePanel with the standard capture size.
    convenience init() {
        self.init(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 160),
            styleMask: [],
            backing: .buffered,
            defer: false
        )
    }

    // MARK: - Public API

    /// Toggles the panel: closes if visible and key, otherwise shows centered.
    func toggle() {
        if isVisible, isKeyWindow {
            close()
        } else {
            showPanel()
        }
    }

    /// Shows the panel centered on screen and activates the app.
    func showPanel() {
        center()
        makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Hides the panel.
    func hidePanel() {
        close()
    }

    // MARK: - Key Handling

    override var canBecomeKey: Bool { true }
}
