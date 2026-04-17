# Phase 97: Mac CLI Print Reliability - Research

**Researched:** 2026-04-16
**Domain:** Mac CLI print path, CUPS/lpr, launchd LaunchAgents, SwiftUI Monitor app status
**Confidence:** HIGH — all findings verified directly against live codebase, running processes, and system state

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Full chain test required — Monitor→BriefScheduler→CLI→API→PDF→lpr end-to-end. CLI-only testing is insufficient.
- **D-02:** LaunchAgent (`com.jamesonmorrill.dailybriefmonitor.plist`) must be confirmed loaded and Monitor running before testing scheduled path.
- **D-03:** On print failure (printer offline, lpr error, PDF fetch fails): log the error AND show a red badge/status in Monitor menu bar. No push notifications, no automatic retries.
- **D-04:** Error state should be visible in Monitor UI so user knows the brief didn't print without checking logs.
- **D-05:** Remove both `com.jameson.dailysheet-print.plist` and `~/.dailysheet-print.sh`. Unload the plist first, then delete both files.
- **D-06:** If `printer_name` is set in config but printer is offline/missing, fail with a clear error and show Monitor badge. Do NOT silently fall back to default printer.
- **D-07:** Ensure printing happens at 100% scale — no fit-to-page shrinking. Pass appropriate lpr options to enforce actual size.
- **D-08:** Add printer reachability check to the Doctor subcommand.

### Claude's Discretion

- Specific lpr flags for 100% scale enforcement
- How to detect printer availability (lpstat, lpinfo, or similar)
- Monitor badge implementation approach (existing status patterns in the Monitor app)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIX-03 | Mac CLI auto-print is verified working and will print tomorrow's brief on schedule | All findings below directly support implementing and verifying this requirement |
</phase_requirements>

---

## Summary

The Mac CLI print path is partially working but has multiple identifiable bugs that explain the recent failures. The system has two distinct failure modes: (1) the server-side brief PDF disappears from `/tmp/briefs` on Railway restarts, causing the CLI to receive 404 from `/v1/brief/:date`; and (2) `PrintService.printPDF` logs lpr failures but does not throw, so print errors are silently swallowed and the Monitor never shows a red badge for print failures. Additionally, the legacy LaunchAgent (`com.jameson.dailysheet-print.plist`) is still loaded and pointing at a deleted script — this is dead weight that should be removed.

The good news: the infrastructure is fundamentally sound. The Monitor app is running (PID 30532), the CLI binary is fresh (rebuilt April 15), the printer (`HP_OfficeJet_9120e_Series`) is online and is the system default, and the Monitor's `StatusChecker` already has the logic to show red badges when the CLI exits non-zero. The phase is about fixing three specific gaps: (1) the ephemeral PDF storage problem, (2) the silent print failure, and (3) the missing 100% scale flags.

**Primary recommendation:** Fix `PrintService.printPDF` to throw on non-zero lpr exit, add `-o fit-to-page=false` and `-o scaling=100` lpr flags, add an `lpstat` printer reachability check to Doctor, add a printer reachability guard before lpr invocation, and remove the legacy LaunchAgent.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| DailyBriefMonitor LaunchAgent | D-02 scheduled run | ✓ loaded (PID 30532) | — | — |
| DailyBrief CLI binary | Print path | ✓ at `~/.local/bin/DailyBrief` | Built 2026-04-15 | — |
| HP_OfficeJet_9120e_Series | D-06, D-07 printing | ✓ idle, enabled | AirPrint | — |
| EPSON_WF_2850_Series (Fax) | — | ✓ idle | — | — |
| lpr / CUPS | PrintService.swift | ✓ `/usr/bin/lpr` | macOS system | — |
| lpstat | D-08 Doctor check | ✓ `/usr/sbin/lpstat` | macOS system | — |
| vigil-core API | CLI fetch step | ✓ api.vigilhub.io | — | — |
| Legacy plist `com.jameson.dailysheet-print` | D-05 removal | ✓ loaded (must unload first) | — | — |
| Legacy script `~/.dailysheet-print.sh` | D-05 removal | confirmed missing (plist points at deleted file) | — | — |

**Missing dependencies with no fallback:** None.

---

## Root Cause Analysis

### Bug 1: Server-Side Brief PDF Lost After Railway Restart [VERIFIED: live system]

The CLI does `GET /v1/brief/:date` to download a PDF the server already has. The server stores PDFs in `/tmp/briefs/` (ephemeral on Railway). When Railway restarts or redeploys between 4am (generate-schedule) and 6:05am (print-schedule), the PDF is gone and `GET /v1/brief/:date` returns:

```json
{"error":"Brief PDF not found — regenerate"}
```

**Evidence:**
- April 14: success — no Railway restart between 4am and 6am
- April 15: failure at 6am — "HTTP 404" — Railway restarted
- April 16: failure at 6am — "No brief for today" — same pattern
- `GET /v1/brief/2026-04-16` returns 404 right now (verified at 00:07 UTC)
- The brief metadata exists in the DB (`GET /v1/briefs/2026-04-16` returns 200 with thoughtCount=20)
- The generate-schedule API confirms: `{"hour":4,"minute":0,"enabled":true}`
- The print-schedule API confirms: `{"hour":6,"minute":5,"enabled":true}`

**Fix options (Claude's discretion on approach):**
1. CLI retries `POST /v1/brief/generate` automatically when it gets 404 — generates fresh PDF
2. Server persists PDFs to PostgreSQL as binary blobs (permanent storage) instead of /tmp
3. Server re-generates on-demand when /tmp file is missing (server-side regenerate-on-404)

Option 1 (CLI-side retry via `POST /v1/brief/generate`) is the fastest fix and stays within the Mac CLI scope of this phase. The endpoint exists: `POST /brief/generate` works (returns PDF + upserts DB record). The CLI would: try GET → on 404 → POST generate → use returned PDF bytes directly.

**Important:** The Monitor fired at 06:00:03 on April 16 (not 06:05 as API says). This means `fetchAndApplySchedule()` may have failed silently (network unavailable at boot, or API timeout). The Monitor defaults to 6:00 if the API fetch fails. This is within expected behavior (graceful degradation) and not a blocker.

### Bug 2: PrintService Silently Swallows lpr Failures [VERIFIED: source code]

`PrintService.printPDF` is declared `throws` but does NOT throw on non-zero lpr exit:

```swift
// Current (buggy) — Sources/DailyBrief/Utilities/PrintService.swift lines 29-33
if process.terminationStatus == 0 {
    Logger.log("PDF sent to printer")
} else {
    Logger.error("Print failed with exit code \(process.terminationStatus)")
    // BUG: does NOT throw — function returns normally
}
```

**Consequence:** When lpr fails, `Generate.run()` continues to the cleanup step and logs "DailyBrief complete". `StatusChecker.refresh()` sees "DailyBrief complete" → sets `lastRunSuccess = true` → Monitor shows green badge. The print failure is invisible in the UI.

**Fix:** Throw a typed error after logging:
```swift
} else {
    Logger.error("Print failed with exit code \(process.terminationStatus)")
    throw PrintError.lprFailed(process.terminationStatus)
}
```

When `PrintService.printPDF` throws, `Generate.run()` propagates it → CLI exits with code 1 → `StatusChecker` sees `[ERROR]` in log → `didFailNonStale = true` → Monitor shows red badge and "Print failed" text (already implemented in `MenuBarView.statusLine`).

### Bug 3: Missing 100% Scale Flags [VERIFIED: source + lpr man page]

Current `PrintService.printPDF` args:
```
-P HP_OfficeJet_9120e_Series -o sides=one-sided <path>
```

PDF dimensions: 3.75 × 7.5 inches (custom notebook). Printer default paper: Letter (8.5 × 11 inches).

CUPS default behavior when no media/scaling option is specified: scales the PDF to fill the paper (fit-to-page ON by default). The brief gets blown up to fill a Letter sheet.

**Correct lpr flags for 100% actual-size printing:**
```
-o fit-to-page=false -o scaling=100
```

`fit-to-page` is a standard CUPS job attribute (not in the printer PPD, so it won't appear in `lpoptions -l`). `scaling=100` is the CUPS numeric scaling attribute. Either alone should work; both together is belt-and-suspenders.

The HP printer PPD supports `Custom.WIDTHxHEIGHT` page size (confirmed via `lpoptions -l`), so an alternative is:
```
-o media=Custom.3.75inx7.5in
```
But `fit-to-page=false` + `scaling=100` is simpler and does not require knowing the exact PDF dimensions at call time. [CITED: CUPS Programming Manual, cups.org]

### Bug 4: No Printer Reachability Check Before lpr [VERIFIED: source code]

Current `PrintService.printPDF` calls `lpr` regardless of printer state. If the HP printer is offline, lpr returns non-zero. After Bug 2 is fixed (throw on non-zero), this will surface as a CLI failure — but the error message will be generic ("Print failed with exit code N").

**D-06 requires:** fail with a clear error if `printer_name` is set but printer offline.

**Detection method using `lpstat`:**
```bash
lpstat -p HP_OfficeJet_9120e_Series
```
Returns "printer HP_OfficeJet_9120e_Series is idle. enabled" (available) or "not ready" / non-zero exit (offline).

In Swift using `Process`:
```swift
let task = Process()
task.executableURL = URL(fileURLWithPath: "/usr/sbin/lpstat")
task.arguments = ["-p", config.printerName]
// exit 0 = printer exists and is enabled; non-zero = unavailable
```

**D-08 Doctor check:** Same `lpstat -p <name>` call added to the Doctor subcommand's check list.

---

## Existing Status Infrastructure (Monitor Badge)

The Monitor already has full error-state UI infrastructure. No new UI components are needed for D-03/D-04. [VERIFIED: source code]

### Menu Bar Title Icon (DailyBriefMonitorApp.swift, lines 54-69)

```swift
label: {
    HStack(spacing: 2) {
        Image(systemName: "doc.text")
        if appDelegate.checker.isRunning {
            Image(systemName: "arrow.triangle.2.circlepath")
        } else if updater.isRunning {
            Image(systemName: "arrow.triangle.2.circlepath")
        } else if let success = appDelegate.checker.lastRunSuccess {
            // NOTE: no .foregroundStyle here — icon is monochrome
            Image(systemName: success ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
        } else if watcherHasFailures {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        }
    }
}
```

The title bar icon shows `exclamationmark.circle.fill` on failure but WITHOUT a color modifier — it appears monochrome (template image tint). To make the failure more visible (D-04), add `.foregroundStyle(.red)` to the failure branch.

### Menu Bar Dropdown (MenuBarView.swift)

Already fully implemented for print failures:
- `statusIcon`: shows red `exclamationmark.circle.fill` when `checker.didFailNonStale`
- `statusLine`: returns "Print failed" when `didFailNonStale`
- `statusLineTint`: `.red` when `didFailNonStale`

These work correctly once `PrintService.printPDF` throws on lpr failure (fixing Bug 2), causing the CLI to exit 1, which `StatusChecker.refresh()` parses from the log's `[ERROR]` marker.

---

## Legacy Cleanup State

### `com.jameson.dailysheet-print.plist` [VERIFIED: live system]

- **Status:** LOADED (`launchctl list com.jameson.dailysheet-print` returns data, `LastExitStatus = 0`)
- **ProgramArguments:** `/bin/bash /Users/jamesonmorrill/.dailysheet-print.sh`
- **WatchPaths:** `/Users/jamesonmorrill/Documents/Day Job/outputs/daily_sheet.pdf`
- **The script `~/.dailysheet-print.sh` was deleted** — plist points at missing file
- **Risk:** If the watched path ever reappears, launchd would try to run a missing script
- **Removal sequence:** `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.jameson.dailysheet-print.plist` → `rm ~/Library/LaunchAgents/com.jameson.dailysheet-print.plist`

### `~/.dailysheet-print.sh` [VERIFIED: live system]

Confirmed deleted — `cat ~/.dailysheet-print.sh` returns "(not found)". Only plist removal needed.

---

## Architecture Patterns

### PrintService Fix Pattern

Add a typed error and throw after logging:

```swift
// Sources/DailyBrief/Utilities/PrintService.swift
enum PrintError: Error {
    case lprFailed(Int32)
    case printerNotReachable(String)
}

static func printPDF(at path: String, config: AppConfig.PrintingConfig) throws {
    guard config.enabled else {
        Logger.log("Printing disabled in config")
        return
    }
    
    // D-06: reachability check before invoking lpr
    if !config.printerName.isEmpty {
        try checkPrinterReachable(config.printerName)
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/lpr")

    var args = [String]()
    if !config.printerName.isEmpty {
        args += ["-P", config.printerName]
    }
    if config.copies > 1 {
        args += ["-#", String(config.copies)]
    }
    // D-07: 100% actual-size printing
    args += ["-o", "sides=one-sided"]
    args += ["-o", "fit-to-page=false"]
    args += ["-o", "scaling=100"]
    args.append(path)

    process.arguments = args
    try process.run()
    process.waitUntilExit()

    if process.terminationStatus == 0 {
        Logger.log("PDF sent to printer")
    } else {
        Logger.error("Print failed with exit code \(process.terminationStatus)")
        throw PrintError.lprFailed(process.terminationStatus)  // D-03: throw so Monitor shows badge
    }
}

private static func checkPrinterReachable(_ printerName: String) throws {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/sbin/lpstat")
    task.arguments = ["-p", printerName]
    task.standardOutput = Pipe()
    task.standardError = Pipe()
    try? task.run()
    task.waitUntilExit()
    if task.terminationStatus != 0 {
        Logger.error("Printer not reachable: \(printerName)")
        throw PrintError.printerNotReachable(printerName)
    }
}
```

### CLI 404 Recovery Pattern

In `DailyBrief.swift` Generate.run(), after the 404 catch block:

```swift
} catch let VigilAPIError.httpError(statusCode, _) where statusCode == 404 {
    // Attempt to generate the brief server-side, then download
    Logger.log("Brief not cached — requesting server generation...")
    do {
        pdfData = try await apiClient.getRawData(
            path: "/v1/brief/generate",
            method: "POST",
            accept: "application/pdf"
        )
        Logger.log("Brief generated on demand (\(pdfData.count) bytes)")
    } catch {
        Logger.log("No brief for today (\(today))")
        throw ExitCode(rawValue: 2)
    }
}
```

Note: `VigilAPIClient.getRawData` may need a `method:` parameter added if it only supports GET. Verify the client interface before implementing — see `Sources/JarvisCore/Network/VigilAPIClient.swift`.

### Doctor Printer Check Pattern

In `DailyBrief.swift` Doctor.run(), add after the existing checks:

```swift
// Check N: Printer reachable (D-08)
let printerConfig = (try? ConfigLoader.load(from: nil))?.printing
if let name = printerConfig?.printerName, !name.isEmpty, printerConfig?.enabled == true {
    let printerTask = Process()
    printerTask.executableURL = URL(fileURLWithPath: "/usr/sbin/lpstat")
    printerTask.arguments = ["-p", name]
    printerTask.standardOutput = Pipe()
    printerTask.standardError = Pipe()
    try? printerTask.run()
    printerTask.waitUntilExit()
    let printerReachable = printerTask.terminationStatus == 0
    printCheck("Printer reachable (\(name))", pass: printerReachable)
    if !printerReachable { allPass = false }
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Printer availability detection | Custom network probe / ping | `lpstat -p <name>` (CUPS) | CUPS already knows printer state including CUPS queue, not just network |
| PDF scaling to actual size | Custom PDF re-rendering | `lpr -o fit-to-page=false -o scaling=100` | CUPS handles rasterization |
| Print error propagation to UI | Custom IPC / notifications | Swift `throw` propagating to CLI exit code, which StatusChecker reads from log | Already wired — just need the throw |

---

## Common Pitfalls

### Pitfall 1: PrintService Throws But Generate Catches Too Broadly
**What goes wrong:** If `Generate.run()` wraps `PrintService.printPDF` in a `do { ... } catch { }` that logs and continues, the throw is still swallowed.
**Why it happens:** Developer adds error handling that doesn't re-throw.
**How to avoid:** Let `try PrintService.printPDF(...)` propagate naturally — `Generate.run()` is already `throws` and the outer CLI framework handles the exit code.
**Warning signs:** "DailyBrief complete" appears in log even after simulating a printer failure.

### Pitfall 2: lpr -o scaling=100 Has No Effect Without fit-to-page=false
**What goes wrong:** Adding only `-o scaling=100` may not prevent CUPS from auto-scaling on some printers.
**How to avoid:** Use both `-o fit-to-page=false -o scaling=100` together.
**Verification:** Print a test page and measure output dimensions against known PDF size.

### Pitfall 3: lpstat -p Returns 0 for Offline Network Printers That Are Paused
**What goes wrong:** `lpstat -p` exits 0 even if the printer is paused/offline in some configurations — it checks queue existence, not reachability.
**How to avoid:** Parse the lpstat output string for "is idle" or "is ready" in addition to checking exit code. Or use `lpstat -p <name> | grep -v stopped`.
**Verification:** Test by pausing the printer in System Settings and running `lpstat -p HP_OfficeJet_9120e_Series`.

### Pitfall 4: Legacy Plist Unload Fails If Monitor Is Running on Different Session
**What goes wrong:** `launchctl bootout` fails if wrong session type is specified.
**How to avoid:** Use `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.jameson.dailysheet-print.plist` — `gui/UID` targets the Aqua session where it's loaded.
**Verification:** After bootout, `launchctl list com.jameson.dailysheet-print` should return non-zero.

### Pitfall 5: Railway /tmp Restarted — Brief Available in DB But Not on Disk
**What goes wrong:** `GET /v1/brief/:date` returns 404 with "Brief PDF not found — regenerate" even though the brief row exists in the DB (pdfFilename stored but /tmp file gone).
**Root cause:** Railway's ephemeral filesystem. The brief-generate route reads from `rows[0].pdfFilename` which is a `/tmp` path. If Railway restarted, that file is gone.
**How to avoid:** CLI must handle 404 as a signal to trigger `POST /v1/brief/generate` (regenerate on demand) rather than treating it as "no brief today" (exit code 2).
**Warning signs:** `GET /v1/briefs/:date` (history endpoint) returns 200 with a record, but `GET /v1/brief/:date` returns 404 — this confirms the DB row exists but the PDF file is lost.

---

## Verification Strategy (Full Chain, per D-01)

Per D-01, CLI-only testing is insufficient. The full chain is:

```
Monitor (BriefScheduler timer) → StatusChecker.runNow() → DailyBrief CLI
  → GET /v1/brief/:date (or POST /v1/brief/generate on 404)
  → PDF saved to ~/Documents/DailyBrief/
  → PrintService.printPDF → lpr → HP_OfficeJet_9120e_Series
  → Monitor StatusChecker.refresh() → red/green badge
```

**Step-by-step verification plan:**
1. Run `dailybrief doctor` → confirm all checks pass including new printer reachability check
2. Run `dailybrief generate` manually → confirm PDF produced + "PDF sent to printer" in log
3. Check physical printer output for 100% scale (measure output against 3.75" × 7.5" PDF)
4. Simulate lpr failure (pause printer) → run CLI → confirm Monitor shows red badge
5. Simulate 404 path (brief not cached) → confirm CLI triggers POST generate and succeeds
6. For scheduled path: confirm `launchctl list com.jamesonmorrill.dailybriefmonitor` shows PID → wait for/advance to next scheduled fire → verify log shows the run

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | XCTest (Swift Package) |
| Config file | Package.swift (test target: DailyBriefMonitorTests) |
| Quick run command | `swift test --filter DailyBriefMonitorTests` |
| Full suite command | `swift test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIX-03 | PrintService throws on lpr non-zero exit | unit | `swift test --filter PrintServiceTests` | ❌ Wave 0 |
| FIX-03 | Monitor shows red badge when CLI exits 1 (print fail) | unit (StatusCheckerTests) | `swift test --filter StatusCheckerTests` | ✅ |
| FIX-03 | Doctor check passes with printer online | manual | `dailybrief doctor` | — |
| FIX-03 | 100% scale output | manual | physical paper measurement | — |
| FIX-03 | Scheduled run fires via Monitor | manual | log inspection + D-01 full chain | — |

### Sampling Rate
- Per task commit: `swift test --filter StatusCheckerTests` (existing, fast)
- Per wave merge: `swift test`
- Phase gate: Full suite green + manual print verification before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `Tests/DailyBriefTests/PrintServiceTests.swift` — covers PrintService throw-on-failure + printer reachability check
- [ ] `Tests/DailyBriefTests/` directory — test target may need to be added to Package.swift if it doesn't exist

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `POST /v1/brief/generate` returns raw PDF bytes (not JSON) | Root Cause Bug 1 / CLI fix | Code would need to parse JSON response and extract URL instead |
| A2 | `VigilAPIClient.getRawData` does not support POST method | CLI 404 Recovery Pattern | May need a new `postRawData` method or the existing method may already support it |
| A3 | `-o fit-to-page=false -o scaling=100` produces actual-size output on HP_OfficeJet_9120e_Series via AirPrint | Pitfall 2 | AirPrint drivers may override these options; physical test required |

---

## Open Questions

1. **Does `VigilAPIClient` support POST for `getRawData`?**
   - What we know: `DailyBrief.swift` uses `apiClient.getRawData(path:accept:)` which appears to be GET-only
   - What's unclear: Whether a `postRawData` method exists or needs to be added
   - Recommendation: Read `Sources/JarvisCore/Network/VigilAPIClient.swift` before writing the 404-fallback task

2. **Should CLI use returned PDF bytes from `POST /generate` directly, or save to disk first?**
   - What we know: `POST /brief/generate` returns the PDF as binary (verified from brief-generate.ts line 85-92)
   - What's unclear: Whether to write bytes to disk then call `PrintService.printPDF(at:)` or stream directly to lpr
   - Recommendation: Write to disk (same as normal path), then call PrintService — consistent code path, avoids lpr stdin piping complexity

3. **Is the Monitor's scheduled fire time reliable at 6:05 (per API) or will it default to 6:00?**
   - What we know: April 16 fired at 06:00:03 (default, not 06:05 from API). `fetchAndApplySchedule()` has 5-second timeout; on sleep-wake or slow API, it may default.
   - What's unclear: Whether this is a consistent race condition
   - Recommendation: Not a blocker — the 5-minute difference doesn't affect correctness. The API fetch happens async at startup and does apply if it completes in time.

---

## Sources

### Primary (HIGH confidence — verified against live system and source code)
- `Sources/DailyBrief/Utilities/PrintService.swift` — silent failure bug confirmed
- `Sources/DailyBrief/DailyBrief.swift` — Generate.run() flow, Doctor subcommand
- `Sources/DailyBriefMonitor/StatusChecker.swift` — badge logic confirmed working
- `Sources/DailyBriefMonitor/MenuBarView.swift` — "Print failed" text already implemented
- `Sources/DailyBriefMonitor/DailyBriefMonitorApp.swift` — title bar icon missing .red modifier
- `vigil-core/src/routes/brief-generate.ts` — /tmp storage confirmed, regenerate-on-demand path verified
- Live system: `launchctl list` outputs, `lpstat -p` outputs, `lpoptions -l` outputs
- Live API: `GET /v1/settings/print-schedule` → `{"hour":6,"minute":5,"enabled":true}`
- Live API: `GET /v1/settings/generate-schedule` → `{"hour":4,"minute":0,"enabled":true}`
- Live API: `GET /v1/brief/2026-04-16` → 404 ("Brief PDF not found — regenerate")
- Daily log: confirmed April 14 success, April 15-16 failures
- `~/Library/LaunchAgents/com.jameson.dailysheet-print.plist` — loaded, script deleted, confirmed

### Secondary (MEDIUM confidence)
- CUPS `fit-to-page` and `scaling` options: standard CUPS job attributes per CUPS documentation. [CITED: cups.org CUPS Programming Manual]

---

## Metadata

**Confidence breakdown:**
- Root cause analysis: HIGH — verified against logs, live API, and source code
- PrintService fix pattern: HIGH — straightforward Swift throw propagation
- lpr scale flags: MEDIUM — standard CUPS options but actual-size behavior requires physical verification (A3)
- 404-fallback CLI fix: MEDIUM — brief-generate.ts confirmed POST returns PDF, but VigilAPIClient interface needs verification (A2)
- Legacy cleanup: HIGH — plist state confirmed live

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable — no fast-moving dependencies)
