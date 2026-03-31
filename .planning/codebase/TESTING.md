# Testing Patterns

**Analysis Date:** 2026-03-31

## Test Framework

**Runner:**
- No test framework configured
- No test targets in `Package.swift`

**Assertion Library:**
- Not applicable

**Run Commands:**
```bash
# No test commands available
# swift test would fail (no test targets defined)
```

## Test File Organization

**Location:**
- No test files exist in the repository

**Naming:**
- Not established

**Structure:**
- No test directory structure

## Manual Testing Approach

**Built-in Testing Modes:**
- `--dry-run` flag: Fetches all data without generating PDF (`Sources/DailyBrief/DailyBrief.swift`)
- `--setup` flag: Creates template config for manual testing
- `printSummary()`: Text output for data verification (`Sources/DailyBrief/DailyBrief.swift`)

**Runtime Debugging:**
- Logger writes to `~/Library/Logs/DailyBrief/dailybrief.log`
- LaunchAgent stderr captured to `~/Library/Logs/DailyBrief/stderr.log`
- Menu bar monitor shows execution status visually

## Mocking

**Framework:**
- None configured

**Current Approach:**
- No mocking infrastructure
- Services hit real APIs during manual testing
- `AIProvider` protocol exists (`Sources/DailyBrief/Services/AIService.swift`) which could support mock implementations

## Fixtures and Factories

**Test Data:**
- None

**Location:**
- Not applicable

## Coverage

**Requirements:**
- No coverage targets
- No coverage tooling

## Test Types

**Unit Tests:**
- Not implemented
- High-value candidates:
  - Email parsing: `GmailService.swift` regex extraction
  - Config loading: `ConfigLoader.swift` JSON deserialization
  - Completion store: `CompletionStore.swift` persistence logic
  - Date formatting across services

**Integration Tests:**
- Not implemented
- Candidates:
  - PDF generation with sample data
  - Service initialization and error handling
  - End-to-end generate flow with mock data

**E2E Tests:**
- Not implemented
- CLI tested manually via `--dry-run`

## Common Patterns

**Error Handling in Lieu of Tests:**
- Graceful fallbacks serve as runtime safety net
- EventKit → AppleScript fallback (`Sources/DailyBrief/Services/RemindersService.swift`)
- Default affirmation on AI API failure (`Sources/DailyBrief/Services/AIService.swift`)
- Silent `try?` for non-critical operations

## Tooling

**Linting:**
- No SwiftLint or swift-format configured
- No CI/CD pipeline

---

*Testing analysis: 2026-03-31*
*Update when test patterns change*
