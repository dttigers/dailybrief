---
phase: 82-cli-restructure
plan: 02
subsystem: cli
tags: [swift, argumentparser, dailybrief, cli, capture, triage, doctor]

# Dependency graph
requires:
  - 82-01
provides:
  - "Full Capture subcommand: POST /thoughts + POST /triage + PUT /thoughts/:id"
  - "Full Triage subcommand: batch triage uncategorized thoughts with --limit and --force"
  - "Full Doctor subcommand: 5-check health report for Vigil environment"
affects:
  - 82-03

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline Encodable/Decodable structs scoped inside run() for request/response shapes — no top-level type pollution"
    - "Triage client-side null filter: fetch limit*3, filter category==nil, prefix to limit — workaround for API lacking ?category=null"
    - "Non-fatal triage in capture: capture success + triage failure = saved without category, exits 0"
    - "Doctor uses Process() + Pipe() for launchctl subprocess check; URLSession with 5s timeout for health check"

key-files:
  created: []
  modified:
    - Sources/DailyBrief/DailyBrief.swift

key-decisions:
  - "Triage failure in capture is non-fatal — thought is saved and capture exits 0; user sees 'Triage unavailable' message"
  - "Client-side null filter for triage batch: fetch min(limit*3, 200) thoughts, filter category==nil — avoids need for unsupported ?category=null API param"
  - "Doctor exits 1 (ExitCode.failure) if ANY check fails — enables use in shell scripts and CI"

# Metrics
duration: 5min
completed: 2026-04-14
---

# Phase 82 Plan 02: Capture + Triage + Doctor Implementations Summary

**Full implementations for Capture (POST /thoughts + /triage), Triage (batch uncategorized + PUT back), and Doctor (5-check health report) replacing Plan 01 stubs**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-14T20:19:00Z
- **Completed:** 2026-04-14T20:24:28Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Implemented `Capture.run()`: POSTs to /thoughts, auto-triages via /triage (unless `--no-triage` or `--category`), PUTs category back onto thought, prints category + confidence% to stdout
- Implemented `Triage.run()`: fetches up to `limit*3` recent thoughts, filters uncategorized client-side (API lacks `?category=null`), triages each via /triage, persists category via PUT, prints per-thought progress; `--force` skips null filter; `--limit` caps count
- Implemented `Doctor.run()`: 5-check health report with `[PASS]`/`[FAIL]` per line — VIGIL_API_KEY env var, vigil-core /v1/health reachable (5s timeout), LaunchAgent plist file exists, launchctl reports loaded, plist binary path exists; exits 1 if any fail
- Build passes with zero errors; all `--help` outputs show correct flag surfaces

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Capture** — `96ffab0` (feat)
2. **Task 2: Implement Triage + Doctor** — `b309e4a` (feat)

## Files Created/Modified

- `Sources/DailyBrief/DailyBrief.swift` — Replaced Capture/Triage/Doctor stub run() bodies with full implementations (~228 lines added)

## Decisions Made

- Triage failure in `capture` is non-fatal — thought is already saved when triage is called; losing the category is preferable to surfacing a capture failure to the user
- Client-side null filter for batch triage: fetch `min(limit*3, 200)` thoughts and filter `category == nil` locally, because the API lacks a `?category=null` query parameter
- Doctor exits 1 if any check fails — makes the command useful in shell scripts, CI health checks, and the planned `dailybrief-doctor.sh` integration

## Deviations from Plan

None — plan executed exactly as written. Both implementations match the code blocks in the plan spec verbatim; no deviations, no rule triggers.

## Known Stubs

None — all three subcommands are fully implemented. The `// MARK: - Capture (stub)` comment headers in the file are leftover section labels from Plan 01 naming; they do not indicate unimplemented code.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. All API calls go through the existing `VigilAPIClient` which already applies Bearer auth. Doctor prints local filesystem paths (no secrets). No new threat surface beyond what the plan's threat model documents.

## Issues Encountered

None.

## User Setup Required

None — implementations use the existing config at `~/.config/dailybrief/config.json`. The `VIGIL_API_KEY` env var is checked by `doctor` but not required by `capture`/`triage` (they use the config file's `api_key`).

## Next Phase Readiness

- Plan 82-03 (Setup + retire) can proceed; Doctor and Triage are complete
- All three CLI commands can be tested end-to-end against production (`api.vigilhub.io`)
- `dailybrief capture "text"` and `dailybrief triage` are production-ready

---
*Phase: 82-cli-restructure*
*Completed: 2026-04-14*

## Self-Check: PASSED

- FOUND: Sources/DailyBrief/DailyBrief.swift
- FOUND commit: 96ffab0
- FOUND commit: b309e4a
- FOUND: .planning/phases/82-cli-restructure/82-02-SUMMARY.md
