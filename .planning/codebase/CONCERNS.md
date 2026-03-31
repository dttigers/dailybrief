# Codebase Concerns

**Analysis Date:** 2026-03-31

## Tech Debt

**Python subprocess for IMAP:**
- Issue: Gmail IMAP access implemented via embedded Python 3 script in subprocess
- Files: `Sources/DailyBrief/Services/GmailService.swift` (lines 80-149)
- Why: Quick implementation path for IMAP, avoiding Swift IMAP library complexity
- Impact: Hard dependency on Python 3 installation; credentials visible in process listing; fragile error handling via stderr parsing
- Fix approach: Replace with native Swift IMAP library or use Gmail API with OAuth

**Large renderer functions:**
- Issue: PDF page renderers are 175-205 lines of mixed layout logic and drawing calls
- Files: `Sources/DailyBrief/PDF/PageOneRenderer.swift`, `Sources/DailyBrief/PDF/PageTwoRenderer.swift`
- Why: Incremental feature additions without refactoring
- Impact: Hard to modify individual sections; difficult to test
- Fix approach: Extract section-level helpers (drawWorkOrders, drawTodos, drawStandings, etc.)

**Silent error suppression:**
- Issue: 13+ instances of `try?` silently ignoring errors
- Files: `Sources/DailyBrief/Services/AIService.swift` (lines 25, 32, 33), `Sources/DailyBrief/Services/CompletionStore.swift` (lines 16, 17), `Sources/DailyBrief/DailyBrief.swift` (lines 167, 170, 173), `Sources/DailyBriefMonitor/StatusChecker.swift` (line 97)
- Why: Non-critical operations where failure is acceptable
- Impact: Failures are invisible; disk space issues or permission problems go unreported
- Fix approach: Replace with `do/catch` and Logger.error() for important operations

## Known Bugs

**No known bugs documented.**
- The codebase lacks formal bug tracking
- Runtime issues would surface via log files

## Security Considerations

**Credentials passed via process arguments:**
- Risk: Gmail email and app password passed as Python script arguments, visible in `ps` output
- Files: `Sources/DailyBrief/Services/GmailService.swift` (lines 88-89)
- Current mitigation: None
- Recommendations: Pass credentials via stdin pipe or environment variables instead of command-line arguments

**API key in plaintext config:**
- Risk: Claude API key stored in plaintext JSON at `~/.config/dailybrief/config.json`
- Files: `Sources/DailyBrief/Config/AppConfig.swift`, `Sources/DailyBrief/Config/ConfigLoader.swift`
- Current mitigation: File is in user home directory with standard permissions
- Recommendations: Consider macOS Keychain for credential storage

## Performance Bottlenecks

**No significant performance issues detected.**
- Concurrent data fetching via `async let` is efficient
- Daily affirmation caching prevents repeated API calls
- PDF generation is a one-shot operation

**Minor: Repeated CoreText font creation:**
- Problem: `CTFontCreateWithName()` called multiple times during PDF rendering
- Files: `Sources/DailyBrief/PDF/PageOneRenderer.swift`, `Sources/DailyBrief/PDF/PageTwoRenderer.swift`
- Impact: Negligible for a single PDF generation per day
- Improvement path: Cache fonts in PDFStyles if performance becomes a concern

## Fragile Areas

**Email parsing regex:**
- Files: `Sources/DailyBrief/Services/GmailService.swift` (lines 34-62)
- Why fragile: Regex patterns depend on exact ServiceNow email format
- Common failures: Format changes in ServiceNow notifications would break parsing silently
- Safe modification: Add unit tests for parsing before changing patterns
- Test coverage: None

**AppleScript Reminders fallback:**
- Files: `Sources/DailyBrief/Services/RemindersService.swift` (lines 61-93)
- Why fragile: Uses `|||` delimiter in output that could appear in reminder titles
- Common failures: Delimiter collision, Reminders app not running, list name mismatch
- Safe modification: Validate list exists; use a more robust delimiter
- Test coverage: None

## Scaling Limits

**Not applicable** - Single-user local CLI tool. No scaling concerns.

## Dependencies at Risk

**Python 3 runtime dependency:**
- Risk: Python 3 may not be installed on all macOS systems (removed from default in newer macOS)
- Impact: Gmail IMAP functionality completely breaks
- Migration plan: Replace Python subprocess with native Swift IMAP solution

**No other dependency risks** - Only one external SPM dependency (swift-argument-parser from Apple).

## Missing Critical Features

**No automated tests:**
- Problem: Zero test coverage for business-critical logic
- Current workaround: Manual testing via `--dry-run` and log inspection
- Blocks: Confident refactoring, regression detection
- Key areas needing tests: email parsing, config loading, completion store, PDF generation

## Test Coverage Gaps

**Email parsing logic:**
- What's not tested: ServiceNow email regex extraction (`Sources/DailyBrief/Services/GmailService.swift`)
- Risk: Format changes break work order extraction silently
- Priority: High
- Difficulty to test: Low (pure function with string input/output)

**Config validation:**
- What's not tested: JSON deserialization, default values, error cases (`Sources/DailyBrief/Config/`)
- Risk: Config changes could break silently
- Priority: Medium
- Difficulty to test: Low (file I/O + JSON parsing)

**PDF generation:**
- What's not tested: Page layout, text rendering, multi-page output (`Sources/DailyBrief/PDF/`)
- Risk: Layout regressions go unnoticed
- Priority: Medium
- Difficulty to test: Medium (need snapshot testing or output validation)

**Completion store persistence:**
- What's not tested: Save/load/mark complete cycle (`Sources/DailyBrief/Services/CompletionStore.swift`)
- Risk: Data loss on format changes
- Priority: Medium
- Difficulty to test: Low (file I/O with JSON)

---

*Concerns audit: 2026-03-31*
*Update as issues are fixed or new ones discovered*
