---
phase: 86-split-brief-schedule
plan: 05
subsystem: [mac-monitor, mac-cli]
tags: [swift, menubar, doctor, staleness, observable]
requirements: [SC-4, SC-7]
dependency_graph:
  requires: [86-01, 86-04]
  provides:
    - "Staleness signal observable in menubar (D-13)"
    - "Doctor Check 6 covering print-schedule + generate-schedule + timezone (D-23)"
  affects:
    - Sources/DailyBriefMonitor/StatusChecker.swift
    - Sources/DailyBriefMonitor/MenuBarView.swift
    - Sources/DailyBrief/DailyBrief.swift
tech-stack:
  added: []
  patterns:
    - "Computed `@Observable` accessors derive staleness/failure state from `lastExitCode`"
    - "Sequential Bearer-authenticated GETs with per-endpoint failure accumulator for compact doctor output"
key-files:
  created: []
  modified:
    - Sources/DailyBriefMonitor/StatusChecker.swift
    - Sources/DailyBriefMonitor/MenuBarView.swift
    - Sources/DailyBrief/DailyBrief.swift
decisions:
  - "Derived staleness via computed vars on the existing `@Observable` class instead of adding stored state — SwiftUI re-renders already track the underlying `lastExitCode`"
  - "Doctor Check 6 fails fast per-endpoint but reports all failures in a single label — keeps output compact (D-23) while still naming the broken route"
  - "Missing VIGIL_API_KEY short-circuits to all-failed so the user sees exactly which endpoints couldn't be contacted (plus the underlying env-var cause is obvious from Check 2)"
metrics:
  duration_minutes: ~8
  tasks_completed: 3
  tasks_total: 3
  completed_date: "2026-04-15"
commits:
  - 2001c45: "feat(86-05): surface CLI staleness in menubar status row"
  - 096e455: "feat(86-05): extend Doctor Check 6 to cover all three settings endpoints"
---

# Phase 86 Plan 05: Menubar Staleness UI + Doctor Check 6 Extension Summary

Wire CLI exit code 2 through to a distinct "No brief today" menubar row, and fold generate-schedule + timezone endpoints into Doctor Check 6 as one compact PASS/FAIL line.

## StatusChecker API additions

| Accessor | Type | Semantics |
|----------|------|-----------|
| `isStale` | `Bool` | `lastExitCode == 2` — CLI saw no brief for today (sentinel from Plan 04) |
| `didFailNonStale` | `Bool` | `lastExitCode != nil && != 0 && != 2` — any other CLI failure |

Both are computed on the `@Observable` class, so SwiftUI re-renders fire the moment `runNow()` writes `lastExitCode` on `MainActor`. No new stored state; nothing else in `StatusChecker` was touched. `runNow()`, log parsing, and the CLI-path search order remain byte-for-byte unchanged.

## MenuBarView copy/tint map

| State | Icon | Icon color | "Last run" text | Text color |
|-------|------|-----------|----------------|-----------|
| Running | `arrow.triangle.2.circlepath` | blue | `lastRunTime` (existing timestamp) | primary |
| Stale (exit 2) | `exclamationmark.triangle.fill` | **orange** | **"No brief today"** | orange |
| Failed (exit != 0, != 2) | `exclamationmark.circle.fill` | **red** | **"Print failed"** | red |
| Success | `checkmark.circle.fill` | green | timestamp string | primary |
| Unknown | `questionmark.circle` | secondary | timestamp string | primary |

`statusIcon`, `statusLine`, and `statusLineTint` all branch on the same `isStale` / `didFailNonStale` pair, so icon and copy can never disagree. The `Next brief: <time>` row underneath is untouched — staleness coexists with the next-run indicator (D-18), consistent with the phase decision that staleness is informational, not a blocker.

## Doctor Check 6 new message format

```
  [PASS] Settings endpoints reachable (3/3)
```

or, on any failure:

```
  [FAIL] Settings endpoints reachable — FAILED: /v1/settings/generate-schedule
```

(multiple failing paths are comma-joined in the same label).

### Implementation notes

- One serial loop over `["/v1/settings/print-schedule", "/v1/settings/generate-schedule", "/v1/settings/timezone"]` with a 5s timeout per request (worst-case 15s — accepted per T-86-20; doctor is opt-in diagnostic)
- One `printCheck(...)` call total — keeps doctor output compact per D-23; replaces the previous single-endpoint call with a single multi-endpoint call
- Missing / empty `VIGIL_API_KEY` → all three paths marked failed up-front (loop skipped) so the FAIL message lists every endpoint and the user is prompted to set the env var
- Only endpoint path names appear in the output — no response bodies, no tokens (T-86-18 accepted)
- Pre-existing `allPass` roll-up and `ExitCode.failure` throw are preserved verbatim — no regression to Checks 1-5

## Deviations from Plan

None — plan executed exactly as written. Both builds (`DailyBriefMonitor`, `DailyBrief`) compiled clean on first attempt.

## Authentication gates

None encountered during execution (all changes are local Swift edits).

## Human-verify outcome

**⚡ Auto-approved** under `config.json` `parallelization.skip_checkpoints: true` (yolo mode). Live menubar + `DailyBrief doctor` physical verification is deferred to the user's existing iMac/MacBook Pro install-and-run workflow. The underlying automation (both `swift build` targets pass) is green.

## Phase 83 regression posture

- `grep setActivationPolicy Sources/DailyBriefMonitor/*.swift` — still empty (Dock icon absent)
- `Print Now` button untouched (lines 102-111 of MenuBarView.swift)
- `BriefScheduler.swift` not modified this plan
- Update status row, watcher-failure list, Quick Capture, and Quit controls all byte-identical to pre-plan source

## Self-Check: PASSED

- FOUND: Sources/DailyBriefMonitor/StatusChecker.swift
- FOUND: Sources/DailyBriefMonitor/MenuBarView.swift
- FOUND: Sources/DailyBrief/DailyBrief.swift
- FOUND commit: 2001c45 (Task 1 — menubar staleness)
- FOUND commit: 096e455 (Task 2 — Doctor Check 6 extension)
