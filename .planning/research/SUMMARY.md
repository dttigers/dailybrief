# v3.9 Voice & Companion Polish — Research Synthesis

**Project:** Vigil — Ambient AI Life Assistant
**Milestone:** v3.9
**Researched:** 2026-05-11 (4 parallel agents + canonical Even SDK skill review)
**Confidence:** HIGH for 7 originally-scoped buckets; MEDIUM for 3 late-arriving buckets (covered by EVEN-SKILLS.md for G2 surfaces, but G2-REPLY-SPIKE feasibility genuinely unknown)

## Companion Files

| File | Scope | Confidence |
|------|-------|------------|
| `STACK.md` | Library/version decisions per feature; VOICE-01 spike scope; ServiceNow PDF ranking | HIGH |
| `FEATURES.md` | 6 bucket landscape with table-stakes vs differentiator vs anti-feature; P1/P2/P3 prioritization | HIGH |
| `ARCHITECTURE.md` | Endpoint/schema delta; 6 data-flow diagrams; build order with dependency rationale | HIGH |
| `PITFALLS.md` | 20 pitfalls (7 critical / 6 high / 7 medium) with warning signs + prevention + phase mapping | HIGH |
| `EVEN-SKILLS.md` | Canonical Even Realities `everything-evenhub` skill findings — corrects gesture/state/audio assumptions | HIGH |

## Executive Summary

v3.9 is **additive polish + two anchor capabilities** on a mature 5-client platform — not green-field. The 4 researchers + EVEN-SKILLS canonical review converged on:

- **VOICE-01 is the milestone-defining spike-gate** (shortened to ~1 day after PCM format locked: 16kHz × 16-bit LE × mono = 32 KB/s)
- **G2-REPLY-SPIKE is the second hard gate** — Even SDK exposes zero Claude-Code write-back primitives; Vigil must invent the path
- **Zero new server deps** for 6 of 10 buckets (one conditional: `openai@^4.x` for transcription, only if Anthropic beta.files inadequate)
- **Reuse-verbatim patterns:** Phase 121 composite-unique partial indexes (anti-duplicate), Phase 124 hand-rolled SSE shim, Phase 117/125 drift-detector tests
- **Phase 124 D-08 single-tap finding likely a code bug, not hardware** — protobuf zero-omission gotcha (`?? 0` missing); Phase 0 audit gates G2-ACTION + G2-REPLY scope
- **`setBackgroundState` is a separate SDK primitive** from `setLocalStorage`; G2-LIFECYCLE-01 needs both
- **Top pitfalls demand Phase 0 guardrails BEFORE feature code:** audio-in-logs leakage, always-listening surface, cross-feature cost runaway

## Recommended Phase Order

| # | Phase | Notes |
|---|-------|-------|
| 127 | Pre-spike privacy + cost-cap guardrails + schema reconcile | Pitfalls 1, 2, 3, 7, 15 must land BEFORE feature code |
| 127.5 | Single-press code audit (Phase 0) | 30-min `companion.ts` event-handler review; outcome shapes G2-ACTION + G2-REPLY |
| 128a | VOICE-01 PCM spike | Format locked; spike measures chunk size / latency / dropout / battery |
| 128b | G2-REPLY-SPIKE | Invent write-back path; PASS / DEGRADE / BLOCK |
| 129 | G2-LIFECYCLE-01 + SVCNOW-01 | Parallel-safe small wins during spike windows; G2-LIFECYCLE bundles Companion HUD `setBackgroundState` wiring per operator decision |
| 130 | VOICE-02..N | Scope-locked from 128a verdict; transcription provider pick (Anthropic vs OpenAI) before commit |
| 131 | INSIGHTS-FRESH-01 + CHAT-CTX-01 | Bundle for one PWA UAT pass |
| 132 | QUIET-AUTO-01 | 30-min iOS Shortcut feasibility sub-spike; scoped API key |
| 133 | G2-ACTION-01..N + G2-REPLY-02..N (if PASS) + WATCH-ENRICH-01/02/03 + HUD-CLARITY-01..N | Bundles G2-side features for one hardware UAT close-out |

## Open Decisions (Operator)

1. **Transcription provider:** Stack researcher recommends OpenAI `gpt-4o-mini-transcribe` ($0.003/min); Architecture researcher recommends Anthropic beta.files (reuses existing primitive, no new vendor secret). Decide before VOICE-02 phase plan.
2. **Whether to vendor `everything-evenhub` skill files** locally for offline reference, or reference via GitHub URL only.
3. **WATCH-ENRICH-03 prompt-preview privacy posture:** redact-only vs redact-and-truncate vs feature-flag-off-by-default.

## Cross-Cutting Risks

- **Cross-feature cost amplification** — INSIGHTS-FRESH + CHAT-CTX + VOICE land simultaneously; per-user daily AI-cost watermark required
- **5+ new SSE event types** may saturate plugin `setMaxListeners(50)` headroom; audit pattern needed
- **Phase 107.1 stale `work_orders` columns** must reconcile before any v3.9 migration
- **Prompt injection surface** — voice + popup capture introduce indirect content; `<thought>` delimiter wrap + tag-breakout sanitization in CHAT-CTX-01 same phase
- **G2-REPLY privilege-escalation threat** — writer compromise = arbitrary Claude Code input; structural mitigation via prefab-allowlist + privilege drop in plan-01
