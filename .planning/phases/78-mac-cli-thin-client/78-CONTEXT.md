# Phase 78: Mac CLI Thin Client - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The Mac CLI's `generate` command is rewritten as a thin client: it calls `POST /v1/brief/generate` to get a PDF binary, saves the file locally, and prints via `lpr`. All local data-fetching code used exclusively by the generate flow is removed, along with the entire CoreGraphics PDF rendering layer. Services shared with other CLI commands (work order sync, thought capture, etc.) are preserved.

</domain>

<decisions>
## Implementation Decisions

### Scope of Code Removal
- **D-01:** Full thin client rewrite — the generate command becomes: API call → save PDF → print. All local data aggregation for the brief is removed from the generate flow.
- **D-02:** Delete the entire `Sources/DailyBrief/PDF/` directory (PDFGenerator.swift, PDFStyles.swift, PageOneRenderer.swift, PageTwoRenderer.swift, PageThreeRenderer.swift) — these use CoreGraphics/CoreText and are no longer needed.
- **D-03:** Remove services/code that are EXCLUSIVELY used by the generate command's data-fetching pipeline. Keep any services also used by other CLI commands (e.g., `VigilAPIClient` is shared and stays).
- **D-04:** The generate command's new flow: construct API call using existing `VigilAPIClient` → receive PDF binary → write to output directory (same path convention) → call `PrintService.printPDF(at:)` → save brief metadata snapshot to API.

### Failure Behavior
- **D-05:** Fail fast with clear error. If the server is unreachable or returns an error, log the error and exit with non-zero status code. No retry logic, no local fallback.
- **D-06:** The Monitor app already watches CLI exit status — server failures surface through existing monitoring. No new notification mechanism needed.

### CLI Output & Logging
- **D-07:** Minimal logging — 3-4 lines reflecting actual thin-client operations: requesting from server, PDF received (with size), sent to printer, done.
- **D-08:** No cosmetic "source status" logging. The CLI reports what it actually does, not what the server did internally.

### Claude's Discretion
- How to detect which services are generate-only vs shared (static analysis of call sites)
- Whether `PDFLayout` and related config types should also be removed (if they're only used by the deleted PDF layer)
- HTTP response handling details (streaming vs buffered, timeout values)
- Whether the `--dry-run` flag behavior changes (previously it skipped PDF generation — now it could skip the API call or just skip printing)
- Whether `buildBriefSnapshot` logic changes or if the server response provides enough metadata

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CLI Generate Command (the thing being rewritten)
- `Sources/DailyBrief/DailyBrief.swift` — Main CLI entry point. The `Generate` command (around line 40-274) contains the full local pipeline that gets replaced.

### PDF Layer (being deleted)
- `Sources/DailyBrief/PDF/PDFGenerator.swift` — CoreGraphics PDF renderer
- `Sources/DailyBrief/PDF/PDFStyles.swift` — Style constants
- `Sources/DailyBrief/PDF/PageOneRenderer.swift` — Page 1 layout
- `Sources/DailyBrief/PDF/PageTwoRenderer.swift` — Page 2 layout
- `Sources/DailyBrief/PDF/PageThreeRenderer.swift` — Page 3 layout

### Print Service (preserved)
- `Sources/DailyBrief/Utilities/PrintService.swift` — `lpr` wrapper. Stays as-is — the thin client still saves a PDF file and prints it.

### API Client (preserved, reused)
- `VigilAPIClient` — Already wired with `config.apiBaseUrl` + `config.apiKey`. Used to call `POST /v1/brief/generate`.

### Server Endpoint (Phase 76)
- `vigil-core/src/services/brief-assembly-service.ts` — The assembler that the CLI will now call
- `vigil-core/src/routes/brief.ts` — Route definitions including `POST /v1/brief/generate`
- `.planning/phases/76-brief-assembly-endpoint/76-CONTEXT.md` — Server-side decisions (D-08: no request body, D-09: PDF binary response, D-11: bearer auth)

### Monitor (watches CLI status)
- `Sources/DailyBriefMonitor/BriefScheduler.swift` — Triggers CLI runs on schedule
- `Sources/DailyBriefMonitor/` — Monitor app that surfaces CLI failures

### Requirements
- `.planning/REQUIREMENTS.md` — CLI-01, CLI-02, CLI-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `VigilAPIClient` — Already configured with server URL and bearer token. Has `.get()` and `.post()` methods. Use for the `/v1/brief/generate` call.
- `PrintService.printPDF(at:config:)` — Existing `lpr` wrapper. Takes a file path. No changes needed.
- `ConfigLoader` — Handles `config.pdf.outputDirectory` path expansion and directory creation. Reuse for saving the downloaded PDF.
- `Logger` — Existing logging utility used throughout. Use for the minimal output lines.

### Established Patterns
- The CLI uses `async/await` with `ArgumentParser` for command structure
- `VigilAPIClient` uses generic `get<T: Decodable>` and `post<T: Decodable>` — may need a raw data variant for binary PDF response
- Config is loaded once at command start and threaded through

### Integration Points
- `DailyBrief.swift` Generate command (~line 40-274) — the primary rewrite target
- `Package.swift` — CoreGraphics/CoreText dependencies may need removal
- `BriefScheduler` in Monitor — triggers CLI, watches exit code. No changes needed but verify behavior with new exit codes.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 78-mac-cli-thin-client*
*Context gathered: 2026-04-13*
