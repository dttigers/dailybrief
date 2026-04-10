---
phase: 62
name: folder-watch-settings-ui
created: 2026-04-10
decisions: 4
deferred: 1
---

# Phase 62: Folder Watch Settings UI — Context

## Phase Goal

Re-enable the Settings Folders tab and wire every control to the Phase 61 FolderWatcherService. Add a default paper-type override setting. Ensure changes take effect without app restart.

## Requirement

- WATCH-05: Watched directories, the post-processing action (move / delete), and the default paper-type override are configurable from the existing Settings UI

## Decisions

### D-01: Two fixed folder paths, not dynamic list

The Settings UI keeps the current model: one audio folder path, one image folder path, both editable via text field + folder picker. SC-1's "add, remove, and edit" is satisfied by the path fields + the enable toggle.

**Rationale:** Solo user with two specific drop zones. Dynamic folder list is over-engineering for current use.

**Deferred:** Dynamic multi-folder support (arbitrary number of watched directories, each tagged audio/image) → backlog for future milestone.

### D-02: Settings Save triggers watcher restart

When the user hits Save in Settings and folder watching config has changed, AppDelegate calls `watcher.stop()` then creates a new `FolderWatcherService` with the updated config and calls `start()`. This ensures changes take effect immediately without app restart.

**Implementation:** SettingsViewModel.save() already writes config. AppDelegate needs a `restartFolderWatcher()` method called after config save when folderWatching fields changed.

### D-03: Default paper-type picker (Auto / Lined / Gridded)

Add a `defaultPaperType` field to `FolderWatchingConfig` (String?, nil = auto). Surface as a segmented picker or popup in the Folders settings tab.

- **Auto** (default, nil): AI decides paper type. Low-confidence fallback from Phase 60 applies.
- **Lined**: `forcePaperType: .lined` passed to processPhoto.
- **Gridded**: `forcePaperType: .gridded` passed to processPhoto.

FolderWatcherService reads this from config and passes it through to `processPhoto(imageURL:preview:false:forcePaperType:)`.

### D-04: Fix Settings help text to match supported extensions

Current help text is wrong:
- Audio lists `.aiff` — not in FolderWatcherService.audioExtensions
- Image lists `.gif`, `.webp` — not in FolderWatcherService.imageExtensions

Correct to match D-07 from Phase 61:
- Audio: `.wav, .mp3, .m4a, .caf`
- Image: `.jpg, .png, .heic, .tiff, .bmp`

## Deferred Ideas

- Dynamic multi-folder watching (arbitrary number of directories) — future milestone
- Per-folder paper type override (different default per folder) — future if needed

## Existing Assets

- `Sources/DailyBriefMonitor/Settings/SettingsView.swift` — foldersTab already has enable toggle, auto-delete toggle, audio/image path fields with folder picker
- `Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift` — reads/writes FolderWatchingConfig, has all 4 current fields
- `Sources/JarvisCore/Config/AppConfig.swift` — FolderWatchingConfig struct (needs defaultPaperType field added)
- `Sources/DailyBriefMonitor/FolderWatcherService.swift` — reads config at init, has start()/stop() lifecycle
- `Sources/DailyBriefMonitor/AppDelegate.swift` — creates watcher with injected dependencies

## Key Constraints

- FolderWatcherService is an actor — restart means creating a new instance (actors cannot be re-initialized)
- Config uses `.convertFromSnakeCase` JSON decoding — new field `defaultPaperType` maps to `default_paper_type` in JSON
- PaperType enum exists in JarvisCore — reuse it for the picker values
