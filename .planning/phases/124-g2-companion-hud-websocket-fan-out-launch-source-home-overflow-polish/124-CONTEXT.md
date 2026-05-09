# Phase 124: G2 Companion HUD + WebSocket fan-out + launch-source/home-overflow polish - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a glanceable G2 Companion HUD that surfaces real-time Claude Code session
state from `agent_events` (Phase 121 producer table), wire up vigil-core to
fan those events out per-userId to subscribed plugin clients, and fold in two
plugin-touching G2 polish riders:

1. **Realtime fan-out (AGENT-API-03)** — `GET /v1/agent-stream` Server-Sent
   Events endpoint with Last-Event-ID resume, fed by an in-process per-userId
   Node EventEmitter that POST `/v1/agent-events` writes to.
2. **Companion HUD screen (AGENT-HUD-01)** — new 3-line text container screen
   in `vigil-g2-plugin` (`Home → Companion → Work Orders → Affirmation`
   carousel order). Top: session label (truncated). Middle: state
   `idle/running/waiting/done`. Bottom: last event message.
3. **Tap interactions on Companion (AGENT-HUD-02, narrowed)** — `DOUBLE_CLICK`
   on the Companion screen is context-sensitive: ack-banner → cycle-session →
   jump-home. Single-tap and long-press from the spec are NOT plumbed reliably
   on G2 today; this phase ships read-only-plus-double-click and flags the
   roadmap SC #2 wording for narrowing/punt.
4. **G2-POLISH-06 (launch-source)** — register `bridge.onLaunchSource` BEFORE
   `waitForEvenAppBridge()` resolves; gate initial render so glassesMenu
   launches land on Companion when an active session exists, else Home.
5. **G2-POLISH-07 (home overflow)** — trim the home body to 4 logical lines
   (drop inline affirmation + `DIVIDER`); verify via two consecutive sim
   screenshots being byte-identical.

**In scope:** SSE endpoint + EventEmitter fan-out + Last-Event-ID replay;
custom EventSource shim in plugin; new Companion screen + ContainerId
allocations; carousel insertion; onLaunchSource registration + active-session
landing logic; DOUBLE_CLICK context handler; SSE-disconnect offline indicator
+ exponential-backoff reconnect; home.ts content trim + screenshot-equality
verification.

**Out of scope (deferred to Phase 125 explicitly per ROADMAP):** Quiet
mode/DND filter on HUD (AGENT-HUD-03); SEED-005 swipe-out-of-list nav
(G2-POLISH-05); SEED-008 device-status spam debounce (G2-POLISH-08);
`vigil.ehpk` v0.3.0 pack + Even Hub resubmission (G2-PLUGIN-01); 60s portfolio
demo capture (AGENT-DEMO-01).

**Out of scope (this phase):** Single-tap/long-press tap behaviors from
ROADMAP SC #2 (defer until SDK exposes reliable single-tap event); DB-replay
performance tuning beyond the natural Last-Event-ID `WHERE id > ?` query;
Postgres LISTEN/NOTIFY (vigil-core is single Railway instance today —
EventEmitter is sufficient until horizontal scaling is real).

</domain>

<decisions>
## Implementation Decisions

### Realtime transport (Area 1)

- **D-01 (SSE on `GET /v1/agent-stream`):** Vigil Core exposes a Hono
  `streamSSE` handler at `/v1/agent-stream`. One-way server→client matches
  the use case (events flow only out; ack/cycle is a separate HTTP concern
  if needed). Path is verbatim from AGENT-API-03 + ROADMAP §Phase 124, even
  though the spec implied "existing WebSocket" — no WS infra exists in
  vigil-core today; SSE replaces the WS plan with simpler primitives. Mount
  AFTER the bearerAuth dispatcher (mirrors `agent-events.ts` mount at
  `index.ts:43`). Authorization: `Bearer ${vk_…}` resolved via the same
  middleware as every other authed v1 route.

  **Rejected:** WebSocket via `@hono/node-ws` (true bidi, but only one-way
  data flow is needed; adds dep + manual reconnect/heartbeat + can't set
  Authorization header on browser WS handshake — would require
  bearer-in-querystring). Short-poll `GET /v1/agent-sessions` at ≤2s (battery
  hostile on glasses-tethered iOS; ROADMAP SC #2 says "within 2 seconds" so
  polling cadence would be aggressive).

- **D-02 (Last-Event-ID resume):** Server emits `id: <agent_events.id>` on
  every SSE event frame. On EventSource (or custom-shim) reconnect, the
  client sends `Last-Event-ID: <last-seen-id>` header automatically. Server
  parses it, runs `SELECT * FROM agent_events WHERE user_id = $1 AND id > $2
  ORDER BY id ASC` (uses existing `idx_agent_events_user_id`), replays each
  row as an SSE frame with its own `id:`, then attaches the connection to
  the live EventEmitter. Bounds replay to the last 24h to keep query cheap.

  **Rejected:** Live-only-no-resume (acceptable but loses guaranteed-delivery
  feel; would need GET /v1/agent-sessions polling on every reconnect to
  recover state — duplicates effort across paths). Nested
  `/v1/agent-events/stream` URL (no win over the spec-aligned name).

- **D-03 (In-process per-userId EventEmitter for fan-out):** New module
  `vigil-core/src/lib/agent-events-bus.ts` — `Map<userId, EventEmitter>`.
  POST handler in `agent-events.ts` calls `bus.emit(userId, row)` after a
  successful insert (only on `isNew = true` to avoid replaying dedupe
  hits). SSE handler subscribes its connection to `bus.on(userId, listener)`
  on connect, removes the listener on disconnect/abort. Memory bound:
  EventEmitter listeners cap ≤ N concurrent SSE connections per user (≈ 1–3
  in practice).

  **Rejected:** Postgres LISTEN/NOTIFY (needed only when vigil-core scales
  past one Railway instance; until then it's two pg connection types to
  manage). DB-poll inside SSE handler (just hides short-polling cost in
  the stream — same DB load as polling from the client).

- **D-04 (Custom EventSource shim with Authorization header):** Native
  browser `EventSource` cannot set headers, but the WebView can run a
  `fetch()` with `Authorization: Bearer ${VITE_API_KEY}` and consume the
  response body via `ReadableStream` + `TextDecoder`, parsing SSE frames
  manually (`event:`, `data:`, `id:` lines separated by `\n\n`). Bearer
  never enters the URL → no key in Railway logs / browser history. Plugin
  ships ~30–60 lines of shim code in
  `vigil-g2-plugin/src/lib/sse-client.ts`. Hand-rolled instead of
  `event-source-polyfill` (zero new npm dep — this plugin currently has
  ZERO runtime deps beyond `@evenrealities/even_hub_sdk`, and a pure-JS
  shim is 60 lines).

  **Rejected:** `?token=` querystring (token in URL → leaks into Railway
  HTTP-access logs; vk_ keys are user-scoped + revocable but not ideal).
  Stream-token endpoint (more server code; only needed when the bearer
  itself can't be trusted in the URL — which it can if we never put it
  there).

### Companion HUD placement + glassesMenu landing (Area 2)

- **D-05 (`Companion` is permanent, slot 2 in carousel):** `SCREEN_ORDER`
  becomes `[HOME, COMPANION, WORK_ORDERS, AFFIRMATION]`. Always present
  even with zero active sessions (renders empty state — see D-08).
  Predictable navigation; user can swipe to Companion to ask "is anything
  running?" any time. New `Screen.COMPANION = 'companion'` const added to
  `navigation.ts`.

  **Rejected:** Conditional insertion (mutable SCREEN_ORDER breaks the
  user's spatial mental model). Banner-only-no-screen (contradicts
  ROADMAP SC #1 "navigate to the new Companion view").

- **D-06 (glassesMenu lands on Companion only when an active session
  exists):** On `onLaunchSource('glassesMenu')`, plugin calls
  `GET /v1/agent-sessions` once, filters rows by `lastEvent.eventTimestamp
  > now - 5min AND lastEvent.event NOT IN ('task_complete', 'task_failed')`.
  If ≥1 row matches → land on Companion. Else → land on Home (today's
  default). On `onLaunchSource('appMenu')` → always Home.

  Active-session definition is locked: 5-min staleness window (covers
  normal Claude Code idle gaps) AND not-terminal (a 30-second-old
  `task_complete` is "just finished" — not "doing something now").

  **Rejected:** Always-Companion on glassesMenu (hostile when no AI work
  is running). Always-Work-Orders (SEED-006 original; misses the v3.8
  ambient-AI framing). 1h window (too wide; lets stale completes trigger
  the wrong landing). needs_input-only (too narrow; misses "running and
  I want to glance").

- **D-07 (`onLaunchSource` registered BEFORE `waitForEvenAppBridge()`
  resolves; render gated on the result):** Per SDK docs the launch-source
  push fires once after WebView load completes — register the listener at
  module scope in `main.ts`, capture the value into a
  `Promise<LaunchSource>` with a 500ms `Promise.race` timeout that falls
  back to `'appMenu'`. Then in `init()`:
  ```ts
  const [bridge, source] = await Promise.all([
    waitForEvenAppBridge(),
    launchSourcePromise,
  ]);
  // pick initial container based on source + active-session check
  ```
  Initial `createStartUpPageContainer` builds the right screen on first
  paint — zero flash of "Home → Companion".

  **Rejected:** Always Home first then `navigateTo` (1-frame flash;
  visible on G2's slow refresh). Informational-only (G2-POLISH-06 stays
  half-done; will resurface).

### HUD interactions + empty/offline states (Area 3)

- **D-08 (DOUBLE_CLICK is the only Companion tap event; meaning is
  context-sensitive):** On Companion screen specifically (NOT on Home —
  Home keeps its existing exit-confirm behavior):
  1. If a banner is currently displayed (needs_input or task_failed) →
     ack/dismiss the banner.
  2. Else if multiple active sessions → cycle to next session in the
     active-session list.
  3. Else → jump to Home (matches existing carousel behavior so
     DOUBLE_CLICK never feels broken on Companion).

  Single-tap (`CLICK_EVENT`) and long-press (`LONG_PRESS_EVENT`) are NOT
  used. Phase 45 retro: `CLICK_EVENT` was sim-only; `eventType`
  comes back undefined on real G2 hardware. Do not repeat that bug.
  `LONG_PRESS_EVENT` is not in `OsEventTypeList` today.

  **ROADMAP SC #2 caveat:** "single-tap clears the banner; double-tap
  cycles; long-press dismisses" cannot be met literally with current
  G2 SDK. Planner MUST either narrow SC #2 wording to
  "double-tap clears+cycles" OR explicitly punt single-tap/long-press
  to Phase 125 (where it can be revisited if SDK exposes the events).
  Do not silently ship a phase whose verification gate can't be met.

- **D-09 (One session at a time on the 3-line HUD; `N/M` indicator in
  header):** When ≥2 active sessions, the HUD shows ONE session's 3
  lines at any moment. The `buildVigilHeader` helper gets a new optional
  right-side parameter (e.g. "2/3") that displaces the default HH:MM
  clock when active. Most-recent-event session takes the lead after
  any new event arrives. DOUBLE_CLICK (per D-08 rule 2) cycles to the
  next session in the list, wrapping at the end.

  **Rejected:** Vertical list of sessions (violates "3-line HUD" layout
  from spec; loses last-event-message line). Highest-priority-only-no-
  cycling (loses ROADMAP SC #2 "cycle through active sessions" verbatim).

- **D-10 (Empty state shows last-completed-session summary if any):**
  Top: `No active sessions`. Middle: `Idle`. Bottom: derived from
  `GET /v1/agent-sessions`:
  - If any session in the last 24h → `Last: <truncated label> — <event>
    <relative-time>` (e.g. `Last: vigil-watch — task_complete 14m ago`).
  - Else → `No Claude Code activity yet.`

  Glanceable context even when nothing is running — explains the silence
  rather than feeling like dead space.

- **D-11 (Disconnect = keep last content + offline indicator + exp.
  backoff reconnect):** On SSE disconnect (network loss, 503, etc.):
  1. Plugin keeps showing whatever was on screen pre-disconnect (do NOT
     wipe the 3 lines).
  2. Header right-side shows a discrete `⚠` (or `offline` if char budget
     allows) until reconnect.
  3. SSE shim retries with exponential backoff: 1s, 2s, 4s, 8s, 16s,
     capped at 30s.
  4. On successful reconnect, Last-Event-ID replays missed events
     (D-02), the `⚠` clears, and the HUD updates to current state.

  Transient WiFi blips are visually silent. Long outages get a clear
  indicator without flashing a "Disconnected" splash on every micro-blip.

  **Rejected:** Wipe + "Disconnected — reconnecting..." (visually noisy
  on a HUD; every WiFi blip flashes). SSE-with-polling-fallback
  (doubles the protocol surface; hides connection state from user).

### G2-POLISH-07: Home body overflow fix (Area 4)

- **D-12 (Trim home body to 4 logical lines — drop inline affirmation +
  `DIVIDER`):** New home body content is:
  ```
  * N tasks pending
  
  TOP PRIORITY:
  <task content>
  ```
  Fits 210px container with paddingLength: 8 → no overflow → consistent
  scroll position across captures. Affirmation is already its own
  carousel screen; inline duplication was redundant — removing it
  doesn't lose information. `DIVIDER` row served only to separate the
  (now-removed) affirmation; gone with it. Footer text unchanged.
  Single-file change in `vigil-g2-plugin/src/screens/home.ts`. No
  `constants.ts` edits.

  **Rejected:** Option A — raise body 210→232 + shrink footer 38→28
  (footer text needs trimming to fit 28px; constants.ts churn for
  cosmetic). Option C — both A and B (defensive; biggest churn for a
  cosmetic fix). Keep-affirmation-drop-blanks (denser look but loses
  the breathing room that makes 4 lines feel ambient).

- **D-13 (Standalone atomic plan, parallel with HUD waves):**
  G2-POLISH-07 ships as its own plan (numbering TBD by planner — likely
  `124-XX-PLAN-home-overflow-fix.md`). Depends on nothing in this
  phase; can run in any wave that has spare slot. Atomic commit makes
  revert trivial if hardware retest dislikes it.

  **Rejected:** Bundling into the Companion-screen plan (mixes
  cosmetic + behavior changes in one commit). Punt to Phase 125
  (roadmap explicitly assigns it to 124 as "naturally co-located with
  HUD layout work" — punting walks back the roadmap reasoning).

- **D-14 (Verification = byte-identical screenshot equality check):**
  Run the existing `VITE_SCREENSHOT_MODE` pipeline twice (no source
  changes between runs) and assert the two PNGs are byte-identical
  for the home body region. Locks the v3.5 "two captures show
  different scroll positions" regression structurally. Hardware
  retest noted as deferred-item if real G2 glasses aren't accessible
  during plan execution; sim equality is the gate, hardware is the
  confirmation.

  **Rejected:** Hardware retest only (depends on glasses being on
  hand at execution; historically a blocker). Compute
  `lines * line_height + padding*2 ≤ 210` (relies on assumed
  line-height — the very thing v3.5 found unreliable).

### Claude's Discretion

- **Plan-wave structure:** Planner picks. Likely shape based on
  dependencies:
  - Wave 1: vigil-core SSE endpoint + EventEmitter bus + Last-Event-ID
    replay query (BLOCKING — plugin can't connect without it)
  - Wave 1 (parallel): G2-POLISH-07 home.ts trim + screenshot
    verification (zero overlap with HUD code)
  - Wave 2: plugin SSE shim + Companion screen + carousel insert +
    empty state + offline indicator (depends on Wave 1 endpoint)
  - Wave 2 (parallel): plugin onLaunchSource registration + initial-
    render gate (depends on Companion screen existing)
  - Wave 3: integration verification (E2E: vigil-watch → core → SSE →
    plugin → HUD)

- **`Screen.COMPANION` const value:** `'companion'` (lowercase, dash-
  free, matches existing `'home'`, `'work-orders'`, `'affirmation'`,
  `'task-detail'` style).

- **New `ContainerId` allocations:** `COMPANION_HEADER = 13`,
  `COMPANION_BODY = 14`, `COMPANION_FOOTER = 15`. The const map's
  comment says "max 12 total across all screens" — that comment is
  a constraint hypothesis, not an SDK-enforced limit. Research phase
  should confirm against `@evenrealities/even_hub_sdk` whether 12 is
  a real cap (and if so, whether it's per-screen or total). If
  total-cap is 12 and SDK enforces it, fall back to dynamic
  RebuildPageContainer (different ID space per screen).

- **Banner state machine:** `needs_input` → persistent banner until
  ack via DOUBLE_CLICK (D-08) OR a new event for that session
  arrives. `task_failed` → persistent banner with same dismissal.
  `task_complete` → 3-second toast (transient; auto-clears).
  `milestone` → 3-second toast. `heartbeat` → no banner; only updates
  the "state" middle line to `running` if not already. Toast
  implementation = banner that schedules a `setTimeout` to clear.
  Final timing tunables (3s vs 5s) are research-phase territory.

- **Label truncation:** `CHARS_PER_LINE = 32` is the existing
  constant. Truncate session label to 30 chars + `…` to leave room
  for the `2/3` indicator. Most Claude Code session labels (project
  directory names) fit; truncation is the exception case.

- **Bottom-line scrolling:** Spec says "scrolling if too long".
  Existing `TextContainerProperty` has marquee-like behavior on long
  content (verify in research). If not, render with truncation +
  ellipsis as fallback. Don't hand-roll a scroll animation timer
  unless SDK lacks support.

- **Last-Event-ID storage on plugin side:** WebView `localStorage`
  under key `vigil:lastEventId` (per-userId scoping not needed —
  single-user UI today, and the bearer key already binds to userId
  server-side). Persists across plugin reloads. Cleared on bearer
  key change (which would be a future settings flow).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v3.8 milestone spec (load-bearing)
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` — full milestone spec.
  Phase 124 implements §"G2 Companion HUD (plugin v0.3.0)" §"Layout" /
  §"Interaction" / (NOT §"Quiet mode" — deferred to Phase 125), and
  §"Architecture" → "/v1/agent-stream" (corrected from WS to SSE per D-01).

### Phase 121 API contract (the producer; SSE consumer feeds from this)
- `vigil-core/src/routes/agent-events.ts` — POST/GET handlers, the 8
  KNOWN_FIELDS, the 5 VALID_EVENTS, the (user_id, client_event_id)
  composite dedupe. SSE fan-out hooks into the POST success path
  (only on `isNew = true`).
- `vigil-core/src/db/schema.ts` §`agentEvents` table — columns the SSE
  handler reads for replay (`id` is the resume cursor — D-02).
- `.planning/phases/121-agent-events-api-foundation-cross-user-isolation-lock/121-CONTEXT.md`
  — D-A1 two-timestamp design (replay uses `id` not `eventTimestamp`),
  D-B1 24h sliding window (Last-Event-ID replay should bound to 24h
  for the same reason), D-D2 cross-user isolation (SSE filter MUST
  be `userId = c.get('userId')`, never trust client claims).

### Phase 122/123 (the producers feeding the SSE stream in dev)
- `.planning/phases/122-vigil-watch-core-watcher-parser-emitter-config/122-CONTEXT.md`
  — D-01 5-event enum (drift-detector pin); plugin HUD must render
  all 5 types correctly (state mapping + banner treatment).
- `.planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/123-CONTEXT.md`
  — daemon is real and posting events at execution time. `vigil-watch
  test` (heartbeat with `_vigil_test_<ts>` sessionId prefix) is the
  E2E smoke vehicle for Wave 3 verification.

### Phase 124 requirements + roadmap
- `.planning/REQUIREMENTS.md` — AGENT-API-03 (per-userId fan-out),
  AGENT-HUD-01 (3-line HUD layout), AGENT-HUD-02 (tap interactions —
  narrowed per D-08 caveat), G2-POLISH-06 (onLaunchSource
  registration), G2-POLISH-07 (home overflow fix).
- `.planning/ROADMAP.md` §"Phase 124" — 5 success criteria items;
  SC #2 wording needs narrowing per D-08 caveat (planner action item).

### G2 plugin code (the actual code being modified)
- `vigil-g2-plugin/src/main.ts` — current entry point; D-07 inserts
  `onLaunchSource` registration at module scope BEFORE `init()`.
- `vigil-g2-plugin/src/navigation.ts` — `Screen` const + `SCREEN_ORDER`;
  D-05 adds `COMPANION`. `handleNavEvent` switch grows a Companion-
  screen DOUBLE_CLICK_EVENT branch (D-08).
- `vigil-g2-plugin/src/api.ts` — bearer auth pattern, fallback data
  pattern, `VITE_API_URL`/`VITE_API_KEY` env. D-04 SSE shim follows
  the same auth header pattern (`Authorization: Bearer ${VITE_API_KEY}`).
- `vigil-g2-plugin/src/screens/home.ts` — D-12 trims body content.
- `vigil-g2-plugin/src/constants.ts` — `ContainerId` const; new
  COMPANION_* IDs allocated per Discretion note (research must confirm
  the "max 12" comment).

### vigil-core code (server side)
- `vigil-core/src/index.ts` — bearerAuth dispatcher pattern (D-01
  mounts /v1/agent-stream AFTER it). Mounting site for new SSE route.
- `vigil-core/src/middleware/auth.ts` — bearerAuth + `c.set('userId')`
  contract (D-03 EventEmitter keyed on this userId).
- `vigil-core/node_modules/hono/dist/helper/streaming/sse.d.ts` —
  Hono native streamSSE helper (research must confirm Hono version
  in vigil-core supports it; if not, `@hono/streaming` separate dep).

### Even Hub SDK (read-only — already vendored)
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.cts`
  — `LaunchSource` type, `bridge.onLaunchSource(callback)` signature,
  `OsEventTypeList` enum (the available tap events; canonical source
  for what is and isn't plumbed for D-08).

### v3.5 hardware UAT divergence (the regression G2-POLISH-07 closes)
- `.planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/HARDWARE-DIVERGENCE.md`
  — Divergence 4: two captures of home produce different scroll
  positions. D-14 verification gate locks the structural fix.

### SEEDs (background context — not code)
- `.planning/seeds/SEED-006-g2-glasses-menu-launch-source-handling.md`
  — original framing for G2-POLISH-06; D-06 modifies the original
  recommendation (lands on Companion when active, not always
  Work Orders).
- `.planning/seeds/SEED-007-g2-home-body-overflow-210px.md` — the
  three fix candidates (A/B/C); D-12 picks B.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`vigil-core/src/routes/agent-events.ts` factory pattern (`createAgentEventsRoute(deps)`):**
  New `/v1/agent-stream` route should follow the same DI factory shape so
  it's testable with stubbed deps (the EventEmitter bus is the obvious
  injection point — production gets the real bus, tests get a fake).
- **`vigil-core/src/middleware/auth.ts` `c.get('userId')` contract:** SSE
  handler reads userId via the same middleware-set context — never trust
  client claims. Mirror agent-events.ts:91 comment.
- **`vigil-g2-plugin/src/api.ts` `authHeaders()` helper:** D-04 SSE shim
  reuses this exactly — `Authorization: Bearer ${API_KEY}` set on the
  initial fetch. No new env-var plumbing needed.
- **`vigil-g2-plugin/src/screens/header.ts` `buildVigilHeader(id, name,
  rightSide?)`:** Already accepts an optional rightSide override (defaults
  to HH:MM clock). D-09 multi-session indicator passes `2/3`-style strings
  here; zero new helper needed. Companion screen reuses this verbatim.
- **`vigil-g2-plugin/src/navigation.ts` `Screen` const + `SCREEN_ORDER`
  + `handleNavEvent` switch:** Adding Companion is mechanical: new
  Screen entry, insert into SCREEN_ORDER, add Companion-DOUBLE_CLICK
  branch in handleNavEvent before the generic switch.

### Established Patterns
- **DI factory + `createXRoute(deps)` for testability:** Phase 121
  agent-events.ts:77 is the model. SSE route follows the same shape.
  `bus` injection is the new dependency surface; `replayMissedEvents` is
  another (DB-backed) dep so tests can stub the replay query.
- **Manual JSON validation, NOT zod:** Phase 121 D-Discretion strict()
  + KNOWN_FIELDS Set. SSE route has near-zero body (it's a GET) so this
  doesn't apply directly, but Last-Event-ID parsing must be defensive
  (`parseInt`, NaN check, range clamp).
- **Drizzle queries via existing connection (`db` from
  `../db/connection.js`):** Replay query reuses the existing pool;
  no new pg connection plumbing.
- **Plugin: zero runtime deps beyond Even Hub SDK:** D-04's hand-rolled
  SSE shim continues this. Verify in research phase that Vite (build-only)
  is the only other dep so the shim doesn't accidentally bring in npm.

### Integration Points
- **POST /v1/agent-events → bus.emit:** new line in agent-events.ts
  POST handler, immediately after the dedupe-aware insert returns
  `{ row, isNew }`. Only emit on `isNew = true` (avoid double-publishing
  duplicate clients).
- **SSE handler ↔ EventEmitter:** subscribe on connect, unsubscribe on
  abort/disconnect (Hono's streamSSE provides an `onAbort` hook). Avoid
  listener leaks at all costs (each leak = `MaxListenersExceededWarning`
  → eventually silently dropped events).
- **Plugin SSE shim ↔ Companion screen:** shim exposes a typed event
  emitter (or RxJS-style subscription). Companion screen subscribes on
  mount, unsubscribes on screen leave. State held in a small module-
  level cache (`activeSessions: Map<sessionId, AgentSessionRow>`)
  hydrated from `GET /v1/agent-sessions` on initial subscribe, then
  mutated by SSE events.
- **`onLaunchSource` ↔ initial container build:** module-scope
  `launchSourcePromise` resolves in 500ms or fires on the SDK push.
  `init()` awaits it before deciding which container to pass to
  `createStartUpPageContainer`. Zero flash on first paint (D-07).

</code_context>

<specifics>
## Specific Ideas

- **`/v1/agent-stream` URL is verbatim from spec/roadmap** — even
  though the original v3.8 PDF said WebSocket. Keep the URL path; the
  protocol underneath is implementation detail (D-01).

- **Bearer key plumbing on plugin side mirrors existing `api.ts` —
  zero new secret-handling pathways.** Inherits the `feedback_railway_variables_leak`
  caution: the bearer is in `VITE_API_KEY` only; never log it.

- **Active-session window 5min + non-terminal** is the locked
  definition for landing-screen logic (D-06). Same definition is
  reusable for Companion screen's "what counts as active for cycling"
  question (D-09 sessions list filter).

- **`_vigil_test_<unix-ts>` sessionId prefix from Phase 123** is the
  E2E smoke vehicle for Wave 3 verification. Plan should write a
  `vigil-watch test` invocation into the verification flow that the
  HUD receives via SSE → renders → asserts one heartbeat-styled
  state change.

- **WebView `localStorage` is the persistence layer** for `lastEventId`
  on the plugin side (Discretion). Plugin already has zero
  storage state today; this is the first piece. Keep schema
  trivial (just a string).

</specifics>

<deferred>
## Deferred Ideas

- **Single-tap (`CLICK_EVENT`) and long-press (`LONG_PRESS_EVENT`)
  banner control on Companion screen** — ROADMAP SC #2 promises both
  but neither is reliably plumbed on G2 today. Phase 125 candidate
  IF/WHEN the SDK exposes these. Until then, DOUBLE_CLICK
  context-sensitive behavior is the only tap on Companion (D-08).

- **Postgres LISTEN/NOTIFY for SSE fan-out** — replaces D-03
  EventEmitter when vigil-core scales past one Railway instance.
  Until horizontal scaling is real, EventEmitter is sufficient.
  Trigger: Railway instance count > 1 OR cross-instance event
  delivery becomes a real requirement.

- **Stream-token endpoint (short-lived bearer for SSE URL)** —
  Defense-in-depth alternative to D-04's shim. Worth revisiting only
  if/when bearer-in-WebView-fetch becomes a hostile-environment
  concern (it isn't today since the plugin is single-user + bearer
  is revocable).

- **Marquee/scroll animation for long bottom-line messages** — Spec
  says "scrolling if too long". Discretion notes truncation as
  fallback. If SDK lacks marquee and truncation feels visually
  bad on hardware, future ride-along could hand-roll a scroll
  animation. Not in this phase.

- **HUD priority queueing when multiple banners contend** — When
  needs_input AND task_failed are simultaneously banner-worthy on
  different sessions, current D-09 cycling lets the user navigate
  between them. A future "priority queue" UX (always show
  needs_input first) is a Phase 125 candidate if real-world use
  shows confusion.

- **Per-session label truncation tuning** — D-09 says 30 chars +
  `…`. If real session labels (Claude Code project dir names) are
  consistently long enough that 30 chars hides important
  disambiguation (e.g., "vigil-core" vs "vigil-core-test"), revisit
  with directory-aware truncation (last-segment-priority).

- **Container ID budget audit** — Discretion notes the "max 12"
  comment in constants.ts is a hypothesis. Research phase confirms.
  If SDK actually enforces 12, this phase needs a small
  refactor to reuse IDs across screens via dynamic
  RebuildPageContainer — separate from the Companion delivery itself.

- **Hardware retest of G2-POLISH-07** — Sim-equality is the
  verification gate (D-14). Real-glasses retest is operator
  procedure when next on-hand; if it disagrees with sim, ride-along
  fix in Phase 125 (alongside other hardware-only items per
  feedback_g2_tap_expand_broken pattern).

</deferred>

---

*Phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish*
*Context gathered: 2026-05-09*
