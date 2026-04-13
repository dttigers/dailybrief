---
phase: 78-mac-cli-thin-client
fixed_at: 2026-04-13T12:15:00Z
review_path: .planning/phases/78-mac-cli-thin-client/78-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 78: Code Review Fix Report

**Fixed at:** 2026-04-13T12:15:00Z
**Source review:** .planning/phases/78-mac-cli-thin-client/78-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Force-unwrap on user-controlled URL crashes the CLI

**Files modified:** `Sources/DailyBrief/DailyBrief.swift`
**Commit:** aa8bda1
**Applied fix:** Extracted a shared `DailyBrief.makeAPIClient(config:)` helper that uses `guard let` on URL construction and throws `ExitCode.failure` with a descriptive error on invalid input. Replaced all six force-unwrap `URL(string: config.apiBaseUrl)!` call sites across Generate, History, Export, Complete, Uncomplete, and ListCompleted subcommands.

### WR-01: CLI argument interpolated into API path without sanitization

**Files modified:** `Sources/DailyBrief/DailyBrief.swift`
**Commit:** 9b18b3a
**Applied fix:** Added `addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)` to case number arguments in Complete and Uncomplete loops (with `guard` + `continue` on failure), and defense-in-depth encoding on the already-regex-validated `reprintDate` in History reprint path.

### WR-02: Encoding failure mislabeled as decoding error

**Files modified:** `Sources/JarvisCore/Services/VigilAPIClient.swift`
**Commit:** ea97cf7
**Applied fix:** Added `encodingError(Error)` case to `VigilAPIError` enum with corresponding `errorDescription` ("Encoding error: ..."). Changed `encodeBody` to throw `.encodingError(error)` instead of `.decodingError(error)`.

### WR-03: Force-unwrap on URLComponents in API client

**Files modified:** `Sources/JarvisCore/Services/VigilAPIClient.swift`
**Commit:** de2e4cd
**Applied fix:** Replaced force-unwraps on `URLComponents(url:resolvingAgainstBaseURL:)` and `components.url` with `guard let` statements that throw `VigilAPIError.networkError(URLError(.badURL))` in `get`, `post` (with query), and `getRawData` methods.

### WR-04: Force-unwrap on Calendar date arithmetic

**Files modified:** `Sources/DailyBrief/DailyBrief.swift`
**Commit:** f3cdd84
**Applied fix:** Replaced `Calendar.current.date(byAdding:value:to:)!` with `guard let cutoff = ...` that logs an error and returns early from the cleanup function instead of crashing.

---

_Fixed: 2026-04-13T12:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
