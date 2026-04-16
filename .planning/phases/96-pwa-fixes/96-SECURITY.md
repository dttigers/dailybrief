# Security Audit — Phase 96: PWA Fixes

**Phase:** 96 — pwa-fixes
**Plans Audited:** 96-01 (chat 400 fix), 96-02 (hide done tasks)
**Threats Closed:** 5/5
**ASVS Level:** 1
**Audited:** 2026-04-16

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-96-01 | Spoofing | mitigate | CLOSED | `vigil-core/src/index.ts` lines 89-93: `bearerAuth` middleware applied to all `/v1/*` paths except `/v1/health` and `/v1/auth/google`; chat route mounted at line 114, after auth registration |
| T-96-02 | Tampering | accept | CLOSED | Accepted risk logged below |
| T-96-03 | Denial of Service | mitigate | CLOSED | `vigil-core/src/routes/chat.ts` lines 29-35: contextLimit only accepted in range [1,50]; lines 51-52: belt-and-suspenders clamp to 50; line 100: `maxTokens: 1024` hardcoded |
| T-96-04 | Information Disclosure | accept | CLOSED | Accepted risk logged below |
| T-96-05 | Tampering | mitigate | CLOSED | `vigil-core/src/routes/thoughts.ts` line 166: `excludeDone !== "false"` — exact string comparison; any absent or non-"false" value defaults to excluding done tasks (fail-safe) |

---

## Accepted Risks Log

### T-96-02 — Prompt Injection via Chat Message Content

**Category:** Tampering  
**Component:** POST /v1/chat — message content passed to Anthropic Claude  
**Risk:** A user could craft adversarial message content (prompt injection) to manipulate Claude's responses.  
**Rationale for Acceptance:** This is a personal assistant tool used by a single authenticated user who owns their own data. The attack surface is limited to the authenticated user themselves — there is no multi-tenant exposure. Prompt injection risk is inherent to any LLM chat product and is considered low severity in this context. No sensitive server-side actions are taken based on Claude's output.  
**Owner:** jamesonmorrill1@gmail.com  
**Accepted:** 2026-04-16

---

### T-96-04 — excludeDone Bypass: Authenticated User Sees Their Own Done Tasks

**Category:** Information Disclosure  
**Component:** GET /v1/thoughts?excludeDone=false  
**Risk:** An authenticated caller can pass `excludeDone=false` to retrieve done tasks that are hidden by default from most views.  
**Rationale for Acceptance:** This is intentional by design. The `excludeDone` parameter is a client-controlled opt-out of the default filter. The user accessing their own done tasks is not a security violation — they own that data. Bearer auth ensures only authenticated users can call this endpoint at all. The "disclosure" is to the user themselves.  
**Owner:** jamesonmorrill1@gmail.com  
**Accepted:** 2026-04-16

---

## Unregistered Threat Flags

None. Neither 96-01-SUMMARY.md nor 96-02-SUMMARY.md contains a `## Threat Flags` section.
