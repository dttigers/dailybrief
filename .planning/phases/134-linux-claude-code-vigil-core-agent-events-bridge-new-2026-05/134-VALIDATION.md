---
phase: 134
slug: linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-19
---

# Phase 134 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> Source: derived from `134-RESEARCH.md` § Validation Architecture (five-layer model).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node `node:test` + `assert/strict`, executed via `tsx --test` (matches vigil-core convention; repo is NOT a pnpm workspace and vigil-core uses node:test, not vitest) |
| **Config file** | `vigil-linux-hooks/package.json` `"test"` script (zero-config; node:test needs no separate config file) |
| **Quick run command** | `cd vigil-linux-hooks && npm test` |
| **Full suite command** | `cd vigil-linux-hooks && npm test` (no slow suites — entire surface runs in <2s) |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-linux-hooks && npm test`
- **After every plan wave:** Run `cd vigil-linux-hooks && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green; Layer 4 contract probe executed once; Layer 5 hardware UAT signed off in 134-05-PLAN.md
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 134-01-01 | 01 | 1 | AGENT-LINUX-04 | T-134-A1 | `$VIGIL_API_KEY` unset → hook exits 0 silently (no stderr/stdout) | integration | `tsx --test __tests__/fail-safe.test.ts -t 'missing api key'` | ❌ W0 | ⬜ pending |
| 134-01-02 | 01 | 1 | AGENT-LINUX-04 | T-134-A2 | curl `--max-time 2 --silent --fail` + nohup/disown + `"async":true` → no Claude Code stall | integration | `tsx --test __tests__/fail-safe.test.ts -t 'network failure'` | ❌ W0 | ⬜ pending |
| 134-01-03 | 01 | 1 | AGENT-LINUX-01,02,03 | — | `emit_event` helper builds body with exactly 7 Phase-121 allowed keys (6 required + message) | unit | `tsx --test __tests__/body-builder.test.ts -t 'allowed keys only'` | ❌ W0 | ⬜ pending |
| 134-02-01 | 02 | 2 | AGENT-LINUX-01 | — | SessionStart body has `event:'heartbeat'`, label=basename(cwd), host=`hostname -s` | unit | `tsx --test __tests__/body-builder.test.ts -t 'SessionStart'` | ❌ W0 | ⬜ pending |
| 134-02-02 | 02 | 2 | AGENT-LINUX-02 | — | Stop body has `event:'task_complete'`, message='turn complete' | unit | `tsx --test __tests__/body-builder.test.ts -t 'Stop'` | ❌ W0 | ⬜ pending |
| 134-03-01 | 03 | 2 | AGENT-LINUX-03 | T-134-R1 | Truncate-to-80 then regex-match → entire message becomes `[redacted: contains sensitive pattern]` | unit | `tsx --test __tests__/redaction-corpus.test.ts` | ❌ W0 | ⬜ pending |
| 134-03-02 | 03 | 2 | AGENT-LINUX-03 | T-134-R2 | JWT pattern threshold = `{10,}` (not `{20,}`) so 80-char truncation can't elide JWTs | unit | `tsx --test __tests__/redaction-corpus.test.ts -t 'JWT after truncation'` | ❌ W0 | ⬜ pending |
| 134-04-01 | 04 | 3 | AGENT-LINUX-05 | T-134-I1 | `install.js` is idempotent: re-run does NOT add duplicate hook entry to `~/.claude/settings.json` | integration | `tsx --test __tests__/installer-idempotency.test.ts -t 'idempotent re-run'` | ❌ W0 | ⬜ pending |
| 134-04-02 | 04 | 3 | AGENT-LINUX-05 | T-134-I2 | `install.js --uninstall` round-trips the settings.json fixture to its pre-install state byte-for-byte | integration | `tsx --test __tests__/installer-idempotency.test.ts -t 'uninstall round-trip'` | ❌ W0 | ⬜ pending |
| 134-04-03 | 04 | 3 | AGENT-LINUX-05 | T-134-I3 | Splice preserves the 2 existing GSD SessionStart entries; resulting array has 3 entries, original 2 byte-for-byte unchanged | integration | `tsx --test __tests__/installer-idempotency.test.ts -t 'GSD coexistence'` | ❌ W0 | ⬜ pending |
| 134-04-04 | 04 | 3 | AGENT-LINUX-06 | T-134-R3 | Drift detector greps redaction-patterns.json + vigil-agent-bridge.sh, asserts each pattern appears verbatim in both | unit | `tsx --test __tests__/redaction-drift.test.ts` | ❌ W0 | ⬜ pending |
| 134-05-01 | 05 | 4 | Success Criterion 1 | — | Fresh `claude` session on Linux box (cwd `~/dev/dailybrief`) appears on G2 Companion HUD within 5s of first user prompt, label = `dailybrief: running` | hardware UAT | manual operator test (Linux box → Railway prod → G2 HUD round-trip) | manual-only |
| 134-05-02 | 05 | 4 | Success Criterion 4 | T-134-A2 | iPhone airplane-mode mid-session → Claude Code continues to function normally; no stall, no error popup | hardware UAT | manual operator test | manual-only |
| 134-05-03 | 05 | 4 | Success Criterion 5 | — | `bash vigil-linux-hooks/install.sh --uninstall` removes all three hook entries from real `~/.claude/settings.json`; leaves GSD entries untouched | hardware UAT | manual operator test | manual-only |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-linux-hooks/package.json` — minimal package.json with `"test": "tsx --test __tests__/*.test.ts"` + `tsx` devDependency, `"type": "module"`
- [ ] `vigil-linux-hooks/__tests__/body-builder.test.ts` — stubs for AGENT-LINUX-01, 02 (covers also part of -03 via emit_event tests)
- [ ] `vigil-linux-hooks/__tests__/redaction-corpus.test.ts` — stubs for AGENT-LINUX-03 (synthetic corpus: 15 secret-shaped + 10 clean)
- [ ] `vigil-linux-hooks/__tests__/redaction-drift.test.ts` — stubs for AGENT-LINUX-06 (mirrors Phase 127 `vigil-core/src/__tests__/audio-log-redaction.test.ts` structure)
- [ ] `vigil-linux-hooks/__tests__/fail-safe.test.ts` — stubs for AGENT-LINUX-04 (subprocess spawn + STDIN inject + exit-code/stream assertions)
- [ ] `vigil-linux-hooks/__tests__/installer-idempotency.test.ts` — stubs for AGENT-LINUX-05 (tempdir HOME, fixture settings.json)
- [ ] `vigil-linux-hooks/__tests__/fixtures/settings.json` — fixture mirroring real `~/.claude/settings.json` shape on this box (2 GSD SessionStart entries, 3 PostToolUse matchers, 5 PreToolUse matchers)
- [ ] `tsx` installed as devDependency (node:test is built into node ≥18; tsx wraps TypeScript test files)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Linux session appears on G2 Companion HUD within 5s of first user prompt | Success Criterion 1 | Hardware UAT requires real Linux box → Railway prod → G2 device round-trip; cannot stub | (1) `cd ~/dev/dailybrief && bash vigil-linux-hooks/install.sh`. (2) Verify `VIGIL_API_KEY` set in `~/.config/vigil/env`. (3) Start `claude`, observe `0 active sessions → 1 active session` on G2 HUD with label `dailybrief: running`. |
| Hook is fail-safe under network failure | Success Criterion 4 | Real-world network state required (iPhone airplane-mode toggle) | (1) Start a fresh `claude` session with VIGIL_API_KEY set. (2) Mid-session, toggle iPhone airplane mode ON. (3) Submit several prompts. (4) Confirm Claude Code continues to function normally with no stall, no error in terminal. (5) Toggle airplane mode OFF; confirm session resumes normal HUD updates. |
| Uninstall is clean | Success Criterion 5 | Real `~/.claude/settings.json` state required | (1) `bash vigil-linux-hooks/install.sh --uninstall`. (2) Verify `~/.claude/settings.json` no longer contains `vigil-agent-bridge` entries. (3) Verify all GSD hook entries are preserved byte-for-byte (diff against pre-install snapshot). (4) Verify the three hook files (`vigil-agent-bridge.sh`, `redact.sh`, `redaction-patterns.json`) removed from `~/.claude/hooks/`. |
| Phase 121 contract acceptance | AGENT-LINUX-01,02,03 | Requires real bearer key against staging or prod endpoint | (1) `bash vigil-linux-hooks/vigil-agent-bridge.sh --event=SessionStart < tests/fixtures/probe-envelope.json` with `VIGIL_API_URL=https://api.vigilhub.io` and valid `VIGIL_API_KEY`. (2) Check vigil-core production logs for accepted POST (201 or 200, NOT 400). (3) Repeat for UserPromptSubmit and Stop envelopes. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
