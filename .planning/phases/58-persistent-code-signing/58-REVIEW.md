---
phase: 58-persistent-code-signing
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - Entitlements/DailyBriefMonitor.entitlements
  - scripts/install.sh
  - scripts/bootstrap.sh
  - scripts/build.sh
  - scripts/dailybrief-doctor.sh
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 58: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 58 adds Developer ID Application signing to the install/bootstrap pipeline and
strips the incompatible CloudKit entitlements from `DailyBriefMonitor.entitlements`.
The core signing guard logic is correct — `security find-identity -v` with hard fail
and a clear remediation message is the right pattern. The `codesign --verify` post-check
is correct. The entitlements cleanup is clean.

Three warnings require attention before this can be considered production-ready for
notarization or multi-machine deployment:

1. `codesign` calls are missing `--timestamp` — required for Developer ID binaries
   that need to survive cert expiry or pass Gatekeeper on other machines.
2. `bootstrap.sh` has a fragile `--force` retry fallback that silently loses the flag
   on the retry path.
3. `build.sh` is missing `pipefail`, a minor inconsistency with the other scripts.

---

## Warnings

### WR-01: Missing `--timestamp` on all `codesign` calls (install.sh:79, 94)

**File:** `scripts/install.sh:79-98`

**Issue:** Both `codesign --force --sign "$IDENTITY" ...` invocations omit `--timestamp`.
For Developer ID Application signing, Apple's Gatekeeper uses the secure timestamp to
verify the signature is valid even after the signing certificate expires. Without it:
- `codesign` defaults to no timestamp on macOS 13+.
- Notarization (`xcrun notarytool`) will reject the binary.
- On another machine (e.g., the Intel MacBook Pro at 192.168.1.136), Gatekeeper may
  reject the binary if it checks revocation and the cert is no longer in the window.
- This defeats a primary goal of Phase 58: persistent TCC permissions across machines.

**Fix:**
```bash
codesign --force \
         --sign "$IDENTITY" \
         --timestamp \
         --identifier "com.jamesonmorrill.dailybrief" \
         --entitlements "$REPO_DIR/Entitlements/DailyBrief.entitlements" \
         "$INSTALL_DIR/DailyBrief"
```

Apply the same `--timestamp` flag to the `DailyBriefMonitor` signing block at line 94.

---

### WR-02: `op document get` fallback silently drops `--force` (bootstrap.sh:179-180)

**File:** `scripts/bootstrap.sh:179-180`

**Issue:** The `restore_op_document` function tries `--force` first, falls back on error
to a second call without `--force`:
```bash
op document get "$item" --out "$out_path" --force 2>/dev/null \
    || op document get "$item" --out "$out_path"
```
The intent is to handle `op` versions that don't support `--force`. However:
- If the first call fails because the *output file already exists* and `op` refuses to
  overwrite without `--force`, the second call (without `--force`) will fail with the
  same error — silently, since the `2>/dev/null` suppresses it on the first call.
- The fallback swallows the real error. On an `op` version that does not support
  `--force`, the second call succeeds; but on an `op` version that requires `--force`,
  neither call succeeds and the script will exit non-zero with a confusing message.
- `set -euo pipefail` is active; if the second call fails, bootstrap halts here
  without a diagnostic message.

**Fix:** Remove the fragile two-call pattern. Use `--force` unconditionally (supported
since `op` CLI v2.x, which is the current version as of this project). If compatibility
with very old `op` versions is needed, check the version explicitly:
```bash
op document get "$item" --out "$out_path" --force
```
Or, if you need the fallback, surface the error instead of swallowing it:
```bash
op document get "$item" --out "$out_path" --force 2>&1 \
    || op document get "$item" --out "$out_path" 2>&1 \
    || { echo "error: failed to restore '$item' from 1Password" >&2; exit 1; }
```

---

### WR-03: `build.sh` missing `pipefail` and `set -u` (build.sh:2)

**File:** `scripts/build.sh:2`

**Issue:** `build.sh` uses only `set -e`. All four other Phase 58 scripts use
`set -euo pipefail`. Without `pipefail`:
- If `swift build` is piped to another command in future edits, upstream failures
  in the pipe are silently ignored.
- Without `set -u`, an unset variable reference produces an empty string instead of
  an error, which can create hard-to-debug silent failures.

This is a minor risk today (the script has no pipes and no variable references that
could be unset), but it is an inconsistency that will cause confusion when the script
is modified.

**Fix:**
```bash
#!/bin/bash
set -euo pipefail
```

---

## Info

### IN-01: `IDENTITY` extraction does not guard against multi-line cert names (install.sh:28-32)

**File:** `scripts/install.sh:28-32`

**Issue:** The pipeline:
```bash
IDENTITY=$(security find-identity -v -p codesigning \
           | grep "Developer ID Application" \
           | head -1 \
           | grep -o '"Developer ID Application: [^"]*"' \
           | tr -d '"')
```
Works correctly for normal cert names. However, if the cert subject contains a
double-quote character (non-standard but technically possible in a crafted cert), the
inner `grep -o '"Developer ID Application: [^"]*"'` regex would stop at the first
embedded quote, producing a truncated identity string. `codesign --sign` would then
fail with "identity not found". The hard-fail guard at line 34 catches this, so it
cannot produce a silently-wrong result — it would just fail loudly.

Bootstrap.sh has the identical extraction at line 127 with the same behavior.

**Fix:** No change needed for correctness today (hard fail covers it). If you ever
encounter this, add a diagnostic print of the raw `security find-identity` output in
the error branch.

---

### IN-02: `codesign --verify --verbose` sends output to stdout via `2>&1` (install.sh:84, 99)

**File:** `scripts/install.sh:84-85`, `99-100`

**Issue:**
```bash
codesign --verify --verbose "$INSTALL_DIR/DailyBrief" 2>&1 \
    || { echo "ERROR: DailyBrief signature verification failed." >&2; exit 1; }
```
On success, `codesign --verify --verbose` prints signature info to stderr. Redirecting
`2>&1` merges it into stdout, so it appears in the terminal output but is not preserved
if stdout is piped or logged. On failure, the useful diagnostic output (what went wrong)
is merged into stdout before the `||` branch runs — meaning the error message may
appear before the `ERROR:` line, which could look confusing in a CI log.

**Fix:** Add `--deep` if you want to check embedded frameworks, and consider capturing
stderr separately for clean failure messages:
```bash
if ! codesign --verify --verbose "$INSTALL_DIR/DailyBrief" 2>&1; then
    echo "ERROR: DailyBrief signature verification failed." >&2
    exit 1
fi
```
This is stylistic — the current pattern is functionally correct.

---

### IN-03: Entitlements file is an empty dict with no `com.apple.security.app-sandbox` key (DailyBriefMonitor.entitlements)

**File:** `Entitlements/DailyBriefMonitor.entitlements`

**Issue:** The entitlements file is now an empty `<dict>`. This is correct for a
non-sandboxed Developer ID binary — you do not need to declare `app-sandbox = false`
explicitly. However, `codesign` will embed an entitlements blob with no keys, which
is semantically identical to passing no `--entitlements` flag at all.

This is fine. The comment in the file is clear about why CloudKit keys were removed.
One risk worth noting: if a future developer adds an entitlement to the file thinking
it is "the Monitor entitlements" without reading the comment, they may add keys
incompatible with Developer ID and reintroduce the Phase 58 blocker.

**Fix:** Consider adding a single inline comment inside the `<dict>` body (already
done — the XML comments above the `<dict>` are sufficient). No code change required.
The current state is intentionally empty and correct.

---

## Not Found / Confirmed Clean

The following potential issues were checked and are **not present**:

- **Injection in codesign args:** `$IDENTITY` is double-quoted at all use sites. The
  value comes from `security find-identity`, not user input. Low risk.
- **Unquoted path variables in shell commands:** All `$INSTALL_DIR`, `$REPO_DIR`,
  `$LOG_DIR` uses are double-quoted.
- **Hardcoded secrets:** None found. Secrets are read from config.json / 1Password;
  no credentials appear in script literals.
- **Heredoc plist path injection:** Paths expand into XML `<string>` content. Spaces
  in paths are valid XML and are correctly handled by launchd plist parsing.
- **`set -e` interaction with `|| true` guards:** All `launchctl bootout` calls use
  `2>/dev/null || true` correctly to suppress expected failures.
- **Python inline scripts (bootstrap.sh:188, doctor.sh:89-94, 162-167):**
  `$CONFIG_JSON` is passed as `sys.argv[1]`, not interpolated into Python code.
  Safe from injection.
- **Doctor exit code for VIGIL_BEARER empty string:** Correctly increments
  `DRIFT_COUNT` and the `[[ -n "$VIGIL_BEARER" ]]` guard works as intended.

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
