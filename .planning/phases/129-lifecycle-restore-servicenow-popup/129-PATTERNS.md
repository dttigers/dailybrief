# Phase 129: Lifecycle Restore + ServiceNow Popup - Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 16 new/modified files
**Analogs found:** 14 / 16

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `vigil-g2-plugin/src/lib/screen-state-restore.ts` | utility | event-driven | `vigil-g2-plugin/src/lib/audio-session-guard.ts` | exact |
| `vigil-g2-plugin/src/lib/launch-source-helpers.ts` | utility | request-response | self (modified) | self |
| `vigil-g2-plugin/src/navigation.ts` | utility | event-driven | self (modified) | self |
| `vigil-g2-plugin/src/main.ts` | entrypoint | event-driven | self (modified — module-scope additions) | self |
| `vigil-g2-plugin/src/lib/__tests__/screen-state-restore.test.ts` | test | — | `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` | exact |
| `vigil-g2-plugin/src/__tests__/main.test.ts` | test | — | self (modified — new drift tests appended) | self |
| `vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql` | migration | batch | `vigil-core/drizzle/0018_add_agent_events.sql` | exact |
| `vigil-core/src/db/schema.ts` | model | — | self (modified — add `clientCaptureId` to `workOrders`) | self |
| `vigil-core/src/routes/work-orders.ts` | route | request-response | self (modified — read `clientCaptureId` + dedup guard) + `vigil-core/src/routes/agent-events.test.ts` for dedup pattern | exact |
| `vigil-core/src/routes/work-orders.test.ts` | test | — | `vigil-core/src/routes/agent-events.test.ts` | exact |
| `vigil-extension/manifest.json` | config | — | self (modified) | self |
| `vigil-extension/background.js` | service-worker | event-driven | none in codebase | no analog |
| `vigil-extension/content-script.js` | content-script | event-driven | none in codebase | no analog |
| `vigil-extension/popup.html` | component | request-response | `vigil-extension/popup.html` (replaced) | self |
| `vigil-extension/popup.css` | component | — | `vigil-extension/popup.css` (replaced) | self |
| `vigil-extension/popup.js` | component | request-response | `vigil-extension/popup.js` (replaced) | self |
| `vigil-safari-extension/.../manifest.json` | config | — | `vigil-extension/manifest.json` (lock-step copy) | exact |
| `vigil-safari-extension/.../background.js` | service-worker | event-driven | `vigil-extension/background.js` (lock-step copy) | exact |
| `vigil-safari-extension/.../content-script.js` | content-script | event-driven | `vigil-extension/content-script.js` (lock-step copy) | exact |
| `vigil-safari-extension/.../popup.html` | component | request-response | `vigil-extension/popup.html` (lock-step copy) | exact |
| `vigil-safari-extension/.../popup.css` | component | — | `vigil-extension/popup.css` (lock-step copy) | exact |
| `vigil-safari-extension/.../popup.js` | component | request-response | `vigil-extension/popup.js` (lock-step copy) | exact |
| `vigil-extension/__tests__/parity.test.ts` | test | — | `vigil-g2-plugin/src/__tests__/main.test.ts` (drift-detector style) | role-match |

---

## Pattern Assignments

### `vigil-g2-plugin/src/lib/screen-state-restore.ts` (NEW utility, event-driven)

**Analog:** `vigil-g2-plugin/src/lib/audio-session-guard.ts`

**Imports pattern** (lines 1-3 of audio-session-guard.ts):
```typescript
import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
// New module does NOT import from SDK directly for its bridge interface —
// declare a local structural interface (same rationale as AudioGuardBridge lines 54-59).
```

**Bridge interface pattern** (audio-session-guard.ts lines 54-59):
```typescript
export interface AudioGuardBridge {
  audioControl(isOpen: boolean): Promise<boolean>
  onEvenHubEvent(callback: (event: EvenHubEvent) => void): () => void
  setBackgroundState(key: string, snapshot: () => unknown): void
  onBackgroundRestore(key: string, restore: (saved: unknown) => void): void
}
// New module: declare ScreenRestoreBridge with setBackgroundState + onBackgroundRestore
// + setLocalStorage + getLocalStorage only (same local-interface isolation rationale).
```

**Feature-detect + registration pattern** (audio-session-guard.ts lines 136-154) — COPY VERBATIM:
```typescript
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
  console.warn(
    '[audio-session-guard] Hook 4 disabled — bridge missing setBackgroundState/onBackgroundRestore (dev preview SDK gap). Hooks 1-3 still active.',
  )
}
```

**Module-state pattern** (audio-session-guard.ts lines 63-66):
```typescript
// Closure-captured module state — COPY THIS PATTERN
let audioActive = false
let cleanupRegistered = false
const BG_STATE_KEY = 'vigil-audio-guard'
// New module mirrors:
// const SCREEN_STATE_KEY = 'vigil-screen-state'
// const COMPANION_STATE_KEY = 'vigil-companion-state'
// const LAST_SCREEN_LS_KEY = 'vigil:v3:lastScreen'
// const TTL_MS = 30 * 60 * 1000  // locked per D-05
```

**Test-reset helper pattern** (audio-session-guard.ts lines 161-171):
```typescript
export function __resetForTesting(): void {
  audioActive = false
  cleanupRegistered = false
}
// New module: export __resetForTesting() for the same reason (per-test clean state).
```

**Key implementation requirements for this file:**
- Register BOTH `setBackgroundState`/`onBackgroundRestore` pairs (companion HUD + screen state) — two keys, one feature-detect block
- D-11 companion HUD fold: `COMPANION_STATE_KEY` registration captures `activeSessions` + `bannerState` from companion.ts module exports
- Screen restore fn: call `navigateToRestored(screen, args, bridge)` inside `onBackgroundRestore`; on 404, navigate to parent list (D-07)
- Snapshot objects MUST be JSON-serializable — no class instances, Maps, Sets, Dates
- `console.warn` (not error) in the else path — mirrors audio-session-guard.ts:151-153

---

### `vigil-g2-plugin/src/lib/launch-source-helpers.ts` (MODIFIED utility, request-response)

**Analog:** self + `vigil-g2-plugin/src/lib/audio-session-guard.ts` for fire-and-forget `.catch(() => {})` pattern

**Existing function signature to extend** (launch-source-helpers.ts lines 112-119):
```typescript
export async function pickInitialScreen(
  source: LaunchSource,
  fetchSessions: () => Promise<AgentSessionRow[]>,
): Promise<ScreenName> {
  if (source !== 'glassesMenu') return HOME
  const sessions = await fetchSessions()
  return hasActiveSession(sessions) ? COMPANION : HOME
}
```

**New signature** — add optional third parameter:
```typescript
export async function pickInitialScreen(
  source: LaunchSource,
  fetchSessions: () => Promise<AgentSessionRow[]>,
  bridge?: { getLocalStorage: (key: string) => Promise<string | null> },
): Promise<ScreenName>
```

**D-10 guard** — glassesMenu path is UNTOUCHED; only the `source !== 'glassesMenu'` branch gains the restore check. Existing `if (source !== 'glassesMenu') return HOME` becomes the TTL-gated restore attempt. Pattern:
```typescript
if (source !== 'glassesMenu') {
  if (bridge) {
    try {
      const raw = await bridge.getLocalStorage(LAST_SCREEN_LS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as StoredLastScreen
        if (typeof stored.savedAt === 'number' && Date.now() - stored.savedAt <= TTL_MS) {
          return stored.screen
        }
      }
    } catch { /* malformed JSON — fall through to HOME */ }
  }
  return HOME
}
// glassesMenu path (unchanged lines 117-119 below)
```

**TTL constant location** (planner's discretion per CONTEXT): inline `30 * 60 * 1000` in this file — matches the existing `5 * 60 * 1000` inline pattern at launch-source-helpers.ts line 45.

**D-07 drift test implication**: the test at main.test.ts line 94 checks `helpers.ts` source for `5\s*\*\s*60\s*\*\s*1000`. The new TTL test will check for `30\s*\*\s*60\s*\*\s*1000` using the same readFileSync pattern.

---

### `vigil-g2-plugin/src/navigation.ts` (MODIFIED utility, event-driven)

**Analog:** self

**`navigateTo` function to extend** (navigation.ts lines 139-147):
```typescript
export async function navigateTo(
  screen: ScreenName,
  bridge: EvenAppBridge,
): Promise<void> {
  currentScreen = screen
  const container = await buildScreen(screen)
  await bridge.rebuildPageContainer(container)
  console.log(`[vigil-g2] navigated to: ${screen}`)
}
```

**G2-LIFECYCLE-02 addition** — insert `setLocalStorage` write AFTER `rebuildPageContainer`, fire-and-forget:
```typescript
  // G2-LIFECYCLE-02: persist last-viewed screen for re-launch restore
  // Fire-and-forget — mirrors audio-session-guard.ts audioControl().catch(() => {}) pattern
  ;(bridge as unknown as { setLocalStorage?: (k: string, v: string) => Promise<void> })
    .setLocalStorage?.(LAST_SCREEN_LS_KEY, JSON.stringify({ screen, savedAt: Date.now() }))
    ?.catch(() => {})
```

**`navigateToTaskDetail` function to extend** (navigation.ts lines 185-196):
```typescript
export async function navigateToTaskDetail(
  itemIndex: number,
  bridge: EvenAppBridge,
): Promise<void> {
  const tasks = getLastFetchedTasks()
  const task = tasks[itemIndex]
  if (!task) return
  currentScreen = Screen.TASK_DETAIL
  const container = buildTaskDetailScreen(task)
  await bridge.rebuildPageContainer(container)
  console.log(`[vigil-g2] navigated to: task-detail (index ${itemIndex})`)
}
```

**G2-LIFECYCLE-02 addition for task detail** — store `args: { id: task.caseNumber }` per D-08:
```typescript
  // Write task-detail restore args — id-only per D-08 (never embed entity snapshot)
  ;(bridge as unknown as { setLocalStorage?: (k: string, v: string) => Promise<void> })
    .setLocalStorage?.(LAST_SCREEN_LS_KEY, JSON.stringify({
      screen: Screen.TASK_DETAIL,
      args: { id: task.caseNumber },
      savedAt: Date.now()
    }))?.catch(() => {})
```

---

### `vigil-g2-plugin/src/main.ts` (MODIFIED entrypoint, event-driven)

**Analog:** self + audio-session-guard.ts for the registration ordering constraint

**Module-scope registration ordering** (main.ts lines 82-85) — CRITICAL CONSTRAINT:
```typescript
// ── Phase 124 D-07: module-scope onLaunchSource registration ──────────
const bridgeInstance = EvenAppBridge.getInstance()
const launchSourcePromise: Promise<LaunchSource> = new Promise((resolve) => {
  bridgeInstance.onLaunchSource((source) => resolve(source))
})
```

**New code must be inserted HERE** — between line 85 and the `// ── SSE client setup` comment at line 87. The `setBackgroundState` registrations must come AFTER `bridgeInstance` is available but BEFORE `async function init(`. Pattern:
```typescript
// ── Phase 129 G2-LIFECYCLE-01: module-scope setBackgroundState registrations ──
// MUST precede function init() — same ordering constraint as onLaunchSource
// (D-07 drift test extended to also check setBackgroundState index < initIdx)
import { registerBackgroundStateHandlers } from './lib/screen-state-restore.ts'
// Called at module scope:
registerBackgroundStateHandlers(
  bridgeInstance as unknown as ScreenRestoreBridge,
  /* getCompanionSnapshot */ () => ({ /* activeSessions, bannerState */ }),
  /* restoreCompanionSnapshot */ (s) => { hydrateActiveSessions((s as CompanionSnapshot).activeSessions) },
  /* getScreenSnapshot */ () => ({ screen: getCurrentScreen() }),
  /* restoreScreenFn */ async (screen, args, bridge) => { /* navigateToRestored logic */ },
)
```

**Drift test extension** — after registering, a new test in main.test.ts must check `mainNoComments.indexOf("setBackgroundState(") < initIdx`. See test pattern section below.

---

### `vigil-g2-plugin/src/lib/__tests__/screen-state-restore.test.ts` (NEW test)

**Analog:** `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts`

**Test file header pattern** (audio-session-guard.test.ts lines 1-27):
```typescript
// Phase 129 Plan XX — screen-state-restore.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
// ...
```

**Fake bridge pattern** (audio-session-guard.test.ts lines 63-110) — adapt for ScreenRestoreBridge:
```typescript
// Fake bridge exposes setBackgroundState + onBackgroundRestore + setLocalStorage + getLocalStorage
// Mirror the FakeBridge shape from audio-session-guard.test.ts:
//   - calls[] for localStorage writes
//   - bgStateSnapshot / bgStateRestore for background state
//   - storageMap: Map<string, string> for localStorage
```

**Module-state reset between cases** (audio-session-guard.test.ts):
```typescript
// Call __resetForTesting() in each test before invoking registerBackgroundStateHandlers
```

**TTL boundary test pattern** (from RESEARCH.md validation architecture):
```typescript
test("29min 59s → restores screen", () => {
  const stored = { screen: 'work-orders', savedAt: Date.now() - (30 * 60 * 1000 - 1000) }
  assert.equal(pickRestoredScreen(stored, Date.now()), 'work-orders')
})
test("30min 01s → falls back to home (TTL expired)", () => {
  const stored = { screen: 'work-orders', savedAt: Date.now() - (30 * 60 * 1000 + 1000) }
  assert.equal(pickRestoredScreen(stored, Date.now()), 'home')
})
```

**Drift-detector test pattern** (extract `30 * 60 * 1000` constant from source):
```typescript
const restoreSrc = readFileSync(resolve(__dirname, '../screen-state-restore.ts'), 'utf-8')
test("TTL drift: 30-min constant is 30 * 60 * 1000", () => {
  assert.match(restoreSrc, /30\s*\*\s*60\s*\*\s*1000/)
})
```

---

### `vigil-g2-plugin/src/__tests__/main.test.ts` (MODIFIED — new drift tests appended)

**Analog:** self (existing drift detector style, lines 44-88)

**New drift test to append** — mirrors existing D-07 drift test structure at lines 44-59:
```typescript
test("D-129 drift: setBackgroundState registration at MODULE SCOPE (before init)", () => {
  const bgIdx = mainNoComments.indexOf("setBackgroundState(")
  const initIdx = mainNoComments.search(/(?:async\s+)?function\s+init\s*\(/)
  assert.ok(bgIdx > 0, "setBackgroundState registration found in main.ts")
  assert.ok(initIdx > 0, "init() declaration found")
  assert.ok(
    bgIdx < initIdx,
    "setBackgroundState registration MUST precede function init() (G2-LIFECYCLE-01 module-scope constraint)"
  )
})
```

**Existing readFileSync pattern** (main.test.ts lines 29-39) — no changes needed, new tests reuse `mainNoComments` / `helpersNoComments` already in scope:
```typescript
const MAIN_SRC = resolve(__dirname, "../main.ts");
const HELPERS_SRC = resolve(__dirname, "../lib/launch-source-helpers.ts");
const mainSrc = readFileSync(MAIN_SRC, "utf-8");
const helpersSrc = readFileSync(HELPERS_SRC, "utf-8");
// stripComments already defined — new tests just call mainNoComments/helpersNoComments
```

---

### `vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql` (NEW migration)

**Analog:** `vigil-core/drizzle/0018_add_agent_events.sql`

**File header comment style** (0018_add_agent_events.sql lines 1-22):
```sql
-- ── Phase 129: SVCNOW-04 client_capture_id dedup ──────────────────────
-- Adds client_capture_id column + (user_id, client_capture_id) partial unique
-- index to work_orders. Mirrors 0018_add_agent_events.sql idempotency pattern.
-- Re-run safe: IF NOT EXISTS throughout.
```

**Column addition pattern** (ALTER TABLE … ADD COLUMN IF NOT EXISTS):
```sql
ALTER TABLE "work_orders"
  ADD COLUMN IF NOT EXISTS "client_capture_id" text;
--> statement-breakpoint
```

**Partial unique index pattern** (0018_add_agent_events.sql lines 50-54) — COPY verbatim, changing table/index/column names:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "uq_work_orders_user_client_capture_id"
  ON "work_orders" ("user_id", "client_capture_id")
  WHERE "client_capture_id" IS NOT NULL;
```

**`--> statement-breakpoint` separator** — required between every SQL statement per Drizzle migration file convention (confirmed in 0018 lines 37, 43, 48).

---

### `vigil-core/src/db/schema.ts` (MODIFIED model)

**Analog:** self — add column to `workOrders` table (lines 310-330)

**Existing table definition** (schema.ts lines 310-330):
```typescript
export const workOrders = pgTable("work_orders", {
  caseNumber: text("case_number").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  store: text("store").notNull().default(""),
  shortDescription: text("short_description").notNull().default(""),
  // ... (trade, location, equipment, priority, contact, state, notes, etc.)
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  index("idx_work_orders_user_id").on(table.userId),
]);
```

**Column to add** — nullable text, NO default, before the closing `}`:
```typescript
  clientCaptureId: text("client_capture_id"),  // nullable; (user_id, client_capture_id) partial unique in 0021 migration
```

**Comment style** (mirrors agentEvents.clientEventId, schema.ts line 459):
```typescript
clientEventId: text("client_event_id"), // nullable; partial unique with userId enforced in 0018 migration (D-A4 + D-C1)
// New:
clientCaptureId: text("client_capture_id"), // nullable; partial unique with userId enforced in 0021 migration (SVCNOW-04)
```

**Note:** No Drizzle-level `uniqueIndex` in schema.ts for this — the 0021 SQL migration carries the partial unique index. This matches the agentEvents pattern (schema.ts lines 459-471 has no index declaration for `clientEventId`; the 0018 SQL migration carries it).

---

### `vigil-core/src/routes/work-orders.ts` (MODIFIED route, request-response)

**Analog:** self (POST handler at lines 11-75) + `vigil-core/src/routes/agent-events.test.ts` for the dedup response pattern

**Mass-assignment sanitizer to extend** (work-orders.ts lines 34-46) — add `clientCaptureId` as 10th field:
```typescript
const sanitized = inputOrders.map((wo: Record<string, unknown>) => ({
  userId,
  caseNumber: String(wo.caseNumber ?? ""),
  store: String(wo.store ?? ""),
  shortDescription: String(wo.shortDescription ?? ""),
  trade: String(wo.trade ?? ""),
  location: String(wo.location ?? ""),
  equipment: String(wo.equipment ?? ""),
  priority: String(wo.priority ?? ""),
  contact: String(wo.contact ?? ""),
  state: String(wo.state ?? ""),
  // NEW — SVCNOW-04: accept clientCaptureId or snake_case fallback
  clientCaptureId: wo.clientCaptureId != null
    ? String(wo.clientCaptureId)
    : wo.client_capture_id != null
    ? String(wo.client_capture_id)
    : null,
  syncedAt: new Date(),
}));
```

**Dedup guard to add** — BEFORE the `for (const wo of valid)` loop (line 54):
```typescript
  // SVCNOW-04: skip insert if (userId, clientCaptureId) already exists
  // Returns 200 {synced: 0} for fully-deduped submissions (D-03 idempotent)
  // Pattern mirrors agent-events.ts dbInsertOrGet "isNew: false" response
```

**Existing insert pattern** (work-orders.ts lines 55-72):
```typescript
    await db
      .insert(workOrders)
      .values(wo)
      .onConflictDoUpdate({
        target: workOrders.caseNumber,
        set: { store: wo.store, shortDescription: wo.shortDescription, /* ... */ },
      });
```

**HTTP response pattern** (work-orders.ts line 74): `return c.json({ synced: valid.length });` — unchanged for non-deduped submits; deduped returns `{ synced: 0 }` (still HTTP 200 per D-03/A5).

---

### `vigil-core/src/routes/work-orders.test.ts` (NEW test)

**Analog:** `vigil-core/src/routes/agent-events.test.ts`

**File structure pattern** (agent-events.test.ts lines 1-70):
```typescript
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
// Lazy import after env is set:
const { workOrdersRouter } = await import("./work-orders.js");
```

**makeDeps / dependency injection pattern** — work-orders.ts uses direct `db` import (NOT DI-injected). Two options:
1. Refactor work-orders route to accept injected db (like agent-events uses `deps`)
2. Test via Hono app with mocked route handler (see agent-events.test.ts makeApp pattern lines 62-70)

**Preferred pattern** (agent-events.test.ts lines 62-70) — use Hono app with stubbed userId middleware:
```typescript
function makeApp(userId: number = 1): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/", workOrdersRouter);
  return app;
}
```

**Idempotency test shape** (agent-events.test.ts lines 150-190) — adapt for `client_capture_id`:
```typescript
test("SVCNOW-04/T1: POST same clientCaptureId twice → first synced:1, second synced:0 (dedup)", async () => {
  // First call → synced: 1
  // Second identical call → synced: 0 (dedup, HTTP 200)
})
```

**Migration drift-detector test** (mirrors main.test.ts readFileSync pattern):
```typescript
import { readFileSync } from "node:fs";
const migrationSrc = readFileSync(resolve(__dirname, "../../drizzle/0021_add_work_orders_client_capture_id.sql"), "utf-8");
test("SVCNOW-04 drift: partial unique index SQL present in 0021 migration", () => {
  assert.match(migrationSrc, /WHERE "client_capture_id" IS NOT NULL/)
})
```

---

### `vigil-extension/manifest.json` (MODIFIED config)

**Analog:** self (current state lines 1-21)

**Current state:**
```json
{
  "manifest_version": 3,
  "name": "Vigil Capture",
  "version": "1.0.0",
  "permissions": ["activeTab", "storage"],
  "host_permissions": ["https://api.vigilhub.io/*"],
  "action": { "default_popup": "popup.html", ... }
}
```

**Additions required (from RESEARCH.md Probe 3):**
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

---

### `vigil-extension/background.js` (NEW service-worker, event-driven)

**No analog in codebase** — use RESEARCH.md code example directly.

**Pattern from RESEARCH.md:**
```javascript
'use strict';
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

**Key notes:** Service worker is ephemeral in MV3 — no module state. The `'use strict'` header mirrors popup.js line 1.

---

### `vigil-extension/content-script.js` (NEW content-script, event-driven)

**No analog in codebase** — use RESEARCH.md architecture diagram pattern.

**Responsibility:** `MutationObserver` on `document.title` for SVCNOW-02 drift detection. Sends message to popup via `chrome.runtime.sendMessage`.

**Pattern:**
```javascript
'use strict';
// Observe title changes — send drift notification to popup if CS# changes
let lastCaseNumber = null;

function extractCaseNumber(title) {
  const match = title.match(/\bCS\d{7}\b/)
  return match ? match[0] : null
}

const observer = new MutationObserver(() => {
  const current = extractCaseNumber(document.title)
  if (lastCaseNumber && current !== lastCaseNumber) {
    chrome.runtime.sendMessage({ type: 'TITLE_DRIFT', from: lastCaseNumber, to: current })
  }
  if (current) lastCaseNumber = current
})

observer.observe(document.querySelector('title') ?? document.head, {
  subtree: true, childList: true, characterData: true
})
```

---

### `vigil-extension/popup.html` (REPLACED — ServiceNow form)

**Analog being replaced:** `vigil-extension/popup.html` (Phase 84 UI retired per D-02)

**Structural conventions to PRESERVE from existing popup.html (lines 1-47):**
- `<!-- Keep in lockstep with ../vigil-safari-extension/... -->` comment at top (update for Phase 129)
- `<meta charset="UTF-8">` + `<meta name="viewport" content="width=320">`
- `<link rel="stylesheet" href="popup.css">`
- `<script src="popup.js"></script>` at bottom of `<body>`
- `'use strict'` in popup.js line 1

**New SVCNOW form DOM structure:**
```html
<!-- ServiceNow Case Capture form — replaces Phase 84 capture-the-page popup (D-02) -->
<div id="svcnow-view" class="view">
  <div class="header">
    <h1 id="case-number-header" class="case-number">CS#</h1>
  </div>
  <div id="drift-banner" class="drift-banner" hidden>CS# changed — reopen popup</div>
  <div class="form-group">
    <label for="description-input">Description</label>
    <textarea id="description-input" rows="4" maxlength="2000" autofocus></textarea>
  </div>
  <div class="form-group">
    <label for="priority-select">Priority</label>
    <select id="priority-select">
      <option value="Low">Low</option>
      <option value="Medium" selected>Medium</option>
      <option value="High">High</option>
      <option value="Critical">Critical</option>
    </select>
  </div>
  <button id="send-btn" class="btn btn-primary">Send</button>
  <div class="shortcut-hint">Cmd+Enter to send</div>
  <div id="send-error" class="error-msg" hidden></div>
</div>
```

---

### `vigil-extension/popup.css` (REPLACED)

**Analog being replaced:** `vigil-extension/popup.css`

**Design tokens to PRESERVE** (popup.css lines 1-17):
```css
/* Keep in lockstep comment — update for Phase 129 */
body {
  width: 320px; /* unchanged */
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #2C2C2A;
  color: #E5E5E3;
  padding: 16px;
}
```

**Brand colors to preserve:**
- Primary green: `#1D9E75` (btn-primary, focus border)
- Error red: `#E5534B`
- Background: `#2C2C2A`
- Input bg: `#1E1E1C`
- Input border: `#444`
- Text muted: `#999`

**New elements to add:** `.case-number` (larger font for CS# header), `select` input styling (mirrors `textarea` style at popup.css lines 63-77), `.drift-banner` (yellow/amber warning).

---

### `vigil-extension/popup.js` (REPLACED)

**Analog being replaced:** `vigil-extension/popup.js`

**Patterns to PRESERVE from existing popup.js:**

**Storage key pattern** (popup.js lines 4-5):
```javascript
const STORAGE_KEY = 'vigil_api_key';
const API_BASE = 'https://api.vigilhub.io';
```

**DOMContentLoaded init pattern** (popup.js lines 197-205):
```javascript
document.addEventListener('DOMContentLoaded', async () => {
  const { [STORAGE_KEY]: apiKey } = await chrome.storage.local.get([STORAGE_KEY]);
  // init with apiKey
});
```

**chrome.tabs.query pattern** (popup.js lines 111-115):
```javascript
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (tab?.url) { /* ... */ }
```

**Cmd+Enter shortcut pattern** (popup.js lines 92-96):
```javascript
contentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    captureBtn.click();
  }
});
```

**Error display pattern** (popup.js lines 133-143 — non-200 error):
```javascript
if (!res.ok) {
  const status = res.status;
  captureError.textContent = `Error (HTTP ${status}). Try again.`;
  captureError.hidden = false;
  captureBtn.disabled = false;
  captureBtn.textContent = 'Send';
  return;
}
```

**D-03 close on 200** — replaces the poll+toast success path:
```javascript
if (res.ok) {
  window.close();  // D-03: close immediately on HTTP 200, no toast
  return;
}
```

**CS# extraction** (RESEARCH.md corrected regex — NOT the anchored REQUIREMENTS.md version):
```javascript
function extractCaseNumber(title) {
  const match = title.match(/\bCS\d{7}\b/)
  return match ? match[0] : null
}
```

**client_capture_id generation** (RESEARCH.md D-12):
```javascript
const clientCaptureId = crypto.randomUUID();
```

**POST body shape** (RESEARCH.md Probe 4 — camelCase per route contract):
```javascript
body: JSON.stringify({
  workOrders: [{
    caseNumber: caseNumber,       // extracted CS#
    shortDescription: description, // NOT `description` — see RESEARCH Probe 4 / Pitfall 5
    priority: priority,
    clientCaptureId: clientCaptureId,
  }]
})
```

---

### Safari extension files (LOCK-STEP COPIES — Phase 114 EXT-02 pattern)

**Analog:** Chrome extension files (exact mirror)

**Phase 114 lock-step comment** (existing popup.html line 2, popup.js line 2, popup.css line 1):
```
<!-- Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/popup.html — Phase 114 (D-02) -->
```
Update to: `Phase 129 (D-13)`

**Safari manifest** is currently identical to Chrome manifest (`vigil-safari-extension/Vigil Capture Extension/Resources/manifest.json` lines 1-21 match Chrome exactly). Must remain identical after Phase 129 changes.

**Xcode project** — `SafariWebExtensionHandler.swift` handles only native messaging; no Xcode project changes needed for popup/content-script/service-worker additions (RESEARCH Probe 3).

**Safari-specific caution** (RESEARCH Assumption A2): `browser.action.disable()` syntax may differ from `chrome.action.disable()` in WKWebExtension. Verify at Safari port time; may need `browser.action` instead of `chrome.action` prefix.

---

### `vigil-extension/__tests__/parity.test.ts` (NEW drift-detector test)

**Analog:** `vigil-g2-plugin/src/__tests__/main.test.ts` (drift-detector style using readFileSync)

**File structure pattern** (main.test.ts lines 20-39):
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const chromeManifest = JSON.parse(readFileSync(resolve(__dirname, "../manifest.json"), "utf-8"));
const safariManifest = JSON.parse(readFileSync(resolve(__dirname, "../../vigil-safari-extension/Vigil Capture Extension/Resources/manifest.json"), "utf-8"));
const chromePopupHtml = readFileSync(resolve(__dirname, "../popup.html"), "utf-8");
const safariPopupHtml = readFileSync(resolve(__dirname, "../../vigil-safari-extension/Vigil Capture Extension/Resources/popup.html"), "utf-8");
// ... similarly for popup.css, popup.js, background.js, content-script.js
```

**Parity test shape:**
```typescript
test("SVCNOW-05: Chrome + Safari manifest have identical host_permissions", () => {
  assert.deepEqual(chromeManifest.host_permissions, safariManifest.host_permissions)
})
test("SVCNOW-05: Chrome + Safari manifest have identical permissions array", () => {
  assert.deepEqual(chromeManifest.permissions.sort(), safariManifest.permissions.sort())
})
test("SVCNOW-05: Chrome + Safari popup.html are identical", () => {
  assert.equal(chromePopupHtml, safariPopupHtml)
})
```

---

## Shared Patterns

### `chrome.storage.local` API key access
**Source:** `vigil-extension/popup.js` lines 4, 69, 190, 198
**Apply to:** `vigil-extension/popup.js` (new SVCNOW version)
```javascript
const STORAGE_KEY = 'vigil_api_key';
// Read:
const { [STORAGE_KEY]: apiKey } = await chrome.storage.local.get([STORAGE_KEY]);
```

### Fire-and-forget async with `.catch(() => {})`
**Source:** `vigil-g2-plugin/src/lib/audio-session-guard.ts` lines 103-105, 115-116
**Apply to:** `screen-state-restore.ts`, `navigation.ts` (setLocalStorage writes)
```typescript
bridge.audioControl(false).catch(() => {})
// Pattern for setLocalStorage writes: fire-and-forget, never await
bridge.setLocalStorage(key, value).catch(() => {})
```

### Drizzle partial unique index (SQL-only, not in schema.ts)
**Source:** `vigil-core/drizzle/0018_add_agent_events.sql` lines 50-54
**Apply to:** `0021_add_work_orders_client_capture_id.sql`
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_events_user_client_event_id"
  ON "agent_events" ("user_id", "client_event_id")
  WHERE "client_event_id" IS NOT NULL;
```
No corresponding entry in `schema.ts` — the partial condition cannot be expressed in Drizzle ORM; migration SQL carries it.

### Hono route `c.get("userId")` scoping
**Source:** `vigil-core/src/routes/work-orders.ts` lines 14, 34
**Apply to:** modified `work-orders.ts` POST handler (SVCNOW-04 dedup check uses `userId`)
```typescript
const userId = c.get("userId");
// All DB operations scoped by userId — (userId, clientCaptureId) composite check
```

### `'use strict'` + lockstep comment header
**Source:** `vigil-extension/popup.js` lines 1-2; `vigil-extension/popup.html` lines 1-3
**Apply to:** All new extension JS files (`background.js`, `content-script.js`, new `popup.js`), HTML comments
```javascript
'use strict';
// Keep in lockstep with ../vigil-safari-extension/Vigil Capture Extension/Resources/background.js — Phase 129 (D-13)
```

### Node:test drift-detector (readFileSync source inspection)
**Source:** `vigil-g2-plugin/src/__tests__/main.test.ts` lines 29-39
**Apply to:** New drift tests in `main.test.ts`, `work-orders.test.ts`, `parity.test.ts`
```typescript
const src = readFileSync(resolve(__dirname, "../path/to/file.ts"), "utf-8");
function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
const srcNoComments = stripComments(src);
// Assert against srcNoComments, NOT src (doc-comment false positives)
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `vigil-extension/background.js` | service-worker | event-driven | No MV3 service workers exist in the codebase; RESEARCH.md code example is the reference |
| `vigil-extension/content-script.js` | content-script | event-driven | No content scripts exist in the codebase; RESEARCH.md architecture diagram is the reference |

---

## Metadata

**Analog search scope:** `vigil-g2-plugin/src/`, `vigil-core/src/routes/`, `vigil-core/drizzle/`, `vigil-extension/`, `vigil-safari-extension/`
**Files scanned:** 23 source files + 8 test files + 3 migration files
**Pattern extraction date:** 2026-05-15
