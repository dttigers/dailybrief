---
seed_id: SEED-011
title: G2 Companion HUD — single-tap and long-press tap variants
status: dormant
discovered: 2026-05-09
discovered_in: Phase 124 (G2 Companion HUD + WebSocket fan-out)
related_phases: [124, 125]
related_memories: [project_g2_tap_expand_broken]
---

# SEED-011 — G2 single-tap and long-press tap-event variants

## What is deferred

Phase 124 ROADMAP SC #2 originally promised THREE distinct tap behaviors on
the Companion HUD:

1. **Single-tap** clears the current banner.
2. **Double-tap** cycles through active sessions when ≥2 are tracked.
3. **Long-press** dismisses the current banner until the next state change.

Only behavior #2 (double-tap → cycle) is shippable today, and even that has
been narrowed to a context-sensitive overload (banner-ack → cycle-session →
jump-home) per Phase 124 D-08 because there is no other reliable tap event
on G2 hardware. Single-tap and long-press are not shipped in v3.8.

## Why deferred (rationale)

- **`CLICK_EVENT` (single-tap) is sim-only on G2 hardware.** Phase 45 retro
  (memory `project_g2_tap_expand_broken`) confirmed that `eventType` returns
  `undefined` on real G2 hardware for `CLICK_EVENT`, even though the
  simulator dispatches it correctly. Plumbing a single-tap behavior would
  ship a sim-passing / hardware-failing experience.
- **`LONG_PRESS_EVENT` is not in `OsEventTypeList`.** The vendored
  `@evenrealities/even_hub_sdk@0.0.9` enum (verified in
  `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
  lines 707-717) contains: `CLICK_EVENT`, `SCROLL_TOP`, `SCROLL_BOTTOM`,
  `DOUBLE_CLICK`, `FOREGROUND_ENTER`, `FOREGROUND_EXIT`, `ABNORMAL_EXIT`,
  `SYSTEM_EXIT`, `IMU_DATA_REPORT`. Long-press is absent.
- **Phase 45 / SEED-005 / SEED-006 pattern.** This is the third instance
  of "G2 SDK exposes an event in sim only" — the pattern is established,
  and the cure is to wait for SDK changes rather than ship sim-coupled
  behavior.

## Re-activation triggers (any of)

Re-evaluate this SEED if **any** of the following becomes true:

1. The Even Realities G2 SDK is upgraded to a version that adds
   `LONG_PRESS_EVENT` to `OsEventTypeList`.
2. A future SDK release re-classifies `CLICK_EVENT` as hardware-reliable
   (Even Realities changelog or a confirmed hardware retest demonstrates
   `eventType` is no longer `undefined` for single-tap).
3. User feedback on the shipped Companion HUD reveals that double-tap
   multi-context overload (banner-ack → cycle-session → jump-home) is
   confusing in real use, motivating revisiting tap-variant separation
   even with the SDK constraint (e.g., timing-based heuristic on
   `DOUBLE_CLICK` only).

## Implementation notes when re-activated

- The intended tap → behavior map (preserved verbatim from original SC #2):
  - `CLICK_EVENT` (single tap) → ack/dismiss banner
  - `DOUBLE_CLICK_EVENT` → cycle to next active session
  - `LONG_PRESS_EVENT` → dismiss banner until next state change
- Companion screen (`vigil-g2-plugin/src/screens/companion.ts`, shipped in
  Phase 124) and `handleNavEvent` switch (`navigation.ts`) are the
  implementation surfaces. Replace the D-08 context-sensitive double-tap
  handler with three distinct branches.
- Update ROADMAP SC #2 wording back to the original three-variant promise
  as part of the re-activation phase's PR.
- Update `.planning/REQUIREMENTS.md` AGENT-HUD-02 acceptance to reflect
  the original three-tap variant.

## Original wording preserved (for posterity)

ROADMAP.md Phase 124 SC #2, before Phase 124 Plan 05 narrowed it:

> User can trigger a `needs_input` event from a real Claude Code session
> via vigil-watch and within 2 seconds see a persistent banner appear on
> the temple HUD; single-tap clears the banner; double-tap on the temple
> cycles through active sessions when more than one is being tracked;
> long-press dismisses the current banner until the next state change.

## References

- Phase 124 CONTEXT.md D-08 (caveat block)
- Phase 124 RESEARCH.md §"Open Questions" item 1
- Phase 45 retro / memory `project_g2_tap_expand_broken`
- SDK type defs: `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts:707-717`
