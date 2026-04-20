//
//  ViewController.swift
//  Vigil Capture
//
//  Created by Jameson Morrill on 4/14/26.
//

import Cocoa
import SafariServices
import WebKit
import ServiceManagement
import os.log

let extensionBundleIdentifier = "io.vigilhub.extension.Extension"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show(\(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show(\(state.isEnabled), false)")
                }
                // D-04: push live SMAppService persistence status to the pill.
                let persistence = self.persistenceStateString()
                webView.evaluateJavaScript("showPersistence('\(persistence)')")
                // gap_107_1: AppDelegate.suppressStoryboardWindows() orders the
                // storyboard window out unconditionally at launch. Re-show ONLY
                // when the launch-source heuristic says this is user-initiated
                // (Safari-prefs click or post-boot manual open). Login Item boot
                // launches and first-install launches keep shouldRevealWindow
                // at its default false — window stays hidden (D-01 compliance).
                if let delegate = NSApp.delegate as? AppDelegate, delegate.shouldRevealWindow {
                    webView.window?.makeKeyAndOrderFront(nil)
                    os_log("ViewController: shouldRevealWindow=true, window surfaced",
                           type: .info)
                }
            }
        }
    }

    /// Maps the live SMAppService.mainApp.status to one of four pill state strings
    /// that Script.js's showPersistence() understands.
    private func persistenceStateString() -> String {
        switch SMAppService.mainApp.status {
        case .enabled:
            return "enabled"
        case .notRegistered, .notFound:
            return "not-registered"
        case .requiresApproval:
            return "requires-approval"
        @unknown default:
            return "failed"
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if (message.body as! String != "open-preferences") {
            return;
        }

        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
        }
    }

}
