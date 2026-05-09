# Phase 124: G2 Companion HUD + WebSocket fan-out + launch-source/home-overflow polish — Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 13 (4 new, 9 modified, including tests)
**Analogs found:** 11 / 13 (2 introduce new patterns — see "New Patterns Introduced" at bottom)

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `vigil-core/src/lib/agent-events-bus.ts` | utility (in-process pubsub) | event-driven | `vigil-core/src/services/generate-scheduler.ts` (only existing in-process long-lived state holder) | partial — no precedent for `Map<userId, EventEmitter>`; **NEW PATTERN** |
| `vigil-core/src/routes/agent-stream.ts` | route handler (SSE) | streaming (server→client) | `vigil-core/src/routes/agent-events.ts` (DI factory, bearerAuth contract, c.get('userId') invariant) | role-match — DI shape exact, body-handler shape diverges (`streamSSE` vs `c.json`) |
| `vigil-g2-plugin/src/lib/sse-client.ts` | utility (transport shim) | streaming (client←server) | `vigil-g2-plugin/src/api.ts` (auth header construction, VITE_API_KEY plumbing, fallback-on-error pattern) | partial — auth-header reuse is exact; ReadableStream + manual frame parser is **NEW** |
| `vigil-g2-plugin/src/screens/companion.ts` | component (G2 screen view) | request-response + event-driven | `vigil-g2-plugin/src/screens/affirmation.ts` + `vigil-g2-plugin/src/screens/home.ts` (TextContainerProperty 3-container layout, buildVigilHeader, ContainerId enum) | exact role-match — first carousel screen with conditional async-driven content |
| `vigil-core/src/routes/agent-events.ts` (modify) | route handler (existing) | request-response | itself — single new line at the dedupe success path | exact — extend existing DI shape with `bus?` dep |
| `vigil-core/src/index.ts` (modify) | config (route mount) | n/a | itself — line 210 `app.route("/v1", agentEvents)` mount | exact |
| `vigil-g2-plugin/src/main.ts` (modify) | config (entry point) | event-driven (lifecycle) | itself — module-scope additions before `init()` | exact — first module-scope SDK listener registration |
| `vigil-g2-plugin/src/navigation.ts` (modify) | controller (state machine) | event-driven | itself — `Screen` enum + `SCREEN_ORDER` + `handleNavEvent` switch | exact — mechanical extension |
| `vigil-g2-plugin/src/constants.ts` (modify) | config (enum extension) | n/a | itself — `ContainerId` const map | exact — append 13/14/15 |
| `vigil-g2-plugin/src/screens/home.ts` (modify) | component | request-response | itself — `bodyContent` join array | exact — line removal only |
| `vigil-g2-plugin/package.json` (modify) | config (devDep) | n/a | `vigil-core/package.json` (already uses `tsx`) | role-match — server pattern brought to plugin |
| `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` | test | n/a | `vigil-core/src/routes/agent-events.test.ts:1-15` (process.env JWT_SECRET preamble, `node:test` + `assert/strict`, lazy import) | role-match — first test under `lib/` |
| `vigil-core/src/routes/__tests__/agent-stream.test.ts` | test | n/a | `vigil-core/src/routes/agent-events.test.ts` (factory + makeApp helper + makeDeps) | exact — same scaffold; SSE response parsing is the new bit |

---

## Pattern Assignments

### `vigil-core/src/routes/agent-stream.ts` (NEW — route handler, streaming)

**Analog:** `vigil-core/src/routes/agent-events.ts`

**Imports pattern** (from analog, lines 1-6 — adapt for streaming):
```typescript
import { Hono } from "hono";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/connection.js";
import { agentEvents } from "../db/schema.js";
import type { DrizzleAgentEvent } from "../db/types.js";
// NEW for this file:
import { streamSSE } from "hono/streaming";
import { bus } from "../lib/agent-events-bus.js";
```

**DI factory pattern** (analog `agent-events.ts:49-77`):
```typescript
// Reuse this exact shape for testability — production gets real bus,
// tests get a fake bus that exposes manual emit().
export interface AgentStreamDeps {
  dbAvailable: boolean;
  bus: {
    on(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
    off(userId: number, listener: (row: DrizzleAgentEvent) => void): void;
  };
  // For Last-Event-ID replay — DI'd so tests can stub the DB query.
  dbReplayMissed: (
    userId: number,
    afterId: number,
    cutoff: Date,
  ) => Promise<DrizzleAgentEvent[]>;
}

export function createAgentStreamRoute(deps: AgentStreamDeps): Hono {
  const router = new Hono();
  // ...
  return router;
}

// Production singleton at the bottom — mirror analog:280-404
export const agentStream$Route = createAgentStreamRoute({
  get dbAvailable() { return !!db; },
  bus,
  dbReplayMissed: async (userId, afterId, cutoff) => {
    if (!db) return [];
    return db.select().from(agentEvents).where(and(
      eq(agentEvents.userId, userId),
      gt(agentEvents.id, afterId),
      gt(agentEvents.eventTimestamp, cutoff),
    )).orderBy(agentEvents.id);
  },
});
export { agentStream$Route as agentStream };
```

**c.get('userId') invariant comment** (analog `agent-events.ts:81-82`):
```typescript
// userId is non-null because the route is registered AFTER the bearerAuth
// dispatcher at index.ts:135. Mirror this comment verbatim — load-bearing
// for cross-user isolation lock (Phase 121 Plan 04).
const userId = c.get("userId") as number;
```

**Last-Event-ID parsing — defensive (RESEARCH Pitfall 2, no analog in agent-events.ts since it has no body fields)**:
```typescript
const raw = c.req.header("Last-Event-ID");
const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
const resumeFrom =
  Number.isFinite(parsed) && parsed >= 0 && parsed < 2_147_483_647
    ? parsed
    : null;
```

**streamSSE handler body** — see RESEARCH.md §"Pattern 1" (lines 316-393) and §"Don't Hand-Roll" for the full sketch. Key load-bearing pieces:
1. Phase 1 — Replay missed events from `dbReplayMissed`, gate each `writeSSE` on `!stream.aborted && !stream.closed`.
2. Phase 2 — `bus.on(userId, listener)` where listener also gates on aborted/closed.
3. Phase 3 — `setInterval` keepalive every 25s writing `{event: 'ping', data: ''}`.
4. Phase 4 — `stream.onAbort(() => { clearInterval; bus.off(...); })`.
5. Phase 5 — Hold connection open via `await new Promise<void>(resolve => stream.onAbort(resolve))`. Without this, callback resolves and Hono closes the stream (RESEARCH Pitfall 1).

**Mount site comment** — copy and adapt analog `index.ts:203-210`:
```typescript
// Phase 124 (AGENT-API-03): agent-stream is a NEW protected SSE router.
// Mount AFTER the bearerAuth dispatcher at line 136 AND AFTER metricsMiddleware
// at line 158. Do NOT move above line 136 — would create a silent auth bypass
// (cross-user fan-out becomes possible). Mirror agent-events mount comment.
app.route("/v1", agentStream);
```

---

### `vigil-core/src/lib/agent-events-bus.ts` (NEW — utility)

**Analog:** none — `vigil-core/src/lib/` does not yet exist; this introduces the directory.

The closest precedent in the codebase for a long-lived in-process state holder is `vigil-core/src/services/generate-scheduler.ts` (see `index.ts:267-277` for its factory shape), but that's a `setInterval`-driven scheduler not a pub/sub bus. The `Map<userId, EventEmitter>` shape is novel.

**Use the implementation locked in RESEARCH.md §"Pattern 2" (lines 401-441) verbatim.** Key invariants enforced by tests:

- `getOrCreate(userId)` lazily creates an `EventEmitter` with `setMaxListeners(50)` (RESEARCH `node:events` row — default 10 is too tight for reconnect storms).
- `emit(userId, row)` returns early if no emitter exists — never creates an emitter on emit (only on subscribe). Saves memory when there are no SSE subscribers.
- `off(userId, listener)` deletes the Map entry when `listenerCount === 0`. Prevents the Map from growing unboundedly across users.
- Test hooks `_size()` and `_listenerCount(userId)` are intentional — tests in Plan 03's `agent-events-bus.test.ts` assert no leaks across repeated subscribe/unsubscribe cycles (RESEARCH Pitfall 3).

**Cross-user isolation invariant** (load-bearing — Phase 121 D-D2):
- Map key MUST always be the value from `c.get("userId")` set by `bearerAuth` middleware (`vigil-core/src/middleware/auth.ts:60+`). NEVER a value from request body or query.
- One emitter per userId means a listener for userA can never receive an event emitted for userB — they're on different EventEmitter instances. This is structural, not a runtime check.

---

### `vigil-core/src/routes/agent-events.ts` (MODIFIED — add bus.emit hook)

**Single-line change** at line 237 (the `dbInsertOrGet` return point). Reuse the existing DI factory shape — extend `AgentEventsDeps` to accept an optional bus.

**Current code** (analog itself, lines 235-239):
```typescript
const { row, isNew } = await deps.dbInsertOrGet(newRow);
// D-C2: 201 on fresh insert, 200 on idempotent dup (same body shape)
return c.json(row, isNew ? 201 : 200);
```

**Modified code**:
```typescript
const { row, isNew } = await deps.dbInsertOrGet(newRow);
// Phase 124 (AGENT-API-03): fan out to per-userId SSE subscribers.
// MUST be gated on isNew — Phase 121 dedupe means the same client
// payload may POST twice (network retry); emitting both times would
// publish duplicate events to subscribers (CONTEXT D-03 + RESEARCH
// Anti-Patterns line "Skipping the if (isNew) guard").
if (isNew) {
  deps.bus?.emit(userId, row);
}
// D-C2: 201 on fresh insert, 200 on idempotent dup (same body shape)
return c.json(row, isNew ? 201 : 200);
```

**Extend `AgentEventsDeps` interface** (analog `agent-events.ts:49-62`):
```typescript
export interface AgentEventsDeps {
  dbAvailable: boolean;
  dbInsertOrGet: (...) => ...;
  dbListSessions: (...) => ...;
  // NEW — optional so existing tests don't all need updating; production
  // singleton at line 280 wires the real bus.
  bus?: {
    emit(userId: number, row: DrizzleAgentEvent): void;
  };
}
```

**Update production singleton** at analog line 280 — add `bus,` import + field. Existing tests under `agent-events.test.ts` continue to pass (bus is optional). New tests verify the emit hook fires only on `isNew=true`.

---

### `vigil-core/src/index.ts` (MODIFIED — mount /v1/agent-stream)

**Analog:** itself, line 210 `app.route("/v1", agentEvents);`

**Modification** — append immediately after line 210:
```typescript
import { agentStream } from "./routes/agent-stream.js";
// ...
// Phase 124 (AGENT-API-03): per-userId SSE fan-out for agent_events.
// SAME mount-order constraint as agentEvents above — MUST be after the
// bearerAuth dispatcher at line 136 AND after metricsMiddleware at line 158.
app.route("/v1", agentStream);
```

No other changes to `index.ts` — the SSE route inherits CORS, secureHeaders, timeout (30s — but Hono streaming responses are exempt from `timeout(30_000)` because they don't await a single response), rate-limiting, and bearerAuth from the same middleware chain as every other v1 route.

**Pitfall to flag in plan**: `app.use("*", timeout(30_000))` at line 106 — verify this does NOT close long-lived SSE responses prematurely. RESEARCH §"Pattern 1" says Hono's `streamSSE` returns a `Response` whose body is a `ReadableStream`; the timeout middleware should not race against an already-returned response. Plan should include a test that holds an SSE connection open for >30s.

---

### `vigil-g2-plugin/src/lib/sse-client.ts` (NEW — utility)

**Analog (auth header pattern):** `vigil-g2-plugin/src/api.ts:5-21` — `BASE_URL` / `API_KEY` env plumbing + `authHeaders()` helper.

**Auth header reuse** (copy from analog lines 5-21):
```typescript
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/v1'
const API_KEY = import.meta.env.VITE_API_KEY || ''

// SSE shim variant — same auth header construction, but adds Accept and
// Last-Event-ID. Bearer goes in the header, NEVER in the URL (CONTEXT D-04
// + memory feedback_railway_variables_leak).
function sseHeaders(lastEventId: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${API_KEY}`,
    'Accept': 'text/event-stream',
  }
  if (lastEventId) headers['Last-Event-ID'] = lastEventId
  return headers
}
```

**Logging caution** (memory `feedback_railway_variables_leak`, RESEARCH):
- NEVER `console.log(headers)`, NEVER log `API_KEY` directly. The shim will be tempting to debug-log; gate any debug output behind a `DEBUG_SSE` flag and log only `{ status, hasAuth: !!API_KEY }`.

**ReadableStream + frame parser body** — copy verbatim from RESEARCH.md §"Pattern 3" (lines 451-543). Load-bearing pieces:
1. Backoff schedule `[1000, 2000, 4000, 8000, 16000, 30000]` — exact array per CONTEXT D-11.
2. `localStorage.setItem('vigil:lastEventId', id)` after each frame parsed (wrapped in try/catch per RESEARCH Pitfall 4).
3. `parseFrame` handles `event:` / `data:` / `id:` line prefixes; comments (`:` prefix) skipped; `event: ping` keepalive frames silently dropped.
4. `TextDecoder('utf-8').decode(value, { stream: true })` for multi-byte safety across chunks.
5. `AbortController.abort()` on `disconnect()` — without this, the fetch hangs forever on intentional teardown.

**Fallback-on-error pattern** (analog `api.ts:117-128`): `fetchSummary` catches and returns `EMPTY_SUMMARY`. The SSE shim does NOT have this shape — it never returns a "fallback session"; instead it transitions through `onStateChange?.(false)` → backoff → reconnect. The Companion screen owns its own empty/offline state (D-10 / D-11) — the shim only reports connection state.

---

### `vigil-g2-plugin/src/screens/companion.ts` (NEW — component)

**Primary analog:** `vigil-g2-plugin/src/screens/affirmation.ts` (3-container header/body/footer layout — closest structurally because Companion's body is a single `TextContainerProperty` with text content, not a `ListContainerProperty`).

**Secondary analog:** `vigil-g2-plugin/src/screens/home.ts` (multi-line `bodyContent.join('\n')` composition — exact pattern Companion uses for its 3-line HUD).

**Tertiary analog:** `vigil-g2-plugin/src/screens/work-orders.ts` (header `rightSide` parameter usage at line 34-38 — same pattern Companion uses for `N/M` indicator).

**Imports pattern** (from `affirmation.ts:1-7` + `home.ts:1-8`):
```typescript
import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

import type { AgentSessionRow, AgentEvent } from '../types.ts'  // EXTENDED — see types.ts modification below
import { DISPLAY_WIDTH, ContainerId } from '../constants.ts'
import { buildVigilHeader } from './header.ts'
```

**Header pattern** (work-orders.ts:34-38 with rightSide):
```typescript
// rightSide priority (UI-SPEC §3 "Offline Indicator"):
//   1. SSE disconnected AND ≥2 sessions: '! 2/3'
//   2. SSE disconnected AND ≤1 session: '!'
//   3. SSE connected AND ≥2 sessions: '2/3'
//   4. SSE connected AND ≤1 session: undefined → header falls back to HH:MM
function computeRightSide(connected: boolean, total: number, currentIdx: number): string | undefined {
  const offline = connected ? '' : '!'
  const sessions = total >= 2 ? `${currentIdx + 1}/${total}` : ''
  const combined = [offline, sessions].filter(Boolean).join(' ')
  return combined || undefined
}

const header = buildVigilHeader(
  ContainerId.COMPANION_HEADER,
  'companion-header',
  computeRightSide(connected, activeSessions.length, currentSessionIndex),
)
```

**Body pattern** — direct copy of `home.ts:33-56` shape, but content is the 3-line HUD or banner overlay:
```typescript
// 3-line normal-state body
const bodyContent = [
  truncate(session.label, 30),                 // line 1: session label
  STATE_FOR_EVENT[session.lastEvent.event],    // line 2: state — see UI-SPEC table
  truncate(session.lastEvent.message ?? '', 32), // line 3: last event message
].join('\n')

// Banner overlay variants — same 3-line shape but line 1 is '[NEEDS INPUT]' etc.
// Implementation: replace bodyContent string before constructing TextContainerProperty.
// Use RebuildPageContainer (NOT CreateStartUpPageContainer) when toggling banner state
// after first paint — analog navigation.ts:71-79 shows the navigateTo / rebuild pattern.

const body = new TextContainerProperty({
  xPosition: 0,
  yPosition: 40,
  width: DISPLAY_WIDTH,
  height: 210,
  borderWidth: 1,
  borderColor: 15,
  borderRadius: 0,
  paddingLength: 8,
  containerID: ContainerId.COMPANION_BODY,
  containerName: 'companion-body',
  content: bodyContent,
  isEventCapture: 1,                           // listens for DOUBLE_CLICK_EVENT
})
```

**Footer pattern** (home.ts:59-72, swap copy from UI-SPEC §"Copywriting Contract"):
```typescript
const footer = new TextContainerProperty({
  xPosition: 0,
  yPosition: 250,
  width: DISPLAY_WIDTH,
  height: 38,
  borderWidth: 0,
  borderColor: 0,
  borderRadius: 0,
  paddingLength: 8,
  containerID: ContainerId.COMPANION_FOOTER,
  containerName: 'companion-footer',
  // Copy varies by banner state — UI-SPEC table:
  content: bannerActive
    ? '↓ work orders   () ack banner'
    : '↓ work orders   () double-tap',
  isEventCapture: 0,
})
```

**Build-and-Rebuild dual export** (home.ts:77-97) — Companion needs both:
```typescript
export function buildCompanionScreen(state: CompanionState): CreateStartUpPageContainer {
  const containers = buildCompanionContainers(state)
  return new CreateStartUpPageContainer({ containerTotalNum: containers.length, textObject: containers })
}
export function rebuildCompanionScreen(state: CompanionState): RebuildPageContainer {
  const containers = buildCompanionContainers(state)
  return new RebuildPageContainer({ containerTotalNum: containers.length, textObject: containers })
}
```

**Module-level state cache** (work-orders.ts:14-20 precedent — `lastFetchedTasks`):
```typescript
// Active sessions cache — hydrated from GET /v1/agent-sessions on connect,
// mutated by SSE events. Module-level (not closure-captured) so DOUBLE_CLICK
// handler in navigation.ts can mutate currentSessionIndex.
let activeSessions: AgentSessionRow[] = []
let currentSessionIndex = 0
let bannerState: { type: 'needs_input' | 'task_failed' | 'task_complete' | 'milestone'; sessionId: string } | null = null

export function getActiveSessions(): AgentSessionRow[] { return activeSessions }
export function cycleSession(): void {
  if (activeSessions.length === 0) return
  currentSessionIndex = (currentSessionIndex + 1) % activeSessions.length
}
export function ackBanner(): void { bannerState = null }
```

**State map (UI-SPEC §"Body content composition"):**
```typescript
const STATE_FOR_EVENT: Record<AgentEvent['event'], string> = {
  needs_input: 'waiting for input',
  task_complete: 'done',
  task_failed: 'failed',
  milestone: 'running',
  heartbeat: 'running',
}
```

**Empty state** (UI-SPEC §"Empty State Contract"): same 3-line body, content `['No active sessions', 'idle', bottomLine].join('\n')` where `bottomLine` is computed from the last 24h `GET /v1/agent-sessions` response.

---

### `vigil-g2-plugin/src/main.ts` (MODIFIED — module-scope onLaunchSource)

**Analog:** itself — current `init()` flow lines 31-87.

**Module-scope additions** (RESEARCH §"Pattern 4" lines 565-597, locked):
```typescript
import {
  EvenAppBridge,                              // NEW import
  waitForEvenAppBridge,
  OsEventTypeList,
  type LaunchSource,                           // NEW import
} from '@evenrealities/even_hub_sdk'

// ── Module-scope onLaunchSource registration (D-07) ─────────────────────
// MUST run at parse time — before init(). The SDK pushes launchSource ONCE
// after WebView load completes. If init() is the first place we register,
// we race the push. Verified: SDK comment "页面就绪后由 SDK 推送一次".
const bridgeInstance = EvenAppBridge.getInstance()
const launchSourcePromise: Promise<LaunchSource> = new Promise((resolve) => {
  bridgeInstance.onLaunchSource((source) => resolve(source))
})
```

**Modified init() body** — extend the existing `Promise.all` at line 35:
```typescript
async function init(): Promise<void> {
  // OLD: const bridge = await waitForEvenAppBridge()
  // NEW: race the launchSourcePromise against a 500ms timeout fallback to 'appMenu'
  const [bridge, source] = await Promise.all([
    waitForEvenAppBridge(),
    Promise.race<LaunchSource>([
      launchSourcePromise,
      new Promise<LaunchSource>((r) => setTimeout(() => r('appMenu'), 500)),
    ]),
  ])

  // Decide initial screen based on source + active-session check (D-06)
  let initialScreen: ScreenName = Screen.HOME
  if (source === 'glassesMenu') {
    const sessions = await fetchAgentSessions()
    if (hasActiveSession(sessions)) initialScreen = Screen.COMPANION
  }

  const container = await buildScreen(initialScreen)
  await bridge.createStartUpPageContainer(container)

  // ... existing startRefreshTimer + bridge.onEvenHubEvent listener body
  // unchanged. SSE shim connects AFTER first paint (avoids blocking landing).
  sseClient.connect()
}
```

**`hasActiveSession` helper** (defined in `api.ts` or co-located in main.ts):
```typescript
// CONTEXT D-06: 5-min staleness window AND non-terminal event
function hasActiveSession(sessions: AgentSessionRow[]): boolean {
  const cutoff = Date.now() - 5 * 60 * 1000
  return sessions.some(s => {
    const ts = new Date(s.lastEvent.eventTimestamp).getTime()
    return ts > cutoff && !['task_complete', 'task_failed'].includes(s.lastEvent.event)
  })
}
```

---

### `vigil-g2-plugin/src/navigation.ts` (MODIFIED — add Companion)

**Analog:** itself — `Screen` const + `SCREEN_ORDER` + `handleNavEvent` switch.

**Mechanical extensions** (CONTEXT D-05, D-08, UI-SPEC §"Navigation Contract"):

1. **Screen enum extension** (analog lines 16-22):
```typescript
export const Screen = {
  HOME: 'home',
  COMPANION: 'companion',         // NEW — D-05 + Discretion
  WORK_ORDERS: 'work-orders',
  AFFIRMATION: 'affirmation',
  TASK_DETAIL: 'task-detail',
} as const
```

2. **SCREEN_ORDER insertion** (analog lines 25-29) — Companion at slot 1 (between HOME and WORK_ORDERS):
```typescript
const SCREEN_ORDER: readonly ScreenName[] = [
  Screen.HOME,
  Screen.COMPANION,    // NEW — slot 1
  Screen.WORK_ORDERS,
  Screen.AFFIRMATION,
]
```

3. **buildScreen switch case** (analog lines 45-68):
```typescript
case Screen.COMPANION: {
  // Hydrate from GET /v1/agent-sessions; sse-client provides live updates.
  const sessions = await fetchAgentSessions()
  return rebuildCompanionScreen({ sessions, /* ...snapshot of module state */ })
}
```

4. **handleNavEvent — Companion-specific DOUBLE_CLICK branch** (analog lines 124-130 — same shape as the existing HOME exit-confirm guard, INSERTED BEFORE the generic switch). Per UI-SPEC §"DOUBLE_CLICK on Companion":
```typescript
// CONTEXT D-08 — context-sensitive DOUBLE_CLICK on Companion screen.
// Evaluated in priority order:
//   1. Banner active → ack banner; rebuild body to normal 3-line state.
//   2. ≥2 active sessions → cycle to next; rebuild body + header.
//   3. Else → jump to HOME (matches existing carousel fallback).
if (
  currentScreen === Screen.COMPANION &&
  eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
) {
  if (hasActiveBanner()) {
    ackBanner()
    await refreshCurrentScreen(bridge)
    return
  }
  if (getActiveSessions().length >= 2) {
    cycleSession()
    await refreshCurrentScreen(bridge)
    return
  }
  await navigateTo(Screen.HOME, bridge)
  return
}
```

---

### `vigil-g2-plugin/src/constants.ts` (MODIFIED — add COMPANION_*)

**Analog:** itself — `ContainerId` const map lines 9-22.

**Append three entries** (UI-SPEC §"Container ID Allocation" — confirmed per-page not global, so 13/14/15 are safe):
```typescript
export const ContainerId = {
  HOME_HEADER: 1,
  HOME_BODY: 2,
  HOME_FOOTER: 3,
  WORK_ORDERS_HEADER: 4,
  WORK_ORDERS_LIST: 5,
  WORK_ORDERS_FOOTER: 6,
  AFFIRMATION_HEADER: 7,
  AFFIRMATION_BODY: 8,
  AFFIRMATION_FOOTER: 9,
  TASK_DETAIL_HEADER: 10,
  TASK_DETAIL_BODY: 11,
  TASK_DETAIL_FOOTER: 12,
  COMPANION_HEADER: 13,    // NEW — Phase 124 D-05
  COMPANION_BODY: 14,      // NEW
  COMPANION_FOOTER: 15,    // NEW
} as const
```

**Update the comment on line 8** — the "max 12 total across all screens" claim is wrong per UI-SPEC research. Replace with:
```typescript
/** Container IDs for screen layouts. SDK constraint is `containerTotalNum: 1~12`
 *  PER PAGE (per CreateStartUpPageContainer / RebuildPageContainer call), NOT
 *  global across screens. Verified against
 *  @evenrealities/even_hub_sdk index.d.ts:638-643 in Phase 124 research. */
```

---

### `vigil-g2-plugin/src/screens/home.ts` (MODIFIED — G2-POLISH-07 trim)

**Analog:** itself — `bodyContent` array at lines 33-41.

**Single-array-entry change** (CONTEXT D-12):

**Current** (lines 33-41):
```typescript
const bodyContent = [
  `* ${pendingCount} tasks pending`,
  '',
  'TOP PRIORITY:',
  topPriority,
  '',
  DIVIDER,
  affirmation.affirmation,
].join('\n')
```

**Modified**:
```typescript
const bodyContent = [
  `* ${pendingCount} tasks pending`,
  '',
  'TOP PRIORITY:',
  topPriority,
].join('\n')
```

**Cascading parameter removals** (UI-SPEC §"Home Screen Polish"):
- Drop `affirmation: VigilAffirmation` parameter from `buildHomeContainers`, `buildHomeScreen`, `rebuildHomeScreen`.
- Remove `import type { VigilAffirmation }` from line 7 (still keep `VigilSummary`).
- Remove `DIVIDER` import from line 8 (no longer used in this file).
- Update callers in `main.ts` (line 35-39 `Promise.all` drops `fetchAffirmation()`) and `navigation.ts` (line 47-53 `case Screen.HOME` drops `fetchAffirmation()`).

**Verification gate** (CONTEXT D-14): two consecutive `VITE_SCREENSHOT_MODE=1` builds must produce byte-identical PNGs for the home body region. RESEARCH Pitfall 6 notes the simulator may itself be non-deterministic — plan must include a "two-capture sanity check" before declaring victory (`cmp PNG#1 PNG#2`).

---

### `vigil-g2-plugin/package.json` (MODIFIED — add tsx devDep)

**Analog:** `vigil-core/package.json` already uses `tsx` (server precedent for `node:test` runner via tsx loader).

**Single-line addition** to `devDependencies`:
```json
"tsx": "^4.20.0"
```

(version aligned with vigil-core's existing tsx version — verify via `cat vigil-core/package.json | grep tsx` during plan).

This unblocks Wave 0 plugin-side test infra so `node --import=tsx --test src/lib/__tests__/sse-client.test.ts` can run the SSE shim's frame-parser tests offline. No runtime impact (devDep only).

---

### `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` (NEW — test)

**Analog:** `vigil-core/src/routes/agent-events.test.ts:1-70` (scaffold), specifically the `process.env["JWT_SECRET"]` preamble (line 5) + `import { test } from "node:test"` + `import assert from "node:assert/strict"` + lazy import (line 14).

**Scaffold pattern** (copy-adapt from analog):
```typescript
// JWT_SECRET preamble — defensive even though agent-events-bus has no JWT
// imports. Mirrors agent-events.test.ts:1-5 "self-contained copy-paste safety"
// posture.
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";

import { test } from "node:test";
import assert from "node:assert/strict";

const { bus } = await import("../agent-events-bus.js");

test("bus.emit with no subscribers is a no-op (does not create emitter)", () => {
  bus.emit(1, /* row */ {} as never);
  assert.equal((bus as any)._size?.(), 0, "no emitter created on emit-without-subscriber");
});

test("subscribe/unsubscribe round-trip: listener leaves Map clean", () => {
  const listener = () => {};
  bus.on(42, listener);
  assert.equal((bus as any)._listenerCount?.(42), 1);
  bus.off(42, listener);
  assert.equal((bus as any)._size?.(), 0, "Map entry deleted when listenerCount hits 0");
});

test("cross-userId isolation: listener for userA never fires for userB emit", () => {
  const seen: number[] = [];
  bus.on(1, (row: any) => seen.push(row.userId));
  bus.emit(2, { userId: 2 } as never);
  assert.deepEqual(seen, [], "userA listener saw zero events from userB emits");
});

test("100 reconnect cycles do not leak listeners (RESEARCH Pitfall 3)", () => {
  for (let i = 0; i < 100; i++) {
    const listener = () => {};
    bus.on(7, listener);
    bus.off(7, listener);
  }
  assert.equal((bus as any)._size?.(), 0);
});
```

---

### `vigil-core/src/routes/__tests__/agent-stream.test.ts` (NEW — test)

**Analog:** `vigil-core/src/routes/agent-events.test.ts` — full file. The `makeApp(deps, userId)` helper at lines 62-70 + `makeDeps` factory at lines 38-57 are reusable verbatim, with `bus` and `dbReplayMissed` fields added.

**Adaptations** (the new bits):

1. **Fake bus** — minimal stub with manual emit:
```typescript
function makeFakeBus() {
  const listeners = new Map<number, Array<(row: DrizzleAgentEvent) => void>>();
  return {
    on(userId: number, fn: (r: DrizzleAgentEvent) => void) {
      const arr = listeners.get(userId) ?? [];
      arr.push(fn);
      listeners.set(userId, arr);
    },
    off(userId: number, fn: (r: DrizzleAgentEvent) => void) {
      const arr = listeners.get(userId);
      if (arr) listeners.set(userId, arr.filter(f => f !== fn));
    },
    emit(userId: number, row: DrizzleAgentEvent) {
      (listeners.get(userId) ?? []).forEach(fn => fn(row));
    },
  };
}
```

2. **SSE response parsing** — `app.fetch()` returns a `Response` with a `ReadableStream` body. Tests need to read N frames then assert the body. Pattern:
```typescript
async function readNFrames(res: Response, n: number): Promise<string[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const frames: string[] = [];
  let buf = '';
  while (frames.length < n) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0 && frames.length < n) {
      frames.push(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
  }
  reader.cancel(); // closes the stream — triggers stream.onAbort on server
  return frames;
}
```

3. **Test cases to cover** (mirror agent-events.test.ts T1-T8 numbering style):
- T1: GET with no Last-Event-ID → only live events, no replay frames.
- T2: GET with `Last-Event-ID: 5` → replay rows from `dbReplayMissed` stub then live frame on subsequent `bus.emit`.
- T3: GET with `Last-Event-ID: -1` (RESEARCH Pitfall 2) → no replay (treated as null, not "every row").
- T4: GET with `Last-Event-ID: garbage` → no replay.
- T5: Cross-user isolation — userA's GET stream never receives userB's `bus.emit`.
- T6: Listener cleanup — close stream → `bus._listenerCount(userId) === 0`.
- T7: Replay bounds to 24h cutoff — `dbReplayMissed` receives a `cutoff` Date 24h before now.

---

## Shared Patterns

### Authentication / userId resolution

**Source:** `vigil-core/src/middleware/auth.ts` (`bearerAuth` middleware at line 38) — registered globally at `vigil-core/src/index.ts:136-145` (the `/v1/*` dispatcher) which does `c.set("userId", ...)` on the Hono context.

**Apply to:** every new vigil-core route file (`agent-stream.ts`) AND modifications to `agent-events.ts`.

**Excerpt** (from `vigil-core/src/routes/agent-events.ts:91`):
```typescript
const userId = c.get("userId") as number;
// userId is non-null because the route is registered AFTER the bearerAuth
// dispatcher at index.ts:135. NEVER trust req.body.userId — Plan 04
// cross-user-isolation test block 1 pins this. T-121-W-03.
```

**Plugin side** — bearer plumbing reuses `vigil-g2-plugin/src/api.ts:5-21`:
```typescript
const API_KEY = import.meta.env.VITE_API_KEY || ''
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`
  return headers
}
```
SSE shim variant adds `Accept: text/event-stream` and conditionally `Last-Event-ID`. `VITE_API_KEY` is the same env-var; no new secret pathway.

### Error response shape (vigil-core)

**Source:** `vigil-core/src/routes/agent-events.ts:84-89` — the convention `{ error: "<short-code>", message: "..." }` introduced by Phase 121.

**Apply to:** `agent-stream.ts` for any pre-stream error responses (e.g., 503 db_unavailable, 400 invalid Last-Event-ID — though 400 may not apply since defensive parse falls back to null replay, not a hard error).

**Excerpt:**
```typescript
return c.json(
  { error: "db_unavailable", message: "Database not available" },
  503,
);
```

### DI factory pattern for testability

**Source:** `vigil-core/src/routes/agent-events.ts:49-77` (`createAgentEventsRoute(deps)` shape) — and analogous patterns in `work-order-status.ts:13-17` (cited in agent-events.ts:47 comment).

**Apply to:** `agent-stream.ts` (`createAgentStreamRoute(deps)`), and the modified `agent-events.ts` (extend `AgentEventsDeps` with optional `bus`).

**Test helper analog** (from `agent-events.test.ts:38-70`):
```typescript
function makeDeps(overrides: Partial<AgentEventsDeps> = {}): AgentEventsDeps { ... }
function makeApp(deps: AgentEventsDeps, userId: number = 1): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => { c.set("userId", userId); await next(); });
  app.route("/", createAgentEventsRoute(deps));
  return app;
}
```
Reuse this exact shape for `agent-stream.test.ts`.

### Mount-order safety (vigil-core)

**Source:** `vigil-core/src/index.ts:203-210` (Phase 121 mount comment, agent-events).

**Apply to:** `app.route("/v1", agentStream);` mount in `index.ts`. Mirror the same comment block — load-bearing for cross-user isolation lock; if the comment is wrong, the lock test fails.

### TextContainerProperty layout convention (G2 plugin)

**Source:** `vigil-g2-plugin/src/screens/affirmation.ts:23-55` and `home.ts:43-72`. Uniform 40/210/38 height split, paddingLength=8, body borderWidth=1 borderColor=15, header/footer borderWidth=0.

**Apply to:** `companion.ts`. Same conventions; identical positioning.

### Build + Rebuild dual export

**Source:** `vigil-g2-plugin/src/screens/home.ts:77-97` — exports both `buildHomeScreen` (returns `CreateStartUpPageContainer`) AND `rebuildHomeScreen` (returns `RebuildPageContainer`) sharing one inner `buildHomeContainers` helper.

**Apply to:** `companion.ts`. The launch-source landing logic in `main.ts` calls `createStartUpPageContainer` on first paint; subsequent navigation through the carousel uses `rebuildPageContainer`. Same dual-export pattern.

### `buildVigilHeader` rightSide reuse

**Source:** `vigil-g2-plugin/src/screens/header.ts:32-57` — already accepts an optional `rightSide` parameter. `work-orders.ts:34-38` is the existing caller passing a custom value (`${tasks.length} open`).

**Apply to:** `companion.ts` for the `N/M` indicator AND the offline `'!'` glyph. No changes to `header.ts` itself — the contract already supports this.

---

## No Analog Found

| File | Role | Data Flow | Reason | Mitigation |
|------|------|-----------|--------|------------|
| `vigil-core/src/lib/agent-events-bus.ts` | utility (in-process pubsub) | event-driven | No existing in-process pub/sub bus in vigil-core; `lib/` directory itself is new | RESEARCH §"Pattern 2" provides locked implementation sketch (lines 401-441). Cross-reference Phase 121 D-D2 cross-user isolation test for the invariant the bus structurally enforces. |
| `vigil-g2-plugin/src/lib/sse-client.ts` (ReadableStream parser portion) | utility (transport) | streaming | Plugin has zero precedent for SSE consumption; the auth-header portion has an analog in `api.ts` but the `fetch + ReadableStream + TextDecoder + frame parser + exp. backoff` stack is entirely new | RESEARCH §"Pattern 3" provides locked 60-line implementation sketch (lines 451-543). WHATWG SSE spec is the canonical reference for line-prefix semantics. |

Both files are explicitly called out in CONTEXT.md / RESEARCH.md as new patterns — neither is hand-rolled blindly; both have full code sketches in RESEARCH.md that the planner copies into plans.

---

## New Patterns Introduced

This phase introduces three patterns that have no precedent in the codebase. Each is documented and lives in a small, isolated module so future ride-alongs can either reuse or replace cleanly.

### 1. `vigil-core/src/lib/` directory

First file under `lib/` — for primitives that aren't routes, services, middleware, db, ai, analytics, or utils. The bus is "shared application state" not tied to a request lifecycle, which doesn't fit existing folders. Pattern is parallel to `vigil-g2-plugin/src/lib/` (which is also new in this phase).

**When to grow this directory in future:** primitives that need to be importable by multiple routes/services AND maintain process-wide state (counters, registries, in-process queues). Stateless helpers continue to belong in `utils/`.

### 2. `Map<userId, EventEmitter>` per-user pub/sub

Structurally enforces cross-user isolation (different EventEmitter instances per user → emit-for-userA cannot reach userB listener). Auto-cleanup deletes Map entry when last listener leaves to bound memory.

**Replacement trigger:** Postgres LISTEN/NOTIFY when vigil-core scales past one Railway instance (CONTEXT.md "Deferred Ideas"). The bus interface (`emit/on/off`) is intentionally minimal so a future `pg-listen-bus.ts` can substitute behind the same shape.

### 3. `vigil-g2-plugin/src/lib/` directory + hand-rolled SSE shim

First file under plugin `lib/` — for transport/runtime primitives that aren't screens, navigation, API client, types, or constants. The shim's existence preserves the "zero new runtime npm deps" posture (CONTEXT D-04).

**Replacement trigger:** if Even Hub SDK ever ships a first-party SSE/WebSocket helper, the shim swaps to that. Until then, ~60 hand-rolled lines is the lower-cost choice than `event-source-polyfill` (~2KB) plus the inability of native `EventSource` to set `Authorization` headers.

---

## Project-Skill / Memory Alignment

- **`feedback_railway_variables_leak`** (memory) — applies to `agent-stream.ts` AND `sse-client.ts`. Server-side: never log full `Authorization` headers, never log `c.req.header("Authorization")`. Client-side: never `console.log(headers)` or `console.log(API_KEY)`. Both files MUST gate any debug logging behind a flag, and even then log only `{ status, hasAuth: !!API_KEY }`.
- **`project_g2_tap_expand_broken`** (memory) — Phase 45 retro: `CLICK_EVENT` is sim-only on G2 hardware (`eventType` returns undefined). CONTEXT D-08 explicitly avoids this trap; Companion uses ONLY `DOUBLE_CLICK_EVENT`. `LONG_PRESS_EVENT` is not even in `OsEventTypeList`. The pattern does NOT repeat the Phase 45 bug.
- **`feedback_runloop_main_async_trap`** (memory) — N/A. That trap is Swift `RunLoop.main.run()` inside `async` — Swift-specific. This phase is TypeScript Node + WKWebView TypeScript; not applicable.
- **`feedback_check_existing_routines`** (memory) — N/A for this phase (no RemoteTrigger / routine creation). Plan should still verify no overlapping seed/routine work before scheduling new background timers if any.
- **`feedback_dirty_tree_worktree_risk`** — applies to plan execution time, not pattern mapping. Flag for `/gsd-execute-phase`: confirm clean main before worktree split given the cross-repo (vigil-core + vigil-g2-plugin) plan structure.
- **No `.claude/skills/` or `.agents/skills/` directories present in this project.** No `CLAUDE.md` at project root. Only memory-store guidance applies.

---

## Metadata

**Analog search scope:**
- `vigil-core/src/routes/` (full listing — agent-events.ts is exact analog)
- `vigil-core/src/middleware/auth.ts` (bearerAuth contract)
- `vigil-core/src/db/{schema,types,connection}.ts` (Drizzle types + connection)
- `vigil-core/src/integration/cross-user-isolation.test.ts` (test scaffold)
- `vigil-core/node_modules/hono/dist/helper/streaming/sse.{js,d.ts}` (streamSSE behavior)
- `vigil-g2-plugin/src/{main,navigation,api,constants,types}.ts`
- `vigil-g2-plugin/src/screens/{home,affirmation,work-orders,header,task-detail}.ts`

**Files scanned:** ~25 source files, 3 test files, 2 vendored SDK type files (Hono SSE + Even Hub SDK).

**Pattern extraction date:** 2026-05-09
