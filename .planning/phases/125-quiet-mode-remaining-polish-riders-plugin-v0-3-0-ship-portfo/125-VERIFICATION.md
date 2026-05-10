---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
status: approved
operator: jamesonmorrill
retest_date: 2026-05-10
firmware: 2.2.0.28
plugin_version: 0.3.4 (debug build — production ship pending v0.3.5 with instrumentation stripped)
disposition: green
---

# Phase 125 — Hardware Verification

> Operator wallclock checkpoint per memory `feedback_wallclock_checkpoint_exempt`.
> Live retest run 2026-05-10 with Claude Code orchestrator as walkthrough
> co-pilot. Tailscale Funnel served the .ehpk for sideload; final iteration
> uploaded via Even Hub beta channel.

This document was authored as a skeleton by the executor (Plan 125-09 Task 1)
and backfilled with operator findings on 2026-05-10.

## Pre-flight

- [x] G2 paired and connected (battery > 30%) — 68%→90% during retest
- [x] iPhone Even App version current; vigil sideloaded from local pack
      via Even Hub beta channel
- [x] PWA accessible via Settings page; current bearer signed in
- [x] vigil-watch installed via launchd, status `running`
- [x] Test Claude Code session ready in VS Code (used synthetic curl
      POSTs to /v1/agent-events for control instead — see Scenario 5 below)

## Retest sequence summary

| # | Scenario | Requirement | Status |
|---|----------|-------------|--------|
| 1 | Quiet mode E2E (PWA toggle → SSE → HUD filter → replay) | AGENT-HUD-03 | ✅ pass |
| 2 | Companion HUD double-tap ack | G2-PLUGIN-01 | ✅ pass |
| 3 | Work-orders exit gesture (documented footer hint) | G2-POLISH-05 | ✅ pass |
| 4 | Home body D-14 byte-identity carry-forward | G2-PLUGIN-01 | ✅ pass (visual stability) |
| 5 | needs_input → ack full E2E dry run | AGENT-DEMO-01 | ✅ pass (synthetic equivalency) |

---

## Scenario 1 — AGENT-HUD-03 Quiet mode E2E (PWA toggle → SSE → HUD filter → replay)

**Maps to:** AGENT-HUD-03 (UI-SPEC Surface 2 §"What Quiet Mode Suppresses (HUD-Write Filter)";
VALIDATION row "Hardware E2E retest of Quiet mode flow").

**Status:** ✅ pass
**Evidence:** live walkthrough 2026-05-10 ~21:13Z (orchestrator session
co-pilot transcript). Synthetic agent_events posted to /v1/agent-events
via curl with operator's bearer to control event ordering.
**Notes:** see DEFERRED below.

### Sub-step disposition

- ✅ Q glyph appears in HUD header within ~100ms of PWA Settings toggle ON
- ✅ Q glyph disappears within ~100ms of toggle OFF
- ✅ Non-allowlist event (`task_complete`, id=3) suppressed during quiet
  window — HUD body stayed in empty state, no `[DONE]` toast
- ✅ Allowlist event (`needs_input`, id=4) surfaced during quiet window —
  banner displayed; Q glyph remained in header
- ✅ On toggle OFF, server-side suppression queue flushed: held
  `task_complete` (id=3) replayed and appeared as a brief `[DONE]` toast
  on the HUD before clearing

### Pre-existing Phase 124 banner-redisplay quirk surfaced

After the toast expired in step 6, the persistent `[NEEDS INPUT]` banner
did NOT redisplay even though the underlying needs_input session was
still active and unacked. Instead, HUD returned to the normal 3-line
HUD for that session (label / `waiting for input` / message).

Root cause: `companion.ts:recomputePersistentBannerForCurrent` early-
returns when `bannerState.expiresAt !== undefined`, which is true for the
expired toast. The function never re-derives the persistent banner from
the underlying needs_input event after toast expiration.

**This is a Phase 124 bug, not introduced in Phase 125.** It does NOT
block Scenario 1 — suppression + replay primary contract worked. Logged
as DEF-125-09-01 in deferred-items.md for Phase 126 follow-up.

---

## Scenario 2 — Companion HUD ack (Phase 124 D-08 carry-forward + v0.3.x regression check)

**Maps to:** G2-PLUGIN-01 (UI-SPEC Surface 2 §"Navigation + Interaction Contract — G2";
VALIDATION row "Hardware retest of Companion HUD + double-tap ack…").

**Status:** ✅ pass
**Evidence:** live walkthrough — fresh `needs_input` (id=5, session
"scenario2-ack-…") POSTed; HUD displayed `[NEEDS INPUT]` / `approve PR-4827` /
`confirm merge?`. Double-tap on temple acked the banner; HUD returned to
the normal 3-line state.

### Sub-step disposition

- ✅ Banner `[NEEDS INPUT]` appears within ~2s of agent_event POST
- ✅ Banner line 2 shows session label (per banner-overlay design — "from which session")
- ✅ Banner line 3 shows event message
- ✅ Double-tap clears banner (Phase 124 D-08 carry-forward verified)
- ✅ No regression vs Phase 124 ack flow

---

## Scenario 3 — Work-orders exit gesture (D-06 fallback verification)

**Maps to:** G2-POLISH-05 (UI-SPEC Surface 2 §"G2 Footer Copy"; CONTEXT D-06
fallback branch — footer-hint Option B; VALIDATION row "work-orders
exit").

**Status:** ✅ pass
**Evidence:** live walkthrough — work-orders screen footer text
displayed `() double-tap to exit` (verbatim). Double-tap on temple
exited cleanly to Home (per DOUBLE_CLICK → home pattern locked in
Phase 124 D-08). No "trapped on WORK_ORDERS" regression.

### Sub-step disposition

- ✅ Footer reads exactly `() double-tap to exit`
- ✅ Double-tap exits to Home
- ✅ No "trapped on WORK_ORDERS" regression from v3.5 hardware UAT

**Side observation:** the screen showed Vigil todos rather than actual
work orders. This is expected per memory `project_work_order_source_pivot`
(Gmail/ServiceNow source pivot in progress; Vigil tasks render as fallback).
Not in scope for Scenario 3 which validates the EXIT mechanism.

---

## Scenario 4 — Home body D-14 byte-identity (Phase 124 invariant carried into v0.3.x)

**Maps to:** G2-PLUGIN-01 / Phase 124 D-14 carry-forward (UI-SPEC Surface 2
§"Verification Gates" row "Phase 124 D-14 home regression"; VALIDATION
row step 4 of "Hardware retest of Companion HUD…").

**Status:** ✅ pass (visual stability check)
**Evidence:** operator viewed Home; waited through multiple PWA refresh
cycles; Home content remained stable on the glasses. v0.3.x did not
touch home.ts at all — invariant inherits from Phase 124 D-14 structural
lock (`bodyContent` array has exactly 4 entries; `home.ts` does not
reference DIVIDER or affirmation parameter — verified by Plan 06 drift
tests).

### Sub-step disposition

- ✅ Two consecutive views show identical content (visual check; no
  overflow drift, no auto-scroll reflow)
- ✅ Structural invariant inherits from Phase 124 (Plan 06 unit tests
  pin `bodyContent.length === 4` + no-DIVIDER + no-affirmation-param)

**Notes:** Even App's pixel-level screenshot feature was not exercised;
the visual stability check + the structural unit-test lock is sufficient
given v0.3.x did not modify home.ts. Pixel-exact byte-identical capture
remains available as a Phase 126+ regression gate if a future change
touches home rendering.

---

## Scenario 5 — needs_input → ack flow (AGENT-DEMO-01 dry run)

**Maps to:** AGENT-DEMO-01 (UI-SPEC Surface 2 §"Navigation + Interaction
Contract — G2"; VALIDATION row "60-second portfolio demo recording" —
this is the dry-run BEFORE the actual recording in Plan 11).

**Status:** ✅ pass (synthetic equivalency)
**Evidence:** every mechanism link in the full E2E chain was exercised
during Scenarios 1 + 2:

| Link | Verified in |
|---|---|
| vigil-core POST → DB insert → bus.emit | Scenario 1 step 4/5 (curl POSTs landed) |
| bus → SSE delivery → plugin shim | Scenario 1 step 3 (Q glyph propagated in ~100ms) |
| plugin applyAgentEvent → banner | Scenario 1 step 5 (banner appeared) |
| double-tap → ackBanner → cleared HUD | Scenario 2 (PASS) |

The single link NOT exercised in the dry run was **vigil-watch → vigil-core POST**
(curl was used instead). That contract was independently verified during
Phase 122 (vigil-watch core: watcher + parser + emitter + config) and
Phase 123 (vigil-watch shell + 24h soak — already complete; soak in progress).

**Live latency measurement** (real Claude Code prompt → temple tap)
deferred to Plan 11 demo recording, where it will be observed naturally
as part of the 60s clip's shot list.

### Sub-step disposition

- ✅ Full flow operates end-to-end (verified by composition of Scenarios 1+2)
- ✅ Latency from event POST to G2 banner ≤2s (observed across multiple
  synthetic POSTs)
- ✅ Double-tap acks reliably (no missed taps in retest sample)

---

## Disposition

All 5 scenarios green. Plan 10 (Even Hub developer portal upload) is
UNBLOCKED. Plan 11 (60-second portfolio demo recording) is UNBLOCKED.

### Required pre-Plan-10 action: clean ship build

The .ehpk currently on the operator's iPhone is v0.3.4, which contains
SSE instrumentation that POSTs to `/v1/dev/sse-log/emit` for debugging.
This MUST be stripped before Plan 10 production submission. Orchestrator
will produce a clean v0.3.5 with:
- Container-name fix (kept — load-bearing)
- Static-import fix (kept — load-bearing)
- CORS loopback fix in vigil-core (kept — load-bearing)
- SSE shim debug instrumentation (REMOVED)
- vigil-core /v1/dev/sse-log endpoint (REMOVED — unauthenticated debug
  endpoint shouldn't live in production)

### Deferred items surfaced during retest

- **DEF-125-09-01** (Phase 124 follow-up): Persistent banner does not
  redisplay after expired toast — `recomputePersistentBannerForCurrent`
  early-return on `bannerState.expiresAt !== undefined` prevents re-
  derivation. Filed for Phase 126 follow-up; does NOT block Phase 125
  closure.

### Defects fixed mid-retest

| # | Defect | Fixed in commit |
|---|--------|-----------------|
| 1 | `Companion` missing from carousel on G2 hardware — container names `companion-header`/`companion-footer` (16 chars) hit runtime SDK strict-<16 validation; check-verified.mjs's ≤16 accepted them but SDK rejected at TextContainerProperty construction | `1118d0b fix(125): shorten Companion container names` |
| 2 | INEFFECTIVE_DYNAMIC_IMPORT — companion.ts dynamic import in navigation.ts returned undefined exports on G2 WebView; converted to static import as defense-in-depth before defect 1 was diagnosed | `e448e3d fix(125): static-import companion.ts in navigation` |
| 3 | SSE blocked by CORS preflight — Even App WebView Origin `http://127.0.0.1:<random-port>` not in CORS_ORIGINS; SSE fetch failed with `TypeError: Load failed`, REST GETs happened to succeed through different WebView path | `f7cb74a fix(125): allow loopback Origins in CORS` |

**Operator sign-off:** jamesonmorrill (live walkthrough 2026-05-10)
**Disposition:** ✅ green

---

## Cross-references

- Phase 125 plan: `125-09-PLAN.md` (this VERIFICATION.md is the Wave 4 gate output)
- UI-SPEC Surface 2 §"Verification Gates"
- VALIDATION.md §"Manual-Only Verifications"
- Phase 124 VERIFICATION.md — pattern reference for skeleton structure
- Memory `feedback_wallclock_checkpoint_exempt`
- Memory `feedback_g2_tap_expand_broken` / `project_g2_tap_expand_broken`
- Memory `project_work_order_source_pivot` (Scenario 3 side observation)
- Mid-retest defect commits: `1118d0b`, `e448e3d`, `f7cb74a`
- DEF-125-09-01 in `deferred-items.md` (Phase 126 follow-up)
