# Phase 63: PWA Foundation — Research

**Researched:** 2026-04-12
**Domain:** React/Vite PWA, Vercel deployment, service workers, CORS
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** React + Vite + TypeScript — React (not Preact, not vanilla), Vite as build tool, TypeScript throughout
- **D-02:** Vercel deployment at app.vigilhub.io — separate Vercel project pointing to `vigil-pwa/` subdirectory; free tier; CORS already configured on vigil-core
- **D-03:** API key paste + localStorage auth — simple text field on first visit, key stored in localStorage, validated by calling an authenticated endpoint; no sessions/OAuth/cookies
- **D-04:** `vigil-pwa/` directory at repo root — alongside `vigil-core/`, own package.json/vite.config.ts/tsconfig.json; Vercel Root Directory = `vigil-pwa/`

### Claude's Discretion

- CSS framework choice (Tailwind vs plain CSS) for responsive layout
- Service worker strategy implementation details
- Component architecture within the defined directory structure

### Deferred Ideas (OUT OF SCOPE)

- Voice capture (PWA-F01)
- Photo upload (PWA-F02)
- Push notifications (PWA-F03)
- Full offline data access (PWA-F04)
- Multi-user auth / OAuth
- Real-time sync / WebSocket
- Replace Mac SwiftUI dashboard
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PWA-01 | User can access app.vigilhub.io and authenticate with Vigil API key | API key validation pattern, localStorage auth, CORS confirmation |
| PWA-02 | Responsive on phone, tablet, and desktop | Tailwind CSS v4 responsive utilities, mobile-first layout approach |
| PWA-03 | Installable as standalone app via "Add to Home Screen" | vite-plugin-pwa manifest config, icon requirements, display:standalone |
| PWA-04 | Offline indicator when network unavailable | navigator.onLine + online/offline events, useOnlineStatus hook pattern |
</phase_requirements>

---

## Summary

This phase scaffolds a React/Vite/TypeScript PWA at `vigil-pwa/` in the repo root, deployed to Vercel with Root Directory set to `vigil-pwa/`. The stack is well-understood and all component versions are current as of April 2026. The three primary concerns are: (1) correct vite-plugin-pwa configuration for standalone installability, (2) a `vercel.json` rewrite rule so React Router deep-links work on refresh, and (3) confirming that `GET /v1/health` is unauthenticated (it is — bearer auth is skipped for that path), which means the PWA cannot use `/v1/health` to validate an API key and must call an authenticated endpoint like `GET /v1/summary` instead.

The existing vigil-core CORS configuration reads `CORS_ORIGINS` from the environment. Currently, if that env var is unset Railway defaults to wildcard `*`. Adding `https://app.vigilhub.io` to Railway's `CORS_ORIGINS` env var is a one-line change that unlocks production. During development, the Vite dev server can proxy to api.vigilhub.io, sidestepping CORS entirely.

Tailwind CSS v4 with `@tailwindcss/vite` is recommended over plain CSS. The v4 plugin requires zero config files — just `@import "tailwindcss"` in the entry CSS. This eliminates configuration drift and gives instant responsive utilities for the mobile/tablet/desktop requirement.

**Primary recommendation:** Use vite-plugin-pwa 1.2.0 with `generateSW` strategy, Tailwind CSS v4, React Router v7 declarative mode, and a `vercel.json` with a catch-all rewrite to `/`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite | 8.0.8 | Build tool and dev server | Locked in D-01; fastest HMR; already used in G2 plugin |
| @vitejs/plugin-react | 6.0.1 | React Fast Refresh + JSX transform | Official React plugin for Vite |
| react | 19.2.5 | UI component model | Locked in D-01 |
| react-dom | 19.2.5 | DOM renderer | Paired with react |
| typescript | 6.0.2 | Type safety | Locked in D-01 |
| vite-plugin-pwa | 1.2.0 | Service worker + manifest generation | Zero-config PWA for Vite; Workbox-backed |
| workbox-window | 7.4.0 | SW lifecycle events in browser | Required peer dep of vite-plugin-pwa |
| react-router | 7.14.0 | SPA client-side routing | Standard for React SPAs; v7 declarative mode is minimal overhead |
| tailwindcss | 4.2.2 | Responsive utility CSS | v4 Vite plugin requires zero config; covers PWA-02 in one pass |
| @tailwindcss/vite | 4.2.2 | Vite integration for Tailwind v4 | First-party Vite plugin; replaces PostCSS approach |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vite-pwa/assets-generator | 1.0.2 | Generate 192×192 and 512×512 icons from source SVG | Wave 0 — need icons before PWA is installable |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tailwind CSS v4 | Plain CSS / CSS Modules | Plain CSS is viable but requires hand-writing all responsive breakpoints; Tailwind v4 is faster for Phase 64+ UI work |
| React Router v7 declarative | React Router v7 data mode | Data mode adds loaders/actions; overkill for Phase 63 shell — upgrade in later phases if needed |
| vite-plugin-pwa generateSW | injectManifest | injectManifest only needed for custom SW logic (push, background sync); generateSW is correct for offline shell + indicator |

**Installation:**
```bash
cd vigil-pwa
npm install react react-dom react-router
npm install -D vite @vitejs/plugin-react typescript vite-plugin-pwa workbox-window tailwindcss @tailwindcss/vite @vite-pwa/assets-generator
```

**Version verification:** All versions above confirmed against npm registry on 2026-04-12. [VERIFIED: npm registry]

---

## Architecture Patterns

### Recommended Project Structure

```
vigil-pwa/
  package.json
  vite.config.ts
  tsconfig.json
  vercel.json           # SPA rewrite rule + headers
  index.html            # PWA entry: viewport, theme-color, apple-touch-icon
  public/
    manifest.webmanifest
    pwa-192x192.png     # Required for installability
    pwa-512x512.png     # Required for installability
    apple-touch-icon.png  # 180×180 for iOS
    favicon.ico
  src/
    main.tsx            # BrowserRouter entry point
    App.tsx             # Routes definition
    index.css           # @import "tailwindcss"
    api/
      client.ts         # fetch wrapper: reads key from localStorage, adds Authorization header
      vigil.ts          # typed API methods (getHealth, getSummary, etc.)
    components/
      OfflineBanner.tsx # Online/offline indicator (PWA-04)
      Layout.tsx        # Shell: nav, main, footer
    hooks/
      useOnlineStatus.ts  # navigator.onLine + event listeners
    pages/
      AuthPage.tsx      # API key entry form (PWA-01)
      DashboardPage.tsx # Placeholder for Phase 64+
```

### Pattern 1: vite.config.ts with PWA

```typescript
// Source: https://vite-pwa-org.netlify.app/guide/
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Vigil Dashboard',
        short_name: 'Vigil',
        description: 'Vigil ambient AI dashboard',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
})
```
[CITED: https://vite-pwa-org.netlify.app/guide/]

### Pattern 2: React Router declarative mode (SPA)

```tsx
// Source: https://reactrouter.com/start/modes
// main.tsx
import { BrowserRouter } from 'react-router'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)

// App.tsx
import { Routes, Route } from 'react-router'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import Layout from './components/Layout'

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/*" element={<Layout><DashboardPage /></Layout>} />
    </Routes>
  )
}
```
[CITED: https://reactrouter.com/start/modes]

### Pattern 3: Offline indicator hook

```typescript
// hooks/useOnlineStatus.ts
// Source: MDN Web Docs — online/offline events
import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
```
[CITED: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation]

### Pattern 4: API key validation (IMPORTANT — health endpoint is public)

`GET /v1/health` is explicitly **excluded from bearer auth** in vigil-core:
```typescript
// vigil-core/src/index.ts line 61 (VERIFIED)
if (c.req.path === "/v1/health") return next();
```

**Therefore, use `GET /v1/summary` to validate the key.** A 200 response confirms the key works; a 401 confirms it does not.

```typescript
// api/client.ts
export async function validateApiKey(apiBase: string, key: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/v1/summary`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    return res.ok
  } catch {
    return false
  }
}
```
[VERIFIED: vigil-core/src/index.ts lines 57-62]

### Pattern 5: Vercel SPA rewrite (vercel.json)

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

Place this file at `vigil-pwa/vercel.json`. Without it, direct navigation to any route other than `/` returns Vercel 404.
[CITED: https://community.vercel.com/t/react-router-and-vite-app-404-error-for-routes-on-vercel-deployment/2920]

### Pattern 6: Tailwind CSS v4 entry CSS

```css
/* src/index.css */
@import "tailwindcss";
```

No `tailwind.config.js`, no PostCSS config, no content globs needed for v4. [CITED: https://tailwindcss.com/blog/tailwindcss-v4]

### Anti-Patterns to Avoid

- **Using `/v1/health` for key validation:** It returns 200 for *everyone*, even without an API key. Always call an authenticated endpoint to validate.
- **Calling `navigator.onLine` alone without events:** `navigator.onLine` is unreliable on its own — it can report `true` on "captive portal" networks. Pair it with `online`/`offline` events for reactivity.
- **Skipping the `vercel.json` rewrite:** Every refresh on a non-root route returns 404 on Vercel without it.
- **Using injectManifest strategy:** Unnecessary complexity for this phase. `generateSW` handles the offline shell automatically.
- **Forgetting `display: "standalone"` in manifest:** Without it, the app does not launch as a standalone app — the browser chrome stays visible. PWA-03 fails silently.
- **Omitting both 192×192 and 512×512 icons:** Chrome requires both sizes for the "Add to Home Screen" prompt. Omitting either suppresses install.
- **Committing API key to source:** Key must only live in `localStorage`. Never hardcode or include in environment variables baked into the Vite build.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service worker generation + precaching | Custom sw.js | vite-plugin-pwa (generateSW) | Workbox handles cache versioning, activation, precache manifest updates — hand-rolled SWs get stuck on stale cache silently |
| Icon generation | Manual Photoshop/Figma export | @vite-pwa/assets-generator | Generates all required sizes (192, 512, apple-touch-icon 180, favicon) from one source SVG |
| Responsive breakpoints | Custom CSS media queries | Tailwind CSS v4 | sm/md/lg/xl utilities; no configuration needed |
| Online/offline state | Polling `navigator.onLine` in setInterval | `online`/`offline` window events | Browser fires events immediately; polling adds latency and wastes CPU |

**Key insight:** Service workers are deceptively complex — cache versioning, update lifecycle, and install/activate events have subtle race conditions. Workbox (via vite-plugin-pwa) has solved these for thousands of production apps.

---

## Common Pitfalls

### Pitfall 1: Health endpoint does not validate API key

**What goes wrong:** Developer calls `GET /v1/health` to verify the user's API key. Returns 200 whether the key is valid or not because `bearerAuth` is explicitly skipped for that path.

**Why it happens:** vigil-core exempts `/v1/health` from authentication so monitoring tools can poll without credentials.

**How to avoid:** Call `GET /v1/summary` (or any other authenticated endpoint) for key validation. 200 = valid, 401 = invalid.

**Warning signs:** Auth page shows "key valid" for arbitrary strings.

---

### Pitfall 2: CORS wildcard vs explicit origins

**What goes wrong:** vigil-core defaults to `origin: "*"` when `CORS_ORIGINS` env var is not set. This is fine for testing but some browsers block credentials in CORS requests with wildcard origins if you later add cookies or `credentials: include`.

**Why it happens:** The Railway env var `CORS_ORIGINS` is not yet set.

**How to avoid:** Before deploying to production, add `CORS_ORIGINS=https://app.vigilhub.io` to Railway environment variables. The vigil-core code already reads and applies this correctly.

**Warning signs:** API calls work in dev but fail in production; browser console shows CORS error.

---

### Pitfall 3: PWA install prompt never appears

**What goes wrong:** App is not installable — the browser's "Add to Home Screen" prompt never shows and `beforeinstallprompt` never fires.

**Why it happens:** Missing one of: `display: "standalone"` in manifest, both required icon sizes (192×192 and 512×512), HTTPS, or the `manifest.webmanifest` is served without the `application/manifest+json` MIME type.

**How to avoid:** Use vite-plugin-pwa which handles MIME type automatically. Run Chrome DevTools → Application → Manifest to check installability criteria before marking PWA-03 done.

**Warning signs:** Chrome DevTools Application tab shows manifest errors; no install prompt on mobile.

---

### Pitfall 4: SPA deep-link 404 on Vercel

**What goes wrong:** Navigating directly to `https://app.vigilhub.io/dashboard` returns Vercel's 404 page instead of the React app.

**Why it happens:** Vercel serves static files. A request for `/dashboard` has no corresponding file in the build output.

**How to avoid:** Include `vercel.json` with `{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }` in `vigil-pwa/`.

**Warning signs:** Works fine in development (`vite preview` handles this automatically) but breaks after first deploy.

---

### Pitfall 5: Service worker not updating after deploy

**What goes wrong:** Users see stale content after a new deployment because the browser serves the cached shell.

**Why it happens:** `registerType: 'autoUpdate'` in vite-plugin-pwa handles this automatically — but only if the new build hash changes. If the vite build output is somehow identical, the SW won't detect a new version.

**How to avoid:** Use `registerType: 'autoUpdate'` (default). For Phase 63, this is enough. If finer control is needed in later phases, add the `useRegisterSW()` React hook from `virtual:pwa-register/react` to show a "reload to update" prompt.

---

## Code Examples

### index.html entry point (PWA requirements)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f172a" />
    <meta name="description" content="Vigil ambient AI dashboard" />
    <link rel="icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>Vigil</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
[CITED: https://vite-pwa-org.netlify.app/guide/pwa-minimal-requirements.html]

### Responsive layout with Tailwind v4

```tsx
// components/Layout.tsx
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="font-semibold text-lg">Vigil</span>
        <OfflineBanner />
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
```

### OfflineBanner component

```tsx
// components/OfflineBanner.tsx
import { useOnlineStatus } from '../hooks/useOnlineStatus'

export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  if (isOnline) return null
  return (
    <div className="fixed top-0 left-0 right-0 bg-amber-600 text-white text-sm text-center py-1 z-50">
      No internet connection
    </div>
  )
}
```

### LocalStorage auth pattern

```typescript
// api/client.ts
const STORAGE_KEY = 'vigil_api_key'
const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://api.vigilhub.io'

export const getStoredKey = (): string | null => localStorage.getItem(STORAGE_KEY)
export const storeKey = (key: string): void => localStorage.setItem(STORAGE_KEY, key)
export const clearKey = (): void => localStorage.removeItem(STORAGE_KEY)

export async function vigilFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getStoredKey()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init?.headers },
  })
}

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v1/summary`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    return res.ok
  } catch {
    return false
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 with tailwind.config.js and PostCSS | Tailwind v4 with `@tailwindcss/vite`, no config files | Tailwind v4.0 (Jan 2025) | Zero config; 100x faster incremental builds |
| React Router v6 `<BrowserRouter>` + `<Route>` | React Router v7 same API, new `react-router` package name | React Router v7 (Nov 2024) | `react-router-dom` merged into `react-router`; import from `react-router` directly |
| vite-plugin-pwa 0.x with Vite 4/5 | vite-plugin-pwa 1.x with Vite 6/7 | vite-plugin-pwa 1.0 (2025) | Supports Vite 7 peer dep; same API surface |

**Deprecated/outdated:**
- `react-router-dom` as separate package: In v7, import everything from `react-router` directly
- `tailwind.config.js` / PostCSS setup: v4 replaces this with the `@tailwindcss/vite` plugin and `@import "tailwindcss"` in CSS
- Manual `sw.js` in `public/`: vite-plugin-pwa generates this at build time; hand-written SW in `public/` conflicts with plugin output

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `app.vigilhub.io` DNS is not yet configured; it needs a CNAME to Vercel before PWA-01 can be verified | Summary | Delay in production smoke test; dev/preview URLs work without it |
| A2 | Railway's `CORS_ORIGINS` env var is currently unset (wildcard `*` is the default) | Common Pitfalls — Pitfall 2 | If it was explicitly set to something else, adding `app.vigilhub.io` requires knowing the existing value |
| A3 | `GET /v1/summary` is a suitable and lightweight key-validation endpoint | Pattern 4 | If summary is slow (large DB), could add latency to auth flow; could use any other authenticated GET endpoint |

---

## Open Questions (RESOLVED)

1. **Icon source asset** — RESOLVED: No existing logo in repo. Plan 63-01 Task 1 creates a placeholder favicon.svg and generates placeholder 192x192 + 512x512 PNGs. Replace with real branding later.

2. **Railway CORS_ORIGINS current value** — RESOLVED: Plan 63-02 user_setup handles explicit CORS_ORIGINS set regardless of current value. Check Railway dashboard during deployment and set/append as needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite build, npm | ✓ | v25.2.1 | — |
| npm | Package management | ✓ | 11.11.0 | — |
| Vercel CLI | Optional local preview | — | — | Use Vercel dashboard deploy |
| app.vigilhub.io DNS | Production smoke test | [ASSUMED] not yet configured | — | Use Vercel preview URL for PWA-01 validation |
| api.vigilhub.io | API calls | ✓ | Live on Railway | — |

[VERIFIED: node --version, npm --version on 2026-04-12]

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in config.json — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected in `vigil-pwa/` (new directory) |
| Config file | None — Wave 0 gap |
| Quick run command | `npm test` (to be configured) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PWA-01 | API key stored and auth succeeds | unit | `npm test -- --testPathPattern=auth` | ❌ Wave 0 |
| PWA-02 | Responsive layout renders | smoke (visual) | Manual — DevTools responsive mode | manual-only |
| PWA-03 | Manifest valid + icons present | smoke | Chrome DevTools Application tab + Lighthouse PWA audit | manual-only |
| PWA-04 | Offline banner appears when offline | smoke | Chrome DevTools → Network → Offline toggle | manual-only |

**Note:** PWA-01 is the only requirement with a pure unit-testable code path (localStorage read/write, fetch mock for key validation). PWA-02/03/04 require browser integration and are best verified manually in Chrome DevTools during the verification wave.

### Sampling Rate

- **Per task commit:** No automated test suite exists yet for `vigil-pwa/`
- **Per wave merge:** Manual smoke test in Chrome with DevTools open
- **Phase gate:** Manual Lighthouse PWA audit score + Chrome "Add to Home Screen" prompt appears before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vigil-pwa/` directory does not yet exist — entire scaffold is Wave 0
- [ ] No icon assets exist (pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png) — required before installability can be tested

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | API key in localStorage; validated against authenticated endpoint |
| V3 Session Management | no | No sessions; localStorage only |
| V4 Access Control | no | Single-user; no role model |
| V5 Input Validation | yes | API key input: trim whitespace, validate non-empty before calling API |
| V6 Cryptography | no | No crypto — API key is opaque bearer token |

### Known Threat Patterns for React SPA + localStorage Auth

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS reading localStorage API key | Information Disclosure | Sanitize all dynamic content; do not use `dangerouslySetInnerHTML`; React's default JSX escaping covers most cases |
| API key leaked in browser history / network tab | Information Disclosure | Key is only sent as `Authorization: Bearer` header, not in URL params — correct by design |
| CORS misconfiguration allowing unauthorized origins | Elevation of Privilege | Set explicit `CORS_ORIGINS` on Railway for production; avoid wildcard in prod |
| Service worker serving stale authenticated data | Information Disclosure | Phase 63 does not cache API responses — only static shell assets. Safe. |

---

## Sources

### Primary (HIGH confidence)
- npm registry — vite, vite-plugin-pwa, react, react-router, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite versions verified 2026-04-12
- vigil-core/src/index.ts (lines 57-62) — CORS middleware and health route auth exemption confirmed in-repo
- https://vite-pwa-org.netlify.app/guide/ — vite-plugin-pwa configuration, manifest requirements
- https://vite-pwa-org.netlify.app/guide/pwa-minimal-requirements.html — required manifest fields and icon sizes
- https://reactrouter.com/start/modes — React Router v7 declarative vs data vs framework modes

### Secondary (MEDIUM confidence)
- https://vercel.com/docs/monorepos — Root Directory configuration for monorepo subdirectory
- https://vercel.com/docs/deployments/configure-a-build#root-directory — Root Directory setting steps
- https://tailwindcss.com/blog/tailwindcss-v4 — v4 Vite plugin zero-config approach confirmed
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation — online/offline events pattern

### Tertiary (LOW confidence)
- Multiple Vercel community posts confirming the `vercel.json` rewrite pattern for SPA routing (cross-verified: multiple independent sources agree on the same config)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry on research date
- Architecture: HIGH — patterns drawn from official vite-plugin-pwa, React Router v7, and Vercel docs
- CORS analysis: HIGH — verified directly in vigil-core source code
- Health endpoint gotcha: HIGH — verified directly in vigil-core/src/index.ts
- Pitfalls: MEDIUM-HIGH — most derived from official docs + well-corroborated community reports

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable libraries; Vite/Tailwind move fast but APIs are stable at major versions)
