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
    - scripts/install.sh

key-decisions:
  - "Sign after cp to install destination, never sign .build/release (cp would strip signature)"
  - "No --timestamp flag (offline-safe; trusted timestamp only required for notarization, not local signing)"
  - "No -o runtime (hardened runtime not required for TCC stability, not in scope)"
  - "Hard fail on empty IDENTITY — never fall back to ad-hoc --sign - which resets TCC on every rebuild"
  - "CloudKit entitlements removed from DailyBriefMonitor: dead code incompatible with Developer ID signing"

patterns-established:
  - "Phase 58 signing pattern: cert guard → swift build → cp → codesign --force → codesign --verify"

requirements-completed: [SIGN-01, SIGN-02, SIGN-03, SIGN-05]

# Metrics
duration: ~30min (including human verification)
completed: 2026-04-09
---

# Phase 58 Plan 01: Persistent Code Signing Summary

**Developer ID Application signing wired into install.sh with cert guard, codesign --force after cp, and codesign --verify — eliminates the TCC permission reset on every rebuild**

## Performance

- **Duration:** ~30 min (including human verification round-trip)
- **Started:** 2026-04-09T15:04:34Z
- **Completed:** 2026-04-09 (all 3 tasks complete, human verification approved)
- **Tasks:** 3/3 complete
- **Files modified:** 2

## Accomplishments

- Stripped `com.apple.developer.icloud-services` and `com.apple.developer.icloud-container-identifiers` from `DailyBriefMonitor.entitlements` — these were incompatible with Developer ID signing and dead code (no `import CloudKit` anywhere in the project)
- Added Developer ID cert guard to `install.sh` that resolves identity via `security find-identity -v -p codesigning`, hard-fails with `security import` remediation if no cert found, and runs BEFORE `swift build` so missing-cert failures abort early
- Added two `codesign --force --sign "$IDENTITY" --identifier ...` calls (one per binary) after each `cp` to the install destination, followed by `codesign --verify --verbose` with non-zero exit propagation
- Human verification completed: all six checks passed

## Task Commits

Each task was committed atomically:

1. **Task 1: Strip CloudKit entitlements from DailyBriefMonitor.entitlements** - `079034b` (feat)
2. **Task 2: Add cert guard + Developer ID signing + verify to install.sh** - `ab8c09a` (feat)
3. **Task 3: Human verification — signed binaries + TCC persistence** - `0228dfd` (feat, checkpoint approved)

## Files Created/Modified

- `Entitlements/DailyBriefMonitor.entitlements` - Empty-dict plist (CloudKit keys removed; comment documents Phase 58 removal)
- `scripts/install.sh` - Added cert guard block (before swift build), CLI sign+verify block (after CLI cp), Monitor sign+verify block (after Monitor cp), signature inspect hint in summary

## install.sh Changes: Four Insertion Points

1. **Cert guard block** — inserted after `=== DailyBrief Installer ===` banner, before `# 0. Clean up old CLI LaunchAgent`. Uses `security find-identity -v -p codesigning | grep "Developer ID Application" | head -1`. Hard-fails with `exit 1` and remediation message if `$IDENTITY` is empty.

2. **CLI sign + verify** — inserted after `cp -f "$REPO_DIR/.build/release/DailyBrief" "$INSTALL_DIR/DailyBrief"`. Uses `--identifier "com.jamesonmorrill.dailybrief"` and `--entitlements Entitlements/DailyBrief.entitlements`.

3. **Monitor sign + verify** — inserted after `cp -f "$REPO_DIR/.build/release/DailyBriefMonitor" "$INSTALL_DIR/DailyBriefMonitor"`. Uses `--identifier "com.jamesonmorrill.dailybriefmonitor"` and `--entitlements Entitlements/DailyBriefMonitor.entitlements` (now empty-dict).

4. **Summary hint** — `echo "  Inspect signature: codesign -dvv $INSTALL_DIR/DailyBrief"` added before the launchctl status line.

## Resolved Developer ID Identity

**Identity used:** `Developer ID Application: Jameson Morrill (5H57ADQS8G)`
**TeamIdentifier:** `5H57ADQS8G`

## Verified codesign -dvv Output

### DailyBrief (`~/.local/bin/DailyBrief`)

```
Identifier=com.jamesonmorrill.dailybrief
Authority=Developer ID Application: Jameson Morrill (5H57ADQS8G)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=5H57ADQS8G
```

### DailyBriefMonitor (`~/.local/bin/DailyBriefMonitor`)

```
Identifier=com.jamesonmorrill.dailybriefmonitor
Authority=Developer ID Application: Jameson Morrill (5H57ADQS8G)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=5H57ADQS8G
```

## DR Stability Confirmation

Running `./scripts/install.sh` twice back-to-back and diffing the designated requirements with `diff <(codesign -d -r- DailyBrief) <(codesign -d -r- DailyBrief_rebuilt)` produced an empty diff — **DR STABLE**.

The stable DR is the mechanism that allows macOS TCC to match the reinstalled binary against existing permission grants. This confirms SIGN-02 and SIGN-03 are met.

## TCC Persistence Confirmation

Full Disk Access for DailyBriefMonitor was granted once before running `./scripts/install.sh`. After the rebuild, System Settings → Privacy & Security → Full Disk Access confirmed DailyBriefMonitor was **still listed and still toggled on** — macOS did NOT remove the grant and did NOT re-prompt. This is the primary goal of Phase 58.

## Missing-Cert Hard Fail Confirmation

Running `./scripts/install.sh` with the login keychain locked (simulating no cert present) produced:

```
ERROR: No Developer ID Application certificate found in login keychain.

Import your signing cert with:
  security import /path/to/cert.p12 -k ~/Library/Keychains/login.keychain-db

Then re-run: ./scripts/install.sh
```

Exit code: non-zero (exit 1). `swift build` did NOT run — the abort happened before the build step. This confirms SIGN-05.

## Decisions Made

- No `--timestamp` flag (Pitfall 6 from 58-RESEARCH.md: timestamp server call fails offline; local signing doesn't need it)
- No `-o runtime` (hardened runtime not required for TCC stability, not in scope)
- Sign the installed copy in `~/.local/bin/`, never `.build/release/` (Pitfall 1: cp strips signatures)
- `security find-identity -v` (with `-v`) excludes expired certs — critical for deterministic single-match behavior

## Deviations from Plan

None — plan executed exactly as written.

Note: The acceptance criterion `grep -c CloudKit Entitlements/DailyBriefMonitor.entitlements` returning 0 conflicts with the plan's `<action>` block which specifies verbatim content including `<!-- CloudKit entitlements removed ... -->` in a comment. The comment is XML comment markup (not an entitlement key) and the plist contains zero actual CloudKit entitlement keys. The file is correct per the `<action>` spec; the grep-zero criterion was an oversight in the test script — it checks XML comments, not entitlement keys.

## Human Verification: APPROVED

All six verification checks passed:
1. Developer ID Application cert present (Authority=Developer ID Application: Jameson Morrill (5H57ADQS8G), TeamIdentifier=5H57ADQS8G)
2. `install.sh` built, signed both binaries, exited 0
3. `codesign -dvv` showed `Authority=Developer ID Application` for both binaries with correct Identifier and TeamIdentifier
4. DR stable across two back-to-back `install.sh` runs (diff empty, printed "DR STABLE")
5. TCC permission (Full Disk Access for DailyBriefMonitor) persisted across rebuild — still toggled on after reinstall
6. Missing-cert hard fail produced exit 1 before `swift build` ran

## Self-Check: PASSED

- `Entitlements/DailyBriefMonitor.entitlements` exists: FOUND
- `scripts/install.sh` exists: FOUND
- Commit `079034b` (Task 1): FOUND
- Commit `ab8c09a` (Task 2): FOUND
- Commit `0228dfd` (Task 3 checkpoint approval): FOUND

---
*Phase: 58-persistent-code-signing*
*Completed: 2026-04-09 — all 3 tasks complete, human verification approved*
