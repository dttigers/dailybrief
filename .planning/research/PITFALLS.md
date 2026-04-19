# Pitfalls Research

**Domain:** v3.5 Observability, G2 Resubmit & Capture Repair — adding analytics, store resubmit, PWA auth UI, Safari extension persistence, photo pipeline repair to existing Vigil platform
**Researched:** 2026-04-19
**Confidence:** HIGH (codebase-verified pitfalls) / MEDIUM (PostHog docs + known GitHub issues) / LOW (Even Hub store policy — not publicly documented)

---

## Critical Pitfalls

### Pitfall 1: PostHog Flooding Dev Events into Production Project

**What goes wrong:**
`posthog-node` initialized once at server startup in `vigil-core/src/index.ts`. Without a `NODE_ENV` guard, every `npm run dev`, local curl, and automated test run pollutes the production PostHog project with synthetic events. Funnels, retention charts, and cohort analyses become permanently corrupted — PostHog Cloud has no bulk delete for individual events.

**Why it happens:**
Developers wire up PostHog to get a "works in dev" green light, then ship without the env guard because Railway uses `NODE_ENV=production` so the dev machine never triggers the production issue. Corruption is invisible until weekly active user counts include localhost sessions.

**How to avoid:**
Use **separate PostHog API keys per environment** (not one project with internal filters). Gate at init time, before any route is wired:
```typescript
// vigil-core: PostHog init guard
const posthog = process.env.NODE_ENV === 'production' && process.env.POSTHOG_API_KEY
  ? new PostHog(process.env.POSTHOG_API_KEY, { host: 'https://us.i.posthog.com' })
  : null;
```
Never call `posthog.capture()` directly at call sites. Always use a `trackEvent(name, props)` wrapper that applies the null check so the guard is enforced everywhere automatically.

**Warning signs:**
- PostHog dashboard shows events timestamped during local dev sessions or CI runs
- `distinct_id` values contain `localhost` or a developer's email
- Event count spikes that align with deploy times rather than real usage windows

**Phase to address:** ANLY-01 (PostHog integration setup) — env guard must exist before the first `capture()` call

---

### Pitfall 2: PII in Event Properties — Therapy Notes, Thought Content, Emails

**What goes wrong:**
Vigil's core data is highly sensitive: therapy notes, personal thoughts, mood states, handwritten journal transcriptions. If a developer passes `thought.content` or email subjects as an event property when tracking "thought captured," that text goes to PostHog Cloud verbatim and is stored indefinitely. This is not a GDPR technicality — it is actual private health-adjacent information.

**Why it happens:**
When debugging capture pipeline metrics, the instinct is to add thought content to the event to correlate events with specific thoughts in PostHog. The same reflex leaks work email subjects, therapy session prep text, and handwritten note transcriptions.

**How to avoid:**
Define a **property allowlist before writing any `capture()` calls**. Safe properties for thought events are structural metadata only:
```typescript
posthog?.capture('thought_created', {
  distinct_id: userId,          // OK: opaque ID
  category: result.category,   // OK: enum value
  source: thought.source,       // OK: enum (voice/image/text)
  confidence: result.confidence, // OK: number
  has_image: true,              // OK: boolean
  // NEVER: content, transcript, email_subject, rawText, notes
})
```
Add a code review checklist item: "No string properties from user-generated content in PostHog calls."

**Warning signs:**
- Any PostHog event property with a string value longer than ~20 characters
- Properties named `content`, `text`, `transcript`, `subject`, `body`, `notes`
- PostHog People page showing personal details about the real user

**Phase to address:** ANLY-01 (property schema must be documented before any capture call is written)

---

### Pitfall 3: Double-Counting When Server and PWA Both Track the Same Event

**What goes wrong:**
`thought_captured` (or any user action) can be emitted from both the PWA's CaptureBar submit handler AND from `vigil-core`'s `POST /v1/thoughts` route. Same `distinct_id` on both events. PostHog counts two events per user action. Retention, funnel, and cohort analyses are permanently doubled with no way to fix historical data.

**Why it happens:**
PostHog's documentation recommends tracking on both client and server "for reliability" but buries the critical caveat: use different event names. Developers read "track everywhere" and implement identical event names on both layers.

**How to avoid:**
Name events by layer and semantic role:
- Server: `thought_created` (fires when DB insert succeeds — ground truth for successful capture)
- Client: `capture_submitted` (fires when user presses submit — measures UI engagement)

These are distinct moments. Document the naming convention in the ANLY-01 phase plan before any implementation starts.

**Warning signs:**
- Event counts are exactly double expected values
- Two events appear in the same PostHog session within milliseconds with identical properties
- Server and client both emit an event named `thought_captured`

**Phase to address:** ANLY-01 (naming convention document created before any implementation)

---

### Pitfall 4: Session Recording Capturing the "Show Password" Toggle

**What goes wrong:**
PostHog session replay masks `type="password"` inputs by default. But the common UX pattern of a "show password" eye button temporarily changes `input.type` from `"password"` to `"text"`. The moment the type switches to `"text"`, PostHog's default masking no longer applies — the actual password is recorded in plaintext in session replays.

**Why it happens:**
Developers test that the field is masked on initial load (`type="password"` → masked, looks good), then ship without testing the revealed state. The PostHog GitHub issue tracker documents this as a known gotcha: masking checks `type` attribute, not semantic purpose.

**How to avoid:**
Option A — Do not implement a show/hide password toggle in AUTH-06 (simplest, appropriate for a private app with one user). Option B — Use `maskInputFn` to unconditionally mask by element `id`:
```typescript
maskInputFn: (text, element) => {
  if ((element as HTMLElement).id === 'password') return '*'.repeat(text.length);
  return text;
}
```
Option C — Use CSS `-webkit-text-security` to show bullets without changing `input.type`.

**Warning signs:**
- Session replay shows password field unmasked after user clicks the show/hide toggle
- `input.type` is changed to `"text"` programmatically anywhere in the auth form code

**Phase to address:** AUTH-06 (PWA login/register UI) — before session recording is enabled

---

### Pitfall 5: posthog-node Memory Leak in Long-Running Vigil Core

**What goes wrong:**
posthog-node v5.4.0 has a documented memory leak in long-running Node.js services using feature flag evaluation — reported August 2025 on the PostHog GitHub tracker. Memory grows steadily over days until OOM or Railway restarts the container. Even without feature flags, if `shutdown()` is not called on SIGTERM, the SDK's `setInterval` flush timer and pending HTTP connections are never cleaned up, and queued events since the last flush are silently dropped.

**Why it happens:**
The SDK batches events via `setInterval`. Vigil Core is a persistent server (not serverless), started once by Railway. The current `SIGTERM`/`SIGINT` handlers in `vigil-core/src/index.ts` call `generateScheduler.stop()` and `closeConnection()` but there is no `posthog.shutdown()` call — it simply does not exist yet because PostHog is not integrated yet.

**How to avoid:**
- Do not use PostHog **feature flags** — Vigil Core has no feature flag requirements; skip that SDK capability entirely (avoids the leak entirely)
- Create the PostHog client as a singleton at module scope in `index.ts` — one instance, not per-request
- Add `await posthog?.shutdown()` to the existing SIGTERM and SIGINT handlers before `process.exit(0)`
- In Vitest tests: mock the PostHog client entirely; never initialize a real SDK instance in test files (leaked intervals cause `--detectOpenHandles` failures)

**Warning signs:**
- Railway memory graph shows steady upward trend decoupled from request volume
- Vitest output shows open handle warnings mentioning PostHog timers
- posthog-node version is 5.x and feature flags are configured

**Phase to address:** ANLY-01 (SDK initialization) — shutdown hook must be added at the same time

---

### Pitfall 6: PostHog in the Safari Extension Blocked as a Tracker

**What goes wrong:**
If the Safari extension content script sends events to `us.i.posthog.com`, Safari's Intelligent Tracking Prevention (ITP) will block the request. PostHog's domain is on major tracker blocklists (uBlock Origin, AdGuard). The request is silently dropped — no error surfaced to the developer. The extension's analytics appear to work in Chrome (where the developer tested) and silently fail in Safari (where the extension actually lives).

**Why it happens:**
Developers test PostHog in a Chrome extension context and assume the same code works in Safari. ITP is stricter. Also, MV3 content scripts cannot load remote scripts, so posthog-js must be bundled locally — but even bundled, outbound requests to posthog.com are blocked by tracker lists.

**How to avoid:**
Do not add PostHog to the Safari extension content script at all. The extension's purpose is URL capture and quick thought submission — not analytics. Track extension-sourced events server-side in Vigil Core: when `POST /v1/thoughts` arrives with a `User-Agent` header identifying the extension (or an `X-Client: safari-extension` header), emit the server-side `thought_created` event with `source: 'extension'`. Zero client-side PostHog in the extension.

**Warning signs:**
- `posthog` imported anywhere in the extension's `src/` directory
- Extension analytics appear in Chrome but not Safari PostHog sessions
- Safari Network Inspector shows blocked requests to `*.posthog.com` from extension context

**Phase to address:** ANLY-01/ANLY-02 — explicitly exclude extension from client-side PostHog scope in the phase plan

---

### Pitfall 7: G2 Resubmit With Only 2 of 3 Rejection Items Fixed

**What goes wrong:**
The three G2 rejection items (G2-01: screenshots, G2-02: double-tap exit, G2-03: WebView brand compliance) must all be resolved before resubmission. Even Hub reviewers re-reject on the first unresolved item without checking the others. A partial fix wastes a full review cycle — Even's small team means review turnaround is measured in days.

**Why it happens:**
Developers fix the easiest items first (G2-01 screenshots is purely mechanical: take new screenshots) and resubmit hoping to get confirmation before tackling harder items. This is an optimization trap: partial fixes get a full-cycle rejection, same wait as the original.

**How to avoid:**
All three G2 items must be gated together in a single phase. The phase cannot be marked complete or submitted until all three checklist items are verified on the simulator:
- [ ] Simulator screenshots captured from the current Even Realities iPhone app version
- [ ] Double-tap exit implemented via `DOUBLE_CLICK_EVENT` in the Even Hub SDK lifecycle (not a custom setTimeout hack)
- [ ] WebView content uses Vigil brand colors (`#1D9E75` teal, Inter font) with no blank or placeholder states

**Warning signs:**
- Phase plan separates G2-01, G2-02, G2-03 into separate phases with separate "done" criteria
- A G2 item is marked complete before the others are verified on the simulator
- Phase plan says "submit after screenshots are ready" without waiting for the full set

**Phase to address:** Dedicated G2 resubmit phase — all three items gated together before submission

---

### Pitfall 8: Double-Tap Gesture Collision with Existing Tap-Expand / Swipe UX

**What goes wrong:**
The v2.2 G2 plugin uses `CLICK_EVENT` (single tap) to navigate to task detail, and `SCROLL_TOP_EVENT`/`SCROLL_BOTTOM_EVENT` (swipe) to navigate between screens. Adding a `DOUBLE_CLICK_EVENT` handler for exit creates a timing conflict: the SDK fires `CLICK_EVENT` first, then `DOUBLE_CLICK_EVENT` ~300ms later. If the existing `CLICK_EVENT` handler in `vigil-g2-plugin/src/main.ts` runs before the double-tap is recognized, the user is navigated into task detail and then immediately exited — a visible flash of incorrect state.

**Why it happens:**
The `DOUBLE_CLICK_EVENT` docs are read in isolation without mapping timing against the existing unconditional `CLICK_EVENT` handler. The current `main.ts` has: `if (event.listEvent?.eventType === OsEventTypeList.CLICK_EVENT)` — this fires immediately on every click with no double-tap window.

**How to avoid:**
Implement a debounce at the event handler level: on `CLICK_EVENT`, set a 300ms timer before navigating; if `DOUBLE_CLICK_EVENT` arrives within that window, cancel the single-tap action and execute exit instead. Alternatively, check whether the Even Hub SDK fires `DOUBLE_CLICK_EVENT` as a distinct event that does not also fire `CLICK_EVENT` — if so, no debounce is needed.

Verify on the simulator before submission:
1. Single tap on a work order → task detail (no double-tap bleed)
2. Double tap on home screen → exit plugin (confirmed via lifecycle event log)
3. Swipe still navigates between home/affirmation screens (no regression)

**Warning signs:**
- Task detail screen opens and immediately closes when double-tapping
- The Even Hub simulator event log shows CLICK_EVENT firing milliseconds before DOUBLE_CLICK_EVENT on the same gesture
- Swipe navigation stops working after the double-tap handler is added

**Phase to address:** G2-02 (double-tap exit dialogue)

---

### Pitfall 9: JWT Stored in localStorage — XSS Exposure on PWA Login

**What goes wrong:**
The existing `AuthPage.tsx` calls `storeKey()` to persist the API key, almost certainly in localStorage or sessionStorage. When AUTH-06 adds email+password login with JWT, extending the same storage pattern to the JWT means any XSS vulnerability in the PWA (including in a third-party dependency) can exfiltrate the token. With a JWT, an attacker can authenticate as the user to Vigil Core for the full token lifetime — hours, potentially.

**Why it happens:**
localStorage is the path of least resistance in React: synchronous, persists across refresh, zero config. The existing vk_ API key is already stored there, so the pattern feels established. Developers extend it without considering that a JWT has different attack surface (no allowlist check on every request, longer blast radius) than a static API key.

**How to avoid:**
For AUTH-06, store the JWT in **sessionStorage** (tab-scoped, cleared on browser close) as an explicit tradeoff: persists across tab reloads within a session but not across browser restarts. This is an acceptable compromise for a single-user private app.

Do NOT implement refresh tokens or httpOnly cookies in v3.5 — that complexity belongs in AUTH-07 or later. Document the decision explicitly in the phase plan: "JWT stored in sessionStorage for v3.5; httpOnly cookie migration is a future milestone."

**Warning signs:**
- `localStorage.setItem('vigil_jwt', ...)` anywhere in the codebase
- JWT visible in DevTools Application → Local Storage tab
- Token persists after closing all browser windows and reopening

**Phase to address:** AUTH-06 — storage decision documented before any JWT-handling code is written

---

### Pitfall 10: Login Error Messages Leaking User Existence

**What goes wrong:**
If the PWA login form displays "Email not found" vs "Incorrect password" as separate error states, an attacker can enumerate valid Vigil accounts. The server already implements timing-safe login with a `DUMMY_HASH` constant in `vigil-core/src/routes/auth.ts` (line 141-144) specifically to prevent response-time user enumeration. If the PWA client interprets different HTTP response bodies as different error messages, it breaks the server-side protection even though the server is doing the right thing.

**Why it happens:**
The backend returns `{ error: "Invalid credentials" }` with HTTP 401 for all auth failures. A developer adding the login UI creates distinct error messages for each HTTP status code they imagine (404 for unknown user, 403 for wrong password, 401 for generic), breaking the server's intentional ambiguity.

**How to avoid:**
For any 4xx response from `POST /v1/auth/login`, the PWA displays exactly one message: "Invalid email or password." No differentiation by status code, no differentiation by response body content. The server's `auth.ts` already enforces this on the backend — the client must not add specificity.

**Warning signs:**
- PWA shows "Email not found" or "No account with that email" for 401 responses
- Client-side code checks for specific string patterns in the `error` response body
- Different error messages appear for wrong email vs wrong password

**Phase to address:** AUTH-06 (error message copy must be reviewed before login UI ships)

---

### Pitfall 11: Forgot Password Link Added Without Email Infrastructure

**What goes wrong:**
AUTH-06 is the login/register UI — the backend was shipped in v3.4. If a "Forgot Password?" link is added to the login form, users will click it. Vigil Core has no email-sending infrastructure (no Resend/Nodemailer/SendGrid) and no password reset endpoint as of v3.4. Clicking the link either errors silently, navigates to a non-existent route, or results in a 404 from the API — leaving the user with no account recovery path.

**Why it happens:**
"Forgot Password" is expected UX on any login form. Developers add it reflexively without verifying whether the backend reset flow exists. The link ships; the backend does not; the user clicks it and cannot recover.

**How to avoid:**
Explicitly exclude "Forgot Password" from AUTH-06 scope. The login form ships with no reset link in v3.5. Document this in the phase plan: "Password reset requires email infrastructure (Resend or Nodemailer) — deferred to AUTH-07." The developer (also the only user) can reset their password directly via the database if ever needed.

**Warning signs:**
- Phase plan includes "forgot password" link on the login form
- AUTH-06 scope creeps to include `POST /v1/auth/reset-password` endpoint
- A route named `/forgot-password` or `/reset-password` appears in the router

**Phase to address:** AUTH-06 — explicitly gated out of scope in the plan before implementation starts

---

### Pitfall 12: Safari Extension Disabled After macOS Restart — Extension State Not Restored

**What goes wrong:**
Safari can reset extension enabled/disabled state after a macOS restart, Safari update, or extension host app re-launch. The extension appears enabled in Safari preferences before restart, disabled after. This is a known behavioral difference from Chrome extensions and is the most likely root cause of EXT-01.

**Why it happens:**
The `DailyBriefMonitor.app` bundle is the extension host. If the host app does not explicitly re-enable the extension on each launch via `SFSafariExtensionManager.setStateOfSafariExtension`, Safari may not automatically restore the enabled state — especially if the host app's signature changed (e.g., after a rebuild via `install.sh`).

**How to avoid:**
In `AppDelegate.swift` (or `DailyBriefMonitorApp.swift`), call `SFSafariExtensionManager.getStateOfSafariExtension` on launch and, if disabled, prompt the user or call `setStateOfSafariExtension` to re-enable. For the persistence fix, the correct approach is to call the enable API on every app launch, not only when the user manually toggles.

Additionally: verify the LaunchAgent that starts `DailyBriefMonitor.app` is using the correct `.app` bundle path. If `install.sh` rebuilds the binary to a different location than the LaunchAgent points to, the extension host never launches, which means Safari's extension process has no host and disables the extension.

**Warning signs:**
- Extension status is "enabled" before restart but "disabled" after in Safari → Settings → Extensions
- Console.app shows `SFSafariExtensionManager` errors mentioning invalid bundle or missing host
- LaunchAgent plist path does not match current `DailyBriefMonitor.app` install location

**Phase to address:** EXT-01 (Safari extension persistence)

---

### Pitfall 13: MV3 Service Worker Termination Causing Extension State Loss

**What goes wrong:**
Safari MV3 extensions use a non-persistent background (service worker). The service worker is terminated after ~30 seconds of inactivity. Any state stored in the service worker's module scope (API key, auth token, request cache) is lost on termination. When the extension popup is next opened, it wakes the service worker from scratch — potentially showing a "not configured" state or needing to re-authenticate.

**Why it happens:**
The MV3 mandate for non-persistent backgrounds is a relatively recent change from MV2's persistent background pages. State stored in background script module scope worked reliably in MV2. The current extension may store the API key in `chrome.storage.local` (correct) or in a module-level variable in the background script (incorrect). If the latter, the key evaporates with the service worker.

**How to avoid:**
All persistent state (API key, auth token, last-captured URL) must live in `browser.storage.local` — not in background script module scope. The content script and popup must read from storage on every activation, not assume the background script is alive. Verify:
```typescript
// Correct pattern for persistent API key in MV3
browser.storage.local.get(['vigil_api_key']).then(({ vigil_api_key }) => {
  // use the key from storage, not from a module variable
})
```
`browser.storage.local` survives service worker termination, macOS restarts, and Safari restarts.

**Warning signs:**
- Extension popup shows "not configured" or blank state after idle period
- API key must be re-entered after Safari restarts
- Background script logs only appear at browser startup, then nothing for hours

**Phase to address:** EXT-01 (Safari extension persistence)

---

### Pitfall 14: iCloud Folder Watcher Race Condition — Event Fires Before File Materializes

**What goes wrong:**
When a photo syncs from iPhone to iCloud Drive, macOS fires a VNODE_WRITE event on the watch folder as soon as the `.icloud` placeholder is replaced by the real file path. However, there is a window where `ubiquitousItemDownloadingStatus` reports `.downloading` even though the file appears to exist. If `processFile()` reads the bytes during this window, it gets a partial or zero-byte file. The Claude vision API returns 400 or produces a degraded/empty transcription.

The current `FolderWatcherService.swift` already implements `waitForStable()` (size stabilization) and the `ubiquitousItemDownloadingStatus != .current` check. However, `waitForStable()` measures size changes, not iCloud's internal download state machine — a file can appear size-stable at an intermediate size before full download.

**Why it happens:**
The repair may inadvertently remove or break the existing iCloud download guards. Or the bug manifests after the repair because the new code path (e.g., a different trigger for the watcher) doesn't call `triggerICloudDownloads()` before scanning.

**How to avoid:**
Before modifying `FolderWatcherService.swift`, verify the iCloud path end-to-end: drop an image from iPhone to the iCloud-watched folder, observe the VNODE events, and confirm `ubiquitousItemDownloadingStatus` reaches `.current` before `processFile()` proceeds. Add an explicit size-zero guard after `waitForStable()`:
```swift
if size == 0 {
    knownFiles.remove(url.lastPathComponent)
    return // re-queued on next VNODE event when download completes
}
```
The `triggerICloudDownloads()` call in `handleDirectoryChange()` must remain as the first step before the file scan.

**Warning signs:**
- Triage produces empty or garbled thoughts from iCloud-sourced photos
- Claude API logs show 400 "invalid image" errors in folder watcher output
- File moves to `done/` subfolder but the resulting thought has no content

**Phase to address:** CAP-01 (folder watcher repair) — iCloud end-to-end test required before phase close

---

### Pitfall 15: Manual Upload Triage Bug Fixed in the Wrong Layer

**What goes wrong:**
CAP-02 is "manual uploads skipping AI categorization." The bug could live in three places:
1. **PWA layer**: `PhotoUploadPage.tsx` uploads but does not call the triage endpoint afterward
2. **Server layer**: `POST /v1/process-photo` does not include triage in its response or does not call `/v1/triage`
3. **Mac app layer**: the Mac dashboard's batch upload bypasses the server triage path

If the fix is applied at the wrong layer (PWA calls triage explicitly, but the actual bug is that the server's `process-photo` route never triages), the symptom appears fixed via one path while remaining broken through another (Mac app batch upload, folder watcher re-ingest).

**Why it happens:**
"Manual upload triage" is ambiguous — it could refer to the PWA's PhotoUploadPage, the Mac app's batch import, or the server's process-photo response. Without layer-by-layer diagnosis, developers patch the most visible surface.

**How to avoid:**
The CAP-02 phase plan must include a diagnosis step before any code is written. Execute this curl against Railway:
```bash
curl -X POST https://api.vigilhub.io/v1/process-photo \
  -H "Authorization: Bearer $VIGIL_KEY" \
  -F "image=@test.jpg"
```
Inspect the response for `thoughts[].category`. If `category` is null in the response, the bug is server-side. If `category` is present in the response but the PWA doesn't display it, the bug is client-side. This one check locates the bug layer before any fix code is written.

**Warning signs:**
- Phase plan says "fix the PWA upload flow" without a server-side investigation step
- Fix is applied only in PWA without checking Mac app upload path
- After the fix, PWA uploads are triaged but Mac Dashboard uploads still skip categorization

**Phase to address:** CAP-02 (manual upload triage repair) — diagnosis step is the first task in the phase plan

---

### Pitfall 16: HEIC Files Sent to Claude Without Server-Side Conversion

**What goes wrong:**
The Mac folder watcher includes `.heic` in `imageExtensions` and sends HEIC files to `POST /v1/process-photo`. If the server passes raw HEIC bytes to Claude's vision API with `image/heic` as the media type, Claude may return a 400 error or silently produce a degraded/empty transcription. This was a documented pain point in v1.1 (CoreGraphics conversion added locally) and v2.4 (photo endpoint). After migration to server-side processing, HEIC conversion responsibility shifted to the server — but it may not have been implemented.

**Why it happens:**
The Mac app handled HEIC conversion locally (CoreGraphics). When the photo endpoint was moved server-side, the conversion was not ported. Developers assume Claude supports HEIC (it sometimes does, partially) and don't add an explicit test case with a real HEIC file.

**How to avoid:**
In the CAP-01 phase, verify `vigil-core/src/routes/process-photo.ts` converts HEIC to JPEG before the Claude API call. If conversion is missing, add `sharp` (handles HEIC via libvips on Railway's Linux environment):
```typescript
import sharp from 'sharp'
const jpeg = await sharp(buffer).toFormat('jpeg').toBuffer()
```
Add a test: upload a real `.heic` file to `POST /v1/process-photo`, assert the returned thought has non-empty `content`.

**Warning signs:**
- Folder watcher processes HEIC files without error (moves to `done/`) but thoughts have empty content
- Claude API logs show `image/heic` or `image/heif` in request content type
- `process-photo.ts` passes `buffer` directly to Claude without a format check

**Phase to address:** CAP-01 (folder watcher repair) — HEIC verification as part of the fix

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| PostHog at call sites without a wrapper | Works immediately in dev | PII leaks the moment anyone adds thought content; no env gate | Never — always use a `trackEvent()` wrapper |
| Single PostHog project for all envs | One dashboard to check | Dev/test events permanently corrupt production funnels | Never — separate API keys per env minimum |
| JWT in localStorage instead of sessionStorage | Persists across refreshes | XSS blast radius includes full auth token | Never in v3.5 — sessionStorage is the right tradeoff |
| G2 submit before all 3 items verified on simulator | Faster to submit | Wastes a full review cycle (days of wait time) | Never |
| Triage fix in PWA only without server diagnosis | Quickest path to "fixed" | Mac app uploads remain broken; server path remains untriaged | Never — diagnose before fixing |
| posthog.shutdown() not in SIGTERM handler | Saves 3 lines of code | Events since last flush lost on every Railway deploy/restart | Never — add to existing handler at SDK initialization time |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PostHog + Hono | Initializing PostHog inside a route handler (new instance per request) | Singleton initialized once in `index.ts`, nullable if not production |
| PostHog + Vitest | Real PostHog client initialized at test module scope; setInterval leaks between tests | `vi.mock('posthog-node', () => ({ PostHog: vi.fn(() => ({ capture: vi.fn(), shutdown: vi.fn() })) }))` |
| Even Hub SDK + double-tap | CLICK_EVENT fires before DOUBLE_CLICK_EVENT; existing handler navigates before double-tap is recognized | 300ms debounce on CLICK_EVENT, cancel on DOUBLE_CLICK_EVENT; or use SDK's native double-tap event if it fires distinctly |
| Safari MV3 + extension state | State in background service worker module scope evaporates on termination | `browser.storage.local` for all persistent state; read on every activation |
| iCloud folder watcher + HEIC | HEIC bytes sent to Claude without format conversion | `sharp` conversion to JPEG server-side before Claude API call |
| argon2id + PWA login form | Password field `type="text"` accidentally set during dev | Always `type="password"` on password inputs; never toggle type for show/hide |
| PostHog + Safari extension content script | Outbound requests to posthog.com blocked by ITP + tracker blocklists | No PostHog in content scripts; track extension events server-side via a source header |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| posthog-node feature flags enabled in long-running Vigil Core | Memory grows 10-50MB/day; Railway OOMs | Don't use feature flags at all in v3.5 | Immediately with flag polling; gradually otherwise |
| posthog.shutdown() missing on SIGTERM | Events since last flush lost on every Railway deploy | Add shutdown() to existing SIGTERM handler | Every Railway deploy that kills the process mid-interval |
| iCloud watcher initial scan floods Claude on first launch | Startup spikes Claude API usage if folder has many images | `knownFiles` set prevents reprocessing; verify it persists across restarts if needed | First launch after clearing knownFiles state |
| Double-tap debounce adds latency to every single tap | G2 navigation feels sluggish (every tap delayed 300ms) | Check if SDK fires DOUBLE_CLICK_EVENT distinctly (no debounce needed); only debounce if CLICK_EVENT fires before double-tap recognition | Immediately if naive 300ms timer is used for all CLICK_EVENTs |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Thought content in PostHog event properties | Therapy notes, personal thoughts, emails stored in PostHog Cloud indefinitely | Property allowlist: structural metadata only (enums, booleans, numbers) |
| JWT in localStorage | XSS exfiltration of auth token; attacker authenticates as user until token expires | sessionStorage (tab-scoped) or React context; document the tradeoff |
| Login error message differentiating "unknown email" from "wrong password" | User enumeration — server already prevents this with timing-safe login | Single generic error message for all 4xx auth responses |
| Session recording enabled before auth form masking verified | Password captured in plaintext if show/hide toggle changes input type | Verify masking with `maskInputFn` by element ID; or avoid show/hide toggle entirely |
| Safari extension sending analytics from content script | ITP blocks requests; data partially captured before block depending on user's blocklist | No PostHog in extension content scripts; track via server-side source header |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Login form with "Forgot Password" link that leads nowhere | User locked out with no recovery path | Omit the link in AUTH-06; add it only when email infrastructure exists |
| No loading state on JWT login (argon2id verify takes ~100ms) | UI appears frozen on submit | Disable submit button + show spinner immediately on form submit |
| Tab order broken on login form | Keyboard/autofill users frustrated; 1Password won't fill correctly | Correct DOM order: email → password → submit; no explicit tabIndex manipulation needed |
| G2 double-tap exit with no visual feedback | User unsure if the gesture was recognized | Even Hub's expected UX is minimal — implement as the SDK specifies; don't add confirmation dialogs to glasses UX |
| PostHog analytics showing 0 events from Railway (integration appears broken) | Developer wastes time debugging when env gate is correctly blocking dev events | Add one test event in the dev environment before env-gating; verify it appears, then add the gate |

---

## "Looks Done But Isn't" Checklist

- [ ] **PostHog env guard:** Railway events appear in PostHog Cloud; local `npm run dev` does NOT produce events — verify both
- [ ] **PostHog PII audit:** grep all `posthog?.capture()` calls; no string properties contain user-generated content
- [ ] **PostHog shutdown:** `await posthog?.shutdown()` present in BOTH the SIGTERM and SIGINT handlers in `index.ts`
- [ ] **G2 checklist complete:** G2-01 + G2-02 + G2-03 all verified on simulator before the resubmission button is clicked
- [ ] **G2 double-tap regression:** single tap still navigates to task detail after double-tap handler is added — manual simulator test required
- [ ] **AUTH-06 JWT storage:** JWT is in sessionStorage, NOT localStorage — verify in DevTools Application tab
- [ ] **AUTH-06 error message:** wrong email and wrong password both produce identical error message — test both cases
- [ ] **AUTH-06 no forgot password link:** no "Forgot Password" link on the shipped login form
- [ ] **AUTH-06 password field type:** `type="password"` on the password input — verify in DOM inspector
- [ ] **EXT-01 persistence:** extension remains enabled after full macOS restart (not just Safari restart) — test on physical machine
- [ ] **CAP-02 diagnosis:** `curl POST /v1/process-photo` response inspected for `category` before any fix code is written
- [ ] **CAP-01 HEIC end-to-end:** real `.heic` file dropped to watched folder produces a thought with non-empty content
- [ ] **CAP-01 iCloud round-trip:** photo dropped from iPhone to iCloud-backed folder produces a thought (end-to-end, not mocked)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Dev events polluted PostHog production project | HIGH — no bulk delete by property in PostHog Cloud | Create new PostHog project; update POSTHOG_API_KEY in Railway env; accept data loss for the polluted window |
| PII captured in PostHog event properties | HIGH — PostHog does not support selective property deletion | File PostHog data deletion request; implement property scrubbing immediately; rotate any sensitive identifiers |
| G2 re-rejected for partial fix | MEDIUM — days of wait time lost | Fix remaining items immediately; resubmit with explicit notes listing all three fixed items |
| JWT in localStorage, XSS discovered | MEDIUM — all active sessions compromised | Rotate `JWT_SECRET` in Railway env; all existing tokens immediately invalidated; users must re-login |
| posthog-node memory leak OOMs Railway | LOW — Railway auto-restarts; events since last flush lost | Add `shutdown()` to SIGTERM handler; avoid feature flags; upgrade posthog-node if patch released |
| iCloud race condition produces empty thought | LOW — thought exists but has no content | User re-triages via existing re-triage button; delete and re-drop the file to the watch folder |
| Manual upload bug fixed in wrong layer | MEDIUM — bug returns via alternate client path | Revert the misplaced fix; run the diagnostic curl; fix at the correct layer |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| PostHog dev event flooding | ANLY-01 (PostHog setup) | Railway events appear in PostHog; `npm run dev` events do NOT appear |
| PII in event properties | ANLY-01 (property schema) | Grep all `capture()` calls; code review checklist signed off |
| Double-counting client + server | ANLY-01 (naming convention) | Event name registry documented before any implementation |
| Session recording + password reveal | AUTH-06 (login UI) | Test show/hide toggle in session replay; field stays masked |
| posthog-node memory leak | ANLY-01 (SDK init + shutdown) | `shutdown()` in SIGTERM handler; no feature flags configured |
| PostHog in Safari extension | ANLY-01 (scope definition) | No posthog import in extension `src/`; grep confirms |
| G2 partial resubmit | G2 resubmit phase (all items) | All three G2 checklist items green on simulator before submission |
| Double-tap gesture collision | G2-02 (exit dialogue) | Single tap navigates; double tap exits; swipe still works |
| JWT in localStorage | AUTH-06 (storage decision) | DevTools Application: JWT in sessionStorage, absent from localStorage |
| Login error message specificity | AUTH-06 (error copy review) | Wrong email and wrong password produce identical error message |
| Forgot password without email infrastructure | AUTH-06 (scope gating) | No "Forgot Password" link in shipped UI |
| Safari extension disabled after restart | EXT-01 (persistence fix) | Extension enabled after full macOS restart on physical machine |
| MV3 service worker state loss | EXT-01 (persistence fix) | API key accessible after Safari idle period + restart |
| iCloud watcher race condition | CAP-01 (folder watcher repair) | iPhone-sourced HEIC photo produces thought with content (end-to-end) |
| Triage fix in wrong layer | CAP-02 (diagnosis first) | Curl `POST /v1/process-photo` inspected before any code change |
| HEIC not converted server-side | CAP-01 (HEIC verification) | Real HEIC file produces non-empty thought content |

---

## Sources

- PostHog Node.js SDK docs: https://posthog.com/docs/libraries/node
- PostHog multiple environments guide: https://posthog.com/tutorials/multiple-environments
- PostHog privacy controls (session replay masking): https://posthog.com/docs/session-replay/privacy
- PostHog data collection controls: https://posthog.com/docs/privacy/data-collection
- PostHog browser extension analytics guide: https://posthog.com/docs/advanced/browser-extension
- PostHog PII hashing transformations: https://posthog.com/docs/cdp/transformations/template-pii-hashing
- PostHog event tracking guide (double-counting, naming): https://posthog.com/tutorials/event-tracking-guide
- posthog-node v5.4.0 memory leak (feature flags, long-running services): https://github.com/PostHog/posthog-js/issues/2206
- Safari extension MV3 background page issues: https://developer.apple.com/forums/thread/709349
- Safari extension MV3 service worker background: https://discussions.apple.com/thread/256156284
- iCloud Drive FSEvents race condition: https://github.com/fsevents/fsevents/issues/285
- iCloud Drive Sonoma mechanisms + throttling: https://eclecticlight.co/2024/03/05/icloud-drive-in-sonoma-mechanisms-throttling-and-system-limits/
- JWT localStorage vs sessionStorage security (2025): https://www.cyberchief.ai/2023/05/secure-jwt-token-storage.html
- Even Hub developer docs: https://hub.evenrealities.com/docs/
- Even toolkit (gestures + debounce patterns): https://github.com/fabioglimb/even-toolkit
- Codebase: `vigil-core/src/routes/auth.ts` — DUMMY_HASH timing-safe login, D-10/D-11 claim flow, generic 401
- Codebase: `vigil-core/src/index.ts` — existing SIGTERM/SIGINT handlers, scheduler lifecycle
- Codebase: `Sources/DailyBriefMonitor/FolderWatcherService.swift` — iCloud download trigger, HEIC extension set, waitForStable, ubiquitousItemDownloadingStatus check
- Codebase: `vigil-g2-plugin/src/main.ts` — CLICK_EVENT + DOUBLE_CLICK_EVENT + FOREGROUND_ENTER/EXIT handlers
- Codebase: `vigil-pwa/src/pages/AuthPage.tsx` — existing API key auth pattern (basis for AUTH-06 JWT extension)

---
*Pitfalls research for: Vigil v3.5 — PostHog analytics, G2 resubmit, PWA login/register, Safari extension persistence, photo capture repair*
*Researched: 2026-04-19*
