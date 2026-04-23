# Pitfalls Research

**Domain:** v3.6 — Multi-User Completion, Auth UX & Safari Parity (adding features to existing Vigil architecture)
**Researched:** 2026-04-22
**Confidence:** HIGH — all pitfalls verified against direct code inspection of vigil-core source

---

## Critical Pitfalls

### Pitfall 1: Reset Token Stored Plaintext in DB

**What goes wrong:**
`POST /v1/auth/forgot-password` generates a random token, stores the raw bytes in a `password_reset_tokens` table, and emails a link containing that token verbatim. A DB read (Railway credential leak, SQL injection, insider access) immediately yields usable reset tokens for every account that requested a reset in the last N hours — full account takeover without ever knowing the password.

**Why it happens:**
Developers treat it as a "short-lived token, no need to hash." This is wrong — a reset token is a temporary password equivalent. The same threat model applies: the DB must not contain anything that lets an attacker act.

**How to avoid:**
Mirror the existing `vk_` key pattern already in the codebase: `crypto.randomBytes(32)` → send `hex`-encoded token in the email link → store `crypto.createHash('sha256').update(token).digest('hex')` in DB. The `token-crypto.ts` module proves the team already knows this discipline. The `password_reset_tokens` table column must be named `token_hash TEXT NOT NULL`, never `token TEXT`.

**Warning signs:**
Any migration adding a `reset_token`, `token`, or similar column in `password_reset_tokens` that is NOT suffixed `_hash`.

**Phase to address:**
AUTH-10 — data model must specify `token_hash` before any implementation starts.

---

### Pitfall 2: JWT Issued Before Reset Token Is Verified

**What goes wrong:**
`POST /v1/auth/reset-password` with `{ token, newPassword }` calls `signToken()` to return a JWT immediately after hashing the new password — before verifying that `SHA-256(token)` matches a valid, unexpired, single-use DB row. An attacker who can observe the response or exploit a race window receives a valid JWT for an account they do not own.

**Why it happens:**
Developers write the "happy path" top-down: hash password → update user → sign JWT → return. Token verification is added as a guard but ends up after the DB writes in a refactor.

**Concrete wrong pattern:**
```typescript
// WRONG: JWT issued before token is verified
const passwordHash = await hashPassword(newPassword);
await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
const jwt = await signToken(userId, email); // issued too early
const row = await verifyResetToken(token); // too late
if (!row) return c.json({ error: "Invalid token" }, 400);
```

**How to avoid:**
Mandatory order enforced in the plan task sequence: (1) hash incoming token, (2) SELECT + check expiry + check `used_at IS NULL`, (3) update password, (4) mark token `used_at = now()`, (5) ONLY THEN issue JWT. The plan must include an integration test: tampered token → 400, no JWT emitted.

**Warning signs:**
Any `signToken()` call appearing before the reset token validation SELECT in the handler.

**Phase to address:**
AUTH-10.

---

### Pitfall 3: Stateless JWT Stays Valid After Password Reset

**What goes wrong:**
A user's account is compromised. The real user resets their password via forgot-password. The attacker holds a valid 30-day JWT (from before the compromise) and continues to access the API. `verifyToken()` in `jwt.ts` only checks the signature and expiry — it has no knowledge of password changes. The attacker is not logged out.

**Why it happens:**
The v3.4 decision of stateless JWT (no refresh token rotation) was correct for single-user at the time. Forgot-password introduces a new implication that was not present when that decision was made: there is now a meaningful "session invalidation" event.

**How to avoid:**
Add `password_changed_at TIMESTAMP WITH TIME ZONE` to the `users` table. In the `bearerAuth` JWT path, after `verifyToken()` succeeds, add one DB lookup: `SELECT password_changed_at FROM users WHERE id = $userId`. If `jwt.claims.iat < password_changed_at`, reject with 401. This is one indexed DB query per JWT request — acceptable at current scale. Add to the v3.4 Key Decisions addendum: "After AUTH-10, `password_changed_at` gate is required; stateless JWT alone is insufficient post-reset."

This fix applies to BOTH AUTH-09 (change-password) and AUTH-10 (reset-password) — both events must update `password_changed_at`.

**Warning signs:**
After a successful password reset, the old JWT still returns 200 from any authenticated endpoint.

**Phase to address:**
AUTH-09 and AUTH-10 — both must update `password_changed_at`; bearerAuth middleware updated in whichever phase ships first.

---

### Pitfall 4: Timing-Attack Email Enumeration on Forgot-Password

**What goes wrong:**
`POST /v1/auth/forgot-password` with an unknown email returns in ~1ms (no DB row, early return). The same call with a known email takes ~15ms (DB lookup + token generation). An attacker scripts this to enumerate which emails are registered. This is the exact threat the `DUMMY_HASH` constant in `auth.ts` already guards on the login path — the forgot-password endpoint needs its own version.

**How to avoid:**
Always return HTTP 200 with `{ message: "If that address is registered, a reset link has been sent." }` regardless of whether the email exists. Internally, only generate and send a token if the user row exists. The response body, status code, and approximate response time must be identical for known and unknown emails. A constant-time floor (e.g., minimum 50ms via a fixed `await setTimeout`) absorbs DB lookup variance.

**Warning signs:**
`POST /v1/auth/forgot-password` returns different HTTP status codes or distinct response bodies when the email is unknown vs. known.

**Phase to address:**
AUTH-10.

---

### Pitfall 5: Per-IP Rate Limiting Only, No Per-Email Counter on Auth Endpoints

**What goes wrong:**
The existing `rateLimiter` middleware uses in-memory per-IP counters. Applied to forgot-password, an attacker behind a residential proxy rotates IPs and sends hundreds of reset requests for a specific target email, flooding the inbox and amplifying any side-channel leak. The same applies to the verify-email resend endpoint.

**How to avoid:**
Add a second in-memory counter keyed on `SHA-256(email.toLowerCase())` (not raw email — avoid storing PII in the rate-limit store). Allow maximum 3 requests per email per 15-minute window. Use a simple `Map<string, { count: number; windowStart: number }>` with TTL cleanup — the existing in-memory rate-limit pattern is the right model. Keep the per-IP counter as-is; add the per-email counter as a second check.

**Warning signs:**
Four or more `POST /v1/auth/forgot-password` calls with the same email in 5 minutes all return 200.

**Phase to address:**
AUTH-10 (same guard reused for AUTH-11 resend).

---

### Pitfall 6: Email Address in Reset Link URL — Referrer Leak

**What goes wrong:**
Reset link: `https://app.vigilhub.io/reset?token=abc&email=user@example.com`. When the PWA loads and triggers any request to an external resource (analytics, fonts, a CDN), the `Referer` header on that request contains the full URL including the email address. Even without external requests, the email appears in browser history. The email field was added "for convenience" to pre-fill the form.

**How to avoid:**
Token-only URL: `https://app.vigilhub.io/reset?token=abc`. The reset endpoint looks up the associated email from the token server-side. The PWA clears the token from the URL after reading it via `history.replaceState({}, '', '/reset')`. This prevents the token from appearing in PostHog page-view captures (PostHog is already shipped — it will capture the page URL).

**Warning signs:**
Reset link URL contains `email=` as a query parameter. PostHog session replay shows URLs containing `email=` in the reset page view.

**Phase to address:**
AUTH-10.

---

### Pitfall 7: Reset Token Single-Use Race Condition

**What goes wrong:**
User double-clicks the reset link. Two simultaneous requests hit `POST /v1/auth/reset-password`. Both SELECT the token row. Both see `used_at IS NULL`. Both proceed. Result: password set twice (probably harmless), `used_at` guarantee broken. Worse variant: legitimate use + attacker replay within the same 200ms concurrency window.

**How to avoid:**
Atomic UPDATE pattern — no separate SELECT:
```sql
UPDATE password_reset_tokens
SET used_at = now()
WHERE token_hash = $1
  AND expires_at > now()
  AND used_at IS NULL
RETURNING user_id;
```
If the UPDATE returns no row, the token was invalid, expired, or already consumed. PostgreSQL's UPDATE is atomic. No separate SELECT is needed or safe.

**Warning signs:**
Handler does a SELECT followed by a separate UPDATE in two queries without a transaction.

**Phase to address:**
AUTH-10 — include the atomic UPDATE pattern as the canonical implementation in the plan.

---

### Pitfall 8: vk_ Key User Triggers Forgot-Password — Seed User Placeholder Hash Overwritten

**What goes wrong:**
The Mac app, CLI, and browser extensions use `vk_` keys. These clients authenticate as the seed user. If `POST /v1/auth/forgot-password` is called with the seed user's email, a reset token is generated and a new password hash set via the reset flow. The seed user's `PLACEHOLDER_HASH_PREFIX` row (which gates the claim-flow and blocks direct password login) could be overwritten with a real hash — accidentally enabling JWT login for the seed account or breaking the D-11 claim-flow detection.

**How to avoid:**
(1) Apply the `VIGIL_ALLOWED_EMAILS` check to the forgot-password endpoint — only allowlisted emails can request a reset (already enforced on registration). (2) Add an explicit check: if the user's `passwordHash` starts with `PLACEHOLDER_HASH_PREFIX`, return generic 200 with the standard "link sent" message but do NOT create a reset token. vk_-only users cannot set a password via forgot-password. Document this guard explicitly in the AUTH-10 plan.

**Warning signs:**
`POST /v1/auth/forgot-password` with the seed user's email produces a `password_reset_tokens` row.

**Phase to address:**
AUTH-10.

---

### Pitfall 9: Verify-Email Token Leak via Referrer

**What goes wrong:**
Verification link: `https://app.vigilhub.io/verify?token=abc123`. User clicks. PWA reads the token, posts to `POST /v1/auth/verify-email`, then navigates to dashboard. The next request from the PWA to any API endpoint carries `Referer: https://app.vigilhub.io/verify?token=abc123`. PostHog (already shipped) captures the page view URL including the token. If the token is still valid at the time of the Referer leak, an attacker who reads PostHog can replay it.

**How to avoid:**
PWA must call `history.replaceState({}, '', '/verify')` before making any subsequent navigation or API calls after reading the token from the URL. Use single-use enforcement (same atomic UPDATE pattern as Pitfall 7) so even a replayed token fails. The `verifyEmail` Hono handler can also set `Referrer-Policy: no-referrer` on the response.

**Phase to address:**
AUTH-11.

---

### Pitfall 10: Auto-Login After Verify Embeds JWT in URL

**What goes wrong:**
After email verification, the server redirects to `https://app.vigilhub.io/dashboard?token=eyJhbGci...`. The JWT is now in browser history, server access logs, and every Referer header for the next 30 days. This is a documented CVE class — JWTs in URLs are visible across the entire request chain. PostHog captures page URLs; this would log the raw JWT into PostHog.

**How to avoid:**
Do not auto-login via URL. Two safe options:
1. Redirect to login page with `?verified=true` — user logs in normally. Simple, zero security surface. Correct choice for v3.6 at N=1 real user.
2. Short-lived (60-second TTL) opaque exchange code — redirect to `/verify-success?code=<opaque>`, PWA exchanges for JWT via `POST /v1/auth/exchange` (atomic single-use). More complex, only warranted if seamless UX is required.

**Warning signs:**
Any redirect URL after email verification contains `token=` as a query or fragment parameter.

**Phase to address:**
AUTH-11.

---

### Pitfall 11: Existing Users Locked Out After AUTH-11 Ships — email_verified_at Not Backfilled

**What goes wrong:**
AUTH-11 migration adds `email_verified_at TIMESTAMP` to `users` with `DEFAULT NULL`. The seed user (jamesonmorrill1@gmail.com) has `email_verified_at = NULL`. AUTH-11 gates certain actions on verification status. The seed user is now locked out of their own production data the moment the migration deploys to Railway.

**Why it happens:**
Same root cause as the v3.4 work that prompted the 0012 migration's DO $$ backfill block. New timestamp/boolean columns default to NULL/false and break existing rows without an explicit backfill.

**How to avoid:**
Follow the 0012 migration pattern exactly: ADD COLUMN nullable, then DO $$ UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL $$, then optionally index. All existing users are treated as verified as of their account creation date. New users after AUTH-11 ship have `email_verified_at = NULL` until they click the link.

**Warning signs:**
Any AUTH-11 migration that adds `email_verified_at` or `email_verified` without a follow-up `UPDATE` backfill for existing rows.

**Phase to address:**
AUTH-11.

---

### Pitfall 12: W-01 Migration FK Constraint Added Before Backfill

**What goes wrong:**
The W-01 migration adds `user_id` to `work_order_statuses`. If the `ALTER COLUMN "user_id" SET NOT NULL` statement runs before the `DO $$ UPDATE work_order_statuses SET user_id = seed_id WHERE user_id IS NULL $$` block, PostgreSQL's table scan finds NULL rows and fails with a constraint violation. The Railway deploy fails mid-migration, leaving `work_order_statuses` in a partially-migrated state.

**Why it happens:**
The Drizzle migration file uses `statement-breakpoint` comments. Developers accidentally reorder blocks without realizing the ordering is load-bearing.

**How to avoid:**
Follow the 0012 migration's exact five-step sequence: (1) ADD COLUMN nullable, (2) DO $$ UPDATE backfill, (3) ALTER COLUMN SET NOT NULL, (4) ADD CONSTRAINT FK (in DO $$ exception guard), (5) CREATE INDEX. Any deviation breaks Railway deploys. Test on a fresh local DB via `docker-compose up` before pushing.

**Warning signs:**
W-01 migration file has `ALTER COLUMN "user_id" SET NOT NULL` appearing before the DO $$ UPDATE block.

**Phase to address:**
W-01.

---

### Pitfall 13: work_order_statuses Cross-User Data Leak — Four Call Sites Must All Be Scoped

**What goes wrong:**
After W-01 adds `user_id` to `work_order_statuses`, every SELECT/INSERT/UPDATE/DELETE on that table must include `WHERE user_id = $userId`. Missing even one creates a data leak. There are at least four call sites today:

1. `work-order-status.ts` `dbSelectFn` — currently `db.select().from(workOrderStatuses)` (no userId filter)
2. `work-order-status.ts` `dbUpsertFn` — currently `INSERT ... ON CONFLICT (caseNumber)` (no userId on conflict target)
3. `work-orders.ts` GET route line 93-94 — `db.select().from(workOrderStatuses)` builds a `statusMap` with ALL users' statuses
4. `work-orders.ts` DELETE route — deletes statuses by `inArray(workOrderStatuses.caseNumber, ...)` without userId scope

Sites 3 and 4 in `work-orders.ts` are the most likely to be overlooked because they appear far from the status-specific route file.

**How to avoid:**
After W-01 migration, run: `grep -rn "workOrderStatuses" vigil-core/src/routes/` and verify every reference includes `eq(workOrderStatuses.userId, userId)`. Write an explicit cross-user isolation test: User A sets a status; assert User B's API call cannot read or modify it.

**Warning signs:**
Any `db.select().from(workOrderStatuses)` without a `.where(eq(workOrderStatuses.userId, ...))` clause after W-01 ships.

**Phase to address:**
W-01.

---

### Pitfall 14: W-01 conflict-target on upsert breaks with composite PK

**What goes wrong:**
The current `work_order_statuses` table has `caseNumber` as the sole primary key. The current upsert in `work-order-status.ts` uses `onConflictDoUpdate({ target: workOrderStatuses.caseNumber, ... })`. After W-01 adds `user_id` and the PK becomes composite `(user_id, case_number)`, the existing `onConflictDoUpdate` target points to a constraint that no longer uniquely identifies a row. Drizzle will emit invalid SQL or the upsert will silently insert duplicates.

**How to avoid:**
After W-01, the upsert conflict target must reference the composite PK: `onConflictDoUpdate({ target: [workOrderStatuses.userId, workOrderStatuses.caseNumber], ... })`. The W-01 plan must include updating this upsert in `work-order-status.ts` as an explicit task, not an afterthought.

**Warning signs:**
`onConflictDoUpdate({ target: workOrderStatuses.caseNumber, ... })` remains unchanged after W-01 adds the composite PK.

**Phase to address:**
W-01.

---

### Pitfall 15: SCHED-01 — One User's Error Blocks All Remaining Users

**What goes wrong:**
The current `generate-scheduler.ts` `tick()` has a single try/catch around the generate call for the seed user. After SCHED-01 fans out to all users via a loop:
```typescript
for (const user of allUsers) {
  await generateForUser(user); // throws for user 3
  // users 4..N never run
}
```
User 3's transient Claude timeout or calendar OAuth failure silently blocks brief generation for all subsequent users. The outer `tick()` catch logs an error but does not indicate which users succeeded or how many were skipped.

**How to avoid:**
Each user iteration must be wrapped in its own try/catch with `continue`, not `return`:
```typescript
for (const user of allUsers) {
  try {
    await generateForUser(user.id, todayInTz);
    trackEvent("scheduler_brief_generated", user.id, { date: todayInTz });
  } catch (err) {
    log("error", `brief generation failed for user ${user.id}`, String(err));
    trackEvent("scheduler_brief_failed", user.id, { date: todayInTz, error: String(err) });
    // continue — do not block remaining users
  }
}
log("info", `scheduler tick complete: ${succeeded}/${allUsers.length} succeeded`);
```

**Warning signs:**
A `for` loop over users in `tick()` where the error handler calls `return` instead of `continue`.

**Phase to address:**
SCHED-01.

---

### Pitfall 16: SCHED-01 — Prioritization Cache Not Keyed by userId, Cross-User Data Leak

**What goes wrong:**
`prioritize.ts` `getCacheKey()` currently generates a cache filename from `today + hash(caseNumbers)`. After SCHED-01, multiple users' work orders are prioritized in the same scheduler tick. User A's prioritization result (based on their work order content) is cached with a key that only includes the case numbers. User B with overlapping case numbers (or the same numbers if they share a work environment) gets User A's prioritization order from cache — wrong ranking, potential content exposure in the log entry.

**How to avoid:**
Add `userId` to the cache key: `wo-priority-${today}-${userId}-${hash}.json`. One line change in `getCacheKey()`. This must be done in the SCHED-01 phase before fan-out ships.

**Warning signs:**
`getCacheKey()` signature in `prioritize.ts` does not include a `userId` parameter after SCHED-01 ships.

**Phase to address:**
SCHED-01 (fix `getCacheKey()` as part of the fan-out work).

---

### Pitfall 17: Transactional Email Provider Link Tracking Breaks Reset/Verify Tokens

**What goes wrong:**
Postmark, Resend, and Sendgrid have "link tracking" enabled by default. Every URL in the email body is rewritten to proxy through the provider's click-tracking domain. The user clicks the tracking URL, gets redirected, then hits the actual reset/verify URL. Apple Mail on iOS (with Mail Privacy Protection) pre-fetches all links in an email when it arrives — this pre-fetch hits the tracking URL, which hits the actual token URL, which consumes the single-use token. The user opens the email and clicks "Reset Password" — the token is already used. They see "Invalid or expired token."

**Why it happens:**
Link tracking is default-on and is never mentioned in the getting-started quick-start docs. Developers test in a non-Mail Privacy Protection environment and the bug is invisible until a real iOS user tries it.

**How to avoid:**
Disable link tracking for every transactional email containing a token link. For Resend: include `clickTracking: false` in the send call options. For Postmark: disable "Track Links" per message stream. Verify by inspecting the raw email source after a test send — the href value must be verbatim `https://app.vigilhub.io/reset?token=...`, not a tracking domain URL.

**Warning signs:**
Raw email source shows a click-tracking domain (e.g., `click.postmarkapp.com`, `r.resend.com`) in the href of reset/verify links.

**Phase to address:**
AUTH-10 (first transactional email) — establish the no-link-tracking policy before AUTH-11 reuses the email service.

---

### Pitfall 18: Railway Env Var Shape — Provider API Key with Trailing Newline

**What goes wrong:**
Railway's "Variables" panel accepts multi-line values. A paste operation from the browser or `cat` output adds a trailing newline. The email SDK initializes with `new Resend("re_abc123\n")`. Every send call returns HTTP 401. The server starts successfully — no startup crash — but every email silently fails. This is the exact pattern documented in `project_vigil_core_env_gates.md`: "tsx doesn't auto-load .env; vigil-core env gates fail-closed."

**How to avoid:**
Strip whitespace at initialization:
```typescript
const apiKey = (process.env["RESEND_API_KEY"] ?? "").trim();
if (!apiKey) {
  console.error("FATAL: RESEND_API_KEY not configured");
  process.exit(1);
}
```
This mirrors the JWT_SECRET pattern in `jwt.ts` exactly. Add a startup smoke test: verify that an email service instance was created without throwing.

**Warning signs:**
Email sends return 401 from the provider despite the key appearing correct in Railway's Variables UI.

**Phase to address:**
AUTH-10 (EmailService module initialization).

---

### Pitfall 19: Silent Send Failure — Provider Returns 200, Email Never Arrives

**What goes wrong:**
The send API returns HTTP 200 with a message ID. `POST /v1/auth/forgot-password` returns 200 to the caller. The email is never delivered because the sending domain lacks DKIM/SPF/DMARC records and the recipient's mail server silently drops or quarantines the message. There is no error in Railway logs. The user sees "check your email" and nothing arrives.

**How to avoid:**
Before AUTH-10 ships to prod: (1) Verify DKIM/SPF/DMARC on `vigilhub.io` — `dig TXT vigilhub.io` and `dig TXT _dmarc.vigilhub.io`. If missing, configure them first. Start with `p=none` (report-only) DMARC and upgrade after two weeks of clean reports. (2) Send a manual test email to `jamesonmorrill1@gmail.com` via the provider dashboard and confirm it lands in inbox (not spam). (3) Subscribe to provider bounce/complaint webhooks and emit a PostHog event (`email_bounced`, userId) for observability. (4) Log the provider's returned message ID for every send so bounces can be correlated.

**Warning signs:**
`dig TXT _dmarc.vigilhub.io` returns NXDOMAIN at AUTH-10 ship time. This is a blocking prerequisite.

**Phase to address:**
AUTH-10 — DKIM/SPF/DMARC setup is a hard prerequisite, not a nice-to-have.

---

### Pitfall 20: Email SDK Initialized at Module Load — Test Suite Requires Prod Credentials

**What goes wrong:**
```typescript
// top of emailService.ts — module-load-time init
const resend = new Resend(process.env.RESEND_API_KEY);
```
Any test file that imports a route that imports `emailService.ts` now requires `RESEND_API_KEY` to be set. Tests fail with SDK constructor errors in every CI run and local dev environment that doesn't have email credentials configured. The existing PostHog module avoids this via `apiKey ? new PostHog(apiKey) : null` — apply the same pattern.

**How to avoid:**
```typescript
const apiKey = (process.env["RESEND_API_KEY"] ?? "").trim();
const resend = apiKey ? new Resend(apiKey) : null;

async function sendEmail(opts: SendEmailOpts): Promise<void> {
  if (!resend) {
    log("warn", "email service not configured, skipping send");
    return;
  }
  // ...
}
```
Email becomes a gracefully-degraded optional feature rather than a hard startup dependency. Local dev works without Resend credentials.

**Warning signs:**
`vitest` output shows errors about Resend SDK initialization when `RESEND_API_KEY` is unset. Tests that have nothing to do with email fail when run without email credentials.

**Phase to address:**
AUTH-10 (EmailService module design).

---

### Pitfall 21: Template Injection — User-Controlled Content in Email Subject or Body

**What goes wrong:**
Email subject line: `"Password reset for " + user.email`. If `user.email` contains HTML characters and the email body is rendered as HTML, it can inject markup into the email. More critically: SMTP header injection via newlines in the `to:` or `from:` fields can be attempted if raw email headers are constructed via string concatenation rather than through an SDK's type-checked fields.

**How to avoid:**
Use the transactional email SDK's typed `to:`, `from:`, `subject:` fields — never raw header concatenation. The SDK constructs MIME internally and handles escaping. For any user-controlled value in the HTML body, use the provider's template variable interpolation (Resend's `react` component or HTML with escaped variables) rather than template literals. The `user.email` value has already passed `isValidEmailShape()` at registration time but that regex does not exclude all problematic characters.

**Phase to address:**
AUTH-10.

---

### Pitfall 22: Deliverability — First Emails from New Sending Domain Land in Spam

**What goes wrong:**
The first 50 emails from a brand-new sending domain land in spam for a significant fraction of recipients. For v3.6 at N=1 real user, the only recipient is `jamesonmorrill1@gmail.com`, so this is low-stakes now. It becomes high-stakes when a second user registers and cannot verify their email or reset their password because the email landed in spam silently.

**How to avoid:**
(1) Use `noreply@mail.vigilhub.io` as the sending address (dedicated subdomain keeps the main domain's reputation clean). (2) Verify deliverability manually before AUTH-10 ships to prod: send a test email to `jamesonmorrill1@gmail.com` and confirm inbox placement. (3) Resend's free tier includes `onboarding@resend.dev` for testing — use it in local dev; switch to the real domain only for production.

**Phase to address:**
AUTH-10 — include a "deliverability test send" step in the UAT checklist.

---

### Pitfall 23: New Auth Events Not Wired Through PostHog trackEvent Wrapper

**What goes wrong:**
AUTH-09/10/11 add multiple new user-affecting events: password changed, reset requested, reset completed, email verified, verification resent. Developers new to the codebase call `posthog.capture()` directly instead of the `trackEvent()` wrapper in `posthog.ts`. The `BLOCKED_PROPERTY_NAMES` allowlist check is bypassed, the `NODE_ENV` production gate is bypassed, and PII can leak into PostHog.

**How to avoid:**
Every new auth event must use `trackEvent(eventName, userId, properties)`. Run `grep -rn "posthog\.capture" vigil-core/src/` — the result should be empty (all calls go through the wrapper). Add this grep as a CI check or code review checklist item for auth-related PRs.

**Phase to address:**
AUTH-09, AUTH-10, AUTH-11 (cross-cutting — apply to all three).

---

### Pitfall 24: EXT-02 Safari — CMD+Enter Swallowed by Browser Before Extension JS Fires

**What goes wrong:**
The Chrome extension uses `Cmd+Enter` (macOS) to submit quick-capture. In Safari's extension popup, `Cmd+Enter` may trigger Safari's own form submission or shortcut at the browser level before the extension's JavaScript event listener fires. Safari WebKit-based popup context differs from Chrome's isolated popup window in keyboard event priority.

**How to avoid:**
Test `Cmd+Enter` in the Safari extension popup as the FIRST step in the EXT-02 implementation — before writing any other code. If it is swallowed, design the fallback (visible Submit button as primary affordance, `Cmd+Enter` as secondary) into the initial build rather than retrofitting. The Chrome extension's `Cmd+Enter` must remain unchanged — this is a Safari-specific accommodation only.

**Warning signs:**
EXT-02 plan includes `Cmd+Enter` as a requirement but has no explicit Safari-specific keyboard test step before the implementation tasks.

**Phase to address:**
EXT-02 — keyboard test must be step 1 in the plan.

---

### Pitfall 25: EXT-02 Safari Manifest Changes Invalidate Code Signing

**What goes wrong:**
Phase 107 / EXT-01 established Safari extension persistence. That work may have involved `manifest.json` changes and was followed by a signing step. Any changes to `manifest.json` for EXT-02 (new permissions, updated browser action keys, content script changes) can invalidate the existing signing. A Safari extension with a changed unsigned manifest is silently disabled or blocked by Safari on next launch with no user-visible error message.

**How to avoid:**
Before EXT-02 implementation: verify current signing state with `spctl --assess --type execute /path/to/Safari\ Extension.app`. After EXT-02 manifest changes: include "re-sign extension with Xcode" as an explicit named task in the plan, not an implied afterthought. Test the signed extension in Safari after signing before UAT begins.

**Phase to address:**
EXT-02.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Stateless JWT with no `password_changed_at` gate | Zero DB lookups per request | Compromised accounts stay accessible for up to 30 days after reset | Never once AUTH-10 ships |
| Per-IP rate limiting only (no per-email counter) | One middleware handles everything | Email flooding on target accounts | Never for auth endpoints |
| Prioritization cache not keyed by userId | Works at N=1 | Cross-user data leak and wrong rankings after SCHED-01 | Must be fixed before SCHED-01 ships |
| Sequential scheduler fan-out without error isolation | Simple and readable | One user error blocks all others | Never — per-user try/catch is equally simple |
| Email SDK at module load (not lazy null-guarded) | Fewer null checks at call sites | Test suite requires prod credentials; crashes if key missing | Never — follow PostHog pattern |
| Link tracking enabled on transactional emails | Provider analytics "for free" | Tokens consumed by Apple Mail pre-fetch; users see "invalid token" | Never for reset/verify links |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Resend / Postmark SDK | `new Resend(key)` at module load | Lazy init: `apiKey ? new Resend(apiKey) : null`; null-guard all call sites |
| Resend / Postmark SDK | Link tracking on by default | Explicitly disable per send: `clickTracking: false` (Resend) |
| Railway env vars | API key pasted with trailing newline | `.trim()` on all env var reads; startup FATAL if empty after trim |
| PostHog (already shipped) | New auth events using `posthog.capture()` directly | All events through `trackEvent()` wrapper — enforce with grep in code review |
| PostHog (already shipped) | New auth events with `email` or `reset_email` properties | Check `BLOCKED_PROPERTY_NAMES`; add auth-specific names if needed |
| jose JWT library (already shipped) | Changing `algorithms: ["HS256"]` when adding new token verification | Never change — algorithm pinning is a security requirement, not a style choice |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Reset token stored plaintext in DB | Account takeover on DB read | SHA-256 hash at rest; column named `token_hash` |
| JWT issued before token verification | Valid JWT without knowing password | Verification-first order enforced in plan and integration test |
| No `password_changed_at` gate in bearerAuth | Compromised sessions persist 30 days post-reset | Add to users table; check `iat < password_changed_at` in JWT path |
| Email enumeration via timing on forgot-password | Attacker maps registered emails | Always-200 response; constant-time floor |
| Email in reset link URL | Email + token leak via Referer | Token-only URL; `history.replaceState` in PWA |
| Auto-login via JWT in URL after verify | JWT in browser history, PostHog, server logs | Redirect to login with `?verified=true` only |
| work_order_statuses unscoped after W-01 | Cross-user status data leak | grep all call sites; cross-user isolation test |
| prioritize.ts cache not keyed by userId | Wrong rankings + data leak cross-user | Add userId to `getCacheKey()` before SCHED-01 ships |

---

## "Looks Done But Isn't" Checklist

- [ ] **AUTH-10 token storage:** `password_reset_tokens` table has `token_hash` column (not `token`) — verify in migration SQL
- [ ] **AUTH-10 response timing:** `POST /v1/auth/forgot-password` with unknown email returns 200 in approximately the same time as known email
- [ ] **AUTH-10 password_changed_at:** Column added to `users`; bearerAuth JWT path rejects tokens with `iat < password_changed_at`
- [ ] **AUTH-10 reset flow order:** `signToken()` call appears AFTER the token validation UPDATE RETURNING in the handler
- [ ] **AUTH-10 link tracking:** Raw email source shows verbatim `app.vigilhub.io` URL, not a tracking domain
- [ ] **AUTH-10 DKIM/SPF/DMARC:** `dig TXT _dmarc.vigilhub.io` returns a valid record before first production send
- [ ] **AUTH-10 deliverability test:** Manual test email to `jamesonmorrill1@gmail.com` confirmed in inbox (not spam) before AUTH-10 sign-off
- [ ] **AUTH-11 email_verified_at backfill:** Migration includes `UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL`
- [ ] **AUTH-11 no JWT in URL:** Post-verify redirect URL contains no `token=` parameter
- [ ] **AUTH-11 PWA token cleanup:** `history.replaceState` called after reading verify token from URL
- [ ] **W-01 backfill order:** Migration DO $$ UPDATE block appears BEFORE `ALTER COLUMN SET NOT NULL` in the SQL file
- [ ] **W-01 scope coverage:** `grep -rn "workOrderStatuses" vigil-core/src/routes/` — every occurrence has `eq(workOrderStatuses.userId, ...)` guard
- [ ] **W-01 upsert conflict target:** `onConflictDoUpdate` target updated to composite `[userId, caseNumber]` after PK change
- [ ] **SCHED-01 error isolation:** Per-user try/catch uses `continue`, not `return` — verify by test that injects a throw for user 2 of 3
- [ ] **SCHED-01 cache key:** `getCacheKey()` in `prioritize.ts` includes `userId` parameter
- [ ] **EXT-02 Cmd+Enter:** Tested in Safari popup as step 1 before any EXT-02 implementation code is written
- [ ] **EXT-02 signing:** Extension re-signed after manifest changes; `spctl --assess` passes

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Reset token stored plaintext | AUTH-10 | Migration column is `token_hash`; code review |
| JWT issued before token verified | AUTH-10 | Integration test: tampered token → 401, no JWT |
| Old JWT valid after reset | AUTH-09 + AUTH-10 | Integration test: old JWT rejected after password change/reset |
| Email enumeration via timing | AUTH-10 | Test: unknown email returns 200 in ≥ same time as known |
| Per-email rate limit missing | AUTH-10 | Test: 4+ same-email requests in 10 min returns 429 |
| Email in reset URL | AUTH-10 | Review link construction; no `email=` param |
| Single-use race condition | AUTH-10 | DB: UPDATE uses `WHERE used_at IS NULL RETURNING` |
| vk_ user triggers reset | AUTH-10 | Test: seed user email → generic 200, no token row created |
| Verify token referrer leak | AUTH-11 | `history.replaceState` in PWA; no Referer with token |
| Auto-login via JWT in URL | AUTH-11 | No `token=` in post-verify redirect |
| Existing users locked out | AUTH-11 | Seed user has `email_verified_at` backfilled; integration test |
| W-01 FK ordering error | W-01 | Migration runs on fresh local DB and Railway |
| work_order_statuses cross-user leak | W-01 | Cross-user isolation test; grep confirms all call sites scoped |
| upsert conflict target stale | W-01 | Code review: conflict target updated to composite PK |
| SCHED-01 one user blocks others | SCHED-01 | Test: thrown error for user 2 does not prevent user 3 |
| Prioritize cache cross-user leak | SCHED-01 | `getCacheKey()` includes userId; code review |
| Provider link tracking breaks tokens | AUTH-10 | Raw email inspection: verbatim URL in href |
| Railway env var newline | AUTH-10 | `.trim()` in EmailService init; test with trailing space |
| Silent email bounce | AUTH-10 | DKIM/SPF/DMARC verified; deliverability test to inbox |
| SDK module-load crash | AUTH-10 | Test suite passes with `RESEND_API_KEY` unset |
| Template injection | AUTH-10 | SDK typed fields; no string concatenation for headers |
| New events bypass trackEvent | AUTH-09 + AUTH-10 + AUTH-11 | `grep -rn "posthog\.capture" vigil-core/src/` returns empty |
| EXT-02 Cmd+Enter swallowed | EXT-02 | First UAT step before implementation |
| EXT-02 manifest signing | EXT-02 | Re-sign task in plan; `spctl --assess` passes |

---

## Sources

- Direct code inspection: `vigil-core/src/middleware/auth.ts`, `routes/auth.ts`, `utils/jwt.ts`, `utils/password.ts`, `utils/token-crypto.ts`, `db/schema.ts`, `drizzle/0012_multi_user_foundation.sql`, `drizzle/0013_work_orders_drift_repair.sql`, `routes/work-order-status.ts`, `routes/work-orders.ts`, `services/generate-scheduler.ts`, `routes/prioritize.ts`, `analytics/posthog.ts`, `routes/me.ts`
- Existing code comments referencing "Pitfall 1..9" in `auth.ts`, `jwt.ts`, `password.ts` — team's documented prior art on timing-safe auth
- v3.4 claim-flow and 0012 migration pattern — reference model for W-01 and AUTH-11 backward-compat migrations
- Railway deployment constraints: `project_railway_deploy.md`, `project_vigil_core_env_gates.md` (project memory)
- OWASP Password Reset Cheat Sheet — token storage, timing enumeration, single-use enforcement
- Apple Mail Privacy Protection behavior — link pre-fetching consumes single-use tokens before user clicks
- RFC 7519 JWT spec — `iat` semantics for `password_changed_at` comparison
- PostHog `trackEvent` wrapper and `BLOCKED_PROPERTY_NAMES` — `analytics/posthog.ts` lines 38-51

---
*Pitfalls research for: v3.6 Multi-User Completion, Auth UX & Safari Parity*
*Researched: 2026-04-22*
