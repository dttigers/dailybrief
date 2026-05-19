---
created: 2026-05-19T16:58:00.000Z
title: G2 HUD should render `host` field and `: running` status suffix from agent-event payload
area: ui
files:
  - .planning/phases/134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05/134-05-UAT-RESULTS.md (OBS-01)
  - .planning/phases/130*/  # G2 plugin code from prior phase (path TBD)
---

## Problem

During Phase 134 hardware UAT, the bridge correctly sends both `label: "dailybrief"` and `host: "morrillhouse"` in every `agent-event` SSE payload (verified by subscribing to `/v1/agent-stream` and observing the JSON body directly). The G2 HUD renders only `dailybrief` — the `host` field never appears, and the `: running` status suffix the Phase 134 plan anticipated ("session label `dailybrief: running`") is missing.

This is a G2 plugin rendering gap, NOT a Phase 134 bridge bug. The data is present in the payload at the correct field names; the plugin's view template simply doesn't surface them.

**Concrete evidence (from UAT-RESULTS):**
```
event: agent-event
data: {"id":561,"userId":1,"sessionId":"c0d32a96-24b5-44e7-b030-0f5141aef52b","event":"heartbeat","message":"hello","label":"dailybrief","host":"morrillhouse",...}
```

**Why this matters:** When the operator runs multiple Claude Code sessions across hosts (Mac for vigil-core dev, Linux dev workstation for dailybrief work), the host field is the primary disambiguator in the HUD. Without it, two simultaneous `dailybrief`-cwd sessions on different boxes would render identically on the G2.

## Solution

**Scope:** Update the G2 plugin's agent-event view template (likely in the Phase 130 G2 plugin work — find with `grep -rln "agent-event\|label\|host" g2-plugin/` or similar) to render:
1. The `host` field somewhere visible (e.g., below the label, or in parentheses: `dailybrief (morrillhouse)`)
2. A status suffix derived from the `event` field: `running` for `heartbeat`, `done` for `task_complete`, etc. — formatted as `<label>: <status>` per Phase 134's plan expectation

**Likely file locations:** Find the G2 plugin source files that render `agent-event` SSE frames. Check phases 124, 125, 130 for the rendering pipeline.

**Acceptance:**
- When a `heartbeat` event arrives with `label=foo, host=bar`, the HUD shows both fields
- When a `task_complete` event arrives, the status portion updates (e.g., `: running` → `: done` momentarily, or the card transitions)
- No regression in pre-existing HUD rendering for events that lack `host` (older Mac vigil-watch events may not populate it)

**This is small (likely a single render template change + a snapshot test). Could roll into the next G2 plugin phase rather than standing as its own.**
