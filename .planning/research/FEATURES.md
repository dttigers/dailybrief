# Feature Research — v3.9 Voice & Companion Polish

**Domain:** Ambient AI capture + display for ADHD daily-driver (Even G2 glasses + PWA + browser ext + macOS)
**Researched:** 2026-05-11
**Confidence:** MEDIUM-HIGH (SDK surface verified via SEED-010 + 2026-05-10 hardware test memo; Limitless/Whoop/Linear real-world refs verified; ServiceNow Polaris constraints verified via 2026-05-07 integration report; iOS Focus + Shortcuts pattern verified via Apple Support + community blog refs)

---

## Scope Anchor

v3.9 is **additive polish + one anchor capability** (G2 PCM voice) on top of an already-shipped multi-surface system. This is NOT a green-field roadmap — every feature below has a defined entry point in the existing codebase, and most have a SEED file with the operator's real-world framing already written.

The downstream REQ consumer should treat each **category bucket** below as a single REQ-prefix domain (e.g. all VOICE-* requirements bucket into "Voice"). Table-stakes within a category are the implementation floor. Differentiators are deferred unless they ride along cheap. Anti-features mark where REQ scoping must NOT drift.

---

## Feature Landscape — by Category

### Bucket 1: VOICE — G2 PCM Voice Capture (SEED-010)

**Anchor capability for the milestone. Spike-gated (1-2 day Phase A) before full scope commits.**

Real-world references (all verified):

- **Limitless Pendant** — clip-on always-on recorder, manual press-and-hold-2s to start, white LED indicator while recording (legal/social transparency), encrypted cloud upload, transcript + summary in companion app. $99. Acquired by Meta Dec 2025. ([Limitless Pendant FAQ](https://help.limitless.ai/en/articles/9124757-pendant-faq), [Voice AI Hardware Review](https://thoughts.jock.pl/p/voice-ai-hardware-limitless-pendant-real-world-review-automation-experiments))
- **Whoop voice journal** — recent (2026) feature, button-triggered voice logging of habits/supplements/life events, AI suggests new tracking patterns from the transcripts. ([Whoop voice features](https://www.wareable.com/wearable-tech/whoop-healthex-partnership-my-memory-ai-features-navigator-bands))
- **Plaud NotePin** — wearable AI note-taker, button-press capture model, transcription + structured note output. ([Plaud NotePin](https://www.plaud.ai/products/plaud-notepin))
- **Even G2 "Conversate"** — Even's first-party voice feature uses directional mics + cloud transcription via the Even app for translation/captions. Confirms G2 mic hardware is production-quality for speech. ([Even G2 SDK incl. audioControl](https://github.com/fabioglimb/even-toolkit), [Even Realities subtitle/translation](https://www.evenrealities.com/translation-glasses))
- **Picovoice / Sensory wake-word industry** — ultra-low-power wake-word detection in microamp range is table stakes for always-on wearable voice; cloud-only always-on is battery-prohibitive. ([Picovoice wake word guide](https://picovoice.ai/blog/complete-guide-to-wake-word/), [Sensory wearable battery](https://sensory.com/blog-wearable-battery-efficiency/))

**Table Stakes (Users Expect These for "voice capture on glasses")**

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| **VOICE-PCM-SPIKE** — Bridge `audioControl(true/false)` + `onEvenHubEvent.audioEvent` → PCM bytes flowing to plugin | Without this, nothing else works; this IS the SDK contract verification | MEDIUM | Spike-gates entire milestone per SEED-010. Verify sample rate / bit depth / mono-stereo / endianness on hardware. Existing capture pipeline (vigil-core POST /v1/thoughts) is the eventual sink. |
| **VOICE-TRIGGER** — Explicit user action starts/stops recording (push-to-record model) | All wearable refs (Limitless, Whoop, Plaud) use button/gesture trigger; always-on is privacy-fraught + battery-prohibitive on G2 | MEDIUM | Two candidate triggers: G2 temple long-press (need SDK reliability — see SEED-011) OR glasses-menu "Capture" submenu entry. The latter is more reliable today. |
| **VOICE-FEEDBACK** — User confirmation that recording started / is in progress / ended | Wearables-without-feedback feel broken; Limitless made the LED indicator non-disableable | LOW | G2 has on-screen text — flash "● REC" or similar on lens during capture. Audio feedback (beep) optional but matches expectation. |
| **VOICE-TRANSCRIBE** — PCM uploaded → server transcribes → thought appears in Vigil with text | Without transcription, captured audio is useless for ADHD "capture every thought" thesis | MEDIUM-LARGE | New `POST /v1/captures/audio` route. Whisper API (cloud) is the obvious first pick; cost ~$0.006/min. Whisper-large via Replicate or local Whisper on Railway are alternatives. |
| **VOICE-OFFLINE-QUEUE** — If glasses-to-phone or phone-to-server connection drops, audio queues locally | Capture must not silently fail when ambient — that's the whole point | MEDIUM | Mirror vigil-watch's 100-event offline queue pattern (Phase 122). Drop oldest if quota exceeded; never drop newest. |

**Differentiators (Set Vigil Apart for ADHD-First Capture)**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **VOICE-AUTOSTOP** — Silence detection auto-ends capture (no need to press button to stop) | ADHD: deciding to stop is itself friction; thought is done = recording is done | MEDIUM | Voice Activity Detection (VAD) on PCM stream; ~1.5s silence threshold. Picovoice/Silero VAD models exist; or simple energy-threshold heuristic. Stretch goal in spike. |
| **VOICE-FAST-TRIAGE** — Captured thought goes through existing Claude AI triage pipeline so category + therapy classification happens automatically | Inherits all v1.x/v3.x triage features at zero extra cost; captured-via-voice thoughts are first-class | LOW | Already paved by `fire-and-forget triage` decision in PROJECT.md; voice capture just becomes another POST /v1/thoughts source. |
| **VOICE-SOURCE-TAG** — Thought metadata records `source: "g2_voice"` so dashboard can filter / Insights can analyze voice-capture patterns | "How often am I capturing while driving?" surfaces operator behavior to themselves | LOW | One enum value addition; mirrors existing source-tagging for browser-extension/folder-watcher/PWA. |

**Anti-Features (Avoid for v3.9)**

| Anti-Feature | Why Tempting | Why Problematic | Alternative |
|--------------|--------------|-----------------|-------------|
| **Always-on listening / wake word** | "Hey Vigil, capture this" feels magic | Battery cost on G2 unknown (no low-power DSP), privacy nightmare (recording bystanders unsolicited), Limitless's social-friction story is cautionary | Push-to-record via temple/menu gesture. Revisit wake-word after G2 hardware battery testing in a future milestone. |
| **Real-time bidirectional voice chat with Claude through glasses** | "Conversational AI in glasses!" headline | Different product entirely (low-latency duplex audio, TTS to glasses speaker, conversation state mgmt). SEED-010 anti-scope explicitly excludes this. | Vigil is capture-and-review, not conversation (PROJECT.md "Out of Scope"). |
| **On-device transcription on the iPhone Even app** | "No cloud, faster" | iPhone Even app is closed-source; we have no insertion point. Cloud transcription is fine (existing pattern). | Cloud Whisper via vigil-core. |
| **Multi-language transcription on first ship** | "International users!" | Whisper supports it but UX (language picker? auto-detect?) is its own design problem. Operator is en-US. | Default `language: "en"` in Whisper call; revisit if a user complains. |

---

### Bucket 2: CAPTURE-REACH — ServiceNow Assisted-Capture Popup (Phase 80 unblock)

**Ships AROUND the IT-API-token block that has held Phase 80 for ~9 months. The 2026-05-07 integration report exhausted 6 scrape/API approaches; this popup is the workaround.**

Real-world references:

- **Linear / Jira / GitHub browser extensions** — popup pattern dominates: action icon click or keyboard shortcut opens a small popup with prefilled fields, user types delta, ⌘+Enter submits + closes. Browser autofocus via HTML5 `autofocus` attr or scripted focus(). Popups auto-close on focus loss (Chrome MV3 behavior). ([Chrome popup docs](https://developer.chrome.com/docs/extensions/develop/ui/add-popup), [MDN extension popups](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups))
- **Vigil's own browser-extension quick-capture (v3.2 / Phase 117)** — already established the popup-with-autofocus + ⌘+Enter + 800ms triage poll pattern in Chrome AND Safari. SVCNOW is essentially a Vigil-extension *new mode* triggered when on a Polaris page.

**Table Stakes**

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| **SVCNOW-DETECT** — Extension detects "I'm on a ServiceNow Polaris case page" and offers the popup mode | Without page detection, operator has to remember to use a different shortcut on different pages — extension hygiene 101 | LOW | URL pattern match in `manifest.json` + content-script DOM probe (page title contains "CS####" pattern from the integration report). |
| **SVCNOW-PREFILL** — CS# auto-extracted from page (URL or title) and shown read-only in popup | The whole point of "assisted" capture — operator doesn't retype the case number | LOW | Pattern from 2026-05-07 report: `document.title` has CS# even though Polaris Shadow-DOM hides the body. Title extraction works ON every approach attempted. |
| **SVCNOW-TYPE** — Operator types short description + selects priority (high/normal/low or P1-P4 mapping) | The friction-reducer — typing 1-2 sentences << navigating ServiceNow UI for work-order status mgmt | LOW | Mirror existing extension quick-capture popup textarea + add `<select>` for priority. |
| **SVCNOW-SUBMIT** — Sync to vigil-core as a structured thought / work-order with metadata `{cs_number, priority, source: "svcnow_assisted"}` | Operator's daily brief / dashboard needs to surface these like any other work order | LOW-MEDIUM | New route OR extend POST /v1/thoughts with structured payload. Likely route since work orders are a distinct entity. |
| **SVCNOW-CMDENTER** — ⌘+Enter (Ctrl+Enter on Win/Linux) submits + closes popup | Vigil's existing extension already trains this muscle memory (v3.2 Phase 117) | LOW | Verbatim port from existing quick-capture popup. |
| **SVCNOW-AUTOFOCUS** — Description textarea has focus on popup open | HTML5 `autofocus` is the standard; popup-without-autofocus feels broken on every reference (Linear/Jira) | LOW | `autofocus` attr in popup.html. |

**Differentiators**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **SVCNOW-PRIORITY-DEFAULT** — Sensible default for priority based on page context if extractable, else "normal" | Skips one keystroke on common case | LOW | If Polaris-rendered priority badge is reachable via Shadow-DOM probe (the 2026-05-07 report says it isn't), use it; otherwise default to "normal". Cheap to add. |
| **SVCNOW-TOAST** — Submit shows brief inline confirmation ("Captured CS1234567") before popup auto-closes | Closes the loop visibly so operator knows it landed | LOW | Existing pattern from v3.2 quick-capture's triage-feedback. 200ms toast then close. |
| **SVCNOW-PERSIST-DRAFT** — If popup closes before submit (focus-loss auto-close), draft restored next open | Browser-extension popups close on focus loss, ADHD operators lose drafts | LOW | `chrome.storage.session` (auto-clears on browser quit) with the typed content; rehydrate on next popup open if matching CS#. |

**Anti-Features**

| Anti-Feature | Why Tempting | Why Problematic | Alternative |
|--------------|--------------|-----------------|-------------|
| **Side-panel mode (always-open while on Polaris)** | "Persistent UI = less friction" | MV3 side-panel adds API surface; popup closure on focus-loss is actually fine for this flow (capture + leave) | Stick with popup. Side-panel only if assisted-capture becomes a high-volume workflow. |
| **Inline iframe injected into the ServiceNow page** | "Looks more native" | Polaris uses Shadow-DOM aggressively (2026-05-07 report root-cause); iframe injection fights the same CSP/Shadow-DOM walls the API scrape did | Popup runs in extension's own origin — clean separation. |
| **New-tab capture form** | "More room to type" | Defeats the "fast lightweight assisted capture" purpose; if operator wants the full ServiceNow UI they already have it | Keep popup minimal. |
| **Two-way sync with ServiceNow** | "Mark in Vigil → mark in ServiceNow too" | This is exactly what the IT-API-token blocker prevents. Will land when IT track unblocks. | One-way "capture from Polaris page → Vigil" only for v3.9. |

---

### Bucket 3: G2-UX — Last-Viewed Screen Restore (SEED-009)

**Lifecycle polish: every plugin re-open lands on home today; operator re-navigates 3-10x/day.**

Real-world references:

- **Browser session restore** (Chrome, Firefox, Edge) — "Continue where you left off" restores last open tabs *with focus on last-viewed tab*. TTL is typically session-only (until next browser quit) but some configs persist across restarts. ([Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api), [Edge session restore](https://learn.microsoft.com/en-us/dynamics365/customer-service/administer/enable-session-restore))
- **Android Activity lifecycle** — `onSaveInstanceState` Bundle preserves View state across process death; system handles TTL implicitly via `onRestoreInstanceState` timing. ([Android Activity lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle))
- **iOS state restoration** — `restorationIdentifier` + `encodeRestorableState/decodeRestorableState`; system decides when to restore vs reset based on time since suspend. ([Apple lifecycle docs](https://developer.apple.com/documentation/uikit/managing-your-app-s-life-cycle))

The dominant industry pattern: **persist last position, restore on resume, EXCEPT when "too much time" has passed**. SEED-009 already proposes 30min TTL.

**Table Stakes**

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| **G2-LV-SCREEN** — Last carousel screen (home / work-orders / affirmation / companion) persisted via `bridge.setLocalStorage` and restored on next plugin launch | The 70% case: operator was on Companion 5min ago, re-opens, should land on Companion | LOW | Even Hub SDK `setLocalStorage`/`getLocalStorage` confirmed in SEED-009 + v3.8 Phase 124 already uses localStorage for SSE Last-Event-ID. Existing pattern. |
| **G2-LV-TTL** — TTL gate: if `now - lastViewedAt > 30min`, default back to home instead of restoring | Stale context is worse than fresh home — see SEED-009 framing ("yesterday morning's work order vs today's fresh brief") | LOW | Simple timestamp check at launch. 30min default is sensible-pragmatic; not user-configurable in v3.9. |
| **G2-LV-WRITE-ON-CHANGE** — Write happens on each carousel-advance, not on plugin-close | iPhone Even app destroys WebView on close — close-event may never fire (memory `g2_companion_doubletap_hardware_verified` + SEED-009 background) | LOW | Write-through pattern; minor `setLocalStorage` call overhead in `navigation.ts` carousel advance handler. |

**Differentiators**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **G2-LV-SCROLL** — Last work-orders scroll position restored | If operator was reading task #5 of 12, re-opens to task #5 not task #1 | MEDIUM | Adds index field to localStorage payload. Some risk of out-of-bounds (list shrank since write) — needs bounds check + fallback to top. |
| **G2-LV-SOURCE-AWARE** — If plugin launched via glasses-menu vs notification, ignore last-viewed and route per launch-source (Phase 124 G2-POLISH-06 already routes notification-source) | Notification-source already implies "go to Companion right now" intent; respect intent over history | LOW | Plug into existing launch-source helper (Phase 124 Plan 08). Last-viewed restore is "fallback when launch-source provides no signal." |

**Anti-Features**

| Anti-Feature | Why Tempting | Why Problematic | Alternative |
|--------------|--------------|-----------------|-------------|
| **Cross-device state sync** | "Operator's iPhone state syncs to MacBook's plugin instance" | Vigil's G2 plugin only runs in the Even iPhone app — there is no second device. SEED-009 explicitly anti-scopes this. | Local-only state. |
| **No TTL ("always restore")** | "Always remember where I was" | Stale restoration is a real anti-pattern per SEED-009 framing | 30min TTL with home fallback. |
| **Restore inside task-detail or sub-screen** | "Full state restore!" | Increases test surface; if sub-screen state is stale (task completed externally), restoration error-prone | Restore only at the carousel-screen level; sub-screens always re-enter from their parent screen state. |

---

### Bucket 4: FRESHNESS — Auto-Regenerate Insights/Therapy + Chat Context (SEED-013 + SEED-014)

**The "make the AI surface feel alive" pair. Both are Small per their seed files. Pair them for one consolidated phase or split as two — they touch adjacent code.**

Real-world references:

- **Stale-while-revalidate (SWR)** — HTTP cache control standard; serve stale, trigger background refresh on first read post-expiry. ([DebugBear SWR](https://www.debugbear.com/docs/stale-while-revalidate), [Vercel SWR discussion](https://github.com/vercel/next.js/discussions/54075))
- **RAG hybrid retrieval** — Modern RAG pattern combines lexical/full-text search + dense vector semantic search for best recall. ([AWS RAG](https://aws.amazon.com/what-is/retrieval-augmented-generation/), [Azure RAG overview](https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview)). For Vigil's scale (single-user, ~thousands of thoughts), full-text only is the pragmatic floor — SEED-014 Option B explicitly recommends this.
- **Event-driven cache invalidation** — Considered most-advanced approach in cache-strategy literature; "at key events such as direct data changes your system triggers cache invalidation directly." ([ioRiver cache invalidation](https://www.ioriver.io/terms/cache-invalidation)). Vigil's "new thought POST" is exactly this trigger.

**Table Stakes (FRESHNESS bucket)**

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| **INSIGHTS-INVAL** — On POST /v1/thoughts, mark user's `ai_cache (userId, type IN ('insights', 'therapy_patterns', 'therapy_prep'))` as stale | Without this, dashboard insights silently reference last Tuesday's data | SMALL | SEED-013 prescribes; existing `ai_cache` schema from Phase 102. Either DELETE row OR add `stale_at` column. |
| **INSIGHTS-REGEN-STRAT** — Pick invalidation strategy: delete-on-write (Option A), stale-flag + background regen (Option B), or debounced (Option C) | Without strategy, naive impl will rate-limit Claude API on rapid capture bursts | LOW | SEED-013 Option C recommended (debounce by N thoughts or M minutes since last regen). Defends Anthropic spend cap (PROJECT.md note: $500/mo cap was set in Phase 126). |
| **INSIGHTS-FRESH-INDICATOR** — PWA shows subtle "Updated just now" / "Updated 3min ago" on insights cards | Closes operator's trust gap from SEED-013 ("are these *this week*?") | LOW | Existing `generatedAt` field; just render it. |
| **CHAT-CTX-SEARCH** — Chat endpoint pulls 5-10 historically relevant thoughts via existing `GET /thoughts?q=` full-text search BEFORE composing LLM context | Without it, "what was I thinking about last month?" is unanswerable today | LOW-MEDIUM | SEED-014 Option B; full-text route exists at thoughts.ts:154. One extra DB query + cheap keyword extraction. |
| **CHAT-CTX-MERGE** — Merge 20 recent + N relevant, dedupe by thoughtId, send to LLM | Recent thoughts still anchor "what am I doing right now" context; historical recall is additive | LOW | Map-based dedupe. Total context size capped at e.g. 30-40 thoughts to stay within token budget. |

**Differentiators (FRESHNESS)**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **INSIGHTS-BG-REGEN** — On invalidation, fire-and-forget Claude regenerate in background; next GET serves fresh result | No latency hit on dashboard load following capture | MEDIUM | Fire-and-forget Promise pattern already in PROJECT.md decisions ("Fire-and-forget triage"). Just apply it. |
| **CHAT-CTX-DATE-HINT** — Chat detects time-references in operator query ("last month", "in March") and adds date-window filter to search | "What was I thinking about that sales deal last month?" routes to time-bounded retrieval | MEDIUM | Cheap regex / one LLM hop for query understanding. Probably defer to a v4.x milestone — Option B without date-awareness handles "that sales deal" already via keyword match. |
| **CHAT-CTX-LIMIT-RAISE** — Also raise `contextLimit` cap from 50 → 200 as belt-and-suspenders | Power users can request bigger fixed window | LOW | One constant change in chat.ts. |

**Anti-Features (FRESHNESS)**

| Anti-Feature | Why Tempting | Why Problematic | Alternative |
|--------------|--------------|-----------------|-------------|
| **Vector / semantic search infra (pgvector)** | "Best recall, modern RAG, future-proof" | SEED-014 explicitly anti-scopes — real lift, new dep, Vigil's scale doesn't need it yet. Postgres tsvector FTS already supports cheap full-text. | Option B (full-text hybrid) gets most of the win for one phase of work. |
| **Auto-regen on every single thought capture** | "Always fresh!" | LLM cost balloons under rapid capture; Anthropic spend cap defends against runaway cost | Debounce (Option C): N thoughts or M minutes since last regen. |
| **Multi-turn chat memory / conversation history persistence** | "Chat that remembers our conversation" | SEED-014 anti-scopes; separate concern from context window retrieval | Single-turn chat with thought-context retrieval; revisit if operator complains. |
| **Brief-window change (>7 days)** | "Make brief reflect more history too" | SEED-014 explicitly anti-scopes — brief is intentionally "this week" | Brief stays at 7d; chat is the cross-history surface. |

---

### Bucket 5: QUIET-AUTO — iPhone Focus/DND Auto-Detect (SEED-015)

**Path-1 viable. Path-2 platform-blocked. Path-3 hacky. SEED-015 already did the legwork.**

Real-world references:

- **iOS Shortcuts Focus triggers** — Personal Automations support "When [Focus] Turns On/Off" triggers. Each Focus mode (Work / Sleep / Personal / Custom) can fire its own automation. iOS 26 lifted the Sleep-Focus restriction so all modes have parity. ([Apple Shortcuts triggers](https://support.apple.com/guide/shortcuts/setting-triggers-apde31e9638b/ios), [Derek Seaman iOS 26 Focus automations](https://www.derekseaman.com/2025/06/home-assistant-trigger-on-any-ios-18-ios-26-focus-mode.html))
- **Home Assistant pattern** — community-validated "Focus On → POST to webhook" automation is the dominant pattern in smart-home space. Pushcut, IFTTT, custom Shortcuts API libraries all support it. ([Home Assistant focus mode blog](https://community.home-assistant.io/t/blog-post-using-any-ios-18-ios-26-focus-mode-to-trigger-ha-automations/901179), [Pushcut Automation Server](https://www.pushcut.io/support/automation-server))
- **PWA platform constraint** — VERIFIED in SEED-015: iOS does NOT expose Focus state to web APIs. `prefers-reduced-motion` is independent, `visibilitychange` only fires on PWA bg/fg, no `navigator.focusState` exists. PWA-side detection is structurally impossible.

**Table Stakes**

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| **QUIET-AUTO-SHORTCUT** — Operator-installable iOS Shortcut hits `PUT /v1/quiet-mode` on Focus toggle (Path 1 from SEED-015) | Only viable path; PWA detection impossible per SEED-015 platform constraint | MEDIUM | Endpoint already exists (Phase 125). Pure operator-side configuration. |
| **QUIET-AUTO-DOCS** — One-click "Download Shortcut" or QR-to-Shortcut from PWA Settings page; Shortcut pre-baked with API key + endpoint | Without it, operator has to hand-build a Shortcut + manually type bearer token — defeats "ambient" goal | LOW-MEDIUM | iOS Shortcuts support `shortcuts://` URL scheme to import shared shortcuts. Generate signed/templated `.shortcut` file or share-sheet URL. |
| **QUIET-AUTO-API-KEY** — Per-Shortcut API key with `quiet_mode_write` scope only (not full bearer) | If device is compromised, attacker can spam quiet-mode toggle (low-impact), but not exfiltrate thoughts | MEDIUM | New API-key scoping flow in vigil-core. Mirrors v3.4 vk_-prefix scheme but with explicit scope. Could defer if v3.9 is over-budget; operator can use main bearer at higher risk. |

**Differentiators**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **QUIET-AUTO-MULTI-FOCUS** — Different Focus modes map to different Vigil behaviors (Work = quiet, Sleep = quiet, Personal = normal) | Operator's Focus config is already nuanced; Vigil respects existing structure | LOW | Each Shortcut targets one Focus mode; operator picks which trigger Quiet Mode. No code change — pure setup variation. |
| **QUIET-AUTO-CONFIRM** — PWA shows "Last toggled by: Shortcut at 2:34pm" so operator can verify automation fired | Closes feedback loop when automation works (or doesn't) | LOW | Existing /v1/quiet-mode endpoint can record `source` field; PWA renders it. |

**Anti-Features**

| Anti-Feature | Why Tempting | Why Problematic | Alternative |
|--------------|--------------|-----------------|-------------|
| **PWA-side Focus detection** | "Just listen for visibilitychange" | Structurally impossible per SEED-015. Backgrounding PWA != Focus toggle. Months of researcher cycles have been spent rediscovering this constraint. | Path 1 (Shortcut → webhook). |
| **Even Hub iOS app Focus integration (Path 2)** | "Native iOS Even app has access to Focus" | Requires Even Realities API support that does not exist; SEED-012 tracks the platform gap | Wait for SEED-012 widget/Intents API; ship Path 1 today. |
| **Calendar-event side channel (Path 3)** | "User adds 'ALL DAY FOCUS' calendar event" | Hacky, fragile, requires Calendar OAuth scope expansion | Path 1. |
| **Auto-detect via MacBook Do Not Disturb instead** | "Mac DND is detectable via shell" | Operator wears glasses while away from Mac; Mac DND ≠ ambient context | Path 1 covers the actual use case. |

---

### Bucket 6: HUD-UX — Companion HUD Clarity for Away-From-Desk (SEED-016)

**Three discrete gaps. Different scopes. Pick subset based on milestone budget. Gap 1 is the cheapest highest-value, Gap 2 highest-risk, Gap 3 highest-test-impact.**

Real-world references:

- **"Glanceable in <2s" pattern** — established in Apple Watch / Glance UI HIG / Android Wear glanceable complications; the design constraint is "useful while moving without focus." ([Apple lifecycle / state docs](https://developer.apple.com/documentation/uikit/managing-your-app-s-life-cycle))
- **Relative timestamp idiom** ("4m ago", "23m ago", "1h 14m ago") — universal in chat UIs (Slack, Discord, iMessage timestamps in conversations) and notification feeds. Operator already trained on this convention.
- **Two-stage "done" signal pattern** — Slack message "delivered" vs "read"; email "sent" vs "delivered" — separating the immediate-state signal from the confirmed-state signal is established UX.

**Table Stakes (Glanceable HUD for Bypass-Mode Long-Runs)**

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| **HUD-STALENESS** (Gap 1 from SEED-016) — Replace constant "session idle > 60s" with relative timestamp from `lastEvent.eventTimestamp` ("last activity 4m ago") | Without staleness signal, operator can't distinguish fresh-state from frozen-state | SMALL | Pure plugin-side render change in `companion.ts computeBodyLines`. No daemon change. Re-render on existing 30s refresh tick. Cheapest highest-value gap. |
| **HUD-STATE-COLOR-OR-ICON** — Visual encoding of state (running / done / failed) distinct from text — even one symbol prefix helps glanceability | "<2s while moving" requires non-text-only signal | LOW | G2 has limited rendering (text-mostly with limited glyphs). Use unicode markers (●/✓/✗/⚠) prefixing state line. Operator's text-only glasses make color impractical. |

**Differentiators (Higher-Impact Gaps)**

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **HUD-POSSIBLY-STUCK** (Gap 2 from SEED-016) — Daemon emits `possibly_stuck` event when N consecutive heartbeats fire without any tool_use/tool_result/end_turn between them; HUD shows persistent `[POSSIBLY STUCK]` banner with DOUBLE_CLICK ack | The exact failure mode that hurts most when away-from-desk (hung command, frozen MCP, network timeout) | MEDIUM | New event type in vigil-watch parser; HUD banner mechanism reuses Phase 124 banner-ack flow. **Risk:** false positives on legitimate long tools — threshold-tunable in watch.toml + per-pattern override. Quiet Mode should ALLOWLIST this event (you want to know when stuck during a focus block). |
| **HUD-DONE-FAST** (Gap 3 from SEED-016) — Decouple state-line from banner: state flips `done` immediately on `end_turn`, banner still requires 30s silence | Closes the "I glanced 20s after done, HUD said running" gap | MEDIUM | Daemon side: detect `end_turn` separately from silence-based task_complete. Plugin side: STATE_LINE map gains `done` value, banner remains gated. Touches Phase 124 D-14 PNG-equality test invariant (screenshots will diff). |

**Anti-Features**

| Anti-Feature | Why Tempting | Why Problematic | Alternative |
|--------------|--------------|-----------------|-------------|
| **Full activity-log scroll on HUD** | "Show last 5 events, not just state" | G2 screen real estate is tight (210px home-overflow lesson from G2-POLISH-07); list-style UX takes too long to read | Compact state + relative timestamp; full event log lives in vigil-core /agent-sessions (PWA / future-Mac surface). |
| **Push notifications to glasses for state changes** | "Buzz on state change" | Confuses Quiet Mode semantics — banner-ack via DOUBLE_CLICK is the existing signal | Existing banner mechanism. |
| **Auto-clear-on-resolution for `possibly_stuck`** | "If tool_use lands, banner auto-dismisses" | Tempting but loses the operator's "I should investigate why this hung" cognitive trail; explicit DOUBLE_CLICK ack matches `task_failed` precedent | Persistent banner until operator acks. |

---

## Cross-Bucket Dependency Map

```
VOICE-PCM-SPIKE (anchor)
    └── (gates) VOICE-TRIGGER / VOICE-FEEDBACK / VOICE-TRANSCRIBE / VOICE-OFFLINE-QUEUE
    └── (gates) ALL OTHER VOICE features in milestone

VOICE-TRANSCRIBE
    └── requires → POST /v1/captures/audio (new route)
    └── requires → Whisper API or local Whisper integration
    └── requires → Anthropic spend-cap awareness (Phase 126 set $500/mo)

VOICE-FAST-TRIAGE
    └── extends → existing fire-and-forget triage pipeline (v1.x)

SVCNOW-DETECT / SVCNOW-PREFILL
    └── extends → existing browser extension (v3.1/v3.2/Phase 117)
    └── requires → URL pattern + DOM probe (NOT Polaris Shadow-DOM scrape — that's the blocker)

SVCNOW-SUBMIT
    └── extends → POST /v1/thoughts OR new work-order route
    └── connects → existing work-order auto-archive (v3.2)

G2-LV-SCREEN
    └── uses → bridge.setLocalStorage (existing SDK surface; Phase 124 SSE uses it)
    └── extends → navigation.ts carousel state machine (Phase 124)
    └── interacts with → launch-source helpers (Phase 124 G2-POLISH-06)

INSIGHTS-INVAL
    └── requires → POST /v1/thoughts handler change (capture path)
    └── extends → ai_cache schema (Phase 102)
    └── pairs with → CHAT-CTX-SEARCH (same "fresh AI surface" theme)

CHAT-CTX-SEARCH
    └── uses → existing GET /thoughts?q= full-text search (no new infra)
    └── extends → /v1/chat handler (Phase 98)

QUIET-AUTO-SHORTCUT
    └── uses → existing PUT /v1/quiet-mode endpoint (Phase 125)
    └── requires → API-key-with-scope flow OR accept full-bearer risk
    └── platform-depends → iOS Shortcuts app (no version constraint at current iOS)

HUD-STALENESS (Gap 1)
    └── plugin-only — pure companion.ts render change
    └── pairs naturally with HUD-STATE-COLOR-OR-ICON

HUD-POSSIBLY-STUCK (Gap 2)
    └── requires → vigil-watch event type addition + detection rule
    └── requires → watch.toml config schema extension (threshold knob)
    └── requires → SSE event type addition (vigil-core agent-stream)
    └── requires → plugin banner handling (Phase 124 banner-ack reuse)
    └── interacts with → Quiet Mode allowlist (Phase 125)

HUD-DONE-FAST (Gap 3)
    └── requires → vigil-watch detection rule split (state vs banner)
    └── requires → plugin STATE_LINE map extension
    └── invalidates → Phase 124 D-14 PNG-equality screenshot baseline
```

**Conflict / interaction notes:**

- **VOICE-* and SVCNOW-* are independent surfaces.** Parallel-safe.
- **G2-LV-* depends on launch-source-helpers (Phase 124).** Make sure REQ ordering puts launch-source as PRIOR (it already is — already shipped).
- **INSIGHTS-INVAL touches the capture path; VOICE-TRANSCRIBE *uses* the capture path.** If both ship same milestone, sequence: INSIGHTS-INVAL first (touches POST /v1/thoughts handler), then VOICE-TRANSCRIBE (new route POST /v1/captures/audio which itself eventually POSTs to /thoughts → INSIGHTS-INVAL hook fires for voice captures too, for free).
- **HUD-DONE-FAST breaks Phase 124 D-14 PNG-equality test.** REQ must include "update screenshot baseline" task; not optional.

---

## Complexity Summary (for REQ Scoping)

| Bucket | Subfeature | Complexity | Risk |
|--------|------------|------------|------|
| VOICE | PCM-SPIKE | MEDIUM | HIGH — spike-gated for a reason |
| VOICE | TRIGGER + FEEDBACK | MEDIUM | MEDIUM — gesture reliability per SEED-011 memory |
| VOICE | TRANSCRIBE pipeline | MEDIUM-LARGE | MEDIUM — new route + Whisper integration + cost |
| VOICE | OFFLINE-QUEUE | MEDIUM | LOW — mirrors vigil-watch pattern |
| VOICE | AUTOSTOP (VAD) | MEDIUM | MEDIUM-HIGH — VAD tuning is its own rabbit-hole |
| SVCNOW | All table-stakes | LOW-MEDIUM | LOW — verbatim extension patterns |
| G2-LV | All table-stakes | SMALL | LOW — pure plugin polish |
| G2-LV | SCROLL position | MEDIUM | LOW |
| FRESHNESS | INSIGHTS-INVAL | SMALL | LOW |
| FRESHNESS | CHAT-CTX-SEARCH | LOW-MEDIUM | LOW |
| FRESHNESS | BG-REGEN | MEDIUM | MEDIUM — fire-and-forget error handling |
| QUIET-AUTO | SHORTCUT + DOCS | MEDIUM | LOW |
| QUIET-AUTO | API-KEY-SCOPING | MEDIUM | MEDIUM — new vigil-core auth surface |
| HUD-UX | STALENESS (Gap 1) | SMALL | LOW — cheapest highest-value |
| HUD-UX | POSSIBLY-STUCK (Gap 2) | MEDIUM | MEDIUM-HIGH — false positives |
| HUD-UX | DONE-FAST (Gap 3) | MEDIUM | MEDIUM — invalidates Phase 124 baseline |

**Suggested REQ scoping prioritization (P1 / P2 / P3):**

- **P1 (must-ship for v3.9):** VOICE table-stakes (post-spike), SVCNOW table-stakes, G2-LV table-stakes, FRESHNESS table-stakes, QUIET-AUTO table-stakes (Path 1 minimum), HUD-STALENESS (Gap 1)
- **P2 (should-ship if budget):** VOICE-AUTOSTOP, VOICE-SOURCE-TAG, SVCNOW-PERSIST-DRAFT, G2-LV-SCROLL, FRESHNESS-BG-REGEN, QUIET-AUTO-API-KEY-SCOPING, HUD-POSSIBLY-STUCK (Gap 2)
- **P3 (defer to v3.10/v4.0):** HUD-DONE-FAST (invalidates baseline), CHAT-CTX-DATE-HINT, QUIET-AUTO-MULTI-FOCUS variations, SVCNOW two-way sync (still IT-blocked)

---

## MVP Definition for v3.9

### Must Ship (P1)

- [ ] **VOICE-PCM-SPIKE** — gates everything else; 1-2 day Phase A per SEED-010
- [ ] **VOICE table-stakes** (TRIGGER + FEEDBACK + TRANSCRIBE + OFFLINE-QUEUE) — assuming spike says "viable"
- [ ] **SVCNOW table-stakes** (DETECT + PREFILL + TYPE + SUBMIT + CMDENTER + AUTOFOCUS) — ships around the Polaris/IT blocker
- [ ] **G2-LV-SCREEN + G2-LV-TTL + G2-LV-WRITE-ON-CHANGE** — re-launch lands on last-screen if <30min
- [ ] **INSIGHTS-INVAL** with debounced strategy (Option C) — fresh AI surface, cost-aware
- [ ] **CHAT-CTX-SEARCH + CHAT-CTX-MERGE** — chat reaches beyond 20 recent
- [ ] **QUIET-AUTO-SHORTCUT + QUIET-AUTO-DOCS** — Path 1 ships; API-key-scoping deferrable
- [ ] **HUD-STALENESS** (Gap 1) — relative timestamp on Companion bottom line

### Add If Budget Allows (P2)

- [ ] VOICE-AUTOSTOP, SVCNOW-PERSIST-DRAFT, G2-LV-SCROLL, FRESHNESS-BG-REGEN, QUIET-AUTO-API-KEY-SCOPING, HUD-POSSIBLY-STUCK

### Defer to Future Milestones (P3)

- [ ] HUD-DONE-FAST (Phase 124 baseline rework), CHAT-CTX-DATE-HINT, SVCNOW two-way sync, vector/semantic search infra, wake-word detection

---

## Sources

- [Even G2 SDK / even-toolkit (audioControl + speech-to-text)](https://github.com/fabioglimb/even-toolkit) — confirms G2 audio pipeline + Even-internal Conversate feature uses directional mics for clear capture
- [Even Realities G2 / R1 storyteller review (Substack)](https://davedgren.substack.com/p/even-realities-g2r1-a-storytellers) — operator-perspective on G2 voice features
- [Limitless Pendant FAQ](https://help.limitless.ai/en/articles/9124757-pendant-faq) — push-and-hold-2s model, LED indicator
- [Limitless conversation transparency policy](https://help.limitless.ai/en/articles/13004190-talking-to-someone-wearing-the-pendant-what-to-expect-and-how-we-handle-your-information) — social/legal context for wearable recording
- [Voice AI Hardware Review (jock.pl)](https://thoughts.jock.pl/p/voice-ai-hardware-limitless-pendant-real-world-review-automation-experiments) — real-world Limitless usage + Claude-personal-coach pattern that matches Vigil thesis
- [Meta acquisition of Limitless](https://www.ctol.digital/news/meta-limitless-acquisition-ambient-audio-bet/) — validates "ambient audio capture" as a category investment thesis
- [Whoop voice journal feature](https://www.wareable.com/wearable-tech/whoop-healthex-partnership-my-memory-ai-features-navigator-bands) — voice/text logging UX in a daily-driver wearable
- [Plaud NotePin](https://www.plaud.ai/products/plaud-notepin) — wearable AI note-taker with button-press capture
- [Picovoice wake word guide](https://picovoice.ai/blog/complete-guide-to-wake-word/) — wake-word vs push-to-talk + battery context
- [Sensory wearable battery efficiency](https://sensory.com/blog-wearable-battery-efficiency/) — always-on-listening battery overhead on wearables
- [Chrome Extension popup docs](https://developer.chrome.com/docs/extensions/develop/ui/add-popup) — popup behavior + focus-loss auto-close
- [MDN WebExtensions popups](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups) — cross-browser popup UX
- [Apple Shortcuts triggers (Apple Support)](https://support.apple.com/guide/shortcuts/setting-triggers-apde31e9638b/ios) — Focus On/Off automation triggers, definitive
- [Pushcut Automation Server](https://www.pushcut.io/support/automation-server) — webhook-from-Shortcut pattern reference impl
- [Home Assistant iOS 26 Focus automations (Derek Seaman)](https://www.derekseaman.com/2025/06/home-assistant-trigger-on-any-ios-18-ios-26-focus-mode.html) — community-validated Focus→webhook pattern
- [Stale-While-Revalidate (DebugBear)](https://www.debugbear.com/docs/stale-while-revalidate) — SWR cache pattern for AI cache invalidation
- [Cache Invalidation Strategies (ioRiver)](https://www.ioriver.io/terms/cache-invalidation) — event-based invalidation is the right shape for new-thought hook
- [AWS RAG overview](https://aws.amazon.com/what-is/retrieval-augmented-generation/) — RAG context for CHAT-CTX
- [Azure RAG hybrid retrieval](https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview) — full-text + semantic hybrid is industry standard; full-text alone is adequate at Vigil's scale
- [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) — visibilitychange semantics (relevant to QUIET-AUTO impossibility)
- [Android Activity lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle) — state restoration patterns
- [Apple lifecycle docs](https://developer.apple.com/documentation/uikit/managing-your-app-s-life-cycle) — restorationIdentifier pattern
- `.planning/seeds/SEED-009-g2-local-storage-last-viewed-screen.md` — operator framing for G2-LV
- `.planning/seeds/SEED-010-g2-voice-capture-via-audio-pcm.md` — VOICE milestone-anchor framing + spike-first recommendation
- `.planning/seeds/SEED-013-auto-regenerate-insights-therapy-on-thought-upload.md` — INSIGHTS-INVAL framing
- `.planning/seeds/SEED-014-chat-context-beyond-20-recent-thoughts.md` — CHAT-CTX retrieval strategy options
- `.planning/seeds/SEED-015-quiet-mode-auto-detect-iphone-focus.md` — QUIET-AUTO platform constraint + Path 1/2/3 analysis
- `.planning/seeds/SEED-016-companion-hud-away-from-desk-clarity.md` — HUD-UX three-gap analysis
- `.planning/PROJECT.md` (2026-05-11) — existing-feature context, key decisions, milestone scope
- `~/Desktop/servicenow-integration-report.pdf` (2026-05-07) — 6-approach Polaris scrape attempt log + root cause (Web Component + Shadow-DOM)

---
*Feature research for: v3.9 Voice & Companion Polish (Even G2 voice anchor + capture-reach + AI freshness + ambient HUD)*
*Researched: 2026-05-11*
