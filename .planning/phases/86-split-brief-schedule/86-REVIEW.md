---
phase: 86-split-brief-schedule
reviewed: 2026-04-15T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - Sources/DailyBrief/DailyBrief.swift
  - Sources/DailyBriefMonitor/MenuBarView.swift
  - Sources/DailyBriefMonitor/StatusChecker.swift
  - vigil-core/src/index.ts
  - vigil-core/src/routes/settings.test.ts
  - vigil-core/src/routes/settings.ts
  - vigil-core/src/services/generate-scheduler.test.ts
  - vigil-core/src/services/generate-scheduler.ts
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/components/ScheduleCard.tsx
  - vigil-pwa/src/pages/SettingsPage.tsx
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 86: Code Review Report

**Reviewed:** 2026-04-15
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Phase 86 "split brief schedule" surface: new `/v1/settings/generate-schedule` + `/v1/settings/timezone` routes, the in-process generate scheduler service, PWA ScheduleCard + SettingsPage, CLI pull-only mode with staleness exit code, and menubar staleness UI. No critical security vulnerabilities. The implementation is solid — dependency-injected scheduler with a complete test suite, validator-gated settings writes, and no hardcoded secrets. Warnings cluster around fail-closed behavior (missing env vars log but do not exit), a couple of force-unwraps in Swift OAuth code, and a UX edge case where a user who legitimately selects `America/New_York` gets silently overridden by browser TZ. Info items are mostly minor: unused CLI args in deprecated stub subcommands, missing runtime shape validation on JSONB settings reads, silent catch in ScheduleCard load.

## Warnings

### WR-01: Missing required env vars log FATAL but do not exit

**File:** `vigil-core/src/index.ts:45-49`
**Issue:** When `GOOGLE_OAUTH_STATE_SECRET` or `GOOGLE_TOKEN_ENCRYPTION_KEY` are missing at startup, the code prints `FATAL:` but the server still starts. Any subsequent OAuth request will then fail at runtime — probably with a confusing stack trace rather than a clean "misconfigured" signal. A `FATAL` log that isn't actually fatal is misleading and makes misconfiguration silent until first OAuth hit.
**Fix:**
```ts
for (const key of ["GOOGLE_OAUTH_STATE_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY"]) {
  if (!process.env[key]) {
    console.error(`FATAL: required env var ${key} is not set`);
    process.exit(1);
  }
}
```
If you want to keep "server survives misconfiguration" semantics for local dev, downgrade the log level to `WARN` and rename so the word `FATAL` is reserved for conditions that actually exit.

### WR-02: Timezone prefill silently overrides legitimate `America/New_York` selection

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:78-92`
**Issue:** On mount, if the server returns `America/New_York` (the default), the code assumes "user never set one" and overwrites the UI state with `Intl.DateTimeFormat().resolvedOptions().timeZone`. But the server returns the default even after a user *explicitly* saved `America/New_York` (there is no separate "set" flag). A user in Chicago who legitimately prefers NYC time will have the input flipped to `America/Chicago` the next time they open Settings.
**Fix:** Either (a) make the PWA read-through-only and only prefill when the user enters the form with *no prior save* — but the API can't tell us that, so (b) skip the prefill entirely and let the user pick explicitly on first open, or (c) add an `isDefault` flag server-side:
```ts
// settings.ts GET /settings/timezone
return c.json({ timezone: tz, isDefault: rows.length === 0 }, 200);
```
Then only prefill when `isDefault === true`. Option (b) is the simplest fix:
```tsx
useEffect(() => {
  getTimezone()
    .then((tz) => setTimezoneState(tz))
    .catch(() => { /* keep default */ })
    .finally(() => setTimezoneLoading(false))
}, [])
```

### WR-03: Force-unwrapped URLs in OAuth device-code flow can crash

**File:** `Sources/DailyBrief/DailyBrief.swift:805, 843`
**Issue:** `URL(string: "https://login.microsoftonline.com/\(tenantId)/oauth2/v2.0/devicecode")!` and the matching token URL force-unwrap. `tenantId` comes from user-editable config (`config.email.oauth2TenantId`). If the config contains whitespace, newlines, or URL-reserved characters, `URL(string:)` returns nil and the CLI crashes with an unwrap trap instead of a clean error message.
**Fix:**
```swift
guard let deviceCodeURL = URL(string: "https://login.microsoftonline.com/\(tenantId)/oauth2/v2.0/devicecode") else {
    print("Error: invalid oauth2_tenant_id in config")
    throw ExitCode.failure
}
guard let tokenURL = URL(string: "https://login.microsoftonline.com/\(tenantId)/oauth2/v2.0/token") else {
    print("Error: invalid oauth2_tenant_id in config")
    throw ExitCode.failure
}
```
Also consider percent-encoding `tenantId` the same way `clientId` is encoded on line 808.

### WR-04: Scheduler dedupe window accepts future-dated `createdAt`

**File:** `vigil-core/src/services/generate-scheduler.ts:213-217`
**Issue:** The dedupe check is `now().getTime() - recent.createdAt.getTime() < dedupeWindowMs`. If a DB row somehow has a `createdAt` in the future (clock skew between Railway worker + Postgres, or a manual backfill with a future timestamp), the subtraction is negative, which is always `< dedupeWindowMs` — so dedupe *always wins* and the scheduler stops generating for that date indefinitely. Unlikely, but the condition should be directional.
**Fix:**
```ts
const ageMs = now().getTime() - recent.createdAt.getTime();
if (ageMs >= 0 && ageMs < dedupeWindowMs) {
  log("info", `dedupe: brief for ${todayInTz} generated recently, skipping`);
  return;
}
```

### WR-05: `vigilFetch` sends literal "Bearer null" when no key is stored

**File:** `vigil-pwa/src/api/client.ts:14-24`
**Issue:** `const key = getStoredKey()` can return `null`, but the Authorization header is unconditionally set to `` `Bearer ${key}` `` — producing the literal string `"Bearer null"`. The server rejects it (which is correct), but the client has no way to distinguish "not logged in" from "bad key" in error handling. Downstream error strings surface as `401` with no hint that the user simply never entered a key.
**Fix:**
```ts
export async function vigilFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getStoredKey()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (key) headers.Authorization = `Bearer ${key}`
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}
```
Callers that need "logged-in" detection can then check `getStoredKey()` up front and route to the login flow.

## Info

### IN-01: Deprecated stub subcommands still parse args that are never used

**File:** `Sources/DailyBrief/DailyBrief.swift:718-773`
**Issue:** `Complete`, `Uncomplete`, and `ListCompleted` subcommands retain `@Argument` / `@Option` declarations (`caseNumbers`, `status`, `configPath`) but the `run()` body only prints a redirect message. Users will type `dailybrief complete CS0353598`, see no action, and get confused. ArgumentParser will also reject invocations *without* arguments on `Complete`/`Uncomplete` (because `caseNumbers` is required) even though the output is the same regardless.
**Fix:** Either remove the args entirely, or make them optional with a clearer deprecation banner:
```swift
struct Complete: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "[Deprecated] Work order management has moved to the Vigil dashboard."
    )
    func run() async throws {
        print("`dailybrief complete` is deprecated. Use https://app.vigilhub.io to manage work orders.")
    }
}
```

### IN-02: `ScheduleCard` silently swallows load errors

**File:** `vigil-pwa/src/components/ScheduleCard.tsx:27-35`
**Issue:** If `loadFn()` throws (network down, server 500), the user sees the default schedule with no indication that it is stale / un-synced. They might "Save" a schedule they think is already stored, or believe they already configured something when they haven't.
**Fix:** Either propagate the error via `onError`:
```tsx
useEffect(() => {
  loadFn()
    .then(setSchedule)
    .catch((e) => onError?.(`Failed to load schedule: ${(e as Error).message}`))
    .finally(() => setLoading(false))
}, [])
```
or surface a retry button in the card body when load fails.

### IN-03: Settings route reads JSONB values without runtime shape validation

**File:** `vigil-core/src/routes/settings.ts:83, 134, 184`
**Issue:** `rows[0].value as PrintSchedule` / `rows[0].value as string` trust the stored JSONB blob is well-formed. If an operator hand-edits the row or a bad migration leaves a malformed value, the GET response becomes garbage (e.g., `{}` returned as `PrintSchedule` with undefined fields), and the PWA will render `NaN:NaN` in the time input.
**Fix:** Validate after read:
```ts
const raw = rows[0].value;
schedule = isValidSchedule(raw) ? raw : DEFAULT_PRINT;
```
Low priority since PUT is the only write path and it validates, but it's a defensive improvement.

### IN-04: `Number(process.env.PORT) || 3001` treats PORT=0 as "unset"

**File:** `vigil-core/src/index.ts:121`
**Issue:** If `PORT=0` is set (some CI/orchestration systems use 0 to mean "pick any free port"), the code falls through to 3001. Also, `Number("abc")` → `NaN` which is falsy and silently falls back with no warning. Not a bug today on Railway (PORT is always set to a real port), but brittle.
**Fix:**
```ts
const portStr = process.env.PORT;
const port = portStr !== undefined ? Number(portStr) : 3001;
if (!Number.isFinite(port) || port < 0 || port > 65535) {
  console.error(`Invalid PORT: ${portStr}`);
  process.exit(1);
}
```

### IN-05: `subtractDays` does not validate input format

**File:** `vigil-core/src/services/generate-scheduler.ts:97-105`
**Issue:** `const [y, m, d] = dateStr.split("-").map(Number);` — if `dateStr` is malformed (e.g., `"2026/04/15"` or `""`), y/m/d will include NaN and `Date.UTC(NaN, ...)` produces an Invalid Date whose output is `NaN-NaN-NaN`. All callers currently pass the trusted `todayInTz` from `partsInZone`, so this is defensive. Add an assertion or a format check:
```ts
function subtractDays(dateStr: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error(`Invalid dateStr: ${dateStr}`);
  const [, y, m, d] = match;
  // ...
}
```

### IN-06: `StatusChecker.refresh()` reads entire log file every tick

**File:** `Sources/DailyBriefMonitor/StatusChecker.swift:38-44`
**Issue:** `try? String(contentsOfFile: logPath, encoding: .utf8)` loads the full `dailybrief.log` into memory on every refresh. Today the log rotates / is small, but without a size cap or tail read, a runaway daemon logging heavily can cause the menubar to hitch or spike memory. Not a correctness bug — flagged as Info per v1 scope.
**Fix:** Tail the file (read last N KB via `FileHandle.seekToEnd` + `read(upToCount:)`), or keep a running max-lines buffer. A simple mitigation is to cap to the last ~64 KB:
```swift
guard let handle = try? FileHandle(forReadingFrom: URL(fileURLWithPath: logPath)) else { ... }
let size = try handle.seekToEnd()
let start = size > 65_536 ? size - 65_536 : 0
try handle.seek(toOffset: start)
let data = handle.readDataToEndOfFile()
```

---

_Reviewed: 2026-04-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
