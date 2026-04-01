import Carbon
import AppKit

/// Wraps Carbon's `RegisterEventHotKey` / `UnregisterEventHotKey` for system-wide
/// keyboard shortcut registration. Does NOT require Accessibility permissions.
final class GlobalHotKey: @unchecked Sendable {

    /// Carbon modifier flags for Cmd+Shift.
    static let cmdShiftModifiers: UInt32 = UInt32(cmdKey | shiftKey)

    private let keyCode: UInt32
    private let modifiers: UInt32
    fileprivate let callback: () -> Void

    private var hotKeyRef: EventHotKeyRef?
    private var eventHandler: EventHandlerRef?

    /// Creates a global hotkey binding.
    /// - Parameters:
    ///   - keyCode: Carbon virtual key code (e.g. `0x26` for J).
    ///   - modifiers: Carbon modifier mask (e.g. `cmdKey | shiftKey`).
    ///   - callback: Closure invoked on the main queue when the hotkey fires.
    init(keyCode: UInt32, modifiers: UInt32, callback: @escaping () -> Void) {
        self.keyCode = keyCode
        self.modifiers = modifiers
        self.callback = callback
    }

    deinit {
        unregister()
    }

    // MARK: - Registration

    /// Registers the hotkey with the Carbon event system.
    func register() {
        guard hotKeyRef == nil else { return }

        // "JRVS" as OSType signature
        let signature: FourCharCode = {
            let chars: [UInt8] = [0x4A, 0x52, 0x56, 0x53] // J, R, V, S
            return FourCharCode(chars[0]) << 24
                 | FourCharCode(chars[1]) << 16
                 | FourCharCode(chars[2]) << 8
                 | FourCharCode(chars[3])
        }()

        let hotKeyID = EventHotKeyID(signature: signature, id: 1)

        var eventSpec = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )

        let selfPtr = Unmanaged<GlobalHotKey>.passUnretained(self).toOpaque()

        InstallEventHandler(
            GetApplicationEventTarget(),
            hotKeyHandler,
            1,
            &eventSpec,
            selfPtr,
            &eventHandler
        )

        RegisterEventHotKey(
            keyCode,
            modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )
    }

    /// Unregisters the hotkey and removes the event handler.
    func unregister() {
        if let ref = hotKeyRef {
            UnregisterEventHotKey(ref)
            hotKeyRef = nil
        }
        if let handler = eventHandler {
            RemoveEventHandler(handler)
            eventHandler = nil
        }
    }
}

// MARK: - Carbon Event Handler (C function pointer)

/// Top-level C-compatible handler invoked by Carbon when the registered hotkey fires.
private func hotKeyHandler(
    nextHandler: EventHandlerCallRef?,
    event: EventRef?,
    userData: UnsafeMutableRawPointer?
) -> OSStatus {
    guard let userData else { return OSStatus(eventNotHandledErr) }
    let hotKey = Unmanaged<GlobalHotKey>.fromOpaque(userData).takeUnretainedValue()
    DispatchQueue.main.async {
        hotKey.callback()
    }
    return noErr
}
