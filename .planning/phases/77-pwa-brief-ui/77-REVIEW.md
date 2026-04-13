---
phase: 77-pwa-brief-ui
reviewed: 2026-04-13T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/components/Layout.tsx
  - vigil-pwa/src/pages/BriefHistoryPage.tsx
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 77: Code Review Report

**Reviewed:** 2026-04-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files reviewed: the shared API client (`client.ts`), the navigation shell (`Layout.tsx`), and the new Brief History page (`BriefHistoryPage.tsx`). Layout.tsx is clean with no issues. The API client has one critical bug where a null API key is serialized as the string `"Bearer null"`. BriefHistoryPage has two warning-level issues: a stale-closure revoke that can silently skip cleanup, and a dead `disabled` prop. Two info-level issues cover a fragile header-override pattern in the PDF fetch helpers and a hard-to-maintain visibility condition.

---

## Critical Issues

### CR-01: Null API key serialized as `"Bearer null"` in Authorization header

**File:** `vigil-pwa/src/api/client.ts:19`

**Issue:** `getStoredKey()` returns `string | null`. When no key is stored it returns `null`, which JavaScript coerces to the string `"null"` inside the template literal. Every `vigilFetch` call made before the user authenticates sends `Authorization: Bearer null` to the server. Depending on server-side validation, this may either (a) pass through and leak an incorrect-auth request, or (b) produce a confusing 401/403 response body that's different from "key not present." It also masks the missing-key condition entirely — callers cannot distinguish "key present but invalid" from "key not set."

**Fix:**
```typescript
export async function vigilFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getStoredKey()
  const authHeaders: HeadersInit = key
    ? { Authorization: `Bearer ${key}` }
    : {}
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
  })
}
```

If omitting the header entirely is not desired (e.g., the server always requires it), guard callers instead:
```typescript
if (!key) throw new Error('Not authenticated')
```

---

## Warnings

### WR-01: Stale-closure blob URL revoke in `handleSelectBrief` may silently skip cleanup

**File:** `vigil-pwa/src/pages/BriefHistoryPage.tsx:81`

**Issue:** `handleSelectBrief` sets `detailBlobUrl` to `null` on line 76 and then on line 81 checks `if (detailBlobUrl) URL.revokeObjectURL(detailBlobUrl)`. Because React state updates are batched and async, the `detailBlobUrl` captured in the closure is still the value from the *previous* render — on the *first* selection it's `null` (nothing to revoke, fine), but on subsequent calls it holds the previous blob URL. This means the explicit revoke on line 81 may or may not fire depending on closure timing; it is not a reliable cleanup path.

The `useEffect` cleanup on lines 53-57 does handle this correctly by revoking the old value when the state variable changes. The effect-based cleanup is the correct mechanism; the explicit revoke in the handler is redundant and could cause a double-revoke (which is a no-op per spec, so not harmful today, but confusing to maintain).

**Fix:** Remove the redundant explicit revoke from `handleSelectBrief`. Rely solely on the effect cleanup:
```typescript
async function handleSelectBrief(date: string) {
  setSelectedDate(date)
  setDetailBlobUrl(null)   // effect cleanup fires on next render, revoking old URL
  setDetailError(null)
  setDetailLoading(true)
  try {
    const blob = await getBriefPdf(date)
    const url = URL.createObjectURL(blob)
    setDetailBlobUrl(url)
  } catch (e: unknown) {
    setDetailError(e instanceof Error ? e.message : 'Failed to load brief. Try again.')
  } finally {
    setDetailLoading(false)
  }
}
```

### WR-02: `disabled={generateState === 'generating'}` on Generate button is dead code

**File:** `vigil-pwa/src/pages/BriefHistoryPage.tsx:218`

**Issue:** The "Generate Today's Brief" button (lines 216-223) is only rendered when `generateState !== 'generating'` (enforced by the outer condition on line 215). The `disabled={generateState === 'generating'}` prop can therefore never be `true` — the button is not in the DOM when `generating`. This is not a crash, but it gives a false sense of protection: a future edit to the render condition could silently remove the only actual guard against double-submission.

**Fix:** Remove the dead `disabled` prop and add a comment explaining the render guard:
```tsx
{/* Only rendered when generateState is 'idle' or 'error' — see condition above */}
<button
  onClick={handleGenerate}
  className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors min-h-[44px]"
>
  Generate Today's Brief
</button>
```

---

## Info

### IN-01: `Content-Type: ''` header override is order-dependent and fragile

**File:** `vigil-pwa/src/api/client.ts:310` and `vigil-pwa/src/api/client.ts:321`

**Issue:** `generateBrief()` and `getBriefPdf()` pass `headers: { 'Content-Type': '' }` inside `init` to suppress the default `'Content-Type': 'application/json'` set in `vigilFetch`. This works because `...init?.headers` is spread *after* the hardcoded `Content-Type` in `vigilFetch` (line 21), so the empty string wins. However, this relies on undocumented spread order that is not apparent at the call site. Any refactor of the `vigilFetch` header-merge order would silently break PDF fetching.

**Fix:** Add an explicit `skipContentType` option to `vigilFetch`, or handle PDF fetching with a dedicated helper that does not go through `vigilFetch`:
```typescript
// Option A: explicit flag
export async function vigilFetch(
  path: string,
  init?: RequestInit & { skipContentType?: boolean }
): Promise<Response> {
  const key = getStoredKey()
  const { skipContentType, ...restInit } = init ?? {}
  return fetch(`${API_BASE}${path}`, {
    ...restInit,
    headers: {
      ...(skipContentType ? {} : { 'Content-Type': 'application/json' }),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...restInit?.headers,
    },
  })
}
```

### IN-02: Button visibility condition in list view is hard to maintain

**File:** `vigil-pwa/src/pages/BriefHistoryPage.tsx:215`

**Issue:** The condition that controls whether the primary "Generate Today's Brief" button is shown spans three negated clauses and is difficult to parse at a glance:
```
generateState !== 'generating' && generateState !== 'done' && !(generateState === 'idle' && todayBriefExists && todayBlobUrl)
```
This is equivalent to: show the button when state is `'idle'` (and today's brief is not yet loaded) or `'error'`. A derived variable or helper would make the intent clear and reduce risk of regression.

**Fix:**
```typescript
const showGenerateButton =
  (generateState === 'idle' && !(todayBriefExists && todayBlobUrl)) ||
  generateState === 'error'
```
Then use `{showGenerateButton && <button ...>}` in the JSX.

---

_Reviewed: 2026-04-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
