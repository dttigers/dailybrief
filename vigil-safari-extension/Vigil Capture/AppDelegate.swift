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

    // MARK: - First-launch NSAlert (D-05) — body added in Task 2

    private func showFirstLaunchAlertIfNeeded() {
        // Implemented in Task 2 of this plan.
    }
}
