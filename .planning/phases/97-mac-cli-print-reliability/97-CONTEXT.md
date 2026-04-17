# Phase 97: Mac CLI Print Reliability - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify and harden the Mac CLI auto-print path so the daily brief prints on schedule without manual intervention. This is a verification/hardening phase — not building new features. The print infrastructure already exists (PrintService, BriefScheduler, Monitor app). The goal is to confirm it works end-to-end and fix any issues found.

</domain>

<decisions>
## Implementation Decisions

### Verification Scope
- **D-01:** Full chain test required — Monitor→BriefScheduler→CLI→API→PDF→lpr end-to-end. Verify logs show the scheduled run fired and paper came out. CLI-only testing is insufficient.
- **D-02:** The LaunchAgent (`com.jamesonmorrill.dailybriefmonitor.plist`) must be confirmed loaded and the Monitor app running before testing the scheduled path.

### Error Recovery
- **D-03:** On print failure (printer offline, lpr error, PDF fetch fails): log the error AND show a red badge/status in the Monitor menu bar app. No push notifications, no automatic retries.
- **D-04:** Error state should be visible in the Monitor UI so the user knows the brief didn't print without checking logs.

### Legacy Cleanup
- **D-05:** Remove both `com.jameson.dailysheet-print.plist` and `~/.dailysheet-print.sh`. Unload the plist first, then delete both files. The Monitor-based path fully replaced the file-watcher approach.

### Printer Configuration
- **D-06:** If `printer_name` is set in config but the printer is offline/missing, fail with a clear error and show Monitor badge. Do NOT silently fall back to default printer.
- **D-07:** Ensure printing happens at 100% scale — no fit-to-page shrinking. Pass appropriate lpr options to enforce actual size.
- **D-08:** Add printer reachability check to the Doctor subcommand so users can diagnose printer issues proactively.

### Claude's Discretion
- Specific lpr flags for 100% scale enforcement (e.g., `-o fit-to-page=false`, `-o scaling=100`)
- How to detect printer availability (lpstat, lpinfo, or similar)
- Monitor badge implementation approach (existing status patterns in the Monitor app)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Print Path
- `Sources/DailyBrief/Utilities/PrintService.swift` — lpr wrapper, printer config handling
- `Sources/DailyBrief/DailyBrief.swift` — CLI entry point, Generate subcommand triggers print
- `Sources/JarvisCore/Config/AppConfig.swift` — PrintingConfig struct (enabled, printer_name, copies)

### Scheduling
- `Sources/DailyBriefMonitor/BriefScheduler.swift` — Timer-based scheduling, triggers StatusChecker
- `Sources/DailyBriefMonitor/AppDelegate.swift` — Print schedule API fetch, Monitor startup

### LaunchAgents
- `~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist` — Monitor launcher
- `~/Library/LaunchAgents/com.jameson.dailysheet-print.plist` — Legacy (to be removed per D-05)

### Config
- `~/.config/dailybrief/config.json` — printing section with enabled, printer_name, copies

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PrintService.swift`: Already wraps lpr with printer name, copies, one-sided. Needs 100% scale flags added.
- `Doctor` subcommand: Already validates print-schedule endpoint. Can be extended with printer reachability check.
- Monitor app: Has existing status display patterns (menu bar icon, status text). Badge/error state can follow existing patterns.

### Established Patterns
- CLI uses `Process` API for shell commands (lpr invocation)
- Monitor fetches settings from API at launch + system wake
- Exit code 2 signals "no brief for today" (staleness) — Monitor recognizes this

### Integration Points
- `StatusChecker.runNow()` is the bridge between Monitor scheduler and CLI execution
- Print schedule comes from API `/v1/settings/print-schedule` (hour, minute, enabled)
- Log output goes to `~/Library/Logs/DailyBrief/`

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants 100% scale printing — no fit-to-page. This is a specific lpr flag requirement.
- Full chain verification means actually waiting for a scheduled run to fire and checking the physical printer output.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 97-mac-cli-print-reliability*
*Context gathered: 2026-04-16*
