---
status: partial
phase: 115-calendar-source-picker-thoughtrow-polish
source: [115-VERIFICATION.md]
started: 2026-04-27T18:25:00Z
updated: 2026-04-27T18:25:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Visual layout — Calendars subsection in deployed PWA Settings
expected: Subsection appears below the existing Calendar/Gmail ScopeRow rows; primary calendar carries a teal PRIMARY badge; color swatches match Google's per-calendar color
result: [pending]

### 2. Multi-line thought row visual line-break rendering
expected: A captured/pasted thought containing literal newlines renders across multiple visible lines (up to the line-clamp-3 cap), not collapsed to one line
result: [pending]

### 3. End-to-end save+reload (CR-01 fix verification)
expected: After checking 2-3 calendars, waiting ~500ms for debounced save, and hard-refreshing — the same checkboxes that were checked before reload are still checked. SC#2 'reload preserves the choice' is now implemented (server returns `selectedCalendarIds` in `GET /v1/calendar/list`; PWA hydrates state on mount).
result: [pending]

### 4. Brief includes only selected calendars (SC#3 live)
expected: With multiple calendars on the connected account, selecting only ONE non-primary calendar produces a brief PDF that only includes events from that selected calendar; events from unselected calendars are absent
result: [pending]

### 5. Empty-selection fallback
expected: Selecting zero calendars renders the helper copy "No calendars selected — brief includes all of them.", and the generated brief PDF includes events from all the user's calendars (existing fallback per D-11)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
