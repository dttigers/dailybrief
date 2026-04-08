---
phase: 17-multi-sport-support
plan: 01
subsystem: models, config
tags: [espn, nfl, nba, nhl, mlb, team-data, multi-sport]

requires:
  - phase: 10-sports-ui-daily-brief
    provides: MLBTeamData pattern and SportsConfig with teamName/divisionName
provides:
  - NFLTeamData model (32 teams, 8 divisions, verified ESPN IDs)
  - NBATeamData model (30 teams, 6 divisions, verified ESPN IDs)
  - NHLTeamData model (32 teams, 4 divisions, verified ESPN IDs)
  - Multi-sport SportsConfig with per-league SportLeagueConfig
  - Backward-compatible config decoding (old flat format -> mlb config)
  - enabledSports computed property
affects: [17-02-espn-service, 17-03-settings-ui, 17-04-pdf-rendering]

tech-stack:
  added: []
  patterns: [per-league SportLeagueConfig struct, conference/division ID pattern across sports]

key-files:
  created:
    - Sources/JarvisCore/Models/NFLTeamData.swift
    - Sources/JarvisCore/Models/NBATeamData.swift
    - Sources/JarvisCore/Models/NHLTeamData.swift
  modified:
    - Sources/JarvisCore/Config/AppConfig.swift
    - Sources/DailyBrief/Services/SportsService.swift
    - Sources/DailyBrief/DailyBrief.swift
    - Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift

key-decisions:
  - "Verified all ESPN team IDs against live API — plan's NHL IDs were significantly wrong"
  - "NHL Utah team is now 'Utah Mammoth' (id 129764), not 'Utah Hockey Club'"
  - "NFL conference IDs: AFC=8, NFC=7 (plan said NFC=9, actual ESPN is 7)"
  - "NBA conference IDs: Eastern=5, Western=6"
  - "NHL conference IDs: Eastern=7, Western=8; Division IDs: Atlantic=32, Metropolitan=33, Central=31, Pacific=30"
  - "Custom encode(to:) needed to avoid Encodable conflict from dual CodingKeys"

patterns-established:
  - "SportLeagueConfig: generic per-league config with enabled, teamId, divisionId, conferenceId, teamName, divisionName"
  - "Team data enums: allTeams array + team(forId:) + teams(inDivision:) + divisionNames"

duration: 12min
completed: 2026-04-03
---

# Plan 17-01: Team Data Models & Multi-Sport Config Summary

**NFL/NBA/NHL team data models with verified ESPN IDs and backward-compatible multi-sport SportsConfig**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-03
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created NFLTeamData (32 teams), NBATeamData (30 teams), NHLTeamData (32 teams) with ESPN-verified IDs
- Refactored SportsConfig to nested per-league SportLeagueConfig with enable flags
- Maintained full backward compatibility with existing flat config.json format

## Task Commits

Each task was committed atomically:

1. **Task 1: Create NFL, NBA, NHL team data models** - `b895117` (feat)
2. **Task 2: Refactor AppConfig for multi-sport support** - `3c4bfe2` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Models/NFLTeamData.swift` - 32 NFL teams with ESPN IDs, division/conference grouping
- `Sources/JarvisCore/Models/NBATeamData.swift` - 30 NBA teams with ESPN IDs, division/conference grouping
- `Sources/JarvisCore/Models/NHLTeamData.swift` - 32 NHL teams with ESPN IDs, division/conference grouping
- `Sources/JarvisCore/Config/AppConfig.swift` - Multi-sport SportsConfig with SportLeagueConfig
- `Sources/DailyBrief/Services/SportsService.swift` - Updated to accept SportLeagueConfig
- `Sources/DailyBrief/DailyBrief.swift` - Updated to pass config.sports.mlb
- `Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift` - Updated config building for new structure

## Decisions Made
- Verified all ESPN team IDs against live API rather than trusting plan values — NHL IDs were significantly wrong
- NFL NFC conferenceId is 7 (not 9 as plan stated)
- NHL uses conferenceId 7=Eastern, 8=Western with divisionIds 30-33
- Utah team is now "Utah Mammoth" (ESPN id 129764), not "Utah Hockey Club"
- Added custom encode(to:) to only encode new nested format while decode supports both formats

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Data Accuracy] Corrected NHL ESPN team IDs**
- **Found during:** Task 1 (team data creation)
- **Issue:** Plan's NHL IDs were from a different source and mostly wrong (e.g., Panthers listed as id 13, actual is 26)
- **Fix:** Verified every team ID against live ESPN API
- **Files modified:** Sources/JarvisCore/Models/NHLTeamData.swift
- **Verification:** All 32 teams verified against https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams
- **Committed in:** b895117

**2. [Rule 2 - Data Accuracy] Corrected conference/division IDs across all sports**
- **Found during:** Task 1 (team data creation)
- **Issue:** Plan used incorrect conferenceId for NFL NFC (said 9, actual is 7), and NHL/NBA IDs were unverified
- **Fix:** Queried ESPN team endpoints to get actual division/conference group IDs
- **Verification:** Spot-checked representative teams from each division
- **Committed in:** b895117

**3. [Rule 3 - Blocking] Added custom encode(to:) for SportsConfig**
- **Found during:** Task 2 (build verification)
- **Issue:** Extra CodingKeys for old flat format prevented auto-synthesis of Encodable conformance
- **Fix:** Added explicit encode(to:) that only encodes the new nested format
- **Committed in:** 3c4bfe2

---

**Total deviations:** 3 auto-fixed (2 data accuracy, 1 blocking)
**Impact on plan:** Data accuracy fixes essential for correct API integration. Encodable fix required for compilation.

## Issues Encountered
None beyond the deviations noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Team data models ready for use in ESPN service (Plan 02)
- Multi-sport config structure ready for settings UI (Plan 03)
- SportsService still MLB-only — Plan 02 will add generic ESPN fetching

---
*Phase: 17-multi-sport-support*
*Plan: 01*
*Completed: 2026-04-03*
