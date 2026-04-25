---
phase: 113
slug: verify-email-on-signup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
---

# Phase 113 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Filled in by the planner from RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | tsx --test (vigil-core) + vitest (vigil-pwa) |
| **Config file** | vigil-core/package.json scripts; vigil-pwa/vite.config.ts |
| **Quick run command** | `(cd vigil-core && npx tsx --test src/routes/<file>.test.ts)` |
| **Full suite command** | `(cd vigil-core && npm test) && (cd vigil-pwa && npm test)` |
| **Estimated runtime** | ~30-60 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command for the modified file's test
- **After every plan wave:** Run full suite for the touched workspace (vigil-core or vigil-pwa)
- **Before `/gsd-verify-work`:** Both workspaces' full suites must be green + manual UAT for SC#3
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*Filled in by planner during plan creation. Each task gets a row.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | AUTH-11 | TBD | TBD | TBD | TBD | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Tests/fixtures the planner expects to exist before substantive plans run.*

- [ ] `vigil-core/src/routes/verify-email.test.ts` — stubs for AUTH-11 (token claim, atomic single-use, expired/used/unknown error paths)
- [ ] `vigil-core/src/routes/resend-verification.test.ts` — stubs for AUTH-11 (3/hr rate limit, idempotent on already-verified, most-recent-link wins)
- [ ] `vigil-core/src/routes/auth-me.test.ts` — stubs for /v1/auth/me shape
- [ ] `vigil-core/src/routes/auth.test.ts` (extend existing) — stubs for register email-verify token issuance + login response shape change
- [ ] No new framework install needed — tsx + vitest already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email arrives in real Gmail inbox | AUTH-11 SC#1 | Live Resend send + DKIM/SPF/DMARC + Gmail spam filter is not unit-testable | After Railway deploy: register a fresh test user with jamesonmorrill1+verify-test@gmail.com → check inbox within 60s → assert subject "Verify your Vigil email" + teal CTA + token URL is the same on render and after click. |
| Apple Mail prefetch does NOT burn token | D-19 prefetch-safe gate | Requires real Apple Mail client behavior on iOS/macOS, not testable in CI | Send verify email to a real iOS device, open Mail, do NOT tap link, then verify the token is still claimable from a desktop browser. |
| PWA banner clears on next page load after verify | SC#3 | Multi-tab cache invalidation is hard to assert deterministically in unit tests | Sign in → see banner on Settings → click verify in email (separate tab) → reload Settings → banner gone. |
| Migration backfill grandfathers seed user | SC#4 | Verifies live Postgres post-deploy state | After 0017 deploy on Railway: SELECT email_verified_at FROM users WHERE email='jamesonmorrill1@gmail.com'; → must equal that user's created_at. |

---

## Validation Sign-Off

- [ ] All tasks have automated verification command OR a Manual-Only entry above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all stubs above
- [ ] No watch-mode flags in any test command
- [ ] Feedback latency < 60s for the per-task quick command
- [ ] `nyquist_compliant: true` set in frontmatter once planner finalizes the per-task map

**Approval:** pending
