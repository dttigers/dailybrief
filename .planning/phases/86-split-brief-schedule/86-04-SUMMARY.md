---
phase: 86-split-brief-schedule
plan: 04
subsystem: mac-cli
tags: [swift, cli, mac, pull-only, staleness, exit-codes]
requirements: [CLI-01, CLI-02, CLI-03, SC-3, SC-4]
dependency_graph:
  requires:
    - Phase 86 Plan 02 (server cron must populate today's brief)
  provides:
    - Pull-only CLI fetch path
    - Exit code 2 staleness sentinel (for Plan 05 menubar)
  affects:
    - DailyBriefMonitor (surfaces staleness via Doctor Check 6 in Plan 05)
tech_stack:
  added: []
  patterns:
    - ArgumentParser ExitCode(rawValue: 2) for non-standard exit codes
    - Swift typed catch with pattern `let VigilAPIError.httpError(statusCode, _) where ...`
key_files:
  created: []
  modified:
    - Sources/DailyBrief/DailyBrief.swift
decisions:
  - Mac CLI local TZ used for brief date; user-TZ drift deferred (acceptable v3.0)
  - No retry on 404 — staleness surfaced via exit code, not loop
metrics:
  duration: ~4min
  tasks: 1
  files: 1
  completed: 2026-04-15
commit: 80ace89
---

# Phase 86 Plan 04: Mac CLI Pull-Only Mode + Staleness Exit Code Summary

Replaced `DailyBrief` CLI's `Generate.run()` POST to `/v1/brief/generate` with a pull-only GET to `/v1/brief/<today>`; added exit code 2 as a 404 staleness sentinel while keeping exit 0 on success and exit 1 for all other errors.

## What Was Delivered

### Exit Code Contract (new, stable)

| Exit Code | Meaning | Trigger |
|-----------|---------|---------|
| 0 | Success | 200 response; PDF written and (unless `--no-print`) sent to `lpr` |
| 1 | Error | Any non-404 failure (network, 5xx, auth, disk write, print) |
| 2 | Staleness | 404 response — no brief exists for today; Logger logs "No brief for today (<date>)" |

Exit code 2 is the contract consumed by Plan 05's menubar Doctor Check 6 to surface staleness.

### What Was Removed

- `apiClient.postRawData(path: "/v1/brief/generate", ...)` call inside `Generate.run()`
- Dry-run log line "Dry run: would call POST /v1/brief/generate"
- All references to `/v1/brief/generate` inside `Generate` (other subcommands untouched — grep of file returns zero matches)

### What Stayed

- `Setup` deprecation branch (unchanged)
- `ConfigLoader.load` + `makeAPIClient` wiring (unchanged)
- Output directory expansion + `ensureDirectoryExists` (unchanged)
- `daily_sheet_<YYYY-MM-DD>.pdf` filename convention (unchanged; date now computed once)
- `PrintService.printPDF` invocation gated by `--no-print` (unchanged)
- `cleanupOldPDFs` keep-days cleanup (unchanged)
- All other subcommands (History, Export, Capture, Triage, Doctor, Setup, Complete, Uncomplete, ListCompleted, EmailAuth) — untouched

### What Was Added

- Local-TZ date formatter (computed once, reused for URL path + filename)
- Typed catch clause: `catch let VigilAPIError.httpError(statusCode, _) where statusCode == 404` → `throw ExitCode(rawValue: 2)`
- Generic fallback catch → `throw ExitCode.failure` (exit 1)

## Verification

- `swift build --product DailyBrief` — succeeded (42.91s)
- `swift build --product DailyBriefMonitor` — succeeded (11.07s) — Plan 05 stays green
- `./.build/debug/DailyBrief --dry-run` → `Dry run: would GET /v1/brief/2026-04-15`, exit 0
- `grep "ExitCode(rawValue: 2)"` → present at line inside Generate
- `grep "No brief for today"` → present
- `grep "/v1/brief/generate"` → zero matches (dead path removed per D-14)
- `awk '/struct Generate:/,/^    }$/' | grep -c postRawData` → 0

## Deviations from Plan

None — plan executed exactly as written.

## Notes / Known Caveats

### Local-TZ vs User-TZ mismatch (accepted for v3.0)

The Mac CLI formats "today" using `TimeZone.current` (the Mac's local timezone). The server stores briefs keyed by the user's configured timezone (`storage_key = today-in-user-TZ` per D-01). In practice these match for a single-user setup where the Mac physically sits in the same TZ as the configured preference.

**Edge case:** If a user sets `timezone` in the PWA to something different from their Mac's system clock (e.g., traveling, or intentionally pinning the user TZ to home while the Mac roams), the CLI may request a date that doesn't exist server-side and get 404 → exit 2 (staleness). The menubar will then flag it as stale even though a brief exists for the user-TZ-today.

**Resolution deferred:** For v3.0 we assume Mac local TZ == user TZ. A future plan could have the CLI GET `/v1/settings/timezone` first and format "today" using the server's user TZ. Tracked as a follow-up rather than blocking this plan.

### No retry loop (T-86-16 mitigation)

Single request, no exponential backoff. The `BriefScheduler` (or external cron) fires tomorrow; today's 404 simply surfaces as staleness and the menubar prompts the user.

### CLI cannot trigger server-side generate (T-86-17 mitigation)

The POST `/v1/brief/generate` call path is gone from `Generate`. Only the PWA's "Generate Now" button (D-16) can trigger server-side generation now. CLI is strictly read.

## Threat Flags

None — no new trust-boundary surface introduced. All changes narrow the CLI's capabilities (removed POST, added exit code variant).

## Self-Check: PASSED

- FOUND: Sources/DailyBrief/DailyBrief.swift (modified)
- FOUND: commit 80ace89 in git log
- FOUND: `ExitCode(rawValue: 2)` in Generate.run()
- FOUND: `getRawData(path: "/v1/brief/\(today)"` in Generate.run()
- MISSING: `/v1/brief/generate` (intentionally removed — zero matches in file)
- VERIFIED: Both products (`DailyBrief`, `DailyBriefMonitor`) build clean
- VERIFIED: Dry-run output mentions GET, not POST
