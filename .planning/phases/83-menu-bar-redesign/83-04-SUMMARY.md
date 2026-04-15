---
phase: 83-menu-bar-redesign
plan: 04
subsystem: mac-app
tags: [swift, swiftui, menubar, scheduler, doctor, api-fetch]

# Dependency graph
requires:
  - phase: 83-01
    provides: GET /v1/settings/print-schedule endpoint
  - phase: 83-02
    provides: Trimmed DailyBriefMonitorApp + AppDelegate shell
provides:
  - BriefScheduler.reschedule(hour:minute:enabled:) — atomic time+enabled update from API response
  - DailyBriefMonitorApp .task{} — fetches print-schedule on launch, calls reschedule on success
  - Doctor Check 6 — GET /v1/settings/print-schedule returns 200 with VIGIL_API_KEY
affects:
  - Human verify checkpoint (Task 3) — pending user confirmation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Silent-fallback async API fetch on app launch via .task modifier on MenuBarView
    - Method overloading for backward-compatible reschedule with enabled param

key-files:
  created: []
  modified:
    - Sources/DailyBriefMonitor/BriefScheduler.swift
    - Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift
    - Sources/DailyBrief/DailyBrief.swift

key-decisions:
  - ".task placed on MenuBarView (inside MenuBarExtra content block) rather than on MenuBarExtra scene — compiler accepts view modifier, not scene modifier"
  - "Added import JarvisCore to DailyBriefMonitorApp.swift to bring ConfigLoader into scope"
  - "reschedule(hour:minute:enabled:) is an overload, not a replacement — reschedule(hour:minute:) retained for backward compat"

requirements-completed: [SC-4, SC-6]

# Metrics
duration: 15min
completed: 2026-04-15
---

# Phase 83 Plan 04: Scheduler API Wiring + Doctor Check 6 Summary

**BriefScheduler.reschedule(hour:minute:enabled:) added; DailyBriefMonitorApp fetches print-schedule from API on launch; Doctor Check 6 confirms /v1/settings/print-schedule returns 200**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-15T00:00:00Z
- **Completed:** 2026-04-15T00:15:00Z
- **Tasks:** 2 auto (Task 3 is human-verify checkpoint — pending)
- **Files modified:** 3

## Accomplishments

- `BriefScheduler.reschedule(hour:minute:enabled:)` overload added — sets `scheduledHour`, `scheduledMinute`, and `isScheduleEnabled` (triggering `didSet` which calls `scheduleNextRun()` or `cancelTimer()` atomically)
- `DailyBriefMonitorApp.swift` extended with:
  - `import JarvisCore` (required for `ConfigLoader`)
  - `private struct PrintScheduleResponse: Decodable` at file scope
  - `.task` modifier on `MenuBarView` that fetches `/settings/print-schedule` with 5s timeout, decodes response, and calls `scheduler?.reschedule(hour:minute:enabled:)` on the main actor
- Doctor `Check 6` inserted before the `allPass` summary line: GET `/v1/settings/print-schedule` with Bearer token from `VIGIL_API_KEY`; marks `allPass = false` if not 200
- Both products build clean: `swift build --product DailyBriefMonitor` and `swift build --product DailyBrief`

## Task Commits

1. **Task 1: BriefScheduler + DailyBriefMonitorApp API fetch-on-launch** — `8a229cc` (feat)
2. **Task 2: Doctor Check 6 — print-schedule API reachable** — `c9ecefe` (feat)

## Files Modified

- `Sources/DailyBriefMonitor/BriefScheduler.swift` — added `reschedule(hour:minute:enabled:)` overload (lines 40-47)
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` — added `import JarvisCore`, `PrintScheduleResponse` struct, `.task` modifier with fetch + reschedule call
- `Sources/DailyBrief/DailyBrief.swift` — inserted Check 6 block (19 lines) before `print(allPass ? ...)` summary

## Decisions Made

- `.task` placed on `MenuBarView` (view modifier) rather than on the `MenuBarExtra` scene — the scene-level `.task` is not available as a scene modifier in this SwiftUI version; view modifier fires at app launch equivalently
- `import JarvisCore` added to `DailyBriefMonitorApp.swift` — `ConfigLoader` lives in `JarvisCore`, which `AppDelegate.swift` already imports; no new dependency introduced
- Original `reschedule(hour:minute:)` retained unchanged for backward compatibility with existing call sites

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `import JarvisCore` to DailyBriefMonitorApp.swift**
- **Found during:** Task 1 (first build attempt)
- **Issue:** `ConfigLoader` in `.task` body triggered "cannot find 'ConfigLoader' in scope" — `DailyBriefMonitorApp.swift` only imported `SwiftUI`, not `JarvisCore`
- **Fix:** Added `import JarvisCore` at top of file
- **Files modified:** `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift`
- **Commit:** `8a229cc` (included in Task 1 commit)

## Human Verify Checkpoint (Task 3) — PENDING

Task 3 is a `checkpoint:human-verify` gate. The following 6 criteria must be confirmed by the user:

1. **SC-1:** No Dock icon — only the menubar icon (doc.text) is visible after `./Scripts/install.sh` + launch
2. **SC-2:** Menu shows "Next brief: [time]" + Print Now + Quick Capture; NO Dashboard or Settings buttons
3. **SC-3:** PWA Settings at https://vigil.jamesonmorrill.me/settings shows Print Schedule card; time/enabled save successfully
4. **SC-4:** After saving new time in PWA, quit + relaunch Mac app → menu shows updated schedule time
5. **SC-5:** `ls Sources/DailyBriefMonitor/Dashboard/` returns empty or "No such file or directory"
6. **SC-6:** `~/.local/bin/DailyBrief doctor` shows all 6 checks as [PASS] and exits "=== All checks passed ==="

**Status:** Awaiting user verification. Resume signal: user types "approved".

## Threat Model Compliance

- T-83-13: `try? JSONDecoder().decode(PrintScheduleResponse.self, ...)` — malformed JSON causes silent fallback. Mitigated.
- T-83-14: `URLRequest(url:, timeoutInterval: 5)` — 5-second cap prevents hang. Mitigated.
- T-83-15: All requests go to `https://api.vigilhub.io` (TLS). Accepted.
- T-83-16: Config file is user-controlled. Accepted (pre-existing condition).

## Known Stubs

None — no stub values introduced.

## Self-Check: PASSED

- FOUND: `reschedule(hour: Int, minute: Int, enabled: Bool)` in BriefScheduler.swift line 42
- FOUND: `settings/print-schedule` fetch in DailyBriefMonitorApp.swift line 69
- FOUND: `print-schedule API reachable` in DailyBrief.swift line 607
- FOUND: commit 8a229cc (Task 1)
- FOUND: commit c9ecefe (Task 2)
- CONFIRMED: `swift build --product DailyBriefMonitor` exits 0
- CONFIRMED: `swift build --product DailyBrief` exits 0

---
*Phase: 83-menu-bar-redesign*
*Completed: 2026-04-15 (Task 3 human-verify pending)*
