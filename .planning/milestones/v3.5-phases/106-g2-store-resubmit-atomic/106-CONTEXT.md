# Phase 106: G2 Store Resubmit (Atomic) - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Atomically resolve all three Even Hub store rejection items — G2-01 (simulator screenshots), G2-02 (double-tap exit confirmation), G2-03 (brand-compliant glasses UI) — and verify them on the Even simulator v0.6.2+ in a single session before a single `.ehpk` is uploaded. No partial resubmission. Scope is the `vigil-g2-plugin/` plugin only; no server or PWA changes.

</domain>

<decisions>
## Implementation Decisions

### G2-02 Exit Confirmation

- **D-01:** Use the SDK's native exit-confirm flow: on double-tap from home, call `bridge.shutDownPageContainer(exitMode=1)`. Even Hub docs (Page Lifecycle) explicitly define: "Pass 0 for immediate exit, 1 for exit confirmation dialog." The host draws the confirmation UI — we do not render a custom greyscale dialog.
- **D-02:** Trigger scope is the home screen ONLY. Preserve today's `handleNavEvent` behavior on work-orders / affirmation / task-detail (double-click returns to home). No regression to existing muscle memory.
- **D-03:** Event is `OsEventTypeList.DOUBLE_CLICK_EVENT` (value 3) — officially documented in Even Hub Input & Events as "Double press (G2 or R1)." **Resolves STATE.md research flag** for Phase 106.
- **D-04:** The "3 seconds" and "waiting resets to home" timing in the roadmap success criterion is fulfilled by the host's native confirmation layer — we do not implement our own timer. If the host dialog auto-dismisses differently, planner documents the observed behavior in `VERIFIED.md` rather than trying to match the roadmap text literally.

### G2-03 Brand-Compliant UI

- **D-05:** Scope lands on the glasses greyscale canvas. Vigil's teal palette and Inter font **cannot physically render** on the 4-bit greyscale G2 display per Even Hub Design Guidelines ("design in shades of grey; the hardware renders them as shades of green"). Vigil's brand guide still informs voice/tone of copy but not color/typography on glasses.
- **D-06:** Planner must amend the roadmap's "Vigil brand colors and Inter font" wording during planning to reflect the hardware constraint — the intent (no blank/placeholder states, recognizably Vigil) stays; the literal wording updates.
- **D-07:** Glasses must-fix checklist (all four apply):
  1. Consistent `VIGIL ... HH:MM` + divider header across all 4 screens (home already has it — extend to work-orders, affirmation, task-detail).
  2. No empty/placeholder bodies on any screen under API failure — every screen has fallback copy (e.g., "No work orders yet", "Brief unavailable — retry").
  3. Footer nav hint on every screen (swipe up/down, double-tap to exit).
  4. Use greyscale borders (`borderWidth: 1`) for visual structure per design guideline: "No background fill — you can only use borders and text/image content for visual structure."
- **D-08:** Companion iPhone-app WebView (branded `index.html`) is **deferred** — not part of this phase. If a future rejection calls it out specifically, it becomes its own phase.

### G2-01 Screenshots

- **D-09:** Division of labor: this phase produces **work-orders** + **affirmation** PNGs. User uploads the home + task-detail screenshots himself to the store listing.
- **D-10:** Screenshots captured from Even simulator v0.6.2+ at native 576×288, committed to `vigil-g2-plugin/store-assets/` (Claude's discretion on exact filenames — e.g. `01-work-orders.png`, `02-affirmation.png`).
- **D-11:** Add a `VITE_SCREENSHOT_MODE` env flag that short-circuits `src/api.ts` to return fixed demo data (stable task list, specific affirmation). Defaults off — production code-path untouched. Used only when capturing screenshots.

### Atomic Gate

- **D-12:** Gate is enforced in the build pipeline. Checklist file: `.planning/phases/106-g2-store-resubmit-atomic/VERIFIED.md` with checkboxes for G2-01/02/03 and a simulator-session timestamp.
- **D-13:** Add an npm script (e.g. `npm run package:ehpk`) that refuses to produce the `.ehpk` unless `VERIFIED.md` exists **and** its simulator-session timestamp is within the last 24 hours. Skipping the checklist or rerunning without re-verifying is a hard failure, not a warning.
- **D-14:** Phase does NOT upload the `.ehpk` to Even Hub — it stops at a packaged `.ehpk` the user can upload manually. Atomic gate is "build refuses to pack without fresh verification," not "resubmit automatically."

### Claude's Discretion

- Exact copy for fallback / empty-state text (subject to Vigil voice: "Calm · Confident · Empathetic · Quiet · Direct · Warm" — short sentences, first-person, no productivity jargon).
- Exact border styling (weight, positions) and spacing tweaks within the greyscale-only guideline.
- `VERIFIED.md` schema (field names, exact timestamp format, how stale-detection reads it).
- Screenshot filename convention inside `store-assets/`.
- Demo data values behind `VITE_SCREENSHOT_MODE` (3 tasks with specific content is fine).
- Whether to add a short-lived listener probe that logs every sys/text/list event name on home, for later physical-hardware confirmation.

### Folded Todos

None. Pending todos list (STATE.md) shows "None"; todo match-phase returned zero results.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 106: G2 Store Resubmit (Atomic)" — goal, depends-on, success criteria 1–4
- `.planning/REQUIREMENTS.md` §G2-01 / G2-02 / G2-03 — verbatim requirement text the rejection mapped to
- `.planning/STATE.md` §"Blockers/Concerns" — Phase 106 research flags (double-press event name, Figma design spec)

### Even Hub platform docs
- https://hub.evenrealities.com/docs/guides/design-guidelines — "4-bit greyscale", "No background fill" rules (rules out Vigil teal on glasses)
- https://hub.evenrealities.com/docs/guides/page-lifecycle — `shutDownPageContainer(exitMode)` parameter spec: 0 = immediate exit, 1 = exit confirmation dialog
- https://hub.evenrealities.com/docs/guides/input-events — `DOUBLE_CLICK_EVENT` (value 3) = "Double press (G2 or R1)"; "Only one container per page can capture events"

### Vigil brand (voice only on glasses — color/font don't render)
- `/Users/jamesonmorrill/Library/Mobile Documents/com~apple~CloudDocs/vigil-brand-guidelines.pdf` — authoritative voice/tone source
- `~/.claude/projects/-Users-jamesonmorrill-Desktop-Local-AI-dailybrief/memory/reference_brand_guidelines.md` — transcribed palette + typography + voice

### Existing code to extend/preserve
- `vigil-g2-plugin/src/main.ts` — `NAV_EVENTS` dispatch, 60s refresh timer, FOREGROUND lifecycle wiring
- `vigil-g2-plugin/src/navigation.ts` §`handleNavEvent` — existing double-click-to-home nav to preserve on non-home screens; home branch gets the exit-confirm call
- `vigil-g2-plugin/src/screens/home.ts` — existing `VIGIL ... HH:MM` + divider header pattern to extend to other screens
- `vigil-g2-plugin/src/screens/work-orders.ts`, `affirmation.ts`, `task-detail.ts` — screens needing header/fallback/footer upgrades
- `vigil-g2-plugin/src/api.ts` — site of the `VITE_SCREENSHOT_MODE` short-circuit
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` L1199 — `shutDownPageContainer(exitMode?: number): Promise<boolean>` signature
- `vigil-g2-plugin/app.json` — version bump candidate (planner decides: 0.1.0 → 0.2.0)
- `vigil-g2-plugin/package.json` — host for the new `package:ehpk` script

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TextContainerProperty` factory pattern in `home.ts` — same shape works for all screens; extend header/body/footer layout uniformly.
- `NAV_EVENTS` `Set<OsEventTypeList>` dispatch in `main.ts` — natural place to add a home-screen gate before routing `DOUBLE_CLICK_EVENT` to `handleNavEvent`.
- `refreshCurrentScreen` + 60s timer — keeps screens live; must continue working while exit-confirm is pending.

### Established Patterns
- "Only one container per page can capture events" (Even Hub Input & Events) — current pattern uses `isEventCapture: 1` on body, 0 on header/footer. Preserve.
- Circular nav via `SCREEN_ORDER` in `navigation.ts` with task-detail as a sub-screen outside the cycle. Home-branch exit-confirm adds a new edge case inside `handleNavEvent` without reshaping `SCREEN_ORDER`.
- No Vite env flags currently used by plugin code — `VITE_SCREENSHOT_MODE` is the first. Keep it opt-in; default behavior unchanged.

### Integration Points
- Exit-confirm branch: `main.ts` sysEvent handler OR `navigation.ts::handleNavEvent` — planner decides. Recommend `handleNavEvent` so all nav logic stays in one file.
- Screenshot demo data: `api.ts` fetch functions — guard with `if (import.meta.env.VITE_SCREENSHOT_MODE)`.
- Pre-package gate: `package.json` scripts section — new `package:ehpk` script that shells out to a node check of `VERIFIED.md` before running the existing build+pack flow.

### Constraints
- Glasses display is 4-bit greyscale with no background fill. Cannot render Vigil teal. Vigil brand presence = header wordmark + copy voice, not color.
- `app.json` permissions whitelist is pinned to `https://api.vigilhub.io` — no new domains this phase.

</code_context>

<specifics>
## Specific Ideas

- **User's self-QA lens for G2-03:** "am I matching these criteria?" pointing at https://hub.evenrealities.com/docs/guides/design-guidelines. Planner must cite the specific guideline clause each change addresses (e.g., "borders-only rule" → D-07 item 4).
- **STATE.md flag resolution:** "confirm exact G2 double-press event name from Even Hub docs in-browser (WebFetch returned empty during research)" — resolved in this discussion: `DOUBLE_CLICK_EVENT` value 3 per Input & Events doc. Update STATE.md blockers accordingly in `update_state`.
- **STATE.md flag open:** "review Even Realities public Figma design spec before G2-03 CSS changes" — not actioned this session; researcher agent should check if a public Figma link exists in hub.evenrealities.com before planner writes the header/border tweaks. Non-blocking — D-05 through D-07 stand either way because they derive from the greyscale guideline not the Figma spec.

</specifics>

<deferred>
## Deferred Ideas

- **Companion iPhone-app WebView branding** (branded `index.html` splash with Vigil logo + Teal 600 + Inter) — deferred until a future rejection explicitly flags that surface. Would be its own phase.
- **Physical hardware retest** (~2026-04-24) — already tracked in STATE.md blockers, not this phase.
- **Rollback / alternate plan if resubmit rejected again** — handled by a future phase if/when it happens, not pre-built.
- **App.json version bump + CHANGELOG entry** — planner-call, may bundle into this phase's plans.
- **Regression tests for existing nav behavior** (swipe cycle, tap-to-task-detail, double-click-to-home from non-home) — planner decides whether to add; not required by rejection criteria.
- **Listener probe for physical double-press confirmation** — Claude's discretion; not required for simulator verification.

### Reviewed Todos (not folded)

None reviewed. `gsd-tools todo match-phase 106` returned zero matches; STATE.md Pending Todos section says "None".

</deferred>

---

*Phase: 106-g2-store-resubmit-atomic*
*Context gathered: 2026-04-19*
