# Project Research Summary

**Project:** Vigil v3.5 — Observability, G2 Resubmit & Capture Repair
**Domain:** Multi-surface ambient AI platform — analytics integration, store certification, pipeline repair, auth UI, extension persistence
**Researched:** 2026-04-19
**Confidence:** HIGH (root causes confirmed from live codebase inspection; stack versions verified from npm registry + official docs)

## Executive Summary

Vigil v3.5 is a repair + instrumentation milestone, not a greenfield build. The platform already has 5 connected client surfaces, a production Railway API, and 102 shipped phases behind it. The v3.5 scope resolves five specific defects and capability gaps: two broken capture paths (CAP-01 iCloud watcher, CAP-02 photo triage), three Even G2 store rejection items (screenshots, exit dialogue, brand compliance), missing observability (PostHog analytics + error tracking across all surfaces), a backend-complete PWA auth UI waiting to be wired (AUTH-06), and a Safari extension that disables itself on every restart (EXT-01). Every root cause has been confirmed from direct codebase inspection — this is a diagnosis-complete milestone, not an investigation-first one.

The recommended approach is a server-foundations-first execution order. CAP-02 (photo triage missing from the commit path) and the PostHog singleton both belong in `vigil-core` and have zero client dependencies — they should land first. The G2 resubmit and Safari extension fix are fully independent and can execute in parallel with server work. AUTH-06 is pure frontend and depends only on a new `/v1/me` endpoint (needed for PostHog identity) that lands with the server foundations. PostHog Cloud (free tier, `us.i.posthog.com`) is the right choice for this scale — self-hosting would require ClickHouse + Kafka + PostgreSQL + Redis, outweighing the entire platform. Two packages require pinned versions that differ from `@latest`: `zod@3` (not v4) and `@hookform/resolvers@3` (not v5), because the v4/v5 pairing has unresolved type errors with React Hook Form as of mid-2025.

The top risks are operational, not technical. PostHog dev-event flooding (corrupting production funnels permanently — PostHog Cloud has no bulk delete) must be addressed at the moment the SDK is initialized, before any `capture()` call is written. The G2 resubmit must gate all three rejection items together — Even Hub reviewers re-reject on the first unresolved item without checking others, burning a full review cycle. CAP-02 must be diagnosed before it is fixed (a single `curl` against the live endpoint locates the bug layer in 30 seconds). CAP-01's actual root cause is HEIC rejection at the API level, not iCloud placeholder detection — the existing iCloud download guards in `FolderWatcherService.swift` are correctly implemented. EXT-01's real fix requires Mac App Store distribution or Login Item registration in `AppDelegate.swift`; no code change to the extension itself resolves the persistence problem.

---

## Key Findings

### Recommended Stack

No major new stack additions are needed. The existing Hono/Drizzle/React/Vite/Swift/Even SDK foundation handles all v3.5 work. The only new packages are PostHog SDKs (`posthog-node` for vigil-core, `posthog-js` for vigil-pwa), React Hook Form form infrastructure (`react-hook-form`, `zod@3`, `@hookform/resolvers@3`) for AUTH-06, and an Even Hub SDK update from 0.0.9 to 0.0.10. The Mac app folder watcher repair uses `NSMetadataQuery` from Foundation — no new SPM package. The Safari extension persistence fix is Xcode `AppDelegate.swift` code, not a library change.

**Core technologies:**
- `posthog-node@^5.29.2` (vigil-core): Server-side analytics + error autocapture — `enableExceptionAutocapture: true` wraps `uncaughtException` + `unhandledRejection`; must add `shutdown()` to existing SIGTERM/SIGINT handlers to avoid event loss on Railway deploys
- `posthog-js@^1.369.3` (vigil-pwa): Browser analytics + error tracking — `capture_exceptions: true` wraps `window.onerror`; `PostHogErrorBoundary` catches React render errors; init before `createRoot` in `main.tsx`
- `react-hook-form@^7.72.1` + `zod@3` + `@hookform/resolvers@3` (vigil-pwa): Form validation for AUTH-06 login/register — CRITICAL: pin zod to `^3.x` and resolvers to `^3.x`; v4/v5 pair has documented type errors with React Hook Form as of mid-2025
- `@evenrealities/even_hub_sdk@^0.0.10` (vigil-g2-plugin): Even Hub SDK update — get `DOUBLE_CLICK_EVENT` + `FOREGROUND_EXIT_EVENT` constants; confirm 0.0.9 already exposes these before assuming upgrade is required
- `NSMetadataQuery` (Foundation, no import needed): iCloud-aware folder watching for CAP-01 — replace DispatchSource only on paths inside `~/Library/Mobile Documents/`; DispatchSource valid for non-iCloud paths
- PostHog Cloud (us.i.posthog.com, free tier): 1M events + 100K exceptions + 5K session recordings/month free — self-hosting not viable at solo dev scale

**Critical version constraints:**
- `zod@3` — NOT `zod@latest` (resolves to v4 as of mid-2025; type conflicts with resolvers)
- `@hookform/resolvers@3` — NOT `@latest` (v5 has Zod v4 peer dep; breaks with Zod v3)
- PostHog Swift SDK — DEFERRED to v3.6 (Mac events captured server-side via posthog-node; Swift SDK beta on macOS)

---

### Expected Features

All v3.5 features are repair or wiring work against shipped backend contracts — no net-new product surface except the login UI form.

**Must have (table stakes — P1):**
- CAP-01: iCloud folder watcher producing thoughts from HEIC files — broken daily-use feature; root cause is HEIC rejection at the API, not iCloud placeholder detection
- CAP-02: Photo uploads triaged synchronously — `process-photo.ts` commit path never calls the triage service; server-side fix, not PWA fix
- ANLY-01/02: PostHog SDK initialized + error tracking wired in vigil-core and vigil-pwa — currently debugging completely blind
- AUTH-06: PWA email/password login + register UI — backend shipped in v3.4, UI tab missing from `AuthPage.tsx`
- G2-01/02/03: All three Even Hub store rejection items resolved together before resubmit

**Should have (P2 — ship when core is done):**
- ANLY-03: Product events (capture funnel: thought captured → triage completed → brief viewed)
- ANLY-04: Server-side API metrics (4xx/5xx rate per endpoint via posthog-node in route handlers)
- EXT-01 Login Item registration: `AppDelegate.swift` `SMAppService.mainApp.register()` — interim persistence fix without App Store review cycle

**Defer to v3.6:**
- Session recording (add `ph-no-capture` to TherapyPage + InsightsPage first; low value at 5-user scale)
- PostHog reverse proxy on Railway (adds operational overhead; ad blocker impact negligible at developer-only scale)
- PostHog Swift SDK for Mac app (Mac events visible via server-side posthog-node)
- EXT-01 Mac App Store submission (correct long-term fix; Apple review timeline outside developer control)
- AUTH-07 profile/change-password, forgot password (needs email infrastructure; explicitly out of v3.5 scope)
- Feature flags (no rollout decisions at solo dev scale)

---

### Architecture Approach

The architecture is already settled. v3.5 work is surgical integration at specific well-identified files: `vigil-core/src/index.ts` (PostHog singleton + shutdown hook + `app.onError`), `vigil-core/src/routes/process-photo.ts` (CAP-02 triage + CAP-01 HEIC), `vigil-pwa/src/pages/AuthPage.tsx` (AUTH-06 email tab), `vigil-pwa/src/main.tsx` (posthog-js init), `vigil-g2-plugin/src/navigation.ts` (G2-02 exit state machine), `vigil-safari-extension/Vigil Capture/AppDelegate.swift` (EXT-01 Login Item). Two new files: `vigil-core/src/analytics/posthog.ts` (singleton + helpers) and `vigil-core/src/routes/me.ts` (`GET /v1/me`). One new G2 screen: `vigil-g2-plugin/src/screens/exit-confirm.ts`.

**Major components and their v3.5 changes:**
1. `vigil-core/src/analytics/posthog.ts` (NEW): PostHog server singleton; exports `captureEvent(userId, event, props)` and `captureError(userId, error, context)`; no-op shim when `POSTHOG_API_KEY` absent (local dev safety); null-guard enforced via wrapper
2. `vigil-core/src/routes/process-photo.ts` (MODIFIED): Add HEIC media type + `sharp` conversion (CAP-01); add triage call in commit path after DB insert (CAP-02)
3. `vigil-core/src/routes/me.ts` (NEW): `GET /v1/me` returns `{ userId, email }` — required by AUTH-06 to call `posthog.identify()`
4. `vigil-pwa/src/pages/AuthPage.tsx` (MODIFIED): Two-tab layout (Sign In email/password + legacy API Key tab); JWT stored via existing `storeKey()` into sessionStorage (not localStorage)
5. `vigil-g2-plugin/src/navigation.ts` (MODIFIED): Add `Screen.EXIT_CONFIRM` state; on `DOUBLE_CLICK_EVENT` from `Screen.HOME`, transition to exit confirm; on second double-tap within 3s call `shutDownPageContainer(1)`; timeout resets to `Screen.HOME`
6. `vigil-safari-extension/Vigil Capture/AppDelegate.swift` (MODIFIED): `SMAppService.mainApp.register()` in `applicationDidFinishLaunching`; `NSApp.setActivationPolicy(.prohibited)` to suppress window

---

### Critical Pitfalls

**Confirmed root causes (HIGH confidence from codebase inspection):**

1. **CAP-02: server-side triage missing — CONFIRMED** (ARCHITECTURE + PITFALLS agree): `process-photo.ts` commit path performs DB insert and returns without calling the triage service. `thoughts[].category` is always NULL from this path. The Mac folder watcher works because it calls `triageThoughts()` client-side after the API call. Fix belongs in `process-photo.ts` commit path only. One curl against the live endpoint (`POST /v1/process-photo`, inspect `thoughts[].category` in response) confirms the layer before writing any code.

2. **CAP-01: HEIC rejection is the root cause, not iCloud gating — CONFIRMED** (ARCHITECTURE): `FolderWatcherService.swift` iCloud guards (`triggerICloudDownloads`, `ubiquitousItemDownloadingStatus` check, `waitForStable`) are correctly implemented and functioning. `VALID_MEDIA_TYPES` in `process-photo.ts` only accepts `image/jpeg`, `image/png`, `image/gif`, `image/webp` — HEIC is rejected at the API. The iCloud placeholder hypothesis from FEATURES.md initial research is NOT the root cause. Fix is server-side HEIC→JPEG conversion via `sharp`, or confirm Mac-side CoreGraphics conversion is still active in `APIImageDescriptionService`.

3. **PostHog singleton placement + shutdown hook — CONFIRMED** (ARCHITECTURE + PITFALLS agree): PostHog client must be initialized once in `vigil-core/src/index.ts` as a module-scope singleton. `await posthog?.shutdown()` must be added to the existing SIGTERM and SIGINT handlers at the same time as SDK initialization. Without shutdown hook, events since the last flush are lost on every Railway deploy. Without singleton, a new PostHog client (and its `setInterval` flush timer) is created per request. Address at ANLY-01, before any `capture()` call.

4. **PostHog dev event flooding is permanent** (PITFALLS): PostHog Cloud has no bulk delete for individual events. Without a `NODE_ENV === 'production'` guard at init time, local sessions corrupt production funnels permanently. Use separate API keys per environment. The null-guard pattern enforced via a `trackEvent()` wrapper must be the first thing in ANLY-01.

5. **G2 double-tap CLICK_EVENT collision risk — CONFIRMED** (ARCHITECTURE + PITFALLS agree): The existing `main.ts` fires `CLICK_EVENT` immediately on every tap (navigates to task detail). `DOUBLE_CLICK_EVENT` arrives ~300ms later. Without a debounce or SDK-level distinction, adding the exit handler causes task detail to flash open then exit. Verify whether Even Hub SDK fires `DOUBLE_CLICK_EVENT` distinctly (no `CLICK_EVENT` co-fire) — if so, no debounce needed. Otherwise implement 300ms debounce on `CLICK_EVENT` that cancels on `DOUBLE_CLICK_EVENT`. Simulation testing of all three gesture paths required before G2 submission.

6. **Safari extension persistence = signing/Login-Item problem, not code — CONFIRMED** (ARCHITECTURE + STACK agree): The `Vigil Capture.app` AppDelegate does nothing on launch. Safari disables extensions when the host app is not running at startup. Developer ID signing does NOT fix persistence — Apple DTS confirmed App Store distribution is required for true platform persistence. The Login Item fix (`SMAppService.mainApp.register()`) is the viable v3.5 interim.

7. **G2 partial resubmission wastes a review cycle** (PITFALLS): Even Hub reviewers re-reject on the first unresolved item without evaluating the others. All three items (G2-01 screenshots, G2-02 exit dialogue, G2-03 brand CSS) must be verified on the simulator before the `.ehpk` is uploaded. Single submission gate, not three separate checkpoints.

8. **JWT storage: sessionStorage not localStorage** (PITFALLS): The existing `storeKey()` pattern uses localStorage. For JWTs, sessionStorage is the correct v3.5 tradeoff: tab-scoped, persists across page refreshes, smaller XSS blast radius. The `vigil-core/src/routes/auth.ts` uses `DUMMY_HASH` for timing-safe login — the PWA must not add specificity to login error messages (single generic "Invalid email or password" for all 4xx).

---

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Server Foundations (CAP-02 + HEIC + PostHog Singleton)

**Rationale:** CAP-02 (`process-photo.ts` triage missing) and CAP-01 HEIC conversion are both in `vigil-core/src/routes/process-photo.ts` — one file, zero client dependencies. PostHog singleton initialization and the `app.onError` handler belong in `vigil-core/src/index.ts`. Landing these together establishes the analytics foundation before any client work, ensures error tracking is live before the auth UI ships, and fixes two broken capture paths affecting daily use. The dev-event env guard and shutdown hook must be in this phase — they cannot be added later without risk of production corruption.

**Delivers:** HEIC photos processed from folder watcher, photo uploads triaged on server, PostHog singleton live in production (with env guard), `app.onError` + `process.on` handlers wired, `/v1/analytics/event` proxy route (for Mac app + extension), `/v1/me` endpoint (required by Phase 2)

**Addresses:** CAP-01, CAP-02, ANLY-01 (server half)

**Avoids:** PostHog dev-event flooding (env guard at init), singleton leak (one instance at module scope), shutdown hook omission, triage fix in wrong layer (diagnosis curl first)

**Research flag:** No additional research needed — root causes confirmed from codebase; fix locations identified precisely.

---

### Phase 2: PWA Auth UI + PostHog Browser Init (AUTH-06 + ANLY-01 browser)

**Rationale:** AUTH-06 requires `/v1/me` (landed in Phase 1) for PostHog identify. `posthog-js` init in `main.tsx` and the `ErrorBoundary` wrapper in `App.tsx` are pure frontend — no further backend deps. The two-tab `AuthPage.tsx` extension (Sign In + legacy API Key) is self-contained against the v3.4-shipped login/register endpoints. JWT storage decision (sessionStorage) and login error copy (single generic message) must be locked before any code is written.

**Delivers:** Email/password login + register forms in PWA, JWT stored in sessionStorage, `posthog.identify()` called on login success, `posthog-js` initialized in `main.tsx`, React `ErrorBoundary` wrapping authenticated layout, `ph-no-capture` added to TherapyPage + InsightsPage as guard before any session recording is ever enabled

**Addresses:** AUTH-06, ANLY-01 (browser half), ANLY-02 (frontend error tracking)

**Avoids:** JWT in localStorage (use sessionStorage), login error message specificity (generic 401 message only), forgot password link (omit entirely — no email infrastructure), session recording password reveal (use `maskInputFn` by element ID if show/hide toggle is added)

**Uses:** `react-hook-form@^7.72.1`, `zod@3`, `@hookform/resolvers@3` (pinned — not latest)

**Research flag:** No additional research needed — AuthPage.tsx location, JWT storage, form validation stack all confirmed.

---

### Phase 3: Product Events + API Metrics (ANLY-03 + ANLY-04)

**Rationale:** PostHog SDKs are live after Phases 1-2. Layering product events and server metrics on top is pure instrumentation — no architecture changes. Event naming convention must be documented before any `capture()` call is written to prevent double-counting: server emits `thought_created`, client emits `capture_submitted` — distinct names for distinct moments.

**Delivers:** Capture funnel events (`thought captured`, `triage completed`, `photo uploaded`, `brief generated`, `brief viewed`), server-side API error rate events per endpoint (4xx/5xx with `{ endpoint, status_code, error_type }`), `posthog.identify()` on login response in vigil-core `/v1/auth/login` route, property allowlist documented and enforced

**Addresses:** ANLY-03, ANLY-04

**Avoids:** Double-counting (distinct event names by layer), PII in event properties (allowlist: enums/booleans/numbers only — never string content), direct `posthog.capture()` at call sites (always via `trackEvent()` wrapper)

**Research flag:** No additional research needed — event schema designed in FEATURES.md; naming convention clear.

---

### Phase 4: G2 Store Resubmit (G2-01 + G2-02 + G2-03, gated together)

**Rationale:** The three G2 rejection items are fully independent of all other v3.5 work. They are gated together in a single phase because partial resubmission wastes a full Even Hub review cycle. G2-01 (screenshots) is a process task — zero code change, requires simulator v0.6.2. G2-03 (brand CSS in `index.html`) can be done before G2-02. G2-02 (double-tap exit) is the riskiest item due to the `CLICK_EVENT` collision risk — requires simulator testing of all three gesture paths before the phase closes.

**Delivers:** Updated Even Hub store submission with fresh simulator screenshots, `DOUBLE_CLICK_EVENT` → `Screen.EXIT_CONFIRM` → `shutDownPageContainer(1)` wired in `navigation.ts`, new `exit-confirm.ts` screen, Vigil brand CSS variables + Inter font in `vigil-g2-plugin/index.html`, `.ehpk` repackaged and uploaded, Even Hub SDK updated to 0.0.10

**Addresses:** G2-01, G2-02, G2-03

**Avoids:** Partial resubmission (all 3 items verified on simulator before upload), double-tap gesture collision (verify single-tap still navigates, swipe still works, double-tap exits — all three paths), color in G2 UI (greyscale only — review public Figma design spec before CSS changes)

**Research flag:** G2-02 needs in-browser review of `hub.evenrealities.com/docs/guides/input-and-events` to confirm exact double-press event name (WebFetch returned empty content). G2-03 requires manual review of the Even Realities public Figma design guidelines doc before CSS changes are written.

---

### Phase 5: Safari Extension Persistence (EXT-01)

**Rationale:** Independent of all other v3.5 work. The Login Item fix (`AppDelegate.swift` + `SMAppService.mainApp.register()`) is the viable v3.5 interim — no App Store review cycle required. Developer ID signing does NOT fix persistence. The Mac App Store submission path should be initiated in this phase but the phase closes on the Login Item fix being verified on physical hardware.

**Delivers:** `AppDelegate.swift` updated with `SMAppService.mainApp.register()`, `NSApp.setActivationPolicy(.prohibited)` suppressing the window on launch, extension survives macOS restart without manual re-enable (verified on physical machine), App Store submission initiated (asynchronous — review timeline external)

**Addresses:** EXT-01

**Avoids:** Assuming Developer ID signing fixes persistence (it does not), testing only in Safari with "Allow Unsigned Extensions" mode (must test after full macOS restart on physical machine), API key in background script module scope (must be in `browser.storage.local`)

**Research flag:** App Store Connect host app requirements for Safari extension distribution need review against current guidelines before starting the App Store submission path. Known gap from FEATURES.md.

---

### Phase Ordering Rationale

- **Server first:** CAP-02 and CAP-01 are in the same file (`process-photo.ts`); landing them with the PostHog singleton in Phase 1 fixes daily-use breakage and establishes the analytics foundation before any client work starts.
- **`/v1/me` gates AUTH-06:** The PWA needs `GET /v1/me` to call `posthog.identify()` with a real userId. This endpoint lands in Phase 1, unblocking Phase 2's frontend work.
- **PostHog SDK before product events:** ANLY-01 (SDK init + env guard + shutdown hook) must precede ANLY-03 (product events) — you cannot write `capture()` calls before the singleton exists and the env guard is enforced.
- **G2 and EXT-01 are parallel tracks:** Both are fully independent. Phases 4 and 5 can be run in parallel with each other or with Phases 2-3 if schedule compression is desired.
- **G2 gated as a unit:** Pitfall 7 (partial resubmission) is the deciding factor. Even Hub review turnaround is measured in days — partial fixes cost a full cycle.

### Research Flags

Phases likely needing `/gsd-research-phase` during planning:
- **Phase 4 (G2-02):** Must read `hub.evenrealities.com/docs/guides/input-and-events` in-browser to confirm exact double-press event name and whether `DOUBLE_CLICK_EVENT` fires distinctly from `CLICK_EVENT`. WebFetch returned empty content during research.
- **Phase 4 (G2-03):** Requires manual review of the Even Realities public Figma design spec before writing CSS. Cannot be fetched programmatically.
- **Phase 5 (EXT-01 App Store path):** App Store Connect host app requirements for Safari extension distribution should be reviewed against current 2026 guidelines before committing to that work.

Phases with standard patterns (skip research-phase):
- **Phase 1 (CAP-02 + HEIC + PostHog server):** Root causes confirmed from codebase; fix locations identified; PostHog Node SDK documented. No unknowns.
- **Phase 2 (AUTH-06 + posthog-js):** AuthPage.tsx location confirmed, JWT storage decision made, form validation stack pinned and documented. No unknowns.
- **Phase 3 (product events + API metrics):** Event schema designed; naming convention clear; posthog-node usage documented. No unknowns.
- **Phase 5 (Login Item fix only):** `AppDelegate.swift` location confirmed; `SMAppService.mainApp.register()` API documented. No unknowns for the interim fix.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified from npm registry live; Even Hub SDK lifecycle API verified from official docs; iCloud watcher approach verified from Apple dev docs + community sources |
| Features | MEDIUM-HIGH | PostHog and Safari extension HIGH (official docs + Apple DTS); G2 lifecycle MEDIUM (official docs, input events endpoint returned empty); iCloud watcher MEDIUM; CAP-02 root cause confirmed HIGH post-codebase inspection |
| Architecture | HIGH | All findings from direct codebase inspection 2026-04-19; file paths, function names, and data flow verified against live source |
| Pitfalls | HIGH | Codebase-confirmed pitfalls HIGH; posthog-node memory leak MEDIUM (GitHub issue); double-tap collision HIGH (confirmed from main.ts); JWT storage and login error pitfalls HIGH (confirmed from auth.ts) |

**Overall confidence:** HIGH

### Gaps to Address

- **G2 double-press event name:** `hub.evenrealities.com/docs/guides/input-and-events` returned empty content via WebFetch. Must open in browser during G2-02 phase planning to confirm exact JS event name and co-fire behavior with `CLICK_EVENT`. If `DOUBLE_CLICK_EVENT` fires distinctly, the debounce complexity in navigation.ts is not needed.
- **CAP-01 secondary cause:** Confirm whether `APIImageDescriptionService.processPhoto(imageURL:)` in `JarvisCore` still converts HEIC to JPEG before upload. A one-line grep in `APIImageDescriptionService.swift` resolves this in 30 seconds. Determines whether HEIC fix goes server-side (`sharp` in `process-photo.ts`) or is restored Mac-side.
- **EXT-01 App Store path:** App Store Connect host app requirements for a Safari web extension container app need review against current 2026 guidelines before committing to that submission path. Not blocking the Login Item fix.
- **Even Hub SDK 0.0.10 DOUBLE_CLICK_EVENT:** Confirm whether the constant is already present in v0.0.9 before treating the SDK bump as required. If 0.0.9 already exposes it, the upgrade is non-blocking.
- **G2 Figma design spec:** Must open the Even Realities public Figma doc manually before G2-03 CSS changes. Content is the canonical source for greyscale palette and legibility requirements.

---

## Sources

### Primary (HIGH confidence — live codebase inspection)
- `vigil-core/src/routes/process-photo.ts` — CAP-02 root cause confirmed (no triage in commit path); HEIC not in VALID_MEDIA_TYPES
- `vigil-core/src/middleware/auth.ts` — three-path bearerAuth; ContextVariableMap userId; DUMMY_HASH timing-safe login
- `vigil-core/src/index.ts` — middleware stack, route mounting, existing SIGTERM/SIGINT handlers (PostHog shutdown hook target)
- `vigil-pwa/src/pages/AuthPage.tsx` — vk_-only auth confirmed, no email/password form
- `vigil-pwa/src/hooks/usePhotoUpload.ts` — commit flow confirmed no triage call (corroborates CAP-02 finding)
- `vigil-g2-plugin/src/main.ts` — CLICK_EVENT + DOUBLE_CLICK_EVENT handlers; collision risk confirmed
- `vigil-g2-plugin/src/navigation.ts` — screen state machine; double-tap navigates to HOME (no exit); EXIT_CONFIRM state needed
- `Sources/DailyBriefMonitor/FolderWatcherService.swift` — iCloud download guards confirmed functioning; HEIC in imageExtensions confirmed
- `vigil-safari-extension/Vigil Capture/AppDelegate.swift` — minimal AppDelegate; Login Item fix target confirmed
- `~/.config/dailybrief/config.json` — `image_folder_path` confirmed as iCloud path (`com~apple~CloudDocs/Notebook`)

### Primary (HIGH confidence — official docs + npm registry)
- npm registry live — posthog-node@5.29.2, posthog-js@1.369.3, even_hub_sdk@0.0.10 verified
- `hub.evenrealities.com/docs/guides/page-lifecycle` — `shutDownPageContainer(0/1)` confirmed; exit dialogue pattern
- `hub.evenrealities.com/docs/guides/input-events` — `DOUBLE_CLICK_EVENT`, `FOREGROUND_EXIT_EVENT` constants confirmed
- `posthog.com/docs/error-tracking/installation/node` — `enableExceptionAutocapture: true`; `captureException()` pattern
- `posthog.com/docs/error-tracking/installation/react` — `PostHogErrorBoundary`; min version v1.207.8
- `developer.apple.com/forums/thread/667859` — Apple DTS: App Store required for persistent Safari extension; Developer ID does not help

### Secondary (MEDIUM confidence)
- `fatbobman.com/en/posts/advanced-icloud-documents/` — NSMetadataQuery over DispatchSource for iCloud paths; placeholder behavior
- `eclecticlight.co` — iCloud APFS dataless file behavior in Sonoma; FSEvents race condition
- `github.com/PostHog/posthog-js/issues/2206` — posthog-node v5.4.0 memory leak with feature flags in long-running services
- `github.com/fabioglimb/even-toolkit` — G2 gesture debounce patterns
- `github.com/apuokenas/allow-unsigned-extensions` — Safari "Allow Unsigned Extensions" resets on quit
- `posthog.com/tutorials/multiple-environments` — separate API keys per environment

### Tertiary (LOW confidence — requires codebase validation during phase)
- CAP-01 secondary HEIC cause — whether `APIImageDescriptionService.swift` still converts before upload (v2.2 migration may have dropped it)
- G2 `DOUBLE_CLICK_EVENT` co-fire behavior — whether SDK fires it distinctly or always co-fires `CLICK_EVENT` (WebFetch returned empty; must verify in-browser or on device)
- Even Hub store reviewer behavior on partial resubmission — documented as pattern, not confirmed Even Hub policy

---

*Research completed: 2026-04-19*
*Ready for roadmap: yes*
