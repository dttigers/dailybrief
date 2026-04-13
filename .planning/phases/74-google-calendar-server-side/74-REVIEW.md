---
phase: 74-google-calendar-server-side
reviewed: 2026-04-12T18:30:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - vigil-core/src/db/schema.ts
  - vigil-core/src/index.ts
  - vigil-core/src/routes/calendar-auth.ts
  - vigil-core/src/routes/calendar-auth.test.ts
  - vigil-core/src/routes/calendar.ts
  - vigil-core/src/routes/calendar.test.ts
  - vigil-core/src/services/calendar-service.ts
  - vigil-core/src/services/calendar-service.test.ts
  - vigil-core/src/utils/token-crypto.ts
  - vigil-core/src/utils/token-crypto.test.ts
  - vigil-core/package.json
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 74: Code Review Report

**Reviewed:** 2026-04-12T18:30:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 74 adds Google Calendar server-side integration: OAuth consent flow with CSRF state nonces, AES-256-GCM token encryption, calendar event fetching with multi-calendar support, and graceful degradation via status envelopes. The architecture is solid -- DI factory pattern enables thorough unit testing without real Google API or DB calls, token encryption uses proper AES-256-GCM with random IVs, and error handling degrades gracefully rather than crashing.

Four warnings found: a potential data loss bug in Drizzle NULL handling during token refresh, a timezone assumption that will produce wrong results on Railway (UTC), unbounded state nonce accumulation, and missing test coverage for an explicitly-defined TTL expiry path. No critical security issues.

## Warnings

### WR-01: Drizzle `undefined` in `.set()` silently skips column update -- stale expiry persists

**File:** `vigil-core/src/services/calendar-service.ts:137`
**Issue:** When `expiresAt` is `null` after a token refresh (e.g., Google does not return `expiry_date`), the expression `expiresAt: expiresAt ?? undefined` passes `undefined` to Drizzle's `.set()`. Drizzle treats `undefined` fields as "do not update this column," so the old (expired) `expiresAt` value persists in the database. On the next request, the service sees the stale past timestamp, attempts another refresh, and this repeats every single request -- an infinite refresh loop that hammers Google's token endpoint.
**Fix:**
```typescript
// calendar-service.ts:137 — replace the ?? undefined with explicit null handling
await db
  .update(oauthTokens)
  .set({
    accessToken,
    expiresAt: expiresAt,  // pass null directly; Drizzle will SET the column to NULL
    updatedAt: new Date(),
  })
  .where(eq(oauthTokens.provider, "google"));
```

### WR-02: Server-local timezone used for "today" time range -- wrong results on Railway (UTC)

**File:** `vigil-core/src/services/calendar-service.ts:260-262`
**Issue:** `todayStart` and `todayEnd` use `new Date(now.getFullYear(), now.getMonth(), now.getDate(), ...)` which computes midnight in the server's local timezone. On Railway, the server runs in UTC. For a user in US Eastern (UTC-4), events from 8pm-midnight local time would be assigned to "tomorrow" and missed from the brief, while events from midnight-4am would incorrectly appear as "today."
**Fix:** Accept a timezone parameter (e.g., `America/New_York`) from the client or config, and compute boundaries accordingly:
```typescript
// Option A: use a TZ env var (simplest for single-user)
const tz = process.env["CALENDAR_TIMEZONE"] ?? "America/New_York";
const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz });
// Compute today's boundaries in the target timezone
const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
const todayStart = new Date(nowInTz.getFullYear(), nowInTz.getMonth(), nowInTz.getDate(), 0, 0, 0, 0);
const todayEnd = new Date(nowInTz.getFullYear(), nowInTz.getMonth(), nowInTz.getDate() + 1, 0, 0, 0, 0);
```

### WR-03: State nonce Map grows unboundedly -- no cleanup of abandoned OAuth flows

**File:** `vigil-core/src/routes/calendar-auth.ts:35-49`
**Issue:** The in-memory `stateStore` Map accumulates entries for every OAuth initiation. Nonces are only deleted when the callback is completed (line 82) or when an expired nonce is validated (line 79). If a user initiates OAuth but never completes the callback (closes browser, navigates away), the nonce persists in memory forever. Over time on a long-running server, this is unbounded growth.
**Fix:** Add periodic cleanup. A simple approach:
```typescript
// After stateStore.set(stateNonce, Date.now()) on line 49:
// Periodic cleanup — purge expired nonces (runs at most once per minute)
if (stateStore.size > 100) {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [key, ts] of stateStore) {
    if (ts < cutoff) stateStore.delete(key);
  }
}
```

### WR-04: Expired state nonce TTL path has no test coverage

**File:** `vigil-core/src/routes/calendar-auth.test.ts:28-31`
**Issue:** The function `buildExpiredStateStore` is defined (creates a state nonce 6 minutes old, beyond the 5-minute TTL) but is never called in any test. This means the TTL expiry codepath (calendar-auth.ts lines 78-81) has zero test coverage. If the TTL check were accidentally removed or inverted, no test would catch it.
**Fix:** Add a test that uses the expired store:
```typescript
test("CAL-01-state-expired: expired state nonce redirects with invalid_state", async () => {
  const stateNonce = "expirednonce999";
  const { app } = buildApp(buildExpiredStateStore(stateNonce));

  const res = await app.request(`/auth/google/callback?code=some_code&state=${stateNonce}`);

  assert.equal(res.status, 302, "Expected 302 redirect");
  const location = res.headers.get("location") ?? "";
  assert.ok(location.includes("calendar_error=invalid_state"), "Expired state must produce invalid_state error");
});
```

## Info

### IN-01: Access tokens stored in plaintext in `oauth_tokens` table

**File:** `vigil-core/src/db/schema.ts:180`
**Issue:** The `access_token` column stores Google access tokens as plaintext. Refresh tokens are properly encrypted via AES-256-GCM, but access tokens are not. Access tokens are short-lived (1 hour) which limits blast radius, but if the database is compromised, any unexpired access token grants read access to the user's Google Calendar.
**Fix:** Consider encrypting access tokens with the same `encryptToken`/`decryptToken` utilities. The cost is one decrypt call per calendar request, which is negligible.

### IN-02: Dead code -- unused `CANNED_EVENTS_RESPONSE` and `CANNED_LIST_RESPONSE` fixtures

**File:** `vigil-core/src/routes/calendar.test.ts:13-37`
**Issue:** The constants `CANNED_EVENTS_RESPONSE` and `CANNED_LIST_RESPONSE` are defined at the top of the test file but never referenced by any test. The tests construct their own inline mock responses instead.
**Fix:** Remove the unused fixtures to reduce noise, or refactor the tests to use them.

---

_Reviewed: 2026-04-12T18:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
