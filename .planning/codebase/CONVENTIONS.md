# Coding Conventions

**Analysis Date:** 2026-03-31

## Naming Patterns

**Files:**
- PascalCase for all files: `AppConfig.swift`, `PDFGenerator.swift`, `StatusChecker.swift`
- Compound descriptive names: `PageOneRenderer`, `CompletionStore`, `DailyBriefData`

**Functions:**
- camelCase for all functions: `fetchYesterdayGame()`, `drawDashedBorder()`, `shortenTeamName()`
- Fetch prefix for data retrieval: `fetchWorkOrders()`, `fetchTodoItems()`, `fetchStandings()`
- Generate prefix for creation: `generateAffirmation()`, `generate(data:outputPath:)`

**Variables:**
- camelCase for properties: `caseNumber`, `shortDescription`, `homeScore`, `awayScore`
- Boolean properties: `noPrint`, `dryRun`, `setup`, `enabled`, `isHome`
- UPPER_SNAKE_CASE not used (Swift convention)

**Types:**
- PascalCase for structs: `WorkOrder`, `GameScore`, `ReminderItem`, `StandingsEntry`
- PascalCase for enums: `Logger`, `ConfigLoader`, `PDFGenerator`, `PrintService`
- PascalCase for actors: `ClaudeAIProvider`, `GmailService`, `SportsService`
- PascalCase for protocols: `AIProvider`
- Error enums suffixed with Error: `ConfigError`, `AIError`, `PDFError`

## Code Style

**Formatting:**
- 4-space indentation (Swift standard)
- Opening braces on same line (1TBS style)
- No formatter tool configured (.swiftlint.yml or .swift-format absent)

**Linting:**
- No linting tools configured
- Style enforced by convention

## Import Organization

**Order:**
1. System frameworks (Foundation, EventKit, CoreGraphics)
2. Third-party packages (ArgumentParser)
3. No internal module imports (single-module targets)

**Special:**
- `@preconcurrency import EventKit` for legacy framework bridge

## Error Handling

**Patterns:**
- Custom error enums with `LocalizedError` conformance
- `do/catch` at command level with error logging
- `try?` for non-critical operations (cache writes, cleanup)
- Graceful fallbacks (EventKit → AppleScript for Reminders)

**Error Types:**
- `ConfigError`: file not found, invalid JSON, missing fields
- `AIError`: missing API key, API failures
- `PDFError`: generation failures
- Each provides `errorDescription` via LocalizedError

## Logging

**Framework:**
- Custom `Logger` enum with static methods (`Sources/DailyBrief/Utilities/Logger.swift`)
- Levels: info, error

**Patterns:**
- Format: `[timestamp] [level] message`
- Dual output: console (print) + file (`~/Library/Logs/DailyBrief/dailybrief.log`)
- Log at service boundaries and error points

## Comments

**When to Comment:**
- MARK comments for section organization: `// MARK: - Generate (default)`
- Inline comments for non-obvious logic
- Help text on CLI flags: `@Flag(help: "Skip printing the PDF")`

**Documentation:**
- Minimal doc comments on types and functions
- CLI help text serves as user-facing documentation
- Complex regex patterns lack explanation comments

## Function Design

**Size:**
- Most functions focused and reasonable length
- PDF renderers are large (~175-205 lines) and could be split

**Parameters:**
- Config objects passed to service initializers
- CGContext passed to renderers with layout parameters
- Async methods return optional types for graceful nil handling

**Return Values:**
- Optional returns for data that may not be available
- Void with side effects for rendering and logging
- Throws for configuration and API errors

## Module Design

**Exports:**
- Two executable targets (no library exports)
- Each target is self-contained

**Type Organization:**
- One primary type per file
- Enums for stateless utilities (Logger, PDFGenerator, PrintService, ConfigLoader)
- Actors for stateful/concurrent services (GmailService, SportsService, etc.)
- Structs for data models (WorkOrder, GameScore, etc.)
- Extensions for subcommands within main command file

**Concurrency:**
- Actors for all external service access
- `Sendable` on all model types
- `async let` for parallel data fetching
- `@Observable` for SwiftUI state management in monitor

---

*Convention analysis: 2026-03-31*
*Update when patterns change*
