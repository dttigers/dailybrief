---
phase: quick-260407-q7d
plan: 01
subsystem: monitor-settings-ui
tags: [settings, ui, folder-watching, truth-in-ui, v2.3-prep]
requires: []
provides:
  - disabled-folders-tab
  - temporarily-unavailable-banner
affects:
  - Sources/DailyBriefMonitor/Settings/SettingsView.swift
tech-stack:
  added: []
  patterns:
    - "Form-level .disabled(true) for whole-section UI kill switch"
key-files:
  created: []
  modified:
    - Sources/DailyBriefMonitor/Settings/SettingsView.swift
decisions:
  - "Used single .disabled(true) at outer Form level instead of per-control disables — idiomatic SwiftUI and future-proof against new controls being added without the disable modifier"
  - "Kept $viewModel bindings on TextFields (not replaced with Text labels) so saved paths remain visible via grey-out, and v2.3 can simply remove the modifier + banner to re-enable"
  - "Preserved conditional rendering of auto-delete sub-row (if folderWatchingEnabled) so users who previously enabled it still see their setting, just non-interactive"
metrics:
  duration: ~6 min
  completed: 2026-04-07
  tasks_completed: 1
  tasks_total: 2  # Task 2 is human-verify checkpoint (automated portion done)
  files_modified: 1
  commits: 1
requirements:
  - Q7D-01
  - Q7D-02
  - Q7D-03
  - Q7D-04
  - Q7D-05
---

# Quick Task 260407-q7d: Disable Misleading Folder Watching UI Summary

**One-liner:** Grayed out the entire Settings → Folders tab via Form-level `.disabled(true)` and added an orange "temporarily unavailable" banner, so users stop trying to use a folder watcher that Phase 46 deleted.

## What Changed

`Sources/DailyBriefMonitor/Settings/SettingsView.swift` — `foldersTab` computed var (lines ~428-481):

1. **Added explanatory banner** at top of Form inside a `Section`:
   > "Temporarily unavailable — auto-import is being rebuilt for the API backend. Use Dashboard → Import Files in the meantime."
   Rendered with `.font(.callout)`, `.foregroundStyle(.orange)`, `.padding(.vertical, 4)`.

2. **Deleted the misleading restart warning** — removed the three-line `Text("Restart Jarvis to apply folder watching changes")` block that lied to users (FolderWatcherService was deleted in Phase 46, so no amount of restarting would make it work).

3. **Applied `.disabled(true)` to the outer Form** — single modifier propagates down to every child control (Toggle, TextFields, Choose... Buttons), greying them all out uniformly.

4. **Preservation (explicit non-changes):**
   - `SettingsViewModel.swift` — zero diff, all four fields (`folderWatchingEnabled`, `audioFolderPath`, `imageFolderPath`, `autoDeleteAfterProcessing`) preserved for v2.3 re-implementation
   - `AppConfig.swift` `FolderWatchingConfig` — untouched
   - `DashboardViewModel.processFiles()` — untouched, manual import path still respects `autoDeleteAfterProcessing`
   - TextField bindings kept on `$viewModel.audioFolderPath` / `$viewModel.imageFolderPath` so saved paths stay visible (just non-editable)
   - Conditional `if viewModel.folderWatchingEnabled` branch preserved so auto-delete sub-row still renders for users who had it enabled (grayed out)

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Disable foldersTab + add banner + delete restart warning | `bda9943` |

## Verification

**Automated (passed):**
- `swift build` exits 0 — Build complete! (66.71s), compiled `SettingsView.swift` cleanly
- `git diff Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift` → empty (zero lines)
- `git diff --stat Sources/DailyBriefMonitor/Settings/` → only `SettingsView.swift` changed, +8 -4 lines, scoped exclusively to the `foldersTab` region

**Human visual verification required (Task 2 — DEFERRED to user):**

The plan's Task 2 is a `checkpoint:human-verify` that cannot be automated. The user should:

1. Launch the Monitor app (`.build/debug/DailyBriefMonitor` or usual launch path)
2. Open Settings → Folders tab
3. Confirm visually:
   - [ ] Orange banner at top reads: "Temporarily unavailable — auto-import is being rebuilt for the API backend. Use Dashboard → Import Files in the meantime."
   - [ ] "Enable Folder Watching" toggle is grayed out and non-clickable
   - [ ] If previously enabled, the "Auto-delete files after processing" row is visible but grayed out
   - [ ] Audio Folder TextField shows previously saved path, grayed out, non-editable
   - [ ] Audio Folder "Choose..." button grayed out, non-clickable
   - [ ] Image Folder TextField shows previously saved path, grayed out, non-editable
   - [ ] Image Folder "Choose..." button grayed out, non-clickable
   - [ ] Old "Restart Jarvis to apply folder watching changes" orange warning is GONE
   - [ ] Descriptive caption text ("Drop audio files here...", "Drop images here...") still visible
4. Sanity check: Other Settings tabs (Calendar, iCloud Sync, AI, etc.) still render normally
5. Regression check: Dashboard → Import Files still works and still respects `autoDeleteAfterProcessing`

Once verified, the user can confirm and the quick task is fully closed. No further code changes expected unless visual issues are found.

## Deviations from Plan

None — plan executed exactly as written. Used the exact structure suggested in the Task 1 `<action>` block.

## Success Criteria Status

1. ✅ Folders tab clearly communicates "temporarily unavailable, use Dashboard → Import Files"
2. ✅ Zero interactive controls — Form-level `.disabled(true)` covers toggle, text fields, Choose... buttons
3. ✅ Previously-saved folder paths remain visible (bindings preserved)
4. ✅ Misleading "Restart Jarvis" warning removed
5. ✅ `SettingsViewModel.swift` untouched (zero diff)
6. ✅ `DashboardViewModel` manual import path still works with autoDelete (untouched)
7. ✅ `swift build` succeeds

## Self-Check: PASSED

- ✅ `Sources/DailyBriefMonitor/Settings/SettingsView.swift` — modified, committed in `bda9943`
- ✅ Commit `bda9943` exists in `git log`
- ✅ Banner string "Temporarily unavailable" present in file
- ✅ `.disabled(true)` modifier present on foldersTab Form
- ✅ Old "Restart Jarvis to apply folder watching changes" text absent from file
- ✅ `SettingsViewModel.swift` diff is empty
