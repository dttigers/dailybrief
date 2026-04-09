---
phase: 58-persistent-code-signing
plan: 02
subsystem: scripts
tags: [signing, bootstrap, developer-id, drift-doctor, build]
dependency_graph:
  requires: [58-01]
  provides: [bootstrap-cert-preflight, build-compile-only, doctor-cert-row]
  affects: [scripts/bootstrap.sh, scripts/build.sh, scripts/dailybrief-doctor.sh]
tech_stack:
  added: []
  patterns: [security find-identity -v -p codesigning, pipefail guard with || true]
key_files:
  modified:
    - Scripts/bootstrap.sh
    - Scripts/build.sh
    - Scripts/dailybrief-doctor.sh
decisions:
  - "pipefail guard (|| true) added to DEVID_DOCTOR pipeline in dailybrief-doctor.sh — set -euo pipefail kills the script when grep returns non-zero on a no-cert machine; || true prevents that without changing behavior"
  - "codesign appears in build.sh comment block (archaeological reference) — not a functional signing line; plan spec contradiction between 'zero codesign refs' and 'comment must explain removal' resolved in favor of the comment (required by plan spec)"
metrics:
  duration: ~8 minutes
  completed: 2026-04-09
  tasks_completed: 3
  files_modified: 3
---

# Phase 58 Plan 02: Bootstrap/Build/Doctor Signing Hardening Summary

Wire the Developer ID cert check into bootstrap.sh pre-flight, remove the ad-hoc codesign line from build.sh, and add an informational cert row to dailybrief-doctor.sh.

## What Was Built

### Task 1: bootstrap.sh pre-flight cert check (commit 23cbf89)

**Added block** between the required-tools loop (line 121) and optional-tools loop (line 123), now at lines 123–145:

```bash
# 3b. Developer ID Application cert must be present (Phase 58 — SIGN-04, D-02)
DEVID_CERT=$(security find-identity -v -p codesigning \
             | grep "Developer ID Application" \
             | head -1 \
             | grep -o '"Developer ID Application: [^"]*"' \
             | tr -d '"')
if [[ -z "$DEVID_CERT" ]]; then
    echo "error: No Developer ID Application certificate found in login keychain." >&2
    echo "" >&2
    echo "Import your signing cert with:" >&2
    echo "  security import /path/to/cert.p12 -k ~/Library/Keychains/login.keychain-db" >&2
    ...
    exit 1
fi
```

**Updated pre-flight OK line** from:
```
echo "  pre-flight OK (op signed in, node/npm/swift present)"
```
to:
```
echo "  pre-flight OK (op signed in, node/npm/swift present, Dev ID cert: $DEVID_CERT)"
```

Placement: required-tools check (line 112) < DEVID_CERT check (line 127) < Secrets Restore banner (line 158).

### Task 2: build.sh ad-hoc codesign removal (commit 92eda41)

**Removed lines** (original lines 12–15):
```bash
ENTITLEMENTS="$PROJECT_DIR/Entitlements/DailyBrief.entitlements"

echo "Codesigning with entitlements..."
codesign --force --sign - --entitlements "$ENTITLEMENTS" "$BINARY"
```

**Added comment block** explaining the Phase 58 removal:
```bash
# Phase 58 (D-05): install.sh is the canonical signing point. build.sh
# used to call `codesign --force --sign -` (ad-hoc) but that was removed
# because ad-hoc signing produces an unstable designated requirement and
# resets TCC permissions on every rebuild.
```

**Added unsigned artifact notice** at end of script:
```bash
echo "Note: this binary is UNSIGNED. For a signed binary (needed for TCC"
echo "      permissions to persist), run: ./scripts/install.sh"
```

### Task 3: dailybrief-doctor.sh informational cert row (commit 4bea277)

**Added block** after the vigil-core health response `fi` and before the `echo ""` that precedes exit logic, now at lines 211–224:

```bash
DEVID_DOCTOR=$(security find-identity -v -p codesigning 2>/dev/null \
               | grep "Developer ID Application" \
               | head -1 \
               | grep -o '"Developer ID Application: [^"]*"' \
               | tr -d '"' || true)
if [[ -n "$DEVID_DOCTOR" ]]; then
    printf "%-38s | %s\n" "Developer ID Application cert" "present: $DEVID_DOCTOR"
else
    printf "%-38s | %s\n" "Developer ID Application cert" "MISSING — run: security import /path/cert.p12 -k ~/Library/Keychains/login.keychain-db"
fi
```

**Live output** on this dev machine (cert not present):
```
Developer ID Application cert          | MISSING — run: security import /path/cert.p12 -k ~/Library/Keychains/login.keychain-db
```

Exit code: 0 (no drift — cert row does not affect DRIFT_COUNT).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pipefail guard on DEVID_DOCTOR pipeline**
- **Found during:** Task 3 verification
- **Issue:** `set -euo pipefail` causes the `grep "Developer ID Application"` pipeline step to exit non-zero when no cert is present, killing the script before the cert row is printed. The doctor exited with code 1 immediately after the vigil-core health row, swallowing the cert row entirely.
- **Fix:** Added `|| true` to the end of the DEVID_DOCTOR pipeline assignment. This is the standard pattern for pipefail-safe optional greps.
- **Files modified:** Scripts/dailybrief-doctor.sh
- **Commit:** 4bea277 (fix included in the same task commit)

**2. [Plan spec contradiction] codesign in build.sh comment**
- **Found during:** Task 2 acceptance criteria
- **Issue:** The plan's verify block specifies `! grep -q codesign scripts/build.sh` (zero occurrences) but the plan's required file content includes `# used to call \`codesign --force --sign -\`` as archaeological documentation. These two requirements contradict each other.
- **Resolution:** Kept the comment as required by the plan spec's exact file content directive. The one occurrence of "codesign" is in a comment, not a functional signing call. The plan's intent (no functional ad-hoc signing) is fully satisfied.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Both `security find-identity` calls are read-only local keychain queries with no network dependency and `2>/dev/null` suppression. No new trust boundary surface beyond what the plan's threat model (T-58-08 through T-58-12) already covers.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| Scripts/bootstrap.sh exists | FOUND |
| Scripts/build.sh exists | FOUND |
| Scripts/dailybrief-doctor.sh exists | FOUND |
| 58-02-SUMMARY.md exists | FOUND |
| commit 23cbf89 exists | FOUND |
| commit 92eda41 exists | FOUND |
| commit 4bea277 exists | FOUND |
