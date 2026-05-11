---
phase: 126
date: 2026-05-11
---

# Phase 126 — Discussion Log

Human-readable record of the discuss-phase session. Source for audits and retrospectives. NOT consumed by downstream agents (researcher/planner/executor).

## Trigger

Family member trying to sign up at `app.vigilhub.io` hit "Invalid email or password". Operator opened the PWA error, traced it to a 403 from `isAllowlistedEmail()` in `vigil-core/src/routes/auth.ts:126`, and confirmed via Railway env-var probe that the email wasn't on `VIGIL_ALLOWED_EMAILS`. Two emails were added to the allowlist as an immediate fix (`trujillo717@gmail.com`, `morrillshanna@gmail.com`).

But the underlying ask was bigger: "I want to open this for anyone to sign up and try." A wide-release readiness audit surfaced 8 gaps — Phase 126 was opened to close them.

## Gray Areas Presented

Selected: all 4.

1. Captcha provider (Turnstile / BotID / hCaptcha)
2. Email-verification enforcement strategy (strict / grace / soft)
3. Rate limit scope on /auth/register (IP-only / IP + email / defer)
4. PWA error UX (structured / raw / generic+link)

## Area 1 — Captcha Provider

**Question:** Which captcha for `/auth/register`?

**Options presented:**
- Cloudflare Turnstile (Recommended)
- Vercel BotID
- hCaptcha

**User selection:** Cloudflare Turnstile.

**Note:** Vercel BotID was viable because vigil-pwa is on Vercel (confirmed via `vigil-pwa/vercel.json`). Turnstile chosen for portability + no PII + battle-tested.

## Area 2 — Email-Verification Enforcement

**Question:** When does the /v1/* email-verified gate kick in?

**Options presented:**
- Strict — 403 immediately for unverified
- Grace window — 24h after signup, then strict (Recommended)
- Soft — banner + warn-after-N-requests

**User selection:** Grace window — 24h, then strict.

**Note:** Resend deliverability isn't 100%; strict-from-signup risks locking out legit users. Grace mirrors Stripe/Linear convention.

## Area 3 — Rate Limit Scope

**Question:** Rate limit shape on `/auth/register`?

**Options presented:**
- IP-only (5/hr) — simplest
- IP + email dual-counter (mirrors forgot-password) (Recommended)
- Defer rate limit — rely on Turnstile alone

**User selection:** IP + email dual-counter.

**Note:** Defense in depth with Turnstile. Re-uses Phase 117 AUTH-13 convention from forgot-password.ts verbatim.

## Area 4 — PWA Error UX

**Question:** How should the PWA surface API errors on signup/login?

**Options presented:**
- Structured error code + map (Recommended)
- Raw API message verbatim
- Keep generic + add a 'help' link

**User selection:** Structured `{error, code}` + PWA error-code map.

**Note:** Operator explicitly wants the family-signup bug fixed (was the trigger for this whole phase). Structured codes give Sentry signal + friendly UX without coupling UI copy to backend strings.

## Wrap Decision

**Question:** Wrap and write CONTEXT.md, or dig into Sentry org structure + legal-page hosting?

**User selection:** Wrap. Sentry single-vs-split and legal-page approach left as planner discretion.

## Out-of-Scope Asks (Captured as Deferred)

- Secret-drift hardening rider (today's PostHog event was rotation #2 residual; SEED-017 sibling concern)
- CSP header tuning
- Per-user AI usage quota
- Brute-force protection on /auth/login
- GDPR/CCPA data-export + delete-account endpoint
- Sign-in-with-Google

All captured in CONTEXT.md § Deferred Ideas.

## Operator Wallclock Action

AUTH-126-07 (Anthropic monthly spend cap) is operator-only — not a code task. Will be tracked at `.planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md` and gate the ship of this phase.
