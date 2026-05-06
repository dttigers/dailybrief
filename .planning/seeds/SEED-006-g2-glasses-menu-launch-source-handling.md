---
id: SEED-006
status: dormant
planted: 2026-05-05
planted_during: v3.7 milestone (post Phase 119-01, awaiting DMARC auto-eval gate 2026-05-06)
trigger_when: v3.8+ milestone planning that includes G2 plugin work OR a glasses-menu-launch UX optimization comes up
scope: Small
---

# SEED-006: G2 plugin doesn't differentiate appMenu vs glassesMenu launch source

## Why This Matters

The Even Hub SDK supports differentiating "opened from phone Plugins menu"
(`launchSource: 'appMenu'`) vs "opened from glasses gesture menu"
(`launchSource: 'glassesMenu'`). This is a one-time push delivered via
`bridge.onLaunchSource(callback)` after WebView load completes.

Vigil's `vigil-g2-plugin/src` has **zero references** to `onLaunchSource`,
`launchSource`, `glassesMenu`, or `appMenu`. The plugin treats both launch
contexts identically — every launch lands on the home carousel screen.

This is a UX gap because the two contexts have different intents:
- **appMenu launch** — user is on their phone, deliberately tapping into
  Vigil. Home carousel is fine; they're navigating.
- **glassesMenu launch** — user is wearing glasses, used a glasses-side
  gesture to wake Vigil. They almost certainly want today's brief
  (work-orders + affirmation) immediately, not the home screen as a
  carousel waypoint.

Daily-use implication: when sideload-via-store eventually lands and Vigil
becomes a glasses-first surface (vs a phone-tap surface), this UX gap will
feel increasingly wrong. Better to fix it now than retrofit later.

## When to Surface

**Trigger:** v3.8+ milestone planning that includes G2 plugin work, OR a
glasses-menu-launch UX optimization comes up.

This seed should be presented during `/gsd-new-milestone` when the
milestone scope matches any of these conditions:
- Theme includes "G2 hardware polish" or similar
- New phase planned to touch `vigil-g2-plugin/src/main.ts` or bridge init
- Glasses-first UX optimization comes up in discuss-phase

## Scope Estimate

**Small** — A few hours. Single-file change:
- Register `onLaunchSource` listener early in `main.ts` (must be before
  bridge resolves, per SDK docs: "register the listener as early as
  possible because this push happens only once after loading completes")
- Branch on source: `appMenu` → existing home carousel flow;
  `glassesMenu` → render today's brief directly
- Add a unit test that mocks both launch sources and asserts initial render

Worst-case fallback if the listener doesn't fire reliably: behaves the
same as today (home carousel). Low risk.

## Breadcrumbs

Related code and decisions in the current codebase:

- `vigil-g2-plugin/src/main.ts` — current bridge init, no launch-source handling
- `node_modules/@evenrealities/even_hub_sdk/README.md` — `onLaunchSource` API docs ("Listening for glasses-menu startup" section)
- `vigil-g2-plugin/src/navigation.ts` — carousel routing logic (where the launch-source branch would land)

## Notes

Surfaced during this conversation by code review (no UAT evidence yet).
Mention floated during discussion as a "Phase 999.3 candidate" but parked
for v3.8 milestone planning instead.

Lowest risk + smallest scope of the four UAT-adjacent G2 polish items.
Could be a quick fast-follow inside any G2 milestone.
