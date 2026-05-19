---
phase: 134-linux-claude-code-vigil-core-agent-events-bridge
plan: 05
type: uat-results
status: passed
operator: Jameson Morrill (jamesonmorrill1@gmail.com)
host: morrillhouse (Linux dev workstation)
tested: 2026-05-19
session_under_test: b5e73cb4-095f-4289-8e22-2ee484b17464
success_criteria:
  1_hud_round_trip: PASS
  4_airplane_fail_safe: PASS
  5_clean_uninstall: PASS
---

# Phase 134 — Plan 05: Operator Hardware UAT Results

**Operator:** Jameson Morrill
**Tested on:** 2026-05-19
**Box:** `morrillhouse` (Linux, `~/dev/dailybrief`)
**Production endpoint:** `https://api.vigilhub.io` (Railway, IP `66.33.22.240`)
**Test plan:** `134-05-PLAN.md`

---

## Pre-UAT (Plan 05 Task 1: code review)

`/gsd:code-review` surfaced 3 Critical / 7 Warning / 4 Info findings. All 3 Criticals resolved in atomic `fix(134-05):` commits BEFORE hardware UAT, per Phase 130 lesson `feedback_code_review_before_hardware_uat`. See [`134-05-CODE-REVIEW.md`](./134-05-CODE-REVIEW.md). Test suite: **50/50 pass** after fixes.

| ID | Commit | Regression test |
|----|--------|-----------------|
| CR-01 — API key argv leak (T-134-A1) | `a605c51` | `fail-safe.test.ts` source-grep guard |
| CR-02 — Unanchored uninstall regex (T-134-I2) | `f5f47d9` | `installer-idempotency.test.ts` decoy-survival guard |
| CR-03 — Mode-bit widening on atomic write (T-134-I1) | `65df339` | `installer-idempotency.test.ts` 0o600 round-trip guard |

7 Warnings + 4 Info: documented and deferred (none block UAT).

---

## Task 2 — Success Criterion 1: HUD round-trip ≤ 5s

**Verdict: PASS** ✅

| Check | Result |
|-------|--------|
| Pre-install snapshot captured | ✅ `/tmp/134-settings-before.json` (2525 bytes, mtime 01:49) |
| Install stdout | ✅ `vigil-agent-bridge installed (3 hook entries). Set VIGIL_API_KEY to enable.` (exact match) |
| `grep -c vigil-agent-bridge ~/.claude/settings.json` | ✅ `3` |
| Pre/post-install diff | ✅ only additions (3 new matcher groups); zero modifications to existing GSD entries |
| Spliced entries have `async:true` + `timeout:5` | ✅ (per `installer-idempotency.test.ts` Task 1 acceptance, confirmed visually in diff) |
| `VIGIL_API_KEY` env source | ✅ `~/.config/vigil/env` (mode `0o600`), sourced from `~/.bashrc` |
| Manual probe via curl | ✅ **HTTP 201**, event row persisted (id=553, userId=1, label=`dailybrief`, host=`morrillhouse`) |
| SSE fan-out | ✅ `agent-event` frames flow through `/v1/agent-stream` in real time (events 556 + 557 observed live) |
| **HUD update latency** | ✅ **near-instant** (≤1s wall-clock, well inside 5s budget) |
| `label` field | ✅ `dailybrief` (basename of cwd) |
| `host` field | ✅ `morrillhouse` (matches `hostname -s`) |
| AGENT-LINUX-03 redaction sanity (`my password is hunter2`) | ✅ HUD body shows redaction literal, NOT raw text |

### Real-world findings during Task 2

**`VIGIL_API_KEY` onboarding is non-obvious.** The operator's first attempt failed because the env var contained a 6-char placeholder (`vk_.??`) instead of a real 67-char key. The hook's fire-and-forget design silently swallowed the resulting 401, which manifested as "HUD never updates." Diagnostic curl probe surfaced `HTTP 401 {"error":"Unrecognized token format"}` (the dot in the placeholder disqualified the token from the `vk_` path AND the JWT path, so it fell through to "Unrecognized"). Resolved by creating `~/.config/vigil/env` template via the orchestrator and the operator sourcing a real `vk_…` key. **This is the IN-04 observability gap the reviewer flagged surfacing in real-world use.**

**HUD rendering quirk (non-blocking, G2 plugin scope).** The Even G2 HUD displays `dailybrief` (the `label` field) but does not visibly render `: running` suffix nor the `host` field. Both fields are correctly present in the SSE payload (verified via `curl /v1/agent-stream`). This is a G2 plugin / Phase 124 rendering gap, **out of Phase 134's scope** — Phase 134's contract is "POST → persist → fan-out", which is met.

### SSE evidence captured

```
event: agent-event
data: {"id":561,"userId":1,"sessionId":"c0d32a96-24b5-44e7-b030-0f5141aef52b","event":"heartbeat","message":"hello","label":"dailybrief","host":"morrillhouse","exitCode":null,"eventTimestamp":"2026-05-19T02:54:09.000Z","receivedAt":"2026-05-19T02:54:09.720Z","clientEventId":"492cf7d3-ad6f-4455-99a0-de80dcef2b4f"}
```

Server-side end-to-end latency: **~720ms** (eventTimestamp → receivedAt). Bridge wall-clock to HUD: **near-instant** per operator observation.

---

## Task 3 — Success Criterion 4: airplane-mode fail-safe

**Verdict: PASS** ✅

Routing: operator's Linux box is on independent LAN/Wi-Fi (not iPhone-tethered). Outage simulated via `/etc/hosts` blackhole: `127.0.0.1 api.vigilhub.io` appended; verified via `getent hosts api.vigilhub.io` → 127.0.0.1.

### Timeline (from `/tmp/vigil-agent-bridge.log`)

Single claude session ID `b5e73cb4-095f-4289-8e22-2ee484b17464` survived DNS sever + restore. Single SessionStart event; claude never restarted across the test.

| Time | Event | Turn cycle | Phase |
|------|-------|------------|-------|
| 16:30:26 | SessionStart | — | outage (claude launched while DNS blackholed) |
| 16:30:38 → 16:30:40 | UserPromptSubmit → Stop | 2s | outage — prompt 1 (`recovery test`) |
| 16:32:40 → 16:32:43 | UserPromptSubmit → Stop | 3s | outage — prompt 2 |
| 16:32:46 → 16:32:48 | UserPromptSubmit → Stop | 2s | outage — prompt 3 |
| 16:32:54 → 16:32:56 | UserPromptSubmit → Stop | 2s | outage — prompt 4 |
| 16:33:01 → 16:33:03 | UserPromptSubmit → Stop | 2s | outage — prompt 5 |
| _(DNS restored via `sed -i`; `getent` confirmed 66.33.22.240)_ | | | |
| 16:35:06 → 16:35:08 | UserPromptSubmit → Stop | 2s | recovery — HUD updated |

### Assertions

| Check | Result |
|-------|--------|
| Prompts submitted during outage | ✅ **5** (≥5 plan minimum) |
| Max turn-cycle latency during outage | ✅ **3s** (no 30s/60s/649s stall) |
| Stderr/garbage in claude terminal during outage | ✅ **zero** — T-134-A1 gate held |
| SSE subscriber received `agent-event` frames during outage | ✅ **zero frames** — outage successfully dropped events (`event: ping` keepalives only) |
| Claude Code stalled / hung / crashed | ✅ **no** — every prompt accepted at normal turn cadence |
| Single SessionStart for entire test | ✅ confirmed (no spurious session restart) |
| Recovery latency after DNS restored | ✅ **≤5s** (operator confirmed HUD picked up `recovery confirmed` prompt) |
| `grep -E 'vk_[a-f0-9]{6}' /tmp/vigil-agent-bridge.log` | ✅ **empty** — no API key bytes leaked to debug log (T-134-A1 gate) |

The fail-safe was so silent that the failure mode is **behaviorally indistinguishable from healthy operation** — claude's turn cadence during outage (2-3s) is identical to its turn cadence post-recovery (2s). Exactly the contract.

---

## Task 4 — Success Criterion 5: clean uninstall + GSD coexistence

**Verdict: PASS** ✅

### Assertions

| Check | Result |
|-------|--------|
| Uninstall stdout | ✅ `vigil-agent-bridge uninstalled.` (exact match) |
| `grep -c vigil-agent-bridge ~/.claude/settings.json` | ✅ `0` |
| `~/.claude/hooks/vigil-agent-bridge.sh` removed | ✅ "No such file or directory" |
| `~/.claude/hooks/redact.sh` removed | ✅ "No such file or directory" |
| `~/.claude/hooks/redaction-patterns.json` removed | ✅ "No such file or directory" |
| Diff `before.json` ↔ `after-uninstall.json` (key-sorted) | ✅ **only D-N2 empty-array additions** (`"Stop": []`, `"UserPromptSubmit": []`) — zero modifications to existing GSD entries |
| GSD chain still wired on fresh `claude` session | ✅ statusline shows `v3.9 Voice & Companion Polish [█████░░░░░] 54% · executing │ dailybrief` — GSD's status engine reading STATE.md and ROADMAP.md on session start, confirms hook chain intact |
| G2 HUD silent for post-uninstall claude session | ✅ inferred from architecture — hooks removed + runtime files removed = no event mechanism exists |

### Diff output (the critical T-134-I2 check)

```
DIFFS FOUND:
--- pre-install
+++ post-uninstall
@@ -92,5 +92,7 @@
         ]
       }
-    ]
+    ],
+    "Stop": [],
+    "UserPromptSubmit": []
   },
   "permissions": {
```

This matches the plan's explicit acceptance language:

> Diff assertion: `diff <(jq -S . /tmp/134-settings-before.json) <(jq -S . ~/.claude/settings.json)` is empty (or **only differs by empty `UserPromptSubmit: []` / `Stop: []` keys per CONTEXT D-N2** — log any extra keys as MEDIUM observation but NOT a failure).

The empty-array residue is the documented D-N2 behavior — install creates these keys; uninstall preserves them as `[]` to leave room for other tools to splice in later. **Zero modifications to GSD entries (SessionStart, PostToolUse, PreToolUse, permissions block all byte-for-byte unchanged).** T-134-I2 contract met.

`jq` was not installed on the operator's box; diff was performed via Python 3's `json` + `difflib` (Ubuntu 24.04 default — no install needed). Logged as a documentation improvement candidate (README should mention `python3` as a `jq` alternative for the operator-side diff command).

---

## Summary

All three operator-driven Success Criteria PASS.

| Criterion | Status | Notes |
|-----------|--------|-------|
| 1 — HUD round-trip ≤5s, label = `dailybrief` | ✅ PASS | Near-instant latency; SSE end-to-end ~720ms |
| 4 — Airplane-mode fail-safe | ✅ PASS | 5 prompts during outage, all 2-3s turn cycles, zero hook stderr, recovery ≤5s |
| 5 — Clean uninstall + GSD coexistence | ✅ PASS | Empty diff (modulo D-N2 empty arrays); GSD chain intact |

### Non-blocking observations for follow-up

| ID | Type | Description | Routing |
|----|------|-------------|---------|
| OBS-01 | Plugin / Phase 124 | G2 HUD doesn't render `host` field or `: running` status suffix from the SSE payload | Out of Phase 134 scope — capture for G2 plugin rework |
| OBS-02 | Doc | README should mention `~/.config/vigil/env` + `chmod 600` pattern for `VIGIL_API_KEY` (real-world onboarding friction surfaced during Task 2) | Trivial README PR |
| OBS-03 | Doc | README should mention `python3` as a `jq` alternative for the operator-side diff command in the uninstall section | Trivial README PR |
| OBS-04 | Vendor / vision | Even Realities ships first-party `@evenrealities/even-terminal` for tmux mirror + voice→prompt (live mirror is the operator's broader vision) — Phase 134 bridge complements rather than replaces it | Capture as separate exploration; not a Phase 134 gap |
| OBS-05 | Observability | IN-04 (curl 401 silently swallowed) caused real onboarding friction. Worth a separate phase: small `vigil-bridge-probe` CLI for the operator to validate `VIGIL_API_KEY` reachability without going through the hook | Capture as candidate phase |

### Operator sign-off

**Phase 134 closed.** All hardware UAT Success Criteria pass; bridge is production-ready. Mini-package is currently uninstalled on `morrillhouse` post-Task-4. Operator may re-install at any time via `bash vigil-linux-hooks/install.sh` to resume ambient HUD pings during normal dev work.

— Jameson Morrill, 2026-05-19
