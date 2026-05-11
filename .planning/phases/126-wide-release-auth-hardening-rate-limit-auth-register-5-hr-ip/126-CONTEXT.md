---
phase: 126
slug: wide-release-auth-hardening
status: context-gathered
date: 2026-05-11
---

# Phase 126 — Context

## Domain

Close the auth surface gaps between current state (family allowlist beta) and public-traffic-ready, so the `VIGIL_ALLOWED_EMAILS="*"` switch can be flipped without inviting bots or burning Anthropic budget.

**Triggering incident (2026-05-11):** Family member trying to sign up at `app.vigilhub.io` hit "Invalid email or password" — actually a 403 from the allowlist gate that the PWA collapsed into a generic message. The incident exposed 8 gaps simultaneously (rate-limit, captcha, email-verify enforcement, error tracking, error-message UX, legal pages, spend cap, allowlist switch).

## Scope (from ROADMAP.md — locked)

Requirements AUTH-126-01 through AUTH-126-08. See `.planning/ROADMAP.md` § Phase 126 for the canonical list. Success criteria are also defined there.

## Decisions

### D-01 — Captcha provider: Cloudflare Turnstile

**Decision:** AUTH-126-02 uses Cloudflare Turnstile (free tier).

**Rationale:** No PII, ~15min PWA + server integration, works regardless of PWA host (Vercel today, anything tomorrow). Mostly-invisible UX matches the product feel. Vercel BotID was a viable alternative since the PWA is on Vercel (`vigil-pwa/vercel.json` confirms), but Turnstile is portable and battle-tested.

**Implementation shape:**
- PWA: `@marsidev/react-turnstile` widget on signup form. Pass `TURNSTILE_SITE_KEY` from env. Submit token alongside email+password.
- Server: new `verifyTurnstileToken(token, remoteIp)` helper in `vigil-core/src/lib/`. Call from `/auth/register` BEFORE `isAllowlistedEmail` check. Use `TURNSTILE_SECRET_KEY` against `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Drift-detector test asserts the helper is invoked (cannot be silently disabled).
- Failure mode: 400 `{error: "Captcha verification failed", code: "CAPTCHA_FAILED"}`.

**Test cases:**
- Valid token → proceed to allowlist check
- Missing/invalid token → 400 CAPTCHA_FAILED, allowlist not consulted
- Token verify endpoint times out → 503 (don't fail-open)
- Helper-invocation drift detector (test asserts the call site exists, not just the helper)

### D-02 — Email-verification enforcement: 24h grace window, then strict 403

**Decision:** AUTH-126-03 implements a soft-to-strict transition. For 24h after signup, `/v1/*` routes work for unverified users. After 24h, middleware returns `403 {error: "Verify your email to continue", code: "EMAIL_NOT_VERIFIED", verified_after_iso: <user.createdAt + 24h>}`.

**Rationale:** Strict-from-signup risks locking out users whose Resend deliverability is slow or whose verification email lands in spam. 24h grace lets the user actually try the product (which is when they're motivated to fix the inbox issue). Mirrors industry default (Stripe, Linear).

**Implementation shape:**
- New middleware `requireVerifiedEmailWithGrace` in `vigil-core/src/middleware/`. Mounts AFTER `bearerAuth` and BEFORE `/v1/*` routes (per `vigil-core/src/index.ts:43` convention — Phase 124/125 carryforward).
- Reads `users.emailVerifiedAt` AND `users.createdAt` (or `passwordChangedAt` for claim-flow users — TBD by planner). If `emailVerifiedAt IS NOT NULL`: pass. Else if `now < createdAt + 24h`: pass. Else: 403.
- Returns `verified_after_iso` in the 403 body so the PWA can show a countdown ("You can use Vigil for 18 more hours before verification is required").
- Bypass list: `/v1/health`, `/v1/auth/*` (login/logout/resend-verification all stay open).

**Test cases:**
- Verified user → pass (regardless of age)
- Unverified user signed up 5min ago → pass (within grace)
- Unverified user signed up 25h ago → 403 EMAIL_NOT_VERIFIED with verified_after_iso in past
- Existing Phase 113 seed user with emailVerifiedAt backfilled → pass (regression guard)
- Drift-detector test asserts middleware is mounted at the canonical position in index.ts

### D-03 — Rate limit on /auth/register: IP + email dual-counter

**Decision:** AUTH-126-01 mirrors `forgot-password.ts` exactly:
- `RATE_LIMIT_MAX_IP = 20` (per hour per IP)
- `RATE_LIMIT_MAX_EMAIL = 5` (per hour per email)

**Rationale:** Turnstile (D-01) is the primary bot defense; rate limit is defense-in-depth. Dual-counter catches both IP-rotating bots (one email, many IPs) and email-rotating bots (one IP, many emails). The IP-only alternative is cheaper but trivially defeated. Forgot-password.ts is the canonical Phase 117 AUTH-13 implementation — re-use the pattern verbatim.

**Implementation shape:**
- Two `const RATE_LIMIT_MAX_* = N` declarations at the top of `auth.ts` (Phase 117 drift-detector convention — tests assert the literal verbatim).
- Two in-memory Maps keyed by `ip:H` and `email:H` where H is the hour bucket. Cleanup interval matches `forgot-password.ts`.
- Hit either cap → 429 `{error: "Too many registration attempts", code: "RATE_LIMITED", retry_after_seconds: N}`. PWA reuses the AUTH-12/13 retry-after countdown UX (Phase 125 carryforward reference).
- Drift-detector tests assert both `MAX_IP=20` and `MAX_EMAIL=5` are present in the source verbatim (test names follow `AUTH-126-CAP-IP-20` and `AUTH-126-CAP-EMAIL-5` convention from Phase 117).

**Test cases:**
- 5 registrations from IP A for email X → 6th is 429 (email cap)
- 20 registrations from IP A across distinct emails → 21st is 429 (IP cap)
- Counters reset hourly (sliding window)
- 429 response body includes retry_after_seconds matching the hour boundary

### D-04 — PWA error UX: structured `{error, code}` + PWA-side error-code map

**Decision:** AUTH-126-05 changes all `/auth/*` error responses (and AUTH-126-03 middleware errors) to include a stable `code` field alongside the human-readable `error` string. PWA maps `code → user-facing UI message + optional next-step CTA`.

**Rationale:** The triggering incident was the PWA collapsing a real 403 into "Invalid email or password" — that hid the signal from the operator AND confused the family member. Raw-passthrough fixes the bug but ties UI copy to backend strings forever. Structured codes give precise signal for debugging (Sentry will capture the code) AND friendly UX AND let the PWA evolve copy without backend deploys.

**Code enum (locked at this discussion; planner may add more during plan-phase but cannot remove):**
- `CAPTCHA_FAILED` — Turnstile token invalid/missing (400)
- `RATE_LIMITED` — registration rate limit hit (429, includes `retry_after_seconds`)
- `REG_NOT_ALLOWED` — email not on allowlist when allowlist active (403)
- `INVALID_EMAIL_FORMAT` — email shape fails validation (400)
- `PASSWORD_TOO_SHORT` / `PASSWORD_TOO_LONG` — outside MIN/MAX bounds (400)
- `EMAIL_TAKEN` — existing user with real hash, can't claim (409)
- `EMAIL_NOT_VERIFIED` — grace window expired (403, includes `verified_after_iso`)
- `INVALID_CREDENTIALS` — login-only, generic per security best-practice (401)

**Implementation shape:**
- vigil-core: update every `return c.json({ error: ... }, status)` in `auth.ts` (and the new middleware D-02) to also include `code`. Existing error shape stays additive — backward-compatible for any consumer reading `error` only.
- vigil-pwa: new `src/lib/api-error-codes.ts` with a `code → { message, ctaLabel?, ctaHref? }` map. Signup/login form error rendering switches from "show error string" to "look up code, render mapped UX with fallback to raw error if code is unknown".
- Drift-detector test in `auth.test.ts` asserts every error response includes both `error` and `code` (prevents future regression where someone forgets the `code` field).

**Test cases:**
- Every auth error path returns both `error` and `code`
- Unknown codes fall back to raw `error` string in PWA (forward-compat for new codes added server-side)
- Codes are stable strings (drift-detector locks the enum's existence; planner-added codes extend, never replace)

## Planner Discretion (intentionally not locked)

The planner picks the cheap-and-correct option for each:

- **AUTH-126-04 Sentry setup** — single Sentry project covering both vigil-core and vigil-pwa (with environment + service tags), OR separate projects. Either works; single is simpler for a 1k-event/mo launch.
- **AUTH-126-06 Legal pages** — Termly free tier (hosted or exported), hand-rolled, or any equivalent. Goal is publishable `/legal/privacy` and `/legal/terms` returning 200 with linkable content, footer link on signup screen. Lawyer review optional pre-launch — recommended within 30 days post-revenue.
- **AUTH-126-08 sentinel semantics** — `*` is the locked sentinel; whether to also support `*@domain.com` is planner discretion. Strict `*` is enough for a v1 launch.

## Operator-Only (NOT a code task)

- **AUTH-126-07 — Anthropic monthly spend cap.** Operator action: log into Anthropic console, set monthly spend limit. Plan a wallclock todo at `.planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md` so this can't ship without a checkmark. Recommended: cap = 3× expected baseline so single-bad-actor traffic burns visibly but doesn't take the service down.

## Deferred Ideas (Phase 127+)

These came up but are out of scope for 126:

- **Secret-drift hardening rider** — automated post-rotation connectivity check + alerting (today's PostHog event was rotation-#2 residual; the rotation #1 and #2 ate 2 Postgres rotations historically per memory). Single-source-of-truth secret mgmt belongs in its own phase. Not blocking wide-release.
- **CSP header tuning** — `secureHeaders()` defaults don't include strict CSP; tightening is a separate phase that needs PWA origin enumeration + dev-iteration.
- **Per-user AI usage quota** — DB schema add (`monthly_ai_calls`, `monthly_ai_calls_reset_at`), middleware on `/v1/{therapy,insights,process-photo,chat}`, billing tier surface. Bigger scope than Phase 126; depends on pricing decision.
- **Brute-force protection on /auth/login** — currently relies on global 100/60s rate limit. Per-email failed-attempt counter belongs in a separate phase (similar shape to D-03 but for /auth/login).
- **GDPR/CCPA data-export + delete-account endpoint** (`DELETE /v1/me`) — required if EU/CA users land. Separate phase.
- **Sign-in-with-Google** as alternative to email/password — fewer signup-form failures, no password to lose. Bigger scope than 126.

## Reviewed Todos (matched but not folded)

- `.planning/todos/pending/2026-05-09-phase-123-24h-soak-operator-run.md` (score 0.6) — matched on text overlap with "operator action / wallclock". This is Phase 123's open todo, not Phase 126 work. No fold.

## Code Context (reusable assets)

- `vigil-core/src/middleware/auth.ts:40` — `bearerAuth` middleware; new email-verify middleware mounts AFTER this, BEFORE `/v1/*` route registrations (per `vigil-core/src/index.ts:43` mount-order convention)
- `vigil-core/src/routes/forgot-password.ts` — canonical IP + email dual-counter pattern with drift-detector tests (Phase 117 AUTH-13)
- `vigil-core/src/routes/resend-verification.ts:37`, `verify-email.ts:46`, `reset-password.ts:58` — per-route rate-limit declarations with verbatim `RATE_LIMIT_MAX = N` convention
- `vigil-core/src/routes/auth.ts:74-128` — current `isAllowlistedEmail` + `/auth/register` body. AUTH-126-01/02 land BEFORE the allowlist check; AUTH-126-08 sentinel handling lands INSIDE `isAllowlistedEmail`
- `vigil-core/src/index.ts:121-130` — `secureHeaders()` mount; AUTH-126-04 Sentry init lands BEFORE this; CSP tightening deferred
- `vigil-core/src/analytics/posthog.ts` — existing `captureException` wrapper; Sentry coexists, both capture. Don't tear out PostHog
- `vigil-core/src/services/email-service.ts` — Resend wrapper; AUTH-126-03 grace-window middleware does NOT touch this (verification email send already wired in `auth.ts:152`)
- `vigil-pwa/src/` — Vite SPA; PWA-side work for AUTH-126-02 (Turnstile widget), AUTH-126-05 (error-code map), AUTH-126-04 (Sentry browser SDK)

## Canonical Refs

- `.planning/ROADMAP.md` § Phase 126 — scope and success criteria (locked)
- `vigil-core/src/routes/forgot-password.ts` — IP + email rate-limit reference impl
- `vigil-core/src/routes/auth.ts` — current `/auth/register` body
- `vigil-core/src/middleware/auth.ts` — bearerAuth middleware (mount-order anchor)
- `vigil-core/src/index.ts:43` — bearerAuth dispatcher mount point (carryforward from Phase 124 CONTEXT)
- `vigil-pwa/vercel.json` — confirms Vercel hosting (informed D-01)
- `.planning/seeds/SEED-017-*.md` — sibling concern about secret-drift hardening; out of scope here
- Memory `project_vigil_core_env_gates.md` — documents the PWA error collapse bug that triggered this phase
- Memory `project_secret_drift.md` — captures the rotation pattern that produced today's PostHog signal
- https://developers.cloudflare.com/turnstile/ — D-01 implementation reference
- https://docs.sentry.io/platforms/javascript/guides/node/ + .../guides/react/ — AUTH-126-04 reference (planner reads during research)
- https://termly.io/products/privacy-policy-generator/ — AUTH-126-06 candidate (planner discretion)
