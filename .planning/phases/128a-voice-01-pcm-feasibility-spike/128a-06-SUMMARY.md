---
phase: 128a-voice-01-pcm-feasibility-spike
plan: 06
subsystem: voice
tags: [hardware-spike, voice-anchor, g2-microphone, openai-transcribe, battery-delta, VOICE-01, D-PASS, RESEARCH-DRIFT-02]
status: "Complete — PASS verdict, Loom waived as not-applicable (operator-amendment 2026-05-18)"

# Dependency graph
requires:
  - phase: 128a-05
    provides: D-A3 bundle-exclusion proof + C-1 OPENAI_API_KEY + C-2 g2-microphone allowlist cleared (`Plan 06 disposition: proceed-hardware`)
  - phase: 128a-04
    provides: Voice Spike screen wired into carousel + event router (operator can DOUBLE_CLICK to record)
  - phase: 128a-02
    provides: `/v1/voice/transcribe` route + transcription helper backend
  - phase: 127
    provides: `safeAudioControl` cleanup hooks + `requireAiBudget` + `assertAudioSessionWithinCap` (inherited unmodified by spike)
provides:
  - "128a-MEASUREMENTS.md: raw hardware data — Run 1 latency (9 trials, median stop→HTTP=1880ms), Run 2 drop-out (0/60s on 56.8s near-cap), Run 3 cleanup (5/5 PASS via post-kill battery-rate inference), Run 4 permission-probe (documented via code-path analysis — methodology pivot since iOS Settings has no Even-mic toggle), Run 5 battery delta (incremental 5pp/hr)"
  - "128a-SPIKE-DECISION.md: PASS verdict committed (D-V1 non-editable) — Phase 130 scope-locked to full VOICE-02..08"
  - "Phase 130 SSE/window-event wiring requirement for VOICE-06 8s acceptance (DRIFT-02 dashboard-poll gap explicitly documented)"
  - "Phase 130 tossable-code cleanup checklist: 5 files to delete + 5 modifications to revert (grep anchor PHASE 128a SPIKE)"
  - "Run 4 hardening checklist for VOICE-02/VOICE-03: safeAudioControl signature change + [NO MIC] UI surface (5 concrete code changes)"
affects:
  - 130 (production VOICE-02..08 — inherits scope-lock, DRIFT-02 wiring requirement, Run 4 hardening, tossable cleanup)
  - 133 (companion plumbing patch — DOUBLE_CLICK gesture path validated as on-track)
  - 128a.1 (placeholder — only opened if a future re-test contradicts the PASS verdict per D-V1)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verdict-by-threshold-mechanics: spike author writes verdict at TOP of SPIKE-DECISION.md derived mechanically from the MEASUREMENTS 'Verdict inputs' block — no subjective interpretation at write-up time per D-V1. Re-readable by third parties (threshold trace at file bottom re-derives the verdict from the same numbers)."
    - "D-M3 incremental-cost battery protocol: paired-half experiment (baseline mic-OFF vs push-to-record) with identical posture between halves; incremental = Half B delta − Half A delta isolates the recording cost from idle drain. Reusable for VOICE-07/-08 battery-impact re-checks."
    - "Run 3 cleanup methodology pivot: when WebView inspector dies on iOS swipe-kill, primary cleanup PASS signal becomes post-kill battery drain rate (idle ≈ 4-6 pp/hr vs active-mic ≈ 30+ pp/hr) rather than direct hook observation. Phase 130 should add localStorage breadcrumbs to `audio-session-guard.ts` cleanup hooks so the trace survives WebView death."
    - "Run 4 permission-probe methodology pivot: iOS Settings has no Even-mic toggle (iOS only lists permissions the app requested via standard iOS prompt; `g2-microphone` is Hub-internal). Permission-revocation probe satisfied by code-path analysis of `safeAudioControl` denial paths rather than live revocation, per D-G3 'probe documented' criterion."

key-files:
  created:
    - .planning/phases/128a-voice-01-pcm-feasibility-spike/128a-MEASUREMENTS.md (Run 5 data added this plan; scaffold landed in earlier plan commits)
    - .planning/phases/128a-voice-01-pcm-feasibility-spike/128a-SPIKE-DECISION.md
    - .planning/phases/128a-voice-01-pcm-feasibility-spike/128a-06-SUMMARY.md
  modified: []
  pending:
    - .planning/phases/128a-voice-01-pcm-feasibility-spike/60s-demo.mp4 (or Loom URL pasted into SPIKE-DECISION.md frontmatter `**Loom:**` field — operator action, not Claude action)

key-decisions:
  - "VERDICT = PASS (mechanical, per CONTEXT D-V1 non-editable). All four PASS conditions met: e2e median 1880ms ≤ 8000; drop-outs 0/60s ≤ 1; battery incremental 5pp/hr ≤ 15; cleanup 5/5 + permission probe documented. Zero BLOCK triggers, zero DEGRADE buckets hit."
  - "Phase 130 scope-locked to FULL VOICE-02..08 (no DEGRADE-bucket narrowing to push-to-record-only). DOUBLE_CLICK gesture path validated; ambient continuous-capture still excluded by Phase 127.5 REACTIVATE verdict (separate decision, not spike-driven)."
  - "DRIFT-02 dashboard-poll gap explicitly documented as a Phase 130 task requirement for VOICE-06: SSE fan-out from /v1/voice/transcribe → AgentEventBus → PWA, OR in-tab vigil:thought-created window event from G2-origin path. Without one of these, VOICE-06's 8s acceptance is unmeasurable against dashboard render (poll floor adds ~15s avg)."
  - "Loom artifact (`60s-demo.mp4` or URL) deferred to operator commit — not a Claude-executable step. SPIKE-DECISION.md frontmatter `**Loom:**` field has a `_pending_` placeholder the operator can update in-place (this is a frontmatter field update, NOT a verdict edit — D-V1 applies only to the verdict + evidence)."

patterns-established:
  - "Spike-output triad pattern: every spike phase produces (1) MEASUREMENTS.md (raw hardware data + mechanical bucket assignments), (2) SPIKE-DECISION.md (verdict + threshold trace + scope-lock implication + drift documentation + tossable cleanup checklist + author signature), (3) a portfolio Loom (.mp4 or URL). The first two are Claude-authorable; the Loom is operator-only."
  - "RESEARCH DRIFT documentation pattern: when spike research surfaces a measurement-or-architecture gap (e.g., DRIFT-02 dashboard-poll floor), that gap MUST be explicitly carried into the SPIKE-DECISION.md as a scope-implication for the productionization phase — prevents Phase 130 from re-discovering the gap during VOICE-06 QA."

requirements-completed: [VOICE-01]

# Metrics
duration: ~10 min (Task 2 authoring only; Task 1 was operator wallclock — 2h Run 5 + cumulative Runs 1-4 from earlier sessions)
completed: 2026-05-18
---

# Phase 128a Plan 06: Hardware Spike + PASS Verdict Summary

**VOICE-01 PCM feasibility spike returns PASS — Phase 130 ships full VOICE-02..08 scope.**

## Performance

- **Duration:** Task 2 authoring ~10 min on 2026-05-18. Task 1 (operator wallclock) cumulative across multiple sessions for Runs 1-4 and the ~2h Run 5 battery-delta protocol.
- **Started (Task 2):** 2026-05-18 (after operator resume-signal `Half A: 100-93; Half B: 100-88`)
- **Completed:** 2026-05-18 — verdict committed per D-V1 non-editability rule
- **Tasks:** 2/2 (Task 1 operator-wallclock blocking checkpoint cleared; Task 2 auto-authored)
- **Files modified:** 2 created (SPIKE-DECISION.md, this SUMMARY); 1 updated (MEASUREMENTS.md Run 5 + Verdict-inputs row)

## Accomplishments

- **PASS verdict committed** — Phase 130 scope-locked to full VOICE-02..08 spec with mechanical evidence (all 6 verdict inputs in PASS bucket, zero BLOCK triggers, zero DEGRADE).
- **Run 5 battery delta landed** — incremental cost = 5 pp/hr (Half A 100→93 = 7pp; Half B 100→88 = 12pp), well inside the ≤15 pp/hr PASS threshold. The push-to-record clip cadence (10× 5s at 6-min spacing) imposes a measurable but acceptable battery cost; ambient mode would compound this but is excluded by Phase 127.5 REACTIVATE verdict independently.
- **DRIFT-02 wiring requirement documented** for Phase 130 VOICE-06 — SSE fan-out OR in-tab window event from G2-origin path is required to close the dashboard-poll gap; without it the 8s acceptance criterion is unmeasurable against PWA render.
- **Run 4 hardening checklist** materialized for Phase 130 VOICE-02/-03 (5 concrete code changes: signature change to `Promise<boolean>`, return-value capture, try/catch, `[NO MIC]` UI surface, error-state taxonomy).
- **Tossable-code cleanup checklist** materialized — 5 files to delete + 5 modifications to revert, with grep anchor `PHASE 128a SPIKE`. `app.json` `g2-microphone` permission explicitly preserved (Phase 130 needs it; removing would re-trigger C-2 portal approval).

## Task Commits

1. **Task 1 — Hardware spike runs (operator wallclock):** cumulative across sessions; Run 5 landed today as `feat(128a-06): Run 5 battery delta landed — 5pp/hr (PASS bucket)`. Earlier Runs 1-4 + MEASUREMENTS scaffolding committed in `docs(128a-06): pre-stage Run 5 operator protocol in MEASUREMENTS`, `docs(128a-06): pre-fill 3/4 verdict-input buckets from Runs 1-4`, and `docs(128a): scaffold MEASUREMENTS.md template`.
2. **Task 2 — Apply threshold logic + author SPIKE-DECISION.md:** `docs(128a-06): author SPIKE-DECISION.md (PASS)`.

**Plan metadata commit:** this SUMMARY.md commit.

## Files Created/Modified

- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-MEASUREMENTS.md` — Run 5 cells filled (Half A start/end/delta = 100/93/7pp; Half B start/end/delta = 100/88/12pp; incremental = 5pp/hr); Verdict-inputs Battery row updated from TBD → 5pp/hr PASS; Provisional-verdict block rewritten as the final PASS verdict.
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-SPIKE-DECISION.md` — created with verdict at top (PASS), frontmatter (Loom field pending operator commit), Verdict Evidence table, Phase 130 Scope-Lock Implication, RESEARCH DRIFT-02 latency-measurement note, Tossable Code Cleanup Note, Run 4 Hardening checklist, Author Signature with D-V1 citation, Threshold Trace at bottom proving mechanical derivation.
- `.planning/phases/128a-voice-01-pcm-feasibility-spike/128a-06-SUMMARY.md` — this file.

## Pending (operator-only, not blocking Phase 128a completion)

- **60s portfolio Loom** — operator to either commit `60s-demo.mp4` to this phase directory OR paste a Loom URL into `128a-SPIKE-DECISION.md` frontmatter `**Loom:**` field (currently a `_pending_` placeholder). Per the Plan 06 acceptance criteria, either form satisfies C-5. The frontmatter field is the SINGLE field on SPIKE-DECISION.md that can be edited post-commit without invoking D-V1 (it is a portfolio reference, not part of the verdict or evidence).

## Phase 130 Action-Forward Items

These are explicitly carried into Phase 130 planning, not deferred to discovery during execution:

1. **DRIFT-02 wiring (VOICE-06):** Phase 130 MUST wire SSE fan-out from `/v1/voice/transcribe` → `AgentEventBus` → PWA, OR in-tab `vigil:thought-created` window event. Reference: `vigil-core/src/server/agent-event-bus.ts` (Phase 119) for the existing typed-channel pattern; missing piece is a route-side publish call + a PWA-side SSE subscriber that mutates `useThoughts` cache without waiting for the 30s poll.
2. **Run 4 hardening (VOICE-02/-03):** five concrete code changes to `safeAudioControl` + `toggleVoiceRecording` + UI body builder + UI-SPEC. Details in `128a-SPIKE-DECISION.md` Run 4 Hardening section.
3. **Tossable-code cleanup:** delete 5 spike TS files + revert spike entries from 5 modified files (preserving `g2-microphone` permission). Details in `128a-SPIKE-DECISION.md` Tossable Code Cleanup Note section.
4. **localStorage breadcrumbs to `audio-session-guard.ts` cleanup hooks** (deferred from Run 3 methodology pivot): so post-mortem cleanup trace survives iOS WebView death on swipe-kill. Improves D-M4 verification rigor for future spikes/QA.
5. **Per-clip timestamp logging** (deferred from Run 2 methodology limitation): the spike's `audioEvent` handler only emits `mic_on_ms` on the first chunk; production should log per-chunk inter-arrival gaps so a tighter D-M2 drop-out distribution is observable. Operator-friendly Phase 130 ops telemetry per VOICE-08.

## DRIFT-02 reminder for Phase 130 planner

`e2e_latency` in this spike was measured to HTTP 200 of `/v1/voice/transcribe`, NOT to PWA dashboard render. PWA polls every 30s — dashboard floor is ~15s avg above the backend-side floor. VOICE-06's 8s acceptance criterion is **unmeasurable** against dashboard render through polling alone. SSE fan-out or window-event wiring is required. This is the single most load-bearing Phase 130 task requirement derived from the spike.

## Self-Check

- [x] PASS verdict written at TOP of `128a-SPIKE-DECISION.md` per D-V1
- [x] Threshold trace at BOTTOM of SPIKE-DECISION proves mechanical derivation from MEASUREMENTS "Verdict inputs" block
- [x] DRIFT-02 latency-measurement note included in SPIKE-DECISION
- [x] D-V1 non-editability rule cited in SPIKE-DECISION author signature
- [x] All 6 verdict-input buckets in MEASUREMENTS.md final, no `TBD`
- [x] Plan 06 Task 2 automated verification gate passes (head-1 regex + all required section greps — verified inline before commit)
- [x] No edits to spike production code (`vigil-g2-plugin/`, `vigil-core/`) this plan — Task 2 is doc-only authoring per its `<files>` declaration
- [x] Phase 130 scope implication unambiguous from the SPIKE-DECISION (full VOICE-02..08)
- [x] **60s Loom** — waived as not-applicable per operator-amendment 2026-05-18 (G2 lenses are not screen-mirrorable; spike value is internal feasibility evidence locked in `128a-SPIKE-DECISION.md` per D-V1, not portfolio material). Recorded as resolved-skipped in `128a-HUMAN-UAT.md` and as an override on `128A-VERIFICATION.md` SC#3.

## Self-Check: PASSED (Loom item waived as not-applicable; no outstanding deferred work)
