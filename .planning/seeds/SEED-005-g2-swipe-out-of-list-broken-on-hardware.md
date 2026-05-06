---
id: SEED-005
status: dormant
planted: 2026-05-05
planted_during: v3.7 milestone (post Phase 119-01, awaiting DMARC auto-eval gate 2026-05-06)
trigger_when: v3.8+ milestone planning that includes G2 plugin work OR a real user reports the work-orders carousel feels stuck OR Phase 45 nav UX comes up again in any context
scope: Medium
---

# SEED-005: G2 swipe-out-of-list nav broken on hardware (Phase 45 hardware regression)

## Why This Matters

Phase 45 shipped a "swipe-out-of-list" gesture so users could escape the
work-orders list back to the home carousel via a single temple swipe. The
fix was validated end-to-end against the Even iPhone simulator and the
Phase 45 SUMMARY signed off on it.

Yesterday's v3.5 G2 hardware UAT (2026-05-05) caught a hard regression:
**on real G2 glasses, single-swipe gestures while on `WORK_ORDERS` do NOT
bubble SCROLL events to JS.** The user is stranded on the list with no
intuitive way out — only `DOUBLE_CLICK` → home → `SCROLL_TOP` from home
(which wraps backward to AFFIRMATION) works as a workaround.

Confirmed in `evenhub-simulator@0.6.2` too: clicking the simulator's `Down`
button while on work-orders also doesn't advance the carousel. Same SDK
behavior on both platforms — this isn't iPhone-specific, it's a list-container-level
event-consumption pattern. The 2026-04-05 simulator was older and lenient;
current SDK is stricter.

User memory entry "G2 plugin UX (fixed Phase 45) — tap-expand + swipe-out-of-list
nav landed; physical hardware retest still pending" specifically called out
that hardware retest was the open gate. UAT confirmed the regression.

The Phase 45 fix is effectively simulator-only on real glasses. This needs
a real nav redesign before daily use feels right.

## When to Surface

**Trigger:** v3.8+ milestone planning that includes G2 plugin work, OR a
real user reports the work-orders carousel feels stuck, OR Phase 45 nav UX
comes up again in any context.

This seed should be presented during `/gsd-new-milestone` when the
milestone scope matches any of these conditions:
- Theme includes "G2 hardware polish" or similar
- New phase planned to touch `vigil-g2-plugin/src/navigation.ts`
- HUMAN-UAT debt for Phase 45 surfaces during cross-phase audit

## Scope Estimate

**Medium** — A phase or two. Needs nav redesign:
- Option A: Document `DOUBLE_CLICK` → home as the canonical exit gesture
  (cheap; just docs + maybe an on-screen hint on the work-orders footer)
- Option B: Repurpose `DOUBLE_CLICK` from "exit to home" to "swipe out of
  list to next carousel screen" (breaks current double-tap exit semantics —
  needs careful nav-state-machine refactor)
- Option C: Investigate whether a `containerProperty` flag exists to make
  `ListContainerProperty` events bubble (needs SDK source dive)

Decision worth a discuss-phase loop before planning.

## Breadcrumbs

Related code and decisions in the current codebase:

- `vigil-g2-plugin/src/navigation.ts:127` — current DOUBLE_CLICK → home routing
- `.planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/HARDWARE-DIVERGENCE.md` — Divergence 2 (the canonical evidence)
- Phase 45 archive (in milestone v2.x or v3.x archives) — original swipe-out-of-list implementation
- SDK: `node_modules/@evenrealities/even_hub_sdk/README.md` — `ListContainerProperty` + `isEventCapture: 1` semantics

## Notes

Per HARDWARE-DIVERGENCE.md, this is **NOT a 106-05 ship-blocker** (UAT note:
"divergence is a follow-up bug, not a Phase 45 regression" was the v3.5 escape
clause). v3.5 closed clean on 2026-05-06 with this debt acknowledged.

Highest-value pick of the four UAT-evidenced G2 polish items because it's
the one regression that actively blocks daily use of the work-orders screen.
