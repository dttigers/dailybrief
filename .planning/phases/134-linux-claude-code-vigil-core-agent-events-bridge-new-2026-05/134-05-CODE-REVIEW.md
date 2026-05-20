---
phase: 134-linux-claude-code-vigil-core-agent-events-bridge
plan: 05
task: 1
reviewed: 2026-05-19
review_source: 134-REVIEW.md
status: critical_resolved
findings:
  critical: 3
  warning: 7
  info: 4
  total: 14
critical_resolved: 3
critical_deferred: 0
warning_deferred: 7
info_deferred: 4
---

# Phase 134 — Plan 05 Task 1: Code Review + HIGH Severity Resolution

**Reviewer:** Claude (gsd-code-reviewer)
**Review Date:** 2026-05-19
**Source Report:** [`134-REVIEW.md`](./134-REVIEW.md)
**Resolution Date:** 2026-05-19
**Resolution Mode:** in-place fixes with atomic `fix(134-05):` commits, regression test per finding

---

## Summary

The standard-depth review surfaced **3 Critical / 7 Warning / 4 Info** findings across 13 files in `vigil-linux-hooks/`. All three Critical findings are addressed in-place per the Phase 130 lesson (`feedback_code_review_before_hardware_uat.md`): operator hardware UAT cycles are expensive, and structural gaps that reviewer catches deserve atomic-commit resolution before the operator burns those cycles.

All 50 tests pass after the three fix commits. Each fix landed with its own atomic commit and added a dedicated regression test so future commits cannot reintroduce the issue.

The 7 Warning and 4 Info findings are deferred — they cover non-blocking concerns (hardcoded paths, observability gaps, doc clarity) that can be addressed in a follow-up phase without delaying the operator UAT.

---

## Critical Findings — Resolution Table

| ID | Title | Status | Commit | Regression Test |
|----|-------|--------|--------|-----------------|
| CR-01 | API key leaked to process argv via curl `--header` | resolved | `a605c51` | `fail-safe.test.ts` — `hook source must NOT pass VIGIL_API_KEY via curl --header on argv (T-134-A1 / CR-01)` |
| CR-02 | Uninstall regex `COMMAND_REGEX` unanchored | resolved | `f5f47d9` | `installer-idempotency.test.ts` — `uninstall: anchored COMMAND_REGEX preserves decoy substring matches (CR-02 / T-134-I2)` |
| CR-03 | Atomic write does not preserve `settings.json` mode bits | resolved | `65df339` | `installer-idempotency.test.ts` — `install: preserves settings.json mode bits (CR-03 / T-134-I1)` |

### CR-01 — `vigil-agent-bridge.sh:111`

**Fix:** Replaced `curl --header "Authorization: Bearer $VIGIL_API_KEY"` (argv) with `curl --config -` reading from a here-string on stdin. The Authorization header now flows through curl's config-on-stdin path and never lands in `/proc/<pid>/cmdline`. Resolved in commit `a605c51`.

**Regression guard:** `fail-safe.test.ts` source-greps `vigil-agent-bridge.sh` for the pattern `--header\s+["'][^"']*Authorization[^"']*\$\{?VIGIL_API_KEY\}?` and FAILS the test if any future commit reintroduces the argv leak.

### CR-02 — `install.js:47`

**Fix:** Replaced the unanchored regex `/vigil-agent-bridge\.sh.*--event=/` with the line-anchored allowlist `/^bash\s+\S+\/vigil-agent-bridge\.sh\s+--event=(SessionStart|UserPromptSubmit|Stop)\s*$/`. Only the exact command shape that install.js writes is matched on uninstall. Resolved in commit `f5f47d9`.

**Regression guard:** `installer-idempotency.test.ts` adds a decoy hook command (`bash gsd-vigil-agent-bridge.sh-wrapper --event=foo --extra=bar`) to `hooks.SessionStart`, runs install + uninstall, and asserts the decoy SURVIVES.

### CR-03 — `install.js:70-74`

**Fix:** `atomicWriteSettings()` now stat()s the original file before write, then `fs.chmodSync(tmp, mode)` before the rename. On first-time install (ENOENT), uses a restrictive `0o600` default instead of the umask-derived `0o644`. Resolved in commit `65df339`.

**Regression guard:** `installer-idempotency.test.ts` pre-chmods the fixture to `0o600`, runs install, asserts mode survives, then runs uninstall and re-asserts.

---

## Warning Findings — Deferral Status (7 total, all deferred)

All 7 Warning findings are documented and deferred. None blocks operator UAT; they cover observability/ergonomics gaps that can be addressed in a follow-up phase.

| ID | Title | Disposition | Rationale |
|----|-------|-------------|-----------|
| WR-01 | `install.sh` hardcodes `/usr/bin/node` | deferred | The operator's `~/dev/dailybrief` setup uses system node (verified in env); install.sh works in production. Will be fixed in a follow-up to support nvm/asdf operators. |
| WR-02 | `cat` blocks if Claude Code never closes stdin | deferred | The `async:true` + `timeout:5` settings.json contract guarantees the UX is not stalled (the hook process is SIGKILL'd at 5s). Process-hygiene improvement, not a fail-safe gap. |
| WR-03 | `install.js` blind to `settings.local.json` | deferred | The operator confirms no `settings.local.json` hooks are present on the Linux box; README warning sufficient for v1. |
| WR-04 | `password` / `bearer` patterns over-redact | deferred | Binary-redaction is the documented contract — false positives are preferred over false negatives. README clarification deferred. |
| WR-05 | `$0` vs `${BASH_SOURCE[0]}` in hook source path | deferred | Works in production because install.js copies all three files to `~/.claude/hooks/`. Low-risk hardening for a follow-up. |
| WR-06 | `body-builder.test.ts` shell-quote escape fragility | deferred | Test fixture content is hand-controlled JSON with no embedded backslash+quote sequences; no production risk. Refactor deferred. |
| WR-07 | No platform guard in installer | deferred | Operator hardware UAT is on Linux only; mistargeted use on macOS would surface immediately via missing `/proc/sys/kernel/random/uuid`. |

---

## Info Findings — Deferral Status (4 total, all deferred)

| ID | Title | Disposition |
|----|-------|-------------|
| IN-01 | Round-trip uninstall not byte-identical (empty `[]` keys persist) | deferred — intentional per CONTEXT D-N2 |
| IN-02 | `body-builder.test.ts` hardcoded `/tmp/vigil-bb-test-stderr` | deferred — test-only |
| IN-03 | Redaction patterns re-read from disk per prompt | deferred — performance; documented out of v1 scope |
| IN-04 | `--fail` silently swallows HTTP 401 | deferred — fire-and-forget contract; out-of-scope CLI probe candidate |

---

## Test Suite Verification

Final test count after all 3 fixes landed:

```
$ cd vigil-linux-hooks && npm test
ℹ tests 50
ℹ suites 5
ℹ pass 50
ℹ fail 0
```

Plan 04 baseline was 47/47; Plans 05 Task 1 added 3 regression tests (one per Critical finding) for a total of 50/50.

---

## Operator Hand-off

All HIGH-severity findings are resolved with atomic commits and regression tests. The mini-package is code-review-clean and ready for hardware UAT Tasks 2-4 on the real Linux dev workstation:

- **Task 2** — Install + Success Criterion 1 (HUD round-trip ≤5s, label = `dailybrief: running`)
- **Task 3** — Success Criterion 4 (iPhone airplane-mode fail-safe; ≥5 prompts during outage with zero hook stderr noise)
- **Task 4** — Success Criterion 5 (clean uninstall + GSD entries byte-for-byte preserved)

Resume signal: type `approved` to proceed to operator UAT, or `blocked: <description>` if any HIGH finding requires further investigation before hardware testing.
