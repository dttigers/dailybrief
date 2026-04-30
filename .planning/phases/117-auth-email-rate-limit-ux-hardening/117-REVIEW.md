---
phase: 117-auth-email-rate-limit-ux-hardening
reviewed: 2026-04-30T16:55:19Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - vigil-core/src/routes/forgot-password.ts
  - vigil-core/src/routes/forgot-password.test.ts
  - vigil-core/src/routes/resend-verification.ts
  - vigil-core/src/routes/resend-verification.test.ts
  - vigil-core/src/routes/reset-password.ts
  - vigil-core/src/routes/reset-password.test.ts
  - vigil-core/src/routes/verify-email.ts
  - vigil-core/src/routes/verify-email.test.ts
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/api/client.test.ts
  - vigil-pwa/src/pages/ResetPasswordPage.tsx
  - vigil-pwa/src/pages/ResetPasswordPage.test.tsx
  - vigil-pwa/src/pages/SettingsPage.tsx
  - vigil-pwa/src/pages/SettingsPage.test.tsx
  - vigil-pwa/src/pages/VerifyEmailPage.tsx
  - vigil-pwa/src/pages/VerifyEmailPage.test.tsx
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 117: Code Review Report

**Reviewed:** 2026-04-30T16:55:19Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 117 raises auth-route rate-limit caps (per-IP 5 → 20; resend-verification per-userId 3 → 5; per-email cap unchanged at 5 to preserve enum-safety) and introduces a 5th `rate-limited` bucket on `classifyFetchError` with mm:ss countdown UX across three PWA surfaces (VerifyEmailPage, ResetPasswordPage, SettingsPage resend banner). The implementation is disciplined: enum-safety semantics preserved on `/forgot-password`, single-bucket UX preserved on `/reset-password` + `/verify-email`, drift-detector tests lock the cap constants, and per-page countdown timers are properly cleaned up on unmount with `useRef`-tracked interval IDs.

No Critical issues found. Two Warnings: a pre-existing stale test for `redirectToGoogleAuth` in `client.test.ts` that doesn't reflect the current async POST-then-navigate implementation (not introduced by Phase 117 but in-scope because `client.ts` was modified), and a redundant null-check in the SettingsPage countdown-render guard. Five Info-level items cover dead-branch sweep logic, redundant null-coalescing, and a few minor code-smells.

## Warnings

### WR-01: Stale test for `redirectToGoogleAuth` no longer matches the implementation

**File:** `vigil-pwa/src/api/client.test.ts:56-66`
**Issue:** The test `redirectToGoogleAuth sets window.location.href to /v1/auth/google` was written for the legacy synchronous GET-redirect implementation. The current `redirectToGoogleAuth` (`client.ts:677-689`) is async — it `POST`s to `/v1/auth/google/init`, awaits a JSON body containing `redirect_url`, then sets `window.location.href = body.redirect_url`. The test:
1. Calls `redirectToGoogleAuth()` without `await` (fire-and-forget),
2. Synchronously asserts `window.location.href` matches `/\/v1\/auth\/google$/`,
3. Has no `fetch` mock set up after `vi.restoreAllMocks()` in `beforeEach`.

Under the current implementation, `redirectToGoogleAuth` would attempt a real `fetch('/v1/auth/google/init')`, which rejects in jsdom; the unawaited promise rejection is swallowed and `window.location.href` stays `''`. The regex assertion against `''` should fail — meaning either the test is currently failing silently, was disabled, or the unawaited promise behavior is masking the assertion. This is pre-existing tech debt (not introduced by Phase 117), but `client.ts` is in this phase's scope and the file imports include `redirectToGoogleAuth` (line 2 in test), so it's worth flagging for follow-up.

**Fix:** Update the test to mock the POST and assert the navigation target matches the `redirect_url` returned by the server:
```ts
it('redirectToGoogleAuth POSTs to /v1/auth/google/init then navigates to redirect_url', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ redirect_url: 'https://accounts.google.com/o/oauth2/v2/auth?...' }), { status: 200 }),
    ),
  )
  vi.stubGlobal('location', { href: '' })
  await redirectToGoogleAuth()
  expect(window.location.href).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2/)
})
```

---

### WR-02: Redundant null-check in `SettingsPage` per-league countdown guard

**File:** `vigil-pwa/src/pages/SettingsPage.tsx:1086-1089`
**Issue:** The `isCountingDown` guard reads:
```ts
const retryCountdownValue = retryCountdowns[league]
const isCountingDown = retryCountdownValue !== null && retryCountdowns[league] !== null && retryCountdownValue > 0
```
The middle clause `retryCountdowns[league] !== null` is identical to `retryCountdownValue !== null` (since `retryCountdownValue` is assigned `retryCountdowns[league]` on the previous line). The dual check provides no additional safety and is purely redundant; the cast to `number` on lines 1088-1089 (`retryCountdownValue as number`) confirms the author already trusts the narrowing.

This is harmless at runtime (TS can narrow `retryCountdownValue` from the first clause alone), but the duplicate read suggests a copy-paste artifact and may confuse a future reader into thinking the two reads might differ (e.g. via a re-render between them — they cannot, both happen synchronously in the same render pass).

**Fix:**
```ts
const retryCountdownValue = retryCountdowns[league]
const isCountingDown = retryCountdownValue !== null && retryCountdownValue > 0
const minutes = isCountingDown ? Math.floor(retryCountdownValue / 60) : 0
const seconds = isCountingDown ? retryCountdownValue % 60 : 0
```
After the narrowing on line 2, `retryCountdownValue` has type `number` and the `as number` casts on lines 3-4 become unnecessary as well.

## Info

### IN-01: Dead-branch in rate-limit bucket sweep predicates

**File:** `vigil-core/src/routes/forgot-password.ts:73-83` (also `resend-verification.ts:48-53`, `reset-password.ts:67-72`, `verify-email.ts:54-59`)
**Issue:** The periodic sweep predicate is `if (arr.length === 0 || (last !== undefined && last < cutoff))`. The `arr.length === 0` arm is unreachable — `takeSlot` always pushes a timestamp before storing the array (lines 95-97 in `forgot-password.ts`), and the only other writes are these same sweeps which delete-rather-than-store. There's no code path that sets a zero-length array into the Map. The clause is defensive but technically dead.

**Fix:** Either keep the dead clause as defensive code (current behavior — fine) or simplify:
```ts
const last = arr[arr.length - 1]
if (last !== undefined && last < cutoff) {
  ipBuckets.delete(k)
}
```
The simplified form relies on `arr[arr.length - 1]` returning `undefined` for an empty array, which would skip deletion — a behavior change. The current form is conservative and arguably better; flagging only because the comment doesn't acknowledge the dead branch.

---

### IN-02: `forgot-password.ts` uses `||` for env fallback (intentional, but worth a comment cross-link)

**File:** `vigil-core/src/routes/forgot-password.ts:217`
**Issue:** `const origin = process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io";` uses `||` rather than `??`. The inline comment justifies this: "matches Phase 111 smoke-test-email.ts:21 origin shape verbatim — `||` not `??` so empty-string treats as unset". This is intentional and correct, but the same pattern in `resend-verification.ts:185-186` uses `||` without the cross-reference comment. Minor consistency improvement: add the same justification comment to `resend-verification.ts` for future-reader clarity.

**Fix:** Add an inline comment to `resend-verification.ts:185-186`:
```ts
// `||` not `??` — empty string treats as unset (matches forgot-password.ts:217)
const origin = process.env["VIGIL_APP_BASE_URL"] || "https://app.vigilhub.io"
```

---

### IN-03: `(body ?? {}) as { token?: unknown; newPassword?: unknown }` is defensive but unreachable

**File:** `vigil-core/src/routes/reset-password.ts:131-134` (also `verify-email.ts:118`)
**Issue:** After `body = await c.req.json()` and the JSON-parse try/catch returns 400, `body` is guaranteed to be the parsed JSON value (object, array, primitive, or null). The `body ?? {}` defends against `null`, but `body` could also be a non-object primitive (e.g. `42`, `"string"`, `true`) where `(primitive as object)?.token` would be `undefined` — handled correctly by the subsequent `typeof token !== "string"` guard. The `?? {}` only helps when `body === null`. This is fine; the destructure-with-cast pattern is idiomatic.

**Fix:** None required — the code is correct. Optionally make the input-shape check more explicit:
```ts
if (body === null || typeof body !== "object") {
  return c.json({ error: "token and newPassword are required" }, 400)
}
const { token, newPassword } = body as { token?: unknown; newPassword?: unknown }
```

---

### IN-04: `putTaskStatusFilter` returns immediately-resolved Promise instead of awaiting

**File:** `vigil-pwa/src/api/client.ts:779-784`
**Issue:** The function is declared `async` (returning `Promise<void>`) but does NOT await `vigilFetch` and uses `.catch(() => {})` to swallow errors. The function returns immediately after firing the request — callers awaiting the result get a falsely-resolved promise that does not reflect server confirmation. The comment `/* fire-and-forget */` documents intent. This is consistent with the function's purpose (best-effort UI-state persistence; user has already updated their local view), but the type signature `Promise<void>` is misleading.

**Fix:** Either drop the `async` keyword (the function does no awaiting) or remove the misleading promise return:
```ts
export function putTaskStatusFilter(filter: TaskStatusFilterValue): void {
  vigilFetch('/v1/settings/task-status-filter', {
    method: 'PUT',
    body: JSON.stringify({ filter }),
  }).catch(() => { /* fire-and-forget */ })
}
```
Pre-existing — not introduced by Phase 117. Flagging only because `client.ts` is in-scope.

---

### IN-05: Comment cross-references mention reset-password line numbers that may drift

**File:** `vigil-core/src/routes/verify-email.ts:136` (also `resend-verification.ts:155`)
**Issue:** Multiple files reference each other by file:line (e.g. `verify-email.ts:136` says "mirrors reset-password.ts:168", `resend-verification.ts:155` says "Mirrors forgot-password.ts:182-191 verbatim"). Line-anchored cross-references go stale on the first refactor. Phase 117 already shifted some lines (constants added/changed). Recommend file-only references plus a symbolic anchor (e.g. "see `takeSlot` helper in reset-password.ts").

**Fix:**
```ts
// gt(expiresAt, sql`now()`) uses PG clock for byte-exact symmetry with
// CONTEXT D-10. JS clock would drift sub-millisecond; sql`now()` is
// the documented choice (mirrors reset-password.ts atomic-claim block).
```
Style preference; not blocking.

---

_Reviewed: 2026-04-30T16:55:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
