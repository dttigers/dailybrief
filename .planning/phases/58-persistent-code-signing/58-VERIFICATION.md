---
phase: 58-persistent-code-signing
verified: 2026-04-09T18:30:00Z
status: passed
score: 8/8
overrides_applied: 0
---

# Phase 58: Persistent Code Signing — Verification Report

**Phase Goal:** Stop TCC permission resets on every rebuild by replacing ad-hoc signing with persistent Developer ID Application code signing across all build/install/bootstrap scripts.
**Verified:** 2026-04-09T18:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | install.sh signs both binaries with Developer ID Application after cp | VERIFIED | `codesign --force --sign "$IDENTITY"` present twice; `security find-identity -v -p codesigning` resolves identity; cert guard placed before `swift build` |
| 2 | Stable designated requirement — same `--identifier` used per binary, no ad-hoc `--sign -` | VERIFIED | `--identifier "com.jamesonmorrill.dailybrief"` and `--identifier "com.jamesonmorrill.dailybriefmonitor"` each appear exactly once; zero `--sign -` occurrences in all scripts |
| 3 | TCC persistence across rebuilds (SIGN-03) | VERIFIED (human) | Human verification approved in 58-01-SUMMARY.md: Full Disk Access for DailyBriefMonitor still listed and toggled on after rebuild; DR stable (diff empty); human checkpoint 0228dfd |
| 4 | bootstrap.sh pre-flight cert check present (SIGN-04) | VERIFIED | `DEVID_CERT=$(security find-identity ...)` block at lines 123–143; placed after required-tools loop and before secrets-restore banner; pre-flight OK line surfaces `$DEVID_CERT` |
| 5 | Hard-fail on missing cert in install.sh (SIGN-05) | VERIFIED | `if [[ -z "$IDENTITY" ]]` → `exit 1` with `security import` remediation; 3 total `exit 1` calls (cert guard + two verify failures); cert guard fires before `swift build` |
| 6 | Hard-fail on missing cert in bootstrap.sh (SIGN-05 / SIGN-04 overlap) | VERIFIED | `if [[ -z "$DEVID_CERT" ]]` → `exit 1` with identical remediation format; positioned before secrets restore |
| 7 | No CloudKit keys in DailyBriefMonitor.entitlements | VERIFIED | `grep -ic icloud` returns 0; `grep -c com.apple.developer.icloud` returns 0; plist is valid (`plutil -lint` exits 0); comment documents Phase 58 removal |
| 8 | build.sh is compile-only — no functional codesign calls | VERIFIED | Only codesign mention is an archaeological comment on line 15 (`# used to call \`codesign --force --sign -\``); no `ENTITLEMENTS` variable; explicit UNSIGNED notice added |

**Score:** 8/8 truths verified

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| SIGN-01 | install.sh signs both binaries with Developer ID Application cert on every build | SATISFIED | `security find-identity -v -p codesigning` (×1), `codesign --force` (×2), `codesign --verify --verbose` (×2) present in Scripts/install.sh |
| SIGN-02 | Stable designated requirement — consistent signing identity across rebuilds | SATISFIED | Both binaries use pinned `--identifier` values; no `--sign -` anywhere; DR stability confirmed human-verified in 58-01-SUMMARY.md |
| SIGN-03 | TCC permissions survive install.sh rebuilds | SATISFIED | Human-verified: Full Disk Access for DailyBriefMonitor persisted across back-to-back rebuilds (checkpoint 0228dfd approved) |
| SIGN-04 | bootstrap.sh pre-flight handles cert setup before any build work | SATISFIED | `DEVID_CERT` block at lines 123–143 of Scripts/bootstrap.sh; cert check before secrets restore; hard-fail with `security import` remediation |
| SIGN-05 | install.sh fails loud on missing/expired cert — no silent fallback | SATISFIED | `if [[ -z "$IDENTITY" ]] → exit 1` before `swift build`; remediation message names `security import`; confirmed live in 58-01-SUMMARY.md missing-cert test |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Entitlements/DailyBriefMonitor.entitlements` | Empty-dict plist, no CloudKit keys | VERIFIED | Valid plist (`plutil -lint` OK); no icloud/CloudKit functional keys; comment documents Phase 58 removal |
| `Scripts/install.sh` | Cert guard + Developer ID signing + verify | VERIFIED | 182 lines; cert guard block lines 19–48; CLI sign+verify lines 77–86; Monitor sign+verify lines 92–101 |
| `Scripts/bootstrap.sh` | Pre-flight cert check that hard-fails on missing cert | VERIFIED | DEVID_CERT block lines 123–143; cert check before secrets restore (ordering confirmed by awk) |
| `Scripts/build.sh` | Compile-only — no signing | VERIFIED | Only codesign mention is in a comment; no functional signing call; ENTITLEMENTS variable removed |
| `Scripts/dailybrief-doctor.sh` | Informational cert row in informational section | VERIFIED | DEVID_DOCTOR block lines 211–224; 2 printf rows (present/MISSING branches); zero DRIFT_COUNT references in block |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Scripts/install.sh | `security find-identity -v -p codesigning` | `IDENTITY` shell variable before `swift build` | WIRED | `IDENTITY=` assignment at line 28; cert guard at line 34; `swift build` at line 68 |
| Scripts/install.sh | `codesign --sign "$IDENTITY"` | Two `codesign --force` calls after each `cp` | WIRED | CLI sign at lines 79–83; Monitor sign at lines 94–98; both after respective `cp -f` |
| Scripts/install.sh | `codesign --verify --verbose` | Post-sign verification, non-zero exit propagates | WIRED | Lines 84–85 and 99–100; `|| { echo ...; exit 1; }` on each |
| Scripts/bootstrap.sh | `security find-identity -v -p codesigning` | `DEVID_CERT` variable, hard-fail before secrets restore | WIRED | `DEVID_CERT=` at line 127; `if [[ -z "$DEVID_CERT" ]]` → `exit 1` at lines 132–143 |
| Scripts/dailybrief-doctor.sh | login keychain | read-only `security find-identity` query | WIRED | `DEVID_DOCTOR=` at line 215; `|| true` pipefail guard; inside informational section |

---

## Syntax Checks (bash -n)

| Script | Result |
|--------|--------|
| `bash -n Scripts/install.sh` | PASS |
| `bash -n Scripts/bootstrap.sh` | PASS |
| `bash -n Scripts/build.sh` | PASS |
| `bash -n Scripts/dailybrief-doctor.sh` | PASS |

---

## Anti-Pattern Scan

| File | Pattern | Finding | Severity | Verdict |
|------|---------|---------|---------|---------|
| Scripts/build.sh:15 | `codesign` reference | Comment only: `# used to call \`codesign --force --sign -\`` — archaeological documentation of the Phase 58 removal. Not a functional signing call. | Info | NOT a stub — comment is intentional documentation |
| Scripts/build.sh | `--sign -` (ad-hoc) | Appears only in the comment on line 15, referencing removed code. Zero functional ad-hoc signing calls anywhere in Scripts/. | Info | NOT a regression |

No blockers or warnings found. Zero functional ad-hoc signing calls in any script. Zero `--timestamp` flags. Zero CloudKit entitlement keys.

---

## Behavioral Spot-Checks

Step 7b behavioral spot-checks cannot be run without executing `./scripts/install.sh`, which requires a running Swift toolchain and the Developer ID cert. This phase includes a human verification checkpoint (Task 3, commit 0228dfd) that covered all six behavioral checks:

| Behavior | Method | Result |
|----------|--------|--------|
| Developer ID cert present | `security find-identity` | PASS — human confirmed |
| install.sh builds + signs both binaries | Live run | PASS — human confirmed |
| `codesign -dvv` shows `Authority=Developer ID Application` | Live inspection | PASS — output captured in SUMMARY |
| DR stable across two back-to-back runs | `diff` of `codesign -d -r-` output | PASS — empty diff, "DR STABLE" printed |
| TCC Full Disk Access persists after rebuild | System Settings inspection | PASS — still listed and toggled on |
| Missing-cert run exits non-zero before `swift build` | Locked keychain test | PASS — `exit 1`, `swift build` did not run |

---

## Human Verification Required

None — all items either verified programmatically or covered by the human verification checkpoint committed as 0228dfd.

---

## Summary

Phase 58 achieved its goal. The TCC permission reset problem is structurally eliminated:

1. **Root cause addressed:** Ad-hoc `--sign -` removed from build.sh (the last remaining ad-hoc signing call). install.sh now resolves a stable Developer ID Application identity and pins it with `--identifier` on each binary, producing a consistent designated requirement that macOS TCC can match across rebuilds.

2. **Hard failure enforced:** Both install.sh and bootstrap.sh hard-fail before any build work if no Developer ID Application cert is present in the login keychain. The failure is explicit and actionable (`security import` remediation).

3. **Drift visibility added:** dailybrief-doctor.sh surfaces cert presence in its informational section without affecting exit code — the developer sees cert status on every drift check.

4. **CloudKit blocker removed:** DailyBriefMonitor.entitlements is now an empty-dict plist, removing the keys that were incompatible with Developer ID signing.

5. **Human-verified end-to-end:** All six verification checks passed on the dev machine, including TCC persistence (the primary goal of the phase).

All five requirements (SIGN-01 through SIGN-05) are satisfied. All scripts pass `bash -n`. No functional ad-hoc signing remains anywhere in the scripts directory.

---

_Verified: 2026-04-09T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
