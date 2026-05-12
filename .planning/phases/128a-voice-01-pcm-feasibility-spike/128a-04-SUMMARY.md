---
phase: 128a-voice-01-pcm-feasibility-spike
plan: 04
subsystem: ui
tags: [g2-plugin, navigation, audioEvent, voice-spike, DOUBLE_CLICK, GUARD-01, GUARD-02, hermes-static-import]

# Dependency graph
requires:
  - phase: 128a-02
    provides: app.json g2-microphone permission entry
  - phase: 128a-03
    provides: vigil-g2-plugin/src/screens/voice-spike.ts (buildVoiceSpikeScreen, getRecording, appendPcmChunk, toggleVoiceSpikeRecording exports)
  - phase: 127
    provides: safeAudioControl (GUARD-02) and audioEvent collector contract
  - phase: 124
    provides: Companion DOUBLE_CLICK D-08 carve-out pattern (navigation.ts:219-238) + SCREEN_ORDER drift detector
provides:
  - Screen.VOICE_SPIKE registered in carousel (slot 4, after AFFIRMATION)
  - DOUBLE_CLICK carve-out: VOICE_SPIKE DOUBLE_CLICK toggles recording instead of jumping to HOME
  - audioEvent collector branch in main.ts onEvenHubEvent dispatcher (calls appendPcmChunk, ends mic-on timer, logs `bytes=N` with GUARD-01 safe keys)
  - Updated Phase 124 SCREEN_ORDER drift detector to lock 5 entries (TOSSABLE — revert to 4 in Phase 130)
affects:
  - 128a-05 (operator wallclock — OPENAI_API_KEY)
  - 128a-06 (verification + 60s portfolio Loom)
  - 130 (productionization removes spike, reverts SCREEN_ORDER lock to 4 entries)
  - 133 (single-press REACTIVATE patch — currently DOUBLE_CLICK-only)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DOUBLE_CLICK carve-out template (Companion D-08 → VOICE_SPIKE) — intercept BEFORE the default NAV_EVENTS dispatch with `currentScreen === Screen.X && eventType === DOUBLE_CLICK_EVENT` guard"
    - "audioEvent collector branch placed FIRST in onEvenHubEvent dispatcher so audio fires never get misrouted into list-navigation paths"
    - "GUARD-01 safe-key log strings (bytes, chunk_n) — never the banned audioPcm/audio_pcm/pcm/audio/audioBuffer/audio_buffer tokens"
    - "Bridge cast `as unknown as Parameters<typeof fn>[0]` to bridge EvenAppBridge (SDK class) and AudioGuardBridge (structural type) — works around SDK .d.ts gap for setBackgroundState/onBackgroundRestore"

key-files:
  created: []
  modified:
    - vigil-g2-plugin/src/navigation.ts
    - vigil-g2-plugin/src/main.ts
    - vigil-g2-plugin/src/__tests__/navigation.test.ts

key-decisions:
  - "Updated Phase 124 SCREEN_ORDER drift detector from 4 → 5 entries inline (Rule 3 — drift detector was a blocking issue, and the plan explicitly extends the carousel). Marked TOSSABLE so Phase 130 cleanup reverts."
  - "Deferred the `toggleVoiceSpikeRecording` import from Task 1 → Task 2 to keep each task atomically tsc-clean (Task 1 only consumes `buildVoiceSpikeScreen` + `getRecording`; Task 2 adds the carve-out that uses `toggleVoiceSpikeRecording`)."
  - "Cast bridge through unknown at the carve-out call site (EvenAppBridge SDK type → AudioGuardBridge structural type) because `@evenrealities/even_hub_sdk@0.0.9` .d.ts omits setBackgroundState/onBackgroundRestore even though the runtime exposes them per EVEN-SKILLS.md §Background state. Phase 130 owns the upstream .d.ts fix."

patterns-established:
  - "VOICE_SPIKE DOUBLE_CLICK carve-out: line 269 of navigation.ts, immediately after the Companion D-08 block at line 234"
  - "audioEvent collector: first branch inside `bridge.onEvenHubEvent`, BEFORE the existing listEvent CLICK_EVENT → navigateToTaskDetail branch"
  - "console.timeEnd('mic-on') in the audioEvent branch is idempotent — measures D-M1 mic_on_latency on the first chunk per session, no-ops thereafter"
  - "Per W2 revision: the audioEvent branch does NOT re-render the screen — counter refresh deferred to screen entry/state-transition/post-upload to avoid contaminating inter_chunk_latency measurement with ≥10x/s SDK round-trips"

requirements-completed: [VOICE-01]

# Metrics
duration: 4min
completed: 2026-05-12
---

# Phase 128a Plan 04: Voice Spike navigation + audioEvent wiring Summary

**VOICE_SPIKE registered as carousel slot 4; DOUBLE_CLICK toggles recording via safeAudioControl instead of jumping to HOME; audioEvent collector funnels PCM chunks into the screen module with GUARD-01-safe log strings.**

## Performance

- **Duration:** ~4 min (235s)
- **Started:** 2026-05-12T19:09:49Z
- **Completed:** 2026-05-12T19:13:44Z
- **Tasks:** 2/2
- **Files modified:** 3 (navigation.ts, main.ts, navigation.test.ts)

## Accomplishments
- `Screen.VOICE_SPIKE` const added to the Screen enum and inserted into `SCREEN_ORDER` AFTER `Screen.AFFIRMATION` (carousel: HOME → COMPANION → WORK_ORDERS → AFFIRMATION → VOICE_SPIKE → wraps to HOME).
- `buildScreen` switch case returns `buildVoiceSpikeScreen(getRecording())` — no API fetch; recording state lives in the screen module per Plan 03.
- DOUBLE_CLICK carve-out at navigation.ts line 269 (immediately after the Companion D-08 carve-out at line 234) calls `toggleVoiceSpikeRecording(bridge)` and `return`s — short-circuits the default `case OsEventTypeList.DOUBLE_CLICK_EVENT: target = Screen.HOME` fallback.
- `audioEvent` collector branch added FIRST inside `bridge.onEvenHubEvent` (BEFORE listEvent CLICK_EVENT branch) so audio fires never reach list-navigation handlers. Branch calls `console.timeEnd('mic-on')` (D-M1 mic_on_latency timer started by Plan 03's toggle), logs `[voice-spike] chunk bytes=${bytes}` (safe-key only — `bytes`, never `pcm`/`audio*`), then `appendPcmChunk(event.audioEvent.audioPcm)` and `return`s.
- Phase 124 SCREEN_ORDER drift detector lock updated 4 → 5 entries (marked TOSSABLE — Phase 130 reverts).

## Task Commits

Each task was committed atomically:

1. **Task 1: Register Screen.VOICE_SPIKE in navigation.ts** — `37bc5160` (feat)
2. **Task 2: DOUBLE_CLICK carve-out + audioEvent collector** — `3b29b663` (feat)

## Files Created/Modified
- `vigil-g2-plugin/src/navigation.ts` — added static import of `buildVoiceSpikeScreen`/`getRecording`/`toggleVoiceSpikeRecording` from `./screens/voice-spike.ts`; added `Screen.VOICE_SPIKE` to enum; appended to `SCREEN_ORDER`; added `case Screen.VOICE_SPIKE` to `buildScreen`; added DOUBLE_CLICK carve-out at line 269.
- `vigil-g2-plugin/src/main.ts` — added static import of `appendPcmChunk` from `./screens/voice-spike.ts`; added audioEvent collector branch (FIRST branch inside `bridge.onEvenHubEvent`).
- `vigil-g2-plugin/src/__tests__/navigation.test.ts` — updated the Phase 124 SCREEN_ORDER lock test from "expect 4 entries [HOME, COMPANION, WORK_ORDERS, AFFIRMATION]" to "expect 5 entries [HOME, COMPANION, WORK_ORDERS, AFFIRMATION, VOICE_SPIKE]"; marked TOSSABLE.

## Decisions Made

- **Slot 4 ordering of VOICE_SPIKE** — per 128A-UI-SPEC the spike screen is "visible-not-hidden" and lives AFTER AFFIRMATION. Carousel wrap-around per the existing modular arithmetic at navigation.ts:47-55 is unchanged.
- **Static import (NOT dynamic)** — preserves the Phase 125 Hermes engine fix at navigation.ts:222-224 which explicitly converted dynamic imports back to static. Spike must not regress this.
- **Defer `toggleVoiceSpikeRecording` import to Task 2** — Task 1 only consumes `buildVoiceSpikeScreen` + `getRecording`; importing the unused `toggleVoiceSpikeRecording` would trip TS6133 (declared-but-not-read). Each task stays atomically tsc-clean.
- **Bridge cast at carve-out call site** — `toggleVoiceSpikeRecording` expects `AudioGuardBridge` (structural type from Phase 127 GUARD-02) which requires `setBackgroundState`/`onBackgroundRestore`. The SDK runtime exposes those per EVEN-SKILLS.md §"Background state" but the `.d.ts` in `@evenrealities/even_hub_sdk@0.0.9` omits them. Cast through `unknown` with explanatory comment; Phase 130 productionization owns the upstream .d.ts fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated Phase 124 SCREEN_ORDER drift detector from 4 → 5 entries**
- **Found during:** Task 1 (Register Screen.VOICE_SPIKE in SCREEN_ORDER)
- **Issue:** The Phase 124 Plan 07 drift detector at `vigil-g2-plugin/src/__tests__/navigation.test.ts:62-90` locked `SCREEN_ORDER` to exactly 4 entries (`[HOME, COMPANION, WORK_ORDERS, AFFIRMATION]`). Plan 04 explicitly extends the carousel to 5 by appending VOICE_SPIKE per the UI-SPEC's "visible-not-hidden" decision — without updating the test, Task 1's verification step (`npm test`) would have failed.
- **Fix:** Updated the assertion to expect 5 entries with the new slot 4 asserting `Screen.VOICE_SPIKE`. Added explicit `Phase 128a SPIKE — TOSSABLE` markers in the test's header comment and inline so Phase 130 cleanup reverts the count to 4 + drops the slot-4 assertion.
- **Files modified:** `vigil-g2-plugin/src/__tests__/navigation.test.ts`
- **Verification:** `npm test` exits 0 with 85/85 passing (was 85/85 before Plan 04 — same count means the modified test still runs).
- **Committed in:** `37bc5160` (Task 1 commit)

**2. [Rule 3 - Blocking] Bridge type cast at toggleVoiceSpikeRecording call site**
- **Found during:** Task 2 (DOUBLE_CLICK carve-out)
- **Issue:** `tsc --noEmit` failed with `TS2345: Argument of type 'EvenAppBridge' is not assignable to parameter of type 'AudioGuardBridge'. Type 'EvenAppBridge' is missing the following properties: setBackgroundState, onBackgroundRestore`. The Phase 127 GUARD-02 helper's structural type (`audio-session-guard.ts:54-59`) lists 4 required methods; `@evenrealities/even_hub_sdk@0.0.9`'s `.d.ts` types only `audioControl` + `onEvenHubEvent` — `setBackgroundState`/`onBackgroundRestore` exist at runtime per EVEN-SKILLS.md §"Background state" but are not in the published `.d.ts`.
- **Fix:** Cast `bridge` through `unknown` to `Parameters<typeof toggleVoiceSpikeRecording>[0]` at the call site with an inline comment explaining the SDK `.d.ts` gap and pointing to Phase 130 for the upstream fix.
- **Files modified:** `vigil-g2-plugin/src/navigation.ts` (lines ~280-281)
- **Verification:** `tsc --noEmit` exits 0; `npm test` 85/85 pass.
- **Committed in:** `3b29b663` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues that prevent the planned work from compiling/passing tests).
**Impact on plan:** Neither deviation expanded the scope. The SCREEN_ORDER lock update is a 1:1 reflection of the planned SCREEN_ORDER change. The bridge cast is the minimum local workaround for an upstream SDK `.d.ts` gap and is explicitly scoped to Phase 130 for productionization.

## Issues Encountered

- **Pre-existing failure (not introduced by Plan 04):** `vigil-core/src/lib/ai-budget.test.ts:211` fails on the `console.error captures 'withBudgetTracking accumulator failed'` secondary assertion. This is the explicitly-excluded `:211` failure called out in the success criteria. The plan's required tests (`audio-session-guard.test.ts` 6 cases, `audio-log-redaction.test.ts` 3 rails, `audio-cap.test.ts` 6 cases) all remain green.

## Verification Outputs

| Check | Command | Result |
|-------|---------|--------|
| Plugin tsc | `cd vigil-g2-plugin && npx tsc --noEmit` | exit 0 (clean) |
| Plugin tests | `cd vigil-g2-plugin && npm test` | 85/85 pass (1.24s) |
| Audio guard rail | `npx tsx --test vigil-g2-plugin/src/lib/__tests__/audio-session-guard.test.ts` | 6/6 pass |
| GUARD-01 redaction | `cd vigil-core && npx tsx --test src/__tests__/audio-log-redaction.test.ts` | 3/3 pass |
| Audio-cap guardrail | `cd vigil-core && npx tsx --test src/lib/audio-cap.test.ts` | 6/6 pass |
| ai-budget guardrail | `cd vigil-core && npx tsx --test src/lib/ai-budget.test.ts` | pre-existing :211 fail (excluded by success criteria); all other cases pass |
| Banned log tokens (main.ts) | grep `console.\*` for `audioPcm\|audio_pcm\|audioBuffer\|audio_buffer` in log strings | 0 matches |
| Banned log tokens (voice-spike.ts) | grep `console.\*` for banned tokens in log strings | 0 matches |
| Direct bridge.audioControl | `grep "bridge\.audioControl(" src/main.ts` | 0 matches (all routed via `safeAudioControl`) |
| Carve-out line ordering | Companion line 234 → VOICE_SPIKE line 269 | OK (VOICE_SPIKE after Companion) |

## Confirmed Line Ordering

- **Companion D-08 DOUBLE_CLICK carve-out:** `navigation.ts:234` (`if (currentScreen === Screen.COMPANION && eventType === OsEventTypeList.DOUBLE_CLICK_EVENT)`)
- **VOICE_SPIKE DOUBLE_CLICK carve-out:** `navigation.ts:269` (`if (currentScreen === Screen.VOICE_SPIKE && eventType === OsEventTypeList.DOUBLE_CLICK_EVENT)`)
- **Default NAV_EVENTS switch (would jump DOUBLE_CLICK → HOME):** `navigation.ts:~290+` (after the VOICE_SPIKE carve-out)

The VOICE_SPIKE carve-out is positioned correctly: AFTER the Companion carve-out (consistency with D-08 priority) and BEFORE the default DOUBLE_CLICK → HOME fallback (functional correctness — without this ordering, DOUBLE_CLICK on VOICE_SPIKE would never reach `toggleVoiceSpikeRecording`).

## User Setup Required

None — Plan 04 is plugin-code only. Operator wallclock checkpoints (C-1 OPENAI_API_KEY, C-2 g2-microphone allowlist, C-3 physical-G2 spike harness, C-4 battery delta, C-5 60s Loom) are owned by Plans 05/06.

## Next Phase Readiness

- **Plan 03 + Plan 04 together** make the Voice Spike screen executable on hardware once C-1 (Plan 05) sets `OPENAI_API_KEY` in Railway and C-2 confirms the `g2-microphone` permission is allowlisted by the Even Hub developer portal.
- Operator can swipe HOME → COMPANION → WORK_ORDERS → AFFIRMATION → VOICE_SPIKE → DOUBLE_CLICK to start recording → see chunk counter refresh on next screen entry → DOUBLE_CLICK again to stop and POST WAV to `/v1/voice/transcribe`.
- Plan 05 (operator wallclock) and Plan 06 (verification harness) are unblocked.
- Phase 130 productionization needs to (a) drop the `Phase 128a SPIKE — TOSSABLE` markers across navigation.ts/main.ts/the test file, (b) revert the SCREEN_ORDER lock test to 4 entries, (c) remove the bridge `as unknown as ...` cast once the upstream SDK `.d.ts` is fixed.

## Self-Check: PASSED

- File `vigil-g2-plugin/src/navigation.ts` — FOUND (modified, contains `Screen.VOICE_SPIKE`, `buildVoiceSpikeScreen(getRecording())`, and the DOUBLE_CLICK carve-out)
- File `vigil-g2-plugin/src/main.ts` — FOUND (modified, contains `import { appendPcmChunk }` and the audioEvent collector branch)
- File `vigil-g2-plugin/src/__tests__/navigation.test.ts` — FOUND (modified, asserts 5 SCREEN_ORDER entries including VOICE_SPIKE at slot 4)
- Commit `37bc5160` (Task 1) — FOUND in git log
- Commit `3b29b663` (Task 2) — FOUND in git log

---
*Phase: 128a-voice-01-pcm-feasibility-spike*
*Completed: 2026-05-12*
