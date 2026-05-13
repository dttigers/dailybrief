# Stack Research — v3.9 Voice & Companion Polish

**Domain:** Multi-client ambient AI assistant (Vigil) — voice capture + browser-extension assisted capture + cache invalidation + chat context expansion + iPhone Focus auto-detect
**Researched:** 2026-05-11
**Confidence:** HIGH for verified items (Even SDK 0.0.9 API surface, transcription pricing, iOS WebKit limits, ai_cache schema, Anthropic Files API surface). MEDIUM for VOICE-01 spike outcome (depends on empirical PCM chunk size / latency from Even host — verifiable only on hardware).

> **Headline:** The v3.9 stack adds **zero new server libs** for 5 of 7 features (INSIGHTS-FRESH-01, CHAT-CTX-01, G2-LIFECYCLE-01, QUIET-AUTO-01, HUD-CLARITY-01..N — all reuse existing Drizzle/Hono/Even-SDK/React surfaces). It adds **one new server dep family** (an OpenAI transcription client + a multipart body parser) only if VOICE-01 spike clears — and the spike scope is concrete enough to execute in 1-2 days. ServiceNow capture rides existing extension stack with **zero new deps** (vanilla JS popup pattern already shipped in v3.6 EXT-02).

---

## Per-Feature Stack Additions (TL;DR)

| Feature | New Deps? | Re-uses |
|---------|-----------|---------|
| **VOICE-01** (G2 PCM spike) | **NONE** (spike) | `@evenrealities/even_hub_sdk@^0.0.9` already installed — only `audioControl(true/false)` + `onEvenHubEvent` (already wired in `main.ts`) |
| **VOICE-02..N** (full pipeline) | **`openai@^4.x`** (server only) — gpt-4o-mini-transcribe at $0.003/min | Existing Hono multipart parsing; existing `posthog-node` for events |
| **SVCNOW-01** | **NONE** | Existing `vigil-extension/` vanilla-JS pattern (popup.html/popup.js/popup.css, 205 LOC reference); existing `POST /v1/work-orders/sync` route (already shipped, scoped by userId) |
| **G2-LIFECYCLE-01** | **NONE** | `bridge.setLocalStorage(key, value)` / `bridge.getLocalStorage(key)` already in SDK 0.0.9 — wire into existing `navigation.ts` |
| **INSIGHTS-FRESH-01** | **NONE** | Existing Drizzle 0.45.2 + `aiCache` table; one `db.delete(aiCache).where(...)` call in `thoughts.post()` after insert |
| **CHAT-CTX-01** | **NONE** | Existing `thoughtsTable` with tsvector FTS (already shipped — `tsvector` column from migration); two-pass retrieval (recency + FTS keyword extract from user message) |
| **QUIET-AUTO-01** | **NONE** | Pure heuristic — Page Visibility API + Notification.permission + Web Push silence detection. **NO iOS API exposes Focus/DND directly** (verified) |
| **HUD-CLARITY-01..N** | **NONE** | Existing G2 plugin `screens/companion.ts` + `applyAgentEvent` reducer |

---

## Detailed Per-Feature Stack

### 1. VOICE-01..N — G2 PCM Voice Capture

#### 1a. SDK API surface — verified against installed `@evenrealities/even_hub_sdk@0.0.9`

**Source:** `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts:1187` + `README.md` §"Audio Control and Event"

```typescript
// Already imported via existing 'EvenAppBridge' usage in main.ts:26
audioControl(isOpen: boolean): Promise<boolean>;

// PCM arrives as AudioEventPayload:
type AudioEventPayload = { audioPcm: Uint8Array };

bridge.onEvenHubEvent((event) => {
  if (event.audioEvent) {
    const pcm = event.audioEvent.audioPcm; // Uint8Array
    // ...
  }
});
```

**Confirmed audio format** (HIGH confidence — independent third-party verification via zenn.dev's SDK feature-verification corpus):

| Parameter | Value |
|-----------|-------|
| Format | PCM |
| Sample rate | 16 kHz (16000 Hz) |
| Channels | Mono |
| Bit depth | 16-bit |
| Frame size | 2 bytes (16-bit mono) |
| Bytes/sec | 32,000 |
| Bytes/min | ~1.92 MB |

**Permission requirement:** Add `"g2-microphone"` to `vigil-g2-plugin/app.json` permissions array. **Without this declaration `audioControl(true)` will reject.** This is a structural gate — verify in spike step 1.

**Prerequisite:** SDK README §`audioControl`: *"You must call `createStartUpPageContainer` successfully before opening or closing the microphone."* — already satisfied in `main.ts:215`. No reordering needed.

#### 1b. UNKNOWNS to resolve in VOICE-01 spike (1-2 day scope)

These are what the spike empirically resolves — they CANNOT be answered from training data because the SDK README does NOT specify them:

| Unknown | Why it matters | How spike resolves |
|---------|---------------|---------------------|
| **Chunk size per `audioEvent`** | Drives buffering strategy (every-chunk POST vs accumulator-and-flush) | Spike step 3: log `pcm.length` per event for 30s test recording — derive bytes/event and events/sec |
| **Latency (mic-on → first chunk)** | Defines UX (push-to-record vs continuous) | Spike step 4: `console.time` from `audioControl(true)` to first `audioEvent` |
| **Latency (chunk → next chunk)** | Defines real-time vs accumulate-and-send | Spike step 5: log timestamp deltas between consecutive `audioEvent`s |
| **Bluetooth dropouts during stream** | Failure mode (resume? buffer? drop?) | Spike step 6: walk out of BLE range during recording, observe event behavior |
| **`audioControl(true)` rejection modes** | Error UX needed for permission / no-mic / device-disconnected | Spike step 7: test with `g2-microphone` permission ABSENT; with G2 disconnected; observe Promise<false> vs throw vs hang |
| **iPhone backgrounding behavior** | Does mic capture continue when iPhone app backgrounds? | Spike step 8: foreground+record; tap home; resume; observe gaps |
| **Can `audioControl(false)` lose tail bytes?** | Drives close-record UX (auto-stop vs explicit "saving…" state) | Spike step 9: read 1-2 seconds of audio; toggle off; compare to known utterance |

**Spike concrete deliverables** (1-2 day budget):

1. **`vigil-g2-plugin/scripts/voice-spike.html`** — standalone debug page with: "Record 30s" button → `audioControl(true)` → accumulate Uint8Array into chunks → display `pcm.length` per event in 3-line HUD → log all timings to `console`
2. **30s sample recording** transferred off-device via:
   - Option A: base64 in console log → copy/paste to vigil-core endpoint (fastest)
   - Option B: chunk POST to NEW endpoint `POST /v1/spike/audio-chunks` (validates upload path)
3. **`spike-VERIFICATION.md`** with all 9 unknowns answered, latency-distribution histogram, sample WAV reconstructed from PCM (PCM 16-bit LE → WAV header is trivial)
4. **Branch decision** captured in `spike-DECISION.md`:
   - PASS → proceed to VOICE-02 full pipeline as specced
   - DEGRADE → push-to-record short clips only (<30s); drop continuous capture from milestone
   - BLOCK → SDK audio is unusable; defer voice anchor to next milestone; expand polish scope

#### 1c. Transcription pipeline — only if VOICE-01 spike PASSES

**The Claude API does NOT accept audio input.** Verified against `https://platform.claude.com/docs/en/docs/build-with-claude/files` — Files API supports `application/pdf`, `text/plain`, `image/jpeg|png|gif|webp` only. No `audio/*` MIME types listed. Anthropic's own [cookbook](https://platform.claude.com/cookbook/third-party-deepgram-prerecorded-audio) explicitly uses Deepgram for transcription.

**Recommended:** `openai@^4.x` SDK + `gpt-4o-mini-transcribe` model.

| Provider | Model | Price/min | Latency (first byte) | Why pick |
|----------|-------|-----------|---------------------|----------|
| **OpenAI (RECOMMENDED)** | `gpt-4o-mini-transcribe` | **$0.003** | 500-1500ms | Cheapest pay-per-min in tier, accepts standard WAV/MP3 multipart upload, no streaming complexity, OpenAI account already exists alongside Anthropic |
| OpenAI | `whisper-1` | $0.006 | 2.1s median | Legacy; supports word-level timestamps if needed; same 25MB limit |
| OpenAI | `gpt-4o-transcribe` | $0.006 | 500-1500ms | Higher accuracy (4.1% WER vs Whisper 5.3%) — overkill for ADHD-thought capture where occasional misrecognition is fine |
| Deepgram | nova-3 | $0.0043 | <500ms | Lower latency; second account to maintain; rejected unless Whisper latency proves blocking on real iPhone-tethered G2 traffic |

**Cost math:** At 5min of voice capture/day × 30 days = 150 min/mo × $0.003 = **$0.45/user/mo**. Within Anthropic's existing $500/mo cap budget envelope (Anthropic cap is for Claude only — OpenAI is separate spend gated by the same operator-set cap pattern).

**Integration into existing stack:**

```typescript
// vigil-core/src/ai/transcribe.ts (NEW, ~80 LOC)
import OpenAI from 'openai';

let client: OpenAI | null = null;
export function getTranscribeClient(): OpenAI | null {
  if (!client && process.env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function transcribeWav(wavBuffer: Buffer): Promise<string> {
  const c = getTranscribeClient();
  if (!c) throw new Error('OPENAI_API_KEY not configured');
  // OpenAI SDK accepts Node-friendly File via toFile() helper or fs.ReadStream
  const file = new File([wavBuffer], 'voice.wav', { type: 'audio/wav' });
  const res = await c.audio.transcriptions.create({
    file,
    model: 'gpt-4o-mini-transcribe',
  });
  return res.text;
}
```

**Endpoint shape:**

```typescript
// vigil-core/src/routes/voice.ts (NEW)
voice.post("/voice/transcribe", async (c) => {
  const userId = c.get("userId");
  // Hono parses multipart natively — c.req.parseBody() returns FormData-like
  const body = await c.req.parseBody();
  const file = body.audio as File;
  if (!file || file.size > 25 * 1024 * 1024) {
    return c.json({ error: "audio file required, ≤25MB" }, 400);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const text = await transcribeWav(buf);
  // Pipe through existing thought-create flow — fire-and-forget triage as usual
  const [row] = await db.insert(thoughtsTable).values({
    userId, content: text, category: null, /* triage runs async */
  }).returning();
  trackEvent(userId, "voice_captured", {
    bytes: buf.length, transcript_chars: text.length, model: "gpt-4o-mini-transcribe",
  });
  return c.json({ id: row.id, content: text });
});
```

**Why not server-side decode + SFSpeechRecognizer pass-through?** The Mac is no longer the canonical platform for voice — capture originates on iPhone-tethered G2. Routing audio through a Mac for SFSpeech would require always-on Mac + tunnel + 200-500ms round-trip per chunk. Server-side hosted transcription is the only architecture that scales to all clients (PWA voice capture, iOS Shortcuts when unblocked, etc.).

**WAV container construction** (G2 yields raw PCM; OpenAI expects a container):

Vanilla approach (~30 LOC, zero deps): hand-roll 44-byte WAV header with format=1 (PCM), channels=1, rate=16000, bits=16. Pattern is well-trodden — example in any "PCM to WAV" search. Avoid `wavefile` npm dep unless format complexity grows.

---

### 2. SVCNOW-01 — ServiceNow Assisted-Capture Popup

#### 2a. Ranking of the 5 PDF recommendations against current Vigil stack

| # | Approach | PDF priority | Vigil-fit | Ranking rationale |
|---|----------|--------------|-----------|-------------------|
| **1** | **Assisted Capture Popup** | High | **PERFECT** | Extension already shipped (Phase 114 EXT-02 v3.6) with vanilla JS popup pattern. CS# parse already working. Adding 2 text inputs + a 4-button priority chooser is **<50 LOC delta** to `popup.html` + `popup.js`. Ships in **one Phase**. Zero IT dependency. **RECOMMEND.** |
| **2** | Negotiate Read-Only API Token | High | Parallel non-eng track | Operator action item (draft IT request + attach PDF). Has been blocked >6 weeks. **NOT in v3.9 engineering scope.** SEED a `.planning/todos/` for the operator draft, but no code work. |
| **3** | GraphQL Internal API (Advanced) | Medium | **REJECT for v3.9** | Three failure modes: (a) reverse-engineering a moving target (ServiceNow Polaris ships frequent UI changes — D-04 from PDF: "by design"), (b) Polaris GraphQL queries observed in v3.6 attempt returned only chat/UI data not case fields (PDF approach #5 "Blocked"), (c) violates company's "no API access" decision implicitly even if technically authenticated. **Defer indefinitely.** |
| **4** | Email Forwarding via Power Automate | Medium | Parallel non-eng track | Restores IMAP path — but per `project_work_order_source_pivot` memory, IT is **actively blocking Gmail forwarding + IMAP**. Power Automate flow runs inside the same M365 tenant that's enforcing the block. **High likelihood IT closes this path the day it's used.** Worth a 30min operator probe ("can I send myself an autoforward in Outlook?") but NOT engineering scope. |
| **5** | Bookmarklet | Low | **REJECT** | Strictly worse than #1: same typed-input UX but loses the extension's stored API-key, CS# auto-fill from page title, and 800ms triage poll plumbing. No advantage. |

**Selected approach:** #1 (Assisted Capture Popup) — ranked #1 in PDF and #1 by Vigil-fit by independent reasoning.

#### 2b. Stack additions for SVCNOW-01

**ZERO new dependencies.** The shipped extension already has:

- `vigil-extension/manifest.json` — MV3, `activeTab` + `storage` permissions, `host_permissions: ["https://api.vigilhub.io/*"]`
- `vigil-extension/popup.html` — vanilla form with `<textarea>` + 1 checkbox + 2 buttons (205 LOC `popup.js` total, no framework)
- `vigil-safari-extension/Vigil Capture Extension/Resources/popup.{html,js,css}` — verbatim port maintained in lockstep (Phase 114 D-02)
- `vigil-core/src/routes/work-orders.ts:11` — `POST /v1/work-orders/sync` already accepts `{workOrders: Array}` with caseNumber, scoped by userId (T-114-W-01 isolation locked v3.6 Phase 108)

**Implementation delta** (estimated <2 hour Phase scope):

```html
<!-- popup.html new fields, only render when content.location matches afs.service-now.com/* -->
<div id="servicenow-view" class="view" hidden>
  <div class="header">
    <h1>Vigil — ServiceNow Capture</h1>
    <button id="settings-btn" class="btn-icon">⚙</button>
  </div>
  <p class="case-number">Case: <strong id="case-number-display">—</strong></p>
  <div class="form-group">
    <label for="sn-desc">Short description</label>
    <input type="text" id="sn-desc" maxlength="200" autofocus>
  </div>
  <div class="form-group">
    <label for="sn-priority">Priority</label>
    <select id="sn-priority">
      <option value="1">1 — Critical</option>
      <option value="2">2 — High</option>
      <option value="3" selected>3 — Moderate</option>
      <option value="4">4 — Low</option>
    </select>
  </div>
  <button id="sn-capture-btn" class="btn btn-primary">Send to Vigil</button>
  <!-- existing error/success blocks reused -->
</div>
```

```javascript
// popup.js URL-conditional view dispatch + new sn-capture flow (~60 LOC delta)
const SN_HOST = 'afs.service-now.com';
const SN_TITLE_REGEX = /^(CS\d{6,})\s*\|/;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  return tab;
}

async function pickInitialView(tab) {
  if (tab?.url && new URL(tab.url).hostname === SN_HOST) {
    const m = tab.title?.match(SN_TITLE_REGEX);
    if (m) { /* show servicenowView, populate case-number-display with m[1] */ return; }
  }
  // fall through to existing capture-view
}

snCaptureBtn.addEventListener('click', async () => {
  const caseNumber = document.getElementById('case-number-display').textContent;
  const description = document.getElementById('sn-desc').value.trim();
  const priority = parseInt(document.getElementById('sn-priority').value, 10);
  const apiKey = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  const res = await fetch(`${API_BASE}/v1/work-orders/sync`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({workOrders: [{caseNumber, description, priority, source: 'extension-snow'}]}),
  });
  // existing success/error UX
});
```

**Server-side delta:** The existing `POST /v1/work-orders/sync` route already accepts an array of `{caseNumber, ...}`. If `description` and `priority` fields aren't already columns on `work_orders`, that's a one-migration add — but per `vigil-core/src/db/schema.ts` they likely already exist (work orders had `notes`/`priority` columns added earlier; verify in implementation, don't pre-emptively migrate from research).

**Browser scope:** Same lockstep duplicate to `vigil-safari-extension/Vigil Capture Extension/Resources/popup.{html,js}` per Phase 114 D-02 invariant.

---

### 3. G2-LIFECYCLE-01 — Last-Viewed Screen Restore

**Verified API surface** (SDK 0.0.9 README):

```typescript
bridge.setLocalStorage(key: string, value: string): Promise<boolean>;
bridge.getLocalStorage(key: string): Promise<string>; // empty string if not found
```

Per SDK README §"Local Storage": *"data persistence on the App side"* — i.e. survives WebView destroy + plugin re-launch + iPhone app force-quit. This is **App-side persistence**, NOT `window.localStorage` which gets wiped on WebView teardown.

**Zero new deps.** Wire into existing `navigation.ts`:

```typescript
// navigation.ts — new sentinel constants
const LAST_SCREEN_KEY = 'vigil:lastScreen';

export async function persistCurrentScreen(bridge: EvenAppBridge): Promise<void> {
  const screen = getCurrentScreen();
  if (screen) await bridge.setLocalStorage(LAST_SCREEN_KEY, screen);
}

export async function restoreLastScreen(bridge: EvenAppBridge): Promise<ScreenName | null> {
  const raw = await bridge.getLocalStorage(LAST_SCREEN_KEY);
  if (!raw || !Object.values(Screen).includes(raw as ScreenName)) return null;
  return raw as ScreenName;
}
```

**Integration site:** `main.ts:213` `pickInitialScreen()` — add a third clause that prefers `restoreLastScreen()` over the default-to-Home branch, but only when `launchSource === 'appMenu'` (preserves Phase 124 D-06 "glassesMenu + active session → Companion" precedence). Persist on every successful `rebuildPageContainer` from `handleNavEvent`.

**Validation defense:** SDK guarantees string return type (empty string on miss). Coerce + validate against `Screen` enum members on read; treat unknown values as "no restore" (defense against future SDK changes that might inject other key types).

---

### 4. INSIGHTS-FRESH-01 — Cache Invalidation on Thought Insert

**Confirmed `ai_cache` schema** (`vigil-core/src/db/schema.ts:324-341`):

```typescript
// Composite unique index uq_ai_cache_user_type(user_id, type)
// type is text (not enum) — current values: 'insights' | 'patterns' | 'prep'
```

**Drizzle 0.45.2 supports partial invalidation natively** — no new lib needed. The existing schema already enforces `(userId, type)` uniqueness, so DELETE-by-type-set is structurally safe:

```typescript
// In vigil-core/src/routes/thoughts.ts (post-insert, after trackEvent on line ~325):
import { aiCache } from "../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";

const INVALIDATE_TYPES = ['insights', 'patterns', 'prep'] as const;

// After successful thought insert:
await db.delete(aiCache).where(
  and(
    eq(aiCache.userId, userId),
    inArray(aiCache.type, [...INVALIDATE_TYPES]),
  )
);
```

**Why not Drizzle's built-in `$cache.invalidate()`?** Drizzle's cache layer is opt-in via `drizzle(...)({cache: ...})` and Vigil-core does NOT use it (verified — `db/connection.ts` uses plain `drizzle({client: postgres(...)})` with no cache config). The "cache" being invalidated here is the application-level `ai_cache` *table*, not Drizzle's query cache. Naming collision only.

**Placement consideration:** Run AFTER `db.insert(thoughtsTable)` returns successfully but BEFORE the fire-and-forget triage async block (line ~333). This way: (a) failed inserts don't burn cache, (b) cache invalidation isn't blocked on triage, (c) regenerate-on-next-read is the user-visible signal (no preemptive regeneration — that would race the triage write).

**Anti-pattern explicitly rejected:** UPDATE `ai_cache` with `generatedAt = null`. Drizzle would still satisfy the unique constraint and the route handlers branch on row presence not timestamp. DELETE is the only correct operation.

**Threat model note:** The invalidation must be scoped by `userId` (D-22 cross-user isolation from Phase 121 AGENT-API-01). Single-column `inArray(aiCache.type, ...)` WHERE without `eq(aiCache.userId, ...)` would wipe ALL users' caches on every thought insert — explicit `and(eq(userId), inArray(type))` is load-bearing.

---

### 5. CHAT-CTX-01 — Lift the 20-Thought Cap

**Current code** (`vigil-core/src/routes/chat.ts:23,32-36`):

```typescript
let contextLimit = 20;                                    // line 23
if (typeof body?.contextLimit === "number" &&             // lines 32-36
    body.contextLimit >= 1 && body.contextLimit <= 50) {
  contextLimit = body.contextLimit;
}
```

Current behavior: client-tunable 1-50; default 20; ORDER BY `createdAt DESC` LIMIT — pure recency window.

**Strategy ranking** (the user's actual question: "what was I thinking about last month?"):

| Strategy | Cost | Implementation | Verdict |
|----------|------|---------------|---------|
| **A. Two-pass: recency (20) + FTS-on-user-message (10)** | **RECOMMENDED** | ~30 LOC delta in `chat.ts`; uses existing `tsvector` column already on `thoughts` table | **HIGH confidence fit** — solves "last month" with prefilter, preserves recency baseline, no embedding store, no new deps |
| B. Time-window expansion via `contextLimit` cap raise to 100/200 | Cheapest | One line change (cap 50 → 200) | Doesn't solve "last month" — pure recency still surfaces only this-week thoughts unless 200 covers full backlog. **Brute force.** |
| C. Semantic retrieval via OpenAI embeddings + pgvector | High | New `pgvector` extension migration, new `embeddings` table backfill, OpenAI embed API call per thought + per query | **OVERKILL for current scale.** Total Vigil thought corpus is ~607 (`STATE.md`). FTS handles this fully; embeddings buy you nothing on <10k rows. Reconsider at 50k rows. |
| D. Claude-side summarization of older thoughts | Cheap | Pre-compute weekly summaries; inject summary + recent raw | Adds 7+ Claude calls/week for summary maintenance, indirection in chat context, harder to debug. |

**Recommended: Strategy A — keyword-extracted FTS prefilter + recency tail.**

Implementation sketch (no new deps):

```typescript
// chat.ts — replace lines 66-77 with:
const lastUserMessage = messages[messages.length - 1].content;

// FTS query: PG tsvector-tsquery match. Existing schema has a tsvector column
// on thoughts (from v2.1 PostgreSQL migration; verify column name — likely
// `content_tsv` or named via migration 0001).
// Use plainto_tsquery to avoid hand-crafting tsquery syntax from user input.
const ftsResults = db && lastUserMessage.length > 8
  ? await db.execute(sql`
      SELECT content, category, created_at, task_status
      FROM thoughts
      WHERE user_id = ${userId}
        AND sync_status != 'deleted'
        AND content_tsv @@ plainto_tsquery('english', ${lastUserMessage})
      ORDER BY ts_rank(content_tsv, plainto_tsquery('english', ${lastUserMessage})) DESC,
               created_at DESC
      LIMIT 10
    `)
  : [];

const recentThoughts = await db.select(...).from(thoughtsTable)
  .where(...)
  .orderBy(desc(thoughtsTable.createdAt))
  .limit(contextLimit);  // existing 20

// Merge by id, dedupe, keep recent on top (chronological matters more than rank for context)
const merged = dedupeById([...ftsResults, ...recentThoughts]);
contextUsed = merged.length;
```

**Verify in implementation phase:** column name for tsvector. The schema in `db/schema.ts` line 1-280 will show it; if no tsvector column exists, fall back to Strategy B (raise cap to 100, ship, revisit). Don't add the tsvector migration as part of CHAT-CTX-01 — that's its own threat surface.

**Token budget defense:** With 20 recent + 10 FTS hits = 30 thoughts × ~150 chars avg = ~4,500 chars ≈ 1,500 tokens of context. Well within Claude's 200k input window. No truncation logic needed.

**Cap raise:** Also raise `contextLimit` validation cap from 50 to 100 in the same phase — `body.contextLimit <= 50` becomes `<= 100`. The Phase 117 drift-detector convention (`fs.readFileSync + regex`) applies if this cap is policy-locked; otherwise inline is fine.

---

### 6. QUIET-AUTO-01 — iPhone Focus/DND Auto-Detect

**Verified hard limit:** Apple exposes NO web API for detecting Focus mode or Do Not Disturb. This is a privacy-by-design decision and has not changed as of May 2026. Sources:

- MDN Notification API: only `Notification.permission` is queryable; no "delivery suppressed by user" state
- Apple Developer Forums (2024-2025): repeated negative answers to "can I detect DND from Safari/WKWebView"
- WebKit changelog: no `prefers-reduced-notifications` or similar media query exists

**Implication:** Direct detection is impossible. Auto-Quiet must be inferred from **proxy signals** that correlate with "user doesn't want noise."

**Proxy signal hierarchy** (LOW confidence on cross-device reliability — pick conservatively):

| Signal | API | Reliability | Use in v3.9 |
|--------|-----|-------------|-------------|
| **Time-of-day window** (e.g. 22:00-07:00 in user's timezone) | `getUserTimezone()` already in vigil-core | HIGH (deterministic) | **YES — primary signal** |
| **Page Visibility hidden ≥ N minutes** | `document.visibilityState` | MEDIUM (sleeping vs in-meeting indistinguishable) | YES — secondary |
| **`Notification.permission === 'denied'`** | Standard | HIGH | Counter-signal — if user denied notifications, they want quiet always |
| **`prefers-reduced-motion`** | media query | LOW (motion ≠ DND) | NO — false correlation |
| **Browser idle (Idle Detection API)** | `IdleDetector.requestPermission()` | LOW on Safari (Chromium-only as of 2026) | NO — Safari support is null |
| **Battery low** | Battery API | DEPRECATED on Safari | NO |
| **Native iOS Focus** | None | N/A | NO — verified impossible |

**Recommended approach (Strategy A — time-window with manual override):**

```typescript
// vigil-pwa/src/lib/quiet-mode-auto.ts (NEW, ~40 LOC, zero deps)
type QuietWindow = { start: string; end: string }; // "HH:MM" 24h, in user TZ

export function isInQuietWindow(now: Date, tz: string, win: QuietWindow): boolean {
  // Use Intl.DateTimeFormat to project `now` into user's TZ as HH:MM
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const hhmm = fmt.format(now).replace(/[^\d]/g, '').slice(0, 4);
  const cur = parseInt(hhmm, 10);
  const s = parseInt(win.start.replace(':', ''), 10);
  const e = parseInt(win.end.replace(':', ''), 10);
  // Handle wrap-around (e.g. 22:00 → 07:00)
  return s <= e ? (cur >= s && cur < e) : (cur >= s || cur < e);
}
```

**Wire-up:** Add `quiet_window_start`, `quiet_window_end` columns to `users` (or piggyback `app_settings` JSON blob to avoid migration). On `agent-stream` connect, server checks current time vs user's quiet window AND existing manual `quiet_mode` boolean — emit `quiet_mode_changed: enabled=true` if EITHER is true. Manual override (the existing toggle) wins when in conflict (user said quiet at 14:00 → respect, even though it's not in their 22-07 window).

**UI add:** Below the existing manual Quiet-Mode toggle in `SettingsPage.tsx`, two `<input type="time">` fields for window start/end + label "Or auto-quiet during these hours". Time inputs work in Safari iOS 14+ (verified).

**Decision deferred to roadmap:** Whether to also add Page-Visibility-based "iPhone screen off ≥10min" suppression. This is a SECOND phase (HUD-CLARITY-04 candidate) — needs UAT to confirm the correlation isn't noisy in practice. Don't blend the two heuristics into one phase.

---

### 7. HUD-CLARITY-01..N — Companion HUD copy/state clarity

**No new deps.** Pure copy/render-logic delta in `vigil-g2-plugin/src/screens/companion.ts`. Stack additions are zero — listing here only for completeness:

- Existing `applyAgentEvent` reducer in `companion.ts` handles heartbeat / task_complete / needs_input / task_failed / milestone
- Existing 3-line HUD render via `rebuildPageContainer` with `TextContainerProperty`
- HUD-CLARITY-01..N will likely add: a "since" timestamp glyph, a state-staleness indicator (e.g. "⌛ 2h since last heartbeat"), and explicit "DONE — tap to dismiss" vs "RUNNING — last activity 30s ago" copy distinction

Specific copy choices belong in the roadmap's UI-SPEC, not the stack research.

---

## Recommended Stack Additions Summary

### Core Technologies (NEW)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `openai` (npm) | **^4.79.0** (latest stable as of May 2026) | OpenAI SDK for `gpt-4o-mini-transcribe` calls | Official SDK, Node/TS first-class, multipart upload helper, conditional on VOICE-01 spike PASS |

### Supporting Libraries (NEW)

None. Every other v3.9 feature reuses existing stack.

### Re-Used Stack (existing, verified versions in package.json)

| Library | Version | Used by |
|---------|---------|---------|
| `@evenrealities/even_hub_sdk` | ^0.0.9 (already 0.0.9 minimum after Phase 125) | VOICE-01..N, G2-LIFECYCLE-01, HUD-CLARITY |
| `@anthropic-ai/sdk` | ^0.88.0 | CHAT-CTX-01 (existing chat route) |
| `drizzle-orm` | ^0.45.2 | INSIGHTS-FRESH-01, CHAT-CTX-01 |
| `hono` | ^4.7.0 | VOICE-02 multipart upload, SVCNOW-01 work-orders/sync |
| `@sentry/node` / `@sentry/react` | ^10.52.0 | Error capture across all v3.9 |
| `posthog-node` / `posthog-js` | ^5.29.2 / ^1.369.3 | `voice_captured`, `quiet_auto_applied`, `chat_ctx_expanded` events |
| `react` / `react-router` | ^19.2.5 / ^7.14.0 | SettingsPage Focus-window inputs |
| Chrome MV3 vanilla JS extension shell | (existing) | SVCNOW-01 |

### Development Tools (NEW)

None. Existing `tsx`, `vitest`, `vite`, `drizzle-kit` cover all needs.

---

## Installation

```bash
# vigil-core — conditional on VOICE-01 spike PASS
cd vigil-core
npm install openai

# All other v3.9 features: zero install commands
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| OpenAI `gpt-4o-mini-transcribe` ($0.003/min) | OpenAI `whisper-1` ($0.006/min) | If word-level timestamps are needed for future "scrub-to-edit transcript" UX |
| OpenAI `gpt-4o-mini-transcribe` | Deepgram nova-3 ($0.0043/min, <500ms latency) | Only if Whisper latency proves blocking on real iPhone→server traffic — defer to UAT |
| FTS prefilter (Strategy A) for chat context | pgvector + embeddings (Strategy C) | Reconsider when thought corpus exceeds 50k rows (currently ~607) |
| Assisted-popup for ServiceNow | GraphQL session-cookie replay | When Polaris stops shipping UI changes weekly (i.e. never, per platform release cadence) |
| Time-window quiet (Strategy A) | iOS native Focus detect via WKWebView extension | When Apple ships a web API (not announced as of May 2026) |
| Existing `bridge.setLocalStorage` | window.localStorage | NEVER — window.localStorage in G2 WebView gets wiped on plugin teardown; SDK localStorage is App-side and persists |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Anthropic Claude API for audio transcription | **Verified unsupported** — Files API rejects audio MIME types (only PDF/text/image/webp). Native dictation only in claude.ai UI surface, not API | OpenAI `gpt-4o-mini-transcribe` |
| `wavefile` npm package for WAV header construction | Adds dep for what is ~30 LOC of hand-rolled little-endian byte writes; PCM-to-WAV is a solved 44-byte header | Hand-rolled `buildWavHeader(pcm, sampleRate, channels, bits)` helper |
| `multer` / `formidable` for multipart parsing in Hono | Hono provides `c.req.parseBody()` natively for `multipart/form-data` | Native Hono parser |
| `pgvector` + embeddings for CHAT-CTX-01 at current scale | Adds extension, migration, embedding generation cost, embedding upkeep — overkill for <10k thoughts | Strategy A: PG FTS + recency two-pass |
| React in browser extension popup | Existing extension is 205 LOC vanilla JS with maintained Safari lockstep; React adds bundle, build complexity, and a Safari ↔ Chrome divergence vector | Vanilla JS — match Phase 114 EXT-02 pattern verbatim |
| Drizzle `$cache.invalidate()` for `ai_cache` | Wrong layer — Drizzle's cache is a query-layer cache that vigil-core doesn't even configure. `ai_cache` is an application table | `db.delete(aiCache).where(eq(userId)..., inArray(type, [...]))` |
| Trying to detect iOS Focus / DND directly | **Verified impossible** — Apple does not expose Focus/DND to web APIs and shows no signal of doing so | Time-window proxy + manual override |
| Polaris GraphQL replay | Reverse-engineering a moving target; PDF approach #5 already failed once (chat/UI data returned, not case fields); high re-engineering cost per Polaris release | Assisted-popup (PDF approach #1) |
| `window.localStorage` for G2 LIFECYCLE-01 | Wiped on WebView teardown; defeats the whole feature | `bridge.setLocalStorage` (App-side persistent) |
| `Notification.requestPermission()` as a Focus signal | Returns user-granted-or-denied for *future* notifications; says nothing about *current* DND state | Time-window heuristic |

---

## Stack Patterns by Variant

**If VOICE-01 spike PASSES (clean PCM, latency <3s mic-on-to-first-chunk, no dropouts >5s):**
- Use `openai@^4.79.0` + `gpt-4o-mini-transcribe`
- Continuous capture pattern: accumulate chunks in plugin → on `audioControl(false)` → POST WAV → transcribe → insert thought
- Spike sample size = 30s recording (enough to characterize without ballooning into "is this a good UX" question)

**If VOICE-01 spike DEGRADES (latency 3-8s OR dropouts 5-15s OR chunk variance >2x):**
- Same SDK, but push-to-record only (<30s clips)
- Add an explicit "Recording…" UI affordance on G2 HUD (a third line: "[REC] 0:08") — reuses existing `rebuildPageContainer` text container
- Defer continuous-listen architecture to a follow-on milestone

**If VOICE-01 spike BLOCKS (`audioControl` returns false / hangs / chunks unusable):**
- Cancel VOICE-02..N from v3.9 entirely
- Reallocate phase budget to expand SEED-016 HUD clarity scope OR pull G2-POLISH-09 from the deferred set if any candidates exist
- Log structured findings → SEED-010-followup with three explicit re-activation conditions (mirror SEED-003 DMARC pattern)

**If thought corpus crosses 10,000 rows (currently ~607):**
- Re-evaluate CHAT-CTX-01 Strategy A vs Strategy C (semantic embeddings)
- FTS GIN index degradation point is typically ~100k rows for tsvector; well within Strategy A budget for years at current rate

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `openai@^4.79.0` | Node 18+, native fetch | vigil-core runs Node 20 on Railway — OK |
| `openai@^4.x` | `@anthropic-ai/sdk@^0.88.0` | No symbol collisions — completely separate clients/namespaces |
| `@evenrealities/even_hub_sdk@^0.0.9` | G2 plugin `app.json` `min_sdk_version: 0.0.8` already bumped in Phase 125 Plan 08. For `g2-microphone` permission verify Even Hub permission allowlist on developer portal before submitting | If `min_sdk_version` needs another bump (e.g. 0.0.9 for guaranteed audio API), update `app.json` |
| OpenAI Whisper / 4o-transcribe | Multipart upload `audio/wav` `audio/mp3` `audio/mpeg` `audio/m4a` `audio/webm` | NOT `audio/pcm` direct — must wrap PCM in WAV header (44 bytes) |
| Drizzle `inArray()` | drizzle-orm@0.45.2 | Verified — present since 0.30.x |
| Hono `c.req.parseBody()` for multipart | hono@^4.7.0 | Native, no body-parser middleware needed |

---

## Concrete VOICE-01 Spike Scope (1-2 day, executable)

This is the **planner-handoff** deliverable that the spike-gate from PROJECT.md requires.

### Day 1 (4-6h)

**Hour 1: Permission + handshake**
- [ ] Add `"g2-microphone"` to `vigil-g2-plugin/app.json` permissions array
- [ ] Build + load plugin on iPhone Even Hub
- [ ] In a NEW `vigil-g2-plugin/scripts/voice-spike-page.html` (registered as a temporary "Voice Spike" screen):
  - Button: "Start mic" → `await bridge.audioControl(true)` → log return value
  - Button: "Stop mic" → `await bridge.audioControl(false)` → log return value
  - Button: "Probe permission rejection" → temporarily run BEFORE permission grant (or with permission removed) → log error mode

**Hour 2: Event capture instrumentation**
- [ ] In spike page, attach `bridge.onEvenHubEvent` listener that filters to `event.audioEvent`
- [ ] Per event, log: `[<ms_since_mic_on>] event #<n>, bytes=<pcm.length>, totalBytes=<accumulated>`
- [ ] Accumulate all `audioPcm` chunks into a single `Uint8Array` via standard concat-buffer pattern

**Hour 3: First recording — 5 seconds**
- [ ] Start mic, count "one one-thousand, two one-thousand" out loud for 5s, stop mic
- [ ] Verify: total bytes ≈ 5 × 32000 = 160,000 (allow ±10% for trim)
- [ ] If totalBytes drift wildly from expected: format hypothesis (16kHz mono 16-bit) is wrong → halt spike, escalate

**Hour 4: WAV reconstruction + offline playback**
- [ ] In-browser: build WAV blob (44-byte header + PCM buffer), encode to base64, `console.log` it
- [ ] Operator copies base64 → `printf '%s' '<base64>' | base64 -d > test.wav` → `afplay test.wav` on Mac → verify the count is intelligible
- [ ] **PASS GATE 1**: audio is intelligible → continue. FAIL → spike fails BLOCK path.

### Day 2 (4-6h)

**Hour 1: Latency characterization**
- [ ] Mic-on latency: `console.time('mic-on')` → `audioControl(true)` → in first `audioEvent` listener: `console.timeEnd('mic-on')`. Repeat 10x; capture min/median/p95
- [ ] Inter-chunk latency: log timestamp deltas between consecutive events for 30s recording; compute distribution

**Hour 2: Failure mode characterization**
- [ ] Walk out of BLE range mid-recording, return after 30s — observe event behavior (gap? backfill? error event?)
- [ ] Force-background iPhone app mid-recording — observe (events stop? buffer? resume on foreground?)
- [ ] `audioControl(false)` mid-utterance — observe last chunk's content (clean cut? truncated?)

**Hour 3: End-to-end transcription test**
- [ ] Operator-only: POST a 30s WAV recorded in spike to **`api.openai.com/v1/audio/transcriptions`** with curl + `OPENAI_API_KEY` from console
- [ ] Note: response time, transcript accuracy, character count
- [ ] **PASS GATE 2**: transcript is recognizable (>80% words correct) → continue to scope VOICE-02. FAIL → spike fails DEGRADE path with reason (audio quality vs transcription accuracy isolated by inspection)

**Hour 4: Write `spike-DECISION.md`**
- [ ] All 9 unknowns from §1b answered with empirical data
- [ ] Latency-distribution table
- [ ] Branch verdict: PASS / DEGRADE / BLOCK with explicit reason
- [ ] 60-second loom of the spike replay for portfolio + reviewer evidence (mirrors Phase 125 60s portfolio demo pattern)

### Spike artifacts checked in

- `vigil-g2-plugin/scripts/voice-spike-page.html` (delete after VOICE-02 ships, OR keep for regression)
- `.planning/phases/<N>/spike-VERIFICATION.md` (operator-facing)
- `.planning/phases/<N>/spike-DECISION.md` (branch verdict + RFC for VOICE-02)
- One sample WAV embedded as base64 in spike-VERIFICATION.md (gitignored if >100KB, otherwise inline)

### Spike does NOT do

- Build the production VOICE-02 endpoint
- Wire transcription into the thought-create flow
- Implement push-to-record UX (deferred to VOICE-02 even on PASS)
- Test on more than one operator (single-user empirical run is enough for the spike)
- Test on iPhone foregrounding + Mac WebView simulator (live device only — simulator audio path is known sim-only per Phase 45 D-08)

---

## Sources

### HIGH confidence (Context7/Official docs/installed source)

- **Even Hub SDK 0.0.9** — `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` (lines 25, 853-902, 1187, 1257-1258, 1292) — `audioControl`, `AudioEventPayload`, `audioPcm: Uint8Array`, prerequisite of `createStartUpPageContainer`
- **Even Hub SDK README** — `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/README.md` §"Audio Control and Event" — verified API surface, microphone start/stop semantics
- **Anthropic Files API spec** — [platform.claude.com/docs/en/docs/build-with-claude/files](https://platform.claude.com/docs/en/docs/build-with-claude/files) — confirmed supported MIME types: `application/pdf`, `text/plain`, `image/jpeg|png|gif|webp` ONLY. No audio.
- **Anthropic third-party transcription cookbook** — [platform.claude.com/cookbook/third-party-deepgram-prerecorded-audio](https://platform.claude.com/cookbook/third-party-deepgram-prerecorded-audio) — official acknowledgement that audio requires third-party transcription
- **vigil-core schema** — `vigil-core/src/db/schema.ts:324-341` — `ai_cache` uniqueIndex `uq_ai_cache_user_type(userId, type)`
- **vigil-core chat route** — `vigil-core/src/routes/chat.ts:23,32-36,66-77` — current cap, validation, recency-only context strategy
- **vigil-pwa Settings page** — `vigil-pwa/src/pages/SettingsPage.tsx:154-160,705-727` — existing manual Quiet-mode toggle shape + rollback pattern
- **ServiceNow Integration Report (2026-05-07)** — `~/Desktop/servicenow-integration-report.pdf` — 6 attempted approaches + 5 ranked recommendations; root cause Web Components + closed Shadow DOM

### MEDIUM confidence (multiple independent sources, recent)

- **Even G2 PCM format = 16kHz mono 16-bit** — [Zenn dev SDK feature verification](https://zenn.dev/bigdra/articles/eveng2-sdk-features?locale=en) (independent corpus verification, Feb 2026)
- **`gpt-4o-mini-transcribe` pricing $0.003/min, $0.18/hour** — [TokenMix Whisper API Pricing 2026](https://tokenmix.ai/blog/whisper-api-pricing), [DiyAI OpenAI Whisper Pricing 2026](https://diyai.io/ai-tools/speech-to-text/openai-whisper-api-pricing-2026/), [CostGoat OpenAI Transcription](https://costgoat.com/pricing/openai-transcription)
- **`gpt-4o-mini-transcribe` superseding `whisper-1`** — [GPT-4o-Transcribe Review TokenMix 2026](https://tokenmix.ai/blog/gpt-4o-transcribe-vs-whisper-review-2026)
- **iOS WebKit does NOT expose Focus / DND** — [PWA iOS Limitations and Safari Support 2026, MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide); negative confirmation in [MDN Notification.requestPermission_static](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static)
- **Safari iOS Page Visibility API works in PWAs over HTTPS** — [dev.to/wes_goulet PWA Page Visibility](https://dev.to/wes_goulet/detect-if-a-pwa-is-visible-with-the-page-visibility-api-1k3a)
- **ServiceNow Polaris uses Web Components + closed Shadow DOM** — independently confirmed by ServiceNow community articles on [Next Experience UI / GraphQL custom components](https://www.servicenow.com/community/developer-articles/custom-components-01-custom-graphql-api-part1/ta-p/2312072) + the empirical PDF attempt log

### LOW confidence — needs hardware/operator verification

- **Exact audio chunk size per `audioEvent`** — unspecified in SDK; spike step 3 resolves
- **`audioControl(true)` failure mode on missing `g2-microphone` permission** — undocumented; spike step 7 resolves
- **iPhone PWA Page Visibility reliability for "user is in a Focus" inference** — proxy correlation, not direct signal; LOW confidence flagged for UAT

---

## Open Questions for the Roadmapper

1. **Should VOICE-01 spike artifacts (HTML test page) ship with plugin v0.4.0, or be `.gitignore`'d?** Recommendation: keep checked in under `vigil-g2-plugin/scripts/` (mirrors `scripts/check-verified.mjs` pattern), but exclude from `npm run pack` bundle.
2. **Is the existing `OPENAI_API_KEY` env var convention defined anywhere?** If not, follow Phase 124 `__setVerifyTurnstileTokenForTest` DI seam convention: lazy-null-init module, fail-closed on missing key, no panic at boot.
3. **CHAT-CTX-01 contextLimit cap raise to 100 — is 50 policy-locked anywhere?** If a Phase 117 drift-detector test pins `<= 50`, that test needs to be updated in lockstep.
4. **SVCNOW-01 needs Polaris-only URL detection** — does the existing extension already have a content-script that detects per-tab URL? Or does popup `chrome.tabs.query` for active tab suffice? Affects whether SVCNOW-01 needs content-script changes (more invasive) or popup-only (Phase-sized change).
5. **G2-LIFECYCLE-01 — does the existing `SCROLL_BOTTOM_EVENT` exit-via-double-tap UX (Phase 125 POLISH-05) need to be considered as "user explicitly left, don't auto-restore"?** If so, persist last-screen on every screen change EXCEPT the home-exit transition.

---

*Stack research for: v3.9 Voice & Companion Polish — Vigil multi-client ambient AI assistant*
*Researched: 2026-05-11*
