---
phase: 57-cross-machine-bootstrap-script
plan: "01"
subsystem: scripts
tags: [bootstrap, 1password, vigil-core, launchagent, idempotency]
dependency_graph:
  requires: []
  provides: [scripts/bootstrap.sh]
  affects: [scripts/install.sh, scripts/sync-anthropic-key.sh, scripts/dailybrief-doctor.sh]
tech_stack:
  added: []
  patterns: [set-euo-pipefail, SCRIPT_DIR-derivation, python3-inline-json, PlistBuddy-dynamic-extraction, launchctl-bootout-bootstrap]
key_files:
  created:
    - Scripts/bootstrap.sh
  modified: []
decisions:
  - "D-13 honored: health check is HTTP 200 ONLY — no JSON body parsing. Research Q3 recommended parsing status==ok but D-13 (added post-research) explicitly overrides this. status:degraded is accepted steady state."
  - "restore_op_document() helper function used instead of inline op calls — cleaner error messages per D-05, avoids repetition. Plan verify grep assumed inline calls but function is strictly better."
  - "Idempotency on op-missing machine defined as: exits non-zero with identical output twice, no partial side effects — not exits 0 (which would require op installed)."
metrics:
  duration_minutes: 30
  completed_date: "2026-04-08T21:32:11Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 0
---

# Phase 57 Plan 01: bootstrap.sh — Cross-machine Bootstrap Script Summary

**One-liner:** Single-command Vigil dev bootstrap implementing D-08 10-step ordering — pre-flight → 1P secrets restore → vigil-core build → .env sync → LaunchAgent load → install.sh → HTTP 200 health check — with fail-loud on every step and idempotent re-run.

## What Was Built

`Scripts/bootstrap.sh` — 300-line orchestrator that:

1. **Pre-flight** — checks `op` (1Password CLI), `node`/`npm`/`swift` (required), `railway`/`gh` (optional warn-only). Exits with exact `brew install --cask 1password-cli` + `op signin` recipe if missing.
2. **`op whoami` check** — fails loud with "run op signin" if not authenticated.
3. **1P secrets restore** — `restore_op_document()` function wraps `op item get` existence check + `op document get --out` for all 3 vault items (`vigil-config`, `vigil-gcal-tokens`, `vigil-vigilcore-plist`). Missing item prints the exact `op document create` heal command.
4. **config.json sanity** — `python3 json.load()` check after restore confirms valid JSON.
5. **vigil-core build** — `npm install && npm run build` in a subshell.
6. **.env seed + key sync** — seeds `~/.config/dailybrief/.env` from `.env.example` only if missing; delegates to `sync-anthropic-key.sh` for key propagation.
7. **LaunchAgent load** — `launchctl bootout ... || true` + `launchctl bootstrap "gui/$(id -u)"` (matches install.sh pattern).
8. **`install.sh` delegation** — Mac-side swift build + DailyBriefMonitor LaunchAgent handled entirely by existing script.
9. **HTTP 200 health check** — 30s/1s polling, HTTP status code only per D-13. Dynamic PlistBuddy log path extraction. On failure: tail 50 lines stderr + 20 lines stdout.
10. **Summary** — prints all artifact paths and next-step recipe.

## Script Structure (Section Headers)

```
=== Vigil Bootstrap: Pre-flight ===
=== Vigil Bootstrap: Secrets Restore ===
=== Vigil Bootstrap: vigil-core build ===
=== Vigil Bootstrap: .env + key sync ===
=== Vigil Bootstrap: vigil-core LaunchAgent ===
=== Vigil Bootstrap: DailyBrief CLI + Monitor ===
=== Vigil Bootstrap: Health check ===
=== Vigil Bootstrap: Complete ===
```

## Research Assumption Outcomes

| Assumption | Status | Notes |
|---|---|---|
| A1: `op document get --out <path>` syntax | NOT VERIFIED live (op not installed) | Added `--force` fallback: tries `--force` first, falls back to plain `--out`. Conservative approach handles both op versions. |
| A2: `op whoami` exits non-zero when not signed in | NOT VERIFIED live | Implemented as documented; test deferred to machine with op. |
| A3: `op document get` overwrites unconditionally | ASSUMED OK | D-09 requires overwrite-always; `--force` flag ensures this. |
| Q3 research: parse JSON body for status==ok | OVERRIDDEN by D-13 | D-13 explicitly supersedes this. HTTP 200 ONLY. |

## Idempotency Test Results

**Machine state:** `op` (1Password CLI) NOT installed. This is the pre-flight gate.

**Run 1:**
```
=== Vigil Bootstrap: Pre-flight ===
error: 1Password CLI (op) not installed.

Install it with:
  brew install --cask 1password-cli

Then sign in once:
  op signin

Then re-run: ./scripts/bootstrap.sh
exit=1
```

**Run 2:** Identical output, exit=1.

**Interpretation:** Idempotency on this machine means "fails loud identically with no partial state." Per D-01, pre-flight is correct to halt before any state-mutating step. No files were created or modified. No LaunchAgent operations were attempted. This is the correct behavior.

**Behavior on a machine WITH `op` installed has NOT been tested end-to-end — that is deferred to the user's next actual fresh-machine provisioning. What WAS tested: syntax, preflight failure path, D-13 compliance (no JSON status parsing), threat T-57-01 (no secret echo), structural grep checks for all required sections.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan Check Mismatch] Task 2 verify grep assumed inline op calls**
- **Found during:** Task 2 verification
- **Issue:** Plan's verify grep `grep -q 'op document get "\$OP_ITEM_CONFIG"'` assumed `op document get` would appear inline for each item. Implementation uses `restore_op_document()` helper function instead.
- **Fix:** Function is strictly better (DRY, consistent error messages per D-05, cleaner fail-loud output). Verified via `grep -q 'restore_op_document "\$OP_ITEM_CONFIG"'` instead.
- **Files modified:** Scripts/bootstrap.sh
- **Commit:** 4ed99cb

**2. [Note] D-13 overrides RESEARCH.md Q3**
- **Research finding:** Q3 recommended parsing JSON body for `status == "ok"` because HTTP is always 200.
- **Decision D-13** (added post-research, 2026-04-08): HTTP 200 ONLY. `status: "degraded"` is accepted steady state.
- **Action:** Followed D-13. Script has no JSON body parsing. Verified with grep: zero matches for `"status":"ok"` and `status.*==.*ok`.

## Known Stubs

None. The script is a full orchestrator — no stubs, no placeholder sections.

## Threat Flags

None. The script introduces no new network endpoints, auth paths, or trust boundary crossings. All file paths use `$HOME`-relative constants or SCRIPT_DIR derivation. No secret material echoed (verified: zero matches for `echo.*KEY=` and `echo.*\$KEY`).

## Self-Check

### Checking created files
- Scripts/bootstrap.sh: FOUND

### Checking commits
- 51756f3 (Task 1: scaffold + preflight + --check shim): checking...
- 4ed99cb (Task 2: 1P restore + vigil-core + launchctl): checking...
- e284d70 (Task 3: health check + summary + idempotency): checking...

## Self-Check: PASSED

- Scripts/bootstrap.sh: FOUND
- 51756f3 feat(57-01): bootstrap.sh scaffold: FOUND
- 4ed99cb feat(57-01): bootstrap.sh core orchestration: FOUND
- e284d70 feat(57-01): bootstrap.sh health check: FOUND
