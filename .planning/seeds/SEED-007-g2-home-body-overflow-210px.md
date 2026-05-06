---
id: SEED-007
status: dormant
planted: 2026-05-05
planted_during: v3.7 milestone (post Phase 119-01, awaiting DMARC auto-eval gate 2026-05-06)
trigger_when: v3.8+ milestone planning that includes G2 plugin work OR home-screen layout work comes up
scope: Small
---

# SEED-007: G2 home body overflows 210px container — auto-scroll inconsistency on hardware

## Why This Matters

The home screen body has 7 logical lines of content:
1. Task count line
2. (blank)
3. "TOP PRIORITY:" label
4. Task content
5. (blank)
6. Divider
7. Inline affirmation

With `paddingLength: 8` and the SDK's font metrics, this overflows the
210px height of the home body container. v3.5 hardware UAT (2026-05-05)
captured the consequence: **two consecutive 📸 captures of home produced
different scrolled positions** — top half of content vs bottom half
visible. The simulator auto-scrolls between renders, producing inconsistent
display state.

Cosmetic on hardware (not a ship-blocker — home isn't even a required
store asset), but it makes the home screen feel unstable: a glance at the
glasses might show the affirmation; another glance moments later might
show the task count instead. That's the opposite of "ambient" UX.

## When to Surface

**Trigger:** v3.8+ milestone planning that includes G2 plugin work, OR
home-screen layout work comes up.

This seed should be presented during `/gsd-new-milestone` when the
milestone scope matches any of these conditions:
- Theme includes "G2 hardware polish" or similar
- New phase planned to touch `vigil-g2-plugin/src/screens/home.ts` (or
  wherever home body content is composed)
- A user complains that the home screen "shifts around"

## Scope Estimate

**Small** — A few hours. Three viable fix candidates (pick one):

- **A.** Increase home body container height from 210 → 220+ (compact
  footer to 28px to free vertical budget). Cleanest visual fit; no content
  loss.
- **B.** Trim a line from home content (drop the blank lines, OR drop the
  divider, OR drop the inline affirmation since AFFIRMATION is already a
  dedicated screen). Removes redundancy.
- **C.** Both A and B. Defensive.

Decision is mostly aesthetic — pick during discuss-phase based on what
"feels" right when wearing the glasses.

## Breadcrumbs

Related code and decisions in the current codebase:

- `vigil-g2-plugin/src/screens/home.ts` (or equivalent) — home body content composition
- `vigil-g2-plugin/src/navigation.ts` — `paddingLength` and container heights
- `.planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/HARDWARE-DIVERGENCE.md` — Divergence 4 (canonical evidence)
- SDK: `node_modules/@evenrealities/even_hub_sdk/README.md` — container height + scroll behavior

## Notes

Pure cosmetic. Lowest urgency of the four UAT-evidenced items but trivial
to fix. Worth bundling into any G2 phase that touches the home screen for
another reason.
