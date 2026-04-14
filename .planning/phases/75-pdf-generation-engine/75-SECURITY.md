# Phase 75 — PDF Generation Engine: Security Audit

**Audit Date:** 2026-04-12
**ASVS Level:** 1
**Phase:** 75 — PDF Generation Engine
**Plans Audited:** 75-01, 75-02

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-75-01 | Denial of Service | mitigate | CLOSED | pdf-service.ts:199 `sortedOrders.slice(0, 6)` caps work orders; :223 `sortedTasks.slice(0, 8)` caps task thoughts; :314 `sortedEvents.slice(0, 8)` caps calendar events |
| T-75-02 | Information Disclosure | accept | CLOSED | Accepted risk — fontsDir defaults to `assets/fonts/` relative to cwd; only operator-controlled DI override; no external exposure |
| T-75-03 | Tampering | mitigate | CLOSED | All text rendered exclusively via `doc.text()` (14 call sites confirmed); zero use of addRawContent, _addContent, or raw PDF operator string interpolation |
| T-75-04 | Denial of Service | mitigate | CLOSED | pdf-service.ts:883 `const MAX_SPILLOVER = 10`; :885 `while (spilloverIndex !== null && spilloverCount < MAX_SPILLOVER)` enforces hard cap; :962 force-draw prevents infinite loop on single oversized insight |
| T-75-05 | Denial of Service | mitigate | CLOSED | pdf-service.ts:663 `unprocessedThoughts.slice(0, 5)`; :738 `recentThoughts.slice(0, 5)`; :689 `sortedTasks.slice(0, 8)`; :815 `therapyPrep.items.slice(0, 5)` |

---

## Accepted Risks Log

| Threat ID | Category | Rationale |
|-----------|----------|-----------|
| T-75-02 | Information Disclosure — font path | fontsDir is a server-operator DI parameter, not user-controlled. The default resolves relative to `process.cwd()`. No external trust boundary crosses this path. Risk accepted as low. |

---

## Unregistered Flags

None. Neither SUMMARY.md (75-01 nor 75-02) declared any threat flags outside the registered threat register.

---

## Summary

**Threats Closed: 5/5**

All five registered threats are closed. The four `mitigate`-disposition threats have code-level evidence in `vigil-core/src/services/pdf-service.ts`. The one `accept`-disposition threat (T-75-02) is documented in this accepted risks log. No raw PDF operator injection paths exist. The spillover pagination safety cap (MAX_SPILLOVER = 10) is present and annotated with the threat ID in source comments.
