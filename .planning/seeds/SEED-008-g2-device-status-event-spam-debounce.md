---
id: SEED-008
status: dormant
planted: 2026-05-05
planted_during: v3.7 milestone (post Phase 119-01, awaiting DMARC auto-eval gate 2026-05-06)
trigger_when: v3.8+ milestone planning that includes G2 plugin work OR telemetry/logging cleanup phase OR battery/perf debugging
scope: Small
---

# SEED-008: G2 plugin device-status events spam with connectType: "none"

## Why This Matters

`HARDWARE-DIVERGENCE.md` Divergence 6 (v3.5 UAT, 2026-05-05) caught: the
Even Hub SDK fires `Device status changed` events **repeatedly** with
`connectType: "none"` — i.e., the host is reporting "no device" over and
over without state change.

Three concrete consequences:

1. **Battery / CPU drain on iPhone** — every event runs through the Vigil
   event handler chain. Repeated no-op work over a long session is real
   battery cost.
2. **Telemetry pollution** — if/when Vigil starts forwarding device-status
   events to vigil-core for observability (Phase 103-style ops work), this
   noise would dwarf real signal.
3. **Debuggability** — when investigating real connect/disconnect bugs,
   the spam makes the event log unreadable.

Standard fix is a debounce/dedupe in the event handler: reject repeated
events whose `connectType` matches the last-seen `connectType`. Only the
*first* `connectType: "none"` after a state change should fire downstream
side effects.

## When to Surface

**Trigger:** v3.8+ milestone planning that includes G2 plugin work, OR
telemetry/logging cleanup phase, OR battery/perf debugging surfaces.

This seed should be presented during `/gsd-new-milestone` when the
milestone scope matches any of these conditions:
- Theme includes "G2 hardware polish" or similar
- New phase planned to touch `vigil-g2-plugin/src/main.ts` event handlers
- Observability/telemetry work comes up (echoes Phase 103 patterns)

## Scope Estimate

**Small** — A few hours. Single-handler change:

- Add a `lastSeenConnectType` ref + dedupe guard at the
  `onEvenHubEvent` listener entry point
- Unit test with mock event stream emitting 5×`{connectType: "none"}` →
  asserts handler body runs only once
- Bonus: log the *deduped* event count at debug level so spam volume is
  visible if it ever changes

## Breadcrumbs

Related code and decisions in the current codebase:

- `vigil-g2-plugin/src/main.ts` — `onEvenHubEvent` registration / handler
- `node_modules/@evenrealities/even_hub_sdk/README.md` — `Device status changed` push format docs
- `.planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/HARDWARE-DIVERGENCE.md` — Divergence 6 (canonical evidence)

## Notes

Smallest of the four UAT-evidenced items by impact, but also the cheapest
fix. Worth bundling with SEED-006 (glasses-menu launch) since both touch
the same `main.ts` event-handler region — single phase could land both.
