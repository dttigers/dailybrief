---
phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
verified: 2026-05-19T16:50:00Z
status: passed
score: 13/13 must-haves verified
overrides_applied: 0
requirements_verified:
  - AGENT-LINUX-01: satisfied
  - AGENT-LINUX-02: satisfied
  - AGENT-LINUX-03: satisfied
  - AGENT-LINUX-04: satisfied
  - AGENT-LINUX-05: satisfied
  - AGENT-LINUX-06: satisfied
roadmap_success_criteria:
  1_hud_round_trip: PASS  # operator UAT
  2_one_command_install: PASS  # installer-idempotency.test.ts + UAT
  3_privacy_redaction: PASS  # redaction-corpus.test.ts + UAT sanity probe
  4_failsafe_airplane_mode: PASS  # operator UAT (5 prompts, zero stall)
  5_clean_uninstall: PASS  # operator UAT (empty diff modulo D-N2)
re_verification: null  # initial verification
---

# Phase 134: Linux Claude Code → vigil-core agent-events bridge Verification Report

**Phase Goal:** Build a Linux Claude Code → Vigil Core agent-events bridge that posts SessionStart / UserPromptSubmit / Stop events to /v1/agent-events with auth, redaction, fail-safe, and clean install/uninstall. The bridge must (1) not stall Claude Code under any network failure, (2) never leak the VIGIL_API_KEY, (3) splice into ~/.claude/settings.json without modifying GSD entries, (4) round-trip uninstall byte-for-byte (modulo documented D-N2 empty arrays).

**Verified:** 2026-05-19T16:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | Hook does not stall Claude Code under any network failure (Success Criterion 4) | ✓ VERIFIED | UAT Task 3 PASS: 5 prompts during DNS blackhole, all 2-3s turn cycles, zero stderr noise (134-05-UAT-RESULTS.md line 99-108); behavioral probe confirms unreachable URL exit_code=0 in 80ms wall-time (vs 2s curl timeout) |
| 2  | VIGIL_API_KEY never leaks to /proc/<pid>/cmdline or terminal (T-134-A1) | ✓ VERIFIED | CR-01 fix verified: `vigil-agent-bridge.sh:121` uses `<<<` here-string + `curl --config -`; argv contains zero token bytes. Regression source-grep in `fail-safe.test.ts` (commit a605c51). UAT confirms `grep -E 'vk_[a-f0-9]{6}' /tmp/vigil-agent-bridge.log` returns empty |
| 3  | Hook exits 0 silently when VIGIL_API_KEY unset (AGENT-LINUX-04 fail-safe) | ✓ VERIFIED | Probe: `VIGIL_API_KEY="" bash vigil-agent-bridge.sh --event=SessionStart` produces `exit=0` with zero stdout/stderr bytes (`vigil-agent-bridge.sh:19`) |
| 4  | SessionStart emits heartbeat body with static message (AGENT-LINUX-01) | ✓ VERIFIED | Probe with EMIT_ONLY=1 produces: `{"session_id":"abc-123","event":"heartbeat","timestamp":"...","label":"dailybrief","host":"morrillhouse","client_event_id":"...","message":"session started"}` — exact contract match. `vigil-agent-bridge.sh:128-130` |
| 5  | Stop emits task_complete body (AGENT-LINUX-02) | ✓ VERIFIED | Probe with EMIT_ONLY=1 produces: `{...,"event":"task_complete",...,"message":"turn complete"}` — exact contract match. `vigil-agent-bridge.sh:144-146` |
| 6  | UserPromptSubmit emits heartbeat with redacted/truncated message (AGENT-LINUX-03) | ✓ VERIFIED | Probe with prompt "my password is hunter2" emits `"message":"[redacted: contains sensitive pattern]"`; clean prompt passes through truncated. `vigil-agent-bridge.sh:131-143` + `redact.sh:49-74`. 27/27 redaction-corpus tests PASS |
| 7  | Body contains exactly 7 KNOWN_FIELDS keys (no unknown-field 400 rejection) | ✓ VERIFIED | Probe output keys = `[session_id,event,timestamp,label,host,client_event_id,message]` — all in Phase 121 KNOWN_FIELDS Set (`vigil-core/src/routes/agent-events.ts:34-43`); zero `exit_code` or `cwd` overflow keys. Verified via `body-builder.test.ts` (5/5 PASS) |
| 8  | Privacy redaction strips 6 WATCH-ENRICH-03 patterns (AGENT-LINUX-03) | ✓ VERIFIED | `redaction-patterns.json` contains exactly the 6 patterns (`api[_-]?key`, `bearer`, `password`, `vk_`, `ey[A-Za-z0-9_-]{10,}`, `[A-Za-z0-9+/]{40,}={0,2}`); JWT threshold is `{10,}` per Pitfall 4 (not `{20,}`). `redaction-corpus.test.ts` 27/27 PASS including JWT-at-offset-70 edge case + D-R2 truncate-first ordering |
| 9  | install.sh is one-command, idempotent, splices into existing GSD settings.json (AGENT-LINUX-05) | ✓ VERIFIED | Live tempdir install: 2 GSD SessionStart entries preserved byte-for-byte; 3rd entry added with `async:true`+`timeout:5`. Second install: SessionStart length still 3 (idempotent). UAT Task 2 confirmed on real `~/.claude/settings.json`. `installer-idempotency.test.ts` 9/9 PASS |
| 10 | Uninstall removes only Phase 134 entries; GSD chain byte-for-byte preserved (AGENT-LINUX-05) | ✓ VERIFIED | Live tempdir uninstall: SessionStart back to 2 entries with identical commands (`node gsd-check-update.js` + `bash gsd-session-state.sh`). UAT Task 4 PASS — empty diff modulo documented D-N2 empty arrays. CR-02 anchored COMMAND_REGEX prevents collateral damage to third-party hooks |
| 11 | Drift detector pins redaction patterns across JSON + bash sources (AGENT-LINUX-06) | ✓ VERIFIED | `redaction-drift.test.ts` Rail 0 (anti-trivial 6-pattern + JWT-{10,} threshold), Rail 1 (JSON contents), Rail 2 (`redact.sh` references JSON), Rail 3 (cross-repo soft-skip for Phase 133) — 4/4 PASS |
| 12 | settings.json mode bits preserved across atomic write (T-134-I1 / CR-03) | ✓ VERIFIED | `install.js:83-95` stats original mode and chmod's tmp before rename; defaults to 0o600 on first create. Regression test in `installer-idempotency.test.ts` (commit 65df339) |
| 13 | HUD round-trip ≤5s with label=`dailybrief`, host=`morrillhouse` (Success Criterion 1) | ✓ VERIFIED | UAT Task 2 PASS — operator-observed HUD update was near-instant (≤1s wall-clock); server end-to-end latency ~720ms; SSE evidence captured in 134-05-UAT-RESULTS.md line 67-72 with persisted event_id=561 |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `vigil-linux-hooks/package.json` | ESM mini-package with tsx --test | ✓ VERIFIED | type=module, scripts.test, 3 devDeps |
| `vigil-linux-hooks/tsconfig.json` | ES2022 strict ESM | ✓ VERIFIED | Valid JSON, parses with `node --check` |
| `vigil-linux-hooks/vigil-agent-bridge.sh` | Runtime hook (chmod 755, exit-0 invariant) | ✓ VERIFIED | 158 lines; executable; auth gate at :19; `nohup curl --config -` at :115-122; `disown` at :123; final `exit 0` at :157 |
| `vigil-linux-hooks/redact.sh` | Sourceable redactor with truncate-first | ✓ VERIFIED | 74 lines; `redact_prompt()` function present; `redaction-patterns.json` referenced (Rail 2 pin) |
| `vigil-linux-hooks/redaction-patterns.json` | 6 canonical denylist patterns + max_length=80 | ✓ VERIFIED | Exactly 6 patterns; JWT threshold `{10,}`; max_length=80 |
| `vigil-linux-hooks/install.js` | ESM installer with atomic write + idempotency | ✓ VERIFIED | 173 lines; `renameSync` + `chmodSync` for mode preservation; anchored `COMMAND_REGEX`; async:true + timeout:5 in spliced entries |
| `vigil-linux-hooks/install.sh` | 3-line bash wrapper | ✓ VERIFIED | Exactly shebang + `set -euo pipefail` + `exec node ...` |
| `vigil-linux-hooks/README.md` | Operator install guide | ✓ VERIFIED | 134 lines; documents all 5 env vars, install, uninstall, airplane-mode, Phase 133 note |
| `vigil-linux-hooks/__tests__/body-builder.test.ts` | KNOWN_FIELDS body shape tests | ✓ VERIFIED | 5 it-blocks, all PASS |
| `vigil-linux-hooks/__tests__/fail-safe.test.ts` | Exit-0/zero-stderr fail-safe tests | ✓ VERIFIED | 6 it-blocks including CR-01 source-grep, all PASS |
| `vigil-linux-hooks/__tests__/redaction-corpus.test.ts` | Table-driven redaction corpus | ✓ VERIFIED | 27 it-blocks (15 redact + 10 clean + Pitfall-4 + D-R2), all PASS |
| `vigil-linux-hooks/__tests__/redaction-drift.test.ts` | 4-rail drift detector | ✓ VERIFIED | Rails 0/1/2 hard + Rail 3 soft-skip (Phase 133), all PASS |
| `vigil-linux-hooks/__tests__/installer-idempotency.test.ts` | Tempdir integration test | ✓ VERIFIED | 9 it-blocks (6 base + CR-02 decoy + CR-03 mode-preserve regression), all PASS |
| `vigil-linux-hooks/__tests__/fixtures/probe-envelope.json` | STDIN envelope fixture | ✓ VERIFIED | Three event slices with session_id, cwd, prompt fields |
| `vigil-linux-hooks/__tests__/fixtures/settings.json` | GSD-shape seed fixture | ✓ VERIFIED | 2 SessionStart + 3 PostToolUse + 4 PreToolUse entries; no Phase 134 keys (installer must create them) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `vigil-agent-bridge.sh` body builder | `vigil-core/src/routes/agent-events.ts` KNOWN_FIELDS | JSON body with exactly 7 allowed keys | ✓ WIRED | Verified via EMIT_ONLY probe — keys = `[session_id, event, timestamp, label, host, client_event_id, message]`, zero unknown fields |
| `vigil-agent-bridge.sh` emit_event | `$VIGIL_API_URL/v1/agent-events` | `nohup curl ... </dev/null >/dev/null 2>&1 & disown` | ✓ WIRED | `vigil-agent-bridge.sh:115-123` exact pattern present; UAT Task 2 confirmed HTTP 201 against Railway production endpoint |
| `vigil-agent-bridge.sh` SessionStart case | `emit_event "heartbeat" "session started"` | bash case dispatch | ✓ WIRED | Line :129 exact match |
| `vigil-agent-bridge.sh` Stop case | `emit_event "task_complete" "turn complete"` | bash case dispatch | ✓ WIRED | Line :145 exact match |
| `vigil-agent-bridge.sh` UserPromptSubmit case | `redact_prompt` + `emit_event "heartbeat"` | `REDACTED=$(redact_prompt "$PROMPT"); emit_event "heartbeat" "$REDACTED"` | ✓ WIRED | Lines :131-143 — source redact.sh at :25, dispatch redacts then emits |
| `redact.sh` | `redaction-patterns.json` | `node -e fs.readFileSync(_VIGIL_PATTERNS_FILE)` | ✓ WIRED | `redact.sh:26` resolves path; `load_patterns()` at :36-44 reads via process.env.PFILE handoff |
| `install.js` | `~/.claude/settings.json` | `fs.writeFileSync(tmp) + fs.renameSync(tmp, real)` | ✓ WIRED | `install.js:84-95` atomic write helper with mode preservation (CR-03); validated by live tempdir install |
| `install.js` spliced entry | Claude Code async hook behavior | `async:true` + `timeout:5` per entry | ✓ WIRED | `install.js:151-152` — both fields non-negotiable per RESEARCH Pitfall 1; verified in tempdir install output |
| `redaction-drift.test.ts` Rail 1 | `redaction-patterns.json` | `fs.readFileSync` + JSON.parse + required[] membership | ✓ WIRED | All 6 patterns asserted including JWT-{10,} threshold |
| `redaction-drift.test.ts` Rail 2 | `redact.sh` | `fs.readFileSync` + regex match for `redaction-patterns.json` literal | ✓ WIRED | `redact.sh:5` comment + `redact.sh:26` path constant both reference the JSON |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `vigil-agent-bridge.sh` STDIN envelope | `$INPUT` | `cat` from stdin (Claude Code hook protocol) | Yes — verified in UAT against real Claude Code session (event_id=561 on Railway) | ✓ FLOWING |
| `emit_event` body | `$SESSION_ID`, `$CWD`, `$PROMPT`, `$ts`, `$uuid`, `$label`, `$host` | STDIN JSON + `date -Iseconds` + `uuidgen` + `basename "$CWD"` + `hostname -s` | Yes — UAT-observed body contained real session_id, dailybrief label, morrillhouse host | ✓ FLOWING |
| `redact_prompt` output | `$truncated`, `$patterns` | `${input:0:80}` slice + `load_patterns()` from JSON | Yes — UAT sanity probe confirmed "my password is hunter2" → redaction literal | ✓ FLOWING |
| `install.js` splice | `settings.hooks.<Event>` arrays | Read from real `~/.claude/settings.json` + array spread | Yes — UAT confirmed real splice into existing GSD entries on operator's box | ✓ FLOWING |
| `redaction-drift.test.ts` Rail 0/1/2 | `required[]` array of 6 patterns | Hardcoded in test + read from `redaction-patterns.json` | Yes — drift test would fail if JSON were tampered | ✓ FLOWING |

### Behavioral Spot-Checks

All commands run from `vigil-linux-hooks/` working directory. All probes succeed in <100ms.

| # | Behavior | Command | Result | Status |
| - | -------- | ------- | ------ | ------ |
| 1 | Missing VIGIL_API_KEY → silent exit 0 | `VIGIL_API_KEY="" bash vigil-agent-bridge.sh --event=SessionStart < __tests__/fixtures/probe-envelope.json 2>&1; echo "exit=$?"` | `exit=0` (no other bytes) | ✓ PASS |
| 2 | Unreachable URL exits 0 within 3s | `VIGIL_API_KEY=vk_test VIGIL_API_URL=http://127.0.0.1:1 bash vigil-agent-bridge.sh --event=SessionStart` | `exit=0`, elapsed_ms=80 (well under 3000) | ✓ PASS |
| 3 | SessionStart emits heartbeat with "session started" | `VIGIL_API_KEY=vk_test VIGIL_AGENT_BRIDGE_EMIT_ONLY=1 bash vigil-agent-bridge.sh --event=SessionStart <<< '{"session_id":"abc-123","cwd":"/home/morrillboss/dev/dailybrief"}'` | Body: `{"session_id":"abc-123","event":"heartbeat","timestamp":"...","label":"dailybrief","host":"morrillhouse","client_event_id":"...","message":"session started"}` | ✓ PASS |
| 4 | Stop emits task_complete with "turn complete" | same as above, `--event=Stop` | Body has `"event":"task_complete","message":"turn complete"` | ✓ PASS |
| 5 | UserPromptSubmit redacts sensitive prompt | same as above, `--event=UserPromptSubmit` with prompt `my password is hunter2` | Body has `"message":"[redacted: contains sensitive pattern]"` | ✓ PASS |
| 6 | UserPromptSubmit passes clean prompt | same as above with prompt `help me refactor this function` | Body has `"message":"help me refactor this function"` | ✓ PASS |
| 7 | Body contains only KNOWN_FIELDS keys | EMIT_ONLY body JSON.parse → all keys ∈ Phase 121 KNOWN_FIELDS Set | All 7 keys verified members; zero overflow | ✓ PASS |
| 8 | Install + idempotent re-install + uninstall | Tempdir HOME + fixture seed + 2× install + uninstall sequence | SessionStart goes 2→3→3→2; GSD entries byte-for-byte preserved; hook files copied then removed | ✓ PASS |
| 9 | npm test passes 50/50 | `npm test` | 50 tests, 5 suites, 0 fail, 0 cancelled (1033ms) | ✓ PASS |
| 10 | No echo/printf to terminal in hook source (T-134-A1 gate) | grep on `vigil-agent-bridge.sh` for unconditional echo/printf | Zero unconditional terminal-bound output; printf calls are EMIT_ONLY-gated, piped to node-e, or redirected to `/tmp/vigil-agent-bridge.log` | ✓ PASS |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes are declared by this phase. Verification is via:

| Probe Equivalent | Command | Result | Status |
| ---------------- | ------- | ------ | ------ |
| `npm test` (full mini-package suite) | `npm test` | 50/50 PASS in 1033ms | ✓ PASS |
| Behavioral probes 1-10 (Step 7b) | (see table above) | All 10 PASS | ✓ PASS |
| Operator hardware UAT (Plan 05 Tasks 2-4) | Live Linux box + Railway prod + iPhone airplane mode | Recorded in 134-05-UAT-RESULTS.md — all 3 Success Criteria PASS | ✓ PASS |

### Requirements Coverage

All 6 AGENT-LINUX requirement IDs declared across plans 01-04 (Plan 05 declares no requirements as it's the UAT plan). REQUIREMENTS.md confirms all 6 marked `[x]` complete (lines 115-120).

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AGENT-LINUX-01 | 134-02-PLAN | SessionStart hook POSTs heartbeat to /v1/agent-events | ✓ SATISFIED | `vigil-agent-bridge.sh:128-130`; body-builder.test.ts SessionStart probe; UAT Task 2 PASS (event_id=553 persisted with label=dailybrief, host=morrillhouse) |
| AGENT-LINUX-02 | 134-02-PLAN | Stop hook POSTs task_complete | ✓ SATISFIED | `vigil-agent-bridge.sh:144-146`; body-builder.test.ts Stop probe; UAT Task 2 PASS |
| AGENT-LINUX-03 | 134-03-PLAN | UserPromptSubmit POSTs heartbeat with redacted ≤80 char message; 6-pattern denylist | ✓ SATISFIED | `vigil-agent-bridge.sh:131-143` + `redact.sh:49-74`; `redaction-corpus.test.ts` 27/27; UAT sanity probe ("my password is hunter2" → redaction literal on HUD) |
| AGENT-LINUX-04 | 134-01-PLAN | Bearer auth via VIGIL_API_KEY, silent exit 0 on failure | ✓ SATISFIED | `vigil-agent-bridge.sh:19` (auth gate) + `:115-123` (curl with --max-time 2 + nohup + disown); `fail-safe.test.ts` 6/6 PASS; UAT Task 3 PASS (5 prompts during DNS blackhole, zero stall, zero stderr) |
| AGENT-LINUX-05 | 134-04-PLAN | One-command install, idempotent, --uninstall support, GSD coexistence | ✓ SATISFIED | `install.js:128-172` + `install.sh:1-3`; `installer-idempotency.test.ts` 9/9 PASS; UAT Task 4 PASS (empty diff modulo D-N2; GSD chain intact post-uninstall) |
| AGENT-LINUX-06 | 134-04-PLAN | Drift detector grep-pins denylist to WATCH-ENRICH-03; CI fails on divergence | ✓ SATISFIED | `redaction-drift.test.ts` Rails 0/1/2 hard + Rail 3 soft-skip; commit 068e663 |

**Coverage:** 6/6 SATISFIED. Zero orphaned or unaddressed requirements.

Note: REQUIREMENTS.md Traceability table (lines 174-243) does not contain explicit rows for AGENT-LINUX-01..06 (it skips from AGENT-LINUX to HUD-CLARITY-01). This is a documentation housekeeping gap, not a verification gap — all 6 IDs are marked `[x]` complete in the primary spec section (lines 115-120) and ROADMAP.md line 634 confirms they map to Phase 134.

### Anti-Patterns Found

Scanned all 13 modified files (`vigil-agent-bridge.sh`, `redact.sh`, `redaction-patterns.json`, `install.js`, `install.sh`, `package.json`, `tsconfig.json`, `README.md`, 5 test files, 2 fixtures).

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |

Zero debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) found across all modified files.

`return null` / `return []` / `=> {}` patterns: none found in production code (only in `try{}catch{}` blocks for graceful degradation per fail-safe contract, which is intentional and verified by tests).

Console.log-only implementations: none.

Hardcoded empty data props at call sites: none.

The earlier Code Review surfaced 3 Critical findings (CR-01, CR-02, CR-03) — all are resolved with atomic `fix(134-05):` commits (a605c51, f5f47d9, 65df339) and each has a dedicated regression test. 7 Warnings + 4 Info findings documented in `134-05-CODE-REVIEW.md` and explicitly deferred as non-blocking (verified — none touch the must-haves of the phase goal).

### Code-Review Critical Resolution Verification

| Finding | Commit | Fix in Source | Regression Test | Status |
| ------- | ------ | ------------- | --------------- | ------ |
| CR-01 — API key argv leak (T-134-A1) | a605c51 | `vigil-agent-bridge.sh:115-122` uses `curl --config -` with `<<<` here-string; `--header "Authorization: ..."` no longer appears with `$VIGIL_API_KEY` interpolation | `fail-safe.test.ts:3` references CR-01 source-grep guard | ✓ VERIFIED |
| CR-02 — Unanchored uninstall regex (T-134-I2) | f5f47d9 | `install.js:52-53` has anchored `/^bash\s+\S+\/vigil-agent-bridge\.sh\s+--event=(SessionStart\|UserPromptSubmit\|Stop)\s*$/` | `installer-idempotency.test.ts:5` references CR-02 decoy regression | ✓ VERIFIED |
| CR-03 — Mode-bit widening on atomic write (T-134-I1) | 65df339 | `install.js:83-95` `atomicWriteSettings()` stats + chmod's tmp before rename; 0o600 default on first create | `installer-idempotency.test.ts:5` references CR-03 mode-preserve regression | ✓ VERIFIED |

### Phase 130 Memory Lesson Honored

`feedback_code_review_before_hardware_uat.md` — Phase 134-05 Task 1 (gsd-code-review) executed BEFORE Tasks 2-4 (hardware UAT). All 3 Critical findings resolved with atomic commits + regression tests BEFORE the operator burned hardware-UAT cycles. UAT subsequently passed all 3 Success Criteria on the first hardware run.

### Human Verification Required

None. All operator-driven verification items (Success Criteria 1, 4, 5) were already executed in Plan 05 Tasks 2-4 by the operator (Jameson Morrill) on the real Linux dev workstation (`morrillhouse`) on 2026-05-19, with results recorded in `134-05-UAT-RESULTS.md` — all PASS.

Five non-blocking observations (OBS-01..OBS-05) were captured during UAT and explicitly routed to future phases:

| ID | Description | Routing |
| -- | ----------- | ------- |
| OBS-01 | G2 HUD doesn't render `host` field or `:running` suffix | Phase 124 / G2 plugin rework — out of Phase 134 scope (event reaches HUD with correct payload; rendering is downstream) |
| OBS-02 | README should mention `~/.config/vigil/env` pattern | Trivial doc PR — non-blocking |
| OBS-03 | README should mention `python3` as `jq` alternative | Trivial doc PR — non-blocking |
| OBS-04 | Even Realities `@evenrealities/even-terminal` vendor exploration | Separate exploration — not a Phase 134 gap |
| OBS-05 | `vigil-bridge-probe` CLI for API-key validation | Candidate follow-up phase — operator silently absorbed 401 onboarding friction |

These are documented decisions to defer, not gaps. The phase goal is achieved without them.

### Gaps Summary

No gaps found. All 13 must-haves verified. All 5 ROADMAP Success Criteria PASS (3 via operator UAT, 2 via automated test + behavioral probe). All 6 AGENT-LINUX requirements satisfied with traceable evidence. All 3 Critical Code Review findings resolved with atomic commits + dedicated regression tests. Test suite 50/50 passing in ~1s. Operator-signed UAT closure dated 2026-05-19.

The phase delivers a Linux Claude Code → Vigil Core agent-events bridge that meets every part of the stated goal:

1. **Does not stall Claude Code under any network failure** — verified via UAT Task 3 (5 prompts during DNS blackhole, zero hook stall, 2-3s turn cadence indistinguishable from healthy operation) and automated `fail-safe.test.ts` (unreachable URL exits in <100ms vs 2s curl timeout cap).
2. **Never leaks VIGIL_API_KEY** — CR-01 fix moves Authorization off curl argv via `--config -` + here-string; regression source-grep prevents reintroduction. UAT-confirmed `grep vk_[a-f0-9]{6} /tmp/vigil-agent-bridge.log` returns empty.
3. **Splices into ~/.claude/settings.json without modifying GSD entries** — `installer-idempotency.test.ts` byte-for-byte preservation assertions + anchored CR-02 COMMAND_REGEX + live tempdir probe + UAT Task 2 confirmed on real box.
4. **Round-trips uninstall byte-for-byte (modulo documented D-N2 empty arrays)** — UAT Task 4 diff showed only the documented D-N2 empty `Stop: []` / `UserPromptSubmit: []` keys, zero modifications to GSD entries. Fresh post-uninstall claude session still loaded GSD's STATE.md/ROADMAP.md via the intact hook chain.

---

_Verified: 2026-05-19T16:50:00Z_
_Verifier: Claude (gsd-verifier)_
