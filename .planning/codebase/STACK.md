# Technology Stack

**Analysis Date:** 2026-03-31

## Languages

**Primary:**
- Swift 6.2 - All application code (`Package.swift`, `Sources/`)

**Secondary:**
- Python 3 (embedded) - IMAP email fetching via subprocess (`Sources/DailyBrief/Services/GmailService.swift`)
- AppleScript (embedded) - Reminders fallback access (`Sources/DailyBrief/Services/RemindersService.swift`)

## Runtime

**Environment:**
- macOS 14+ (Sonoma) - `Package.swift: platforms: [.macOS(.v14)]`
- Swift 6.2 concurrency runtime (actors, async/await, Sendable)

**Package Manager:**
- Swift Package Manager (SPM)
- Lockfile: `Package.resolved` present

## Frameworks

**Core (DailyBrief CLI):**
- EventKit - macOS Reminders access
- CoreGraphics - PDF rendering
- CoreText - PDF text layout and typography
- ArgumentParser 1.3.0+ (apple/swift-argument-parser) - CLI subcommands

**Core (DailyBriefMonitor):**
- SwiftUI - Menu bar UI
- AppKit - macOS windowing and menu bar integration

**Testing:**
- None configured (no test targets in `Package.swift`)

**Build/Dev:**
- Swift Package Manager - Build system
- `swift build -c release` for production binaries

## Key Dependencies

**Critical:**
- swift-argument-parser 1.7.1 - CLI command parsing and help generation (`Package.swift`)

**System:**
- EventKit - Reminders data access (`Sources/DailyBrief/Services/RemindersService.swift`)
- CoreGraphics + CoreText - PDF generation (`Sources/DailyBrief/PDF/`)
- Foundation URLSession - HTTP requests to MLB API and Claude API
- Foundation Process - Subprocess execution (Python IMAP, lpr printing)

## Configuration

**Environment:**
- JSON config file at `~/.config/dailybrief/config.json`
- Snake_case JSON keys auto-converted to camelCase via `JSONDecoder.keyDecodingStrategy`
- Key configs: Gmail credentials, Claude API key, sports team IDs, printer name

**Build:**
- `Package.swift` - SPM manifest with 2 executable targets
- `Entitlements/DailyBrief.entitlements` - Calendar/Reminders permissions

## Platform Requirements

**Development:**
- macOS 14+ (Sonoma)
- Xcode / Swift toolchain 6.2
- Python 3 (for Gmail IMAP functionality)

**Production:**
- macOS 14+ (Sonoma)
- Two executables: `DailyBrief` (CLI) and `DailyBriefMonitor` (menu bar app)
- LaunchAgent plists for scheduling (`LaunchAgent/`)
- System printer access for PDF printing

---

*Stack analysis: 2026-03-31*
*Update after major dependency changes*
