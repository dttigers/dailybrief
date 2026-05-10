---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 05
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/ROADMAP.md
  - .planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md
autonomous: true
requirements: [AGENT-HUD-02]
tags: [phase-124, roadmap, scope, sc-narrowing, deferred]

must_haves:
  truths:
    - "ROADMAP.md Phase 124 SC #2 wording reflects D-08 SDK reality (DOUBLE_CLICK only on Companion)"
    - "Single-tap and long-press behaviors are explicitly deferred via SEED-011 with documented rationale + re-activation triggers"
    - "verify-phase will not fail on Phase 124 closure due to SC #2 unreachability"
  artifacts:
    - path: ".planning/ROADMAP.md"
      provides: "Phase 124 SC #2 narrowed wording — DOUBLE_CLICK clears banner + cycles + jumps home"
      contains: "double-tap"
    - path: ".planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md"
      provides: "Deferred-item SEED capturing the original SC #2 promise + deferral rationale + re-activation conditions"
      contains: "CLICK_EVENT"
  key_links:
    - from: ".planning/ROADMAP.md (Phase 124 SC #2)"
      to: ".planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md"
      via: "narrowed wording references the deferred SEED for full original spec"
      pattern: "SEED-011"
---

<objective>
Address the D-08 caveat (RESEARCH Open Questions §1) by narrowing ROADMAP.md Phase 124 success criterion #2 to match the SDK reality that ONLY `DOUBLE_CLICK_EVENT` is reliably plumbed on G2 hardware. The original SC #2 wording promised single-tap clears + double-tap cycles + long-press dismisses — but `LONG_PRESS_EVENT` is NOT in `OsEventTypeList` and `CLICK_EVENT` is sim-only (Phase 45 retro: memory `project_g2_tap_expand_broken`). Without this narrowing, Phase 124 verify-phase will fail because the gate is structurally unreachable.

Per D-08 the planner MUST take ONE of two actions:
1. Edit ROADMAP SC #2 to honest wording, OR
2. Explicitly punt single-tap/long-press to a future phase.

We do BOTH (preferred per planning_context recommendation):
- Narrow ROADMAP SC #2 to the actual shipping behavior.
- Land a SEED-011 entry capturing the deferred original spec + re-activation conditions (matching the Phase 119 / SEED-003 pattern of structurally-unsatisfiable conditions documented for future re-evaluation).

Purpose:
- Ship a phase whose verification gate IS reachable.
- Preserve the original spec intent in a SEED so it can re-surface if/when the SDK exposes single-tap or long-press events reliably.

Output:
- `.planning/ROADMAP.md` Phase 124 SC #2 wording updated to match D-08
- `.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md` (NEW) — deferred-item capturing the original promise with re-activation triggers
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md

<interfaces>
<!-- LOCKED narrowed wording for ROADMAP SC #2 (this is the new text to substitute) -->

<!-- BEFORE (current ROADMAP.md line 456 — verify before editing): -->
<!--   2. User can trigger a `needs_input` event from a real Claude Code session via vigil-watch and within 2 seconds see a persistent banner appear on the temple HUD; single-tap clears the banner; double-tap on the temple cycles through active sessions when more than one is being tracked; long-press dismisses the current banner until the next state change. -->

<!-- AFTER (D-08-aligned, copy verbatim into Edit new_string): -->
<!--   2. User can trigger a `needs_input` event from a real Claude Code session via vigil-watch and within 2 seconds see a persistent banner appear on the temple HUD. Double-tap on the temple is context-sensitive (per Phase 124 D-08): (a) if a banner is displayed, double-tap acks the banner; (b) else if ≥2 active sessions, double-tap cycles to the next session; (c) else, double-tap navigates Home. Single-tap and long-press variants are NOT plumbed reliably on G2 hardware in v3.8 — `CLICK_EVENT` is sim-only (Phase 45 retro) and `LONG_PRESS_EVENT` is absent from `OsEventTypeList` in `@evenrealities/even_hub_sdk@0.0.9`. The full original three-tap-variant spec is preserved in `.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md` with re-activation triggers. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Narrow ROADMAP.md Phase 124 SC #2 wording</name>
  <files>
    .planning/ROADMAP.md
  </files>
  <read_first>
    - .planning/ROADMAP.md offset 450 limit 20 — find Phase 124 SC #2 line (currently around line 456)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md D-08 caveat block (lines 188-193)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-RESEARCH.md Open Questions section
  </read_first>
  <action>
    Use Edit tool to replace the SC #2 bullet in ROADMAP.md Phase 124 section.

    1. Read ROADMAP.md offset 450 limit 20 to confirm exact line content of SC #2.
    2. Edit that single bullet line, replacing the existing wording with the D-08-aligned version (full text in the interfaces block above). Preserve indentation and bullet marker (`  2.` — two spaces + 2 + period + space).
    3. Do NOT modify SC #1, SC #3, SC #4, SC #5. Do NOT modify any other phase's SC list.
    4. Use Edit tool with old_string = the existing SC #2 line content (single line, verbatim from step 1) and new_string = the AFTER text (single line, exactly as in interfaces block).
  </action>
  <verify>
    <automated>grep -n "double-tap is context-sensitive" /Users/jamesonmorrill/Desktop/Local\ AI/dailybrief/.planning/ROADMAP.md ; grep -n "SEED-011" /Users/jamesonmorrill/Desktop/Local\ AI/dailybrief/.planning/ROADMAP.md</automated>
  </verify>
  <acceptance_criteria>
    - ROADMAP.md contains `double-tap is context-sensitive` (grep exits 0)
    - ROADMAP.md contains `SEED-011-g2-single-tap-long-press-tap-events` (grep exits 0)
    - ROADMAP.md contains `CLICK_EVENT` is sim-only (grep on `CLICK_EVENT.*sim-only` exits 0)
    - ROADMAP.md does NOT contain the OLD wording `single-tap clears the banner; double-tap cycles; long-press dismisses` as a single phrase (`grep -F "single-tap clears the banner; double-tap cycles" .planning/ROADMAP.md` exits non-zero)
    - SC #1, SC #3, SC #4, SC #5 of Phase 124 are unchanged (spot-check via Read offset 450 limit 30)
  </acceptance_criteria>
  <done>
    ROADMAP SC #2 narrowed to D-08 reality; SEED-011 referenced inline; SC #1/3/4/5 untouched.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create SEED-011 capturing deferred single-tap/long-press behaviors</name>
  <files>
    .planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md
  </files>
  <read_first>
    - .planning/seeds/ (directory listing — confirm the SEED-NNN-slug.md naming convention)
    - .planning/seeds/SEED-006-g2-glasses-menu-launch-source-handling.md OR another existing SEED file (template structure)
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md D-08 (full deferred-idea block — content for the SEED)
  </read_first>
  <action>
    1. List `.planning/seeds/` directory to confirm naming format and pick a representative existing SEED (e.g., SEED-006 or SEED-007 from the active-in-v3.8 list in STATE.md).
    2. Read that SEED file to confirm template structure (frontmatter shape, headings).
    3. Create `.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md` (use Write tool) with content matching the existing SEED template AND the following deferred-item content:

    ```markdown
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
    ```
  </action>
  <verify>
    <automated>test -f /Users/jamesonmorrill/Desktop/Local\ AI/dailybrief/.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md && grep -c "CLICK_EVENT" /Users/jamesonmorrill/Desktop/Local\ AI/dailybrief/.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f .planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md`
    - Contains `seed_id: SEED-011` (grep exits 0)
    - Contains `status: dormant` (grep exits 0)
    - Contains `CLICK_EVENT` (grep exits 0)
    - Contains `LONG_PRESS_EVENT` (grep exits 0)
    - Contains `Re-activation triggers` section (grep exits 0)
    - Contains the three numbered original SC #2 behaviors (grep `1\.\s*\*\*Single-tap\*\*` exits 0)
    - Contains a reference to memory `project_g2_tap_expand_broken` (grep exits 0)
  </acceptance_criteria>
  <done>
    SEED-011 lands with deferred-item shape matching SEED-005/006/007/008 conventions. Re-activation triggers documented. Original three-variant spec preserved verbatim.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ROADMAP wording → verify-phase gate | Narrowed SC #2 must accurately describe shipping behavior so verify-phase passes structurally. |
| SEED file → future re-activation | SEED is operator-readable documentation; no runtime impact. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-124-05-01 | Repudiation | Future maintainer can't reconstruct why SC #2 was narrowed | mitigate | SEED-011 documents the original spec verbatim + rationale + re-activation triggers. ROADMAP narrowed wording references the SEED inline. |
| T-124-05-02 | Tampering | Wrong line edited in ROADMAP.md (e.g., SC #1 instead of SC #2) | mitigate | Acceptance criteria checks SC #1/3/4/5 unchanged via Read offset+limit spot-check. Edit tool requires unique old_string match. |
</threat_model>

<verification>
- ROADMAP.md SC #2 wording updated; SC #1/3/4/5 unchanged
- SEED-011 file exists with documented re-activation triggers
- Plan files in this phase reference SEED-011 inline (other plans in this phase need not be modified — Plan 07's navigation.ts work already only ships DOUBLE_CLICK)
</verification>

<success_criteria>
- AGENT-HUD-02 verification gate is now reachable: SC #2 wording matches what Plans 06-08 actually ship.
- Original three-tap-variant spec is recoverable via SEED-011 if SDK ever exposes the missing events.
- No code changes; documentation-only plan.
- Closes the D-08 caveat flagged by RESEARCH §"Open Questions" item 1.
</success_criteria>

<output>
After completion, create `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-05-SUMMARY.md`.
</output>
