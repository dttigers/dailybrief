---
phase: 134-linux-claude-code-vigil-core-agent-events-bridge
plan: 05
status: complete
type: execute
wave: 5
autonomous: false
operator: Jameson Morrill (jamesonmorrill1@gmail.com)
completed: 2026-05-19
requirements_completed: []
tasks_completed:
  - 1 — code review + 3 HIGH fixes
  - 2 — install + Success Criterion 1 (HUD round-trip ≤5s)
  - 3 — Success Criterion 4 (airplane-mode fail-safe)
  - 4 — Success Criterion 5 (clean uninstall + GSD coexistence)
artifacts:
  - 134-05-CODE-REVIEW.md
  - 134-05-UAT-RESULTS.md
key_files:
  modified:
    - vigil-linux-hooks/vigil-agent-bridge.sh — CR-01 fix: Authorization header off argv via curl --config -
    - vigil-linux-hooks/install.js — CR-02 fix: anchored uninstall regex; CR-03 fix: preserve mode bits on atomic write
    - vigil-linux-hooks/__tests__/fail-safe.test.ts — CR-01 regression source-grep guard
    - vigil-linux-hooks/__tests__/installer-idempotency.test.ts — CR-02 decoy + CR-03 mode-preserve regression guards
recommendation: phase_closed
---

# Plan 134-05: Operator Hardware UAT + Code-Review Gate

**Status:** complete
**Operator:** Jameson Morrill
**Completion date:** 2026-05-19

## What this plan delivered

Plan 134-05 is non-autonomous by contract — three of the four tasks pause for operator hardware testing on the real Linux dev workstation (`morrillhouse`) against the Railway production endpoint. The fourth task is the pre-UAT `/gsd:code-review` gate enforcing the Phase 130 lesson: reviewer-found HIGH severity issues are resolved BEFORE the operator burns hardware-UAT cycles.

## Outcomes

### Task 1 — Code review

Standard-depth review of 13 Phase 134 source files surfaced 3 Critical / 7 Warning / 4 Info findings. All 3 Criticals resolved in atomic commits BEFORE hardware UAT began:

- `a605c51` — **CR-01** (T-134-A1): Move `VIGIL_API_KEY` off curl argv. Was leaking to `/proc/<pid>/cmdline` for every local user on every prompt. Replaced `curl --header` with `curl --config -` reading from a here-string on stdin. Regression test source-greps for the argv pattern.
- `f5f47d9` — **CR-02** (T-134-I2): Anchor uninstall `COMMAND_REGEX`. Previous regex was unanchored and would have deleted any third-party hook whose command merely contained the substring `vigil-agent-bridge.sh` + `--event=`. New regex pins to `^bash <abspath>/vigil-agent-bridge.sh --event=(SessionStart|UserPromptSubmit|Stop)$`. Decoy regression test asserts wrapper hooks survive uninstall.
- `65df339` — **CR-03** (T-134-I1): Preserve `settings.json` mode bits on atomic write. Was silently widening operator-hardened 0o600 → 0o644 on every install/uninstall round-trip. `atomicWriteSettings()` now stats the original and chmods the tmp file before rename; defaults to 0o600 on first-time create. Regression test pre-chmods to 0o600 and asserts survival.

Test suite: **50/50 pass** after fixes (was 47 in Plan 04; +3 regression tests).

7 Warnings + 4 Info findings documented in `134-05-CODE-REVIEW.md` and deferred (none block hardware UAT).

### Task 2 — Success Criterion 1: HUD round-trip ≤5s

**PASS.** Install spliced 3 hook entries cleanly (zero GSD modifications). Manual probe via `curl /v1/agent-events` returned HTTP 201 with persisted event row. SSE fan-out via `curl /v1/agent-stream` delivered `agent-event` frames in real time (~720ms server-side). G2 HUD updated **near-instant** (≤1s wall-clock, well inside 5s budget). `label` field shows `dailybrief`, `host` field shows `morrillhouse`. AGENT-LINUX-03 redaction sanity check passed (`my password is hunter2` rendered as the redaction literal on the HUD).

One real-world finding surfaced during onboarding: the operator's first `VIGIL_API_KEY` attempt was a placeholder, and the hook's fire-and-forget design silently swallowed the resulting 401. Documented as observation OBS-05 (candidate phase for a small `vigil-bridge-probe` CLI). The IN-04 observability gap the reviewer flagged manifested in real-world use.

### Task 3 — Success Criterion 4: airplane-mode fail-safe

**PASS.** Outage simulated via `/etc/hosts` blackhole (operator's box is on independent LAN, not iPhone-tethered). Single claude session ID `b5e73cb4-095f-4289-8e22-2ee484b17464` survived DNS sever + restore — no session restart, no stall, no crash. **5 prompts** submitted during outage; all turn cycles 2-3 seconds; **zero stderr noise** in the claude terminal; **zero `agent-event` frames** on the SSE subscriber during outage (events successfully dropped silently per fire-and-forget contract). Recovery after DNS restored: HUD picked up the recovery prompt within ≤5s. `grep -E 'vk_[a-f0-9]{6}' /tmp/vigil-agent-bridge.log` returned empty — no API key bytes leaked to the debug log (T-134-A1 gate held).

The fail-safe was so silent that the outage's turn cadence (2-3s) is behaviorally indistinguishable from healthy operation (2s). Exactly the contract.

### Task 4 — Success Criterion 5: clean uninstall + GSD coexistence

**PASS.** Uninstall stdout exact match (`vigil-agent-bridge uninstalled.`); `grep -c vigil-agent-bridge ~/.claude/settings.json` returned `0`; all 3 runtime files removed from `~/.claude/hooks/`. Python3-based diff (since `jq` was not installed on the operator's box) showed **only the documented D-N2 empty-array additions** (`"Stop": []`, `"UserPromptSubmit": []`) — zero modifications to existing GSD entries (`SessionStart` array byte-for-byte same, `PostToolUse` + `PreToolUse` + `permissions` block all untouched). Fresh post-uninstall claude session's statusline showed `v3.9 Voice & Companion Polish [█████░░░░░] 54% · executing │ dailybrief` — direct evidence the GSD chain is intact and reading STATE.md/ROADMAP.md on session start.

## Non-blocking observations captured

| ID | Type | Routing |
|----|------|---------|
| OBS-01 | G2 plugin doesn't render `host` field or `: running` suffix | Out of Phase 134 scope; future G2 plugin work |
| OBS-02 | README should document `~/.config/vigil/env` pattern for VIGIL_API_KEY | Trivial doc PR |
| OBS-03 | README should mention `python3` as `jq` alternative | Trivial doc PR |
| OBS-04 | Even Realities ships first-party `@evenrealities/even-terminal` for tmux mirror + voice→prompt | Capture as separate exploration; complements (not replaces) Phase 134 |
| OBS-05 | Small `vigil-bridge-probe` CLI for operator API-key validation | Candidate follow-up phase |

## Recommendation

**Phase 134 is closed.** All hardware Success Criteria PASS. Mini-package is production-ready and currently uninstalled on `morrillhouse` (operator may re-install at any time via `bash vigil-linux-hooks/install.sh` to resume ambient HUD pings).

Proceed to phase-level verification and ROADMAP/STATE close-out.
