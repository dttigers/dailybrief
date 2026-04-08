# Phase 57: Cross-machine bootstrap script — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 57-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 57-cross-machine-bootstrap-script
**Areas discussed:** Secrets transport, Scope (unify vs replace), Drift doctor shape, Vigil-core in the loop

---

## Scout findings that reshaped the discussion

Before the first question, a scout of `scripts/` revealed the project already ships:
- `scripts/setup.sh` — build + config template (stub-ish)
- `scripts/install.sh` — idempotent Mac app + LaunchAgent installer
- `scripts/build.sh` — swift build + codesign
- `scripts/sync-anthropic-key.sh` — ANTHROPIC_API_KEY propagation from canonical `~/.config/dailybrief/config.json` into .env + plist + Railway

This meant the phase was NOT "write a bootstrap from scratch" but "unify existing scripts + solve the unsolved secrets-transport problem + add drift detection." The gray area questions were recalibrated to reflect that.

Also confirmed: `op` (1Password CLI) was NOT installed on the current machine, creating a chicken-and-egg if chosen as the transport.

---

## Area 1a: Secrets transport

| Option | Description | Selected |
|--------|-------------|----------|
| 1Password CLI (Recommended) | `op document get` restores config.json + related files. Requires `brew install --cask 1password-cli && op signin` as a pre-step. Most secure, survives machine loss, standard pattern. | ✓ |
| iCloud Drive synced folder | Copy from `~/Library/Mobile Documents/com~apple~CloudDocs/vigil-secrets/`. Easier, uses Apple ID, but plaintext-on-disk exposure and sync-lag race. | |
| Private git repo with age-encrypted payload | Dedicated private repo with encrypted tarball. Audit trail but more moving parts. | |
| Manual SSH copy from known machine | `scp` from an existing working Mac. No cloud but breaks on first-ever or offline-source case. | |

**User's choice:** 1Password CLI
**Notes:** Chicken-egg explicitly accepted — bootstrap will pre-flight for `op` and print the `brew install` recipe if missing, not auto-install.

---

## Area 1b: What lives in the vault

| Option | Description | Selected |
|--------|-------------|----------|
| Full files as documents (Recommended) | config.json, google_calendar_tokens.json, vigilcore.plist stored as 1P "documents." Zero-parse round-trip. | ✓ |
| Individual secret fields | Each secret as a separate 1P field, config.json reconstructed from template. Granular rotation but fragile to schema changes. | |
| Hybrid — files for complex, fields for standalone | config.json as document + separate ANTHROPIC_API_KEY field for scripts. Slight duplication. | |

**User's choice:** Full files as documents
**Notes:** Three 1P items: `vigil-config`, `vigil-gcal-tokens`, `vigil-vigilcore-plist`. Monitor plist excluded (no secrets inside).

---

## Area 2: Scope — unify vs replace

| Option | Description | Selected |
|--------|-------------|----------|
| New bootstrap.sh orchestrator, existing scripts unchanged (Recommended) | scripts/bootstrap.sh calls existing scripts in order. Existing scripts untouched, still individually callable. Smallest diff on working code. | ✓ |
| Refactor into single dailybrief-bootstrap tool | Merge setup/install/build/sync into one cohesive subcommand tool. Cleaner long-term but risks breaking muscle memory. | |
| New bootstrap.sh + deprecate setup.sh | Replace only setup.sh (most stub-like), keep the rest. Minor churn. | |

**User's choice:** New orchestrator, existing scripts unchanged
**Notes:** D-03 locked. Lowest risk — respects working code. The existing scripts are proven and idempotent; bootstrap.sh is a thin orchestrator on top.

---

## Area 3: Drift doctor shape

| Option | Description | Selected |
|--------|-------------|----------|
| Separate dailybrief-doctor.sh, checks all drift-prone secrets (Recommended) | Standalone script. Checks ANTHROPIC across 4 places + VIGIL bearer across 3 places + file timestamps. Table output, exit 0/1. | ✓ |
| bootstrap.sh --check subcommand, Anthropic only | Fold into bootstrap.sh as a flag. Smaller scope, fewer moving parts. | |
| Separate doctor script, Anthropic only for v1 | Middle ground — standalone tool but tight initial scope. | |

**User's choice:** Separate script, all drift-prone secrets
**Notes:** Doctor is read-only (D-11). Healing is sync-anthropic-key.sh's job. `bootstrap.sh --check` is a thin shim that calls the doctor. Exit code propagated.

---

## Area 4: Vigil-core in the loop

| Option | Description | Selected |
|--------|-------------|----------|
| Full install + health check, fail loud (Recommended) | npm install + build + launchctl load + poll /v1/health for 30s. Each step fails loud with specific error. | ✓ |
| Install + build, skip LaunchAgent reload | Don't touch launchd. Avoids edge case where bootstrap is re-run while vigil-core is running. | |
| Mac side only, print vigil-core recipe | Don't touch vigil-core. Violates roadmap criterion #1. | |

**User's choice:** Full install + health check + fail loud
**Notes:** On health check failure, bootstrap tails the LaunchAgent log and exits non-zero. Polling interval and log-tail length are planner's discretion.

---

## Claude's Discretion

Areas delegated downstream (captured in CONTEXT.md):
- Bash style / function decomposition (match existing scripts)
- Exact Python inline snippets for JSON parsing (copy sync-anthropic-key.sh pattern)
- 1P item name refinements
- Health check polling interval + log-tail length
- ASCII banner / color conventions
- Bearer-drift check's exact grep target in Mac sources (planner reads SettingsViewModel)

---

## Deferred Ideas

Noted in CONTEXT.md `<deferred>` section:
- Per-secret granular rotation
- Windows / Linux support
- CI-driven fresh-machine validation
- Homebrew tap distribution
- Auto-install of system dependencies (`op`, node, swift)
- Schema versioning for config.json
- Drift auto-heal
- Telemetry

---

*Audit log generated: 2026-04-08*
