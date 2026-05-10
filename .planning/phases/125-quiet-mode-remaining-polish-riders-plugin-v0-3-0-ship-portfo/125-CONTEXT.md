# Phase 125: Quiet mode + remaining polish riders + plugin v0.3.0 ship + portfolio demo - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the v3.8 milestone by landing the four requirements that didn't fit in
Phase 124 plus capturing the 60-second portfolio demo:

1. **AGENT-HUD-03 — Quiet mode (DND filter on HUD).** Honor an iOS Focus / Do
   Not Disturb signal so only `needs_input` and `task_failed` events surface
   to the HUD; other events queue silently and surface in order on next
   non-DND state change.
2. **G2-POLISH-05 — SEED-005 swipe-out-of-list.** Resolve the v3.5 hardware
   regression where users get trapped on `WORK_ORDERS` because list-container
   SCROLL events don't bubble to JS on real G2 hardware.
3. **G2-POLISH-08 — SEED-008 device-status debounce.** Defend against the
   Even Hub SDK's repeated `Device status changed` emissions with
   `connectType: "none"` (HARDWARE-DIVERGENCE.md Divergence 6).
4. **G2-PLUGIN-01 — vigil.ehpk v0.3.0 ship.** Pack and resubmit the plugin
   to the Even Hub developer portal store dashboard at version 0.3.0 with
   the Companion HUD (Phase 124) + Quiet mode + SEED-005 + SEED-008 folded
   in.
5. **AGENT-DEMO-01 — 60-second portfolio demo.** Record the full ambient
   demo flow (start a Claude Code session in VS Code, walk away, receive a
   `needs_input` tap on the temple, ack to clear, return to keyboard, see
   `task_complete`) on real G2 hardware in under 60 seconds.

**Two reality conflicts surfaced during discuss and were resolved here, not
in planning:**

- **AGENT-HUD-03's "state exposed via Even SDK" claim is false.**
  `@evenrealities/even_hub_sdk@0.0.9` exports no Focus/DND accessor (verified
  against `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`).
  Quiet mode signal therefore comes from a PWA toggle → Vigil Core → SSE
  pipeline (D-01..D-05). Roadmap SC #1 wording is implementation-honest if
  read as "DND state honored on HUD" rather than "DND state read from SDK".
- **AGENT-DEMO-01's "single-tap to acknowledge" wording is unshippable.**
  Single-tap (`CLICK_EVENT`) is sim-only on G2 hardware per Phase 45 retro
  + Phase 124 D-08 + SEED-011. Phase 124 narrowed AGENT-HUD-02 to
  DOUBLE_CLICK only; the demo wording must be amended to match (D-12).
  Updating REQUIREMENTS.md AGENT-DEMO-01 + PROJECT.md target-features +
  ROADMAP.md SC #5 is part of this phase's scope.

**In scope:**

- Server-side per-user `quiet_mode` boolean (storage + `GET/PUT /v1/quiet-mode`).
- New PWA Settings → G2 Plugin row with optimistic toggle + rollback toast
  (CAL-01 / SPORTS-01 pattern from Phase 116).
- New SSE event type `quiet_mode_changed` with `{enabled, since}` payload.
- Synthetic `quiet_mode_changed` frame on every SSE connect (state-bootstrap
  before `agent_events` Last-Event-ID replay).
- Server-side suppression queue keyed by `(userId, sessionId, eventType)` —
  last-of-each-kind only — replayed in chronological order on
  `quiet_mode_changed → false`.
- Plugin: module-level `quietMode` ref; HUD-write filter at companion screen
  rebuild time; allowlist = `{ needs_input, task_failed }`.
- 60-min SDK source-dive spike for SEED-005 (look for an `isEventCapture: 0`
  / list-event-bubble flag in `ListContainerProperty`). If found → fix +
  hardware retest. If not → footer-hint "tap×2 to exit" on work-orders +
  REQUIREMENTS.md amendment changing "swipe" to "documented exit".
- `createDedupedDeviceStatusListener()` helper in
  `vigil-g2-plugin/src/lib/` + unit test asserting consecutive same-
  `connectType` calls fire the wrapped callback only once. Plugin does not
  need to subscribe today — helper ships ready for first consumer.
- `app.json` version bump 0.2.0 → 0.3.0 (and any required `min_sdk_version`
  bump if Companion HUD touched newer SDK surfaces).
- Hardware retest of: Companion HUD + Quiet mode toggle while wearing G2 +
  work-orders exit (with whichever fix lands) + home overflow regression
  check + needs_input → ack flow. Wallclock checkpoint per
  `feedback_wallclock_checkpoint_exempt`.
- `vigil.ehpk` pack via `npm run package:ehpk` + Even Hub developer portal
  upload + dashboard acknowledgment screenshot saved to phase artifacts.
- 60-second portfolio demo recording: real G2 hardware, real VS Code session,
  real `needs_input` event (staged via a prompt that reliably produces one),
  double-tap to ack, `task_complete` toast. Single-shot phone screen
  recording, optional minor post-production (trim, no composites).
- Requirement / roadmap / PROJECT.md amendments for AGENT-DEMO-01 single→
  double-tap and (conditionally) G2-POLISH-05 swipe→documented-exit.

**Out of scope (defer to v3.9 or beyond):**

- Single-tap (`CLICK_EVENT`) and long-press (`LONG_PRESS_EVENT`) variants —
  remain blocked on SDK changes per SEED-011.
- iOS Shortcut → API endpoint as authoritative iOS Focus mirror — Phase 85
  Shortcuts.app debt still open; PWA toggle is the v3.8 bridge.
- Time-window "quiet hours" auto-toggle — manual toggle is sufficient for
  the v3.8 ship; auto-rules can ride on the same `quiet_mode` column later.
- Cross-device DND propagation beyond the plugin — Mac app and PWA UI may
  honor it later; v3.8 only filters HUD output.
- Even Hub Preview-field composited mockups (memory
  `project_even_hub_preview_field`: v0.2.0 was rejected for these — submit
  with whatever the dashboard accepts as live screenshots).
- Live `onDeviceStatusChanged` subscription — helper ships, subscription
  doesn't.

</domain>

<decisions>
## Implementation Decisions

### Quiet-mode signal source + transport (Area 1)

- **D-01 (PWA toggle → Vigil Core → SSE; SDK has no Focus API):** AGENT-HUD-03
  is satisfied by a manual user-controlled toggle, not by reading iOS Focus
  state from the SDK. PWA Settings page exposes a Quiet-mode toggle in a new
  G2 Plugin section (mirrors source pickers landed in v3.7 Phase 116). PWA
  PUTs to a new `/v1/quiet-mode` endpoint on Vigil Core. Core persists
  per-userId. **iOS Focus mirror is explicitly out of scope** for v3.8 per
  Phase 85 Shortcuts.app debt; the toggle is the v3.8 bridge.

  **Rejected:** iOS Shortcut → endpoint (depends on a Personal Automation
  the user must build + Shortcuts.app survival; Phase 85 deferred for the
  same reason). In-plugin `bridge.setLocalStorage` toggle (each Vigil client
  would have a different DND state). Descope to v3.9 (loses an entire
  roadmap requirement that's implementable today).

- **D-02 (Dedicated `quiet_mode_changed` SSE event):** New SSE event type
  emitted by Vigil Core whenever the user's `quiet_mode` row toggles.
  Payload: `{enabled: boolean, since: ISO}`. Plugin holds a module-level
  `let quietMode = false` ref updated on every frame. Filter applies at
  HUD-write time (companion-screen rebuild path), not at SSE-receive time —
  events still arrive and update `agent_sessions` cache; only their HUD
  surfacing is suppressed.

  **Rejected:** Header-on-SSE-connect + 30s REST poll (30s lag on toggle
  defeats glanceability). Embed `quietMode: bool` on every `agent_events`
  frame (fails when no events flow during the quiet window — exactly when
  the state matters; also can't trigger replay-on-exit cleanly).

- **D-03 (Synthetic state-bootstrap frame on every SSE connect):** Server
  emits a `quiet_mode_changed` frame as the FIRST frame after authentication
  on every SSE connect, BEFORE the `agent_events` Last-Event-ID replay. This
  guarantees the plugin's `quietMode` ref is correct before any agent_events
  surface, eliminating a race where a `task_complete` arrives during
  reconnect and surfaces despite DND being on.

- **D-04 (Server-side suppression queue, last-per-(sessionId, eventType)):**
  When `quiet_mode = true`, Vigil Core continues to persist `agent_events`
  to DB (no behavior change there) but withholds SSE delivery for events
  outside the allowlist. Server holds these in a per-userId in-memory
  `Map<userId, Map<sessionId, Map<eventType, AgentEventRow>>>`. Only the
  most recent event of each (sessionId, eventType) is retained.

  On `quiet_mode_changed → false`: server emits the held set as normal
  SSE frames in chronological order (sorted by `event_timestamp`), then
  clears the map. Bounded memory (≤ N_sessions × N_event_types per user;
  realistically ≤ 5×5 = 25 rows per user). No thundering herd of stale
  heartbeats on exit.

  Allowlist (always pass through, never queued): `{ needs_input, task_failed }`.
  Spec-locked.

  **Rejected:** Drop silently no replay (user toggles DND off and gets
  zero feedback that anything happened — defeats "queue silently and
  surface in order" wording from spec). Replay full queue cap N=50
  (thundering-herd visual noise on toggle-off).

- **D-05 (PWA placement: Settings → G2 Plugin row, server-side persistence):**
  Toggle lives in the existing PWA Settings page in a new G2 Plugin section
  (alongside source pickers landed in Phase 116 / v3.7). Optimistic UI with
  rollback toast on PUT failure (CAL-01 / SPORTS-01 pattern). Persistence:
  new `users.quiet_mode boolean default false` column (Drizzle migration) +
  optional `users.quiet_mode_since timestamptz` for the `since` payload.
  Survives Railway restart (memory `project_railway_deploy`).

  **Rejected:** Dashboard top-bar quick-toggle (Dashboard top-bar already
  busy; Settings is the natural mental-model home; can add later if usage
  demands). Both surfaces (sync cost; one truth surface is enough for v3.8).
  Client localStorage + ephemeral Core state (Railway restart silently
  drops "I was in quiet mode"; not honest).

### SEED-005 swipe-out-of-list (Area 2)

- **D-06 (60-min SDK source-dive spike, then branch):** Plan opens with a
  time-boxed (60-min wallclock) spike against
  `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/*.d.ts` and
  the matching `.js` for any `isEventCapture: 0` / `bubbleEvents` /
  containerProperty flag that would let `ListContainerProperty` SCROLL
  events bubble out of the list to the carousel router. Read every
  enum/interface — the Phase 45 fix worked in sim but not on hardware
  precisely because the SDK type surface was opaque.

  **Branch on spike result:**
  - **Spike finds a flag** → implement: set the flag on `WORK_ORDERS` list
    container; SCROLL_BOTTOM bubbles → `getNextScreen` → AFFIRMATION;
    SCROLL_TOP bubbles → `getPrevScreen` → COMPANION. Hardware retest
    required (wallclock checkpoint). G2-POLISH-05 satisfied as worded
    ("works via swipe").
  - **Spike returns empty** → fall back to footer-hint Option B: add
    `* tap×2 to exit *` line to the work-orders footer text container
    (already a `text` row at the bottom). Document DOUBLE_CLICK → home as
    canonical. Amend G2-POLISH-05 wording in REQUIREMENTS.md from
    "Swipe-out-of-list navigation works on real G2 hardware; list-container
    SCROLL events propagate correctly" to "List screens have a documented
    exit gesture (DOUBLE_CLICK → home) with on-screen hint; SDK SCROLL
    bubble limit acknowledged in SEED-005 follow-up."

  **Rejected:** Repurpose SCROLL on lists to next-carousel via wrapper
  handler at screen level (Phase 45 trap shape — sim works, hardware
  doesn't; collides with internal list scrolling). Defer to v3.9 (closes
  v3.8 with two trap states still in carousel). 30-min spike (too short
  to read SDK source carefully). 120-min spike with Option C fallback
  (Option C is the sim-only shape we've been burned on twice).

- **D-07 (Atomic commits per branch):** The spike output is committed
  separately from the implementation/footer-hint change. If the spike
  finds nothing, the spike commit captures the negative finding for the
  next milestone and the next commit is the footer-hint + REQUIREMENTS.md
  amendment. If the spike finds something, the spike commit precedes the
  flag-flip + hardware-retest commit. Reverting any single decision is
  trivial.

### AGENT-DEMO-01 reconciliation + recording (Area 3)

- **D-08 (Amend AGENT-DEMO-01 wording from single-tap to double-tap):**
  Update `.planning/REQUIREMENTS.md` AGENT-DEMO-01 wording:
  > Full demo flow (start a Claude Code session in VS Code, walk away from
  > keyboard, receive a `needs_input` tap on the temple, **double-tap** to
  > acknowledge) is recordable in under 60 seconds for portfolio use.

  Cascade the same wording change to:
  - `.planning/PROJECT.md` v3.8 milestone target features
  - `.planning/ROADMAP.md` Phase 125 SC #5
  - `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Interaction" (already
    says single-tap there; mark it deferred-via-SEED-011 with double-tap as
    v3.8 ship).

  Honest: matches Phase 124 D-08 / AGENT-HUD-02 narrowing / SEED-011
  deferred state. Future-proof: when SDK adds reliable single-tap, only
  the demo-recording wording flips back, no implementation churn.

  **Rejected:** Record demo on simulator where CLICK_EVENT works
  (violates `project_g2_tap_expand_broken` memory; demo would lie about
  hardware reality). Re-test single-tap on current SDK first (low-yield —
  v0.0.9 SDK was the source of `eventType: undefined` bug; SDK changelog
  hasn't moved; physical-host wallclock for a probably-no answer).

- **D-09 (Real hardware single-shot recording):** 60-second clip is a
  phone screen-recording of the user wearing G2, with VS Code window
  visible in frame on the laptop. Single shot, single take (re-takes
  cheap). No composite work — a portfolio piece that says "this is real"
  must read as real. Wallclock checkpoint: glasses + iPhone + laptop +
  test repo all on hand simultaneously. Per
  `feedback_wallclock_checkpoint_exempt`, the recording task is an
  operator wallclock todo, NOT auto-executable.

  **Rejected:** Sim screen-record + voiceover (not "on the temple",
  weak portfolio). Hybrid hardware-tap + sim screen overlay (composite
  work suggests mockup; scope creep).

- **D-10 (Shot list: needs_input → ack → task_complete):**
  - 0:00–0:10 — VS Code window visible, Claude Code session starts running.
  - 0:10–0:25 — User stands up, walks away from keyboard. Glasses idle.
  - 0:25–0:35 — Temple tap fires; HUD shows banner `[NEEDS INPUT]` +
    state line `waiting for input` + last event message.
  - 0:35–0:45 — User double-taps temple to ack; banner clears; state
    returns to `running`; user walks back to keyboard.
  - 0:45–0:60 — User answers in VS Code; Claude Code finishes; HUD shows
    `task_complete` toast briefly; clip ends.

  Maps directly to roadmap SC #5 wording. Tight enough for 60s. Covers
  three of the five event types (`needs_input`, ack, `task_complete`)
  without juggling multi-session UI.

  **Rejected:** Multi-session cycle showcase (overpacks 60s; weakens
  "walk away" framing). Quiet-mode toggle showcase (multi-device shot;
  deviates from roadmap SC #5).

### Ship gate + SEED-008 placement (Area 4)

- **D-11 (Ship sequence: SDK validate → hardware retest → submit):**
  Strict order:
  1. Bump `vigil-g2-plugin/app.json` version `0.2.0 → 0.3.0`. Verify
     `min_sdk_version` still satisfied by Companion-HUD-touched surfaces
     (Phase 124 didn't bump it; verify here).
  2. Run `npm run package:ehpk` (existing `scripts/check-verified.mjs`
     enforces SDK rules incl. `containerName ≤ 16 chars` per memory
     `project_g2_ux_issues`).
  3. Hardware retest pass on real G2 firmware 2.2.0.28: Companion HUD
     surfaces a real `needs_input`, double-tap acks, work-orders exits
     (with whichever D-06 branch landed), home body still byte-identical
     across two captures (Phase 124 D-14 regression check), Quiet mode
     toggle on PWA suppresses non-allowlist events on HUD and replays on
     toggle-off. Wallclock checkpoint per
     `feedback_wallclock_checkpoint_exempt`.
  4. Upload `vigil.ehpk` to Even Hub developer portal store dashboard;
     screenshot the dashboard acknowledgment and save to
     `.planning/phases/125-…/artifacts/even-hub-submission-2026-MM-DD.png`.

  **Rejected:** Validate → submit, retest async (a regression caught
  post-submit burns a store-review cycle and we already saw v0.2.0 stall
  in review per spec note). Hardware retest first then validate
  (serializes everything around glasses-on-hand; can prep package in
  parallel without committing the submission).

- **D-12 (SEED-008: ship `createDedupedDeviceStatusListener` helper, no
  live subscription):** New file
  `vigil-g2-plugin/src/lib/deduped-device-status.ts` exporting
  `createDedupedDeviceStatusListener(callback: (status: DeviceStatus) =>
  void): (status: DeviceStatus) => void`. Wrapped callback compares
  `status.connectType` against a closure-scoped `lastSeenConnectType`
  ref; fires the inner callback only on change. Unit test:

  ```ts
  const calls: DeviceConnectType[] = []
  const listener = createDedupedDeviceStatusListener(s => calls.push(s.connectType))
  listener({connectType: 'none', ...})
  listener({connectType: 'none', ...})
  listener({connectType: 'none', ...})
  listener({connectType: 'connected', ...})
  // expect: calls = ['none', 'connected']
  ```

  Plugin does NOT subscribe to `bridge.onDeviceStatusChanged` in this
  phase — there's no consumer that needs the data. The helper is ready
  for the first consumer (likely a future "glasses disconnected"
  indicator separate from the SSE offline indicator). G2-POLISH-08 is
  satisfied by the helper-with-test (the noise is at SDK level; the
  plugin is now immune when it does subscribe). REQUIREMENTS.md
  G2-POLISH-08 wording stays as-is — "debounced or deduped" reads true
  of the helper.

  **Rejected:** Subscribe + log dedup-count at debug (introduces a
  subscription with no consumer; logs invisible without remote console).
  Defer SEED-008 (G2-POLISH-08 unsatisfied; helper is one file +
  one test, not worth deferring).

### Claude's Discretion

- **Plan-wave structure.** Planner picks. Likely:
  - Wave 1 (parallel, can run in any order):
    - vigil-core: `users.quiet_mode` migration + `GET/PUT /v1/quiet-mode`
    - vigil-core: SSE event type + suppression queue
    - vigil-g2-plugin: `quiet_mode_changed` handler in sse-client
    - vigil-g2-plugin: HUD-write filter in companion screen
    - vigil-g2-plugin: `createDedupedDeviceStatusListener` helper + test
    - PWA: Settings G2 row + optimistic toggle + rollback toast
    - SEED-005 SDK source-dive spike (60-min wallclock; output gates
      Wave 2 path)
  - Wave 2 (depends on Wave 1 spike output):
    - SEED-005 fix path: implement bubble flag (if found) OR footer-hint +
      REQUIREMENTS.md amendment (if not).
  - Wave 3 (depends on Wave 1 + Wave 2 complete):
    - Demo amendment commits (REQUIREMENTS.md, PROJECT.md, ROADMAP.md,
      v3.8 spec) — pure docs, can land any time.
    - Hardware retest wallclock checkpoint.
    - `app.json` version bump + `npm run package:ehpk`.
  - Wave 4 (operator wallclock, gated on hardware retest pass):
    - Submit `vigil.ehpk` to Even Hub developer portal.
    - Record 60-second portfolio demo on real G2 hardware.

- **Suppression-queue eviction.** If a session emits 50+ events of the
  same type during a long DND window, only the most recent of each type
  per session is retained. Eviction is implicit (Map.set overwrites). No
  TTL needed — DND-off triggers full flush.

- **Where to commit the demo clip.** Default to outside the repo (size +
  binary churn). Suggested target: `~/Library/CloudStorage/iCloud
  Drive/Vigil/portfolio/2026-05-vigil-v3.8-demo.mp4` per
  `reference_brand_guidelines` (PDF lives there too). Phase artifacts
  reference the path; clip itself isn't committed.

- **Even Hub Preview field.** Per memory
  `project_even_hub_preview_field`, the store dashboard has 3 separate
  Preview slots distinct from listing screenshots; v0.2.0 was rejected
  for composited mockups in this field. For v0.3.0 submit live captures
  only — no composites. If the dashboard still requires Preview content
  beyond what live captures provide, treat it as a submission blocker
  and surface to operator before submit.

- **Verification of AGENT-HUD-03 on hardware.** During the wallclock
  retest: with G2 worn and connected, toggle quiet_mode in PWA, observe
  HUD ignores `task_complete` / `milestone` / `heartbeat` events; toggle
  off, observe replay arrives in chronological order. Capture screen
  recording or photos as artifact.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v3.8 milestone spec (load-bearing)
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Quiet mode" (line 235) —
  states "Honor iOS Focus state via Even SDK"; this phase replaces that
  approach because the SDK exposes no Focus API.
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Interaction" (lines
  229–233) — original three-tap-variant intent (single/double/long-press);
  v3.8 ships double-only per SEED-011; demo wording cascade per D-08.
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Build phases" row 4 —
  scope confirmation for Phase 125.
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Success criteria" (line
  287) — "Full demo flow can be recorded in under 60 seconds for
  portfolio."

### Phase 125 requirements + roadmap
- `.planning/REQUIREMENTS.md` — AGENT-HUD-03, G2-POLISH-05, G2-POLISH-08,
  G2-PLUGIN-01, AGENT-DEMO-01. **AGENT-DEMO-01 wording will be amended in
  this phase per D-08; G2-POLISH-05 wording may be amended per D-06
  fallback branch.**
- `.planning/ROADMAP.md` Phase 125 — Goal + Success Criteria. SC #5
  wording cascades with AGENT-DEMO-01 amendment.
- `.planning/PROJECT.md` v3.8 milestone "Target features" — single-tap
  acknowledgment wording cascades with D-08.

### Phase 124 prior-art (the producer + HUD this phase filters / ships)
- `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md`
  D-08 — context-sensitive DOUBLE_CLICK on Companion (banner-ack →
  cycle-session → jump-home).
- `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md`
  D-09 — `N/M` indicator + cycleSession.
- `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md`
  D-11 — SSE-disconnect offline indicator + exp-backoff reconnect (the
  HUD-write surface Quiet-mode filter sits alongside).
- `.planning/phases/124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish/124-CONTEXT.md`
  D-14 — screenshot-equality verification (carry forward as Phase 125
  retest invariant).
- `.planning/phases/124-…/124-VERIFICATION.md` — operator-E2E findings
  2026-05-10 (banner ack flow, cycle filter, SSE reconnect storm — the
  retest baseline).

### Phase 121 (the producer this phase's filter sits behind)
- `.planning/phases/121-agent-events-api-foundation-cross-user-isolation-lock/121-CONTEXT.md`
  — POST `/v1/agent-events` contract + per-userId isolation; Quiet mode
  filter is applied at SSE delivery time, not at write time.

### SEEDs (background context — not code)
- `.planning/seeds/SEED-005-g2-swipe-out-of-list-broken-on-hardware.md` —
  three preset options A/B/C; this phase chooses spike-then-branch (D-06).
- `.planning/seeds/SEED-008-g2-device-status-event-spam-debounce.md` —
  small-scope helper-with-dedupe; D-12 ships the helper, no live
  subscription.
- `.planning/seeds/SEED-011-g2-single-tap-long-press-tap-events.md` —
  why single-tap is unshippable on G2 today; cascade target for D-08.

### v3.5 hardware UAT (the regression evidence behind SEEDs 005, 008)
- `.planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/HARDWARE-DIVERGENCE.md`
  Divergence 2 — work-orders trapped (SEED-005 evidence).
- `.planning/milestones/v3.5-phases/106-g2-store-resubmit-atomic/HARDWARE-DIVERGENCE.md`
  Divergence 6 — device-status spam (SEED-008 evidence).

### G2 plugin code (the actual code being modified)
- `vigil-g2-plugin/src/screens/companion.ts` — HUD-write surface for
  Quiet-mode filter; banner-state machine.
- `vigil-g2-plugin/src/lib/sse-client.ts` — custom EventSource shim
  (Phase 124 D-04); add `quiet_mode_changed` event-type handler.
- `vigil-g2-plugin/src/screens/work-orders.ts` — SEED-005 footer-hint
  surface; existing `wo-list` ListContainerProperty at lines 87–98.
- `vigil-g2-plugin/src/screens/affirmation.ts` — secondary list candidate
  for footer-hint if D-06 fallback fires (decide during implementation).
- `vigil-g2-plugin/src/navigation.ts` — `handleNavEvent` switch (lines
  144–216); SEED-005 implementation site if spike finds a flag.
- `vigil-g2-plugin/src/lib/` — new home for
  `createDedupedDeviceStatusListener.ts` + `__tests__/` test.
- `vigil-g2-plugin/src/main.ts` — line 190 `bridge.onEvenHubEvent`
  registration site (SEED-008 future consumer; not modified in v3.8).
- `vigil-g2-plugin/app.json` — version bump 0.2.0 → 0.3.0.
- `vigil-g2-plugin/scripts/check-verified.mjs` — pre-pack SDK validation
  (containerName ≤ 16 etc.).
- `vigil-g2-plugin/package.json` — `release` / `package:ehpk` scripts.

### Even Hub SDK (read-only — vendored, no Focus API)
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
  lines 75–168 — `UserInfo`, `DeviceStatus`, `DeviceConnectType` (no
  Focus surface; D-01 confirmation evidence).
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
  line 1242 — `onDeviceStatusChanged(callback: (status: DeviceStatus) =>
  void): () => void` (D-12 helper signature target).
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`
  lines 707–717 — `OsEventTypeList` enum (D-08 cascade evidence).
- `vigil-g2-plugin/node_modules/@evenrealities/even_hub_sdk/README.md` —
  ListContainerProperty + `isEventCapture: 1` semantics (D-06 spike
  starting point).

### vigil-core code (server side)
- `vigil-core/src/index.ts` line 43 — bearer-auth dispatcher mount point;
  `/v1/quiet-mode` mounts after.
- `vigil-core/src/lib/agent-events-bus.ts` (Phase 124 D-03) — per-userId
  EventEmitter; D-04 suppression queue lives alongside.
- `vigil-core/src/routes/agent-events.ts` (Phase 124) — POST handler
  precedent; mirror it for quiet-mode endpoint.
- `vigil-core/src/lib/sse.ts` (or wherever Phase 124 D-01 streamSSE
  handler landed) — D-02 + D-03 emit sites.
- `vigil-core/drizzle/` — schema + migration target for
  `users.quiet_mode` column.
- `vigil-core/src/db/schema.ts` — Drizzle table definitions.

### PWA code (client surface)
- PWA Settings page (path resolved during planning — recent CAL-01 /
  SPORTS-01 work in Phase 116/117 is the pattern reference).
- Optimistic toggle + rollback toast pattern from Phase 116 source pickers.
- Auth retry-after countdown pattern from AUTH-12/13 — adjacent reference
  for error UX.

### Memories (operator policy)
- `feedback_wallclock_checkpoint_exempt` — hardware retest, Even Hub
  submission, demo recording are wallclock checkpoints; yolo mode does
  NOT bypass.
- `feedback_g2_tap_expand_broken` / `project_g2_tap_expand_broken` —
  do not ship sim-only tap behaviors; D-08 + D-09 enforce.
- `project_even_hub_preview_field` — Preview field rejected v0.2.0 for
  composites; live captures only for v0.3.0.
- `feedback_dirty_tree_worktree_risk` — disable worktrees if main has
  pre-existing dirty state before /gsd-execute-phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Phase 124 SSE shim (`vigil-g2-plugin/src/lib/sse-client.ts`).**
  Already parses `event:`/`data:`/`id:` SSE frames; add a
  `quiet_mode_changed` event-type branch alongside the existing
  `agent_events` handler. No new transport code.
- **Phase 124 EventEmitter bus (`vigil-core/src/lib/agent-events-bus.ts`).**
  Per-userId fan-out infrastructure already in place; suppression queue
  hangs off the same bus.
- **Phase 116 source pickers + optimistic toggle (PWA Settings).**
  Pattern reference for PUT-with-rollback-toast. CAL-01 / SPORTS-01
  rows model the UI shape almost verbatim.
- **AUTH-12/13 retry-after countdown.** Adjacent reference for any error
  states on the Quiet-mode toggle.
- **`buildVigilHeader` rightSide parameter (Phase 124 D-09 site).**
  Already accepts a custom right-side string (used for `2/3` cycle
  indicator + `⚠` offline). A small `🌙` or `Q` glyph can ride alongside
  if user-visible quiet-mode indicator is desired (open question for
  planner / UI-spec).
- **`vigil-g2-plugin/scripts/check-verified.mjs`.** Existing pre-pack
  validation; runs as part of `npm run package:ehpk`. No new script
  needed for ship gate.
- **Phase 124 D-14 screenshot-equality test.** Carry forward as a Phase
  125 retest invariant — home body should still be byte-identical.

### Established Patterns

- **Atomic commit per fix.** Each plan ships an atomic commit; reverts
  are trivial (Phase 124 D-13 precedent for G2-POLISH-07).
- **Wallclock checkpoint for physical-host actions.** Hardware retest,
  Even Hub submission, demo recording — all operator wallclock per
  `feedback_wallclock_checkpoint_exempt`.
- **Documentation amendment lands with the implementation that motivates
  it.** AGENT-DEMO-01 amendment is part of this phase, not a separate
  follow-up. Same for G2-POLISH-05 if D-06 fallback fires.
- **PWA optimistic + rollback toast.** All boolean settings toggles use
  this pattern (Phase 116). Quiet-mode follows.
- **No sim-only ships.** `project_g2_tap_expand_broken` precedent —
  every tap or list-bubble change must hardware-retest before SDK pack.

### Integration Points

- **Vigil Core ↔ PWA.** New `/v1/quiet-mode` endpoint pair — mounts
  after bearer-auth dispatcher in `vigil-core/src/index.ts:43`.
- **Vigil Core SSE delivery ↔ plugin.** New `quiet_mode_changed` event
  type rides on the same SSE channel as `agent_events` — single
  protocol, two event types, dispatch by `event:` line.
- **Plugin module-level state ↔ companion.ts HUD writer.** New
  `quietMode` ref in companion.ts (or a small `quiet-mode-state.ts`
  module if a separate `cleanup` hook is preferred); HUD-write filter
  applied at companion rebuild boundary.
- **users table ↔ all clients (Mac, PWA, plugin).** Quiet-mode is a
  per-user truth on Vigil Core; today only the plugin filter consumes
  it, but Mac app and PWA UI may honor it later (out of scope v3.8).
- **Even Hub developer portal ↔ vigil.ehpk artifact.** Submission is a
  manual upload; dashboard acknowledgment screenshot is the artifact
  proof.

</code_context>

<specifics>
## Specific Ideas

- Quiet-mode allowlist is hard-locked: `{ needs_input, task_failed }` only.
  This matches AGENT-HUD-03 wording verbatim. Anything else (`milestone`,
  `task_complete`, `heartbeat`) is suppressed. **Do not add a "low
  priority" tier or per-event-type config in v3.8** — keep it boolean.
- Optional UX: a small `🌙` or `Q` glyph in the HUD header rightSide when
  Quiet mode is on. Saves the user wondering whether the HUD is silent
  because nothing's happening or because DND is on. Planner / UI-spec
  decides; do not block on this.
- Demo clip naming: `2026-05-vigil-v3.8-demo.mp4` (date-prefix matches
  `reference_brand_guidelines` PDF naming convention).
- The 60-min SEED-005 spike SHOULD also check
  `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` lines
  ~400–600 (ListContainerProperty / ListItemContainerProperty area),
  not just the README. Type definitions are usually more complete than
  prose.
- For the suppression-queue replay: replay events with `event_timestamp`
  preserved (not "now"), so the plugin's relative-time renderings stay
  truthful (`task_complete 14m ago`, not `task_complete just now`).

</specifics>

<deferred>
## Deferred Ideas

- **iOS Shortcut → /v1/quiet-mode mirror.** Authoritative iOS Focus
  state pushed to Vigil Core via Personal Automation. Blocked on Phase
  85 Shortcuts.app debt + survival of automation toggles. Revisit when
  Phase 85 unblocks.
- **Quiet-hours auto-toggle.** Time-window rule (e.g., 22:00–07:00
  auto-on). Same `users.quiet_mode` column can ride; just add
  `users.quiet_hours_start/_end timestamptz` later.
- **Cross-device DND propagation.** Mac app + PWA UI honoring quiet
  mode (e.g., suppressing notifications). v3.8 only filters HUD output.
- **Single-tap and long-press tap variants on Companion.** Stays in
  SEED-011 dormant state; re-activate on SDK changes.
- **Live `onDeviceStatusChanged` subscription.** Helper ships in v3.8;
  first consumer (likely a "glasses disconnected" indicator separate
  from SSE-network offline) is a v3.9+ candidate.
- **Companion HUD per-event-type filter config.** If user later wants
  `milestone` to surface during DND, that becomes an allowlist column
  on `users` instead of a flat boolean. Out of scope v3.8.
- **Even Hub Preview field composites.** Memory
  `project_even_hub_preview_field` is the active policy — live captures
  only. If the dashboard demands composites, escalate to operator
  before submit.

### Reviewed Todos (not folded)

None — discussion stayed within phase scope. SEED-009
(last-viewed-screen) and SEED-010 (voice capture) remain v3.9 candidates
per PROJECT.md milestone scope.

</deferred>

---

*Phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo*
*Context gathered: 2026-05-10*
