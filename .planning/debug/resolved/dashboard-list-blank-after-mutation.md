---
status: resolved
trigger: "After write operations in the Dashboard (marking tasks as done, editing thought text, deleting duplicates), the main list pane goes truly blank while the sidebar keeps working. Clicking a different sidebar category re-renders content correctly. Intermittent — happens 'every now and then' during bulk editing sessions. Regression from v2.1 Railway migration."
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T00:00:00Z
resolved: 2026-04-07T00:00:00Z
---

## Current Focus

hypothesis: RESOLVED — pass-2 fix confirmed by user in a real bulk-editing session.
test: Bulk edit + category-switching workflow.
expecting: List stays current, no blank pane, no stale data.
next_action: Archived. No further action.

## Symptoms

expected:
  - Mutation updates the row in place; sidebar counts update; user keeps working.
actual:
  - After N mutations the main list pane goes truly blank (not the empty state).
  - Sidebar (counts, filters) remains responsive and accurate.
  - Clicking another sidebar category re-renders correctly; clicking back is also fine.
  - Intermittent. No visible errors. Regression from v2.1 Railway migration.
errors:
  - None surfaced to user. Likely an `NSLog("Dashboard: failed to load thoughts — ...")` is being emitted.
reproduction:
  - Open Dashboard, pick a category with many items, do bulk mark-done / edit / delete.
  - Within a few mutations the main pane blanks.
  - Click another category to recover.
started: ~v2.1 Railway migration (phases 37-44, ~Apr 5 2026), when local GRDB became remote API calls.

## Eliminated

- hypothesis: ForEach identity collision after delete (Identifiable on Int64? id)
  evidence: While `Thought.id` is `Int64?`, the symptom doesn't match — ID collision would cause specific row glitches, not full blanking. Also, switching category and back restores content with the same data, ruling out a stable diff bug. The optional ID is a latent risk worth tracking, but not the cause here.
  timestamp: 2026-04-07T00:00:00Z

- hypothesis: NavigationSplitView detail-view tear-down
  evidence: The detail view (`thoughtsDetail`) is a stable child of NavigationSplitView. Switching sidebar selection does NOT replace the detail view — it just re-fires `.onChange(of: viewModel.selectedFilter)` which calls `loadThoughts()`. So "category click fixes it" maps to "fresh loadThoughts call succeeds", not "view rebuild".
  timestamp: 2026-04-07T00:00:00Z

- hypothesis: @Observable not firing
  evidence: DashboardViewModel is `@Observable` (line 46) and `thoughts` is a stored var that is reassigned from MainActor. Observable would correctly fire — the issue is that the value being assigned IS empty, not that the assignment is invisible.
  timestamp: 2026-04-07T00:00:00Z

## Evidence

- timestamp: 2026-04-07T01:00:00Z
  checked: DashboardViewModel.loadThoughts (199-206) and performLoadThoughts (208-308) after the prior fix
  found: Public loadThoughts cancels loadThoughtsTask, creates new Task, awaits its value. performLoadThoughts catches CancellationError silently. BUT: after `try await store.fetchFiltered(...)` returns, performLoadThoughts unconditionally assigns `thoughts = results` with NO check for Task.isCancelled. URLSession does not reliably propagate Task cancellation to in-flight requests — they typically run to completion and return data normally, at which point the now-cancelled-but-still-running Task assigns stale results.
  implication: Latest call (T2) wins the race only if T1's URLSession completes AFTER T2's. In practice T1 started earlier and finishes earlier, so T1 stomps T2's correct data with stale data. User sees the OLD category persist after clicking a new category.

- timestamp: 2026-04-07T01:00:00Z
  checked: All `thoughts = results` assignments in performLoadThoughts (lines 225, 245, 258, 295)
  found: Four assignment sites, none check Task.isCancelled.
  implication: Need to gate each assignment behind a cancellation check, OR check once after the await and before the branch.

- timestamp: 2026-04-07T00:00:00Z
  checked: DashboardViewModel.loadThoughts (Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift:190-285)
  found: The catch block on lines 281-284 unconditionally sets `thoughts = []` on ANY error. There is no distinction between "fetch returned no rows" and "network call failed". With Railway in the loop, every fetch is a network call and can fail transiently.
  implication: A single transient API failure during mutation reload is sufficient to blank the list.

- timestamp: 2026-04-07T00:00:00Z
  checked: Mutation handlers — cycleTaskStatus (305), applyEdit (656), deleteThought (961), toggleFavorite (844), addTag (855), removeTag (868), reTriageThought (549), reClassifyTherapy (599)
  found: Every mutation handler follows the same pattern: `try await store.<mutation>(...)` then `await loadThoughts()` then often `await loadCounts()`. Each is invoked from `Task { ... }` in DashboardView.swift (e.g., line 759 cycleTaskStatus). Multiple rapid clicks spawn multiple concurrent Tasks.
  implication: There is NO serialization or reentrancy guard on `loadThoughts()`. Two concurrent invocations can interleave at every `await` point.

- timestamp: 2026-04-07T00:00:00Z
  checked: loadLinkCounts (DashboardViewModel.swift:288-302)
  found: After `loadThoughts` assigns `thoughts = results`, it calls `await loadLinkCounts()` which performs a SEQUENTIAL loop of network calls — one `await store.countLinks(thoughtId:)` per displayed thought. With 19 tasks, that's 19 round-trips to Railway.
  implication: Each `loadThoughts` call holds the MainActor at await points for a long time (potentially seconds with 20 thoughts). This dramatically widens the race window. Concurrent mutation Tasks have ample time to interleave.

- timestamp: 2026-04-07T00:00:00Z
  checked: APIThoughtStore.fetchFiltered (Sources/JarvisCore/Storage/APIThoughtStore.swift:216-237) and friends
  found: All fetch methods are pure HTTP calls via `client.get(path:query:)`. They throw on URLSession errors, decoding errors, non-2xx responses, timeouts.
  implication: Every loadThoughts call has a non-trivial probability of throwing under load. Combined with the unconditional `thoughts = []` catch, this is a direct path to a blank list.

- timestamp: 2026-04-07T00:00:00Z
  checked: DashboardView sidebar onChange handlers (DashboardView.swift:73-105)
  found: `onChange(of: viewModel.selectedFilter)` etc. each fire `Task { await viewModel.loadThoughts() }`. So clicking a sidebar category spawns a brand-new, single, uncontended loadThoughts call. With no concurrent mutation racing it, and after Railway has likely settled, it succeeds.
  implication: This perfectly explains "click another category and content reappears". The recovery path is just a successful loadThoughts.

- timestamp: 2026-04-07T00:00:00Z
  checked: Sidebar count source (DashboardViewModel.loadCounts and DashboardView.sidebar)
  found: Sidebar reads `viewModel.totalCount`, `viewModel.categoryCounts[...]`, etc. — separate stored vars populated by `loadCounts()`, which is on a completely independent await chain from `loadThoughts()`. `loadCounts` has no `catch { counts = [:] }` wipe — its catch only NSLogs and leaves prior values intact.
  implication: This perfectly explains "sidebar still works while main list is blank". The sidebar is reading a different observable property that was untouched by the failed `loadThoughts` call.

## Resolution

root_cause: |
  REVISED after first-fix regression. The original v2.1 root cause analysis was correct, but the first fix had a third defect of its own:

  **Original (v2.1) bug — fixed in pass 1:**
  1. No reentrancy protection on loadThoughts; concurrent calls interleaved freely.
  2. Catch-all wiped `thoughts = []` on any throw, blanking the visible list on transient Railway hiccups.

  **First-fix regression — fixed in pass 2:**
  3. The reentrancy guard cancelled the in-flight Task before starting a new one, but URLSession does NOT reliably honor Task cancellation mid-flight. A cancelled task's `await store.fetchFiltered(...)` typically completes the HTTP request and returns data normally — at which point the now-cancelled-but-still-running task assigns `thoughts = results` with STALE data, stomping whatever the newer task already committed. The user clicks "Recent", the newer task fetches and assigns recent thoughts, then the older "Tasks" task (cancelled but still in URLSession) finishes and overwrites with task data. List shows stale state, category clicks appear to do nothing.

  Additionally `loadLinkCounts` had the same shape — a long sequential network loop with no cancellation check — so a superseded loadThoughts could also stomp `linkCounts`.

  1. **No reentrancy protection.** Mutation handlers (cycleTaskStatus, applyEdit, deleteThought, toggleFavorite, addTag, removeTag, reTriageThought, reClassifyTherapy) are wired through `Task { await viewModel.<mutation>(thought) }` in DashboardView. Rapid clicks spawn multiple concurrent Tasks. Each Task awaits `store.<mutation>` THEN `loadThoughts()` THEN `loadCounts()`. With Railway in the loop, each await holds for hundreds of ms. The post-mutation `loadLinkCounts()` loop holds for seconds (one HTTP call per displayed thought). Concurrent loadThoughts invocations interleave freely.

  2. **Catch-all that wipes the list.** Lines 281-284:
        } catch {
            NSLog("Dashboard: failed to load thoughts — \(error.localizedDescription)")
            thoughts = []
        }
     Any throw — URLSession transient failure, request cancellation, decode error, timeout, even a 5xx hiccup — wipes the visible list to empty. The user sees a blank pane with no error message.

  The combination is the bug. With many concurrent loadThoughts calls under load, the probability of at least one throwing rises sharply. When it does, the UI silently blanks. Switching sidebar category triggers a fresh, uncontended loadThoughts that succeeds and restores content — which is exactly the observed recovery behavior.

  Pre-v2.1 this was invisible because GRDB calls were synchronous-ish, in-process, never failed transiently, and `loadLinkCounts` was instant. The race window was effectively zero and `catch` was effectively unreachable.

fix: |
  Pass 1 (kept):
  1. Cancel any in-flight loadThoughts before starting a new one (reentrancy guard via stored loadThoughtsTask).
  2. On catch, log but DO NOT wipe `thoughts`. Leave the previous list visible.

  Pass 2 (added):
  3. In `performLoadThoughts`, accumulate fetched results into a local `computed` constant. Only assign to `self.thoughts` AFTER all awaits complete AND `Task.isCancelled == false`. If the task was superseded mid-fetch, return without touching state. This prevents the race where a cancelled-but-still-running Task stomps the newer task's results with stale data after URLSession finally returns.
  4. In `loadLinkCounts`, check `Task.isCancelled` before each iteration of the per-thought count loop and before the final `linkCounts = counts` assignment. Same reasoning — a superseded loadThoughts shouldn't stomp linkCounts.

  Optional follow-up (still not in this fix): replace the per-thought sequential loadLinkCounts loop with a single batched `countLinks(ids:)` API call, or move it off the loadThoughts critical path entirely.

verification: CONFIRMED by user 2026-04-07 after a real bulk-editing session. Pass-2 fix works — list no longer goes blank, stale data no longer appears, category switches are reactive. URLSession-cancellation race fully closed by Task.isCancelled guards in performLoadThoughts and loadLinkCounts.
files_changed:
  - Sources/DailyBriefMonitor/Dashboard/DashboardViewModel.swift
