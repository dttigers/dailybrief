---
status: partial
phase: 116-sports-source-picker
source: [116-VERIFICATION.md]
started: 2026-04-29T13:35:00Z
updated: 2026-04-29T13:35:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Sports section card placement + initial render
expected: Section visible between Google Account card and Auto-generate ScheduleCard; heading "Sports"; 4 league checkboxes (MLB — Baseball, NFL — Football, NBA — Basketball, NHL — Hockey); checkboxes start unchecked for fresh user; helper copy "No leagues selected — sports section will be omitted from your brief." visible below.
result: [pending]

### 2. Live MLB toggle + lazy team fetch + persistence across reload
expected: Toggle MLB ON → "Loading teams…" briefly → alphabetical team radios render → pick a team → reload page → MLB still ON, same team still selected (PUT/GET round-trip).
result: [pending]

### 3. D-24 disable-then-re-enable preserves favorite team
expected: Disable previously-enabled league with a team selected → reload → re-enable → previously-selected team radio still selected (favoriteTeams[league] preserved server-side).
result: [pending]

### 4. SC#3 — Brief PDF respects picks (enabled-only + picker team data)
expected: With ≥1 league enabled and a team picked, generate next brief PDF → sports section contains ONLY enabled leagues; team-specific recent/upcoming game blocks reference user's picked team_id, NOT the legacy hardcoded Detroit teams.
result: [pending]

### 5. SC#4 — Brief PDF with all leagues disabled omits sports section
expected: Disable all 4 leagues → generate brief → PDF has NO sports section header AND no "no leagues selected" placeholder; entire section suppressed by pdf-service.ts:281 guard.
result: [pending]

### 6. D-12 Railway env-var deletion runbook
expected: After picker exercised in prod, delete SPORTS_MLB_TEAM_ID / SPORTS_NFL_TEAM_ID / SPORTS_NBA_TEAM_ID / SPORTS_NHL_TEAM_ID from Railway vigil-core service Variables panel → redeploy → generate brief → sports section still renders correctly using picker-driven team IDs (env-var fallback no longer used in prod code path; only test fixtures rely on D-13).
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
