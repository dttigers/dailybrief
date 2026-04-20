---
status: ship-with-uat-pending
phase: 107-safari-extension-persistence
source: [107-VALIDATION.md, 107-CONTEXT.md]
started: 2026-04-20T00:00:00Z
updated: 2026-04-20T00:00:00Z
---

## Current Test

[awaiting user reboot — see Test 1]

## Tests

### 1. Reboot persistence (SC#1)
expected: After a full macOS restart (not just Safari restart, not just app relaunch), Safari → Settings → Extensions shows "Vigil Capture" toggle ON without the user touching the toggle. Steps: (a) ensure Vigil Capture.app has been launched at least once since this phase's build — confirm NSAlert was dismissed; (b) quit Vigil Capture; (c) `sudo reboot`; (d) after login, open Safari → Settings → Extensions; (e) confirm the "Vigil Capture" row is enabled.
result: pending

### 2. Login Items entry (SC#1 corollary)
expected: After the same reboot as Test 1, open System Settings → General → Login Items. Under "Open at Login", a "Vigil Capture" entry appears. Toggle is ON by default.
result: pending

### 3. First-launch NSAlert + no visible window (SC#2)
expected: On the FIRST launch of the freshly-built Vigil Capture.app (UserDefaults flag `io.vigilhub.extension.firstLaunchAlertShown` absent), the user sees exactly one NSAlert with messageText "Vigil Capture is installed." and informativeText "The extension will stay enabled across reboots." — no storyboard window flashes into view before or after the alert, no Dock icon appears. After dismissing the alert, the app quits or stays in accessory mode with no visible surface.
result: pending

### 4. Subsequent-launch no NSAlert (SC#2 corollary)
expected: On a SECOND launch of Vigil Capture.app (UserDefaults flag already set from Test 3), no NSAlert appears. No window. Register() status-guard skips the re-register call (os_log shows "Login item already enabled; skipping register()" in Console.app under subsystem filter `process == "Vigil Capture"`).
result: pending

### 5. End-to-end capture after reboot (EXT-01 behavioral)
expected: After the reboot in Test 1, without manually toggling anything, use the Safari context-menu "Capture with Vigil" (or existing extension entry point) to save a URL. The URL arrives in vigil-core (/v1/thoughts GET confirms the capture).
result: pending

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

# No gaps until user runs the tests. Format matches 105-HUMAN-UAT.md §Gaps when entries land.
