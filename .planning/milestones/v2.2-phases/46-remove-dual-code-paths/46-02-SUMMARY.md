---
phase: 46-remove-dual-code-paths
plan: 02
subsystem: ai, config
tags: [swift, claude-api, vigil-api, code-cleanup]

# Dependency graph
requires:
  - phase: 29-36 (v2.0 Vigil Platform)
    provides: API-backed AI service implementations in APIAIServices.swift
provides:
  - Local Claude AI service files deleted (6 files, 1022 lines removed)
  - AppConfig simplified with top-level apiBaseUrl and apiKey fields
  - VigilConfig struct and useApi toggle removed from public API
affects: [46-03-appdelegate-simplify, 46-04-cli-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: [api-only-mode, backward-compat-config-decoding]

key-files:
  created: []
  modified:
    - Sources/JarvisCore/Config/AppConfig.swift

key-decisions:
  - "Kept private VigilConfig struct for backward-compatible decoding of old config files"
  - "Kept folderWatching and cloudSync config sections — still referenced by Monitor app, will be removed in Plan 03"

patterns-established:
  - "API-only mode: no local Claude service fallback"
  - "Config migration: old nested vigil section decoded into top-level fields"

# Metrics
duration: 4min
completed: 2026-04-05
---

# Plan 02: Remove Local AI Services & Config Toggle Summary

**Deleted 6 local Claude AI service files (1022 lines) and promoted API connection fields to top-level AppConfig**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05
- **Completed:** 2026-04-05
- **Tasks:** 2
- **Files modified:** 7 (6 deleted, 1 modified)

## Accomplishments
- Deleted all 6 local Claude AI service implementations (TriageService, InsightService, ImageDescriptionService, TherapyClassificationService, TherapyPatternService, TherapyPrepService)
- Removed public VigilConfig struct and useApi toggle from AppConfig
- Promoted apiBaseUrl and apiKey to top-level AppConfig fields with defaults
- Added backward-compatible decoding for old config files with nested vigil section

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete local AI service implementations** - `0451c27` (refactor)
2. **Task 2: Remove vigil.useApi config toggle** - `0182fab` (refactor)

## Files Created/Modified
- `Sources/JarvisCore/Services/TriageService.swift` - Deleted (local Claude triage)
- `Sources/JarvisCore/Services/InsightService.swift` - Deleted (local Claude insights)
- `Sources/JarvisCore/Services/ImageDescriptionService.swift` - Deleted (local Claude image description)
- `Sources/JarvisCore/Services/TherapyClassificationService.swift` - Deleted (local Claude therapy classification)
- `Sources/JarvisCore/Services/TherapyPatternService.swift` - Deleted (local Claude therapy patterns)
- `Sources/JarvisCore/Services/TherapyPrepService.swift` - Deleted (local Claude therapy prep)
- `Sources/JarvisCore/Config/AppConfig.swift` - Removed VigilConfig, promoted API fields

## Decisions Made
- Kept private VigilConfig struct inside AppConfig for backward-compatible decoding of old config files that have a nested `vigil` section
- Did not remove folderWatching/cloudSync config sections despite plan suggestion — they are still heavily referenced by Monitor app code and will be cleaned up in Plan 03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Backward-compatible config migration**
- **Found during:** Task 2 (Config toggle removal)
- **Issue:** Old config files have nested `vigil: { useApi, apiBaseUrl, apiKey }` structure. Simply removing VigilConfig would break config loading for existing users.
- **Fix:** Added private VigilConfig struct for decode-only migration. Old nested format is decoded and values promoted to top-level fields.
- **Files modified:** Sources/JarvisCore/Config/AppConfig.swift
- **Verification:** Private struct only used in init(from:), not exposed publicly
- **Committed in:** 0182fab (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for backward compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 03 (wave 2) can now simplify AppDelegate to API-only initialization
- Plan 04 can clean up CLI target references
- Consumer code (AppDelegate, DailyBrief.swift) still references old VigilConfig paths — will be updated in Plans 03/04

---
*Phase: 46-remove-dual-code-paths*
*Completed: 2026-04-05*
