---
created: 2026-05-19T16:56:14.561Z
title: Evaluate Even Terminal vendor product for live tmux mirror + voice-to-prompt
area: general
files:
  - vigil-linux-hooks/README.md
  - .planning/phases/134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05/134-05-UAT-RESULTS.md (OBS-04)
  - ~/taildrop/terminal-mode.rtf (operator-supplied article)
---

## Problem

During Phase 134 hardware UAT, operator surfaced a broader vision that Phase 134's narrow bridge contract does not cover: **live mirror of the tmux/claude session on the G2 + voice-to-prompt from G2 → tmux send-keys**, with laptop SSH + `tmux a` as the v1 fallback.

Phase 134 delivers ambient status pings (low-bandwidth notifications: "session alive, here's the cwd + redacted last prompt"). It does NOT deliver remote orchestration. These are complementary surfaces, not redundant.

The operator found an Even Realities article (`~/taildrop/terminal-mode.rtf`, published 2026-05-08) describing a first-party vendor product called **Even Terminal / Terminal Mode** that already does much of the bigger vision:
- `npm install -g @evenrealities/even-terminal` on the PC
- Phone app `Terminal Mode → Add Host` flow with QR / token / `defaultProvider=claude`
- Voice instruction from G2 → routed to the PC's coding agent
- Tailscale support hinted (remote-from-laptop fallback)

Article-stated caveats (as of v0.7.7, May 2026):
- "PC-side operations and Codex state do not appear to sync to G2 in real time" — live mirror may be lossy
- "Instructions sent from Even also did not progressively auto-update the terminal screen" — input loop may have UX gaps

Before committing to design + build a Vigil-native live-mirror pipeline (which would duplicate Even Terminal's plumbing), evaluate the vendor product end-to-end and see what's actually missing.

## Solution

**Spike (~15-30 min operator time):**

1. Install Even Terminal on morrillhouse: `npm install -g @evenrealities/even-terminal && even-terminal`
2. In the Even Realities phone app: `Terminal Mode → Add Host` → scan QR (or paste LAN URL + token)
3. Select Claude Code as the default provider
4. Try the voice-to-prompt loop:
   - Start `claude` on morrillhouse in a tmux session
   - From G2, voice-instruct a simple prompt
   - Observe: does the voice arrive correctly? does the prompt get injected?
5. Try the live mirror:
   - Submit a prompt that produces multi-line streaming output
   - Observe: does the G2 show the streaming output? at what fidelity? lag?
6. Try the Tailscale option (if exposed) for remote-from-coffee-shop scenarios

**Output:** A short evaluation note (`/gsd:capture --note "even terminal eval findings: ..."`) capturing:
- What works out of the box
- What's broken or too lossy for v1 use
- Whether the operator would ship with Even Terminal as-is, or wants a Vigil-native alternative
- Specific gaps that might justify a Vigil-native plugin (per OBS-04 in the UAT results)

Based on findings, decide:
- **Even Terminal sufficient → no new vigil work**
- **Even Terminal mostly works, small Vigil integration helpful** → small follow-up phase for OBS-01 G2 plugin polish + maybe a deep-link from Vigil HUD → Terminal Mode (requires Even SDK research at `hub.evenrealities.com/docs`)
- **Even Terminal too limited** → capture specific gaps as a new milestone for a Vigil-native live mirror + voice pipeline

Also worth checking during the spike: does Even's plugin SDK expose a URL scheme or intent for "switch to Terminal Mode session X"? That would enable a low-effort "tap a Vigil HUD card to enter Terminal Mode" integration without rebuilding the vendor's stack.

**Related captured observations from Phase 134 UAT-RESULTS:**
- OBS-01: G2 HUD doesn't render `host` field or `: running` suffix (Phase 124 / G2 plugin polish — separate item)
- OBS-04: this todo
- OBS-05: `vigil-bridge-probe` CLI candidate (separate item)
