---
phase: 17-multi-sport-support
plan: 02
subsystem: services, models
tags: [espn, nfl, nba, nhl, api, multi-sport, scoreboard, standings]

requires:
  - phase: 17-multi-sport-support (plan 01)
    provides: SportLeagueConfig, NFL/NBA/NHL team data models
  - phase: 10-sports-ui-daily-brief
    provides: GameScore, UpcomingGame, StandingsEntry models, SportsService pattern
provides:
  - ESPNSportsService actor for NFL/NBA/NHL data fetching via ESPN public API
  - SportData struct for per-sport data aggregation
  - DailyBriefData.additionalSports field for multi-sport data
  - Concurrent multi-sport fetching in DailyBrief orchestration
affects: [17-03-settings-ui, 17-04-pdf-rendering]

tech-stack:
  added: []
  patterns: [ESPN public API integration, TaskGroup-based concurrent fetching, sport-agnostic service actor]

key-files:
  created:
    - Sources/DailyBrief/Services/ESPNSportsService.swift
  modified:
    - Sources/JarvisCore/Models/DailyBriefData.swift
    - Sources/DailyBrief/DailyBrief.swift

key-decisions:
  - "ESPN API team matching uses string comparison of competitor.id against config.teamId"
  - "Standings division matching uses team presence rather than divisionId to avoid ESPN naming inconsistencies"
  - "NHL standings show points (PTS) alongside streak rather than games back"
  - "Upcoming game search checks today+tomorrow in parallel, then expands day-by-day"
  - "Additional sports fetched concurrently via TaskGroup, sorted to consistent nfl/nba/nhl order"

patterns-established:
  - "ESPNSportsService: sport-path parameterized actor for any ESPN-supported league"
  - "SportData: per-sport container for scores, upcoming, standings with display metadata"

duration: 6min
completed: 2026-04-03
---

# Plan 17-02: ESPN Sports Service & Multi-Sport Orchestration Summary

**ESPNSportsService actor for NFL/NBA/NHL with concurrent multi-sport data pipeline wired into DailyBriefData**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-03
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created ESPNSportsService with scoreboard and standings fetching for any ESPN sport
- Added SportData struct and additionalSports to DailyBriefData for multi-sport data flow
- Wired concurrent multi-sport fetching into DailyBrief orchestration via TaskGroup

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ESPNSportsService for NFL/NBA/NHL** - `4d9125a` (feat)
2. **Task 2: Wire multi-sport data into DailyBriefData and orchestration** - `3a6f4e5` (feat)

## Files Created/Modified
- `Sources/DailyBrief/Services/ESPNSportsService.swift` - ESPN API service actor with scoreboard, upcoming game, and standings methods + Codable response models
- `Sources/JarvisCore/Models/DailyBriefData.swift` - Added SportData struct and additionalSports field
- `Sources/DailyBrief/DailyBrief.swift` - Added concurrent multi-sport fetch loop with TaskGroup

## Decisions Made
- Used string-based team ID matching for ESPN API (competitor IDs are strings in ESPN responses)
- Division matching in standings uses team presence rather than division ID to handle ESPN's varying structure
- NHL standings display points (PTS) as the primary metric alongside streak
- Upcoming game search optimizes by checking today and tomorrow in parallel before expanding to 7 days
- TaskGroup used for concurrent sport fetching with post-sort for consistent ordering

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. ESPN API is public and requires no authentication.

## Next Phase Readiness
- ESPNSportsService ready for all enabled sports
- SportData flows through DailyBriefData for PDF rendering (Plan 04)
- Settings UI can enable/disable sports (Plan 03)
- Backward compatible: additionalSports defaults to empty array

---
*Phase: 17-multi-sport-support*
*Plan: 02*
*Completed: 2026-04-03*
