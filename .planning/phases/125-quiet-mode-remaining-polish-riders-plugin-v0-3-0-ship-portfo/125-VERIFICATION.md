---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
status: pending
operator: <fill on retest>
retest_date: <fill on retest, ISO 8601>
firmware: 2.2.0.28
plugin_version: 0.3.0
---

# Phase 125 — Hardware Verification

> Operator wallclock checkpoint per memory `feedback_wallclock_checkpoint_exempt`.
> yolo mode does NOT bypass. Five scenarios; each requires real G2 worn,
> iPhone Even App connected, PWA bearer in localStorage, and vigil-watch
> running on the Mac.

This document is a SKELETON authored by the executor (Plan 125-09 Task 1).
The operator runs the 5 scenarios on real G2 firmware 2.2.0.28, drops
evidence files into `artifacts/`, and back-fills `Status:` / `Evidence:` /
`Notes:` per scenario plus the operator sign-off + final disposition at
the bottom.

## Pre-flight

- [ ] G2 paired and connected (battery > 30%)
- [ ] iPhone Even App version current; vigil sideloaded from local pack
      OR latest dev portal upload (`vigil-g2-plugin/vigil.ehpk` from Plan 08)
- [ ] PWA accessible via Settings page; current bearer signed in (verify
      `Settings → G2 Plugin` row visible per Phase 125 UI-SPEC Surface 1)
- [ ] vigil-watch installed via launchd, status `running` (memory
      `project_imac_vigilcore_daemon` — bootout `com.jamesonmorrill.vigilcore`
      first if local `npm run dev` is the runtime)
- [ ] Test Claude Code session ready in VS Code (a prompt that reliably
      triggers `needs_input` — see Plan 11 §"Demo prompt staging")

---

## Scenario 1 — AGENT-HUD-03 Quiet mode E2E (PWA toggle → SSE → HUD filter → replay)

**Maps to:** AGENT-HUD-03 (UI-SPEC Surface 2 §"What Quiet Mode Suppresses (HUD-Write Filter)";
VALIDATION row "Hardware E2E retest of Quiet mode flow").

**Steps:**
1. With G2 worn and HUD on Companion, confirm header `rightSide` shows
   current state (offline indicator if SSE down, N/M if multi-session,
   else clock).
2. Open PWA Settings → G2 Plugin section. Confirm Quiet mode toggle is
   OFF.
3. Toggle Quiet mode ON. Within ~100ms, observe G2 Companion HUD
   `rightSide` now shows `Q` glyph (UI-SPEC Surface 2 §"Updated rightSide
   Priority Order" rule 4: `Q` when quiet ON, SSE up, ≤1 session).
4. Trigger a non-allowlist event (e.g., let a Claude Code session emit
   `task_complete` via vigil-watch; or post directly via curl with
   `event:"heartbeat"`). Confirm HUD body does NOT show the `[DONE]`
   toast or update banner overlay.
5. Trigger an allowlist event: cause Claude Code to fire `needs_input`
   (e.g., a confirmation prompt). Confirm HUD shows the `[NEEDS INPUT]`
   banner (allowlist passes through during quiet window).
6. Toggle Quiet mode OFF in PWA. Confirm `Q` glyph disappears from HUD
   `rightSide`.
7. Confirm any held events from step 4 replay in chronological order —
   HUD body briefly cycles through them via the server-side suppression
   queue flush (CONTEXT D-04).

**Acceptance:**
- Q glyph appears within 100ms of toggle-on
- Q glyph disappears within 100ms of toggle-off
- Non-allowlist events do NOT surface during quiet window
- Allowlist events DO surface during quiet window (`needs_input`,
  `task_failed`)
- Held events replay in chronological order on toggle-off

**Status:** ⬜ pending
**Evidence:** (fill — paths to screenshots / photos / video in `artifacts/`,
recommended: `artifacts/scenario-1-quiet-mode-e2e-2026-MM-DD/`)
**Notes:** (fill)

---

## Scenario 2 — Companion HUD ack (Phase 124 D-08 carry-forward + v0.3.0 regression check)

**Maps to:** G2-PLUGIN-01 (UI-SPEC Surface 2 §"Navigation + Interaction Contract — G2";
VALIDATION row "Hardware retest of Companion HUD + double-tap ack…").

**Steps:**
1. With G2 worn, navigate to Companion (via plugin tile in Even App).
2. Trigger a `needs_input` event. Confirm banner `[NEEDS INPUT]` appears
   on HUD line 1; line 2 shows `waiting for input`; line 3 shows the
   truncated event message.
3. Double-tap the temple. Banner clears, line 1 returns to session
   label, line 2 returns to `running`.
4. Trigger a second `needs_input` on a different session (start a new
   Claude Code session in a second VS Code window or post a synthetic
   event with a fresh `sessionId`). Confirm banner appears for that
   session.

**Acceptance:**
- Double-tap acks the banner (Phase 124 D-08 carry-forward)
- Multi-session banner re-appears for new sessions
- No regression vs Phase 124 ack flow

**Status:** ⬜ pending
**Evidence:** (fill)
**Notes:** (fill)

---

## Scenario 3 — Work-orders exit gesture (D-06 fallback verification)

**Maps to:** G2-POLISH-05 (UI-SPEC Surface 2 §"G2 Footer Copy"; CONTEXT D-06
fallback branch — footer-hint Option B; VALIDATION row "work-orders
exit").

**Steps:**
1. With G2 worn, navigate via SCROLL_DOWN from Companion to Work Orders
   screen.
2. Confirm footer text reads `() double-tap to exit` (verbatim — use the
   bottom-line of the `wo-list` container; matches the string-render
   gate in 125-VALIDATION.md row "work-orders.ts footer renders…").
3. Double-tap temple. Confirm screen exits to Home (via DOUBLE_CLICK →
   home pattern locked in Phase 124 D-08).

**Acceptance:**
- Footer reads exactly `() double-tap to exit`
- Double-tap exits to Home
- No "trapped on WORK_ORDERS" regression from v3.5 hardware UAT

**Status:** ⬜ pending
**Evidence:** (fill — photo of HUD showing footer text)
**Notes:** (fill)

---

## Scenario 4 — Home body D-14 byte-identity (Phase 124 invariant carried into v0.3.0)

**Maps to:** G2-PLUGIN-01 / Phase 124 D-14 carry-forward (UI-SPEC Surface 2
§"Verification Gates" row "Phase 124 D-14 home regression"; VALIDATION
row step 4 of "Hardware retest of Companion HUD…").

**Steps:**
1. With G2 worn, capture screenshot of Home body via Even App's
   screenshot feature (or evenhub-simulator screenshot button if
   hardware capture unavailable — note in §Notes which capture path was
   used).
2. Wait 5 seconds. Capture again.
3. Compare the two captures pixel-for-pixel (Phase 124 D-14 invariant).
   If using `cmp`:
   ```bash
   cmp artifacts/home-1.png artifacts/home-2.png && echo "PASS" || echo "FAIL"
   ```

**Acceptance:**
- Two captures byte-identical (no auto-scroll/overflow regression
  introduced by v0.3.0 changes)
- v0.3.0 should not touch Home rendering at all — if FAIL, regression
  must be root-caused before Plan 10 can proceed

**Status:** ⬜ pending
**Evidence:** (fill — pair of PNG captures + diff verdict; recommended
path: `artifacts/scenario-4-home-byte-identity-2026-MM-DD/`)
**Notes:** (fill — if not byte-identical: investigate which change
caused regression; v0.3.0 should not touch Home rendering at all per
UI-SPEC Surface 2 §"Visual Differentiation")

---

## Scenario 5 — needs_input → ack flow (AGENT-DEMO-01 dry run)

**Maps to:** AGENT-DEMO-01 (UI-SPEC Surface 2 §"Navigation + Interaction
Contract — G2"; VALIDATION row "60-second portfolio demo recording" —
this is the dry-run BEFORE the actual recording in Plan 11).

**Steps:**
1. Start a real Claude Code session in VS Code (the test prompt staged
   for Plan 11).
2. Walk away from keyboard for ~15 seconds.
3. Wait for `needs_input` to fire on G2 (banner `[NEEDS INPUT]` appears).
4. Double-tap to ack.
5. Walk back, answer Claude Code, let it complete.
6. Confirm HUD shows `task_complete` toast briefly.

**Acceptance:**
- Full flow operates end-to-end on real hardware
- Latency from prompt-fire to G2 banner < 5 seconds
- Double-tap acks reliably (no missed taps — if missed, surface SEED-011
  to log per memory `project_g2_tap_expand_broken`)

**Status:** ⬜ pending
**Evidence:** (fill — phone video clip, < 60s, recommended path:
`artifacts/scenario-5-demo-dry-run-2026-MM-DD.mp4` or similar)
**Notes:** (fill)

---

## Disposition

After all 5 scenarios are complete:

- **All green:** Plan 10 (Even Hub upload) is unblocked. Operator
  proceeds to Plan 11 demo recording in parallel or after.
- **Any yellow** (passed with caveats): Document caveat in §Notes;
  surface to user; user decides whether to proceed to Plan 10 or
  fix-and-retest.
- **Any red:** Plan 10 BLOCKED. Operator surfaces failure mode to user;
  user decides whether to:
  - Fix issue in a follow-up commit, retest from scratch
  - Carve-out: ship v0.3.0 with the regression documented in
    REQUIREMENTS.md amendment + ride-along to Phase 126
  - Defer phase close until fix lands

**Operator sign-off:** _____________
**Disposition:** ⬜ green / ⬜ yellow / ⬜ red

---

## Cross-references

- Phase 125 plan: `125-09-PLAN.md` (this VERIFICATION.md is the Wave 4
  gate output)
- UI-SPEC Surface 2 §"Verification Gates" — table maps each Vitest unit
  test to the corresponding hardware gate below
- VALIDATION.md §"Manual-Only Verifications" — operator instructions
  source-of-truth for the Quiet-mode flow + ship submission steps
- Phase 124 VERIFICATION.md — pattern reference for skeleton structure
  and live E2E findings format (operator: jamesonmorrill, dates 2026-05-09
  and 2026-05-10)
- Memory `feedback_wallclock_checkpoint_exempt` — yolo mode does NOT
  bypass physical-host actions; this gate is operator-driven
- Memory `feedback_g2_tap_expand_broken` / `project_g2_tap_expand_broken`
  — no sim-only ships; every tap or list-bubble change must
  hardware-retest before SDK pack moves to Even Hub
