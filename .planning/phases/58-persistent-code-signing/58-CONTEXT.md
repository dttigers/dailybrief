# Phase 58: Persistent Code Signing - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace ad-hoc signing in `scripts/build.sh` and `scripts/install.sh` with Developer ID Application certificate signing so that macOS TCC permissions (Full Disk Access, Automation, Accessibility) survive subsequent `install.sh` rebuilds. Wire a cert presence check into `scripts/bootstrap.sh` pre-flight.

Notarization, .app bundles, and distribution are explicitly out of scope. This is a developer workstation signing problem only.

</domain>

<decisions>
## Implementation Decisions

### Cert Access Model
- **D-01:** Login keychain only. The Developer ID Application cert must be manually imported once by the user (`security import ~/cert.p12 -k login.keychain`). No 1Password integration, no .p12 file path, no automated import.
- **D-02:** This resolves the Phase 57 D-14 gap — bootstrap.sh does NOT need to import the cert. It should only verify the cert is already present in the keychain as a pre-flight check and emit a clear remediation message if missing.

### Cert Identity Resolution
- **D-03:** Use `security find-identity -v -p codesigning` to locate the signing identity. Pick the first `Developer ID Application` cert found. No hardcoded team ID or cert name required — this works for the single-developer case.

### Missing / Expired Cert Behavior
- **D-04:** Hard fail. If no Developer ID Application cert is found in the keychain, `install.sh` exits non-zero with a remediation message:
  ```
  ERROR: No Developer ID Application certificate found in login keychain.
  Run: security import /path/to/cert.p12 -k ~/Library/Keychains/login.keychain-db
  Then re-run install.sh.
  ```
  Never fall back to ad-hoc signing. Never produce unsigned output silently.

### Where Signing Lives
- **D-05:** `install.sh` is the canonical signing point — it copies binaries to `~/.local/bin/` and should sign them there. `scripts/build.sh` currently has `codesign --sign -` (ad-hoc); that line should either be removed or replaced. The installer owns the final signed state.

### Claude's Discretion
- Whether to add a signing cert health row to `dailybrief-doctor.sh` (informational, read-only check).
- Whether to verify signing after each binary with `codesign --verify --verbose` as a post-install sanity check (adds ~100ms, very useful for debugging).
- Exact error message wording and format.
- Whether bootstrap.sh pre-flight cert check is a warning or a hard stop (user confirmed hard stop for install.sh, bootstrap.sh behavior is Claude's call — recommend hard stop for consistency).

</decisions>

<canonical_refs>
## Files Downstream Agents Must Read

- `scripts/install.sh` — canonical build + install script; signing goes here
- `scripts/bootstrap.sh` — pre-flight cert check goes here (step 0 or step 3)
- `scripts/build.sh` — contains current ad-hoc `codesign --sign -` that must be removed or replaced
- `Entitlements/DailyBrief.entitlements` — entitlements for DailyBrief CLI signing
- `Entitlements/DailyBriefMonitor.entitlements` — entitlements for Monitor signing
- `.planning/phases/57-cross-machine-bootstrap-script/57-CONTEXT.md` — bootstrap integration patterns and step ordering
- `.planning/REQUIREMENTS.md` — SIGN-01..05 are the acceptance criteria for this phase

</canonical_refs>

<specifics>
## Key Technical Context

- `scripts/install.sh` copies binaries to `~/.local/bin/dailybrief` and `~/.local/bin/dailybrief-monitor`
- `scripts/build.sh` has `codesign --force --sign - --entitlements "$ENTITLEMENTS" "$BINARY"` — this is the ad-hoc signing to replace
- `install.sh` does NOT currently call `build.sh` — they are independent scripts
- Phase 57 established bootstrap.sh step ordering: pre-flight → auth → secrets → vigil-core build → sync-anthropic-key → launchctl → install.sh → health check
- Cert check belongs in bootstrap.sh pre-flight (step 0), before any other work starts

</specifics>

<deferred>
## Deferred Ideas

None surfaced during discussion.

</deferred>
