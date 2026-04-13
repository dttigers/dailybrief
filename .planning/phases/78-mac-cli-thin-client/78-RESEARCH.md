# Phase 78: Mac CLI Thin Client - Research

**Researched:** 2026-04-13
**Domain:** Swift CLI refactoring, HTTP binary download, code removal
**Confidence:** HIGH

## Summary

This phase rewrites the Mac CLI `Generate` command from a 230-line local data-fetching + PDF rendering pipeline into a ~40-line thin client: call `POST /v1/brief/generate` via the existing `VigilAPIClient`, save the PDF binary to disk, and print via the existing `PrintService`. The entire `Sources/DailyBrief/PDF/` directory (5 files) is deleted, along with generate-only services (`SportsService`, `RemindersService`, `EmailService`, `ESPNSportsService`, `AIService`, `WorkOrderPrioritizer`). `Package.swift` drops the `CoreGraphics`, `CoreText`, and `EventKit` framework links.

The existing `VigilAPIClient.getRawData()` method already supports raw `Data` responses with configurable `Accept` headers -- it just needs to be called with `accept: "application/pdf"`. No new HTTP infrastructure is needed. The `BriefScheduler` in Monitor triggers CLI runs via `StatusChecker.runNow()` and watches exit codes -- it requires zero changes since the CLI still exits 0 on success and non-zero on failure.

**Primary recommendation:** Use `VigilAPIClient.getRawData(path:query:accept:)` with `accept: "application/pdf"` for the binary download. The Generate command body shrinks to: load config, init API client, call endpoint, write Data to file, print, done.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Full thin client rewrite -- the generate command becomes: API call -> save PDF -> print. All local data aggregation for the brief is removed from the generate flow.
- **D-02:** Delete the entire `Sources/DailyBrief/PDF/` directory (PDFGenerator.swift, PDFStyles.swift, PageOneRenderer.swift, PageTwoRenderer.swift, PageThreeRenderer.swift).
- **D-03:** Remove services/code that are EXCLUSIVELY used by the generate command's data-fetching pipeline. Keep any services also used by other CLI commands (e.g., `VigilAPIClient` is shared and stays).
- **D-04:** The generate command's new flow: construct API call using existing `VigilAPIClient` -> receive PDF binary -> write to output directory (same path convention) -> call `PrintService.printPDF(at:)` -> save brief metadata snapshot to API.
- **D-05:** Fail fast with clear error. If the server is unreachable or returns an error, log the error and exit with non-zero status code. No retry logic, no local fallback.
- **D-06:** The Monitor app already watches CLI exit status -- server failures surface through existing monitoring. No new notification mechanism needed.
- **D-07:** Minimal logging -- 3-4 lines reflecting actual thin-client operations: requesting from server, PDF received (with size), sent to printer, done.
- **D-08:** No cosmetic "source status" logging. The CLI reports what it actually does, not what the server did internally.

### Claude's Discretion
- How to detect which services are generate-only vs shared (static analysis of call sites)
- Whether `PDFLayout` and related config types should also be removed (if they're only used by the deleted PDF layer)
- HTTP response handling details (streaming vs buffered, timeout values)
- Whether the `--dry-run` flag behavior changes (previously it skipped PDF generation -- now it could skip the API call or just skip printing)
- Whether `buildBriefSnapshot` logic changes or if the server response provides enough metadata

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-01 | Mac CLI fetches PDF from `/v1/brief/generate` instead of rendering locally | `VigilAPIClient.getRawData()` already supports binary downloads with custom Accept headers. Generate command rewrite is straightforward. |
| CLI-02 | Mac CLI auto-print workflow preserved -- BriefScheduler triggers API call + `lpr` | BriefScheduler calls `StatusChecker.runNow()` which invokes the CLI binary. No changes needed -- CLI still exits 0/non-zero. PrintService stays as-is. |
| CLI-03 | CoreGraphics PDF rendering code removed from Mac CLI | 5 files in `Sources/DailyBrief/PDF/`, plus generate-only services (6 files), plus `Package.swift` framework links (CoreGraphics, CoreText, EventKit). |
</phase_requirements>

## Architecture Patterns

### Generate Command New Flow
```
1. Load config (existing ConfigLoader)
2. Init VigilAPIClient (existing pattern)
3. POST /v1/brief/generate via getRawData(accept: "application/pdf")
4. Write Data to output directory (same path convention as today)
5. Print via PrintService.printPDF(at:config:) (unchanged)
6. Save brief snapshot to API (simplified -- server already has the data)
7. Cleanup old PDFs (existing cleanupOldPDFs stays)
```

### Existing `getRawData` Method (Reuse As-Is)
```swift
// Source: Sources/JarvisCore/Services/VigilAPIClient.swift line 231
public func getRawData(path: String, query: [String: String] = [:], accept: String = "application/json") async throws -> Data {
    // Already handles: bearer auth, URL construction, error validation
    // Just call with accept: "application/pdf"
}
```
[VERIFIED: codebase grep of VigilAPIClient.swift]

**Issue:** `getRawData` uses HTTP GET, but the server endpoint is `POST /v1/brief/generate`. A `postRawData` variant is needed, or the endpoint needs to accept GET. Since Phase 76 specifies POST (D-08), the simplest path is adding a `postRawData` method to `VigilAPIClient` that mirrors `getRawData` but uses POST. [VERIFIED: codebase grep -- no existing POST-raw-data method exists]

### Recommended `postRawData` Addition
```swift
// Add to VigilAPIClient
public func postRawData(path: String, accept: String = "application/json") async throws -> Data {
    var request = URLRequest(url: baseURL.appendingPathComponent(path))
    request.httpMethod = "POST"
    request.setValue(accept, forHTTPHeaderField: "Accept")
    if let apiKey, !apiKey.isEmpty {
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
    }
    let (data, response) = try await executeRequest(request)
    try validateResponse(data: data, response: response)
    return data
}
```

### Error Handling Pattern (D-05: Fail Fast)
```swift
do {
    let pdfData = try await apiClient.postRawData(path: "/v1/brief/generate", accept: "application/pdf")
    // ... save and print
} catch {
    Logger.error("Brief generation failed: \(error.localizedDescription)")
    throw ExitCode.failure
}
```

### Anti-Patterns to Avoid
- **Leaving dead imports:** After removing generate-only services, ensure no orphaned `import` statements remain.
- **Keeping DailyBriefData construction:** The entire `DailyBriefData(...)` init block (~20 lines) and all the data-fetching above it must go. The thin client never touches brief data.
- **Modifying BriefScheduler:** It delegates to `StatusChecker.runNow()` which invokes the CLI binary. The scheduler doesn't know or care what the CLI does internally.

## Code Removal Analysis

### Files to DELETE (generate-only)
| File | Reason | Confidence |
|------|--------|------------|
| `Sources/DailyBrief/PDF/PDFGenerator.swift` | CoreGraphics PDF renderer -- replaced by server | HIGH [VERIFIED] |
| `Sources/DailyBrief/PDF/PDFStyles.swift` | PDFLayout + style constants -- only used by PDF renderers + Generate | HIGH [VERIFIED] |
| `Sources/DailyBrief/PDF/PageOneRenderer.swift` | Page 1 layout -- only used by PDFGenerator | HIGH [VERIFIED] |
| `Sources/DailyBrief/PDF/PageTwoRenderer.swift` | Page 2 layout -- only used by PDFGenerator | HIGH [VERIFIED] |
| `Sources/DailyBrief/PDF/PageThreeRenderer.swift` | Page 3 layout -- only used by PDFGenerator | HIGH [VERIFIED] |
| `Sources/DailyBrief/Services/SportsService.swift` | MLB fetch -- only used in Generate command | HIGH [VERIFIED] |
| `Sources/DailyBrief/Services/ESPNSportsService.swift` | NFL/NBA/NHL fetch -- only used in Generate command | HIGH [VERIFIED] |
| `Sources/DailyBrief/Services/RemindersService.swift` | Apple Reminders fetch -- only used in Generate command | HIGH [VERIFIED] |
| `Sources/DailyBrief/Services/EmailService.swift` | IMAP work order fetch -- only used in Generate command | HIGH [VERIFIED] |
| `Sources/DailyBrief/Services/AIService.swift` | APIAIProvider (affirmation) -- only used in Generate command | HIGH [VERIFIED] |
| `Sources/DailyBrief/Services/WorkOrderPrioritizer.swift` | APIWorkOrderPrioritizer -- only used in Generate command | HIGH [VERIFIED] |

### Files to KEEP (shared with other commands)
| File | Used By | Confidence |
|------|---------|------------|
| `Sources/DailyBrief/Utilities/PrintService.swift` | Generate (thin client still prints) + History reprint | HIGH [VERIFIED] |
| `Sources/DailyBrief/Utilities/Logger.swift` | All commands | HIGH [VERIFIED] |
| `Sources/DailyBrief/Services/CompletionStore.swift` | Complete, Uncomplete, ListCompleted commands (lines 722, 763, 795) | HIGH [VERIFIED] |
| `Sources/JarvisCore/Services/VigilAPIClient.swift` | All commands that talk to API | HIGH [VERIFIED] |

### Files to MODIFY
| File | Change | Confidence |
|------|--------|------------|
| `Sources/DailyBrief/DailyBrief.swift` | Rewrite Generate.run() from ~240 lines to ~40 lines. Remove `printSummary`, `buildBriefSnapshot` (or simplify snapshot). Keep all other subcommands untouched. | HIGH [VERIFIED] |
| `Package.swift` | Remove `CoreGraphics`, `CoreText`, `EventKit` from DailyBrief linkerSettings | HIGH [VERIFIED] |
| `Sources/JarvisCore/Services/VigilAPIClient.swift` | Add `postRawData(path:accept:)` method | HIGH [VERIFIED] |

### Models to KEEP (live in JarvisCore, shared)
`DailyBriefData`, `SportData`, `BriefSnapshot`, `BriefRecord` -- these live in JarvisCore and are used by Monitor/Dashboard. Do NOT delete them even though the CLI no longer constructs them directly. [VERIFIED: grep shows Monitor uses BriefRecord and BriefSnapshot]

### PDFLayout -- REMOVE reference only
`PDFLayout` is defined in `Sources/DailyBrief/PDF/PDFStyles.swift` (being deleted). The only reference outside `PDF/` is `DailyBrief.swift` line 246. Since the whole PDF directory is deleted, the reference goes away with the Generate rewrite. No action needed beyond file deletion. [VERIFIED: grep shows PDFLayout only in PDF/ dir and DailyBrief.swift]

## Discretion Recommendations

### `--dry-run` Flag Behavior
**Recommendation:** `--dry-run` should skip the API call entirely and print a message like "Dry run: would call POST /v1/brief/generate". Rationale: the server call is the expensive operation and has side effects (generates and stores a PDF server-side). The old behavior (fetch data, display summary, skip PDF) was about previewing data -- but the thin client has no data to preview. [ASSUMED]

### `buildBriefSnapshot` After Thin Client
**Recommendation:** Remove `buildBriefSnapshot` from the CLI. The server already saves brief metadata as part of `POST /v1/brief/generate` (Phase 76, D-07: upsert briefs row on generation). The CLI doing a separate `POST /briefs` is redundant. If the server doesn't save metadata, that's a server bug, not a CLI responsibility. [VERIFIED: Phase 76 CONTEXT.md D-07 confirms server saves metadata]

### HTTP Timeout
**Recommendation:** Use URLSession default timeout (60s). Brief generation involves PDF rendering + data fetching on the server, which could take 10-30s. The default is sufficient. No custom timeout logic needed. [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP binary download | Custom URLSession code | `VigilAPIClient.postRawData()` (new method) | Auth, error handling, retry already solved |
| PDF printing | Shell script or custom print | `PrintService.printPDF(at:config:)` | Already handles printer name, copies, one-sided |
| Output directory management | Custom path logic | `ConfigLoader.expandPath()` + `ensureDirectoryExists()` | Already handles `~` expansion, directory creation |
| Old PDF cleanup | New cleanup logic | Existing `cleanupOldPDFs()` | Already handles date-based retention |

## Common Pitfalls

### Pitfall 1: Forgetting to Remove Framework Links from Package.swift
**What goes wrong:** Build still links CoreGraphics/CoreText/EventKit even though no code uses them.
**Why it happens:** File deletion removes source but not Package.swift linkerSettings.
**How to avoid:** After deleting PDF/ and service files, update Package.swift DailyBrief target linkerSettings to remove CoreGraphics, CoreText, and EventKit.
**Warning signs:** Build succeeds but binary is unnecessarily large; or worse, build fails on a clean machine without those frameworks.

### Pitfall 2: Breaking the Complete/Uncomplete/ListCompleted Commands
**What goes wrong:** Overzealous removal deletes CompletionStore or shared utilities.
**Why it happens:** Grepping for "generate-only" misses that CompletionStore is used by other subcommands.
**How to avoid:** Verify each deletion candidate has NO callers outside the Generate command. CompletionStore is used at lines 722, 763, 795 in other subcommands.
**Warning signs:** `swift build` fails with "cannot find CompletionStore in scope."

### Pitfall 3: Leaving Dead Model Types in JarvisCore
**What goes wrong:** Types like `GameScore`, `StandingsEntry`, `UpcomingGame`, `ReminderItem` remain in JarvisCore even though no client uses them.
**Why it happens:** These are in the shared library, not in the CLI target being cleaned.
**How to avoid:** Do NOT remove these from JarvisCore -- Monitor/Dashboard may reference them, and they're part of the shared API contract. They're not dead code, they're shared infrastructure.
**Warning signs:** Monitor build fails after removing "unused" types.

### Pitfall 4: Server Endpoint Not Ready
**What goes wrong:** Phase 78 is implemented before Phase 76 is complete, so the endpoint doesn't exist yet.
**Why it happens:** Phase ordering dependency.
**How to avoid:** Phase 78 depends on Phase 76. Verify `/v1/brief/generate` returns PDF binary before executing this phase.
**Warning signs:** CLI gets 404 or connection refused.

## Code Examples

### New Generate Command Body
```swift
// Source: Research recommendation based on existing patterns
func run() async throws {
    if setup {
        try createTemplateConfig()
        return
    }
    
    let config = try ConfigLoader.load(from: configPath)
    let apiClient = VigilAPIClient(
        baseURL: URL(string: config.apiBaseUrl)!,
        apiKey: config.apiKey
    )
    
    if dryRun {
        Logger.log("Dry run: would call POST /v1/brief/generate")
        return
    }
    
    Logger.log("Requesting brief from server...")
    
    let pdfData: Data
    do {
        pdfData = try await apiClient.postRawData(
            path: "/v1/brief/generate",
            accept: "application/pdf"
        )
    } catch {
        Logger.error("Brief generation failed: \(error.localizedDescription)")
        throw ExitCode.failure
    }
    
    Logger.log("PDF received (\(pdfData.count) bytes)")
    
    // Save to output directory
    let outputDir = ConfigLoader.expandPath(config.pdf.outputDirectory)
    try ConfigLoader.ensureDirectoryExists(outputDir)
    
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    let filename = "daily_sheet_\(formatter.string(from: Date())).pdf"
    let outputPath = (outputDir as NSString).appendingPathComponent(filename)
    
    try pdfData.write(to: URL(fileURLWithPath: outputPath))
    
    // Print
    if !noPrint {
        try PrintService.printPDF(at: outputPath, config: config.printing)
    } else {
        Logger.log("Printing skipped (--no-print)")
    }
    
    // Cleanup old PDFs
    cleanupOldPDFs(directory: outputDir, keepDays: config.pdf.keepDays)
    
    Logger.log("DailyBrief complete")
}
```

### Updated Package.swift DailyBrief Target
```swift
// Source: Research recommendation -- remove framework links
.executableTarget(
    name: "DailyBrief",
    dependencies: [
        .product(name: "ArgumentParser", package: "swift-argument-parser"),
        "JarvisCore",
    ]
    // No linkerSettings needed -- EventKit, CoreGraphics, CoreText removed
),
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `--dry-run` should skip the API call entirely | Discretion Recommendations | Low -- easy to adjust behavior |
| A2 | URLSession default 60s timeout is sufficient for brief generation | Discretion Recommendations | Medium -- if server takes >60s, CLI fails silently. Could add explicit timeout. |

## Open Questions

1. **Should `buildBriefSnapshot` POST be kept for redundancy?**
   - What we know: Phase 76 server already saves brief metadata on generation (D-07)
   - What's unclear: Whether the server's saved metadata matches what the CLI previously posted
   - Recommendation: Remove it. The server knows what it generated. If metadata is needed, query `/briefs/:date`.

2. **Should the `--setup` flag and template config be updated?**
   - What we know: Template config includes email, sports, reminders sections that are now irrelevant for generate
   - What's unclear: Whether other commands still use those config sections
   - Recommendation: Leave template config as-is for now. Config cleanup is a separate concern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Swift Testing / XCTest (macOS) |
| Config file | Package.swift testTarget |
| Quick run command | `swift build --target DailyBrief` (compile check) |
| Full suite command | `swift build` (all targets compile) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-01 | Generate fetches PDF from API | smoke | `swift build --target DailyBrief && .build/debug/DailyBrief --dry-run` | N/A -- compile check |
| CLI-02 | Auto-print preserved | manual-only | BriefScheduler triggers CLI -- no code change, verify Monitor still works | N/A |
| CLI-03 | CoreGraphics code removed | unit | `swift build --target DailyBrief` (no CoreGraphics link errors = pass) | N/A |

### Wave 0 Gaps
None -- this phase is primarily code removal and rewrite. The primary validation is that `swift build` succeeds for all three targets (DailyBrief, DailyBriefMonitor, JarvisCore) after changes.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer token via existing VigilAPIClient -- no changes |
| V3 Session Management | no | CLI is stateless |
| V4 Access Control | no | Server handles authorization |
| V5 Input Validation | no | CLI sends no user input to server (D-08: no request body) |
| V6 Cryptography | no | HTTPS transport only -- handled by URLSession |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure in logs | Information Disclosure | Logger never prints config.apiKey -- existing pattern, no change needed |
| Man-in-the-middle on PDF download | Tampering | HTTPS enforced by VigilAPIClient URL scheme |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `Sources/DailyBrief/DailyBrief.swift` -- full Generate command read (lines 1-480)
- Codebase analysis: `Sources/JarvisCore/Services/VigilAPIClient.swift` -- `getRawData` method, error types
- Codebase analysis: `Sources/DailyBriefMonitor/BriefScheduler.swift` -- scheduler delegates to StatusChecker
- Codebase analysis: `Package.swift` -- linkerSettings for CoreGraphics/CoreText/EventKit
- Codebase analysis: All service files grepped for cross-command usage

### Secondary (MEDIUM confidence)
- Phase 76 CONTEXT.md -- server endpoint contract (D-08: no body, D-09: PDF binary, D-11: bearer auth)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- this is a refactoring phase, all code is in the codebase
- Architecture: HIGH -- reusing existing `VigilAPIClient` and `PrintService` patterns
- Pitfalls: HIGH -- identified through static analysis of call sites
- Code removal scope: HIGH -- every file verified via grep for cross-references

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (code removal phase, stable unless new commands are added)
