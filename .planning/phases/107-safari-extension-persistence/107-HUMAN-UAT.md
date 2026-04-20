---
status: partial
phase: 107-safari-extension-persistence
source: [107-VALIDATION.md, 107-CONTEXT.md]
started: 2026-04-20T00:00:00Z
updated: 2026-04-20T19:40:00Z
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
result: failed
detail: NSAlert fired correctly (title + body + single OK button). However, Main.storyboard's initial window controller instantiated and showed the container window behind the alert — violates the "no storyboard window flashes into view" clause. Root cause: `LSUIElement=true` suppresses Dock icon + menu bar only; it does not prevent the storyboard's initial window from opening. Fix chosen (option 1): close/hide NSApp.windows programmatically in AppDelegate.applicationDidFinishLaunching — only re-show when Safari's preference-open callback fires. Tracked by gap_107_1 below.

### 4. Subsequent-launch no NSAlert (SC#2 corollary)
expected: On a SECOND launch of Vigil Capture.app (UserDefaults flag already set from Test 3), no NSAlert appears. No window. Register() status-guard skips the re-register call (os_log shows "Login item already enabled; skipping register()" in Console.app under subsystem filter `process == "Vigil Capture"`).
result: pending

### 5. End-to-end capture after reboot (EXT-01 behavioral)
expected: After the reboot in Test 1, without manually toggling anything, use the Safari context-menu "Capture with Vigil" (or existing extension entry point) to save a URL. The URL arrives in vigil-core (/v1/thoughts GET confirms the capture).
result: pending

## Summary

total: 5
passed: 0
issues: 1
pending: 4
skipped: 0
blocked: 0

## Gaps

### gap_107_1: Storyboard window shows on first launch despite LSUIElement=true
source_test: 3
status: failed
detected: 2026-04-20
symptom: On explicit first launch of the freshly-built Vigil Capture.app, the Main.storyboard initial window controller instantiates and the container window renders behind the NSAlert. User sees both surfaces at once instead of only the alert.
root_cause: `LSUIElement=true` in Info.plist (Plan 107-01) suppresses Dock icon and menu bar presence only. It does NOT prevent a storyboard's initial window controller from loading and showing its window on launch.
fix_approach: Close/hide `NSApp.windows` programmatically in `AppDelegate.applicationDidFinishLaunching(_:)` after existing register + alert logic. Re-show only when Safari's preference-open callback (`SFSafariExtensionManager`) routes back to the container. Preserves Plan 107-03's persistence-pill UI for when the user explicitly opens preferences from Safari.
files_affected: vigil-safari-extension/Vigil Capture/AppDelegate.swift
blocks_tests: [1, 2, 3, 4, 5]  # reboot tests and subsequent-launch test cannot proceed until first-launch surface is silent
next_step: /gsd-plan-phase 107 --gaps
