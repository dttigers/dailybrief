---
phase: 79
slug: gmail-oauth-server-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 79 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in Node.js test runner) |
| **Config file** | vigil-core/package.json (`"test": "node --test"`) |
| **Quick run command** | `cd vigil-core && npm test -- --test-name-pattern "google"` |
| **Full suite command** | `cd vigil-core && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd vigil-core && npm test -- --test-name-pattern "google"`
- **After every plan wave:** Run `cd vigil-core && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 79-01-01 | 01 | 1 | OAUTH-04 | — | jose installed, importable | unit | `node -e "import('jose')"` | ❌ W0 | ⬜ pending |
| 79-01-02 | 01 | 1 | OAUTH-04 | T-79-01 | JWT sign/verify with HS256 + 5min expiry | unit | `cd vigil-core && npm test -- --test-name-pattern "jwt"` | ❌ W0 | ⬜ pending |
| 79-01-03 | 01 | 1 | OAUTH-04 | — | Drizzle migration adds scopes column | integration | `cd vigil-core && npx drizzle-kit push` | ❌ W0 | ⬜ pending |
| 79-02-01 | 02 | 1 | OAUTH-04 | T-79-02 | OAuth URL includes both scopes | unit | `cd vigil-core && npm test -- --test-name-pattern "google-auth"` | ❌ W0 | ⬜ pending |
| 79-02-02 | 02 | 1 | OAUTH-04 | T-79-03 | Callback validates JWT state, rejects expired/tampered | unit | `cd vigil-core && npm test -- --test-name-pattern "callback"` | ❌ W0 | ⬜ pending |
| 79-02-03 | 02 | 1 | OAUTH-04 | — | Scopes stored in DB on successful callback | unit | `cd vigil-core && npm test -- --test-name-pattern "scopes"` | ❌ W0 | ⬜ pending |
| 79-03-01 | 03 | 2 | OAUTH-04 | — | GET /v1/google/status returns per-scope status | unit | `cd vigil-core && npm test -- --test-name-pattern "status"` | ❌ W0 | ⬜ pending |
| 79-03-02 | 03 | 2 | OAUTH-04 | — | Status endpoint handles missing token row | unit | `cd vigil-core && npm test -- --test-name-pattern "status"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vigil-core/src/tests/google-auth.test.ts` — stubs for OAuth flow tests
- [ ] `vigil-core/src/tests/google-status.test.ts` — stubs for status endpoint tests
- [ ] `jose` npm package — install in vigil-core

*Existing node:test infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full OAuth consent flow with Google | OAUTH-04 | Requires browser interaction + real Google account | 1. Navigate to /auth/google 2. Complete Google consent 3. Verify redirect with ?google_connected=true 4. Check /v1/google/status shows both scopes connected |
| Railway rolling deploy JWT survival | OAUTH-04 | Requires Railway deploy + timing | 1. Start OAuth flow 2. Trigger Railway deploy during callback window 3. Verify callback still validates JWT state |
| Gmail API access with stored token | OAUTH-04 | Requires real Gmail data | 1. After OAuth, call Gmail API with stored token 2. Verify 200 response (not 403) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
