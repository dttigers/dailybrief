# Phase 97: Mac CLI Print Reliability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 97-mac-cli-print-reliability
**Areas discussed:** Verification scope, Error recovery, Legacy cleanup, Printer config

---

## Verification Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full chain test | Test Monitor→BriefScheduler→CLI→API→PDF→lpr end-to-end. Verify logs show the scheduled run fired and paper came out. | ✓ |
| CLI-only test | Just run DailyBrief generate manually and confirm it prints. Don't verify the scheduler/timer path. | |
| CLI + log audit | Run CLI manually AND inspect Monitor logs to confirm the scheduled path has been firing. | |

**User's choice:** Full chain test (Recommended)
**Notes:** None

---

## Error Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Log + Monitor badge | Log the error, show a red badge/status in the Monitor menu bar app. No push notifications, no retries. | ✓ |
| Log only | Write to log file, no user-visible indication. | |
| Retry then alert | Retry once after 5 minutes. If still fails, show Monitor badge. | |

**User's choice:** Log + Monitor badge (Recommended)
**Notes:** None

---

## Legacy Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Remove both | Unload the plist, delete both files. The Monitor-based path replaced this. | ✓ |
| Leave as-is | Don't touch them. They're not hurting anything. | |
| Archive to docs | Remove from LaunchAgents but save copies in repo for reference. | |

**User's choice:** Remove both (Recommended)
**Notes:** None

---

## Printer Config

| Option | Description | Selected |
|--------|-------------|----------|
| Fail with clear error | If printer_name is set but printer is offline/missing, log error and show Monitor badge. No silent fallback. | ✓ |
| Fall back to default | If configured printer unavailable, try system default printer. | |
| Doctor check | Add printer reachability to Doctor subcommand. Fail at print time if unavailable. | |

**User's choice:** Recommended approach + added requirement for 100% scale printing
**Notes:** User wants to ensure auto-print at 100% scale — no fit-to-page shrinking. Also wants Doctor check for printer reachability (combined with fail-with-error approach).

---

## Claude's Discretion

- Specific lpr flags for 100% scale enforcement
- Printer availability detection method
- Monitor badge implementation approach

## Deferred Ideas

None
