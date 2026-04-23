# Requirements: Vigil v3.6 — Multi-User Completion, Auth UX & Safari Parity

**Defined:** 2026-04-23
**Core Value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.

**Milestone Goal:** Close the v3.4 multi-user loop end-to-end (per-user isolation + scheduler fan-out), complete the auth UX flows (change password, forgot password, email verify), and bring the Safari extension up to Chrome's Phase 94 quick-capture feature parity.

## v3.6 Requirements

### Multi-User Completion

Tech debt carried forward from v3.4. The multi-user foundation shipped, but three correctness gaps remain: one table never got userId scoping, the cross-user isolation test missed a PDF-bytes path, and the scheduler is still hardcoded to a single seed user. These close the loop.

- [x] **W-01**: A user can set / view / change work order status without leaking to or colliding with any other user — the `work_order_statuses` table gains a `user_id` FK, every query scopes by the authenticated user, and upserts cannot cross users via `caseNumber` collision
- [x] **W-02**: The cross-user isolation test suite asserts that user A cannot retrieve user B's brief PDF bytes via `GET /v1/brief/:date` (extends the existing briefs-list isolation test)
- [x] **SCHED-01**: The scheduler generates a daily brief + prioritization cache for every registered user, not just the seed user — one user's failure (API error, stale data) does not block other users, and the prioritization filesystem cache is keyed by userId so no cross-user data leaks across scheduler runs

### Auth UX

Closes the auth surface. AUTH-06/07/08 shipped login/register/email-display in Phase 104. This milestone adds self-service password management and the forgot-password flow — which introduces Vigil's first outbound email.

- [ ] **AUTH-09**: An authenticated user can change their password from the PWA profile page — re-entering their current password, setting a new one, and remaining logged in on success; confirmation email sent to the same address as an anti-hijack signal
- [ ] **AUTH-10**: An unauthenticated user who forgot their password can request a reset link from the login page, always sees "check your inbox" regardless of whether the email exists (enumeration-safe), receives an opaque single-use token via email (expires 1 hour), and can set a new password by clicking the link — after reset, old JWTs from before the reset no longer authenticate
- [ ] **AUTH-11**: A newly-registered user receives a verification email at signup, sees a non-blocking banner in the PWA until verified, can click the verification link to clear the banner (token expires 24 hours, single-use), and can resend the verification email (rate-limited 3 / hour) — users who registered before AUTH-11 shipped are grandfathered as verified on deploy

### Transactional Email Infrastructure

Prerequisite for AUTH-10 + AUTH-11. First outbound email in Vigil. Called out as its own requirement because DNS + domain verification + deliverability hygiene is independent of code and has to happen before any auth email flow can be tested against a real inbox.

- [ ] **EMAIL-01**: Vigil can send authenticated, deliverable email from `noreply@vigilhub.io` via Resend — DKIM + SPF + DMARC records live on `vigilhub.io` DNS, domain verified in Resend dashboard, link tracking disabled per-send to avoid Apple Mail pre-fetch consuming single-use tokens, `RESEND_API_KEY` on Railway, email-service module in `vigil-core/src/services/` mirrors the dep-injected pattern used by other services

### Safari Extension Parity

Safari extension still ships the Phase 84 one-click URL capture only. Chrome got the Phase 94 quick-capture upgrade (freeform text + URL + triage feedback + Cmd+Enter) and daily use shows the gap. Safari-specific UX port of existing Chrome popup code.

- [ ] **EXT-02**: The Safari extension popup offers Chrome Phase 94 quick-capture parity — freeform text input (pre-filled empty, not with URL), optional "Include page URL" checkbox, Cmd+Enter keyboard shortcut to submit, and a triage feedback badge displaying the AI-assigned category after submit — verified working on physical Mac hardware

## Deferred to v3.7

Tracked but not in the v3.6 roadmap.

### Auth surface

- **AUTH-12**: User can change their registered email address (triggers AUTH-11 re-verification on the new address)
- **AUTH-13**: "Sign out all other sessions" button on profile page — requires a JWT revocation list / `token_version` counter (stateless JWTs today)
- **AUTH-14**: Passkey / WebAuthn authentication option

### Extensions

- **EXT-03**: Chrome + Safari extensions migrate off hardcoded `vk_` bearer to PWA JWT — requires a refresh-token endpoint + extension sign-in UI (scope creep for v3.6)

### v3.5 hardware gate

- **G2-HW-01**: Phase 106-05 single simulator session + `.ehpk` package — unblocks v3.5 ship (pending device delivery, unknown date)
- **G2-HW-02**: Physical Even G2 hardware retest of plugin UX (tap-expand, swipe-out-of-list, resubmit UAT)

### Still blocked

- **IOS-01**: iOS Shortcut quick-capture — blocked by Shortcuts.app bugs
- **WO-01**: ServiceNow API work order source — blocked on IT token

## Out of Scope

Explicitly excluded from v3.6 with reasoning.

| Feature | Reason |
|---------|--------|
| Migrate off argon2id + HS256 JWT to Lucia / Auth.js / better-auth | Research (STACK.md) estimates the migration cost vastly exceeds adding 2 endpoints + 5 columns; current stack is working and will keep working |
| Self-hosted SMTP (Postfix, etc.) | Resend free tier covers the volume indefinitely; self-hosting adds deliverability ops burden without benefit at current scale |
| Postmark or AWS SES as email provider | Postmark's 100/month free tier exhausts in a week of testing; SES requires 4 env vars + IAM setup — both fail the solo-founder ops constraint |
| Auto-login after password reset | OWASP explicit recommendation against — user should re-authenticate manually with new password |
| Auto-login after email verify | Embedding JWT in URL / auto-issuing session on verify click is a CVE pattern (referrer leak); user is already logged in from registration anyway |
| JWT revocation list / token_version counter | Needed to invalidate arbitrary sessions on demand, but v3.6 only needs to invalidate JWTs issued before a password reset — solved with a cheaper `password_changed_at` gate |
| "Sign out all other sessions" UI | Requires infrastructure from AUTH-13; deferred to v3.7 |
| Email change flow (AUTH-12) | Orthogonal to forgot-password; deferred to v3.7 along with AUTH-11 re-verify |
| Password strength meter | Argon2id with no explicit rules is fine; adding a strength meter is scope creep |
| Confirm-password field on change | CXL data: 56% conversion hit; use show/hide toggle instead |
| Chrome / Safari extension JWT migration | Extensions stay on `vk_` bearer in v3.6; extension JWT requires refresh-token endpoint + sign-in UI (deferred to v3.7 as EXT-03) |
| Safari photo upload from page context | Not Phase 94 scope; Chrome doesn't have it either — deferred until users actually ask |
| `webextension-polyfill` for cross-browser compat | Safari MV3 supports `chrome.*` namespace directly; polyfill adds dep for zero benefit |
| Non-iCloud folder watcher rewrite | v3.5 Phase 103 fixed iCloud path; existing DispatchSource path for local folders stays untouched |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| W-01 | Phase 108 | Complete |
| W-02 | Phase 108 | Complete |
| SCHED-01 | Phase 109 | Complete |
| AUTH-09 | Phase 110 | Pending |
| EMAIL-01 | Phase 111 | Pending |
| AUTH-10 | Phase 112 | Pending |
| AUTH-11 | Phase 113 | Pending |
| EXT-02 | Phase 114 | Pending |
