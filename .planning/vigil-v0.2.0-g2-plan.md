# Vigil v0.2.0 — G2 Plugin Feature Expansion (Parked Plan)

**Source:** User-provided PDF `vigil-v020-outline.pdf` (April 2026)
**Status:** PARKED — do not start until triggers below fire
**Parked on:** 2026-04-08 during post-v2.3 review session

## Trigger conditions (before unparking)

All three must be true before this plan is ready to promote into an active phase:

1. **Even G2 physical hardware in hand** — glasses ordered, arriving ~7-10 days from 2026-04-08. No UX validation is possible without them for notifications, voice capture, or navigation.
2. **Even Hub v0.1.0 approved** — currently in Even Hub review queue. v0.2.0 cannot ship until v0.1.0 is approved (resubmission with new permissions goes back to queue).
3. **ServiceNow API token received** — request sent to Robbie Maib, pending IT approval. Feature 1 (the headline feature) is blocked on this.

When all three are true, run `/gsd-new-milestone v2.5` (or whichever is current) and reference this file.

## Features (from user's outline)

### 1. New Case Notifications — marked DO FIRST
**What:** Vigil Core polls ServiceNow every 2-5 min for new cases, plugin polls Vigil Core, glasses show case number/store/equipment/priority as a notification screen. Tap to dismiss, swipe down to jump to work orders list.

**How:** Add ServiceNow polling loop + `service_now_cases` table + `/v1/notifications` endpoint in vigil-core. G2 plugin polls that endpoint on the existing timer.

**Blockers:**
- ServiceNow API token (external — Robbie)
- Architecture decision: current work order path is IMAP-based (Phase 22 v1.3). Direct REST API means two sources of truth → need to decide: replace IMAP, dedup both, or keep IMAP primary with API for freshness only.

### 2. Voice Note Confirmation — marked DO SECOND
**What:** After capturing a voice note, glasses show checkmark + "Note captured" + first ~8 words of transcription. Auto-dismisses after 3s.

**How:** Add `g2-microphone` to app.json permissions, use Even SDK audioControl for PCM capture, POST to new `/v1/voice` endpoint.

**Blockers:**
- **Factual error in source doc:** "Vigil Core transcribes via existing VoiceCaptureService" is WRONG. VoiceCaptureService is Mac-app-only (SFSpeechRecognizer / WhisperKit — Apple frameworks). Vigil Core on Node.js has NO server-side ASR. Options:
  - Add OpenAI Whisper API (~$0.006/min, new API key)
  - Add AssemblyAI / Deepgram
  - Defer transcription: glasses just confirm "captured", audio queued in vigil-core DB, transcribed later when Mac app next syncs (matches capture-and-review philosophy, cheapest)
- Even Hub v0.1.0 must be approved; adding g2-microphone permission = resubmit v0.2.0 and re-queue for review

### 3. Navigation — marked DO THIRD
**What:** Next turn only while driving to a store — direction arrow + distance in peripheral vision. Tap work order → detail → navigation.

**How:** First check Even Hub native Navigate API. If it exists, pass the store address string and let Even handle routing (minimal custom code). If not, pull turn-by-turn from Google Directions API + phone GPS streaming.

**Blockers:**
- **30-min investigation needed first:** does Even Hub Navigate API exist? If yes, feature is ~day of work. If no, it's a full 2-3 day phase (Google Directions API is metered past free tier, location streaming infra, turn-by-turn parser).
- Location permission in app.json → Even Hub resubmission

### 4. Sports Scores — marked DO LAST
**What:** Fourth screen in the glasses carousel showing today's scores or next game.

**How:** ESPN API already wired in vigil-core (daily brief). Add `GET /v1/sports/scores` endpoint, add 4th screen to plugin navigation cycle between affirmation and home.

**Blockers:** NONE. This is the only fully-feasible, zero-external-dependency feature in the list.

## Claude's recommended reordering (vs the doc)

| Doc order | Recommended | Reason |
|---|---|---|
| 1. Notifications | **3rd** — do after Robbie + architecture decision | Blocked externally, IMAP-vs-API dedup decision needed |
| 2. Voice notes | **4th** — do last | Hidden server-side ASR gap, Even Hub resubmit lag, lowest daily value (why not just open Mac app?) |
| 3. Navigation | **2nd** conditional | Highest field-tech daily value IF Even Hub native API exists; defer otherwise |
| 4. Sports scores | **1st** as warmup | Zero blockers, builds momentum, validates "new screen in carousel" pattern |

## Cross-cutting concerns

- **G2 hardware gates ALL UX validation.** Simulator can verify code paths but not interaction feel.
- **Phase 56 push hook will fire correctly** for any vigil-core commits in this work (tested structurally during Phase 53 UAT — 22-commit real fire).
- **Zero dailybrief (Mac-app) changes** in any feature. All work is in `vigil-core/` + G2 plugin repo.
- **Even Hub resubmission cost** applies to features 2 + 3 (new permissions), not features 1 + 4. Plan for review latency.
- **ServiceNow architecture decision** is the single most important pre-work item. Don't write code until you've decided IMAP vs API vs dedup.

## Open questions to answer BEFORE promoting to an active phase

1. Is Even Hub Navigate API native? (30 min)
2. Which ASR backend for voice transcription, or defer entirely to client-side later sync?
3. How does ServiceNow API flow reconcile with existing IMAP work order path?
4. Has Even Hub approved v0.1.0 yet? What's the review queue position?
5. Has Robbie responded on the ServiceNow token?

## Source document

Original PDF: `vigil-v020-outline.pdf` — user-provided during v2.3 milestone archive session on 2026-04-08. Upload to shared location if this file is to survive beyond the current context.

---

*Parked during the post-v2.3 review. Unpark when trigger conditions above are met.*
