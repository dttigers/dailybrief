# Architecture Research — v3.9 Voice & Companion Polish

**Domain:** Subsequent milestone — additive features on existing Vigil platform
**Researched:** 2026-05-12
**Confidence:** HIGH (existing architecture verified by direct source read; new integration points designed against verbatim Phase 121/124/125 patterns)

> **Scope note:** This is *not* a greenfield architecture document. v3.8 closed 2026-05-11 with a working 5-client platform. This file enumerates the *delta* — the exact endpoints, columns, files, and data flows that v3.9's seven feature streams add, expressed in the existing patterns the roadmapper must respect.

---

## Existing Architecture (verbatim, do not re-research)

Already documented in `.planning/PROJECT.md` and the milestone_context block. Summary for cross-reference:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                                      │
│  Mac app │ PWA │ G2 plugin │ Browser ext (Chrome+Safari) │ vigil-watch (Swift)│
└────┬─────────┬─────────┬─────────────────┬─────────────────┬──────────────────┘
     │         │         │                 │                 │
     └─────────┴────┬────┴─────────────────┴─────────────────┘
                    │ HTTPS bearer (vk_…) or JWT (HS256)
                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  VIGIL CORE  (Hono / TypeScript / Drizzle / Node @ Railway)                  │
│  ┌──────────────┐  ┌────────────────────────────────────────────┐           │
│  │ Middleware   │  │ Routes (~30, all mounted /v1)              │           │
│  │ • cors       │  │ thoughts, work-orders, agent-events,       │           │
│  │ • secHdrs    │  │ agent-stream (SSE), quiet-mode, chat,      │           │
│  │ • timeout    │  │ insights, therapy, process-audio,          │           │
│  │ • rate-limit │  │ process-photo, brief-*, calendar, sports…  │           │
│  │ • bearerAuth │  └────────────────────────────────────────────┘           │
│  │ • requireVE  │  ┌────────────────────────────────────────────┐           │
│  │ • metrics    │  │ lib/                                       │           │
│  └──────────────┘  │ • agent-events-bus (Map<userId,Emitter>)   │           │
│                    │ • quiet-mode-suppression (per-user queue)  │           │
│                    │ • sentry, turnstile                        │           │
│                    └────────────────────────────────────────────┘           │
│                    ┌────────────────────────────────────────────┐           │
│                    │ services/ ai/client.ts • Anthropic SDK     │           │
│                    │   (incl. beta.files for audio upload)      │           │
│                    └────────────────────────────────────────────┘           │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ pg via Drizzle
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  POSTGRES (Railway)                                                          │
│  users, thoughts (tsvector FTS), work_orders, work_order_statuses,           │
│  ai_cache (uniq user_id+type), agent_events, oauth_tokens, app_settings,     │
│  brief_pdfs (bytea), password_reset_tokens, projects, chat_sessions          │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Load-bearing invariants v3.9 work MUST preserve:**

1. **bearerAuth dispatcher mounts at `app.use("/v1/*", …)` line 166 of `index.ts`.** Every new protected route must be `app.route()`'d AFTER that mount, AFTER `requireVerifiedEmailWithGrace` (line 181), AFTER `metricsMiddleware` (line 194). Mounting earlier silently creates a cross-user data write path (see Phase 124 comment lines 248-253 — "would create a silent auth bypass").
2. **`userId` is ALWAYS `c.get("userId")` set by bearerAuth — NEVER from body/query.** Phase 121 D-D2 lock; Phase 125 T-125-01/02 mitigation. Every new query must include `eq(table.userId, userId)` in the WHERE clause and `.userId = userId` on every insert.
3. **Drizzle migration files are numbered sequentially with hand-crafted SQL** (drizzle-kit auto-output is replaced — see Phase 121 Plan 01 finding). The next file is `0020_*.sql`. ADD COLUMN uses `IF NOT EXISTS` guard for Railway partial-fail-on-restart re-run safety (Phase 125 Plan 02 pattern).
4. **SSE bus singleton (`vigil-core/src/lib/agent-events-bus.ts`) is the cross-feature pub/sub primitive.** Cache invalidation, quiet-mode, agent events all fan out through `Map<userId, EventEmitter>`. New SSE event types extend this bus.
5. **`/v1/process-audio` already exists.** Uses Anthropic beta.files for transcription (10 MB base64 cap, claude-sonnet-4 model). G2 voice ingest builds on this endpoint, not a greenfield transcription path.

---

## v3.9 Integration Points — Endpoint Delta

### New Endpoints

| Verb | Path | Auth | Feature | Notes |
|------|------|------|---------|-------|
| `POST` | `/v1/voice/sessions` | bearer | VOICE | Open recording session, returns `sessionId`. Used by G2 to associate streamed chunks. Optional in chunked design; mandatory only if we stream PCM as it arrives. |
| `POST` | `/v1/voice/transcribe` | bearer | VOICE | Body: `{ audioPcm: base64, sampleRate?: number, encoding?: "pcm_s16le" }`. Wraps existing `process-audio` transcription stack but accepts raw PCM (existing endpoint expects packaged audio/wav, audio/mp4 etc.). Emits `thought_created` via existing path; INSIGHTS-FRESH hook fires on insert. |
| `POST` | `/v1/quiet-mode/auto` | bearer | QUIET-AUTO | Body: `{ enabled: boolean, source: "ios_focus" \| "manual" }`. Thin wrapper over existing `/v1/quiet-mode` that records `source` for telemetry without changing the durable column shape. **Alternative:** extend existing `PUT /v1/quiet-mode` body with optional `source` field — preferred (no new route surface). |
| `POST` | `/v1/cache/invalidate` | bearer | INSIGHTS-FRESH (optional) | Body: `{ types: string[] }`. Useful for manual UI "Regenerate now" trigger and for tests; the durable mechanism is the in-process hook in `thoughts.post` (no route needed). Ship the in-process hook first; only add this route if PWA needs cross-tab cache-bust. |

### Extended Endpoints

| Verb | Path | Feature | Modification |
|------|------|---------|--------------|
| `PUT` | `/v1/quiet-mode` | QUIET-AUTO | Accept optional `source: "manual" \| "ios_focus"` in body; persist into new `quiet_mode_source` column or telemetry only (decide in plan). |
| `POST` | `/v1/chat` | CHAT-CTX | Lift `contextLimit` cap from `body.contextLimit <= 50` (chat.ts:34) to `<= 500` or unbounded with server-side budget check. Add optional `mode: "recent" \| "windowed" \| "search"` to drive retrieval strategy. **Server-side enforcement:** clamp at Claude context budget (~150K tokens; rule of thumb ~3000 thoughts at 200 char avg). |
| `POST` | `/v1/thoughts` | INSIGHTS-FRESH | After insert + fire-and-forget triage, **also** call `invalidateAiCache(userId, ['insights','therapy','therapy_prep'])` synchronously (DB write is fast; failure non-fatal). Optionally `bus.emit(userId, { type: 'cache_invalidated', types: [...] })` so PWA can refetch. |
| `POST` | `/v1/process-audio` | INSIGHTS-FRESH | Same insert hook as thoughts.post — already creates a thought row, so the invalidation hook should live at a single chokepoint. **Recommend: factor a `createThoughtAndFanout(userId, payload)` helper** that both routes call. |
| `POST` | `/v1/work-orders/sync` | SVCNOW | **NO CODE CHANGE.** Endpoint already accepts `caseNumber + shortDescription + priority + …` arrays. Browser extension popup posts directly. Optionally widen `priority` validation if Polaris emits non-standard values. |
| `GET` | `/v1/agent-stream` | HUD-CLARITY | Add new event-name(s) to the existing per-userId EventEmitter bus channel set (currently `event`, `quiet`) if HUD-CLARITY-01 requires distinct frame types beyond the existing agent-event taxonomy. |

### Reused Endpoints (No Modification)

| Endpoint | v3.9 Consumer | Why It Already Fits |
|----------|---------------|---------------------|
| `POST /v1/work-orders/sync` | ServiceNow popup | Already accepts 9-field WorkOrder array, scoped by `c.get("userId")`, with mass-assignment defense via destructure. Max 100/req. |
| `GET /v1/thoughts/:id` | Browser extension polling | Triage poll pattern proven in vigil-extension/popup.js:163-176. |
| `GET /v1/agent-stream` | G2 plugin | SSE shim already shipped; new event types fan out through same channel. |

---

## v3.9 Integration Points — Schema Delta

### New Columns (extend existing tables)

| Migration | Table | Column | Type | Default | Why |
|-----------|-------|--------|------|---------|-----|
| `0020` | `users` | `quiet_mode_source` | `text` | `'manual'` | QUIET-AUTO telemetry: which path flipped the flag. Nullable not needed; default to 'manual' preserves Phase 125 backfill semantics. |
| `0020` | `thoughts` | `voice_session_id` | `text` | `NULL` | VOICE: link a thought back to the raw PCM session for debugging / re-transcription. Optional; only populated when `source='voice'`. Nullable. |

### New Tables

**None are strictly required.** All v3.9 features fit within existing schema. The two reasonable additions are *optional* and should be deferred unless a phase explicitly justifies them:

| Table | Columns | When to Add | Verdict |
|-------|---------|-------------|---------|
| `voice_sessions` | id, user_id, started_at, ended_at, duration_ms, sample_rate, transcription_thought_id, error | Only if VOICE-01 spike decides chunked streaming + retry across reconnects | DEFER until VOICE-01 returns evidence |
| `ai_cache_events` | id, user_id, cache_type, action, at | Only if INSIGHTS-FRESH telemetry needs row-level audit | DEFER; PostHog `cache_invalidated` event covers it |

**Rationale for "no new tables":** Vigil's pattern (verified across v3.4-v3.8) is to add tables only when a row-level audit trail or many-to-one relationship structurally demands it. Quiet-mode auto-detect is a state flip on `users`. Voice transcription is a one-shot ingest that produces a single `thoughts` row. Cache invalidation is fire-and-forget. Adding tables now is premature optimization; if VOICE-01 spike returns "we need chunked streaming with resume across disconnects," that's the trigger to revisit.

---

## Data Flow Diagrams

### Flow 1 — VOICE Capture (G2 → vigil-core → Thought row)

```
G2 (vigil-g2-plugin)
  └─ user enters Voice screen
     └─ companion.ts (or new voice.ts) calls bridge.audioControl(true)
        └─ bridge.onEvent fires with audioEvent.audioPcm: Uint8Array chunks
           └─ accumulate chunks in module-scope buffer
              └─ on user exit OR after N ms silence:
                 1. bridge.audioControl(false)
                 2. concat Uint8Arrays → base64 encode
                 3. POST /v1/voice/transcribe { audioPcm, sampleRate }
                    Authorization: Bearer vk_…   (existing api.ts bearer)
                                          │
                                          ▼
vigil-core POST /v1/voice/transcribe (NEW)
  ├─ bearerAuth → userId from c.get("userId")
  ├─ decode base64 → Buffer
  ├─ wrap as audio/wav via WAV header (16-bit PCM, given sampleRate)
  │   ── OR ── route to provider directly if it accepts raw PCM
  ├─ call existing transcription primitive (Anthropic beta.files OR Whisper)
  ├─ INSERT thoughts (userId, content=transcription, source='voice',
  │                   voice_session_id=optional)
  ├─ fire-and-forget triage (existing pattern from process-audio.ts:154-175)
  ├─ INVALIDATE ai_cache (userId, ['insights','therapy','therapy_prep'])
  │   bus.emit(userId, { type: 'cache_invalidated' })
  └─ return 201 { id, content, transcription, category? }
                                          │
                                          ▼
G2 plugin shows "Captured ✓ <Category>" toast or quick HUD line
```

**Transcription provider decision — RECOMMEND: stick with Anthropic beta.files (the existing path).**

| Option | Latency | Cost / min | Accuracy | DX Fit | Verdict |
|--------|---------|------------|----------|--------|---------|
| Anthropic beta.files + Claude (existing) | ~3-8s for 10-30s clips | tokens-per-call (rough: $0.001-0.005 per 30s clip at Sonnet rates) | High (verbatim mode) | Already wired in `process-audio.ts`; same Anthropic key/quota/spend-cap; can fold triage into same call long-term | **CHOOSE** — zero new vendor surface, $500/mo Anthropic cap already locked |
| OpenAI Whisper API (`whisper-1`) | ~1-3s for 30s clip | $0.006/min | Industry-leading for short clips | New vendor (OPENAI_API_KEY env, secret drift surface — memory: `project_secret_drift`), new spend cap | DEFER — only if Anthropic latency proves user-hostile in VOICE-01 spike |
| GPT-4o Mini Transcribe (streaming) | sub-1s partials | $0.003/min | Comparable to Whisper | New vendor + streaming wire format (more work in transport layer) | DEFER |
| Server-side bridge to macOS SFSpeechRecognizer | 0 network | $0 | Excellent for English | macOS-only (kills the cross-platform thesis — `project_cross_platform_vision`); requires running a Swift sidecar on the user's Mac when their G2 captures | REJECT |

**Why Anthropic wins for v3.9:**
- **No new secret to manage** — Anthropic key already in Railway env, already capped at $500/mo (Phase 126), already governed by `project_secret_drift` discipline.
- **Existing endpoint shape works** — `process-audio.ts` lines 81-129 prove the pattern; PCM → WAV wrapper is ~20 lines of code, not a new integration.
- **Triage co-location opportunity** — long-term, a single Claude call can transcribe + categorize, halving round-trips (defer until VOICE-02+).
- **VOICE-01 spike is the gate.** If Anthropic round-trips exceed 8s on hardware tests, the spike returns a downscope recommendation (e.g., "push-to-record short clips only, max 30s") rather than forcing a vendor swap.

**Where audio chunks transit (storage decision):**

| Storage Path | Recommendation |
|--------------|----------------|
| In-memory Node Buffer for the duration of one request | **YES — primary path.** Max 10 MB base64 (existing process-audio cap). Buffer lives milliseconds. No persistence. |
| Postgres bytea column (like `brief_pdfs`) | **NO.** Audio is ephemeral; the transcription IS the durable artifact. Storing PCM forever bloats the DB for zero recall value. |
| S3 / Railway volume / external blob store | **NO.** No new vendor; no operational reason to retain. If a customer ever asks "what did I say," the transcribed `thoughts.content` is the answer. |
| Direct stream through vigil-core to Anthropic (no buffer) | **DEFER.** Would require chunked transfer encoding + streaming PCM to Anthropic Files API. Anthropic Files API is upload-then-reference, not streaming. Stick with buffered upload until evidence demands otherwise. |

**Net: G2 buffers PCM client-side, posts a single base64 blob per utterance to `/v1/voice/transcribe`, vigil-core holds it in memory for the Anthropic round-trip, then it's GC'd. No persistence. Same shape as `process-audio.ts` today.**

---

### Flow 2 — ServiceNow Assisted-Capture (Browser ext → /v1/work-orders/sync)

```
Operator browses ServiceNow Polaris work-order page
  └─ Clicks Vigil extension icon (popup.html opens — new svcnow-popup.html)
     └─ Content script (NEW: src/content-script.js) scrapes:
        • CS# from document.title regex /CS\d+/  (Polaris page title contains it)
        • OR document.location.search params if URL has case=
        └─ Pre-fills popup field (read-only)
           └─ Operator types short description + selects priority dropdown
              └─ Submit → POST /v1/work-orders/sync
                          Authorization: Bearer vk_…  (existing api_key flow)
                          Body: { workOrders: [{
                            caseNumber: "CS123456",
                            shortDescription: "<typed>",
                            priority: "<selected>",
                            store: "",   // Polaris doesn't expose, leave empty
                            trade: "",   // operator can leave blank
                            location: "",
                            equipment: "",
                            contact: "",
                            state: "open"
                          }]}
                                          │
                                          ▼
vigil-core POST /v1/work-orders/sync (EXISTING — no code change)
  ├─ bearerAuth → userId
  ├─ destructure 9 known fields (mass-assignment defense, T-66-02)
  ├─ INSERT … ON CONFLICT (case_number) DO UPDATE SET … (existing upsert)
  └─ return 201 { synced: 1 }
                                          │
                                          ▼
Extension popup shows "Captured ✓ CS123456" toast → window.close()
```

**Manifest delta:**

```diff
  {
    "manifest_version": 3,
    "name": "Vigil Capture",
-   "permissions": ["activeTab", "storage"],
+   "permissions": ["activeTab", "storage", "scripting"],
    "host_permissions": ["https://api.vigilhub.io/*"],
+   "content_scripts": [{
+     "matches": ["https://*.service-now.com/*"],
+     "js": ["svcnow-content.js"],
+     "run_at": "document_idle"
+   }],
    "action": { "default_popup": "popup.html", ... }
  }
```

**Polaris scrape strategy (per memory `project_work_order_source_pivot` — IT blocked API token):**
- DO NOT scrape Polaris DOM via Shadow-DOM piercing (failed 6-approach attempt log 2026-05-07).
- DO read `document.title` (regex `/CS\d+/`) — it's standard DOM, not inside Shadow-DOM.
- DO read `window.location.search` for `case` or `sys_id` query params.
- IF both fail, operator types CS# manually — popup still ships value over IT-API blocker.

**Parallel non-engineering track:** ServiceNow API IT token request continues (PROJECT.md "ServiceNow note"). The popup ships regardless; if the token ever lands, `/v1/work-orders/sync` continues to work — the new path becomes `vigil-core → ServiceNow API` cron, popup becomes redundant. No bridge code thrown away.

---

### Flow 3 — INSIGHTS-FRESH (Thought create → invalidate ai_cache → optional SSE)

```
POST /v1/thoughts  (or /v1/process-audio or /v1/voice/transcribe)
  ├─ INSERT thoughts (...) RETURNING *
  ├─ fire-and-forget triage    ─┐
  │                              │ (existing pattern, lines 330-355
  │                              │  of thoughts.ts)
  │                              │
  ├─ ★ NEW: invalidateAiCache(userId, ['insights','therapy','therapy_prep'])
  │     │
  │     ▼
  │   helper in vigil-core/src/services/ai-cache-invalidator.ts (NEW):
  │     await db.delete(aiCache).where(
  │       and(eq(aiCache.userId, userId), inArray(aiCache.type, types))
  │     )
  │     bus.emit(userId, {
  │       __synthetic: 'cache_invalidated',  // distinct from DrizzleAgentEvent
  │       types,
  │       at: new Date().toISOString()
  │     } as any)
  │
  └─ return 201 thought
                                          │
                                          ▼
GET /v1/agent-stream (PWA listening on same userId-bus)
  └─ writes SSE frame: event: cache_invalidated\ndata: {"types":[...]}\n\n
     └─ PWA listener (NEW small handler in InsightsPage/TherapyPage):
        └─ next time user opens Insights tab, hit GET /v1/insights/cache
           └─ 404 (since DELETE'd) → show "Generate" CTA  ─OR─
           └─ pre-emptively POST /v1/insights to regenerate in background
```

**Two design choices for the SSE side of INSIGHTS-FRESH:**

| Approach | Pros | Cons | Recommend |
|----------|------|------|-----------|
| **Lazy bust:** DELETE the cache row; PWA notices on next fetch (404 → CTA) | Zero coupling between create-path and PWA; works even if PWA closed | Stale UI shows old insights until user navigates back | **CHOOSE for INSIGHTS-FRESH-01** — minimal risk, ships independently of SSE plumbing |
| **Push bust:** DELETE + emit SSE frame; PWA listener marks state dirty or refetches | Real-time freshness; trust-building | Requires extending bus message taxonomy (it's currently typed as `DrizzleAgentEvent`); cross-cutting with agent-events typing | DEFER to optional INSIGHTS-FRESH-02 polish phase |

**Reuse opportunity:** The bus already supports a second channel (`QUIET_NAME = "quiet"`) — adding a third (`CACHE_NAME = "cache"`) follows the exact Phase 125 pattern of `emitQuiet/onQuiet/offQuiet`. If push-bust is chosen, it's a 30-line addition to `agent-events-bus.ts` mirroring the quiet-mode shape verbatim.

---

### Flow 4 — QUIET-AUTO (iPhone Focus → PWA → /v1/quiet-mode)

```
iOS Focus mode toggles ON (user enables "Do Not Disturb" focus)
  └─ iOS does not expose Focus state to web pages directly.
     │
     │  RESEARCH PIVOT NEEDED — see Pitfalls section below
     │
     ▼
Two viable detection paths:
  ┌──────────────────────────────────┬──────────────────────────────────┐
  │ Path A — PWA Notification API    │ Path B — iOS Shortcut + webhook  │
  ├──────────────────────────────────┼──────────────────────────────────┤
  │ Listen for Notification.perm or  │ User configures a Focus-trigger  │
  │ visibility changes; INFERRED from│ Shortcut that POSTs to a Vigil   │
  │ "user dismissed notif quickly,   │ endpoint when Focus turns on/off.│
  │ device wakeword silenced"        │ Direct signal, requires user opt-in.│
  ├──────────────────────────────────┼──────────────────────────────────┤
  │ Unreliable (per Pitfalls)        │ Reliable BUT memory project_     │
  │                                  │ ios_shortcut_blocked says        │
  │                                  │ Shortcuts.app bugs unresolved    │
  └──────────────────────────────────┴──────────────────────────────────┘

RECOMMEND — Path B (Shortcut webhook), with operator-runbook UAT:
  iOS Shortcut (Focus filter → "When Focus turns on" trigger)
    └─ POST https://api.vigilhub.io/v1/quiet-mode
       Authorization: Bearer vk_…
       Body: { enabled: true, source: "ios_focus" }
                                          │
                                          ▼
vigil-core PUT /v1/quiet-mode (EXISTING, minor extension to capture source)
  ├─ bearerAuth → userId
  ├─ UPDATE users SET quiet_mode=true, quiet_mode_since=NOW(),
  │                   quiet_mode_source='ios_focus'
  ├─ bus.emitQuiet(userId, { enabled: true, since })
  └─ return { ok: true }
                                          │
                                          ▼
G2 plugin SSE listener picks up quiet_mode_changed
  └─ companion.ts setQuietMode(true) → Q glyph appears in HUD header
     (existing Phase 125 plumbing — no client-side change needed)
```

**Why Path B over Path A:** PWA Focus detection is unreliable in browsers — there is no W3C "Focus mode" API. Inferring it from notification dismissal patterns or visibility-change events produces too many false positives to ship as a trust-building feature. The Shortcut path is one user-facing setup step (~2 min) and delivers a deterministic signal.

**Memory caveat — `project_ios_shortcut_blocked`:** Phase 85 iOS Shortcut quick-capture was blocked on Shortcuts.app bugs. The bugs that blocked Phase 85 (deep-link launch issues) are unrelated to Focus filter automation (Apple's Focus filter API is a separate, stable mechanism). However, this should be validated in a 30-min spike before committing the phase — if the same bug class blocks Focus filters too, QUIET-AUTO downscopes to a manual button in iOS Settings PWA bookmark.

---

### Flow 5 — HUD-CLARITY (Companion HUD formatting)

This is mostly a client-side change in `vigil-g2-plugin/src/screens/companion.ts`. No new server endpoints unless new event semantics demand a server-side classifier.

**Three SEED-016 gaps from v3.8 dogfooding (per PROJECT.md):**
1. "Still running, or done?" at-a-glance ambiguity
2. Away-from-desk state confusion when banner clears
3. Missing time-since-last-event signal

**Likely changes (scope decided by phase planner):**
- Extend `STATE_LINE` map in companion.ts:42 to include "stalled" (no event in N minutes)
- Add line3 timestamp suffix ("done • 2m ago") when bannerActive=false
- Server-side: optionally extend `agent_events.event` enum to include `'idle'` if vigil-watch emits one (would require migration `0021_add_idle_event_type.sql`)

**No new endpoints required for the client-side polish path. Server-side enum extension is OPTIONAL.**

---

### Flow 6 — G2-LIFECYCLE (last-viewed screen restore)

Pure client-side. No vigil-core changes.

```
G2 plugin shutdown:
  └─ navigation.ts onBeforeUnload-equivalent:
     └─ await bridge.setLocalStorage('vigil_last_screen', String(currentScreen))

G2 plugin startup (main.ts):
  ├─ existing Phase 124 D-07 onLaunchSource registration runs
  ├─ ★ NEW: const stored = await bridge.getLocalStorage('vigil_last_screen')
  ├─ pickInitialScreen() returns COMPANION if launchSource === GLASSES_MENU
  │                     else returns int(stored) if stored is valid Screen index
  │                     else returns HOME (existing default)
  └─ buildScreen(initialScreen)
```

**Existing primitive:** `bridge.setLocalStorage(key, value)` and `bridge.getLocalStorage(key)` are SDK methods at `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts:1144,1157`. `min_sdk_version: 0.0.8` (app.json) already supports them.

---

## Build Order — Dependency Graph

```
                  ┌─────────────────────────────────────┐
                  │  VOICE-01 SPIKE (1-2 day gate)     │
                  │  Verify audioControl + audioEvent  │
                  │  on hardware. Decide PCM transport. │
                  │  Decide transcription provider.     │
                  └──────────────┬──────────────────────┘
                                 │
              ┌──────────────────┼──────────────────────┐
              │ if PASS:         │ if DOWNSCOPE:         │ if FAIL:
              │ proceed full     │ short-clip variant    │ defer VOICE-*
              │                  │                       │ to v3.10
              ▼                  ▼                       ▼
   ┌──────────────────────────────────────────┐  ┌────────────────────┐
   │  Parallelizable foundation work (no      │  │  Skip VOICE        │
   │  dependency between these three):        │  │  Build remaining    │
   │                                          │  │  6 features         │
   │  • G2-LIFECYCLE-01 (G2 setLocalStorage)  │  │                     │
   │  • SVCNOW-01 (extension popup)           │  │                     │
   │  • INSIGHTS-FRESH-01 (cache hook + SSE) │  │                     │
   │                                          │  │                     │
   │  These are independent of each other and │  │                     │
   │  of VOICE-* — can ship in any order.     │  │                     │
   └────────────────┬─────────────────────────┘  └────────────────────┘
                    │
                    ▼
   ┌──────────────────────────────────────────┐
   │  VOICE-02..N (commit-time scope from     │
   │  VOICE-01 spike output):                 │
   │    • PCM buffering on G2                 │
   │    • base64 transport                    │
   │    • /v1/voice/transcribe route          │
   │    • migration 0020 (voice_session_id)   │
   │    • integration tests                   │
   └────────────────┬─────────────────────────┘
                    │
                    ▼
   ┌──────────────────────────────────────────┐
   │  CHAT-CTX-01 (depends on having more     │
   │  thoughts to justify the context bump —  │
   │  voice capture is a quality-of-signal    │
   │  upgrade. Could ship earlier; no hard    │
   │  blocker.)                               │
   └────────────────┬─────────────────────────┘
                    │
                    ▼
   ┌──────────────────────────────────────────┐
   │  QUIET-AUTO-01 (depends on Shortcut      │
   │  feasibility 30-min spike; otherwise     │
   │  trivial server-side)                    │
   └────────────────┬─────────────────────────┘
                    │
                    ▼
   ┌──────────────────────────────────────────┐
   │  HUD-CLARITY-01..N (mostly client-side;  │
   │  any server enum extensions ride along   │
   │  in a single migration)                  │
   └──────────────────────────────────────────┘
```

**Recommended phase ordering for the roadmapper:**

| Phase | Feature(s) | Dependency Rationale |
|-------|-----------|----------------------|
| **127 (spike)** | VOICE-01 | Spike-first gate per milestone anchor. Decides if VOICE-02..N commits, downscopes, or defers entire voice anchor. Other phases CAN start in parallel but should not commit irreversible UI/backend changes until 127 returns. |
| **128** | G2-LIFECYCLE-01 + SVCNOW-01 | Two independent surfaces, both client-only-ish, both small. Bundle for momentum while VOICE-01 spike runs in parallel. |
| **129** | VOICE-02..N | Locked by Phase 127 verdict. Likely 2-3 plans (G2 client buffering, vigil-core route, schema migration + tests). |
| **130** | INSIGHTS-FRESH-01 + CHAT-CTX-01 | Both touch the chat/insights/therapy surface. Ship together so PWA UAT covers freshness AND expanded context in one pass. |
| **131** | QUIET-AUTO-01 | Small phase; gated on iOS Shortcut feasibility spike (≤1 plan if Shortcut works, downscope to "manual Vigil PWA setting toggle from iPhone home screen" if it doesn't). |
| **132** | HUD-CLARITY-01..N | Closing polish. Operator dogfood feedback from v3.8 means these need hardware UAT; bundle as one phase with N plans by gap-severity. |

**Why this order:**
- Spike-first (operator-explicit requirement)
- Independent small wins parallelize while spike runs (G2-LIFECYCLE + SVCNOW are zero-blocker)
- Voice is the longest phase; sandwiches before the freshness/context cluster so chat-ctx can be UAT'd against voice-captured thoughts
- HUD-CLARITY needs hardware time; closes the milestone

---

## Architectural Patterns to Reuse

### Pattern A: Optimistic toggle + lastSavedRef rollback (verbatim Phase 115/116/125)

**When:** Any PWA UI mutation against a single-source-of-truth server column (quiet mode, sports/calendar selections).
**Where v3.9 reuses:** QUIET-AUTO source dropdown if added; any new Settings toggle.

```typescript
const lastSavedRef = useRef<boolean>(false)
function handleToggle() {
  const next = !value
  setValue(next)  // optimistic
  setTimeout(async () => {
    try {
      await putApi(next)
      lastSavedRef.current = next  // server-confirmed
    } catch {
      setValue(lastSavedRef.current)  // rollback
      showToast('Save failed')
    }
  }, 400)  // debounce
}
```

### Pattern B: Discriminated-union API response (Phase 115/116)

**When:** Endpoint has structured non-error states (e.g., `ok | needs_reauth | rate_limited`).
**Where v3.9 reuses:** `/v1/voice/transcribe` should return `{ status: 'ok', thought } | { status: 'audio_too_short' } | { status: 'transcription_empty' } | { status: 'ai_unavailable' }` rather than only HTTP-status-coded errors. PWA + G2 plugin caller branch on `.status`.

### Pattern C: Drift-detector tests via fs.readFileSync + regex (Phase 117/121/124)

**When:** Policy constants or load-bearing literals must not silently change.
**Where v3.9 reuses:**
- Pin `setMaxListeners(50)` if extended for voice connections
- Pin `MAX_AUDIO_B64_CHARS = ceil(10 * 1024 * 1024 * 4 / 3)` if voice route reuses it
- Pin migration file 0020 ADD COLUMN `IF NOT EXISTS` guard

### Pattern D: Hand-rolled SDK shim for G2 plugin (Phase 124)

**When:** Browser/SDK API is absent and a polyfill is more weight than custom code.
**Where v3.9 reuses:** Audio chunk accumulator + base64 encoder. Don't add a dep; ~50 LOC of `Uint8Array` concat + `btoa(String.fromCharCode(...))` handles it.

### Pattern E: Wallclock checkpoint deferral (Phase 123/124)

**When:** Operator must perform a real-world physical action (hardware test, soak, iOS device setup).
**Where v3.9 reuses:** VOICE-01 spike (G2 hardware test), QUIET-AUTO-01 (iOS Shortcut setup test), HUD-CLARITY (G2 hardware glanceability test). All three need `.planning/todos/pending/` runbooks at plan-close with operator-action checklists.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1 — New endpoint for /v1/work-orders/sync wrapper

**What people do:** Spin up `POST /v1/servicenow/capture` for the popup.
**Why wrong:** Duplicates an existing, proven, scoped, rate-limited endpoint. Two paths to the same data = two security audit surfaces.
**Do instead:** Browser extension calls existing `/v1/work-orders/sync` directly with single-element array. Manifest gains `service-now.com` content-script match, that's it.

### Anti-Pattern 2 — Persisting raw PCM in Postgres

**What people do:** Add `voice_audio bytea` column to capture every recording.
**Why wrong:** 30s of 16-bit 16kHz mono PCM = ~1 MB. 100 captures/day = 100 MB/day = 36 GB/year for one user. Zero recall value once transcribed.
**Do instead:** In-memory buffer for the request lifetime. Transcription is the durable artifact. Same as `process-audio.ts` today.

### Anti-Pattern 3 — Adding OpenAI Whisper without spike evidence

**What people do:** "Whisper is better at transcription, let's add it."
**Why wrong:** New vendor secret (`OPENAI_API_KEY` joins the sprawl problem documented in `project_secret_drift`), new monthly spend cap, new Railway env drift target. Existing Anthropic path works.
**Do instead:** Use Anthropic beta.files (already wired in `process-audio.ts`). Add Whisper ONLY if VOICE-01 spike returns "Anthropic latency > 8s on real clips and user-hostile."

### Anti-Pattern 4 — PWA Focus-detection via inference

**What people do:** Watch `document.visibilitychange` + `Notification.permission` + battery API and try to infer Focus state.
**Why wrong:** False-positive rate too high; will silently quiet the G2 HUD when user is just multitasking; breaks the trust contract.
**Do instead:** iOS Shortcut Focus-filter webhook → existing `/v1/quiet-mode` PUT. Direct signal, user-controlled.

### Anti-Pattern 5 — Bypassing the per-userId bus singleton

**What people do:** Spin up a new EventEmitter for cache invalidation events.
**Why wrong:** Phase 124 D-D2 isolation invariant ("Map key MUST always be c.get("userId")") is structural; a second bus creates a second isolation audit surface. Bug class: cross-user fan-out.
**Do instead:** Add a `CACHE_NAME = "cache"` channel to `agent-events-bus.ts`, mirroring `QUIET_NAME` Phase 125 pattern exactly. One bus, multiple channels.

### Anti-Pattern 6 — Removing the `contextLimit <= 50` cap silently

**What people do:** Delete the cap entirely in chat.ts:34-37.
**Why wrong:** Some user with 50,000 thoughts could request `contextLimit: 50000` and either OOM the Node process or burn through the entire $500/mo Anthropic cap in one chat.
**Do instead:** Raise cap to e.g. 500, AND add server-side budget check: estimate tokens (e.g. `content.length / 4`), abort with 400 if request would exceed N tokens (suggest 100K to leave room for response). Both safeguards.

---

## Integration Points — Summary Tables

### External Services

| Service | Integration Pattern | v3.9 Notes |
|---------|---------------------|------------|
| Anthropic Claude API (existing) | `vigil-core/src/ai/client.ts` — getAIClient(), callClaude(), beta.files.upload() | VOICE reuses beta.files path from process-audio.ts. CHAT-CTX reuses callClaudeConversation. No new wiring. |
| Cloudflare Turnstile (existing) | Phase 126 wide-release auth | No v3.9 change |
| Resend (existing) | Phase 111 email | No v3.9 change |
| ServiceNow Polaris (NEW — read-only DOM scrape) | Browser extension content-script regex on document.title; NOT shadow-DOM piercing | Per `project_work_order_source_pivot` 6-approach attempt — document.title is the safe surface |
| iOS Shortcuts app (NEW for QUIET-AUTO) | Operator-configured Focus-filter shortcut POSTs to /v1/quiet-mode | Spike feasibility against memory `project_ios_shortcut_blocked` first |

### Internal Module Boundaries

| Boundary | v3.9 Communication | Notes |
|----------|--------------------|-------|
| G2 plugin ↔ vigil-core | Existing bearer + hand-rolled SSE shim + REST | Voice adds POST /v1/voice/transcribe; G2-LIFECYCLE adds bridge.setLocalStorage (client-only). |
| PWA ↔ vigil-core | Existing JWT + REST + SSE | INSIGHTS-FRESH adds cache_invalidated SSE frame (optional); QUIET-AUTO no PWA changes unless source UI added |
| Browser extension ↔ vigil-core | Existing bearer + REST | SVCNOW: zero protocol change; manifest gains content_scripts entry + svcnow-popup.html sibling to popup.html |
| vigil-watch ↔ vigil-core | Existing POST /v1/agent-events + SSE | No v3.9 change unless HUD-CLARITY needs new event type emitted from watcher |

---

## Scaling Considerations (v3.9-specific deltas)

| Concern | At current scale (~5 users) | At 1K users | At 100K users |
|---------|------------------------------|-------------|---------------|
| Voice transcription | Anthropic beta.files in-line is fine (~5s/call, max 10 MB) | Move to queue + worker pattern; users get async toast | Dedicated transcription microservice; consider Whisper at scale for cost (Whisper $0.006/min vs Sonnet token cost ~$0.005-0.020 per 30s clip — Whisper wins at high volume) |
| ai_cache invalidation | DELETE on every thought is fine | Same — single-row delete on indexed (user_id, type) | Same; cache regen on next read |
| SSE bus | Map<userId, EventEmitter> per Railway instance | OK until > 1 Railway instance; then need Postgres LISTEN/NOTIFY substitute (already documented in agent-events-bus.ts:18-19) | LISTEN/NOTIFY or Redis pub/sub |
| Chat context | 500-thought cap with token-budget abort | Same | Server-side embedding-based retrieval (RAG) instead of recency window |
| ServiceNow popup | One captured row per submit — same as text capture | Same | Same — popup scales with operator hands, not user count |

**First v3.9 bottleneck (predicted):** Voice transcription latency if Anthropic round-trip exceeds expectations. Mitigation: VOICE-01 spike validates this before commit. If real, swap to OpenAI Whisper in VOICE-02 plan and accept the secret-sprawl cost.

---

## Sources

- Existing codebase (verified by direct Read, 2026-05-12):
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/db/schema.ts` (table shapes, columns)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/index.ts` (mount order, middleware chain)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/routes/thoughts.ts` (create path + triage hook)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/routes/process-audio.ts` (existing audio transcription primitive)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/routes/chat.ts` (contextLimit cap site)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/routes/insights.ts` (cache write path)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/routes/quiet-mode.ts` (PUT pattern + bus.emitQuiet)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/routes/work-orders.ts` (sync endpoint shape)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core/src/lib/agent-events-bus.ts` (bus singleton)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-g2-plugin/src/screens/companion.ts` (HUD layout)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-g2-plugin/app.json` (min_sdk_version 0.0.8)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` (audioControl, audioEvent, setLocalStorage/getLocalStorage signatures)
  - `/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-extension/manifest.json` + `popup.js` (browser extension shape)
- Project memory:
  - `feedback_railway_variables_leak.md` (never log bearer)
  - `project_secret_drift.md` (avoid new vendor secrets)
  - `project_work_order_source_pivot.md` (Polaris scrape blocked; document.title is safe)
  - `project_cross_platform_vision.md` (no Mac-specific dependency for cross-platform features)
  - `project_ios_shortcut_blocked.md` (Shortcuts.app bug class — re-validate for Focus filters)
- Web research (transcription provider comparison):
  - [OpenAI Whisper API Pricing 2026](https://diyai.io/ai-tools/speech-to-text/openai-whisper-api-pricing-2026/) — $0.006/min
  - [GPT-4o Mini Transcribe Pricing](https://developers.openai.com/api/docs/pricing) — $0.003/min
  - [OpenAI Realtime Whisper](https://developers.openai.com/api/docs/models/gpt-realtime-whisper) — streaming, $0.017/min
  - [Anthropic Files API 500MB / 100GB storage](https://platform.claude.com/docs/en/api/overview)
- v3.8 closeout: `.planning/PROJECT.md` Key Decisions table (especially Phase 124 hand-rolled SSE shim, Phase 126 wide-release auth)

---

*Architecture research for: Vigil v3.9 Voice & Companion Polish*
*Researched: 2026-05-12*
*Confidence: HIGH (existing platform verified by direct source read; new flows designed against verbatim existing patterns; transcription provider decision is conditional on VOICE-01 spike outcome and the bias toward "stay-with-Anthropic" is explicit + reversible)*
