# Phase 129: Lifecycle Restore + ServiceNow Popup - Research

**Researched:** 2026-05-15
**Domain:** G2 Even SDK lifecycle primitives + Chrome/Safari MV3 extension popup
**Confidence:** HIGH (all critical findings are code-verified; one empirical question on Polaris title shape flagged as MEDIUM — see Assumptions Log)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** On non-`*.service-now.com/*` pages, the extension action button is disabled via `chrome.action.disable()` (Safari equivalent) driven by `tabs.onUpdated` / `tabs.onActivated` URL listener.
- **D-02:** The existing Phase 84 capture-the-page popup is retired. No two-mode popup; SVCNOW form is the only popup mode.
- **D-03:** On HTTP 200 from `POST /v1/work-orders/sync`, popup closes immediately. No toast, no delay.
- **D-04:** On non-200, popup stays open + inline error. Operator retries or abandons manually.
- **D-05:** TTL is wall-clock from last screen-change save. Shape: `{screen, args?, savedAt: Date.now()}` at key `vigil:v3:lastScreen`. `Date.now() - savedAt > 30*60*1000` → fall back to home.
- **D-06:** Pocket gap falling back to home is intentional.
- **D-07:** On restore of a parameterized screen: re-fetch the entity. On 404, fall back to the parent list screen (e.g. WORK_ORDERS), not home.
- **D-08:** Stored args shape MUST be small (id-only — never embedded entity snapshots).
- **D-09:** Both `setBackgroundState`/`onBackgroundRestore` AND `setLocalStorage`/`getLocalStorage` required.
- **D-10:** `onLaunchSource('glassesMenu')` takes precedence over restore (Phase 124 G2-POLISH-06 invariant preserved).
- **D-11:** Companion HUD active-session/banner cache folds into the same `setBackgroundState` module-init path.
- **D-12:** `client_capture_id` UUID + `(user_id, client_capture_id)` composite partial unique index on `work_orders`. Mirror Phase 121 pattern.
- **D-13:** Safari extension lock-step parity with Chrome. Phase 114 EXT-02 pattern.

### Claude's Discretion
- TTL constant location (env var, build-time constant, or inline) — 30-min is locked; storage of the constant is not.
- Popup form input validation defaults (empty description allowed; sensible upper bound like 2000 chars).
- Exact "home" screen identifier — use existing `Screen.HOME = 'home'` carousel default.
- Safari extension build pipeline — follows Phase 114 EXT-02 patterns (WKWebExtension shim, Resources folder parity).

### Deferred Ideas (OUT OF SCOPE)
- SVCNOW two-way sync (push Vigil status back to ServiceNow) — SVCNOW-FUTURE-01, permanently blocked.
- G2 popup "you were last here X min ago" toast.
- Polaris Shadow-DOM scrape retry — explicitly out of scope.
- Capture-the-page popup (Phase 84 functionality) — retired by D-02.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| G2-LIFECYCLE-01 | Plugin registers `setBackgroundState('vigil-companion-state', ...)` + `onBackgroundRestore(...)` at module init for Companion HUD cache; survives in-session phone-background → foreground via Headless WebView replay. | Canonical pattern in `audio-session-guard.ts` (verified). Registration must occur BEFORE `init()`. Dev preview bridge lacks these methods → feature-detect pattern mandatory (same as audio-guard). |
| G2-LIFECYCLE-02 | Plugin writes last-viewed screen to `bridge.setLocalStorage('vigil:v3:lastScreen', ...)` on every screen change; reads on re-launch + 30-min TTL. | `setLocalStorage`/`getLocalStorage` is the correct SDK primitive for plugin re-launch persistence (browser localStorage unreliable in Flutter WebView per EVEN-SKILLS.md). No existing code touches `vigil:v3:lastScreen` — entirely new. |
| G2-LIFECYCLE-03 | `onLaunchSource('glassesMenu')` takes precedence over restore. | `pickInitialScreen()` in `launch-source-helpers.ts` currently returns COMPANION (if active sessions) or HOME. New restore logic must NOT run when `source === 'glassesMenu'`; must preserve the D-07 D-06 ordering. D-07 drift test in `main.test.ts` pins the module-scope registration ordering and must continue passing. |
| SVCNOW-01 | Extension registers content-script on `*.service-now.com/*`; extracts CS# from `document.title` via `/^CS\d{7}$/`; extension button opens popup with CS# locked in. | Manifest needs new `host_permissions`, new service_worker for `tabs.onUpdated`/`tabs.onActivated` (action disable/enable). Content-script or popup-side `chrome.tabs.query` can read `document.title`. Regex shape flagged as MEDIUM confidence — see Assumptions A1. |
| SVCNOW-02 | CS# snapshot frozen at open-time; `MutationObserver` on `document.title` shows drift banner if Polaris pushState navigation changes the case mid-flight. | New popup JavaScript; content-script messaging pattern. |
| SVCNOW-03 | Popup form: case# header (larger), description textarea (autofocus), priority select (Low/Medium/High/Critical), Send button (⌘+Enter); POST to `POST /v1/work-orders/sync` with `[{caseNumber, shortDescription, priority, client_capture_id}]`. | Field name mapping is camelCase to match existing route: `caseNumber` + `shortDescription` (not `case_number`/`description`). Route returns HTTP 200 default on success — matches D-03. |
| SVCNOW-04 | `client_capture_id` UUID + `(user_id, client_capture_id)` composite partial unique index on `work_orders`. | `work_orders` table confirmed to NOT have `client_capture_id` column yet — new Drizzle migration 0021 required. See critical finding §"work_orders schema gap". |
| SVCNOW-05 | Safari extension lock-step port; both manifests updated; both Send buttons Vigil-brand-compliant. | Both extensions currently share identical structure: `manifest.json` + `popup.{html,css,js}` in Resources folder. Phase 114 EXT-02 pattern: every change ships in both in the same commit. |
</phase_requirements>

---

## Summary

Phase 129 ships two independent, parallel-safe sub-features. Sub-feature A (G2 lifecycle restore) is pure G2 plugin + no server changes; it wires the Even SDK's two non-overlapping persistence primitives (`setBackgroundState` for background→foreground migration and `setLocalStorage` for re-launch persistence) plus the companion HUD cache fold. Sub-feature B (SVCNOW popup) is pure browser extension + a Drizzle migration for `client_capture_id`; no API code changes are needed other than the migration and a server-side dedup guard mirroring Phase 121.

The most critical empirical finding is that the REQUIREMENTS.md regex `/^CS\d{7}$/` (which expects the full page title to be exactly a 7-digit CS number) almost certainly does NOT match real Polaris browser tab titles. Real ServiceNow case numbers in this codebase are 7 digits (e.g. `CS0353598`), but Polaris tab titles typically follow the `sessionTabTitle` configured format (e.g. `CS1234567 - Description text` or similar compound strings). The regex should extract, not match-whole-string: `/CS\d{7}/` (for extraction) with the extracted match stored; alternatively use `/^(CS\d{7})/` against the title to capture the prefix. The planner must resolve this before emitting the `SVCNOW-01` task.

The second critical finding is that the `work_orders` table has `case_number` as a global `PRIMARY KEY` (single-column, not per-user). Adding `client_capture_id` idempotency must account for this: `client_capture_id` deduplication happens per `(user_id, client_capture_id)` partial unique index (exactly mirroring Phase 121's `agent_events` pattern), but the existing upsert `ON CONFLICT (case_number)` is a global conflict — any two users sharing the same case number would stomp each other. This is a pre-existing schema oddity. Phase 129 does NOT fix this; it only adds `client_capture_id` for popup-specific dedup.

**Primary recommendation:** Split into 5 plans across 3 waves — (Wave 1) DB migration for `client_capture_id`; (Wave 2) G2 lifecycle restore module + companion HUD fold + extension popup Chrome in parallel; (Wave 3) Safari port + integration tests + drift-detector tests.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Last-viewed screen write (on nav event) | G2 plugin (client) | — | `bridge.setLocalStorage` is a G2 SDK call; no server involvement |
| Last-viewed screen read (on launch) | G2 plugin (client) | — | `bridge.getLocalStorage` at module-init time; no server round-trip |
| Background/foreground state snapshot | G2 plugin (client) | — | `setBackgroundState`/`onBackgroundRestore` are SDK primitives; no server |
| Companion HUD cache in background state | G2 plugin (client) | — | Module-level `activeSessions` / `bannerState` captured in same path as D-11 |
| glassesMenu precedence guard | G2 plugin (client) | — | `pickInitialScreen` in `launch-source-helpers.ts`; pure client routing logic |
| CS# extraction from page title | Extension content-script or popup | Service worker (action enable/disable) | `document.title` read is client-side DOM; `chrome.action.disable()` requires service worker |
| Extension popup form + POST | Extension popup | — | Popup HTML/JS owns UI; direct `fetch()` to `/v1/work-orders/sync` |
| `client_capture_id` dedup | API (vigil-core) + DB | Extension popup (ID generation) | DB partial unique index enforces dedup; popup generates UUID via `crypto.randomUUID()` |
| DB migration for `client_capture_id` | Database/migrations | — | New Drizzle migration `0021_*` |

---

## Standard Stack

### Core (all existing — no new packages)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@evenrealities/even_hub_sdk` | 0.0.9 (installed) | `setBackgroundState`, `onBackgroundRestore`, `setLocalStorage`, `getLocalStorage` | Sole SDK for G2 plugin lifecycle primitives [VERIFIED: EVEN-SKILLS.md + audio-session-guard.ts inspection] |
| `drizzle-orm` | 0.45.2 (installed) | ORM + migration framework | Existing stack; partial unique index SQL-only pattern proven in 0018 migration [VERIFIED: codebase inspection] |
| `hono` | Installed in vigil-core | Route handler for `/v1/work-orders/sync` | Existing API stack [VERIFIED: work-orders.ts inspection] |
| `crypto.randomUUID()` | Web API (MV3 popup context) | Generate `client_capture_id` UUID | Built-in browser API; no npm package needed [VERIFIED: codebase uses it in vigil-core routes] |

### Extension-Specific Additions (no new npm packages)
| Component | Type | Purpose |
|-----------|------|---------|
| `background.js` (new) | MV3 service worker | `tabs.onUpdated`/`tabs.onActivated` listener for `chrome.action.enable()`/`chrome.action.disable()` |
| `content-script.js` (new, optional) | Content script | `MutationObserver` on `document.title` for drift detection (SVCNOW-02) |

**No new npm packages required for this phase.** [VERIFIED: codebase inspection]

### Package Legitimacy Audit

No new external packages are installed in this phase. The phase is a pure code change against existing installed dependencies.

| Package | Registry | Status | Disposition |
|---------|----------|--------|-------------|
| (none) | — | — | N/A |

*slopcheck was unavailable; no packages to check.*

---

## Architecture Patterns

### System Architecture Diagram

```
SUB-FEATURE A: G2 LIFECYCLE RESTORE
====================================

[Plugin module init (top-level, BEFORE init())]
    │
    ├── bridge.setBackgroundState('vigil-companion-state', snapshotFn)
    │       snapshotFn returns: { activeSessions, currentSessionIndex, bannerState }
    │       (D-11 free win: companion HUD cache captured in same path)
    │
    ├── bridge.onBackgroundRestore('vigil-companion-state', restoreFn)
    │       restoreFn: deserialize → hydrateActiveSessions() + restore bannerState
    │
    ├── bridge.setBackgroundState('vigil-screen-state', snapshotFn)
    │       snapshotFn returns: { screen, args? }  [id-only per D-08]
    │
    └── bridge.onBackgroundRestore('vigil-screen-state', restoreFn)
            restoreFn: if source !== 'glassesMenu' → navigateToRestored(screen, args, bridge)
                       navigateToRestored: re-fetch entity → navigate; on 404 → parent list (D-07)

[Every screen navigation: navigateTo() / navigateToTaskDetail()]
    │
    └── bridge.setLocalStorage('vigil:v3:lastScreen', JSON.stringify({screen, args?, savedAt: Date.now()}))

[Plugin re-launch / pickInitialScreen() in launch-source-helpers.ts]
    │
    ├── IF source === 'glassesMenu' → existing flow (COMPANION or HOME, D-10 invariant)
    └── IF source !== 'glassesMenu' → read bridge.getLocalStorage('vigil:v3:lastScreen')
            │
            ├── null / missing → HOME
            ├── Date.now() - savedAt > 30*60*1000 → HOME (TTL expired, D-05)
            └── valid → navigateToRestored(screen, args, bridge)


SUB-FEATURE B: SVCNOW EXTENSION POPUP
======================================

[Service worker: background.js]
    │
    ├── tabs.onUpdated / tabs.onActivated listener
    │       URL matches *.service-now.com/* → chrome.action.enable(tabId)
    └── URL does NOT match → chrome.action.disable(tabId)  [D-01]

[Extension action click → popup.html opens]
    │
    ├── chrome.tabs.query({active:true}) → get tab URL + title
    ├── title.match(/CS\d{7}/) → extract CS# (see Assumption A1 on regex shape)
    ├── CS# found → lock into read-only header; focus description textarea (D-03)
    └── CS# not found → show "No case# detected" with manual input fallback

[Popup form interaction]
    │
    ├── description textarea (autofocus)
    ├── priority select (Low / Medium / High / Critical)
    ├── MutationObserver on document.title via content script (SVCNOW-02)
    │       title drifts → show "CS# drifted — reopen popup" banner
    └── Send button (⌘+Enter shortcut)
            │
            ├── client_capture_id = crypto.randomUUID()  [D-12]
            ├── POST https://api.vigilhub.io/v1/work-orders/sync
            │       Authorization: Bearer <stored key>
            │       Body: { workOrders: [{caseNumber, shortDescription, priority, client_capture_id}] }
            │
            ├── HTTP 200 → window.close()  [D-03]
            └── non-200 → inline error, popup stays open  [D-04]

[vigil-core: POST /v1/work-orders/sync]
    │
    ├── existing: INSERT ... ON CONFLICT (case_number) DO UPDATE SET ...
    └── NEW: before insert, check (user_id, client_capture_id) partial unique index → 
            if conflict → return 200 {synced: 0} (or 200 {synced: 1} idempotent)
```

### Recommended Project Structure Changes

```
vigil-g2-plugin/src/
├── lib/
│   ├── audio-session-guard.ts     (existing — canonical setBackgroundState reference)
│   └── screen-state-restore.ts    (NEW — G2-LIFECYCLE-01/02/03 logic)
├── main.ts                         (modified: register screen-state-restore at module scope)
├── navigation.ts                   (modified: call setLocalStorage on every navigateTo)
└── lib/launch-source-helpers.ts    (modified: add TTL-gated restore branch for non-glassesMenu)

vigil-extension/
├── manifest.json                   (modified: add host_permissions, background.service_worker, tabs permission)
├── background.js                   (NEW: tabs.onUpdated/onActivated → action enable/disable)
├── content-script.js               (NEW: MutationObserver for title drift, SVCNOW-02)
├── popup.html                      (REPLACED: ServiceNow form, retiring Phase 84 UI per D-02)
├── popup.css                       (REPLACED: Vigil-brand-compliant SVCNOW form styles)
└── popup.js                        (REPLACED: CS# extraction, form submission, error handling)

vigil-safari-extension/Vigil Capture Extension/Resources/
├── manifest.json                   (REPLACED: lock-step parity per D-13)
├── background.js                   (NEW: lock-step copy of Chrome version per D-13)
├── content-script.js               (NEW: lock-step copy per D-13)
├── popup.html                      (REPLACED: lock-step parity)
├── popup.css                       (REPLACED: lock-step parity)
└── popup.js                        (REPLACED: lock-step parity)

vigil-core/drizzle/
└── 0021_add_work_orders_client_capture_id.sql  (NEW: migration for D-12)

vigil-core/src/db/schema.ts
└── workOrders table: add clientCaptureId column (nullable text)
```

---

## Critical Findings from Empirical Probes

### Probe 1: `setBackgroundState`/`onBackgroundRestore` registration shape [VERIFIED: code]

Canonical shape from `vigil-g2-plugin/src/lib/audio-session-guard.ts` (lines 136-154):

```typescript
// Source: audio-session-guard.ts:136-154
if (
  typeof (bridge as { setBackgroundState?: unknown }).setBackgroundState === 'function' &&
  typeof (bridge as { onBackgroundRestore?: unknown }).onBackgroundRestore === 'function'
) {
  bridge.setBackgroundState(BG_STATE_KEY, () => ({ audioActive }))
  bridge.onBackgroundRestore(BG_STATE_KEY, (saved: unknown) => {
    const s = saved as { audioActive?: boolean }
    if (s.audioActive) {
      bridge.audioControl(false).catch(() => {})
      audioActive = false
    }
  })
} else {
  console.warn('[audio-session-guard] Hook 4 disabled — bridge missing ...')
}
```

**New screen-restore code MUST follow this pattern verbatim:**
1. Feature-detect `setBackgroundState` + `onBackgroundRestore` before calling (dev preview bridge lacks them)
2. Snapshot function returns a plain JSON-serializable object (no class instances, Maps, Sets, Dates)
3. Restore function deserializes and acts on the saved state
4. Console.warn on the else path for dev preview visibility

### Probe 2: `onLaunchSource` D-07 module-scope registration [VERIFIED: code + test]

From `vigil-g2-plugin/src/main.ts` lines 82-85:
```typescript
const bridgeInstance = EvenAppBridge.getInstance()
const launchSourcePromise: Promise<LaunchSource> = new Promise((resolve) => {
  bridgeInstance.onLaunchSource((source) => resolve(source))
})
```

The D-07 drift test in `main.test.ts` passes (21/21 tests pass). **The drift test checks:**
- `onLaunchSource` registration appears BEFORE `function init(` declaration
- `launchSourcePromise` declared at module scope (`/^const\s+launchSourcePromise/m`)
- 500ms timeout fallback resolves to `'appMenu'`

**Constraint for new restore code:** Any new module-scope registration (e.g., `setBackgroundState` registrations) must also precede `function init(`. The test does NOT check for this yet — a new drift test must be added. The D-07 test inspects `onLaunchSource(` index vs `function init(` index; the new drift test should add a similar check for `setBackgroundState(` registration index.

### Probe 3: Extension popup scope [VERIFIED: code]

Current `vigil-extension/manifest.json`:
- `manifest_version: 3`
- `permissions: ["activeTab", "storage"]`
- `host_permissions: ["https://api.vigilhub.io/*"]`
- No `background.service_worker` — no service worker exists yet
- No `tabs` permission
- No ServiceNow host permission

**Changes required (Chrome manifest):**
```json
{
  "permissions": ["activeTab", "storage", "tabs"],
  "host_permissions": [
    "https://api.vigilhub.io/*",
    "*://*.service-now.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["*://*.service-now.com/*"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }]
}
```

Safari manifest is identical (WKWebExtension supports the same MV3 format). The `Resources/` folder structure is already a 1:1 mirror of `vigil-extension/` so the lock-step pattern is clean.

The `SafariWebExtensionHandler.swift` only handles native messaging (not relevant to popup/content-script/service-worker additions). The Xcode project does NOT need modification for popup-only changes.

### Probe 4: `vigil-core/src/routes/work-orders.ts` — POST body shape and `client_capture_id` gap [VERIFIED: code]

The route currently:
- Expects `{ workOrders: [...] }` (camelCase key)
- Reads `wo.caseNumber` and `wo.shortDescription` from each item
- Returns `{ synced: N }` with HTTP 200 (matches D-03)
- Conflict target is `workOrders.caseNumber` (the global PRIMARY KEY)
- Does NOT read `client_capture_id` — field does not exist

**SVCNOW-03 requirement states** `[{case_number, description, priority, client_capture_id}]` but the route reads `caseNumber` and `shortDescription` (camelCase). The extension popup must send:
```javascript
{ workOrders: [{ caseNumber, shortDescription, priority, clientCaptureId }] }
```
The route sanitizer (line 34) destructures only known fields — `clientCaptureId` will be silently ignored unless the route is updated to read + act on it.

**Resolution path for SVCNOW-04:** The route must be updated to read `wo.clientCaptureId ?? wo.client_capture_id` and pass it through to the insert. The DB migration adds the column + partial unique index. The insert logic needs an additional dedup check (check `(userId, clientCaptureId)` before insert, or use the DB conflict to return an appropriate response).

### Probe 5: `work_orders` schema — global PK warning [VERIFIED: code]

`work_orders.case_number` is a **global primary key** (not `(userId, caseNumber)` composite). This means:
- Current `ON CONFLICT (case_number) DO UPDATE` overwrites any user's work order if two users have the same CS number
- This is a **pre-existing schema issue** (introduced in 0005 migration, survived multi-user migration in 0012)
- Phase 129 DOES NOT fix this; it only adds `client_capture_id` for popup-specific dedup

The `client_capture_id` partial unique index mirrors Phase 121's `agent_events` pattern:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "uq_work_orders_user_client_capture_id"
  ON "work_orders" ("user_id", "client_capture_id")
  WHERE "client_capture_id" IS NOT NULL;
```

**Schema.ts update:** Add to `workOrders` table definition:
```typescript
clientCaptureId: text("client_capture_id"),  // nullable; partial unique in 0021 migration
```

### Probe 6: Polaris document.title format — UNCONFIRMED [MEDIUM confidence]

No live Polaris page was accessible for empirical confirmation. Evidence gathered:

1. **Real case numbers in codebase** (e.g., `CS0353598`, `CS0356295`, `CS0354176`) confirm the `CS0XXXXXX` 7-digit format is correct.
2. **Gmail subject line extraction** pattern in `gmail-workorder-service.ts` uses `/Case\s+(CS\d+)/i` — not a bare title match.
3. **ARCHITECTURE.md research** uses a looser `/CS\d+/` extraction pattern (not the anchored `/^CS\d{7}$/` from REQUIREMENTS.md).
4. **ServiceNow Community research** ([Agent workspace Title bar showing record number](https://www.servicenow.com/community/csm-forum/agent-workspace-title-bar-showing-record-number/m-p/2616307)) confirms that the `sessionTabTitle` property determines tab format, defaulting to `contact,consumer,number`. This typically renders as `CS1234567 - Description...` or `CS1234567 | Contact Name`, **not** a bare `CS1234567`.

**Assessment:** The strict regex `/^CS\d{7}$/` (expects the ENTIRE title to be exactly 7-digit CS number) is very likely too strict and will fail on real Polaris pages. The correct approach is extraction: `title.match(/CS(\d{7})/)?.[1]` or `title.match(/\bCS\d{7}\b/)?.[0]`.

**Risk:** Low — the fix is a one-line regex change. The planner should use an extraction regex, not a whole-string match. The REQUIREMENTS.md spec should be treated as "the CS# is in the title" not "the title equals the CS#".

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation in popup | Custom ID scheme | `crypto.randomUUID()` (browser built-in) | Available in MV3 popup context; no package needed |
| Partial unique index enforcement | Application-layer dedup | SQL partial unique index (SQL-only, per 0018 migration pattern) | Race-condition-safe at DB level; N concurrent inserts with same `client_capture_id` → only one wins |
| Background→foreground state | Custom IPC mechanism | `setBackgroundState`/`onBackgroundRestore` SDK primitive | Even Hub manages the Headless WebView replay cycle; do not invent an alternative |
| Re-launch persistence | Browser `localStorage` | `bridge.setLocalStorage`/`bridge.getLocalStorage` | Browser localStorage unreliable in Flutter WebView per EVEN-SKILLS.md §"Persistence" |
| content-script → popup communication | Custom messaging framework | `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` | Standard MV3 messaging; already works in Safari WKWebExtension |

---

## Common Pitfalls

### Pitfall 1: Registering setBackgroundState INSIDE init()
**What goes wrong:** The SDK may snapshot state before `init()` resolves (background happens mid-init). Registering inside `init()` means the snapshot function is not yet registered and the restore will fire with stale data or not at all.
**Why it happens:** `audio-session-guard.ts` models the correct pattern but it is called from within init(). For screen-state, the registration must be at module scope.
**How to avoid:** Register all `setBackgroundState`/`onBackgroundRestore` calls at module top-level (before `async function init()`), just as `onLaunchSource` is registered.
**Warning signs:** D-07 drift test adds a new check for `setBackgroundState(` index < `function init(` index.

### Pitfall 2: Using browser `localStorage` instead of `bridge.setLocalStorage`
**What goes wrong:** The screen state key `vigil:v3:lastScreen` is lost on plugin re-launch (Even Hub Flutter WebView does not reliably persist browser localStorage).
**Why it happens:** Web developers instinctively use `window.localStorage`.
**How to avoid:** Always call `bridge.setLocalStorage` / `bridge.getLocalStorage` per EVEN-SKILLS.md.
**Warning signs:** Screen-restore works in simulator (browser localStorage survives) but fails on hardware (Flutter WebView).

### Pitfall 3: `window.close()` vs programmatic popup close timing
**What goes wrong:** If `window.close()` is called before the `fetch()` promise resolves, the popup closes on network error (appears success).
**Why it happens:** Async fetch + synchronous close.
**How to avoid:** `window.close()` ONLY in the `.then()` path after confirming `res.ok` (HTTP 200). D-03: close on HTTP 200 only.
**Warning signs:** Popup closes even on network errors.

### Pitfall 4: `chrome.action.disable()` requires `tabs` permission AND service worker
**What goes wrong:** Without a service worker, there is no persistent context to listen to `tabs.onUpdated`. Without the `tabs` permission, `tabs.onUpdated` events do not include the URL.
**Why it happens:** MV3 popup context is destroyed between opens; URL listener needs a persistent service worker.
**How to avoid:** Add `"background": {"service_worker": "background.js"}` + `"tabs"` permission + `"*://*.service-now.com/*"` to `host_permissions`.
**Warning signs:** `chrome.action.disable()` throws "Cannot access a chrome:// URL" or button stays enabled on non-SN pages.

### Pitfall 5: SVCNOW-03 field name mismatch — spec says `description`, route reads `shortDescription`
**What goes wrong:** Extension sends `{ description: "..." }` but route reads `wo.shortDescription`, yielding empty string in DB.
**Why it happens:** REQUIREMENTS.md uses human-readable name (`description`); route uses the legacy field name (`shortDescription`).
**How to avoid:** Extension popup must send `shortDescription` (camelCase, not `description`).
**Warning signs:** Work order row created with empty `short_description` column.

### Pitfall 6: Global `case_number` PK → multi-user stomp
**What goes wrong:** If two users have CS0123456 from different clients, inserting from the extension overwrites the other user's row (same global PK).
**Why it happens:** The `work_orders` PK is a global `case_number` text (historical from pre-multi-user schema).
**How to avoid:** Phase 129 DOES NOT fix this pre-existing issue. The `client_capture_id` partial unique index prevents popup-retry double-insert but does NOT prevent user-A from overwriting user-B's case. Document this as a known limitation; flag for a future schema migration.
**Warning signs:** (Document for future, not this phase.)

### Pitfall 7: dev-preview bridge missing `setBackgroundState`
**What goes wrong:** When testing via `evenhub qr` (Vite dev preview sideload), `bridge.setBackgroundState` is `undefined` and calling it throws.
**Why it happens:** The dev preview bridge is a stub that only exposes the minimal Even Hub SDK surface; production iPhone Even Hub WebView exposes the full surface.
**How to avoid:** Feature-detect before calling (exactly as audio-session-guard.ts lines 136-141). Log a console.warn (not error) in the else path.
**Warning signs:** Plugin crashes in dev preview with "bridge.setBackgroundState is not a function".

---

## Code Examples

### setBackgroundState registration at module scope (new screen-restore module)

```typescript
// Source: audio-session-guard.ts pattern (adapted for screen state)
// vigil-g2-plugin/src/lib/screen-state-restore.ts

const SCREEN_STATE_KEY = 'vigil-screen-state'
const COMPANION_STATE_KEY = 'vigil-companion-state'
const LAST_SCREEN_LS_KEY = 'vigil:v3:lastScreen'
const TTL_MS = 30 * 60 * 1000  // 30 minutes — locked per D-05

interface StoredLastScreen {
  screen: ScreenName
  args?: { id: string | number }
  savedAt: number
}

// Called from main.ts at MODULE SCOPE before init()
export function registerBackgroundStateHandlers(
  bridge: BackgroundStateBridge,
  getCompanionSnapshot: () => CompanionSnapshot,
  restoreCompanionSnapshot: (s: CompanionSnapshot) => void,
  getScreenSnapshot: () => { screen: ScreenName; args?: { id: string | number } },
  restoreScreenFn: (screen: ScreenName, args: { id?: string | number } | undefined, bridge: BackgroundStateBridge) => Promise<void>,
): void {
  if (
    typeof (bridge as { setBackgroundState?: unknown }).setBackgroundState !== 'function' ||
    typeof (bridge as { onBackgroundRestore?: unknown }).onBackgroundRestore !== 'function'
  ) {
    console.warn('[screen-state-restore] Dev preview bridge — setBackgroundState/onBackgroundRestore unavailable')
    return
  }

  // D-11: companion HUD cache fold
  bridge.setBackgroundState(COMPANION_STATE_KEY, () => getCompanionSnapshot())
  bridge.onBackgroundRestore(COMPANION_STATE_KEY, (saved: unknown) => {
    restoreCompanionSnapshot(saved as CompanionSnapshot)
  })

  // G2-LIFECYCLE-01: screen state
  bridge.setBackgroundState(SCREEN_STATE_KEY, () => getScreenSnapshot())
  bridge.onBackgroundRestore(SCREEN_STATE_KEY, async (saved: unknown) => {
    const s = saved as { screen?: ScreenName; args?: { id?: string | number } }
    if (s.screen) {
      await restoreScreenFn(s.screen, s.args, bridge)
    }
  })
}
```

### setLocalStorage write on navigation + TTL-gated restore in pickInitialScreen

```typescript
// Source: launch-source-helpers.ts pattern (adapted)
// Addition to navigateTo() in navigation.ts:
export async function navigateTo(screen: ScreenName, bridge: EvenAppBridge): Promise<void> {
  currentScreen = screen
  const container = await buildScreen(screen)
  await bridge.rebuildPageContainer(container)
  // G2-LIFECYCLE-02: write last-viewed screen to SDK localStorage on every navigation
  // bridge.setLocalStorage is fire-and-forget (no await needed for UX)
  const stored: StoredLastScreen = { screen, savedAt: Date.now() }
  bridge.setLocalStorage(LAST_SCREEN_LS_KEY, JSON.stringify(stored)).catch(() => {})
}

// In launch-source-helpers.ts: extend pickInitialScreen for non-glassesMenu restore
export async function pickInitialScreen(
  source: LaunchSource,
  fetchSessions: () => Promise<AgentSessionRow[]>,
  bridge: { getLocalStorage: (key: string) => Promise<string | null> }, // injected for testability
): Promise<ScreenName> {
  // D-10: glassesMenu takes precedence — no restore
  if (source !== 'glassesMenu') {
    // G2-LIFECYCLE-02: attempt TTL-gated restore
    try {
      const raw = await bridge.getLocalStorage(LAST_SCREEN_LS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as StoredLastScreen
        if (typeof stored.savedAt === 'number' && Date.now() - stored.savedAt <= TTL_MS) {
          return stored.screen  // (navigateTo with args handled in main.ts init path)
        }
      }
    } catch {
      // Malformed localStorage — fall through to HOME
    }
    return HOME
  }
  // Existing glassesMenu path (unchanged)
  const sessions = await fetchSessions()
  return hasActiveSession(sessions) ? COMPANION : HOME
}
```

### MV3 service worker: tabs.onUpdated action enable/disable

```javascript
// Source: MDN + Chrome Extension docs pattern
// vigil-extension/background.js

const SN_PATTERN = /^https?:\/\/[^/]+\.service-now\.com\//

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    const url = tab.url ?? changeInfo.url ?? ''
    if (SN_PATTERN.test(url)) {
      chrome.action.enable(tabId)
    } else {
      chrome.action.disable(tabId)
    }
  }
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId)
  if (SN_PATTERN.test(tab.url ?? '')) {
    chrome.action.enable(tabId)
  } else {
    chrome.action.disable(tabId)
  }
})
```

### CS# extraction regex (corrected from REQUIREMENTS.md anchor)

```javascript
// Source: empirical analysis — Polaris titles are compound strings, not bare CS#
// Correct extraction approach:
function extractCaseNumber(title) {
  const match = title.match(/\bCS\d{7}\b/)
  return match ? match[0] : null
}

// Example: "CS1234567 - Printer not working" → "CS1234567"
// Example: "CS0356295" (rare but possible on some SN configs) → "CS0356295"
// REQUIREMENTS.md uses /^CS\d{7}$/ — too strict; this extraction approach is correct
```

### Drizzle migration pattern for `client_capture_id` (mirror Phase 121)

```sql
-- 0021_add_work_orders_client_capture_id.sql
-- Phase 129 SVCNOW-04: add client_capture_id for popup submission deduplication.
-- Mirrors 0018_add_agent_events.sql partial unique pattern.
-- Re-run safe: IF NOT EXISTS.

ALTER TABLE "work_orders"
  ADD COLUMN IF NOT EXISTS "client_capture_id" text;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_work_orders_user_client_capture_id"
  ON "work_orders" ("user_id", "client_capture_id")
  WHERE "client_capture_id" IS NOT NULL;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Browser `localStorage` for G2 state | `bridge.setLocalStorage` (SDK primitive) | Phase 128a research / EVEN-SKILLS.md | Flutter WebView doesn't reliably persist browser localStorage across app restarts |
| Single persistence path for G2 state | Two-path: `setLocalStorage` (re-launch) + `setBackgroundState` (background→foreground) | Phase 129 | Covers both failure modes: plugin re-launch AND in-session phone-background |
| MV2 background pages | MV3 service workers | Chrome MV3 rollout (enforced 2024) | Service worker lifecycle (ephemeral, not persistent) means action-button state must be set on every tab event |
| Popup-only architecture | Popup + service worker + content script | Phase 129 | `tabs.onUpdated` requires service worker; title MutationObserver (SVCNOW-02) requires content script |

**Deprecated/outdated:**
- Phase 84 popup (capture-the-page): retired by D-02 in this phase. The full popup.html/css/js is replaced; no fallback mode preserved.

---

## Validation Architecture

> `workflow.nyquist_validation` key is absent from config.json — treating as enabled per spec.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js native test runner via `tsx --test` |
| Config file | `package.json` `"test"` script: `tsx --test "src/**/*.test.ts"` |
| Quick run command | `npx tsx --test "src/__tests__/main.test.ts" "src/__tests__/navigation.test.ts"` |
| Full G2 plugin suite | `cd vigil-g2-plugin && npx tsx --test "src/**/*.test.ts"` |
| Full vigil-core suite | `cd vigil-core && npx tsx --test "src/**/*.test.ts"` |

**Current baseline:** 21/21 pass on `main.test.ts` + `navigation.test.ts` (D-07 drift tests). 3 test files fail due to missing `@evenrealities/even_hub_sdk` package in CI/Linux environment (audio-session-guard, deduped-device-status, companion — SDK not installed on dev box). These failures are **pre-existing** and unrelated to Phase 129 changes.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| G2-LIFECYCLE-02 | 30-min TTL boundary (29:59 → restore; 30:01 → HOME) | unit | `npx tsx --test "src/lib/__tests__/screen-state-restore.test.ts"` | ❌ Wave 0 |
| G2-LIFECYCLE-02 | Null/missing localStorage → HOME | unit | same file | ❌ Wave 0 |
| G2-LIFECYCLE-02 | Malformed JSON in localStorage → HOME (no throw) | unit | same file | ❌ Wave 0 |
| G2-LIFECYCLE-03 | `glassesMenu` source bypasses restore (D-10) | unit | `npx tsx --test "src/__tests__/main.test.ts"` + new test in that file | ❌ (new test in existing file) |
| G2-LIFECYCLE-01 | setBackgroundState registered BEFORE init() | drift-detector | `npx tsx --test "src/__tests__/main.test.ts"` + new drift test | ❌ (new test in existing file) |
| G2-LIFECYCLE-01 | Feature-detect: no crash when bridge lacks setBackgroundState | unit | `npx tsx --test "src/lib/__tests__/screen-state-restore.test.ts"` | ❌ Wave 0 |
| G2-LIFECYCLE-01 | onBackgroundRestore: companion HUD hydrated from snapshot | unit | same file | ❌ Wave 0 |
| SVCNOW-01 | CS# extracted from compound title (e.g. "CS1234567 - Desc") | unit | `npx tsx --test "src/lib/__tests__/popup-helpers.test.ts"` (vigil-ext, node) | ❌ Wave 0 |
| SVCNOW-01 | Null returned when no CS# in title | unit | same file | ❌ Wave 0 |
| SVCNOW-04 | Multi-tab race: two identical `client_capture_id` values → dedup | integration (mocked DB) | `cd vigil-core && npx tsx --test "src/routes/work-orders.test.ts"` | ❌ Wave 0 |
| SVCNOW-04 | New `client_capture_id` column in schema + migration | drift-detector | `cd vigil-core && npx tsx --test "src/routes/work-orders.test.ts"` | ❌ Wave 0 |
| SVCNOW-05 | Chrome + Safari popup.html/css/js are byte-identical | drift-detector | `npx tsx --test "vigil-extension/__tests__/parity.test.ts"` | ❌ Wave 0 |
| SVCNOW-05 | Chrome + Safari manifest fields parity (host_permissions, background, etc.) | drift-detector | same file | ❌ Wave 0 |

### Drift-Detector Tests Required (new)

1. **D-07 extension: setBackgroundState registration precedes `function init`** — Add to `main.test.ts`:
   ```typescript
   test("D-129 drift: setBackgroundState registration at module scope (before init)", () => {
     const bgIdx = mainNoComments.indexOf("setBackgroundState(")
     assert.ok(bgIdx > 0, "setBackgroundState registration found")
     assert.ok(bgIdx < initIdx, "must precede function init()")
   })
   ```

2. **TTL constant lock** — Pin `30 * 60 * 1000` in `screen-state-restore.ts` source content test (prevents accidental TTL drift):
   ```typescript
   test("TTL drift: 30-min constant is 30 * 60 * 1000", () => {
     assert.match(restoreSrc, /30\s*\*\s*60\s*\*\s*1000/)
   })
   ```

3. **Chrome+Safari parity** — Read both manifest.json + popup.{html,css,js} and assert structural equivalence (same keys in manifest, same DOM element IDs in popup.html).

4. **`client_capture_id` migration SQL** — Assert the partial unique index SQL (`WHERE "client_capture_id" IS NOT NULL`) appears verbatim in the migration file (mirrors Phase 121 0018 drift detector pattern).

### TTL Boundary Tests

```typescript
// screen-state-restore.test.ts
test("29min 59s → restores screen", () => {
  const stored = { screen: 'work-orders', savedAt: Date.now() - (30 * 60 * 1000 - 1000) }
  assert.equal(pickRestoredScreen(stored, Date.now()), 'work-orders')
})
test("30min 01s → falls back to home (TTL expired)", () => {
  const stored = { screen: 'work-orders', savedAt: Date.now() - (30 * 60 * 1000 + 1000) }
  assert.equal(pickRestoredScreen(stored, Date.now()), 'home')
})
test("missing savedAt → falls back to home", () => {
  assert.equal(pickRestoredScreen({}, Date.now()), 'home')
})
```

### Sampling Rate

- **Per task commit:** `npx tsx --test "src/__tests__/main.test.ts"` (sub-5s, D-07 drift guards)
- **Per wave merge:** Full G2 plugin suite + vigil-core work-orders tests
- **Phase gate:** Both suites green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vigil-g2-plugin/src/lib/__tests__/screen-state-restore.test.ts` — TTL boundary + feature-detect + companion snapshot coverage
- [ ] `vigil-g2-plugin/src/__tests__/main.test.ts` — new drift tests for setBackgroundState + glassesMenu precedence
- [ ] `vigil-core/src/routes/work-orders.test.ts` — new file for SVCNOW-04 dedup + client_capture_id migration drift
- [ ] `vigil-extension/__tests__/parity.test.ts` — Chrome+Safari lock-step parity assertions (reads both file sets, asserts structural equivalence)
- [ ] Popup CS# extraction helper test — pure function, node:test runnable without browser context

---

## Architectural Questions / Risks for Planner

### Q1: Extract `background-state-registry.ts`? (Answered: YES for cleanliness)

**Question:** Should a `background-state-registry.ts` module be extracted to avoid duplicating the `setBackgroundState`/`onBackgroundRestore` registration boilerplate between `audio-session-guard.ts` and `screen-state-restore.ts`?

**Answer:** YES, recommended. The pattern (key + snapshot fn + restore fn + feature-detect wrapper) is identical in both modules. A registry module would:
- Accept `{ key, snapshot: () => T, restore: (saved: T) => void }` entries
- Run the feature-detect once
- Register all entries in one `if (bridge supports bg state)` block

`audio-session-guard.ts` already exists and is Phase 127/130's domain — do NOT refactor it in Phase 129. Instead, `screen-state-restore.ts` should use the same pattern internally (copy the feature-detect wrapper), and a Phase 130+ refactor can extract the registry if a third consumer emerges.

### Q2: `navigateToTaskDetail` + `setLocalStorage` — args id capture

**Problem:** `navigateToTaskDetail()` in `navigation.ts` sets `currentScreen = Screen.TASK_DETAIL` but uses an `itemIndex` into `getLastFetchedTasks()` rather than a stable task ID. The task's `caseNumber` (not list index) is the correct stored arg for restore.

**Resolution:** The `setLocalStorage` write should happen inside `navigateToTaskDetail()` with `{ screen: Screen.TASK_DETAIL, args: { id: task.caseNumber }, savedAt: Date.now() }`. The existing `buildScreen(Screen.TASK_DETAIL)` path already re-fetches via `fetchBrief()` and falls back to the work-orders list — this is the correct D-07 behavior (fallback to WORK_ORDERS list, not HOME).

### Q3: SVCNOW popup must send `shortDescription`, not `description` — require explicit spec clarification

The REQUIREMENTS.md SVCNOW-03 spec says `description` but the route reads `shortDescription`. The planner must use `shortDescription` in the task. This is not a spec change — it is a field name resolution. The ARCHITECTURE.md already documents this correctly (line 193: `shortDescription: "<typed>"`).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Polaris `document.title` format on case pages is `CS1234567 - Description...` (compound string, not bare CS#); regex must extract, not match-whole-string | Standard Stack / SVCNOW-01 | Low — fix is a one-line regex change from `/^CS\d{7}$/` to `/\bCS\d{7}\b/` for extraction; no API changes needed |
| A2 | `chrome.action.disable(tabId)` greying-out behavior is identical in Safari WKWebExtension for the lock-step port | SVCNOW-05 / Safari | Medium — Safari MV3 support lags Chrome; `browser.action.disable()` syntax may differ; verify at Safari port time |
| A3 | `bridge.setLocalStorage` / `bridge.getLocalStorage` return Promise<string | null> (null when key absent) | G2-LIFECYCLE-02 | Low — consistent with EVEN-SKILLS.md description; verifiable from SDK .d.ts before coding |
| A4 | `pickInitialScreen` can be extended with a `bridge` parameter without breaking the D-07 drift tests | G2-LIFECYCLE-02 | Low — tests check `onLaunchSource` ordering and `launchSourcePromise` declaration, not `pickInitialScreen` signature |
| A5 | The work-orders `POST /v1/work-orders/sync` route returns HTTP 200 (not 201) for the extension popup success path | D-03 / SVCNOW-03 | None — verified by code inspection; line 74 `return c.json({ synced: valid.length })` is HTTP 200 by Hono default |

---

## Open Questions

1. **Polaris title format — operator should confirm before plan execution**
   - What we know: Real case numbers are 7-digit `CS0XXXXXX`; Polaris tab title may include other text.
   - What's unclear: Exact format of the operator's company's Polaris instance title (it's configurable per-instance via `sessionTabTitle`).
   - Recommendation: Use extraction regex `/\bCS\d{7}\b/` (safe for both bare and compound titles). If wrong, one-line fix.

2. **`pickInitialScreen` signature change + D-07 drift tests**
   - What we know: `pickInitialScreen` needs `bridge.getLocalStorage` for the restore path, but the current test stubs it as `() => Promise<AgentSessionRow[]>`.
   - What's unclear: Whether to inject `bridge` as a parameter or read from a module-scoped ref.
   - Recommendation: Accept `bridge` as a third optional parameter with null default for tests that don't exercise the restore path. The D-07 drift tests do not assert `pickInitialScreen` signature — safe to extend.

3. **`setLocalStorage` write in `navigateToTaskDetail` — async concern**
   - What we know: `navigateToTaskDetail` is called from `onEvenHubEvent` which is fire-and-forget.
   - What's unclear: Does `bridge.setLocalStorage` need to be awaited or can it be fire-and-forget?
   - Recommendation: Fire-and-forget (`.catch(() => {})`) — same pattern as audio-session-guard. Lost write on crash is acceptable; next navigation will overwrite anyway.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@evenrealities/even_hub_sdk` | G2 plugin tests | ✗ | — | Tests use structural mocks; audio-session-guard/companion tests already fail for this reason (pre-existing) |
| Chrome browser | Extension manual testing | ✓ (dev box) | — | — |
| Safari + Xcode | Safari extension port | ✗ (Linux dev box) | — | Operator verifies Safari port on macOS; Linux CI cannot run Safari tests |
| PostgreSQL | vigil-core migration tests | ✗ (CI uses mocked DB) | — | Migration SQL is manually verified; route tests use DI stubs |
| `tsx` (via `npx`) | Running test suite | ✓ | 4.22.0 | — |
| Node.js | Test runner | ✓ | 24.15.0 | — |

**Missing dependencies with no fallback:**
- Safari extension can only be validated on macOS with Xcode. Linux/CI cannot run Safari extension build or test. Operator must manually verify Safari port.

**Missing dependencies with fallback:**
- `@evenrealities/even_hub_sdk` → structural interface mocks (existing pattern from `audio-session-guard.test.ts`)

---

## Security Domain

> `security_enforcement` key is absent from config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Bearer API key already enforced by `bearerAuth` middleware on `/v1/work-orders/sync` |
| V3 Session Management | No | Extension uses stored API key; no session tokens |
| V4 Access Control | Yes | `userId` scoping on work-orders INSERT (existing route pattern); `(user_id, client_capture_id)` index is per-user |
| V5 Input Validation | Yes | Extension popup: `caseNumber` validated by extraction regex; `shortDescription` length upper bound (2000 chars recommended); `priority` validated against allowlist on server |
| V6 Cryptography | No | UUIDs are non-secret identifiers; no encryption needed |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leaked in extension popup.js | Information Disclosure | API key stored in `chrome.storage.local`, NOT in extension source; existing pattern from Phase 84 preserved |
| Extension can `fetch()` to arbitrary origins | Tampering | CSP in popup.html; `host_permissions` limits to `api.vigilhub.io` + `*.service-now.com` |
| `client_capture_id` forge (attacker sends pre-known UUID to block legitimate submission) | Denial of Service | Low risk — `(user_id, client_capture_id)` is per-user; attacker would need the victim's `user_id` AND their UUID; UUID space (2^122) makes collision negligible |
| Mass-assignment via extension popup sending extra fields | Tampering | Route sanitizer (line 34) destructures only 9 known fields; `client_capture_id` added as 10th known field |

---

## Sources

### Primary (HIGH confidence)
- `vigil-g2-plugin/src/lib/audio-session-guard.ts` — canonical `setBackgroundState`/`onBackgroundRestore` pattern [VERIFIED: code inspection]
- `vigil-g2-plugin/src/main.ts` lines 76-90 — D-07 module-scope `onLaunchSource` registration [VERIFIED: code inspection]
- `vigil-g2-plugin/src/__tests__/main.test.ts` — D-07 drift test structure [VERIFIED: code inspection + test run 21/21 pass]
- `vigil-g2-plugin/src/navigation.ts` — `Screen` enum, `navigateTo`, `navigateToTaskDetail`, `SCREEN_ORDER` [VERIFIED: code inspection]
- `vigil-core/src/routes/work-orders.ts` — POST body shape, HTTP 200 response, field names [VERIFIED: code inspection]
- `vigil-core/src/db/schema.ts` — `workOrders` table: global `case_number` PK, no `client_capture_id` column [VERIFIED: code inspection]
- `vigil-core/drizzle/0018_add_agent_events.sql` — Phase 121 partial unique index pattern for `client_capture_id` [VERIFIED: code inspection]
- `vigil-extension/manifest.json` + `vigil-safari-extension/...manifest.json` — current manifest state, no service_worker [VERIFIED: code inspection]
- `vigil-extension/popup.{html,css,js}` — full Phase 84 popup to be retired [VERIFIED: code inspection]
- `.planning/research/EVEN-SKILLS.md` — `setLocalStorage`/`setBackgroundState` SDK primitive documentation [CITED: internal research doc, sourced from GitHub even-realities/everything-evenhub 2026-05-11]

### Secondary (MEDIUM confidence)
- ServiceNow Community: [Agent workspace Title bar showing record number](https://www.servicenow.com/community/csm-forum/agent-workspace-title-bar-showing-record-number/m-p/2616307) — evidence that Polaris tab titles are compound strings driven by `sessionTabTitle` property [MEDIUM — community post, not verified against operator's specific instance]
- `.planning/research/ARCHITECTURE.md` line 186 — looser `/CS\d+/` extraction regex for `document.title` [CITED: internal research doc]
- `vigil-core/src/services/gmail-workorder-service.ts` lines 150-154 — real CS# format examples from operator's actual ServiceNow instance (`CS0353598`, `CS0356295`, etc.) [VERIFIED: code inspection; confirms 7-digit format]

### Tertiary (LOW confidence)
- Training knowledge on MV3 `tabs.onUpdated` + `chrome.action.disable()` API shape [ASSUMED — verify against official Chrome Extension docs before coding background.js]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages are existing installed dependencies; no new packages
- Architecture: HIGH — G2 lifecycle patterns verified against running code; extension structure verified from file inspection
- Polaris title regex: MEDIUM — empirical probe was not possible (no live SN page); evidence from codebase + community posts strongly suggests extraction needed
- Pitfalls: HIGH — verified against actual code (setBackgroundState dev-preview gap confirmed in audio-session-guard.ts comments)

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (30 days — stable stack, no fast-moving dependencies)
