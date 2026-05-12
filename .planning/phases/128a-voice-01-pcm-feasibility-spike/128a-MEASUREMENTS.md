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

| Trial | mic_on_ms | chunks | bytes   | e2e_ms | HTTP | transcription |
|-------|-----------|--------|---------|--------|------|---------------|
| 1     | 568       | 50     | 160,044 | 7124   | 201  | (in PWA — confirmed appeared) |
| 2     | 300       | 64     | 204,844 | 8962   | 201  | (in PWA — confirmed appeared) |
| 3     | 266       | 53     | 169,644 | 6657   | 201  | (in PWA — confirmed appeared) |
| 4     | 504       | 50     | 160,044 | 6389   | 201  | (in PWA — confirmed appeared) |
| 5     | 506       | 47     | 150,444 | 6631   | 201  | (in PWA — confirmed appeared) |
| 6     | 592       | 58     | 185,644 | 7341   | 201  | (in PWA — confirmed appeared) |
| 7     | 447       | 54     | 172,844 | 6917   | 201  | (in PWA — confirmed appeared) |
| 8     | 473       | 55     | 176,044 | 7380   | 201  | (in PWA — confirmed appeared) |
| 9     | 500       | 50     | 160,044 | 6923   | 201  | (in PWA — confirmed appeared) |

*(9 trials captured — first batch of 10 was cleared by an HMR reload mid-capture before screenshot; n=9 is one shy of D-M1's "≥10 samples" target but median + p95 are stable in this band; if Run 1 is marginal we can add Trial 10 later.)*

**Aggregates:**
- `mic_on_ms`: min = 266 ms · median = 500 ms · p95 = ~582 ms · max = 592 ms
- `e2e_ms` (to HTTP 200, per DRIFT-02): min = 6389 ms · median = **6923 ms** · p95 = ~7364 ms · max = 8962 ms
- `bytes` per clip: min = 150,444 · median = 169,644 · max = 204,844 (~3-6s of speech across trials)
- `chunks` per clip: min = 47 · median = 53 · max = 64
- Drop-out events across all 9 clips: 0 (Run 1 didn't surface drop-outs; Run 2's near-cap clip is where they get characterized per D-M2)

**PCM-intelligibility check (PASS GATE 1):** YES — all 9 trials appeared in PWA with intelligible transcripts (operator confirmed before clearing).

---

## Run 2 — Near-cap 55s clip (D-R1 mode 2; D-M2 drop-out)

> One ~55-second recording. Read aloud from any source (book, article).

- **Recording duration:** __ s
- **Total bytes:** __ (server cap is 1,920,000 PCM bytes; must stay under)
- **Inter-arrival distribution** (gap_ms between consecutive `audioEvent` fires):
  - first 5s baseline: median = __ ms
  - rest of recording: min = __ · median = __ · p95 = __ · max = __ ms
- **Drop-outs** (gap ≥ 2× this recording's first-5s baseline): __ events
  - **Drop-out rate normalized:** __ per 60s
- **`AUDIO_SESSION_TOO_LONG` (HTTP 413) tripped?** YES / NO (should be NO — clip is intentionally under the cap)
- **Transcript intelligible?** YES / NO

---

## Run 3 — 5× force-quit cleanup cycles (D-M4)

> For each cycle: `safeAudioControl(true)` → record 3s → swipe-kill Even Hub iPhone app mid-recording → reopen → check console + battery drain rate.

| Cycle | Cleanup path observed (ABNORMAL_EXIT / SYSTEM_EXIT / beforeunload / onBackgroundRestore) | mic-drain-check (drain rate over 30s vs idle) | Outcome |
|-------|----------------------------------------------------------------------------------------|------------------------------------------------|---------|
| 1     |                                                                                        |                                                | PASS / FAIL |
| 2     |                                                                                        |                                                | PASS / FAIL |
| 3     |                                                                                        |                                                | PASS / FAIL |
| 4     |                                                                                        |                                                | PASS / FAIL |
| 5     |                                                                                        |                                                | PASS / FAIL |

**Cleanup pass count:** __ / 5

(PASS = `audioControl(false)` confirmed fired AND battery drain ≈ idle. FAIL = mic still draining at active rate after force-quit.)

---

## Run 4 — Permission-revocation probe (D-G3)

> One cycle with permission revoked. Documents the failure shape Phase 130 must handle.

- **Revoked at:** Even Hub developer portal (or iOS Settings → Even Hub → Microphone toggle)
- **Re-attempted `safeAudioControl(true)`:** YES — recorded behavior below
- **`safeAudioControl` error shape:** `…` (e.g., `Promise<false>` / `throws Error('…')` / hang / `audioControl rejected`)
- **UI behavior on G2:** body line shows … (expected: `[ERR]  retry () to record` per UI-SPEC; `[NO MIC]` is deferred per W1)
- **Console log line:** `…`
- **Permission re-granted before continuing:** YES (required for Run 3 and Run 5 to succeed)

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
