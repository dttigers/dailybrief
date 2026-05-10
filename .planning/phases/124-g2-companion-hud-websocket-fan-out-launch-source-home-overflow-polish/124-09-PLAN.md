---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 09
type: execute
wave: 5
depends_on: [02, 03, 04, 06, 07, 08]
files_modified:
  - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md
autonomous: false
requirements: [AGENT-API-03, AGENT-HUD-01, AGENT-HUD-02, G2-POLISH-06, G2-POLISH-07]
tags: [phase-124, e2e, verification, checkpoint]

must_haves:
  truths:
    - "vigil-watch test (or equivalent POST /v1/agent-events) produces a heartbeat event that arrives on the plugin sim within 2 seconds and updates the HUD state line"
    - "Cross-user isolation verified end-to-end: two clients with different bearers receive only their own events"
    - "G2-POLISH-07 byte-identical PNG capture confirmed (Plan 04 Task 3 is the gate; this plan re-confirms in the phase-level VERIFICATION.md)"
    - "Reconnect behavior observed: kill server briefly, plugin shows '!' within ~2s, restart server, plugin clears '!' and resumes within backoff window"
    - "Last-Event-ID resume verified: after a reconnect, missed events posted while offline appear (replay query exercised)"
  artifacts:
    - path: ".planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md"
      provides: "End-to-end verification record (operator-filled): vigil-watch → vigil-core → SSE → plugin sim; cross-user isolation; reconnect; D-14 PNG match"
      contains: "AGENT-API-03"
  key_links:
    - from: "vigil-watch (Phase 123)"
      to: "vigil-core POST /v1/agent-events"
      via: "synthetic heartbeat with _vigil_test_<unix-ts> sessionId prefix"
      pattern: "_vigil_test_"
    - from: "vigil-core SSE bus"
      to: "plugin Companion screen"
      via: "GET /v1/agent-stream live frame within 2s"
      pattern: "agent-stream"
---

<objective>
Run the end-to-end verification of Phase 124. This plan is operator-driven (autonomous: false) because:
1. The full pipeline (vigil-watch daemon → vigil-core SSE endpoint → plugin sim) requires running across three runtime processes and observing the HUD on the simulator.
2. Cross-user isolation requires generating a second bearer key and observing structural isolation in real network conditions.
3. The G2-POLISH-07 hardware retest is deferred-item but the sim-equality gate (D-14, Plan 04 Task 3) must be re-confirmed at phase close.

This is the final gate before Phase 124 closes and Phase 125 unblocks.

Purpose:
- AGENT-API-03 — verify the live SSE pipeline carries events end-to-end with userId scoping.
- AGENT-HUD-01 — verify the 3-line HUD renders correctly on real-world stimuli.
- AGENT-HUD-02 — verify DOUBLE_CLICK on Companion behaves context-sensitively (banner-ack, cycle-session, jump-Home) on the sim.
- G2-POLISH-06 — verify glassesMenu vs appMenu launches behave per D-06 (real device or sim with launch-source mock).
- G2-POLISH-07 — re-confirm sim-equality from Plan 04 Task 3.

Output:
- `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md` (NEW) — operator-filled record with five sections matching the five REQ-IDs, plus deferred-items notes for hardware retest.
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
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VALIDATION.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-04-SUMMARY.md
@.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-08-SUMMARY.md
@.planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/123-CONTEXT.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Scaffold 124-VERIFICATION.md skeleton (autonomous structure; operator fills runtime fields)</name>
  <files>
    .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md
  </files>
  <read_first>
    - .planning/phases/123-vigil-watch-shell-launchd-integration-cli-surface-24h-soak/ — find any existing 123-VERIFICATION.md skeleton to mirror format
    - .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VALIDATION.md (frontmatter format reference)
  </read_first>
  <action>
    Create `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md` (use Write tool):

    ```markdown
    ---
    phase: 124
    slug: g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
    status: pending
    runs:
      - operator: TBD
        date: TBD
        result: pending
    ---

    # Phase 124 — End-to-End Verification

    > Filled by operator after Wave 0-2 lands. Each REQ-ID has a verification
    > script + result field. Failure cases must be reproduced + investigated
    > before retry.

    ---

    ## AGENT-API-03 — SSE fan-out + Last-Event-ID resume + cross-user isolation

    ### Single-user end-to-end smoke

    1. Start vigil-core locally OR confirm Railway deployment is on the merged Phase 124 commit:
       ```
       cd vigil-core && npm run dev
       ```
       (If iMac vigilcore daemon owns :3001 per memory `project_imac_vigilcore_daemon`, run `launchctl bootout gui/$UID/com.jamesonmorrill.vigilcore` first.)

    2. In a second terminal, run the vigil-watch synthetic-event injector:
       ```
       cd vigil-watch && swift run vigil-watch test
       ```
       (Phase 123 Plan 03 — POSTs a heartbeat event with `_vigil_test_<ts>` sessionId.)

    3. In a third terminal, open the plugin sim:
       ```
       cd vigil-g2-plugin && npm run dev
       ```
       Navigate to the Companion screen.

    4. **Expected:** The plugin's Companion screen shows the synthetic heartbeat session within 2 seconds (state line: `running`).

    **Result:** [pending] — operator records actual time-to-display + screen content here.

    ### Last-Event-ID resume

    1. With plugin sim running and connected, observe the current state.
    2. Stop vigil-core (Ctrl-C in terminal #1). Plugin sim should display `!` in header within ~10 seconds (NAT idle-timeout + reconnect backoff).
    3. While vigil-core is down, POST one synthetic event manually OR wait for vigil-watch to enqueue events (offline buffer).
    4. Restart vigil-core: `cd vigil-core && npm run dev`.
    5. **Expected:** Plugin sim removes `!`, replays missed events via `Last-Event-ID` header, HUD updates with the latest state.

    **Result:** [pending]

    ### Cross-user isolation (live)

    1. Generate a second bearer key for a different `userId` (e.g., via vigil-core's API key rotation flow OR direct DB insert if dev-only).
    2. Run two plugin sims (or two browser windows pointing at the plugin) with different `VITE_API_KEY` values.
    3. POST a synthetic event using bearer A.
    4. **Expected:** Sim A receives the event. Sim B does NOT.

    **Result:** [pending]

    Cross-reference: `vigil-core/src/integration/cross-user-isolation.test.ts` block 4 (Plan 03 Task 2 unit test) covers this structurally; this Wave 3 task confirms it under live network conditions.

    ---

    ## AGENT-HUD-01 — 3-line HUD layout

    1. With plugin sim on Companion screen + ≥1 active session:
    2. Confirm visual layout:
       - Line 1: session label, truncated at 30 chars + `…` if longer
       - Line 2: state copy from `STATE_LINE` map (running / waiting for input / done / failed)
       - Line 3: last event message, truncated at 32 chars + `…`
    3. Trigger a `needs_input` event (vigil-watch test --event-type needs_input, or via direct POST):
       - **Expected:** Line 1 shows `[NEEDS INPUT]`, Line 2/3 show the session label/message. Banner persists until DOUBLE_CLICK.
    4. Trigger a `task_complete` event:
       - **Expected:** Line 1 shows `[DONE]`, banner clears 3 seconds later.
    5. Trigger a `heartbeat` event:
       - **Expected:** No banner. Line 2 shows `running` if it wasn't already.

    **Result:** [pending]

    ---

    ## AGENT-HUD-02 — DOUBLE_CLICK context-sensitive (narrowed per Plan 05)

    1. With plugin sim on Companion + persistent banner active:
       - DOUBLE_CLICK → banner clears (line 1 returns to session label).
    2. With ≥2 active sessions + no banner:
       - DOUBLE_CLICK → cycles to next session (header rightSide changes from `1/2` → `2/2`, body content updates).
    3. With 1 session + no banner:
       - DOUBLE_CLICK → navigates to HOME (carousel slot 0).

    **Result:** [pending]

    Note: Single-tap and long-press are NOT plumbed in v3.8; deferred to SEED-011. Do not attempt to test them.

    ---

    ## G2-POLISH-06 — glassesMenu vs appMenu launch source

    1. With plugin sim, simulate `appMenu` launch (sim's launch-source toggle, or default behavior).
       - **Expected:** Lands on HOME.
    2. Simulate `glassesMenu` launch with NO active session (kill any vigil-watch test events from the last 5min):
       - **Expected:** Lands on HOME.
    3. Simulate `glassesMenu` launch WITH an active session (run `vigil-watch test` immediately before launching):
       - **Expected:** Lands on COMPANION.

    **Result:** [pending]

    Hardware retest with real G2 glasses: deferred-item if not on hand. Sim-level verification is the structural gate.

    ---

    ## G2-POLISH-07 — Home body byte-identical PNG (re-confirmation from Plan 04 Task 3)

    Reproduce Plan 04 Task 3:
    1. `cd vigil-g2-plugin && cp .env.screenshot.example .env.local`
    2. `npm run build`
    3. Open `evenhub-simulator`, capture Home → `home-1.png`
    4. Reload simulator, capture Home → `home-2.png`
    5. `cmp home-1.png home-2.png`

    **Result:** [pending — paste cmp output verbatim]

    Hardware retest with real G2 glasses: deferred-item if not on hand. Sim-level verification is the structural gate (D-14 locked).

    ---

    ## Reconnect storm test (RESEARCH Pitfall 3 / Risk: Bus listener leak)

    1. With plugin sim connected to vigil-core:
    2. Stop + start vigil-core 5 times in rapid succession (5 second intervals).
    3. After the 5th restart, post a synthetic event:
       - **Expected:** Plugin receives EXACTLY ONE event (not 5x amplified — listener leak would multi-fire).

    **Result:** [pending]

    Cross-reference: `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` "100 reconnect cycles do not leak listeners" (Plan 02 unit test) covers this structurally; Wave 3 confirms under live network conditions.

    ---

    ## Deferred items / known limitations

    - **Hardware retest of Companion HUD on real G2 glasses** — operator procedure when glasses on hand. Sim-level coverage is structural.
    - **Hardware retest of G2-POLISH-07** — same.
    - **Single-tap + long-press** — deferred to SEED-011 (`.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md`). Re-evaluate when SDK adds `LONG_PRESS_EVENT` or `CLICK_EVENT` becomes hardware-reliable.

    ---

    ## Sign-off

    - [ ] AGENT-API-03 (SSE fan-out + replay + cross-user isolation): result captured above
    - [ ] AGENT-HUD-01 (3-line HUD): result captured above
    - [ ] AGENT-HUD-02 (DOUBLE_CLICK context-sensitive): result captured above
    - [ ] G2-POLISH-06 (launch source): result captured above
    - [ ] G2-POLISH-07 (home body PNG match): result captured above
    - [ ] Reconnect storm: no listener leak observed
    - [ ] Hardware retest noted as deferred-item if not run

    **Operator:** TBD
    **Date:** TBD
    **Phase 124 closure:** pending
    ```
  </action>
  <verify>
    <automated>test -f /Users/jamesonmorrill/Desktop/Local\ AI/dailybrief/.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md && grep -c "AGENT-API-03\|AGENT-HUD-01\|AGENT-HUD-02\|G2-POLISH-06\|G2-POLISH-07" /Users/jamesonmorrill/Desktop/Local\ AI/dailybrief/.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md</automated>
  </verify>
  <acceptance_criteria>
    - File exists: `test -f .planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md`
    - File contains all 5 REQ-IDs (`AGENT-API-03`, `AGENT-HUD-01`, `AGENT-HUD-02`, `G2-POLISH-06`, `G2-POLISH-07`)
    - File contains `Last-Event-ID resume` section
    - File contains `Cross-user isolation` section
    - File contains `Reconnect storm test` section
    - File contains `Deferred items` section with SEED-011 reference
    - File contains `Sign-off` checklist
    - File frontmatter status: pending
  </acceptance_criteria>
  <done>
    Skeleton 124-VERIFICATION.md is in place with all five REQ-ID sections + reconnect storm test + deferred-items notes + sign-off checklist. Operator fills runtime results in Task 2.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Operator-driven E2E verification — fill 124-VERIFICATION.md</name>
  <what-built>
    Phases 124's full code stack:
    - vigil-core SSE route + bus + replay + cross-user isolation lock
    - vigil-g2-plugin SSE shim + Companion screen + onLaunchSource gate + SSE wiring
    - G2-POLISH-07 home body trim
    - SEED-011 deferred-item for single-tap/long-press
  </what-built>
  <how-to-verify>
    Operator follows the 6 sections in `124-VERIFICATION.md` (created in Task 1):

    1. **AGENT-API-03 single-user smoke:** vigil-core up, vigil-watch test, plugin sim → confirm event arrives within 2s.
    2. **Last-Event-ID resume:** stop vigil-core, post events while down, restart → confirm replay works.
    3. **Cross-user isolation:** two bearers, two sims → confirm isolation.
    4. **AGENT-HUD-01 layout + banner state machine:** trigger 5 event types, observe HUD changes.
    5. **AGENT-HUD-02 DOUBLE_CLICK context-sensitive:** banner-ack / cycle / home fallback.
    6. **G2-POLISH-06 launch source:** appMenu vs glassesMenu landing logic.
    7. **G2-POLISH-07 PNG match:** re-run cmp from Plan 04 Task 3.
    8. **Reconnect storm:** 5x stop/start, confirm no listener leak.

    For each section, paste:
    - Actual output / screenshots / error messages.
    - Pass/fail verdict.
    - Any deviations from expected behavior + investigation notes.

    If any section fails:
    - Capture root cause in 124-VERIFICATION.md "Investigation" subsection.
    - File a follow-up plan (likely 124-10 in this phase OR a Phase 125 ride-along).
    - Do NOT mark Phase 124 closed until all sections green or explicitly deferred with operator sign-off.

    For hardware retest items: explicitly mark as `deferred-item — operator runs when G2 glasses on hand`. Add a `.planning/todos/pending/` operator-todo file for tracking.
  </how-to-verify>
  <resume-signal>
    Operator types one of:
    - `approved — all 6 sections green; phase 124 ready to close`
    - `approved with deferrals: <list>` (common: hardware retest)
    - `failed — <section>: <details>` (investigate before unblocking)
  </resume-signal>
  <action>
    This is the final gate before Phase 124 closes. Operator MUST:
    - Run all 6 sections of 124-VERIFICATION.md.
    - Paste verbatim output (cmp, sim screenshots, sse frame logs as appropriate).
    - Update STATE.md with Phase 124 closure once approved.
    - File deferred-item todos for any hardware retests.

    No new code is written in this checkpoint task — it is purely verification.
  </action>
  <verify>
    <automated>echo "MANUAL CHECKPOINT — operator fills 124-VERIFICATION.md and signs off"</automated>
  </verify>
  <acceptance_criteria>
    - 124-VERIFICATION.md `status` frontmatter changed from `pending` to `approved` (or `approved-with-deferrals`)
    - Sign-off checklist all 7 boxes checked (or marked `deferred` with link to deferred-item todo)
    - Each REQ-ID section has actual operator-recorded results (not "pending")
    - Reconnect storm result captured
    - Hardware retest deferred-items logged in `.planning/todos/pending/` (if applicable)
    - STATE.md updated with Phase 124 status (after operator sign-off)
  </acceptance_criteria>
  <done>
    Phase 124 verified end-to-end. All five REQ-IDs (AGENT-API-03, AGENT-HUD-01, AGENT-HUD-02, G2-POLISH-06, G2-POLISH-07) have operator-recorded results. Hardware retest deferred-items logged. Phase 125 unblocks once operator signs off.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator → SUMMARY/VERIFICATION docs | Self-attested results; no machine verification of operator claims. |
| live network test → cross-user isolation | Real bearer keys; verifies structural test isn't undone by network/middleware. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-124-09-01 | Repudiation | Operator marks "approved" without actually running tests | accept | Sign-off checklist + paste-verbatim-output convention. STATE.md update is the gate. |
| T-124-09-02 | Tampering | Test bearer keys leak into commit history | mitigate | Per `feedback_railway_variables_leak`, test keys MUST be ephemeral and never committed. Operator workflow: generate key, use, revoke; do not paste into VERIFICATION.md. Use placeholder `vk_<sha>` references when documenting. |
| T-124-09-03 | Information Disclosure | Operator pastes real session content (label, message) into VERIFICATION.md | accept | Single-user repo; operator's own data. If multi-user becomes real, redact in VERIFICATION.md template. |
| T-124-09-04 | Denial of Service | Hardware retest never run → silent regression on real glasses | mitigate | Deferred-item logged in `.planning/todos/pending/` triggers operator follow-up; cross-referenced in STATE.md "Deferred Items" table. |
</threat_model>

<verification>
- 124-VERIFICATION.md skeleton exists (Task 1)
- All 5 REQ-IDs + reconnect storm + deferred-items represented (Task 1)
- Operator sign-off captured (Task 2)
- STATE.md updated with closure (Task 2 follow-up)
</verification>

<success_criteria>
- All 5 phase requirements verified end-to-end (or explicitly deferred with operator sign-off).
- Cross-user isolation observed under live network conditions (not just unit tests).
- G2-POLISH-07 sim-equality re-confirmed at phase close.
- Reconnect storm produces no listener leak / event amplification.
- Hardware retests tracked as deferred-items with operator-todo files for follow-up.
- Phase 124 closes; Phase 125 unblocks.
</success_criteria>

<output>
After completion, create `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-09-SUMMARY.md`. Reference 124-VERIFICATION.md as the canonical record.
</output>
