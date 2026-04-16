# Security Audit — Phase 89: 7-Day Analysis Scope

**ASVS Level:** 1
**Audited:** 2026-04-16
**Result:** SECURED — 6/6 threats closed

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-89-01 | Tampering | mitigate | CLOSED | insights.ts: no `c.req.json()` call in POST /insights handler; handler reads from DB directly via `db.select()` — no client body parsed |
| T-89-02 | Information Disclosure | accept | CLOSED | See accepted risks log below |
| T-89-03 | Denial of Service | mitigate | CLOSED | insights.ts:41 `.limit(200)`; therapy.ts:128 `.limit(200)` (patterns); therapy.ts:228 `.limit(200)` (prep) |
| T-89-04 | Spoofing | accept | CLOSED | See accepted risks log below |
| T-89-05 | Tampering | mitigate | CLOSED | client.ts:265-267 `generateInsights` — no body; client.ts:364-366 `getTherapyPatterns` — no body; client.ts:375-377 `generateTherapyPrep` — no body |
| T-89-06 | Information Disclosure | accept | CLOSED | See accepted risks log below |

---

## Accepted Risks Log

| Threat ID | Category | Rationale | Owner |
|-----------|----------|-----------|-------|
| T-89-02 | Information Disclosure | Thought content sent to Claude is existing behavior unchanged from prior phases. User's own thoughts are sent to their own configured Anthropic API key. No third-party data exposure; no new surface introduced by Phase 89. | jamesonmorrill |
| T-89-04 | Spoofing | Timezone value comes from server-side `appSettings` table (`user_timezone` key), not from the client request. Spoofing requires DB write access, which is already a higher-privilege boundary. Timezone drift shifts window boundaries by hours at most — not a meaningful data integrity risk. | jamesonmorrill |
| T-89-06 | Information Disclosure | Server 400 responses include thought count (e.g., "Only 2 thoughts this week"). This count reflects the user's own data, not another user's. Single-user deployment; no multi-tenancy concern. Count leakage to the authenticated user is not sensitive. | jamesonmorrill |

---

## Unregistered Flags

None. Both SUMMARY.md threat surface scans (89-01, 89-02) reference only registered threat IDs (T-89-01 through T-89-06). No new attack surface was identified during implementation.

---

## Files Audited

- `vigil-core/src/routes/insights.ts`
- `vigil-core/src/routes/therapy.ts`
- `vigil-pwa/src/api/client.ts`
