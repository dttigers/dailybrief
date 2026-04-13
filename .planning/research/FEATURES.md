# Feature Research

**Domain:** Server-side PDF brief generation (Node.js / Hono / Railway)
**Researched:** 2026-04-12
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features the system must have to feel complete. Missing these = the milestone fails its stated goal.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `/v1/brief/generate` returns PDF binary | Core promise of milestone — any client can request a brief | MEDIUM | Hono route, streams or returns `application/pdf` |
| Puppeteer/Playwright HTML→PDF rendering | The existing 3-page layout must be faithfully reproduced | MEDIUM | Puppeteer is the right default; needs `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage` on Railway. Community buildpack exists (`ryannono/Puppeteer-Railway-Buildpack`). |
| ESPN sports proxy route | Sports data was Mac-local; must move to server for brief to assemble server-side | LOW | Simple HTTP proxy; MLB/NFL/NBA/NHL. Already understood from v1.2 implementation. |
| Google Calendar OAuth token storage + refresh | Calendar events are core brief content; OAuth must live in vigil-core | HIGH | Store `access_token` + `refresh_token` + `expiry_date` encrypted in PostgreSQL. `googleapis` library handles auto-refresh when `expiry_date` is set. Refresh token only issued when `access_type=offline` was used in initial auth. The initial browser-based OAuth consent step still requires a redirect URL — plan for a one-time web flow in PWA. |
| Brief saved to server storage after generation | Brief history is already a shipped feature; server-generated briefs must continue saving | LOW | Already have `POST /v1/brief/history` pattern from v2.2. Save PDF binary as `bytea` in PostgreSQL or as a file reference. |
| PWA "Generate Brief" button | User needs a way to trigger generation from the browser | LOW | Calls `/v1/brief/generate`, shows loading state |
| PWA PDF download | Browser must be able to save the generated PDF | LOW | Blob URL + `<a download>` pattern. Works in all modern browsers and iOS Safari PWA context. |
| Mac CLI thin client | Auto-print at 6 AM must continue working | LOW | Replace CoreGraphics rendering with `fetch(/v1/brief/generate)` → pipe binary to `lpr`. The LaunchAgent + BriefScheduler stay as-is. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| PWA inline PDF preview (iframe / `<object>`) | User can see brief before printing or downloading — avoids blind download | LOW | Return blob URL from fetch, render in `<iframe src={blobUrl}>`. Works on desktop browsers; iOS Safari PWA shows PDF inline in WKWebView. No third-party viewer needed. |
| Configurable paper size honored server-side | Existing `PDFConfig` (letter/half-letter/A5/notebook/custom) must survive the move | MEDIUM | Pass `PDFConfig` as JSON body to `/v1/brief/generate`. Puppeteer `page.pdf({ format, width, height, margin })` maps directly from existing PDFLayout struct. |
| Section toggles honored server-side | User controls which sections appear — sports off if no team selected, etc. | LOW | Same `PDFConfig` body field; HTML template conditionally renders sections |
| Brief generation timestamp + metadata in history | History list shows when brief was generated and which config was used | LOW | Store `generated_at`, `paper_size`, and a JSON blob of the config alongside the PDF |
| Optional email delivery on schedule | User gets brief in inbox even without Mac running | MEDIUM | See dedicated section below. Differentiator because it removes the Mac dependency for the full morning workflow. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Streaming PDF generation (chunked transfer) | Appears faster to start download sooner | Puppeteer generates the whole PDF before returning; fake streaming is misleading. Railway has a 30s timeout already in place. | Show a loading spinner with estimated time (~3-5s); return complete PDF in one response. |
| Real-time PDF preview (live reload as you change settings) | Feels like a rich editing experience | Each render requires a full Puppeteer launch cycle (~2-3s). Continuous re-render on every setting change would hammer the server and feel broken. | "Preview" button that triggers a single render on demand. Settings are committed before generating. |
| Full headless-browser-based PDF editor | Users want to annotate or edit the PDF in-browser | Scope explosion. PSPDFKit and Nutrient exist for this; building it is a 6-month detour. | Provide download; editing happens in desktop PDF apps (Preview, Acrobat). |
| Apple Reminders as todo source | Was the pre-v3.0 implementation | Mac-only, requires local Apple frameworks, defeats platform independence. Already decided to drop in v3.0. | Vigil task thoughts are the todo source — already in the API. |
| Generating briefs on every device independently (decentralized) | Feels resilient | Each device would need its own Puppeteer install, OAuth tokens, ESPN calls. Defeats the whole purpose of moving to server-side. | Single vigil-core endpoint; all clients are thin. |
| Storing full PDF binaries in PostgreSQL long-term | Seems simple (no extra storage system) | PostgreSQL `bytea` columns work for short-term brief history but will bloat the DB if every daily brief is stored indefinitely. Railway's managed Postgres has storage quotas. | Store recent briefs (last 30 days) in DB; implement a retention/delete policy from day one. Don't add S3 now — solve the quota problem with retention first. |

## Feature Dependencies

```
[Google Calendar OAuth flow in PWA]
    └──requires──> [OAuth redirect endpoint in vigil-core]
                       └──requires──> [Token storage in PostgreSQL]
                                          └──enables──> [Calendar events in /v1/brief/generate]

[/v1/brief/generate endpoint]
    └──requires──> [Puppeteer installed + working on Railway]
    └──requires──> [ESPN proxy route]
    └──requires──> [Google Calendar token available OR calendar disabled in config]
    └──requires──> [Vigil task thoughts API] (already exists)
    └──requires──> [Work orders API] (already exists)
    └──produces──> [PDF binary]
                       └──enables──> [Brief history save]
                       └──enables──> [PWA preview + download]
                       └──enables──> [Mac CLI lpr print]
                       └──enables──> [Email delivery attachment]

[Email delivery]
    └──requires──> [/v1/brief/generate] (generates the PDF)
    └──requires──> [Scheduled trigger] (node-cron inside vigil-core OR Railway cron job)
    └──requires──> [SMTP config stored in vigil-core config] (nodemailer + SendGrid/SES)

[Mac CLI thin client]
    └──requires──> [/v1/brief/generate] (replaces local CoreGraphics)
    └──requires──> [Bearer token auth] (already exists)
    └──conflicts──> [Local CoreGraphics rendering] (remove the old code path after server confirmed working)
```

### Dependency Notes

- **Google Calendar OAuth requires a browser redirect flow:** The initial consent must happen in a browser (PWA). vigil-core needs a `/v1/calendar/auth` redirect endpoint and a `/v1/calendar/callback` handler. Subsequent token refreshes are automatic via the `googleapis` library — no user interaction after first consent.
- **Puppeteer must be working before any PDF features:** Everything downstream depends on it. Validate Railway deployment of Puppeteer in isolation first, before writing HTML templates.
- **Email delivery depends on `/v1/brief/generate`:** Do not build email before the core endpoint is proven. Email is an enhancement, not a foundation.
- **Mac CLI thin client conflicts with local rendering:** Keep both code paths during the transition phase. Remove local CoreGraphics only after server-side generation has been validated end-to-end in production.

## MVP Definition

### Launch With (v3.0 — this milestone)

- [ ] Puppeteer running on Railway — validated before anything else is built
- [ ] ESPN proxy route in vigil-core — MLB/NFL/NBA/NHL
- [ ] Google Calendar OAuth token storage + refresh in vigil-core
- [ ] `/v1/brief/generate` endpoint — orchestrates all data, returns PDF binary
- [ ] HTML+CSS brief template — replicates 3-page layout, honors PDFConfig (paper size, margins, sections)
- [ ] Brief saved to server after generation — history continuity
- [ ] PWA generate button + download — blob URL pattern, no third-party viewer needed
- [ ] PWA inline preview — iframe with blob URL
- [ ] Mac CLI thin client — fetch PDF from API, pipe to `lpr`

### Add After Validation (v3.x)

- [ ] Email delivery — add after core generation is proven stable in production. Trigger: user asks for it OR Mac is offline at 6 AM and brief is missed.
- [ ] Brief retention policy — add once storage growth is observable. Trigger: Railway Postgres approaching quota.

### Future Consideration (v4+)

- [ ] S3/object storage for PDF archive — only if retention policy proves insufficient or briefs need to be accessed from many regions
- [ ] Per-section regeneration — regenerate only the sports section if ESPN fails, without re-rendering everything
- [ ] PDF template theming — light/dark, font choices

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Puppeteer on Railway | HIGH (blocker for everything) | MEDIUM (known gotchas, buildpack exists) | P1 |
| ESPN proxy | HIGH (sports in every brief) | LOW | P1 |
| Google Calendar OAuth server-side | HIGH (calendar is core content) | HIGH (OAuth flow + token storage) | P1 |
| `/v1/brief/generate` endpoint | HIGH (the whole point) | MEDIUM | P1 |
| HTML+CSS brief template | HIGH (faithful layout reproduction) | MEDIUM (CSS paged media, @page rules) | P1 |
| Brief history save | MEDIUM (continuity with v2.2 feature) | LOW | P1 |
| PWA generate + download | HIGH (cross-platform access) | LOW | P1 |
| PWA inline preview | MEDIUM (nicer UX but download works fine) | LOW | P2 |
| Mac CLI thin client | HIGH (preserves auto-print workflow) | LOW | P1 |
| Email delivery | MEDIUM (removes Mac dependency entirely) | MEDIUM | P2 |
| Brief retention policy | LOW (maintenance concern) | LOW | P2 |

## Competitor Feature Analysis

This is a personal tool, not a SaaS product — there are no direct competitors. However, the following inform patterns:

| Feature | Notion AI Reports | Readwise Daily | Our Approach |
|---------|-------------------|----------------|--------------|
| PDF generation | Export to PDF (client-side) | Email digest only (HTML) | Server-side PDF, printer-grade physical output |
| Scheduling | Not applicable | Email at set time | LaunchAgent (Mac) + optional email; physical print is the primary artifact |
| Data sources | Notion DB only | Highlights from books/articles | Work orders + calendar + sports + captured thoughts — personal life OS |
| Preview | Notion UI | Email preview | Inline browser iframe before download |

## Implementation Notes for Roadmap

**Phase ordering rationale:**

1. **Puppeteer validation on Railway first** — all PDF features block on this. Don't write HTML templates until Puppeteer is confirmed working in production. Use a trivial `<h1>Hello</h1>` PDF to smoke-test the deployment.
2. **ESPN proxy before brief assembly** — simple, low-risk, unblocks data availability for the template.
3. **Google Calendar OAuth before brief assembly** — highest complexity, most likely to encounter edge cases (token expiry, consent screen, redirect URI registration). Isolate it.
4. **Brief assembly endpoint after all data sources are ready** — orchestration is straightforward once ESPN, Calendar, tasks, and work orders are available.
5. **HTML template in parallel with assembly endpoint** — can be developed against a static data fixture; merges with the real endpoint when both are ready.
6. **PWA UI after endpoint is working** — thin frontend work; takes a working API.
7. **Mac CLI thin client last** — preserves existing auto-print without blocking the new features from shipping.

**Email delivery (if included in this milestone):**

Use `nodemailer` with SendGrid transport. Read PDF binary from generation result, base64-encode, attach as `application/pdf`. Schedule with `node-cron` inside vigil-core (simpler than a Railway cron job — vigil-core is always-on). Store SMTP config (provider, user, password, recipient, send_time) in `config.json` or a `user_settings` table. Do NOT block the milestone on this — it is a P2 enhancement.

**CSS paged media for Puppeteer:**

Use `@page { size: [paper]; margin: [margin] }` in the HTML template. Use `break-before: page` (not the deprecated `page-break-before`) for page boundaries. Headers and footers must use Puppeteer's `headerTemplate`/`footerTemplate` options, not `position: fixed` (which only renders on page 1 in paged media). Use `page-break-inside: avoid` on work order rows and thought cards to prevent awkward splits.

## Sources

- [Best HTML to PDF libraries for Node.js — LogRocket](https://blog.logrocket.com/best-html-pdf-libraries-node-js/)
- [Top JavaScript PDF generator libraries for 2026 — Nutrient](https://www.nutrient.io/blog/top-js-pdf-libraries/)
- [Puppeteer deployment on Railway — railway.com](https://railway.com/deploy/puppeteer-js)
- [Puppeteer-Railway-Buildpack — ryannono/GitHub](https://github.com/ryannono/Puppeteer-Railway-Buildpack)
- [Puppeteer troubleshooting (official)](https://pptr.dev/troubleshooting)
- [Railway: Cron jobs, background workers, queues guide](https://docs.railway.com/guides/cron-workers-queues)
- [SendGrid Node.js attachments — Twilio](https://www.twilio.com/en-us/blog/sending-email-attachments-with-sendgrid)
- [Scheduled emails with Nodemailer + cron — DEV Community](https://dev.to/scofieldidehen/beginners-guide-on-sending-automated-emails-with-nodejs-nodemailer-and-cron-jobs-35pm)
- [Google OAuth2 for Web Server Applications — Google for Developers](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth2 best practices — Google for Developers](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Print CSS page breaks, headers, footers — DEV Community](https://dev.to/yoshyaes/the-developers-guide-to-pdf-page-breaks-headers-and-footers-3mme)
- [HTML-to-PDF common issues — customjs.space](https://www.customjs.space/blog/html-to-pdf-issues/)
- [PWA blob URL download pattern — Apple Developer Forums](https://developer.apple.com/forums/thread/95911)

---
*Feature research for: Server-side PDF brief generation (v3.0)*
*Researched: 2026-04-12*
