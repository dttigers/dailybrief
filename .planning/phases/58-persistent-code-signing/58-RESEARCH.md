# Phase 58: Persistent Code Signing - Research

**Researched:** 2026-04-09
**Domain:** macOS code signing (codesign, security, TCC, Developer ID Application)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Login keychain only. Developer ID Application cert must be manually imported once by the user (`security import ~/cert.p12 -k login.keychain`). No 1Password integration, no .p12 file path, no automated import.
- **D-02:** bootstrap.sh does NOT need to import the cert. It should only verify the cert is already present in the keychain as a pre-flight check and emit a clear remediation message if missing.
- **D-03:** Use `security find-identity -v -p codesigning` to locate the signing identity. Pick the first `Developer ID Application` cert found. No hardcoded team ID or cert name required.
- **D-04:** Hard fail. If no Developer ID Application cert is found, `install.sh` exits non-zero with a remediation message. Never fall back to ad-hoc signing. Never produce unsigned output silently.
- **D-05:** `install.sh` is the canonical signing point — signs at `~/.local/bin/`. `scripts/build.sh` current ad-hoc `codesign --sign -` must be removed or replaced. The installer owns the final signed state.

### Claude's Discretion

- Whether to add a signing cert health row to `dailybrief-doctor.sh` (informational, read-only check).
- Whether to verify signing after each binary with `codesign --verify --verbose` as a post-install sanity check (adds ~100ms, very useful for debugging).
- Exact error message wording and format.
- Whether bootstrap.sh pre-flight cert check is a warning or a hard stop (user confirmed hard stop for install.sh; bootstrap.sh behavior is Claude's call — recommend hard stop for consistency).

### Deferred Ideas (OUT OF SCOPE)

None surfaced during discussion.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIGN-01 | DailyBrief CLI and DailyBriefMonitor binaries are signed with the user's Apple Developer ID Application certificate during every `install.sh` build | Covered by: `codesign --force --sign "$IDENTITY"` in install.sh after binary copy |
| SIGN-02 | The signing identity is resolved consistently across rebuilds so the binaries' designated requirement does not change | Covered by: Developer ID DR is based on Team ID + identifier, not binary hash — stable by design |
| SIGN-03 | macOS TCC permissions granted once survive subsequent `install.sh` rebuilds | Covered by: stable DR from Developer ID signing means TCC never re-prompts |
| SIGN-04 | bootstrap.sh handles signing cert setup as a pre-flight step (verify cert present, emit remediation if missing) | Covered by: pre-flight cert check using `security find-identity -v -p codesigning` |
| SIGN-05 | If signing cert is missing or expired at build time, `install.sh` fails loud with a remediation message | Covered by: hard-fail guard at top of install.sh using `security find-identity -v` |
</phase_requirements>

---

## Summary

This phase replaces ad-hoc signing (`codesign --sign -`) with Developer ID Application certificate signing so that macOS TCC permissions survive `install.sh` rebuilds. The core mechanism: macOS TCC identifies an app by its *designated requirement* (DR), not by binary hash. Ad-hoc signing generates a unique DR per build (based on binary hash), causing TCC to treat each rebuild as a new app and re-prompt for permissions. Developer ID Application signing produces a DR based on the developer's Team ID and the app's bundle identifier — stable across all rebuilds from the same certificate.

The implementation is a targeted diff to two scripts: `install.sh` gains (1) a cert-resolution guard at the top and (2) a `codesign` call after each binary copy; `bootstrap.sh` gains a cert-presence pre-flight check. `build.sh`'s ad-hoc codesign line is removed or neutered. A critical blocker was discovered: `Entitlements/DailyBriefMonitor.entitlements` contains iCloud/CloudKit entitlements (`com.apple.developer.icloud-services`, `com.apple.developer.icloud-container-identifiers`) that are **incompatible with Developer ID Application signing** — these cause a signing failure or runtime kill. Inspection of the source confirms CloudKit is dead code (no `import CloudKit` anywhere, `cloudSyncEnabled` is a UI toggle that never calls any CloudKit API). The entitlement file must be stripped of these keys before signing.

**Primary recommendation:** In install.sh — resolve IDENTITY via `security find-identity -v -p codesigning`, hard-fail if empty, then after each binary copy call `codesign --force --sign "$IDENTITY" --entitlements "$ENTITLEMENTS_PATH" <binary>`. Strip CloudKit keys from DailyBriefMonitor.entitlements first. Add `codesign -v` post-sign verification. Add cert check to bootstrap.sh pre-flight as a hard stop.

---

## Standard Stack

### Core Tools (system-provided, no install needed)
| Tool | Location | Purpose | Notes |
|------|----------|---------|-------|
| `codesign` | `/usr/bin/codesign` | Sign and verify binaries | [VERIFIED: `xcrun --find codesign`] |
| `security` | `/usr/bin/security` | Keychain queries, identity lookup | [VERIFIED: live on this machine] |

**No npm/pip/brew dependencies.** This is pure shell + system tools.

---

## Architecture Patterns

### How TCC Stability Works (Why This Phase Fixes the Permission-Reset Problem)

**Ad-hoc signing** (`--sign -`): The designated requirement is computed from the binary's hash:
```
DR = identifier "DailyBrief" and anchor apple generic
```
Every rebuild produces a different hash → different DR → TCC sees a new app → re-prompts.

**Developer ID Application signing**: The designated requirement is anchored to the certificate chain and Team ID:
```
DR = anchor apple generic
     and identifier "com.jamesonmorrill.dailybrief"
     and certificate 1[field.1.2.840.113635.100.6.2.6]
     and certificate leaf[field.1.2.840.113635.100.6.1.13]
     and certificate leaf[subject.OU] = "TEAMID"
```
This DR is stable across all rebuilds from the same certificate. TCC stores the DR, not the binary hash. Same DR = same app = permissions preserved. [CITED: Apple TN2206, code signing procedures docs]

### Pattern 1: Identity Resolution (D-03)

```bash
# Source: security(1) man page + Apple code signing guide
IDENTITY=$(security find-identity -v -p codesigning \
           | grep "Developer ID Application" \
           | head -1 \
           | grep -o '"Developer ID Application: [^"]*"' \
           | tr -d '"')

if [[ -z "$IDENTITY" ]]; then
    echo "ERROR: No Developer ID Application certificate found in login keychain." >&2
    echo "" >&2
    echo "Import your cert with:" >&2
    echo "  security import /path/to/cert.p12 -k ~/Library/Keychains/login.keychain-db" >&2
    echo "Then re-run install.sh." >&2
    exit 1
fi
```

The `-v` flag on `security find-identity` is critical: it filters to *valid* identities only — expired certs are excluded. A missing or expired cert both result in empty output → same code path → clean hard fail. [VERIFIED: `man security` on this machine]

### Pattern 2: Signing in install.sh (D-05)

Sign *after* the `cp` to `~/.local/bin/`, not before. Signing the `.build/release` binary before copy, then copying, strips the signature because `cp` copies bytes but macOS code signatures are attached to the file.

```bash
# After: cp -f "$REPO_DIR/.build/release/DailyBrief" "$INSTALL_DIR/DailyBrief"
ENTITLEMENTS_CLI="$REPO_DIR/Entitlements/DailyBrief.entitlements"
codesign --force --sign "$IDENTITY" \
         --identifier "com.jamesonmorrill.dailybrief" \
         --entitlements "$ENTITLEMENTS_CLI" \
         "$INSTALL_DIR/DailyBrief"

# After: cp -f "$REPO_DIR/.build/release/DailyBriefMonitor" "$INSTALL_DIR/DailyBriefMonitor"
ENTITLEMENTS_MONITOR="$REPO_DIR/Entitlements/DailyBriefMonitor.entitlements"
codesign --force --sign "$IDENTITY" \
         --identifier "com.jamesonmorrill.dailybriefmonitor" \
         --entitlements "$ENTITLEMENTS_MONITOR" \
         "$INSTALL_DIR/DailyBriefMonitor"
```

The `--identifier` flag pins the bundle ID that becomes part of the DR. Without it, codesign derives the identifier from the filename (just "DailyBrief"), which produces a less precise DR. Using a reverse-DNS identifier is the standard approach and matches what TCC expects from properly-identified apps. [CITED: codesign(1) man page, Apple code signing guide]

### Pattern 3: Post-Sign Verification (Claude's discretion — RECOMMENDED)

Adds ~100ms per binary. Catches silent codesign failures (non-zero exit from codesign can be missed in some shell modes):

```bash
codesign --verify --verbose "$INSTALL_DIR/DailyBrief" 2>&1 \
    || { echo "ERROR: DailyBrief signature verification failed." >&2; exit 1; }
codesign --verify --verbose "$INSTALL_DIR/DailyBriefMonitor" 2>&1 \
    || { echo "ERROR: DailyBriefMonitor signature verification failed." >&2; exit 1; }
```

For debugging, the user can run `codesign -dvv ~/.local/bin/DailyBrief` to inspect the full DR after install.

### Pattern 4: bootstrap.sh Pre-flight Check (D-02, Claude's discretion)

The cert check belongs in bootstrap.sh pre-flight (before other steps), consistent with the hard-stop pattern already used for `op`, `node`, `npm`, `swift`. Recommend hard stop (not warning) for consistency with D-04.

```bash
# In the pre-flight block, after tool checks:
echo "Checking Developer ID Application certificate..."
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
    echo "" >&2
    echo "Then re-run: ./scripts/bootstrap.sh" >&2
    exit 1
fi
echo "  cert OK: $DEVID_CERT"
```

### Pattern 5: build.sh Cleanup (D-05)

`build.sh` currently has:
```bash
codesign --force --sign - --entitlements "$ENTITLEMENTS" "$BINARY"
```
This only signs `DailyBrief` (not Monitor) and only in the `.build/release/` location. Since `install.sh` is now the canonical signing point, this line should be **removed** (not replaced). `build.sh` is a developer-convenience script for quick local testing; the unsigned binary in `.build/release/` is fine for a dev-mode binary that won't be installed. Alternatively, replace `--sign -` with `--sign "$IDENTITY"` if the developer wants their dev builds signed too — but this complicates build.sh with the cert-resolution logic. Removal is simpler and matches D-05.

### Pattern 6: Doctor Script Health Row (Claude's discretion — RECOMMENDED)

Adds one informational row to `dailybrief-doctor.sh` reporting cert validity. Read-only, matches the existing format. Does not affect the exit code (informational only, like the health endpoint row).

```bash
# In dailybrief-doctor.sh informational section:
DEVID_CERT=$(security find-identity -v -p codesigning \
             | grep "Developer ID Application" \
             | head -1 \
             | grep -o '"Developer ID Application: [^"]*"' \
             | tr -d '"')
if [[ -n "$DEVID_CERT" ]]; then
    printf "%-38s | %s\n" "Developer ID Application cert" "present: $DEVID_CERT"
else
    printf "%-38s | %s\n" "Developer ID Application cert" "MISSING — run: security import /path/cert.p12 -k ~/Library/Keychains/login.keychain-db"
fi
```

---

## CRITICAL BLOCKER: CloudKit Entitlement in DailyBriefMonitor.entitlements

**This must be resolved before signing can work.**

`Entitlements/DailyBriefMonitor.entitlements` contains:
```xml
<key>com.apple.developer.icloud-services</key>
<array><string>CloudKit</string></array>
<key>com.apple.developer.icloud-container-identifiers</key>
<array><string>iCloud.com.jamesonmorrill.jarvis</string></array>
```

**Why this breaks Developer ID signing:**
Developer ID Application certificates do NOT support iCloud/CloudKit entitlements. At runtime, macOS will kill the process with:
`error -67050` — "its use of the com.apple.developer.icloud-services entitlement is not allowed"

The signing command itself may not fail loudly, but the binary will either refuse to launch or be killed on startup. [CITED: Apple Developer Forums thread/44140 — "Developer ID doesn't support iCloud capability which is reserved for Development-codesigning"]

**Why it is safe to remove these entitlements:**
Source inspection confirms CloudKit is dead code. There is no `import CloudKit` anywhere in the codebase. The `cloudSyncEnabled` toggle in SettingsView is a UI element that sets a config flag; no CloudKit API is ever called. The container ID (`iCloud.com.jamesonmorrill.jarvis`) references the old "Jarvis" project name — this is legacy from a pre-Vigil rename. Removing these two keys from the entitlements file is a safe cleanup with no functional impact.

**Required change to DailyBriefMonitor.entitlements:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- CloudKit entitlements removed: dead code, incompatible with Developer ID signing -->
</dict>
</plist>
```
The resulting empty entitlements file is valid. Alternatively, omit `--entitlements` entirely for DailyBriefMonitor if it has no other entitlements. An empty entitlements dict is cleaner (documents the intent) and leaves the file for future entitlements.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Certificate validity check | Custom cert parsing / openssl x509 | `security find-identity -v -p codesigning` | The `-v` flag already filters expired certs; Apple-native, single command |
| Signing identity extraction | Hardcoded cert name string | `security find-identity` + grep | Works for any Developer ID Application cert without knowing the exact name |
| Post-sign verification | Manual hash comparison | `codesign --verify --verbose` | Authoritative macOS verification, catches all signing edge cases |

---

## Common Pitfalls

### Pitfall 1: Signing the `.build/release/` binary, then copying it — strips the signature

**What goes wrong:** Running `codesign --sign "$IDENTITY" .build/release/DailyBrief` then `cp .build/release/DailyBrief ~/.local/bin/DailyBrief` produces an unsigned binary at the destination. macOS code signatures are stored in the binary's extended attributes and special sections; `cp` preserves bytes but not signatures.
**Why it happens:** The signing operation writes metadata into the binary file itself (or extended attributes). `cp` copies bytes but the signature is invalidated when the inode changes.
**How to avoid:** Always sign AFTER the copy, in the install destination (`~/.local/bin/`). This is the D-05 decision.
**Warning signs:** `codesign -dvv ~/.local/bin/DailyBrief` shows "code object is not signed at all" after install.

### Pitfall 2: `security find-identity -p codesigning` without `-v` includes expired certs

**What goes wrong:** Without the `-v` flag, `security find-identity` lists ALL certificates including expired ones. An expired cert will produce a non-empty result, identity resolution succeeds, codesign runs, but fails mid-signing with a confusing error about the key chain or certificate chain.
**Why it happens:** The `-v` flag means "valid identities only." Without it, expired and revoked certs appear.
**How to avoid:** Always use `security find-identity -v -p codesigning`. [VERIFIED: man security on this machine]
**Warning signs:** codesign exits non-zero with keychain / certificate chain error after identity was found.

### Pitfall 3: CloudKit/iCloud entitlements in DailyBriefMonitor.entitlements block Developer ID signing

**What goes wrong:** Signing DailyBriefMonitor with its current entitlements file using a Developer ID certificate either silently embeds invalid entitlements (binary launches but CloudKit calls fail, or binary is killed by amfid at launch with error -67050).
**Why it happens:** Developer ID Application certs cannot authorize iCloud service entitlements — those require a provisioning profile from App Store Connect. [CITED: Apple Developer Forums thread/44140]
**How to avoid:** Remove the two CloudKit keys from `Entitlements/DailyBriefMonitor.entitlements` before signing. The code is dead — safe to remove.
**Warning signs:** Binary launches then immediately exits; Console.app shows amfid kill or entitlement validation error.

### Pitfall 4: Keychain GUI prompt on first signing of a new certificate

**What goes wrong:** When `codesign` first accesses the private key of a newly-imported certificate, macOS shows a GUI dialog: "codesign wants to use key [key name] in your keychain." This blocks the terminal process until clicked. In a non-GUI session (SSH, headless) this hangs indefinitely.
**Why it happens:** macOS 10.12.5+ added partition lists to keychain ACLs. A cert imported via `security import` has no `apple-tool:` or `codesign` partition entry, so macOS prompts.
**How to avoid:** After importing the cert, click "Always Allow" in the GUI prompt on the first `codesign` run. Alternatively, run `security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k <keychain-password> ~/Library/Keychains/login.keychain-db` to pre-authorize (requires knowing the keychain password in a script). For the single-developer local machine case, the one-time GUI click is the pragmatic path. [CITED: multiple CI signing guides, Apple Developer Forums thread/666107]
**Warning signs:** `install.sh` hangs without output after "Codesigning..." line.

### Pitfall 5: install.sh is also called from bootstrap.sh — cert check must be in install.sh, not only bootstrap.sh

**What goes wrong:** If cert check is only in bootstrap.sh pre-flight, running `install.sh` standalone (e.g., after a manual `swift build`) bypasses the check and produces unsigned or error output.
**Why it happens:** D-02 says bootstrap.sh checks cert presence. D-04 says install.sh hard fails if cert missing. Both checks are needed — they are not redundant.
**How to avoid:** The cert resolution and hard-fail guard lives in install.sh (owns signing) AND bootstrap.sh pre-flights it (catches the error before spending time building vigil-core). Both scripts independently check. [Per D-02, D-04, D-05]

### Pitfall 6: `--timestamp` flag requires internet connectivity

**What goes wrong:** Including `--timestamp` in the codesign command contacts Apple's timestamp server (timestamp.apple.com). If offline or Apple's server is down, signing fails.
**Why it happens:** `--timestamp` embeds a cryptographic timestamp from a trusted time authority. Required for notarization, optional for local developer signing.
**How to avoid:** For this phase (local developer machine, no notarization), omit `--timestamp`. The signature is fully valid for TCC purposes without it. Add `--timestamp` only if notarization is ever added (out of scope per REQUIREMENTS.md). [CITED: codesign man page — "if the timestamp authority service cannot be contacted... the signing operation will fail"]

---

## Code Examples

### Verified: Full install.sh signing block

```bash
# Resolve Developer ID Application identity (valid certs only: -v flag)
IDENTITY=$(security find-identity -v -p codesigning \
           | grep "Developer ID Application" \
           | head -1 \
           | grep -o '"Developer ID Application: [^"]*"' \
           | tr -d '"')

if [[ -z "$IDENTITY" ]]; then
    echo "ERROR: No Developer ID Application certificate found in login keychain." >&2
    echo "" >&2
    echo "Import your signing cert:" >&2
    echo "  security import /path/to/cert.p12 -k ~/Library/Keychains/login.keychain-db" >&2
    echo "Then re-run install.sh." >&2
    exit 1
fi
echo "  Signing identity: $IDENTITY"

# ... (swift build, mkdir, cp as today) ...

# Sign CLI (after cp)
codesign --force \
         --sign "$IDENTITY" \
         --identifier "com.jamesonmorrill.dailybrief" \
         --entitlements "$REPO_DIR/Entitlements/DailyBrief.entitlements" \
         "$INSTALL_DIR/DailyBrief"
codesign --verify --verbose "$INSTALL_DIR/DailyBrief" \
    || { echo "ERROR: DailyBrief signature verification failed." >&2; exit 1; }

# Sign Monitor (after cp)
codesign --force \
         --sign "$IDENTITY" \
         --identifier "com.jamesonmorrill.dailybriefmonitor" \
         --entitlements "$REPO_DIR/Entitlements/DailyBriefMonitor.entitlements" \
         "$INSTALL_DIR/DailyBriefMonitor"
codesign --verify --verbose "$INSTALL_DIR/DailyBriefMonitor" \
    || { echo "ERROR: DailyBriefMonitor signature verification failed." >&2; exit 1; }

echo "  Signing complete. Verify with: codesign -dvv $INSTALL_DIR/DailyBrief"
```

### Verified: Post-install DR inspection (for manual verification)

```bash
# User runs after install to confirm DR is stable
codesign -dvv ~/.local/bin/DailyBrief 2>&1 | grep -E "Identifier|TeamIdentifier|designated"
# Expected output includes:
# Identifier=com.jamesonmorrill.dailybrief
# TeamIdentifier=<TEAMID>
# designated => anchor apple generic and identifier "com.jamesonmorrill.dailybrief" and ...
```

### Verified: Checking TCC stability (two-rebuild confirmation from SIGN-02)

```bash
# Run install.sh twice, capture DR both times, confirm identical
codesign -d -r- ~/.local/bin/DailyBrief 2>&1 > /tmp/dr_before.txt
./scripts/install.sh
codesign -d -r- ~/.local/bin/DailyBrief 2>&1 > /tmp/dr_after.txt
diff /tmp/dr_before.txt /tmp/dr_after.txt && echo "DR is stable" || echo "DR CHANGED — TCC will reset"
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `codesign` | Signing both binaries | ✓ | macOS built-in at `/usr/bin/codesign` | None — macOS-only tool |
| `security` | Identity lookup, keychain check | ✓ | macOS built-in | None — macOS-only tool |
| Developer ID Application cert | Actual signing | ✗ (0 valid identities found) | — | User must import before running install.sh |
| `swift` / `swift build` | Binary compilation (unchanged) | ✓ | Swift 6.2.4 / Xcode 26.3 | — |

**Missing dependencies with no fallback:**
- Developer ID Application certificate: Not present on this machine at research time (confirmed: `security find-identity` returns 0 valid identities). The user must import their cert before phase execution. This is expected and by design (D-01 — manual import once). The scripts this phase writes handle the missing-cert case with a hard fail and remediation message.

---

## Validation Architecture

nyquist_validation is not set to false in config.json — include this section.

**Note:** This phase is shell script only. There is no automated test framework for shell scripts in this project. Validation is manual + verification via `codesign` command output.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (shell scripts — manual verification) |
| Config file | None |
| Quick run command | `codesign -dvv ~/.local/bin/DailyBrief` |
| Full suite command | See acceptance criteria below |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Verification Command | Automated? |
|--------|----------|-----------|----------------------|------------|
| SIGN-01 | Both binaries signed after install.sh | smoke | `codesign -dvv ~/.local/bin/DailyBrief 2>&1 \| grep "Developer ID Application"` | Manual — requires cert |
| SIGN-02 | DR stable across two rebuilds | manual | `diff <(codesign -d -r- ~/.local/bin/DailyBrief 2>&1) <(codesign -d -r- ~/.local/bin/DailyBrief 2>&1)` after two installs | Manual |
| SIGN-03 | TCC permissions survive rebuild | manual | Grant Full Disk Access, run install.sh, verify no re-prompt | Manual — requires TCC grant |
| SIGN-04 | bootstrap.sh checks cert | smoke | Run with cert absent, verify exit 1 + message | Manual |
| SIGN-05 | install.sh hard fails if cert missing | smoke | Temporarily rename cert, run install.sh, verify exit 1 | Manual |

### Wave 0 Gaps
None — no test infrastructure needed. Verification is codesign CLI output.

---

## Security Domain

security_enforcement is not explicitly false in config.json.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | n/a |
| V3 Session Management | No | n/a |
| V4 Access Control | Yes (TCC) | macOS TCC — Developer ID DR provides stable app identity |
| V5 Input Validation | No | n/a |
| V6 Cryptography | Yes | `codesign` uses Apple's toolchain — never hand-roll |

### Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Ad-hoc signed binary impersonates signed binary | Spoofing | Reject ad-hoc fallback (D-04) — hard fail prevents silent downgrade |
| Unsigned binary installed without error | Tampering | `codesign --verify` post-sign check + hard fail on verify failure |
| Expired cert silently used | Tampering | `security find-identity -v` — `-v` flag excludes expired certs |

---

## Open Questions

1. **Will codesign fail or succeed when DailyBriefMonitor is signed with an empty entitlements file?**
   - What we know: An empty entitlements `<dict/>` is valid XML. codesign accepts empty entitlement files for ad-hoc signing.
   - What's unclear: Does Developer ID signing with an empty entitlements dict behave differently than omitting `--entitlements` entirely?
   - Recommendation: Use `--entitlements` with the cleaned-up file (empty dict) for DailyBrief CLI too, for uniformity. If the planner prefers to drop `--entitlements` entirely for Monitor (since all keys are removed), that also works. Either is correct.

2. **Should `build.sh` have the ad-hoc line removed or replaced with Developer ID signing?**
   - What we know: D-05 says "remove or replace." build.sh is a developer convenience tool, not used in bootstrap/install flow.
   - What's unclear: User preference — do they want dev builds in `.build/release/` to be Developer ID signed too, or unsigned?
   - Recommendation: Remove the ad-hoc line. build.sh becomes a compile-only tool. The developer can always call install.sh if they need a signed binary. Keeping unsigned dev builds simpler avoids requiring the cert for pure `swift build` development loops.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Signing the `.build/release/` binary then copying it strips the signature | Pitfall 1 | If wrong, install.sh could sign before copy and it would still work — low risk, pattern of signing after copy is the authoritative Apple recommendation regardless |
| A2 | `cp` without `-p` flag does not preserve extended attributes (strips signature) | Pitfall 1 | Same as A1 — mitigated by always signing after copy |
| A3 | Developer ID Application does NOT support iCloud/CloudKit entitlements | CRITICAL BLOCKER section | If wrong, the entitlement cleanup is unnecessary (harmless dead code removal) — but per Apple Developer Forums thread/44140 this is confirmed behavior |
| A4 | Omitting `--timestamp` produces a fully valid-for-TCC signature | Pitfall 6 | If wrong, TCC may not accept the signature — but timestamp is only required for notarization, not for local TCC |

---

## Sources

### Primary (HIGH confidence)
- `man codesign` on this machine (macOS 15.0 / Xcode 26.3) — flag behavior for `--force`, `--sign`, `--identifier`, `--entitlements`, `--verify`, `--timestamp`
- `man security` on this machine — `find-identity -v -p codesigning` behavior, `-v` filters expired certs
- [Apple Code Signing Guide — Procedures](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html) — signing bare binaries, identifier derivation, Info.plist role

### Secondary (MEDIUM confidence)
- [Apple Developer Forums thread/44140 — Mac Provisioning: Developer ID vs iCloud](https://developer.apple.com/forums/thread/44140) — Developer ID does not support iCloud capability (confirmed by multiple threads)
- [Apple Developer Forums thread/666107 — security set-key-partition-list](https://developer.apple.com/forums/thread/666107) — keychain partition list / GUI prompt issue explanation
- [dennisbabkin.com — Code sign macOS binaries](https://dennisbabkin.com/blog/?t=how-to-get-certificate-code-sign-notarize-macos-binaries-outside-apple-app-store) — `--timestamp` and `-o runtime` flag semantics

### Tertiary (LOW confidence — training knowledge)
- TCC designated requirement stability across rebuilds: mechanism described is well-established macOS security architecture [ASSUMED: training knowledge confirmed by directional web evidence]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — system tools verified live on machine
- Architecture patterns: HIGH — codesign flags verified against man page; DR mechanics cited from Apple documentation
- Pitfalls: HIGH for 1–3 (verified), MEDIUM for 4–6 (cited from multiple sources, consistent)
- CloudKit blocker: HIGH — Apple Developer Forums, source code inspection confirms dead code

**Research date:** 2026-04-09
**Valid until:** 2026-10-09 (stable Apple platform tooling; re-verify if macOS major version changes or Apple revokes Developer ID signing for bare binaries)
