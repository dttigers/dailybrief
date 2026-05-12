# Phase 128a — MEASUREMENTS

> Fill as you run. Each section maps to a CONTEXT.md D-M* methodology block. Verdict thresholds (D-PASS/DEGRADE/BLOCK) are restated inline next to each metric so you can self-classify as you go.
>
> **Critical DRIFT-02 reminder:** `e2e_ms` is measured from `DOUBLE_CLICK_EVENT (stop)` wallclock → first `console.log('[voice-spike] e2e_ms=…')` line that fires AFTER the HTTP 200 response is received. **NOT** to PWA dashboard render — PWA polls every 30s, dashboard floor is unreachable for the 8s VOICE-06 target. The dashboard gap goes in SPIKE-DECISION as a Phase 130 SSE requirement.

---

## Session header

- **Operator:** Jameson Morrill
- **Date:** 2026-05-__
- **Hardware:** G2 (serial …), iPhone (model + iOS …), Even Hub app v…
- **Plugin version:** v0.3.7 (sideloaded from `vigil-g2-plugin/vigil.ehpk`)
- **Backend:** api.vigilhub.io (Railway `vigil-core`, OPENAI_API_KEY present)
- **Wi-Fi:** … (single-network per D-R2)
- **Starting battery:** G2 = __%  iPhone = __%
- **Environment:** quiet indoor / outdoor / noisy …

---

## Pre-flight sanity check (do this FIRST — before the 2h battery delta)

> ~5 min. Catches BLE/auth/network failures before you commit to the wallclock.

- [ ] Swipe to **Voice Spike** screen on G2 — body shows `[IDLE]  () to record`
- [ ] DOUBLE_CLICK on Companion body — body flips to `[REC 0:00]`
- [ ] Say "test one two three" for ~3 seconds
- [ ] DOUBLE_CLICK again — body shows `[UPLOADING…]` → `[DONE]  thought saved`
- [ ] iPhone console (Safari → Develop → iPhone → Even Hub) shows `[voice-spike] e2e_ms=…` line within 8s
- [ ] PWA dashboard eventually shows the thought row (timing irrelevant — that's the DRIFT-02 gap)
- [ ] Transcript text approximately matches "test one two three"

**If any pre-flight step fails:** stop here, capture failure mode in `Run 4` section as the BLOCK signal, skip to verdict.

---

## Run 1 — Short clips (D-R1 mode 1; D-M1 latency)

> 10 clips, 3-5s each. Operator counts "one one-thousand, two one-thousand…" out loud.

| Trial | mic_on_ms | chunks | bytes   | recorded e2e_ms¹ | stop→HTTP_ms² | HTTP | transcription |
|-------|-----------|--------|---------|------------------|---------------|------|---------------|
| 1     | 568       | 50     | 160,044 | 7124   | **2124** | 201 | (in PWA — confirmed appeared) |
| 2     | 300       | 64     | 204,844 | 8962   | **2562** | 201 | (in PWA — confirmed appeared) |
| 3     | 266       | 53     | 169,644 | 6657   | **1357** | 201 | (in PWA — confirmed appeared) |
| 4     | 504       | 50     | 160,044 | 6389   | **1389** | 201 | (in PWA — confirmed appeared) |
| 5     | 506       | 47     | 150,444 | 6631   | **1931** | 201 | (in PWA — confirmed appeared) |
| 6     | 592       | 58     | 185,644 | 7341   | **1541** | 201 | (in PWA — confirmed appeared) |
| 7     | 447       | 54     | 172,844 | 6917   | **1517** | 201 | (in PWA — confirmed appeared) |
| 8     | 473       | 55     | 176,044 | 7380   | **1880** | 201 | (in PWA — confirmed appeared) |
| 9     | 500       | 50     | 160,044 | 6923   | **1923** | 201 | (in PWA — confirmed appeared) |

*(9 trials captured — first batch of 10 was cleared by an HMR reload mid-capture before screenshot; n=9 is one shy of D-M1's "≥10 samples" target but median + p95 are stable in this band.)*

**¹ Recorded `e2e_ms`** is measured from `micOnStartedAt` (DOUBLE_CLICK start) → HTTP 200 — includes the entire recording duration. **The real D-M1 metric we want is `stop→HTTP_ms`.** Spike-discovered metric-definition bug; corrected via column 2 = `recorded_e2e_ms − (chunks × 100ms)`. Phase 130 should capture `micStoppedAt` and report `stop→HTTP_ms` directly. Logged in `deferred-items.md`.

**² stop→HTTP_ms** is the operator-perceived latency: from DOUBLE_CLICK-to-stop → HTTP 200 from `/v1/voice/transcribe`. This is what D-M1's `e2e_latency` and VOICE-06's 8s acceptance criterion mean. Per DRIFT-02, this is NOT PWA dashboard render — PWA polls every 30s, so dashboard floor adds another ~15s on average. Phase 130 SSE work closes that gap.

**Aggregates (using corrected `stop→HTTP_ms` per D-M1):**
- `mic_on_ms` (DOUBLE_CLICK → first PCM chunk): min = 266 · median = 500 · p95 = ~582 · max = 592 ms
- **`stop→HTTP_ms` (the actual D-M1 metric):** min = 1357 · **median = 1880** · p95 = ~2387 · max = 2562 ms
- `bytes` per clip: min = 150,444 · median = 169,644 · max = 204,844 (~3-6s of speech across trials)
- `chunks` per clip: min = 47 · median = 53 · max = 64
- Drop-out events across all 9 clips: 0 (cleanly streamed; Run 2 near-cap exercise is the primary drop-out gate)

**PCM-intelligibility check (PASS GATE 1):** YES — all 9 trials appeared in PWA with intelligible transcripts (operator confirmed before clearing).

---

## Run 2 — Near-cap 55s clip (D-R1 mode 2; D-M2 drop-out)

> One ~55-second recording. Read aloud from any source (book, article).

- **Recording duration:** ~56.8 s (derived: 568 chunks × 100 ms/chunk)
- **Total bytes:** 1,817,644 (server cap is 1,920,000 PCM bytes; **94.7% of cap — well under**)
- **mic_on_ms:** 448 (DOUBLE_CLICK → first PCM chunk)
- **Reported `e2e_ms` (start → HTTP 200):** 60,401 ms
- **Corrected `stop→HTTP_ms`** (60,401 − 56,800 recording duration): **3,601 ms** for upload + WAV-encode + OpenAI transcribe of a near-cap clip
- **HTTP status:** 200/201 (state advanced to `[DONE]`, transcript appeared in PWA)
- **Inter-arrival distribution** (gap_ms between consecutive `audioEvent` fires):
  - first 5s baseline: not separately captured (operator did not inter-leave timestamps per-chunk in console — the `audioEvent` handler logs only first-chunk `mic_on_ms`, by design to avoid contaminating Run 1 latency per the deferred per-chunk-render note in voice-spike.ts)
  - rest of recording: chunks streamed cleanly; payload reached ~1.82 MB with no gaps observable from the operator's vantage (state stayed `[REC m:ss]`, never glitched back to `[IDLE]` or `[ERR]`)
- **Drop-outs** (gap ≥ 2× this recording's first-5s baseline): **0 observed** (clean 568-chunk stream; no error logs, no audioControl re-attempts)
  - **Drop-out rate normalized:** **0 per 60s**
- **`AUDIO_SESSION_TOO_LONG` (HTTP 413) tripped?** NO — 1,817,644 bytes is below 1,920,000 cap (within GUARD-02 envelope)
- **Transcript intelligible?** YES — full ~57s read-aloud appeared in PWA dashboard with intact prose

**Run 2 verdict input — drop-outs per 60s: 0 → PASS bucket** (PASS ≤ 1).

**Caveat for D-M2 rigor:** the per-chunk `gap_ms` distribution we *would* normally compute (median/p95/max of inter-arrival times) wasn't logged this spike because the audioEvent handler only emits `mic_on_ms` on the first chunk. The 568-chunk count over a ~56.8s recording implies a mean inter-arrival of **~100 ms** which matches the SDK's 100ms cadence; no chunks were dropped at the application layer (568 × 3200 bytes/chunk = 1,817,600 ≈ measured 1,817,644). Phase 130 should add the per-chunk timestamp log if a tighter D-M2 verdict is needed; for this spike the cleanly streamed transcript + correct byte count are sufficient evidence the BLE pipe held.

---

## Run 3 — 5× force-quit cleanup cycles (D-M4)

> **Methodology pivot (2026-05-12):** Safari Web Inspector attaches to the live WebView; when iOS swipe-kills Even Hub, the WebView process dies and the inspector session terminates — previous console buffer is irretrievable. The "Cleanup path observed" column is therefore best-effort (only captured if `onBackgroundRestore` fires on the new WebView after reopen). **Primary PASS signal is battery drain**, which is operationally what `audioControl(false)` does: release the mic so it stops drawing power. If post-kill drain ≈ idle, the mic is off regardless of which hook reaped it.
>
> Per-cycle protocol:
> 1. Note G2 battery % (pre-kill baseline)
> 2. DOUBLE_CLICK on G2 — body shows `[REC 0:0X]`
> 3. Wait ~3s while recording
> 4. Swipe-kill Even Hub iPhone app (app switcher → swipe up)
> 5. **Wait 60s without reopening** (let any leaked mic session drain measurably)
> 6. Note G2 battery % (post-kill, 60s elapsed)
> 7. Reopen Even Hub, return to Voice Spike screen; scroll up in new console for any `onBackgroundRestore` log line (likely absent in vite dev preview — Hook 4 is disabled per audio-session-guard.ts feature-detect)

| Cycle | Pre-kill battery % | Post-kill battery % (60s later) | Drain pp/60s | Cleanup log observed (if any) | Outcome |
|-------|--------------------|---------------------------------|--------------|-------------------------------|---------|
| 1     | 70                 | 70                              | 0            | (inspector lost on swipe-kill; no post-mortem log on reopen)  | **PASS** |
| 2     | 70                 | 69                              | 1            | (inspector lost; no post-mortem log)                          | **PASS** ¹ |
| 3     | 69                 | 69                              | 0 over LONGER window (operator thought app was killed but it wasn't; whenever the ACTUAL swipe-kill happened, 60+s later still showed 0pp drain — more rigorous test of cleanup since mic was active longer before reap) | (inspector lost; no post-mortem log) | **PASS** |
| 4     | 69                 | 69                              | 0            | (inspector lost; no post-mortem log)                          | **PASS** |
| 5     | 69                 | 69                              | 0            | (inspector lost; no post-mortem log)                          | **PASS** |

**¹ Cycle 2 analysis:** 1pp drain over 60s falls right at G2's gauge resolution. Across the full Run 3 wallclock (~10-15 minutes total, including all 5 cycles + reopen/reset between each), total battery delta was 70 → 69 = 1pp. That works out to ~4-6 pp/hr, which is idle-range G2 drain. A leaked active mic would be ~30 pp/hr (1pp in 60s sustained, showing up across multiple cycles). Cycle 2's single 1pp tick is normal idle decay crossing the 70→69 threshold during that 60s window, not evidence of a mic leak.

**Reference: G2 idle drain rate** (mic OFF, screen on, Hub foreground): inferred ~4-6 pp/hr from Run 3 wallclock (70 → 69 across ~10-15 min). Half A of Run 5 will produce the canonical baseline.

**Cleanup pass count:** **5 / 5**

(PASS = battery drain over 60s post-kill ≈ idle (≤ 1pp or no measurable delta on G2's 1pp-resolution gauge) AND no error log indicating the mic stayed open. FAIL = drain measurably faster than idle, indicating mic still active after force-quit. **Methodology limitation acknowledged:** cannot directly observe `audioControl(false)` firing — inferred from battery behavior. Phase 130 should add localStorage breadcrumbs to `audio-session-guard.ts` cleanup hooks so the trace survives WebView death; see `deferred-items.md`.)

---

## Run 4 — Permission-revocation probe (D-G3)

> **Methodology pivot (2026-05-12):** Neither revocation path in the original protocol is operationally usable for this spike:
>
> - **iOS Settings → Even → Microphone toggle:** doesn't exist. iOS only lists permission toggles for capabilities the app has *itself* requested through iOS's standard prompt flow. Even Hub never requested iOS-level mic permission; `g2-microphone` is purely an Even Hub plugin-permission concept handled inside the Hub app. iOS Settings exposes Location / Bluetooth / Camera / Calendars / Apple Intelligence / Search / Notifications / Background App Refresh / Cellular Data for Even — no mic entry. (Screenshot captured during Run 4 attempt 2026-05-12 15:51 MDT.)
> - **Even Hub developer portal:** technically usable (flip `g2-microphone` OFF for our plugin) but operationally risky — we just spent C-2 getting the permission approved. Toggling it could re-trigger the approval pipeline and block Run 5 (which needs a working mic for the 10× push-to-record clips across the hour).
>
> The verdict-table criterion for D-G3 is **"probe documented"** (PASS bucket), not "probe live-reproduced." Code analysis satisfies that requirement.

### Failure-shape documentation (from code analysis at `vigil-g2-plugin/src/lib/audio-session-guard.ts:80-159` + `vigil-g2-plugin/src/screens/voice-spike.ts:210-291`)

`safeAudioControl(true, bridge)` is declared `Promise<void>` — it does NOT capture the return value of `bridge.audioControl(on)`, and does NOT catch errors from it. Two failure paths follow from what the Even Hub SDK actually does on permission denial:

**Path A — silent denial (`bridge.audioControl(true)` returns `Promise<false>`):**
1. `safeAudioControl` registers cleanup hooks 1-3 (Hook 4 logs the dev-preview warn), sets `audioActive = true`, awaits audioControl, returns void normally — the `false` return value is **discarded**
2. `toggleVoiceSpikeRecording` proceeds: `stateLine = '[REC]'` already set BEFORE the await; `onStateChange?.()` fires after
3. G2 body shows `[REC 0:00]  () to stop` — **operator-deceiving** (looks like recording started)
4. No `audioEvent` ever fires (no permission to stream PCM)
5. Operator eventually DOUBLE_CLICKS to stop → `safeAudioControl(false)` runs cleanly → `pcmChunks` is empty (length 0)
6. `buildWav(emptyArr)` returns a 44-byte WAV header alone
7. POST `/voice/transcribe` with `application/octet-stream` body of 44 bytes
8. `vigil-core/src/routes/voice-spike.ts:75-86`: `wav.length=44` is under the 1,920,000 cap → proceeds to `transcribeWav`
9. OpenAI `gpt-4o-mini-transcribe` receives a silent-header WAV → returns empty/whitespace transcription
10. Route returns 422 `{"error":"Transcription produced no text"}` (`voice-spike.ts:126-128`)
11. Plugin: `!res.ok` → `stateLine = '[ERR]'` → `console.error('[voice-spike] upload failed status=422')`
12. G2 body shows `[ERR]  retry () to record`

**Path B — throw (`bridge.audioControl(true)` rejects):**
1. `safeAudioControl`: cleanup hooks register, `audioActive = true` set, then `await bridge.audioControl(on)` throws
2. Throw propagates up through `safeAudioControl` (no try/catch) and `toggleVoiceSpikeRecording` (also no try/catch around the safeAudioControl call)
3. State left **inconsistent:** `recording === true`, `stateLine === '[REC]'` (both set before the await), `audioActive === true` in the guard module (set before the audioControl call), but the mic never actually opened
4. Throw bubbles to `navigation.ts` DOUBLE_CLICK handler — depending on the carve-out's error handling, likely an unhandled promise rejection
5. Subsequent DOUBLE_CLICK toggles `recording = !recording = false` → enters STOP branch → tries `safeAudioControl(false)` → which calls `bridge.audioControl(false)` — may also reject or succeed-as-noop depending on SDK
6. G2 body stuck in `[REC]` until next refresh (which may not come since `onStateChange` never fired)

### Verdict

**Probe documented:** YES (both failure paths traced from source).
**Outcome bucket:** PASS (per verdict-table threshold "probe doc'd").
**Re-grant required:** N/A — permission was never revoked.

### Phase 130 hardening (required to clean up both paths)

1. **Change `safeAudioControl` signature** from `Promise<void>` → `Promise<boolean>` so callers can observe denial.
2. **Capture the return value** in `toggleVoiceSpikeRecording`: if `false`, flip `recording` back to false, set `stateLine = '[NO MIC]'`, short-circuit before entering the recording loop.
3. **Wrap in try/catch** around the safeAudioControl call so a throw doesn't leave the state machine inconsistent — catch → flip recording back, set `stateLine = '[NO MIC]'`, call `onStateChange`.
4. **Wire the `[NO MIC]` state in the body builder** (currently W1-deferred; spike collapses both denial paths into `[ERR]`).
5. **Distinguish `[NO MIC]` vs `[ERR]` in UI-SPEC** — `[NO MIC]` means "permission missing, go fix in Hub settings"; `[ERR]` means "something else broke, retry."

---

## Run 5 — Battery delta (D-M3; 2-wallclock-hour protocol)

> Both halves MUST start at the same battery percentage (100%). If second half can't start ≥ 70%, recharge and restart (non-linear discharge invalidates the delta).

### Half A — Baseline (mic OFF, G2 worn, Hub foreground, screen visible)

- **Half A start:** 2026-05-__ __:__ MDT — G2 battery = __%
- **Half A end:**   2026-05-__ __:__ MDT — G2 battery = __%
- **Half A delta:** __ pp (over 60 min)

### Half B — Push-to-record (10× 5s clips evenly spaced across the hour)

- **Half B start:** 2026-05-__ __:__ MDT — G2 battery = __% (target ≥ 70% per D-M3)
- **Half B end:**   2026-05-__ __:__ MDT — G2 battery = __%
- **Half B delta:** __ pp (over 60 min)

### Incremental cost (the measurement that drives the battery bucket)

- **Incremental cost** = Half B delta − Half A delta = __ pp/hr

---

## Verdict inputs (mechanical — Task 2 reads this directly)

> Re-state the four headline numbers + bucket per CONTEXT D-PASS/D-DEGRADE/D-BLOCK. Task 2's verdict is a function of these buckets — no subjective judgment at write-up time per D-V1.

| Metric                             | Measured           | Threshold buckets                                        | This run's bucket |
|------------------------------------|--------------------|----------------------------------------------------------|-------------------|
| `e2e_latency` median               | __ ms (from Run 1) | PASS ≤ 8000 · DEGRADE 8001-15000 · BLOCK > 15000         | …                 |
| Drop-outs per 60s                  | __ (from Run 2)    | PASS ≤ 1 · DEGRADE 2-5 · BLOCK > 5                        | …                 |
| Battery delta (incremental cost)   | __ pp/hr (Run 5)   | PASS ≤ 15 · DEGRADE 15-30 · BLOCK > 30                    | …                 |
| Cleanup pass count                 | __ / 5 (Run 3) + permission probe documented (Run 4) | PASS 5/5 AND probe doc'd · DEGRADE 3-4/5 · BLOCK ≤ 2/5 | … |
| PCM intelligible (PASS GATE 1)     | YES / NO (Run 1)   | NO → BLOCK regardless of other metrics                    | …                 |
| Permission rejected at portal (C-2)| NO (cleared 2026-05-12) | YES → BLOCK regardless of other metrics              | NO                |

---

## Operator notes / qualitative observations

> Free-form. Capture anything that didn't fit a numeric cell — unexpected error messages, network conditions, observed UX friction, ideas for Phase 130.

- …
- …

---

## Resume signal to Claude (when all 5 runs + Loom are done)

Type one of these in the next message to continue:

```
hardware-runs-complete: e2e=___ms drops=___ battery=___pp cleanup=___/5
```

OR (if a hardware/software issue prevented the spike):

```
hardware-runs-blocked: <reason>
```

Claude then runs Plan 06 Task 2 — applies the threshold logic mechanically, authors `128a-SPIKE-DECISION.md`, attaches the Loom URL.
