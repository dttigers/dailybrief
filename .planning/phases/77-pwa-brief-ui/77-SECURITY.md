---
phase: 77
slug: pwa-brief-ui
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-13
---

# Phase 77 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| PWA → vigil-core API | Bearer-authenticated API calls for PDF generation and retrieval | PDF binary, brief metadata |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-77-01 | Information Disclosure | Blob URL in memory | accept | Same-origin only; no third-party scripts; URLs revoked via useEffect cleanup (5 revokeObjectURL calls) | closed |
| T-77-02 | Spoofing | generateBrief() POST call | mitigate | Bearer token sent via vigilFetch Authorization header on every request — unauthenticated requests rejected by vigil-core middleware | closed |
| T-77-03 | Tampering | PDF binary response | accept | PDF comes from authenticated Vigil API returning user's own data; no user-supplied input in the generate flow | closed |
| T-77-04 | Denial of Service | Repeated generate clicks | mitigate | Button disabled during generating state (generateState === 'generating') — prevents concurrent POST requests | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-77-01 | T-77-01 | Blob URLs are ephemeral, same-origin, and revoked on cleanup. No exfiltration path. | gsd-orchestrator | 2026-04-13 |
| AR-77-03 | T-77-03 | Server-generated PDF from authenticated user data. No injection vector. | gsd-orchestrator | 2026-04-13 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-13 | 4 | 4 | 0 | gsd-orchestrator |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-13
