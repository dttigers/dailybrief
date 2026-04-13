# Pitfalls Research

**Domain:** Server-side PDF generation, third-party API proxying, OAuth token management, email delivery — Node.js/Hono on Railway
**Researched:** 2026-04-12
**Confidence:** HIGH (Puppeteer/Railway specifics), MEDIUM (ESPN API), HIGH (Google OAuth), HIGH (email deliverability)

---

## Critical Pitfalls

### Pitfall 1: Chromium Bloating the Docker Image Beyond Railway's Build Limit

**What goes wrong:**
`npm install puppeteer` downloads a full Chromium binary (~170MB). Combined with Node.js and app dependencies, the Docker image hits ~950MB. Railway builds can time out or the deploy layer cache is constantly busted when Chromium is bundled inside app dependencies rather than the base image.

**Why it happens:**
Puppeteer's default install behavior bundles its own Chromium. Most tutorials show this path because it "just works" locally. Nobody warns that this makes the image enormous and the `node_modules` directory non-cacheable at the right layer.

**How to avoid:**
Use `puppeteer-core` (not `puppeteer`) and install Chromium via Nix packages in `railway.toml`, OR use a pre-built Docker base image that already has Chromium (`ghcr.io/puppeteer/puppeteer:latest`). Set `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` in Railway environment variables so npm install does not re-download it. Layer the Dockerfile so Chromium installation comes before `COPY package.json` so it is cached independently of app code changes.

**Warning signs:**
- Docker build takes > 5 minutes per deploy
- Railway log shows chromium download during `npm install`
- Image size reported in Railway deploy logs > 800MB

**Phase to address:**
Phase that introduces Puppeteer (PDF rendering phase). Must be done from day one of that phase — retrofitting layer order is painful.

---

### Pitfall 2: Puppeteer OOM-Killing the Railway Service

**What goes wrong:**
Chromium base memory consumption is 200–300MB before any page is loaded. A moderately complex HTML brief page pushes it to 400–600MB. Railway's minimum configurable memory limit is 1GB per service. If vigil-core is currently running on a small plan and Puppeteer PDF generation coincides with another request spike (e.g., Claude API call for affirmation), the service gets OOM-killed mid-request, returning a 502 to the client with no useful log.

**Why it happens:**
Developers test locally on a MacBook with 16–32GB RAM where OOM is invisible. Railway enforces container cgroup memory limits. When the limit is breached, the Linux OOM killer terminates the process with no graceful shutdown — no error is thrown in Node.js, the process just dies.

**How to avoid:**
- Always pass `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-accelerated-2d-canvas`, `--no-first-run`, `--no-zygote`, `--disable-gpu` to Puppeteer launch args in the Railway context (these are required for Docker, not optional).
- Do NOT use `--single-process` — it causes Chrome to crash on complex pages.
- Launch one browser instance at startup and reuse it for all PDF requests (do not `browser.launch()` per request).
- Use incognito contexts (`browser.createIncognitoBrowserContext()`) per PDF job for isolation without per-job browser spawning.
- Recycle the browser every N requests (e.g., 50) to prevent RSS memory fragmentation from accumulating.
- Set Railway service memory to at least 1.5GB if PDF generation is on the same service as vigil-core; 2GB preferred.
- Add a `page.close()` in a `finally` block — a hanging page that is never closed will keep its memory allocated until OOM.

**Warning signs:**
- Railway logs show sudden process exit with no Node.js error stack
- PDF requests succeed locally but return 502 on Railway
- Memory graph in Railway metrics climbs monotonically over hours

**Phase to address:**
PDF rendering phase. Memory management is not something to "add later" — OOM kills will appear in the first real test on Railway.

---

### Pitfall 3: Railway Serverless Sleep Killing the First Brief Request of the Day

**What goes wrong:**
Railway's serverless mode sleeps a service after 10 minutes of no outbound traffic. The daily brief is generated once per day in the morning. If the LaunchAgent or PWA "Generate Brief" button triggers at 7:00 AM and the service has been asleep since 9:00 PM, the `/v1/brief/generate` request arrives to a cold service. The cold start plus Chromium initialization (Chromium takes 2–5 seconds to launch) plus multi-source data assembly can exceed the 30-second timeout already configured in vigil-core, resulting in a timeout error for a user who is waiting for their morning brief.

**Why it happens:**
Serverless sleep is enabled by default on Railway for cost savings. The cold start problem is invisible during development (service is always warm). Brief generation is inherently high-latency (ESPN fetch + Google Calendar fetch + Claude affirmation generation + PDF render = 8–20 seconds on a warm service, 15–35 seconds cold).

**How to avoid:**
- Disable Railway's serverless sleep mode for vigil-core (set "Always On" / disable app sleeping in Railway service settings). The cost difference is minimal given this is a personal single-user server.
- Increase the request timeout for `/v1/brief/generate` specifically to 60 seconds (Hono supports per-route timeout middleware).
- Implement async brief generation: the endpoint enqueues the job and returns a `202 Accepted` with a job ID immediately; the client polls `/v1/brief/status/:jobId` until complete.
- Pre-warm: if keeping serverless mode, add a `/health` ping from the Mac LaunchAgent 30 seconds before scheduled brief generation time.

**Warning signs:**
- Brief generation works fine during development hours but fails at 7 AM
- Railway metrics show service waking up at brief generation time
- Client receives timeout errors on first daily request only

**Phase to address:**
Brief assembly endpoint phase. The async job pattern decision should be made before the endpoint is designed — retrofitting sync to async is a full API contract change.

---

### Pitfall 4: Google OAuth Refresh Token Silently Expiring or Being Revoked

**What goes wrong:**
The Google Calendar OAuth refresh token stored in PostgreSQL becomes invalid. This happens silently — the Google API returns a 401, but if the refresh flow isn't correctly handled, the calendar data is simply omitted from the brief with no user-facing error. The user's morning brief quietly loses calendar events with no indication of why.

**Why it happens (multiple causes):**
- The refresh token is only issued once (first authorization). If the original token is lost and the user re-authorizes, the new token only works if `access_type=offline` AND `prompt=consent` are both set. Without `prompt=consent`, Google may return no refresh token if one was already issued previously.
- If the OAuth consent screen is in "Testing" mode in Google Cloud Console, refresh tokens expire after 7 days regardless.
- A Google Account has a limit of 50 refresh tokens per OAuth client. Exceeding this silently invalidates the oldest token.
- Token revocation occurs if the user changes their Google password (for Gmail-scoped tokens) or revokes app access in Google account settings.
- Tokens not used for 6 months are expired by Google.

**How to avoid:**
- Always use `access_type: 'offline'` and `prompt: 'consent'` on the initial OAuth authorization URL. Verify both are set before implementation is considered done.
- Publish the OAuth app to "Production" in Google Cloud Console (not "Testing") before treating the token as long-lived.
- Store the refresh token encrypted at rest in PostgreSQL (AES-256 or use a column-level encryption approach — at minimum do not store plaintext in a column named `refresh_token` visible in psql output).
- Implement a token refresh health check endpoint that validates the stored token is still functional — surface this in the PWA settings panel.
- On any Google API 401, trigger a re-auth flow and alert the user rather than silently omitting calendar data.
- Log token refresh success/failure to a `oauth_events` table for auditability.

**Warning signs:**
- Calendar section absent from brief with no error logged
- Google API returning 401 or `invalid_grant` error
- Refresh token was issued more than 6 months ago with no use

**Phase to address:**
Google Calendar server-side phase. The re-auth UI flow and token health check must be in scope for that phase, not deferred.

---

### Pitfall 5: ESPN Unofficial API Breaking Silently Between Seasons

**What goes wrong:**
ESPN's unofficial API (`site.api.espn.com/apis/site/v2/sports/...`) returns 404 or an empty `events` array when the sport is out of season or when ESPN changes an endpoint's URL or response schema. The brief's sports section renders blank or with stale data from a cache. Because the ESPN API is undocumented and has no change log, breakage is discovered when the user notices their brief has no sports data.

**Why it happens:**
ESPN has changed their base URLs and endpoint paths before (a major URL migration occurred in early 2024). There is no versioning guarantee, no webhook for deprecation, and no official support channel. Sports APIs also naturally return empty results during off-season, which looks identical to an error from the client's perspective.

**How to avoid:**
- Treat every ESPN API call as "might fail at any time." Wrap in try/catch with explicit fallback: sports section renders "sports data unavailable" rather than crashing brief generation.
- Cache the last successful ESPN response per sport in PostgreSQL with a TTL (e.g., 4 hours for scores, 24 hours for standings). If the live fetch fails, serve cached data with a "as of [timestamp]" label.
- Validate response shape on the server — check that `scoreboard.events` exists and is an array before treating the response as valid. Schema drift (ESPN adding/removing fields) is common and should not crash the route.
- Monitor: log ESPN fetch failures to a dedicated `api_errors` table. This makes it easy to detect when ESPN has changed something.
- Do not make the brief fail entirely if ESPN is down. Sports data is supplementary.

**Warning signs:**
- Brief sports section empty without a corresponding error in logs
- ESPN endpoint returning 200 with an empty events array unexpectedly
- Brief failing to generate during off-season periods

**Phase to address:**
ESPN proxy phase. Caching and error isolation must be part of the initial implementation, not added after the first production outage.

---

### Pitfall 6: Storing PDFs in PostgreSQL Rows (Binary Bloat)

**What goes wrong:**
Generated PDF binaries (typically 200–600KB per brief) are stored as `bytea` in PostgreSQL. After 90 days of daily generation, that is 18–54MB of binary in the database. PostgreSQL is 5–20x more expensive for binary storage than object storage. More critically, `SELECT * FROM briefs` queries that accidentally include the binary column will cause enormous result sets that slow down every ORM query that touches the briefs table.

**Why it happens:**
It is the path of least resistance — Drizzle ORM is already connected, there is a `briefs` table in the schema already (from v2.2 brief history), and adding a `bytea` column is one line. The cost and query performance impact are not visible until months of data accumulate.

**How to avoid:**
- Store PDF binaries in Railway Storage Buckets (S3-compatible, $0.015/GB-month, free egress). Store only the bucket object key in the `briefs` PostgreSQL row.
- Never include the binary column in default SELECT queries — use explicit column selection in Drizzle.
- If Railway Buckets are not yet available/configured, store PDFs on the filesystem with a volume mount as a temporary measure, but design the schema to hold a `storage_url` or `storage_key` string from day one so the storage backend can be swapped without a schema migration.
- Set a retention policy: delete PDFs older than 90 days from object storage automatically (Railway Buckets support lifecycle policies via S3 API).

**Warning signs:**
- Railway PostgreSQL storage usage growing faster than expected
- Brief list queries taking > 500ms
- ORM accidentally loading full PDF binary into memory on every brief index request

**Phase to address:**
Brief storage phase. The storage schema design decision is irreversible without a migration — get it right before any PDFs are stored in production.

---

### Pitfall 7: Email Deliverability Failing for vigilhub.io Domain

**What goes wrong:**
Emails sent from `no-reply@vigilhub.io` land in spam or are rejected outright by Gmail/Outlook. The user either never receives the morning brief email or finds it days later in spam. Gmail's 2024 requirements (and Microsoft's 2025 enforcement) make SPF, DKIM, and DMARC mandatory for any domain sending email.

**Why it happens:**
Self-sending transactional email from a custom domain without configuring DNS authentication records is a common first-timer mistake. Railway provides no built-in email sending, so developers reach for Nodemailer with SMTP credentials, forgetting that the sending infrastructure reputation and DNS authentication are what determine deliverability — not the code.

**How to avoid:**
- Use a managed transactional email provider: Resend (best developer experience for 2026, TypeScript SDK, free tier 3000 emails/month) or Postmark (best inbox placement, message streams). Do not configure SMTP directly from vigil-core.
- Configure SPF DNS record for vigilhub.io to authorize the chosen provider's mail servers.
- Enable DKIM via the provider's DNS setup wizard (adds a TXT record to vigilhub.io DNS).
- Set a DMARC policy (`p=quarantine` to start, `p=reject` once confirmed working).
- Test with mail-tester.com before shipping — a score of 9/10 or higher is the target.
- PDF attachment: keep the brief PDF under 10MB (it will be ~200–600KB, so this is not a concern, but validate it) and use `application/pdf` MIME type with the correct filename.

**Warning signs:**
- Test emails land in spam during development
- mail-tester.com score below 7
- Provider dashboard shows bounces or spam complaints

**Phase to address:**
Email delivery phase (last feature in the milestone). DNS records must be configured in Cloudflare/wherever vigilhub.io DNS is managed before the first production email is sent.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `puppeteer` (full) instead of `puppeteer-core` | No Chromium path configuration needed | 170MB added to every deploy layer; busts Docker cache on every npm install | Never — use `puppeteer-core` from the start |
| `browser.launch()` per PDF request | Simple code, no lifecycle management | 200–300MB RAM spike per request; OOM under any concurrent load | Never in production |
| Storing PDFs as `bytea` in PostgreSQL | No additional service needed | DB bloat, slow queries, expensive storage at scale | Only as a 1-week temporary measure with a migration plan |
| Skipping async brief generation (sync HTTP) | Simpler API contract | Timeout failures on cold starts; no progress feedback for user | Only acceptable if brief generation is proven < 10s on warm service |
| Raw SMTP via Nodemailer without provider | No third-party dependency | Deliverability failures, no bounce tracking, IP reputation management burden | Never for a custom domain |
| Storing Google refresh token plaintext | No encryption code to write | Token exposure in DB dumps, logs, or psql output | Never |
| Single `Promise.all` for all brief data sources | Concise code | One slow/failing source (ESPN) blocks the entire brief | Never — use `Promise.allSettled` with per-source error isolation |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ESPN API | Treating a 200 response as valid data | Validate `response.data.scoreboard.events` exists and has items; empty array = off-season, not error |
| ESPN API | No caching, live fetch per brief | Cache per sport with 4-hour TTL in PostgreSQL; serves stale data gracefully during ESPN outages |
| Google Calendar OAuth | Using `access_type=offline` without `prompt=consent` | Both parameters are required together on the initial auth URL to guarantee refresh token issuance |
| Google Calendar OAuth | Hardcoding token in config file | Store encrypted in PostgreSQL; load at runtime; expose re-auth flow in PWA settings |
| Puppeteer on Railway | No `--disable-dev-shm-usage` flag | `/dev/shm` in Docker defaults to 64MB; Chrome uses it for shared memory; flag forces Chrome to use `/tmp` instead |
| Puppeteer on Railway | Opening a new browser per PDF job | One persistent browser, incognito contexts per job, recycle every 50 requests |
| Resend/Postmark | Sending from unverified domain | Domain verification (SPF/DKIM DNS records) must be complete before first send or provider blocks the email |
| Railway Serverless | Default sleep mode enabled | Disable sleep on vigil-core service; 10-minute inactivity sleep is fatal for a once-per-day brief request |
| Brief assembly | `Promise.all` for data sources | Use `Promise.allSettled`; log failures per source; return partial brief rather than rejecting entirely |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Cold Chromium launch on every PDF request | PDF takes 8–12s even for simple pages | Persistent browser instance at server startup | First concurrent PDF request |
| No streaming for PDF response | Client timeout before large PDF is fully generated | Stream PDF bytes as they are written; use `res.pipe()` or Hono streaming response | PDFs > 2MB or slow Railway network |
| Parallel data source calls with `Promise.all` | One ESPN timeout (30s) blocks entire brief | `Promise.allSettled` with per-source timeout via `Promise.race` + timeout promise | Every ESPN off-season outage |
| No request queue for PDF generation | 3 concurrent brief requests = 3 concurrent Chromium instances = OOM | Queue PDF jobs with a concurrency limit of 1 (single user system — no need for more) | Any situation with > 1 concurrent PDF request |
| Fetching Google Calendar events per brief without caching | Calendar API quota exhausted; brief fails | Cache calendar events for 15 minutes in PostgreSQL or in-memory | > 6 brief regenerations per hour |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing Google refresh token unencrypted in PostgreSQL | Token visible in DB dumps, `psql` queries, Railway DB viewer | Encrypt with AES-256 before INSERT; decrypt on SELECT; use env var for encryption key |
| Exposing `/v1/brief/generate` without auth | Anyone with the endpoint URL can trigger PDF generation + Chromium = denial of service | Require bearer token auth on all `/v1/brief/*` routes (already implemented in vigil-core) |
| Running Puppeteer with `--no-sandbox` without user-content isolation | If user-supplied HTML were rendered, XSS could escape sandbox | This project renders only server-controlled HTML templates — `--no-sandbox` is acceptable here (Railway containers provide OS-level isolation) |
| Logging full ESPN API response bodies | Logs may include personally identifiable or copyrighted data | Log only status codes, endpoint names, and response sizes — not body content |
| Sending brief PDF to unverified email addresses | If email address is configurable by user, a misconfiguration could send personal health data to wrong address | Validate email address format server-side; require explicit confirmation before first scheduled delivery |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Sync brief generation with no progress feedback | User clicks "Generate Brief" and sees a spinner for 15–30 seconds with no indication of progress | Return `202 Accepted` immediately; stream progress events via SSE or polling endpoint |
| PDF layout breaks on different paper sizes | Traveler's notebook insert (270×540pt) renders incorrectly if Puppeteer uses A4 defaults | Explicitly set `page.pdf({ width: '270pt', height: '540pt', printBackground: true })` — never rely on defaults |
| Brief fails entirely if one data source is down | No brief on a morning when ESPN is down or Google Calendar token has expired | Partial brief with "source unavailable" section placeholders is far better than a total failure |
| Email brief arrives at unpredictable time | Brief email arrives 2 minutes after scheduled time some days, 20 minutes other days | Use Railway's cron scheduling or an external cron (cron-job.org) that hits `/v1/brief/generate` — do not rely on Node.js `setTimeout` across restarts |
| No download fallback if PWA preview fails | User cannot get their brief if the PWA PDF preview fails to render | Provide a direct download link to the raw PDF binary as a fallback |

---

## "Looks Done But Isn't" Checklist

- [ ] **Puppeteer on Railway:** Page renders locally but passes `--disable-dev-shm-usage`? Test on Railway with a real deploy — not `railway run` locally — before marking done.
- [ ] **Google Calendar OAuth:** Token stored in DB and calendar events appear in brief — but what happens 7 days later? Verify OAuth consent screen is "Production" not "Testing" before the refresh token is considered long-lived.
- [ ] **ESPN proxy:** Sports data appears in brief during implementation week — verify endpoint returns correct data across all 4 sports (MLB, NFL, NBA, NHL), including the ones currently in off-season (empty events array ≠ working implementation).
- [ ] **Email delivery:** Email arrives in developer's inbox — but is it in spam for a Gmail account that has never corresponded with vigilhub.io? Test with a fresh Gmail account. Check mail-tester.com score.
- [ ] **PDF layout fidelity:** Brief looks correct in Puppeteer screenshot — but does it render correctly at 270×540pt (traveler's notebook insert) specifically? The existing CoreGraphics layout was tuned for this size; HTML+CSS requires explicit page dimension configuration.
- [ ] **Brief storage:** PDF is saved and retrievable — but is the binary stored in the DB or in object storage? Run `SELECT pg_size_pretty(sum(pg_column_size(pdf_binary))) FROM briefs;` to verify no binary bloat in PostgreSQL.
- [ ] **Brief assembly timeout:** Brief generates in 12 seconds in dev — but does it complete within configured timeout on Railway after a cold start? Test the first request after 15 minutes of inactivity.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Puppeteer OOM-killing Railway service | MEDIUM | Increase Railway service memory limit (immediate), add browser recycling logic (1 day), switch to incognito context pattern (1 day) |
| Google refresh token revoked | LOW | Expose re-auth endpoint in PWA settings; user completes OAuth flow; new token replaces old one in DB |
| ESPN endpoint URL changed | LOW | Update endpoint constant in ESPN proxy service; redeploy. If response schema changed, update parser. ~2 hours. |
| PDFs stored in PostgreSQL bytea (schema mistake) | HIGH | Migration: copy binaries to Railway Bucket, update schema to `storage_key` column, backfill, drop bytea column. 1 day + downtime window. |
| Email going to spam | MEDIUM | Verify SPF/DKIM/DMARC records (1 hour), switch to Resend/Postmark if using raw SMTP (2 hours), warm up sending reputation over 1 week |
| Docker image too large for Railway build | MEDIUM | Switch to `puppeteer-core`, restructure Dockerfile layer order, set `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`, redeploy. ~4 hours. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Chromium Docker image bloat | PDF rendering phase (Phase 1 of that feature) | Railway deploy log shows image < 600MB; build time < 3 minutes |
| Puppeteer OOM kill | PDF rendering phase | Load test: generate 3 briefs in 5 minutes on Railway; no service restart observed in Railway metrics |
| Railway cold start timeout | Brief assembly endpoint phase | Test: let Railway sleep (wait 15 min), trigger brief generation, verify it completes within 60s |
| Google OAuth token expiry | Google Calendar server-side phase | Set OAuth consent to "Testing" mode deliberately, confirm token expires in 7 days and re-auth flow surfaces correctly |
| ESPN API breakage | ESPN proxy phase | Test all 4 sports with an intentionally bad endpoint URL; verify brief renders partial data, not a 500 |
| PDF binary in PostgreSQL | Brief storage phase | Schema review before first INSERT; `pg_size_pretty` check after 7 days of generation |
| Email deliverability | Email delivery phase | mail-tester.com score ≥ 9/10; test delivery to fresh Gmail + Outlook accounts |

---

## Sources

- [Puppeteer Docker official guide](https://pptr.dev/guides/docker) — Chromium flags, base image recommendations
- [Puppeteer memory leak analysis — Dina Matveev / Medium](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367) — Production OOM patterns
- [Puppeteer Docker image size — James Judd / Medium](https://medium.com/@jamesjudd_21057/dont-let-puppeteer-bloat-your-docker-image-3965a4863b8) — Image optimization
- [Railway app sleeping reference](https://docs.railway.com/reference/app-sleeping) — Sleep conditions, cold start behavior
- [Railway storage buckets](https://docs.railway.com/storage-buckets) — Pricing, S3-compatible API
- [Google OAuth best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices) — Refresh token storage, limits, revocation scenarios
- [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server) — `access_type=offline`, `prompt=consent` requirements
- [ESPN unofficial API guide — Zuplo](https://zuplo.com/learning-center/espn-hidden-api-guide) — Endpoint reliability, change history
- [Public ESPN API docs — GitHub](https://github.com/pseudo-r/Public-ESPN-API) — Endpoint reference with known instability notes
- [Email deliverability for SaaS — DEV Community](https://dev.to/whoffagents/email-deliverability-for-saas-spf-dkim-dmarc-setup-and-resend-integration-1hpd) — SPF/DKIM/DMARC setup, Resend integration
- [Mailgun: SPF, DKIM, DMARC setup](https://www.mailgun.com/blog/dev-life/how-to-setup-email-authentication/) — DNS authentication requirements
- [Resend vs Nodemailer vs Postmark — PkgPulse](https://www.pkgpulse.com/blog/resend-vs-nodemailer-vs-postmark-email-nodejs-2026) — Provider comparison for 2026
- [HTML to PDF issues — customjs.space](https://www.customjs.space/blog/html-to-pdf-issues/) — Page break, dimension, and layout fidelity gotchas
- [Railway memory allocation — Railway Help Station](https://station.railway.com/questions/server-not-picking-up-correct-memory-all-6861edf8) — Container memory configuration

---
*Pitfalls research for: Server-side PDF generation + ESPN proxy + Google Calendar OAuth + email delivery on Railway/Hono*
*Researched: 2026-04-12*
