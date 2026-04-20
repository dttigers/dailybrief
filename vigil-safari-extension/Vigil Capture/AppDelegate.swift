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
        suppressStoryboardWindows()
        registerLoginItemIfNeeded()
        showFirstLaunchAlertIfNeeded()
    }

    // MARK: - Window reveal gating (gap_107_1 fix)

    /// Gates ViewController.webView(_:didFinish:)'s call to makeKeyAndOrderFront.
    /// Set to true by either (a) application(_:open:) firing during launch
    /// (Safari-prefs opportunistic signal) or (b) suppressStoryboardWindows()'s
    /// uptime/alert heuristic. Default false — Login Item boot launches and
    /// first-install launches keep the window hidden forever (D-01 compliance).
    var shouldRevealWindow: Bool = false

    /// NSApplicationDelegate inbound-open hook. Safari's
    /// SFSafariApplication.showPreferencesForExtension MAY route through this path
    /// on some macOS versions (documented as best-effort — see 107-05-PLAN §research_note).
    /// Any inbound URL/Apple Event during launch flips the reveal gate.
    func application(_ application: NSApplication, open urls: [URL]) {
        shouldRevealWindow = true
        os_log("application(_:open:) fired with %d url(s); shouldRevealWindow=true",
               type: .info, urls.count)
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

    // MARK: - Window suppression (gap_107_1 fix)

    /// Closes gap_107_1: LSUIElement=true (Plan 107-01) suppresses the Dock icon
    /// and menu bar but NOT storyboard-instantiated windows. Main.storyboard's
    /// initial Window Controller (B8D-0N-5wS) loads its window on every launch.
    ///
    /// Strategy (see 107-05-PLAN §research_note):
    /// 1. orderOut all windows unconditionally — silence first-launch AND boot paths.
    /// 2. Gate shouldRevealWindow on launch-source heuristic:
    ///    - systemUptime < 120s → Login Item boot launch → stay hidden forever.
    ///    - firstLaunchAlertShown == false → first install launch → NSAlert only.
    ///    - systemUptime >= 120s AND alertShown == true → user-initiated launch
    ///      (Safari-prefs click or manual double-click) → allow re-show in
    ///      ViewController.webView(_:didFinish:) (D-04 preservation).
    /// 3. application(_:open:) can OVERRIDE the gate to true if Safari delivers
    ///    an inbound URL/Apple Event (opportunistic override for within-120s clicks).
    ///
    /// Per RESEARCH Pitfall 2, storyboard stays intact — ViewController
    /// instantiates, WKWebView loads, D-04 pill still renders on gated paths.
    private func suppressStoryboardWindows() {
        NSApp.windows.forEach { $0.orderOut(nil) }

        let uptime = ProcessInfo.processInfo.systemUptime
        let alertAlreadyShown = UserDefaults.standard.bool(forKey: firstLaunchAlertKey)
        if uptime >= 120 && alertAlreadyShown {
            shouldRevealWindow = true
            os_log("suppressStoryboardWindows: uptime=%.0fs, alertShown=true, revealGate=OPEN",
                   type: .info, uptime)
        } else {
            // Leave shouldRevealWindow at its default false. application(_:open:)
            // may later override to true if Safari delivers an Apple Event.
            os_log("suppressStoryboardWindows: uptime=%.0fs, alertShown=%d, revealGate=CLOSED",
                   type: .info, uptime, alertAlreadyShown ? 1 : 0)
        }
    }
}
