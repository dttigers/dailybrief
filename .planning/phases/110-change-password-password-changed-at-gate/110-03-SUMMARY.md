---
phase: 110-change-password-password-changed-at-gate
plan: 03
subsystem: pwa-auth
tags: [pwa, settings, auth, fetch-wrapper, wave-3, ui, AUTH-09]

# Dependency graph
requires:
  - phase: 110-change-password-password-changed-at-gate
    plan: 01
    provides: users.passwordChangedAt column + created_at backfill (deploy-safe — no JWTs invalidated)
  - phase: 110-change-password-password-changed-at-gate
    plan: 02
    provides: POST /v1/auth/change-password returning { token, user } + bearerAuth Path 2 'Session expired' 401 body (routable discriminator)
  - phase: 104-pwa-auth-ui-browser-observability
    provides: sessionStorage 'vigil_jwt' storage key (canonical per client.ts:1), signOut() + vigil:signout CustomEvent pattern, /auth route guard
provides:
  - Expandable inline Change Password form inside SettingsPage Vigil Account section (D-15..D-18 verbatim)
  - vigilFetch cross-cutting 401 'Session expired' handler (D-19 — body discriminator, not path discriminator)
  - 4 new vitest D-19 test cases (trigger, non-trigger, non-JSON body, 200 passthrough) — all green
affects:
  - All authenticated PWA routes (vigilFetch is the universal fetch wrapper — every page that reads 401 now gracefully recovers when the user changes their password on another device)
  - Future Phase 112 (forgot-password) — the same D-19 handler will catch stale-session 401s from password resets without further changes
  - No backend changes — Plans 01 + 02 already shipped the server contract

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Body-discriminator 401 routing in fetch wrapper: clone() the response, try/catch JSON parse, match on { error: 'Session expired' } exactly — different 401 bodies (e.g., 'Invalid credentials' from change-password) flow through unchanged. Original Response still returned to caller."
    - "Inline-confirm UX vocabulary extended from Google card (SettingsPage.tsx:247-273) to the new change-password block — same expand-in-place + Cancel flow, new autocomplete-aware inputs with eye-icon show/hide toggles."
    - "D-17 critical ordering: storeKey(body.token) executes BEFORE any subsequent authenticated fetch — setState calls after storeKey do not fire network requests, so execution order is preserved by React's synchronous call semantics."

key-files:
  created:
    - .planning/phases/110-change-password-password-changed-at-gate/deferred-items.md
  modified:
    - vigil-pwa/src/pages/SettingsPage.tsx
    - vigil-pwa/src/api/client.ts
    - vigil-pwa/src/api/client.test.ts

key-decisions:
  - "Emoji glyphs (👁 / 🙈) used for show/hide toggle instead of adding a lucide-react or react-icons dependency — zero new deps, semantically accessible via aria-label ('Show password' / 'Hide password'). Matches scope-boundary rule (no dep additions needed)."
  - "Confirm-password field omitted per D-16 verbatim + REQUIREMENTS.md Out-of-Scope CXL data. Show/hide toggle satisfies the 'user sees what they typed' requirement without the 56% conversion penalty."
  - "Pre-existing SettingsPage.test.tsx:104 failure (WR-03 google_error assertion vs friendly-message mapping) is unrelated to this plan — logged to deferred-items.md, not fixed. Scope boundary respected."

requirements-completed: [AUTH-09]

# Metrics
duration: ~5min
completed: 2026-04-24
---

# Phase 110 Plan 03: PWA Change-Password Form + Global 401 Handler Summary

**Landed the expandable Change Password form inside SettingsPage Vigil Account section (D-15..D-18) and wrapped vigilFetch with a cross-cutting 401 'Session expired' handler (D-19) that catches the exact body emitted by Plan 02's password_changed_at gate — every authenticated PWA route now gracefully recovers when the user changes their password on another device, without per-page handling.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-24T01:39:02Z
- **Completed:** 2026-04-24T01:43:46Z
- **Tasks:** 2/2
- **Files modified:** 3 (SettingsPage.tsx, client.ts, client.test.ts)
- **Files created:** 1 (deferred-items.md)
- **Commits:** 2 (4c93cfc, 237d584)

## Accomplishments

- **D-15:** Expandable Change Password block sits INSIDE the Vigil Account section (not a new card). Collapsed state shows a teal "Change password" button next to the red "Sign out" button; expanded state renders the form below them, separated by a border-top divider for visual grouping.
- **D-16:** Exactly two password inputs (current + new), each with an emoji eye-icon show/hide toggle and verbatim `autoComplete="current-password"` / `autoComplete="new-password"` attributes. No confirm-password field.
- **D-17 critical ordering preserved:** On 200 success, `storeKey(body.token)` is called IMMEDIATELY after the JSON parse, BEFORE any `setCpInlineMsg`, `setCpCurrent`, `setCpNew`, or `setTimeout` calls. None of those setState calls fire network requests, so the next authenticated vigilFetch (whenever it happens) reads the new JWT from sessionStorage. Inline comment at SettingsPage.tsx pins the CONTEXT D-17 `'vigil_token'` typo vs live-code `'vigil_jwt'` via storeKey() (api/client.ts:1).
- **D-18 three cases wired:** 401 → "Current password is incorrect" (inline red), 400 → server `error` body verbatim, everything-else/catch → "Something went wrong. Try again."
- **D-19 global handler:** `vigilFetch` now clones 401 responses, tries to parse `{ error }`, and when the string matches "Session expired" exactly it calls `signOut()` and forces `window.location.href = '/auth'`. The cloned response keeps the original body consumable so callers' existing error-handling paths still run. Non-JSON 401 bodies (e.g., proxy HTML pages) pass through silently via try/catch.
- **Body discriminator only, no path filter:** change-password's wrong-current-password 401 returns `{ error: 'Invalid credentials' }` → different body → no trigger. The non-trigger case is pinned by vitest test 2.
- **4 new D-19 tests in client.test.ts** — trigger case, non-trigger case, non-JSON body safe path, 200 passthrough. All pass (17/17 tests in client.test.ts green).
- **Build:** `npm run build` exits 0. No TypeScript errors.

## SettingsPage.tsx Diff Snippet (Vigil Account section with form)

```tsx
<section className="bg-gray-900 border border-gray-900/40 rounded-lg p-5 mb-4">
  <h2 className="text-lg font-medium">Vigil Account</h2>
  {accountLoading ? (
    <p className="text-gray-400 text-sm mt-2">Loading…</p>
  ) : (
    <p className="text-gray-400 text-sm mt-2">{accountEmail ?? ''}</p>
  )}

  {/* Phase 110 D-15: expandable change-password block, INSIDE the section. */}
  {!cpExpanded && (
    <button type="button" onClick={() => setCpExpanded(true)}
      className="mt-3 mr-3 text-sm text-teal-400 hover:text-teal-300">
      Change password
    </button>
  )}

  <button type="button" onClick={() => { signOut(); navigate('/auth') }}
    className="mt-3 text-sm text-red-400 hover:text-red-300">
    Sign out
  </button>

  {cpExpanded && (
    <form onSubmit={handleChangePasswordSubmit} className="mt-4 border-t border-gray-900/40 pt-4 space-y-3">
      <div>
        <label htmlFor="cp-current" className="block text-xs text-gray-400 mb-1">Current password</label>
        <div className="flex">
          <input id="cp-current" type={cpShowCurrent ? 'text' : 'password'}
            value={cpCurrent} onChange={(e) => setCpCurrent(e.target.value)}
            autoComplete="current-password" ... />
          <button type="button" onClick={() => setCpShowCurrent((v) => !v)}
            aria-label={cpShowCurrent ? 'Hide password' : 'Show password'} ...>
            {cpShowCurrent ? '🙈' : '👁'}
          </button>
        </div>
      </div>
      {/* New password field — identical shape with autoComplete="new-password". NO confirm-password field. */}
      ...
      {cpInlineMsg && (
        <p className={`text-sm ${cpInlineMsg.kind === 'success' ? 'text-teal-400' : 'text-red-400'}`}>
          {cpInlineMsg.text}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={cpSubmitting || !cpCurrent || !cpNew} ...>
          {cpSubmitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={handleCpCancel} ...>Cancel</button>
      </div>
    </form>
  )}
</section>
```

### D-17 ordering pinned in inline comment (Warning 5 fix):

```tsx
if (res.status === 200) {
  const body = (await res.json()) as { token: string; user: { id: number; email: string } }
  // CONTEXT D-17 references sessionStorage['vigil_token']; live code's
  // canonical key is 'vigil_jwt' via storeKey() (api/client.ts:1).
  // D-17 critical ordering: write new JWT to sessionStorage BEFORE any
  // other authenticated fetch fires. The setState calls below do not
  // fire network requests, so calling storeKey first preserves it.
  storeKey(body.token)
  setCpInlineMsg({ kind: 'success', text: 'Password changed' })
  setCpCurrent('')
  setCpNew('')
  setTimeout(() => { setCpExpanded(false); setCpInlineMsg(null) }, 2000)
  return
}
```

## client.ts Diff Snippet (vigilFetch wrap)

```typescript
export async function vigilFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getStoredKey()
  const authHeaders: Record<string, string> = key
    ? { Authorization: `Bearer ${key}` }
    : {}
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
  })

  // Phase 110 (AUTH-09 D-19): cross-cutting 401 'Session expired' detection.
  if (res.status === 401) {
    try {
      const probe = res.clone()
      const body = (await probe.json()) as { error?: string }
      if (body?.error === 'Session expired') {
        signOut()
        if (typeof window !== 'undefined' && window.location) {
          window.location.href = '/auth'
        }
      }
    } catch {
      // Non-JSON 401 body — pass through unchanged.
    }
  }

  return res
}
```

## client.test.ts Diff Snippet (4 new D-19 tests)

```typescript
// ── Phase 110 (AUTH-09 D-19): global 'Session expired' handler ─────────────
// Test framework: vitest (confirmed by client.test.ts:1). Patterns mirror the
// existing tests above: vi.stubGlobal for fetch + window.location, with
// vi.restoreAllMocks() in beforeEach for cleanup (matches line 6).

describe("vigilFetch — D-19 'Session expired' handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.setItem('vigil_jwt', 'test-jwt')
  })
  afterEach(() => { sessionStorage.removeItem('vigil_jwt') })

  it("triggers signOut + navigation when 401 body is { error: 'Session expired' }", async () => {
    const signoutSpy = vi.fn()
    window.addEventListener('vigil:signout', signoutSpy)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 })))
    vi.stubGlobal('location', { href: '' })
    const res = await vigilFetch('/v1/some-authenticated-route')
    expect(signoutSpy).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('vigil_jwt')).toBeNull()
    expect(window.location.href).toBe('/auth')
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Session expired')
    window.removeEventListener('vigil:signout', signoutSpy)
  })

  it("does NOT trigger signOut for 401 with a DIFFERENT body ('Invalid credentials')", async () => { ... })
  it("does NOT throw on a non-JSON 401 body", async () => { ... })
  it("passes through 200 responses unchanged", async () => { ... })
})
```

## Test Results

### client.test.ts — 17/17 pass

| Test | Assertion | Result |
|------|-----------|--------|
| getGoogleStatus returns null on 404 | existing | pass |
| getGoogleStatus returns parsed body on 200 | existing | pass |
| getGoogleStatus throws on 500 | existing | pass |
| disconnectGoogle calls DELETE /v1/google/tokens with bearer auth | existing | pass |
| redirectToGoogleAuth sets window.location.href to /v1/auth/google | existing | pass |
| getPrintSchedule returns parsed PrintSchedule on 200 | existing | pass |
| getPrintSchedule throws on non-2xx response | existing | pass |
| getPrintSchedule calls GET /v1/settings/print-schedule with bearer auth | existing | pass |
| setPrintSchedule calls PUT /v1/settings/print-schedule with correct body | existing | pass |
| setPrintSchedule throws on non-2xx response | existing | pass |
| signOut clears sessionStorage JWT and legacy localStorage key | existing | pass |
| signOut dispatches a vigil:signout CustomEvent on window | existing | pass |
| signOut fires event after clearing storage (listener sees cleared state) | existing | pass |
| **D-19-01** triggers signOut + navigation when 401 body is 'Session expired' | NEW | pass |
| **D-19-02** does NOT trigger signOut for 401 with 'Invalid credentials' | NEW | pass |
| **D-19-03** does NOT throw on non-JSON 401 body | NEW | pass |
| **D-19-04** passes through 200 responses unchanged | NEW | pass |

### Build

- `npm run build` exits 0 — zero TypeScript errors, Vite produces dist bundles cleanly.

## Deviations from Plan

None — plan executed exactly as written.

The plan anticipated this scenario ("If no tests exist for SettingsPage, this is a UI-shape change verified by grep + build only") — a `SettingsPage.test.tsx` does exist, but every test that exercises the Vigil Account section or the form surface was already passing before the plan started (confirmed via stash-and-test). Only the pre-existing WR-03 `google_error` assertion fails — this is unrelated code path (Google OAuth callback banner) and unrelated root cause (test asserts raw error code, implementation maps to friendly string).

## Issues Encountered

- **Pre-existing SettingsPage.test.tsx:104 failure (unrelated — logged to deferred-items.md):**
  The test `shows error banner with decoded message when ?google_error=invalid_state` asserts `screen.findByText(/invalid_state/i)` but the WR-03 allowlist in SettingsPage.tsx intentionally maps the raw code `invalid_state` to the friendly string "Connection attempt expired. Please try again." The test is broken against the intentional mapping — not caused by this plan. Confirmed pre-existing via `git stash` + re-run on the Task-1-only commit `4c93cfc`. Fix is a test-expectation change (recommended: `/Connection attempt expired/i`), deferred to a future plan.

## User Setup Required

None — purely client-side PWA changes. The endpoint + gate shipped in Plans 01 + 02 and are already live on Railway production (auto-deploy). Next `npm run dev` / PWA deploy picks this up automatically.

## Next Phase Readiness

- **Phase 111 (Transactional Email Infrastructure — EMAIL-01)** is unblocked structurally and can begin DNS work immediately.
- **Phase 112 (Forgot-Password Email Flow — AUTH-10)** will reuse the D-19 global handler without modification — any 401 emitted by bearerAuth's gate after a password reset will trigger the same clean re-login flow.
- **Human-verify for next smoke session:** Visually confirm the Change Password button collapses/expands correctly, show/hide toggles flip type="password" ↔ type="text", a successful change keeps the user logged in on the current device (storeKey → new JWT), and cross-device: changing on device A bounces device B to /auth on its next authenticated fetch (this is the D-19 payoff and is only observable with two browsers/machines).

## Self-Check: PASSED

- **Files verified:**
  - `vigil-pwa/src/pages/SettingsPage.tsx` — FOUND (`grep -c "Change password"` returns 1; `grep -c "storeKey(body.token)"` returns 1)
  - `vigil-pwa/src/api/client.ts` — FOUND (`grep -c "Session expired"` returns 5; `grep -c "res.clone()"` returns 1; `grep -c "window.location.href = '/auth'"` returns 1)
  - `vigil-pwa/src/api/client.test.ts` — FOUND (17 tests total, 4 new D-19 tests present: `grep -c "vitest (confirmed by client.test.ts:1)"` returns 1)
  - `.planning/phases/110-change-password-password-changed-at-gate/deferred-items.md` — FOUND (pre-existing WR-03 test failure documented)

- **Commits verified (git log --oneline):**
  - `4c93cfc` — FOUND (Task 1: SettingsPage.tsx change-password form)
  - `237d584` — FOUND (Task 2: vigilFetch D-19 handler + 4 tests)

- **Build + test verified:**
  - `npm run build` exits 0 (TypeScript clean, Vite bundles clean)
  - `npm test -- src/api/client.test.ts` → 17/17 pass, all 4 new D-19 tests green

---
*Phase: 110-change-password-password-changed-at-gate*
*Plan: 03*
*Completed: 2026-04-24*
