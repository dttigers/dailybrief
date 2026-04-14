---
status: partial
phase: 79-gmail-oauth-server-foundation
source: [79-VERIFICATION.md]
started: 2026-04-14T18:30:00.000Z
updated: 2026-04-14T18:30:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Real OAuth round-trip
expected: Complete a live Google consent flow → confirm `google_connected=true` redirect param → verify `oauth_tokens` DB row has both scopes (`calendar.readonly` and `gmail.readonly`) persisted in the `scopes` jsonb column
result: [pending]

### 2. JWT state survives server restart
expected: Initiate OAuth → capture the state JWT → restart the server → complete the callback → confirm it does NOT return `invalid_state` error (validates the core OAUTH-04 stateless JWT guarantee)
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
