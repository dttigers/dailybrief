# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## dashboard-list-blank-after-mutation — Dashboard list blanks (then shows stale data) after rapid mutations
- **Date:** 2026-04-07
- **Error patterns:** dashboard, list, blank, mutation, stale, race, URLSession, Task.cancel, reentrancy, loadThoughts, loadLinkCounts, Railway, fetchFiltered, category switch
- **Root cause:** URLSession does not honor Task.cancel() mid-flight. After a reentrancy guard cancelled an in-flight loadThoughts Task, the cancelled-but-still-running fetch completed normally and stomped newer state with stale results. Compounded original v2.1 bugs (no reentrancy guard + catch-all that wiped `thoughts = []` on any throw) once GRDB became remote Railway calls and race windows widened from ms to seconds.
- **Fix:** Pass 1 — added loadThoughtsTask reentrancy guard and removed `thoughts = []` from the catch. Pass 2 — accumulate fetch results into a local `computed` and only assign to `self.thoughts` after `Task.isCancelled == false`; same Task.isCancelled guards inside `loadLinkCounts` per-iteration and before final assignment. Cancelled-but-still-running tasks now bail out before stomping newer state.
- **Files changed:** Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
---

## folder-watcher-silent-wav — FolderWatcherService silently drops .WAV files (no logs, no error)

- **Date:** 2026-04-12 (fix committed), 2026-04-21 (session closed)
- **Error patterns:** FolderWatcherService, silent failure, WAV, Voice Notes, launchd crash loop, successive crashes, OS_REASON_TCC, SIGABRT, SFSpeechRecognizer, requestAuthorization, install.sh, Info.plist, usage description, menu bar process
- **Root cause:** macOS TCC terminated the monitor process with SIGABRT as soon as `SFSpeechRecognizer.requestAuthorization` ran, because the `.app` bundle's Info.plist had no `NSSpeechRecognitionUsageDescription` key. The install.sh heredoc that generates Info.plist listed the other required keys (CFBundleIdentifier, LSUIElement, etc.) but omitted the speech usage description. Every launch crashed ~10s after startup; launchd kept relaunching, producing a 10-second crash loop (15 successive crashes observed) with no app-level logs because the process died before any file event fired. Looked like "watcher is broken" from the user's perspective; was actually "watcher never survives long enough to run".
- **Fix:** Added `<key>NSSpeechRecognitionUsageDescription</key>` + description string to the Info.plist heredoc in install.sh (commit 430dfe9). File-based recognition via `SFSpeechURLRecognitionRequest` only requires this key — `NSMicrophoneUsageDescription` is NOT needed, so the surface area stayed minimal.
- **Files changed:** Scripts/install.sh
- **Generalized lesson:** Silent failure in a menu-bar / LaunchAgent process with no app logs is almost always pre-main: TCC, codesigning, entitlements, or missing Info.plist keys. Always `launchctl print gui/$(id -u)/<label>` first — "successive crashes" + "last exit reason = OS_REASON_TCC" collapses hours of watcher-logic debugging into one plist edit. Crash reports under `~/Library/Logs/DiagnosticReports/` give the exact missing key.
---

## brief-assembly-stale-rows — Daily brief PDF contains completed work orders + soft-deleted thoughts

- **Date:** 2026-04-21
- **Error patterns:** brief, PDF, daily brief, assembly, stale, completed work order, work_order, soft delete, syncStatus, pendingDeletion, archivedAt, deletedAt, fetchTaskThoughts, fetchRecentThoughts, fetchUnprocessedThoughts, mapWorkOrders, brief-assembly-service, generate-scheduler, scheduled brief
- **Root cause:** Two independent missing filters in `vigil-core/src/services/brief-assembly-service.ts`. (1) All three thought queries selected by userId + category + createdAt window but never excluded rows where `syncStatus = 'pendingDeletion'` — so thoughts/tasks the user soft-deleted in the PWA still flowed into brief assembly. The display routes (`routes/brief.ts`, `bulk.ts`, `summary.ts`) applied this filter correctly, which masked the bug from casual PWA use. (2) The work-order fetch selected by userId only, with no `isNull(archivedAt)` filter, and `mapWorkOrders` joined status rows but never filtered out `status = 'done'`. Archived WOs and completed WOs both rendered in the brief.
- **Key surprise:** Soft-delete on `thoughts` is **`syncStatus = 'pendingDeletion'`**, NOT a `deletedAt` column. The thoughts table has no `deletedAt`. Always verify the schema before trusting a hypothesis like "filter deletedAt IS NULL" — the column may not exist.
- **Structural driver:** `work_order_statuses` is a second table with no `userId` column (Phase 102 tech-debt item W-01). The assembly service fetches all status rows and resolves status via a status-map in memory — so the `done` filter must run in-memory post-join, not in SQL. `archivedAt` is on the main `workOrders` table and was filtered at SQL. Keep this split in mind when extending the assembly pipeline.
- **Fix:** Added `ne(syncStatus, 'pendingDeletion')` to all three thought queries; added `isNull(archivedAt)` to the WO DB query; added `.filter((wo) => wo.status !== "done")` in `mapWorkOrders`. Four new tests lock in the behavior (7c, 7d WO done-filtering; 11, 12 that Drizzle queryChunks carry the filters to the DB). 19/19 tests pass, `npx tsc --noEmit` clean.
- **Files changed:** vigil-core/src/services/brief-assembly-service.ts, vigil-core/src/services/brief-assembly-service.test.ts
- **Generalized lesson:** Multi-route data pipelines acquire dual filtering surfaces — one at the display layer, one at the analytics/assembly layer. Bugs hide in the less-visible layer because the display layer looks clean. Every time a soft-delete or status-completion filter lands in the display path, search the codebase for parallel query sites (esp. scheduled jobs and PDF/report generators) and apply the same filter. Drizzle queryChunks inspection in tests is the cheapest way to prove a filter reaches SQL.
---

