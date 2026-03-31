# External Integrations

**Analysis Date:** 2026-03-31

## APIs & External Services

**AI / Language Model:**
- Anthropic Claude API - Daily ADHD-specific affirmation generation
  - SDK/Client: Direct HTTP via URLSession (`Sources/DailyBrief/Services/AIService.swift`)
  - Auth: API key via `x-api-key` header, stored in config as `claude_api_key`
  - Endpoint: `https://api.anthropic.com/v1/messages`
  - Model: `claude-sonnet-4-20250514` (default, configurable via `ai.model`)
  - Caching: Daily cache at `~/.cache/dailybrief/affirmation-{date}.txt`

**Sports Data:**
- MLB Stats API - Game scores, standings, schedules
  - SDK/Client: Direct HTTP via URLSession (`Sources/DailyBrief/Services/SportsService.swift`)
  - Auth: None required (public API)
  - Endpoints:
    - `https://statsapi.mlb.com/api/v1/schedule` - Game schedules and scores
    - `https://statsapi.mlb.com/api/v1/standings` - Division standings
  - Configuration: Team ID (default: 116/Tigers), Division ID (default: 202/AL Central)

**Email / IMAP:**
- Gmail IMAP - Work order extraction from ServiceNow notifications
  - SDK/Client: Python 3 subprocess with imaplib (`Sources/DailyBrief/Services/GmailService.swift`)
  - Auth: Gmail app password via config (`gmail.app_password`)
  - Connection: TLS to `imap.gmail.com:993`
  - Data extracted: Case number, store, description, location, equipment, priority, contact, state

## Data Storage

**Databases:**
- None (file-based storage only)

**File Storage:**
- Configuration: `~/.config/dailybrief/config.json` (`Sources/DailyBrief/Config/ConfigLoader.swift`)
- Completion state: `~/.config/dailybrief/completed_workorders.json` (`Sources/DailyBrief/Services/CompletionStore.swift`)
- Affirmation cache: `~/.cache/dailybrief/affirmation-{date}.txt` (`Sources/DailyBrief/Services/AIService.swift`)
- PDF output: `~/Documents/DailyBrief/daily_sheet_{date}.pdf` (configurable)
- Logs: `~/Library/Logs/DailyBrief/dailybrief.log` (`Sources/DailyBrief/Utilities/Logger.swift`)

**Caching:**
- File-based daily affirmation cache (prevents repeated API calls)

## Authentication & Identity

**Auth Provider:**
- None (local CLI tool, no user accounts)

**Service Credentials:**
- Claude API key - stored in `config.json` under `ai.claude_api_key`
- Gmail app password - stored in `config.json` under `gmail.app_password`
- No OAuth flows; direct credential-based access

## Monitoring & Observability

**Error Tracking:**
- Custom file-based logging (`Sources/DailyBrief/Utilities/Logger.swift`)
- Log format: `[timestamp] [level] message`
- Levels: info, error

**Analytics:**
- None

**Logs:**
- File-based: `~/Library/Logs/DailyBrief/dailybrief.log`
- LaunchAgent stdout/stderr: `~/Library/Logs/DailyBrief/stdout.log`, `stderr.log`

## CI/CD & Deployment

**Hosting:**
- Local macOS installation (not deployed to servers)
- Built with `swift build -c release`
- Binaries at `.build/release/DailyBrief` and `.build/release/DailyBriefMonitor`

**CI Pipeline:**
- None configured

## macOS System Integrations

**Apple Reminders (EventKit):**
- Fetches incomplete todo items from configurable Reminders list
- Primary: EventKit API with `requestFullAccessToReminders()` (`Sources/DailyBrief/Services/RemindersService.swift`)
- Fallback: AppleScript via `/usr/bin/osascript` if permission denied
- Entitlement: `Entitlements/DailyBrief.entitlements`

**System Printing:**
- Sends PDF to printer via `/usr/bin/lpr` (`Sources/DailyBrief/Utilities/PrintService.swift`)
- Configurable: printer name, copy count, enabled flag
- Single-sided printing via `-o sides=one-sided`

**System Scheduling:**
- `LaunchAgent/com.jamesonmorrill.dailybrief.plist` - Daily generation at 6:00 AM
- `LaunchAgent/com.jamesonmorrill.dailybriefmonitor.plist` - Menu bar monitor (KeepAlive, RunAtLoad)

## Environment Configuration

**Development:**
- Required: `~/.config/dailybrief/config.json` with Gmail credentials and Claude API key
- Setup: `dailybrief --setup` creates template config
- Dry run: `dailybrief --dry-run` fetches data without generating PDF

**Production:**
- Same as development (local tool)
- LaunchAgents installed for automated scheduling

---

*Integration audit: 2026-03-31*
*Update when adding/removing external services*
