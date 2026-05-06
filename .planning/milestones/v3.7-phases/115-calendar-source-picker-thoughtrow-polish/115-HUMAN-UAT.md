---
status: complete
phase: 115-calendar-source-picker-thoughtrow-polish
source: [115-VERIFICATION.md]
started: 2026-04-27T18:25:00Z
updated: 2026-04-28T17:05:00Z
---

## Current Test

[all tests complete]

## Tests

### 1. Visual layout — Calendars subsection in deployed PWA Settings
expected: Subsection appears below the existing Calendar/Gmail ScopeRow rows; primary calendar carries a teal PRIMARY badge; color swatches match Google's per-calendar color
result: pass (2026-04-28)

### 2. Multi-line thought row visual line-break rendering
expected: A captured/pasted thought containing literal newlines renders across multiple visible lines (up to the line-clamp-3 cap), not collapsed to one line
result: pass (2026-04-28) — verified by entering newlines via edit-mode `<textarea>` (CaptureBar `<input>` strips newlines on paste/Enter; tracked separately in backlog as out-of-scope for POLISH-01 per D-16)

### 3. End-to-end save+reload (CR-01 fix verification)
expected: After checking 2-3 calendars, waiting ~500ms for debounced save, and hard-refreshing — the same checkboxes that were checked before reload are still checked. SC#2 'reload preserves the choice' is now implemented (server returns `selectedCalendarIds` in `GET /v1/calendar/list`; PWA hydrates state on mount).
result: pass (2026-04-28) — CR-01 fix confirmed end-to-end against live server

### 4. Brief includes only selected calendars (SC#3 live)
expected: With multiple calendars on the connected account, selecting only ONE non-primary calendar produces a brief PDF that only includes events from that selected calendar; events from unselected calendars are absent
result: pass (2026-04-28) — SC#3 confirmed live against Google Calendar API

### 5. Empty-selection fallback
expected: Selecting zero calendars renders the helper copy "No calendars selected — brief includes all of them.", and the generated brief PDF includes events from all the user's calendars (existing fallback per D-11)
result: pass (2026-04-28) — D-11 fallback confirmed live (helper copy renders, brief includes all calendars)

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
