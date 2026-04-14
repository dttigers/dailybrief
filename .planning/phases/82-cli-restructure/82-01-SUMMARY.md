---
phase: 82-cli-restructure
plan: 01
subsystem: cli
tags: [swift, argumentparser, dailybrief, cli, subcommands]

# Dependency graph
requires: []
provides:
  - "Capture, Triage, Doctor, Setup subcommands registered in DailyBrief CLI"
  - "Complete/Uncomplete/ListCompleted retired with dashboard redirect (exit 0)"
  - "createTemplateConfig() extracted to Setup.createTemplateConfig() static func"
  - "--setup flag shimmed to Setup.createTemplateConfig() with deprecation warning"
affects:
  - 82-02
  - 82-03

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stub subcommands: AsyncParsableCommand with print placeholder in run(), ready for Plan 02 implementation"
    - "Static func on subcommand struct for shared config logic callable from sibling commands"

key-files:
  created: []
  modified:
    - Sources/DailyBrief/DailyBrief.swift
    - Sources/JarvisCore/Services/APIAIServices.swift

key-decisions:
  - "createTemplateConfig() promoted to Setup.createTemplateConfig() static — callable from both Setup.run() and Generate's deprecated --setup shim without duplication"
  - "Retired commands keep @Argument/@Option declarations so ArgumentParser still parses args (no crash on 'dailybrief complete CS0001 --status done')"

patterns-established:
  - "Stub pattern: struct with full flag/arg declarations, run() prints [stub] message — Wave 2 plans replace run() body only"

requirements-completed: [CLI-04, CLI-05, CLI-06, CLI-07, CLI-08]

# Metrics
duration: 8min
completed: 2026-04-14
---

# Phase 82 Plan 01: CLI Restructure Entry Point Summary

**Four new ArgumentParser subcommands (Capture/Triage/Doctor/Setup) scaffolded with full flag declarations; three WO commands retired to dashboard redirect; --setup flag shimmed with deprecation warning**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-14T20:13:00Z
- **Completed:** 2026-04-14T20:21:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Registered Capture, Triage, Doctor, Setup in CommandConfiguration.subcommands alongside existing Generate/History/Export/EmailAuth
- Capture stub includes full arg/flag surface: `<text>`, `--category`, `--no-triage`, `--source`
- Triage stub includes `--limit`, `--force`; Doctor and Setup include only their abstracts
- Extracted `createTemplateConfig()` from Generate to `Setup.createTemplateConfig()` static func; Generate's `--setup` flag now prints deprecation warning and delegates to it
- Complete, Uncomplete, ListCompleted run() bodies replaced with two-line dashboard redirect — args still parsed (no crash), exit 0
- Fixed pre-existing exhaustive switch error in APIAIServices.swift blocking build

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Add stubs + smoke test** - `ca88aa8` (feat)

## Files Created/Modified
- `Sources/DailyBrief/DailyBrief.swift` - New Capture/Triage/Doctor/Setup structs; retired WO command run() bodies; --setup shim
- `Sources/JarvisCore/Services/APIAIServices.swift` - Added missing `.encodingError` case to exhaustive switch (pre-existing blocker)

## Decisions Made
- `createTemplateConfig()` promoted to `static func` on `Setup` so both `Setup.run()` and the `Generate --setup` shim can call it without code duplication
- Retired commands retain all `@Argument`/`@Option` declarations to prevent ArgumentParser crash when users pass args (e.g., `dailybrief complete CS0001`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed exhaustive switch error in APIAIServices.swift**
- **Found during:** Task 1 build verification
- **Issue:** `VigilAPIError.encodingError` case was added to the enum in a prior phase but the switch in `processPhoto()` wasn't updated — caused `switch must be exhaustive` compiler error blocking the build
- **Fix:** Added `case .encodingError(let underlying): throw ProcessPhotoError.transport(underlying)` to the switch
- **Files modified:** Sources/JarvisCore/Services/APIAIServices.swift
- **Verification:** `swift build` completed with `Build complete!` — zero errors
- **Committed in:** ca88aa8 (task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix was necessary to unblock the build. No scope creep — single line added to an existing switch.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `Capture.run()` prints `[capture stub]` | Sources/DailyBrief/DailyBrief.swift | Intentional — Plan 02 implements full capture logic |
| `Triage.run()` prints `[triage stub]` | Sources/DailyBrief/DailyBrief.swift | Intentional — Plan 02 implements triage logic |
| `Doctor.run()` prints `[doctor stub]` | Sources/DailyBrief/DailyBrief.swift | Intentional — Plan 03 implements health checks |

These stubs are intentional scaffolding. Wave 2 plans (82-02, 82-03) will replace run() bodies with full implementations.

## Issues Encountered
None — build error was a pre-existing unrelated issue in APIAIServices.swift, handled via Rule 3.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI command surface is fully scaffolded — Plan 82-02 can implement Capture and Triage logic against the registered subcommand structs
- Plan 82-03 can implement Doctor health checks
- Wave 2 plans only need to replace `run()` bodies; argument/flag declarations are already in place

---
*Phase: 82-cli-restructure*
*Completed: 2026-04-14*
