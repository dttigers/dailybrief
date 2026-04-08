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

