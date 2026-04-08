---
phase: 18-polish-integration
plan: 01
subsystem: config, email, ui
tags: [imap, email, swift, swiftui, config-migration]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: GmailConfig, GmailService, AppConfig structure
provides:
  - EmailConfig with configurable IMAP host/port/TLS
  - EmailService replacing GmailService
  - Backward-compatible config loading from "gmail" key
  - Settings UI with Email/IMAP tab
affects: [any future email/IMAP work, config migration]

# Tech tracking
tech-stack:
  added: []
  patterns: [backward-compatible config migration with dual CodingKeys]

key-files:
  created: []
  modified:
    - Sources/JarvisCore/Config/AppConfig.swift
    - Sources/DailyBrief/Services/EmailService.swift (renamed from GmailService.swift)
    - Sources/DailyBrief/DailyBrief.swift
    - Sources/DailyBriefMonitor/Settings/SettingsView.swift
    - Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift

key-decisions:
  - "EmailConfig.emailAddress field uses 'email_address' CodingKey with fallback to 'email' for backward compat"
  - "AppConfig decodes from both 'email' and 'gmail' top-level keys for config migration"
  - "Python IMAP script conditionally uses IMAP4_SSL vs IMAP4 based on useTLS flag"

patterns-established:
  - "Dual CodingKey pattern for config field renames with backward compatibility"

# Metrics
duration: 6min
completed: 2026-04-03
---

# Plan 18-01: Email/IMAP Config Summary

**Configurable IMAP connection replacing hardcoded Gmail with host/port/TLS fields and backward-compatible config migration**

## Performance

- **Duration:** 6 min
- **Completed:** 2026-04-03
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GmailConfig renamed to EmailConfig with imapHost, imapPort, useTLS fields
- GmailService renamed to EmailService with configurable IMAP connection
- Backward-compatible config loading: old "gmail" key and "email" field still decode correctly
- Settings UI shows "Email / IMAP" tab with Connection, Credentials, and Search sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename GmailConfig -> EmailConfig with configurable IMAP fields** - `fbbee65` (feat)
2. **Task 2: Update Settings UI from Gmail to Email/IMAP** - `a5e1a21` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Config/AppConfig.swift` - EmailConfig struct with IMAP fields, dual CodingKeys for backward compat
- `Sources/DailyBrief/Services/EmailService.swift` - Renamed from GmailService, uses config host/port/TLS
- `Sources/DailyBrief/DailyBrief.swift` - Updated references and template config
- `Sources/DailyBriefMonitor/Settings/SettingsView.swift` - Email/IMAP tab with grouped sections
- `Sources/DailyBriefMonitor/Settings/SettingsViewModel.swift` - Renamed properties, loads/saves EmailConfig

## Decisions Made
- Used dual CodingKeys approach for backward compatibility rather than a separate migration step
- EmailConfig.emailAddress uses "email_address" as CodingKey to avoid collision with old "email" field name
- Python IMAP script conditionally uses IMAP4_SSL vs IMAP4 based on useTLS config flag

## Deviations from Plan
None - plan executed as specified.

## Issues Encountered
None.

## User Setup Required
None - existing configs with "gmail" key continue to work. New saves will use "email" key format.

## Next Phase Readiness
- IMAP configuration is now fully generic
- Ready for remaining Phase 18 plans

---
*Phase: 18-polish-integration*
*Completed: 2026-04-03*
