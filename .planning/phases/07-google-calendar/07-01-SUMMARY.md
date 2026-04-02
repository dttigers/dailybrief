---
phase: 07-google-calendar
plan: 01
subsystem: api
tags: [google-calendar, oauth2, rest-api, swift-actor]

requires:
  - phase: 01-foundation
    provides: AppConfig, ConfigLoader, JarvisCore module structure
provides:
  - CalendarEvent model in JarvisCore (public, Codable, Sendable, Identifiable)
  - GoogleCalendarConfig in AppConfig (backward-compatible)
  - CalendarTokens for OAuth2 token persistence
  - GoogleCalendarService actor with fetchTodayEvents() and fetchCalendarList()
affects: [07-google-calendar (plans 02 and 03), dashboard calendar UI, Generate command integration]

tech-stack:
  added: []
  patterns: [actor-based service with URLSession+JSONSerialization, decodeIfPresent for backward-compatible config]

key-files:
  created:
    - Sources/JarvisCore/Models/CalendarEvent.swift
    - Sources/JarvisCore/Config/CalendarTokens.swift
    - Sources/DailyBrief/Services/GoogleCalendarService.swift
  modified:
    - Sources/JarvisCore/Config/AppConfig.swift

key-decisions:
  - "Custom init(from:) on AppConfig with decodeIfPresent for googleCalendar — existing configs without the key still load"
  - "CalendarTokens uses secondsSince1970 date encoding for token expiry persistence"
  - "ISO8601 parsing with fractional seconds fallback (same pattern as SportsService)"

patterns-established:
  - "decodeIfPresent pattern for adding optional config sections without breaking existing installs"
  - "CalendarTokens static load/save for file-based OAuth2 token management"

duration: 8min
completed: 2026-04-02
---

# Phase 07-01: Google Calendar Foundation Summary

**CalendarEvent model, GoogleCalendarConfig, CalendarTokens, and GoogleCalendarService actor with OAuth2 token refresh and REST API event fetching**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-02
- **Completed:** 2026-04-02
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- CalendarEvent model with timeString and durationMinutes computed properties
- GoogleCalendarConfig added to AppConfig with backward-compatible decoding (existing configs unaffected)
- CalendarTokens with file-based persistence and 60-second expiry buffer
- GoogleCalendarService actor with automatic token refresh, multi-calendar event fetching, and calendar list retrieval

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CalendarEvent model and GoogleCalendarConfig** - `473db97` (feat)
2. **Task 2: Create GoogleCalendarService actor** - `5285083` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Models/CalendarEvent.swift` - Public model for calendar events with time formatting
- `Sources/JarvisCore/Config/CalendarTokens.swift` - OAuth2 token persistence with load/save/expiry
- `Sources/JarvisCore/Config/AppConfig.swift` - Added GoogleCalendarConfig struct and backward-compatible decoding
- `Sources/DailyBrief/Services/GoogleCalendarService.swift` - Actor service with fetchTodayEvents(), fetchCalendarList(), and token refresh

## Decisions Made
- Custom `init(from:)` on AppConfig with `decodeIfPresent` for googleCalendar field — ensures existing config.json files without google_calendar key still load correctly
- CalendarTokens uses `secondsSince1970` date encoding strategy for token expiry timestamps
- ISO8601DateFormatter with fractional seconds fallback matches existing SportsService pattern
- GoogleCalendarError enum provides descriptive errors; "Not authorized" thrown when no tokens exist so callers can skip gracefully

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None for this plan - OAuth setup and credential configuration will be handled in a later plan.

## Next Phase Readiness
- CalendarEvent model ready for PDF rendering and dashboard display
- GoogleCalendarService ready to be called from Generate command
- OAuth2 flow (initial authorization) needed before service can fetch real data — covered in plan 07-02 or 07-03

---
*Phase: 07-google-calendar*
*Completed: 2026-04-02*
