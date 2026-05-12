# Phase 128a: VOICE-01 PCM feasibility spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 128a-voice-01-pcm-feasibility-spike
**Areas discussed:** Recording gesture, Recording protocol + measurement methodology, WAV header + transcription path, Verdict thresholds, Artifacts + file layout
**Mode:** `--auto` (user authorized "work without stopping for clarifying questions"; Claude picked recommended defaults for every gray area)

---

## Recording gesture

| Option | Description | Selected |
|--------|-------------|----------|
| DOUBLE_CLICK push-to-record (start + stop) | Use the hardware-verified gesture (Companion DOUBLE_CLICK_EVENT confirmed firing on 2026-05-10 hardware test). Mic toggles via DOUBLE_CLICK; single-press is unreliable until Phase 133's `?? 0` patch lands. | ✓ |
| Single-press push-to-record (after Phase 133 patch) | Wait for Phase 133 plumbing fix before running spike — single-press is more ergonomic. | |
| Continuous capture (mic-always-on; DOUBLE_CLICK = stop) | Bypass gesture-grammar entirely; mic opens at plugin launch. | |

**User's choice:** DOUBLE_CLICK push-to-record (auto-default).
**Notes:** Phase 127.5 verdict REACTIVATE proved single-press CAN work, but the plumbing patch is deferred to Phase 133. Spike CANNOT wait — it gates Phase 130 scope. Continuous capture rejected: not in v3.9 scope per VOICE-02..08 (those all assume push-to-record). DOUBLE_CLICK is the only hardware-verified option as of 2026-05-10 (`project_g2_companion_doubletap_hardware_verified` memory).

---

## Recording protocol + measurement methodology

| Option | Description | Selected |
|--------|-------------|----------|
| Three modes per session (short ×10 + near-cap ×1 + battery ×1) | Capture all 4 success-criterion measurements (chunk size, E2E latency, drop-out, battery delta) without ballooning operator wallclock. | ✓ |
| Long-only continuous mode | One 1h continuous recording — easier to schedule but conflates the 4 numbers. | |
| Multi-operator + multi-G2-pair generalization | Two operators, two G2 pairs, two Wi-Fi networks — better generalization but 4× wallclock cost. | |

**User's choice:** Three modes per session (auto-default).
**Notes:** STACK research §1b explicitly recommended "single-user empirical run is enough for the spike." Multi-operator generalization is Phase 130 hardening concern. Long-only continuous would invalidate latency measurement (no clean utterance-end → row-visible boundaries). Hardware-only (no simulator) is non-negotiable per Phase 124 D-08 + Phase 127.5 verdict.

---

## WAV header + transcription path

| Option | Description | Selected |
|--------|-------------|----------|
| Client-side WAV header in G2 plugin → JSON-base64 POST → OpenAI `gpt-4o-mini-transcribe` | Plugin assembles 44-byte WAV header per VOICE-04 spec; server decodes base64, sends WAV to OpenAI via `audio.transcriptions.create`. | ✓ |
| Server-side WAV header (plugin sends raw PCM, server wraps) | Smaller plugin code; but VOICE-04 explicitly says "base64-WAV (16kHz mono 16-bit LE) as a single base64 blob" — server wrap deviates. | |
| Anthropic beta.files transcription | Use the existing Anthropic SDK path. | |
| Deepgram nova-3 transcription | <500ms latency, $0.0043/min. | |

**User's choice:** Client-side WAV + OpenAI `gpt-4o-mini-transcribe` (auto-default).
**Notes:** Anthropic rejected — Files API does NOT accept `audio/*` MIME types (verified `https://platform.claude.com/docs/en/docs/build-with-claude/files`). Deepgram rejected for v3.9 (second account/secret to maintain; OpenAI sufficient). Client-side WAV matches VOICE-04 spec verbatim and keeps the plugin → server contract clean (one POST = one base64 blob = one utterance). `OPENAI_API_KEY` setup is wallclock checkpoint C-1.

---

## Verdict thresholds

| Option | Description | Selected |
|--------|-------------|----------|
| Lock numeric thresholds in CONTEXT.md (D-PASS / D-DEGRADE / D-BLOCK) | Spike author cannot fudge the verdict at write-up time; thresholds anchored to VOICE-06 (8s E2E) + battery + drop-out + cleanup robustness. | ✓ |
| Author-discretion verdict | Spike author writes "feels like PASS" or similar without fixed numeric thresholds. | |
| Binary PASS/BLOCK only (no DEGRADE) | Simpler decision tree, but loses the push-to-record-only fallback that VOICE-02..08 was scoped to support. | |

**User's choice:** Lock numeric thresholds (auto-default).
**Notes:** ROADMAP §"Phase 128a success criterion 2" explicitly demands "exactly one of PASS / DEGRADE / BLOCK" — three-way verdict is non-negotiable. Threshold values (8s / 15s / 15pts / 30pts / 1-5-5+ drop-outs / 5-3 cleanup cycles) chosen to anchor PASS to VOICE-06 acceptance, DEGRADE to push-to-record-only-Phase-130, BLOCK to v3.9 voice anchor termination. SEED-003 DMARC pattern explicitly cited for BLOCK re-activation criteria.

---

## Artifacts + file layout

| Option | Description | Selected |
|--------|-------------|----------|
| 2-file split (SPIKE-DECISION + MEASUREMENTS) + tossable scaffold under `vigil-g2-plugin/scripts/` + `vigil-core/src/routes/voice-spike.ts` | Operator-facing verdict in DECISION; raw timing data in MEASUREMENTS; scaffold marked TOSSABLE in header comment. | ✓ |
| 3-file split (VERIFICATION + DECISION + MEASUREMENTS) | STACK research's original layout; adds operator-facing verification doc. | |
| Single SPIKE.md with all artifacts inline | Simpler navigation; risks a 500+ line file as measurements accumulate. | |

**User's choice:** 2-file split (auto-default).
**Notes:** Phase 130 will overwrite `vigil-core/src/routes/voice-spike.ts` (header comment makes this explicit). Spike code is excluded from `npm run pack` bundle (mirrors `scripts/check-verified.mjs` pattern). Loom (`60s-demo.mp4`) lives at phase root either as local file or as Loom URL referenced from SPIKE-DECISION.

---

## Claude's Discretion

- Exact spike harness HTML structure (button layout, text labels)
- Console log format for measurement events (must be GUARD-01-redaction-compatible — use `bytes`/`chunk_n`/`gap_ms`, never `pcm`/`audio`)
- Whether `/v1/voice/transcribe` (spike scaffold) mounts at production path or temporary `/v1/voice/transcribe-spike` (defaulting to production path for credible 60s Loom)
- Whether to keep `voice-spike-page.html` checked in post-spike for regression replay or delete immediately (defaulting to keep + flag deletion-on-VOICE-08-ship reminder)
- Drift-detector tests for spike scaffold are **explicitly skipped** (Phase 130 + Phase 127 GUARD-01 own them)

## Deferred Ideas

- **Ambient continuous capture mode** — v3.10+ candidate ONLY if PASS thresholds exceeded with significant headroom (battery < 10%/hr AND latency < 4s AND zero drop-outs)
- **`/v1/voice/transcribe` multipart shape** — Phase 130 architectural decision if PWA voice is built; spike uses JSON-base64 per VOICE-04
- **Word-level transcript timestamps** — re-eval when scrub-to-edit transcript UX emerges; `whisper-1` supports them at $0.006/min vs `gpt-4o-mini-transcribe` $0.003/min
- **Streaming PCM upload** — permanently deferred unless the 60s server cap relaxes
- **Deepgram fallback** — re-eval if OpenAI latency > 1.5s on real iPhone-tethered G2 traffic
- **Sentry breadcrumb redaction for `voice-spike.ts`** — Phase 127 GUARD-01 `beforeSend` covers it; spike author MUST NOT add parallel redaction
- **3-file artifact split (VERIFICATION separate from DECISION)** — author can revert if DECISION grows past ~300 lines

---

*Phase: 128a-voice-01-pcm-feasibility-spike*
*Discussion logged: 2026-05-12*
*Mode: --auto (autonomous discuss)*
