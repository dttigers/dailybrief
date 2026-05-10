---
phase: 124
slug: g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
status: pending
runs:
  - operator: TBD
    date: TBD
    result: pending
human_verification:
  - test: "AGENT-API-03 — single-user end-to-end smoke (vigil-watch test → vigil-core SSE → plugin sim Companion within 2s)"
    expected: "Within ≤2s of `swift run vigil-watch test`, the plugin sim Companion screen state line shows `running` with the synthetic heartbeat session label/message; sse-client logs a `data:` frame with the matching `id:`"
    why_human: "Requires three concurrent processes (vigil-core dev server, vigil-watch CLI, plugin sim WebView) on the operator's Mac. Phase 121/124 unit tests prove structural correctness in isolation; live propagation latency under real bearer auth + macOS network is operator-driven."
  - test: "AGENT-API-03 — Last-Event-ID resume after vigil-core stop/start"
    expected: "After Ctrl-C on vigil-core, plugin shows offline indicator (`!` or `⚠`) within ~10s; after `npm run dev` restart, missed events posted while offline replay via `Last-Event-ID` header and HUD updates"
    why_human: "Requires real network drop + live SSE shim reconnect + DB replay query under live HTTP. Plan 03 unit tests pin replay correctness (gt id, gt event_timestamp, eq user_id, 24h cutoff); Plan 06 unit tests pin BACKOFF_MS schedule + Last-Event-ID localStorage persistence. Live test confirms middleware + browser fetch don't undo this."
  - test: "AGENT-API-03 — Cross-user isolation under live network (two bearers, two sims)"
    expected: "Sim A (bearer A → userId A) receives event posted with bearer A; Sim B (bearer B → userId B) receives nothing"
    why_human: "Plan 03 Block 4 cross-user-isolation.test.ts is the structural gate using the real bus singleton via `await import` + app.fetch with two JWT bearers. Live test confirms Railway/middleware/CORS doesn't undo the per-userId Map<userId, EventEmitter> isolation."
  - test: "AGENT-HUD-01 — 3-line HUD layout under live event stream"
    expected: "Companion screen renders: line 1 = session label truncated at 30 chars + `…`; line 2 = STATE_LINE map (running/waiting/done/failed); line 3 = last event message truncated at 32 chars + `…`. Banner state machine fires for needs_input (persistent) / task_failed (persistent) / task_complete (3s toast) / milestone (3s toast) / heartbeat (no banner). N/M cycle indicator displaces clock when ≥2 active sessions."
    why_human: "Visual layout under real event timing; sim-only UI doesn't have a headless-screenshot equivalent for the dynamic state-line + banner transitions. Plan 07 table-driven unit tests pin the static composition; Wave 5 confirms under live SSE."
  - test: "AGENT-HUD-02 — DOUBLE_CLICK context-sensitive (banner-ack / cycle-session / jump-Home)"
    expected: "Banner present → DOUBLE_CLICK clears banner. ≥2 active sessions, no banner → DOUBLE_CLICK cycles to next session (N/M increments). 1 session, no banner → DOUBLE_CLICK navigates to HOME (carousel slot 0)."
    why_human: "Requires plugin sim with banner state, multi-session state, and HOME fallback — observable via UI navigation, not headless. Plan 07 navigation drift tests pin the structural switch; Wave 5 confirms behavior under live event stream + plugin sim DOUBLE_CLICK_EVENT delivery."
  - test: "G2-POLISH-06 — glassesMenu vs appMenu launch source (sim launch-source toggle)"
    expected: "appMenu launch → lands on HOME. glassesMenu launch + no active session → lands on HOME. glassesMenu launch + active session (run `vigil-watch test` <5min before launch) → lands on COMPANION."
    why_human: "Requires real Even Hub iOS app launch path (or evenhub-simulator launch-source toggle). Plan 08 unit tests pin module-scope `onLaunchSource` registration + 500ms timeout + D-06 5-min/non-terminal filter; Wave 5 confirms first-paint render lands correctly."
  - test: "G2-POLISH-07 — Home body byte-identical PNG (D-14 re-confirmation from Plan 04 Task 3)"
    expected: "Two consecutive `evenhub-simulator` Home captures are byte-identical (`cmp home-1.png home-2.png` exit 0)"
    why_human: "evenhub-simulator is a GUI-only Mac desktop app — no headless screenshot capture in `--help` (only `--automation-port`). PRIMARY tracking: `.planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md` carries the verbatim runbook. Phase 124 closure honors that operator action verbatim."
  - test: "Reconnect storm (RESEARCH Pitfall 3 + Plan 02 100-cycle no-leak unit test)"
    expected: "After 5 rapid stop/start cycles of vigil-core (5s intervals), plugin receives EXACTLY ONE event from a single POST — no listener leak / event amplification"
    why_human: "Plan 02 `agent-events-bus.test.ts` pins 100-reconnect-cycle no-leak invariant structurally; live test confirms under real network drops + plugin SSE shim reconnect (which the unit test cannot exercise end-to-end through the bus singleton)."
prerequisites:
  - "Phase 123 — 24h soak operator run (`.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md`) — vigil-watch must be installed + running for `vigil-watch test` to be the E2E vehicle. If soak is OPERATOR-PENDING, the daemon does NOT need 24h of runtime to satisfy Phase 124's E2E gate; a freshly-installed daemon that posts a single synthetic event via `vigil-watch test` is sufficient. Phase 123 soak is a PARALLEL operator track, not a sequential blocker for this verification."
  - "Phase 124 Plan 04 D-14 PNG-equality (`.planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md`) — Plan 09 §G2-POLISH-07 cross-references this todo as the canonical record. Filling Plan 04's todo simultaneously closes Plan 09's G2-POLISH-07 sign-off line."
---

# Phase 124 — End-to-End Verification

> Filled by operator after Wave 0-4 lands (all autonomous plans 01-08 are GREEN; this is the final operator gate before Phase 124 closes and Phase 125 unblocks).
>
> Each REQ-ID has a verification script + result field. Failure cases must be reproduced + investigated before retry. Paste verbatim outputs (cmp results, sim screenshots, sse frame logs as appropriate) under each section's **Result** line.

---

## Phase 124 goal recap

**ROADMAP.md §Phase 124:** Add a glanceable G2 Companion HUD that surfaces real-time Claude Code session state via a per-userId WebSocket fan-out (implemented as SSE per D-01), folds two plugin-touching G2 polish riders into the same shipping window (G2-POLISH-06 launch source + G2-POLISH-07 home overflow), and ships the foundation for the v3.8 demo flow (`needs_input` tap → ack → cycle).

**5 REQ-IDs covered by this verification:**

| REQ-ID | Plans landed | Section below |
|--------|--------------|---------------|
| AGENT-API-03 (per-userId SSE fan-out + Last-Event-ID resume + cross-user isolation) | 124-02, 124-03, 124-06, 124-08 | §AGENT-API-03 |
| AGENT-HUD-01 (3-line HUD layout) | 124-01, 124-06, 124-07, 124-08 | §AGENT-HUD-01 |
| AGENT-HUD-02 (DOUBLE_CLICK context-sensitive — narrowed per Plan 05 / D-08) | 124-01, 124-05, 124-07 | §AGENT-HUD-02 |
| G2-POLISH-06 (glassesMenu vs appMenu landing) | 124-01, 124-08 | §G2-POLISH-06 |
| G2-POLISH-07 (home body 4-line trim + byte-identical PNG) | 124-01, 124-04 | §G2-POLISH-07 |

**Plans landed before this verification (autonomous-complete):**

- **Plan 01** — `vigil-g2-plugin` test infra (`tsx` + `node:test` + smoke harness)
- **Plan 02** — `vigil-core/src/lib/agent-events-bus.ts` per-userId EventEmitter Map + cross-user isolation invariant + 100-cycle no-leak unit test
- **Plan 03** — `vigil-core` `GET /v1/agent-stream` SSE route + bus.emit hook + Last-Event-ID 24h replay + 25s keepalive + cross-user-isolation.test.ts block 4
- **Plan 04** — `vigil-g2-plugin/src/screens/home.ts` 4-line trim + drift detector (Task 3 D-14 PNG comparison deferred to operator runbook — see Prerequisites frontmatter)
- **Plan 05** — ROADMAP SC #2 narrowed to D-08 SDK reality + SEED-011 deferral lands
- **Plan 06** — `vigil-g2-plugin/src/lib/sse-client.ts` SSE shim — bearer in Authorization header, BACKOFF_MS=[1,2,4,8,16,30]s, Last-Event-ID localStorage persistence, AbortController disconnect, QuotaExceededError survival, event:ping silent drop
- **Plan 07** — `vigil-g2-plugin/src/screens/companion.ts` Companion screen + ContainerIDs 13/14/15 + banner state machine + N/M indicator + offline indicator + nav DOUBLE_CLICK Companion branch
- **Plan 08** — `vigil-g2-plugin/src/main.ts` module-scope `onLaunchSource` + 500ms timeout + active-session landing logic + SSE wiring

---

## Prerequisites (operator-actionable BEFORE running this verification)

### A. Phase 123 — 24h soak gate status

The 24h soak gate (AGENT-WATCH-07) is tracked in **`.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md`** and is OPERATOR-PENDING per STATE.md "Deferred Items" table.

**Practical impact on Phase 124 verification:**

- Phase 124's E2E vehicle is `swift run vigil-watch test` (single synthetic POST), NOT a 24h-soak observation.
- Phase 123 soak is a **parallel operator track**: vigil-watch must be **installed + running** to be the E2E source of `agent-events`, but it does NOT need to have completed a 24h window before Phase 124 verification.
- If `vigil-watch install` has not yet been run on this Mac, complete steps 1-3 of the Phase 123 todo first (build → install → confirm `state = running`). Then this verification's Section AGENT-API-03 single-user smoke can run.
- Phase 123 closeout (24h soak gate) and Phase 124 closeout (this verification) are independently sign-off-able. Phase 124 does NOT block on Phase 123's 24h gate; both close on their own evidence.

If `vigil-watch test` is not yet operational (binary not installed, daemon not running, post failing with non-2xx), STOP this verification and complete the Phase 123 prerequisite first.

### B. Phase 124 Plan 04 — D-14 PNG-equality status

The byte-identical PNG comparison (D-14, G2-POLISH-07) is tracked in **`.planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md`** and is OPERATOR-PENDING.

This verification's §G2-POLISH-07 section cross-references that todo as the canonical record. Filling Plan 04's todo simultaneously closes Plan 09's G2-POLISH-07 sign-off line — do **not** capture two separate operator runs of `evenhub-simulator`. One operator session, two SUMMARY pastes (124-04-SUMMARY + this VERIFICATION).

### C. vigil-core deployment state

Confirm vigil-core is on a build that includes Plans 02 + 03 (bus + SSE route). Two acceptable runtime modes:

1. **Local dev:** `cd vigil-core && npm run dev` — uses your local `.env` (DATABASE_URL → Railway Postgres, JWT_SECRET, VIGIL_ALLOWED_EMAILS).
   - If iMac vigilcore daemon owns :3001 (per memory `project_imac_vigilcore_daemon`), run `launchctl bootout gui/$UID/com.jamesonmorrill.vigilcore` first to free the port.
2. **Railway deployment:** confirm the deployed commit is post-Plan 03 (i.e., includes `vigil-core/src/routes/agent-stream.ts`).
   - `railway status` (or check Dashboard) — note: per memory `feedback_railway_variables_leak`, do NOT dump `railway variables` output to confirm secrets.

---

## AGENT-API-03 — SSE fan-out + Last-Event-ID resume + cross-user isolation

### Section AGENT-API-03.1 — Single-user end-to-end smoke

1. Start vigil-core locally OR confirm Railway deployment is on the merged Phase 124 commit:
   ```
   cd "/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core" && npm run dev
   ```
   (If iMac vigilcore daemon owns :3001 per memory `project_imac_vigilcore_daemon`, run `launchctl bootout gui/$UID/com.jamesonmorrill.vigilcore` first.)

2. In a second terminal, run the vigil-watch synthetic-event injector:
   ```
   cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch" && swift run vigil-watch test
   ```
   (Phase 123 Plan 03 — POSTs a heartbeat event with `_vigil_test_<unix-ts>` sessionId.)

3. In a third terminal, open the plugin sim:
   ```
   cd "/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-g2-plugin" && npm run dev
   ```
   Navigate to the Companion screen.

4. **Expected:** The plugin's Companion screen shows the synthetic heartbeat session within 2 seconds (state line: `running`).

**Result:** [pending] — operator records actual time-to-display + screen content here.

### Section AGENT-API-03.2 — Last-Event-ID resume

1. With plugin sim running and connected, observe the current state.
2. Stop vigil-core (Ctrl-C in terminal #1). Plugin sim should display `!` (or `⚠`) in header within ~10 seconds (NAT idle-timeout + reconnect backoff).
3. While vigil-core is down, POST one synthetic event manually OR wait for vigil-watch to enqueue events (offline buffer):
   ```
   # while core is down, the watch daemon's emitter queue holds events;
   # alternatively, after restart, run: swift run vigil-watch test
   ```
4. Restart vigil-core:
   ```
   cd "/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core" && npm run dev
   ```
5. **Expected:** Plugin sim removes `!`, replays missed events via `Last-Event-ID` header, HUD updates with the latest state.

**Result:** [pending]

Cross-reference: `vigil-core/src/routes/__tests__/agent-stream.test.ts` T2/T7 pin the happy-path replay query (gt id, gt event_timestamp, eq user_id, orderBy id ASC, 24h cutoff bound). Wave 5 confirms under live HTTP + plugin SSE shim's `Last-Event-ID` header from localStorage.

### Section AGENT-API-03.3 — Cross-user isolation (live)

1. Generate a second bearer key for a different `userId`. Two options:
   - Use vigil-core's API key rotation flow (UI / `/api/keys` endpoint).
   - Or direct DB insert if dev-only (mark this in result — do NOT commit DB output).
   - Per threat-register T-124-09-02: do NOT paste real bearer keys into this file. Use placeholder `vk_<sha-prefix>` references when documenting.
2. Run two plugin sims (or two browser windows pointing at the plugin) with different `VITE_API_KEY` values:
   ```
   # Terminal A:
   cd vigil-g2-plugin && VITE_API_KEY=vk_<userA-prefix> npm run dev
   # Terminal B (different port):
   cd vigil-g2-plugin && VITE_API_KEY=vk_<userB-prefix> npm run dev -- --port 5174
   ```
3. POST a synthetic event using bearer A:
   ```
   cd vigil-watch && VIGIL_API_KEY=vk_<userA> swift run vigil-watch test
   ```
4. **Expected:** Sim A receives the event. Sim B does NOT.

**Result:** [pending]

Cross-reference: `vigil-core/src/integration/cross-user-isolation.test.ts` Block 4 (Plan 03 Task 2) covers this structurally via the real bus singleton + app.fetch with two JWT bearers. This Wave 5 task confirms it under live network conditions (Railway middleware + CORS + browser fetch).

---

## AGENT-HUD-01 — 3-line HUD layout

1. With plugin sim on Companion screen + ≥1 active session:
2. Confirm visual layout:
   - Line 1: session label, truncated at 30 chars + `…` if longer
   - Line 2: state copy from `STATE_LINE` map (`running` / `waiting for input` / `done` / `failed`)
   - Line 3: last event message, truncated at 32 chars + `…`
3. Trigger a `needs_input` event (vigil-watch test --event-type needs_input, or via direct POST):
   - **Expected:** Line 1 shows `[NEEDS INPUT]`, Line 2/3 show the session label/message. Banner persists until DOUBLE_CLICK ack.
4. Trigger a `task_complete` event:
   - **Expected:** Line 1 shows `[DONE]`, banner clears 3 seconds later (toastMs).
5. Trigger a `task_failed` event:
   - **Expected:** Line 1 shows `[FAILED]`, banner persists until DOUBLE_CLICK ack.
6. Trigger a `milestone` event:
   - **Expected:** Line 1 shows `[MILESTONE]`, banner clears 3 seconds later (toastMs).
7. Trigger a `heartbeat` event:
   - **Expected:** No banner. Line 2 shows `running` if it wasn't already.

**Result:** [pending]

Cross-reference: Plan 07 `vigil-g2-plugin/src/screens/__tests__/companion.test.ts` table-driven tests pin static composition + banner state machine for all 5 event types. Wave 5 confirms under live SSE event timing.

---

## AGENT-HUD-02 — DOUBLE_CLICK context-sensitive (narrowed per Plan 05)

1. With plugin sim on Companion + persistent banner active:
   - DOUBLE_CLICK → banner clears (line 1 returns to session label).
2. With ≥2 active sessions + no banner:
   - DOUBLE_CLICK → cycles to next session (header rightSide changes from `1/2` → `2/2`, body content updates).
3. With 1 session + no banner:
   - DOUBLE_CLICK → navigates to HOME (carousel slot 0).

**Result:** [pending]

Note: Single-tap (`CLICK_EVENT`) and long-press (`LONG_PRESS_EVENT`) are **NOT** plumbed in v3.8; deferred to SEED-011 (`.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md`). Do not attempt to test them — `eventType` returns undefined on real G2 hardware per Phase 45 retro / `feedback_g2_tap_expand_broken`.

---

## G2-POLISH-06 — glassesMenu vs appMenu launch source

1. With plugin sim, simulate `appMenu` launch (sim's launch-source toggle, or default behavior):
   - **Expected:** Lands on HOME.
2. Simulate `glassesMenu` launch with **NO active session** (kill any vigil-watch test events from the last 5min — wait 5 minutes after last `vigil-watch test` OR run nothing recently):
   - **Expected:** Lands on HOME.
3. Simulate `glassesMenu` launch **WITH an active session** (run `swift run vigil-watch test` immediately before launching):
   - **Expected:** Lands on COMPANION.

**Result:** [pending]

Cross-reference: Plan 08 `vigil-g2-plugin/src/__tests__/main.test.ts` pins module-scope `onLaunchSource` registration + 500ms `Promise.race` timeout + `hasActiveSession` D-06 5-min/non-terminal filter. Wave 5 confirms first-paint render under sim launch-source delivery.

Hardware retest with real G2 glasses: deferred-item if not on hand. Sim-level verification is the structural gate.

---

## G2-POLISH-07 — Home body byte-identical PNG (re-confirmation from Plan 04 Task 3)

**PRIMARY tracking:** `.planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md` — operator runs the 8-step `evenhub-simulator` capture procedure documented there.

Reproduce Plan 04 Task 3 (verbatim from Plan 04 todo runbook):

1. `cd vigil-g2-plugin && cp .env.screenshot.example .env.local`
2. `npm run build`
3. `mkdir -p /tmp/vigil-124-04-png`
4. Open `evenhub-simulator`, load built plugin from `dist/`, navigate to Home, wait 2s, click 📸, save as `/tmp/vigil-124-04-png/home-capture-1.png`
5. Reload `evenhub-simulator` (do NOT rebuild — bundle hash must match), navigate to Home, wait 2s, click 📸, save as `/tmp/vigil-124-04-png/home-capture-2.png`
6. Compare:
   ```bash
   cd /tmp/vigil-124-04-png
   cmp home-capture-1.png home-capture-2.png \
     && echo "PASS: byte-identical" \
     || echo "FAIL: differ"
   ```

If FAIL — see Plan 04 todo runbook for body-region crop fallback (sips --cropToHeightWidth 210 576 --cropOffset 40 0).

**Result:** [pending — paste cmp output verbatim, e.g. `cmp exit 0; PASS: byte-identical` OR `cmp exit 1; FAIL: differ at offset N`]

Hardware retest with real G2 glasses: deferred-item per D-14 carve-out. Sim-equality is the gate, hardware retest is deferred-confirmation per `feedback_g2_tap_expand_broken` pattern.

---

## Reconnect storm test (RESEARCH Pitfall 3 / Risk: Bus listener leak)

1. With plugin sim connected to vigil-core:
2. Stop + start vigil-core 5 times in rapid succession (5 second intervals):
   ```bash
   # in vigil-core terminal:
   # Ctrl-C; sleep 5; npm run dev; ... repeat 5 times
   ```
3. After the 5th restart, post a single synthetic event:
   ```bash
   cd vigil-watch && swift run vigil-watch test
   ```
4. **Expected:** Plugin receives EXACTLY ONE event (not 5x amplified — listener leak would multi-fire).

**Result:** [pending]

Cross-reference: `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` "100 reconnect cycles do not leak listeners" (Plan 02 unit test) pins this structurally. Wave 5 confirms under live network conditions.

---

## Deferred items / known limitations

- **Hardware retest of Companion HUD on real G2 glasses** — operator procedure when glasses on hand. Sim-level coverage is structural.
- **Hardware retest of G2-POLISH-07** — same.
- **Hardware retest of G2-POLISH-06 (glassesMenu launch on real Even Hub iOS app)** — sim launch-source toggle covers structural; real iOS launch-source path is the deferred-confirmation layer.
- **Single-tap + long-press** — deferred to SEED-011 (`.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md`). Re-evaluate when SDK adds `LONG_PRESS_EVENT` or `CLICK_EVENT` becomes hardware-reliable.

---

## Sign-off

- [ ] §AGENT-API-03.1 (single-user smoke ≤2s): result captured above
- [ ] §AGENT-API-03.2 (Last-Event-ID resume): result captured above
- [ ] §AGENT-API-03.3 (cross-user isolation live): result captured above
- [ ] §AGENT-HUD-01 (3-line HUD + 5-event banner state machine): result captured above
- [ ] §AGENT-HUD-02 (DOUBLE_CLICK context-sensitive: ack / cycle / home): result captured above
- [ ] §G2-POLISH-06 (launch source: appMenu→Home / glassesMenu+inactive→Home / glassesMenu+active→Companion): result captured above
- [ ] §G2-POLISH-07 (home body PNG match — cross-references Plan 04 D-14 todo): result captured above
- [ ] Reconnect storm: no listener leak / event amplification observed
- [ ] Hardware retest noted as deferred-item if not run

**Operator:** TBD
**Date:** TBD
**Phase 124 closure:** pending

---

## Operator decision tree

After running all 8 sections above:

| Outcome | Action |
|---------|--------|
| All 8 sections PASS | Set `status: approved` in frontmatter; update STATE.md "Phase 124 complete"; update ROADMAP.md Phase 124 row to `Complete`; flip `wave_0_complete` in 124-VALIDATION.md to true; Phase 125 unblocks. |
| All sections except hardware retest PASS | Set `status: approved-with-deferrals` in frontmatter; list deferrals (typically G2 hardware retest); file `.planning/todos/pending/` for hardware retests; same STATE.md / ROADMAP.md updates with deferred-items annotation. |
| §G2-POLISH-07 FAIL (PNG differ) | Set `status: blocked` in frontmatter; capture `sips` dimensions + body-region crop diagnostic; log blocker via `gsd-sdk query state.add-blocker`; ride fix into Phase 124 Plan 10 OR Phase 125 ride-along per D-14 deferred-item. |
| §AGENT-API-03 ANY FAIL | Set `status: blocked` in frontmatter; capture vigil-core logs + plugin sim console + curl trace of `/v1/agent-stream`; log blocker; investigate before phase close (do NOT silently re-run). |
| §AGENT-HUD-01 / §AGENT-HUD-02 FAIL | Set `status: blocked` in frontmatter; capture sim screenshots; investigate Plan 07 banner state machine + nav DOUBLE_CLICK branch; ride fix into Phase 124 Plan 10. |
| §G2-POLISH-06 FAIL | Set `status: blocked` in frontmatter; capture main.ts onLaunchSource log output; investigate Plan 08 module-scope registration + 500ms timeout; ride fix into Phase 124 Plan 10. |
| Reconnect storm FAIL (listener leak) | Set `status: blocked` in frontmatter; capture vigil-core console + plugin sim event-count log; investigate Plan 02 bus.off cleanup + Plan 03 onAbort hook; ride fix into Phase 124 Plan 10. |
