# Architecture Research — v3.5 Integration Points

**Domain:** Multi-surface ambient AI platform (Vigil)
**Researched:** 2026-04-19
**Confidence:** HIGH — all findings from live codebase inspection

---

## System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Clients (5 surfaces)                           │
│  ┌──────────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────────┐ │
│  │ Mac App      │  │ PWA      │  │ G2 Plugin  │  │ Browser Ext.     │ │
│  │ (Swift/SPM)  │  │ React/   │  │ Vite/TS    │  │ Chrome + Safari  │ │
│  │ DailyBrief   │  │ Vite/TS  │  │ Even SDK   │  │ MV3 popup-only   │ │
│  │ Monitor      │  │ Vercel   │  │ Even Store │  │ no background SW │ │
│  └──────┬───────┘  └────┬─────┘  └─────┬──────┘  └────────┬─────────┘ │
└─────────┼───────────────┼──────────────┼───────────────────┼───────────┘
          │               │              │                   │
          │         HTTPS Bearer / JWT   │                   │
          └───────────────┴──────────────┴───────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │     Vigil Core API          │
                    │  Node.js / Hono / TypeScript│
                    │  Railway — api.vigilhub.io  │
                    │  25+ REST endpoints /v1/*   │
                    │  bearerAuth 3-path dispatch │
                    │    vk_ → api_keys table     │
                    │    JWT → jose.jwtVerify      │
                    │    else → 401               │
                    └─────────────┬──────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   PostgreSQL (Railway)      │
                    │   Drizzle ORM + migrations  │
                    │   tsvector FTS              │
                    │   users + 11 scoped tables  │
                    └────────────────────────────┘
```

---

## PostHog Analytics Integration Points

### Initialization Location in Vigil Core

**Decision: bootstrap singleton in `vigil-core/src/index.ts`, not middleware.**

Rationale: `index.ts` is the single startup file. Initializing `posthog-node` there (before `serve()` is called) guarantees the client is ready before any route handles a request. Middleware would create the client on every import or require complex singleton plumbing.

```
index.ts (startup)
  → import posthog from './analytics/posthog.js'
  → posthog.init()                         // singleton initialized once
  → app = new Hono()
  → app.use('*', bearerAuth middleware)    // userId set here via c.set('userId', ...)
  → routes mount
```

**Per-user identification chain:**
```
POST /v1/thoughts
  → bearerAuth runs → c.set('userId', row.userId)
  → route handler reads c.get('userId')
  → posthog.capture({ distinctId: String(userId), event: 'thought_created', ... })
```

The `userId` is available on every protected route via `c.get('userId')` (declared in `auth.ts` via `ContextVariableMap`). No separate identify step is needed per request — PostHog uses `distinctId` on each event. A one-time `posthog.identify()` call can be emitted at login (POST /v1/auth/login success path) with user properties (email).

**New file: `vigil-core/src/analytics/posthog.ts`**
- Exports: `captureEvent(userId, event, props)`, `captureError(userId, error, context)`
- Uses `posthog-node` package (server SDK)
- Init reads `POSTHOG_API_KEY` and `POSTHOG_HOST` env vars
- When env vars absent: no-op shim (safe for local dev with no key)

**Error tracking wiring in Vigil Core:**
- Hono has no built-in error boundary. Add a `app.onError()` handler in `index.ts` after all routes mount. This catches unhandled exceptions thrown by route handlers.
- Also add `process.on('uncaughtException', ...)` and `process.on('unhandledRejection', ...)` in `index.ts` alongside the existing SIGTERM/SIGINT handlers.

### PWA Error Boundaries

**Current state:** No React error boundaries exist. `App.tsx` renders `<Routes>` directly under `<StrictMode>`.

**Integration point:** Wrap the authenticated layout subtree in a new `ErrorBoundary` class component. React class component `componentDidCatch` is the only place React errors can be caught. The boundary should call `posthog.capture('frontend_error', ...)` via `posthog-js`.

**Placement:** Between `<ToastProvider>` and `<Layout>` in `App.tsx`:
```
<GoogleStatusProvider>
  <ToastProvider>
    <ErrorBoundary>       <- NEW
      <Layout>
        <Routes>...</Routes>
      </Layout>
    </ErrorBoundary>
    <ToastHost />
  </ToastProvider>
</GoogleStatusProvider>
```

**PWA init:** `posthog-js` initializes in `vigil-pwa/src/main.tsx` (before `createRoot`). It receives anonymous events until the user loads an authenticated session, then `posthog.identify(userId)` can be called after a successful API response includes the userId.

**Problem:** The PWA currently stores the raw bearer token (vk_ key or JWT string) in `localStorage` as `vigil_api_key`. The decoded userId is NOT stored client-side. For `posthog.identify()`, either:
1. Decode the JWT client-side (if token is a JWT) — `jose` decodes without verification in browser.
2. Add a `/v1/me` endpoint that returns `{ userId, email }` on valid auth.

Option 2 is cleaner and is needed anyway for the profile page (AUTH-07). Add it in v3.5 as part of AUTH-06 since the login flow needs to surface user info.

### Mac App / Swift — No PostHog SDK

**Finding:** There is no official PostHog Swift SDK for macOS menu bar apps that is production-ready as of 2026-04-19 without CocoaPods (which conflicts with SPM-only setup). `posthog-ios` exists but targets iOS/tvOS; the macOS support is beta.

**Recommendation:** Instrument the Mac app by calling a thin wrapper endpoint on Vigil Core instead of using a native SDK. Add `POST /v1/analytics/event` (bearer-authenticated, fire-and-forget) that proxies to PostHog server-side. This keeps the Mac app free of new Swift dependencies and routes all analytics through the single PostHog project key.

**New Vigil Core route:** `vigil-core/src/routes/analytics.ts` — thin POST handler, reads `{ event, properties }` from body, calls `captureEvent(userId, event, properties)`, returns `204`.

### G2 Plugin — Network Constraints

**Finding from codebase inspection:** The G2 plugin calls `fetch()` directly to `api.vigilhub.io`. The Even Hub SDK (`@evenrealities/even_hub_sdk` v0.0.9) does not appear to sandbox outbound HTTP. The plugin is a Vite/TypeScript bundle served to the Even G2 glasses via the Even app ecosystem.

**Confidence:** LOW — Even's sandboxing policy is not documented in the SDK and the behavior has not been empirically tested. The current plugin successfully calls `api.vigilhub.io` for data (confirmed by shipping v2.0), so outbound fetch works. PostHog can use the same pattern: call `posthog.capture()` from the bundle. However, if the bundle size is constrained (Even has a 512KB ehpk limit for plugins), adding `posthog-js` (~60KB minified) may hit limits.

**Recommendation:** Do not integrate PostHog directly in the G2 plugin. Instead, instrument the Vigil Core API endpoints the G2 plugin calls (summary, brief, affirmation) — those calls are already authenticated and the server-side PostHog client will fire on each API hit. G2 user events are thus captured server-side at zero plugin cost.

### Browser Extension — Content vs Background Script

**Current architecture:** Both Chrome and Safari extensions are popup-only MV3 with no background service worker and no content script. The `manifest.json` declares only `action.default_popup`. Events fire only when the popup is open.

**For event capture:** Use the popup script directly. `posthog-js` cannot be imported into an MV3 extension popup without bundling (since popup.js is a raw script, not a module). Instead, use the same thin-wrapper approach: when a thought is captured successfully, `fetch` the `/v1/analytics/event` endpoint alongside the `/v1/thoughts` POST. No PostHog SDK needed in the extension.

**Safari persistence issue (EXT-01):** The Safari extension requires the native wrapper app (`Vigil Capture.app`) to be running for the extension to remain enabled. On reboot, if the app is not in Login Items, Safari disables the extension. The fix is to add `Vigil Capture.app` to Login Items (macOS `SMLoginItemSetEnabled` or the newer `ServiceManagement.framework` API). The Xcode project already has `AppDelegate.swift` with a minimal implementation — add the Login Item registration there.

The extension's `chrome.storage.local` correctly persists the API key across popup opens. The "not surviving restart" bug is specifically the Safari extension being disabled by Safari, not a storage issue.

### PostHog Cloud vs Self-Hosted

**Recommendation: PostHog Cloud (free tier).**

Self-hosting PostHog on Railway adds a second Railway service with Postgres + Redis + ClickHouse-equivalent — significant operational overhead for a solo dev. PostHog Cloud free tier is 1M events/month. At current scale (1 user), Cloud is appropriate. Self-host only if data sovereignty becomes a requirement.

---

## G2 Resubmit Architecture

### Double-Tap Exit Dialogue Placement

**Current behavior (from `main.ts` and `navigation.ts`):**
- `DOUBLE_CLICK_EVENT` from the temple touchpad is handled in `handleNavEvent` in `navigation.ts`.
- On all screens: double-tap navigates to `Screen.HOME`.
- On `TASK_DETAIL`: double-tap navigates to `Screen.HOME`.
- There is no exit dialogue — double-tap is used for navigation, not exit.

**G2 lifecycle exit event:** The Even SDK fires `FOREGROUND_EXIT_EVENT` (via `sysEvent`) when the user presses the R1 ring button or the G2 OS exits the plugin. This is handled in `main.ts` (stops the refresh timer) but does not show a dialogue.

**Even store requirement:** The store reviewer requires a "press twice to exit" confirmation pattern. This means: on first double-tap on the home screen, show a "Press again to exit" confirmation screen. On second double-tap within a timeout, the plugin should signal exit (if the SDK provides an exit API) or navigate back.

**Integration point:** Add logic to `handleNavEvent` in `navigation.ts`. When `currentScreen === Screen.HOME` and `eventType === DOUBLE_CLICK_EVENT`, instead of re-navigating to HOME (currently a no-op), transition to a new `Screen.EXIT_CONFIRM` state. On the second double-tap within 3 seconds, call whatever Even SDK exit signal is available. The `Screen.EXIT_CONFIRM` is not in `SCREEN_ORDER` (not part of circular navigation), analogous to how `TASK_DETAIL` is handled.

**New screen file:** `vigil-g2-plugin/src/screens/exit-confirm.ts` — renders a simple text container: "Double-tap again to exit Vigil."

**Timeout reset:** If 3 seconds pass without a second double-tap, navigate back to `Screen.HOME`.

**Note on Even SDK exit API:** The SDK v0.0.9 does not expose an explicit `exitApp()` call in the public types (confirmed by package inspection). The exit confirmation dialogue may be the entire deliverable — demonstrating the pattern to the reviewer — without an actual programmatic exit call.

### Brand Colors in G2 Plugin

**Current state:** The G2 plugin targets a **greyscale** e-ink display (576x288 pixels). The `constants.ts` file defines only display geometry and container IDs — no color values. Screen builders in `src/screens/*.ts` build text-only containers using the Even Hub SDK's layout primitives, which render in grayscale.

**Finding:** There are no scattered hex color values in the G2 plugin source. The display is greyscale-only. "WebView brand compliance" requested by the store reviewer likely refers to the plugin's **WebView** (the HTML page rendered in the Even G2 app's native browser, distinct from the plugin's primary SDK-rendered display). The `index.html` at the Vite project root is the WebView entry point.

**Integration point:** `vigil-g2-plugin/index.html` — add Vigil brand colors as CSS custom properties mirroring `vigil-pwa/src/index.css` (`--color-teal-400: #1D9E75`, etc.) and the Inter typeface via Google Fonts or bundled font. This WebView is likely shown as a loading screen or settings page within the Even app.

**Brand token source of truth:** `vigil-pwa/src/index.css` `@theme` block. Copy the relevant CSS variables into a shared `brand.css` that both the PWA and G2 plugin WebView can reference, or duplicate the minimal set into `vigil-g2-plugin/index.html`.

### Screenshot Generation

**Current state:** No CI/CD screenshot automation exists. The `vigil-g2-plugin/dist/` folder contains the built bundle and a `vigil.ehpk` package. Screenshots are captured manually from the Even G2 simulator (Even Studio desktop app).

**Integration point:** Screenshots for the store submission live outside the codebase — they are uploaded directly to the Even developer portal. The repo does not store them. The task (G2-01) requires:
1. Running `npm run build:prod` in `vigil-g2-plugin/`
2. Loading the `.ehpk` in Even Studio simulator
3. Capturing screenshots of each screen at the required dimensions
4. Uploading screenshots to the portal

No code change is required for G2-01. It is a process task.

---

## PWA Login/Register UI (AUTH-06)

### Route Location

**Existing file to modify:** `vigil-pwa/src/pages/AuthPage.tsx`

**Current `AuthPage.tsx`:** Accepts only a `vk_` API key via a single password input. Has no email/password form. The backend endpoints `POST /v1/auth/register` and `POST /v1/auth/login` shipped in v3.4 are unused from the PWA.

**Decision:** Extend `AuthPage.tsx` to a two-tab layout: "Sign In" (email + password, returns JWT) and "API Key" (legacy `vk_` path preserved for vk_ clients). The seed-user claim flow is transparent — first login for the seed account's email claims ownership server-side.

**Router integration:** No router change needed. `/auth` already maps to `AuthPage` in `App.tsx`. The auth page gate in `App.tsx` is:
```typescript
const [isAuthenticated, setIsAuthenticated] = useState(() => getStoredKey() !== null)
```

### JWT Storage Decision

**Current:** `vk_` API key stored in `localStorage` as `vigil_api_key` via `storeKey()`.

**For JWTs:** Store the JWT string in the same `localStorage` slot via the existing `storeKey()` function. No new storage key needed. The `vigilFetch()` wrapper reads `vigil_api_key` and sends it as `Authorization: Bearer <value>`. The `bearerAuth` middleware's `looksLikeJwt()` branch handles JWT tokens — the three-part dot structure is detected automatically.

**Security tradeoff:** localStorage JWTs are XSS-vulnerable. For the current threat model (personal single-user tool, trusted domain, no PII beyond therapy notes already stored), this is acceptable. An `httpOnly` cookie approach would require CORS credential changes, same-site config, and a `/v1/auth/refresh` endpoint. Defer to v3.6.

### Auth State Management

**Pattern:** Keep existing `isAuthenticated` useState in `App.tsx`. The `handleAuthSuccess` callback is already wired. On successful `POST /v1/auth/login`, call `storeKey(jwt)` then `onAuthSuccess()`. No Zustand, no new React Context needed.

**userId for PostHog identify:** After storing the JWT, call `GET /v1/me` (new endpoint) to get `{ userId, email }`. Store userId in module scope in `api/client.ts` or call `posthog.identify(String(userId))` once at auth success. Do not store userId in localStorage separately — derive it on demand from `/v1/me`.

### Protected Route Wrapper

**Current:** All routes inside the `isAuthenticated ? <Layout>...</Layout> : <Navigate to="/auth" />` gate in `App.tsx`. This top-level gate is equivalent to a protected route wrapper. No per-route auth check exists or is needed.

**For AUTH-06:** No routing structure changes. New routes (if any for profile/settings expansion) just add `<Route>` elements inside the authenticated `<Routes>`.

### Seed-User Claim Flow UI Surface

The backend detects the seed-user's `PLACEHOLDER_HASH_PREFIX` and replaces the hash on first real login. No special PWA path is needed. First login for the seed account's email runs transparently through the standard email/password flow. Server returns a normal JWT on success.

---

## Safari Extension Persistence (EXT-01)

### Root Cause

Safari MV3 web extensions on macOS require a native host app wrapper. Safari disables the extension if the host app is not running at startup (not in Login Items). The `Vigil Capture.app` wrapper has an `AppDelegate.swift` that does nothing on launch — the app launches, shows nothing, and if closed, Safari stops the extension.

### Code Split — Shared Core vs Safari Shim

- **Shared web extension code:** `popup.js`, `popup.html`, `popup.css`, `manifest.json`, `icons/` — identical copies in `vigil-extension/` (Chrome) and `vigil-safari-extension/Vigil Capture Extension/Resources/` (Safari). Both use `chrome.storage.local` (Safari bridges the `chrome` namespace via its WebExtension polyfill).
- **Safari-specific shim:** `SafariWebExtensionHandler.swift` — native message bridge, echoes messages back. Currently minimal/default implementation.
- **Native wrapper:** `AppDelegate.swift` and `ViewController.swift` — the native macOS app that hosts the extension.

### Fix Location

**File:** `vigil-safari-extension/Vigil Capture/AppDelegate.swift`

Add `ServiceManagement.framework` import and `SMAppService.mainApp.register()` call in `applicationDidFinishLaunching`. For macOS 12 fallback, use `SMLoginItemSetEnabled`. The app should also suppress its window on launch (it is a background helper — set `LSUIElement = YES` in `Info.plist` or call `NSApp.setActivationPolicy(.prohibited)` in `applicationDidFinishLaunching`).

### Signing Chain Reality

- **Current state:** The Xcode project is built locally. Sideloading Safari extensions requires "Allow Unsigned Extensions" in Safari > Develop, which resets every time Safari relaunches.
- **For persistence without developer mode:** The app must be code-signed with a Developer ID Application certificate. This allows `gatekeeper` to accept the app on reboot without user intervention, and Safari to keep the extension enabled.
- **TestFlight:** Not applicable for macOS Safari extensions (TestFlight is for iOS app betas and macOS notarized apps, but extension distribution is separate).
- **Mac App Store:** Full App Store distribution would require App Store distribution certificate, sandboxing, and entitlements review. Defer unless the extension needs public distribution.

---

## Photo Capture Repair

### DispatchSource Event Handler Chain (CAP-01)

**File:** `Sources/DailyBriefMonitor/FolderWatcherService.swift`

**Confirmed chain:**
```
start()
  → open(O_EVTONLY) on directory
  → DispatchSource.makeFileSystemObjectSource(eventMask: .write)
  → source.setEventHandler { Task { await self.handleDirectoryChange(dirURL) } }
  → initial scan calls handleDirectoryChange() immediately

handleDirectoryChange()
  → triggerICloudDownloads()    // triggers .icloud placeholder downloads
  → scanForNewFiles()           // skips hidden files, skips done/ subfolder
  → for each new file: knownFiles.insert + pendingQueue.append
  → startProcessingLoop() if not already running

processFile()
  → waitForStable()             // polls until file size stable (30s timeout)
  → check ubiquitousItemDownloadingStatus (defer if not .current)
  → classify() → .image or .audio
  → imageService.processPhoto(imageURL:, preview:false, forcePaperType:)
  → triageThoughts(response.thoughts)
  → postProcess() → move to done/ or delete
```

**Root cause of CAP-01 (iCloud path broken):**

The `imageFolderPath` is configured as `~/Library/Mobile Documents/com~apple~CloudDocs/Notebook` (confirmed in `~/.config/dailybrief/config.json`). The path decodes correctly via `convertFromSnakeCase` (JSON key `image_folder_path` maps to `imageFolderPath`). The directory exists and contains materialized HEIC files (`IMG_0452.HEIC`, `IMG_0453.HEIC` — confirmed).

**Most probable root cause: HEIC rejection at the API level.**

`FolderWatcherService.imageExtensions` includes `heic`. The file reaches `APIImageDescriptionService.processPhoto(imageURL:)` in `JarvisCore`. If that service sends raw HEIC bytes to `/v1/process-photo`, the API rejects them: `VALID_MEDIA_TYPES` in `vigil-core/src/routes/process-photo.ts` only accepts `image/jpeg`, `image/png`, `image/gif`, `image/webp`. The rejection produces an HTTP error, which is caught in `processFile()` and the file is added to `_failedFiles`. The failure is tracked in the menu bar error state (WATCH-06) but may not be prominently surfaced.

**Secondary cause to verify:** Whether `APIImageDescriptionService.processPhoto(imageURL:)` converts HEIC to JPEG before encoding. The v2.4 requirement "HEIC/TIFF/BMP conversion via CoreGraphics" is listed as shipped — but this was implemented in the Mac app's local rendering path (GRDB era), which was retired in v2.2. The current `APIImageDescriptionService` may not perform conversion before sending.

**Fix approach:**
1. Confirm whether `APIImageDescriptionService` converts HEIC before upload. If not, add CoreGraphics-based conversion (HEIC → JPEG) in the Mac-side service before encoding to base64.
2. Alternatively, add server-side HEIC→JPEG conversion in `process-photo.ts` using `sharp` npm package. This makes all clients (PWA, Mac, future mobile) work with HEIC without client-side changes.

### iCloud Placeholder Detection Gate

`scanForNewFiles` uses `options: [.skipsHiddenFiles]` in `FileManager.contentsOfDirectory`. The `.icloud` placeholders are hidden files (dot-prefixed). So `scanForNewFiles` correctly skips `.icloud` placeholders — they are never enqueued as processable files.

`triggerICloudDownloads` uses `options: []` (includes hidden files) to find `.icloud` placeholders and call `startDownloadingUbiquitousItem`. This gate is in place and functioning.

`processFile` also checks `ubiquitousItemDownloadingStatus != .current` and defers if not fully downloaded. The iCloud gate is correctly implemented — it is not the source of CAP-01.

### Manual Upload Flow (CAP-02)

**Flow:** User selects a photo in the PWA → `usePhotoUpload` hook → `POST /v1/process-photo?preview=true` (preview, no DB write) → user confirms → `POST /v1/process-photo` (commit, no `?preview` param).

**Commit path in `vigil-core/src/routes/process-photo.ts` (verified):**
Steps 8-10: build insert rows, batch DB insert, return `{ paperType, confidence, thoughts[] }`. No triage call anywhere in the commit path. The thoughts are saved with `confidence` from Claude's photo analysis but `category` is NULL.

**CAP-02 root cause confirmed:** `process-photo.ts` commit path never calls the triage service. Thoughts created via photo upload (from any client) have no category.

**Why the folder watcher works (and PWA does not):** `FolderWatcherService` calls `triageThoughts()` after `imageService.processPhoto()` completes — this is Mac-side triage that runs after the API call returns. The PWA has no equivalent post-commit triage call.

**Fix location:** `vigil-core/src/routes/process-photo.ts`, commit path (after DB insert, before returning 201). Add a fire-and-forget call to the triage logic for each inserted thought. This ensures server-side auto-triage on all photo uploads regardless of which client submitted them, and aligns with how the triage route already works for text thoughts.

---

## Component Map: New vs Modified

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `posthog.ts` | `vigil-core/src/analytics/posthog.ts` | PostHog server singleton + captureEvent/captureError helpers |
| `analytics.ts` route | `vigil-core/src/routes/analytics.ts` | `POST /v1/analytics/event` — Mac app + extension event proxy |
| `me.ts` route | `vigil-core/src/routes/me.ts` | `GET /v1/me` — returns `{ userId, email }` for PWA PostHog identify |
| `ErrorBoundary.tsx` | `vigil-pwa/src/components/ErrorBoundary.tsx` | React class component catches render errors, sends to PostHog |
| `exit-confirm.ts` | `vigil-g2-plugin/src/screens/exit-confirm.ts` | G2 exit confirmation screen (double-tap dialogue) |

### Modified Components

| Component | Location | Change |
|-----------|----------|--------|
| `index.ts` | `vigil-core/src/` | Import posthog singleton, mount `/v1/analytics` + `/v1/me` routes, add `app.onError()`, add `process.on('uncaughtException')` |
| `process-photo.ts` | `vigil-core/src/routes/` | Add auto-triage call in commit path (CAP-02); add HEIC media type + conversion (CAP-01) |
| `navigation.ts` | `vigil-g2-plugin/src/` | Add EXIT_CONFIRM state machine for double-tap from HOME screen (G2-02) |
| `main.ts` | `vigil-g2-plugin/src/` | Update event handler dispatch to route through new exit-confirm logic (G2-02) |
| `index.html` | `vigil-g2-plugin/` | Add Vigil brand CSS variables and Inter font for WebView compliance (G2-03) |
| `AuthPage.tsx` | `vigil-pwa/src/pages/` | Add email/password tab, call `POST /v1/auth/login`, store JWT via existing `storeKey()` |
| `App.tsx` | `vigil-pwa/src/` | Wrap authenticated subtree in `<ErrorBoundary>` |
| `main.tsx` | `vigil-pwa/src/` | Add `posthog-js` init before `createRoot` |
| `AppDelegate.swift` | `vigil-safari-extension/Vigil Capture/` | Add `SMAppService.mainApp.register()` + `LSUIElement` suppression (EXT-01) |

---

## Suggested Build Order with Dependency Chain

```
Phase A: Server foundations (no client deps, unblocks everything else)
  A1. CAP-02: add auto-triage to process-photo commit path
  A2. CAP-01: investigate APIImageDescriptionService HEIC handling; fix HEIC on server or Mac side
  A3. ANLY-01: posthog.ts singleton + app.onError + process handlers in index.ts
  A4. ANLY-02: POST /v1/analytics/event route
  A5. GET /v1/me endpoint (required by AUTH-06 for PostHog identify)

Phase B: PWA auth UI (depends on A5 /v1/me)
  B1. AUTH-06: AuthPage email/password tab + JWT store + posthog.identify on success

Phase C: PWA error tracking (depends on ANLY-01 posthog-js, can parallel with B)
  C1. ANLY-03: posthog-js init in main.tsx + ErrorBoundary component + wire to App.tsx

Phase D: API metrics + traffic baseline (depends on A3 PostHog server SDK)
  D1. ANLY-04: captureEvent calls in key routes (brief/generate, thoughts POST, auth/login)

Phase E: G2 resubmit (fully independent, no server deps for G2-01/G2-03)
  E1. G2-01: Simulator screenshots (process task, no code change)
  E2. G2-03: WebView brand CSS + Inter font in index.html
  E3. G2-02: Exit confirmation dialogue in navigation.ts + new exit-confirm screen

Phase F: Safari extension persistence (independent Xcode project)
  F1. EXT-01: AppDelegate Login Item registration + LSUIElement suppression
```

**Dependency rationale:**
- PostHog server SDK (A3) must land before per-user events in any route (D1).
- `/v1/me` (A5) must land before AUTH-06 can do `posthog.identify()` with real userId.
- AUTH-06 backend (shipped v3.4) is complete — Phase B is pure frontend work.
- CAP-01/CAP-02 are isolated server-side fixes; they should land first to unblock existing broken functionality.
- G2 resubmit (E) and Safari extension (F) are fully independent and can be parallelized with A–D.
- G2-01 screenshots are a process task with zero code changes — can happen anytime after E2 (brand compliance) is done.

---

## Data Flow Changes

### PostHog Event Flow (new)

```
Client action (PWA, Mac, extension)
  → API call to vigil-core
  → bearerAuth sets c.get('userId')
  → Route handler: posthog.captureEvent(userId, 'event_name', props)  <- NEW
  → posthog-node sends to PostHog Cloud (async, non-blocking)
```

### Auth Flow Change (AUTH-06)

```
Current:  User enters vk_ key → validateApiKey() → storeKey() → isAuthenticated = true
New path: User enters email/pw → POST /v1/auth/login → { token: JWT } → storeKey(JWT) → isAuthenticated = true
Legacy:   vk_ key entry path preserved unchanged for existing Mac app + extension clients
```

### Photo Upload Triage Fix (CAP-02)

```
Current:  POST /v1/process-photo (commit) → DB insert → return thoughts (category: null)
Fixed:    POST /v1/process-photo (commit) → DB insert → triage each thought → update category → return thoughts with category
```

---

## Integration Points Summary

| Feature | Modified Entry Point | Integration Method |
|---------|---------------------|-------------------|
| PostHog server | `vigil-core/src/index.ts` | singleton init + `app.onError` handler |
| PostHog PWA | `vigil-pwa/src/main.tsx` | `posthog-js` init before `createRoot` |
| PostHog per-user | route handlers via `c.get('userId')` | userId already set by existing bearerAuth middleware |
| Error tracking React | `vigil-pwa/src/App.tsx` | `<ErrorBoundary>` wraps authenticated layout |
| Error tracking Node | `vigil-core/src/index.ts` | `app.onError()` + `process.on` handlers |
| G2 exit dialogue | `vigil-g2-plugin/src/navigation.ts` | new EXIT_CONFIRM state in `handleNavEvent` |
| G2 brand WebView | `vigil-g2-plugin/index.html` | CSS variables + Inter font |
| PWA login UI | `vigil-pwa/src/pages/AuthPage.tsx` | extend existing auth page (no new route) |
| JWT storage | `vigil-pwa/src/api/client.ts` | existing `storeKey()` / `getStoredKey()` — unchanged |
| Safari Login Item | `vigil-safari-extension/Vigil Capture/AppDelegate.swift` | `SMAppService.mainApp.register()` |
| CAP-01 HEIC fix | `vigil-core/src/routes/process-photo.ts` + Mac `APIImageDescriptionService` | add HEIC support on server or confirm Mac converts before upload |
| CAP-02 triage | `vigil-core/src/routes/process-photo.ts` | fire-and-forget triage after DB insert in commit path |

---

## Sources

All findings are HIGH confidence from direct codebase inspection on 2026-04-19.

- `vigil-core/src/index.ts` — middleware stack, route mounting, startup sequence
- `vigil-core/src/middleware/auth.ts` — three-path bearerAuth, ContextVariableMap userId
- `vigil-core/src/routes/process-photo.ts` — VALID_MEDIA_TYPES (no HEIC), commit path (no triage)
- `vigil-core/src/routes/auth.ts` — register/login endpoints, PLACEHOLDER_HASH_PREFIX
- `vigil-pwa/src/App.tsx` — route structure, auth gate pattern, no ErrorBoundary
- `vigil-pwa/src/main.tsx` — entry point, no PostHog init
- `vigil-pwa/src/api/client.ts` — localStorage key, vigilFetch, storeKey/getStoredKey
- `vigil-pwa/src/pages/AuthPage.tsx` — API key only, no email/password form
- `vigil-pwa/src/hooks/usePhotoUpload.ts` — commit flow confirmed no triage call
- `vigil-g2-plugin/src/main.ts` — lifecycle events, DOUBLE_CLICK in NAV_EVENTS
- `vigil-g2-plugin/src/navigation.ts` — screen state machine, DOUBLE_CLICK navigates to HOME
- `vigil-g2-plugin/src/constants.ts` — greyscale display, no color tokens
- `vigil-g2-plugin/package.json` — Even SDK v0.0.9
- `Sources/DailyBriefMonitor/FolderWatcherService.swift` — full iCloud handling chain
- `Sources/JarvisCore/Config/AppConfig.swift` + `ConfigLoader.swift` — snake_case decoding confirmed working
- `~/.config/dailybrief/config.json` — `image_folder_path`: `com~apple~CloudDocs/Notebook` confirmed
- `vigil-safari-extension/Vigil Capture/AppDelegate.swift` — minimal AppDelegate, Login Item fix needed
- `vigil-extension/manifest.json` + `vigil-safari-extension/.../manifest.json` — both popup-only MV3, no background SW
- PostHog Cloud pricing (MEDIUM confidence — from posthog.com, not re-verified today): 1M events/month free tier

---

*Architecture research for: Vigil v3.5 Observability, G2 Resubmit & Capture Repair*
*Researched: 2026-04-19*
