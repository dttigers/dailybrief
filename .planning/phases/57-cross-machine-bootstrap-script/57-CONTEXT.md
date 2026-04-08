# Phase 57: Cross-machine bootstrap script — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Supersedes:** the backlog seed file (999.1 promotion)

<domain>
## Phase Boundary

One command — `scripts/bootstrap.sh` — takes a freshly-cloned dailybrief repo on a fresh Mac (or a re-imaged old one) and produces a working Vigil dev environment: secrets restored from 1Password, Mac apps built and installed, vigil-core built and running via LaunchAgent, `http://localhost:3001/v1/health` responding green. Plus a companion `scripts/dailybrief-doctor.sh` that diagnoses drift across the places each secret lives.

**In scope:**
- New `scripts/bootstrap.sh` that orchestrates existing scripts + new secrets-restore + vigil-core build
- New `scripts/dailybrief-doctor.sh` that reads all drift-prone secret locations and reports
- 1Password vault structure (3 documents: config.json, google_calendar_tokens.json, vigilcore.plist)
- Readme-style documentation in the bootstrap output itself (no separate docs phase needed)
- Pre-flight check: if `op` CLI not installed, print the exact `brew install --cask 1password-cli` recipe and exit cleanly

**Out of scope:**
- Refactoring the existing scripts (setup.sh, install.sh, build.sh, sync-anthropic-key.sh) — they stay as-is and remain individually callable (D-03)
- `git clone` of the repo — bootstrap.sh assumes it's being run from inside an already-cloned repo. The user runs `git clone ... && cd dailybrief && ./scripts/bootstrap.sh`, not the other way around.
- Installing Xcode / Homebrew / node / swift themselves — bootstrap checks for them and prints install instructions if missing, but does not auto-install system-level dependencies
- Per-secret granular rotation (deferred — sync-anthropic-key.sh already covers Anthropic; other secrets rotate rarely)
- Windows / Linux support — macOS only, this is a Vigil dev workstation
- CI / automated fresh-machine testing — real verification happens when the user next sets up a machine

</domain>

<decisions>
## Implementation Decisions

### Secrets transport
- **D-01:** 1Password CLI (`op`) is the canonical transport. Rationale: most secure option, survives machine loss, standard industry pattern, works offline after initial signin. Chicken-egg handled by a pre-flight: if `op` is missing, bootstrap.sh prints `brew install --cask 1password-cli && op signin` and exits cleanly — does not try to auto-install system tools. Same for missing `op signin` (detectable via `op whoami`).
- **D-02:** Vault items stored as full-file documents, not individual fields. Three items:
  - `vigil-config` → `~/.config/dailybrief/config.json` (contains ai.claude_api_key, vigil bearer, gmail, IMAP, all nested settings)
  - `vigil-gcal-tokens` → `~/.config/dailybrief/google_calendar_tokens.json`
  - `vigil-vigilcore-plist` → `~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist`
  - Rationale: full-file round-trip is zero-parse, easy to inspect in 1Password UI, easy to rotate (re-upload the file), matches how the files already live on disk. Individual-field mode was rejected because config.json has nested structure that would be fragile to reconstruct.
- **D-07:** The DailyBrief Monitor plist (`com.jamesonmorrill.dailybriefmonitor.plist`) is NOT stored in 1Password — it's regenerated from a template by the existing `install.sh` and contains no secrets (the Mac apps read secrets at runtime from `~/.config/dailybrief/config.json`). Confirmed during scout.

### Scope + existing scripts
- **D-03:** New `scripts/bootstrap.sh` orchestrator. Existing scripts (`setup.sh`, `install.sh`, `build.sh`, `sync-anthropic-key.sh`) are unchanged and remain individually callable. Bootstrap.sh is the new front door; it calls `install.sh` for the Mac side, calls `sync-anthropic-key.sh` after secrets land, and contains the new vigil-core install + 1P restore logic directly. Smallest possible diff on working code.
- **D-08:** Canonical ordering inside bootstrap.sh (planner may refine, but the dependency order is fixed):
  1. Pre-flight: check for `op`, `node`/`npm`, `swift`, `railway` (optional), `gh` (optional). Print missing-tool install recipes, exit non-zero if any required tool missing.
  2. `op whoami` — fail loud with "run op signin" if not authed.
  3. Restore secrets: `op document get vigil-config --out ~/.config/dailybrief/config.json` and the other two.
  4. `mkdir -p ~/Library/LaunchAgents`, ensure plist permissions.
  5. `cd vigil-core && npm install && npm run build`.
  6. Ensure `~/.config/dailybrief/.env` exists (create from template if missing); call `scripts/sync-anthropic-key.sh` to propagate the Anthropic key into .env + plist + Railway (if `railway` CLI present and linked).
  7. `launchctl load ~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist` (unload first if already loaded).
  8. Call `scripts/install.sh` to build + install DailyBrief CLI and Monitor (already idempotent per its own comment).
  9. Health check: poll `http://localhost:3001/v1/health` for up to 30s; fail loud with recent LaunchAgent log tail if it never answers.
  10. Final summary: print everything that landed, any non-fatal warnings (e.g., Railway CLI not linked), and a recipe to run the doctor.
- **D-09:** `bootstrap.sh` is idempotent — safe to re-run on an already-working machine. Each step is either naturally idempotent (npm install, launchctl unload-then-load) or guarded by an existence check. This matches the pattern in `install.sh` which already declares itself idempotent.

### Drift doctor
- **D-04:** New standalone `scripts/dailybrief-doctor.sh`. Not folded into bootstrap.sh as a flag — separate purpose, separate front door. Checks:
  - **ANTHROPIC_API_KEY drift** across 4 places: `~/.config/dailybrief/config.json` (canonical source: `ai.claude_api_key`), `~/.config/dailybrief/.env`, `~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist` (EnvironmentVariables:ANTHROPIC_API_KEY), Railway variable in the linked vigil-core project (if `railway` CLI available and linked).
  - **VIGIL_API_KEY bearer drift** across: `~/.config/dailybrief/config.json` (field TBD — planner should grep for the actual key name used by the Mac apps), `vigilcore.plist` EnvironmentVariables (if present), and whatever Mac app Settings storage holds it (per `project_settings_wipes_apikey` memory, SettingsViewModel round-trips this — the planner should read that file).
  - **File timestamps** on all the above, surfaced in the output table so the user can spot a stale file.
- **D-10:** Doctor output format — a single text table: `TARGET | VALUE PREFIX | LAST MODIFIED | MATCH`. Prefix only (first 8 chars + `…`) to avoid dumping secrets to the terminal. Exit 0 if all MATCH values are ✓, exit 1 if any ✗. `bootstrap.sh --check` is a thin shim that calls `dailybrief-doctor.sh` and inherits its exit code.
- **D-11:** Doctor does NOT write or heal — it only reports. Healing is `sync-anthropic-key.sh`'s job (already exists). Doctor prints the exact command to run if drift is detected ("Run `./scripts/sync-anthropic-key.sh` to re-sync from config.json").

### Vigil-core pipeline
- **D-05:** Full install + health check + fail loud (from D-08 step 5, 7, 9). If `npm install` fails → exit with npm stderr. If build fails → exit with TypeScript errors. If launchctl load fails → exit with launchctl stderr. If health check never responds in 30s → tail the last 50 lines of the LaunchAgent log (`~/Library/Logs/com.jamesonmorrill.vigilcore.out.log` or wherever the plist points) and exit.
- **D-12:** The 30-second health-check timeout is a Claude's Discretion value — planner picks the actual polling interval (likely 1s × 30) and may adjust if the vigil-core cold-start time is known to be longer.

### Config + namespacing
- **D-06:** No new `.planning/config.json` keys. The bootstrap is project-specific, not a GSD workflow feature. All its configuration (1P vault item names, file paths) lives in bash constants at the top of `bootstrap.sh` and `dailybrief-doctor.sh`. If other projects ever want this, they'll fork it.

### Claude's Discretion
- Exact bash style (functions vs inline, `set -e` vs explicit checks) — match existing scripts' idioms
- The specific bash technique for parsing config.json to extract keys — `sync-anthropic-key.sh` already uses inline Python (`/usr/bin/python3 -c`), match that
- The specific 1P item naming (we've proposed `vigil-config`, `vigil-gcal-tokens`, `vigil-vigilcore-plist` — planner may refine)
- The exact fail-loud log-tail length (10 lines vs 50 lines) for health check
- Whether to print ASCII banners at major milestones (matches existing install.sh style? — planner reads it first)
- Error message phrasing and colorization (match existing scripts)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing scripts (the ones being orchestrated, NOT modified)
- `scripts/setup.sh` — current "setup" entry point; stub-ish, creates config template from `--setup` flag. Bootstrap may call parts of this or replace the portions that overlap.
- `scripts/install.sh` — idempotent DailyBrief + Monitor installer. Bootstrap calls this for the Mac side. Already declares itself idempotent in its comment header — reuse that contract.
- `scripts/build.sh` — swift build release + codesign. Called by install.sh already.
- `scripts/sync-anthropic-key.sh` — canonical ANTHROPIC_API_KEY propagation: config.json → .env → plist → Railway. **This is the source of truth for the drift-sync pattern.** Bootstrap calls this after secrets restore. Doctor's check logic must match the files this script writes to.

### Existing secret locations (what bootstrap restores and doctor checks)
- `~/.config/dailybrief/config.json` — CANONICAL source of truth for all secrets (`ai.claude_api_key`, vigil bearer, gmail, IMAP, google cal tokens path). Read-only in doctor.
- `~/.config/dailybrief/.env` — downstream copy of ANTHROPIC_API_KEY used by `npm run dev` in vigil-core.
- `~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist` — downstream copy in `EnvironmentVariables:ANTHROPIC_API_KEY` used by the LaunchAgent'd vigil-core.
- `~/Library/LaunchAgents/com.jamesonmorrill.dailybriefmonitor.plist` — Monitor's LaunchAgent. No secrets inside (secrets loaded at runtime from config.json). NOT in 1P per D-07.
- `~/.config/dailybrief/google_calendar_tokens.json` — OAuth refresh tokens for Google Calendar integration.

### Vigil-core internals
- `vigil-core/package.json` §scripts — `npm install`, `npm run build`, `npm run dev`, `db:*` scripts. The build step produces `vigil-core/dist/` which the LaunchAgent's CMD invokes.
- `vigil-core/.env.example` — template for the .env file. Bootstrap can seed a new .env from this if none exists.
- `vigil-core/Dockerfile` — NOT used for local bootstrap (that's Railway's concern). Noted for completeness.

### Mac app secret reading (for the bearer-drift check in D-04)
- Per `project_settings_wipes_apikey` memory: `SettingsViewModel` round-trips `apiKey` and `apiBaseUrl`. Planner should grep for `apiKey` or `VIGIL_API_KEY` in the Mac app sources (DailyBrief/, JarvisCore/, or wherever SettingsViewModel lives) to find the exact storage path so the doctor can read it.

### User memory (relevant to this phase)
- `project_secret_drift.md` — 4-places-drift is the default failure mode. This phase is the structural response.
- `project_mac_build_targets.md` — DailyBrief CLI owns PDF rendering; Monitor is the watcher. Bootstrap must build the right target. `install.sh` already knows this — trust it.
- `project_railway_deploy.md` — Railway service config, custom domain api.vigilhub.io. Doctor's Railway check needs `railway` CLI and `railway link` to be done in vigil-core first.
- `project_settings_wipes_apikey.md` — SettingsViewModel round-trip fixed in Phase 45. The Mac-side storage location is the doctor's target for the bearer check.

### Phase 55 / 56 context (sibling infra phases)
- `.planning/phases/55-auto-run-drizzle-migrations-on-railway-deploy/55-CONTEXT.md` — migrations auto-run on Railway deploy (NO-OP phase, but confirms the Railway side is self-sustaining).
- `.planning/phases/56-push-origin-on-phase-complete-for-backend-phases/56-CONTEXT.md` — `gsd phase complete` now auto-pushes vigil-core changes. Bootstrap does NOT need to handle "code on Railway is stale" — Phase 56 closed that loop.

### Vigil-core boot
- `http://localhost:3001/v1/health` — the health endpoint the bootstrap polls. Planner should confirm the exact path by reading vigil-core routing before hard-coding (the port might be configurable).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`sync-anthropic-key.sh`** — exact pattern for "canonical config.json → downstream sinks" sync. Bootstrap calls it after 1P restore. Doctor's read-side checks must match its write-side targets (same file paths, same field names).
- **`install.sh`** — already idempotent, already handles LaunchAgent bootout/load, already cleans up legacy plists. Bootstrap delegates the entire Mac-side install to it without reimplementing.
- **`build.sh`** — already does swift build + codesign. install.sh already calls it.
- **Inline `/usr/bin/python3 -c` pattern** from `sync-anthropic-key.sh` — for parsing config.json in bash. Match this pattern; do not introduce `jq` as a new dependency unless planner confirms it's already required elsewhere.

### Established Patterns
- **`set -euo pipefail`** at the top of bash scripts (install.sh uses this, sync-anthropic-key.sh uses this).
- **`SCRIPT_DIR` + `PROJECT_DIR` derivation** at the top of every existing script — use identical bash.
- **`=== Section ===` header echo style** in setup.sh and install.sh. Bootstrap output should match for visual consistency.
- **Graceful fallback when external CLI missing** — `sync-anthropic-key.sh` skips Railway if `railway` CLI not installed. Match this pattern for every external tool check.
- **Exit codes:** 0 = success, non-zero = fail loud. install.sh uses `set -e`; bootstrap should too.

### Integration Points
- `scripts/bootstrap.sh` — new file, called as `./scripts/bootstrap.sh` from the repo root.
- `scripts/dailybrief-doctor.sh` — new file, same location, same conventions.
- No changes to existing scripts, no changes to vigil-core source, no changes to Mac app source.
- No changes to `.planning/config.json` (D-06).
- 1Password vault — three new items created by the user BEFORE running bootstrap on a fresh machine (doc the item names and expected contents in the bootstrap.sh preamble comment).

### Constraints to respect
- **Idempotent on re-run.** A user running bootstrap.sh on an already-set-up machine should see "everything OK" or granular skip messages, not errors.
- **Fail loud, not silent.** Matches D-05 and the debugging-style principle from user memory. Never swallow an error and continue.
- **Don't hide secrets but don't print them either.** Doctor prefixes only, bootstrap never echoes key material to stdout.
- **Respect install.sh's "don't double-build" logic** — call it once, not inline-copy its steps.

</code_context>

<specifics>
## Specific Ideas

- The bootstrap.sh banner should name-drop the drift-detection purpose: "Vigil dev bootstrap — restores secrets, builds everything, verifies /v1/health". Makes it clear this is the happy-path entry point, not a mysterious "setup" command.
- The doctor's drift-detected message should include the exact heal command: `./scripts/sync-anthropic-key.sh` for Anthropic drift; for bearer drift, the heal path may not exist yet (document as "manual: edit config.json + restart Mac apps").
- The 1Password vault item names are a contract with the user's vault, not with code — document them VERY loudly in the bootstrap.sh comment header so the user knows what to name their items.
- Real validation of this phase happens when the user next provisions a machine. Until then, the verify-work UAT is running bootstrap.sh on the current machine (where everything already exists) and confirming it's idempotent — runs green without changing any behavior.

</specifics>

<deferred>
## Deferred Ideas

### Per-secret granular rotation
A `rotate-key.sh --which <key>` tool that rotates any individual secret (vigil bearer, gmail app password, IMAP, etc.) across its storage locations. Today only ANTHROPIC_API_KEY has sync-anthropic-key.sh. Other secrets rotate rarely (vigil bearer is project-local; gmail app password is stable). Deferred until a rotation event actually bites.

### Windows / Linux support
Not a Vigil goal. Workstation is macOS.

### CI-driven fresh-machine validation
Spinning up a fresh macOS VM in CI to test bootstrap.sh end-to-end. Expensive, complex, and the real test is "user provisions a new machine" which happens rarely. Deferred indefinitely.

### Homebrew tap / single-binary distribution
A `brew install vigil` that bundles bootstrap.sh as an entry point. Nice-to-have but over-engineered for one person's dev workstation. Deferred.

### Auto-install of system dependencies (`op`, node, swift)
Bootstrap intentionally does NOT try to install `brew`, `op`, `node`, or `xcode-select` itself — those are system-level and the user must have them. Too much risk auto-installing things at that level. Bootstrap prints the exact `brew install` recipes and exits; this is the documented behavior.

### Schema versioning for config.json
As the config grows, older `vigil-config` 1P documents may drift from current code expectations. A migration helper that upgrades an old config.json shape to the current shape. Relevant when the project has multiple users; not yet.

### Drift auto-heal
Having `dailybrief-doctor.sh` not just report drift but auto-fix it. Rejected per D-11 — doctor is read-only, healing lives in sync-anthropic-key.sh. Keeping them separate matches the unix-tool composition style.

### Telemetry / bootstrap success reporting
Sending a "bootstrap succeeded on machine X" ping somewhere. Noise, not signal, for a solo dev tool.

</deferred>

---

*Phase: 57-cross-machine-bootstrap-script*
*Context gathered: 2026-04-08*
*Supersedes the backlog seed file (999.1 promotion)*
