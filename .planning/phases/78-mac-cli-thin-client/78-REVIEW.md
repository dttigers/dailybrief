---
phase: 78-mac-cli-thin-client
reviewed: 2026-04-13T12:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - Package.swift
  - Sources/DailyBrief/DailyBrief.swift
  - Sources/JarvisCore/Services/VigilAPIClient.swift
findings:
  critical: 1
  warning: 4
  info: 1
  total: 6
status: issues_found
---

# Phase 78: Code Review Report

**Reviewed:** 2026-04-13
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the Mac CLI thin-client entry point (`DailyBrief.swift`), its package manifest (`Package.swift`), and the shared API client (`VigilAPIClient.swift`). The package manifest is clean. The API client is well-structured as an actor with proper error typing. The main issues are: (1) repeated force-unwraps on user-controlled config values that will crash the process on bad input, (2) unsanitized CLI arguments interpolated into URL paths, and (3) a mislabeled error case in the API client.

## Critical Issues

### CR-01: Force-unwrap on user-controlled URL crashes the CLI

**File:** `Sources/DailyBrief/DailyBrief.swift:47`
**Issue:** `URL(string: config.apiBaseUrl)!` force-unwraps a URL constructed from user config. If `apiBaseUrl` is empty, contains spaces, or is otherwise malformed, this crashes the entire process with no error message. The same pattern repeats at lines 193, 308, 388, 429, and 469 -- every subcommand that creates a `VigilAPIClient`.
**Fix:**
```swift
guard let baseURL = URL(string: config.apiBaseUrl) else {
    Logger.error("Invalid API base URL: \(config.apiBaseUrl)")
    throw ExitCode.failure
}
let apiClient = VigilAPIClient(baseURL: baseURL, apiKey: config.apiKey)
```
Extract this into a shared helper to avoid duplicating the guard across all six subcommands.

## Warnings

### WR-01: CLI argument interpolated into API path without sanitization

**File:** `Sources/DailyBrief/DailyBrief.swift:398`
**Issue:** The `cn` case number from CLI `@Argument` is interpolated directly into the URL path: `/work-orders/\(cn)/status`. A value containing `/` or `..` could alter the request path. The same pattern appears at line 439 (Uncomplete) and line 214 (History reprint with `reprintDate`). While the server should validate, the client should not construct malformed paths.
**Fix:**
```swift
guard let encoded = cn.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
    print("Invalid case number: \(cn)")
    continue
}
let _: StatusResponse = try await apiClient.put(
    path: "/work-orders/\(encoded)/status",
    body: StatusBody(status: status)
)
```

### WR-02: Encoding failure mislabeled as decoding error

**File:** `Sources/JarvisCore/Services/VigilAPIClient.swift:309`
**Issue:** `encodeBody` catches an encoding failure but wraps it in `.decodingError(error)`. This produces a misleading error message ("Decoding error: ...") when the actual problem is request body encoding.
**Fix:** Add an `encodingError` case to `VigilAPIError`, or at minimum rename the thrown case:
```swift
// Option A: new case
case encodingError(Error)

// In encodeBody:
throw VigilAPIError.encodingError(error)
```

### WR-03: Force-unwrap on URLComponents in API client

**File:** `Sources/JarvisCore/Services/VigilAPIClient.swift:108`
**Issue:** `URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!` force-unwraps. While `appendingPathComponent` on a valid `URL` should always produce valid components, adversarial `path` values with percent-encoding edge cases could cause a crash. The same pattern appears at lines 145, 232.
**Fix:**
```swift
guard var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
    throw VigilAPIError.networkError(URLError(.badURL))
}
```

### WR-04: Force-unwrap on Calendar date arithmetic

**File:** `Sources/DailyBrief/DailyBrief.swift:97`
**Issue:** `Calendar.current.date(byAdding: .day, value: -keepDays, to: Date())!` force-unwraps. While this is practically safe for reasonable `keepDays` values, an extreme config value (e.g., `Int.max`) would cause a crash in a cleanup routine that should never take down the process.
**Fix:**
```swift
guard let cutoff = Calendar.current.date(byAdding: .day, value: -keepDays, to: Date()) else {
    Logger.error("Invalid keepDays value: \(keepDays)")
    return
}
```

## Info

### IN-01: Template config contains placeholder API key prefix

**File:** `Sources/DailyBrief/DailyBrief.swift:139`
**Issue:** The template config includes `"claude_api_key": "sk-ant-..."`. This is a placeholder (not a real secret) and poses no security risk, but the `sk-ant-` prefix could trigger secret-scanning tools in CI. Consider using a clearly non-secret placeholder.
**Fix:**
```json
"claude_api_key": "YOUR_CLAUDE_API_KEY_HERE"
```

---

_Reviewed: 2026-04-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
