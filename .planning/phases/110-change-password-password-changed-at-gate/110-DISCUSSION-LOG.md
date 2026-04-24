# Phase 110: Change Password + password_changed_at Gate — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 110-change-password-password-changed-at-gate
**Areas discussed:** Gate mechanics, Confirmation email scope, New-password validation rules, PWA form placement & UX

---

## Gate mechanics

### Q1: password_changed_at default for users who registered before this phase shipped (backfill value)?

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill to created_at | `UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL`. 'Password was set at account creation' semantics. Existing JWTs keep working because `jwt.iat ≥ user.created_at`. NOT NULL — no null-branching in the gate. | ✓ |
| Backfill to NOW() at migration | Every existing JWT invalidated on deploy; all users forcibly signed out. Cleanest security posture but disruptive. | |
| Keep column NULLable, NULL means 'never changed' | No backfill needed. Gate skips when IS NULL. Cost: every gate check branches on NULL; Phase 112 reset flow has to flip NULL→timestamp anyway. | |

**User's choice:** Backfill to created_at (recommended)
**Notes:** Captured as D-03 in CONTEXT.md. Guarantees zero user lockout on deploy.

---

### Q2: How do we compare JWT iat (seconds) against users.password_changed_at (postgres μs precision)?

| Option | Description | Selected |
|--------|-------------|----------|
| Math.floor(pwd_changed/1000) strict-less | `jwt.iat < Math.floor(user.password_changed_at.getTime()/1000)`. New JWT minted AFTER write has iat ≥ floored ts → passes; older JWTs fail. | ✓ |
| Inclusive compare (iat ≤ pwd_changed) | Would kill the just-issued JWT if iat == floor(ts/1000). Not worth the footgun. | |
| Compare in milliseconds | JWT iat rounds DOWN to second → iat*1000 ≤ actual-issue-time. False positives on sub-second changes. | |

**User's choice:** Math.floor(pwd_changed/1000) strict-less (recommended)
**Notes:** Captured as D-05. D-14 locks the ordering (DB update BEFORE signToken) to guarantee the monotonic invariant.

---

### Q3: Where does the password_changed_at gate run on each authenticated request?

| Option | Description | Selected |
|--------|-------------|----------|
| Inside bearerAuth JWT path, joined read on users | Extra `SELECT` after verifyToken() and before c.set('userId'). vk_ keys unaffected. Negligible cost at current scale. | ✓ |
| New dedicated gate middleware | Separate concerns but two middlewares doing DB reads on same request path → premature abstraction. | |
| Cache pwd_changed in JWT claims | Avoids DB read but breaks Phase 112 clean invalidation — against AUTH-09's 'remain logged in' requirement. | |

**User's choice:** Inside bearerAuth JWT path (recommended)
**Notes:** Captured as D-06. Insertion point: `src/middleware/auth.ts:92` immediately after `verifyToken()`.

---

### Q4: How does the PWA stay logged in after a successful password change?

| Option | Description | Selected |
|--------|-------------|----------|
| Endpoint returns new JWT; PWA swaps sessionStorage | POST response `{ token, user }` — mirrors /auth/login. PWA swaps `sessionStorage['vigil_token']` BEFORE next fetch. | ✓ |
| Server sets JWT cookie, client doesn't manage | Asymmetric with rest of auth stack (Phase 104 D-04 sessionStorage). Massive scope creep. | |
| Client re-issues via /auth/login after success | Two round-trips + keep password in memory + new failure mode. | |

**User's choice:** Endpoint returns new JWT + swap sessionStorage (recommended)
**Notes:** Captured as D-13/D-14/D-17. Response shape mirrors /auth/login verbatim.

---

## Confirmation email scope

### Q1: REQUIREMENTS.md AUTH-09 mentions 'confirmation email as anti-hijack signal', but Phase 111 (Resend infra) ships AFTER Phase 110. Scope for confirmation email?

| Option | Description | Selected |
|--------|-------------|----------|
| Defer entirely; revisit post-Phase-111 | Phase 110 ships with zero email plumbing. Roadmap SC#1-4 doesn't mention email. Open follow-up insert for after EMAIL-01. | ✓ |
| Add no-op stub hook now with TODO(EMAIL-01) | Lands dead code + test for a stub. Trades Phase-109 'TODO in-place, don't stub' hygiene. | |
| Pull EMAIL-01 forward into Phase 110 | Collapses 110+111. DNS propagation non-deterministic per STATE.md — gating AUTH-09 on propagation is real shipping risk. | |

**User's choice:** Defer entirely (recommended)
**Notes:** Captured in Deferred Ideas. Follow-up plan described: Phase 111.1 insert or Phase 112 fold.

---

## New-password validation rules

### Q1: Reject new password that equals current password (accidental no-op case)?

| Option | Description | Selected |
|--------|-------------|----------|
| Reject with 400 'new password must differ' | Second verifyPassword on happy path (~50-100ms). Pre-empts pointless password_changed_at bump + device logout cascade. | ✓ |
| Allow, let the gate invalidate old JWTs anyway | Simpler code. 'Nothing changed but everyone's logged out' is weird. | |
| Skip check AND skip password_changed_at bump when equal | Smart no-op but complicates logic + hides the edge case. | |

**User's choice:** Reject with 400 (recommended)
**Notes:** Captured as D-11 step 4 + D-12.

---

### Q2: Rate-limiting strategy for wrong-current-password attempts?

| Option | Description | Selected |
|--------|-------------|----------|
| Rely on existing global rate limit (100 req/60s) | Endpoint is post-auth — not an unauthenticated attack surface. No credible threat at current scale. | ✓ |
| Per-user counter: lock after 5 wrong in 15min | Defense-in-depth for partial JWT compromise scenario. State + cleanup + unlock path. | |
| Defer to v3.7 when user count grows | Explicit deferred-idea note only. Same as recommended but explicit. | |

**User's choice:** Rely on global rate limit (recommended)
**Notes:** Captured in Deferred Ideas. Revisit at >10 users or first multi-tenant customer.

---

### Q3: Additional password-complexity policy beyond 12-128 length?

| Option | Description | Selected |
|--------|-------------|----------|
| Length only — 12-128, no complexity rules | Matches REQUIREMENTS Out-of-Scope + /auth/register behavior exactly. Same error text. | ✓ |
| 'Not in top 10k common passwords' check | Bundle zxcvbn. Explicitly out-of-scope per REQUIREMENTS. | |

**User's choice:** Length only (recommended)
**Notes:** Captured as D-11 step 3. Same MIN_PASSWORD/MAX_PASSWORD constants as /auth/register.

---

## PWA form placement & UX

### Q1: Where does the Change Password form live?

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable block inside Vigil Account card | Inline below email + Sign out. Mirrors Google card's inline confirm-disconnect UX vocabulary. | ✓ |
| Separate card below Vigil Account | Full-width card with own heading. Splits account actions for no benefit. | |
| Dedicated /settings/change-password route | Over-engineered for one form. Navigation + back-button UX problem. | |

**User's choice:** Expandable block inside Vigil Account card (recommended)
**Notes:** Captured as D-15.

---

### Q2: Form fields, visibility toggle, and success feedback?

| Option | Description | Selected |
|--------|-------------|----------|
| 2 fields + show/hide per field + inline success | current-password + new-password with autocomplete; eye-icon toggle; inline green success text; collapse after 2s. | ✓ |
| 3 fields with confirm-password | Explicitly ruled out by REQUIREMENTS (CXL 56% conversion hit). | |
| 2 fields, no toggle, toast-based success | Minimal but loses typo-verification UX; toast timing risks missed confirmation. | |

**User's choice:** 2 fields + toggle + inline (recommended)
**Notes:** Captured as D-16/D-17.

---

### Q3: How to surface the 401 'current password wrong' error?

| Option | Description | Selected |
|--------|-------------|----------|
| Generic inline message: 'Current password is incorrect' | Safe because endpoint is post-auth — caller known-authenticated, no enumeration surface. Concrete UX string. | ✓ |
| Generic 'Something went wrong. Try again.' | Max defense but vague — frustrates legitimate user. | |
| Distinguish 401 / 400 / 500 | Three branches. Slightly better diagnostics. Matches AuthPage.tsx pattern. | |

**User's choice:** Generic inline message (recommended)
**Notes:** Captured as D-18. Also introduces D-08 (distinct 'Session expired' body for the bearerAuth gate 401) which is handled globally via D-19.

---

## Claude's Discretion

Areas where the user said "you decide" or deferred to Claude:
- Exact wording of inline success/error messages (semantic contract captured; prose flexible)
- Whether D-19's global 401 handler is a new utility or an edit to existing client.ts fetch wrapper
- Change-password button styling (text-only / icon+text / overflow menu) — match existing Settings vocabulary
- Test split across plans (planner's call — 3 plans vs fewer based on natural seams)
- TODO-in-place rewrites — apply only if an existing TODO marker is touched

## Deferred Ideas

- Confirmation email (REQUIREMENTS AUTH-09) — Phase 111.1 insert or Phase 112 fold
- Per-endpoint rate limiting for wrong-current-password — revisit at >10 users
- Common-password / zxcvbn dictionary — explicitly out-of-scope (REQUIREMENTS)
- JWT revocation list / token_version — explicitly out-of-scope (REQUIREMENTS, this phase is the cheaper substitute)
- vk_ key rotation on password change — separate phase if ever desired
