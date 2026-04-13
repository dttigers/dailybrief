# Phase 81: PWA Settings & Google OAuth UI - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a PWA Settings page (`/settings`) that lets the user connect and disconnect their Google account, see per-scope authorization status (Calendar, Gmail), and trigger re-authorization when a scope is missing. Includes a gear icon entry point in the header with a status dot, handling of the OAuth callback query params, and a server-side redirect update so the callback lands on `/settings`. No API key management, no app info, no other settings content — Google OAuth UI only.

</domain>

<decisions>
## Implementation Decisions

### Settings Page Placement & Nav
- **D-01:** Add a new route `/settings` rendered by a new `SettingsPage.tsx` component in `vigil-pwa/src/pages/`. Not a tab in the primary tab bar.
- **D-02:** Entry point is a **gear (cog) icon button** in the top nav bar of `Layout.tsx`, placed to the left of the existing "Sign out" button. Sign Out stays in the header — it is NOT moved into Settings.
- **D-03:** The gear icon shows a **red status dot** when any Google scope is `needs_auth` or no token exists. Dot disappears when both scopes are `connected`. Status is fetched from `GET /v1/google/status` (Phase 79) and reused across the Layout/Settings boundary — decide during planning whether to hoist into a shared hook or query key.

### Connection Status Display
- **D-04:** Single "Google" card on the Settings page. Card shows the connected account identifier (email if stored, otherwise a generic "Google account") and a Disconnect button at the top-right. Below it, two per-scope rows: **Calendar** and **Gmail**, each with a status dot (connected / needs re-auth / not connected) and — only when needed — a per-row "Re-connect" button.
- **D-05:** Empty state (no token stored): same card shell, "Not connected" status, fine-print line listing the scopes to be granted ("Calendar read, Gmail read"), and a single primary "Connect Google" button.
- **D-06:** Disconnect uses **inline confirmation** — clicking "Disconnect" transforms the button into "Confirm disconnect?" / "Cancel" inline. No modal, no native `confirm()`.
- **D-07:** Status shape consumed from Phase 79's `/v1/google/status`: `{ calendar: 'connected'|'needs_auth', gmail: 'connected'|'needs_auth' }`. Missing/404 response → treat as fully disconnected.

### OAuth Flow Trigger & Callback UX
- **D-08:** Connect / Re-connect uses a **full-page redirect** to the server: `window.location.href = \`${API_BASE}/auth/google\``. No popup window — popups break iOS standalone PWA mode.
- **D-09:** Re-connect (scope gap recovery) hits the **same** `/auth/google` endpoint. Phase 79 D-09 already forces `prompt=consent` + both scopes every time, so no dedicated reauth endpoint is needed.
- **D-10:** **Update the vigil-core callback redirect target in this phase.** Change the server redirect from `PWA_URL?google_connected=true` (Phase 79 D-07) to `PWA_URL/settings?google_connected=true`. Error path becomes `PWA_URL/settings?google_error=...`. This is a small server change included in Phase 81 scope and supersedes the last sentence of Phase 79 D-07.
- **D-11:** SettingsPage reads `?google_connected=true` / `?google_error=...` from `searchParams` on mount. On success: refetch `/v1/google/status` + show an inline success banner. On error: show an inline error banner with the decoded message. In both cases, call `history.replaceState` to strip the query string so a reload does not replay the toast.
- **D-12:** Notification mechanism is an **inline dismissible banner** on SettingsPage (styled like the existing `OfflineBanner`) — not a toast library dependency. Auto-dismisses after 5s or on user dismiss. No new npm dep.

### Settings Page Scope (this phase)
- **D-13:** Phase 81 ships **only** the Google integration card. No Vigil API key display/rotate, no app info/version section, no "Clear cache" button.
- **D-14:** Sign Out stays in the Layout header. Settings page does NOT duplicate a Sign Out action.

### Claude's Discretion
- Exact Tailwind styling, spacing, and badge colors (follow existing dark theme: `bg-gray-900`, `text-gray-50`, `text-teal-600` accents from AuthPage / Layout)
- Loading skeletons vs spinners while status is fetching
- React Query / SWR vs plain fetch for status polling — match whatever pattern other PWA pages use
- Exact copy for error messages (beyond what the server returns)
- Whether to show the account email (depends on whether Phase 79's optional "store account email in token row" discretion item landed)
- Test structure (component tests for SettingsPage states; integration test for callback param handling)
- Whether `handleSubmit`-style redirect uses a helper (`redirectToGoogleAuth()`) or inline `window.location.href` call

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 79 Server Foundation (upstream)
- `.planning/phases/79-gmail-oauth-server-foundation/79-CONTEXT.md` — Full upstream decisions. Phase 81 supersedes D-07's redirect target (see D-10 above).
- `vigil-core/src/routes/calendar-auth.ts` — Existing OAuth route (will be renamed to `google-auth.ts` in Phase 79, may already be renamed by the time 81 runs)
- `vigil-core/src/index.ts` §~72 — Route registration point; the callback redirect target change lives here or in the google-auth route

### PWA Integration Points
- `vigil-pwa/src/App.tsx` — Route table; add `<Route path="/settings" element={<SettingsPage />} />` inside the authenticated `<Routes>` block
- `vigil-pwa/src/components/Layout.tsx` — Header nav; add gear icon button with status dot next to Sign Out button
- `vigil-pwa/src/components/OfflineBanner.tsx` — Reference pattern for the inline success/error banner on SettingsPage (D-12)
- `vigil-pwa/src/pages/AuthPage.tsx` — Reference for form-card dark-theme styling (background, inputs, button colors)
- `vigil-pwa/src/api/client.ts` — API client; add a `getGoogleStatus()` / `disconnectGoogle()` method here

### Requirements
- `.planning/REQUIREMENTS.md` §OAUTH-01 (connect), §OAUTH-02 (disconnect), §OAUTH-03 (display status)

### Roadmap
- `.planning/ROADMAP.md` §"Phase 81: PWA Settings & Google OAuth UI" — Success criteria (5 items)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OfflineBanner.tsx` — styling template for the SettingsPage success/error banner (D-12)
- `AuthPage.tsx` — dark-theme card pattern, error-state styling, loading button states
- `Layout.tsx` — nav bar structure; gear icon button slots in alongside "Sign out" button
- `api/client.ts` — existing `getStoredKey()` / `clearKey()` / `validateApiKey()` pattern; extend with `getGoogleStatus()` and `disconnectGoogle()` following the same shape

### Established Patterns
- **Tailwind dark theme:** `bg-gray-900`, `text-gray-50`, `text-gray-400` secondary, `text-teal-600` accent, `border-gray-900/40` dividers
- **React Router v7** (not v6): imports from `'react-router'` (not `'react-router-dom'`); uses `<Routes>`, `<Route>`, `useNavigate`, `useLocation`
- **Authenticated routing:** Routes live inside the authenticated `<Routes>` branch of App.tsx (the one wrapped in `<Layout>`)
- **API auth:** Every PWA request carries the stored Vigil API key; `getGoogleStatus()` must use the same auth helper as existing client methods

### Integration Points
- **New route** — `/settings` in `App.tsx`
- **Nav update** — gear icon + status dot in `Layout.tsx`
- **Server callback URL change** — `vigil-core/src/routes/google-auth.ts` (or still `calendar-auth.ts`) callback redirect: append `/settings` path to `PWA_URL`
- **API client** — two new methods on `vigil-pwa/src/api/client.ts`: `getGoogleStatus()`, `disconnectGoogle()`
- **Disconnect endpoint** — confirm in planning whether Phase 79 shipped a `DELETE /v1/google/tokens` (or similar). If not, include it in Phase 81 server work.

### Constraints
- iOS standalone PWA mode — no popups; full-page redirects only (D-08)
- OAuth state JWT has 5-min expiry (Phase 79 D-02) — if user takes too long on Google's consent screen, callback returns an error; UI must surface it cleanly (D-11)

</code_context>

<specifics>
## Specific Ideas

- The red status dot on the gear icon is the primary mechanism for surfacing "you need to reconnect Gmail" — the user should not have to discover scope-gap state by the daily brief failing silently.
- Single Google account (Phase 79 D-05) — no multi-account UI; the card represents the one Google connection.
- Work-order email forwarding flow: user forwards work-order emails from their separate work-order Gmail into their personal Gmail. The personal Gmail is what's connected. UI does not need to explain this — it's just the one Google account the user connects.
- `gmail.readonly` is a restricted scope (not sensitive) — the consent screen will show both scopes together; UI copy should not promise "Vigil only reads Calendar."

</specifics>

<deferred>
## Deferred Ideas

- **Vigil API key management on Settings** (display masked key, rotate button) — currently the user signs out + back in to change keys. Could be a small follow-up phase once Settings exists.
- **App info / debug section** (PWA version, vigil-core base URL, "Clear cache" button) — real debug value given the Anthropic-key-sprawl memory, but not in scope for OAuth UI. Small follow-up phase candidate.
- **Toast notification library** (sonner, react-hot-toast) — deferred in favor of inline banner (D-12). Revisit when a second feature needs non-banner notifications.
- **Separate `/auth/google/callback` route in PWA** — rejected in favor of server-side redirect straight to `/settings` (D-10). Reopen only if post-callback logic grows beyond a query-param read.
- **Incremental / per-scope authorization flow** — rejected at Phase 79 (D-09). UI assumes both scopes granted together.

</deferred>

---

*Phase: 81-pwa-settings-google-oauth-ui*
*Context gathered: 2026-04-13*
