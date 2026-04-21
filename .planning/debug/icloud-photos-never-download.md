---
status: awaiting_human_verify
trigger: "iCloud photos (HEIC files) detected as placeholders but never download — startDownloadingUbiquitousItem silently failing"
created: 2026-04-21T00:00:00Z
updated: 2026-04-21T16:30:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: CONFIRMED AND FIXED — brctl download fallback added to processFile() at lines 361-376. Keeps existing startDownloadingUbiquitousItem call (belt-and-suspenders). Uses terminationHandler for async exit-code logging. swift build -c release passes clean.
test: ./Scripts/install.sh to reinstall, then drop HEIC into iCloud Notebook folder, watch monitor-stderr.log for "dispatched brctl download for" line.
expecting: brctl triggers materialization within seconds; VNODE_WRITE fires; watcher re-queues and processes the file.
next_action: Human runs install.sh and verifies via log

## Symptoms

expected: FolderWatcherService detects HEIC placeholder, calls startDownloadingUbiquitousItem, macOS materializes file, watcher uploads to vigil-core
actual: "IMG_XXXX.HEIC not yet downloaded from iCloud (status: NSURLUbiquitousItemDownloadingStatusNotDownloaded), deferring" repeats forever. "triggered iCloud download for IMG_XXXX.HEIC" never emitted.
errors: No Swift errors raised. startDownloadingUbiquitousItem wrapped in try? on line 354 swallows silence.
reproduction: Drop HEIC into ~/Library/Mobile Documents/com~apple~CloudDocs/Notebook from iCloud device; observe monitor-stderr.log
started: iCloud Drive path configured 2026-04-11. Phase 58 merged 2026-04-09 stripped ubiquity entitlements.

## Eliminated

- hypothesis: Phase 58 was the direct causal trigger (iCloud path configured after Phase 58)
  evidence: Log shows watcher only started watching Mobile Documents path on 2026-04-11 22:06, two days after Phase 58 landed on 2026-04-09. So "triggered iCloud download" never appeared in logs even in a hypothetical pre-Phase-58-with-iCloud-path scenario.
  timestamp: 2026-04-21

- hypothesis: Files stay as .icloud hidden placeholders handled by triggerICloudDownloads()
  evidence: ls -la -A shows visible HEIC files, not .icloud stubs. triggerICloudDownloads() scans for dot-prefixed .icloud files and would never find these visible HEICs. The actual code path hit is processFile() lines 348-356.
  timestamp: 2026-04-21

- hypothesis: startDownloadingUbiquitousItem throws an error that is caught and logged
  evidence: Tested directly via swift CLI with same entitlement profile (empty) — call returns without throwing. Error would require a catch branch that logs; "triggered iCloud download" log (lines 210) is in the triggerICloudDownloads() branch, NOT the processFile() branch. The try? at line 354 has no success log at all.
  timestamp: 2026-04-21

- hypothesis: Phase 58 removing com.apple.developer.icloud-services (CloudKit) broke ubiquity download
  evidence: The removed entitlements were CloudKit-specific (icloud-services + icloud-container-identifiers). The entitlement needed for iCloud Drive access via startDownloadingUbiquitousItem is com.apple.developer.ubiquity-container-identifiers, which was NEVER present in the entitlements file at any point in git history. Phase 58 removed the wrong (CloudKit) entitlements, but the correct (ubiquity) entitlement was never there.
  timestamp: 2026-04-21

## Evidence

- timestamp: 2026-04-21T15:30Z
  checked: git log -p -- Entitlements/DailyBriefMonitor.entitlements
  found: Phase 58 commit 079034b removed com.apple.developer.icloud-services (CloudKit) and com.apple.developer.icloud-container-identifiers. com.apple.developer.ubiquity-container-identifiers was NEVER present in any commit. Pre-Phase 58 ad-hoc signing used --sign -.
  implication: The entitlement that controls startDownloadingUbiquitousItem for iCloud Drive was never in the file. Phase 58 removed wrong (CloudKit) keys. The ubiquity key was never there.

- timestamp: 2026-04-21T15:31Z
  checked: codesign -d --entitlements :- /Users/jamesonmorrill/.local/bin/DailyBriefMonitor.app
  found: <dict></dict> — empty entitlements embedded in installed binary. Developer ID Application: Jameson Morrill (5H57ADQS8G) cert confirmed.
  implication: Installed binary has zero entitlements. macOS enforces entitlements strictly for Developer ID signed binaries.

- timestamp: 2026-04-21T15:35Z
  checked: FolderWatcherService.swift lines 181-216 (triggerICloudDownloads) vs lines 348-356 (processFile)
  found: triggerICloudDownloads() scans for files matching name.hasSuffix(".icloud") && name.hasPrefix(".")  — hidden placeholder format. processFile() handles visible files that report NotDownloaded via ubiquitousItemDownloadingStatus check. The HEIC files appear as visible (not .icloud hidden), so ONLY processFile() handles them. The "triggered iCloud download for %@" log is in triggerICloudDownloads() at line 210 — never the path for these files.
  implication: "triggered iCloud download" log line can NEVER appear for files in iCloud Drive "visible stub" mode. The log line is in the wrong branch.

- timestamp: 2026-04-21T15:40Z
  checked: swift one-shot: FileManager.default.ubiquityIdentityToken and url(forUbiquityContainerIdentifier: nil)
  found: ubiquityIdentityToken = PRESENT (user logged into iCloud). URLForUbiquityContainerIdentifier(nil) = nil (process cannot access any ubiquity container).
  implication: The process can see that iCloud exists but cannot access any container. This is the entitlement gate. startDownloadingUbiquitousItem will silently no-op in this state.

- timestamp: 2026-04-21T15:41Z
  checked: swift one-shot: FileManager.default.startDownloadingUbiquitousItem on a NotDownloaded HEIC file
  found: Call returned without throwing. File status was confirmed NotDownloaded before call.
  implication: startDownloadingUbiquitousItem does NOT throw when entitlement is absent — it silently succeeds. The try? is not the problem; the problem is the API has nothing to queue. The "quiet success that does nothing" is the exact failure mode.

- timestamp: 2026-04-21T15:42Z
  checked: brctl download ~/Library/Mobile Documents/com~apple~CloudDocs/Notebook/IMG_0455.HEIC (from shell, no special entitlements)
  found: Exit code 0. After ~3 seconds, swift ubiquityItemDownloadingStatus = NSURLUbiquitousItemDownloadingStatusCurrent. File type confirmed as ISO Media HEIF HEVC.
  implication: brctl download works from a non-entitlement process and successfully triggers materialization. This is a viable fallback path.

- timestamp: 2026-04-21T15:44Z
  checked: monitor-stderr.log for "triggered iCloud download" across full history
  found: Zero occurrences. First "deferring" appears 2026-04-11 22:32. Watcher first used iCloud Drive path 2026-04-11 22:06.
  implication: The iCloud download path has NEVER worked. This is not a regression from Phase 58 specifically — the ubiquity entitlement was never present. Phase 58 is correlated (same codebase era) but the direct cause is the missing ubiquity-container-identifiers entitlement, which was never there.

- timestamp: 2026-04-21T15:46Z
  checked: Log entries for IMG_0439/0440 (deferred 01:40 as HEIC, then processed 01:45 as .png)
  found: Files deferred at 01:40 (HEIC, NotDownloaded), then appeared as .png and attempted at 01:45 (HTTP 502). iCloud eventually downloaded them on its own ~5-min background schedule, firing VNODE_WRITE, which re-triggered the watcher.
  implication: The VNODE_WRITE mechanism DOES work when iCloud independently downloads a file. The watcher correctly re-queues and processes. The only problem is the download never starts promptly without startDownloadingUbiquitousItem working.

## Resolution

root_cause: FolderWatcherService calls FileManager.default.startDownloadingUbiquitousItem(at:) (line 354) on visible iCloud Drive HEIC stubs that report NSURLUbiquitousItemDownloadingStatusNotDownloaded. This API silently no-ops — returns without throwing, without queuing a download — when the calling process has no com.apple.developer.ubiquity-container-identifiers entitlement. The installed DailyBriefMonitor.app has an empty entitlements dict (Phase 58 stripped CloudKit entitlements; the ubiquity entitlement was never present). With no download triggered, iCloud never materializes the file, no VNODE_WRITE fires on the parent directory, and the watcher never re-queues the file → stuck indefinitely. brctl download from a shell process works because brctl uses a privileged system daemon path not gated by the process's own entitlements.
fix: Option B applied — added brctl download fallback in processFile() after the existing startDownloadingUbiquitousItem call. Uses Process() with executableURL=/usr/bin/brctl, arguments=["download", url.path]. terminationHandler logs non-zero exit asynchronously without blocking the actor. startDownloadingUbiquitousItem retained for Option A future compatibility. swift build -c release clean.
verification: awaiting human — run ./Scripts/install.sh, drop HEIC into iCloud Notebook, confirm "dispatched brctl download for" appears in monitor-stderr.log and file processes within ~10s.
files_changed: ["Sources/DailyBriefMonitor/FolderWatcherService.swift"]
