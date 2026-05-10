# Phase 125: Quiet mode + remaining polish riders + plugin v0.3.0 ship + portfolio demo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
**Areas discussed:** Quiet-mode signal source, SEED-005 swipe-out-of-list, AGENT-DEMO-01 reconciliation, Ship gate + SEED-008 placement

---

## Quiet-mode signal source

### Where does the DND signal originate, given the SDK has no Focus API?

| Option | Description | Selected |
|--------|-------------|----------|
| PWA toggle → Core → SSE | Manual toggle in PWA Settings, persisted server-side, delivered via SSE | ✓ |
| iOS Shortcut → API endpoint | Personal Automation mirrors iOS Focus to Core; blocked on Phase 85 Shortcuts.app debt | |
| In-plugin Settings + time-window | bridge.setLocalStorage + optional quiet-hours window; per-client truth | |
| Descope AGENT-HUD-03 to v3.9 | Cut Quiet mode from v3.8 entirely | |

**User's choice:** PWA toggle → Vigil Core → SSE
**Notes:** Reuses Phase 116 Settings + optimistic toggle pattern; honest about SDK limit; multi-client truth on Vigil Core.

### How does Vigil Core deliver the state to the plugin?

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated `quiet_mode_changed` SSE event | New event type with {enabled, since}; synthetic frame on connect | ✓ |
| Header on SSE connect + 30s REST poll | Simpler protocol but 30s lag on toggle | |
| Embed quietMode bool on every agent_events frame | Zero new endpoints but fails when no events flow | |

**User's choice:** Dedicated SSE event type
**Notes:** Real-time; survives reconnect; reuses existing SSE shim from Phase 124 D-04.

### What happens to events suppressed during quiet mode?

| Option | Description | Selected |
|--------|-------------|----------|
| Last-per-(sessionId, eventType), replay on exit | Bounded memory; preserves what-changed signal | ✓ |
| Drop silently — no replay | Simplest; user gets zero feedback on toggle-off | |
| Replay full queue cap N=50 | Full history but thundering-herd visual noise | |

**User's choice:** Last-per-(sessionId, eventType) replay on exit
**Notes:** Memory bounded ≤ ~25 rows/user; chronological replay; allowlist {needs_input, task_failed} always passes through.

### Where does the toggle live in the PWA?

| Option | Description | Selected |
|--------|-------------|----------|
| Settings → G2 Plugin section | Mirrors Phase 116 source pickers; one row, one PUT | ✓ |
| Top-bar quick toggle on Dashboard | Always one click away; competes for header real estate | |
| Both — Settings + quick-toggle | Discoverable + quick; sync cost | |

**User's choice:** Settings → G2 Plugin section
**Notes:** Pattern reuse from Phase 116 CAL-01/SPORTS-01; canonical mental-model home.

### Does the toggle persist server-side?

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side per user | New users.quiet_mode column; survives Railway restart | ✓ |
| Client localStorage + ephemeral Core state | No migration but Railway restart drops state | |

**User's choice:** Server-side per user
**Notes:** New `users.quiet_mode boolean default false` Drizzle migration; optional `users.quiet_mode_since timestamptz` for the `since` payload.

---

## SEED-005 swipe-out-of-list

### How do we resolve SEED-005?

| Option | Description | Selected |
|--------|-------------|----------|
| SDK source dive first, then choose | 60-min spike for ListContainerProperty bubble flag; fall back if empty | ✓ |
| Footer hint + DOUBLE_CLICK as canonical exit | Add 'tap×2 to exit' to footer; document doc-only fix | |
| Repurpose SCROLL on list to next-carousel | Phase 45 trap shape; sim-only risk | |
| Defer to v3.9 — amend G2-POLISH-05 | Closes v3.8 with trap state still in carousel | |

**User's choice:** SDK source dive first, then choose
**Notes:** Probes for the right fix before settling for docs.

### Spike timebox + decision tree?

| Option | Description | Selected |
|--------|-------------|----------|
| 60-min spike, fall back to footer-hint | Atomic commit per branch; amend REQUIREMENTS.md if fallback fires | ✓ |
| 120-min spike, fall back to repurpose SCROLL | Doubles worst-case path; Option C is sim-only shape | |
| 30-min spike, fall back to defer | Too short; defer locks bug for another milestone | |

**User's choice:** 60-min spike, fall back to footer-hint
**Notes:** Decision tree atomic; spike output gates Wave 2 path.

---

## AGENT-DEMO-01 reconciliation

### How do we reconcile 'single-tap to acknowledge' with shipped DOUBLE_CLICK behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Amend requirement to double-tap | Update REQUIREMENTS.md, PROJECT.md, ROADMAP.md, v3.8 spec | ✓ |
| Record demo on simulator (single-tap works) | Violates project_g2_tap_expand_broken memory | |
| Re-test single-tap on current SDK first | Physical-host wallclock for a probably-no answer | |

**User's choice:** Amend requirement to double-tap
**Notes:** Honest; no sim-coupling; future-proof if SDK adds single-tap later.

### Where does the 60-second demo get recorded?

| Option | Description | Selected |
|--------|-------------|----------|
| Real hardware single-shot | Phone screen recording of user wearing G2 + VS Code in frame | ✓ |
| Sim screen-record + voiceover | Not 'on the temple'; weak portfolio | |
| Hybrid hardware + sim overlay | Composite work suggests mockup; scope creep | |

**User's choice:** Real hardware single-shot
**Notes:** Wallclock checkpoint per feedback_wallclock_checkpoint_exempt.

### What's the demo shot list?

| Option | Description | Selected |
|--------|-------------|----------|
| needs_input → ack → task_complete | Three event types in 60s; matches roadmap SC #5 | ✓ |
| Multi-session cycle showcase | Tight on 60s; weakens 'walk away' framing | |
| Quiet-mode toggle showcase | Multi-device shot; deviates from roadmap SC #5 | |

**User's choice:** needs_input → ack → task_complete
**Notes:** Maps directly to roadmap SC #5; covers hero use case.

---

## Ship gate + SEED-008 placement

### Order of operations to submit vigil.ehpk v0.3.0?

| Option | Description | Selected |
|--------|-------------|----------|
| SDK validate → hardware retest → submit | Catches sim/hardware drift before store reviewer | ✓ |
| SDK validate → submit, retest async | Kicks off review clock earlier but burns cycle on regression | |
| Hardware retest first → validate → submit | Serializes everything around glasses-on-hand | |

**User's choice:** SDK validate → hardware retest → submit
**Notes:** v0.2.0 lessons inform sequence; wallclock checkpoint at retest step.

### Where does SEED-008 device-status debounce live?

| Option | Description | Selected |
|--------|-------------|----------|
| Reusable createDedupedDeviceStatusListener helper | Ships helper + unit test; no live subscription | ✓ |
| Subscribe + log dedup-count at debug | Introduces subscription with no consumer | |
| Defer SEED-008 — file as still dormant | G2-POLISH-08 unsatisfied | |

**User's choice:** Reusable debounced wrapper helper
**Notes:** Smallest surface; no behavior change risk; helper ready for first consumer.

---

## Claude's Discretion

- Plan-wave structure (server + client + spike fan-out; planner picks).
- Suppression-queue eviction (implicit Map.set overwrite; no explicit TTL needed).
- Demo clip storage location (default outside repo; suggested ~/Library/CloudStorage/iCloud Drive/Vigil/portfolio/).
- Even Hub Preview field strategy (live captures only per project_even_hub_preview_field memory).
- Whether the HUD header surfaces a 🌙/Q glyph in quiet mode (UX nice-to-have; planner / UI-spec decides).
- Which secondary list screens get a footer-hint if D-06 fallback fires (work-orders is primary; affirmation evaluated during implementation).

## Deferred Ideas

- iOS Shortcut → /v1/quiet-mode mirror (blocked on Phase 85 Shortcuts.app debt).
- Quiet-hours auto-toggle (time-window auto-on; same column can ride later).
- Cross-device DND propagation (Mac app + PWA UI honoring quiet mode).
- Single-tap and long-press tap variants on Companion (SEED-011 dormant).
- Live onDeviceStatusChanged subscription (helper ships v3.8; first consumer is v3.9+).
- Companion HUD per-event-type filter config (allowlist column on users; v3.8 stays boolean).
- Even Hub Preview field composites (memory project_even_hub_preview_field is active policy).
