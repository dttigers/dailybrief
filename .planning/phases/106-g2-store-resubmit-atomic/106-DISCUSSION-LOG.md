# Phase 106: G2 Store Resubmit (Atomic) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 106-g2-store-resubmit-atomic
**Areas discussed:** Exit-confirm mechanism, G2-03 target & scope, Screenshot set, Atomic gate mechanism

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Exit-confirm mechanism | G2-02 UI/copy/timing; native SDK vs custom dialog; existing nav preservation | ✓ |
| G2-03 target & scope | What "WebView" means — companion page, glasses display, store listing | ✓ |
| Screenshot set (G2-01) | Which screens, count, resolution, naming, capture mechanism | ✓ |
| Atomic gate mechanism | How to enforce "all 3 verified in one session before .ehpk upload" | ✓ |

**User's choice:** All four.

---

## Exit-Confirm Mechanism

### Q1: Implementation approach

| Option | Description | Selected |
|--------|-------------|----------|
| Native SDK confirm | `bridge.shutDownPageContainer(exitMode=1)` — host draws the confirm UI; zero custom dialog code | ✓ |
| Custom greyscale dialog | Replace home container with text prompt + 3s timer + second-tap `shutDownPageContainer(exitMode=0)` | |
| Custom overlay, native fallback | Custom dialog container + `shutDownPageContainer(exitMode=0)` for teardown | |

**User's choice:** Native SDK confirm. **Notes:** Confirmed post-discussion by Even Hub Page Lifecycle docs — the `exitMode=1` behavior is the platform-sanctioned exit confirmation.

### Q2: Trigger scope

| Option | Description | Selected |
|--------|-------------|----------|
| Home only | Matches success criterion literally; preserves today's double-click-to-home on sub-screens | ✓ |
| Home + all root screens | Double-tap from home/work-orders/affirmation all trigger exit-confirm | |
| Globally from any screen | Every screen's double-tap = exit-confirm, including task-detail | |

**User's choice:** Home only.

### Q3: Event identification

| Option | Description | Selected |
|--------|-------------|----------|
| DOUBLE_CLICK_EVENT only | SDK enum already in NAV_EVENTS; matches existing dispatch | ✓ |
| DOUBLE_CLICK_EVENT with listener probe | Same event + short-lived probe to log every event for sim verification | |
| Defer — research before planning | Block planner until researcher resolves the event name | |

**User's choice:** DOUBLE_CLICK_EVENT only. **Notes:** Post-discussion WebFetch of Even Hub Input & Events confirmed `DOUBLE_CLICK_EVENT` (value 3) = "Double press (G2 or R1)." STATE.md research flag resolved.

---

## G2-03 Target & Scope

### Q1: Where does "brand-compliant UI" actually land?

(Asked first with four ambiguous options; user deflected to design-guidelines URL, requiring a WebFetch pass before re-asking.)

| Option | Description | Selected |
|--------|-------------|----------|
| iPhone-app companion page | index.html rendered as WebView by Even iPhone app; branded HTML splash | |
| Plugin store listing page | Store catalog chrome — mostly redundant with G2-01 | |
| Glasses display rendering | Rejection misused "WebView"; really means greyscale containers | |
| Unsure — re-read rejection email | Route to researcher agent | |

**User's response:** "am i matching these critea? https://hub.evenrealities.com/docs/guides/design-guidelines" — signaled that the Even Hub design guidelines are the authority, not guesswork.

**Post-fetch finding:** Design guidelines explicitly state "4-bit greyscale — design in shades of grey; the hardware renders them as shades of green" and "No background fill — you can only use borders and text/image content for visual structure." Vigil teal/Inter physically cannot render on the glasses display.

### Q1b: Re-asked with design-guideline grounding

| Option | Description | Selected |
|--------|-------------|----------|
| Greyscale hierarchy on glasses | Brand-compliant = hierarchy + clarity on greyscale; amend roadmap wording | ✓ |
| Companion iPhone-app WebView | Branded index.html splash; glasses-side unchanged | |
| Both: glasses + companion | Do both surfaces | |
| Defer — re-read rejection email | Block planner until researcher pins the surface | |

**User's choice:** Greyscale hierarchy on glasses.

### Q2: Must-fix changes on glasses canvas

| Option | Description | Selected |
|--------|-------------|----------|
| Consistent header across all 4 screens | `VIGIL ... HH:MM` + divider on every screen | ✓ |
| No empty/placeholder bodies | Fallback copy on every screen under API failure | ✓ |
| Footer nav hint on every screen | Swipe/exit affordances visible everywhere | ✓ |
| Greyscale borders for structure | `borderWidth: 1` per guideline "only borders and text/image for visual structure" | ✓ |

**User's choice:** All four.

---

## Screenshot Set (G2-01)

### Q1: Which glasses screens get captured?

| Option | Description | Selected |
|--------|-------------|----------|
| Home screen | VIGIL hero — first impression | |
| Work-orders list | Core value prop list | ✓ |
| Task-detail | Drill-down UX | |
| Affirmation screen | Calm brand voice | ✓ |

**User's choice:** Work-orders list + Affirmation screen. **Notes:** User said "ill upload the other" — phase produces these two PNGs; user handles home and task-detail uploads manually.

### Q2: Delivery mechanic

| Option | Description | Selected |
|--------|-------------|----------|
| PNGs committed to repo | `vigil-g2-plugin/store-assets/` as versioned artifacts | ✓ |
| PNGs written only, not committed | Gitignored folder; VERIFIED.md references only | |
| Capture script + manual export | Script sets up deterministic state + human captures | |

**User's choice:** PNGs committed to repo.

### Q3: Deterministic content for screenshots

| Option | Description | Selected |
|--------|-------------|----------|
| VITE_SCREENSHOT_MODE flag | Env var short-circuits api.ts to fixed demo data | ✓ |
| Seed demo account on api.vigilhub.io | Real server with curated data | |
| Whatever live account shows | No determinism | |

**User's choice:** VITE_SCREENSHOT_MODE flag.

---

## Atomic Gate Mechanism

### Q1: Enforcement mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| VERIFIED.md + pre-package script | Checklist file + `npm run package:ehpk` refuses to build without fresh verification | ✓ |
| VERIFIED.md + commit-body signoff only | Checklist + resubmit commit body reference; no script gate | |
| Single shell script runs all checks | `scripts/verify-g2.sh` prompts Y/n per item, stamps, invokes pack | |
| No gate code — phase-verifier owns it | Rely on /gsd-verify-work | |

**User's choice:** VERIFIED.md + pre-package script.

---

## Close-Out

### Q1: Ready for context?

| Option | Description | Selected |
|--------|-------------|----------|
| Create context | Write CONTEXT.md; next = /gsd-plan-phase 106 | ✓ |
| Explore more gray areas | Version bump, CHANGELOG, rollback, regression tests | |

**User's choice:** Create context.

---

## Claude's Discretion

- Exact copy for fallback / empty-state text (subject to Vigil voice — short sentences, first-person, no productivity jargon).
- Exact border styling details (weight, positions) within the greyscale-only guideline.
- `VERIFIED.md` schema (field names, timestamp format, stale-detection logic).
- Screenshot filename convention within `store-assets/`.
- Demo data values behind `VITE_SCREENSHOT_MODE`.
- Whether to add a short-lived event-logging probe on home for future physical-hardware confirmation.

## Deferred Ideas

- Companion iPhone-app WebView branding (branded `index.html` splash) — future phase if reviewer flags it.
- Physical hardware retest (~2026-04-24) — already tracked in STATE.md blockers.
- Rollback/alternate plan if resubmit rejected again — future phase.
- App.json version bump + CHANGELOG entry — planner call, may bundle.
- Regression tests for existing nav behavior — planner call.
- Listener probe for physical double-press confirmation — Claude's discretion.
