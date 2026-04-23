# Stack Research

**Domain:** Multi-user auth flows + transactional email + cross-browser extension parity — Vigil v3.6
**Researched:** 2026-04-22
**Confidence:** HIGH (email provider, reset-token pattern, templating); MEDIUM (Safari extension parity specifics — confirmed working patterns from community + Apple forums)

---

## Existing Stack Baseline (Do NOT re-install)

Already installed and validated. Do not add again:

| Package | Location | Current Version | Relevant to v3.6 |
|---------|----------|-----------------|------------------|
| `@node-rs/argon2` | vigil-core | ^2.0.2 | AUTH-09/10/11 — password hashing, already in use |
| `jose` | vigil-core | ^6.2.2 | JWT signing, already in use |
| `hono` | vigil-core | ^4.7.0 | New auth routes follow existing pattern |
| `drizzle-orm` | vigil-core | ^0.45.2 | New columns on users table via migration |
| `react` | vigil-pwa | ^19.2.5 | Auth UI already wired |
| `react-hook-form` | vigil-pwa | ^7.72.1 | Form validation from v3.5 |
| `zod@3` | vigil-pwa | 3.x (pinned) | Schema validation from v3.5 |
| `posthog-node` | vigil-core | ^5.29.2 | Analytics from v3.5 |

---

## New Dependencies Required for v3.6

### vigil-core (Node.js/Hono API)

| Package | Version to Install | Purpose | Why |
|---------|-------------------|---------|-----|
| `resend` | `^6.12.2` | Transactional email sending | Official Node.js SDK for Resend; TypeScript-native; single env var `RESEND_API_KEY`; natively integrates with react-email via `react` param on `emails.send()` |
| `@react-email/components` | `^0.x` (current stable) | Pre-built email-safe HTML components | Html, Head, Body, Section, Text, Link, Button components that compile to inline-CSS email-compatible HTML |
| `@react-email/render` | `^2.0.4` | Server-side render React email templates → HTML string | Pure function `render(Component)` → string; called in Hono route, passes result to resend |
| `react` | `^18.x` | React runtime (peer dep for react-email) | react-email requires React runtime; vigil-core does not currently have React installed |
| `react-dom` | `^18.x` | React DOM (peer dep for react-email) | Required by @react-email/render internals |

**No new vigil-pwa dependencies for v3.6.** The PWA already has react-hook-form + zod from v3.5.

**No new Safari extension npm packages.** EXT-02 is a UI port, not a library addition.

---

## Installation

```bash
# In vigil-core/
npm install resend @react-email/components @react-email/render react@18 react-dom@18
```

Pin to React 18 (not 19) in vigil-core to avoid any peer dep mismatches with @react-email. vigil-pwa is a separate package with React 19 — no conflict.

---

## New Environment Variables

| Variable | Service | Value Shape | Purpose |
|----------|---------|-------------|---------|
| `RESEND_API_KEY` | Railway + vigil-core/.env | `re_xxxxxxxxx` | Resend API authentication |

One new variable total. The `from` address (`noreply@vigilhub.io`) is a code constant, not a runtime env var. No other email credentials needed.

---

## 1. Transactional Email Provider — Resend

### Decision: Resend

**Resend free tier (verified 2026-04-22):**
- 3,000 emails/month
- 100 emails/day
- 1 domain
- 30-day data retention
- Ticket support

This covers the v3.6 use case (password reset + email verify emails) indefinitely. At 10 emails/day max, monthly volume is ~300 emails — well inside the 3,000 free cap.

**SDK:** npm package `resend`, version `^6.12.2` (latest release 2026-04-20). Key format: `re_xxxxxxxxx`.

**Integration with Hono:**

```typescript
import { Resend } from "resend";
import { render } from "@react-email/render";
import { PasswordResetEmail } from "../email/PasswordResetEmail.js";

const resend = new Resend(process.env["RESEND_API_KEY"]);

// In a Hono route:
const html = await render(<PasswordResetEmail resetUrl={resetUrl} />);
const { data, error } = await resend.emails.send({
  from: "Vigil <noreply@vigilhub.io>",
  to: [user.email],
  subject: "Reset your Vigil password",
  html,
});
```

The SDK returns `{ data, error }` — never throws. Match the existing Hono pattern of checking `error` and returning early.

**Why not Postmark:**
- Free tier is 100 emails/month — a single week of testing active new users exhausts it
- Paid starts at $15/month for 10k emails; Vigil never needs 10k emails at this scale
- Postmark's deliverability advantage (fastest median inbox delivery, no marketing-mail co-mingling) is real but irrelevant for a personal tool sending to ~5 addresses

**Why not AWS SES:**
- Requires `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_REGION` + SES-specific IAM policy — four variables and an IAM setup for what Resend does in one variable
- Not Railway-native; free tier expires after 12 months unless traffic comes from EC2/Lambda
- No React Email native integration; no dashboard for deliverability monitoring
- Solo-founder ops overhead is the explicit constraint; SES fails it

### DNS Records for vigilhub.io

Add these four records in your DNS provider when setting up the Resend domain. Resend's dashboard generates the exact DKIM key value after domain registration — the shapes below are what you will configure.

| Type | Name | Value | Notes |
|------|------|-------|-------|
| TXT | `send.vigilhub.io` | `v=spf1 include:amazonses.com ~all` | SPF — Resend uses Amazon SES infrastructure under the hood |
| TXT | `resend._domainkey.vigilhub.io` | Dashboard-generated public key | DKIM — exact value shown in Resend dashboard after domain add |
| MX | `send.vigilhub.io` | Resend bounce host (dashboard) | Bounce processing — same subdomain as SPF |
| TXT | `_dmarc.vigilhub.io` | `v=DMARC1; p=reject; adkim=s; rua=mailto:jamesonmorrill1@gmail.com` | DMARC — `adkim=s` (strict) compensates for SPF subdomain misalignment |

**Key architectural point:** Resend sends from `send.vigilhub.io` as the envelope-from (Return-Path) domain, not `vigilhub.io`. The display `From:` can be `noreply@vigilhub.io`. SPF strict alignment (`aspf=s`) is not possible when the envelope subdomain differs from the header domain — this is Resend's standard architecture, not a bug. DKIM strict alignment (`adkim=s`) covers the gap because the DKIM `d=` tag matches `vigilhub.io` exactly.

**Time-to-first-send estimate:** < 20 minutes from Resend account creation to first email from your domain (DNS propagation is usually fast for new subdomains on Cloudflare/Railway DNS).

---

## 2. Email Templates — @react-email/components + @react-email/render

### Decision: react-email

**Why react-email over alternatives:**
- Same JSX/TypeScript component model as vigil-pwa — no syntax context switch
- `@react-email/render` runs server-side in the Hono process; no separate rendering service
- Template variables (reset URL, user email) are typed props — compiler catches missing data at build time
- Resend's Hono integration guide uses react-email as the documented path
- 2 emails needed (password-reset, email-verify) — enough to justify components, not enough to warrant a custom template engine

**Why not MJML:** XML syntax with no TypeScript type safety on template variables. react-email is the standard Resend pairing.

**Why not plain HTML strings:** HTML email requires inline CSS and table-based layout to render in Gmail, Outlook, and Apple Mail. Hand-writing this for even 2 emails creates unmaintainable markup. react-email auto-handles this.

### JSX Conflict with Hono — Resolution

vigil-core's `tsconfig.json` uses `"jsxImportSource": "hono/jsx"` for Hono's JSX rendering. react-email templates need `"jsxImportSource": "react"`. These conflict at the tsconfig level.

**Resolution: per-directory tsconfig override.**

Create `vigil-core/src/email/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "include": ["./**/*.tsx"]
}
```

Email template files (`PasswordResetEmail.tsx`, `EmailVerifyEmail.tsx`) live in `vigil-core/src/email/` and are compiled with this override. Route files that call `render()` import the result as a string — no JSX in route files, so no conflict at the callsite. This requires no monorepo setup.

---

## 3. Password Reset Token — Node.js `node:crypto` (no new package)

### Decision: Built-in `node:crypto` — zero new dependencies

**Why no npm package is needed:**

`crypto.randomBytes(32)` is a CSPRNG producing 256 bits of entropy. Reset tokens are single-use, short-lived credentials with a 2^256 search space — SHA-256 hashing at rest is sufficient. There is no benefit to argon2id key-stretching on reset tokens (argon2id protects passwords because humans choose low-entropy strings; a CSPRNG token already has maximum entropy).

**Standard pattern (AUTH-10 / AUTH-11):**

```typescript
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

// On forgot-password request
const rawToken = randomBytes(32).toString("hex");        // send this in the email URL
const tokenHash = createHash("sha256").update(rawToken).digest("hex");  // store this in DB

// On reset-link click
function verifyToken(incoming: string, stored: string): boolean {
  const incomingHash = createHash("sha256").update(incoming).digest("hex");
  const a = Buffer.from(incomingHash, "utf8");
  const b = Buffer.from(stored, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

**DB schema additions (users table):**

```typescript
// Add to users table in schema.ts
resetTokenHash:              text("reset_token_hash"),
resetTokenExpiresAt:         timestamp("reset_token_expires_at", { withTimezone: true }),
emailVerifiedAt:             timestamp("email_verified_at", { withTimezone: true }),
emailVerifyTokenHash:        text("email_verify_token_hash"),
emailVerifyTokenExpiresAt:   timestamp("email_verify_token_expires_at", { withTimezone: true }),
```

All five columns are nullable — no existing rows break. One Drizzle migration adds them all; the programmatic `migrate()` on Railway deploy picks it up automatically.

**Token TTLs:**
- Password reset: 15 minutes (short window; resets are intentional, user-initiated)
- Email verification: 24 hours (user may not check email immediately after signup)

**Single-use enforcement:** NULL out `resetTokenHash` and `resetTokenExpiresAt` on successful use. Re-requesting a reset token overwrites the previous one.

**Constant-time comparison:** Use `timingSafeEqual` on the hash bytes (not the raw token) to prevent timing side-channels.

### Why NOT to migrate to Lucia / Auth.js / better-auth

Do not replace the existing auth stack for v3.6. Cost is not justified:

| Framework | Migration cost | Why not |
|-----------|---------------|---------|
| Lucia | DB-backed sessions replace stateless JWTs; new session middleware; retire three-path bearerAuth dispatcher | Requires schema changes across 11 tables with userId FKs plus new middleware layer |
| Auth.js (NextAuth) | React/Next-centric; Hono adapter is community-maintained, not official | Adapter quality risk; designed around Next.js request lifecycle |
| better-auth | Has a Hono adapter; still requires replacing token/session model and DB schema | Full session model replacement; no net gain over current HS256 JWT approach |

The existing auth foundation (argon2id + HS256 JWT + three-path bearerAuth dispatcher) ships in production today. AUTH-09/10/11 add 3 new endpoints and 5 new columns to an existing table. Rolling the reset-token pattern with `node:crypto` is ~50 lines and zero new dependencies.

---

## 4. Safari Extension — Quick-Capture Parity (EXT-02)

### Decision: Direct `chrome.*` calls — no polyfill, no new packages

**Safari WebExtension API compatibility (macOS, Manifest V3):**

Safari exposes both `browser.*` (W3C Promise-based) and `chrome.*` (Chrome-compatible) namespaces. The Chrome quick-capture extension uses `chrome.runtime.sendMessage`, `chrome.storage.local`, and `chrome.action` — all work in Safari under the `chrome.*` namespace without modification.

**Confirmed compatible APIs for the quick-capture feature set:**

| API Used in Chrome Extension | Safari Behavior | Impact |
|------------------------------|-----------------|--------|
| `chrome.runtime.sendMessage` | Works — popup → service worker messaging | No change needed |
| `chrome.storage.local.get/set` | Works — quirks (storage.onChanged not firing, empty-key edge) do not affect quick-capture use case | No change needed |
| `chrome.action.openPopup` | Works in Safari MV3 | No change needed |
| `manifest.json` `"action"` key | Supported since Safari 15.4 | No change needed |
| Background service worker | Service worker only in Safari MV3 (no persistent background pages) | Current extension has no background script; no change |

**What IS different between Chrome and Safari that affects EXT-02:**

| Area | Chrome | Safari | Impact |
|------|--------|--------|--------|
| CSP in popup HTML | Permissive — inline scripts allowed | Strict — no inline `<script>` or `eval` in popup.html | Must ensure popup.js is an external file (already true for Chrome extension) |
| Background service worker debugging | Full DevTools inspector | No debugging window available in Safari | Developer inconvenience only; does not block shipping |
| Xcode wrapper | Not required | Required — Safari extensions ship inside a macOS `.app` bundle | Already handled in EXT-01; Xcode project exists |

**Why NOT webextension-polyfill (`webextension-polyfill` npm package):**
- The polyfill wraps `chrome.*` callbacks into `browser.*` promises. In Safari MV3, `chrome.*` already returns Promises — the polyfill adds an indirection layer for zero benefit.
- The polyfill's Manifest V3 support is officially documented as incomplete (open issue #329 on mozilla/webextension-polyfill as of 2025).
- Direct `chrome.*` calls are the working pattern for Safari MV3 extensions in 2025.

**EXT-02 is a UI-only port:**

The Chrome Phase 94 quick-capture popup (freeform textarea + URL checkbox + triage feedback + Cmd+Enter) is a self-contained `popup.html` + `popup.js` + `popup.css`. To bring this to Safari:

1. Copy the updated popup files to the Safari extension's `Resources/` directory (replacing the Phase 84 popup)
2. Confirm `popup.js` uses no inline scripts in HTML (CSP compliance)
3. `manifest.json` `"action.default_popup"` already points to `popup.html` — no change
4. The background service worker message handler (if any) that calls the Vigil API is identical

No new npm packages. No polyfill. No manifest changes.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Resend | Postmark | When deliverability SLA and inbox speed are critical (high-stakes transactional > 10k/month and paying users); Postmark's segregated infrastructure delivers median < 10 seconds |
| Resend | AWS SES | When already on AWS with IAM infrastructure and sending > 100k emails/month at $0.10/1000 |
| `node:crypto` reset tokens | Lucia auth library | Only if starting a new project from scratch with no existing auth stack |
| `@react-email/render` | Plain HTML strings | Only for a single email with no brand styling where maintenance time is not a concern |
| `@react-email/render` | MJML | If not using React anywhere in the stack and needing maximum Outlook compatibility on complex layouts |
| Direct `chrome.*` namespace | webextension-polyfill | Only if adding Firefox as a third browser target — polyfill smooths Firefox callback-vs-promise divergences that Safari does not have |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Nodemailer | Requires SMTP server credentials (host, port, user, pass — 4+ env vars); no built-in deliverability monitoring; more config for less reliability on Railway | `resend` SDK |
| SendGrid | Free tier eliminated in 2024; pricing increased significantly; DX is mediocre vs Resend | Resend |
| `bcrypt` on reset tokens | Wasted key-stretching — argon2id/bcrypt benefit is for low-entropy human passwords; CSPRNG tokens have 2^256 entropy and don't need stretching | `crypto.createHash("sha256")` |
| Lucia / Auth.js / better-auth | Migration from shipped argon2id + HS256 JWT + three-path bearerAuth across 11-table schema is costly; no net benefit for adding 2 auth flow endpoints | Extend existing auth routes with `node:crypto` |
| `webextension-polyfill` | MV3 support incomplete; Safari already returns Promises from `chrome.*`; polyfill adds indirection for zero gain | Direct `chrome.*` calls |
| `mjml-react` | Abandoned — last release 2021 | `@react-email/components` |
| `react@19` in vigil-core | Introduces peer dep complexity with react-email; vigil-pwa (React 19) is a separate package | `react@18` as peer dep in vigil-core |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `resend@^6.12.2` | Node.js 18+, TypeScript 4.5+ | Railway runs Node 22 LTS; fully compatible |
| `@react-email/render@^2.0.4` | React 18, React 19 | Install React 18 in vigil-core; no conflict with vigil-pwa React 19 (separate package.json) |
| `react@18.x` in vigil-core | `@react-email/components` latest | Peer dep requirement; render() is pure; no browser APIs used |
| `resend@^6.x` + `@react-email/render` | Used together | Pass `html` string from `render()` to `resend.emails.send({ html })`; Resend also accepts `react` param directly if tsconfig conflict is resolved |

---

## Sources

- Resend pricing (resend.com/pricing, 2026-04-22) — free tier verified: 3,000/month, 100/day, 1 domain; HIGH confidence
- Resend Node.js docs (resend.com/docs/send-with-nodejs) — SDK `resend`, key format `re_*`, env var `RESEND_API_KEY`; HIGH confidence (official docs)
- Resend Hono integration docs (resend.com/docs/send-with-hono) — TSX integration pattern; HIGH confidence (official docs)
- Resend GitHub releases (github.com/resend/resend-node/releases) — latest v6.12.2 released 2026-04-20; HIGH confidence
- dmarc.wiki/resend — SPF `v=spf1 include:amazonses.com ~all`; DKIM `resend._domainkey` TXT; MX bounce subdomain; DMARC `adkim=s` note; HIGH confidence (technical reference)
- Postmark pricing (postmarkapp.com/pricing, 2026-04-22) — free tier 100/month; paid from $15/month (10k emails); HIGH confidence (official pricing page)
- npm registry: `postmark@4.0.7` — Axios 1.13.5 dep; Node 14+ minimum; MEDIUM confidence
- react-email GitHub (github.com/resend/react-email) — react-email 6.0.0, @react-email/render 2.0.4; npm weekly downloads 920k+; HIGH confidence (official repo)
- Hono GitHub issue #3197 (github.com/honojs/hono/issues/3197) — JSX conflict root cause: `jsxImportSource` mismatch; per-directory tsconfig override as resolution; MEDIUM confidence (community-verified pattern)
- DEV article: Resend + react-email + Hono (dev.to/reubenwedson, 2025) — monorepo tsconfig override pattern; MEDIUM confidence (community, corroborated by official Hono docs)
- thelinuxcode.com + logrocket.com (2025) — `crypto.randomBytes(32)` + SHA-256 + `timingSafeEqual` pattern for reset tokens; MEDIUM confidence (multiple sources agree)
- MDN WebExtensions: Chrome incompatibilities — `browser.*` vs `chrome.*` namespace; Promise support in Safari MV3; HIGH confidence (official MDN)
- webextension-polyfill GitHub issue #329 — MV3 support documented as incomplete as of 2025; MEDIUM confidence
- Apple Developer Forums + lapcatsoftware.com (2025) — `storage.local.onChanged` Safari quirks; storage.local async behavior differences; MEDIUM confidence (community + Apple forum responses)
- buildmvpfast.com email API cost comparison (April 2026) — Resend vs Postmark vs SES pricing cross-check; MEDIUM confidence (third-party, matches official pricing)

---

*Stack research for: Vigil v3.6 — Multi-User Completion, Auth UX & Safari Parity*
*Researched: 2026-04-22*
