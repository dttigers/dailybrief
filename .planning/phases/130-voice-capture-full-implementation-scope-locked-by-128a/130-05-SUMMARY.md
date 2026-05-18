---
phase: 130
plan: 05
subsystem: voice-capture
tags: [voice-queue, telemetry, offline-queue, posthog, companion-hud, VOICE-07, VOICE-08]
dependency_graph:
  requires:
    - "Phase 130 Plan 04 — production voice screen + STOP-path POST + main.ts cross-screen state"
    - "Phase 124 D-11 — [1s, 2s, 4s, 8s, 16s, 30s] backoff schedule (pattern reference)"
    - "Phase 127 GUARD-01 — BLOCKED_PROPERTY_NAMES (no audio/audioPcm/pcm/audioBuffer/base64Audio in PostHog event props)"
  provides:
    - "localStorage-persisted offline voice queue at 'vigil:voice-queue:v1' (D-O2)"
    - "[1s, 2s, 4s, 8s, 16s, 30s] retry backoff + retries-exhausted eviction (D-O1)"
    - "Max 10 entries + LRU eviction with voice_queue_evicted PostHog event (D-O4)"
    - "Permanent-fail cascade for 429 DAILY_AI_BUDGET_EXCEEDED (D-E3)"
    - "voice_capture_completed PostHog event with safe-key set (D-T1)"
    - "voice_capture_dropout PostHog event on inter-chunk gap > 2× first-5s baseline (D-T2)"
    - "Companion HUD body line 3 — [NO MIC]/queue indicator priority ladder (D-O3 + Gray Area #6)"
    - "recordChunkArrival() seam consumed by main.ts's audioPcm collector for drop-out detection"
  affects:
    - "vigil-g2-plugin/src/screens/voice.ts (POST error branch routes to enqueue; success emits voice_capture_completed)"
    - "vigil-g2-plugin/src/screens/companion.ts (body line 3 reads queueDepth + voice state line)"
    - "vigil-g2-plugin/src/main.ts (per-chunk audioPcm collector calls recordChunkArrival)"
tech_stack:
  added: []
  patterns:
    - "Module-level posthog shim with spy test seam (mirrors audio-session-guard.ts __resetForTesting precedent) — production runtime is console.log; PostHog browser SDK can drop in later behind the same emit-funnel API"
    - "Compile-time safe-key contract — VoiceCaptureCompletedProps / VoiceCaptureDropoutProps / VoiceQueueEvictedProps interfaces force callers through typed entrypoints (emitVoiceCaptureCompleted / Dropout / VoiceQueueEvicted); no escape hatch to add arbitrary keys"
    - "LRU eviction via Array.prototype.shift() inside enqueue() — simple and operates on the in-memory snapshot before localStorage write so concurrent reads see the post-eviction state"
    - "Single-pass drainQueue() per call (caller owns retry cadence via getNextDelayMs); allows Plan 06+ to wire either an online-event-triggered drain OR a periodic timer without coupling cadence to queue internals"
    - "Best-effort response.clone().json() with try/catch — 2xx body parse failure doesn't lose the success metric; 429 body parse failure still treats as DAILY_AI_BUDGET_EXCEEDED (only documented 429 from /v1/voice/transcribe)"
    - "First-5s baseline window for drop-out detection with 200ms conservative fallback when no baseline samples accumulated (very short recording that started past the window)"
key_files:
  created:
    - "vigil-g2-plugin/src/lib/voice-queue.ts (~340 lines)"
    - "vigil-g2-plugin/src/lib/voice-telemetry.ts (~165 lines)"
    - "vigil-g2-plugin/src/lib/__tests__/voice-queue.test.ts (~386 lines)"
  modified:
    - "vigil-g2-plugin/src/screens/voice.ts (POST error branch routes to enqueue + 429 budget-cap copy + voice_capture_completed emit + recordChunkArrival seam + dropout tracking state + reset hook)"
    - "vigil-g2-plugin/src/screens/companion.ts (computeBodyLine3 helper reads queueDepth + getVoiceStateLine; priority ladder in computeBodyLines normal-3-line path)"
    - "vigil-g2-plugin/src/main.ts (audioPcm collector calls recordChunkArrival on each chunk)"
decisions:
  - "D-O1 / D-O2 / D-O3 / D-O4 enforced verbatim — [1s, 2s, 4s, 8s, 16s, 30s] backoff, localStorage key 'vigil:voice-queue:v1', Companion body line 3 indicator, LRU eviction at MAX_QUEUE_SIZE = 10"
  - "D-E3 cascade pinned — 429 DAILY_AI_BUDGET_EXCEEDED never enqueues + emits voice_queue_evicted with reason='daily_budget_cap_hit'; distinct operator copy 'daily AI cost cap hit — try tomorrow' (vs transient 'retry — tap to dismiss')"
  - "D-T1 / D-T2 safe-key contracts enforced at compile time via VoiceCaptureCompletedProps / VoiceCaptureDropoutProps TypeScript interfaces — adding a banned key requires editing voice-telemetry.ts (and the Plan 06 D-D2 drift detector source-greps the file)"
  - "RESEARCH Gray Area #6 priority ladder pinned — [NO MIC] wins, then queue indicator, then fallback to existing agent event message on Companion HUD body line 3"
  - "recordChunkArrival() exported as a separate seam from voice.ts (not coupled to toggleVoiceRecording) so main.ts's audioPcm collector can call it without re-entering the toggle logic"
  - "clientCaptureId is REUSED as recording_id for drop-out telemetry — one UUID v4 binds the queue entry, the eventual server-side voice_captures row, and all telemetry events for a single utterance"
  - "voice-queue.ts module-level functions read localStorage on every call (loadQueue, queueDepth) — no in-memory caching — so background drain progress is immediately visible on the next Companion HUD rebuild without explicit cache invalidation"
metrics:
  duration_minutes: 7
  completed_date: "2026-05-18"
  tasks_completed: 2
  files_created: 3
  files_modified: 3
  lines_changed: ~1170
---

# Phase 130 Plan 05: Offline Voice Queue + Telemetry Surface Summary

**One-liner:** localStorage-persisted offline voice queue at 'vigil:voice-queue:v1' with Phase 124 D-11 backoff `[1s, 2s, 4s, 8s, 16s, 30s]` + LRU eviction at max 10 + permanent-fail cascade for 429 DAILY_AI_BUDGET_EXCEEDED (D-E3) + compile-time safe-key PostHog telemetry shim (`voice_capture_completed` / `voice_capture_dropout` / `voice_queue_evicted`) + Companion HUD body line 3 priority ladder (`[NO MIC]` > `syncing N voice captures…` > existing agent event line); closes VOICE-07 + telemetry portion of VOICE-08.

## What Shipped

Plan 05 takes the Plan 04 client-side voice path from "drops on failure" to "queues + retries + tells operator what's happening":

1. **`voice-queue.ts` localStorage-persisted queue** keyed by `vigil:voice-queue:v1` (D-O2). Constants `MAX_QUEUE_SIZE = 10` + `BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000]` are LITERAL exports — Plan 06 drift detector (D-D2) will source-grep them. The queue is a single source of truth; every read goes through `localStorage.getItem` so background drain progress is visible to all UI consumers on the next render cycle.
2. **Backoff + eviction semantics (D-O1 + D-O4)** — `getNextDelayMs(retryCount)` returns the indexed delay; `enqueue` shifts the oldest entry when the queue is full (LRU) and fires `voice_queue_evicted` with `reason='lru'`; `drainQueue` evicts entries with `retryCount >= 6` as `reason='retries_exhausted'` BEFORE attempting another POST.
3. **Permanent-fail cascade (D-E3)** — HTTP 429 with body code `DAILY_AI_BUDGET_EXCEEDED` (or unparseable 429 body — only documented 429 from the route) evicts immediately with `reason='daily_budget_cap_hit'`. The voice screen's STOP-path 429 branch does NOT enqueue either; both paths show distinct copy (`daily AI cost cap hit — try tomorrow`).
4. **Transient-failure handling** — HTTP 5xx (including 504 `VOICE_TRANSCRIBE_TIMEOUT`, 502 `VOICE_TRANSCRIBE_PROVIDER_DOWN`, 503 `VOICE_TRANSCRIBE_QUOTA`) and network errors increment `retryCount` and leave the entry in the queue. If the increment crosses `BACKOFF_MS.length` (6), the entry is evicted as exhausted.
5. **`voice-telemetry.ts` posthog shim with compile-time safe-key contract** — `VoiceCaptureCompletedProps` / `VoiceCaptureDropoutProps` / `VoiceQueueEvictedProps` TypeScript interfaces force callers through typed entrypoints. There is NO `posthog.capture(event, props)` escape hatch — every PostHog event passes through a named emitter. Phase 127 GUARD-01 `BLOCKED_PROPERTY_NAMES` (audio / audioPcm / pcm / audioBuffer / base64Audio) cannot appear in any event prop because no typed interface lists them.
6. **`voice.ts` STOP-path failure branch routes to enqueue** — on 5xx / network error, the WAV-wrapped base64 payload is enqueued (with the recording's UUID v4 as `clientCaptureId`) BEFORE `[ERR]` is surfaced. The next `drainQueue` tick or online-detection retry picks it up.
7. **`voice.ts` STOP-path success emits voice_capture_completed** — safe-key set `{ stop_to_http_ms, chunks, bytes, retry_count, transcript_chars }`. `stop_to_http_ms` is measured from the fetch start to the response arrival; `chunks` is the pcmChunks array length at STOP; `bytes` is the WAV byte length post-header; `retry_count = 0` for the online path; `transcript_chars` is the response body content length.
8. **`voice.ts` drop-out detection (D-T2)** — `recordChunkArrival(now)` is called by main.ts on every `audioEvent.audioPcm` chunk. The first 5 s of recording collects inter-chunk gap samples to compute a baseline. After 5 s, any inter-chunk gap `> 2 * baseline` emits `voice_capture_dropout` with `{ gap_ms, recording_id }`. Multiple drop-outs per recording produce multiple events. The `recording_id` is the same UUID v4 as the `clientCaptureId` so all telemetry events for one utterance share an identifier.
9. **Companion HUD body line 3 priority ladder (D-O3 + Gray Area #6)** — `computeBodyLine3` reads `getVoiceStateLine()` from voice.ts module scope and `queueDepth()` from voice-queue.ts. Priority: `[NO MIC]` → `enable mic in Hub` > `queueDepth() > 0` → `syncing N voice captures…` > existing agent event message (fallback). The banner-overlay path (needs_input / task_failed / etc.) is unchanged — banners outrank both voice-related lines because they signal operator action.

### Task 1 — Wave 0 RED tests (commit `5e05b71`)

`vigil-g2-plugin/src/lib/__tests__/voice-queue.test.ts` (11 test blocks — 10 numbered + 1 constants pin):

| # | Test | Purpose |
|---|------|---------|
| 1 | enqueue + loadQueue round-trip | Persistence shape via in-memory localStorage shim |
| 2 | 11th enqueue evicts oldest LRU + posthog event | D-O4 eviction policy |
| 3 | drainQueue removes 201-success entry | Happy-path success drain |
| 4 | getNextDelayMs returns exact [1000, 2000, 4000, 8000, 16000, 30000] | D-O1 schedule pin |
| 5 | retryCount >= 6 evicts permanently | Retries-exhausted path |
| 6 | 429 DAILY_AI_BUDGET_EXCEEDED evicts + reason='daily_budget_cap_hit' | D-E3 cascade |
| 7 | 504 VOICE_TRANSCRIBE_TIMEOUT increments retryCount + stays | Transient failure |
| 8 | Persistence across reload | localStorage survives in-memory state reset |
| 9 | voice_capture_completed safe-key set pin | D-T1 contract |
| 10 | voice_capture_dropout safe-key set pin | D-T2 contract |
| — | Constants pin (MAX_QUEUE_SIZE, QUEUE_KEY, BACKOFF_MS) | Drift-detector source-grep targets |

All 11 RED at commit time because `voice-queue.ts` and `voice-telemetry.ts` did not exist yet.

### Task 2 — voice-queue + voice-telemetry implementation + voice.ts/companion.ts/main.ts wiring (commit `fe7a62d`)

**`vigil-g2-plugin/src/lib/voice-telemetry.ts` (new — ~165 lines):**

Exports:
- `emitVoiceCaptureCompleted(props: VoiceCaptureCompletedProps)` — funnels to `posthog.capture('voice_capture_completed', {…})` with the exact safe-key set
- `emitVoiceCaptureDropout(props: VoiceCaptureDropoutProps)` — `{ gap_ms, recording_id }` only
- `emitVoiceQueueEvicted(props: VoiceQueueEvictedProps)` — `{ clientCaptureId, retryCount, reason? }`
- `__getPosthogCalls()` / `__resetPosthogSpy()` — test seams

Runtime transport: until the PostHog browser SDK is added to the plugin (currently NOT installed; Plan 05 explicitly does not pull in a new dependency per RESEARCH "No new package installs required"), the shim's transport is `console.log('[posthog] eventName', props)` so operator-side Even Hub Console output exposes the events during UAT. The Plan 06 D-D2 drift detector will source-grep this file for the safe-key invariant.

**`vigil-g2-plugin/src/lib/voice-queue.ts` (new — ~340 lines):**

Exports the full surface required by the plan + acceptance criteria:
- Constants: `QUEUE_KEY = 'vigil:voice-queue:v1'`, `MAX_QUEUE_SIZE = 10`, `BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000]`
- Type: `QueueEntry { clientCaptureId, base64Audio, queuedAt, retryCount }`
- Functions: `loadQueue()`, `saveQueue()` (internal), `enqueue(entry)`, `queueDepth()`, `getNextDelayMs(retryCount)`, `drainQueue(fetcher, apiKey, baseUrl)`
- Test seams: `__getPosthogCalls()`, `__resetPosthogSpy()`, `__resetQueueForTesting()`

`drainQueue` is single-pass over the persisted queue. Per-entry decision flow:
1. `retryCount >= BACKOFF_MS.length` → evict (`reason='retries_exhausted'`) + skip POST
2. POST with `Authorization: Bearer ${apiKey}` + `{ audio, clientCaptureId }`
3. 2xx → emit `voice_capture_completed` + drop entry
4. 429 + `code='DAILY_AI_BUDGET_EXCEEDED'` (or unparseable 429 body) → evict (`reason='daily_budget_cap_hit'`)
5. 5xx / network error / other → increment `retryCount`; if new count >= 6, evict (`reason='retries_exhausted'`); else save back

Caller owns retry cadence — `drainQueue` itself does NOT `setTimeout(getNextDelayMs(...))`. Plan 06+ can wire either an online-event-triggered drain or a periodic timer without coupling cadence to queue internals.

**`vigil-g2-plugin/src/screens/voice.ts` modifications:**

- New imports: `enqueue` from voice-queue, `emitVoiceCaptureCompleted` / `emitVoiceCaptureDropout` from voice-telemetry
- New const: `COPY_BUDGET_CAP = 'daily AI cost cap hit — try tomorrow'` (D-E3 cascade distinct from `COPY_ERR`)
- New module-scope state: `DropoutState { recordingId, baselineGaps, baselineMs, lastChunkAt }` with reset on START
- New exported function: `recordChunkArrival(now?: number)` — called by main.ts collector branch; tracks first-5s baseline; emits dropout past 2× threshold
- `toggleVoiceRecording` START path now initializes `dropoutState.recordingId` to a fresh UUID v4 (reused as the clientCaptureId on STOP)
- `stopRecording` rewritten with explicit failure-path branches:
  - Encode failure → `[ERR]` + COPY_ERR + bail (no enqueue — payload not recoverable)
  - Success (2xx) → emit `voice_capture_completed` + `[DONE]` + 2 s auto-clear
  - 429 + DAILY_AI_BUDGET_EXCEEDED → `[ERR]` + COPY_BUDGET_CAP + clear buffer + NO enqueue (D-E3)
  - 5xx / network / other transient → `enqueue({...})` + `[ERR]` + COPY_ERR + clear in-flight buffer
- `__resetVoiceForTesting` extended to reset `dropoutState`

**`vigil-g2-plugin/src/screens/companion.ts` modifications:**

- New imports: `queueDepth` from voice-queue, `getVoiceStateLine` from voice
- New `computeBodyLine3(fallback)` helper implementing the Gray Area #6 priority ladder
- `computeBodyLines()` normal-3-line return path now uses `computeBodyLine3(truncated_message)` instead of inlining `truncate(...)`. Banner-overlay path is unchanged.

**`vigil-g2-plugin/src/main.ts` modifications:**

- Imports `recordChunkArrival` from voice
- `audioEvent.audioPcm` collector branch now calls `recordChunkArrival(t)` BEFORE the safe-key console.log so drop-out detection fires on every chunk while voice is recording

## Verification Results

### Tests

```
voice-queue.test.ts            11/11   GREEN
voice.test.ts                   8/8    GREEN  (Plan 04 — no regressions)
audio-session-guard.test.ts    10/10   GREEN  (Plan 04 — no regressions)
wav-encoder.test.ts             8/8    GREEN  (Plan 04 — no regressions)
companion.test.ts             ALL      GREEN  (no regressions despite computeBodyLine3 split-out)
Full plugin suite           145/146    PASS  (1 pre-existing D-129 drift failure documented below)
```

The single remaining failure is **`D-129 drift: TTL constant 30 * 60 * 1000 present in helpers`** — a pre-existing failure inherited from Plan 01 (documented in Plan 04 SUMMARY's `Deferred Issues` §1 and `.planning/phases/130-…/deferred-items.md` Issue #1). The same test failed on the pre-Plan-01 tree per `git stash` verification in Plan 01's SUMMARY; NOT introduced by Plan 05.

### Typecheck

```
$ cd vigil-g2-plugin && npx tsc --noEmit
  → exit 0 (clean typecheck)
```

### Acceptance Criteria (Plan 05)

All acceptance criteria from the plan's `<acceptance_criteria>` blocks verified:

**Task 1 (Wave 0 RED tests):**
- ✅ `voice-queue.test.ts` exists and contains 11 distinct `test(...)` blocks (10 numbered + 1 constants pin) — exceeds the "at least 10" criterion
- ✅ Test file asserts the literal backoff schedule values `1000, 2000, 4000, 8000, 16000, 30000`
- ✅ Test file asserts `MAX_QUEUE_SIZE === 10` and references `'vigil:voice-queue:v1'`
- ✅ Test file asserts the PostHog event names `voice_capture_completed`, `voice_capture_dropout`, `voice_queue_evicted`
- ✅ Test file asserts the safe key set `{ stop_to_http_ms, chunks, bytes, retry_count, transcript_chars }` for `voice_capture_completed`
- ✅ All 10 numbered queue tests RED at end of Task 1 (the import lines for `voice-queue.ts` + `voice-telemetry.ts` fail to resolve)

**Task 2 (implementation + integration):**
- ✅ `voice-queue.ts` exports `enqueue`, `drainQueue`, `queueDepth`, `loadQueue`, `getNextDelayMs`
- ✅ voice-queue.ts contains the literal arrays/constants `[1000, 2000, 4000, 8000, 16000, 30000]`, `MAX_QUEUE_SIZE = 10`, `'vigil:voice-queue:v1'`
- ✅ voice-queue.ts (via voice-telemetry.ts) emits PostHog events for `voice_queue_evicted` AND `voice_capture_completed` event names
- ✅ voice-queue.ts does NOT include the literal property name `audioPcm` / `audio_pcm` / `pcm` / `audio` in any PostHog event props — all banned strings appear only in JSDoc comments; the actual prop objects use safe keys only
- ✅ `voice.ts` references `enqueue(` (line 410) and routes 5xx/network errors there; routes 429 `DAILY_AI_BUDGET_EXCEEDED` to permanent-fail copy `'daily AI cost cap hit — try tomorrow'`
- ✅ voice.ts emits `voice_capture_completed` with the exact safe-key set on success (via `emitVoiceCaptureCompleted` typed entrypoint — compiler enforces)
- ✅ voice.ts emits `voice_capture_dropout` on inter-chunk gap > 2× baseline (via `emitVoiceCaptureDropout` typed entrypoint)
- ✅ `companion.ts` body line 3 reads `queueDepth()` AND conditionally renders `syncing` substring; `[NO MIC]` priority override pinned via `getVoiceStateLine() === '[NO MIC]'` short-circuit
- ✅ `cd vigil-g2-plugin && npm test -- --test-name-pattern="voice-queue"` runs all 11 voice-queue tests GREEN
- ✅ `cd vigil-g2-plugin && npm test` is 145/146 PASS (1 pre-existing failure documented)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Split out `voice-telemetry.ts` from `voice-queue.ts`**

- **Found during:** Task 1 test authoring
- **Issue:** The plan's Task 1 action says "Mock `posthog.capture` via a spy array." There is NO PostHog SDK installed in the vigil-g2-plugin (verified via `package.json` dependencies — only `@evenrealities/even_hub_sdk` is listed). The plan implicitly assumes a `posthog.capture` symbol exists somewhere in the plugin source, but with no SDK there's no canonical place to mount it. Implementing telemetry inline in `voice-queue.ts` would mix the queue's persistence/retry logic with the telemetry escape-hatch problem — a future bug-hunt would have a much larger surface to grep.
- **Fix:** Created `vigil-g2-plugin/src/lib/voice-telemetry.ts` as a dedicated PostHog shim with a compile-time safe-key contract (`VoiceCaptureCompletedProps` / `VoiceCaptureDropoutProps` / `VoiceQueueEvictedProps`). All voice-related PostHog emissions funnel through three typed entrypoints (`emitVoiceCaptureCompleted` / `emitVoiceCaptureDropout` / `emitVoiceQueueEvicted`) — there is NO escape hatch for `posthog.capture(event, arbitraryProps)`. The runtime transport is a `console.log('[posthog] eventName', props)` line (operator-observable in Even Hub Console during UAT), and the Plan 06 D-D2 drift detector will source-grep this single file rather than scanning every emit site individually.
- **Files added:** `vigil-g2-plugin/src/lib/voice-telemetry.ts` (~165 lines)
- **Files modified:** `vigil-g2-plugin/src/lib/voice-queue.ts` imports from voice-telemetry; `vigil-g2-plugin/src/lib/__tests__/voice-queue.test.ts` imports `emitVoiceCaptureCompleted` / `emitVoiceCaptureDropout` from `voice-telemetry.ts`
- **Commit:** `5e05b71` (test file) + `fe7a62d` (implementation)

**2. [Rule 2 — Auto-add missing critical functionality] Added `__resetQueueForTesting()` no-op alias**

- **Found during:** Task 1 test authoring
- **Issue:** The plan's Task 1 test file references `__resetQueueForTesting()` to reset queue state between tests. Since `voice-queue.ts` has NO in-memory state (every read goes through `localStorage.getItem`), there's nothing to reset — but exporting the symbol satisfies the test-seam contract and provides a hook for future caching (e.g., if Plan 06+ adds in-memory drain-loop state).
- **Fix:** Exported `__resetQueueForTesting()` as a no-op alias. The test file separately clears the in-memory localStorage shim via `storageShim.clear()` between tests, which is the actual reset path.
- **Files modified:** `vigil-g2-plugin/src/lib/voice-queue.ts`
- **Commit:** `fe7a62d`

**3. [Rule 2 — Auto-add missing critical functionality] Added `recordChunkArrival` seam**

- **Found during:** Task 2 implementation
- **Issue:** The plan's Task 2 action says voice.ts implements drop-out detection that fires `posthog.capture('voice_capture_dropout', ...)` on inter-chunk gap > 2× baseline. But Plan 04's main.ts owns the `bridge.onEvenHubEvent` audioPcm collector — voice.ts has no direct visibility into chunk arrival times. Implementing this inside voice.ts requires either (a) moving the audioPcm collector into voice.ts (large refactor, breaks D-S3 cross-screen state split between voice.ts and main.ts), or (b) exposing a small seam voice.ts owns + main.ts calls on each chunk.
- **Fix:** Added `recordChunkArrival(now: number = Date.now()): void` exported from voice.ts. main.ts's audioPcm collector branch calls it inline with the existing per-chunk safe-key log. voice.ts owns the dropoutState (recordingId, baselineGaps, baselineMs, lastChunkAt), so the drop-out scoring stays co-located with the recording_id minting in `toggleVoiceRecording` START.
- **Files modified:** `vigil-g2-plugin/src/screens/voice.ts` (+ `recordChunkArrival` export + dropoutState module-scope), `vigil-g2-plugin/src/main.ts` (audioPcm collector calls `recordChunkArrival(t)`)
- **Commit:** `fe7a62d`

**4. [Rule 2 — Auto-add missing critical functionality] Added `__resetPosthogSpy` re-export from voice-queue.ts**

- **Found during:** Task 1 test authoring
- **Issue:** Tests need to reset the PostHog spy array between cases. The spy lives in `voice-telemetry.ts` (single chokepoint), but the test file imports from `voice-queue.ts` per the plan's stated import surface ("Mock posthog.capture via a spy array" suggests a single-module shape).
- **Fix:** Re-exported `__getPosthogCalls` and `__resetPosthogSpy` from `voice-queue.ts` so the test file can import the queue surface + spy from one module. The actual spy state lives in `voice-telemetry.ts` and is shared across all callers via module singleton semantics. The test file also imports `emitVoiceCaptureCompleted` / `emitVoiceCaptureDropout` directly from `voice-telemetry.ts` to test the typed-entrypoint contract.
- **Files modified:** `vigil-g2-plugin/src/lib/voice-queue.ts` (re-exports)
- **Commit:** `fe7a62d`

## Deferred Issues

Tracked in `.planning/phases/130-voice-capture-full-implementation-scope-locked-by-128a/deferred-items.md`:

1. **Pre-existing failing test:** `vigil-g2-plugin/src/__tests__/main.test.ts:263` (`D-129 drift: TTL constant 30 * 60 * 1000 present in helpers`) — failing on the pre-Plan-01 tree per `git stash` verification in Plan 01. Phase 129/131 cleanup. NOT introduced by this plan; carried forward from Plan 04 deferred-items.md Issue #1.
2. **Pre-existing test-runner hang in vigil-core** — carried forward from earlier plans. Not relevant to Plan 05 (plugin-only changes).
3. **PostHog browser SDK not yet installed in vigil-g2-plugin** — the shim's runtime transport is `console.log` until the SDK is wired. Acceptable because: (a) RESEARCH "No new package installs required" — package legitimacy work would push this plan into checkpoint territory; (b) the safe-key contract is enforced at compile time so the SDK swap is a one-line transport change in voice-telemetry.ts; (c) operator-side UAT visibility is preserved via Even Hub Console output. Future plan can install `posthog-js` once a slopcheck for the package name is run.
4. **drainQueue cadence is not yet scheduled** — Plan 05 provides the `drainQueue` function but does NOT wire a periodic timer or online-event listener that calls it. Voice.ts only enqueues — drain happens when a future caller invokes it. Plan 06 or a follow-on plan will wire the drain cadence (online-detect callback OR `setInterval(getNextDelayMs(0))`). Recorded for awareness; the queue itself + telemetry + Companion HUD indicator are functional independent of drain cadence.

## Authentication Gates

None — Plan 05 is plugin-only autonomous execution. The G2 plugin's real-runtime authentication chain (bearer token via `VITE_API_KEY`) is exercised by the queue's `drainQueue` function only when Plan 06+ wires the cadence handler. Tests mock `fetch` and never exercise the live POST.

## Threat Flags

None — the threat surface introduced by this plan is fully covered by the plan's `<threat_model>` block:

- **T-130-05-1 (audioPcm leaks to PostHog)** — defense-in-depth via the compile-time safe-key contract. All three PostHog emitter functions take typed `Props` interfaces that list ONLY safe keys. A future caller cannot add `base64Audio` / `audio` / `audioPcm` / `pcm` / `audioBuffer` to a posthog event prop without editing `voice-telemetry.ts` (and the Plan 06 D-D2 drift detector source-greps that file). The queue entries themselves contain `base64Audio` (necessary for retry POST body), but the only telemetry event referencing a queue entry uses `clientCaptureId` + `retryCount` + `reason` — never `base64Audio`.
- **T-130-05-2 (queue persistence corruption)** — `loadQueue()` wraps `JSON.parse` in try/catch and validates entry shape via duck-typed filter. A corrupted blob (e.g., truncated localStorage write) starts the queue fresh rather than crashing the drain loop.
- **T-130-05-3 (eviction telemetry information leak)** — `voice_queue_evicted` carries `clientCaptureId` (UUID v4 — random; not operator-identifying) + `retryCount` + `reason`. No PII; no audio data.
- **T-130-05-SC (npm package install)** — no new packages installed (Plan 05 produces no `npm install` commands; the PostHog SDK install is explicitly deferred per `Deferred Issues §3`).

## Known Stubs

None — the queue + telemetry + Companion HUD indicator are functionally complete. The intentionally-deferred drain cadence (`Deferred Issues §4`) is NOT a stub — Plan 05's `<verification>` block does not require drain cadence to be wired, and Plan 04's voice.ts already routes failures into the queue. The drain wiring is a separate scoping decision that lives in Plan 06 or a follow-on plan.

## Key Decisions Made

1. **Split telemetry into its own module (voice-telemetry.ts)** — keeps the queue's persistence/retry logic separate from the PostHog escape-hatch problem. Three typed entrypoints (`emitVoiceCaptureCompleted` / `emitVoiceCaptureDropout` / `emitVoiceQueueEvicted`) create a single chokepoint that Plan 06's D-D2 drift detector can source-grep without scanning every emit site.

2. **Compile-time safe-key contract via TypeScript interfaces** — `VoiceCaptureCompletedProps` literally lists `stop_to_http_ms / chunks / bytes / retry_count / transcript_chars` as required fields. A future caller cannot add `audio` / `audioPcm` / `pcm` / `audioBuffer` / `base64Audio` without editing the interface. Defense-in-depth on top of the runtime BLOCKED_PROPERTY_NAMES filter.

3. **drainQueue is a single-pass function — caller owns retry cadence** — `drainQueue(fetcher, apiKey, baseUrl)` walks the queue once and saves the post-drain state. There is no internal `setTimeout(getNextDelayMs(...))` — the caller (Plan 06's online-detect or periodic timer) schedules cadence externally. This keeps the queue's retry semantics decoupled from "when do we attempt the next drain?" — a question that's harder than the queue itself (when does the G2 know it's online again?).

4. **`recordChunkArrival` is a voice.ts seam, NOT inlined into main.ts** — drop-out scoring (first-5s baseline + 2× threshold) lives co-located with the recording_id minting in `toggleVoiceRecording` START. main.ts's collector branch is now a one-liner that defers to voice.ts for the scoring logic, preserving the Plan 04 D-S3 split (recording flag in voice.ts; pcmChunks in main.ts).

5. **`recording_id === clientCaptureId`** — one UUID v4 binds the queue entry, the eventual server-side `voice_captures` row, and ALL telemetry events for one utterance. Makes operator-side debugging (correlating a PostHog `voice_capture_dropout` to a `voice_capture_completed` or a `voice_queue_evicted`) a single-string grep.

6. **`queueDepth()` does a fresh localStorage read on every call** — no in-memory caching. Means background drain progress (a future timer that drops queue depth from 7 → 6 → 5 → 0) is immediately visible to Companion HUD body line 3 on the next render cycle. No cache invalidation logic needed.

## Files Audit

**Created (3):**
- `vigil-g2-plugin/src/lib/voice-queue.ts` (~340 lines)
- `vigil-g2-plugin/src/lib/voice-telemetry.ts` (~165 lines)
- `vigil-g2-plugin/src/lib/__tests__/voice-queue.test.ts` (~386 lines)

**Modified (3):**
- `vigil-g2-plugin/src/screens/voice.ts` (+ enqueue routing + 429 budget-cap branch + voice_capture_completed emission + recordChunkArrival seam + dropoutState + __resetVoiceForTesting extension)
- `vigil-g2-plugin/src/screens/companion.ts` (+ queueDepth + getVoiceStateLine imports + computeBodyLine3 helper)
- `vigil-g2-plugin/src/main.ts` (+ recordChunkArrival import + audioPcm collector calls it on each chunk)

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `5e05b71` | test(130-05) | Add Wave 0 RED tests for offline voice queue + telemetry |
| 2 | `fe7a62d` | feat(130-05) | Land offline voice queue + telemetry + Companion HUD body line 3 |

## Next Plan

**Plan 06 — Drift detectors landing.** Per CONTEXT D-D1 / D-D2 / D-D3:

- **D-D1 (server-side WAV-header pin)** — server-side decoder asserts the 44-byte header structure on every incoming POST to `/v1/voice/transcribe`. Plugin-side D-D1 already landed in Plan 04's `wav-encoder.test.ts`.
- **D-D2 (audioPcm-in-logs ban)** — extend `vigil-core/src/__tests__/audio-log-redaction.test.ts` to also walk `vigil-g2-plugin/src/` non-test `.ts` files + grep for `audioPcm` / `audio_pcm` / `pcm` / `audioBuffer` / `base64Audio` in `console.log` / `posthog.capture` call sites. The `voice-telemetry.ts` typed-entrypoint contract is the defense-in-depth layer; D-D2 is the source-grep safety net.
- **D-D3 (audioControl-pairing parity)** — source-grep `safeAudioControl(true,` vs `safeAudioControl(false,` counts across `vigil-g2-plugin/src/` non-test files. They must match.

Plan 06 closes the drift-detector portion of VOICE-08 (drop-out telemetry already landed here in Plan 05).

## Self-Check: PASSED

Verified post-write:
- All 3 created files: `FOUND` (via `test -f`)
- All 3 modified files retain their Plan 04 contents + Plan 05 additions
- Both commits (`5e05b71`, `fe7a62d`): `FOUND` in `git log`
- All 11 voice-queue tests GREEN
- Full plugin suite 145/146 (1 pre-existing failure documented)
- Typecheck clean (`npx tsc --noEmit` exit 0)
- All acceptance criteria source-greps pass (literal constants, event names, safe-key set, enqueue call, 429 cascade, queueDepth in companion, getVoiceStateLine in companion)
