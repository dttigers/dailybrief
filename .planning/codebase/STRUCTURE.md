# Codebase Structure

**Analysis Date:** 2026-03-31

## Directory Layout

```
dailybrief/
├── Package.swift                    # SPM manifest (2 executable targets)
├── Package.resolved                 # Dependency lock file
├── .gitignore
├── Entitlements/                    # macOS entitlements for signing
├── LaunchAgent/                     # macOS scheduling plists
├── Scripts/                         # Utility scripts
└── Sources/
    ├── DailyBrief/                  # CLI executable target
    │   ├── DailyBrief.swift         # @main entry point + subcommands
    │   ├── Config/                  # Configuration loading
    │   ├── Models/                  # Data structures
    │   ├── Services/                # External data fetching
    │   ├── PDF/                     # PDF generation
    │   └── Utilities/               # Logging, printing
    └── DailyBriefMonitor/           # Menu bar app target
        ├── DailyBriefMonitorApp.swift
        ├── MenuBarView.swift
        └── StatusChecker.swift
```

## Directory Purposes

**Entitlements/**
- Purpose: macOS app entitlements for code signing
- Contains: `DailyBrief.entitlements` (Calendar/Reminders access)
- Key files: `DailyBrief.entitlements`

**LaunchAgent/**
- Purpose: macOS LaunchAgent plists for scheduled execution
- Contains: Two plist files for CLI and monitor
- Key files: `com.jamesonmorrill.dailybrief.plist` (6 AM schedule), `com.jamesonmorrill.dailybriefmonitor.plist` (always running)

**Scripts/**
- Purpose: Utility/setup scripts

**Sources/DailyBrief/**
- Purpose: Main CLI executable target
- Contains: All core application logic
- Subdirectories: Config/, Models/, Services/, PDF/, Utilities/

**Sources/DailyBrief/Config/**
- Purpose: Configuration schema and loading
- Contains: `AppConfig.swift` (nested Codable structs), `ConfigLoader.swift` (file I/O + JSON)

**Sources/DailyBrief/Models/**
- Purpose: Data structures for briefing content
- Contains: `DailyBriefData.swift`, `WorkOrder.swift`, `GameScore.swift`, `ReminderItem.swift`, `StandingsEntry.swift`

**Sources/DailyBrief/Services/**
- Purpose: External data fetching and state management
- Contains: Actor-based services for Gmail, Sports, Reminders, AI, plus CompletionStore

**Sources/DailyBrief/PDF/**
- Purpose: CoreGraphics/CoreText PDF rendering
- Contains: `PDFGenerator.swift`, `PDFStyles.swift`, `PageOneRenderer.swift`, `PageTwoRenderer.swift`

**Sources/DailyBriefMonitor/**
- Purpose: SwiftUI menu bar monitoring app
- Contains: App entry point, menu bar view, status polling

## Key File Locations

**Entry Points:**
- `Sources/DailyBrief/DailyBrief.swift` - CLI entry (@main, ArgumentParser)
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` - Menu bar app entry (@main, SwiftUI)

**Configuration:**
- `Package.swift` - SPM manifest, targets, dependencies
- `Sources/DailyBrief/Config/AppConfig.swift` - Config schema (all nested structs)
- `Sources/DailyBrief/Config/ConfigLoader.swift` - JSON loading from `~/.config/dailybrief/`
- `Entitlements/DailyBrief.entitlements` - macOS permissions

**Core Logic:**
- `Sources/DailyBrief/Services/GmailService.swift` - IMAP work order fetching
- `Sources/DailyBrief/Services/SportsService.swift` - MLB API integration
- `Sources/DailyBrief/Services/RemindersService.swift` - EventKit + AppleScript
- `Sources/DailyBrief/Services/AIService.swift` - Claude API affirmation generation
- `Sources/DailyBrief/Services/CompletionStore.swift` - Work order completion tracking

**PDF Generation:**
- `Sources/DailyBrief/PDF/PDFGenerator.swift` - CoreGraphics PDF creation + helpers
- `Sources/DailyBrief/PDF/PDFStyles.swift` - Fonts, colors, layout constants
- `Sources/DailyBrief/PDF/PageOneRenderer.swift` - Work orders + todos page
- `Sources/DailyBrief/PDF/PageTwoRenderer.swift` - Sports + affirmation page

**Utilities:**
- `Sources/DailyBrief/Utilities/Logger.swift` - File + console logging
- `Sources/DailyBrief/Utilities/PrintService.swift` - System printer integration

**Scheduling:**
- `LaunchAgent/com.jamesonmorrill.dailybrief.plist` - Daily 6 AM generation
- `LaunchAgent/com.jamesonmorrill.dailybriefmonitor.plist` - Monitor always-on

**Testing:**
- None (no test files or test targets)

## Naming Conventions

**Files:**
- PascalCase for all Swift files: `AppConfig.swift`, `PDFGenerator.swift`
- Compound descriptive names: `PageOneRenderer.swift`, `CompletionStore.swift`
- Entry points named after target: `DailyBrief.swift`, `DailyBriefMonitorApp.swift`

**Directories:**
- PascalCase for functional groups: `Config/`, `Models/`, `Services/`, `PDF/`, `Utilities/`
- Plural for collections: `Models/`, `Services/`, `Utilities/`

**Special Patterns:**
- `@main` struct in root file of each target
- One primary type per file (type name matches filename)

## Where to Add New Code

**New Data Source / Service:**
- Implementation: `Sources/DailyBrief/Services/NewService.swift` (actor)
- Model: `Sources/DailyBrief/Models/NewModel.swift` (Sendable struct)
- Config: Add nested config struct in `Sources/DailyBrief/Config/AppConfig.swift`
- Wire up: Add `async let` in `Sources/DailyBrief/DailyBrief.swift` generate command

**New PDF Page / Section:**
- Renderer: `Sources/DailyBrief/PDF/PageThreeRenderer.swift` (enum with static render)
- Styles: Update `Sources/DailyBrief/PDF/PDFStyles.swift` if new fonts/colors needed
- Wire up: Update `Sources/DailyBrief/PDF/PDFGenerator.swift` to add page

**New CLI Subcommand:**
- Definition: Extension in `Sources/DailyBrief/DailyBrief.swift`
- Add to `subcommands` array in `CommandConfiguration`

**New Menu Bar Feature:**
- View: Update `Sources/DailyBriefMonitor/MenuBarView.swift`
- State: Update `Sources/DailyBriefMonitor/StatusChecker.swift`

**Utilities:**
- Shared helpers: `Sources/DailyBrief/Utilities/`

## Special Directories

**.build/**
- Purpose: SPM build artifacts and dependency checkouts
- Source: Auto-generated by `swift build`
- Committed: No (in .gitignore)

**.planning/**
- Purpose: GSD project planning documents
- Source: Created by planning tools
- Committed: Yes

---

*Structure analysis: 2026-03-31*
*Update when directory structure changes*
