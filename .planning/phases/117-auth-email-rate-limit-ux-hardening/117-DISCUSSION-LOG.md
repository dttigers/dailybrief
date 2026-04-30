# Phase 117: Auth-email rate-limit UX hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 117-auth-email-rate-limit-ux-hardening
**Areas discussed:** Forgot-password tension, Rate-limit cap policy, Countdown UX, Bucket-split mechanics

---

## Forgot-password tension

| Option | Description | Selected |
|--------|-------------|----------|
| Keep 200 silent | AUTH-12 applies to 3 endpoints only. forgot-password preserves enum-safety. | ✓ |
| Switch to 429 like the others | Treat AUTH-12 literally. Breaks enum safety per SC#3. | |
| 200 silent + soft floor (raise cap) | Keep 200, raise cap. (Folded into D-05 rather than picked here.) | |

**User's choice:** Keep 200 silent — recommended.
**Notes:** Locks the boundary that AUTH-12 covers 3 endpoints not 4.

| Option | Description | Selected |
|--------|-------------|----------|
| Existing generic success | Keep current "If an account exists, we sent a reset link." copy. | ✓ |
| Add silent retry hint | Show client-side "wait a few minutes" after 3+ rapid submits. No server signal. | |

**User's choice:** Existing generic success — recommended.
**Notes:** No PWA work for forgot-password in 117.

---

## Rate-limit cap policy (AUTH-13)

| Option | Description | Selected |
|--------|-------------|----------|
| Raise to 20/hr per-IP | Tolerates ~4-user household NAT. Hard-blocks abuse at 100/min. | ✓ |
| Raise to 10/hr per-IP | Doubles cap. May still trip 3+ person households. | |
| Keep 5/hr but add per-email axis | Tighter abuse posture, more code. | |
| Raise 20/hr AND add per-email axis | Belt-and-suspenders. Most resilient, most code. | |

**User's choice:** Raise to 20/hr per-IP — recommended (verify-email + reset-password).
**Notes:** Single constant change per route. No new axis. Mirrors current shape.

| Option | Description | Selected |
|--------|-------------|----------|
| Raise to 5/hr per-userId | Modest raise. Resend-verification more tolerant. | ✓ |
| Keep 3/hr per-userId | Current. Don't change. | |
| Raise to 5/hr + add per-IP burst guard | Defense against multi-userId attacker on single IP. | |

**User's choice:** Raise to 5/hr per-userId — recommended (resend-verification).

| Option | Description | Selected |
|--------|-------------|----------|
| Raise per-IP to 20/hr, keep per-email at 5/hr | Mirrors verify/reset cap raise; per-email defense intact. | ✓ |
| Keep both at 5/hr | Current. forgot-password is silent so no UX win from raising. | |
| Raise both to 10/hr | Both axes more headroom. Slightly weaker abuse posture. | |

**User's choice:** Raise per-IP to 20/hr, keep per-email at 5/hr — recommended (forgot-password).

---

## Countdown UX

| Option | Description | Selected |
|--------|-------------|----------|
| Match Phase 116.1 pattern | Live mm:ss tick + disabled Submit + cleanup on unmount. | ✓ |
| Static "try again in N minutes" | One-shot rounded render, no tick. Simpler. | |
| Live countdown but Submit always enabled | Tick visible, user can retry early at risk of 429 again. | |

**User's choice:** Match Phase 116.1 pattern — recommended.
**Notes:** Single visual standard across the app.

| Option | Description | Selected |
|--------|-------------|----------|
| VerifyEmailPage | Where users land from email link. | ✓ |
| ResetPasswordPage | Where users submit new password after clicking reset link. | ✓ |
| Verify-email banner (in-app) | Hypothetical banner with Resend button. | |
| AuthPage (login/register) | Probably no auth-email endpoints fire from here. | |

**User's choice:** VerifyEmailPage + ResetPasswordPage.
**Notes:** Code scout found resend-verification is called from SettingsPage:518, not a separate banner — addressed in follow-up question below.

| Option | Description | Selected |
|--------|-------------|----------|
| "Too many attempts — try again in {countdown}." | Matches AUTH-12 phrasing. | ✓ |
| "You've hit the retry limit. Wait {countdown} before trying again." | Slightly softer. | |
| Per-endpoint copy variants | More descriptive but more strings to maintain. | |

**User's choice:** "Too many attempts — try again in {countdown}." — recommended.

---

## Settings UX (follow-up after scout finding)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — same pattern | SettingsPage Resend Verification button uses same disabled+countdown UX. | ✓ |
| Yes, but inline-only — no countdown | Disabled button, no live timer. Less polished, less code. | |
| Skip — leave generic | Drift from AUTH-12 spec. | |

**User's choice:** Yes — same pattern — recommended.
**Notes:** Confirmed AUTH-12 covers 3 endpoints across 3 PWA surfaces (VerifyEmailPage, ResetPasswordPage, SettingsPage Resend button).

---

## Bucket-split mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Extend classifyFetchError | Add 5th bucket 'rate-limited'. Single helper. | ✓ |
| Write new classifyAuthError | Auth-specific buckets in separate helper. | |
| Inline switch statements per page | No shared helper. Simplest, duplicated. | |

**User's choice:** Extend classifyFetchError — recommended.

| Option | Description | Selected |
|--------|-------------|----------|
| rate-limited (429) — new countdown copy | Primary deliverable. | ✓ |
| token-expired/invalid (410 / 4xx) — keep "no longer valid" | SC#4 requires this bucket distinct from 429. | ✓ |
| validation-error (400) — field-specific copy | Useful for ResetPasswordPage password rules. | |
| network/server-error — generic retry | Defensive, out of scope. | |

**User's choice:** rate-limited + token-expired/invalid.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep deferred | SEED-004 stays deferred per PROJECT.md. | ✓ |
| Fold into 117 | Add 4th bucket for token-rotated. Requires server-side cause-tracking. | |

**User's choice:** Keep deferred — recommended.

---

## Claude's Discretion

- Exact placement of countdown text within each page's error block (above/below the message, badge vs inline text)
- Whether to extract countdown into a shared `<RateLimitCountdown>` component or inline per page
- Test fixture shape for the new `rate-limited` bucket in classifyFetchError tests

## Deferred Ideas

- **SEED-004** — Token rotation copy ("This link was replaced by a newer email")
- Per-endpoint 429 copy variants (rejected in favor of single string)
- Static "try again in N minutes" non-ticking copy (rejected in favor of live mm:ss)
- Validation-error (400) bucket on PWA
- Network/server-error generic retry bucket on auth pages
- Multi-instance shared rate-limit store
- Cooldown UI on AuthPage (login/register) — confirm need during planning
