---
phase: 78-mac-cli-thin-client
reviewed: 2026-04-14T21:30:00Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - vigil-core/src/routes/google-auth.ts
  - vigil-core/src/routes/google-status.ts
  - vigil-core/src/routes/brief-generate.ts
  - vigil-core/src/services/brief-assembly-service.ts
  - vigil-core/src/services/pdf-service.ts
  - vigil-pwa/src/components/Layout.tsx
  - vigil-pwa/src/pages/BriefHistoryPage.tsx
  - vigil-pwa/src/pages/SettingsPage.tsx
  - Sources/DailyBrief/DailyBrief.swift
findings:
  critical: 3
  warning: 5
  info: 4
  total: 12
status: issues_found
---

# Phase 78: Code Review Report — v3.0 Server-Side PDF Milestone Audit

**Reviewed:** 2026-04-14T21:30:00Z
**Depth:** deep
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the full v3.0 Server-Side PDF stack: Google OAuth routes, brief assembly
orchestration + generation endpoint, PDF rendering service, PWA layout + history
UI + settings page, and the Mac CLI thin-client Swift entry point.

The security fundamentals are solid — AES-256-GCM token encryption, JWT state
nonce with 5-minute expiry, CSRF mitigation, and no stack traces in error
responses are all correctly implemented. The PWA blob URL lifecycle is handled
carefully (cleanup on unmount and on value change). The Swift CLI has clean
separation of concerns as a pure thin client.

Three Critical issues require attention before the next production deploy:

1. `calendarSelections` is wiped on every re-auth (OAuth upsert does not preserve
   the field).
2. The OAuth callback decodes the `id_token` payload without verifying Google's
   signature — this is noted as accepted risk but has an undocumented threat
   boundary that could mislead future maintainers.
3. The `pdfFilename` stored in the `briefs` table is a server-side filesystem
   path that is passed directly to `fs.readFile` — the current date regex on the
   route param guards the lookup key, but the *stored path* from the DB is never
   re-validated, creating a TOCTOU path-traversal window if the DB row is
   ever written via a secondary code path.

---

## Critical Issues

### CR-01: `calendarSelections` silently wiped on every OAuth re-connect

**File:** `vigil-core/src/routes/google-auth.ts:179-189`

**Issue:** The `onConflictDoUpdate` set clause does not include `calendarSelections`.
The `.values(...)` insert always sets `calendarSelections: []` (empty array).
On a conflict the update block omits the field entirely, meaning Drizzle leaves the
column at the value from the *insert row*, which is `[]`. Any previously saved
calendar selection is permanently discarded on every re-authentication. This is a
silent data-loss bug that will be invisible to users until they notice calendar
events have stopped appearing.

**Fix:** Preserve the existing value by excluding `calendarSelections` from the
insert default and fetching-then-merging, or by using a SQL expression to keep
the existing value in the conflict update:

```typescript
.onConflictDoUpdate({
  target: oauthTokens.provider,
  set: {
    encryptedRefreshToken,
    accessToken: storedAccessToken,
    expiresAt: storedExpiresAt,
    scopes,
    accountEmail: email,
    updatedAt: new Date(),
    // calendarSelections intentionally omitted — preserve existing user selections
  },
});
```

And change the insert `values` call to omit `calendarSelections` (let the column
default apply) or pass `sql`excluded.calendar_selections`` if you want the
conflict row to keep the DB value:

```typescript
.values({
  provider,
  encryptedRefreshToken,
  accessToken: storedAccessToken,
  expiresAt: storedExpiresAt,
  scopes,
  accountEmail: email,
  // omit calendarSelections — column default [] applies only on first insert
})
```

---

### CR-02: Stored `pdfFilename` used as `fs.readFile` path without re-validation

**File:** `vigil-core/src/routes/brief-generate.ts:107-114`

**Issue:** The `GET /brief/:date` handler validates the route param with a
`/^\d{4}-\d{2}-\d{2}$/` regex (correct), then queries the DB for the matching
row and passes `rows[0].pdfFilename` directly to `readFile`. The `pdfFilename`
value is written at generation time and is currently safe (it comes from
`path.join(BRIEFS_DIR, "brief-YYYY-MM-DD.pdf")`). However:

- There is no validation that the resolved path stays inside `BRIEFS_DIR`.
- If a second write path ever inserts a `pdfFilename` with a relative traversal
  (e.g., `../../etc/passwd`), the route silently reads it.
- The error response when `readFile` fails is a generic 404 with no log of the
  attempted path, making forensic detection impossible.

**Fix:** Resolve the stored path and assert it begins with `BRIEFS_DIR` before
reading:

```typescript
const resolved = path.resolve(rows[0].pdfFilename);
const safeDir = path.resolve(process.env.BRIEFS_DIR ?? "/tmp/briefs");
if (!resolved.startsWith(safeDir + path.sep)) {
  return c.json({ error: "Brief not found" }, 404);
}
const buffer = await readFile(resolved);
```

---

### CR-03: Unverified `id_token` JWT payload used as the stored account email

**File:** `vigil-core/src/routes/google-auth.ts:143-152`

**Issue:** The code decodes the `id_token` payload by splitting on `.` and
base64-decoding the middle segment, without verifying Google's RS256 signature.
The comment acknowledges this: "no signature verify — TLS is trust anchor."

The TLS argument holds for the *exchange* request to `accounts.google.com`, but
it does not protect against:

1. A future code change that passes a forged `id_token` via the DI `getTokenFn`
   in tests — the mock already demonstrates this surface.
2. Any code that later relies on `accountEmail` for access-control decisions
   (e.g., "only allow this Google account to connect") — they would inherit a
   silently bypassable check.

The missing signature verification also means a malformed or expired `id_token`
with a crafted `email` claim would be accepted as long as the token exchange
itself succeeded.

**Fix (minimum):** At a minimum add a documentation comment on the
`accountEmail` field in the DB schema and at the point of use noting that it is
display-only and must never be used for access control decisions. If the field
will be used for any gating, use `google-auth-library`'s `verifyIdToken` instead:

```typescript
// Use verified payload from google-auth-library instead of manual decode:
const ticket = await client.verifyIdToken({
  idToken: tokens.id_token,
  audience: process.env["GOOGLE_CLIENT_ID"],
});
const payload = ticket.getPayload();
accountEmail = payload?.email ?? null;
```

---

## Warnings

### WR-01: Race condition — auto-load effect missing `todayStr` and `generateState` dependencies

**File:** `vigil-pwa/src/pages/BriefHistoryPage.tsx:34-44`

**Issue:** The `useEffect` that auto-loads today's PDF has the dependency array
`[todayBriefExists]` with a suppressed lint comment. The effect closure reads
`todayStr`, `todayBlobUrl`, and `generateState` as stale closures. If the
component re-renders between when `todayBriefExists` becomes true and when the
async `getBriefPdf` resolves, `todayStr` could theoretically be stale (e.g., if
the user's clock crosses midnight during a long-running session). More practically,
the eslint disable comment marks a permanent suppression that will hide future
dependency drift.

**Fix:** Extract the date string into a `useMemo` or pass it explicitly, and
either fix the deps or document *why* each omitted dep is safe:

```tsx
useEffect(() => {
  if (!todayBriefExists || todayBlobUrl || generateState !== 'idle') return
  let active = true
  getBriefPdf(todayStr).then((blob) => {
    if (!active) return
    const url = URL.createObjectURL(blob)
    setTodayBlobUrl(url)
    setGenerateState('done')
  }).catch(() => {})
  return () => { active = true }
}, [todayBriefExists, todayStr, generateState, todayBlobUrl])
```

---

### WR-02: Blob URL leaked when `handleSelectBrief` is called while a previous load is still in-flight

**File:** `vigil-pwa/src/pages/BriefHistoryPage.tsx:74-89`

**Issue:** `handleSelectBrief` immediately sets `setDetailBlobUrl(null)` and
calls the API. The revoke of the *previous* `detailBlobUrl` happens on line 81
only *after* the new blob arrives: `if (detailBlobUrl) URL.revokeObjectURL(detailBlobUrl)`.
However, `detailBlobUrl` in that closure captures the value at the time the
function was called, not the settled value at the time it resolves. If the user
clicks two briefs in rapid succession, the second call closes over a `null`
`detailBlobUrl` (because `setDetailBlobUrl(null)` already ran on the first
click), so the first blob URL from the first in-flight call is never revoked.

The unmount cleanup catches this eventually, but in a long-running session this
can accumulate many leaked blob handles.

**Fix:** Use a ref to track the current blob URL so cleanup is always current:

```tsx
const detailBlobUrlRef = useRef<string | null>(null)

async function handleSelectBrief(date: string) {
  if (detailBlobUrlRef.current) {
    URL.revokeObjectURL(detailBlobUrlRef.current)
    detailBlobUrlRef.current = null
  }
  setDetailBlobUrl(null)
  // ...
  const url = URL.createObjectURL(blob)
  detailBlobUrlRef.current = url
  setDetailBlobUrl(url)
}
```

---

### WR-03: `google_error` query param rendered in banner without sanitizing the source

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:43`

**Issue:** The code does `decodeURIComponent(err)` and interpolates the result
directly into the banner text string. React does auto-escape this in JSX so
there is no HTML injection, but the `err` value comes from the URL query string
which is set by the server at `google-auth.ts:86` — and that line uses
`encodeURIComponent(error ?? "no_code")` where `error` is the raw query param
from Google's OAuth redirect. A malicious redirect (e.g., from a CSRF-bypassing
OAuth flow) could craft a `google_error` value that shows misleading text in the
banner (e.g., "Your session has been hijacked — re-enter credentials at
evil.com"). This is a UI-level phishing vector even though no XSS is possible.

**Fix:** Either allowlist the error codes that produce user-visible text, or only
use the raw (encoded) code as a key to a local message map:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'Connection attempt expired. Please try again.',
  no_refresh_token: 'Google did not issue a refresh token. Revoke access at myaccount.google.com and retry.',
  server_error: 'Server error during connection. Please try again.',
  access_denied: 'Access was denied.',
}
const text = ERROR_MESSAGES[err] ?? 'Connection failed. Please try again.'
setBanner({ kind: 'error', text })
```

---

### WR-04: `deviceCode` is URL-concatenated into the token poll body without encoding

**File:** `Sources/DailyBrief/DailyBrief.swift:793`

**Issue:** The `tokenBody` string is built as:
```swift
let tokenBody = "grant_type=urn%3A...&device_code=\(deviceCode)&client_id=\(clientId)"
```
`deviceCode` is a value from Microsoft's JSON response — it is typically an
opaque base64url string but its format is not guaranteed by the spec. If it ever
contains `&` or `=` (or percent-encoded sequences that decode to those), the
form body will be malformed and the token exchange will silently fail or produce
an unexpected error. `clientId` has the same issue.

**Fix:** Encode both values:

```swift
let encodedDeviceCode = deviceCode.addingPercentEncoding(
    withAllowedCharacters: .urlQueryAllowed) ?? deviceCode
let encodedClientId = clientId.addingPercentEncoding(
    withAllowedCharacters: .urlQueryAllowed) ?? clientId
let tokenBody = "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"
    + "&device_code=\(encodedDeviceCode)&client_id=\(encodedClientId)"
```

The same issue exists in `deviceCodeBody` on line 759 for `clientId`.

---

### WR-05: `brief-generate` router uses `db: any` type, losing type safety on all DB operations

**File:** `vigil-core/src/routes/brief-generate.ts:15-22`

**Issue:** `BriefGenerateDeps.db` is typed `any`. All calls through `getDb()`
return `any`, meaning Drizzle ORM type-checking is silently disabled for the
entire route. A schema mismatch (e.g., passing a wrong field name in `.values()`)
will compile cleanly and only fail at runtime in production. `brief-assembly-service.ts`
has the same pattern with `dbClient?: any`.

**Fix:** Import the Drizzle DB type and use it:

```typescript
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '../db/schema.js'

export interface BriefGenerateDeps {
  db?: PostgresJsDatabase<typeof schema>
  // ...
}
```

---

## Info

### IN-01: `accessToken` stored in plaintext in `oauth_tokens` table

**File:** `vigil-core/src/routes/google-auth.ts:135`, `vigil-core/src/db/schema.ts:180`

**Issue:** The `refresh_token` is correctly encrypted with AES-256-GCM, but the
`accessToken` is stored as plaintext in the `oauth_tokens.access_token` column.
Access tokens are short-lived (1h) but are still bearer credentials that grant
calendar and Gmail read access. Anyone with DB read access obtains a live token
for up to an hour.

**Suggestion:** Either encrypt the access token with the same `encryptToken`
utility (low cost, consistent security boundary), or do not store it at all
(re-derive from the refresh token on each use via `oauth2client.refreshAccessToken()`).

---

### IN-02: MD5 used for work-order cache key hashing

**File:** `vigil-core/src/services/brief-assembly-service.ts:317`

**Issue:** `crypto.createHash("md5")` is used to derive the filesystem cache
filename for the AI prioritization result. MD5 is not a security primitive here
(no secrets are involved), but it will trigger automated security scanners and
code-review tools that flag MD5 uniformly. It is also collision-prone in
adversarial contexts.

**Suggestion:** Use `sha256` (same API, one word change) to silence scanner
false-positives and improve collision resistance at zero additional cost.

---

### IN-03: `handleBack` does not cancel an in-flight detail load

**File:** `vigil-pwa/src/pages/BriefHistoryPage.tsx:91-96`

**Issue:** `handleBack` revokes the current `detailBlobUrl` and resets state, but
if `handleSelectBrief` is still awaiting `getBriefPdf` when the user clicks Back,
the async callback will still run, call `setDetailBlobUrl(url)`, and create a new
blob URL that is never rendered or revoked (the component is now in the list
view). This is a blob handle leak on fast back-navigation.

**Suggestion:** Use an `AbortController` or a `cancelled` flag ref pattern
(already used correctly in `useBriefs` and `GoogleStatusContext`) inside
`handleSelectBrief` to skip the state update after back-navigation.

---

### IN-04: `formatDate` in `BriefHistoryPage` uses local `new Date(year, month, day)` — correct but fragile

**File:** `vigil-pwa/src/pages/BriefHistoryPage.tsx:5-9`

**Issue:** The function correctly uses `new Date(year, month - 1, day)` (local
constructor) to avoid UTC-to-local timezone shift, which matches the comment on
`todayStr`. This is the right pattern. However it is duplicated: the same
date-string-to-display conversion is likely needed elsewhere in the PWA. If a
different developer later adds a similar function using `new Date(dateStr)`
(UTC), the two paths will disagree on dates near midnight in negative-UTC-offset
timezones.

**Suggestion:** Extract into a shared utility `src/utils/formatDate.ts` and use
it in both `BriefHistoryPage` and anywhere else a `YYYY-MM-DD` string is
displayed.

---

_Reviewed: 2026-04-14T21:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
