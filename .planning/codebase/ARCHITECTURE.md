# Architecture

**Analysis Date:** 2026-03-31

## Pattern Overview

**Overall:** Dual-executable macOS application (CLI + Menu Bar Monitor)

**Key Characteristics:**
- CLI tool generates personalized daily briefing PDFs
- Menu bar app monitors CLI execution status
- Actor-based concurrency for thread-safe service access
- File-based configuration and state persistence
- Scheduled via macOS LaunchAgent

## Layers

**Command Layer:**
- Purpose: Parse CLI arguments and route to subcommands
- Contains: Command definitions, flags, options, help text
- Location: `Sources/DailyBrief/DailyBrief.swift`
- Depends on: Service layer, PDF layer, Utilities
- Used by: CLI entry point (`@main`)

**Configuration Layer:**
- Purpose: Load and validate JSON configuration
- Contains: Config schema (nested Codable structs), file I/O
- Location: `Sources/DailyBrief/Config/`
- Depends on: Foundation (FileManager, JSONDecoder)
- Used by: Command layer passes config to services

**Service Layer:**
- Purpose: Fetch data from external sources (APIs, IMAP, EventKit)
- Contains: GmailService, SportsService, RemindersService, AIService, CompletionStore
- Location: `Sources/DailyBrief/Services/`
- Depends on: Configuration, Foundation (URLSession, Process)
- Used by: Command layer aggregates service results

**Model Layer:**
- Purpose: Data structures for briefing content
- Contains: WorkOrder, GameScore, ReminderItem, StandingsEntry, DailyBriefData
- Location: `Sources/DailyBrief/Models/`
- Depends on: Nothing (pure data types)
- Used by: Services produce models, PDF layer consumes them

**PDF Layer:**
- Purpose: Render 2-page daily briefing PDF
- Contains: PDFGenerator, PageOneRenderer, PageTwoRenderer, PDFStyles
- Location: `Sources/DailyBrief/PDF/`
- Depends on: Models, CoreGraphics, CoreText
- Used by: Command layer after data aggregation

**Utility Layer:**
- Purpose: Cross-cutting concerns (logging, printing)
- Contains: Logger, PrintService
- Location: `Sources/DailyBrief/Utilities/`
- Depends on: Foundation
- Used by: All other layers

**Monitor Layer (separate target):**
- Purpose: Menu bar UI for monitoring CLI execution
- Contains: SwiftUI app, status checker, menu bar view
- Location: `Sources/DailyBriefMonitor/`
- Depends on: SwiftUI, AppKit
- Used by: macOS menu bar (LaunchAgent)

## Data Flow

**Generate Command (primary flow):**

1. User runs `dailybrief` or LaunchAgent triggers at 6 AM
2. ConfigLoader reads `~/.config/dailybrief/config.json`
3. Services initialized with config, fetched concurrently via `async let`:
   - GmailService → WorkOrder[] (IMAP via Python subprocess)
   - SportsService → GameScore?, UpcomingGame?, StandingsEntry[] (MLB API)
   - RemindersService → ReminderItem[] (EventKit or AppleScript fallback)
   - AIService → String affirmation (Claude API with daily cache)
4. CompletionStore filters out previously completed work orders
5. DailyBriefData aggregates all results
6. PDFGenerator renders 2-page PDF (CoreGraphics + CoreText)
7. PrintService sends to printer via lpr (if enabled)
8. Logger records events to log file

**State Management:**
- File-based: config, completion state, affirmation cache, PDFs, logs
- No persistent in-memory state between runs
- Each CLI invocation is independent

## Key Abstractions

**Actor Services:**
- Purpose: Thread-safe external data fetching
- Examples: `GmailService`, `SportsService`, `RemindersService`, `ClaudeAIProvider`, `IMAPClient`
- Pattern: Swift actors with async methods, initialized with config

**AIProvider Protocol:**
- Purpose: Abstraction for AI affirmation generation
- Location: `Sources/DailyBrief/Services/AIService.swift`
- Implementation: `ClaudeAIProvider` actor
- Pattern: Protocol-oriented, allows swapping AI providers

**Enum Singletons:**
- Purpose: Stateless utility functions
- Examples: `Logger`, `PDFGenerator`, `PrintService`, `ConfigLoader`, `PDFStyles`
- Pattern: Enums with static methods (no instantiation)

**Page Renderers:**
- Purpose: Modular PDF page layout
- Examples: `PageOneRenderer` (work orders + todos), `PageTwoRenderer` (sports + affirmation)
- Pattern: Enums with static `render()` methods taking CGContext

## Entry Points

**DailyBrief CLI:**
- Location: `Sources/DailyBrief/DailyBrief.swift`
- Triggers: CLI invocation or LaunchAgent schedule
- Responsibilities: Parse args, initialize services, aggregate data, generate PDF, print

**DailyBriefMonitor:**
- Location: `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift`
- Triggers: Login (RunAtLoad) or manual launch
- Responsibilities: Menu bar UI, status polling, run/view PDF actions

**StatusChecker:**
- Location: `Sources/DailyBriefMonitor/StatusChecker.swift`
- Triggers: 60-second polling timer, manual "Run Now" button
- Responsibilities: Execute DailyBrief binary, report status via @Observable

## Error Handling

**Strategy:** Custom error enums with LocalizedError, graceful fallbacks

**Patterns:**
- Custom errors: `ConfigError`, `AIError`, `PDFError` with descriptive messages
- Graceful degradation: EventKit → AppleScript fallback for Reminders
- Default values: AI affirmation falls back to hardcoded default on error
- Silent `try?` for non-critical operations (cache writes, cleanup)
- `do/catch` at command level with Logger.error() reporting

## Cross-Cutting Concerns

**Logging:**
- Centralized `Logger` enum with static methods
- Format: `[timestamp] [level] message`
- Dual output: console + `~/Library/Logs/DailyBrief/dailybrief.log`

**Configuration:**
- Single JSON config file loaded once at startup
- Hierarchical: `AppConfig` → `GmailConfig`, `SportsConfig`, `AIConfig`, etc.
- Snake_case JSON auto-converted to camelCase properties

**Concurrency:**
- Actor model for all external service access
- `async let` for parallel data fetching in generate command
- `Sendable` conformance on all model types
- `@preconcurrency import EventKit` for legacy framework bridge

---

*Architecture analysis: 2026-03-31*
*Update when major patterns change*
