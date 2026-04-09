# Phase 58: Persistent Code Signing - Discussion Log

**Session:** 2026-04-09
**Areas discussed:** Cert fallback strategy

---

## Area: Cert Fallback Strategy

**Q1:** Where does the signing cert live / how should install.sh find it?
- Options: Login keychain only / Local .p12 file / 1Password optional path
- **Selected:** Login keychain only
- Notes: User doesn't use 1Password (Phase 57 D-14). Cert is imported once manually by user; install.sh reads from keychain at build time.

**Q2:** How should install.sh identify which Developer ID cert to use?
- Options: Search by type (first Developer ID Application found) / Configurable cert name / Hardcoded team ID
- **Selected:** Search by type (recommended)
- Notes: Single-developer case; one cert expected. `security find-identity -v -p codesigning` is sufficient.

**Q3:** When no cert is found, what should install.sh do?
- Options: Hard fail with instructions / Warn and continue ad-hoc / Prompt interactively
- **Selected:** Hard fail with instructions
- Notes: Consistent with SIGN-05 in REQUIREMENTS.md. Never produce ad-hoc-signed or unsigned output.

**Skipped areas:** Signing identity resolution, Failure behavior, Verification & doctor check (all effectively resolved by cert strategy answers or deferred to Claude's discretion).
