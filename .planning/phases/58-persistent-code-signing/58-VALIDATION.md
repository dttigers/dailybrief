---
phase: 58
slug: persistent-code-signing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash / shell assertions (no test framework — all verifications are CLI commands) |
| **Config file** | none |
| **Quick run command** | `codesign --verify --verbose ~/.local/bin/dailybrief && codesign --verify --verbose ~/.local/bin/dailybrief-monitor` |
| **Full suite command** | `codesign -dvv ~/.local/bin/dailybrief && codesign -dvv ~/.local/bin/dailybrief-monitor` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick verify (codesign --verify)
- **After every plan wave:** Run full suite (codesign -dvv)
- **Before `/gsd-verify-work`:** Full suite must pass + TCC stability test
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | SIGN-01 | — | N/A | manual | `codesign --verify --verbose ~/.local/bin/dailybrief` | ✅ | ⬜ pending |
| 58-01-02 | 01 | 1 | SIGN-02 | — | N/A | manual | `codesign -dvv ~/.local/bin/dailybrief \| grep "Designated Requirement"` | ✅ | ⬜ pending |
| 58-01-03 | 01 | 1 | SIGN-03 | — | N/A | manual | run install.sh twice; check TCC permissions persist | ✅ | ⬜ pending |
| 58-01-04 | 01 | 1 | SIGN-04 | — | N/A | manual | `security find-identity -v -p codesigning \| grep "Developer ID Application"` | ✅ | ⬜ pending |
| 58-01-05 | 01 | 1 | SIGN-05 | — | N/A | manual | temporarily rename cert in keychain; run install.sh; confirm exit 1 + message | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — no test framework installation needed. All verification is via codesign CLI and manual TCC permission checks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TCC permissions persist across rebuilds | SIGN-03 | Requires human interaction with System Settings | 1. Grant Full Disk Access to dailybrief-monitor. 2. Run `./scripts/install.sh`. 3. Open System Settings > Privacy > Full Disk Access. 4. Confirm dailybrief-monitor still has permission without prompting. |
| Hard fail on missing cert | SIGN-05 | Requires temporarily removing cert from keychain | 1. Remove or rename Developer ID cert in Keychain Access. 2. Run `./scripts/install.sh`. 3. Confirm exit code is non-zero and error message contains remediation instructions. 4. Re-import cert. |
| bootstrap.sh cert check | SIGN-04 | Requires fresh machine state to fully validate | 1. Run `./scripts/bootstrap.sh` with no cert in keychain. 2. Confirm it exits with a clear "no Developer ID cert" message before attempting any other work. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
