//
//  AppDelegate.swift
//  Vigil Capture
//
//  Created by Jameson Morrill on 4/14/26.
//

import Cocoa
import ServiceManagement
import os.log

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    // D-05: UserDefaults key for one-time first-launch NSAlert.
    // Reverse-DNS namespaced to the container bundle ID per Claude's Discretion.
    private let firstLaunchAlertKey = "io.vigilhub.extension.firstLaunchAlertShown"

    func applicationDidFinishLaunching(_ notification: Notification) {
        registerLoginItemIfNeeded()
        showFirstLaunchAlertIfNeeded()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    // MARK: - SMAppService (D-02, D-03)

    /// Status-guarded login-item registration.
    /// Per D-03 and RESEARCH Pitfall 1: gate `SMAppService.mainApp.register()` on
    /// `SMAppService.mainApp.status` — only call register() when status is NOT .enabled,
    /// and never re-register on .requiresApproval (user explicitly toggled off).
    private func registerLoginItemIfNeeded() {
        let service = SMAppService.mainApp

        switch service.status {
        case .enabled:
            os_log("Login item already enabled; skipping register().", type: .info)
        case .notRegistered, .notFound:
            do {
                try SMAppService.mainApp.register()
                os_log("Login item registered.", type: .info)
            } catch {
                os_log("Login item register() failed: %{public}@",
                       type: .error, String(describing: error))
            }
        case .requiresApproval:
            os_log("Login item requires user approval in System Settings.", type: .info)
        @unknown default:
            os_log("Login item status unknown (new OS case).", type: .error)
        }
    }

    // MARK: - First-launch NSAlert (D-05)

    /// One-time informational alert on the very first launch after install.
    /// LSUIElement apps (accessory activation policy) must explicitly activate
    /// before showing a modal — without it, the alert can appear behind other
    /// windows or fail to accept keyboard focus. See RESEARCH §Pitfall 3.
    private func showFirstLaunchAlertIfNeeded() {
        guard !UserDefaults.standard.bool(forKey: firstLaunchAlertKey) else { return }

        // Pitfall 3: accessory-mode apps don't auto-activate; NSAlert needs explicit activation.
        // API is deprecated in Sonoma 14+ but still functional; new NSApp.activate() is 14+ only.
        NSApp.activate(ignoringOtherApps: true)

        let alert = NSAlert()
        alert.messageText = "Vigil Capture is installed."
        alert.informativeText = "The extension will stay enabled across reboots. You may also see a macOS notification confirming Vigil Capture was added to Login Items."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()

        UserDefaults.standard.set(true, forKey: firstLaunchAlertKey)
    }
}
