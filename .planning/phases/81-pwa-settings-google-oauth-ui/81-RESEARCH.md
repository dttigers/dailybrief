# Phase 81: PWA Settings & Google OAuth UI - Research

**Researched:** 2026-04-13
**Domain:** React 19 + React Router v7 PWA page + small Hono server redirect tweak
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Settings Page Placement & Nav**
- **D-01:** New route `/settings` rendered by new `SettingsPage.tsx` in `vigil-pwa/src/pages/`. NOT a tab in the primary tab bar.
- **D-02:** Entry point is a **gear (cog) icon button** in the top nav bar of `Layout.tsx`, placed to the left of the existing "Sign out" button. Sign Out STAYS in the header — NOT moved into Settings.
- **D-03:** Gear icon shows a **red status dot** when any Google scope is `needs_auth` or no token exists. Dot disappears when both scopes are `connected`. Status comes from `GET /v1/google/status` (Phase 79) and is reused across Layout/Settings — decide during planning whether to hoist into a shared hook.

**Connection Status Display**
- **D-04:** Single "Google" card on Settings page. Shows connected account identifier (email if stored, else generic "Google account") + Disconnect button top-right. Two per-scope rows: **Calendar** and **Gmail**, each with status dot (connected / needs re-auth / not connected) and — only when needed — per-row "Re-connect" button.
- **D-05:** Empty state (no token): same card shell, "Not connected" status, fine-print line listing scopes to be granted ("Calendar read, Gmail read"), single primary "Connect Google" button.
- **D-06:** Disconnect uses **inline confirmation** — "Disconnect" transforms into "Confirm disconnect?" / "Cancel" inline. NO modal, NO native `confirm()`.
- **D-07:** Status shape consumed: `{ calendar: 'connected'|'needs_auth', gmail: 'connected'|'needs_auth' }`. Missing/404 → treat as fully disconnected.

**OAuth Flow Trigger & Callback UX**
- **D-08:** Connect / Re-connect = **full-page redirect** `window.location.href = \`${API_BASE}/auth/google\``. NO popup (breaks iOS standalone).
- **D-09:** Re-connect (scope gap) hits the **same** `/auth/google` endpoint. Phase 79 D-09 forces `prompt=consent` + both scopes every time.
- **D-10:** **Update vigil-core callback redirect target in this phase.** Change server redirect from `PWA_URL?google_connected=true` to `PWA_URL/settings?google_connected=true`. Error path: `PWA_URL/settings?google_error=...`. Supersedes Phase 79 D-07's last sentence.
- **D-11:** SettingsPage reads `?google_connected=true` / `?google_error=...` from `searchParams` on mount. Success → refetch status + inline success banner. Error → inline error banner w/ decoded message. Both → call `history.replaceState` to strip query string (no replay on reload).
- **D-12:** Notification = **inline dismissible banner** styled like `OfflineBanner` — NOT a toast library. Auto-dismiss 5s or user dismiss. NO new npm dep.

**Scope (this phase)**
- **D-13:** Phase 81 ships ONLY the Google integration card. NO API key display/rotate, NO app info/version, NO "Clear cache."
- **D-14:** Sign Out STAYS in Layout header. Settings does NOT duplicate it.

### Claude's Discretion
- Exact Tailwind styling/spacing/badge colors (follow existing dark theme: `bg-gray-900`, `text-gray-50`, `text-teal-600`, `border-gray-900/40`)
- Loading skeletons vs spinners while status fetching
- React Query / SWR vs plain fetch — match pattern other PWA pages use (**verified below: plain fetch + useEffect**)
- Exact copy for error messages beyond server response
- Whether to show account email (depends on Phase 79 discretion outcome)
- Test structure — component tests for states, integration test for callback params (**verified below: no test framework installed yet**)
- Inline `window.location.href` vs helper `redirectToGoogleAuth()`

### Deferred Ideas (OUT OF SCOPE)
- Vigil API key management on Settings (display/rotate)
- App info / debug section (PWA version, base URL, Clear cache)
- Toast notification library (sonner, react-hot-toast)
- Separate `/auth/google/callback` route IN the PWA (server redirects directly to `/settings`)
- Incremental/per-scope authorization flow
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OAUTH-01 | User can connect Google account from PWA Settings page (grants gmail.readonly + calendar.readonly) | D-05, D-08 — full-page redirect to `/auth/google` (Phase 79 D-09 requests both scopes w/ `prompt=consent`). SettingsPage renders Connect button when status is empty/404. |
| OAUTH-02 | User can disconnect Google account from PWA Settings page | D-06 inline confirm + `disconnectGoogle()` API client method → Phase 79 must expose disconnect endpoint; if not, scope includes adding `DELETE /v1/google/tokens` in this phase. |
| OAUTH-03 | PWA displays Google connection status (connected, needs re-auth, disconnected) | D-04, D-07 — consume `GET /v1/google/status` shape, render per-scope dots + Layout gear dot via shared hook. |
</phase_requirements>

## Summary

Phase 81 is a focused PWA UI phase: one new page (`SettingsPage.tsx`), one new nav affordance (gear icon + red dot in `Layout.tsx`), two new API client methods, and one small server-side change (callback redirect target). The stack is already pinned — React 19.2, React Router 7.14 (imports from `react-router`, not `react-router-dom`), Tailwind 4.2, Vite 8 + vite-plugin-pwa. **There is no test framework installed in `vigil-pwa/`** — zero `*.test.*` files, no vitest/jest in `package.json`. Validation architecture will either (a) add vitest + RTL as a Wave 0 item or (b) rely on manual E2E + TypeScript + build checks. The existing data-fetch pattern is **plain `fetch` + `useState` + `useEffect` with a `cancelled` flag** (see `useWorkOrders.ts`) — no React Query, no SWR. Match that.

A blocking prerequisite from Phase 79: **neither `GET /v1/google/status` nor any disconnect endpoint exists in `vigil-core/src/` yet** (grep returned zero hits for `google/status`, `google/tokens`, `disconnect`). Phase 79 is supposed to ship `/v1/google/status` but has NOT yet run. Phase 79's current `calendar-auth.ts` also still has the in-memory nonce and only requests the `calendar.readonly` scope. If Phase 79 completes before Phase 81, those endpoints exist. If not, Phase 81 must either wait, or include a server scope spike to guarantee them.

**Primary recommendation:** Structure plans in this order — (1) API client methods + shared hook, (2) SettingsPage component with all four states, (3) Layout gear icon + red dot wiring, (4) vigil-core callback redirect change + disconnect endpoint verification, (5) callback-param handler + banner, (6) manual E2E checklist for iOS standalone PWA. Verify Phase 79 endpoints exist before Plan 1 starts.

## Standard Stack

### Core (already installed — DO NOT add alternatives)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.2.5 | UI runtime | Already pinned in `vigil-pwa/package.json` [VERIFIED: package.json:11] |
| react-dom | 19.2.5 | DOM renderer | Pinned [VERIFIED: package.json:12] |
| react-router | 7.14.0 | Routing, `useSearchParams`, `useNavigate` | **Import from `'react-router'`** — NOT `'react-router-dom'` (v7 deprecated the dom package for SPA use). Already used across codebase [VERIFIED: App.tsx:2, Layout.tsx:1] |
| tailwindcss | 4.2.2 | Styling | Existing theme tokens in use [VERIFIED: package.json:20] |

### Supporting (for server-side change)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hono | (pinned in vigil-core) | Route handler framework | For the callback redirect + (possibly) disconnect endpoint [VERIFIED: calendar-auth.ts:1] |

### Alternatives Considered (and rejected)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain fetch + useEffect | React Query / SWR | Rejected — no other PWA page uses them; introducing one caches-hook lib for one page is premature [VERIFIED: hooks/*.ts all use plain fetch] |
| Inline banner | Toast library (sonner/react-hot-toast) | Rejected by D-12 — no new npm dep |
| Native `confirm()` / modal | Inline transform button | Rejected by D-06 |
| Popup OAuth window | Full-page redirect | Rejected by D-08 — popups break iOS standalone PWA |

**Installation:** None required. Phase 81 adds zero runtime dependencies. If the planner chooses to add vitest + RTL for Wave 0 test scaffolding, see Validation Architecture section.

**Version verification:**
- react 19.2.5 [VERIFIED: package.json — published ~Nov 2025 per React 19 release line]
- react-router 7.14.0 [VERIFIED: package.json — v7 merged `react-router-dom` into `react-router` for framework mode; SPA users import from `react-router`]
- tailwindcss 4.2.2 [VERIFIED: package.json — v4 uses Vite plugin `@tailwindcss/vite`]

## Project Constraints (from CLAUDE.md)

**No `CLAUDE.md` exists in the working directory** [VERIFIED: ls returned exit 1]. No `.claude/skills/` or `.agents/skills/` directory in this repo [VERIFIED: ls both returned nothing]. No project-specific skill rules to honor beyond what is in `.planning/STATE.md` and memory files.

Relevant memory-surfaced constraints:
- **iOS PWA standalone OAuth**: STATE.md §Blockers flags "iOS PWA OAuth full-page redirect behavior — requires real device test during Phase 81." This locks the manual E2E checklist item.
- **Vigil API key storage**: `localStorage['vigil_api_key']` — already in place, do not alter.
- **API base resolution**: `VITE_API_BASE` env var, falls back to `https://api.vigilhub.io` in prod and empty string (proxy) in dev [VERIFIED: client.ts:2].

## Architecture Patterns

### Recommended Project Structure (delta from current tree)
```
vigil-pwa/src/
├── api/
│   └── client.ts            # + getGoogleStatus(), + disconnectGoogle()
├── components/
│   └── Layout.tsx           # + gear icon <Link to="/settings">, + red status dot
├── hooks/
│   └── useGoogleStatus.ts   # NEW — shared by Layout dot + SettingsPage card
├── pages/
│   └── SettingsPage.tsx     # NEW — single-card Google integration page
└── App.tsx                  # + <Route path="/settings" element={<SettingsPage />} />
```

**Server delta:**
```
vigil-core/src/routes/
└── calendar-auth.ts → google-auth.ts   # Phase 79 rename; Phase 81 updates redirect targets in lines 70, 75, 80, 98, 140, 143
```

### Pattern 1: Plain `fetch` + `useEffect` + cancellation flag
**What:** Data-fetching hooks use `useState` for data/loading/error, `useEffect` with a local `cancelled` boolean, and set state only when `!cancelled`.
**When to use:** For `useGoogleStatus` — mirrors every other hook in the repo.
**Example:**
```typescript
// Source: vigil-pwa/src/hooks/useWorkOrders.ts — existing pattern
export function useGoogleStatus() {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getGoogleStatus()
      .then((s) => { if (!cancelled) setStatus(s) })
      .catch((e: Error) => {
        if (!cancelled) {
          // 404 → treat as disconnected (D-07)
          if (e.message.includes('404')) setStatus(null)
          else setError(e.message)
        }
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [refetchCount])

  const refetch = useCallback(() => setRefetchCount((n) => n + 1), [])
  return { status, isLoading, error, refetch }
}
```

### Pattern 2: React Router v7 `useSearchParams` + `history.replaceState` strip
**What:** After reading callback query params on mount, strip them without triggering a navigation so a reload does not replay the banner.
**When to use:** SettingsPage mount handler for `?google_connected` / `?google_error`.
**Example:**
```typescript
// Source: React Router v7 docs (imports from 'react-router')
import { useSearchParams } from 'react-router'

const [searchParams] = useSearchParams()
useEffect(() => {
  const connected = searchParams.get('google_connected')
  const error = searchParams.get('google_error')
  if (!connected && !error) return

  if (connected) { setBanner({ kind: 'success', text: 'Google connected' }); refetch() }
  if (error) setBanner({ kind: 'error', text: decodeURIComponent(error) })

  // Strip query string so reload does not re-show banner (D-11)
  window.history.replaceState({}, '', window.location.pathname)
}, [])  // run once on mount
```
[CITED: reactrouter.com v7 framework docs — `useSearchParams` is the v7 SPA import]

### Pattern 3: Hono route factory with DI (server side)
**What:** `vigil-core` OAuth routes use a factory function `createXAuthRouter(deps?)` so unit tests can inject fakes.
**When to use:** If Phase 81 needs to add a `DELETE /v1/google/tokens` disconnect route and Phase 79 did not.
**Example:**
```typescript
// Source: vigil-core/src/routes/calendar-auth.ts:33 — existing pattern
export function createGoogleAuthRouter(deps?: GoogleAuthDeps): Hono {
  const router = new Hono()
  router.delete('/google/tokens', async (c) => {
    const deleteFn = deps?.deleteFn ?? (async () => {
      if (!db) throw new Error('Database not available')
      await db.delete(oauthTokens).where(eq(oauthTokens.provider, 'google'))
    })
    await deleteFn()
    return c.json({ ok: true })
  })
  return router
}
```

### Anti-Patterns to Avoid
- **`window.confirm()` for disconnect** — D-06 explicitly rejects. Use inline button transform.
- **`window.open()` popup for OAuth** — breaks iOS PWA standalone (D-08). Always `window.location.href`.
- **`react-router-dom` imports** — v7 SPA mode uses `'react-router'`; the dom package is for framework mode only.
- **Leaving `?google_connected=true` in the URL** — reload replays the banner. Must `history.replaceState` (D-11).
- **Two independent status fetches (Layout + SettingsPage)** — creates flicker and doubles API load. Hoist into a shared hook or pass via prop/context.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query string reading | Manual `location.search.split('&')` parsing | `useSearchParams()` from `react-router` | Handles encoding, array params, re-runs on route change [CITED: reactrouter.com] |
| OAuth state CSRF token | Own JWT signer | Phase 79's `jose`-based JWT state (D-01) | Already in upstream scope |
| Toast / notification system | Own portal + timer + z-index manager | Inline banner styled like `OfflineBanner` (D-12) | One-page usage; lib adds bundle weight |
| Modal confirm | Own `<Modal>` + overlay | Inline button transform (D-06) | Simpler; better mobile UX |
| Icon | Hand-drawn SVG with magic numbers | Inline SVG copied from Heroicons/Lucide (no package install) — just paste the `<svg>` | Matches D-12 "no new npm dep" philosophy and existing zero-icon-lib pattern in the repo |

**Key insight:** Phase 81's complexity is entirely in state management (four card states × two scope states × three banner states × iOS-specific redirect). The code surface is small; correctness comes from the state matrix, not from abstractions.

## Runtime State Inventory

> This is primarily a UI/greenfield phase but does include a rename-adjacent server change. Addressing each category explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None. No DB schema changes in Phase 81. `oauth_tokens` table already exists; Phase 79 adds `scopes` column. | None |
| Live service config | **Google Cloud OAuth redirect URI** — the registered redirect URI in Google Cloud Console is the server's `/v1/auth/google/callback` endpoint and does **not** change (D-10 changes the post-callback PWA redirect, not the Google → server callback URI). Phase 79 already needed gmail scope added to OAuth consent screen. | Verify Google Cloud consent screen has gmail.readonly listed (Phase 79 concern; re-verify before Phase 81 E2E) |
| OS-registered state | None | None — verified by checking no launchd/plist/service-worker state names are renamed |
| Secrets/env vars | `PWA_URL` env var in Railway — the base URL the server appends `/settings?google_connected=true` to (D-10). Must be set correctly. `GOOGLE_OAUTH_STATE_SECRET` is a Phase 79 concern. | Verify `PWA_URL` in Railway points to the production PWA origin with no trailing slash |
| Build artifacts | Service worker caching — `vite-plugin-pwa` with `registerType: 'autoUpdate'` + `skipWaiting: true` + `clientsClaim: true` [VERIFIED: vite.config.ts]. Means new deploys reflect within seconds, but the stale SW may serve the old App bundle on first load after deploy. | None code-side. Plan should include "hard reload after deploy" as a manual E2E note. |

**Canonical question answered:** After the repo changes land, the only runtime state that still carries the old redirect target is Google's OAuth registration, and that does not change — the Google-side redirect is `server/v1/auth/google/callback`, not the PWA URL. Safe.

## Common Pitfalls

### Pitfall 1: Importing from `react-router-dom`
**What goes wrong:** `Cannot find module 'react-router-dom'` or runtime mismatch between two router instances.
**Why it happens:** Training data and most tutorials show v6 `react-router-dom` imports. v7 SPA unified on `react-router`.
**How to avoid:** Every import must be `from 'react-router'` — verify in every new file.
**Warning signs:** TypeScript error, or `useSearchParams` returns stale values.

### Pitfall 2: Service worker serves stale PWA after callback redirect
**What goes wrong:** User completes OAuth, server redirects to `PWA_URL/settings?google_connected=true`, but the cached SW serves the old bundle without the `/settings` route → route returns "not found" or blank.
**Why it happens:** `skipWaiting: true` helps but the first navigation after deploy may still hit the old SW.
**How to avoid:** Plan's E2E checklist includes "hard reload (or uninstall + reinstall PWA) after deploy before testing." Also: `/settings` should be a valid client-side route so the SPA index.html handles it via `navigateFallback`.
**Warning signs:** 404 on `/settings` in standalone mode while it works in dev.

### Pitfall 3: iOS Safari standalone mode session loss during OAuth
**What goes wrong:** User taps Connect, Safari opens OAuth in-PWA (since D-08 uses `window.location.href`), user consents, server redirects back, but iOS treats the return as a new browser session — localStorage still there but the PWA "feels" different.
**Why it happens:** iOS standalone PWA + `window.location.href` to cross-origin → on return, the app resumes in PWA mode because the redirect target is same-origin PWA_URL. BUT: any in-memory React state is lost (expected — full page reload).
**How to avoid:** SettingsPage must re-derive all state from localStorage + the `/v1/google/status` fetch. Do not assume any React state survives the round trip. The callback banner is driven purely from `searchParams`.
**Warning signs:** "Connected" banner doesn't appear on return, or status dot stays red.

### Pitfall 4: Callback banner replays on reload
**What goes wrong:** User returns with `?google_connected=true`, banner shows, user refreshes, banner shows again.
**Why it happens:** Query string persists in URL. React Router `useSearchParams` re-reads it on every render.
**How to avoid:** D-11 prescribes `history.replaceState({}, '', location.pathname)` after reading once. Must run exactly once per mount — use empty dep array `useEffect`.
**Warning signs:** Banner reappears after F5.

### Pitfall 5: Status dot race between Layout and SettingsPage
**What goes wrong:** User disconnects on SettingsPage, card updates, but gear dot stays hidden/visible because Layout has its own stale fetch.
**Why it happens:** Two separate `useEffect` calls to `getGoogleStatus()`.
**How to avoid:** Single hook `useGoogleStatus()` with a shared module-level store, or lift into a Context provider at the `Layout` level, or use a simple event emitter. Simplest: Context with the fetch living in the provider and `refetch` exposed via context.
**Warning signs:** Disconnect succeeds but header dot color does not update without a page reload.

### Pitfall 6: 404 from `/v1/google/status` being treated as error
**What goes wrong:** Before user has ever connected, `/v1/google/status` may 404 (no row in `oauth_tokens`). If the hook treats 404 as a fatal error, the UI shows "Error loading status" instead of the empty-state "Connect Google" button.
**Why it happens:** Naive `if (!res.ok) throw` pattern.
**How to avoid:** D-07 mandates "missing/404 → treat as fully disconnected." Hook must differentiate 404 (→ `status = null`, meaning empty state) from 500/network (→ `error`).
**Warning signs:** Fresh user sees an error banner instead of the Connect button.

## Code Examples

### API Client additions
```typescript
// Source: extends vigil-pwa/src/api/client.ts pattern
export interface GoogleStatus {
  calendar: 'connected' | 'needs_auth'
  gmail: 'connected' | 'needs_auth'
  // Optional — only present if Phase 79 stored account email (discretion item)
  email?: string
}

export async function getGoogleStatus(): Promise<GoogleStatus | null> {
  const res = await vigilFetch('/v1/google/status')
  if (res.status === 404) return null   // D-07: not connected
  if (!res.ok) throw new Error(`Failed to fetch Google status: ${res.status}`)
  return res.json()
}

export async function disconnectGoogle(): Promise<void> {
  const res = await vigilFetch('/v1/google/tokens', { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to disconnect Google: ${res.status}`)
}

export function redirectToGoogleAuth(): void {
  // D-08: full-page redirect (no popup; iOS PWA safe)
  window.location.href = `${API_BASE}/v1/auth/google`
}
```

### Layout gear icon + status dot
```typescript
// Source: extends vigil-pwa/src/components/Layout.tsx pattern
import { Link } from 'react-router'
import { useGoogleStatus } from '../hooks/useGoogleStatus'

// Inside <nav>, immediately left of the Sign out button:
const { status } = useGoogleStatus()
const needsAttention = !status
  || status.calendar === 'needs_auth'
  || status.gmail === 'needs_auth'

<Link to="/settings" aria-label="Settings" className="relative p-1 text-gray-400 hover:text-gray-50">
  {/* Inline cog SVG — no icon library */}
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
  {needsAttention && (
    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" aria-label="needs attention" />
  )}
</Link>
```

### SettingsPage state matrix
```typescript
// Source: new vigil-pwa/src/pages/SettingsPage.tsx
// State cases:
// 1. status === null (empty / 404)         → "Not connected" + Connect button
// 2. both 'connected'                      → account row + Disconnect (inline confirm)
// 3. one 'needs_auth'                      → per-row Re-connect button on the failing scope
// 4. loading                               → skeleton or spinner in card
// 5. error                                 → error banner + retry
// Banner overlay: success (5s auto-dismiss) / error (sticky until dismissed)
```

### Server redirect change
```typescript
// Source: diff against vigil-core/src/routes/calendar-auth.ts lines 70, 75, 80, 98, 140, 143
// Before:
return c.redirect(`${pwaUrl}?calendar_error=${encodeURIComponent(error ?? "no_code")}`);
return c.redirect(pwaUrl);   // line 140

// After (D-10):
return c.redirect(`${pwaUrl}/settings?google_error=${encodeURIComponent(error ?? "no_code")}`);
return c.redirect(`${pwaUrl}/settings?google_connected=true`);

// Also rename query-param key from `calendar_error` → `google_error` for consistency with D-11.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-router-dom` imports | `react-router` imports in SPA mode | React Router v7 (late 2024) | Every import must use `react-router` |
| OAuth popup window | Full-page redirect | iOS PWA standalone rollout | D-08; this project uses full-page only |
| Incremental scope auth | Request all scopes up front with `prompt=consent` | Phase 79 D-09 | Simpler UI; single consent screen |
| In-memory CSRF nonce | JWT state (`jose`) | Phase 79 D-01 | Survives Railway rolling deploys |

**Deprecated/outdated:**
- `calendar_error` query param name (Phase 74 era) → `google_error` (Phase 81 D-10 + D-11)
- `PWA_URL?google_connected` redirect target (Phase 79 D-07) → `PWA_URL/settings?google_connected` (Phase 81 D-10)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + pnpm/npm for vigil-pwa dev | Local dev | ✓ | v20+ assumed | — |
| Railway `PWA_URL` env var | Server-side callback redirect (D-10) | Must verify | — | Default `http://localhost:5173` in code fallback [VERIFIED: calendar-auth.ts:63] |
| Phase 79 endpoints (`GET /v1/google/status`, disconnect) | PWA API client | **✗ — not yet shipped** | — | **Phase 81 must either wait for Phase 79 merge OR include a server spike** |
| Google Cloud OAuth consent screen w/ gmail.readonly scope | OAuth flow works at runtime | Phase 79 concern | — | Phase 79 responsibility |
| iOS device for E2E | Manual standalone-mode test | ✓ (user owns) | — | Desktop-only Chrome DevTools device emulation is NOT sufficient for PWA standalone mode [CITED: STATE.md blocker] |

**Missing dependencies with no fallback:**
- `GET /v1/google/status` and disconnect endpoint — **blocks Phase 81 if Phase 79 has not merged**. Planner must gate Plan 1 on Phase 79 completion, or include a spike that provisions these endpoints.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **None installed** [VERIFIED: package.json has no vitest/jest/RTL; find returned zero `*.test.*` files] |
| Config file | None |
| Quick run command | `tsc -b` (TypeScript + `vite build` as smoke) |
| Full suite command | Same + manual E2E checklist |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OAUTH-01 | Connect button triggers redirect to `/v1/auth/google` | unit (vitest + RTL if added) | `vitest run src/pages/SettingsPage.test.tsx -t "connect button redirects"` | ❌ Wave 0 |
| OAUTH-01 | Full OAuth round-trip lands on `/settings?google_connected=true` | manual E2E | Checklist item — iOS standalone + desktop Chrome | manual |
| OAUTH-02 | Disconnect shows inline confirm, confirms clears token, UI updates | unit | `vitest run src/pages/SettingsPage.test.tsx -t "disconnect inline confirm"` | ❌ Wave 0 |
| OAUTH-02 | `DELETE /v1/google/tokens` returns 200 and deletes row | integration (vigil-core) | `vitest run vigil-core/src/routes/google-auth.test.ts -t "disconnect"` | ❌ Wave 0 (verify Phase 79 did not already ship) |
| OAUTH-03 | Renders empty state when status=null | unit | `vitest run src/pages/SettingsPage.test.tsx -t "empty state"` | ❌ Wave 0 |
| OAUTH-03 | Renders connected state when both scopes=connected | unit | `vitest run src/pages/SettingsPage.test.tsx -t "connected state"` | ❌ Wave 0 |
| OAUTH-03 | Renders scope-gap state when gmail=needs_auth | unit | `vitest run src/pages/SettingsPage.test.tsx -t "scope gap"` | ❌ Wave 0 |
| OAUTH-03 | Gear icon red dot appears when status=null OR any scope needs_auth | unit | `vitest run src/components/Layout.test.tsx -t "gear icon red dot"` | ❌ Wave 0 |
| OAUTH-03 | Callback `?google_connected=true` shows success banner + strips query string | unit | `vitest run src/pages/SettingsPage.test.tsx -t "callback param handling"` | ❌ Wave 0 |
| OAUTH-03 | Callback `?google_error=foo` shows error banner | unit | `vitest run src/pages/SettingsPage.test.tsx -t "callback error"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd vigil-pwa && tsc -b && vite build` (<30s), plus vitest if installed
- **Per wave merge:** Full unit suite + `vitest run` in vigil-core for the disconnect route test
- **Phase gate:** Full suite green + manual iOS E2E checklist signed off before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] **Decision point:** Install `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` in `vigil-pwa/` OR accept manual-only validation.
  - If install: add `vitest`, `@testing-library/react@^16`, `@testing-library/jest-dom@^6`, `jsdom@^25` to devDependencies; add `test` script; create `vitest.config.ts` or extend `vite.config.ts` with `test: { environment: 'jsdom', globals: true }`.
  - Recommended: **install** — phase 81 is the user-facing entry to OAuth, four states × callback-param variants is too much behavior for manual-only validation to catch regressions.
- [ ] `vigil-pwa/vitest.config.ts` or `vite.config.ts` test block
- [ ] `vigil-pwa/src/test/setup.ts` (jest-dom matchers)
- [ ] `src/pages/SettingsPage.test.tsx` — state matrix + callback params (covers OAUTH-01, OAUTH-02, OAUTH-03)
- [ ] `src/components/Layout.test.tsx` — gear icon red dot logic (covers OAUTH-03)
- [ ] `src/hooks/useGoogleStatus.test.ts` — 404 → null, refetch, error isolation (covers OAUTH-03)
- [ ] `vigil-core/src/routes/google-auth.test.ts` — disconnect endpoint + updated redirect targets (covers OAUTH-02; may already exist from Phase 79 — verify first)
- [ ] **Manual E2E checklist** (non-automated, REQUIRED):
  - [ ] Desktop Chrome: Connect → Google consent → return to `/settings?google_connected=true` → banner shows → query string cleared on reload
  - [ ] Desktop Chrome: Disconnect → inline confirm → status flips to empty
  - [ ] Desktop Chrome: Scope-gap scenario (manually set `scopes` DB row to calendar-only) → per-row Gmail Re-connect button appears
  - [ ] **iOS Safari standalone PWA mode: full Connect flow survives redirect round-trip** (STATE.md-flagged blocker)
  - [ ] iOS standalone: gear icon dot disappears after successful connect without manual refresh
  - [ ] iOS standalone: error path — trigger `?google_error=invalid_state` manually, confirm error banner renders

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bearer API key (existing, unchanged) for `/v1/*`; OAuth 2.0 for Google (Phase 79 infra) |
| V3 Session Management | yes | localStorage `vigil_api_key` (existing, unchanged); OAuth state JWT (Phase 79) |
| V4 Access Control | yes | `/v1/google/status` and disconnect endpoint MUST sit behind `bearerAuth` middleware — NOT in the `/auth/google` bypass branch of `index.ts:75-79` |
| V5 Input Validation | yes | Callback query params — decode + HTML-escape when rendering `google_error` in the banner (React auto-escapes; do NOT use `dangerouslySetInnerHTML`) |
| V6 Cryptography | no | No new crypto — Phase 79 owns JWT state + token encryption |

### Known Threat Patterns for React SPA + Hono OAuth

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via `google_error` query param | Tampering / EoP | React's default JSX escaping. Never `dangerouslySetInnerHTML`. `decodeURIComponent` is safe — renders as text. |
| Open redirect via `?redirect=` | Tampering | Not applicable — the server controls the redirect target (`PWA_URL` from env), PWA does not forward anywhere |
| CSRF on disconnect endpoint | Tampering | Bearer token required (existing middleware). Same-origin not required because API key is a bearer token, not a cookie. |
| OAuth callback replay | Tampering | JWT state w/ 5-min expiry + one-time use (Phase 79 D-02); banner `history.replaceState` prevents localhost replay of UI state (D-11) |
| localStorage token exfil via XSS | Info Disclosure | Out of scope — existing risk; no new localStorage writes in Phase 81 |
| PWA service worker serving stale auth bundle | Repudiation | `skipWaiting: true` + `clientsClaim: true` already set [VERIFIED: vite.config.ts] |

**Phase-specific security checkpoint:**
- Verify that `app.use("/v1/*", ...)` at `vigil-core/src/index.ts:75-79` has `/v1/auth/google` bypass but does NOT bypass `/v1/google/status` or `/v1/google/tokens`. Both must require bearer auth.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 79 will ship `/v1/google/status` with the exact shape `{ calendar, gmail }` before Phase 81 starts | Summary, API client | [ASSUMED based on Phase 79 D-06 — VERIFIED as intent but not as shipped code. If Phase 79 slips, Phase 81 blocks.] |
| A2 | Phase 79 will ship a disconnect endpoint (`DELETE /v1/google/tokens` or similar) | OAUTH-02 support | [ASSUMED — Phase 79 CONTEXT.md does NOT explicitly list disconnect. Grep of vigil-core found zero disconnect code. Planner must confirm in Phase 79 deliverables or include disconnect in Phase 81 server scope.] |
| A3 | `PWA_URL` Railway env var points to the production PWA origin with no trailing slash | D-10 redirect change | [ASSUMED — must verify in Railway before deploy, else redirect may land on `PWA_URL/settings?…` becoming `https://example.com//settings?…` (still works, but ugly) or missing path prefix] |
| A4 | Installing vitest + RTL is acceptable dev-dep addition (doesn't conflict with D-12's "no new npm dep") | Validation Architecture | [ASSUMED — D-12 was specifically about runtime toast libs; dev dependencies for testing are a different category. Planner may want to re-confirm.] |
| A5 | React 19 + React Testing Library 16 work together without issues | Validation Architecture | [CITED: React Testing Library v16 added React 19 support — release notes Oct 2024. Should be safe but if vitest/RTL is chosen, verify versions at install time.] |
| A6 | Account email display is OPTIONAL and gated on Phase 79 discretion outcome | D-04 | [VERIFIED: CONTEXT.md D-04 and discretion explicitly state "if stored, else generic 'Google account'"] |
| A7 | iOS standalone PWA preserves localStorage across `window.location.href` redirect round-trips | Pitfall 3 | [ASSUMED based on general PWA spec — must be validated in manual E2E. If false, API key gets wiped on OAuth return, which would be a showstopper requiring a different auth persistence strategy.] |

## Open Questions

1. **Does Phase 79 expose a disconnect endpoint?**
   - What we know: Phase 79 CONTEXT.md describes status + JWT nonce + scope column — no explicit disconnect route.
   - What's unclear: Whether Phase 79 silently adds one, or Phase 81 must.
   - Recommendation: **Planner MUST read the actual `vigil-core/src/routes/google-auth.ts` when Phase 81 plans start — after Phase 79 has merged. If missing, include a task in Phase 81 to add `DELETE /v1/google/tokens`.** Default assumption: Phase 81 must add it.

2. **Install vitest + RTL or go manual-only?**
   - What we know: No test infrastructure in vigil-pwa; phase is UI-heavy with state matrix.
   - Recommendation: Install. State-matrix regressions are cheap to write and would otherwise require human re-testing on every refactor.

3. **Does the `Layout` status dot need to live in a Context provider, or is a module-level cache enough?**
   - What we know: Two consumers (Layout + SettingsPage). SettingsPage must be able to trigger Layout's refetch after disconnect.
   - Recommendation: Start with a Context provider wrapping `<Layout>` — simplest React-idiomatic pattern, no third-party state lib. Context value exposes `{ status, refetch, isLoading }`.

4. **Should the gear icon be visible in all tabs, or only on desktop-wide viewports?**
   - What we know: Current Layout header is single-row with "Vigil" brand + "Sign out" on the right. Adding one small icon left of Sign Out fits comfortably.
   - Recommendation: Visible at all viewports. Mobile gear icon + dot is the primary notification mechanism (per CONTEXT.md specifics).

## Sources

### Primary (HIGH confidence)
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/.planning/phases/81-pwa-settings-google-oauth-ui/81-CONTEXT.md` — User decisions (locked)
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/.planning/phases/79-gmail-oauth-server-foundation/79-CONTEXT.md` — Upstream server decisions
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-pwa/package.json` — Pinned versions
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-pwa/src/App.tsx` — Route table
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-pwa/src/components/Layout.tsx` — Nav structure
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-pwa/src/components/OfflineBanner.tsx` — Banner template
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-pwa/src/pages/AuthPage.tsx` — Dark-theme card reference
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-pwa/src/api/client.ts` — API client pattern
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-pwa/src/hooks/useWorkOrders.ts` — Canonical fetch hook pattern
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-pwa/vite.config.ts` — PWA SW config
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/routes/calendar-auth.ts` — OAuth route to be updated
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/index.ts` — Route registration + auth bypass branch
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/.planning/ROADMAP.md` §Phase 81 — Success criteria
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/.planning/REQUIREMENTS.md` §OAuth — Req IDs
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/.planning/STATE.md` — Blockers/concerns
- `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/.planning/config.json` — Workflow config (deploy_targets: vigil-core)

### Secondary (MEDIUM confidence)
- React Router v7 docs — `useSearchParams` import path from `'react-router'` in SPA mode
- React Testing Library v16 release notes — React 19 support

### Tertiary (LOW confidence)
- None — all claims in this research were anchored to read files or official release notes.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified in `package.json`
- Architecture: HIGH — patterns confirmed in existing hook/component files
- Pitfalls: HIGH — derived from observed code + explicit CONTEXT.md decisions
- Server-side change: HIGH — exact file + line numbers located
- Validation: MEDIUM — no test framework currently present; adding one is a Wave 0 decision
- iOS PWA standalone behavior: MEDIUM — iOS Safari PWA quirks are notoriously under-documented; real-device testing is the only authoritative signal (STATE.md flags this too)

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (30 days — stable stack, fast-moving only if Phase 79 implementation diverges from its CONTEXT.md)
