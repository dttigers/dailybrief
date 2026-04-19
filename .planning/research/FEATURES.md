# Feature Research

**Domain:** v3.5 — Observability, G2 Resubmit & Capture Repair
**Researched:** 2026-04-19
**Confidence:** MEDIUM-HIGH overall (PostHog HIGH via official docs; Safari extension persistence HIGH via Apple DTS confirmation; G2 lifecycle MEDIUM via official docs; iCloud watcher MEDIUM via Apple dev resources; photo triage CAP-02 LOW — requires internal code audit to confirm root cause)

---

## Feature Area 1: PostHog Analytics Integration (ANLY-01..04)

### Table Stakes (Expected in Any Production Analytics Integration)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Automatic unhandled error capture | Any production app must catch uncaught JS errors | LOW | `capture_unhandled_errors: true` + `capture_unhandled_rejections: true` are PostHog SDK defaults — zero extra code. Set at SDK init in main.tsx. |
| Manual `captureException()` for known failure points | Claude API calls, triage flows, Railway calls can fail silently | LOW | Wrap existing try/catch blocks with `posthog.captureException(error, { custom_props })`. Use `captureException()` — never `posthog.capture('$exception')` which uses wrong format and skips source map processing. |
| Per-user event attribution | Need to correlate events to specific users for meaningful debugging | LOW | Call `posthog.identify(userId, { email })` immediately after JWT login succeeds in PWA. Use anonymous mode before login. Anonymous events cost ~4x less — only identify logged-in users. |
| Page-view / navigation tracking | Baseline traffic and feature usage visibility | LOW | PostHog JS SDK autocaptures pageviews automatically in SPA mode with `capture_pageview: true`. No extra code. |
| API error rate monitoring (server-side) | Blind to server-side failures without it | MEDIUM | Install `posthog-node` in vigil-core. Instrument Hono route error handlers to emit events. Track 4xx/5xx counts per endpoint with `{ endpoint, status_code, error_type }` properties. |

### Differentiators (What Adds Real Value at This Scale)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Product event funnel: capture → triage → view | Understand exactly where the ADHD capture flow breaks or succeeds | LOW | Use PostHog's standard `[object] [verb]` naming (see event table below). Fire on success only — not on initiation. |
| `PostHogErrorBoundary` React component | Catches React render crashes with component tree context automatically | LOW | Drop-in `<PostHogErrorBoundary>` wrapper around `<App />` in main.tsx. Pairs with any existing error boundaries. |
| Session recording — limited, masked | Replay exact PWA state when bugs are reported; no need to reproduce | LOW | Enable with ALL inputs masked (`maskAllInputs: true`). Add `ph-no-capture` CSS class to TherapyPage and InsightsPage containers — masked data is never sent over the network to PostHog per their privacy docs. Free tier: 5k recordings/month. |
| `$exception_fingerprint` custom grouping | Groups known error types (Claude timeouts, Railway cold-starts, iCloud watcher failures) so they don't create noise | LOW | Add fingerprint at `captureException` call site for predictable recurring errors. |

### Anti-Features (Do Not Build for v3.5)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Session recording on therapy/insights pages | "See exactly what users see" | These pages contain personal mental health content — recording is a serious privacy violation even for a personal app | Add `ph-no-capture` CSS class to TherapyPage and InsightsPage root divs before enabling recording |
| Feature flags | "Ship safely" | One developer, no A/B testing need, adds async flag-fetch latency to boot path | Defer to v3.6+ when there are actual rollout decisions to make |
| Self-hosted PostHog | Data sovereignty | $5k-15k/month infra + DevOps overhead; PostHog Cloud free tier covers 1M events + 5k recordings + 100k exceptions/month with no credit card required | Use PostHog Cloud — at ~5 users this will never leave the free tier |
| `capture_console_errors: true` | "Catch everything" | console.error fires on non-fatal React warnings and generates noise that buries real errors | Keep at `false` (the SDK default); rely on `captureException()` for intentional error signals |

### Standard Event Names for Vigil (PostHog "[object] [verb]" Convention)

| Event Name | When to Fire | Properties |
|------------|--------------|------------|
| `thought captured` | POST /v1/thoughts 200 | `{ source: 'text'|'voice'|'photo'|'browser_ext', category: null }` |
| `triage completed` | Triage PUT 200 | `{ category, confidence, duration_ms }` |
| `photo uploaded` | POST /v1/process-photo 200 | `{ paper_type, preview_mode: bool }` |
| `brief generated` | POST /v1/brief/generate 200 | `{ duration_ms }` |
| `brief viewed` | GET /v1/brief/:date 200 in PWA | `{ date }` |
| `chat message sent` | POST /v1/chat 200 | `{ has_thought_context: bool }` |
| `login succeeded` | POST /v1/auth/login 200 | (call `posthog.identify()` immediately after) |
| `login failed` | POST /v1/auth/login 401 | `{ reason: 'invalid_credentials'|'user_not_found' }` |

### Identification Pattern

- **Before login:** Anonymous (PostHog default). Do not call `identify()`.
- **After JWT login succeeds:** Call `posthog.identify(userId, { email })` immediately. Links all prior anonymous events.
- **On page load if JWT already stored:** Re-identify from stored user context so events are attributed across sessions.

### Dependency Chain

```
PostHog Cloud account
    └──requires──> posthog-js in vigil-pwa
    └──requires──> posthog-node in vigil-core

posthog.identify()
    └──requires──> AUTH-06 PWA login UI (JWT must be available)

Session recording
    └──requires──> ph-no-capture classes on TherapyPage + InsightsPage BEFORE recording enabled

API error tracking (server)
    └──requires──> posthog-node installed in vigil-core
```

---

## Feature Area 2: G2 Plugin Store Resubmit (G2-01..03)

### Table Stakes (Store Approval Requirements — Verified from Official Docs)

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| Latest simulator screenshots (G2-01) | Even Hub review team requires current-version screenshots | LOW | Use simulator v0.6.2 (confirmed from official docs). Export via simulator — outputs RGBA PNG at 576×288 px per eye. Must show all 3 screens (home, work orders, affirmation) + task detail screen. 4-bit greyscale (16 shades of green) — no color. |
| Exit dialogue via `shutDownPageContainer(1)` (G2-02) | Platform lifecycle compliance — apps must not exit abruptly | LOW | `shutDownPageContainer(0)` = immediate exit. `shutDownPageContainer(1)` = shows platform exit confirmation dialog. The "double-tap exit" maps to a `double press` gesture event from the temple touchpad per Input & Events guide. Wire double-press handler → `shutDownPageContainer(1)`. |
| Brand-compliant WebView content (G2-03) | Even Hub design guidelines enforce the 4-bit greyscale palette and legibility standards | MEDIUM | Display constraint: 576×288 px/eye, 4-bit greyscale only — no color values in CSS. Official design spec is a public Figma doc titled "Even-Realities---Software-Design-Guidelines--Public-" linked from overview docs. Review UI/UX Design Guidelines at hub.evenrealities.com/docs/guides/ui-ux-design-guidelines before making CSS changes. |
| Correct `.ehpk` packaging | Required distribution format | LOW | `evenhub pack app.json dist -o myapp.ehpk` then upload `.ehpk` via Even Hub dev portal. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Graceful empty state (no work orders) | Prevents blank screen during reviewer's evaluation | LOW | If work orders list is empty, show "No active work orders" message rather than an empty layout |
| Smooth swipe navigation still functional | Polished UX that reviewers compare against baseline | LOW | Shipped in v2.2 — verify still functional on simulator v0.6.2 before resubmit |
| Fast text updates via `textContainerUpgrade` | Avoids full-screen flicker when updating content | LOW | Use `textContainerUpgrade` for in-place text changes instead of `rebuildPageContainer` which causes a visible full-redraw flicker on hardware |

### Anti-Features (G2 Scope)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Live API data requiring auth during review | "Show real content" | Reviewer won't have Vigil credentials — auth errors produce a blank/broken screen | Ensure API errors show a readable "Connect to Vigil" or "Unable to load" message, not a blank screen |
| Color in the UI | Matches Vigil brand teal | G2 display is 4-bit greyscale — any color CSS renders as an undefined shade of green | Use only greyscale values that map cleanly to 16-shade greyscale palette |

### G2 Display Constraints (Confirmed from Official Docs)

- Resolution: 576 × 288 px per eye
- Color: 4-bit greyscale, 16 shades of green only
- Input: Temple touchpad — press, double press, swipe (R1 ring optional with same gestures)
- Simulator version for screenshots: v0.6.2
- Lifecycle: `createStartUpPageContainer` called once at startup; `shutDownPageContainer(1)` for exit with confirmation
- Fast updates: use `textContainerUpgrade` to modify text in-place without flicker

### Dependency Chain

```
G2-01 (screenshots)
    └──requires──> Simulator v0.6.2 installed + app renders without auth errors

G2-02 (exit dialogue)
    └──requires──> Input & Events guide: double-press event wired to shutDownPageContainer(1)

G2-03 (brand compliance)
    └──requires──> CSS audit: no color values; audit against design guidelines Figma doc
    └──requires──> UI/UX Design Guidelines reviewed at hub.evenrealities.com/docs/guides/ui-ux-design-guidelines

All three
    └──requires──> .ehpk repackaged after all fixes + uploaded via Even Hub portal
```

---

## Feature Area 3: AUTH-06 PWA Login/Register UI

### Table Stakes (Backend Shipped in v3.4 — UI Only)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Email + password login form | Core auth UX — POST /v1/auth/login exists | LOW | Email input, password input with show/hide toggle, submit button. Store returned JWT in localStorage (same pattern as existing vk_ key storage). |
| Registration form | New user path — POST /v1/auth/register exists | LOW | Email, password, confirm-password fields. Inline validation before submit. |
| Client-side form validation | Prevent pointless round-trips | LOW | Email format, password minimum length, password confirmation match — all client-side. |
| Auth error display | User must see failure reason | LOW | Surface server error message (invalid credentials, email already taken) in the form, not just in the console. |
| JWT persistence across page loads | Stay logged in | LOW | Store JWT in localStorage with expiry check. Same pattern already used for vk_ bearer key. |
| Logout action | User must be able to sign out | LOW | Clear JWT from localStorage, reset PostHog identity (`posthog.reset()`), redirect to /login. |
| Route protection | Prevent unauthenticated access to app pages | LOW | React Router guard: if no valid JWT in localStorage, redirect to /login before rendering any protected page. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Seed-user claim flow surface | v3.4 ships D-11 claim-flow on backend — existing users with vk_ keys need a migration path | MEDIUM | On login success, if server response contains `claim_token` field, show "This account has existing data — link it?" prompt. POST claim to complete migration. Backend contract is in Phase 102 D-11 implementation. |
| PostHog identify on login | Links all prior anonymous analytics events to the user account | LOW | Call `posthog.identify(userId, { email })` immediately after successful login. Depends on ANLY-01. |
| "Remember me" (sessionStorage fallback) | Reduces re-login friction — especially relevant for ADHD user who opens PWA across browser sessions | LOW | If unchecked: store JWT in sessionStorage only (cleared on tab close). If checked: store in localStorage (persists). Default: localStorage (existing behavior). |

### Anti-Features (AUTH-06 Scope)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Passkeys / WebAuthn | "Modern passwordless" | Requires Relying Party server implementation not in v3.4 backend; browser support inconsistent in PWA standalone mode | Defer to v3.6+ as a differentiator once password flow is stable |
| Magic link / email OTP | "Passwordless convenience" | Requires transactional email service (SendGrid etc.) — not in stack; adds infra dependency | Defer; email + password is sufficient for ~5-user system |
| SSO (Google login for user accounts) | "Sign in with Google" | Distinct from Google Calendar OAuth already in stack — needs separate OAuth client, consent screen, identity mapping to users table | Defer; seed user + manual registration is sufficient for v3.5 |
| Forgot password flow | Expected web UX pattern | Requires transactional email; backend /v1/auth/reset-password not built in v3.4 | Defer to v3.6 with transactional email. Document explicitly as known gap in v3.5. |
| Email verification on registration | Security best practice | Same email infra dependency | Defer; acceptable for closed ~5-user personal system |

### Dependency Chain

```
AUTH-06 PWA login/register UI
    └──requires──> v3.4 POST /v1/auth/login + /register (SHIPPED in v3.4 Phase 102)
    └──requires──> JWT storage pattern (already used for vk_ key — same localStorage approach)
    └──requires──> React Router (already in vigil-pwa)

Seed-user claim flow UI
    └──requires──> D-11 claim_token in login response (v3.4 Phase 102 backend contract)

PostHog identify on login
    └──requires──> ANLY-01 PostHog SDK installed first

Route protection
    └──requires──> React Router guards — no new libraries needed
```

---

## Feature Area 4: EXT-01 Persistent Safari Extension

### Root Cause Analysis (Verified: Apple DTS Confirmation)

The core issue is architectural, not fixable in extension code. Apple DTS has officially stated: **"Safari Web Extensions must be distributed via the App Store."** Safari will not persistently enable a Developer ID-signed or locally-built Safari web extension. The "Allow Unsigned Extensions" toggle in Safari > Develop resets on every Safari quit — this is intentional security design, not a bug.

| Distribution Method | Persists Across Restart | Notes |
|--------------------|-------------------------|-------|
| Mac App Store distribution | YES — persistent | Requires Apple review, $99/yr membership, host macOS app wrapper |
| Developer ID signed + notarized | NO | Apple DTS confirmed: notarization does not help for web extensions specifically |
| Unsigned local Xcode build | NO | Resets on every Safari quit |

"Allow in Private Browsing" — affects whether extension runs in private windows. Unrelated to persistence.
"Always Allow on Every Website" — affects site permissions scope. Unrelated to persistence.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Extension survives Safari restart without manual re-enable | The whole point of EXT-01 — re-enabling on every launch is unusable | HIGH | Only real solution: Mac App Store submission. Platform constraint, not a code fix. |
| Toolbar icon present and active after restart | User-visible signal that extension is working | LOW | Already exists — goal is that it not be grayed out after restart |
| Service worker handles messages correctly | Extension logic runs when popup is opened | MEDIUM | Safari service worker lifetime is shorter than Chrome — use message passing from popup; do not rely on persistent service worker background state |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Mac App Store distribution | Only path to true persistence; resolves the root cause | HIGH | Requires: App Store Connect setup, extension bundled in a macOS host app, Apple review (1-2 week turnaround), $99/yr Apple Developer Program membership (confirm already enrolled) |
| LaunchAgent + AppleScript workaround (interim) | Automates re-enabling on every Safari open without manual steps | MEDIUM | A LaunchAgent watches for Safari launch and runs an AppleScript that navigates to Develop > Allow Unsigned Extensions. Fragile but functional for personal use while App Store review proceeds. See: github.com/apuokenas/allow-unsigned-extensions for reference implementation. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| "Just sign it with Developer ID" | Seems like it should fix it | Apple DTS explicitly confirmed Developer ID does not help for web extensions — notarized apps still cannot bypass the reset behavior | Must use Mac App Store distribution for true persistence |
| Attempt to persist via background service worker keep-alive | "Keep extension alive across restarts" | Safari terminates service workers aggressively; no keep-alive mechanism persists through browser quit | App Store distribution is the only real fix |

### Realistic v3.5 Scope

Two sub-deliverables:
1. **LaunchAgent/AppleScript workaround** — buildable in one phase, provides immediate improvement for personal dev use
2. **Mac App Store submission** — correct long-term fix, but review timeline (~1-2 weeks) is outside developer control; submit in v3.5, merge as done when approved

### Dependency Chain

```
EXT-01 true persistence
    └──requires──> Mac App Store submission
    └──requires──> App Store Connect account + host macOS app wrapper
    └──requires──> Apple Developer Program membership ($99/yr — confirm active)
    └──external──> Apple review cycle (1-2 weeks, cannot be rushed)

EXT-01 interim workaround
    └──requires──> LaunchAgent plist + AppleScript watching for Safari process
    └──risk──> macOS Automation permissions may prompt user on first run
    └──conflicts──> macOS security settings may block AppleScript access to Safari Develop menu
```

---

## Feature Area 5: Photo Capture Repair (CAP-01, CAP-02)

### CAP-01: iCloud Folder Watcher Broken on iCloud Path

**Root cause categories (verified from Apple developer resources):**

| Failure Category | What Happens | How to Detect |
|-----------------|--------------|---------------|
| Placeholder / evicted file | DispatchSource fires when a file appears in iCloud path, but the file is a dataless stub — data still in cloud | `URLResourceKey.ubiquitousItemDownloadingStatusKey` returns `.notDownloaded` |
| APFS dataless file (macOS Sonoma+) | In Sonoma, evicted files appear as real filesystem entries with attributes and extended-attrs but zero data extents — `fileExists` returns `true` but content reads as empty | File exists, 0 bytes, `ubiquitousItemDownloadingStatusKey` not `.current` |
| iCloud sync throttling | iCloud materializes files in chunks; DispatchSource fires multiple times on the same file as it downloads | File exists but size changes between DispatchSource events |
| DispatchSource not iCloud-aware | DispatchSource vnode events fire on placeholder file appearance, not on full download completion — no built-in way to distinguish | DispatchSource fires, FileManager.fileExists = true, content = empty or partial |

**Correct fix:** After DispatchSource fires on an iCloud path, check `URLResourceKey.ubiquitousItemDownloadingStatusKey` before processing. If `.notDownloaded`, call `FileManager.default.startDownloadingUbiquitousItem(at:)` wrapped in `NSFileCoordinator`, then wait for `NSMetadataQueryDidUpdateNotification` with status `.current` before processing the file.

**Alternative approach:** Replace DispatchSource with `NSMetadataQuery` scoped to `NSMetadataQueryUbiquitousDocumentsScope` as the primary watcher. NSMetadataQuery is purpose-built for iCloud paths, surfaces `ubiquitousItemDownloadingStatusKey` natively, and fires `NSMetadataQueryDidUpdateNotification` on download completion. DispatchSource is not iCloud-aware.

**Critical warning:** Do NOT use `NSFileCoordinator` with `evictUbiquitousItem` — documented deadlock risk per Apple developer resources.

### Table Stakes (CAP-01)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Check download status before processing iCloud files | Without this, watcher reads empty/partial file and submits garbage to Claude API | MEDIUM | Add `ubiquitousItemDownloadingStatusKey` check after DispatchSource event. If not `.current`, call `startDownloadingUbiquitousItem` and defer processing until `NSMetadataQueryDidUpdateNotification` fires. |
| Menu bar error state when watch path file fails | Already exists for missing paths (v2.4) — must also fire for empty-content scenario | LOW | Ensure error state triggers when file content is 0 bytes after download attempt, not only when file doesn't exist. |
| Skip duplicate processing on same file | Throttling causes multiple DispatchSource events per file download | LOW | Already exists per v2.4 auto-delete pattern — verify guard fires before download attempt, not just after processing. |

### CAP-02: Manual Photo Upload Skipping Triage

**Root cause categories (LOW confidence — requires code audit to confirm):**

| Category | What Happens | Likelihood |
|----------|--------------|------------|
| Missing await on triage call | `/v1/process-photo` creates the thought row and returns 200, but the Claude triage call is fire-and-forget — if it errors silently, thought lands with `category: null` | HIGH — most common async Node.js mistake |
| Race condition: response before triage completes | Client receives 200 OK (thought created), user navigates away, no polling for triage result, thought shows as uncategorized forever | MEDIUM |
| Silent Claude API error swallowed in catch | Claude API returns 4xx/5xx for the photo, error is caught and swallowed, thought inserted without category | MEDIUM |
| Triage result not applied to DB row | Triage returns category but the Drizzle UPDATE call is missing or conditional | MEDIUM |
| FormData parsing in Hono | `c.req.parseBody()` returns undefined for file field if Content-Type boundary is malformed by PWA client | LOW |

**Recommended fix:** Add `posthog.captureException` around the triage call to confirm which failure is actually occurring before patching. Then: ensure the Claude triage call is awaited inside `/v1/process-photo`, return `{ thought_id, category, confidence }` in the response body (not fire-and-forget), and surface triage errors in the response so the PWA can show "Triage failed — tap to retry."

### Table Stakes (CAP-02)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Triage result returned synchronously in upload response | User expects to see category immediately after uploading a photo | LOW | `POST /v1/process-photo` must await triage and return `{ thought_id, category, confidence }` — not fire-and-forget. Audit the actual await chain in the endpoint handler. |
| Error surfaced when triage fails | Silent failure leaves thought uncategorized with no feedback | LOW | If Claude returns an error: insert thought with `category: 'uncategorized'`, return 200 with `{ triage_error: 'claude_api_failure' }` so PWA can show "Triage failed — tap to retry" |
| Retry triage for failed photos | User shouldn't have to re-upload the photo | LOW | Manual re-triage button (v1.3) already exists — verify it works on thoughts with `category: null` from failed triage |

**Note:** ANLY-02 error tracking should be instrumented on the photo upload path BEFORE fixing CAP-02. The PostHog error data will confirm the actual root cause rather than requiring a guess.

### Dependency Chain

```
CAP-01 (iCloud watcher)
    └──requires──> NSMetadataQuery or ubiquitousItemDownloadingStatusKey check in Swift folder watcher
    └──requires──> startDownloadingUbiquitousItem call + NSMetadataQueryDidUpdateNotification wait
    └──based-on──> existing DispatchSource watcher in v2.4 — surgical fix, not full rewrite

CAP-02 (manual upload triage)
    └──requires──> code audit of /v1/process-photo await chain in vigil-core
    └──benefits-from──> ANLY-02 PostHog error tracking to confirm root cause before patching
    └──uses──> existing manual re-triage button (v1.3)
```

---

## Cross-Feature Dependency Map

```
ANLY-01 (PostHog SDK install — both posthog-js + posthog-node)
    └──enables──> ANLY-02 (error tracking — automatic + manual captureException)
    └──enables──> ANLY-03 (product events)
    └──enables──> ANLY-04 (API metrics via posthog-node)
    └──enables──> posthog.identify() after AUTH-06 login

AUTH-06 (PWA login/register UI)
    └──requires──> v3.4 backend (SHIPPED)
    └──enables──> posthog.identify() (after ANLY-01)
    └──unblocks──> proper per-user event attribution in analytics

CAP-02 (upload triage repair)
    └──benefits-from──> ANLY-02 error tracking (confirms root cause)
    └──independent from all other v3.5 features

CAP-01 (iCloud watcher)
    └──independent from all other v3.5 features (pure Swift fix)

G2-01/02/03 (store resubmit)
    └──independent from other features
    └──G2-02 requires──> Input & Events guide (double-press event wiring)
    └──G2-03 requires──> UI/UX Design Guidelines doc reviewed before CSS changes

EXT-01 (Safari persistence)
    └──independent from other features
    └──true fix requires──> App Store submission (external Apple review timeline)
    └──interim requires──> LaunchAgent AppleScript workaround
```

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| CAP-01 iCloud watcher repair | HIGH — broken daily-use feature | MEDIUM | P1 |
| CAP-02 photo upload triage fix | HIGH — photos land uncategorized silently | LOW (after code audit) | P1 |
| ANLY-01/02 PostHog SDK + error tracking | HIGH — currently debugging blind | LOW | P1 |
| AUTH-06 PWA login/register UI | HIGH — closes multi-user loop from v3.4 | LOW | P1 |
| G2-01/02/03 store resubmit | HIGH — unblocks store approval | LOW-MEDIUM | P1 |
| ANLY-03 product events | MEDIUM — visibility into capture funnel | LOW | P2 |
| ANLY-04 API metrics (server-side) | MEDIUM — operational visibility | MEDIUM | P2 |
| EXT-01 LaunchAgent workaround | MEDIUM — improves personal dev experience | MEDIUM | P2 |
| EXT-01 App Store submission | HIGH long-term — only real persistence fix | HIGH (external timeline) | P2 |
| Session recording masked | LOW at 5-user scale | LOW | P3 |
| Feature flags | LOW — no rollout decisions needed | LOW | Defer to v3.6 |

**Priority key:**
- P1: Must have for v3.5 milestone
- P2: Should ship in v3.5, add when core is done
- P3: Nice to have, future consideration
- Defer: Explicitly out of v3.5 scope

---

## Known Gaps (Require Phase-Level Investigation)

- **CAP-02 actual root cause:** The failure mode is one of 4-5 candidates. Must audit `/v1/process-photo` handler and the Claude triage call's await chain before writing a fix. ANLY-02 error tracking should go in first to surface the real error.
- **G2 brand compliance specifics:** The public Figma design spec exists but cannot be fetched programmatically. Must open the Figma doc manually before writing CSS changes for G2-03.
- **G2 double-press event name:** Input & Events guide endpoint returned empty content via WebFetch. Must read `hub.evenrealities.com/docs/guides/input-and-events` in-browser to get the exact JS event name for double-press before wiring G2-02.
- **EXT-01 App Store host app requirements:** The host macOS app wrapper requirements for App Store Safari extension distribution need review against current App Store Connect guidelines before starting that work.
- **Forgot password:** Explicitly deferred — no email infra. Document as known gap in v3.5 release notes.

---

## Sources

- PostHog error tracking: https://posthog.com/docs/error-tracking/capture (HIGH — official docs)
- PostHog event naming: https://posthog.com/docs/product-analytics/capture-events (HIGH — official docs)
- PostHog session recording privacy: https://posthog.com/docs/session-replay/privacy (HIGH — official docs)
- PostHog anonymous vs identified: https://posthog.com/docs/data/anonymous-vs-identified-events (HIGH — official docs)
- PostHog pricing / free tier: https://posthog.com/pricing (HIGH — 1M events + 5k recordings + 100k exceptions free per month confirmed)
- Even Realities page lifecycle: https://hub.evenrealities.com/docs/guides/page-lifecycle (MEDIUM — shutDownPageContainer(0/1) confirmed from docs)
- Even Realities simulator docs: https://hub.evenrealities.com/docs/reference/simulator (MEDIUM — v0.6.2 confirmed)
- Even Realities overview + display constraints: https://hub.evenrealities.com/docs/getting-started/overview (MEDIUM — 576x288, 4-bit greyscale confirmed)
- Safari extension persistence — Apple DTS: https://developer.apple.com/forums/thread/667859 (HIGH — DTS confirmation that App Store is required)
- "Allow Unsigned Extensions" reset behavior: https://github.com/apuokenas/allow-unsigned-extensions (HIGH — reset on every Safari quit confirmed)
- LaunchAgent workaround reference: https://github.com/apuokenas/allow-unsigned-extensions
- iCloud placeholder detection via NSMetadataQuery: https://fatbobman.com/en/posts/advanced-icloud-documents/ (MEDIUM — aligns with Apple developer docs)
- iCloud Drive Sonoma FileProvider eviction: https://eclecticlight.co/2023/11/21/icloud-drive-in-sonoma-fileprovider-and-eviction/ (MEDIUM)
- PWA auth best practices: https://www.authgear.com/post/login-signup-ux-guide (MEDIUM)

---
*Feature research for: Vigil v3.5 — Observability, G2 Resubmit & Capture Repair*
*Researched: 2026-04-19*
