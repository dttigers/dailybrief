---
phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
plan: 04
subsystem: agent-events-bridge
tags: [installer, idempotency, atomic-write, drift-detector, claude-code-settings, node-esm, bash-wrapper, agent-linux-05, agent-linux-06, async-hook, gsd-coexistence]

# Dependency graph
requires:
  - phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
    plan: 01
    provides: "vigil-agent-bridge.sh body builder + auth gate + fail-safe (must be copied into ~/.claude/hooks/ by installer)"
  - phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
    plan: 02
    provides: "SessionStart → heartbeat / 'session started' + Stop → task_complete / 'turn complete' wirings (now installable via install.js)"
  - phase: 134-linux-claude-code-vigil-core-agent-events-bridge-new-2026-05
    plan: 03
    provides: "redact.sh + redaction-patterns.json (drift detector pins these at install time; install.js copies all three files)"
provides:
  - "install.js (Node ESM, ~140 lines): idempotent splice into ~/.claude/settings.json with async:true + timeout:5 per entry (Claude Code v2.1.87 stdio-stall mitigation); atomic tmpfile+rename write; --uninstall round-trip; refuse-to-clobber on parse failure"
  - "install.sh: 3-line bash wrapper that execs install.js with forwarded args"
  - "redaction-drift.test.ts: AGENT-LINUX-06 drift detector with 4 rails — anti-trivial-pass guard pinning JWT threshold {10,}, JSON contents, redact.sh references JSON, cross-repo soft-skip until Phase 133 lands"
  - "installer-idempotency.test.ts: 6-block integration test against tempdir fake $HOME using fixture seed; verifies byte-for-byte GSD preservation, idempotency, uninstall round-trip, async:true/timeout:5 splice, file copy with executable perms, UserPromptSubmit/Stop array creation"
  - "fixtures/settings.json: operator-agnostic seed mirroring real Linux box shape (2 GSD SessionStart + 3 PostToolUse + 4 PreToolUse; UserPromptSubmit/Stop absent)"
  - "README.md: operator-facing install + 5 env vars + airplane-mode troubleshooting + uninstall + Phase 133 cross-repo note"
affects: [134-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic settings.json write via fs.writeFileSync(tmp) + fs.renameSync(tmp, real) — POSIX rename(2) is atomic on same FS (Pitfall 2 mitigation)"
    - "Refuse-to-clobber on parse failure: exit 1 to stderr BEFORE any write attempt (Pitfall 2 mitigation for the malformed-file cascade)"
    - "Idempotency via COMMAND_REGEX (/vigil-agent-bridge\\.sh.*--event=/) — install scans for existing entries before splicing; uninstall filters by the same regex"
    - "Async hook fire-and-forget: async:true + timeout:5 in every spliced settings.json entry (Claude Code v2.1.87+ stdio inheritance bug — anthropics/claude-code#43123)"
    - "Cross-repo soft-skip drift detector: console.warn + early return when cross-repo source file is absent — keeps CI green during phase-spread shipping (Phase 127 pattern)"

key-files:
  created:
    - "vigil-linux-hooks/install.js (Node ESM installer — 145 lines)"
    - "vigil-linux-hooks/install.sh (3-line bash wrapper)"
    - "vigil-linux-hooks/README.md (operator-facing install + troubleshooting — 116 lines)"
    - "vigil-linux-hooks/__tests__/installer-idempotency.test.ts (6-block integration test — 245 lines)"
    - "vigil-linux-hooks/__tests__/redaction-drift.test.ts (4-rail drift detector — 110 lines)"
    - "vigil-linux-hooks/__tests__/fixtures/settings.json (operator-agnostic seed fixture)"
  modified: []

key-decisions:
  - "Acceptance criterion line 311 (`grep -c '{20,}' === 0`) is internally contradictory with action sub-step C line 263 (which mandates `required.includes('ey[A-Za-z0-9_-]{20,}') === false` — meaning the forbidden literal MUST appear in source to power the anti-regression guard). Resolved per Rule 1 (bug in plan spec): the action body is authoritative; the {20,} literal appears EXACTLY ONCE in redaction-drift.test.ts as the negative-membership assertion. The criterion checks the threshold did not regress to {20,} in the JSON — the test enforces this via assertion, not via the test file being free of the literal. Logged as a deviation for the plan template to fix."
  - "Uninstall retains hooks.UserPromptSubmit and hooks.Stop as empty arrays (CONTEXT D-N2) — the installer CREATED these keys, but removing them on uninstall would unnecessarily mutate the file. Empty arrays are a no-op for Claude Code and leave the door open for other tools to splice in later."
  - "Each spliced entry has async:true AND timeout:5 (both fields, not just one). RESEARCH Pitfall 1 documents v2.1.87 stdio-stall as belt-and-suspenders mitigation: settings.json side (async:true) + script side (nohup + </dev/null >/dev/null 2>&1 & disown, already in Plan 01). timeout:5 is a defensive cap — UserPromptSubmit's default is 30s; ours should never exceed 5s."
  - "Atomic write uses fs.writeFileSync(tmp) + fs.renameSync(tmp, real) NOT fs.promises.rename — keeping the installer purely synchronous matches the GSD precedent (gsd-check-update.js is sync) and avoids any race with Claude Code's settings.json reader at install-time. The install.js process exits before the parent shell returns."
  - "Drift detector Rail 0 references `ey[A-Za-z0-9_-]{20,}` literal in an EXPLICIT negative-membership assertion. This is load-bearing — if the JWT threshold ever regresses to {20,}, the boolean assertion is structured to fail loudly. The plan's acceptance criterion misread this as 'no occurrences of {20,}' when the action's intent requires the literal to appear ONCE in a negation. Documented as a plan-template fix-up."
  - "Rail 3's cross-repo soft-skip uses console.warn (not test.skip) — matches the Phase 127 drift detector pattern. console.warn is visible in the node:test output but does not affect pass/fail; when Phase 133 ships, its plan flips the early-return to a real assertion path."

patterns-established:
  - "Pattern 134-G: idempotent settings.json splice. JSON.parse → array.some() guard via command regex → push matcher group → atomic write. Re-running is a no-op; partial-installs roll back via --uninstall's filter."
  - "Pattern 134-H: install.sh as 3-line node-wrapper. Lets operators run `bash install.sh` (per REQUIREMENTS) while keeping all logic in install.js — single source of truth, dual entry point. The set -euo pipefail is appropriate here (no [[ =~ ]] regex, unlike the runtime hook)."
  - "Pattern 134-I: anti-trivial-pass drift-detector guard. Rail 0 explicitly references the FORBIDDEN literal in a negative assertion (`required.includes('ey[A-Za-z0-9_-]{20,}') === false`). Catches commits that downgrade a security-critical regex threshold to a weaker form."

requirements-completed:
  - AGENT-LINUX-05
  - AGENT-LINUX-06

# Metrics
duration: ~15min
completed: 2026-05-19
---

# Phase 134 Plan 04: Installer + Drift Detector Summary

**Landed the one-command portable installer (install.js + install.sh), the operator-facing README, the AGENT-LINUX-06 source-grep drift detector, and the AGENT-LINUX-05 integration test. All 47 tests in the vigil-linux-hooks mini-package pass in ~1.0 s. Phase 134's deliverables (Plans 02/03/04) are CODE-COMPLETE — Plan 05 hardware UAT is the last gate.**

## Performance

- **Duration:** ~15 min (Task 1 mostly fixture + test stub; Task 2 included installer + drift detector + README + verification round-trip)
- **Started:** 2026-05-19T01:15Z (approximate)
- **Completed:** 2026-05-19T01:30Z
- **Tasks:** 2 / 2
- **Files created:** 6 (`install.js`, `install.sh`, `README.md`, `installer-idempotency.test.ts`, `redaction-drift.test.ts`, `fixtures/settings.json`)
- **Files modified:** 0
- **Test suite wall-clock (after Task 2):** 1.16 s wall / 978 ms internal — well under the <2 s VALIDATION budget.

## Accomplishments

- **AGENT-LINUX-05 closed.** `bash vigil-linux-hooks/install.sh` is a one-command idempotent install that coexists with the 2 existing GSD `SessionStart` entries on the real Linux box. The fixture seeds that exact shape (2 GSD SessionStart + 3 PostToolUse + 4 PreToolUse; UserPromptSubmit/Stop absent) and the integration test verifies byte-for-byte preservation of every GSD entry across install → install → uninstall cycles.
- **AGENT-LINUX-06 closed.** `redaction-drift.test.ts` has four rails: Rail 0 anti-trivial-pass guard pins the JWT threshold at `{10,}` and explicitly fails if it regresses to `{20,}`; Rail 1 asserts the JSON contains the 6 WATCH-ENRICH-03 patterns + `max_length === 80`; Rail 2 asserts `redact.sh` references the canonical JSON file (no hardcoded list); Rail 3 cross-repo soft-skips when `vigil-watch/Sources/VigilWatch/Redactor.swift` is absent (Phase 133 not yet shipped — flips to hard-fail in that phase's plan).
- **Atomic-write contract verified end-to-end.** Hands-on tempdir test confirms (a) install → 3 SessionStart entries with `async:true` + `timeout:5` on the spliced entry, GSD entries preserved verbatim; (b) re-run → idempotent, still 3 entries; (c) uninstall → back to 2 entries, runtime files removed, hooks.UserPromptSubmit + hooks.Stop retained as empty arrays per CONTEXT D-N2; (d) malformed settings.json → installer exits 1 with stderr message, leaves the malformed file untouched (no clobber, T-134-I1 mitigation).
- **Async hook splice gates the Claude Code v2.1.87 stdio-stall bug.** Every spliced entry has both `async: true` AND `timeout: 5`. Combined with Plan 01's script-side `nohup curl ... </dev/null >/dev/null 2>&1 & disown`, this is the documented belt-and-suspenders mitigation per RESEARCH Pitfall 1.
- **Test suite expanded from 37 → 47 tests** (5 body-builder + 5 fail-safe + 27 corpus + 6 installer-idempotency + 4 drift). Total runtime ~1.0 s — Plan 05 will not need to tune budget.

## Task Commits

1. **Task 1: Create fixture settings.json + installer-idempotency.test.ts (RED stub)** — `b16274a` (test)
2. **Task 2: Create install.js + install.sh + redaction-drift.test.ts + README** — `068e663` (feat)

## Final Test Count Across the Mini-Package

| Test file | Count | Origin |
| --------- | ----- | ------ |
| `body-builder.test.ts` | 5 | Plan 01 |
| `fail-safe.test.ts` | 5 | Plan 01 |
| `redaction-corpus.test.ts` | 27 | Plan 03 |
| `installer-idempotency.test.ts` | 6 | **Plan 04 (NEW — this plan)** |
| `redaction-drift.test.ts` | 4 | **Plan 04 (NEW — this plan)** |
| **TOTAL** | **47** | — |

Runtime: 47 tests, 5 suites, 0 fail, 0 skip, **978 ms internal / 1.16 s wall-clock**.

## Installer Round-Trip — Captured Behavior

Captured against a tempdir fake `$HOME` seeded with the fixture (2 GSD SessionStart entries; no UserPromptSubmit / Stop):

```text
--- install ---
vigil-agent-bridge installed (3 hook entries). Set VIGIL_API_KEY to enable.

post-install:
  SessionStart.length = 3
  UserPromptSubmit.length = 1
  Stop.length = 1
  spliced.async = true
  spliced.timeout = 5
  first GSD preserved = node gsd-check-update.js
  second GSD preserved = bash gsd-session-state.sh

--- re-run (idempotency) ---
vigil-agent-bridge installed (3 hook entries). Set VIGIL_API_KEY to enable.

after re-run SessionStart.length = 3   (unchanged — idempotent)

--- uninstall ---
vigil-agent-bridge uninstalled.

after uninstall SessionStart.length = 2
after uninstall UserPromptSubmit.length = 0   (key retained per D-N2)
after uninstall Stop.length = 0               (key retained per D-N2)
```

Parse-failure refusal verified:

```text
--- input ---
this is not valid json {{{

--- run installer ---
stderr: settings.json parse failed: Unexpected token 'h', "this is not"... is not valid JSON
exit code: 1

--- after run ---
this is not valid json {{{      (untouched — no clobber, T-134-I1 mitigation)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan acceptance criterion line 311 contradicts action sub-step C line 263.**

- **Found during:** Task 2 acceptance-criterion validation.
- **Issue:** The plan's action body for `redaction-drift.test.ts` Rail 0 (line 263) mandates: `required.includes("ey[A-Za-z0-9_-]{20,}") === false` — this is the anti-regression guard, and it REQUIRES the literal `ey[A-Za-z0-9_-]{20,}` to appear in the test source (it's the argument to the negative-membership assertion). The plan's acceptance criterion line 311, however, demands `grep -c "ey\[A-Za-z0-9_-\]{20,}" returns 0`. These cannot simultaneously be satisfied.
- **Fix:** Honor the action's intent (Rule 1 — the action body is the authoritative specification). The literal `ey[A-Za-z0-9_-]{20,}` appears EXACTLY ONCE in `redaction-drift.test.ts`, inside the `assert.equal(required.includes("ey[A-Za-z0-9_-]{20,}"), false, ...)` call. This IS the anti-regression guard — if the JWT threshold ever drifts to `{20,}` in `redaction-patterns.json`, this assertion in conjunction with Rail 1's `json.patterns.includes(...)` membership check fails loudly.
- **Files modified:** none (the plan's action body was implemented as written; only the acceptance criterion is wrong).
- **Commit:** `068e663` (Task 2 commit — the divergence is in the plan template, not the code).

### Auth Gates

None. Task 1 and Task 2 ran entirely on local node + bash — no auth-bearing tooling involved.

### Architectural Changes (Rule 4)

None. The plan's spec was implementable verbatim except for the one acceptance-criterion contradiction noted above.

## Patterns Flagged During Testing — None Surfaced

No fixture-side bugs surfaced during this plan's execution. The fixture seeded the installer-idempotency tests cleanly on first try; both `node --check install.js` and `bash -n install.sh` passed without iteration; the full suite green-lit on the first `npm test` after Task 2.

## Self-Check: PASSED

- `vigil-linux-hooks/install.js` — FOUND. `node --check` passes; contains `renameSync` (2 refs), `async: true` (3 refs), `timeout: 5` (3 refs), `vigil-agent-bridge installed (3 hook entries). Set VIGIL_API_KEY to enable.` (1 ref), `vigil-agent-bridge uninstalled.` (1 ref).
- `vigil-linux-hooks/install.sh` — FOUND. Exactly 3 substantive lines (shebang + set + exec); `chmod 755` applied; `bash -n` passes.
- `vigil-linux-hooks/__tests__/installer-idempotency.test.ts` — FOUND. 6 `it(...)` blocks; contains `async`/`true`, `timeout`/`5`, and `byte-for-byte`/`preservation`/`preserved` assertion labels.
- `vigil-linux-hooks/__tests__/redaction-drift.test.ts` — FOUND. 4 `it(...)` blocks (Rails 0, 1, 2, 3); contains `ey[A-Za-z0-9_-]{10,}` (3 refs) and `ey[A-Za-z0-9_-]{20,}` (1 ref — the anti-regression negation) and `console.warn` (3 refs — Rail 3 soft-skip).
- `vigil-linux-hooks/__tests__/fixtures/settings.json` — FOUND. JSON-parses cleanly; `SessionStart.length === 2`, `PostToolUse.length === 3`, `PreToolUse.length === 4`; no UserPromptSubmit/Stop keys.
- `vigil-linux-hooks/README.md` — FOUND. Contains all 5 env-var names (`VIGIL_API_KEY`, `VIGIL_API_URL`, `VIGIL_AGENT_BRIDGE_DEBUG`, `VIGIL_HOST_OVERRIDE`, `VIGIL_MAX_PROMPT_LEN`); 2 references to `Phase 133`; airplane-mode troubleshooting section present.
- Commit `b16274a` (Task 1) — FOUND in `git log`.
- Commit `068e663` (Task 2) — FOUND in `git log`.
- Test run: 47/47 passing in 978 ms / 1.16 s wall-clock — verified post-Task-2.
- Behavioral capture: tempdir round-trip (install → re-install → uninstall) shows 3 → 3 → 2 SessionStart entries; spliced entry has `async:true` + `timeout:5`; GSD entries preserved byte-for-byte.
- Behavioral capture: malformed settings.json → installer exits 1 to stderr, leaves file untouched.

## Threat Mitigations Verified

| Threat | Mitigation in this Plan | Verification |
| ------ | ----------------------- | ------------ |
| T-134-I1 (Tampering: settings.json mid-write corruption) | Atomic `fs.writeFileSync(tmp) + fs.renameSync(tmp, real)` on EVERY write (install path AND uninstall path). Parse-failure during read path: `process.exit(1)` to stderr BEFORE any write — never clobbers a malformed file. | Hands-on test against malformed input verified exit 1 + file untouched. POSIX `rename(2)` is atomic on same FS per kernel doc. |
| T-134-I2 (Tampering: uninstall clobbers GSD entries) | `COMMAND_REGEX = /vigil-agent-bridge\.sh.*--event=/` anchored on the unique substring `vigil-agent-bridge.sh`. Filter only drops entries matching this regex; install path never modifies existing entries — only appends new matcher groups. | `installer-idempotency.test.ts` "uninstall round-trip" assertion JSON.stringify-compares `hooks.PostToolUse` and `hooks.PreToolUse` against the seed fixture byte-for-byte. Test passes. Round-trip cycle: 2 → 3 → 3 → 2 SessionStart entries; PostToolUse/PreToolUse never mutate. |
| T-134-R3 (Information Disclosure: drift between JSON + bash + Swift pattern source) | Rail 1 asserts `redaction-patterns.json` contains the 6 canonical patterns; Rail 2 asserts `redact.sh` references the JSON file; Rail 3 cross-repo soft-skips Swift parity (until Phase 133 ships). Rail 0 anti-trivial-pass guard pins `required.length === 6` AND the JWT `{10,}` threshold. | `redaction-drift.test.ts` 4/4 pass; Rail 3 emits `[skip] vigil-watch not present — Phase 133 not yet shipped` console.warn but doesn't fail. |
| T-134-A2 (Denial of Service: Claude Code v2.1.87+ stdio stall) | Every spliced entry in settings.json has `"async": true` AND `"timeout": 5` — official Claude Code v2.1.23+ async-hook posture per `[CITED: code.claude.com/docs/en/hooks]`. Combined with Plan 01's script-side `nohup curl ... </dev/null >/dev/null 2>&1 & disown` for belt-and-suspenders. | `installer-idempotency.test.ts` "spliced entries have async:true and timeout:5" asserts on ALL THREE event arrays (SessionStart, UserPromptSubmit, Stop). Test passes. Hands-on tempdir capture confirms `spliced.async = true` + `spliced.timeout = 5`. |

## Phase 134 Status After This Plan

**Plans 02, 03, 04 are now CODE-COMPLETE.** The mini-package contains:

- `vigil-agent-bridge.sh` — runtime hook (Plan 01-03 cumulative): auth gate + redact source + STDIN JSON parse + 3-branch dispatch + nohup-curl-with-stdio-redirect.
- `redact.sh` + `redaction-patterns.json` — sourceable redactor with canonical 6-pattern denylist + max_length=80 + JWT `{10,}` threshold (Plan 03).
- `install.js` + `install.sh` — installer/uninstaller with idempotent splice + atomic write + async:true+timeout:5 + GSD coexistence (Plan 04 — this plan).
- `README.md` — operator-facing docs (this plan).
- 47-test suite — body-builder + fail-safe + redaction-corpus + installer-idempotency + redaction-drift (cumulative across plans).

**Plan 05 (the hardware UAT) is the last gate.** It will run the install on the real Linux box, verify the 3 hook entries actually splice into the real `~/.claude/settings.json`, run a `claude` session, confirm the HUD shows `dailybrief: running` within 5 s, toggle iPhone airplane mode to verify fail-safe, and run the uninstall to confirm clean removal. No additional code expected to land in Plan 05 beyond UAT-result documentation.

## Hand-off Notes for Plan 05

- **Install on the real Linux box:** `cd ~/dev/dailybrief && bash vigil-linux-hooks/install.sh`. The install will splice into the existing `~/.claude/settings.json` which currently has 2 GSD SessionStart + 3 PostToolUse + 4 PreToolUse. Re-running is safe (idempotent).
- **Set `VIGIL_API_KEY` first.** If unset, the hook silently no-ops and the HUD won't see anything. The README documents `~/.bashrc` / `~/.zshrc` / `~/.config/vigil/env` as the canonical locations.
- **Verify with `grep -c vigil-agent-bridge ~/.claude/settings.json` — expect 3.**
- **Airplane-mode test is Success Criterion 4** — toggle iPhone airplane mode during a `claude` session and confirm Claude Code continues to function normally with no stall and no error popup. If there's a stall, check `async:true` is present on every spliced entry.
- **Optional `VIGIL_AGENT_BRIDGE_DEBUG=1`** writes one line per event to `/tmp/vigil-agent-bridge.log`. Useful to confirm the hook is firing without needing access to vigil-core access logs.
- **Cross-repo drift detector Rail 3 still soft-skips.** That's by design — Phase 133 will flip it to hard-fail. Plan 05 hardware UAT does not need to interact with this detector.
- **Plan 04's acceptance-criterion contradiction** (the `{20,}` count expectation) is documented in this SUMMARY's Deviations section. No code change needed; the action body's intent was honored.
