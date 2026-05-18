---
phase: 130
plan: 04
subsystem: voice-capture
tags: [voice-screen, wav-encoder, safeAudioControl, run-4, double-click, VOICE-02, VOICE-03, VOICE-04]
dependency_graph:
  requires:
    - "Phase 130 Plan 01 — clean spike-removal baseline (voice-spike.ts deleted, navigation/main reverted)"
    - "Phase 130 Plan 02 — POST /v1/voice/transcribe production route (Plan 04 client targets this server route)"
    - "Phase 127 GUARD-02 audio-session-guard (safeAudioControl wrapper — D-C3 carry-forward)"
  provides:
    - "Production VOICE screen with DOUBLE_CLICK toggle (VOICE-02 gesture surface)"
    - "Cross-screen recording state survival via module-scope flags (VOICE-03)"
    - "PCM accumulation + WAV wrap + base64 POST + UUID v4 clientCaptureId (VOICE-04)"
    - "safeAudioControl Promise<boolean> signature — callers observe denial and short-circuit on false (Run 4 §1-3)"
    - "wav-encoder.ts buildWav() — 44-byte RIFF/WAVE/16kHz mono/16-bit-LE/data container (Plan 06 D-D1 pins this)"
  affects:
    - "vigil-g2-plugin/src/navigation.ts (Screen enum + SCREEN_ORDER carousel position)"
    - "vigil-g2-plugin/src/main.ts (audioEvent PCM collector + DOUBLE_CLICK routing)"
    - "vigil-g2-plugin/src/constants.ts (VOICE_HEADER/BODY/FOOTER container IDs)"
    - "vigil-g2-plugin/src/api.ts (defensive import.meta.env read for test-context portability)"
    - "vigil-g2-plugin/src/__tests__/navigation.test.ts (SCREEN_ORDER drift detector 4-slot → 5-slot)"
tech_stack:
  added: []
  patterns:
    - "Module-scope state singleton for cross-screen survival (D-S3 pattern — voice.ts owns the recording flag; main.ts owns pcmChunks because that's where bridge.onEvenHubEvent is registered)"
    - "Run 4 caller pattern — `try { granted = await safeAudioControl(true, bridge) } catch { granted = false }` then short-circuit on !granted"
    - "Safe-key telemetry log (`bytes` / `t` instead of `audioPcm` / `audio_pcm` / `pcm`) — defense-in-depth alongside Phase 127 GUARD-01 BLOCKED_PROPERTY_NAMES"
    - "Container name ≤ 11 chars ('voice-body' / 'voice-head' / 'voice-foot') — Phase 125 hardware-debug fix"
    - "DOUBLE_CLICK pre-intercept in main.ts BEFORE handleNavEvent delegation (mirrors Phase 124 COMPANION carve-out pattern at navigation.ts:244-263)"
key_files:
  created:
    - "vigil-g2-plugin/src/lib/wav-encoder.ts (~88 lines)"
    - "vigil-g2-plugin/src/screens/voice.ts (~360 lines)"
    - "vigil-g2-plugin/src/__tests__/wav-encoder.test.ts (~85 lines)"
    - "vigil-g2-plugin/src/screens/__tests__/voice.test.ts (~210 lines)"
  modified:
    - "vigil-g2-plugin/src/lib/audio-session-guard.ts (signature + final-line change)"
    - "vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts (+ 4 Run 4 boolean-return tests + audioControlResult/Throw options on fake bridge)"
    - "vigil-g2-plugin/src/main.ts (+ voice imports + module-scope voiceRecording/pcmChunks + audioEvent collector + DOUBLE_CLICK Screen.VOICE branch)"
    - "vigil-g2-plugin/src/navigation.ts (+ Screen.VOICE + SCREEN_ORDER slot 2 + buildScreen case)"
    - "vigil-g2-plugin/src/constants.ts (+ VOICE_HEADER/BODY/FOOTER)"
    - "vigil-g2-plugin/src/api.ts (defensive import.meta.env read)"
    - "vigil-g2-plugin/src/__tests__/navigation.test.ts (SCREEN_ORDER 4-slot → 5-slot drift detector update)"
decisions:
  - "D-S1/D-S2/D-S3 enforced verbatim — 6-state machine, Promise<boolean> safeAudioControl, module-scope recording flag for cross-screen survival"
  - "D-U3 endpoint shape enforced — POST /v1/voice/transcribe with { audio: base64Wav, clientCaptureId: crypto.randomUUID() } + Bearer ${API_KEY}"
  - "D-D1 byte-map pinned at producer side — wav-encoder.test.ts asserts all 8 RIFF/WAVE/fmt /16kHz mono/16-bit/data byte positions"
  - "Run 4 §3 try/catch — bridge.audioControl throw treated identically to false (both surface [NO MIC] with body line 2 'enable mic in Hub'); Run 4 §5 [NO MIC] vs [ERR] body-copy distinction enforced ('enable mic in Hub' vs 'retry — tap to dismiss')"
  - "Carousel position: VOICE slot 2 (after COMPANION, before WORK_ORDERS) per CONTEXT specifics §'Voice screen carousel position — default: after Companion, before Tasks'"
  - "Container names ≤ 11 chars per Phase 125 hardware-debug fix ('voice-body', 'voice-head', 'voice-foot')"
  - "Auto-deviation Rule 3 — api.ts: defensive import.meta.env read so transitive imports from screens/voice.ts no longer crash under `tsx --test`. Production Vite bundles still inline VITE_* values at compile time."
  - "Auto-deviation Rule 3 — navigation.test.ts: SCREEN_ORDER drift detector updated from 4-slot to 5-slot lock with VOICE at slot 2. The test's own comments at lines 74-75 explicitly predicted this extension."
metrics:
  duration_minutes: 25
  completed_date: "2026-05-18"
  tasks_completed: 3
  files_created: 4
  files_modified: 7
  lines_changed: ~1030
---

# Phase 130 Plan 04: Production Voice Screen + Run 4 Hardening Summary

**One-liner:** Production VOICE screen with full Run 4 state machine ([IDLE]/[REC m:ss]/[UPLOADING…]/[DONE]/[NO MIC]/[ERR]) + safeAudioControl hardened to `Promise<boolean>` so callers observe permission denial + wav-encoder builds 44-byte RIFF/WAVE/16kHz mono container + main.ts cross-screen state (voiceRecording + pcmChunks) survives carousel rebuild; closes VOICE-02 / VOICE-03 / VOICE-04.

## What Shipped

Plan 04 lands the **client side** of the G2 voice anchor end-to-end:

1. **DOUBLE_CLICK gesture toggle** on the new VOICE screen (slot 2 of SCREEN_ORDER, after Companion / before Work Orders).
2. **Six-state UI machine** — `[IDLE]` → `[REC m:ss]` → `[UPLOADING…]` → `[DONE]` (2s auto-clear to `[IDLE]`); error branches `[NO MIC]` (permission denied) and `[ERR]` (transcribe failure / network down).
3. **safeAudioControl Run 4 hardening** — signature changes from `Promise<void>` → `Promise<boolean>`; the final line is now `return bridge.audioControl(on)` rather than `await bridge.audioControl(on)` (no discard). All 4 cleanup hooks (ABNORMAL_EXIT / SYSTEM_EXIT / beforeunload / onBackgroundRestore) are UNCHANGED.
4. **PCM buffer + WAV wrap + base64 POST** — pcmChunks accumulate in main.ts module scope (via `bridge.onEvenHubEvent` collector when voiceRecording is true), concatenate on STOP, WAV-wrap via the new `wav-encoder.ts buildWav`, base64-encode, and POST to `/v1/voice/transcribe` with `{ audio, clientCaptureId: crypto.randomUUID() }` + `Bearer ${API_KEY}`.
5. **Cross-screen state survival (D-S3)** — voice.ts's module-scope `recording` flag and main.ts's module-scope `pcmChunks` array both survive carousel rebuild on swipe. The user can swipe to Companion mid-utterance without losing recording state.

### Task 1 — Wave 0 RED tests (commit `fbf07b1`)

Three test files authored:

| File | Purpose | Tests |
|---|---|---|
| `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` | D-D1 byte-position pin | 8 (RIFF/WAVE/fmt /data markers + channels=1 + sample rate=16000 + byte rate=32000 + bit depth=16 + data length + total length + RIFF chunk size) |
| `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` (extend) | Run 4 §1-4 Promise<boolean> signature | 4 new (true/false/throw return paths + `typeof result === 'boolean'` signature pin) — preserves the 6 existing cleanup-hook tests UNCHANGED |
| `vigil-g2-plugin/src/screens/__tests__/voice.test.ts` | D-S1 state machine + D-U3 POST + D-S3 cross-screen survival | 8 (initial state, START true/false/throw paths, STOP success → [DONE], STOP failure → [ERR], cross-screen survival, copy lock) |

All 20 new/extended tests RED at task end — wav-encoder.ts and voice.ts did not exist yet; the 4 Run 4 tests failed because safeAudioControl was still `Promise<void>` (resolved to `undefined`).

### Task 2 — WAV encoder + safeAudioControl signature hardening (commit `e3925a6`)

**`vigil-g2-plugin/src/lib/wav-encoder.ts` (new):**
- `buildWav(pcm: Uint8Array): Uint8Array` produces a 44-byte WAV header followed by the raw PCM data.
- Pinned byte positions: `RIFF` at 0-3, RIFF chunk size at 4 (= 36 + pcm.length), `WAVE` at 8-11, `fmt ` at 12-15 (trailing space significant), PCM subchunk size = 16 at offset 16, audio format = 1 (PCM) at offset 20, channel count = 1 (mono) at offset 22, sample rate = 16000 at offset 24, byte rate = 32000 at offset 28, block align = 2 at offset 32, bit depth = 16 at offset 34, `data` at offset 36-39, PCM data length at offset 40, raw PCM bytes from offset 44 onward.
- 16 kHz × 16-bit × mono is the format the Even Hub SDK emits via `audioEvent.audioPcm` (verified in Phase 128a spike). gpt-4o-mini-transcribe accepts that shape natively.

**`vigil-g2-plugin/src/lib/audio-session-guard.ts` (modified):**
- Return type `Promise<void>` → `Promise<boolean>`.
- Final two lines (`audioActive = on; await bridge.audioControl(on);`) → `audioActive = on; return bridge.audioControl(on);` — returns the SDK ack value so callers can observe denial.
- All 4 cleanup hooks (lines 94-155) UNCHANGED.

Wave 0 tests for wav-encoder + audio-session-guard: 8/8 + 10/10 GREEN.

### Task 3 — Production voice.ts + main.ts cross-screen state + navigation + constants wiring (commit `10a6bd0`)

**`vigil-g2-plugin/src/screens/voice.ts` (new — ~360 lines):**

Exports:
- `buildVoiceScreen(isRecording: boolean): RebuildPageContainer` — renders the 3-container layout (header + body + footer) reading module-scope `stateLine` / `bodyLine2` / `recordingStartedAt`
- `toggleVoiceRecording(bridge, pcmChunks, onStateChange?)` — START/STOP toggle implementing the Run 4 caller pattern
- `getVoiceRecording(): boolean` — read-only accessor for navigation.ts carousel rebuild call site
- `getVoiceStateLine()`, `getVoiceBodyLine2()`, `__resetVoiceForTesting()` — test-only accessors mirroring the audio-session-guard.ts precedent

Module-scope state (D-S3 cross-screen survival):
- `recording: boolean` — source of truth for the recording flag
- `stateLine: StateLine` — union type of 6 D-S1 strings
- `bodyLine2: string` — distinct copy for `[NO MIC]` ('enable mic in Hub') vs `[ERR]` ('retry — tap to dismiss')
- `recordingStartedAt: number | null` — used to compute live elapsed counter for `[REC m:ss]` on every buildVoiceScreen call (no interval timer needed)
- `doneTimer: ReturnType<typeof setTimeout> | null` — the 2s auto-clear timer from `[DONE]` → `[IDLE]`

Container names ≤ 11 chars per Phase 125 hardware-debug fix: `'voice-head'` / `'voice-body'` / `'voice-foot'`. The body container has `isEventCapture: 1` per the companion.ts:386-399 pattern so DOUBLE_CLICK routes through.

Run 4 caller pattern in `toggleVoiceRecording`:
```typescript
try {
  granted = await safeAudioControl(true, bridge)
} catch {
  granted = false
}
if (!granted) {
  stateLine = '[NO MIC]'
  bodyLine2 = COPY_NO_MIC
  recording = false
  await onStateChange?.()
  return
}
// proceed with recording
```

STOP path:
1. `safeAudioControl(false, bridge)` — close mic; ack value observed but we proceed regardless (defense-in-depth)
2. `stateLine = '[UPLOADING…]'` + UI rebuild
3. Concatenate `pcmChunks` into a single `Uint8Array`
4. `buildWav(pcm)` → WAV-wrapped bytes
5. Base64-encode (chunked `btoa` for large payloads; Node `Buffer` fallback for test contexts)
6. `crypto.randomUUID()` → clientCaptureId
7. `fetch(${BASE_URL}/voice/transcribe, { method: 'POST', headers: { Authorization: Bearer ${API_KEY}, Content-Type: application/json }, body: JSON.stringify({ audio, clientCaptureId }) })`
8. 2xx → `stateLine = '[DONE]'` + schedule 2s timer to `[IDLE]`; clear pcmChunks
9. Non-2xx → `stateLine = '[ERR]'` + `bodyLine2 = COPY_ERR`; pcmChunks left for Plan 05 offline queue retry

**`vigil-g2-plugin/src/main.ts` (modified):**
- Module-scope `let voiceRecording = false; const pcmChunks: Uint8Array[] = []` — pcmChunks lives at main.ts module scope because the `bridge.onEvenHubEvent` listener registration lives there.
- Audio collector branch — when `voiceRecording === true` AND `event.audioEvent?.audioPcm` is truthy, push chunk to pcmChunks and log `[voice] chunk bytes=${chunk.length} t=${Date.now()}` (safe-key names only; never `audioPcm` / `audio_pcm` / `pcm`).
- DOUBLE_CLICK pre-intercept — when `getCurrentScreen() === Screen.VOICE` and any of `textEvent / listEvent / sysEvent` reports DOUBLE_CLICK_EVENT, route to `toggleVoiceRecording` BEFORE delegating to `handleNavEvent` (otherwise the default DOUBLE_CLICK → HOME path would consume the gesture).
- `voiceRecording` mirror updated via the onStateChange callback (also rebuilds the screen so the operator sees `[REC m:ss]` / `[UPLOADING…]` / `[DONE]` transitions within the same gesture frame).

**`vigil-g2-plugin/src/navigation.ts` (modified):**
- `Screen.VOICE = 'voice'` added to enum.
- `Screen.VOICE` inserted at slot 2 of SCREEN_ORDER (carousel: HOME → COMPANION → VOICE → WORK_ORDERS → AFFIRMATION).
- `case Screen.VOICE` added to `buildScreen` switch — returns `buildVoiceScreen(getVoiceRecording())` so the screen re-renders with current state on every rebuild.

**`vigil-g2-plugin/src/constants.ts` (modified):**
- Added `VOICE_HEADER: 16`, `VOICE_BODY: 17`, `VOICE_FOOTER: 18`.

## Verification Results

### Tests

```
wav-encoder.test.ts            8/8    GREEN
audio-session-guard.test.ts   10/10   GREEN (6 existing + 4 new Run 4 §1-4)
voice.test.ts                  8/8    GREEN
Full plugin suite           134/135   PASS (1 pre-existing failure documented below)
```

The single remaining failure is **`D-129 drift: TTL constant 30 * 60 * 1000 present in helpers`** — a pre-existing failure inherited from Plan 01 (documented in `deferred-items.md` Issue #1). It's the same test failing on the pre-Plan-01 tree per `git stash` verification in Plan 01's SUMMARY; not introduced by this plan.

### Build

```
$ cd vigil-g2-plugin && npx tsc --noEmit
  → exit 0 (clean typecheck)
```

### Acceptance Criteria (Plan 04)

All acceptance criteria from the plan's `<acceptance_criteria>` blocks verified:

**Task 1 (Wave 0 RED tests):**
- ✅ `wav-encoder.test.ts` references `buildWav` and asserts all 8 D-D1 header positions
- ✅ `audio-session-guard.test.ts` references `Promise<boolean>` and tests true/false/throw return paths
- ✅ `voice.test.ts` references `[NO MIC]`, `[ERR]`, `enable mic in Hub`, `retry — tap to dismiss` (D-S1 exact copy)
- ✅ All three new test groups RED at end of Task 1

**Task 2 (WAV encoder + signature hardening):**
- ✅ `wav-encoder.ts` exports `buildWav` with signature `(pcm: Uint8Array) => Uint8Array`
- ✅ `wav-encoder.ts` contains the literals `'RIFF'`, `'WAVE'`, `'fmt '`, `'data'` (via byte-position writes) AND the values `16000` and `32000`
- ✅ `audio-session-guard.ts` `safeAudioControl` return type is `Promise<boolean>`
- ✅ Final line of `safeAudioControl` is `return bridge.audioControl(on)` (no discard, no `await`)
- ✅ audio-session-guard.ts still contains 4 cleanup-hook registrations UNCHANGED
- ✅ wav-encoder + audio-session-guard tests exit 0 (GREEN)

**Task 3 (production voice.ts + wiring):**
- ✅ voice.ts exports `buildVoiceScreen`, `toggleVoiceRecording`, `getVoiceRecording`
- ✅ voice.ts references all 6 D-S1 states: `[IDLE]`, `[REC `, `[UPLOADING…]`, `[DONE]`, `[NO MIC]`, `[ERR]`
- ✅ voice.ts contains exact strings `'enable mic in Hub'` AND `'retry — tap to dismiss'`
- ✅ voice.ts contains `'/v1/voice/transcribe'` (via `${BASE_URL}/voice/transcribe`) and `clientCaptureId` literals
- ✅ voice.ts contains `crypto.randomUUID()` for clientCaptureId generation
- ✅ voice.ts wraps the safeAudioControl-true call in try/catch (Run 4 §3)
- ✅ voice.ts uses `containerName: 'voice-body'` (≤ 11 chars)
- ✅ voice.ts does NOT contain the substring `audioPcm` or `body.audio` in any log statement (the only log call is the UUID-fallback warning; the only `audioPcm` substring in the file lives inside a JSDoc comment, not a log call)
- ✅ main.ts contains `let voiceRecording = false` and `const pcmChunks: Uint8Array[] = []` at module scope
- ✅ main.ts contains a DOUBLE_CLICK_EVENT routing branch for `Screen.VOICE`
- ✅ main.ts per-chunk log uses `bytes=` and `t=` safe key names (NEVER `audioPcm=` or `pcm=`)
- ✅ navigation.ts contains `VOICE: 'voice'` enum entry, `Screen.VOICE` in SCREEN_ORDER, and a `case Screen.VOICE:` switch branch
- ✅ constants.ts contains `VOICE_HEADER`, `VOICE_BODY`, `VOICE_FOOTER` entries
- ✅ voice tests exit 0; full plugin suite green modulo the pre-existing D-129 TTL drift failure

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `vigil-g2-plugin/src/api.ts` — defensive `import.meta.env` read**

- **Found during:** Task 3 verification (`tsx --test` on voice.test.ts)
- **Issue:** `voice.ts` imports `BASE_URL` and `API_KEY` from `api.ts` (single-source-of-truth for the bearer + base URL). `api.ts` reads `import.meta.env.VITE_API_URL` at module load. Under Node's plain ESM loader (used by `tsx --test`), `import.meta.env` is `undefined` and the read `import.meta.env.VITE_API_URL` throws `TypeError: Cannot read properties of undefined (reading 'VITE_API_URL')`. This blocked the voice tests from running.
- **Fix:** Optional-chain the `env` access through `unknown`: `const _env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}`. Then `BASE_URL = _env.VITE_API_URL || …`. Production Vite bundles still inline `import.meta.env.VITE_*` values at compile time, so this is a pure test-context portability fix — no production behavior change.
- **Files modified:** `vigil-g2-plugin/src/api.ts`
- **Commit:** `10a6bd0`

**2. [Rule 3 - Blocking issue] `vigil-g2-plugin/src/__tests__/navigation.test.ts` — SCREEN_ORDER 4-slot → 5-slot lock**

- **Found during:** Task 3 verification (full plugin test suite)
- **Issue:** The Phase 130 Plan 01 `navigation.test.ts` reverted the SCREEN_ORDER drift detector from the Phase 128a spike's 5-slot lock to a 4-slot lock (`[HOME, COMPANION, WORK_ORDERS, AFFIRMATION]`) in anticipation of the production VOICE screen landing later. The test's own comments at lines 74-75 explicitly predicted this extension: "Phase 130 Plans 02-07 add the production VOICE screen as a NEW slot." Adding `Screen.VOICE` to SCREEN_ORDER (per CONTEXT specifics §"Voice screen carousel position" default of "after Companion, before Tasks") trips this 4-slot assertion.
- **Fix:** Updated the SCREEN_ORDER drift detector to lock 5 entries with `Screen.VOICE` at slot 2 (between COMPANION and WORK_ORDERS), preserving the slot 0/1/3/4 assertions for HOME/COMPANION/WORK_ORDERS/AFFIRMATION. This is the same Rule 3 mechanical revert pattern Plan 01 applied to the same file when it dropped slot 4 from 5 → 4.
- **Files modified:** `vigil-g2-plugin/src/__tests__/navigation.test.ts`
- **Commit:** `10a6bd0`

## Deferred Issues

Tracked in `.planning/phases/130-voice-capture-full-implementation-scope-locked-by-128a/deferred-items.md`:

1. **Pre-existing failing test:** `vigil-g2-plugin/src/__tests__/main.test.ts:263` (`D-129 drift: TTL constant 30 * 60 * 1000 present in helpers`) — failing on the pre-Plan-01 tree per `git stash` verification in Plan 01. Phase 129/131 cleanup. NOT introduced by this plan.
2. **Pre-existing test-runner hang in vigil-core** — carried forward from Plan 01 / Plan 02. Not relevant to Plan 04 (plugin-only changes).
3. **Pre-existing ai-budget Test 6 ("secondary assertion") fails under `npm test`** — carried forward from Plan 02. Not relevant to Plan 04.

## Authentication Gates

None — Plan 04 is plugin-only autonomous execution. The G2 plugin's real-runtime authentication chain (bearer token via `VITE_API_KEY`) is exercised against the production server route (`POST /v1/voice/transcribe`) only at hardware UAT time (Plan 07). Tests mock `fetch` and never exercise the live POST.

## Threat Flags

None — the threat surface introduced by this plan is fully covered by the plan's `<threat_model>` block:

- T-130-04-1 (mic-runaway) — `safeAudioControl` wrapper still wraps every call; Run 4 caller-side denial-observation added without weakening the existing cleanup-hook coverage. All 4 hooks UNCHANGED. Drift detector D-D3 (Plan 06) will source-grep for `safeAudioControl(true,` vs `safeAudioControl(false,` parity.
- T-130-04-2 (audioPcm in logs) — per-chunk log uses safe key names `bytes` and `t` only. The voice.ts file contains zero `console.log` calls touching PCM data (the only log is the UUID-fallback warning). Drift detector D-D2 (Plan 06) will source-grep the plugin to prevent regression.
- T-130-04-3 (base64 audio injection at server) — accepted; server-side `assertAudioSessionWithinCap` (Plan 02) gates the 1.92 MB / 60 s cap.
- T-130-04-SC (npm package install) — no new packages installed (Plan 04 produces no `npm install` commands).

## Known Stubs

None — Plan 04 wires the full client end-to-end against the Plan 02 server route. The offline queue (Plan 05) and drift detectors (Plan 06) are explicitly out-of-scope per the plan's `<objective>` and `<success_criteria>` blocks:

- **Offline queue (Plan 05)** — for Plan 04, a non-2xx POST response surfaces `[ERR]` with body line 2 "retry — tap to dismiss" but no actual retry happens. Plan 05 will wrap the fetch in queue-aware retry with the `[1s, 2s, 4s, 8s, 16s, 30s]` backoff schedule (D-O1). The `pcmChunks` buffer is intentionally NOT cleared on `[ERR]` so Plan 05's queue can pick up the payload.
- **Drift detectors (Plan 06)** — D-D1 (server-side WAV-header pin), D-D2 (audioPcm-in-logs ban), D-D3 (audioControl-pairing parity) all land in Plan 06. The client-side D-D1 pin already lives at `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts`.

## Key Decisions Made

1. **safeAudioControl signature change is single-line surgical** — only the return type (`Promise<void>` → `Promise<boolean>`) and the final-line `await` → `return` change. All 4 cleanup hooks are UNCHANGED. The audio-session-guard.test.ts file extends the existing 6 tests with 4 new boolean-return assertions; no existing test was modified.

2. **D-S3 cross-screen state split between voice.ts and main.ts** — the source of truth `recording` flag lives in voice.ts module scope (because navigation.ts's `case Screen.VOICE` reads it via `getVoiceRecording()` to drive carousel rebuild). The `pcmChunks` array lives in main.ts module scope (because `bridge.onEvenHubEvent` is registered inside main.ts's `init()`, and module scope is the only place the collector branch can push into a shared buffer with the toggle handler). main.ts maintains a `voiceRecording` mirror flag for the collector-branch fast-path gate, kept in sync via the `onStateChange` callback.

3. **DOUBLE_CLICK pre-intercept in main.ts (not navigation.ts)** — because `toggleVoiceRecording` needs access to `pcmChunks` (which lives in main.ts), the routing branch must run inside main.ts's `onEvenHubEvent` callback. Pre-intercepting BEFORE delegating to `handleNavEvent` is necessary because `handleNavEvent`'s default DOUBLE_CLICK_EVENT path routes to HOME and would otherwise consume the gesture.

4. **api.ts defensive env read (Rule 3 deviation)** — this is a one-line shape change to enable `tsx --test` portability without breaking Vite's production env inlining. Documented in deviations §1.

## Files Audit

**Created (4):**
- `vigil-g2-plugin/src/lib/wav-encoder.ts` (~88 lines)
- `vigil-g2-plugin/src/screens/voice.ts` (~360 lines)
- `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` (~85 lines)
- `vigil-g2-plugin/src/screens/__tests__/voice.test.ts` (~210 lines)

**Modified (7):**
- `vigil-g2-plugin/src/lib/audio-session-guard.ts` (signature + final-line)
- `vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` (+ 4 tests + fakeBridge options)
- `vigil-g2-plugin/src/main.ts` (+ voice imports + module-scope state + audioEvent collector + DOUBLE_CLICK Screen.VOICE branch)
- `vigil-g2-plugin/src/navigation.ts` (+ Screen.VOICE + SCREEN_ORDER slot 2 + buildScreen case)
- `vigil-g2-plugin/src/constants.ts` (+ VOICE_HEADER/BODY/FOOTER)
- `vigil-g2-plugin/src/api.ts` (defensive `import.meta.env` read — Rule 3 deviation)
- `vigil-g2-plugin/src/__tests__/navigation.test.ts` (SCREEN_ORDER 4-slot → 5-slot — Rule 3 deviation)

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `fbf07b1` | test(130-04) | Add Wave 0 RED tests for wav-encoder + voice screen + safeAudioControl Promise<boolean> signature |
| 2 | `e3925a6` | feat(130-04) | Add WAV encoder + harden safeAudioControl to Promise<boolean> |
| 3 | `10a6bd0` | feat(130-04) | Land production voice screen + main.ts cross-screen state + navigation + constants wiring |

## Next Plan

**Plan 05 — Offline queue + telemetry surface.** Per the plan's `<verification>` block and CONTEXT D-O1..O4:

- `vigil-g2-plugin/src/lib/voice-queue.ts` — localStorage-backed queue keyed by `vigil:voice-queue:v1`, capped at 10 entries, LRU eviction on overflow.
- Backoff schedule `[1s, 2s, 4s, 8s, 16s, 30s]` for retry attempts. After 6 retries exhaust, move to a "permanently failed" sub-queue.
- "syncing N voice captures" indicator on Companion HUD footer when queue depth > 0.
- D-T1 PostHog `voice_capture_completed` + D-T2 `voice_capture_dropout` telemetry surfaces using safe key names only.
- Wraps the existing `fetch` call in `voice.ts` with the queue-aware retry shape; on retry-exhausted or 429 (DAILY_AI_BUDGET_EXCEEDED) → evict + surface `[ERR]` with operator-facing sub-copy.

## Self-Check: PASSED

Verified post-write:
- All 4 created files: `FOUND` (via `test -f`)
- All 3 commits (`fbf07b1`, `e3925a6`, `10a6bd0`): `FOUND` in `git log`
- Acceptance criteria source-greps: all pass (Screen.VOICE in navigation.ts, voiceRecording at module scope in main.ts, bytes=/t= safe-key log, 'voice-body' container name, crypto.randomUUID + clientCaptureId literals, etc.)
- D-D2 future-proofing: zero `console.log` statements touching `audioPcm` / `audio_pcm` / `pcm` / `audio` / `body.audio` in voice.ts or main.ts
