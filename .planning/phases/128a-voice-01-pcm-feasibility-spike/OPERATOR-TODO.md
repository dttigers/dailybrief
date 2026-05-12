# Phase 128a — Operator Wallclock TODO

**Generated:** 2026-05-12 after autonomous execution of Waves 0–2 + Plan 05 Task 1
**Autonomous work complete:** 4/6 plans + 1 partial (Plan 05 Task 1 only)
**Blocked on:** operator wallclock for C-1..C-5 (5 checkpoints, ≥2.5 wallclock hours total)

---

## What was landed autonomously (review before continuing)

| Plan | Status | Commits |
|------|--------|---------|
| 128a-01 | ✅ | `b0ffc4a7` (openai@^6.37.0) · `df94fe6f` (Wave 0 smoke test RED) · `fd155b6a` (summary) |
| 128a-02 | ✅ | `80b4ca80` (transcribe-spike) · `e5514393` (route mounted; Wave 0 → GREEN) · `fce9a35e` (summary) |
| 128a-03 | ✅ | `302068a9` (g2-microphone permission + ContainerIds) · `66534b1e` (WAV-44 encoder) · `c66a715f` (Voice Spike screen) · `c09b183b` (summary) |
| 128a-04 | ✅ | `37bc5160` (Screen.VOICE_SPIKE registration) · `3b29b663` (DOUBLE_CLICK carve-out + audioEvent collector) · `712c9da8` (summary) |
| 128a-05 | 🟡 Partial — Task 1 done | `17ab199b` (bundle exclusion D-A3 verified PASS) |
| 128a-06 | ⏸ Blocked on 05's wallclock | (none yet) |

**Test surface:** Wave 0 smoke RED→GREEN flip verified. 3 of 4 Phase 127 guardrail rails green (audio-cap, audio-log-redaction, audio-session-guard). 1 pre-existing failure (`ai-budget.test.ts:211`) reproduced on pristine main per `deferred-items.md` — out of scope for 128a.

---

## C-1 — Set `OPENAI_API_KEY` in Railway `vigil-core` env

**Plan:** 128a-05 Task 2
**Why:** `/v1/voice/transcribe` server route needs the OpenAI API key to call `gpt-4o-mini-transcribe`. Without it, 100% of hardware spike runs will fail with auth error and the spike returns BLOCK on the wrong axis.

**Steps:**
1. Generate or obtain the OpenAI API key (platform.openai.com)
2. Set in Railway one of two ways:
   - **Dashboard:** Railway → `vigil-core` service → Variables → Add `OPENAI_API_KEY=<key>`
   - **CLI:** `railway variables --set "OPENAI_API_KEY=<key>" --service vigil-core`
3. Trigger redeploy (Railway auto-deploys on var change by default)

**Verification (operator MUST use subcommand form — bare `railway variables` leaks all secrets — `[Railway variables leak]` memory; two Postgres rotations on record):**

```bash
railway variables get OPENAI_API_KEY --service vigil-core
```

Expect: last 4 chars of the key (Railway masks the middle).

**Resume signal once done:** Reply `c1-done: <last-4-chars> redeploy-ok` OR `c1-blocked: <reason>`.

---

## C-2 — Verify `g2-microphone` permission allowed in Even Hub developer portal

**Plan:** 128a-05 Task 3
**Why:** Plugin manifests `g2-microphone` permission (commit `302068a9`). If portal rejects the permission, `audioControl(true)` fails on hardware and the spike returns BLOCK at the first hour (CONTEXT D-G2).

**Steps:**
1. Open Even Hub developer portal (developer.evenrealities.com or operator's current portal URL)
2. Navigate to `com.vigilapp.g2` app → Permissions
3. Confirm `g2-microphone` is listed AND status = ALLOWED

**Resume signal once done:**
- `c2-allowed` → proceed to Plan 128a-06 hardware run
- `c2-rejected: <portal copy>` → Plan 128a-06 short-circuits to BLOCK verdict (document portal rejection text in SPIKE-DECISION.md)
- `c2-not-listed: <reason>` → file Even Hub support request; spike paused until resolved

---

## C-3 + C-4 + C-5 — Plan 128a-06 hardware spike run (≥2 wallclock hours)

**Blocked on:** C-1 + C-2 above completing.

**Plan:** 128a-06 — physical G2 hardware test + battery delta + 60s portfolio Loom + mechanical SPIKE-DECISION

### C-3 — Hardware test cycles (D-R3 + D-M4)
- Wear G2 + pair to iPhone in operator's normal environment
- Open the rebuilt Even Hub app (uploaded from `vigil-g2-plugin/vigil.ehpk` via portal sideload)
- Swipe to **Voice Spike** screen (visible in carousel after AFFIRMATION per UI-SPEC)
- Run **D-R1 mode 1** (short clips ×10): DOUBLE_CLICK to start, count "one one-thousand, two one-thousand" 3–5s, DOUBLE_CLICK to stop. Record measurements per D-M1.
- Run **D-R1 mode 2** (near-cap clip ×1): single ~55s recording for drop-out + cap-headroom measurement. Stay under the 60s server cap (Phase 127 GUARD-02).
- Run **5 force-quit cycles** (D-M4): start record → swipe-kill Even Hub mid-recording → reopen → verify Phase 127 cleanup fired via console + battery drain rate.
- Run **permission-revocation probe** (D-G3): revoke `g2-microphone` in portal, attempt `safeAudioControl(true)`, observe error mode. Re-grant before D-M4 cleanup cycles.

### C-4 — Battery delta protocol (D-R1 mode 3 + D-M3, ≥2h wallclock)
- 1h baseline: mic OFF, G2 worn, Hub foreground, iPhone screen visible. Record `batteryLevel` at t=0 and t=60min.
- 1h push-to-record: 10× 5s clips evenly spaced (1 every 6min). Same operator, same iPhone foreground state, same starting battery (100%).
- If second half doesn't start at ≥70% → recharge to 100% before continuing (D-M3 non-linear discharge protocol).

### C-5 — 60s portfolio Loom (success criterion #3)
- Mirror Phase 125's 60s portfolio demo arc per CONTEXT specifics
- Save to `.planning/phases/128a-voice-01-pcm-feasibility-spike/60s-demo.mp4` OR record Loom URL in SPIKE-DECISION

### Authoring SPIKE-DECISION.md (D-V1 — mechanical verdict)
After all measurements logged in `128a-MEASUREMENTS.md`:

1. Apply **BLOCK gate first**:
   - `e2e_latency` median > 15s? → BLOCK
   - drop-outs > 5 per 60s? → BLOCK
   - battery delta > 30pp/h? → BLOCK
   - cleanup fails on ≥3 of 5 cycles? → BLOCK
   - permission rejected on portal (C-2)? → BLOCK
   - PCM unintelligible after WAV reconstruction? → BLOCK
2. If no BLOCK, apply **PASS gate**:
   - `e2e_latency` median ≤ 8s AND drop-outs ≤ 1/60s AND battery ≤ 15pp/h AND 5/5 cleanup → PASS
3. Otherwise → DEGRADE (default).
4. Write verdict at line 1 of `128a-SPIKE-DECISION.md` — **not editable after write** per D-V1.

### Important DRIFT-02 measurement note
Per RESEARCH.md DRIFT-02: measure `e2e_latency` to **HTTP 200 of `/v1/voice/transcribe`** (not PWA dashboard render — dashboard polls every 30s and is unreachable as a true 8s gate). Plan 06 SPIKE-DECISION must include the DRIFT-02 section noting the dashboard-visibility gap as a Phase 130 SSE-wiring requirement.

---

## Resume signal protocol

When C-1 and C-2 are both done, run:
```
/gsd-execute-phase 128a --auto
```
The orchestrator will detect the wallclock-clear and proceed to Plan 06 (which is itself wallclock — operator-driven from then on; Claude will spawn the executor to scaffold the SPIKE-DECISION + MEASUREMENTS templates and wait for operator to fill them).

OR file each measurement directly into `128a-MEASUREMENTS.md` as you collect it and manually invoke Plan 06's verdict authoring once measurements are complete.

---

## Files to read before resuming

- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-06-PLAN.md` — exact Plan 06 task contract
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-CONTEXT.md` — D-PASS/DEGRADE/BLOCK thresholds (locked)
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128A-UI-SPEC.md` — Voice Spike screen visual contract (what you'll see on G2)
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-RESEARCH.md` — DRIFT-02 measurement-vs-dashboard note
