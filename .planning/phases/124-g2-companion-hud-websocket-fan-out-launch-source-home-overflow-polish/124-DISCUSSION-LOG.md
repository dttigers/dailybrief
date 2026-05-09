# Phase 124: G2 Companion HUD + WebSocket fan-out + launch-source/home-overflow polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
**Areas discussed:** Realtime transport, Companion HUD placement + glassesMenu landing, HUD interactions + empty/offline states, Home body overflow fix (G2-POLISH-07)

**Pre-discussion finding (load-bearing):** ROADMAP §Phase 124 + AGENT-API-03 both say "the existing `/v1/agent-stream` WebSocket" — but `grep` across `vigil-core/src/` returned zero references to WebSocket, agent-stream, SSE, or any streaming infra. The "existing" wording came from the v3.8 spec PDF, not the code. Phase 124 must build the realtime channel from scratch — that's a real implementation choice, not a given.

---

## Realtime transport

### Q1: Which realtime transport for fanning agent_events from vigil-core to the G2 plugin?

| Option | Description | Selected |
|--------|-------------|----------|
| Server-Sent Events | Hono native streamSSE; one-way matches use case; EventSource auto-reconnect; bearer via Authorization header. Zero new server deps. | ✓ |
| WebSocket (@hono/node-ws) | True bidi matches AGENT-API-03 literal wording but adds dep + manual reconnect/heartbeat + auth-header workaround on browser WS handshake. | |
| Short-poll GET /v1/agent-sessions | Zero new server code; battery-hostile at ≤2s cadence to meet ROADMAP SC #2 "within 2 seconds". | |

**User's choice:** Server-Sent Events
**Notes:** SSE selected — one-way fits, native Hono, zero new deps; the WS literal wording in AGENT-API-03 is implementation detail under the URL path.

### Q2: SSE endpoint shape — path, auth, and reconnect cursor?

| Option | Description | Selected |
|--------|-------------|----------|
| GET /v1/agent-stream + Last-Event-ID resume | Path stays per spec/roadmap; bearerAuth-after-dispatcher mount; `id:` field = agent_events.id; replay on reconnect via Last-Event-ID header. | ✓ |
| GET /v1/agent-stream + no resume (live-only) | Same path + auth; missed events recovered via GET /v1/agent-sessions on reconnect. Simpler server, extra hop on reconnect. | |
| GET /v1/agent-events/stream (nested) | Same as Recommended but nested URL. | |

**User's choice:** GET /v1/agent-stream + Last-Event-ID resume
**Notes:** Locked URL = `/v1/agent-stream` (matches spec verbatim). Last-Event-ID gives guaranteed-delivery feel without relying on extra polling on reconnect.

### Q3: How is the SSE stream fed when a new POST /v1/agent-events lands?

| Option | Description | Selected |
|--------|-------------|----------|
| In-process EventEmitter | Map<userId, EventEmitter>; POST emits, SSE handler subscribes. Zero deps. Single-Railway-instance assumption. | ✓ |
| Postgres LISTEN/NOTIFY | Survives multiple replicas (future-proof). Adds persistent pg connection per SSE client. | |
| DB-poll inside SSE handler | Tight-loop SELECT id > last_seen. Survives any deployment shape. Wastes DB queries. | |

**User's choice:** In-process EventEmitter
**Notes:** OK because vigil-core is single-instance on Railway today. LISTEN/NOTIFY filed under deferred for future horizontal scale.

### Q4: EventSource auth in the WebView — how does the bearer key reach the server on the GET /v1/agent-stream call?

| Option | Description | Selected |
|--------|-------------|----------|
| Custom EventSource shim with Authorization header | fetch + ReadableStream + manual SSE parsing. Mirrors api.ts auth pattern. ~30-60 lines. No key in URL. | ✓ |
| ?token= querystring + bearerAuth special-case | Native EventSource works. Token in URL leaks to Railway logs / browser history. | |
| Short-lived stream-token endpoint | POST gets short-lived token; EventSource uses it in URL. More server code. | |

**User's choice:** Custom EventSource shim with Authorization header
**Notes:** No bearer in URL → no Railway log leak. Plugin already has zero runtime deps beyond the SDK; hand-rolling 60 lines of SSE parsing keeps that.

---

## Companion HUD placement + glassesMenu landing (G2-POLISH-06)

### Q1: Where does the Companion HUD live in the existing 4-screen carousel — and what gates its visibility?

| Option | Description | Selected |
|--------|-------------|----------|
| New 'Companion' screen always in carousel, after Home | SCREEN_ORDER = Home → Companion → Work Orders → Affirmation. Empty state when no events. | ✓ |
| Conditional screen — Companion only inserted when active session exists | Dynamic SCREEN_ORDER. Mutable order breaks spatial mental model. | |
| Banner-only — no carousel slot, only persistent banners on top of any screen | Closer to a 'real notification' UX. Contradicts ROADMAP SC #1 "navigate to the new Companion view". | |

**User's choice:** New 'Companion' screen always in carousel, after Home
**Notes:** Predictable navigation; can swipe to Companion any time to ask "is anything running?".

### Q2: When the plugin is opened from the glasses-menu (onLaunchSource = 'glassesMenu'), where should it land?

| Option | Description | Selected |
|--------|-------------|----------|
| Companion HUD when active session exists, else Home | Best of both: ambient-first when relevant, predictable when not. | ✓ |
| Always land on Companion (ambient-first) | Uniform; hostile when no AI work happening. | |
| Always land on Work Orders (today's brief — SEED-006 original) | Honors SEED-006 verbatim; misses the v3.8 ambient-AI framing. | |

**User's choice:** Companion HUD when active session exists, else Home
**Notes:** Modifies SEED-006 original recommendation — SEED-006 said Work Orders, but v3.8's whole point is the ambient HUD; that should be the glasses-menu landing when there's something to see.

### Q3: What's the threshold for 'active session' for landing-screen logic?

| Option | Description | Selected |
|--------|-------------|----------|
| Last event < 5 min old AND not task_complete/task_failed | Aligns with "session is currently doing something". | ✓ |
| Any session with any event in the last 1 hour | Wider net; catches just-finished sessions. Stale completes feel wrong. | |
| Only sessions whose last event was needs_input | Tightest; misses "running and I want to glance". | |

**User's choice:** Last event < 5 min old AND not task_complete/task_failed

### Q4: How does onLaunchSource registration interact with the existing main.ts init flow?

| Option | Description | Selected |
|--------|-------------|----------|
| Register BEFORE waitForEvenAppBridge() resolves; gate initial render on it | Promise.race with 500ms timeout (fallback 'appMenu'); zero flash on first paint. | ✓ |
| Register early, but always build Home first; navigateTo() if glassesMenu fires | 1-frame Home → Companion flash on glasses-menu launch. | |
| Treat onLaunchSource as informational only (log it, don't gate) | Punts G2-POLISH-06 to a future phase; will resurface. | |

**User's choice:** Register before bridge resolves; gate initial render
**Notes:** SDK docs say register as early as possible because the push only fires once after WebView load completes.

---

## HUD interactions + empty/offline states

### Q1: How should the spec's tap meanings (single-tap ack / double-tap cycle / long-press dismiss) map onto the actual G2 SDK events available on the Companion screen?

| Option | Description | Selected |
|--------|-------------|----------|
| Use what's plumbed: DOUBLE_CLICK_EVENT only, context-sensitive on Companion | Pragmatic; CLICK_EVENT was sim-only on G2 (Phase 45 retro); LONG_PRESS not in OsEventTypeList. | ✓ |
| Implement spec literally, falling back if events fire as undefined | Repeats the Phase 45 sim-only trap; SC #2 verification can't be checked off. | |
| Banner auto-dismisses on next event, no per-tap control on Companion | Read-only HUD; spec's tap interactions undelivered. | |

**User's choice:** DOUBLE_CLICK_EVENT only, context-sensitive on Companion
**Notes:** Echoes the existing memory `feedback_runloop_main_async_trap` / `project_g2_tap_expand_broken` pattern: don't ship behavior on G2 events that aren't actually plumbed on hardware. Roadmap SC #2 wording will need narrowing during planning (or single-tap/long-press punt to Phase 125).

### Q2: What's the multi-session UX on the 3-line Companion HUD when more than one session is active?

| Option | Description | Selected |
|--------|-------------|----------|
| Show one session at a time; index indicator (e.g. '2/3') in header | One session's 3 lines at any moment; DOUBLE_CLICK cycles. Matches '3-line HUD' literal spec. | ✓ |
| Vertical list of all sessions, tightly compressed | Violates literal '3-line HUD' layout; loses last-event-message line. | |
| Show only the highest-priority session at any moment | No cycling. Loses ROADMAP SC #2 "cycle through active sessions" verbatim. | |

**User's choice:** One session at a time + N/M indicator
**Notes:** Header `buildVigilHeader(rightSide?)` already accepts a right-side override — N/M slots in there, displacing the default HH:MM clock.

### Q3: What does the HUD show when there are zero active sessions?

| Option | Description | Selected |
|--------|-------------|----------|
| 'No active sessions' + last-completed-session summary, if any | Glanceable context. Top: 'No active sessions'. Bottom: 'Last: <label> — <event> <relative time>'. | ✓ |
| 'No active sessions' minimal screen | Cleanest; feels like dead space. | |
| Auto-redirect to Home when zero active sessions | Contradicts always-in-carousel decision. | |

**User's choice:** 'No active sessions' + last-completed-session summary

### Q4: How should the HUD handle SSE disconnect/offline state?

| Option | Description | Selected |
|--------|-------------|----------|
| Show last-known state with small 'offline' indicator + auto-reconnect | Header corner ⚠; exp. backoff 1/2/4/8/16s, 30s cap. Last-Event-ID replay on reconnect. | ✓ |
| Replace HUD content with 'Disconnected — reconnecting...' immediately | Visually noisy; every WiFi blip flashes. | |
| Fall back to GET /v1/agent-sessions polling at 5s when SSE disconnects | Hides connection state; doubles protocols. | |

**User's choice:** Last-known state + offline indicator + exponential backoff

### Q5 (continue check): Continue more questions about HUD interactions/empty/offline, or move to the last area?

| Option | Description | Selected |
|--------|-------------|----------|
| Next area (Home overflow) | Interactions/empty/offline sufficiently locked. | ✓ |
| More questions about HUD interactions/empty/offline | Heartbeat treatment, milestone banner duration, label truncation, scroll behavior. | |

**User's choice:** Next area
**Notes:** Open items (heartbeat treatment, milestone toast 3-vs-5s, label truncation, scroll/marquee) captured in Claude's Discretion section of CONTEXT.md.

---

## Home body overflow fix (G2-POLISH-07)

### Q1: Which fix candidate from SEED-007 do you want for the home body overflow?

| Option | Description | Selected |
|--------|-------------|----------|
| B — Trim content: drop inline affirmation + DIVIDER | 4 logical lines instead of 7. Fits 210px no problem. | ✓ |
| A — Increase home body height 210→232; shrink footer 38→28 | Same content; constants.ts churn; footer text needs trimming to fit 28px. | |
| C — Both: trim content AND raise body height | Defensive; biggest churn for cosmetic fix. | |
| Trim content differently — keep affirmation, drop blank lines + DIVIDER | Denser; loses breathing room. | |

**User's choice:** B — Trim content (drop inline affirmation + DIVIDER)
**Notes:** Affirmation is already a dedicated screen — inline duplication was redundant. New body: '* N tasks pending' / blank / 'TOP PRIORITY:' / <task content>. Single-file change in screens/home.ts; no constants.ts edits.

### Q2: How should the G2-POLISH-07 fix be packaged in this phase's plan structure?

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone atomic plan, parallel with HUD work | One-file change. Atomic commit; trivial revert if hardware retest dislikes. | ✓ |
| Bundled into the 'Companion screen + plugin shell' plan | Bigger commit; mixes cosmetic + behavior changes. | |
| Punt to Phase 125 | Roadmap explicitly assigns it to 124 as "naturally co-located". | |

**User's choice:** Standalone atomic plan, parallel with HUD work

### Q3: What's the verification gate for G2-POLISH-07 — how do we prove the overflow is fixed?

| Option | Description | Selected |
|--------|-------------|----------|
| Two consecutive sim screenshots show identical content position | VITE_SCREENSHOT_MODE pipeline; assert byte-identical PNGs for home body region. | ✓ |
| Real-hardware retest only | Depends on glasses being on hand at execution time; historically a blocker. | |
| Just count rendered lines vs container height in code | Relies on assumed line-height — the very thing v3.5 found unreliable. | |

**User's choice:** Sim-screenshot byte-identical equality check
**Notes:** Hardware retest is operator confirmation; sim equality is the structural gate.

### Q4 (final check): Are any gray areas still unclear?

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | All decisions captured. | ✓ |
| Explore more gray areas | Heartbeat-event treatment, milestone-event banner duration, label truncation length, Last-Event-ID storage location, plugin ehpk version bump policy. | |

**User's choice:** I'm ready for context
**Notes:** Open items captured under Claude's Discretion in CONTEXT.md (heartbeat treatment, milestone toast timing, label truncation, Last-Event-ID storage in localStorage, container ID budget audit). Plugin ehpk version bump is owned by Phase 125 per roadmap.

---

## Claude's Discretion

Items where the user deferred to Claude (captured under "Claude's Discretion" in CONTEXT.md):

- Plan-wave structure (3 waves with explicit dependencies — Wave 1 server SSE + home.ts trim parallel; Wave 2 plugin shim + Companion screen + onLaunchSource gate parallel; Wave 3 E2E integration).
- `Screen.COMPANION = 'companion'` const value.
- New ContainerId allocations (COMPANION_HEADER=13, BODY=14, FOOTER=15) with research-phase confirmation that the "max 12" comment is hypothesis vs SDK-enforced cap.
- Banner state machine for needs_input/task_failed (persistent) vs task_complete/milestone (3s toast) vs heartbeat (no banner; only updates state line).
- Label truncation length (30 chars + `…` for the 32-char display width minus N/M indicator).
- Bottom-line scrolling vs truncation+ellipsis fallback (research-phase decides based on SDK marquee support).
- Last-Event-ID persistence on plugin side via WebView `localStorage` under key `vigil:lastEventId`.

## Deferred Ideas

- Single-tap and long-press banner control on Companion (waiting on G2 SDK to expose CLICK_EVENT and LONG_PRESS_EVENT reliably; Phase 125 candidate).
- Postgres LISTEN/NOTIFY for SSE fan-out (replaces in-process EventEmitter when vigil-core scales past one Railway instance).
- Stream-token endpoint as defense-in-depth alternative to bearer-in-fetch-shim (only revisit if hostile-environment threat model changes).
- Marquee/scroll animation for long bottom-line messages (only if truncation feels visually bad on hardware).
- HUD priority queueing when multiple banners contend (current cycling lets user navigate; revisit if confusion observed in real use).
- Per-session label truncation tuning (revisit with directory-aware truncation if 30-char cutoff loses important disambiguation).
- Container ID budget audit (research phase confirms whether "max 12" comment is hypothesis or SDK-enforced).
- Hardware retest of G2-POLISH-07 (sim-equality is the gate; real-glasses retest is operator procedure).
