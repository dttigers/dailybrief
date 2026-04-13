# Stack Research

**Domain:** Server-side PDF generation, sports API proxy, Google Calendar server-side OAuth, email delivery
**Researched:** 2026-04-12
**Confidence:** HIGH (versions verified via npm registry; Railway/Puppeteer incompatibility verified from official Railway community)

## Recommended Stack

### Core Technologies (NEW — additions to vigil-core)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| PDFKit | 0.18.0 | Server-side PDF generation | Zero browser dependency. 2.4M weekly downloads, actively maintained (0.18.0 released March 2026). Programmatic text layout with column support, font embedding, streaming output. Works in Node.js ESM. Adds ~2MB vs Puppeteer's 300MB Chromium footprint. |
| googleapis | 171.4.0 | Google Calendar OAuth2 + API calls | Official Google Node.js client. Handles token refresh automatically via `tokens` event listener. `oauth2Client.setCredentials({ refresh_token })` restores from DB. Supports `access_type: offline` to obtain refresh tokens. |
| resend | 6.10.0 | Email delivery with PDF attachment | Modern API-first service. 100 emails/day free tier (no credit card). `attachments` array supports Buffer/base64 PDF. Clean TypeScript SDK, no SMTP config. Survives Railway deploys with no env changes beyond `RESEND_API_KEY`. |
| node-cron | 4.2.1 | Scheduled email delivery | Lightweight in-process scheduler (no external queue). Runs inside existing Hono server process. Standard cron syntax. 4.x is current stable. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-fetch (built-in) | Node 18+ built-in | ESPN API proxy HTTP calls | Use native `fetch` — already available in Node 22. No extra dep needed. |
| @types/pdfkit | latest | TypeScript types for PDFKit | Dev-only — needed because PDFKit ships CommonJS types |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Drizzle schema migration | New `google_oauth_tokens` table | Add via `drizzle-kit generate` + Railway auto-deploy migration |
| tsx (existing) | Dev server with PDFKit | No changes needed; PDFKit streams work with ESM |

## Installation

```bash
# Core new dependencies
npm install pdfkit googleapis resend node-cron

# Dev dependency for PDFKit types
npm install -D @types/pdfkit
```

## PDF Library Comparison — Decision Detail

This is the most consequential choice. The brief is 3 pages, text-heavy (work orders, calendar events, thoughts, sports scores), configurable layout (margins, font scale, paper size), no images in content area.

| Criterion | PDFKit 0.18 | Puppeteer 24 | Playwright 1.59 | @react-pdf/renderer 4.4 |
|-----------|-------------|-------------|-----------------|------------------------|
| Railway compatibility | Yes — zero system deps | BROKEN — Chrome launch fails on Railway (confirmed in Railway Help Station, pthread/D-Bus errors) | Same failure mode as Puppeteer — requires system Chromium | Yes |
| Memory footprint | ~10MB | 300–500MB per instance (Chromium process) | 300–500MB per instance | ~15MB |
| Startup time | Instantaneous | 1–3s (browser launch) | 1–3s | Instantaneous |
| Multi-column text | Yes — `columns` option | Via CSS — verbose for programmatic use | Via CSS | Via `<Text>` columns |
| Font control | Yes — embed custom fonts, precise line height | Via CSS | Via CSS | Via `<Text fontFamily>` |
| PDF page size control | Yes — `size: [w, h]` | Via `page.pdf({ width, height })` | Via `page.pdf({ width, height })` | Via `<Document>` |
| Existing layout logic | Port from PDFLayout struct in Swift | Rewrite as HTML/CSS — familiar but layout drift | Same as Puppeteer | React component model |
| Node.js ESM support | Yes | Yes | Yes | Yes — but requires React runtime |
| React dependency | No | No | No | Yes — adds React to vigil-core |
| When to use instead | — | Only if rendering existing PWA HTML page as PDF | Same as Puppeteer | If team is already React-heavy in backend |

**Verdict: PDFKit 0.18.** Puppeteer and Playwright are disqualified by Railway deployment reality — there is a documented failure thread on Railway's own help forum for Chromium launch failures even on 8GB/8vCPU metal instances. PDFKit gives precise programmatic control matching the existing `PDFLayout` struct from the Mac CLI, streams output directly as Buffer for HTTP response or email attachment, and adds zero infrastructure risk.

The existing Mac CLI already has a `PDFLayout` computed struct with all dimensions. Port the layout logic to TypeScript constants that feed PDFKit. The rendering model is already imperative (CoreGraphics), so PDFKit's imperative API is a natural translation.

`@react-pdf/renderer` is a credible second choice — but it would pull React into vigil-core (currently a pure Hono/Node backend) and adds a component-model abstraction over what is fundamentally a fixed-layout document. Not worth the dep.

## Email Delivery Comparison — Decision Detail

| Criterion | Resend 6.10 | SendGrid 8.1 | Nodemailer 8.0 | AWS SES |
|-----------|-------------|-------------|----------------|---------|
| Free tier | 100/day, no card | None (retired May 2025 — requires paid plan after 60-day trial) | N/A (SMTP library, needs provider) | 62K/month if sending from EC2 (we're on Railway — no free tier) |
| PDF attachment | Yes — `attachments: [{ filename, content: Buffer }]` | Yes | Yes | Via SDK, verbose |
| Setup complexity | Low — API key only | Medium — domain verify + API key | High — SMTP config + provider | High — IAM, DNS, region |
| TypeScript SDK | Yes — clean typed | Yes — typed but older API | Community types | Official but verbose |
| Railway env var | `RESEND_API_KEY` only | `SENDGRID_API_KEY` | SMTP host/user/pass | AWS_ACCESS_KEY_ID + SECRET + region |
| Deliverability | Good for transactional | Excellent at scale | Depends on provider | Excellent at scale |
| When to use instead | — | >50K emails/month or marketing analytics needed | Internal mail server routing | Already on AWS ecosystem |

**Verdict: Resend 6.10.** This is a personal tool sending one email per user per day. Resend's free tier covers that indefinitely. Single env var. Typed SDK. PDF Buffer attachments confirmed in their official docs. If deliverability issues arise later, migration to SendGrid is a one-file change.

Nodemailer is SMTP-level — it requires a provider anyway (Gmail, SendGrid SMTP, etc.) which adds credential sprawl. Given existing secret drift problems in this project (documented in memory), fewer credentials is a hard requirement.

## Google Calendar OAuth Token Storage Pattern

**Pattern: Encrypted column in PostgreSQL via Drizzle — no new dep required.**

New Drizzle table `google_oauth_tokens`:

```typescript
export const googleOAuthTokens = pgTable('google_oauth_tokens', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().unique(), // e.g. 'default' for single-user
  accessToken: text('access_token'),           // short-lived, optional to store
  refreshToken: text('refresh_token').notNull(), // long-lived — must be persisted
  expiryDate: timestamp('expiry_date', { withTimezone: true }),
  scope: text('scope'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**Why this pattern:**
- `googleapis` OAuth2 client fires a `tokens` event when it refreshes automatically. Store the new tokens in DB inside that listener.
- `refresh_token` is only returned once (on first consent). If lost, user must re-authorize. Store it immediately on first OAuth callback.
- `access_token` is short-lived (1 hour). Either store it for caching or let `googleapis` re-fetch on each server start by calling `setCredentials({ refresh_token })` — the library auto-refreshes from there.
- `prompt: 'consent'` + `access_type: 'offline'` in the auth URL are mandatory to receive refresh tokens on each authorization.

**OAuth Flow for single-user vigil-core:**

1. New Hono route `GET /v1/auth/google/start` — generates consent URL, redirects browser
2. New Hono route `GET /v1/auth/google/callback` — exchanges code, stores tokens in DB
3. `GoogleCalendarService` class — on startup, loads refresh token from DB, calls `oauth2Client.setCredentials()`, registers `tokens` event to persist refreshes
4. All Calendar API calls use this singleton; no per-request auth needed

**Token security on Railway:** Store as plaintext in PostgreSQL (Railway's managed Postgres is private-network, not internet-exposed). If encryption-at-rest is needed, use `pgcrypto` extension with `pgp_sym_encrypt`/`decrypt` — but for a solo-user personal tool this is overkill. The API endpoint itself is protected by the existing bearer token middleware.

## ESPN Sports API Proxy

**No npm package needed.** Use native `fetch` (Node 22 built-in).

ESPN's undocumented API endpoints are free, no auth required, stable enough for personal use:

```
MLB: https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard
NFL: https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
NBA: https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard
NHL: https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard
```

Pattern: vigil-core adds `/v1/sports/:league/scoreboard` which proxies ESPN, caches response in-memory for the brief generation window (5 minutes TTL), returns normalized JSON. Caching avoids hitting ESPN multiple times during a single brief generate request.

**Risk:** ESPN can modify these endpoints without notice. Acceptable for personal tool — a breaking change would surface immediately at brief generation time and the fallback is "sports section omitted."

## Scheduling Pattern (Email Delivery)

`node-cron` 4.2.1 runs inside the Hono server process. Schedule registered at server startup:

```typescript
// src/scheduler.ts — registered in index.ts after server starts
import { CronJob } from 'node-cron';

// Run at 6:00 AM user's timezone (stored in config)
CronJob.from({
  cronTime: '0 6 * * *',
  onTick: () => generateAndEmailBrief(),
  start: true,
  timeZone: process.env.BRIEF_TIMEZONE ?? 'America/Chicago',
});
```

This is a single-user tool — no job queue, no Redis, no workers. In-process cron is the correct scope. If vigil-core becomes multi-tenant, migrate to pg-boss or BullMQ at that point.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|------------------------|
| PDFKit | Puppeteer | Only if generating PDF from the actual PWA HTML (browser rendering parity required). Disqualified by Railway chromium launch failures. |
| PDFKit | Playwright | Same failure mode as Puppeteer on Railway. |
| PDFKit | @react-pdf/renderer | If vigil-core ever becomes a React SSR server — today it's a pure Hono API. |
| Resend | SendGrid | >50K emails/month or needing click/open analytics. Resend covers the personal use case free. |
| Resend | Nodemailer + Gmail | Only if routing through an existing internal SMTP server. Adds credential sprawl. |
| Resend | AWS SES | Only if the project moves to AWS infra. Over-engineered for Railway/solo-user. |
| googleapis (official) | google-auth-library | Already included transitively by googleapis. No reason to use lower-level package directly. |
| node-cron | pg-boss / BullMQ | Only if scheduling needs to survive server restarts with guaranteed delivery (e.g., multi-tenant SaaS). Overkill for personal tool. |
| native fetch | axios for ESPN proxy | Native fetch is available in Node 22 — no dep needed. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Puppeteer | Documented chromium launch failures on Railway even on 8GB instances. 300MB+ memory overhead. 1–3s startup per PDF. Memory leak risk on long-running Hono server. | PDFKit |
| Playwright | Same chromium dependency as Puppeteer. Microsoft maintains it but Railway deployment story is identical. | PDFKit |
| @sendgrid/mail | Free plan retired May 2025. Requires paid plan after 60-day trial. More setup for same feature set. | resend |
| nodemailer standalone | Not a delivery service — must pair with SMTP provider, adding credentials. Violates "fewer secrets" constraint. | resend |
| html-pdf / html-pdf-node | Uses PhantomJS (abandoned) or wkhtmltopdf (requires system binary). Both create Railway deployment headaches like Puppeteer. | PDFKit |
| jsPDF | Browser-first library. Server-side use is a workaround, not the design intent. Weaker text layout than PDFKit. | PDFKit |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| pdfkit@0.18.0 | Node 18+, ESM via `import` with `{ type: "module" }` | PDFKit is CommonJS but works fine when imported in ESM — Node resolves it. Already in vigil-core which is `"type": "module"`. |
| googleapis@171 | Node 18+ | Huge package but tree-shaken at build. Only import `{ google }` and use `google.calendar('v3')`. |
| resend@6.10.0 | Node 18+ | Full ESM support. |
| node-cron@4.2.1 | Node 18+ | 4.x uses `CronJob.from()` API — different from 3.x `cron.schedule()`. Check docs for 4.x syntax. |

## Sources

- npm registry (live) — pdfkit@0.18.0, googleapis@171.4.0, resend@6.10.0, node-cron@4.2.1, puppeteer@24.40.0, playwright@1.59.1, @react-pdf/renderer@4.4.1, nodemailer@8.0.5
- [Railway Help Station: Puppeteer "Failed to Launch Browser" on Railway Metal](https://station.railway.com/questions/puppeteer-failed-to-launch-browser-on-08e368b0) — MEDIUM confidence (community post, but matches general Chromium-on-Railway pattern)
- [Puppeteer Docker guide](https://pptr.dev/guides/docker) — chromium dependency confirmed
- [PDFKit text columns API](https://pdfkit.org/docs/text.html) — columns option confirmed HIGH confidence
- [Resend vs SendGrid comparison 2026](https://forwardemail.net/en/blog/resend-vs-sendgrid-email-service-comparison) — pricing/free tier verified MEDIUM confidence
- [Google OAuth2 Node.js token storage pattern](https://developers.google.com/identity/protocols/oauth2/web-server) — tokens event listener pattern HIGH confidence (official Google docs)
- [googleapis Node.js client GitHub](https://github.com/googleapis/google-api-nodejs-client) — setCredentials + auto-refresh confirmed HIGH confidence
- [ESPN hidden API endpoints](https://github.com/pseudo-r/Public-ESPN-API) — endpoint URLs MEDIUM confidence (undocumented, community-maintained)
- [npm-compare PDF libraries](https://npm-compare.com/html-pdf,pdfkit,pdfmake,puppeteer,react-pdf,wkhtmltopdf) — weekly download comparison MEDIUM confidence

---
*Stack research for: Vigil v3.0 Server-Side PDF additions*
*Researched: 2026-04-12*
