---
phase: 110-change-password-password-changed-at-gate
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - vigil-core/drizzle/0015_add_password_changed_at.sql
  - vigil-core/src/db/schema.ts
  - vigil-core/src/index.ts
  - vigil-core/src/middleware/auth.ts
  - vigil-core/src/middleware/auth.test.ts
  - vigil-core/src/routes/auth.ts
  - vigil-core/src/routes/auth.test.ts
  - vigil-core/src/routes/change-password.ts
  - vigil-core/src/integration/cross-user-isolation.test.ts
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/api/client.test.ts
  - vigil-pwa/src/pages/SettingsPage.tsx
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: findings
---

# Phase 110: Code Review Report

**Reviewed:** 2026-04-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** findings (2 warnings, 5 info — no critical issues)

## Summary

Phase 110 implements the `password_changed_at` JWT-iat gate, the
authenticated `POST /v1/auth/change-password` endpoint, a PWA change-password
form, and the global 401 `"Session expired"` handler. Overall the
implementation is careful and well-documented — mount order is correct,
timing-safety is preserved on login, body discriminators are used for 401
routing (not path), XSS is avoided by relying on React's auto-escape, secrets
are not hardcoded, and the D-14 ordering pin (db.update before signToken) is
explicitly tested.

No critical issues were found. The two warnings cover (1) a silent
DB-unavailable failure mode in the JWT gate that masks infra outages as
`401 "Invalid or expired token"`, and (2) a duplicate `clearTimeout` hazard
in the PWA change-password success path that can race with user navigation.

Info items are stylistic or minor: a redundant argon2 verify on the
same-as-current check, missing client-side length validation, and
a minor key-name inconsistency between CONTEXT and the live `storeKey`
contract (already reconciled in code comments but worth logging).

## Warnings

### WR-01: DB outage during JWT iat-gate SELECT is swallowed as 401

**File:** `vigil-core/src/middleware/auth.ts:103-139`
**Issue:** The JWT path handles `db == null` with `503 Database unavailable`
(line 103-105), but the `await db.select(...)` on line 106-110 is inside the
same `try` that catches `verifyToken` failures. Any database error thrown
during that SELECT (connection pool exhaustion, network blip to Railway PG,
timeout) is caught by the bare `catch` on line 137 and returned as
`401 "Invalid or expired token"` — the same body as a forged token.

This obscures real infrastructure failures as auth-failures in logs and
dashboards, and can trigger spurious PWA sign-outs if a transient PG hiccup
is misread (though the 401 body differs from `"Session expired"`, so the
D-19 handler won't fire — the caller just sees a cryptic 401).

The vk_ path has the same structure (no try/catch around the `db.select` at
line 57-61 — an error there would bubble to `app.onError` and return 500).
The asymmetry is that JWT errors on DB failures read as auth failures.

**Fix:** Split the catch so only `verifyToken` errors return 401; DB errors
bubble to the global error handler:
```typescript
let claims: JwtClaims;
try {
  claims = await verifyToken(token);
} catch {
  return c.json({ error: "Invalid or expired token" }, 401);
}
const userId = Number(claims.sub);
if (!Number.isInteger(userId) || userId <= 0) {
  return c.json({ error: "Invalid token subject" }, 401);
}
if (!db) return c.json({ error: "Database unavailable" }, 503);
const [user] = await db.select({ ... })...;
// ... rest of gate logic (no try/catch around DB calls)
```

### WR-02: Change-password success setTimeout leaks on unmount / rapid navigation

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:190-193`
**Issue:** On successful change-password, a 2-second `setTimeout` fires
`setCpExpanded(false)` and `setCpInlineMsg(null)`. The timer is not cleared
on component unmount or on a subsequent submit. If the user navigates away
from `/settings` inside the 2-second window (or submits again quickly, which
the Cancel button allows), React logs a "setState on unmounted component"
warning, and on repeated submits the earlier timer can clobber state set
by a newer submit.

React 18 suppresses the unmount warning, but the stale-write-on-next-submit
race is still real — e.g., user cancels success banner and immediately opens
the form again; the old timer fires and collapses the now-re-opened form.

**Fix:** Capture the timer id in a ref and clear it on cancel/unmount:
```typescript
const cpSuccessTimerRef = useRef<number | null>(null);

// in handleChangePasswordSubmit success branch:
if (cpSuccessTimerRef.current) window.clearTimeout(cpSuccessTimerRef.current);
cpSuccessTimerRef.current = window.setTimeout(() => {
  setCpExpanded(false);
  setCpInlineMsg(null);
  cpSuccessTimerRef.current = null;
}, 2000);

// in handleCpCancel and a useEffect cleanup:
useEffect(() => () => {
  if (cpSuccessTimerRef.current) window.clearTimeout(cpSuccessTimerRef.current);
}, []);
```

## Info

### IN-01: Redundant argon2 verify on same-as-current check wastes ~50-100ms

**File:** `vigil-core/src/routes/change-password.ts:97-104`
**Issue:** Step D-12 uses `verifyPassword(newPassword, user.passwordHash)` to
detect "new password is the same as current". This costs a full argon2id
verify (~50-100ms per the comment on line 98). Because
`currentPassword` was already verified on line 82 as matching `user.passwordHash`,
a plain string equality check `newPassword === currentPassword` would detect
the same case with zero crypto cost.

The current implementation is functionally correct (and has a tiny edge-case
benefit: if the user manages to send a `newPassword` that is a DIFFERENT
string that argon2 would hash to the same value, string equality would miss
that — but this is astronomically unlikely for argon2id).

**Fix:** Replace the hash compare with string compare:
```typescript
// D-12: same-as-current pre-check. currentPassword was already verified
// to match user.passwordHash above, so string equality is sufficient.
if (newPassword === currentPassword) {
  return c.json({ error: "New password must differ from current" }, 400);
}
```
Saves ~50-100ms on every happy-path change-password request and keeps the
argon2 budget to one hash + one verify.

### IN-02: Client-side length validation missing on new-password field

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:353-374, 383-389`
**Issue:** The new-password field has no client-side length check. Submit is
enabled as long as both fields are non-empty (line 385). A user entering an
11-char password does a full network round-trip just to receive
`400 "Password must be 12-128 characters"` from the server. The server
validation is correctly authoritative, but a mirrored client check would
improve UX on slow connections.

**Fix:** Add a length predicate to the submit-disabled expression and show a
hint under the input:
```tsx
const cpNewTooShort = cpNew.length > 0 && cpNew.length < 12;
// ...
<input id="cp-new" ... />
{cpNewTooShort && <p className="text-xs text-gray-500">Must be at least 12 characters</p>}
// ...
<button disabled={cpSubmitting || !cpCurrent || cpNew.length < 12}>Save</button>
```

### IN-03: `currentPassword` has no length check — empty string reaches argon2

**File:** `vigil-core/src/routes/change-password.ts:52-56`
**Issue:** The handler validates that `currentPassword` is a string but does
not reject empty strings. An empty `""` flows through to
`verifyPassword("", user.passwordHash)`, which will return `false` (correct
behavior) but spends ~50-100ms on an argon2id verify for a request that can't
possibly succeed. This is a minor DoS-amplification amenity (rate limiter
applies globally so real impact is small).

**Fix:** Reject empty `currentPassword` early:
```typescript
if (typeof currentPassword !== "string" || currentPassword.length === 0 ||
    typeof newPassword !== "string") {
  return c.json({ error: "currentPassword and newPassword are required" }, 400);
}
```

### IN-04: Show/hide password toggle buttons stay enabled during submit

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:339-347, 365-372`
**Issue:** During submit (`cpSubmitting === true`), the `<input>` elements
are correctly `disabled`, but the show/hide toggle buttons (`🙈`/`👁`) are not.
A user clicking the eye icon mid-submit toggles state, which rerenders the
disabled input with a different `type` attribute — harmless but
inconsistent with the disabled-input contract.

**Fix:** Propagate `cpSubmitting` to the toggle buttons:
```tsx
<button
  type="button"
  onClick={() => setCpShowCurrent((v) => !v)}
  disabled={cpSubmitting}
  aria-label={cpShowCurrent ? 'Hide password' : 'Show password'}
  ...
>
```

### IN-05: `as number` cast on c.get("userId") bypasses type guard

**File:** `vigil-core/src/routes/change-password.ts:39`
**Issue:** `const userId = c.get("userId") as number;` relies on the Hono
context-type augmentation in `middleware/auth.ts:11-15`. The augmentation
declares `userId: number` (non-optional), so `c.get("userId")` already
returns `number` at the type level — the `as number` cast is redundant and
masks the fact that the type is only correct when the request passed through
`bearerAuth`. If someone mounts this route without the middleware, the cast
hides the runtime `undefined`.

This is not a bug in the current code (mount order in `index.ts:117-123`
ensures the middleware runs), but it's a brittle contract.

**Fix:** Either drop the cast (relies on the module augmentation) or add a
runtime guard:
```typescript
const userId = c.get("userId"); // type is `number` via augmentation
if (typeof userId !== "number") {
  // Defensive — only reachable if bearerAuth middleware is bypassed.
  return c.json({ error: "Unauthorized" }, 401);
}
```
The latter defends against a future refactor that might reorder middleware.

---

## Notes on Items Reviewed and Judged Acceptable

- **Migration 0015 (backfill safety):** `ADD COLUMN` nullable → `UPDATE` from
  `created_at` → `SET NOT NULL`. Idempotent (`IF NOT EXISTS` + `WHERE IS NULL`).
  For a single-digit-user system on Railway, the `UPDATE` + `ALTER` sequence
  has no practical lock risk. Verified backfill value (`created_at`) guarantees
  every pre-existing JWT's `iat >= floor(password_changed_at/1000)` and so no
  prior session is kicked out on deploy (D-03 contract).

- **JWT iat-gate equality semantics:** `if (claims.iat < gateThreshold)` —
  strict less-than. Equality passes. The comment at auth.ts:118-126 is
  explicit and matches the test matrix (CP-GATE-02 asserts 200 on equality).
  D-14 ordering ensures production equality is practically unreachable
  anyway.

- **Timing-safe login (routes/auth.ts:146-153):** Uses `DUMMY_HASH` to
  `verifyPassword` on a miss so response time does not differ between
  "user exists" and "user does not exist." Pre-existing Phase 102 work;
  unchanged in Phase 110.

- **vk_ path unaffected by gate:** Verified by code (the `SELECT
  passwordChangedAt` is inside the `if (looksLikeJwt(token))` branch at
  auth.ts:90) and by CP-GATE-04 in the test suite (user with
  `passwordChangedAt` 1 year in the future still accepts vk_ keys).

- **Token storage:** PWA uses `sessionStorage` (tab-scoped, cleared on tab
  close) for JWTs, not `localStorage`. Legacy `vigil_api_key` in
  `localStorage` is explicitly cleaned up by `clearKey()` / `signOut()`.

- **XSS surface:** All user-sourced strings (`body.error`,
  `GOOGLE_ERROR_MESSAGES[err]`, `accountEmail`, `cpInlineMsg.text`,
  `status?.email`) render through JSX text nodes — auto-escaped. No
  `dangerouslySetInnerHTML`, no `window.confirm`, no manual HTML concat.

- **D-19 "Session expired" body discriminator (client.ts:67-89):** The
  clone-then-read pattern preserves the original response stream for the
  caller. The try/catch silently tolerates non-JSON 401 bodies. The
  change-password 401 body (`"Invalid credentials"`) explicitly does NOT
  match the discriminator, which is the intended behavior (tested in
  client.test.ts:231-254).

- **Mount order in index.ts:** `authRoutes` (public register/login) at line
  110 is BEFORE `bearerAuth` dispatcher at line 117. `changePassword` at
  line 159 is AFTER — so `c.get("userId")` is guaranteed non-null in the
  handler. The dispatcher exempts `/v1/auth/register`, `/v1/auth/login`,
  `/v1/health`, and `/v1/auth/google/callback` by explicit path check, so
  `/v1/auth/change-password` is NOT in the exempt list and hits bearerAuth.
  Correct.

- **D-14 ordering pin:** `change-password.ts:113-126` orders
  `db.update({ passwordChangedAt: now })` strictly before
  `signToken(user.id, user.email)`. CP-CHG-06 (`auth.test.ts:407-490`) asserts
  the returned token's `iat >= floor(recordedPasswordChangedAt/1000)`,
  preventing the reorder that would cause the issued token to bounce
  against its own write.

- **Cross-user isolation test update:** `cross-user-isolation.test.ts:79-87`
  correctly adds `passwordChangedAt: now` to the seed inserts so freshly
  minted JWTs pass the new gate. No LEAK-class assertion was weakened.

- **Fire-and-forget `lastUsedAt` update (auth.ts:79-84):** Pre-existing
  pattern. `.catch(() => {})` silently swallows errors. Not in scope for
  Phase 110.

---

_Reviewed: 2026-04-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
