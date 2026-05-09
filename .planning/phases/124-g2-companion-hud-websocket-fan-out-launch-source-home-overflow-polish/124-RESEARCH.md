# Phase 124: G2 Companion HUD + WebSocket fan-out + launch-source/home-overflow polish - Research

**Researched:** 2026-05-09
**Domain:** Server-Sent Events (Hono streamSSE) + per-userId Node EventEmitter fan-out + custom WebKit fetch+ReadableStream SSE shim + Even Hub SDK plugin screen + onLaunchSource gating + screenshot-equality verification
**Confidence:** HIGH (all 16 critical research questions resolved against actual codebase + vendored SDK + vendored Hono — minimal training-data dependence)

## Summary

Phase 124 has three independent code domains that must converge into one shippable artifact:

1. **vigil-core SSE endpoint** (`GET /v1/agent-stream`) backed by an in-process per-userId Node `EventEmitter` bus (`Map<userId, EventEmitter>`). The POST handler in `agent-events.ts` calls `bus.emit(userId, row)` after a successful `isNew=true` insert. SSE handler subscribes on connect, replays missed events from `agent_events WHERE user_id = ? AND id > ? AND event_timestamp > now() - 24h ORDER BY id ASC` if `Last-Event-ID` header is present, then attaches the connection to the live emitter, and unsubscribes via `stream.onAbort()` on disconnect.

2. **vigil-g2-plugin Companion screen** (`screens/companion.ts` + a custom `lib/sse-client.ts` SSE shim) — 3-line HUD with banner overlay states, `N/M` indicator, offline `'!'` glyph, exponential-backoff reconnect (1/2/4/8/16/30s cap), and `localStorage`-persisted `vigil:lastEventId`. Inserted into `SCREEN_ORDER` at slot 1. `DOUBLE_CLICK` on Companion is context-sensitive (banner-ack → cycle-session → jump-home).

3. **G2-POLISH-06 + G2-POLISH-07 ride-alongs** — `onLaunchSource` registered at module scope in `main.ts` BEFORE `waitForEvenAppBridge()` resolves, with a 500ms `Promise.race` timeout fallback to `'appMenu'`. `home.ts` body trimmed from 7 to 4 logical lines (drop inline affirmation + DIVIDER). G2-POLISH-07 ships as its own atomic plan; verification gate is byte-identical PNG equality from two consecutive `evenhub-simulator` captures (no source change between runs).

**Primary recommendation:** Hono 4.12.10's first-party `streamSSE` is fit-for-purpose (sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `Transfer-Encoding: chunked` automatically; provides `onAbort` lifecycle hook on `SSEStreamingApi`). Plugin's WKWebView (iOS 16+ via Even Hub iPhone app) supports `fetch()` + `ReadableStream` + `TextDecoder` — the 60-line shim from D-04 is correct. Add a 25s server-side keepalive (`stream.writeSSE({event: 'ping', data: ''})`) since neither Hono nor the plugin shim provide one and Railway/iOS NAT will idle-kill silent streams.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Realtime transport (Area 1):**

- **D-01 (SSE on `GET /v1/agent-stream`):** Vigil Core exposes a Hono `streamSSE` handler at `/v1/agent-stream`. One-way server→client matches the use case. Mount AFTER the bearerAuth dispatcher (mirrors `agent-events.ts` mount at `index.ts:43/210`). Authorization: `Bearer ${vk_…}` resolved via the same middleware as every other authed v1 route.

- **D-02 (Last-Event-ID resume):** Server emits `id: <agent_events.id>` on every SSE event frame. On reconnect, client sends `Last-Event-ID: <last-seen-id>` header automatically (or via shim). Server parses it, runs `SELECT * FROM agent_events WHERE user_id = $1 AND id > $2 AND event_timestamp > now() - interval '24 hours' ORDER BY id ASC`, replays each row as an SSE frame with its own `id:`, then attaches the connection to the live EventEmitter.

- **D-03 (In-process per-userId EventEmitter for fan-out):** New module `vigil-core/src/lib/agent-events-bus.ts` — `Map<userId, EventEmitter>`. POST handler in `agent-events.ts` calls `bus.emit(userId, row)` after a successful insert (only on `isNew = true`). SSE handler subscribes on connect, removes the listener on disconnect/abort.

- **D-04 (Custom EventSource shim with Authorization header):** WebView runs `fetch()` with `Authorization: Bearer ${VITE_API_KEY}` and consumes the response body via `ReadableStream` + `TextDecoder`, parsing SSE frames manually. Bearer never enters the URL. ~30–60 lines in `vigil-g2-plugin/src/lib/sse-client.ts`. Hand-rolled, zero new npm dep.

**Companion HUD placement + glassesMenu landing (Area 2):**

- **D-05 (`Companion` is permanent, slot 2 in carousel):** `SCREEN_ORDER` becomes `[HOME, COMPANION, WORK_ORDERS, AFFIRMATION]`. Always present. New `Screen.COMPANION = 'companion'`.

- **D-06 (glassesMenu lands on Companion only when an active session exists):** On `onLaunchSource('glassesMenu')`, plugin calls `GET /v1/agent-sessions` once, filters rows by `lastEvent.eventTimestamp > now - 5min AND lastEvent.event NOT IN ('task_complete', 'task_failed')`. ≥1 match → Companion. Else → Home. `onLaunchSource('appMenu')` → always Home.

- **D-07 (`onLaunchSource` registered BEFORE `waitForEvenAppBridge()` resolves):** Module-scope registration with 500ms `Promise.race` timeout fallback to `'appMenu'`. `init()` awaits both before deciding initial container. Zero flash of "Home → Companion".

**HUD interactions + empty/offline states (Area 3):**

- **D-08 (DOUBLE_CLICK is the only Companion tap event; meaning is context-sensitive):** banner-ack → cycle-session → jump-home. Single-tap (`CLICK_EVENT`) and long-press are NOT used. Phase 45 retro: `CLICK_EVENT` was sim-only; `eventType` returns undefined on real G2 hardware. `LONG_PRESS_EVENT` is not in `OsEventTypeList` today.

- **D-09 (One session at a time on the 3-line HUD; `N/M` indicator in header):** When ≥2 active sessions, header rightSide shows `N/M`. Most-recent-event session takes lead after any new event arrives. DOUBLE_CLICK cycles, wrapping at end.

- **D-10 (Empty state shows last-completed-session summary if any):** Top: `No active sessions`. Middle: `Idle`. Bottom: derived from `GET /v1/agent-sessions` (last 24h) — `Last: <label> — <event> <relative-time>` or `No Claude Code activity yet.`

- **D-11 (Disconnect = keep last content + offline indicator + exp. backoff reconnect):** Plugin keeps showing last content on disconnect. Header rightSide shows `'!'`. Exp. backoff: 1s/2s/4s/8s/16s/30s cap. On reconnect: Last-Event-ID replays, `'!'` clears.

**G2-POLISH-07: Home body overflow fix (Area 4):**

- **D-12 (Trim home body to 4 logical lines):** New body content is `* N tasks pending` / blank / `TOP PRIORITY:` / `<task content>`. Drops inline affirmation + `DIVIDER`. Single-file edit in `home.ts`. No `constants.ts` edits.

- **D-13 (Standalone atomic plan, parallel with HUD waves):** G2-POLISH-07 ships as its own plan; depends on nothing in this phase. Atomic commit makes revert trivial.

- **D-14 (Verification = byte-identical screenshot equality check):** Run the existing `VITE_SCREENSHOT_MODE` pipeline twice (no source changes between runs) and assert two PNGs are byte-identical for the home body region. Hardware retest is deferred-item.

### Claude's Discretion

- Plan-wave structure (suggested: Wave 1 = vigil-core SSE/bus/replay + G2-POLISH-07; Wave 2 = plugin SSE shim + Companion screen + onLaunchSource gate; Wave 3 = E2E smoke via `vigil-watch test`)
- `Screen.COMPANION` const value: `'companion'`
- New `ContainerId` allocations: `COMPANION_HEADER = 13`, `COMPANION_BODY = 14`, `COMPANION_FOOTER = 15`. Research must confirm "max 12" comment is per-page, NOT global.
- Banner state machine: `needs_input`/`task_failed` = persistent banner; `task_complete`/`milestone` = 3s toast; `heartbeat` = no banner, just updates state line.
- Label truncation: 30 chars + `…`.
- Bottom-line scrolling: marquee if SDK has it; truncate+ellipsis if not.
- Last-Event-ID storage: WebView `localStorage` under key `vigil:lastEventId`.

### Deferred Ideas (OUT OF SCOPE)

- Single-tap (`CLICK_EVENT`) and long-press (`LONG_PRESS_EVENT`) banner control on Companion screen — Phase 125 candidate IF/WHEN SDK exposes these.
- Postgres LISTEN/NOTIFY for SSE fan-out — until horizontal scaling is real, EventEmitter is sufficient.
- Stream-token endpoint (short-lived bearer for SSE URL) — defense-in-depth alternative to D-04's shim. Worth revisiting only if/when bearer-in-WebView-fetch becomes a hostile-environment concern.
- Marquee/scroll animation for long bottom-line messages — SDK lacks marquee per `TextContainerProperty` inspection (no scroll field). Truncation + ellipsis is the locked fallback.
- HUD priority queueing when multiple banners contend — Phase 125 candidate.
- Per-session label truncation tuning — Phase 125 candidate.
- Container ID budget audit — research below confirms "max 12" is per-page, so this is structurally not needed.
- Hardware retest of G2-POLISH-07 — sim-equality is the verification gate (D-14); real-glasses retest is operator procedure.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-API-03 | Vigil Core fans out new agent events as an `agent-event` type on the existing `/v1/agent-stream` channel, filtered per `userId`. | Hono 4.12.10 `streamSSE` available at `hono/streaming` (verified — `vigil-core/node_modules/hono/dist/helper/streaming/sse.js`); `SSEStreamingApi` exposes `onAbort()` + `aborted`/`closed` for cleanup; `c.req.header('last-event-id')` is case-insensitive (Headers.get spec); existing `idx_agent_events_user_id` index serves replay scan, `id` PK btree handles `id > ?` filter; bus.emit hook point is `agent-events.ts:238` (immediately after `dbInsertOrGet` returns, only on `isNew=true`). |
| AGENT-HUD-01 | 3-line HUD (top: session label truncated; middle: state idle/running/waiting/done; bottom: last event message). | UI-SPEC §"Companion HUD Screen" locks layout. SDK `TextContainerProperty` accepts `\n`-joined `content`. CHARS_PER_LINE=32 already exported from `constants.ts`. `buildVigilHeader(id, name, rightSide?)` already accepts optional rightSide override (verified at `screens/header.ts:32-36`). |
| AGENT-HUD-02 | Tap interactions on Companion (narrowed per D-08 to DOUBLE_CLICK only). | `OsEventTypeList` confirmed to lack `LONG_PRESS_EVENT`; `CLICK_EVENT` (=0) sim-only per Phase 45 retro (memory: `project_g2_tap_expand_broken`). DOUBLE_CLICK_EVENT (=3) reliable. ROADMAP SC #2 requires narrowing — planner action item. |
| G2-POLISH-06 | Glasses-menu launch source distinguishable via `onLaunchSource`. | SDK `bridge.onLaunchSource(callback: (source: LaunchSource) => void): () => void` confirmed at `index.d.ts:1220`. `LaunchSource = 'appMenu' \| 'glassesMenu'` (only two values, line 65). SDK comment "页面就绪后由 SDK 推送一次（仅一次，reload 不会再次触发）" → fires once after page-ready; module-scope registration captures the push reliably. |
| G2-POLISH-07 | Home body content fits 210px without overflow or scroll inconsistency between captures. | `home.ts:33-41` current body has 7 logical rows. Phase 106 HARDWARE-DIVERGENCE.md Divergence 4: "two consecutive 📸 captures of home produced different scrolled positions". D-12 trims to 4 logical rows (drop inline affirmation + DIVIDER). D-14: byte-identical PNG comparison. Pipeline = `evenhub-simulator` + 📸 button (canonical per HARDWARE-DIVERGENCE.md Divergence 3). |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Real-time event fan-out | API / Backend (vigil-core) | — | Per-userId isolation must run server-side; bearer auth + bus.emit gating. |
| Event durability + replay (Last-Event-ID) | Database / Storage | API / Backend | `agent_events` table is source of truth (id PK is monotonic cursor). |
| In-process pub/sub bus | API / Backend | — | Single Railway instance; no horizontal scaling yet. EventEmitter is correct primitive. |
| SSE consumption + parsing | Browser / Client (WKWebView) | — | Plugin runs in WebView; `fetch()` + `ReadableStream` + `TextDecoder` are client-side primitives. |
| HUD rendering (text containers) | Browser / Client (WKWebView) | — | Even Hub SDK targets the WebView; container declarations are JS-side, glasses receive pixels. |
| onLaunchSource gating | Browser / Client (WKWebView) | API / Backend (1× initial sessions fetch) | Plugin owns initial-render decision; calls API once for active-session check. |
| localStorage persistence (lastEventId) | Browser / Client (WKWebView) | — | WebView-local; per-plugin scope handled by Even Hub iOS app. |
| Screenshot equality verification | Build/Tooling (operator-driven) | — | `evenhub-simulator` is desktop tool; PNGs land on operator filesystem; `cmp` or `sips` does the comparison. |

## Standard Stack

### Core (already vendored — zero new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | 4.12.10 (vigil-core) | HTTP framework + first-party `streamSSE` helper | Already in use for every existing v1 route. `streamSSE` ships in 4.x as `hono/streaming` export. [VERIFIED: `vigil-core/node_modules/hono/package.json` line 3] |
| `drizzle-orm` | 0.45.2 (vigil-core) | DB query builder for replay query | Already used for every existing query. `db.execute(sql\`...\`)` for raw template-tag queries (precedent at `agent-events.ts:344`). [VERIFIED: package.json line 30] |
| `@evenrealities/even_hub_sdk` | 0.0.9 (vigil-g2-plugin) | G2 plugin runtime — `TextContainerProperty`, `CreateStartUpPageContainer`, `RebuildPageContainer`, `EvenAppBridge`, `OsEventTypeList`, `LaunchSource` | Only runtime dep in plugin today; vendor-pinned. [VERIFIED: `vigil-g2-plugin/package.json` line 19] |
| `vite` | 8.0.1 (vigil-g2-plugin, devDep only) | Build tool + `import.meta.env.VITE_*` env-var inlining | Existing pattern — `VITE_API_URL`, `VITE_API_KEY`, `VITE_SCREENSHOT_MODE`. [VERIFIED: package.json line 16] |

### Supporting (Node built-ins — zero new deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:events` | Node 24+ | `EventEmitter` for the per-userId bus | D-03 — `Map<userId, EventEmitter>`. Each EventEmitter defaults to maxListeners=10 — bump to 50 to allow safety margin without warnings. [VERIFIED: Node docs] |
| `node:test` + `node:assert/strict` | Node 24+ | vigil-core test runner (existing pattern) | Mirrors `agent-events.test.ts:7-8` — `import { test } from "node:test"; import assert from "node:assert/strict"`. [VERIFIED: existing tests] |

### Alternatives Considered (rejected)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hono `streamSSE` | `@hono/node-ws` (WebSocket) | Bidi not needed; can't set Authorization header on browser WS handshake → would force bearer-in-querystring (logs leak). [REJECTED in CONTEXT D-01] |
| In-process EventEmitter | Postgres LISTEN/NOTIFY | Two pg connection types to manage; only needed when scale > 1 instance. [REJECTED in CONTEXT D-03] |
| Custom fetch shim | `event-source-polyfill` npm dep | Plugin currently has ZERO runtime deps beyond SDK; preserve that posture. [REJECTED in CONTEXT D-04] |
| `EventEmitter` | Node 22+ `EventTarget` (web-standard) | EventEmitter has `setMaxListeners`, `removeListener` ergonomics already established in Node ecosystem; EventTarget would be more idiomatic but offers no concrete benefit for this map+key+bus shape. [Recommend EventEmitter] |
| Marquee scroll | Hand-rolled `setTimeout` scroll animation on bottom line | SDK `TextContainerProperty` has no scroll field; hand-rolled would require constant rebuilds (≥10Hz) → battery drain on glasses. Truncate+ellipsis is the SDK-aligned answer. [VERIFIED: SDK type defs] |

**Installation:** None — all deps already vendored. The phase adds zero new packages.

**Version verification:**
- `hono@4.12.10`: vendored in `vigil-core/node_modules/hono/package.json` (verified 2026-04-04 install).
- `@evenrealities/even_hub_sdk@0.0.9`: vendored in `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/package.json`.
- `drizzle-orm@0.45.2`: precedent at every existing route.

If a future planner wants to verify versions are still current at run time:
```bash
cd vigil-core && npm view hono version
cd vigil-g2-plugin && npm view @evenrealities/even_hub_sdk version
```

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  Mac (vigil-watch daemon, Phase 122/123 — already shipped)           │
│  Reads ~/.claude/projects/<id>/<session>.jsonl files                 │
└──────────────────────────────────────────────────────────────────────┘
                       │ HTTPS POST + Bearer vk_…
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  vigil-core (Railway, Hono 4.12.10) — Phase 121 endpoint             │
│  POST /v1/agent-events                                               │
│    ├─ bearerAuth → c.set('userId')                                   │
│    ├─ KNOWN_FIELDS validate (existing)                               │
│    ├─ dbInsertOrGet → { row, isNew }      ← Phase 121, unchanged     │
│    └─ if (isNew) bus.emit(userId, row)    ← NEW: Phase 124, line 238 │
│                                                                       │
│  GET /v1/agent-stream  (NEW: Phase 124)                              │
│    ├─ bearerAuth → c.set('userId')                                   │
│    ├─ if (Last-Event-ID present)                                     │
│    │     replay rows WHERE user_id=? AND id>? AND ts>now-24h         │
│    │       writeSSE({event:'agent-event', id:row.id, data:json})     │
│    ├─ bus.on(userId, listener)             ← live attach             │
│    ├─ setInterval keepalive 25s (writeSSE event:'ping')              │
│    └─ stream.onAbort(() => {                                         │
│          bus.off(userId, listener); clearInterval(keepalive);        │
│          if (bus emitter has 0 listeners) bus.delete(userId)         │
│        })                                                             │
│                                                                       │
│  agent-events-bus.ts (NEW)                                           │
│    Map<userId:number, EventEmitter>                                  │
│    .emit(userId, row) — creates emitter on first emit                │
│    .on(userId, listener) — creates emitter on first subscribe        │
│    .off(userId, listener) — removes listener; deletes Map entry      │
│                              if emitter listenerCount === 0          │
└──────────────────────────────────────────────────────────────────────┘
                       │ HTTPS, text/event-stream, chunked
                       │ Authorization: Bearer vk_…
                       │ Last-Event-ID: <int> (on reconnect)
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Even Hub iPhone app → WKWebView → vigil-g2-plugin                   │
│  src/lib/sse-client.ts  (NEW)                                        │
│    fetch(url, { headers: {Authorization, Accept: text/event-stream}, │
│                  signal: abortController.signal })                   │
│      → response.body (ReadableStream<Uint8Array>)                    │
│      → reader.read() loop                                            │
│      → TextDecoder('utf-8') incremental                              │
│      → buffer split on \n\n → parse event:/data:/id:                 │
│      → typed callbacks (onEvent, onError, onConnect, onDisconnect)   │
│      → on every parsed frame: localStorage.setItem('vigil:           │
│         lastEventId', id)                                            │
│      → on disconnect: exp backoff 1s/2s/4s/8s/16s/30s cap            │
│      → on reconnect: include Last-Event-ID header                    │
│                                                                       │
│  src/screens/companion.ts  (NEW)                                     │
│    activeSessions: Map<sessionId, AgentSessionRow> module-level      │
│    currentSessionIndex: number                                       │
│    bannerState: null | 'needs_input' | 'task_failed' | toast         │
│    on SSE event: update map; if banner-worthy, set bannerState;      │
│                  rebuild COMPANION_BODY only                          │
│    on DOUBLE_CLICK: ack-banner → cycle-session → jump-home (D-08)    │
│                                                                       │
│  src/main.ts  (MODIFIED)                                             │
│    Module scope — BEFORE init():                                     │
│      const bridge = EvenAppBridge.getInstance()                      │
│      const launchSourcePromise = new Promise(resolve => {            │
│        bridge.onLaunchSource(source => resolve(source))              │
│      })                                                              │
│    init():                                                           │
│      const [bridgeReady, source] = await Promise.all([               │
│        waitForEvenAppBridge(),                                       │
│        Promise.race([launchSourcePromise,                            │
│                      timeout(500).then(()=>'appMenu')])              │
│      ])                                                              │
│      // Decide initial screen                                        │
│      let screen = Screen.HOME                                         │
│      if (source === 'glassesMenu') {                                 │
│        const sessions = await fetchSessions()                        │
│        if (hasActiveSession(sessions)) screen = Screen.COMPANION     │
│      }                                                               │
│      const container = await buildScreen(screen)                     │
│      await bridge.createStartUpPageContainer(container)              │
│      // SSE connect (after first paint to avoid blocking landing)    │
│      sseClient.connect()                                             │
└──────────────────────────────────────────────────────────────────────┘
                       │ HDMI/Bluetooth render
                       ▼
                 ┌────────────┐
                 │ G2 glasses │
                 └────────────┘
```

### Recommended Project Structure

```
vigil-core/src/
├── lib/
│   └── agent-events-bus.ts          # NEW — Map<userId, EventEmitter>
├── routes/
│   ├── agent-events.ts              # MODIFIED — add bus.emit on isNew=true
│   └── agent-stream.ts              # NEW — Hono streamSSE handler
└── index.ts                          # MODIFIED — mount agent-stream after bearerAuth

vigil-g2-plugin/src/
├── lib/
│   └── sse-client.ts                # NEW — custom EventSource shim (~60 lines)
├── screens/
│   ├── companion.ts                 # NEW — 3-line HUD + banner states
│   └── home.ts                      # MODIFIED — drop affirmation + DIVIDER (G2-POLISH-07)
├── api.ts                           # MODIFIED — add fetchAgentSessions(); preserve existing
├── constants.ts                     # MODIFIED — add COMPANION_HEADER/BODY/FOOTER (13/14/15)
├── navigation.ts                    # MODIFIED — Screen.COMPANION, SCREEN_ORDER, DOUBLE_CLICK branch
├── main.ts                          # MODIFIED — module-scope onLaunchSource + initial screen gate
└── types.ts                         # MODIFIED — add AgentSessionRow + AgentEvent types
```

### Pattern 1: Hono `streamSSE` handler with onAbort cleanup

**What:** First-party Hono helper that sets all required SSE headers, exposes `writeSSE({event, data, id})`, and a `stream.onAbort()` lifecycle hook.

**When to use:** Any one-way server→client streaming endpoint where the connection lifetime matches a long-lived user session.

**Verified signature** (from `vigil-core/node_modules/hono/dist/types/helper/streaming/sse.d.ts`):
```typescript
// Source: vigil-core/node_modules/hono/dist/types/helper/streaming/sse.d.ts
export interface SSEMessage {
  data: string | Promise<string>;
  event?: string;
  id?: string;
  retry?: number;
}
export declare class SSEStreamingApi extends StreamingApi {
  writeSSE(message: SSEMessage): Promise<void>;
}
export declare const streamSSE: (
  c: Context,
  cb: (stream: SSEStreamingApi) => Promise<void>,
  onError?: (e: Error, stream: SSEStreamingApi) => Promise<void>,
) => Response;
```

**StreamingApi base class** (from `vigil-core/node_modules/hono/dist/utils/stream.js`):
```typescript
class StreamingApi {
  aborted: boolean      // public — check before writing
  closed: boolean       // public — check before writing
  onAbort(listener: () => void): void  // register cleanup
  abort(): void                          // imperative abort
  write(input: string | Uint8Array): Promise<this>
  close(): Promise<void>
}
```

**Behavior verified from source** (`hono/dist/helper/streaming/sse.js`):
- Sets `Transfer-Encoding: chunked`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` automatically.
- Does NOT send keepalive comments — server must add them via `setInterval`.
- `writeSSE` builds frames as `event: <name>\ndata: <data>\nid: <id>\n\n` with `\n` separator (not `\r\n`).
- `data` is split on any `\r\n|\r|\n` and prefixed with `data: ` per line — multi-line data is handled correctly.
- `event`/`id`/`retry` throw if they contain `\r` or `\n` — sanitize before writing.

**Example usage** (synthesized for this phase):
```typescript
// vigil-core/src/routes/agent-stream.ts (sketch — planner confirms)
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { gt, eq, and, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { agentEvents } from "../db/schema.js";
import { bus } from "../lib/agent-events-bus.js";

export function createAgentStreamRoute(deps: { ... }): Hono {
  const router = new Hono();
  router.get("/agent-stream", (c) => {
    const userId = c.get("userId") as number;
    const lastEventIdRaw = c.req.header("Last-Event-ID");
    const lastEventId = lastEventIdRaw
      ? Number.parseInt(lastEventIdRaw, 10)
      : NaN;
    const resumeFrom = Number.isFinite(lastEventId) && lastEventId >= 0
      ? lastEventId : null;

    return streamSSE(c, async (stream) => {
      // Phase 1: Replay missed events (if resumable)
      if (resumeFrom !== null) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const missed = await db
          .select()
          .from(agentEvents)
          .where(
            and(
              eq(agentEvents.userId, userId),
              gt(agentEvents.id, resumeFrom),
              gt(agentEvents.eventTimestamp, cutoff),
            ),
          )
          .orderBy(agentEvents.id);
        for (const row of missed) {
          if (stream.aborted || stream.closed) return;
          await stream.writeSSE({
            event: "agent-event",
            id: String(row.id),
            data: JSON.stringify(row),
          });
        }
      }

      // Phase 2: Live attach
      const listener = async (row: DrizzleAgentEvent) => {
        if (stream.aborted || stream.closed) return;
        await stream.writeSSE({
          event: "agent-event",
          id: String(row.id),
          data: JSON.stringify(row),
        });
      };
      bus.on(userId, listener);

      // Phase 3: Keepalive — Hono does NOT auto-emit pings
      const keepalive = setInterval(() => {
        if (stream.aborted || stream.closed) return;
        void stream.writeSSE({ event: "ping", data: "" });
      }, 25_000);

      // Phase 4: Cleanup hook
      stream.onAbort(() => {
        clearInterval(keepalive);
        bus.off(userId, listener);
      });

      // Phase 5: Hold the connection open — streamSSE auto-closes the
      // ReadableStream when the cb resolves. Block on a never-resolving
      // promise that aborts when stream.onAbort fires.
      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
    });
  });
  return router;
}
```

### Pattern 2: Per-userId EventEmitter bus with auto-cleanup

**What:** `Map<userId, EventEmitter>` — emitter created lazily on first listener, deleted when the last listener leaves.

**Example:**
```typescript
// vigil-core/src/lib/agent-events-bus.ts (sketch)
import { EventEmitter } from "node:events";
import type { DrizzleAgentEvent } from "../db/types.js";

const emitters = new Map<number, EventEmitter>();

function getOrCreate(userId: number): EventEmitter {
  let emitter = emitters.get(userId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(50); // safety margin; default 10 is too tight
    emitters.set(userId, emitter);
  }
  return emitter;
}

export const bus = {
  emit(userId: number, row: DrizzleAgentEvent): void {
    const emitter = emitters.get(userId);
    if (!emitter) return; // no subscribers — no-op (avoid creating empty emitter)
    emitter.emit("event", row);
  },
  on(userId: number, listener: (row: DrizzleAgentEvent) => void): void {
    getOrCreate(userId).on("event", listener);
  },
  off(userId: number, listener: (row: DrizzleAgentEvent) => void): void {
    const emitter = emitters.get(userId);
    if (!emitter) return;
    emitter.off("event", listener);
    if (emitter.listenerCount("event") === 0) {
      emitters.delete(userId);
    }
  },
  // For tests
  _size(): number { return emitters.size; },
  _listenerCount(userId: number): number {
    return emitters.get(userId)?.listenerCount("event") ?? 0;
  },
};
```

**Cross-user isolation invariant:** Map key is the `c.get('userId')` from bearerAuth. Server NEVER reads userId from request body or query (matches Phase 121 D-D2). Listener for userA can never receive an event emitted for userB because they're on different EventEmitter instances.

### Pattern 3: WKWebView fetch+ReadableStream SSE shim

**What:** Hand-rolled SSE consumer that uses `fetch()` (which CAN set custom headers, unlike `EventSource`) + manual frame parsing.

**WebView capability verified:** WKWebView on iOS 16+ supports `fetch`, `ReadableStream`, `TextDecoder`, `AbortController`. The Even Hub iPhone app's WebView is governed by the iPhone's iOS version (currently 17/18 in operator's environment). [CITED: WebKit feature support, MDN]

**Example shim** (for planner reference — actual implementation in plan):
```typescript
// vigil-g2-plugin/src/lib/sse-client.ts (sketch)
type EventCallback = (id: string, data: string) => void;
type StateCallback = (connected: boolean) => void;

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

export function createSseClient(opts: {
  url: string;
  apiKey: string;
  onEvent: EventCallback;
  onStateChange?: StateCallback;
  storage?: Pick<Storage, "getItem" | "setItem">; // injectable for tests
}) {
  const storage = opts.storage ?? window.localStorage;
  let abortController: AbortController | null = null;
  let backoffIndex = 0;
  let stopped = false;

  async function loop(): Promise<void> {
    while (!stopped) {
      abortController = new AbortController();
      const lastEventId = storage.getItem("vigil:lastEventId");
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${opts.apiKey}`,
        "Accept": "text/event-stream",
      };
      if (lastEventId) headers["Last-Event-ID"] = lastEventId;

      try {
        const res = await fetch(opts.url, {
          headers,
          signal: abortController.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`SSE HTTP ${res.status}`);
        }
        opts.onStateChange?.(true);
        backoffIndex = 0; // reset on successful connect

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Parse complete frames (separated by \n\n)
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const parsed = parseFrame(frame);
            if (parsed.event === "ping") continue; // server keepalive
            if (parsed.event === "agent-event" && parsed.id) {
              storage.setItem("vigil:lastEventId", parsed.id);
              opts.onEvent(parsed.id, parsed.data);
            }
          }
        }
      } catch (err) {
        if (stopped) return;
        opts.onStateChange?.(false);
        const wait = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
        backoffIndex++;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  return {
    connect(): void { void loop(); },
    disconnect(): void {
      stopped = true;
      abortController?.abort();
    },
  };
}

function parseFrame(frame: string): { event: string; data: string; id: string | null } {
  let event = "message";
  const dataLines: string[] = [];
  let id: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // comment
    if (line.startsWith("event:")) event = line.slice(6).trimStart();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    else if (line.startsWith("id:")) id = line.slice(3).trimStart();
  }
  return { event, data: dataLines.join("\n"), id };
}
```

**SSE wire-format edge cases handled:**
- Multi-line `data:` — concatenated with `\n` (per WHATWG SSE spec).
- Comments (`:keepalive`) — skipped.
- `event: ping` from server — silently dropped (keepalive only).
- Empty events (no data) — produce empty data string, dispatched as normal.
- Frame split across chunks — `decoder.decode(value, { stream: true })` accumulates bytes; `indexOf('\n\n')` only matches when full delimiter is buffered.

### Pattern 4: Module-scope onLaunchSource registration with timeout race

**What:** Register the SDK's `onLaunchSource` callback at module top level (before `init()`), capture the value into a Promise, then race that Promise against a 500ms timeout in `init()`.

**Why module scope:** SDK pushes the launch source ONCE after WebView load completes. If `init()` is the first place we register, there's a race where the push fires before `init()` runs. Module-scope registration guarantees the listener is attached at JavaScript parse time — earlier than any async work.

**SDK contract verified** (from `index.d.ts:1196-1220`):
```typescript
// Returns an unsubscribe function (we don't use it here — listener lives forever)
onLaunchSource(callback: (source: LaunchSource) => void): () => void;
type LaunchSource = 'appMenu' | 'glassesMenu';
```

**Example:**
```typescript
// vigil-g2-plugin/src/main.ts (sketch — modifies existing init())
import { EvenAppBridge, type LaunchSource } from "@evenrealities/even_hub_sdk";
import { fetchActiveSessions, hasActive } from "./api.ts";

// Module scope — runs at parse time, before init()
const bridgeInstance = EvenAppBridge.getInstance();
const launchSourcePromise: Promise<LaunchSource> = new Promise((resolve) => {
  bridgeInstance.onLaunchSource((source) => resolve(source));
});

async function init(): Promise<void> {
  const [bridge, source] = await Promise.all([
    waitForEvenAppBridge(),
    Promise.race<LaunchSource>([
      launchSourcePromise,
      new Promise<LaunchSource>((r) => setTimeout(() => r("appMenu"), 500)),
    ]),
  ]);

  // Decide initial screen
  let initialScreen: ScreenName = Screen.HOME;
  if (source === "glassesMenu") {
    const sessions = await fetchActiveSessions();
    if (hasActive(sessions)) initialScreen = Screen.COMPANION;
  }

  const container = await buildScreen(initialScreen);
  await bridge.createStartUpPageContainer(container);
  // ... rest of init
}
```

### Anti-Patterns to Avoid

- **Putting `bus.emit()` inside the dbInsertOrGet adapter.** The adapter is DI-injected; production gets a real DB, tests get a stub. If the bus is wired into the adapter, tests of the SSE route can't observe emissions cleanly. Keep bus.emit at the route level, in `agent-events.ts` POST handler at line 238.
- **Skipping the `if (isNew)` guard before bus.emit.** Phase 121 dedupe means the same event payload may POST twice (network retry). The second call returns 200 with `isNew=false`. Emitting both times would publish the same row twice to subscribers — UI would show duplicate events. CONTEXT D-03 explicitly locks emit-only-on-isNew.
- **Long-running `await` inside `streamSSE(c, async (stream) => { ... })` callback.** Hono auto-closes the response when the callback returns. To hold the connection open, the callback must `await` a never-resolving promise (resolved only by `stream.onAbort`). Otherwise the stream closes after the replay phase, never reaching live mode.
- **Hand-rolling marquee animation on bottom line.** SDK has no scroll field. Hand-rolled = `setInterval(rebuild, 200ms)` = continuous protobuf serialization on glasses = battery drain. Truncate + `…` is the SDK-aligned answer.
- **Registering `onLaunchSource` inside `init()`.** SDK fires push ONCE after WebView load. `init()` is async — there's a window where the push has fired and we missed it. Module-scope registration captures the push regardless of when init() runs. [VERIFIED via SDK comment "页面就绪后由 SDK 推送一次（仅一次，reload 不会再次触发）"]
- **Mutating `SCREEN_ORDER` based on active-session state.** Breaks user's spatial mental model — if Companion only sometimes appears, swipe-right doesn't reliably go to the same screen. CONTEXT D-05 locks: Companion is permanent slot 1.
- **Wiping the 3-line HUD content on SSE disconnect.** Visual noise on every WiFi blip. CONTEXT D-11 locks: keep last content; only header rightSide gains `'!'` indicator.
- **Embedding bearer in URL querystring (`?token=...`).** Leaks into Railway HTTP-access logs and browser history. CONTEXT D-04 + memory `feedback_railway_variables_leak` both lock against this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE response framing | Custom `c.body()` with manual `data: ...\n\n` strings | `streamSSE(c, async (stream) => stream.writeSSE({...}))` | Hono handles header set, chunked encoding, `\r`/`\n` validation, multi-line data, `id`/`event`/`retry` field formatting. [VERIFIED in source] |
| Stream lifecycle (abort → cleanup) | Manual `c.req.raw.signal.addEventListener('abort', ...)` | `stream.onAbort(() => { ... })` | StreamingApi tracks abort state internally + supports multiple subscribers. [VERIFIED at `stream.js:64-66`] |
| Per-user pub/sub isolation | Single global emitter + filter-by-userId on every event | `Map<userId, EventEmitter>` | One emitter per user means listenerCount === active connections per user; cross-user emit is structurally impossible (different emitter instances). |
| EventSource polyfill | `event-source-polyfill` npm package | Hand-rolled fetch+ReadableStream shim per CONTEXT D-04 | Plugin currently has zero runtime deps beyond Even Hub SDK. Polyfill is ~2KB but the shim is ~60 lines and we control bearer placement (header, not URL). |
| HTTP exponential backoff | Custom retry library | Hard-coded `[1000, 2000, 4000, 8000, 16000, 30000]` array + `setTimeout` | Six values, locked schedule per CONTEXT D-11. Library is overkill. |
| SSE frame parser | Regex on the whole body | Buffer + `indexOf('\n\n')` slice loop + per-line `startsWith` checks | Pull-based parser handles partial frames correctly across `reader.read()` chunks; regex would re-scan on every chunk. WHATWG SSE spec is line-prefix-based, mapping cleanly to `startsWith`. |
| TextDecoder | `String.fromCharCode(...bytes)` for UTF-8 decoding | `new TextDecoder('utf-8').decode(value, { stream: true })` | Multi-byte characters (emoji, Chinese) split across chunks need `{ stream: true }` to buffer the partial codepoint. WKWebView supports TextDecoder since iOS 10.1. |
| Time formatting (relative) | Date.fromNow() libraries | Inline `Math.floor((now - ts) / 60000)` + `m ago`/`h ago` | Empty-state copy is locked to `{N}m ago` / `{N}h ago` (UI-SPEC §"Empty State Contract"). 5 lines of code; no library. |
| ASCII glyph fallback | Custom font detection | Use `'!'` (ASCII 0x21) for offline indicator | UI-SPEC §3 locks `'!'` over `'⚠'` because SDK monospace font's Unicode coverage is unverified. ASCII guaranteed. |

**Key insight:** Hono ships a complete SSE primitive (`streamSSE` + `SSEStreamingApi`) that covers framing, header set, abort lifecycle, and content negotiation. The plugin side is genuinely custom because the WebView's native `EventSource` cannot set Authorization headers (per WHATWG spec — only browser-controlled cookies). But the custom shim is small (~60 lines) and uses standard primitives all the way down. Don't introduce dependencies — the platform primitives are sufficient.

## Common Pitfalls

### Pitfall 1: SSE callback returns immediately, stream closes before live mode

**What goes wrong:** `streamSSE(c, async (stream) => { /* attach listener */ })` returns once the callback resolves. If the callback synchronously attaches the bus listener and returns, Hono closes the ReadableStream and the connection — listener fires forever into a closed stream.

**Why it happens:** `streamSSE` is shaped for the common one-shot case (write some data, return). Long-lived streams need explicit holding.

**How to avoid:** End the callback with `await new Promise<void>(resolve => stream.onAbort(resolve))` — never resolves until client disconnects. Inside `onAbort` listener, the cleanup (`bus.off`, `clearInterval`) also runs.

**Warning signs:** SSE connections close immediately after any replay events; `bus._listenerCount(userId)` keeps growing across reconnects (listeners never cleaned up because `onAbort` fires on a closed stream).

### Pitfall 2: Last-Event-ID parsing accepts garbage and replays everything

**What goes wrong:** `Number.parseInt('abc')` returns `NaN`. `gt(agentEvents.id, NaN)` in Drizzle stringifies to `id > NULL` which is always FALSE in SQL — so a malformed Last-Event-ID silently returns zero rows on replay. Worse: `parseInt('-1')` returns `-1`; `id > -1` matches every row in the table for that user.

**Why it happens:** Last-Event-ID comes from client storage; we shouldn't trust it.

**How to avoid:**
```typescript
const raw = c.req.header("Last-Event-ID");
const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
const resumeFrom = Number.isFinite(parsed) && parsed >= 0 && parsed < 2_147_483_647
  ? parsed : null;
// resumeFrom === null → skip replay phase entirely
```

**Warning signs:** Tests passing `Last-Event-ID: -1` should produce zero replay rows (not "every row in user's history"). Tests passing `Last-Event-ID: garbage` should also produce zero replay rows.

### Pitfall 3: EventEmitter listener leak across reconnects

**What goes wrong:** Plugin disconnects + reconnects 100 times during a long Wi-Fi flap. Each reconnect calls `bus.on(userId, newListener)` but the previous listener was never `bus.off`'d because `stream.onAbort` fired on the *new* stream, not the old one. Result: `MaxListenersExceededWarning` at listener 11; eventually all listeners fire on each emit, multiplying writes.

**Why it happens:** Easy to scope `listener` and cleanup hook to the wrong closure.

**How to avoid:** Define `listener` and `keepalive` inside the `streamSSE` callback closure (NOT module scope). Cleanup hook references the same closure variables — always pairs.

**Warning signs:** Node logs `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 event listeners added to [EventEmitter]`. Test: connect → disconnect → reconnect 5 times → assert `bus._listenerCount(userId) === 1`.

### Pitfall 4: Plugin localStorage quota exceeded

**What goes wrong:** `localStorage.setItem` throws `QuotaExceededError` if storage is full (typically 5–10MB on WKWebView). For a single integer key (`vigil:lastEventId`), this should never happen, but defensive code is cheap.

**Why it happens:** Some other plugin or a prior version filled storage with debug data. Or the user manually disabled WebView storage in iOS Settings.

**How to avoid:**
```typescript
try { storage.setItem("vigil:lastEventId", id); }
catch { /* ignore — replay still works on next reconnect via the next event we receive */ }
```

**Warning signs:** Plugin logs `QuotaExceededError` once, never again — graceful degradation. Without the try/catch, the SSE loop crashes and never reconnects.

### Pitfall 5: Container ID conflict if "max 12" comment was true

**What goes wrong:** If the SDK enforces a global cap of 12 ContainerIds across all CreateStartUpPageContainer/RebuildPageContainer calls, allocating IDs 13/14/15 would silently no-op the Companion screen on hardware (per Phase 106 HARDWARE-DIVERGENCE.md Divergence 1 — `containerName` 16-char limit was sim-lenient but hardware-strict).

**Verified:** SDK type defs at `index.d.ts:638` say `containerTotalNum: 1~12` — the constraint is **per-container** (per CreateStartUpPageContainer / RebuildPageContainer call), not global. Each screen rebuild declares only its own containers. Existing precedent: every existing screen reuses IDs 1-12 within its own builder; no conflict possible because only one screen is mounted at a time. The "max 12 total across all screens" comment in `constants.ts:8` is incorrect — it's 12 per screen.

**How to avoid:** Confirm hypothesis (DONE — UI-SPEC §"Container ID Allocation" already locked this). If a future hardware retest reveals the comment was right, fall back to RebuildPageContainer-only Companion (reuse IDs from another screen) — but this is structurally not needed today.

### Pitfall 6: `evenhub-simulator` non-determinism breaks D-14

**What goes wrong:** D-14 requires byte-identical PNGs between two consecutive captures. If the simulator embeds a timestamp watermark, anti-aliasing varies, or any pixel jitter exists, the assertion fails on perfectly-identical source.

**Why it happens:** Phase 106 HARDWARE-DIVERGENCE.md Divergence 4 documented the original symptom (different scroll positions). The fix (D-12 trim) eliminates the *content* non-determinism, but doesn't guarantee pixel-level determinism if the simulator itself is non-deterministic.

**How to avoid:** Plan must include a "two-capture sanity check before claiming D-14 victory":
1. Build with VITE_SCREENSHOT_MODE=1, no source changes.
2. Open in `evenhub-simulator`, capture PNG #1.
3. Reload simulator (or close+reopen), capture PNG #2.
4. `cmp PNG#1 PNG#2` — must exit 0.
5. If not equal, investigate which pixels differ before declaring D-12 fixed. (`sips -g pixelWidth pixelHeight` to verify dimensions match; `magick compare -metric AE` for diff count.)

**Warning signs:** PNG #1 ≠ PNG #2 even when source is identical. Probably indicates simulator is not deterministic — D-14 falls back to "pixel-perfect home body region match" (crop body, compare).

### Pitfall 7: Hono streamSSE keepalive missing → iOS NAT idle-kill

**What goes wrong:** No keepalive frames means the iOS device's NAT, the Railway proxy, and ISP middleboxes can all idle-time-out a "silent" SSE connection (typical 30s-2min). The plugin sees an unexpected close, exp-backs off, reconnects, writes, etc. — high battery cost.

**Why it happens:** Hono's `streamSSE` does NOT auto-emit pings. [VERIFIED: `sse.js` source — no setInterval anywhere].

**How to avoid:** Server emits `event: ping\ndata: \n\n` every 25s via `setInterval` inside the streamSSE callback. Plugin shim silently drops `event: ping` frames (they update the connection-alive state in `fetch`/`reader.read` but don't surface to the screen).

**Warning signs:** SSE connections drop reliably ~30-60s after the last user-event without explicit client disconnect. Trace shows `reader.read()` returns `done: true` despite no `stopped` flag set.

### Pitfall 8: Bearer in vk_ format vs JWT — confirm middleware accepts vk_ from vigil-watch

**What goes wrong:** The plugin uses `VITE_API_KEY` which is a `vk_<hex>` key (memory: `project_secret_drift`). The bearerAuth middleware has Path 1 (vk_) and Path 2 (JWT) — both set `userId`. SSE route reads `c.get('userId')` — works for both paths. No issue here, but the planner should verify the test fixture uses a vk_ key (not a JWT) to mirror production plugin behavior.

**Why it happens:** Test fixtures sometimes use JWT for convenience. Live plugin is vk_-only.

**How to avoid:** SSE route tests should use `c.set('userId', N)` directly (mirrors `agent-events.test.ts:62-69`) — bypasses the bearerAuth middleware entirely. Cross-user isolation test should validate via the real bearerAuth path with a vk_ fixture.

## Code Examples

### Drizzle replay query (Last-Event-ID-bounded)

```typescript
// Source: synthesized from agent-events.ts:344 + drizzle-orm@0.45.2 docs
import { gt, eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { agentEvents } from "../db/schema.js";

async function replayMissed(userId: number, lastEventId: number): Promise<DrizzleAgentEvent[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(agentEvents)
    .where(
      and(
        eq(agentEvents.userId, userId),
        gt(agentEvents.id, lastEventId),
        gt(agentEvents.eventTimestamp, cutoff),
      ),
    )
    .orderBy(agentEvents.id);
}
```

**Index strategy verified:** Existing `idx_agent_events_user_id` on `(user_id)` is used by Postgres planner for the `WHERE user_id = $1` predicate; PK btree on `id` handles `id > $2` filter via index range scan. The 24h `event_timestamp > cutoff` predicate is a filter step (not seekable on existing indexes), but the row-set after the user-id+id filters is bounded by Last-Event-ID — typically 0–10 rows in practice. **No new index needed.** [VERIFIED: schema.ts:409-419, migration 0018]

If a future planner observes slow replay for users with massive `agent_events` history beyond Last-Event-ID (>10K rows), add a composite `(user_id, id)` index. Today's traffic doesn't justify it.

### POST handler hook for bus.emit (one-line addition to existing route)

```typescript
// Source: vigil-core/src/routes/agent-events.ts (delta against existing line 237-239)
// EXISTING:
const { row, isNew } = await deps.dbInsertOrGet(newRow);
return c.json(row, isNew ? 201 : 200);

// AFTER PHASE 124 (one new line + import):
import { bus } from "../lib/agent-events-bus.js";  // top of file

const { row, isNew } = await deps.dbInsertOrGet(newRow);
if (isNew) bus.emit(userId, row);  // ← NEW
return c.json(row, isNew ? 201 : 200);
```

**Test seam:** For the in-memory tests, the bus is module-singleton — tests can `bus.on(userId, listener)` to observe emissions, then `bus.off(userId, listener)` in teardown. No DI mock needed for the bus itself.

### Active-session API filter (plugin-side D-06 logic)

```typescript
// Source: synthesized from agent-events.ts:64-74 (AgentSessionRow shape)
function hasActiveSession(sessions: AgentSessionRow[]): boolean {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  return sessions.some((s) => {
    const ts = new Date(s.lastEvent.eventTimestamp).getTime();
    if (ts <= fiveMinAgo) return false;
    if (s.lastEvent.event === "task_complete") return false;
    if (s.lastEvent.event === "task_failed") return false;
    return true;
  });
}
```

**Response shape verified** (from `agent-events.ts:64-74`): GET /v1/agent-sessions returns `{ data: AgentSessionRow[] }` where each row has `{ sessionId, label, host, lastEvent: { event, message, eventTimestamp }, eventCount }`. `eventTimestamp` is ISO-8601 string. All fields D-06's filter needs are present. **No additional API surface required.** [VERIFIED: agent-events.ts:64-74, 385-398]

### Companion screen body composition

```typescript
// Source: synthesized from UI-SPEC §"Companion HUD Screen" + existing affirmation.ts pattern
import { TextContainerProperty, RebuildPageContainer } from "@evenrealities/even_hub_sdk";
import { DISPLAY_WIDTH, ContainerId } from "../constants.ts";
import { buildVigilHeader } from "./header.ts";

interface CompanionState {
  sessions: AgentSessionRow[];
  currentIndex: number;
  banner: { kind: "needs_input" | "task_failed" | "done" | "milestone" | null; until?: number };
  sseConnected: boolean;
}

const STATE_LINE: Record<AgentEventType, string> = {
  needs_input: "waiting for input",
  task_complete: "done",
  task_failed: "failed",
  milestone: "running",
  heartbeat: "running",
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function buildCompanionScreen(state: CompanionState): RebuildPageContainer {
  // Header rightSide
  let rightSide: string | undefined;
  const offlinePrefix = state.sseConnected ? "" : "! ";
  if (state.sessions.length >= 2) {
    rightSide = `${offlinePrefix}${state.currentIndex + 1}/${state.sessions.length}`;
  } else if (!state.sseConnected) {
    rightSide = "!";
  }
  const header = buildVigilHeader(ContainerId.COMPANION_HEADER, "companion-header", rightSide);

  // Body content (3 lines)
  let line1: string, line2: string, line3: string;
  if (state.banner.kind === "needs_input" || state.banner.kind === "task_failed") {
    const banner = state.banner.kind === "needs_input" ? "[NEEDS INPUT]" : "[TASK FAILED]";
    const session = state.sessions[state.currentIndex];
    line1 = banner;
    line2 = truncate(session?.label ?? "", 30);
    line3 = truncate(session?.lastEvent.message ?? session?.lastEvent.event ?? "", 32);
  } else if (state.banner.kind === "done" || state.banner.kind === "milestone") {
    const banner = state.banner.kind === "done" ? "[DONE]" : "[MILESTONE]";
    const session = state.sessions[state.currentIndex];
    line1 = banner;
    line2 = truncate(session?.label ?? "", 30);
    line3 = truncate(session?.lastEvent.message ?? "", 32);
  } else if (state.sessions.length === 0) {
    line1 = "No active sessions";
    line2 = "idle";
    line3 = formatLastEvent(state); // "Last: ..." or "No Claude Code activity yet"
  } else {
    const session = state.sessions[state.currentIndex];
    line1 = truncate(session.label, 30);
    line2 = STATE_LINE[session.lastEvent.event];
    line3 = truncate(session.lastEvent.message ?? session.lastEvent.event, 32);
  }

  const body = new TextContainerProperty({
    xPosition: 0, yPosition: 40, width: DISPLAY_WIDTH, height: 210,
    borderWidth: 1, borderColor: 15, borderRadius: 0, paddingLength: 8,
    containerID: ContainerId.COMPANION_BODY, containerName: "companion-body",
    content: `${line1}\n${line2}\n${line3}`,
    isEventCapture: 1,
  });

  const footer = new TextContainerProperty({
    xPosition: 0, yPosition: 250, width: DISPLAY_WIDTH, height: 38,
    borderWidth: 0, borderColor: 0, borderRadius: 0, paddingLength: 8,
    containerID: ContainerId.COMPANION_FOOTER, containerName: "companion-footer",
    content: bannerActive(state.banner.kind)
      ? "↓ work orders   () ack banner"
      : "↓ work orders   () double-tap",
    isEventCapture: 0,
  });

  return new RebuildPageContainer({ containerTotalNum: 3, textObject: [header, body, footer] });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spec said "WebSocket fan-out via existing /v1/agent-stream" | SSE on `GET /v1/agent-stream` (URL preserved) | Phase 124 D-01 (2026-05-09) | One-way data flow; SSE simpler, can carry Auth header via fetch shim, no new infra. |
| Phase 45 used `CLICK_EVENT` for list-item navigation | DOUBLE_CLICK only on Companion (D-08) | Phase 45 retro (memory: `project_g2_tap_expand_broken`) | CLICK_EVENT was sim-only; eventType undefined on hardware. Don't repeat. |
| `containerName` strings up to 18 chars | Capped at 16 chars | Phase 106 HARDWARE-DIVERGENCE.md Divergence 1 | "companion-header" (16), "companion-body" (14), "companion-footer" (16) — all fit. |
| Inline affirmation on home screen | Affirmation is its own carousel screen | Phase 124 D-12 | 4 lines of breathing room; fixes 210px overflow. |
| Phase 106 used iPhone Even app for screenshot capture | `evenhub-simulator` desktop tool with built-in 📸 button | Phase 106 HARDWARE-DIVERGENCE.md Divergence 3 | Canonical screenshot path. Plugin runs on glasses; iPhone is metadata only. |

**Deprecated/outdated:**
- `event-source-polyfill` npm package — would work, but plugin's zero-runtime-deps posture is preserved by hand-rolling. CONTEXT D-04.
- Postgres LISTEN/NOTIFY for fan-out — overkill until horizontal scaling. CONTEXT D-03.
- Bearer-in-querystring for SSE — security risk, never adopted. CONTEXT D-04 rejection list.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Railway/iOS NAT idle-timeout is ≥25s but ≤2min, so 25s server keepalive is sufficient | Pitfall 7 / Pattern 1 | If timeout is <25s, connections drop reliably; mitigation = lower keepalive interval to 15s. Low risk — observed in similar Railway projects. [ASSUMED — based on common Railway+iOS NAT timeout norms] |
| A2 | WKWebView in Even Hub iPhone app v2.2.0 supports `ReadableStream` + `TextDecoder` + `AbortController` | Pattern 3 | If WKWebView is iOS <16, `ReadableStream` may behave unexpectedly. Mitigation = polyfill with `event-source-polyfill` (re-introduces the rejected dep). Low risk — Even Hub iOS app targets iOS 16+ per app.json `min_app_version: 2.0.0` lineage. [ASSUMED — based on iOS WebKit feature support, not directly verified on operator's device] |
| A3 | `evenhub-simulator` produces deterministic PNGs across reload (no embedded timestamp/watermark) | Pitfall 6 / D-14 | If simulator is non-deterministic, D-14 byte-identical assertion fails on identical source. Mitigation = crop home body region; pixel-perfect match within crop. Medium risk — Phase 106 only verified the OPPOSITE problem (different scroll positions due to overflow). [ASSUMED — needs operator verification on first capture] |
| A4 | Bus emitter Map memory growth is bounded by active connection count (currently 1-3 per user) | Pattern 2 | If a leak in `bus.off` cleanup is introduced, Map grows unboundedly. Mitigation = test asserts `bus._size() === 0` after all subscribers disconnect. Low risk — auto-cleanup is explicit in Pattern 2 sketch. [VERIFIED via test plan in Validation Architecture] |
| A5 | Existing `idx_agent_events_user_id` is sufficient for replay query performance | Pattern 1 / Code Examples | If users accumulate >10K events beyond Last-Event-ID, `id > ?` becomes a sequential scan. Mitigation = add `(user_id, id)` composite index migration. Low risk — current event volume is <100/user/day, far below threshold. [VERIFIED: schema.ts:417, migration 0018:46-47] |
| A6 | The 60-line custom SSE shim handles all real-world edge cases (multi-byte chunks, reconnect storms, partial frames) | Pattern 3 / Pitfall 3 | If a real-world edge case slips through, plugin loses events silently. Mitigation = comprehensive test suite for parser (Validation Architecture §"Plugin shim tests"). Medium risk — hand-rolled parsers are notoriously buggy in long tail. Tests must cover: empty events, comment-only frames, multi-byte UTF-8 across chunk boundary, frame split across 3+ chunks. [VERIFIED via Validation Architecture] |

## Open Questions

None of the locked decisions need revisiting. All 16 critical research questions resolved against the actual codebase + vendored SDK + vendored Hono.

**Operator-confirmed items** (planner needs no further research):

1. Are container IDs 13/14/15 safe? **YES** — per-page constraint, not global. Already locked in UI-SPEC.
2. Does TextContainerProperty support marquee? **NO** — confirmed via SDK type defs; truncation+ellipsis is the locked fallback.
3. Does Hono 4.12.10 ship streamSSE? **YES** — verified in `vigil-core/node_modules/hono/dist/helper/streaming/sse.js`.
4. Does `c.req.header()` accept any case for Last-Event-ID? **YES** — Headers.get is case-insensitive per WHATWG spec; verified at `request.js:75-77`.
5. Does the SDK fire `onLaunchSource` once on page-ready? **YES** — verified at `index.d.ts:55` ("仅一次，reload 不会再次触发"). Module-scope registration is correct.

**One operator-action item for the planner to address explicitly:**

- **ROADMAP SC #2 wording requires narrowing.** The roadmap text says "single-tap clears the banner; double-tap cycles; long-press dismisses" but `LONG_PRESS_EVENT` is not in `OsEventTypeList` and `CLICK_EVENT` is sim-only (Phase 45 retro). Planner must either narrow SC #2 to "double-tap clears + cycles" OR explicitly punt single-tap/long-press to Phase 125. Do not silently ship a phase whose verification gate cannot be met. (CONTEXT D-08 caveat already flags this.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | vigil-core dev/test/build | ✓ | v24+ (existing repo) | — |
| `hono` (with streamSSE) | vigil-core SSE endpoint | ✓ | 4.12.10 | — |
| `drizzle-orm` | replay query | ✓ | 0.45.2 | — |
| `@evenrealities/even_hub_sdk` | plugin runtime | ✓ | 0.0.9 | — |
| `vite` | plugin build | ✓ | 8.0.1 | — |
| `evenhub-simulator` | D-14 screenshot capture | ⚠ external | 0.6.2+ | Hardware capture (deferred, operator action) |
| `evenhub` CLI (`pack`) | `npm run pack` ehpk build | ⚠ external | unknown | Not blocking — phase ends at code-merge; v0.3.0 ehpk pack is Phase 125 |
| Real G2 hardware | D-14 confirmation (post-sim) | ⚠ operator-pending | — | Sim-equality is the gate (D-14); hardware retest is deferred-item |
| Live `vigil-watch` daemon | Wave 3 E2E smoke (`vigil-watch test`) | ✓ (Phase 123) | — | — |

**Missing dependencies with no fallback:** None for autonomous portion. `evenhub-simulator` is a desktop tool the operator runs manually for D-14; its absence blocks ONLY the screenshot-equality verification (a checkpoint task).

**Missing dependencies with fallback:** Real G2 glasses — sim-equality is the structural verification (D-14). Hardware retest is deferred-item (deferred per CONTEXT, ride-along candidate for Phase 125 if sim and hardware diverge).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| vigil-core framework | Node 24's built-in `node:test` + `node:assert/strict` (existing pattern — `agent-events.test.ts:7-8`) |
| vigil-core config file | none — `tsx --test` runs all `**/*.test.ts` |
| vigil-core quick run | `cd vigil-core && npx tsx --test src/routes/agent-events.test.ts src/routes/agent-stream.test.ts src/lib/agent-events-bus.test.ts` |
| vigil-core full suite | `cd vigil-core && npm test` (per memory: integration tests hang because index.js spawns scheduler loops; use individual files via tsx) |
| vigil-g2-plugin framework | none today (zero test infra) — Wave 0 introduces minimal `node:test` for sse-client.ts parser unit tests |
| vigil-g2-plugin config file | TBD — Wave 0 task (see Wave 0 Gaps below) |
| vigil-g2-plugin quick run | `cd vigil-g2-plugin && npx tsx --test src/lib/sse-client.test.ts` |
| Phase E2E vehicle | `vigil-watch test` (Phase 123 Plan 03) — POSTs synthetic event with `_vigil_test_<ts>` sessionId to vigil-core; should propagate via SSE to plugin sim |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-API-03 (bus fan-out) | `bus.emit(userIdA, row)` does NOT trigger listeners on userIdB | unit (vigil-core) | `npx tsx --test src/lib/agent-events-bus.test.ts` | ❌ Wave 0 |
| AGENT-API-03 (bus auto-cleanup) | After last `bus.off`, the Map entry is removed | unit (vigil-core) | same | ❌ Wave 0 |
| AGENT-API-03 (POST → emit) | POST with isNew=true emits to bus; isNew=false (dedupe) does NOT emit | integration (vigil-core) | `npx tsx --test src/routes/agent-events.test.ts` (extend existing) | ✓ exists, extend with new tests |
| AGENT-API-03 (SSE replay correctness) | GET /v1/agent-stream with `Last-Event-ID: 5` replays rows 6-9 in `id ASC` order | integration (vigil-core) | `npx tsx --test src/routes/agent-stream.test.ts` | ❌ Wave 0 |
| AGENT-API-03 (SSE 24h replay bound) | Last-Event-ID=1 with row 2 from 25h ago + row 3 from 1h ago → only row 3 replayed | integration (vigil-core) | same | ❌ Wave 0 |
| AGENT-API-03 (SSE cross-user isolation) | userA's connection never receives userB's events | integration (vigil-core) | extend `src/integration/cross-user-isolation.test.ts` | ✓ exists, extend |
| AGENT-API-03 (SSE abort cleanup) | After client aborts, `bus._listenerCount(userId)` returns to 0 within 100ms | integration (vigil-core) | `src/routes/agent-stream.test.ts` | ❌ Wave 0 |
| AGENT-API-03 (Last-Event-ID parse defense) | `Last-Event-ID: -1` and `Last-Event-ID: garbage` produce zero replay rows (not all rows) | integration (vigil-core) | same | ❌ Wave 0 |
| AGENT-API-03 (E2E POST→emit→SSE) | POST a fresh event; an existing SSE consumer receives the same row within 100ms | integration (vigil-core) | same — single Vitest with httpRequest + EventSource-shim consumer | ❌ Wave 0 |
| AGENT-HUD-01 (3-line render) | `buildCompanionScreen({sessions:[s1]})` produces COMPANION_BODY content with exactly 3 `\n`-separated lines | unit (vigil-g2-plugin) | `npx tsx --test src/screens/companion.test.ts` | ❌ Wave 0 |
| AGENT-HUD-01 (truncation) | Session label > 30 chars is truncated to 30 + `…` | unit (vigil-g2-plugin) | same | ❌ Wave 0 |
| AGENT-HUD-01 (state mapping) | Each of 5 event types maps to correct state-line copy | unit (vigil-g2-plugin) | same — table-driven | ❌ Wave 0 |
| AGENT-HUD-01 (banner overlay) | needs_input → `[NEEDS INPUT]` line 1 + persistent | unit (vigil-g2-plugin) | same | ❌ Wave 0 |
| AGENT-HUD-01 (toast 3s) | task_complete → `[DONE]` line 1, body rebuilds to non-banner state after 3s | unit (vigil-g2-plugin) | same — fake-timers | ❌ Wave 0 |
| AGENT-HUD-01 (offline indicator) | `state.sseConnected = false` produces `'!'` prefix in rightSide | unit (vigil-g2-plugin) | same | ❌ Wave 0 |
| AGENT-HUD-01 (N/M indicator) | sessions.length === 2, currentIndex === 0 → rightSide = `'1/2'` | unit (vigil-g2-plugin) | same | ❌ Wave 0 |
| AGENT-HUD-02 (DOUBLE_CLICK ack) | banner active → DOUBLE_CLICK clears banner, body rebuilds to normal | unit (vigil-g2-plugin) | `npx tsx --test src/navigation.test.ts` | ❌ Wave 0 |
| AGENT-HUD-02 (DOUBLE_CLICK cycle) | sessions.length === 3 → DOUBLE_CLICK advances currentIndex 0→1→2→0 | unit (vigil-g2-plugin) | same | ❌ Wave 0 |
| AGENT-HUD-02 (DOUBLE_CLICK home fallback) | sessions.length === 1, no banner → DOUBLE_CLICK navigates to HOME | unit (vigil-g2-plugin) | same | ❌ Wave 0 |
| AGENT-HUD-02 (no LONG_PRESS handler) | navigation.ts does NOT reference `LONG_PRESS_EVENT` (drift detector — protects against future SDK addition reactivating dead spec wording) | drift (vigil-g2-plugin) | grep+assert in same test file | ❌ Wave 0 |
| G2-POLISH-06 (onLaunchSource registration site) | `main.ts` calls `bridge.onLaunchSource(...)` at module top level (drift detector) | drift (vigil-g2-plugin) | `npx tsx --test src/main.test.ts` (source-content drift) | ❌ Wave 0 |
| G2-POLISH-06 (glassesMenu + active → COMPANION) | source='glassesMenu', sessions has active → initial screen = COMPANION | unit (vigil-g2-plugin) | same | ❌ Wave 0 |
| G2-POLISH-06 (glassesMenu + no active → HOME) | source='glassesMenu', sessions empty → initial screen = HOME | unit (vigil-g2-plugin) | same | ❌ Wave 0 |
| G2-POLISH-06 (appMenu → HOME) | source='appMenu' → initial screen = HOME (regardless of sessions) | unit (vigil-g2-plugin) | same | ❌ Wave 0 |
| G2-POLISH-06 (500ms timeout fallback) | Promise never resolves → after 500ms, init() proceeds with 'appMenu' | unit (vigil-g2-plugin) | same — fake timers | ❌ Wave 0 |
| G2-POLISH-07 (home body 4 lines) | rebuildHomeScreen output's HOME_BODY content has exactly 4 logical lines (no DIVIDER, no affirmation) | unit (vigil-g2-plugin) | `npx tsx --test src/screens/home.test.ts` | ❌ Wave 0 |
| G2-POLISH-07 (no affirmation param) | buildHomeScreen signature takes (summary) not (summary, affirmation) | drift (vigil-g2-plugin) | grep test on home.ts source | ❌ Wave 0 |
| G2-POLISH-07 (byte-identical PNGs) | Two consecutive sim captures of home, no source change → `cmp file1.png file2.png` exits 0 | manual (operator-checkpoint) | manual checkpoint task in plan | n/a |
| Phase E2E (POST→bus→SSE→plugin sim) | `vigil-watch test` invocation produces a heartbeat event that arrives on the plugin within 2s and updates state line | manual (Wave 3) | manual checkpoint task in plan | n/a |
| Phase: SSE shim parser correctness | Multi-line data, comments, multi-byte UTF-8 across chunks, partial frames all parse correctly | unit (vigil-g2-plugin) | `npx tsx --test src/lib/sse-client.test.ts` | ❌ Wave 0 |
| Phase: SSE shim exp. backoff | Disconnect → wait → reconnect attempts at 1s, 2s, 4s, 8s, 16s, 30s (with fake timers) | unit (vigil-g2-plugin) | same | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd vigil-core && npx tsx --test src/lib/agent-events-bus.test.ts src/routes/agent-events.test.ts src/routes/agent-stream.test.ts` AND `cd vigil-g2-plugin && npx tsx --test src/lib/sse-client.test.ts src/screens/companion.test.ts src/screens/home.test.ts src/navigation.test.ts src/main.test.ts`
- **Per wave merge:** Full suite as above + `cd vigil-core && npx tsx --test src/integration/cross-user-isolation.test.ts`
- **Phase gate:** Full suite green + manual checkpoints (E2E `vigil-watch test`, D-14 PNG-equality)

### Wave 0 Gaps

- [ ] `vigil-core/src/lib/agent-events-bus.ts` — module under test
- [ ] `vigil-core/src/lib/agent-events-bus.test.ts` — unit tests for bus (cross-user isolation, auto-cleanup, max-listeners safety)
- [ ] `vigil-core/src/routes/agent-stream.ts` — module under test (Hono streamSSE handler)
- [ ] `vigil-core/src/routes/agent-stream.test.ts` — integration tests using `app.request()` with SSE response handling (read response.body as ReadableStream, parse frames). Pattern: spin up an in-process `Hono` app, request the stream, manually consume the chunks, assert frame contents. Mirror the SSE shim's parser logic for assertion.
- [ ] Extension to `vigil-core/src/routes/agent-events.test.ts` — tests verifying `bus.emit` is called on POST 201 (isNew=true) and NOT called on POST 200 (isNew=false). Uses spy/observer pattern: subscribe to `bus.on(testUserId, listener)` before POST; assert listener invocation count.
- [ ] Extension to `vigil-core/src/integration/cross-user-isolation.test.ts` — block 4: SSE userA cannot see userB's events.
- [ ] `vigil-g2-plugin/src/lib/sse-client.ts` — module under test
- [ ] `vigil-g2-plugin/src/lib/sse-client.test.ts` — parser unit tests + exp. backoff timing tests (mock fetch/timers)
- [ ] `vigil-g2-plugin/src/screens/companion.ts` — module under test
- [ ] `vigil-g2-plugin/src/screens/companion.test.ts` — body composition unit tests (table-driven across 5 event types + banner states + offline indicator + N/M)
- [ ] `vigil-g2-plugin/src/screens/home.test.ts` — drift detector for 4-line body invariant + signature change
- [ ] `vigil-g2-plugin/src/navigation.test.ts` — DOUBLE_CLICK context-sensitive branching + LONG_PRESS-absent drift
- [ ] `vigil-g2-plugin/src/main.test.ts` — onLaunchSource site + landing-screen logic (extracted into a pure helper for testability)
- [ ] Plugin test infrastructure: confirm `tsx` is available; if not, add `tsx` as devDep to `vigil-g2-plugin/package.json`. Plugin currently has no test runner — Wave 0 introduces it.
- [ ] `vigil-g2-plugin/tsconfig.json` may need updates to include test files in compilation; verify before Wave 0 closes.

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` file exists at the repo root for this project. (Searched recursively excluding node_modules and .git — no matches.) Phase-level constraints come from CONTEXT.md (D-01 through D-14, copied verbatim above) and from the v3.8 milestone spec (`v3.8-CLAUDE-CODE-COMPANION-SPEC.md`, already canonical-referenced).

Memory-derived constraints active for this phase (from Anthropic auto-memory):

| Constraint | Source | Application |
|------------|--------|-------------|
| `feedback_railway_variables_leak` | memory | Never log bearer; bearer goes in fetch headers, NEVER in URL or env-dump |
| `project_secret_drift` | memory | Plugin's `VITE_API_KEY` is a `vk_` key; preserve existing flow |
| `project_g2_tap_expand_broken` | memory | `CLICK_EVENT` is sim-only on G2 hardware. Phase 124 D-08 already locks DOUBLE_CLICK-only on Companion |
| `feedback_dirty_tree_worktree_risk` | memory | Pre-execute confirm working tree clean; relevant for Phase 124 execute-phase workflow |
| `project_imac_vigilcore_daemon` | memory | Local dev: bootout `com.jamesonmorrill.vigilcore` before running `npm run dev` for vigil-core (port 3001 conflict) |
| `feedback_check_existing_routines` | memory | Confirm existing fetch/sse-client patterns before introducing new ones |

## Risks & Landmines

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `evenhub-simulator` produces non-deterministic PNGs | MEDIUM | Blocks D-14 verification | Plan includes pre-flight "two-capture sanity check": capture twice with no source changes; if not byte-identical, investigate before claiming D-12 fixed (see Pitfall 6) |
| WKWebView ReadableStream behaves differently than spec | LOW | Plugin SSE shim breaks at runtime | Test on real iPhone hardware as part of Wave 2 verification; if fails, fall back to `event-source-polyfill` (rejected in CONTEXT but available) |
| Bus listener leak under reconnect storms | MEDIUM | Memory growth + multi-fire | Wave 0 unit tests assert `bus._listenerCount(userId) === N` after exactly N connects, returning to 0 after all disconnect |
| iOS NAT idle-kills SSE connection | HIGH (without keepalive) | High battery cost from constant reconnects | 25s server keepalive (Pitfall 7) — already in Pattern 1 sketch |
| Last-Event-ID parse accepts negative/invalid → SQL injection or massive replay | MEDIUM | Performance regression or data leak | Defense-in-depth: validate `Number.isFinite && >= 0 && < 2^31` (Pitfall 2) |
| Plugin localStorage quota | LOW | One-time write failure | try/catch around setItem (Pitfall 4) |
| ROADMAP SC #2 cannot be met with current SDK | KNOWN | Verification gate unreachable | CONTEXT D-08 caveat: planner must narrow SC #2 wording to "double-tap clears+cycles" OR explicitly punt to Phase 125. Already flagged in Open Questions. |
| `vigil-watch test` E2E (Wave 3) requires Phase 123's 24h soak to be GREEN | KNOWN BLOCKER | Phase 124 cannot start until Phase 123 closes | STATE.md notes this; planner must verify operator soak completion before kicking Phase 124 execute-phase |
| Plugin test infrastructure does not exist today | KNOWN | Wave 0 must introduce it | Wave 0 includes adding `tsx` devDep + writing first test files. Pattern: mirror vigil-core's `node:test` style |
| Hono streamSSE callback semantics: returns immediately if not held | MEDIUM | Connection closes after replay; live mode never reached | Pattern 1 sketch ends with `await new Promise(r => stream.onAbort(r))` to hold. Plan must preserve this idiom verbatim. |

## Sources

### Primary (HIGH confidence — direct codebase/SDK inspection)

- `vigil-core/node_modules/hono/dist/helper/streaming/sse.js` — verbatim source of `streamSSE` and `SSEStreamingApi.writeSSE`
- `vigil-core/node_modules/hono/dist/types/helper/streaming/sse.d.ts` — `SSEMessage` interface and `streamSSE` signature
- `vigil-core/node_modules/hono/dist/utils/stream.js` — `StreamingApi` base class with `onAbort`, `aborted`, `closed`, `abort()`
- `vigil-core/node_modules/hono/dist/request.js` (lines 75-83) — `header()` is case-insensitive (Headers.get under the hood)
- `vigil-core/node_modules/hono/package.json` — version 4.12.10
- `vigil-core/src/routes/agent-events.ts` (full file read) — POST handler shape, `dbInsertOrGet → { row, isNew }` return at line 237, mount comment at line 43/210
- `vigil-core/src/db/schema.ts` lines 374-419 — agent_events table schema, indexes
- `vigil-core/drizzle/0018_add_agent_events.sql` — migration with two indexes (`idx_agent_events_user_session_ts`, `idx_agent_events_user_id`) + partial unique on (user_id, client_event_id)
- `vigil-core/src/middleware/auth.ts` (full file) — bearerAuth dispatcher; vk_ Path 1, JWT Path 2; both `c.set('userId', N)`
- `vigil-core/src/index.ts` — mount order: bearerAuth at line 136-145, agent-events route at line 210, CORS config at lines 84-96
- `vigil-core/src/routes/agent-events.test.ts` lines 7-95 — testing pattern (`process.env.JWT_SECRET` set first, lazy import, `app.use` to inject userId, `createAgentEventsRoute(makeDeps())`)
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` — full SDK types:
  - `OsEventTypeList` enum (lines 707-717): `CLICK_EVENT=0, SCROLL_TOP=1, SCROLL_BOTTOM=2, DOUBLE_CLICK=3, FOREGROUND_ENTER=4, FOREGROUND_EXIT=5, ABNORMAL_EXIT=6, SYSTEM_EXIT=7, IMU_DATA_REPORT=8` (no LONG_PRESS)
  - `LaunchSource = 'appMenu' | 'glassesMenu'` (line 65) — only two values
  - `onLaunchSource(callback: (source: LaunchSource) => void): () => void` at line 1220
  - `CreateStartUpPageContainer.containerTotalNum: 1~12` per-page constraint at line 638-647 (NOT global)
  - SDK comment "页面就绪后由 SDK 推送一次（仅一次，reload 不会再次触发）" at line 55
- `vigil-g2-plugin/src/main.ts` (full file) — current `init()` shape, NAV_EVENTS set, refresh timer
- `vigil-g2-plugin/src/navigation.ts` (full file) — Screen const, SCREEN_ORDER, handleNavEvent switch with HOME-DOUBLE_CLICK exit-confirm fall-through (line 124-130)
- `vigil-g2-plugin/src/api.ts` (full file) — VITE_API_URL/VITE_API_KEY pattern, authHeaders() helper, fallback-on-error pattern, VITE_SCREENSHOT_MODE flag
- `vigil-g2-plugin/src/screens/header.ts` (full file) — `buildVigilHeader(containerID, containerName, rightSide?)` with HH:MM AM/PM fallback (line 32-37). Already accepts optional rightSide.
- `vigil-g2-plugin/src/screens/home.ts` (full file) — current 7-line body to be trimmed in G2-POLISH-07
- `vigil-g2-plugin/src/screens/affirmation.ts` (full file) — pattern reference for new companion.ts (40/210/38 layout, borderColor 15)
- `vigil-g2-plugin/src/constants.ts` (full file) — DISPLAY_WIDTH=576, DISPLAY_HEIGHT=288, CHARS_PER_LINE=32, ContainerId map (currently 1-12)
- `vigil-g2-plugin/.env.screenshot.example` — VITE_SCREENSHOT_MODE pipeline documentation
- `vigil-g2-plugin/package.json` — zero runtime deps beyond Even Hub SDK; vite as devDep
- `.planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/HARDWARE-DIVERGENCE.md` — Divergence 4 documents the original home overflow bug; Divergence 3 documents `evenhub-simulator` as canonical screenshot path

### Secondary (MEDIUM confidence — verified by cross-reference)

- WHATWG SSE spec (Server-Sent Events) — frame format, `\n\n` separator, multi-line data semantics, comment-line (`:`) handling. Cross-referenced with Hono's writeSSE implementation.
- WHATWG Fetch + Streams spec — `ReadableStream`, `TextDecoder({ stream: true })` semantics for multi-byte UTF-8 across chunks. Cross-referenced with iOS WebKit feature support.
- Phase 121 CONTEXT.md (D-A1, D-B1, D-D2 block 3) — replay should use `id` not `event_timestamp`; 24h sliding window precedent; cross-user isolation via composite (user_id, client_event_id) partial unique
- Phase 123 CONTEXT.md — daemon is real and posting events at execution time; `vigil-watch test` heartbeat is the E2E vehicle

### Tertiary (LOW confidence — flagged in Assumptions Log)

- iOS NAT idle-timeout typical values (25s-2min) — based on common Railway+iOS deployment norms; not directly measured for vigilhub.io. (A1)
- Even Hub iPhone app v2.2.0 WebView feature support (ReadableStream, TextDecoder, AbortController) — based on iOS 16+ WebKit support; not directly measured. (A2)
- `evenhub-simulator` PNG determinism — historical issue was content non-determinism (overflow scroll); pixel-level determinism for unchanged source is plausible but not directly verified. (A3)

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Hono streamSSE API | HIGH | Read source code directly; signature, headers, lifecycle hooks all verified |
| EventEmitter bus design | HIGH | Standard Node primitive; Pattern 2 sketch is fully self-contained |
| Drizzle replay query + index strategy | HIGH | Schema + migration read directly; query shape matches existing precedent |
| POST→emit hook point | HIGH | Exact line number identified in agent-events.ts (line 237-238) |
| WKWebView fetch+ReadableStream support | MEDIUM | Standard WHATWG spec, iOS 16+ verified support; not directly measured on operator's device (A2) |
| SSE shim parser correctness | MEDIUM | Standard frame format; comprehensive Wave 0 test suite required to lock edge cases (A6) |
| onLaunchSource SDK contract | HIGH | SDK types + comment "fires once on page-ready" verified verbatim |
| Container ID per-page vs global | HIGH | SDK type defs explicit: `containerTotalNum: 1~12` per CreateStartUpPageContainer/RebuildPageContainer (NOT global) |
| `LONG_PRESS_EVENT` absence | HIGH | Full enum read from SDK type defs; only 8 values, none are LONG_PRESS |
| `CLICK_EVENT` hardware behavior | HIGH | Phase 45 retro + memory `project_g2_tap_expand_broken` |
| Active-session API response shape | HIGH | Verified against agent-events.ts:64-74 (TypeScript interface) and lines 385-398 (camelCase mapping) |
| `buildVigilHeader` rightSide override | HIGH | Verified existing signature accepts optional 3rd param |
| Plugin localStorage availability | MEDIUM | Standard WKWebView feature; not directly measured |
| VITE_SCREENSHOT_MODE pipeline | HIGH | Phase 106 history + .env.screenshot.example read directly |
| D-14 byte-identical determinism | MEDIUM | Logical given content trim, but simulator-side determinism not directly measured (A3) |
| Heartbeat / NAT idle-timeout | MEDIUM | Standard distributed-systems norm; specific Railway/iOS values not measured (A1) |
| CORS allows SSE from plugin | HIGH | CORS config at index.ts:89-96 allows wildcard origin (or CORS_ORIGINS list); allowHeaders includes Authorization; allowMethods includes GET. Plugin uses fetch() so CORS rules apply, but the same config that lets `/v1/agent-events` work also lets `/v1/agent-stream` work. |
| Common pitfalls catalog | HIGH | All pitfalls cross-referenced to specific code lines or memory entries |
| Validation architecture | HIGH | Test framework + sampling rates + Wave 0 gaps all enumerated |

**Research date:** 2026-05-09
**Valid until:** 2026-06-08 (30 days — vigil-core/Hono/Drizzle/Even Hub SDK versions are pinned and stable; replay-query semantics and SDK enum definitions don't drift)
