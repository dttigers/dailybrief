---
id: SEED-016
status: dormant
planted: 2026-05-10
planted_during: v3.8 verifying / hypothetical use-case stress-test
trigger_when: v3.9 milestone planning AND operator wants the HUD to be useful for long-running bypass-mode tasks while away from desk; OR any phase that touches vigil-watch event types, vigil-g2-plugin Companion screen, or the heartbeat/task_complete detection rules
scope: Medium
---

# SEED-016: Companion HUD clarity gaps for "long-run, away-from-desk" use case

## The use case (operator framing, 2026-05-10)

> "I run a command in bypass permissions mode. I leave the house for a bit.
> I want to check in on progress: still running, or done."

This is the ambient-AI thesis in one sentence. The G2 Companion screen
should answer that glance in <2 seconds. Today it answers it ~70%
correctly — three real gaps surface specifically when the operator is
away from the desk for non-trivial wall-clock time.

The use case is load-bearing because bypass-permissions is the operator's
default for long autonomous runs (gsd-execute-phase, gsd-autonomous, long
build/test cycles). Without `needs_input` to anchor the HUD's signal,
the operator relies entirely on `running` vs `done` — and the resolution
of that signal is currently coarse.

## Three gaps observed

### Gap 1 — No staleness signal

**Today:** The HUD bottom line reads `session idle > 60s` whether the
heartbeat fired 1 minute ago or 50 minutes ago. The heartbeat string is
constant across all heartbeat fires. Operator cannot tell, by glance,
whether the "running" state is fresh or stale.

**Why it matters:** In a normal run, staleness shouldn't matter — the
state is the truth. But in failure modes (Claude hung, network died,
daemon crashed silently, vigil-core SSE dropped), the HUD shows a
*stale* state. With no staleness signal, the operator has no way to
distinguish "fresh signal, still running" from "frozen state, no events
arriving."

**Concrete fix:** Replace the heartbeat's bottom-line `session idle > 60s`
with a relative timestamp computed against `lastEvent.eventTimestamp`
at HUD-render time:

```
last activity 4m ago
last activity 23m ago
last activity 1h 14m ago
```

The plugin already has `lastEvent.eventTimestamp` on every
`AgentSessionRow` — this is a render-side computation in
[companion.ts computeBodyLines](../../vigil-g2-plugin/src/screens/companion.ts#L316).
Re-render on each tick of the plugin's existing 30s refresh cycle.

### Gap 2 — Stuck looks like working

**Today:** In bypass mode, `needs_input` is suppressed by design (no
approval prompts to fire on). If a Bash command hangs (network, infinite
loop, frozen tool, MCP server unreachable), the daemon's silence-timer
keeps firing heartbeats every 60s for the same session, the HUD keeps
saying `running`, and the operator has no way to distinguish
"actively working" from "stuck for 30 minutes."

**Why it matters:** This is the exact failure mode that hurts most when
away from desk. The operator's mental model is "if the glasses say
running, work is happening." That's false in the stuck case. Eventually
the operator walks back to the desk, finds Claude has been hung on a
single tool call for 45 minutes, and the away-from-desk session is
wasted.

**Concrete fix:** Add a new derived event type `possibly_stuck` in
vigil-watch, fired when:

- N consecutive heartbeats fire on the same session WITHOUT any
  `tool_use`, `tool_result`, or `assistant` `end_turn` line landing
  between them
- Threshold tunable in `watch.toml` — default candidate: 5 consecutive
  heartbeats = ~5 minutes of pure silence mid-run

In the G2 plugin, `possibly_stuck` triggers a persistent
`[POSSIBLY STUCK]` banner with the same DOUBLE_CLICK ack semantics as
`task_failed`. Operator can ack it as "I know, I'll wait" or walk back.

In Quiet Mode, this event SHOULD propagate (allowlist it) — stuck during
a focus block is exactly when you most want to know.

**Risk:** false positives during legitimate long-running tools (a 10min
test suite, a slow MCP search). Threshold-tuning + per-pattern overrides
in `watch.toml` (e.g., "if assistant content matches `running tests`,
extend stuck threshold to 30 heartbeats") mitigate. Start with the
default + iterate.

### Gap 3 — `task_complete` delay window

**Today:** `task_complete` fires when `stop_reason == "end_turn"` AND
`(now - latestTimestamp) > 30s` (silence threshold). The 30s silence
window is deliberate — it disambiguates "Claude yielded mid-thought"
from "Claude is done." But it means the HUD shows `running` for up to
30 seconds AFTER Claude has actually finished, until the silence timer
expires.

**Why it matters:** Operator glances at glasses 20 seconds after Claude
finished. HUD says `running`. Operator thinks "still working, I'll wait."
They miss the actual done signal by 10 seconds and walk away when they
could've been back at the desk.

**Concrete fix:** Decouple the *state line* from the *banner*:

- **State line** flips to `done` IMMEDIATELY on `assistant.message.stop_reason == "end_turn"` (no silence wait).
  Run-style heartbeats stop emitting for that session as soon as
  `end_turn` is observed (they only resume if a new `user` line lands).
- **Banner / toast** still requires 30s silence to fire `[DONE]`.
  Operator wants the banner to mean "really done, you can go" — keep
  the heuristic strict there.

This means a glance at the HUD answers "done?" in real time, and the
toast confirms "really done" 30 seconds later. Two-stage signal,
matches the cognitive flow.

**Wrinkle:** if Claude does `end_turn` then immediately responds again
(rare but happens with interrupted streams or follow-up clarifications),
the state line flips `done` → `running` mid-glance. Live with it — it's
correct and the operator's intuition handles the flicker fine.

## When to Surface

Wakes up when:

- v3.9 milestone planning starts AND operator wants HUD to be a true
  ambient signal (not just a quick-glance confirmation)
- Any phase touches `vigil-watch` event types (Phase 122 parser, watch.toml
  thresholds)
- Any phase touches `vigil-g2-plugin` Companion screen rendering
  (`companion.ts`, `STATE_LINE` map, banner overlay)
- Operator returns from an away-from-desk session and reports HUD didn't
  match reality (concrete pain → unlock seed)

## Constraints & dependencies

- All three gaps are improvements to existing infrastructure, not net-new
  systems. No platform dependencies. No Even Hub API changes required.
- Gap 1 is pure plugin-side render change — smallest scope.
- Gap 2 requires daemon-side event type + plugin-side banner handling —
  medium scope. Touches `watch.toml` config surface (one new threshold
  knob).
- Gap 3 requires changes to BOTH daemon (detection rule for state vs
  banner) and plugin (STATE_LINE logic) — medium scope but most
  test-impact (Phase 124 D-14 byte-identity invariant on screenshots
  will need updating for the relative-timestamp pixel diff in Gap 1).

## Why dormant, not active

v3.8 just hardware-verified. The "running vs done" signal works in the
nominal case. These three gaps surface in non-nominal cases
(long-running, away-from-desk, stuck-tool) that the operator hits when
the system is actually being used hard. The gaps don't block normal use,
but they cap the ceiling of how ambient/trustworthy the HUD can feel.
v3.9 candidate: "make HUD trustworthy when away from desk."

## Related Memory & Files

- `vigil-watch/Sources/VigilWatch/SessionEvaluator.swift` (or equivalent — the 1Hz heartbeat/task_complete tick logic)
- `vigil-watch/Sources/VigilWatch/Parser.swift` — detection rules
- `~/.config/vigil/watch.toml` — `heartbeat_seconds`, `task_complete_silence_seconds`
- `vigil-g2-plugin/src/screens/companion.ts:42-48` — STATE_LINE map
- `vigil-g2-plugin/src/screens/companion.ts:316-375` — body line computation
- Memory `project_g2_companion_doubletap_hardware_verified` — banner ack flow works on hardware (de-risks Gap 2's persistent-banner mechanism)
- SEED-015 — quiet-mode auto-detect (related ambient-AI gap, different mechanism)
