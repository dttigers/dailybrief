---
phase: 97-mac-cli-print-reliability
verified: 2026-04-17T00:45:00Z
status: human_needed
score: 7/7
overrides_applied: 0
human_verification:
  - test: "Run ~/.local/bin/DailyBrief generate and confirm physical print output is actual-size (3.75x7.5 content on Letter paper, not scaled to fill)"
    expected: "Paper output matches PDF dimensions, not blown up to Letter size"
    why_human: "Physical paper measurement cannot be verified programmatically"
  - test: "Pause printer in System Settings, run DailyBrief generate, observe Monitor menu bar icon"
    expected: "Monitor shows red exclamation mark icon (not monochrome)"
    why_human: "Visual appearance of SwiftUI menu bar icon color requires human eyes"
  - test: "Confirm the LaunchAgent scheduled run fires at configured time and paper comes out (D-01 full chain)"
    expected: "Log shows scheduled run, PDF fetched, printed without error"
    why_human: "End-to-end scheduled run involves timer firing at a future time and physical printer output"
---

# Phase 97: Mac CLI Print Reliability Verification Report

**Phase Goal:** The Mac CLI auto-print path is verified working end-to-end so the daily brief prints on schedule without manual intervention
**Verified:** 2026-04-17T00:45:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PrintService.printPDF throws a typed error when lpr exits non-zero | VERIFIED | `PrintService.swift:56` -- `throw PrintError.lprFailed(process.terminationStatus)` |
| 2 | PrintService checks printer reachability via lpstat before invoking lpr | VERIFIED | `PrintService.swift:28` -- `try checkPrinterReachable(config.printerName)` calls `/usr/bin/lpstat -p` |
| 3 | lpr is invoked with fit-to-page=false and scaling=100 for actual-size printing | VERIFIED | `PrintService.swift:42-44` -- `-o media=Letter`, `-o fit-to-page=false`, `-o scaling=100` |
| 4 | CLI retries via POST /v1/brief/generate when GET /v1/brief/:date returns 404 | VERIFIED | `DailyBrief.swift:80-91` -- catches `VigilAPIError.httpError(404)`, calls `postRawData(path: "/brief/generate")` |
| 5 | Monitor title bar icon shows red foreground when print fails | VERIFIED | `DailyBriefMonitorApp.swift:66-67` -- `.foregroundStyle(.red)` on `exclamationmark.circle.fill` |
| 6 | Legacy LaunchAgent com.jameson.dailysheet-print is unloaded and plist deleted | VERIFIED | `launchctl list` returns "Could not find service"; plist file does not exist |
| 7 | Doctor subcommand checks printer reachability | VERIFIED | `DailyBrief.swift:654-674` -- Check 7 uses `/usr/bin/lpstat -p` with printer name from config |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Sources/DailyBrief/Utilities/PrintService.swift` | Print error throwing, reachability check, 100% scale flags | VERIFIED | 73 lines. Contains `PrintError` enum, `checkPrinterReachable`, `fit-to-page=false`, `scaling=100`, `throw PrintError.lprFailed` |
| `Sources/DailyBrief/DailyBrief.swift` | 404 fallback to POST generate, Doctor printer check, legacy cleanup | VERIFIED | Contains `postRawData(path: "/brief/generate")` on 404, Check 7 printer reachability in Doctor |
| `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` | Red foreground style on failure icon | VERIFIED | Line 67: `.foregroundStyle(.red)` on failure branch |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `PrintService.swift` | `DailyBrief.swift` | throw propagation from PrintService.printPDF to Generate.run() | WIRED | `DailyBrief.swift:112` -- `try PrintService.printPDF(at: outputPath, config: config.printing)` -- no catch block swallows the throw |
| `DailyBrief.swift` | `VigilAPIClient.swift` | postRawData call on 404 fallback | WIRED | `DailyBrief.swift:84-86` -- `apiClient.postRawData(path: "/brief/generate", accept: "application/pdf")` |
| `StatusChecker.refresh()` | Monitor title bar icon | didFailNonStale drives red exclamationmark.circle.fill | WIRED | `StatusChecker.swift:14` defines `didFailNonStale`; `DailyBriefMonitorApp.swift:63` reads `lastRunSuccess`; `MenuBarView.swift:222,237,243` uses `didFailNonStale` for red status |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `DailyBrief.swift` Generate | `pdfData` | `apiClient.getRawData` / `apiClient.postRawData` | Yes -- fetches from vigil-core API | FLOWING |
| `DailyBriefMonitorApp.swift` | `appDelegate.checker.lastRunSuccess` | `StatusChecker.refresh()` parses CLI log output | Yes -- reads actual log files | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Swift build succeeds | `swift build` | Build complete! (11.73s) | PASS |
| Legacy LaunchAgent removed | `launchctl list com.jameson.dailysheet-print` | "Could not find service" (exit 113) | PASS |
| Legacy plist file deleted | `ls ~/Library/LaunchAgents/com.jameson.dailysheet-print.plist` | "No such file or directory" | PASS |
| All phase commits exist | `git log --oneline` for 6 commit hashes | All 6 commits verified (9dc03bc, ccab10c, 347b70d, ce4b870, e450c6a, 8d868f8) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FIX-03 | 97-01, 97-02 | Mac CLI auto-print is verified working and will print tomorrow's brief on schedule | SATISFIED | PrintService throws on failure, 404 fallback working, 100% scale flags added, Doctor checks printer, legacy agent removed, build succeeds. User confirmed end-to-end in Plan 02 Summary. |

### Roadmap Success Criteria Coverage

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | Running the Mac CLI print command locally completes without error and sends the brief to the printer | VERIFIED | `swift build` succeeds; `try PrintService.printPDF` is wired in Generate.run(); Plan 02 Summary confirms user ran `DailyBrief generate` successfully |
| 2 | The LaunchAgent scheduled run executes the print path at the configured time (verified via log output) | NEEDS HUMAN | Plan 02 Summary confirms Doctor passes and CLI works; full scheduled-run verification requires waiting for next fire time |
| 3 | Any identified blockers in the print path are resolved and documented | VERIFIED | 5 bugs found and fixed during Plan 02 verification (lpstat path, double /v1 prefix, CUPS media, overflow cut lines, Doctor API key fallback); all documented in 97-02-SUMMARY.md |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | -- | -- | No anti-patterns found in modified files |

### Human Verification Required

### 1. Physical Print Output at Actual Size

**Test:** Run `~/.local/bin/DailyBrief generate` and measure the printed output
**Expected:** Content area is 3.75" x 7.5" on Letter paper (not scaled to fill the page)
**Why human:** Physical paper measurement cannot be verified programmatically

### 2. Monitor Red Badge on Print Failure

**Test:** Pause the printer in System Settings > Printers & Scanners, then run `~/.local/bin/DailyBrief generate`
**Expected:** Monitor menu bar icon shows a red exclamation mark (not monochrome)
**Why human:** Visual appearance of SwiftUI menu bar icon color rendering requires human observation

### 3. Full Scheduled Chain (D-01)

**Test:** Wait for the next scheduled run time (06:05 per API) and observe log + physical output
**Expected:** Log shows scheduled run fired, PDF fetched/generated, sent to printer; paper comes out
**Why human:** Scheduled timer firing and physical printer output require waiting for the event and observing hardware

### Gaps Summary

No code-level gaps found. All 7 must-have truths are verified in the codebase. All artifacts exist, are substantive, and are properly wired. All 6 commits are present. The build compiles successfully. The legacy LaunchAgent is fully removed.

The phase requires human verification for three items: (1) physical print output measurement confirming actual-size printing, (2) visual confirmation of the red badge in the Monitor menu bar, and (3) the full scheduled chain test per D-01. Plan 02 Summary indicates the user has already confirmed items 1, 3 (manual run), and 4 (legacy removal), with the failure badge test skipped per user. A future scheduled run would fully satisfy criterion 2 from the roadmap.

---

_Verified: 2026-04-17T00:45:00Z_
_Verifier: Claude (gsd-verifier)_
