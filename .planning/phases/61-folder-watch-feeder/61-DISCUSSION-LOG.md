# Phase 61: Folder Watch Feeder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 61-folder-watch-feeder
**Areas discussed:** Error visibility, Post-processing, File handling edge cases

---

## Error Visibility

### Q1: How should folder watch failures be surfaced?

| Option | Description | Selected |
|--------|-------------|----------|
| Menu bar icon change | Add a new icon state when watcher has unresolved failures. Click menu bar to see count/list. Consistent with existing icon pattern. | ✓ |
| macOS notification | Post a UserNotification per failed file. More visible but noisy. Requires notification permission. | |
| Both icon + notification | Menu bar icon changes AND notification fires for each failure. Maximum visibility, highest noise. | |

**User's choice:** Menu bar icon change
**Notes:** Recommended option — consistent with existing DailyBriefMonitor icon state pattern.

### Q2: Error detail level in menu bar dropdown

| Option | Description | Selected |
|--------|-------------|----------|
| Count + list | Show "2 files failed" with collapsible list of filenames and short error reasons. | ✓ |
| Count only | Just "2 files failed to process" — check watched folder to see which files. | |
| You decide | Claude picks during planning. | |

**User's choice:** Count + list
**Notes:** Recommended option — enough diagnostic info without clutter.

### Q3: When should error state clear?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-clear | Error state clears when no failed files remain in watched directory. | ✓ |
| Manual dismiss | User clicks "Clear errors" button. Failed files tracked even if removed. | |
| You decide | Claude picks during planning. | |

**User's choice:** Auto-clear
**Notes:** Recommended option — watcher naturally re-checks on file system events.

---

## Post-Processing

### Q4: Where should successfully processed files be moved?

| Option | Description | Selected |
|--------|-------------|----------|
| Subfolder inside watched dir | Create `done/` subfolder inside each watched directory. Watcher ignores `done/`. | ✓ |
| Separate archive directory | Move to central archive like ~/Jarvis/Processed/. | |
| You decide | Claude picks during planning. | |

**User's choice:** Subfolder inside watched dir
**Notes:** Recommended option — keeps everything co-located.

### Q5: File naming in done folder

| Option | Description | Selected |
|--------|-------------|----------|
| Original name | Keep original name. Counter suffix on collision (photo-2.jpg). | ✓ |
| Timestamp prefix | ISO timestamp prefix (2026-04-10T14-30-00_photo.jpg). No collisions. | |
| You decide | Claude picks during planning. | |

**User's choice:** Original name
**Notes:** Recommended option — simple and predictable.

---

## File Handling Edge Cases

### Q6: How to handle partially-written files?

| Option | Description | Selected |
|--------|-------------|----------|
| Wait-for-stable | Wait until file size stops changing for ~1-2 seconds before processing. | ✓ |
| Immediate + retry on failure | Process immediately, retry on next DispatchSource event if read fails. | |
| You decide | Claude picks during planning. | |

**User's choice:** Wait-for-stable
**Notes:** Recommended option — handles AirDrop, drag-and-drop, and copy gracefully.

### Q7: Accepted file types

| Option | Description | Selected |
|--------|-------------|----------|
| Match dashboard file pickers | Images: jpg, jpeg, png, heic, tiff, bmp. Audio: wav, m4a, mp3, caf. Ignore others silently. | ✓ |
| Broader set | Add webp, gif, aac, ogg. More flexible but may hit untested paths. | |
| You decide | Claude picks during planning. | |

**User's choice:** Match dashboard file pickers
**Notes:** Recommended option — proven paths, no untested format handling.

### Q8: Multiple files at once

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential | Process one file at a time, FIFO. Matches dashboard's processFiles() pattern. | ✓ |
| Parallel (2-3 concurrent) | Up to 3 files concurrently. Faster but more complex. | |
| You decide | Claude picks during planning. | |

**User's choice:** Sequential
**Notes:** Recommended option — predictable API load, matches existing pattern.

---

## Claude's Discretion

- Watcher architecture (new service vs integration, actor vs class, lifecycle management)
- DispatchSource configuration details (events, queue choices)
- Internal error tracking data structure
- os_log / unified logging for diagnostics

## Deferred Ideas

None — discussion stayed within phase scope.
