# Architecture Research: v3.6 Multi-User Completion, Auth UX & Safari Parity

**Domain:** Vigil Core API — Node.js / Hono / Drizzle / PostgreSQL
**Researched:** 2026-04-22
**Confidence:** HIGH — derived from reading actual source files, not summaries

---

## System Overview (existing, confirmed)

```
Clients
  vigil-pwa (React/Vite)         sessionStorage JWT
  Mac app / CLI                  vk_ bearer key
  vigil-extension (Chrome)       chrome.storage vk_ bearer key
  vigil-safari-extension         chrome.storage vk_ bearer key (Safari WebExtension API)
  vigil-g2-plugin                vk_ bearer key
           |
           |  HTTPS -> api.vigilhub.io
           v
+------------------------------------------------------------------+
|  vigil-core/src/index.ts                                         |
|  CORS -> secureHeaders -> timeout(30s) -> rateLimiter            |
|  /v1/health            <- public                                 |
|  /v1/auth/register     <- public                                 |
|  /v1/auth/login        <- public                                 |
|  /v1/auth/google/callback <- public (OAuth return)              |
|  /v1/*                 <- bearerAuth (3-path: vk_/JWT/malformed) |
|      |                                                           |
|      v                                                           |
|  routes/auth.ts        <- register / login                       |
|  routes/me.ts          <- GET /v1/me                             |
|  routes/brief-generate.ts <- POST /v1/brief/generate            |
|                            GET /v1/brief/:date (PDF bytes)       |
|  routes/brief-history.ts  <- GET/POST /v1/briefs                 |
|  routes/work-order-status.ts <- GET/PUT /v1/work-orders/statuses |
|  routes/work-orders.ts    <- GET/PUT/DELETE /v1/work-orders      |
|  ... 20+ other routes                                            |
|                                                                  |
|  services/generate-scheduler.ts  setInterval(60s) -- SEED ONLY  |
|  services/gmail-workorder-service.ts  setInterval(5m)           |
+------------------------------------------------------------------+
           |
           v
+------------------------------+
|  PostgreSQL (Railway)        |
|  users                       |
|  api_keys (userId FK)        |
|  thoughts (userId FK)        |
|  projects (userId FK)        |
|  briefs (userId FK)          |
|  brief_pdfs (userId FK)      |
|  chat_sessions (userId FK)   |
|  work_orders (userId FK)     |
|  work_order_statuses  <- NO userId FK  <- W-01                  |
|  oauth_tokens (userId FK)    |
|  app_settings (userId+key PK)|
|  ai_cache (userId+type PK)   |
|  thought_links (userId FK)   |
+------------------------------+
```

---

## Feature-by-Feature Integration Analysis

### W-01: work_order_statuses userId Scoping

**Problem confirmed from schema.ts:224-228:** `work_order_statuses` has `caseNumber TEXT PRIMARY KEY`, `status TEXT`, `updatedAt TIMESTAMP`. No `userId` column, no FK, no index.

**Problem confirmed from routes/work-order-status.ts:64-83:** The production `dbSelectFn` does a bare `db.select().from(workOrderStatuses)` — returns ALL rows for ALL users. The `dbUpsertFn` conflicts on `caseNumber` alone — User A can overwrite User B's status for the same case number.

**Integration points:**
- `vigil-core/src/db/schema.ts` — workOrderStatuses table definition (line 224)
- `vigil-core/src/routes/work-order-status.ts` — production route + dbSelectFn + dbUpsertFn (lines 64-83)
- `vigil-core/drizzle/` — new migration file needed (next in sequence after `0013_*.sql`)

**New components:**
- `vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql` — migration

**Modified components:**
- `vigil-core/src/db/schema.ts` — add `userId integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT` + `index("idx_work_order_statuses_user_id").on(table.userId)` + change primary key from bare `caseNumber` to composite or surrogate
- `vigil-core/src/routes/work-order-status.ts` — add `userId` parameter to `dbSelectFn` / `dbUpsertFn` signatures; update production implementations to filter by `c.get("userId")`; update `WorkOrderStatusDeps` interface

**Data flow (after fix):**
```
PUT /v1/work-orders/:caseNumber/status
  -> bearerAuth -> userId = c.get("userId")
  -> validate status in {open, inProgress, done}
  -> upsert(caseNumber, userId, status)     <- conflict on (userId, caseNumber)
  -> 200 { caseNumber, status }

GET /v1/work-orders/statuses
  -> bearerAuth -> userId = c.get("userId")
  -> SELECT WHERE userId = ?
  -> 200 { [caseNumber]: status, ... }
```

**Migration strategy — backfill decision:**
The `caseNumber` primary key is text (e.g. `INC0012345`). Case numbers are company-global, so the same caseNumber legitimately exists for different users. Because v3.4 backfilled all work_orders to the seed user, all existing work_order_statuses rows are also the seed user's. Safe migration plan:

```sql
-- Step 1: add nullable user_id
ALTER TABLE work_order_statuses ADD COLUMN IF NOT EXISTS user_id integer;

-- Step 2: backfill to seed user (same GUC pattern as 0012)
UPDATE work_order_statuses SET user_id = (
  SELECT id FROM users WHERE email = LOWER(COALESCE(
    current_setting('vigil.seed_email', true), 'jamesonmorrill1@gmail.com'
  )) LIMIT 1
) WHERE user_id IS NULL;

-- Step 3: NOT NULL + FK
ALTER TABLE work_order_statuses ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE work_order_statuses ADD CONSTRAINT wos_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_wos_user_id ON work_order_statuses (user_id);

-- Step 4: the existing caseNumber PRIMARY KEY becomes a per-user unique constraint
-- Drop old PK; add surrogate id PK; add composite unique index
ALTER TABLE work_order_statuses DROP CONSTRAINT IF EXISTS work_order_statuses_pkey;
ALTER TABLE work_order_statuses ADD COLUMN IF NOT EXISTS id serial;
ALTER TABLE work_order_statuses ADD CONSTRAINT work_order_statuses_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wos_user_case
  ON work_order_statuses (user_id, case_number);
```

v3.4 claim-flow interaction: a new user who claims an existing email gets the seed user's `work_orders` rows (via the seed-user backfill). Their `work_order_statuses` rows will also be seed-user-owned after migration. When they PUT a status, the upsert conflicts on `(userId, caseNumber)` not on `caseNumber` alone — no cross-user collision.

**Test strategy:** Add a case to `cross-user-isolation.test.ts` (existing file at `vigil-core/src/integration/cross-user-isolation.test.ts`). Pattern mirrors the `work-orders isolation` test at line 349: seed a `work_order_statuses` row for userA, verify userB's GET `/v1/work-orders/statuses` does not include it; verify userB's PUT cannot overwrite userA's status for the same caseNumber.

Also update `vigil-core/src/routes/work-order-status.test.ts` — the existing unit test passes fake deps; update `dbSelectFn` / `dbUpsertFn` signatures to accept userId.

---

### W-02: GET /v1/brief/:date PDF Bytes Cross-User Isolation Test

**Gap confirmed:** `cross-user-isolation.test.ts` (line 305) covers `GET /v1/briefs` (list). It does NOT cover `GET /v1/brief/:date` (PDF bytes from `brief-generate.ts`). The route at `vigil-core/src/routes/brief-generate.ts:158` already scopes the query by `userId`:
```typescript
.where(and(eq(briefs.userId, userId), eq(briefs.date, date)))
```
The test gap is coverage, not a real bug. But W-02 requires proof.

**Integration points:**
- `vigil-core/src/integration/cross-user-isolation.test.ts` — add new `it()` block

**New components:** none

**Modified components:**
- `vigil-core/src/integration/cross-user-isolation.test.ts` — add test

**Test pattern to add (extend the existing describe block at the end):**
```typescript
it("brief PDF isolation — GET /v1/brief/:date returns 404 when caller is not the owner", async (t) => {
  if (!DB_READY) { t.skip("DATABASE_URL required"); return; }
  const { db: d } = await import("../db/connection.js");
  const { briefs, briefPdfs } = await import("../db/schema.js");
  // userA owns a brief with known PDF bytes
  const [aBrief] = await d!.insert(briefs).values({
    userId: userA.id,
    date: "2099-11-01",
    summary: { test: "w02" },
    thoughtCount: 0, taskCount: 0,
  }).returning();
  await d!.insert(briefPdfs).values({
    briefId: aBrief.id,
    userId: userA.id,
    bytes: Buffer.from("fakepdf"),
    contentType: "application/pdf",
    byteLength: 7,
  });
  try {
    // userB requests userA's date -- must get 404, NOT 200 with userA's bytes
    const res = await get("/v1/brief/2099-11-01", tokenB);
    assert.equal(res.status, 404,
      "LEAK: GET /v1/brief/:date returned non-404 to non-owner — cross-user PDF bytes exposed");
    // Also verify owner can access own brief
    const ownRes = await get("/v1/brief/2099-11-01", tokenA);
    assert.equal(ownRes.status, 200,
      "REGRESSION: owner cannot access own brief PDF");
  } finally {
    await d!.delete(briefPdfs).where(eq(briefPdfs.briefId, aBrief.id));
    await d!.delete(briefs).where(eq(briefs.id, aBrief.id));
  }
});
```

---

### SCHED-01: Per-User Scheduler Fan-Out

**Entry point confirmed:** `vigil-core/src/services/generate-scheduler.ts`. The TODO at line 19 explicitly documents the seed-user lock. The scheduler runs as `setInterval(60s)` in-process in `vigil-core/src/index.ts` (lines 213-224). There is no Railway cron job — this is a self-scheduling in-process loop.

The `createGenerateScheduler` factory already accepts `(dateStr, userId)` for the `assemble` function — the internal plumbing supports per-user assembly. The constraint is in `tick()`: it resolves the seed user and hard-scopes everything to that one user.

**Integration points:**
- `vigil-core/src/services/generate-scheduler.ts` — tick() function (line 202) + getSeedUserId() (line 107)
- `vigil-core/src/db/schema.ts` — users table (need to query all users)
- `vigil-core/src/index.ts` — scheduler instantiation (lines 213-224); no changes needed here

**New components:** none

**Modified components:**
- `vigil-core/src/services/generate-scheduler.ts` — replace `getSeedUserId()` single-user resolve with `getAllUsersForScheduling()` multi-user iteration. Remove `resolvedSeedUserId` cached singleton. Add optional `getAllUsersFn` to `GenerateSchedulerDeps` interface.

**Data flow:**
```
tick() every 60s
  -> if db unavailable: log warn, return
  -> getAllUsersForScheduling():
       SELECT DISTINCT u.id, u.email FROM users u
       -- all registered users are candidates; each has their own schedule in app_settings
  -> for each user (sequential, not concurrent):
      -> getSettingViaDb("user_timezone", userId)
      -> getSettingViaDb("generate_schedule", userId)
      -> if schedule.enabled AND hour/minute match in user's TZ:
          -> getRecentBriefViaDb(date, userId)  -- dedupe check
          -> if NOT recently generated:
              try:
                -> assemble(dateStr, userId)
                -> upsertBriefViaDb({ userId, ... })
                -> log success for userId
              catch err:
                -> log error for userId, CONTINUE loop (do not abort)
          else: log dedupe skip for userId
      else: skip
```

**Concurrency decision: sequential, not concurrent.** Rationale:
1. Single Railway instance — no parallelism benefit from concurrent Promises; it just multiplies simultaneous Anthropic API calls in a burst window.
2. Error isolation: a try/catch per-user loop means one user's failure (expired OAuth token, no thoughts, Anthropic error) does not abort other users' generation.
3. At v3.6 user count (1-3 users), sequential processing of N users in a 60s window is trivially fast.

**Rate-limit mitigations:**
- Anthropic: sequential calls spaced by assembly time (~2-5s each). Fine at <20 users. If count grows, add `await new Promise(r => setTimeout(r, 1000))` between users.
- ESPN/sports: fetched inside brief-assembly-service per call. If sharing is needed later, cache the sports result at the top of tick() and pass it to each user's assembly. For now, sequential calls are fine.
- Google Calendar: per-user OAuth token — no sharing possible; sequential is correct.

**Test impact:** `vigil-core/src/services/generate-scheduler.test.ts` uses injected DI seams. Update to inject `getAllUsersFn` returning an array of `{id: number}`. Existing single-user test behavior preserved by passing a single-element array.

---

### AUTH-09: Change Password

**Integration points:**
- `vigil-core/src/routes/auth.ts` — add endpoint (existing Hono router; same file as register/login)
- `vigil-core/src/utils/password.ts` — `hashPassword` + `verifyPassword` (already imported and used in auth.ts)
- `vigil-pwa/src/api/client.ts` — add `changePassword(currentPassword, newPassword)` function
- `vigil-pwa/src/pages/SettingsPage.tsx` — add inline section in Vigil Account card

**New components:**
- Inline form section in `SettingsPage.tsx` within the existing "Vigil Account" `<section>` (lines 217-231). No new page, no new route. State: `[showChangePassword, setShowChangePassword]` + form fields.

**Modified components:**
- `vigil-core/src/routes/auth.ts` — add `auth.post("/auth/change-password", ...)`. This endpoint IS behind bearerAuth (index.ts:118-119 only skips register and login; `/auth/change-password` reaches bearerAuth correctly).
- `vigil-pwa/src/pages/SettingsPage.tsx` — add expandable inline change-password form
- `vigil-pwa/src/api/client.ts` — add `changePassword` function

**Endpoint shape:**
```
POST /v1/auth/change-password
Authorization: Bearer <jwt>
{ "currentPassword": "...", "newPassword": "..." }

200: { "message": "Password updated" }
400: { "error": "..." }   -- validation failure or new password too short/long
401: { "error": "Current password incorrect" }
```

**Require current password re-entry: yes.** Prevents session-hijack: an attacker with a stolen session token cannot silently change the password without knowing the old one.

**Data flow:**
```
POST /v1/auth/change-password
  -> bearerAuth -> userId = c.get("userId")
  -> parse body -> { currentPassword, newPassword }
  -> validate newPassword length (MIN_PASSWORD=12, MAX_PASSWORD=128 from existing constants)
  -> db.select users WHERE id = userId  (fetch current hash)
  -> verifyPassword(currentPassword, user.passwordHash)
  -> if fail -> 401 "Current password incorrect"
  -> hashPassword(newPassword) -> newHash
  -> db.update users SET password_hash = newHash, updated_at = now() WHERE id = userId
  -> 200 { message: "Password updated" }
```

**PWA placement:** The "Vigil Account" section in `SettingsPage.tsx` currently shows email + Sign out button (lines 217-231). Add an inline expandable form below the email line. Collapsed by default ("Change password" link text). Expands to current/new/confirm fields inline. This is consistent with the existing section-based UI and requires no modal or new route.

---

### AUTH-10: Forgot Password Flow

**This is the most architecturally novel feature in v3.6.** It introduces the first outbound email from Vigil.

**Data model decision — three options evaluated:**

**Option A: Dedicated `password_reset_tokens` table (RECOMMENDED)**
```typescript
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),  // SHA-256 of raw token
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),  // null = unused
  type: text("type").notNull().default("password_reset"),  // reused by AUTH-11
}, (table) => [
  uniqueIndex("uq_prt_token_hash").on(table.tokenHash),
  index("idx_prt_user_id").on(table.userId),
]);
```
Why recommended: explicit expiry, explicit used_at for single-use enforcement, auditable, easy to purge expired rows. The `type` column is added upfront so AUTH-11 reuses the same table (no second migration).

**Option B: Reuse `ai_cache` table (rejected)**
ai_cache has composite unique key `(userId, type)` — one row per user per type. A reset token needs: multiple tokens per user (rapid retries), expiry, usedAt. Cramming into ai_cache.result JSONB breaks the single-row-per-type invariant.

**Option C: Stateless signed JWT token (rejected)**
Cannot be single-use without server-side state (used_at requires a DB record). Blacklisting brings you back to a DB table. Reject.

**Integration points:**
- `vigil-core/src/db/schema.ts` — add `passwordResetTokens` table
- `vigil-core/drizzle/` — new migration `0015_password_reset_tokens.sql`
- `vigil-core/src/routes/auth.ts` — add two endpoints
- `vigil-core/src/services/email-service.ts` — NEW FILE
- `vigil-pwa/src/pages/ForgotPasswordPage.tsx` — NEW FILE
- `vigil-pwa/src/pages/ResetPasswordPage.tsx` — NEW FILE
- `vigil-pwa/src/api/client.ts` — add `forgotPassword` + `resetPassword`
- `vigil-pwa/src/App.tsx` — add two public routes

**Email service — new file `vigil-core/src/services/email-service.ts`:**

Follows the DI pattern from `me.ts` (MeDeps interface), `process-photo.ts` (ProcessPhotoDeps), etc.:

```typescript
// vigil-core/src/services/email-service.ts

export interface EmailDeps {
  sendFn: (to: string, subject: string, html: string) => Promise<void>
}

export interface EmailService {
  sendPasswordReset(to: string, resetUrl: string): Promise<void>
  sendEmailVerification(to: string, verifyUrl: string): Promise<void>  // reused by AUTH-11
}

export function createEmailService(deps: EmailDeps): EmailService {
  return {
    async sendPasswordReset(to, resetUrl) {
      await deps.sendFn(
        to,
        "Reset your Vigil password",
        `<p>Click to reset your password (expires in 1 hour):</p>
         <a href="${resetUrl}">${resetUrl}</a>
         <p>If you did not request this, ignore this email.</p>`
      );
    },
    async sendEmailVerification(to, verifyUrl) {
      await deps.sendFn(
        to,
        "Verify your Vigil email",
        `<p>Click to verify your email address:</p>
         <a href="${verifyUrl}">${verifyUrl}</a>`
      );
    },
  }
}

// Production singleton wired to Resend
import { Resend } from 'resend';
const client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export const emailService = createEmailService({
  sendFn: async (to, subject, html) => {
    if (!client) throw new Error("Email service not configured (RESEND_API_KEY unset)");
    await client.emails.send({
      from: process.env.EMAIL_FROM ?? 'noreply@vigilhub.io',
      to, subject, html,
    });
  },
});
```

**Email provider env vars — cross-cutting concern:**
```
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@vigilhub.io
PWA_BASE_URL=https://app.vigilhub.io
```
Pattern: identical to ANTHROPIC_API_KEY / POSTHOG_API_KEY. Set in Railway project variables panel. Added to `vigil-core/.env.example` as commented-out examples. Startup check in `index.ts`: warn (not FATAL) if `RESEND_API_KEY` or `EMAIL_FROM` unset — server still boots, email endpoints return 503 if provider not configured.

**Email provider recommendation: Resend** (resend.com). Simple Node SDK (`npm install resend`), generous free tier (3000 emails/month), HTTP API (no SMTP port issues on Railway), no complex DKIM/SPF setup for known-sender domain.

**Modified components:**
- `vigil-core/src/routes/auth.ts` — add two PUBLIC endpoints (forgot-password, reset-password)
- `vigil-core/src/index.ts` — add path exceptions for `/v1/auth/forgot-password` and `/v1/auth/reset-password` in the bearerAuth skip block (lines 115-120), matching the pattern at line 118-119
- `vigil-pwa/src/App.tsx` — add routes `/forgot-password` and `/reset-password` OUTSIDE the `isAuthenticated` guard (must be reachable while logged out)
- `vigil-pwa/src/api/client.ts` — add `forgotPassword` + `resetPassword`

**Endpoint shapes:**
```
POST /v1/auth/forgot-password   (PUBLIC -- no bearer)
{ "email": "user@example.com" }
-> 200 { "message": "If that email is registered, you will receive a link." }
   (enumeration-safe: always 200 regardless of whether email exists)
   Internal: lookup user by email -> if found:
     generate crypto.randomBytes(32).toString("hex") -> rawToken
     SHA-256(rawToken) -> tokenHash
     INSERT password_reset_tokens(userId, tokenHash, expiresAt=now+1h, type='password_reset')
     emailService.sendPasswordReset(user.email, `${PWA_BASE_URL}/reset-password?token=${rawToken}`)

POST /v1/auth/reset-password    (PUBLIC -- no bearer)
{ "token": "<rawToken>", "newPassword": "..." }
-> 200 { "message": "Password updated. Please log in." }
-> 400 { "error": "Invalid or expired token" }
   Internal: SHA-256(token) -> tokenHash
   SELECT FROM password_reset_tokens WHERE tokenHash = ? AND expiresAt > now() AND usedAt IS NULL
     AND type = 'password_reset'
   -> if not found -> 400 "Invalid or expired token"
   -> hashPassword(newPassword) -> newHash
   -> UPDATE users SET password_hash = newHash, updated_at = now() WHERE id = row.userId
   -> UPDATE password_reset_tokens SET used_at = now() WHERE id = row.id
   -> 200 { message: "Password updated. Please log in." }
```

**Data flow (forgot-password):**
```
POST /v1/auth/forgot-password
  -> parse email
  -> timing-safe: always 200 (lookup happens but result not reflected in response shape)
  -> if user found in DB:
      -> rawToken = crypto.randomBytes(32).toString("hex")
      -> tokenHash = SHA-256(rawToken)
      -> INSERT password_reset_tokens (userId, tokenHash, expiresAt=now+1h)
      -> try: emailService.sendPasswordReset(email, resetUrl)
         catch: log error (do not expose in response)
  -> 200 { message: "..." }
```

**PWA pages:**
- `/forgot-password` — single email input + submit. After submit shows static "Check your email" message. Link back to `/auth`. Rendered OUTSIDE `isAuthenticated` guard.
- `/reset-password?token=<token>` — new password + confirm inputs. Reads token from `useSearchParams()`. On success redirect to `/auth?password_reset=true`. On error show error + link to `/forgot-password`.

Both pages added to `App.tsx` as additional `<Route>` entries in the section before or alongside the `<Route path="/auth">` block.

---

### AUTH-11: Email Verify Flow

**Data model decision:**

**Option A: `emailVerifiedAt TIMESTAMP WITH TIME ZONE` column on users (RECOMMENDED)**
Add nullable `emailVerifiedAt` to `users`. `NULL` = unverified. Timestamp gives "when verified" for free. Single-table lookup. No join needed.

**Option B: Separate `email_verifications` table (rejected)**
Overkill. Email verification is one-time state per user. A column is sufficient.

**Option C: Enum column (rejected)**
Less clean; loses "when verified" metadata.

**Token storage:** Reuse `password_reset_tokens` table with `type = 'email_verify'`. The `type` column is added when the table is created (AUTH-10 migration), so AUTH-11 requires no additional migration for the tokens table — only the `emailVerifiedAt` column on `users` needs its own migration.

**Gating strategy: banner + non-blocking.** Do NOT block any features on `emailVerifiedAt`. Blocking is high-friction and risks breaking the seed user's claim-flow. Instead: show an unobtrusive banner in the PWA if `emailVerifiedAt IS NULL`, with a "Resend verification" button. All endpoints continue working for unverified users.

**Integration points:**
- `vigil-core/src/db/schema.ts` — add `emailVerifiedAt` nullable column to `users`
- `vigil-core/drizzle/` — new migration `0016_email_verified_at.sql`
- `vigil-core/src/routes/auth.ts` — amend `POST /v1/auth/register` + add two new endpoints
- `vigil-core/src/services/email-service.ts` — `sendEmailVerification` method (already in plan)
- `vigil-core/src/routes/me.ts` — extend `userLookupFn` return type + response to include `emailVerifiedAt`
- `vigil-pwa/src/pages/SettingsPage.tsx` — verification status banner in Vigil Account section
- `vigil-pwa/src/api/client.ts` — add `resendVerificationEmail()`
- `vigil-core/src/index.ts` — add path exception for `GET /v1/auth/verify-email/` prefix

**Modified components:**
- `vigil-core/src/routes/auth.ts` — add two endpoints:
  1. `POST /v1/auth/send-verify-email` — behind bearerAuth (user must be logged in). Rate limited: 1 send per 60s per userId (simple in-memory `Map<number, number>` of lastSentAt, consistent with existing in-memory rate limiter).
  2. `GET /v1/auth/verify-email/:token` — PUBLIC (link click from email, no bearer available).
- `vigil-core/src/routes/auth.ts` — amend `POST /v1/auth/register`: after successful INSERT, fire-and-forget `emailService.sendEmailVerification(...)`. Wrap in try/catch — email failure must not block registration response.
- `vigil-core/src/routes/me.ts` — extend `userLookupFn` to select `emailVerifiedAt`; extend response shape to include `emailVerifiedAt: string | null`
- `vigil-pwa/src/pages/SettingsPage.tsx` — banner in Vigil Account section: if `emailVerifiedAt` is null → show "Please verify your email. [Resend]" banner with resend button

**Endpoint shapes:**
```
POST /v1/auth/send-verify-email   (bearer required -- user is logged in)
-> 200 { "message": "Verification email sent" }
-> 400 { "error": "Email already verified" }
-> 429 { "error": "Too many requests. Try again in 60 seconds." }
   Internal: check emailVerifiedAt on users row for userId
   -> if already verified -> 400
   -> check in-memory rate limit map for userId
   -> generate rawToken, tokenHash, INSERT password_reset_tokens(type='email_verify', expiresAt=now+24h)
   -> emailService.sendEmailVerification(user.email, `${PWA_BASE_URL}/verify-email?token=${rawToken}`)

GET /v1/auth/verify-email/:token  (PUBLIC -- link click from email)
-> 302 redirect to ${PWA_BASE_URL}/auth?email_verified=true
-> 400 { "error": "Invalid or expired token" }
   Internal: SHA-256(token) -> tokenHash
   SELECT FROM password_reset_tokens WHERE tokenHash=? AND type='email_verify'
     AND expiresAt > now() AND usedAt IS NULL
   -> if not found -> 400
   -> UPDATE users SET email_verified_at = now() WHERE id = row.userId
   -> UPDATE password_reset_tokens SET used_at = now() WHERE id = row.id
   -> redirect/200
```

**Data flow (verify email):**
```
Register:
  POST /v1/auth/register
    -> existing register logic (hash pw, insert user)
    -> [NEW] fire-and-forget:
         rawToken = crypto.randomBytes(32).toString("hex")
         tokenHash = SHA-256(rawToken)
         INSERT password_reset_tokens(userId, tokenHash, expiresAt=now+24h, type='email_verify')
         emailService.sendEmailVerification(email, `${PWA_BASE_URL}/verify-email?token=${rawToken}`)
    -> 201 { id, email }  (unchanged from current)

Verify:
  GET /v1/auth/verify-email/:token  (public link)
    -> SHA-256(token) -> tokenHash
    -> lookup in password_reset_tokens (type='email_verify', not expired, not used)
    -> UPDATE users SET email_verified_at = now()
    -> UPDATE token SET used_at = now()
    -> redirect to ${PWA_BASE_URL}/auth?email_verified=true

PWA banner (GET /v1/me response):
  me.ts now returns { userId, email, emailVerifiedAt: string | null }
  App.tsx uses /v1/me on mount -> already called
  SettingsPage Vigil Account section: if emailVerifiedAt == null -> show banner
```

---

### EXT-02: Safari Extension Quick-Capture Parity

**Current state confirmed by reading actual files:**

**Chrome extension** (`vigil-extension/`):
- `manifest.json` — MV3, permissions: `activeTab, storage`, host_permissions for `api.vigilhub.io`
- `popup.js` — freeform text textarea, URL checkbox, Cmd+Enter submit, triage polling (5s max, 800ms interval), category badge display, `chrome.tabs.query` for URL, `chrome.storage.local` for API key
- `popup.html` — has `id="include-url"` checkbox, `id="success-text"` span, `class="shortcut-hint"` div

**Safari extension** (`vigil-safari-extension/Vigil Capture Extension/Resources/`):
- `manifest.json` — IDENTICAL to Chrome
- `popup.html` — MISSING: URL checkbox, MISSING: `success-text` span (has static "Captured!" text), MISSING: `shortcut-hint` div
- `popup.js` — MISSING: URL checkbox logic, MISSING: Cmd+Enter handler, MISSING: triage polling loop, MISSING: category badge display. Has auto-prefill of title+URL into textarea on open (Phase 93 behavior, replaced by Phase 94's empty-start UX). Uses `chrome.storage.local` correctly.
- `popup.css` — identical content to Chrome; no changes needed

**The Safari extension already uses `chrome.*` namespace** (e.g., `chrome.storage.local.get`, `chrome.tabs.query`). Safari 14+ supports the WebExtension `chrome.*` compatibility layer. No namespace changes needed.

**Surgical delta — minimum changes:**

1. `vigil-safari-extension/Vigil Capture Extension/Resources/popup.html`:
   - Add URL checkbox after textarea, before capture button:
     `<label class="url-toggle"><input type="checkbox" id="include-url"> Include page URL</label>`
   - Add shortcut hint after capture button:
     `<div class="shortcut-hint">Cmd+Enter to capture</div>`
   - Change static success div to dynamic:
     `<div id="capture-success" class="success-msg" hidden><span id="success-text"></span></div>`
   - Add DOM reference: `const includeUrlCheckbox = document.getElementById('include-url')` and `const successText = document.getElementById('success-text')` to the DOM references section at the top of popup.js

2. `vigil-safari-extension/Vigil Capture Extension/Resources/popup.js`:
   - Add `includeUrlCheckbox` and `successText` to DOM references (top of file)
   - Replace the `initCaptureView` function with the Chrome Phase 94 version:
     - Remove auto-prefill of tab title+URL into textarea (Phase 93 behavior)
     - Start with empty textarea + focus
     - Add Cmd+Enter handler via `contentInput.addEventListener('keydown', ...)`
     - Add URL checkbox append logic in capture handler
     - Add triage polling loop (800ms interval, 5s max timeout, `clearInterval` on success/timeout)
     - Update `captureSuccess.hidden = false` to also set `successText.innerHTML = '<span class="analyzing">Analyzing...</span>'` and then the category badge on poll success

**Not needed:**
- `SafariWebExtensionHandler.swift` — the native message handler is boilerplate; the extension makes direct HTTP fetch calls and does not use `browser.runtime.sendNativeMessage()`. No changes.
- `manifest.json` — already identical to Chrome. No changes.
- `popup.css` — already identical to Chrome. Both files have `.url-toggle`, `.category-badge`, `.shortcut-hint`, `.analyzing` styles. No changes.
- Xcode project settings — bundle ID and entitlements are for the container app, not the web extension JS. No changes needed for the JS delta.

**Build requirement:** After changing Resources files, Xcode must re-build the Swift app container to package the updated extension resources. UAT requires: install updated `.app`, enable extension in Safari Preferences, reload a tab, open popup, test all 4 features (freeform text, URL checkbox, Cmd+Enter, category badge).

---

## Build Order Recommendation

### Dependency graph

```
W-01 (work_order_statuses userId migration + route fix)
  |-> W-01 test (cross-user-isolation + unit test update)
  -- independent of all auth features

W-02 (brief PDF isolation test)
  -- independent (add to existing test file; no code changes)

SCHED-01 (per-user scheduler fan-out)
  -- independent of auth features at code level
  -- suggested Wave 1 or Wave 4 (no blocking dependency)

AUTH-09 (change password)
  -- independent (no email, no new table)

email-service foundation (NEW -- precondition for AUTH-10 + AUTH-11)
  -- blocks AUTH-10 and AUTH-11

AUTH-10 (forgot password)
  |-> needs email-service foundation
  |-> needs password_reset_tokens table migration (0015)

AUTH-11 (email verify)
  |-> needs email-service foundation
  |-> needs password_reset_tokens type column (same 0015 migration as AUTH-10)
  |-> needs emailVerifiedAt column migration (0016)
  -- AUTH-11 can share the 0015 migration with AUTH-10 if built in same phase

EXT-02 (Safari quick-capture parity)
  -- fully independent of all above
```

### Recommended phase order

**Wave 1 (parallel-safe, no cross-dependencies):**
- Phase A: W-01 + W-02 together
  - migration 0014, schema.ts update, work-order-status.ts route fix, cross-user-isolation.test.ts addition, unit test update
- Phase B: AUTH-09 (change password)
  - auth.ts endpoint, SettingsPage.tsx inline form, client.ts function
- Phase C: EXT-02 (Safari extension)
  - popup.html + popup.js delta, Xcode rebuild, UAT

**Wave 2 (email foundation — unblocks Wave 3):**
- Phase D: Email service + env setup
  - email-service.ts, npm install resend, env vars in Railway + .env.example, startup warnings in index.ts, doctor.sh check

**Wave 3 (parallel-safe after Wave 2):**
- Phase E: AUTH-10 (forgot password)
  - migration 0015 (password_reset_tokens with type column), auth.ts endpoints x2, index.ts path exceptions, ForgotPasswordPage.tsx + ResetPasswordPage.tsx, App.tsx routes, client.ts functions
- Phase F: AUTH-11 (email verify)
  - migration 0016 (emailVerifiedAt on users), auth.ts endpoints x2 + register amendment, index.ts path exception, me.ts response extension, SettingsPage.tsx banner, client.ts function

**Wave 4 (no dependency; can be Wave 1 if preferred):**
- Phase G: SCHED-01 (per-user scheduler fan-out)
  - generate-scheduler.ts tick() refactor, test update

**Rationale:**
1. W-01 + W-02 are the highest-value items with lowest risk — they close the multi-user loop v3.4 explicitly deferred. Doing them first ensures the isolation story is complete before adding more users.
2. AUTH-09 has zero new infrastructure — it reuses existing argon2id + users table. Fast win that completes the profile page.
3. EXT-02 has no server dependency; it's purely a Safari extension change. Completely parallel with server work.
4. Email service (Wave 2) must precede AUTH-10 and AUTH-11. It is a shared foundation that takes one focused build.
5. AUTH-10 and AUTH-11 can be built concurrently in Wave 3 by the same person sequentially or conceptually in parallel — they share the password_reset_tokens table (created in AUTH-10's migration) but their endpoints and PWA pages are in separate code areas. The one coordination point: create the `type` column in the 0015 migration (AUTH-10) so AUTH-11 does not need an additional migration for it.
6. SCHED-01 has no inter-feature dependencies and can slot anywhere. Wave 1 makes sense if the developer wants to knock out all multi-user items together; Wave 4 makes sense if the auth flow work is the priority.

---

## Component Inventory: New vs Modified

### New files

| File | Feature |
|------|---------|
| `vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql` | W-01 |
| `vigil-core/drizzle/0015_password_reset_tokens.sql` | AUTH-10 (+ AUTH-11 type column) |
| `vigil-core/drizzle/0016_email_verified_at.sql` | AUTH-11 |
| `vigil-core/src/services/email-service.ts` | AUTH-10 + AUTH-11 shared |
| `vigil-pwa/src/pages/ForgotPasswordPage.tsx` | AUTH-10 |
| `vigil-pwa/src/pages/ResetPasswordPage.tsx` | AUTH-10 |

### Modified files

| File | Feature | Nature of change |
|------|---------|-----------------|
| `vigil-core/src/db/schema.ts` | W-01 | add userId + index to workOrderStatuses; new PK strategy |
| `vigil-core/src/db/schema.ts` | AUTH-10 | add passwordResetTokens table definition |
| `vigil-core/src/db/schema.ts` | AUTH-11 | add emailVerifiedAt to users; add type to passwordResetTokens |
| `vigil-core/src/routes/work-order-status.ts` | W-01 | dbSelectFn + dbUpsertFn accept userId; production impls filter by userId |
| `vigil-core/src/routes/auth.ts` | AUTH-09 | add change-password endpoint |
| `vigil-core/src/routes/auth.ts` | AUTH-10 | add forgot-password + reset-password endpoints |
| `vigil-core/src/routes/auth.ts` | AUTH-11 | add send-verify-email endpoint; amend register to fire verification email |
| `vigil-core/src/routes/me.ts` | AUTH-11 | extend userLookupFn + response to include emailVerifiedAt |
| `vigil-core/src/index.ts` | AUTH-10 | add path exceptions: forgot-password, reset-password |
| `vigil-core/src/index.ts` | AUTH-11 | add path exception: verify-email prefix |
| `vigil-core/src/services/generate-scheduler.ts` | SCHED-01 | replace getSeedUserId with getAllUsersForScheduling; sequential per-user loop in tick() |
| `vigil-core/src/integration/cross-user-isolation.test.ts` | W-02 | add brief PDF isolation test |
| `vigil-core/src/integration/cross-user-isolation.test.ts` | W-01 | add work_order_statuses isolation test |
| `vigil-core/src/routes/work-order-status.test.ts` | W-01 | update fake deps signatures for userId |
| `vigil-core/src/services/generate-scheduler.test.ts` | SCHED-01 | update for multi-user DI injection |
| `vigil-pwa/src/App.tsx` | AUTH-10 | add /forgot-password + /reset-password routes outside auth guard |
| `vigil-pwa/src/App.tsx` | AUTH-11 | add /verify-email route outside auth guard (or handle via query param on /auth) |
| `vigil-pwa/src/api/client.ts` | AUTH-09 | add changePassword() |
| `vigil-pwa/src/api/client.ts` | AUTH-10 | add forgotPassword() + resetPassword() |
| `vigil-pwa/src/api/client.ts` | AUTH-11 | add resendVerificationEmail() |
| `vigil-pwa/src/pages/SettingsPage.tsx` | AUTH-09 | add inline change-password form section |
| `vigil-pwa/src/pages/SettingsPage.tsx` | AUTH-11 | add emailVerifiedAt banner + resend button |
| `vigil-safari-extension/.../Resources/popup.html` | EXT-02 | add URL checkbox + shortcut hint + dynamic success span |
| `vigil-safari-extension/.../Resources/popup.js` | EXT-02 | replace initCaptureView with Phase 94 Chrome version; add DOM refs |

---

## Sources

All findings derived from live codebase reads:
- `vigil-core/src/db/schema.ts` lines 224-228 — W-01 gap confirmed
- `vigil-core/src/routes/work-order-status.ts` lines 64-83 — W-01 bare select confirmed
- `vigil-core/src/services/generate-scheduler.ts` lines 19, 107-122 — SCHED-01 TODO + seed-user lock confirmed
- `vigil-core/src/integration/cross-user-isolation.test.ts` — W-02 gap confirmed (briefs list covered, PDF bytes endpoint not)
- `vigil-core/src/routes/brief-generate.ts` line 158 — W-02 already scoped; gap is coverage only
- `vigil-core/src/routes/auth.ts` — AUTH-09/10/11 extension points; bearerAuth exemption pattern at index.ts:118-119
- `vigil-pwa/src/pages/SettingsPage.tsx` lines 217-231 — AUTH-09 placement confirmed
- `vigil-pwa/src/App.tsx` — route structure; public vs authenticated guard confirmed
- `vigil-safari-extension/.../Resources/popup.js` — EXT-02 missing features confirmed
- `vigil-safari-extension/.../Resources/popup.html` — EXT-02 missing DOM elements confirmed
- `vigil-extension/popup.js` + `popup.html` — Chrome Phase 94 reference implementation confirmed

---
*Architecture research for: Vigil v3.6 Multi-User Completion, Auth UX & Safari Parity*
*Researched: 2026-04-22*
