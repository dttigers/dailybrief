# Phase 111: Transactional Email Infrastructure (Resend + DNS) - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the outbound email transport so Phase 112 (forgot-password) and Phase 113 (verify email) have a deliverable channel. Scope:

- **Ops:** DKIM + SPF + DMARC records on `vigilhub.io` via Cloudflare DNS; domain verified in Resend dashboard; `RESEND_API_KEY` set on Railway.
- **Code:** `vigil-core/src/services/email-service.ts` module exposing typed wrappers, lazy null-init (no startup crash if key missing), link tracking disabled per send, PostHog observability on failure.
- **Env:** `RESEND_API_KEY` + new `VIGIL_APP_BASE_URL` on Railway; both commented in `.env.example`.

**Not in scope** (deferred): outbound emails for any user flow (those are Phase 112 / 113 / 110-deferred AUTH-09 confirm email), Resend webhook ingestion, bounce/complaint handling tables, email templates beyond the two stubs needed to prove the transport works.

</domain>

<decisions>
## Implementation Decisions

### DNS + DMARC

- **D-01:** vigilhub.io DNS is hosted at **Cloudflare**. User has admin access to the Cloudflare dashboard. Records added via Cloudflare DNS tab; TXT records are not proxyable (N/A for orange/gray cloud toggle), CNAME for DKIM must be DNS-only (gray cloud) so Resend can verify the target.
- **D-02:** DMARC policy day 1 is `p=none` with aggregate reporting to `jamesonmorrill1@gmail.com`. Full value: `v=DMARC1; p=none; rua=mailto:jamesonmorrill1@gmail.com`. Observe-only for 1-2 weeks of real sends; tighten to `p=quarantine` later once DKIM+SPF auth is consistently passing in the rua reports. Not a day-1 lock-in to `p=reject` — that's a future hardening phase if ever.
- **D-03:** SPF record: `v=spf1 include:_spf.resend.com -all`. Hard-fail anything other than Resend. Matches current reality (Resend is the only outbound sender). Extend later only if another transport is introduced.

### email-service API shape

- **D-04:** Module exports **typed wrappers per email type**: `sendPasswordResetEmail(to, resetUrl)` and `sendEmailVerificationEmail(to, verifyUrl)` for the two flows this milestone needs. Each wrapper hardcodes subject line, template, and `click_tracking: false` / `link_tracking: false` so call sites cannot forget. Also export the internal `sendEmail({ to, subject, html, text })` primitive as an escape hatch for future one-offs (e.g., AUTH-09's deferred confirmation email).
- **D-05:** **Caller constructs the full URL**, service just embeds it. Route handler builds `${VIGIL_APP_BASE_URL}/auth/reset?token=...` (or `/auth/verify?token=...`) next to where the token is generated, then passes the complete string to the wrapper. Keeps email-service stateless and trivially unit-testable.
- **D-06:** New env var `VIGIL_APP_BASE_URL` is the source of truth for link origins.
  - Prod (Railway): `https://app.vigilhub.io`
  - Dev: `http://localhost:5173` (Vite default)
  - Must be added to `.env.example` (commented guidance) and Railway variables.
  - Do **not** reuse `CORS_ORIGINS[0]` — those are two different concerns (allowed fetch origins vs email link target) and coupling them breaks whenever a new CORS origin is added.

### Template rendering

- **D-07:** **Inline template literals** in the service module — no separate files, no JSX, no MJML. Two `export function` bodies hold roughly 20 lines of HTML each via tagged template strings. Revisit if we grow past 5 email types.
- **D-08:** **Multipart HTML + plain-text fallback** — every send passes both `html` and `text` to Resend. Plain-text is a minimal fallback (3-5 lines) for accessibility + spam-score boost. Shared pattern across all templates.
- **D-09:** **Minimal styling** — inline CSS only: system font stack, padded container, one prominent teal CTA button (Vigil brand `#1D9E75`), link as fallback, tiny footer. **No hosted logo image on day 1** (avoids a "where is the logo PNG served from" decision). Can upgrade styling later without touching call sites.

### Delivery failure handling

- **D-10:** Resend 5xx / timeout / network error: **swallow + return HTTP 200 from the route**. Log via structured `console.error` + PostHog `captureException`. Required by AUTH-10 enumeration-safety — response shape and timing must not differ between "email sent" and "email failed", otherwise attackers probe which addresses are registered.
- **D-11:** **Same failure policy for all email types** (current + future). One code path, one try/catch pattern around every `sendXEmail()` call. Documented once; route handlers stay terse.
- **D-12:** **Observability: PostHog `captureException` + `console.error` both fire on send failure.** Reuses existing `vigil-core/src/analytics/posthog.ts`. Context object in capture includes: email type (string enum), to-address hash (NOT raw address — PII), Resend response status + body if available, request id. Resend webhook ingestion (bounces / complaints / delivered events) is deferred to a later phase — not blocking for AUTH-10/11.

### Claude's Discretion

- Exact Cloudflare record steps — planner lays out the sequence once it researches current Resend DNS requirements.
- Plain-text body wording — planner drafts from the HTML.
- Inline CSS values beyond the teal CTA button — planner matches Vigil brand guide (see canonical refs).
- Test approach — mock the Resend SDK for unit tests; manual send to `jamesonmorrill1@gmail.com` as live verification (matches ROADMAP success criterion #1).
- Whether to add a tiny `resend-client.ts` wrapper module or import the Resend SDK directly inside `email-service.ts` — whichever gives cleaner test doubles.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` — Phase 111 Goal, Success Criteria 1-5, and the `Depends on: Phase 110` note.
- `.planning/REQUIREMENTS.md` — **EMAIL-01** acceptance criteria (the authoritative per-field requirement for this phase). Also lists alternatives explicitly rejected: Postmark 100/month free tier, AWS SES 4-env-var overhead, self-hosted SMTP deliverability burden.

### Existing code patterns to mirror
- `vigil-core/src/analytics/posthog.ts` — **The lazy null-init pattern** (criterion #4). `const apiKey = process.env["POSTHOG_API_KEY"]; export const posthog = apiKey ? new PostHog(...) : null;`. email-service.ts must do the equivalent with `RESEND_API_KEY`. Wrappers no-op (and log) when key is absent.
- `vigil-core/src/services/calendar-service.ts` — Service module conventions: JSDoc block at top, typed request/response unions (`ok | needs_reauth`), import from `../db/connection.js`. Use as stylistic reference.
- `vigil-core/src/services/brief-assembly-service.ts` — Graceful-degradation pattern when a downstream service returns a non-ok status. email-service should return a similar discriminated union (`{ status: "sent" } | { status: "skipped_no_key" } | { status: "failed", error }`) so route handlers can decide enumeration-safe responses.

### Project-level policy
- `.planning/PROJECT.md` §Current State — Railway is the single source of truth for prod secrets; `.env.example` is the template consumed by `scripts/dev-setup.sh` (Phase 107.1).
- `CLAUDE.md` (project root, if present) — follow project-wide coding conventions.

### External docs (planner should read via WebFetch / context7 during research)
- Resend Node.js SDK — current `send()` signature, `click_tracking` / `open_tracking` option names (these have changed across versions — don't trust memory).
- Resend domain verification flow — exact DNS records Resend emits for a new domain (DKIM CNAME format is `resend._domainkey.<domain>` → a Resend-hosted CNAME target).
- DMARC syntax reference — RFC 7489 for the `rua` tag behavior.

### Brand guide (for styling decisions)
- Vigil brand guidelines PDF — teal `#1D9E75`, Inter typeface (but email templates should fall back to system fonts since web fonts don't load in most email clients), voice/tone. Path: iCloud Drive per memory; ask user if template styling needs exact values.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vigil-core/src/analytics/posthog.ts` — `captureException` function already exists. email-service imports it directly: `import { captureException } from "../analytics/posthog.js"`. No new observability infrastructure needed.
- `vigil-core/src/analytics/posthog.ts` — **Lazy null-init pattern** (`const x = env ? new X() : null`) is the canonical template. Copy the shape.
- `.env.example` structure — Phase 107.1 established the commented-block-with-generate-hint convention (see `GOOGLE_OAUTH_STATE_SECRET` block). `RESEND_API_KEY` and `VIGIL_APP_BASE_URL` entries must follow that style.
- `vigil-core/src/services/` — Existing services (calendar, brief-assembly, pdf, sports, generate-scheduler, gmail-workorder) all use `.ts` with co-located `.test.ts`. email-service.ts + email-service.test.ts follow that layout.

### Established Patterns
- **No-startup-crash posture:** `src/index.ts` has a FATAL check for TRULY required env vars (JWT_SECRET, GOOGLE_OAUTH_STATE_SECRET, GOOGLE_TOKEN_ENCRYPTION_KEY). Optional providers (Anthropic, PostHog) use key-absence gates inside their modules and degrade gracefully. RESEND_API_KEY must follow the optional/degrading pattern — criterion #4.
- **Dep-injected service factories:** calendar-service and brief-assembly-service export factory functions that accept `deps: { db, fetchFn, ... }` so tests can swap them. email-service can expose a factory too (`createEmailService({ resendClient, captureExceptionFn })`) OR use the simpler singleton-with-key-gate pattern — both are precedented in the codebase; pick whichever gives the cleanest tests.
- **Discriminated union return types:** calendar-service returns `{ status: "ok" | "needs_reauth" | ...  }`. Services do not throw on expected failure modes — they return a status. email-service should follow this so enumeration-safe route handlers can check status without exception handling.
- **Structured logging:** project already uses `console.error` for Railway dashboard grep plus PostHog for aggregation. No custom logger.

### Integration Points
- **Route handlers** (Phase 112 / 113) import typed wrappers and call them. Example call site shape (for reference — not implementing the routes here):
  ```ts
  // Phase 112 forgot-password handler
  const resetUrl = `${process.env["VIGIL_APP_BASE_URL"]}/auth/reset?token=${rawToken}`;
  const result = await sendPasswordResetEmail(user.email, resetUrl);
  // result.status === "sent" | "skipped_no_key" | "failed" — all return 200 to caller per D-10
  return c.json({ ok: true });
  ```
- **Environment loading** happens via `--env-file=.env` in `npm run dev` and Railway's native env injection in prod. No new infrastructure needed — just add the two env entries.
- **Test invocation:** `tsx --test src/**/*.test.ts` (configured in `vigil-core/package.json`). email-service.test.ts must skip gracefully without `DATABASE_URL` (though this service doesn't touch DB, keep the pattern for consistency).

</code_context>

<specifics>
## Specific Ideas

- The **enumeration-safety constraint** is the most important driver of the failure-handling decision (D-10). Phase 112's AUTH-10 Success Criterion #1 explicitly says "returns the same 200 response body and approximate response time as a known email." email-service must never expose whether a send succeeded to the route handler's caller via status code or body.
- **Cloudflare gotcha:** DKIM records from Resend are CNAME records. Cloudflare defaults new CNAMEs to **proxied (orange cloud)**, which breaks DKIM verification because the proxied CNAME resolves to Cloudflare's edge IPs instead of Resend's DKIM key. Planner must include "set DKIM CNAME to DNS-only (gray cloud)" as an explicit DNS task step.
- **Apple Mail pre-fetch** is the reason `click_tracking: false` is a per-send default — Apple Mail (iOS 15.4+ / macOS 12.3+) pre-fetches every link in the background with full user-agent identity, which would burn through a single-use reset token before the user even clicks. Disabling per-send link rewriting is the only fix; the option must appear on every `resend.emails.send()` call.
- **Prod smoke test** (criterion #1): after DNS propagates and Railway picks up `RESEND_API_KEY`, a manual Node script (or an inline route hit from a dev machine) fires `sendPasswordResetEmail("jamesonmorrill1@gmail.com", "https://example.com/reset?token=testing")` once. Check Gmail inbox (not spam) for the email with the verbatim URL in the anchor href. That confirms the full transport end-to-end.

</specifics>

<deferred>
## Deferred Ideas

- **Resend webhooks for bounces/complaints/delivered** — Valuable signal for deliverability observability, but adds a public route + a `email_events` table + webhook signature verification. Out of scope for Phase 111. Note for a future "email observability" phase once we have real send volume.
- **AUTH-09 change-password confirmation email** — Originally part of AUTH-09 but deferred when Phase 110 shipped. Once email-service.ts exists, this becomes a ~5-line follow-up: add `sendPasswordChangedNoticeEmail(to)` wrapper + one-line call in `change-password.ts`. Do not do it in this phase — ship the transport first.
- **Tighten DMARC to `p=quarantine` or `p=reject`** — Planned follow-up after 1-2 weeks of `p=none` aggregate reports confirm 100% DKIM+SPF pass rate. Not a phase of its own; can be done as a single-commit change once the data is in.
- **Email template upgrades** (hosted logo image, branded header, responsive layout, MJML migration) — Revisit if we grow past 5 email types or user feedback says plain layout feels cheap. Inline template literals is fine for 2026-Q2.
- **Per-user unsubscribe preferences** — N/A for transactional email; only relevant if we add marketing email someday.

### Reviewed Todos (not folded)
None — no pending todos matched phase 111 scope.

</deferred>

---

*Phase: 111-transactional-email-infrastructure-resend-dns*
*Context gathered: 2026-04-24*
