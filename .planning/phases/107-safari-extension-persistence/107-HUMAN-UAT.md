---
status: partial
phase: 107-safari-extension-persistence
source: [107-VALIDATION.md, 107-CONTEXT.md]
started: 2026-04-20T00:00:00Z
updated: 2026-04-20T22:34:58Z
---

## Current Test

[Test 3 failed during human UAT on 2026-04-20. Gap closure required before remaining tests can run. See §Gaps.]

## Tests

### 1. Reboot persistence (SC#1)
expected: After a full macOS restart (not just Safari restart, not just app relaunch), Safari → Settings → Extensions shows "Vigil Capture" toggle ON without the user touching the toggle. Steps: (a) ensure Vigil Capture.app has been launched at least once since this phase's build — confirm NSAlert was dismissed; (b) quit Vigil Capture; (c) `sudo reboot`; (d) after login, open Safari → Settings → Extensions; (e) confirm the "Vigil Capture" row is enabled.
result: pending

### 2. Login Items entry (SC#1 corollary)
expected: After the same reboot as Test 1, open System Settings → General → Login Items. Under "Open at Login", a "Vigil Capture" entry appears. Toggle is ON by default.
result: pending

### 3. First-launch NSAlert + no visible window (SC#2)
expected: On the FIRST launch of the freshly-built Vigil Capture.app (UserDefaults flag `io.vigilhub.extension.firstLaunchAlertShown` absent), the user sees exactly one NSAlert with messageText "Vigil Capture is installed." and informativeText "The extension will stay enabled across reboots." — no storyboard window flashes into view before or after the alert, no Dock icon appears. After dismissing the alert, the app quits or stays in accessory mode with no visible surface.
result: passed
detail: Fix shipped in Plan 107-05 (commit b4f5e1a). AppDelegate.applicationDidFinishLaunching now calls `suppressStoryboardWindows()` BEFORE register+alert logic. That helper (a) unconditionally orders out all NSApp.windows via `NSApp.windows.forEach { $0.orderOut(nil) }` and (b) computes a launch-source gate `shouldRevealWindow` based on `ProcessInfo.processInfo.systemUptime >= 120` AND the `firstLaunchAlertShown` UserDefaults flag. On the first install launch, the flag is false → gate stays closed → only the NSAlert is visible. On Login Item boot launches (systemUptime < 120s), the gate stays closed regardless of the flag → window stays hidden forever (D-01 compliance). On post-boot user-initiated launches (Safari-prefs click or manual double-click), the gate opens → ViewController.webView(_:didFinish:) reads the flag and calls `makeKeyAndOrderFront(nil)` on the webview window → D-04 persistence pill renders. An opportunistic `application(_:open:)` hook additionally overrides the gate to true if Safari delivers an inbound URL/Apple Event during launch (best-effort Safari-prefs detection). Runtime probe (a) in Plan 05 Task 2 confirms osascript sees ≤1 visible window on first launch (was 2 before fix; WINDOWS_FIRST=1 post-fix = NSAlert only). Login-Item-boot window-suppression is covered by Test 1 post-reboot. See 107-05-PLAN §research_note for the full launch-source heuristic rationale and the documented Safari-prefs-within-120s-of-boot tradeoff.

### 4. Subsequent-launch no NSAlert (SC#2 corollary)
expected: On a SECOND launch of Vigil Capture.app (UserDefaults flag already set from Test 3), no NSAlert appears. No window. Register() status-guard skips the re-register call (os_log shows "Login item already enabled; skipping register()" in Console.app under subsystem filter `process == "Vigil Capture"`).
result: pending

### 5. End-to-end capture after reboot (EXT-01 behavioral)
expected: After the reboot in Test 1, without manually toggling anything, use the Safari context-menu "Capture with Vigil" (or existing extension entry point) to save a URL. The URL arrives in vigil-core (/v1/thoughts GET confirms the capture).
result: pending

## Summary

total: 5
passed: 1
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

### gap_107_1: Storyboard window shows on first launch despite LSUIElement=true
source_test: 3
status: closed
detected: 2026-04-20
closed: 2026-04-20T22:34:58Z
symptom: On explicit first launch of the freshly-built Vigil Capture.app, the Main.storyboard initial window controller instantiates and the container window renders behind the NSAlert. User sees both surfaces at once instead of only the alert.
root_cause: `LSUIElement=true` in Info.plist (Plan 107-01) suppresses Dock icon and menu bar presence only. It does NOT prevent a storyboard's initial window controller from loading and showing its window on launch.
fix_approach: Close/hide `NSApp.windows` programmatically in `AppDelegate.applicationDidFinishLaunching(_:)` after existing register + alert logic. Re-show only when Safari's preference-open callback (`SFSafariExtensionManager`) routes back to the container. Preserves Plan 107-03's persistence-pill UI for when the user explicitly opens preferences from Safari.
files_affected:
  - vigil-safari-extension/Vigil Capture/AppDelegate.swift
  - vigil-safari-extension/Vigil Capture/ViewController.swift
  - Scripts/verify-phase-107.sh
  - .planning/phases/107-safari-extension-persistence/107-RESEARCH.md
blocks_tests: []  # first-launch surface is silent; Tests 1, 2, 4, 5 unblocked (still reboot-dependent but not blocked by this gap)
next_step: none — closed in Plan 107-05
resolution:
  plan: 107-05
  commit: b4f5e1a
  summary: "AppDelegate.suppressStoryboardWindows() orders all NSApp.windows out unconditionally; launch-source heuristic (systemUptime >= 120 AND firstLaunchAlertShown) gates shouldRevealWindow; application(_:open:) inbound hook opportunistically overrides the gate; ViewController.webView(_:didFinish:) re-shows window only when gate is open (D-04 preserved; D-01 preserved on Login Item boot launches)."
  mechanism: gated-reveal
  rejected_alternatives:
    - "unconditional makeKeyAndOrderFront in webView.didFinish: rejected — violates D-01 on Login Item boot launches (window flashes 50-300ms after boot)"
    - "pure application(_:open:) detection: rejected — Safari doesn't reliably deliver open events across all macOS versions"
    - "strip Main.storyboard initialViewController: rejected — breaks D-04 pill render path (RESEARCH Pitfall 2)"

## Known Tradeoffs (not gaps)

### tradeoff_107_1: Safari "Open preferences" within 120s of boot may not surface the window
applies_to: user clicks "Open preferences" in Safari → Settings → Extensions → Vigil Capture within the first 2 minutes after macOS login
symptom: if Safari does NOT deliver an `application(_:open:)` URL/Apple Event during launch (inbound signal is opportunistic per macOS version), the container app launches, loads the webview, but the gated `shouldRevealWindow` stays false because `systemUptime < 120` AND the heuristic intentionally biases toward "this is a Login Item boot launch, stay hidden." User sees no window.
workaround: wait 2 minutes after boot, then click "Open preferences" again, OR quit and re-open Vigil Capture.app directly. Both restore normal D-04 behavior.
rationale: the 120s threshold is the conservative gate that prevents the post-reboot Login Item boot flash. Trading off a single narrow window (Safari-prefs in the first 2 min of login) is preferable to regressing D-01 on every reboot. The `application(_:open:)` hook is best-effort — if Safari delivers it on this macOS version, the tradeoff disappears.
status: accepted
severity: minor
