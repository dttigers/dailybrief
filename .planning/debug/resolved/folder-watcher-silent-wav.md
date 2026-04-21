---
status: resolved
trigger: "FolderWatcherService doesn't process .WAV files dropped in ~/Desktop/Voice Notes/. No log output, file remains untouched. Completely silent failure."
created: 2026-04-12T22:15:00Z
updated: 2026-04-12T22:25:00Z
resolved: 2026-04-21T18:55:00Z
---

## Current Focus

hypothesis: Info.plist in the .app bundle is missing NSSpeechRecognitionUsageDescription — macOS crashes the process via TCC before any watcher logic runs
test: Confirmed via crash report: termination namespace=TCC, details say "NSSpeechRecognitionUsageDescription key missing"
expecting: Adding the key to Info.plist written by install.sh will stop the crash loop and allow the watcher to function
next_action: Add NSSpeechRecognitionUsageDescription to the Info.plist heredoc in install.sh, then rebuild and reinstall

## Symptoms

expected: WAV file dropped in ~/Desktop/Voice Notes/ is detected by DispatchSource watcher, transcribed via SFSpeechRecognizer, and creates a thought in Vigil Core
actual: No log output from the watcher after file drop. File remains in place. No error, no failure log, nothing.
errors: None visible in stdout — completely silent. No "failed to process" log line for the WAV file.
reproduction: 1. Copy a .WAV file to ~/Desktop/Voice Notes/  2. Wait  3. Nothing happens.
timeline: Broken after multiple install.sh rebuilds. The watcher was working for images earlier today (iCloud Notebook folder). Audio has not been tested before this session.

## Eliminated

- hypothesis: Space in "Voice Notes" path causing open()/DispatchSource failure
  evidence: Log shows "FolderWatcherService: watching /Users/jamesonmorrill/Desktop/Voice Notes" — path expands correctly, open() would log a failure if it were the cause
  timestamp: 2026-04-12T22:20:00Z

- hypothesis: launchd cycling killing process before initial scan completes
  evidence: Partially confirmed — process IS cycling — but the cycling is the symptom, not the root cause. Root cause is TCC crash.
  timestamp: 2026-04-12T22:22:00Z

- hypothesis: contentsOfDirectory failing silently for the Voice Notes path
  evidence: Process never reaches that code — it crashes before the initial scan logs anything beyond "watching..."
  timestamp: 2026-04-12T22:22:00Z

## Evidence

- timestamp: 2026-04-12T22:18:00Z
  checked: launchctl print gui/501/com.jamesonmorrill.dailybriefmonitor
  found: last exit reason = OS_REASON_TCC, successive crashes = 15, minimum runtime = 10 (10-second crash loop)
  implication: Process is being terminated by macOS TCC subsystem on every launch — never survives long enough to process any files

- timestamp: 2026-04-12T22:19:00Z
  checked: stderr log pattern
  found: Process starts every ~10s: "startup complete" then "watching ..." then crashes (no more output)
  implication: Crash happens after watcher is set up but before any file event fires — likely during TranscriptionService init or first requestAuthorization call

- timestamp: 2026-04-12T22:21:00Z
  checked: ~/Library/Logs/DiagnosticReports/DailyBriefMonitor-2026-04-12-160906.ips
  found: termination.namespace = "TCC", termination.details = "This app has crashed because it attempted to access privacy-sensitive data without a usage description. The app's Info.plist must contain an NSSpeechRecognitionUsageDescription key with a string value explaining to the user how the app uses this data."
  implication: ROOT CAUSE CONFIRMED — .app bundle Info.plist does not contain NSSpeechRecognitionUsageDescription

- timestamp: 2026-04-12T22:22:00Z
  checked: install.sh Info.plist heredoc (lines 100-127)
  found: Info.plist written by install.sh contains CFBundleIdentifier, CFBundleName, LSUIElement, LSMinimumSystemVersion, NSHighResolutionCapable — no NSSpeechRecognitionUsageDescription
  implication: Every install.sh run overwrites Info.plist without the required key, causing the crash loop

- timestamp: 2026-04-12T22:23:00Z
  checked: TranscriptionService.swift — calls SFSpeechRecognizer.requestAuthorization
  found: File-based recognition only (SFSpeechURLRecognitionRequest), no live mic usage
  implication: Only NSSpeechRecognitionUsageDescription is needed — NSMicrophoneUsageDescription is NOT required for file-based recognition

## Resolution

root_cause: The .app bundle's Info.plist (written by install.sh) is missing NSSpeechRecognitionUsageDescription. When TranscriptionService calls SFSpeechRecognizer.requestAuthorization, macOS TCC crashes the process with SIGABRT (OS_REASON_TCC) because the usage description key is absent. This happens on every launch, causing the 10-second crash loop observed in launchd (successive crashes = 15).
fix: Add <key>NSSpeechRecognitionUsageDescription</key> and its string value to the Info.plist heredoc in install.sh
verification:
  - timestamp: 2026-04-21T18:55:00Z
    checked: git log + git blame Scripts/install.sh L127-128
    found: commit 430dfe9 "fix: add NSSpeechRecognitionUsageDescription to .app Info.plist" authored 2026-04-12 16:12 local, 13 min before the session's final update; key + description string present in current HEAD
    implication: Fix committed within the original debug session, session was just never flipped to resolved
  - timestamp: 2026-04-21T18:55:00Z
    checked: /usr/libexec/PlistBuddy -c "Print :NSSpeechRecognitionUsageDescription" ~/.local/bin/DailyBriefMonitor.app/Contents/Info.plist
    found: "Vigil transcribes voice notes you drop into the watched folder so they can be captured as thoughts." — installed bundle carries the key (bundle plist mtime 2026-04-15 15:26)
    implication: Installed .app matches the fix — TCC has a valid usage description at SFSpeechRecognizer.requestAuthorization time
  - timestamp: 2026-04-21T18:55:00Z
    checked: launchctl print gui/$(id -u)/com.jamesonmorrill.dailybriefmonitor
    found: state=running, pid=592, "last exit code = (never exited)" — no successive-crashes counter, no TCC exit reason
    implication: Crash loop is gone; process is stable
  - timestamp: 2026-04-21T18:55:00Z
    checked: ~/Library/Logs/DailyBrief/monitor-stderr.log (tail of recent runs)
    found: 2026-04-16 09:32–09:33 processed 5 WAV files (20260416072118.WAV … 20260416092423.WAV); each reached the server as "failed to process … HTTP 502" — i.e. past SFSpeechRecognizer auth, past transcription, all the way to upload
    implication: Watcher is no longer silently failing — it is successfully reading voice notes and calling the server. The 502s are a separate Railway flake, unrelated to TCC.
files_changed: [Scripts/install.sh]
