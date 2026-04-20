# Phase 106 — G2 Store Resubmit Verification Checklist

> Fill this file during a single simulator verification session on the Even Realities
> iPhone app (v0.6.2+). The atomic gate (`npm run package:ehpk`) refuses to produce
> `vigil.ehpk` unless the `Verified:` line below is a real ISO 8601 timestamp within
> the last 24 hours AND all three checkboxes are ticked.

Verified: PLACEHOLDER_REPLACE_WITH_ISO_8601_AT_VERIFY_TIME

## Gate Checkboxes

- [ ] **G2-01** — `vigil-g2-plugin/store-assets/01-work-orders.png` and `02-affirmation.png` exist at native 576×288, captured from Even simulator v0.6.2+ with `VITE_SCREENSHOT_MODE=1` build
- [ ] **G2-02** — Double-tap on home fires host exit-confirmation dialog on simulator; double-tap on work-orders / affirmation / task-detail still returns to home (no regression)
- [ ] **G2-03** — All 4 screens render unified `VIGIL` header, 1px greyscale body border, footer nav hint, and fallback copy under API failure

## Simulator Session Details

- Simulator version: _e.g. Even Realities iPhone app 0.6.2_
- Simulator OS: _e.g. iOS 17.5_
- Session host machine: _e.g. jameson-imac_
- Screenshot mechanism used: _document the Even-app export path — first-time discovery per RESEARCH Q2_

## Observed Behavior Notes

- G2-02 host dialog appearance: _describe what the host-rendered exit confirmation looks like (button labels, timing). Per D-04, we document observed behavior rather than forcing the roadmap's "3 second" wording._
- Any simulator-specific quirks: _e.g. dialog auto-dismisses in Ns, `shutDownPageContainer(1)` stubbed on this sim version_

## Security Reminder (T8-leak-2)

**Do NOT commit `~/.config/evenhub/` or any vendor auth state.** `evenhub login` creates
user-local credentials; they belong on your machine, never in this repo. Check
`git status` before every commit during Plan 05.

## Figma Design Spec Review (RESEARCH Q1)

- [ ] Opened https://www.figma.com/design/X82y5uJvqMH95jgOfmV34j/Even-Realities---Software-Design-Guidelines--Public-?node-id=2922-80782
- [ ] Confirmed our border-weight (1px, color 15) and `VIGIL + screen-label` header pattern do not contradict the public spec
- [ ] Noted any token-value divergences:

## Resubmission Readiness

- [ ] `npm run package:ehpk` exits 0
- [ ] `vigil-g2-plugin/vigil.ehpk` exists and is > 10KB
- [ ] No untracked `~/.config/evenhub/` artifacts in `git status`
- [ ] Ready for manual upload to Even Hub (phase does NOT auto-upload per D-14)
