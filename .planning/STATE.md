# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-31)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 2 — Text Capture (in progress)

## Current Position

Phase: 2 of 7 (Text Capture) — IN PROGRESS
Plan: 02 complete (global hotkey for capture panel)
Status: Plan 02-02 done, ready for Plan 02-03
Last activity: 2026-04-01 — Plan 02-02 complete (Cmd+Shift+J global hotkey via Carbon API)

Progress: ██▓░░░░░░░ ~25%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 3.8 min
- Total execution time: 0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 10 min | 3.3 min |
| 02-text-capture | 2 | 10 min | 5.0 min |

**Recent Trend:**
- Last 5 plans: 01-02 (5 min), 01-03 (2 min), 02-01 (5 min), 02-02 (5 min)
- Trend: stable

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- 01-01: Used `.target` for JarvisCore (library, not executable)
- 01-01: GRDB resolved to 7.10.0 (latest stable 7.x)
- 01-02: DatabaseManager write/reader are nonisolated (DatabaseQueue is thread-safe)
- 01-02: FTS5 uses content-sync with unicode61 tokenizer
- 01-02: FTS5Pattern(matchingAllTokensIn:) for safe user input handling
- 01-03: Explicit public init on all JarvisCore structs (synthesized memberwise inits become internal when type is public)
- 01-03: ConfigError made public with public errorDescription for cross-module error handling
- 02-01: CaptureView takes closures (not service directly) for testability
- 02-01: AppDelegate handles DB init failure gracefully (logs, doesn't crash)
- 02-01: @MainActor on toggleCapture() for Swift 6 actor isolation compliance
- 02-02: Carbon RegisterEventHotKey over NSEvent.addGlobalMonitorForEvents (no Accessibility permissions)
- 02-02: Direct panel capture in hotkey closure (avoids Swift 6 Sendable data race errors)
- 02-02: Task { @MainActor } bridge for calling UI from Carbon callback

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-01
Stopped at: Plan 02-02 complete — Cmd+Shift+J global hotkey via Carbon API toggles floating capture panel from any app
Resume file: .planning/phases/02-text-capture/02-02-SUMMARY.md
