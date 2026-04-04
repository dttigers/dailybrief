---
phase: 22-imap-work-email
plan: 01
subsystem: auth
tags: [oauth2, xoauth2, imap, microsoft-365, azure-ad, device-code-flow]

requires:
  - phase: 07-email-work-orders
    provides: EmailService with IMAP app password auth and IMAPClient Python script
provides:
  - OAuth2 XOAUTH2 authentication path in IMAPClient for Microsoft 365
  - EmailConfig with authType and OAuth2 credential fields
  - email-auth CLI subcommand for device code flow token acquisition
affects: [22-imap-work-email]

tech-stack:
  added: []
  patterns: [oauth2-device-code-flow, xoauth2-imap-auth, python-urllib-token-exchange]

key-files:
  created: []
  modified:
    - Sources/JarvisCore/Config/AppConfig.swift
    - Sources/DailyBrief/Services/EmailService.swift
    - Sources/DailyBrief/DailyBrief.swift

key-decisions:
  - "Used Python urllib for OAuth2 token exchange in IMAP script to avoid adding Swift HTTP dependencies"
  - "Device code flow chosen over authorization code flow for CLI-friendly headless auth"
  - "auth_type defaults to app_password for full backward compatibility"

patterns-established:
  - "OAuth2 device code flow: request device code, display URI+code, poll for token, save refresh token"
  - "Dual auth path in Python IMAP script: app_password uses mail.login(), oauth2 uses mail.authenticate('XOAUTH2', ...)"

duration: 5min
completed: 2026-04-04
---

# Phase 22, Plan 01: IMAP OAuth2 Authentication Summary

**OAuth2 XOAUTH2 IMAP auth for Microsoft 365 with device code flow CLI command**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-04
- **Completed:** 2026-04-04
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added OAuth2 config fields (authType, oauth2ClientId, oauth2TenantId, oauth2RefreshToken) to EmailConfig with backward-compatible defaults
- Implemented XOAUTH2 authentication path in IMAPClient Python script that exchanges refresh tokens for access tokens via Azure AD
- Added `dailybrief email-auth` CLI subcommand performing Microsoft 365 device code flow with token polling and config saving
- Updated --setup config template with OAuth2 fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Add OAuth2 config fields and XOAUTH2 Python IMAP support** - `b88e693` (feat)
2. **Task 2: Add --email-auth CLI command for OAuth2 device code flow** - `5460636` (feat)

## Files Created/Modified
- `Sources/JarvisCore/Config/AppConfig.swift` - Added authType, oauth2ClientId, oauth2TenantId, oauth2RefreshToken fields to EmailConfig
- `Sources/DailyBrief/Services/EmailService.swift` - Updated IMAPClient with OAuth2 fields and XOAUTH2 Python auth path
- `Sources/DailyBrief/DailyBrief.swift` - Added EmailAuth subcommand and OAuth2 fields in config template

## Decisions Made
- Used Python urllib for token exchange inside the IMAP script rather than adding new Swift HTTP dependencies
- Device code flow selected for CLI-friendly headless authentication (no browser redirect needed on the machine)
- Default authType is "app_password" so existing configs work without changes

## Deviations from Plan

None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required

**External services require manual configuration.** Azure AD app registration is required before using `email-auth`:
1. Register Azure AD application (Azure Portal > App registrations > New registration)
2. Add IMAP.AccessAsUser.All permission (Microsoft Graph > Delegated)
3. Enable public client flow (Authentication > Allow public client flows > Yes)
4. Set oauth2_client_id and oauth2_tenant_id in config
5. Run `dailybrief email-auth` to complete device code flow

## Next Phase Readiness
- OAuth2 auth infrastructure complete
- Ready for Plan 02 (if any further IMAP work email tasks exist)
- User must complete Azure AD setup and run device code flow before OAuth2 auth will function

---
*Phase: 22-imap-work-email*
*Completed: 2026-04-04*
