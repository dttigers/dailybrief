---
status: partial
phase: 86-split-brief-schedule
source:
  - 86-01-SUMMARY.md
  - 86-02-SUMMARY.md
  - 86-03-SUMMARY.md
  - 86-04-SUMMARY.md
  - 86-05-SUMMARY.md
started: 2026-04-15
updated: 2026-04-15
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: |
  vigil-core boots from scratch, logs both "Vigil Core API running" and "[generate-scheduler] started (60s tick interval)", /v1/health returns 200.
result: pass
notes: |
  Scheduler log appeared. /v1/health returns degraded (database: unavailable) — pre-existing dev-env issue, not Phase 86 regression. May block Test 5.

### 2. Menubar Staleness Path (exit 2)
expected: |
  When DailyBrief CLI exits 2 (no brief for today), menubar status row shows orange "No brief today ⚠".
result: issue
reported: "no change in menu app after external CLI run produced exit 2"
severity: blocker
diagnosis: |
  StatusChecker.lastExitCode is ONLY set inside runNow() (menubar-initiated runs). External CLI
  invocations (launchd/cron/terminal) never update lastExitCode, so isStale stays false.
  Additionally, refresh() parses log for markers "DailyBrief complete"/"ERROR"/"DailyBrief starting"
  — but pull-only staleness line "No brief for today" matches none, so lastRunTime shows "No runs found".
  Fix: refresh() must infer staleness from log line "No brief for today (YYYY-MM-DD)" and set
  lastExitCode = 2 (or equivalent state). Must also handle other exit-code failure modes from logs.
artifacts:
  - Sources/DailyBriefMonitor/StatusChecker.swift:38-70 (refresh method)
  - Sources/DailyBriefMonitor/StatusChecker.swift:11-17 (isStale/didFailNonStale)
missing:
  - External-run exit-code inference in StatusChecker.refresh()

### 3. Menubar Success Path
expected: |
  When DailyBrief CLI succeeds, menubar shows green checkmark + timestamp, PDF printed via lpr.
result: blocked
blocked_by: server
reason: "DB unavailable in dev env (DATABASE_URL not set) — cannot seed a brief for today to trigger success path. Retest after setting DATABASE_URL."

### 4. Doctor Check 6 — Settings Endpoints
expected: |
  Compact single-line PASS/FAIL covering all 3 settings endpoints; FAIL message names broken endpoint paths.
result: pass
notes: |
  Output: "[FAIL] Settings endpoints reachable — FAILED: /v1/settings/print-schedule, /v1/settings/generate-schedule, /v1/settings/timezone"
  Format correct (compact + all 3 paths listed on fail). FAIL itself expected — doctor targets api.vigilhub.io (prod Railway) which hasn't deployed Phase 86 yet.
  Side findings (out of scope): VIGIL_API_KEY env missing (pre-existing); doctor hard-codes production URL — worth a local-mode flag in a future phase.

### 5. Server Generate Cron Smoke
expected: |
  Server-side scheduler fires at configured time; new brief row inserted; retention sweep logged.
result: blocked
blocked_by: server
reason: "DB unavailable in dev env — scheduler runs but cannot persist briefs. Retest after setting DATABASE_URL."

### 6. PWA Settings UI Render
expected: |
  Two ScheduleCards + Timezone picker; browser tz autofill; invalid time rejected.
result: pass

### 7. DST Boundary Dedupe (optional — hard to test)
expected: |
  Scheduler handles fall-back dedupe and spring-forward gap correctly.
result: skipped
reason: |
  No live DST boundary in current window. SCH-08 tests EST/EDT TZ math via Intl.DateTimeFormat
  (DST-aware by design), but no explicit fall-back-twice or spring-forward-gap test exists.
  Risk accepted — Intl handles DST transitions; 10-min dedupe window is coarse enough to prevent
  double-fire in fall-back. Add explicit DST tests if issues surface in production.

## Summary

total: 7
passed: 3
issues: 1
blocked: 2
skipped: 1
pending: 0

## Gaps

- truth: "Menubar displays orange 'No brief today' when CLI exits 2 (including externally-invoked runs)"
  status: failed
  reason: "StatusChecker.lastExitCode only set by runNow(); external CLI runs leave it nil and refresh() doesn't parse 'No brief for today' log line. Menubar shows no change."
  severity: blocker
  test: 2
  artifacts:
    - Sources/DailyBriefMonitor/StatusChecker.swift:38-70
    - Sources/DailyBriefMonitor/StatusChecker.swift:11-17
  missing:
    - Log-based staleness inference in StatusChecker.refresh()
    - Generic exit-code inference from log markers for non-runNow() CLI invocations
