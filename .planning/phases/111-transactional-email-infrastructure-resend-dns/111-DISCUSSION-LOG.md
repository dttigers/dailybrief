# Phase 111: Transactional Email Infrastructure (Resend + DNS) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 111-transactional-email-infrastructure-resend-dns
**Areas discussed:** DNS + DMARC posture, email-service API shape, Template rendering strategy, Delivery failure handling

---

## Gray-Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| DNS + DMARC posture | Where vigilhub.io DNS is hosted + day-1 DMARC strictness | ✓ |
| email-service API shape | Generic vs typed wrappers; URL construction | ✓ |
| Template rendering strategy | Inline literals vs React Email vs MJML | ✓ |
| Delivery failure handling | What happens when Resend is down | ✓ |

**User's choice:** All four areas.

---

## DNS + DMARC posture

### Q1: Where is vigilhub.io DNS hosted?

| Option | Description | Selected |
|--------|-------------|----------|
| Cloudflare | Nameservers point to Cloudflare; records via Cloudflare dashboard | ✓ |
| Namecheap | Registered + DNS-managed at Namecheap | |
| Railway DNS | Railway manages DNS for the domain | |
| GoDaddy / other | Somewhere else | |

**User's choice:** Cloudflare.
**Notes:** Triggers Cloudflare-specific pitfall — orange-cloud proxy on CNAME records breaks DKIM. Planner must specify "DNS-only (gray cloud)" for the DKIM CNAME.

### Q2: Day-1 DMARC policy?

| Option | Description | Selected |
|--------|-------------|----------|
| p=none + rua reporting (Recommended) | Observe only; reports to jamesonmorrill1@gmail.com; no enforcement | ✓ |
| p=quarantine | Failing mail → spam | |
| p=reject | Failing mail → bounced | |

**User's choice:** p=none + rua reporting.
**Notes:** Safe default for fresh domain; tighten later once reports confirm DKIM+SPF pass consistently.

### Q3: SPF record scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Resend only (Recommended) | `v=spf1 include:_spf.resend.com -all` | ✓ |
| Resend + Gmail (softfail) | Also allow Gmail-based manual sends spoofing noreply@vigilhub.io | |
| You decide | Claude picks | |

**User's choice:** Resend only.
**Notes:** Matches current reality — Resend is the only sender. Extend later only if another transport is introduced.

---

## email-service API shape

### Q1: Module exports — generic or typed?

| Option | Description | Selected |
|--------|-------------|----------|
| Typed wrappers per email type (Recommended) | sendPasswordResetEmail, sendEmailVerificationEmail, etc.; hardcode subject + template + link-tracking=false | ✓ |
| Generic primitive only | Single sendEmail(to, subject, html, opts); caller responsibility | |
| Factory function (like calendar-service) | createEmailService(deps) returns methods | |

**User's choice:** Typed wrappers per email type.
**Notes:** Prevents call sites from forgetting link-tracking disable. Primitive `sendEmail` still exported as escape hatch.

### Q2: How is the link URL constructed?

| Option | Description | Selected |
|--------|-------------|----------|
| Caller passes full URL (Recommended) | Route handler builds ${APP_BASE_URL}/auth/reset?token=... and passes it | ✓ |
| Service builds from token + path | Service concatenates env + hardcoded path | |

**User's choice:** Caller passes full URL.
**Notes:** Keeps email-service stateless + testable. URL lives next to token generation.

### Q3: What APP_BASE_URL source?

| Option | Description | Selected |
|--------|-------------|----------|
| New env var VIGIL_APP_BASE_URL | Explicit prod/dev env; added to .env.example + Railway | ✓ |
| Reuse CORS_ORIGINS[0] | Implicit — reuses existing config | |
| You decide | Claude picks during research | |

**User's choice:** New env var VIGIL_APP_BASE_URL.
**Notes:** Prod = https://app.vigilhub.io; dev = http://localhost:5173.

---

## Template rendering strategy

### Q1: Where do HTML bodies live?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline template literals in service module (Recommended) | Tagged strings inside the wrapper functions; zero deps | ✓ |
| Separate .ts template files in services/email-templates/ | One file per email type | |
| React Email | JSX + preview tooling; adds build step + deps | |

**User's choice:** Inline template literals in service module.
**Notes:** Right weight for 2-3 email types with short bodies. Revisit if we grow past 5 types.

### Q2: HTML-only or multipart?

| Option | Description | Selected |
|--------|-------------|----------|
| Multipart HTML + text (Recommended) | Both html + text passed to Resend on every send | ✓ |
| HTML only | Simpler but slight deliverability hit | |

**User's choice:** Multipart HTML + text.
**Notes:** Accessibility + spam-score improvement; ~3 extra lines per template.

### Q3: Inline CSS styling level?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (Recommended) | System font + padded container + teal CTA button; no logo image | ✓ |
| Branded w/ logo | Vigil diamond-V logo, teal header — needs hosted image URL decision first | |
| Unstyled plain HTML | Black text, blue links, no padding | |

**User's choice:** Minimal.
**Notes:** Avoids a "where is the logo PNG served from" decision. Can upgrade styling later without touching call sites.

---

## Delivery failure handling

### Q1: API response when Resend 5xx / timeout?

| Option | Description | Selected |
|--------|-------------|----------|
| Swallow + return 200 (Recommended) | Log + captureException; same success response shape | ✓ |
| Return 503 | Tell caller to retry; breaks enumeration-safety for AUTH-10 | |
| Inline retry once, then swallow | Retry 1× with 2s backoff, then swallow | |

**User's choice:** Swallow + return 200.
**Notes:** Required by AUTH-10 enumeration-safety — response shape/timing must not differ between "email sent" and "email failed."

### Q2: Scope of failure policy?

| Option | Description | Selected |
|--------|-------------|----------|
| Same policy for all emails (Recommended) | One code path everywhere | ✓ |
| Differ by type | Swallow for enumeration-sensitive, 503 for others | |

**User's choice:** Same policy for all emails.
**Notes:** One behavior, one mental model, less to maintain.

### Q3: Observability when sends fail?

| Option | Description | Selected |
|--------|-------------|----------|
| PostHog captureException + console.error (Recommended) | Both channels; reuses analytics/posthog.ts | ✓ |
| PostHog only | No console.error — cleaner logs but harder to correlate with Railway log stream | |
| Also wire Resend webhooks (deferred) | Later phase — adds route + db table | |

**User's choice:** PostHog captureException + console.error.
**Notes:** Reuses existing Phase 103 observability pattern. Webhooks deferred to a later phase.

---

## Claude's Discretion

- Exact Cloudflare record-entry steps (planner will lay out after research).
- Plain-text body wording (planner drafts from the HTML).
- Inline CSS values beyond the teal CTA button (planner matches Vigil brand guide).
- Test approach (mock Resend SDK for unit; manual live send for prod verification).
- Whether to add a `resend-client.ts` wrapper or import Resend SDK directly in email-service.ts.

## Deferred Ideas

- Resend webhook ingestion (bounces/complaints/delivered) — future email-observability phase.
- AUTH-09 change-password confirmation email — ~5-line follow-up once this phase ships.
- Tighten DMARC to quarantine/reject — post-observation follow-up, single-commit change.
- Template upgrades (hosted logo, branded header, MJML) — revisit if template count grows.
- Per-user unsubscribe preferences — N/A for transactional email.
