---
phase: 128a-voice-01-pcm-feasibility-spike
plan: 03
subsystem: g2-plugin
tags: [voice, spike, g2-plugin, screen, encoder, permissions, wave-1, tossable]

# Dependency graph
requires:
  - phase: 127-pre-spike-guardrails
    provides: safeAudioControl (GUARD-02 wrapper), GUARD-01 redaction log-key allowlist
  - plan: 128a-02
    provides: /v1/voice/transcribe route ready to receive POST {audio: base64}
provides:
  - "vigil-g2-plugin permissions array entry for g2-microphone with spike-scope desc"
  - "ContainerId.VOICE_SPIKE_HEADER/BODY/FOOTER at IDs 16/17/18 (TOSSABLE)"
  - "buildWav(pcm) + toBase64(bytes) — hand-rolled 44-byte WAV-PCM encoder, WebView-compatible"
  - "buildVoiceSpikeScreen + toggleVoiceSpikeRecording + getRecording + appendPcmChunk — 4 module exports"
affects: [128a-04, 130-voice-capture-full-impl]

# Tech tracking
tech-stack:
  added: []  # no new runtime dependencies — pure TS module additions
  patterns:
    - "TOSSABLE header on line 1 as Phase 130 grep anchor (mirrors 128a-02 + check-verified.mjs)"
    - "WebView-compatible WAV encoding (DataView + Uint8Array + btoa — no Node Buffer)"
    - "Module-scope mutable recording state (let recording / const pcmChunks[]) mirroring audio-session-guard.ts:63-66 closure-captured state pattern"
    - "Bearer-fetch inlined at call site reading BASE_URL + API_KEY from api.ts (api.ts itself NOT modified; private authHeaders() helper stays private)"
    - "scripts/ NOT src/ for the encoder (CONTEXT D-A3 bundle-exclusion precedent: check-verified.mjs)"
    - "Per-chunk live-counter re-render deliberately DEFERRED — appendPcmChunk is a pure push (no SDK round-trip), preserves clean inter_chunk_latency measurement"

key-files:
  created:
    - vigil-g2-plugin/scripts/voice-spike-encoder.ts
    - vigil-g2-plugin/src/screens/voice-spike.ts
  modified:
    - vigil-g2-plugin/app.json
    - vigil-g2-plugin/src/constants.ts

key-decisions:
  - "Bearer-fetch inlined using BASE_URL + API_KEY imports from ../api.ts. api.ts is UNMODIFIED — the private authHeaders() helper stays private, keeping the spike's surface area decoupled from non-tossable code (mirrors the inline-header pattern fetchSummary / fetchBrief / fetchAffirmation themselves use inside api.ts)."
  - "5 of 7 UI-SPEC states wired ([IDLE], [REC M:SS], [UPLOADING…], [DONE], [ERR]). The permission-denied (UI-SPEC line 108) and budget-exceeded (UI-SPEC line 109) states are intentionally deferred to Phase 130 — operator reads both failure shapes from console logs per CONTEXT D-G3 / D-M2; the screen renders [ERR] for both cases in the meantime. The in-file comment block documents this intentional omission verbatim."
  - "Per-chunk live-counter re-render deferred. The `chunks: N  bytes: B` line on the G2 display refreshes only on screen entry / state transition / post-upload. Adding a per-audioEvent rebuild call would round-trip the SDK ≥10×/s and contaminate the inter_chunk_latency measurement this spike exists to take (D-M1)."
  - "Auto-clear timers for [DONE]/[ERR] back to [IDLE] (described in UI-SPEC §State machine) deferred to Phase 130 — keeps tossable surface minimal; spike operator reads stateLine on screen entry."
  - "Comment block initially used literal '[NO MIC]' / '[BUDGET]' tokens; rewrote to plain words after Plan's verify grep (-F '[NO MIC]') treated comments as state-literal matches. Net effect: clearer disposition + verify-grep-clean."

requirements-completed: [VOICE-01]

# Metrics
duration: ~3min
completed: 2026-05-12
---

# Phase 128a Plan 03: Voice Spike Plugin Scaffold Summary

**Landed the four NEW plugin-side assets needed for the spike — `g2-microphone` permission manifest entry, three `VOICE_SPIKE_*` ContainerId values, hand-rolled 44-byte WAV-PCM encoder under `scripts/`, and the `voice-spike.ts` screen module that owns the recording state machine + POST orchestrator. The screen wires 5 of 7 UI-SPEC states with [NO MIC] / [BUDGET] intentionally deferred to Phase 130, uses `safeAudioControl` exclusively (zero direct `bridge.audioControl` calls), and inlines the bearer header reading `BASE_URL` + `API_KEY` from `api.ts` without modifying that file. Plugin compiles clean and all 85 existing tests still pass.**

## Performance

- **Duration:** ~3 minutes (3 tasks executed sequentially)
- **Started:** 2026-05-12T19:02:21Z
- **Completed:** 2026-05-12T19:05:34Z
- **Tasks:** 3 (all `type=auto`; none `tdd="true"`)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **`g2-microphone` permission manifest entry** appended to `vigil-g2-plugin/app.json` permissions array. Two permission entries total: `network` (unchanged) + `g2-microphone` (NEW, no whitelist — that field is `network`-specific per EVEN-SKILLS.md). Desc literal contains `Phase 128a VOICE-01 spike` substring as required for operator portal review (CONTEXT D-G2 + wallclock checkpoint C-2).

- **ContainerId namespace extended** with three new entries at IDs 16/17/18 after `COMPANION_FOOTER: 15`, each carrying the `Phase 128a SPIKE — TOSSABLE` trailing comment. SDK constraint is `1~12 PER PAGE` (per existing line 8-11 comment) not global, so 16-18 are safe.

- **`scripts/voice-spike-encoder.ts` NEW (91 LOC)** — under `scripts/` NOT `src/` per CONTEXT D-A3 bundle-exclusion (mirrors `scripts/check-verified.mjs` precedent). Format-lock module constants `SAMPLE_RATE = 16000`, `CHANNELS = 1`, `BITS_PER_SAMPLE = 16` per EVEN-SKILLS.md §"Audio capture" lines 94-118. Exports:
  - `buildWav(pcm: Uint8Array): Uint8Array` — canonical RIFF/WAVE/fmt /data 44-byte header built via `new DataView(buf.buffer)` + `view.setUint{16,32}(off, val, true)` little-endian writes; concatenates header + PCM payload into a single Uint8Array.
  - `toBase64(bytes: Uint8Array): string` — `String.fromCharCode` charcode loop + `btoa(bin)`. Standard WebView base64 path; Node `Buffer` is unavailable.

- **`src/screens/voice-spike.ts` NEW (275 LOC)** — screen builder + recording state machine + POST orchestrator. TOSSABLE header on line 1; comment block at top documents both deferrals (5-of-7 UI-SPEC states and per-chunk re-render). Imports `safeAudioControl` from `../lib/audio-session-guard.ts` (Phase 127 GUARD-02 wrapper), `buildWav` + `toBase64` from `../../scripts/voice-spike-encoder.ts`, `BASE_URL` + `API_KEY` from `../api.ts`. Module-scope state: `recording`, `pcmChunks[]`, `micOnStartedAt`, `lastBytes`, `lastE2eMs`, `stateLine`. Exports the 4 functions required by the plan:
  - `buildVoiceSpikeScreen(isRecording: boolean): RebuildPageContainer` — 3-container header/body/footer triple cloning `affirmation.ts:17-61` geometry verbatim. Header uses `buildVigilHeader(ContainerId.VOICE_SPIKE_HEADER, 'vs-header', 'voice-spike')` (3rd-arg `voice-spike` label per UI-SPEC). Body content selects between 5 state branches; line 2 (`chunks: N  bytes: B`) and line 3 (`last: 3.2s 1.4MB` or `last: —`) per UI-SPEC §"Body lines 2 + 3". Footer two-state per UI-SPEC §"Footer (line)". All container names ≤11 chars (Phase 125 hardware-debug-2026-05-10 lock).
  - `toggleVoiceSpikeRecording(bridge): Promise<void>` — flips `recording`, on START resets buffer + `console.time('mic-on')` + `safeAudioControl(true, bridge)`, on STOP closes mic via `safeAudioControl(false, bridge)` → flips stateLine to `[UPLOADING…]` → concatenates pcmChunks → `buildWav(total)` → `toBase64(wav)` → POST to `` `${BASE_URL}/voice/transcribe` `` with inlined `Authorization: Bearer ${API_KEY}` header. On 200/201 sets `stateLine = '[DONE]'` and computes `lastE2eMs`; on 4xx/5xx or fetch throw sets `stateLine = '[ERR]'`. All log strings use the GUARD-01 safe-key allowlist (`bytes`, `b64_chars`, `chunk_n`, `e2e_ms`).
  - `getRecording(): boolean` — Plan 04 (carousel build branch) reads this.
  - `appendPcmChunk(chunk): void` — single-line array push, no SDK round-trip. Plan 04 Task 2's audioEvent collector calls this.

- **No direct `bridge.audioControl(` calls anywhere in the new code** — `safeAudioControl(true, bridge)` and `safeAudioControl(false, bridge)` are the only mic-API entrypoints. Verified by grep.

- **`api.ts` UNMODIFIED** — the spike imports `BASE_URL` + `API_KEY` (lines 15 + 16 of api.ts) and inlines the Authorization header at its one call site, mirroring the inline-header pattern that `fetchSummary` / `fetchBrief` / `fetchAffirmation` themselves use inside api.ts. The private `authHeaders()` helper stays private; the spike does not touch non-tossable code surface.

## Task Commits

Each task committed atomically against the single-repo working tree (worktrees disabled per `config.json`):

1. **Task 1: app.json permission + constants.ts ContainerId entries** — `302068a9` (feat)
2. **Task 2: scripts/voice-spike-encoder.ts (TOSSABLE WAV encoder)** — `66534b1e` (feat)
3. **Task 3: src/screens/voice-spike.ts (TOSSABLE screen module)** — `c66a715f` (feat)

## Files Created/Modified

**Created:**
- `vigil-g2-plugin/scripts/voice-spike-encoder.ts` (91 LOC) — TOSSABLE header, format-lock constants, `buildWav` + `toBase64` exports, RIFF/WAVE/fmt /data canonical byte layout via DataView
- `vigil-g2-plugin/src/screens/voice-spike.ts` (275 LOC) — TOSSABLE header, 4-function exports (buildVoiceSpikeScreen, toggleVoiceSpikeRecording, getRecording, appendPcmChunk), 5-of-7 UI-SPEC state machine, inlined bearer-fetch

**Modified:**
- `vigil-g2-plugin/app.json` — appended `g2-microphone` permission entry (no whitelist field; that's `network`-specific)
- `vigil-g2-plugin/src/constants.ts` — appended VOICE_SPIKE_HEADER/BODY/FOOTER at IDs 16/17/18 after COMPANION_FOOTER

## Verified Test Output

### TypeScript compile

```
$ cd vigil-g2-plugin && npx tsc --noEmit
(exit 0, no output — clean)
```

Run after each of the three commits; all three passes are recorded in the per-task verification commands above.

### Plugin test suite

```
$ cd vigil-g2-plugin && npm test
ℹ tests 85
ℹ suites 0
ℹ pass 85
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1287.638339
```

All 85 existing plugin tests still pass — no regression from the Phase 128a additions.

### Per-criterion acceptance check (Task 3)

- File exists at `vigil-g2-plugin/src/screens/voice-spike.ts` ✓
- Line 1 contains `PHASE 128a SPIKE — TOSSABLE` ✓
- Exports `buildVoiceSpikeScreen`, `toggleVoiceSpikeRecording`, `getRecording`, `appendPcmChunk` ✓
- `safeAudioControl(true, ...)` and `safeAudioControl(false, ...)` both present ✓
- Zero direct `bridge.audioControl(` calls ✓
- `buildWav` + `toBase64` imported from `../../scripts/voice-spike-encoder.ts` ✓
- `BASE_URL` + `API_KEY` imported from `../api.ts` (api.ts unmodified) ✓
- URL path `/voice/transcribe` literal present (BASE_URL already includes `/v1`) ✓
- Container name `'vs-body'` (7 chars, ≤11 limit) ✓
- 5-of-7 state literals present (`[IDLE]`, `[UPLOADING…]`, `[DONE]`, `[ERR]`, plus `[REC ` substring for dynamic counter) ✓
- `[NO MIC]` and `[BUDGET]` absent from file (deferred to Phase 130) ✓
- `appendPcmChunk` is a single-line `.push` — no SDK rebuild API call ✓
- No banned tokens (`audioPcm`/`audio_pcm`/`audioBuffer`/`audio_buffer`) in any `console.*` string ✓

## Decisions Made

- **Bearer-fetch inlined; api.ts NOT modified.** The plan locked this as W3: import `BASE_URL` + `API_KEY` from `../api.ts` and inline the `Authorization: Bearer ${API_KEY}` header at the single POST call site. This mirrors what `fetchSummary` / `fetchBrief` / `fetchAffirmation` themselves do *inside* api.ts — they don't share a public authHeaders helper either. Keeps the spike's surface area decoupled from non-tossable code; Phase 130 cleanup deletes one file (voice-spike.ts) without touching api.ts at all.

- **5 of 7 UI-SPEC states wired; permission-denied + budget-exceeded states deferred to Phase 130.** The plan's W1 revision locked this — the operator reads both failure shapes from console logs per CONTEXT D-G3 / D-M2, and the screen renders `[ERR]` for both cases. Avoids carrying conditional branches the spike never exercises end-to-end (D-G3's permission-revocation probe and Phase 127 GUARD-03's per-user budget gate). The in-file comment block documents the intentional omission verbatim.

- **Per-chunk live-counter re-render deferred.** The plan's W2 revision locked this — `appendPcmChunk` is a single-line `.push` with no SDK rebuild API call. Mid-recording chunk count is read by the operator from the console log stream (Plan 04 Task 2's `chunk bytes=` line); the G2 display's `chunks: N  bytes: B` counter only refreshes on screen entry / state transition / post-upload. Rationale: per-audioEvent `RebuildPageContainer` round-trips at ≥10×/s would contaminate the inter_chunk_latency measurement this spike exists to take.

- **Auto-clear timers ([DONE]/[ERR] → [IDLE] after 3-5s, per UI-SPEC §State machine) deferred to Phase 130.** Keeps the tossable surface minimal — the spike operator sees stateLine on screen entry and the next DOUBLE_CLICK toggles back to recording.

- **Comment-block rewrite to satisfy the verify grep.** The initial comment block used the literal tokens `[NO MIC]` and `[BUDGET]` inside a `// Wires 5 of 7 …` explanatory note. The plan's verify command runs `grep -F '[NO MIC]' src/screens/voice-spike.ts` (negated) and treats any occurrence — even in a comment — as a failure. Rewrote to plain prose ("permission-revoked and budget-exceeded failure modes are deferred to Phase 130"). Net effect: clearer disposition + verify-grep-clean. No semantic loss; the in-code state machine has never touched those two literal tokens.

## Deviations from Plan

None — the plan executed exactly as written. The one in-flight adjustment (the comment-block rewrite described above) was a presentation tweak to satisfy the verify grep, not a deviation from the design contract. No Rule 1/2/3 auto-fixes were required; no Rule 4 architectural-decision checkpoints were triggered.

## Auth Gates

None — Task 1's app.json edit declares the permission but does not exercise it. Operator wallclock checkpoint C-2 (`g2-microphone` allowlist verification on the Even Hub developer portal) belongs to Plan 06's pre-pack verification step, not this plan.

## Next Phase Readiness

- **Plan 128a-04 unblocked**: navigation.ts can now register `Screen.VOICE_SPIKE` and wire `buildVoiceSpikeScreen(getRecording())` into `buildScreen()`; main.ts can carve out the DOUBLE_CLICK_EVENT branch for `currentScreen === Screen.VOICE_SPIKE` to call `toggleVoiceSpikeRecording(bridge)`; the audioEvent listener registration that appends to the buffer via `appendPcmChunk(event.audioEvent.audioPcm)` is also Plan 04's scope.

- **All four NEW assets carry the canonical TOSSABLE header** — `grep -r "PHASE 128a SPIKE — TOSSABLE" vigil-g2-plugin` finds both new files. Combined with Plan 128a-02's two vigil-core files (`transcribe-spike.ts`, `voice-spike.ts`), the grep anchor now spans four files across two repos for the Phase 130 cleanup pass.

- **No blockers.**

## Self-Check: PASSED

- File `vigil-g2-plugin/app.json` — FOUND (modified)
- File `vigil-g2-plugin/src/constants.ts` — FOUND (modified)
- File `vigil-g2-plugin/scripts/voice-spike-encoder.ts` — FOUND (created)
- File `vigil-g2-plugin/src/screens/voice-spike.ts` — FOUND (created)
- Commit `302068a9` (Task 1) — FOUND
- Commit `66534b1e` (Task 2) — FOUND
- Commit `c66a715f` (Task 3) — FOUND
- `cd vigil-g2-plugin && npx tsc --noEmit` — PASS (exit 0)
- `cd vigil-g2-plugin && npm test` — 85/85 PASS
- `[NO MIC]` + `[BUDGET]` literal absent from voice-spike.ts (deferred per W1) — VERIFIED
- No banned audio*/pcm tokens in any console.* string — VERIFIED
- No direct `bridge.audioControl(` calls — VERIFIED

---
*Phase: 128a-voice-01-pcm-feasibility-spike*
*Completed: 2026-05-12*
