---
phase: 58-persistent-code-signing
plan: 01
subsystem: infra
tags: [codesign, developer-id, tcc, entitlements, bash, macos]

# Dependency graph
requires:
  - phase: 57-cross-machine-bootstrap-script
    provides: bootstrap.sh step ordering and cert pre-flight context
provides:
  - DailyBriefMonitor.entitlements cleaned of CloudKit keys (empty-dict, Developer ID compatible)
  - install.sh with cert guard + Developer ID signing + verify for both binaries
  - Hard-fail on missing cert with security import remediation message
affects: [58-02, bootstrap.sh cert pre-flight check, any future install.sh modifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "codesign after cp: always sign the installed copy, not .build/release (cp strips signatures)"
    - "security find-identity -v -p codesigning: -v filters expired certs, grep scopes to Developer ID Application"
    - "hard-fail cert guard before swift build: abort early, never produce unsigned output silently"

key-files:
  created: []
  modified:
    - Entitlements/DailyBriefMonitor.entitlements
    - Scripts/install.sh

key-decisions:
  - "Sign after cp to install destination, never sign .build/release (cp would strip signature)"
  - "No --timestamp flag (offline-safe; trusted timestamp only required for notarization, not local signing)"
  - "No -o runtime (hardened runtime not in scope for this phase)"
  - "Hard fail on empty IDENTITY — never fall back to ad-hoc --sign - which resets TCC on every rebuild"
  - "CloudKit entitlements removed from DailyBriefMonitor: dead code incompatible with Developer ID signing"

patterns-established:
  - "Phase 58 signing pattern: cert guard → swift build → cp → codesign --force → codesign --verify"

requirements-completed: [SIGN-01, SIGN-02, SIGN-03, SIGN-05]

# Metrics
duration: 3min
completed: 2026-04-09
---

# Phase 58 Plan 01: Persistent Code Signing Summary

**Developer ID Application signing wired into install.sh with cert guard, codesign --force after cp, and codesign --verify — eliminates the TCC permission reset on every rebuild**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-09T15:04:34Z
- **Completed:** 2026-04-09T15:06:45Z
- **Tasks:** 2/3 complete (Task 3 is human-verify checkpoint — awaiting user confirmation)
- **Files modified:** 2

## Accomplishments

- Stripped `com.apple.developer.icloud-services` and `com.apple.developer.icloud-container-identifiers` from `DailyBriefMonitor.entitlements` — these were incompatible with Developer ID signing and dead code (no `import CloudKit` anywhere in the project)
- Added Developer ID cert guard to `install.sh` that resolves identity via `security find-identity -v -p codesigning`, hard-fails with `security import` remediation if no cert found, and runs BEFORE `swift build` so missing-cert failures abort early
- Added two `codesign --force --sign "$IDENTITY" --identifier ...` calls (one per binary) after each `cp` to the install destination, followed by `codesign --verify --verbose` with non-zero exit propagation

## Task Commits

Each task was committed atomically:

1. **Task 1: Strip CloudKit entitlements from DailyBriefMonitor.entitlements** - `079034b` (feat)
2. **Task 2: Add cert guard + Developer ID signing + verify to install.sh** - `ab8c09a` (feat)
3. **Task 3: Human verification — signed binaries + TCC persistence** - PENDING CHECKPOINT

## Files Created/Modified

- `Entitlements/DailyBriefMonitor.entitlements` - Empty-dict plist (CloudKit keys removed; comment documents Phase 58 removal)
- `Scripts/install.sh` - Added cert guard block (before swift build), CLI sign+verify block (after CLI cp), Monitor sign+verify block (after Monitor cp), signature inspect hint in summary

## install.sh Changes: Four Insertion Points

1. **Cert guard block** — inserted after `=== DailyBrief Installer ===` banner, before `# 0. Clean up old CLI LaunchAgent`. Uses `security find-identity -v -p codesigning | grep "Developer ID Application" | head -1`. Hard-fails with `exit 1` and remediation message if `$IDENTITY` is empty.

2. **CLI sign + verify** — inserted after `cp -f "$REPO_DIR/.build/release/DailyBrief" "$INSTALL_DIR/DailyBrief"`. Uses `--identifier "com.jamesonmorrill.dailybrief"` and `--entitlements Entitlements/DailyBrief.entitlements`.

3. **Monitor sign + verify** — inserted after `cp -f "$REPO_DIR/.build/release/DailyBriefMonitor" "$INSTALL_DIR/DailyBriefMonitor"`. Uses `--identifier "com.jamesonmorrill.dailybriefmonitor"` and `--entitlements Entitlements/DailyBriefMonitor.entitlements` (now empty-dict).

4. **Summary hint** — `echo "  Inspect signature: codesign -dvv $INSTALL_DIR/DailyBrief"` added before the launchctl status line.

## Decisions Made

- No `--timestamp` flag (Pitfall 6 from 58-RESEARCH.md: timestamp server call fails offline; local signing doesn't need it)
- No `-o runtime` (hardened runtime not required for TCC stability, not in scope)
- Sign the installed copy in `~/.local/bin/`, never `.build/release/` (Pitfall 1: cp strips signatures)
- `security find-identity -v` (with `-v`) excludes expired certs — critical for deterministic single-match behavior

## Deviations from Plan

None — plan executed exactly as written.

Note: The acceptance criterion `grep -c CloudKit Entitlements/DailyBriefMonitor.entitlements` returning 0 conflicts with the plan's `<action>` block which specifies verbatim content including `<!-- CloudKit entitlements removed ... -->` in a comment. The comment is XML comment markup (not an entitlement key) and the plist contains zero actual CloudKit entitlement keys. The file is correct per the `<action>` spec; the grep-zero criterion was an oversight in the test script — it checks XML comments, not entitlement keys.

## Checkpoint: Task 3 — Human Verification Required

**Status:** AWAITING USER

Task 3 is a `checkpoint:human-verify gate="blocking"` that requires physical interaction with:
- macOS login keychain (to confirm Developer ID cert is present)
- System Settings → Privacy & Security → Full Disk Access (to verify TCC persistence)

**Six-step verification protocol for the user:**

1. **Confirm cert present:**
   ```bash
   security find-identity -v -p codesigning | grep "Developer ID Application"
   ```
   Expected: at least one line matching `"Developer ID Application: Your Name (TEAMID)"`.

2. **Run install.sh** (first run may trigger keychain GUI prompt — click "Always Allow"):
   ```bash
   ./scripts/install.sh
   ```
   Expected: prints `Signing identity: Developer ID Application: ...`, signs both binaries, exits 0.

3. **Inspect signatures:**
   ```bash
   codesign -dvv ~/.local/bin/DailyBrief 2>&1 | grep -E "Authority|Identifier|TeamIdentifier"
   codesign -dvv ~/.local/bin/DailyBriefMonitor 2>&1 | grep -E "Authority|Identifier|TeamIdentifier"
   ```
   Expected: `Authority=Developer ID Application: ...`, correct Identifier and TeamIdentifier for both.

4. **Confirm DR stable across rebuilds:**
   ```bash
   codesign -d -r- ~/.local/bin/DailyBrief 2>&1 > /tmp/dr_1.txt
   ./scripts/install.sh
   codesign -d -r- ~/.local/bin/DailyBrief 2>&1 > /tmp/dr_2.txt
   diff /tmp/dr_1.txt /tmp/dr_2.txt && echo "DR STABLE" || echo "DR CHANGED — BUG"
   ```
   Expected: `DR STABLE`.

5. **TCC persistence check:** Grant Full Disk Access to DailyBriefMonitor if not already granted. Run `./scripts/install.sh` again. Confirm DailyBriefMonitor is still listed and toggled on in System Settings → Privacy & Security → Full Disk Access.

6. **Missing-cert hard fail:**
   ```bash
   security lock-keychain ~/Library/Keychains/login.keychain-db
   ./scripts/install.sh
   echo "exit: $?"
   security unlock-keychain ~/Library/Keychains/login.keychain-db
   ```
   Expected: `ERROR: No Developer ID Application certificate found` and non-zero exit.

**Resume signal:** Reply with "approved" if all six checks pass, or describe any failure.

## Issues Encountered

None.

## Next Phase Readiness

- Task 1 and Task 2 complete and committed
- Human verification (Task 3) pending — user must run the six-step protocol above
- Phase 58 Plan 02 (`bootstrap.sh` cert pre-flight check) can proceed independently of this checkpoint

---
*Phase: 58-persistent-code-signing*
*Completed: 2026-04-09 (Tasks 1-2 complete; Task 3 checkpoint pending human verification)*
