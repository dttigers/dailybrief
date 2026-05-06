---
id: SEED-010
status: dormant
planted: 2026-05-05
planted_during: v3.7 milestone (post Phase 119-01, awaiting DMARC auto-eval gate 2026-05-06)
trigger_when: v3.8 OR v3.9 milestone planning AND user wants new G2 product surface (not just polish) — likely milestone-anchor candidate, NOT a fast-follow
scope: Large
---

# SEED-010: Voice capture from G2 glasses via SDK audioControl + audioEvent PCM stream

## Why This Matters

This is the most exciting capability the G2 hardware unlocks for Vigil and
the cleanest path to "ambient capture with zero friction" — Vigil's stated
core value:

> "Capture every thought with zero friction and have the system organize
> it for you — so nothing falls through the cracks and your brain can let
> go." — PROJECT.md

The Even Hub SDK exposes:

1. **`audioControl(isOpen: boolean)`** — turns the glasses' microphone on
   or off
2. **`onEvenHubEvent`** — once mic is on, receives `audioEvent` pushes
   carrying PCM bytes in `event.audioEvent.audioPcm` (a `Uint8Array`)

That's a complete audio capture pipeline from the glasses themselves — no
phone interaction needed once it's started. User taps a glasses gesture →
mic opens → speaks a thought → mic closes → PCM stream goes to Vigil →
Vigil sends to vigil-core → vigil-core transcribes (Whisper / similar) +
captures as a thought, just like any text capture from the PWA or
extension.

This makes Vigil genuinely glasses-first instead of glasses-as-viewport.

**Why this beats every other capture path Vigil has today:**

- PWA capture requires phone unlock + open PWA + tap input + type
- Safari extension capture requires laptop open + extension click + type
- Email-forward / Gmail capture requires deciding to forward an email
- **Voice from glasses requires nothing but a head gesture and speaking**

For the user (ADHD founder building a daily-driver tool — see user
profile), this is the difference between "captures things sometimes when
phone is handy" and "captures every thought."

## When to Surface

**Trigger:** v3.8 OR v3.9 milestone planning, AND user wants new G2
product surface (not just polish).

This seed should be presented during `/gsd-new-milestone` when the
milestone scope matches any of these conditions:
- Theme is explicitly "voice capture" or "ambient capture" or "G2-first"
- User asks "what's the highest-impact G2 work?"
- User wants a milestone with a single big feature instead of polish

**This is a milestone-anchor candidate, NOT a fast-follow.** It should
not ride along inside a "G2 hardware polish" milestone alongside
SEEDs 005-008 — it's bigger than the rest combined and deserves its own
theme.

## Scope Estimate

**Large** — A full milestone, probably 3-5 phases:

- **Phase A:** SDK exploration + bridge wiring. Verify `audioControl` +
  `audioEvent` work on real hardware. Confirm PCM format (sample rate,
  bit depth, mono/stereo, byte order). Measure end-to-end latency from
  speaking → PCM arrival. Stretch: detect silence-end so capture can
  auto-stop.
- **Phase B:** Glasses-side gesture binding. Pick a gesture
  (long-press temple? IMU head-nod via SEED-adjacent IMU work?
  glasses-menu Vigil → "Capture" subcommand?). Build a "recording"
  visual state on the LED.
- **Phase C:** PCM upload pipeline to vigil-core. Endpoint + auth +
  retry on flaky connection. Probably needs a new
  `/v1/captures/audio` route that accepts PCM (or pre-encodes to opus on
  the plugin side to save bandwidth).
- **Phase D:** vigil-core transcription. Whisper API or local Whisper
  via Railway. Cost analysis. Latency budget. Falls into existing
  capture pipeline once transcribed.
- **Phase E:** End-to-end UX polish, error handling, no-network
  fallback (queue PCM locally, upload when connected).

## Anti-scope

This is **NOT** about:

- Real-time conversation / chat with an LLM through the glasses (different
  product)
- Audio playback through the glasses (different product, possibly
  different SDK surface)
- Voice biometric auth (different product)

Strictly: spoken thought → text capture. Mirrors the existing PWA capture
text path, just with audio as the input modality.

## Breadcrumbs

Related code and decisions in the current codebase:

- `node_modules/@evenrealities/even_hub_sdk/README.md` — `audioControl` + `audioEvent` API docs
- `vigil-core/src/routes/captures.ts` (or equivalent) — existing capture creation endpoint
- Phase 94+ (multi-platform capture parity work) — PWA + Safari extension capture paths to mirror
- `vigil-g2-plugin/src/main.ts` — `onEvenHubEvent` registration site (where audio events would land)

## Notes

No UAT evidence — pure capability reading from the SDK. Worth a small
spike (1-2 days) before committing to a full milestone, just to confirm:

1. The mic actually works on the user's specific G2 firmware (2.2.0.28)
2. PCM latency + quality is good enough for transcription
3. Battery cost on the glasses is acceptable for daily use

If the spike reveals fundamental hardware limits, this seed dies and the
G2 plugin stays a viewport. If the spike works, this likely becomes the
v3.9 (or v4.0) headline.
