---
phase: 62-folder-watch-settings-ui
plan: 01
subsystem: mac-app
tags: [settings-ui, folder-watching, config, swift]
completed: 2026-04-10
duration: ~12 min
tasks_completed: 2
tasks_total: 3
checkpoint_pending: true

dependency_graph:
  requires:
    - 61-02 (FolderWatcherService lifecycle wiring in AppDelegate)
    - 61-01 (FolderWatcherService actor with processPhoto interface)
  provides:
    - defaultPaperType config field consumed by FolderWatcherService
    - restartFolderWatcher() called by SettingsViewModel.onConfigSaved
    - Settings Folders tab fully wired (WATCH-05)
  affects:
    - Sources/JarvisCore/Config/AppConfig.swift
    - Sources/DailyBriefMonitor/Settings/SettingsView.swift
    - Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift
    - Sources/DailyBriefMonitor/FolderWatcherService.swift
    - Sources/DailyBriefMonitor/AppDelegate.swift

tech_stack:
  patterns:
    - FolderWatchingConfig custom Decodable with backward-compat nil fallback
    - onConfigSaved callback pattern (same as Phase 60 UserDefaults round-trip lesson)
    - restartFolderWatcher actor teardown: stop() then nil then new init

key_files:
  modified:
    - Sources/JarvisCore/Config/AppConfig.swift
    - Sources/DailyBriefMonitor/Settings/SettingsView.swift
    - Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift
    - Sources/DailyBriefMonitor/FolderWatcherService.swift
    - Sources/DailyBriefMonitor/AppDelegate.swift

decisions:
  - "D-03 (CONTEXT): defaultPaperType stored as String? in config, not PaperType?, for JSON portability; FolderWatcherService converts via PaperType(rawValue:) at use site"
  - "D-02 (CONTEXT): watcher restart implemented via stop()+nil+new-init pattern since actors cannot be re-initialized; old actor's DispatchSources cancelled in stop()"
  - "D-04 (CONTEXT): help text corrected to match FolderWatcherService.imageExtensions/.audioExtensions actual sets"

requirements:
  - WATCH-05
---

# Phase 62 Plan 01: Folder Watch Settings UI Summary

Tasks 1 and 2 complete — Settings Folders tab fully wired with defaultPaperType picker, corrected help text, and live watcher restart on Save. Task 3 (human-verify) is pending checkpoint.

## What Was Built

**Task 1: defaultPaperType config + Settings UI (commit e5bcf36)**

`FolderWatchingConfig` in `AppConfig.swift` gains a new `defaultPaperType: String?` field (`nil` = auto, `"lined"`, `"gridded"`). Custom `Decodable` init uses `decodeIfPresent` so existing config files without the key decode cleanly with `nil` fallback.

`SettingsViewModel` adds `folderWatchDefaultPaperType: String = "auto"` with round-trip wiring in `loadConfig()` (maps `nil` → `"auto"`) and `save()` (maps `"auto"` → `nil`). The `onConfigSaved: (() -> Void)?` callback property is called at the end of a successful `save()`.

`SettingsView.foldersTab` gains:
- A "Default Paper Type" `Section` with a segmented `Picker` (Auto / Lined / Gridded)
- Corrected audio help text: `.wav, .mp3, .m4a, .caf` (was `.aiff`)
- Corrected image help text: `.jpg, .png, .heic, .tiff, .bmp` (was `.gif, .webp`)

`FolderWatcherService.processFile()` now reads `config.defaultPaperType.flatMap { PaperType(rawValue: $0) }` and passes it as `forcePaperType` to `processPhoto`, replacing the hardcoded `nil`.

**Task 2: restartFolderWatcher + onConfigSaved wiring (commit 59b2431)**

`AppDelegate` gains `restartFolderWatcher()`:
1. Calls `await watcher.stop()` on the old actor instance via a `Task`
2. Nils `folderWatcher`
3. Reloads config via `ConfigLoader.load()`
4. Creates a new `FolderWatcherService` with the fresh config
5. Calls `await watcher.start()` on the new instance
6. Logs "folder watcher restarted with updated config"

`openSettings()` injects the callback: `viewModel.onConfigSaved = { [weak self] in self?.restartFolderWatcher() }` — wired before the `SettingsView` is created so the callback is live for the entire settings session.

## Verification

Both tasks verified via `swift build` — build complete with zero errors (pre-existing warnings only).

All acceptance criteria confirmed:
- `defaultPaperType` in `AppConfig.FolderWatchingConfig`
- `folderWatchDefaultPaperType` + `onConfigSaved` in `SettingsViewModel`
- "Default Paper Type" picker in `SettingsView`
- `.wav, .mp3, .m4a, .caf` in help text (not `.aiff`)
- `.jpg, .png, .heic, .tiff, .bmp` in help text (not `.gif`, `.webp`)
- `forcePaperType.*config` pattern in `FolderWatcherService`
- `restartFolderWatcher` + `onConfigSaved` + `await watcher.stop()` in `AppDelegate`
- Two `FolderWatcherService(` instantiations in `AppDelegate`

## Task 3: Checkpoint Pending Human Verification

**Status:** checkpoint: pending human verification

Task 3 is a `type="checkpoint:human-verify"` gate. The orchestrator will present it to the user. Verification steps from the plan:

1. Build and run `DailyBriefMonitor`
2. Open Settings → Folders tab
3. Verify: enable toggle, auto-delete toggle, audio path + Choose, image path + Choose, Auto/Lined/Gridded segmented picker
4. Verify help text: audio shows `.wav, .mp3, .m4a, .caf`; image shows `.jpg, .png, .heic, .tiff, .bmp`
5. Change paper type to "Gridded", Save — check `config.json` has `"default_paper_type": "gridded"`
6. Drop image into watched folder — processes as gridded (single thought)
7. Change to "Auto", Save — console shows "folder watcher restarted with updated config"

## Deviations from Plan

**1. [Rule 3 - Blocking] Worktree branch base mismatch required recovery**

- **Found during:** Pre-execution branch check
- **Issue:** `git merge-base HEAD 7b88b40` returned `0d5b0ed` (current HEAD was an ancestor of the target commit, not equal to it). The `git reset --soft` moved HEAD forward but left working tree at old state, staging deletes of Phase 61 files including `FolderWatcherService.swift`.
- **Fix:** Ran `git reset HEAD && git checkout -- .` to restore working tree files from the target commit `7b88b40`. All Phase 61 source files (FolderWatcherService.swift, updated AppDelegate.swift, updated SettingsView.swift) correctly restored.
- **Impact:** No code changes lost; recovery was purely a worktree state fix before any edits began.

None to plan logic — both tasks executed exactly as specified.

## Known Stubs

None. All picker values round-trip through config to FolderWatcherService. No placeholder data flows to UI.

## Threat Flags

None beyond what the plan's threat model already covers (T-62-01 through T-62-03 all accepted/mitigated per plan).

## Self-Check

### Files exist:
- Sources/JarvisCore/Config/AppConfig.swift — modified
- Sources/DailyBriefMonitor/Settings/SettingsView.swift — modified
- Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift — modified
- Sources/DailyBriefMonitor/FolderWatcherService.swift — modified
- Sources/DailyBriefMonitor/AppDelegate.swift — modified

### Commits exist:
- e5bcf36 feat(62-01): add defaultPaperType to config + wire Settings Folders UI
- 59b2431 feat(62-01): wire restartFolderWatcher + onConfigSaved callback in AppDelegate

## Self-Check: PASSED
