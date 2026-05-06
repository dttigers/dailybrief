# Stack Research

**Domain:** Observability, G2 resubmit, capture repair, PWA auth UI, Safari extension persistence — Vigil v3.5
**Researched:** 2026-04-19
**Confidence:** HIGH — SDK versions verified via npm registry; lifecycle APIs verified via official Even Hub docs; iCloud watcher behavior verified via Apple Developer documentation and multiple community sources

---

## Existing Stack Baseline (Do NOT re-install)

The following are already installed and available — do not add them again:

| Package | Location | Current Version | Relevant to v3.5 |
|---------|----------|-----------------|------------------|
| `react` | vigil-pwa | ^19.2.5 | Auth UI forms, login/register pages |
| `react-router` | vigil-pwa | ^7.14.0 | Auth route guarding |
| `tailwindcss` | vigil-pwa (dev) | ^4.2.2 | Form styling — no UI framework needed |
| `hono` | vigil-core | ^4.7.0 | API routing for PostHog proxy endpoint |
| `drizzle-orm` | vigil-core | ^0.45.2 | No new schema needed for v3.5 |
| `@evenrealities/even_hub_sdk` | vigil-g2-plugin | ^0.0.9 | Already one minor behind latest (0.0.10) |

---

## New Dependencies Required for v3.5

### vigil-core (Node.js/Hono API)

| Library | Install Version | Purpose | Why |
|---------|----------------|---------|-----|
| `posthog-node` | `^5.29.2` | Server-side analytics + error capture | PostHog's official Node.js SDK; error autocapture requires `enableExceptionAutocapture: true`; minimum required for API metrics and server error tracking |

That is the only new server-side package. No additional error-tracking library (e.g., Sentry) is needed.

### vigil-pwa (React/Vite PWA)

| Library | Install Version | Purpose | Why |
|---------|----------------|---------|-----|
| `posthog-js` | `^1.369.3` | Browser analytics + error tracking | PostHog's JS SDK; `capture_exceptions: true` enables `window.onerror` / `unhandledrejection` wrapping; `PostHogErrorBoundary` component catches React render errors |
| `react-hook-form` | `^7.72.1` | Login/register form state | Uncontrolled components; minimal re-renders; pairs with zod resolver; standard for TypeScript React forms in 2026 |
| `zod` | `^3.x` (pin to 3.x, NOT 4.x) | Schema validation + TypeScript type inference | Zod v4 has active breaking changes with `@hookform/resolvers`; v3 is stable and widely deployed; `z.infer<>` drives both form types and API validation types |
| `@hookform/resolvers` | `^3.10.x` (NOT ^5.x) | Bridges react-hook-form + zod | v5.x introduces Zod v4 peer dep and type mismatches; v3.x is the last stable version for Zod v3 |

**Critical version constraint:** Pin `zod` to `^3.x` and `@hookform/resolvers` to `^3.x`. The v5 resolvers and Zod v4 have documented type errors as of July 2025 that are not yet fully resolved. Use `npm install zod@3 @hookform/resolvers@3` to install the stable pair.

### vigil-g2-plugin (Even Hub TypeScript plugin)

| Package | Install Version | Purpose | Why |
|---------|----------------|---------|-----|
| `@evenrealities/even_hub_sdk` | `^0.0.10` | Even Hub SDK with lifecycle event API | Current installed version is 0.0.9; latest published is 0.0.10 (published ~April 12, 2026); update to get `FOREGROUND_EXIT_EVENT` and `DOUBLE_CLICK_EVENT` constants if not already present in 0.0.9 — confirm before assuming the update is required |

**G2 lifecycle API clarification** (HIGH confidence — verified against official Even Hub docs):

The G2 SDK uses an event-driven model via `bridge.onEvenHubEvent()`. The events relevant to G2-02 (double-tap exit dialogue) are:

- `DOUBLE_CLICK_EVENT` — fires on double-press of G2 or R1 button; use this to trigger the exit confirmation dialogue
- `FOREGROUND_EXIT_EVENT` — fires when the user navigates away from the plugin (moves to background); use for cleanup (clear timers, stop refresh)
- `ABNORMAL_EXIT_EVENT` — fires on unexpected Bluetooth disconnect

The "exit dialogue" per Even Hub store review requirements is implemented by calling `shutDownPageContainer()` with an optional confirmation UI layer before the call — not a separate SDK method. Pattern: on `DOUBLE_CLICK_EVENT`, show a "Leave Vigil?" prompt rendered in the plugin's page; on confirm, call `bridge.shutDownPageContainer()`.

There is NO `onExit` callback-style API. All events are dispatched through the single `onEvenHubEvent()` listener and identified by type string.

**No SDK version change is strictly required for the exit dialogue** if 0.0.9 already exposes `DOUBLE_CLICK_EVENT`. Upgrade to 0.0.10 to stay current and get any patch fixes.

---

## PostHog Integration Details by Client

### Cloud-hosted vs self-hosted

**Use PostHog Cloud (us.i.posthog.com). Do not self-host.**

PostHog Cloud gives 1M events, 100K exceptions, and 5K session recordings free per month. Self-hosting requires ClickHouse + Kafka + PostgreSQL + Redis — infrastructure that would outweigh the entire Vigil platform. Solo developer at this scale: cloud is the right call.

### vigil-core — posthog-node (server)

Minimum integration for error tracking + API metrics:

```typescript
import { PostHog } from 'posthog-node'

const posthog = new PostHog(process.env.POSTHOG_API_KEY!, {
  host: 'https://us.i.posthog.com',
  enableExceptionAutocapture: true,   // wraps uncaughtException + unhandledRejection
})

// Per-route event capture (API metrics)
posthog.capture({ distinctId: userId ?? 'anonymous', event: '$pageview', properties: { path: req.path } })

// Error capture (call explicitly in route catch blocks too)
posthog.captureException(error, userId ?? 'anonymous')

// On shutdown
await posthog.shutdown()
```

Source maps upload is NOT required for server-side Node.js — stack traces are unminified.

### vigil-pwa — posthog-js (browser)

Minimum integration for product events + error tracking:

```typescript
import posthog from 'posthog-js'

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: 'https://us.i.posthog.com',
  defaults: '2026-01-30',
  capture_exceptions: true,    // auto-wraps window.onerror + unhandledrejection
  autocapture: false,          // keep it explicit; avoid noise at early stage
})

// In React root, wrap with PostHogErrorBoundary for render errors
import { PostHogErrorBoundary } from 'posthog-js/react'
```

Minimum SDK version for error tracking: `posthog-js` v1.207.8+. Current latest is 1.369.3 — well above minimum.

Identify users after login:
```typescript
posthog.identify(userId, { email })
```

### vigil-g2-plugin — posthog-js (browser, same package)

Minimal: only `posthog.capture()` for plugin-open and plugin-exit events. No session recording, no error boundary (no React). Load posthog-js from CDN or bundle it with the Vite build.

```typescript
posthog.init(POSTHOG_KEY, { api_host: 'https://us.i.posthog.com', autocapture: false })
posthog.capture('g2_plugin_opened')
posthog.capture('g2_plugin_exited', { trigger: 'double_tap' })
```

### vigil-safari-extension / vigil-extension — posthog-js

Optional. The extension already captures to the API, so server-side posthog-node in vigil-core will log those events by userId. Adding posthog-js to the extension is low-value for v3.5. Defer to v3.6.

### Mac app (Swift) — PostHog iOS SDK

The PostHog iOS Swift SDK (`posthog-ios`, latest: v3.50.0) supports macOS via Swift Package Manager:

```
https://github.com/PostHog/posthog-ios — from 3.50.0
```

However, **defer the Mac app PostHog integration to v3.6.** Rationale:
- The Mac app already communicates through vigil-core (API calls), so server-side posthog-node in vigil-core will capture most Mac-originated events via userId context
- Adding the Swift SDK to DailyBriefMonitor requires SPM updates, provisioning profile changes, and macOS-specific SDK surface testing
- There is an open GitHub issue tracking macOS-specific feature gaps in the PostHog Swift SDK
- v3.5 is already scoped for five feature areas; adding a sixth client is scope creep

---

## PostHog Reverse Proxy — Nice-to-Have, Not Required

The PostHog Railway reverse proxy is a **separate Railway service** (nginx-based) that routes browser events through your domain instead of `us.i.posthog.com`, bypassing ad blockers.

**Decision for v3.5: Skip the proxy.**

Rationale:
- Vigil's users are the developer and a handful of trusted accounts — not a consumer product with ad-block-heavy users
- Ad blockers blocking PostHog would affect event volume, not correctness; the developer's own events (the most valuable ones at this stage) come from authenticated sessions where ad blockers are less likely to interfere with API calls
- Setting up a proxy as a separate Railway service adds operational surface (another deploy to manage, another domain to configure)
- Revisit in v3.6 if event capture rates appear lower than expected

If you ever need it, PostHog provides a one-click Railway template (`posthog-proxy` or `posthog-proxy-advance`) with a single env var (`POSTHOG_CLOUD_REGION=us`). The implementation cost is low; there is no urgency.

---

## iCloud Folder Watching — Replace DispatchSource with NSMetadataQuery

**The core issue:** DispatchSource (`DISPATCH_SOURCE_TYPE_VNODE`) watches a file descriptor on the filesystem. When iCloud Drive optimizes storage and evicts a file, it replaces the real file with a `.icloud` placeholder. The placeholder has a different file descriptor and a different filename (`.FileName.ext.icloud` with a leading dot). DispatchSource:
1. May not fire when the placeholder is created (different descriptor)
2. Will give a wrong filename (`FileName.jpg.icloud` instead of `FileName.jpg`)
3. Cannot distinguish "file is available" from "file is a stub that needs download"

**Recommended approach: NSMetadataQuery as the iCloud-aware watcher.**

NSMetadataQuery is the Apple-documented method for watching iCloud-managed directories. It queries Spotlight metadata (not the filesystem directly), so it:
- Returns the canonical filename without the `.icloud` stub extension
- Exposes `NSMetadataUbiquitousItemDownloadingStatusKey` to check if a file is fully downloaded (`NSMetadataUbiquitousItemDownloadingStatusCurrent`) or still a placeholder
- Fires `NSMetadataQueryDidUpdateNotification` when files appear or change state

**Architecture for the folder watcher repair:**

```swift
// Replace DispatchSource watcher with NSMetadataQuery
let query = NSMetadataQuery()
query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
// or use the specific iCloud container path
query.predicate = NSPredicate(format: "%K LIKE '*.jpg' OR %K LIKE '*.png' OR %K LIKE '*.heic'",
                              NSMetadataItemFSNameKey, NSMetadataItemFSNameKey)

NotificationCenter.default.addObserver(
  forName: .NSMetadataQueryDidUpdate,
  object: query,
  queue: .main
) { [weak self] _ in
  self?.handleQueryResults(query)
}

func handleQueryResults(_ query: NSMetadataQuery) {
  query.disableUpdates()
  for item in query.results as! [NSMetadataItem] {
    let downloadStatus = item.value(forAttribute: NSMetadataUbiquitousItemDownloadingStatusKey) as? String
    guard downloadStatus == NSMetadataUbiquitousItemDownloadingStatusCurrent else {
      // Trigger download and wait
      try? FileManager.default.startDownloadingUbiquitousItem(at: url)
      continue
    }
    // File is local — safe to read and upload
  }
  query.enableUpdates()
}
```

**For non-iCloud local paths** (e.g., `~/Desktop/Vigil Drops/`): DispatchSource remains valid and can stay as-is. The repair only needs to apply when the configured watch path is inside iCloud Drive (`/Users/*/Library/Mobile Documents/`).

**NSFileCoordinator is not the watcher replacement** — it is a read/write coordinator used when actually reading or writing the file to avoid conflicts with iCloud sync. Use it when opening the file content for upload, not for directory monitoring.

**Practical heuristic for the fix:** Check if the configured `watchFolder` path contains `Mobile Documents`. If yes, use NSMetadataQuery. If no, keep DispatchSource. This avoids rearchitecting the happy path.

---

## PWA Auth UI — No UI Framework, react-hook-form + zod

The existing PWA has zero form validation infrastructure. It uses direct React state and tailwindcss for styling. For AUTH-06 (login/register UI), two patterns are viable:

**Bare React forms (no library):** Valid for two simple forms (email + password). No new dependencies. But: no native validation error handling, manual `useState` per field, no type inference from schema.

**react-hook-form + zod (recommended):** Three new packages, but the combination gives:
- Zero-boilerplate type inference: `z.infer<typeof loginSchema>` drives both form types and what the API expects
- Built-in error message surfacing via `formState.errors`
- Uncontrolled inputs (no re-render on keystroke) — fast even with React 19
- Standard pattern across the React ecosystem in 2026; well understood

For just login + register (two forms, ~4 fields total), the library overhead is worth it because:
1. Password validation (min length, complexity) is non-trivial to write correctly without a schema library
2. More forms are coming: AUTH-07 profile + change-password is already deferred to v3.6
3. Zod is already planned for vigil-core type sharing; having it in the PWA aligns the stack

**Install the safe combination:**
```bash
cd vigil-pwa
npm install react-hook-form zod@3 @hookform/resolvers@3
```

Do NOT install `zod@latest` (which resolves to v4 as of mid-2025) — Zod v4 has unresolved type conflicts with `@hookform/resolvers` v5. Pin to Zod v3 and resolvers v3 for a stable pairing.

---

## Safari Extension Persistence — Reality Check

**The current extension manifest (verified):**

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "storage"],
  "action": { "default_popup": "popup.html" }
}
```

The extension has **no background script** — it is purely popup-driven. This is actually the correct architecture for a popup-only MV3 extension and sidesteps the persistent background script problem entirely.

**Why extensions "don't persist" across restarts:**

On macOS, Safari Web Extensions wrapped in a native app container (`.app`) require the user to enable them in Safari Preferences once after initial install. They **do** persist across Safari restarts on macOS if:
1. The extension was properly enabled by the user
2. The host app (the macOS `.app` wrapper) is correctly signed and has a valid provisioning profile

The "re-enable after restart" complaint is one of two problems:
1. **Signing/provisioning issue:** If the `.app` wrapper is ad-hoc signed or has an expired/missing provisioning profile, Gatekeeper may revoke trust on relaunch, causing Safari to disable the extension
2. **Development build vs distribution build:** Xcode development builds use a different signing identity than the App Store or Developer ID builds; Safari may treat them differently

**What EXT-01 likely needs (not an SDK change):**

- Confirm the Xcode project is signed with `Developer ID Application` certificate (same pattern as DailyBriefMonitor.app, which uses Developer ID signing per the project's v2.4 history)
- Ensure the extension target has a matching `Developer ID Application` entitlement
- The `.xcodeproj` file at `vigil-safari-extension/Vigil Capture.xcodeproj` contains both the host app target (`Vigil Capture`) and the extension target (`Vigil Capture Extension`) — both need consistent signing

**There is no MV3 API change needed.** The fix is in Xcode project settings and signing, not in the extension manifest or JavaScript code.

**Known unresolvable limitation:** On iOS (not macOS), MV3 service workers are killed after 30-45 seconds and cannot be revived — this is an Apple platform constraint with no workaround. The Vigil extension targets macOS only and has no service worker, so this limitation does not apply.

---

## Installation Summary

```bash
# vigil-core — PostHog server analytics
cd vigil-core
npm install posthog-node

# vigil-pwa — PostHog browser analytics + auth form validation
cd vigil-pwa
npm install posthog-js react-hook-form zod@3 @hookform/resolvers@3

# vigil-g2-plugin — update Even Hub SDK
cd vigil-g2-plugin
npm install @evenrealities/even_hub_sdk@latest
```

No new dependencies for:
- Mac app folder watcher repair (NSMetadataQuery is part of Foundation, no SPM package needed)
- Safari extension persistence (fix is Xcode signing settings, not a library)
- PostHog Mac Swift SDK (deferred to v3.6)

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| PostHog Cloud | Self-hosted PostHog | Requires ClickHouse + Kafka + PostgreSQL + Redis; ops overhead far exceeds benefit at solo dev scale |
| PostHog (all-in-one) | Sentry for errors + Mixpanel for events | Two vendors vs one; PostHog error tracking is sufficient for this scale; Sentry adds $0 initially but diverges the stack |
| PostHog (all-in-one) | Plausible / Fathom | Analytics-only; no error tracking; no session replay; PostHog free tier is more capable |
| `react-hook-form` + zod@3 | Bare React state | Bare state works for 2 forms but adds no type safety and doesn't scale to AUTH-07 (v3.6) |
| `react-hook-form` + zod@3 | Formik + Yup | Formik is older, controlled components (more re-renders); Yup is less TypeScript-native than Zod |
| `zod@3` | `zod@4` | Zod v4 breaks @hookform/resolvers as of mid-2025; wait for stable resolvers@5.x before upgrading |
| NSMetadataQuery | DispatchSource on iCloud paths | DispatchSource operates on file descriptors; iCloud placeholders have different descriptors; cannot detect download status; NSMetadataQuery is the Apple-documented replacement |
| `DOUBLE_CLICK_EVENT` + `shutDownPageContainer()` | Custom exit gesture | Even Hub SDK does not expose a hook for arbitrary gestures; the double-tap event is the platform-provided exit signal |
| Proxy deferred | PostHog Railway proxy now | Proxy is optional; adds operational overhead; not worth it before there is meaningful user traffic |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `sentry` | Redundant with PostHog error tracking; adds a second vendor and a second initialization path | `posthog-node` with `enableExceptionAutocapture: true` |
| `zod@latest` (resolves to v4) | Type conflicts with @hookform/resolvers documented through July 2025 | `zod@3` pinned |
| `@hookform/resolvers@latest` (resolves to v5) | Introduces zod/v4/core dependency; type errors with Zod v3 | `@hookform/resolvers@3` pinned |
| PostHog Swift SDK in v3.5 | Adds SPM target changes + macOS-specific testing surface; Mac events visible via vigil-core server-side posthog-node | Defer to v3.6 |
| Background service worker in Safari extension | Non-persistent in MV3 on both iOS and macOS; debugging window broken in Safari | Popup-only architecture (already in place — no change needed) |
| `NSFileCoordinator` as watcher | NSFileCoordinator coordinates reads/writes; it is not a change notification mechanism | `NSMetadataQuery` for iCloud paths; `DispatchSource` for local paths |
| `posthog-js` in vigil-safari-extension | Low event volume; server-side capture via vigil-core already covers it; adds bundle size to extension | Defer to v3.6 |

---

## Version Compatibility

| Package | Requires | Notes |
|---------|----------|-------|
| `posthog-node@5.29.2` | Node.js 18+ | Railway runs Node 20; fully compatible |
| `posthog-js@1.369.3` | Browser/Web | No SSR needed for Vite PWA; standard browser bundle |
| `react-hook-form@7.72.1` | React 16.8+ | React 19 compatible; verified |
| `zod@3.x` | TypeScript 4.5+ | vigil-pwa uses TypeScript ^6.0.2; compatible |
| `@hookform/resolvers@3.x` | react-hook-form v7, zod v3 | Stable pairing; v5 breaks with zod v3 |
| `@evenrealities/even_hub_sdk@0.0.10` | Browser (Vite bundle) | Drop-in update from 0.0.9; MIT license |
| `NSMetadataQuery` | macOS 10.10+ / Foundation | Available in Swift 6.2 on macOS 14+; no import needed beyond `Foundation` |

---

## Sources

- `vigil-pwa/package.json` — confirmed no existing form validation deps; react ^19.2.5, tailwind ^4.2.2 present; HIGH confidence (live codebase)
- `vigil-core/package.json` — confirmed no PostHog installed; hono ^4.7.0, drizzle-orm present; HIGH confidence (live codebase)
- `vigil-g2-plugin/package.json` — confirmed `@evenrealities/even_hub_sdk@^0.0.9` installed; HIGH confidence (live codebase)
- `vigil-safari-extension/Vigil Capture Extension/Resources/manifest.json` — confirmed MV3, popup-only, no background script; HIGH confidence (live codebase)
- `npm info posthog-node version` → 5.29.2; HIGH confidence (npm registry, live)
- `npm info posthog-js version` → 1.369.3; HIGH confidence (npm registry, live)
- `npm info react-hook-form version` → 7.72.1; HIGH confidence (npm registry, live)
- `npm info zod version` → 4.3.6 (latest); pin to `zod@3` — HIGH confidence on version, HIGH confidence on v4 breakage
- `npm info @hookform/resolvers version` → 5.2.2 (latest); pin to `@hookform/resolvers@3` — HIGH confidence on breakage
- `npm info @evenrealities/even_hub_sdk` → 0.0.10, published ~April 12 2026; HIGH confidence (npm registry, live)
- [hub.evenrealities.com/docs/guides/page-lifecycle](https://hub.evenrealities.com/docs/guides/page-lifecycle) — confirmed `shutDownPageContainer` as exit method; HIGH confidence (official docs)
- [hub.evenrealities.com/docs/guides/input-events](https://hub.evenrealities.com/docs/guides/input-events) — confirmed `DOUBLE_CLICK_EVENT`, `FOREGROUND_EXIT_EVENT` event constants; HIGH confidence (official docs)
- [posthog.com/docs/error-tracking/installation/node](https://posthog.com/docs/error-tracking/installation/node) — confirmed `enableExceptionAutocapture: true` pattern; MEDIUM confidence (WebFetch, official docs)
- [posthog.com/docs/error-tracking/installation/react](https://posthog.com/docs/error-tracking/installation/react) — confirmed `PostHogErrorBoundary`, min version v1.207.8 for error tracking; MEDIUM confidence (WebSearch + official URL)
- [posthog.com/docs/advanced/proxy/railway](https://posthog.com/docs/advanced/proxy/railway) — confirmed proxy is a separate Railway service, optional; MEDIUM confidence (WebFetch, official docs)
- [fatbobman.com/en/posts/advanced-icloud-documents/](https://fatbobman.com/en/posts/advanced-icloud-documents/) — confirmed NSMetadataQuery recommended over direct filesystem access for iCloud; placeholder behavior; MEDIUM confidence (expert blog, well-sourced)
- [github.com/react-hook-form/resolvers/issues/799](https://github.com/react-hook-form/resolvers/issues/799) — confirmed Zod v4 breaks resolvers; LOW confidence individually, MEDIUM confidence corroborated by multiple GH issues
- Apple Developer Forum thread 709349 — Safari MV3 background service worker non-persistence; MEDIUM confidence (community + Apple engineer responses)
- [posthog.com/docs/self-host](https://posthog.com/docs/self-host) — self-hosting complexity confirmed ("We've literally never seen the self-hosting math work out"); MEDIUM confidence (official docs)

---

*Stack research for: Vigil v3.5 — Observability, G2 Resubmit & Capture Repair*
*Researched: 2026-04-19*
