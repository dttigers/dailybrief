---
title: Phase 124 — execute E2E verification + back-fill 124-VERIFICATION.md
phase: 124
plan: 09
priority: high
source: Phase 124 Plan 09 — checkpoint:human-verify (Task 2)
created: 2026-05-10
gates: [AGENT-API-03, AGENT-HUD-01, AGENT-HUD-02, G2-POLISH-06, G2-POLISH-07]
blocking_for: [Phase 124 closeout, Phase 125 launch]
related_todos:
  - .planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md
  - .planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md
---

## What this is

The autonomous portion of Plan 124-09 is complete: `124-VERIFICATION.md`
skeleton is committed (commit 7e0c68f) with all 5 REQ-ID sections + reconnect
storm + deferred-items + sign-off checklist + operator decision tree. The
actual E2E verification gate (Task 2) is operator-driven and cannot be
automated — it requires three concurrent processes (vigil-core, vigil-watch,
plugin sim) on the operator's Mac plus a second bearer key for the
cross-user-isolation live test.

This todo tracks the operator-driven step.

## Why deferred

Per CONTEXT D-14 + Plan 09 frontmatter (`autonomous: false`): the E2E run
requires:

1. Three concurrent runtime processes on the operator's Mac (vigil-core dev
   server, vigil-watch CLI, plugin sim WebView).
2. Visual observation of the plugin sim Companion screen to confirm HUD
   transitions (state line, banner state machine, N/M indicator, offline
   indicator).
3. Generation of a second bearer key for the cross-user isolation live test.
4. `evenhub-simulator` GUI capture for the G2-POLISH-07 byte-identical PNG
   re-confirmation (cross-references Plan 04 D-14 todo).

`mode: yolo / skip_checkpoints: true` only auto-skips confirmation gates —
checkpoints whose payload requires real-world physical-host actions, GUI
capture, or visual UI verification are exempt per memory
`feedback_wallclock_checkpoint_exempt`.

## Prerequisites

### A. Phase 123 — 24h soak gate (parallel, not sequential)

Phase 123 24h soak (`.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md`)
is a **parallel operator track**. Phase 124 verification does NOT block on
the 24h gate completing — it only requires:

- `vigil-watch install` has been run (binary at `~/.local/bin/vigil-watch`)
- launchd shows daemon `state = running` (or you can run `swift run vigil-watch test`
  in foreground)
- A single `swift run vigil-watch test` POSTs successfully to vigil-core (HTTP 201/200)

If the binary is not yet installed on this Mac, complete steps 1-3 of the
Phase 123 todo first (build release binary → install → confirm both plists +
`state = running`). Then this verification's Section AGENT-API-03 single-user
smoke can run.

### B. Phase 124 Plan 04 — D-14 PNG-equality (combine with this run)

Plan 04 D-14 todo (`.planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md`)
is the **canonical record** for the G2-POLISH-07 byte-identical PNG check.
Plan 09 §G2-POLISH-07 cross-references it. **Do not capture two separate
operator runs of `evenhub-simulator` for this** — combine into one
`evenhub-simulator` session, paste the result into both:

- `.planning/phases/124-.../124-04-SUMMARY.md` (Plan 04 partial SUMMARY)
- `.planning/phases/124-.../124-VERIFICATION.md` §G2-POLISH-07 Result line

### C. Bearer key for cross-user isolation

Generate a second bearer key for a different `userId`. Two options:

- vigil-core API key rotation flow (Settings UI / `/api/keys` endpoint)
- Direct DB insert if dev-only

Per threat register T-124-09-02: do **NOT** paste real bearer keys into
124-VERIFICATION.md. Use placeholder `vk_<sha-prefix>` references.

## Operator runbook

Follow the 8 sections of `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-VERIFICATION.md`:

### 1. Single-user end-to-end smoke (AGENT-API-03.1)

Three terminals:

```bash
# Terminal 1 (vigil-core):
launchctl bootout gui/$(id -u)/com.jamesonmorrill.vigilcore 2>/dev/null  # free port if iMac daemon owns :3001
cd "/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core"
npm run dev

# Terminal 2 (vigil-watch test injector):
cd "/Users/jamesonmorrill/Desktop/Local AI/vigil-watch"
swift run vigil-watch test

# Terminal 3 (plugin sim):
cd "/Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-g2-plugin"
npm run dev
# Navigate to Companion screen
```

**Pass criterion:** Synthetic heartbeat session appears in plugin Companion
screen state line within 2 seconds.

### 2. Last-Event-ID resume (AGENT-API-03.2)

1. Stop vigil-core (Ctrl-C in Terminal 1). Watch plugin display `!` (or `⚠`) within ~10s.
2. Restart `npm run dev` in Terminal 1. Run `swift run vigil-watch test` in Terminal 2.
3. Watch plugin: `!` clears, missed events replay via `Last-Event-ID` header.

**Pass criterion:** Plugin replays missed events; offline indicator clears on
successful reconnect.

### 3. Cross-user isolation live (AGENT-API-03.3)

1. Generate second bearer key (placeholder `vk_<userB-prefix>`).
2. Run two plugin sims with different `VITE_API_KEY`:
   ```bash
   # Terminal A:
   VITE_API_KEY=vk_<userA> npm run dev
   # Terminal B (different port):
   VITE_API_KEY=vk_<userB> npm run dev -- --port 5174
   ```
3. POST a synthetic event with bearer A:
   ```bash
   VIGIL_API_KEY=vk_<userA> swift run vigil-watch test
   ```

**Pass criterion:** Sim A receives event. Sim B does NOT.

### 4. AGENT-HUD-01 — 5-event banner state machine

Trigger each of the 5 event types and observe HUD:

- `needs_input` → persistent banner `[NEEDS INPUT]`
- `task_failed` → persistent banner `[FAILED]`
- `task_complete` → 3-second toast `[DONE]`
- `milestone` → 3-second toast `[MILESTONE]`
- `heartbeat` → no banner; line 2 = `running`

You can use a manual `curl` to POST event types beyond the default heartbeat,
or modify `vigil-watch test` invocation if Phase 123 Plan 03 supports a
`--event-type` flag.

**Pass criterion:** Each event type renders correctly per Plan 07
companion.test.ts table-driven map.

### 5. AGENT-HUD-02 — DOUBLE_CLICK context-sensitive

In plugin sim:

1. Persistent banner active → DOUBLE_CLICK → banner clears
2. ≥2 active sessions, no banner → DOUBLE_CLICK → cycles to next session (N/M increments)
3. 1 session, no banner → DOUBLE_CLICK → navigates to HOME

**Pass criterion:** All three branches behave correctly per D-08.

### 6. G2-POLISH-06 — launch source

In plugin sim, use launch-source toggle (or evenhub-simulator equivalent):

1. `appMenu` → lands on HOME
2. `glassesMenu` + no recent vigil-watch test → lands on HOME
3. `glassesMenu` + run `vigil-watch test` immediately before → lands on COMPANION

**Pass criterion:** All three landing decisions correct per D-06 5-min
non-terminal filter.

### 7. G2-POLISH-07 — byte-identical PNG (combine with Plan 04 todo)

Run Plan 04 D-14 procedure verbatim from
`.planning/todos/pending/2026-05-10-phase-124-04-png-equality-operator-run.md`.

Paste `cmp` output into BOTH:
- `124-04-SUMMARY.md` (Plan 04 partial SUMMARY) — primary
- `124-VERIFICATION.md` §G2-POLISH-07 Result line — secondary

**Pass criterion:** `cmp home-1.png home-2.png` exit 0 / `PASS: byte-identical`.

### 8. Reconnect storm

```bash
# In vigil-core terminal — repeat 5 times:
# Ctrl-C; sleep 5; npm run dev
```

Then `swift run vigil-watch test` once. Watch plugin event count.

**Pass criterion:** Plugin receives EXACTLY ONE event (no listener-leak amplification).

## Recording the result

For each section, paste verbatim into `124-VERIFICATION.md`:

- The actual command run (verbatim)
- The actual stdout / sim screenshot description / observed HUD state
- Pass/fail verdict
- Any deviations + investigation notes

Then close out:

```bash
# Update frontmatter status to approved (or approved-with-deferrals / blocked)
# Tick all 9 sign-off checkboxes (or mark deferred where applicable)
# Move this todo:
mv .planning/todos/pending/2026-05-10-phase-124-09-e2e-verification-operator-run.md \
   .planning/todos/completed/

# Commit:
git add -A
git commit -m "docs(124-09): record operator E2E verification — <APPROVED|APPROVED-WITH-DEFERRALS|BLOCKED>"
```

## Phase 124 closeout flow

Once this todo completes (assuming PASS or APPROVED-WITH-DEFERRALS):

1. Move this file to `.planning/todos/completed/`.
2. Update STATE.md: `Stopped at: Phase 124 COMPLETE` + advance Current Plan past 9.
3. Update ROADMAP.md Phase 124 row: progress `8/9 In progress` → `9/9 Complete`.
4. Flip `wave_0_complete: true` in `124-VALIDATION.md` if not already.
5. Mark requirements AGENT-API-03 / AGENT-HUD-01 / AGENT-HUD-02 / G2-POLISH-06 / G2-POLISH-07 complete in REQUIREMENTS.md.
6. Run `/gsd-verify-work` against Phase 124 to confirm artifact integrity.
7. Phase 125 (Quiet mode + remaining polish riders + plugin v0.3.0 ship + portfolio demo) is then unblocked.

## Failure path

If any section fails, follow the operator decision tree at the bottom of
`124-VERIFICATION.md`. Common cases:

- §G2-POLISH-07 FAIL → see Plan 04 todo for body-region crop fallback
- §AGENT-API-03 FAIL → capture vigil-core logs + plugin sim console + curl trace
- §AGENT-HUD-* FAIL → capture sim screenshots; ride fix into Phase 124 Plan 10
- Reconnect storm FAIL → capture plugin event-count log; investigate Plan 02 bus.off + Plan 03 onAbort

Do NOT silently re-run on failure; the failure mode is itself signal.

## Why structurally safe to defer

Plan 09's structural fix is already locked by Plans 01-08:

1. Plan 02's 100-cycle no-leak unit test pins bus listener-cleanup invariant
2. Plan 03's cross-user-isolation.test.ts Block 4 pins per-userId Map<userId, EventEmitter> isolation under real bus singleton
3. Plan 06's 13 SSE shim unit tests pin BACKOFF_MS schedule, Last-Event-ID localStorage, AbortController disconnect, QuotaExceededError survival
4. Plan 07's table-driven companion.test.ts pins banner state machine for all 5 event types
5. Plan 08's main.test.ts pins module-scope onLaunchSource registration + 500ms timeout + D-06 5-min/non-terminal filter

The E2E gate is a CONFIRMATION layer over a structurally-correct stack.
Deferring it does not put the codebase in a regressed state; the partial
SUMMARY.md (with this todo cross-referenced) preserves the chain-of-evidence
the same way Phase 123 Plan 05's 24h-soak deferral did.

---

## CLOSEOUT — 2026-05-10 (jamesonmorrill)

Closed via the live-E2E session documented in `124-VERIFICATION.md`.
Captures archived to `/tmp/vigil-124-07-png/`.

Sign-off matrix: see VERIFICATION.md `runs[1]` (date 2026-05-10).
