# Phase 113: Verify Email on Signup — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 113-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 113-verify-email-on-signup
**Areas discussed:** Verify-link UX & Apple Mail prefetch, Banner placement & resend UX, Register-time email send timing, emailVerifiedAt exposure to PWA

---

## Gray Area Selection

**Question:** Which areas do you want to discuss for Phase 113 (Verify Email on Signup)?

| Option | Description | Selected |
|--------|-------------|----------|
| Verify-link UX & Apple Mail prefetch | Pure GET claim+redirect vs PWA confirm-click gate. Apple Mail prefetch could burn tokens before human sees inbox. | ✓ |
| Banner placement & resend UX | Settings only or shell-wide? Dismissible? Resend button states. | ✓ |
| Register-time email send timing | Fire-and-forget vs await Resend response. | ✓ |
| emailVerifiedAt exposure to PWA | Login response only, /me endpoint, or both. | ✓ |

**User's choice:** All four areas selected.

---

## Area 1: Verify-link UX & Apple Mail prefetch

### Q1.1 — How should clicking the email verification link translate to setting emailVerifiedAt?

| Option | Description | Selected |
|--------|-------------|----------|
| PWA confirm-click gate (Recommended) | Email link → PWA static page → user clicks Confirm → POST claims token. Mirrors Phase 112 D-18. Prefetch-safe. | ✓ |
| Pure GET claim + 302 redirect | Email link → GET endpoint claims atomically → 302 to PWA result page. Zero-click but Apple Mail prefetch burns token. | |
| GET with HEAD/UA filter heuristic | Filter prefetch by request shape (HEAD, UA). Brittle — Apple uses generic UAs deliberately. | |

**User's choice:** PWA confirm-click gate (Recommended).
**Notes:** The prefetch concern is decisive — verify has no input field, so the form-submit gate Phase 112 used for reset-password becomes an explicit Confirm button here.

### Q1.2 — What should the PWA /auth/verify page look like and how should it behave on mount?

| Option | Description | Selected |
|--------|-------------|----------|
| Static page, no fetch on mount, single Confirm button (Recommended) | Mount: parse ?token. If missing, error. If present, render heading + Confirm button. POST only on click. | ✓ |
| Auto-POST on mount (no Confirm button) | Defeats the prefetch protection — Apple Mail would auto-trigger. | |
| Static page with Confirm + countdown auto-claim after 5s | Adds complexity with no benefit. | |

**User's choice:** Static page, no fetch on mount, single Confirm button.

### Q1.3 — Where should the user land after a successful verify?

| Option | Description | Selected |
|--------|-------------|----------|
| Stay on /auth/verify, swap to success state in place (Recommended) | Same page renders success message + "Go to app" link. No redirect. Works in both logged-in and logged-out states. | ✓ |
| Redirect to PWA home (/) | Bounces logged-out users to /auth. | |
| Redirect to /auth?reason=email_verified | Mirrors Phase 110/112 banner-on-login pattern. Awkward if user is already logged in. | |

**User's choice:** Stay on /auth/verify, swap in place.

### Q1.4 — What error states should the /auth/verify page handle?

| Option | Description | Selected |
|--------|-------------|----------|
| Missing token in URL (no ?token param) (Recommended) | Render explicit "link is malformed" state with a path back to Settings/login. | ✓ |
| Token claim returned 400 (expired / used / unknown) (Recommended) | Single generic state per Phase 112 D-20 single-bucket pattern. | (rolled into D-21 Claude's Discretion) |
| Network/server 5xx (Recommended) | Generic error + retry button. | (rolled into D-21 Claude's Discretion) |

**User's choice:** Missing token in URL (explicit). The other two are folded into Claude's Discretion under D-21 — generic single-bucket error UX (Phase 112 D-20 pattern) covers 400/5xx/network identically.

---

## Area 2: Banner placement & resend UX

### Q2.1 — Where should the 'verify your email' banner appear in the PWA?

| Option | Description | Selected |
|--------|-------------|----------|
| Settings page only, per SC#2 literal (Recommended) | Cleanest, lowest friction, matches SC#2 literal. | ✓ |
| Settings page + thin shell-level strip on every authed page | More visible nag. Slightly beyond SC#2 literal. | |
| Just on login screen as a post-login redirect interstitial | Adds a route and login-flow complexity. | |

**User's choice:** Settings page only.

### Q2.2 — Should the Settings banner be dismissible per session?

| Option | Description | Selected |
|--------|-------------|----------|
| Not dismissible — always shown until verified (Recommended) | Simple state machine, mirrors Phase 112 banners. | ✓ |
| Dismissible per session (sessionStorage) | More polite, slightly more code. | |
| Dismissible permanently (localStorage) | Bad — user can lock themselves out of seeing the prompt. | |

**User's choice:** Not dismissible.

### Q2.3 — How should the Resend button behave across its lifecycle?

| Option | Description | Selected |
|--------|-------------|----------|
| Idle → Sending… → Sent (10s) → Idle, with 429 toast on rate-limit (Recommended) | Full lifecycle with auto re-enable so user can retry on spam-filter cases. 429 inline error. | ✓ |
| Idle → Sending → Permanent 'Sent' state (no re-resend until reload) | Blocks legit retry after spam-folder loss. | |
| Click → spinner only → toast on completion, button always enabled | Lets user spam-click. | |

**User's choice:** Full lifecycle with 10s window then re-enable.

---

## Area 3: Register-time email send timing

### Q3.1 — Should the verification email send block the register response, or fire-and-forget?

| Option | Description | Selected |
|--------|-------------|----------|
| Fire-and-forget after 201 (Recommended) | Phase 112 D-21 pattern. Register stays fast. Resend banner is the recovery path. | ✓ |
| Await send, return 201 only after Resend responds | Adds 200-500ms p95 with no caller-visible benefit (swallow rule). | |
| Await with timeout (e.g., 1s), then fall back to background | Best-effort latency cap. Not worth the complexity. | |

**User's choice:** Fire-and-forget.

### Q3.2 — When should the verify token be generated and inserted into password_reset_tokens?

| Option | Description | Selected |
|--------|-------------|----------|
| Inside register handler, BEFORE returning 201 (Recommended) | Token durable in DB before response. Failed background send still leaves user able to Resend. | ✓ |
| Inside register handler, but only after queue the send | Worse — failed send leaves no token. | |
| Lazy — generate on first Resend click, not on register at all | Breaks SC#1 ("within seconds of registration"). | |

**User's choice:** Generate token in handler before 201.

### Q3.3 — For the claim flow (seed user with placeholder hash), should it ALSO trigger a verification email?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — claim issues verify email too (Recommended) | Treat claim as registration. Skip if emailVerifiedAt already set (post-backfill). | ✓ |
| No — claim trusts the seed allowlist | Lower friction but skips deliverability check. | |

**User's choice:** Yes, claim issues verify email (with already-verified guard).

---

## Area 4: emailVerifiedAt exposure to PWA

### Q4.1 — How should the PWA learn whether the current user is verified?

| Option | Description | Selected |
|--------|-------------|----------|
| New GET /v1/auth/me + add emailVerifiedAt to login response (Recommended) | Belt-and-suspenders. Login cache for first paint, /me on Settings mount for SC#3 freshness. | ✓ |
| Just add to login response, no /me endpoint | Banner persists until logout/login — fails SC#3. | |
| Just add /me endpoint, don't change login response | Lazy fetch on Settings mount only; works but no login cache. | |
| WebSocket / push notification on verify | Vastly over-engineered. | |

**User's choice:** Both — new /me endpoint AND extend login response.

### Q4.2 — What exactly should /v1/auth/me return?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: { id, email, emailVerifiedAt } (Recommended) | Just the fields PWA needs. Tightest possible response. | ✓ |
| Everything from users table (id, email, emailVerifiedAt, createdAt, passwordChangedAt) | passwordChangedAt is sensitive; over-exposure. | |
| Returns full user + flags | Premature — no flags concept yet. | |

**User's choice:** Minimal three-field response.

### Q4.3 — Where in PWA code should the /me call live, and what's the cache strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Settings page mount only, no global cache (Recommended) | useEffect in SettingsPage. Local component state. No global store. Smallest possible change. | ✓ |
| Global auth store (zustand/context), refreshed on login + on Settings mount | More invasive; premature. | |
| Cache /me response in localStorage with TTL | Adds complexity for a one-time NULL → timestamp transition. | |

**User's choice:** Local SettingsPage state, no global cache.

---

## Final check

**Question:** We've covered all 4 areas. Anything else, or ready to write CONTEXT.md?

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for context | Write CONTEXT.md and DISCUSSION-LOG.md. | ✓ |
| Explore more gray areas | Surface additional areas (resend endpoint shape, migration index, test scope, smoke test). | |
| Revisit an area | Go back to a previous area. | |

**User's choice:** Ready for context.

---

## Claude's Discretion

Captured in CONTEXT.md under "Claude's Discretion":
- Exact wording of success messages, error copy, and banner microcopy.
- Migration filename if 0017 is taken.
- Whether to extract a shared `tokenIssue.ts` helper for the now-4-place duplication.
- Test file layout (single auth.test.ts vs split).
- HTTP status codes for resend endpoint (200/429/401 + already-verified).
- Whether to add `getMe` as a method on `vigilFetch` or call it directly.
- PostHog `email_verified` event for funnel analytics (nice-to-have).
- Specific banner color (light yellow / amber to match Vigil PWA palette).
- Generic single-bucket error UX on the verify page covers 400/5xx/network identically (rolled in from Q1.4).

## Deferred Ideas

Captured in CONTEXT.md under "Deferred Ideas":
- Shell-level banner on every authed page.
- Auto-claim verify on logged-in /me hit.
- Confirmation email "Your email was verified".
- Funnel analytics PostHog event (if not adopted in Discretion).
- Cleanup cron for expired/used email_verify rows.
- Index on email_verified_at.
- Email change re-verification (AUTH-12 — already roadmap-deferred to v3.7).
- Custom branded /auth/verify landing page.
