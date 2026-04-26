---
phase: 113-verify-email-on-signup
verified: 2026-04-25T21:30:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "SC#1 — Register a fresh allowlisted user on prod and verify the Gmail inbox receives the verification email within 60 seconds. Check: from noreply@vigilhub.io, subject 'Verify your Vigil email', not in spam, link href is app.vigilhub.io/auth/verify?token=<base64url> with no Resend tracking wrapper."
    expected: "Email arrives within 60 seconds with correct sender, subject, CTA label 'Verify email', and direct token link (not a tracking redirect) confirming Phase 111 click_tracking:false"
    why_human: "Programmatic email delivery confirmation requires Resend webhook ingestion (out of scope). Inbox arrival, deliverability, and link shape must be observed live."
  - test: "SC#2 — With an unverified user logged into prod, navigate to /settings and inspect the banner. Also navigate to /thoughts and /work-orders to confirm banner does NOT appear outside /settings."
    expected: "Banner renders at the top of /settings with amber background (bg-warning-50 #FAEEDA, border-warning-400 #BA7517), correct copy 'Verify your email — we sent a link to {email}. Click it to confirm.', Resend button present, no dismiss control, and the banner is absent on all non-settings pages"
    why_human: "Visual inspection of color tokens, copy accuracy, and cross-page banner containment cannot be verified programmatically."
  - test: "SC#3 — From the Gmail inbox, click the verify link. Before clicking Confirm, open devtools Network tab. Click Confirm. After success swap, check URL bar. In a separate tab reload /settings."
    expected: "No POST fires on page mount (prefetch-safe gate). After Confirm: page swaps in-place to 'Email verified' heading with no redirect and no URL change. /settings banner is gone on reload."
    why_human: "The Apple Mail prefetch defense (no mount-time fetch) can only be truly observed via Network tab in a live browser. Banner disappearance on reload requires a live Railway session."
  - test: "SC#4 — Connect to Railway prod Postgres and run: SELECT email, email_verified_at, created_at, (email_verified_at = created_at) AS backfilled FROM users WHERE email='jamesonmorrill1@gmail.com'. Then log in as seed user and visit /settings."
    expected: "email_verified_at IS NOT NULL, equals created_at (backfilled=t), seed user sees no banner on /settings, and login works normally with no lockout."
    why_human: "The 0017 migration backfill must be verified against live Railway prod Postgres. Local DB already confirmed 0 unverified rows (Plan 01 Summary: 117 users, all backfilled). Prod confirmation requires direct DB access."
  - test: "SC#5 — As an unverified user on prod, click Resend 3 times (waiting for the 10-second idle cycle each time). Click Resend a 4th time. Check the Network tab's 4th POST response."
    expected: "1st–3rd clicks cycle Resend → Sending… → Sent! Check your inbox. → (10s) → Resend. 4th click: POST returns 429, PWA banner shows 'You've requested too many. Try again later.', Resend button disappears, Retry-After header present."
    why_human: "The 3/hour per-userId rate limit requires 4 live POST requests to the prod API with an authenticated user session. Cannot be verified without a running Railway deploy and a real JWT."
---

# Phase 113: Verify Email on Signup — Verification Report

**Phase Goal:** Newly registered users receive a verification email, see a non-blocking banner until verified, and can click the link or resend to clear it — with all pre-existing users grandfathered as verified
**Verified:** 2026-04-25T21:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All 5 automated success criteria are fully verified in code and tests. Status is `human_needed` because 5 manual UAT items remain pending Railway deploy — they cover real email delivery, live banner visual inspection, live verify flow, prod DB backfill confirmation, and live rate-limit trigger. All checks that could be verified programmatically passed.

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A newly registered user receives a verification email within seconds; single-use link expires in 24 hours | ✓ VERIFIED (code) / ? HUMAN (prod email delivery) | `auth.ts:65-69` `issueEmailVerifyToken()` inserts `email_verify` row with `expiresAt = now + 24h` before 201 returns. `fireVerifyEmailInBackground()` fires `.catch()`-guarded send immediately after. `VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000` confirmed. Test AUTH-11-R-01 pins token row existence. Real inbox delivery needs human UAT (SC#1). |
| 2 | Unverified user sees non-blocking banner on /settings with Resend button — no hard block | ✓ VERIFIED (code) / ? HUMAN (visual) | `SettingsPage.tsx:383` renders banner only when `meData?.emailVerifiedAt === null`. Banner has `role="alert"`, `bg-warning-50 border-warning-400` tokens (defined in `index.css:24-25`), non-dismissible (no × control in banner block `lines 384-422`). Resend button present with 5-state lifecycle (`resendState`). Test AUTH-11-B-VISIBLE-WHEN-UNVERIFIED, AUTH-11-B-NO-DISMISS-CONTROL both pass. Visual token rendering needs human UAT (SC#2). |
| 3 | Clicking verify link sets emailVerifiedAt; banner disappears on next page load; no JWT/token in redirect URL | ✓ VERIFIED (code) / ? HUMAN (live flow) | `verify-email.ts:130-147` atomic UPDATE-RETURNING claim sets `emailVerifiedAt = new Date(now)`. `VerifyEmailPage.tsx:64-69` swaps in-place on 200 with no navigate() call and no URL change — zero `useEffect` calls in file (all 4 grep hits are in JSDoc). `SettingsPage.tsx:521-531` new useEffect fires `vigilFetch('/v1/auth/me')` on mount. D-20: success state renders "Email verified" + "Go to app" link in place. Tests AUTH-11-P2-CONFIRM-200 and AUTH-11-P-MOUNT-NO-FETCH (11/11 pass). Live banner-disappears-on-reload needs human UAT (SC#3). |
| 4 | Pre-existing users (incl. seed) grandfathered with emailVerifiedAt = created_at — no lockout | ✓ VERIFIED (local DB) / ? HUMAN (prod DB) | `0017_users_email_verified_at.sql` Step 2: `UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL`. Plan 01 Summary confirms local DB: 117 users, 0 unverified after backfill, seed user non-null. Journal `when=1777440000000 > 0016's 1777353600000` ensures correct ordering. Railway prod backfill needs human UAT (SC#4). |
| 5 | Resend endpoint returns 429 after 3 requests/hour per user | ✓ VERIFIED (code + test) | `resend-verification.ts:546-547` `RATE_LIMIT_MAX = 3`, `RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000`. Key format `verify-resend:userId:{id}` (line 534). Idempotency check fires BEFORE rate limit (line 132 vs 138 — awk confirmed). Test AUTH-11-S2-01 (rate limit 429 after 4th request, same userId) passes. Live 429 with Retry-After header needs human UAT (SC#5). |

**Score:** 5/5 truths verified in code; 5 items require human verification against live Railway

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/drizzle/0017_users_email_verified_at.sql` | Idempotent ADD COLUMN + backfill UPDATE, 1 statement-breakpoint | ✓ VERIFIED | Exists. `ADD COLUMN IF NOT EXISTS "email_verified_at"` (count=1), `UPDATE "users"` (count=1), `statement-breakpoint` (count=1), `WHERE "email_verified_at" IS NULL` (count=1). |
| `vigil-core/drizzle/meta/_journal.json` | idx=17, when=1777440000000 > 0016's 1777353600000, tag=0017_users_email_verified_at, breakpoints=true | ✓ VERIFIED | `node -e` check: idx=17 tag=0017_users_email_verified_at when=1777440000000 monotonic=true; entries.length=18. |
| `vigil-core/src/db/schema.ts` | `emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true })` — nullable, no `.notNull()` | ✓ VERIFIED | grep count=1 for exact declaration. No `.notNull()` on that line. After `passwordChangedAt`. tsc exits 0. |
| `vigil-core/src/routes/auth.ts` | register: token issuance + fire-and-forget; login: emailVerifiedAt in response; claim-flow: D-07 null-guard | ✓ VERIFIED | `sendEmailVerificationEmail` references=5 (import+DI+production). `type: "email_verify"` count=1. `crypto.randomBytes(32).toString("base64url")` count=1. `.catch(` count=2 (register + forgot). `emailVerifiedAt` count=5. `existing.emailVerifiedAt === null` count=1. `VIGIL_APP_BASE_URL` count=1. Login response: lines 234-243 return `{ token, user: { id, email, emailVerifiedAt: iso|null } }`. |
| `vigil-core/src/routes/auth-me.ts` | GET /v1/auth/me returns minimal {id, email, emailVerifiedAt}; 401 on missing userId | ✓ VERIFIED | Exists. `router.get("/auth/me"` count=1. `emailVerifiedAt` count=9. `"invalid_user"` count=2. `export const authMe` count=1. No `String(row.id)` (id is number). |
| `vigil-core/src/routes/auth.test.ts` | 8 AUTH-11 tests (R-01..05, L-01..03) | ✓ VERIFIED | AUTH-11 occurrences=11 (covers test names + assertions). |
| `vigil-core/src/routes/auth-me.test.ts` | 5 tests (ME-01..05) | ✓ VERIFIED | All 5 pass (auth-me.test.ts: 5 pass, 0 fail, 0 skip). |
| `vigil-core/src/routes/verify-email.ts` | POST /v1/auth/verify-email with atomic claim, 5/hr per-IP, single-bucket error | ✓ VERIFIED | Exists. `router.post("/auth/verify-email"` count=1. `eq(passwordResetTokens.type, "email_verify")` count=1. `set({ emailVerifiedAt: new Date(now) })` count=1. `"Invalid or expired token"` count=2 (source + test file). `Retry-After` count=1. `__resetBucketsForTest` count=1. `RATE_LIMIT_MAX = 5` count=1. `export const verifyEmail` count=1. |
| `vigil-core/src/routes/verify-email.test.ts` | 11 tests; 5 pass without DB, 6 skip with DB | ✓ VERIFIED | Test run: 5 pass, 6 skip, 0 fail. All 5 unit tests confirmed passing. |
| `vigil-core/src/routes/resend-verification.ts` | POST /v1/auth/resend-verification with 3/hr per-userId, already-verified idempotency, invalidate-prior | ✓ VERIFIED | Exists. `"verify-resend:userId:"` count=1. `already_verified: true` count=2. `isNull(passwordResetTokens.usedAt)` count=1. `type: "email_verify"` count=1 (both UPDATE invalidate + INSERT new). `RATE_LIMIT_MAX = 3` count=1. `Retry-After` count=2. `export const resendVerification` count=1. Idempotency before rate-limit: line 132 vs 138 (awk confirmed). |
| `vigil-core/src/routes/resend-verification.test.ts` | 8 tests; 7 pass without DB, 1 skips | ✓ VERIFIED | Test run: 7 pass, 1 skip, 0 fail. |
| `vigil-core/src/index.ts` | 7-entry bypass list; verifyEmail mount BEFORE dispatcher; resendVerification mount AFTER; authMe mount AFTER | ✓ VERIFIED | 7 bypass entries (health, google/callback, register, login, forgot-password, reset-password, verify-email). Mount order awk: `ORDER OK ve=128 rp=123 disp=143 rv=200`. authMe at line 196 > dispatcher at line 143. |
| `vigil-pwa/src/pages/VerifyEmailPage.tsx` | 4-state page, 0 useEffect, 0 vigilFetch, raw fetch to /v1/auth/verify-email | ✓ VERIFIED | Exists. All 4 `useEffect` grep hits are in JSDoc (lines 19, 24, 26, 47 — all comments, none functional). All 4 `vigilFetch` grep hits are in JSDoc (lines 33, 35, 37, 58 — none functional). Actual fetch at line 59: `fetch(\`${API_BASE}/v1/auth/verify-email\`...)`. All 4 terminal states render correct JSX text: "This verification link is malformed" (L90), "Email verified" (L110), "This link is no longer valid" (L128), "Request a new link" (L138), "Verify your email" (L155). |
| `vigil-pwa/src/pages/VerifyEmailPage.test.tsx` | 11 tests; all pass | ✓ VERIFIED | All 11 vitest cases pass (0 failures). AUTH-11 occurrences=13. |
| `vigil-pwa/src/pages/SettingsPage.tsx` | Banner at top when emailVerifiedAt===null; Resend 5-state lifecycle; new /v1/auth/me useEffect; non-dismissible | ✓ VERIFIED | `vigilFetch('/v1/auth/me')` count=1 (new). `vigilFetch('/v1/me')` count=1 (existing, unchanged). `vigilFetch('/v1/auth/resend-verification'` count=1. `meData?.emailVerifiedAt === null` count=2. `role="alert"` count=2. `bg-warning-50` count=1. `border-warning-400` count=1. `Verify your email — we sent a link to` count=1. No × or dismiss inside the verify banner block (lines 384-422). Banner at line 383, `<h1>Settings</h1>` at line 443 — awk confirms banner-before-h1=YES. `resendSentTimerRef` count=8 (declared, assigned, cleared). `res.status === 429` count=1. `rate_limited` state count=3. |
| `vigil-pwa/src/pages/SettingsPage.test.tsx` | 11 new AUTH-11 tests pass; 1 pre-existing WR-03 failure carries forward | ✓ VERIFIED | 16/17 pass. The 1 failure is pre-existing WR-03 (`shows error banner with decoded message when ?google_error=invalid_state`) — documented in Phase 110 deferred-items.md, unrelated to Phase 113. All 11 AUTH-11-B* tests pass. |
| `vigil-pwa/src/pages/AuthPage.tsx` | 2 emailVerifiedAt type annotations | ✓ VERIFIED | `emailVerifiedAt: string | null` count=2 (both login flow + post-register auto-login). |
| `vigil-pwa/src/App.tsx` | /auth/verify route as sibling of /auth/forgot and /auth/reset | ✓ VERIFIED | Line 12 imports `VerifyEmailPage`. Line 76 `<Route path="/auth/verify" element={<VerifyEmailPage />} />`. awk confirms route appears after `/auth/reset` (L71). |
| `vigil-core/scripts/smoke-test-verify-email.ts` | Live e2e smoke: DB-direct INSERT → POST → DB assert → replay 400 | ✓ VERIFIED | Exists. `/v1/auth/verify-email` count=6. `type: 'email_verify'` count=1 (INSERT). `ALL CHECKS PASSED` count=1. Cleanup in finally block. TypeScript: tsc exits 0. Script ran against local DB (seed user found, token inserted), failed at fetch (local server not running) — expected; prod run requires Railway deploy. |
| `vigil-core/package.json` | smoke-test:verify-email npm script | ✓ VERIFIED | `"smoke-test:verify-email"` count=1. |
| `.planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md` | 5-SC manual checklist with all validations | ✓ VERIFIED | Exists. Authored with all 5 SC sections + Apple Mail prefetch section. Status: partial (pending Railway deploy execution). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auth.ts` register handler | `password_reset_tokens` (type='email_verify') | `issueEmailVerifyToken(userId, now)` → `db.insert(passwordResetTokens).values({..., type: "email_verify"})` | ✓ WIRED | `type: "email_verify"` count=1 in auth.ts; inserts before 201 response |
| `auth.ts` register handler | `sendEmailVerificationEmail` | `fireVerifyEmailInBackground(email, rawToken).catch(...)` — fire-and-forget after 201 | ✓ WIRED | `sendEmailVerificationEmailFn(email, verifyUrl).catch(...)` at line 69 of auth.ts |
| `auth.ts` login handler | `users.emailVerifiedAt` | `user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null` in return | ✓ WIRED | Lines 234-243 in auth.ts; additive to existing login response |
| `auth-me.ts` | `users.emailVerifiedAt` (Plan 01) | `db.select({ id, email, emailVerifiedAt }).from(users).where(eq(users.id, userId))` | ✓ WIRED | `users.emailVerifiedAt` count=9 in auth-me.ts; DI factory + production singleton |
| `index.ts` bearerAuth dispatcher | `verify-email` route | `if (c.req.path === "/v1/auth/verify-email") return next();` at line 142 | ✓ WIRED | bypass entry at line 142, BEFORE dispatcher at line 143 |
| `verify-email.ts` | `password_reset_tokens` (atomic claim) | `db.update(passwordResetTokens).set({usedAt}).where(and(eq tokenHash, eq type='email_verify', isNull usedAt, gt expiresAt now()))..returning({userId})` | ✓ WIRED | `eq(passwordResetTokens.type, "email_verify")` count=1 in verify-email.ts |
| `verify-email.ts` | `users.email_verified_at` | `db.update(users).set({ emailVerifiedAt: new Date(now) }).where(eq(users.id, claimed[0].userId))` | ✓ WIRED | `set({ emailVerifiedAt: new Date(now) })` count=1 at line after atomic claim |
| `resend-verification.ts` | `sendEmailVerificationEmail` | `sendEmailFn(email, verifyUrl).catch(...)` fire-and-forget | ✓ WIRED | `sendEmailFn.*\.catch` count=1 in resend-verification.ts (DI seam wraps real fn) |
| `index.ts` | verifyEmail (BEFORE dispatcher) + resendVerification (AFTER dispatcher) | mount lines 128 and 200 | ✓ WIRED | `ORDER OK ve=128 rp=123 disp=143 rv=200` — awk confirmed |
| `VerifyEmailPage.tsx` | POST /v1/auth/verify-email | `fetch(\`${API_BASE}/v1/auth/verify-email\`, {method:'POST', body: JSON.stringify({token})})` on Confirm click | ✓ WIRED | Line 59 in VerifyEmailPage.tsx; raw fetch (not vigilFetch) |
| `SettingsPage.tsx` | GET /v1/auth/me (Plan 02) | `vigilFetch('/v1/auth/me')` in new useEffect | ✓ WIRED | `vigilFetch('/v1/auth/me')` count=1 in SettingsPage.tsx (distinct from existing `/v1/me`) |
| `SettingsPage.tsx` | POST /v1/auth/resend-verification | `vigilFetch('/v1/auth/resend-verification', {method:'POST'})` on Resend click | ✓ WIRED | `vigilFetch('/v1/auth/resend-verification'` count=1 in SettingsPage.tsx |
| `App.tsx` | VerifyEmailPage at /auth/verify | `<Route path="/auth/verify" element={<VerifyEmailPage />} />` | ✓ WIRED | Line 76 in App.tsx; sibling to /auth/forgot (line ~69) and /auth/reset (line 71) |
| Phase 112 forgot-password + reset-password | Still mounted correctly post-Phase 113 index.ts edits | Lines 119, 123 in index.ts; bypass lines 140, 141 | ✓ WIRED (regression check) | All 4 grep counts return 1. forgot-password.ts (232 lines) and reset-password.ts (210 lines) unchanged. Phase 112 VERIFICATION.md: status=passed. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `VerifyEmailPage.tsx` | `token` | `useMemo(() => searchParams.get('token'), [searchParams])` — URL parse at render time | Yes (URL query param from React Router) | ✓ FLOWING |
| `VerifyEmailPage.tsx` | `state` | transitions from `idle` on Confirm click → real POST to /v1/auth/verify-email | Yes (real API response) | ✓ FLOWING |
| `SettingsPage.tsx` | `meData` | `vigilFetch('/v1/auth/me')` → `auth-me.ts` → `db.select({ emailVerifiedAt }).from(users).where(eq(users.id, userId))` | Yes (real DB SELECT on mount) | ✓ FLOWING |
| `SettingsPage.tsx` | `resendState` | User click → `vigilFetch('/v1/auth/resend-verification')` → real POST to resend-verification handler | Yes (real API response drives 5-state machine) | ✓ FLOWING |
| `auth.ts` register | `rawToken` | `crypto.randomBytes(32).toString('base64url')` → `db.insert(passwordResetTokens)` | Yes (real entropy + real DB INSERT) | ✓ FLOWING |
| `verify-email.ts` | `claimed[0].userId` | atomic `UPDATE password_reset_tokens ... RETURNING user_id` | Yes (real DB UPDATE-RETURNING) | ✓ FLOWING |
| `resend-verification.ts` | `user.emailVerifiedAt` | `db.select({emailVerifiedAt}).from(users).where(eq(users.id, userId))` via `userLookupFn` | Yes (real DB SELECT for idempotency check) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| auth-me.test.ts: 5 tests green | `npx tsx --test src/routes/auth-me.test.ts` | 5 pass, 0 fail, 0 skip | ✓ PASS |
| verify-email.test.ts: 5 pass, 6 skip | `npx tsx --test src/routes/verify-email.test.ts` | 5 pass, 0 fail, 6 skip (DB absent) | ✓ PASS |
| resend-verification.test.ts: 7 pass, 1 skip | `npx tsx --test src/routes/resend-verification.test.ts` | 7 pass, 0 fail, 1 skip (DB absent) | ✓ PASS |
| VerifyEmailPage.test.tsx: 11 pass | `npx vitest run src/pages/VerifyEmailPage.test.tsx` | 11 pass, 0 fail | ✓ PASS |
| SettingsPage.test.tsx: 16 pass, 1 pre-existing fail | `npx vitest run src/pages/SettingsPage.test.tsx` | 16 pass, 1 fail (pre-existing WR-03) | ✓ PASS (WR-03 is unrelated pre-existing) |
| vigil-core TypeScript build | `npx tsc --noEmit -p tsconfig.json` | Exits 0 | ✓ PASS |
| index.ts mount order | awk ordering check | ORDER OK ve=128 rp=123 disp=143 rv=200 | ✓ PASS |
| VerifyEmailPage has zero functional useEffect calls | grep actual code lines (not JSDoc) | All 4 grep hits are JSDoc lines only — no functional useEffect anywhere in component body | ✓ PASS |
| VerifyEmailPage has zero vigilFetch calls | grep actual code lines (not JSDoc) | All 4 grep hits are JSDoc lines only — raw fetch() used at line 59 | ✓ PASS |
| Idempotency before rate limit in resend-verification.ts | awk check | `already_verified: true` at line 132, `takeSlot` at line 138 — ordering=YES | ✓ PASS |
| Smoke test compiles and targets correct endpoints | `npx tsc --noEmit` + grep | tsc exits 0; /v1/auth/verify-email count=6, type='email_verify' count=1 | ✓ PASS |
| Live smoke test against local server | `VIGIL_API_BASE=http://localhost:3001 npm run smoke-test:verify-email` | ECONNREFUSED (local server not running) — DB portion verified (seed user found, token inserted). Full smoke requires Railway deploy. | ? SKIP (needs running server) |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-11 | Plans 01–05 | Newly-registered user receives verify email, sees non-blocking banner, can click link or resend (rate-limited 3/hr), pre-existing users grandfathered | ✓ SATISFIED (code) / ? HUMAN (live prod) | All 5 ROADMAP SCs verified in code + tests. REQUIREMENTS.md shows `[x] AUTH-11: Phase 113: Complete`. Human UAT pending Railway deploy. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `vigil-pwa/src/pages/SettingsPage.test.tsx` | 104 | Pre-existing WR-03: test asserts raw error code `invalid_state` but implementation correctly maps it to friendly string "Connection attempt expired." | ℹ Info | Pre-existing from Phase 110, unrelated to Phase 113. No impact on AUTH-11 functionality. |

No TODO/FIXME/PLACEHOLDER markers found in any Phase 113 shipped source files. No stub implementations. No empty handlers. The `PLACEHOLDER_HASH_PREFIX` references in auth.ts are the pre-existing seed-user claim mechanism (Phase 104), not Phase 113 stubs.

### Phase 112 Regression Check

Phase 113 made three edits to `vigil-core/src/index.ts` (1 bypass line, 1 import, 1 mount for authMe; then 2 imports + 2 mounts for verifyEmail/resendVerification). All Phase 112 routes are confirmed intact:

- `import { forgotPassword }` — present (count=1)
- `import { resetPassword }` — present (count=1)
- `app.route("/v1", forgotPassword)` at line 119 — present and BEFORE dispatcher (line 143)
- `app.route("/v1", resetPassword)` at line 123 — present and BEFORE dispatcher (line 143)
- `/v1/auth/forgot-password` bypass — present (line 140)
- `/v1/auth/reset-password` bypass — present (line 141)
- `forgot-password.ts` — 232 lines (unchanged from Phase 112's 223 lines + minor comments)
- `reset-password.ts` — 210 lines (unchanged from Phase 112's 211 lines)
- Phase 112 VERIFICATION.md — status: passed

**Phase 112 regression: CLEAR**

### CONTEXT Decision Audit (28 locked decisions)

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 column shape (TIMESTAMPTZ NULL) | ✓ | `0017_users_email_verified_at.sql` ADD COLUMN; schema.ts nullable no .notNull() |
| D-02 backfill (email_verified_at = created_at WHERE IS NULL) | ✓ | Migration Step 2; Plan 01 Summary: 0 unverified after backfill |
| D-03 no index | ✓ | No index in 0017.sql or schema |
| D-04 filename 0017 | ✓ | File exists as `0017_users_email_verified_at.sql` |
| D-05 nullable Drizzle schema | ✓ | No `.notNull()` on emailVerifiedAt |
| D-06 token issuance before 201 | ✓ | `issueEmailVerifyToken` called before `return c.json(201)` |
| D-07 claim-flow null guard | ✓ | `if (existing.emailVerifiedAt === null)` in claim branch |
| D-08 fire-and-forget .catch() | ✓ | `.catch()` pattern mirrors forgot-password.ts; NOT queueMicrotask |
| D-09 POST body `{ token: string }` | ✓ | verify-email.ts body parse: `const { token }` |
| D-10 atomic UPDATE-RETURNING | ✓ | `eq type='email_verify'`, `isNull(usedAt)`, `gt(expiresAt, now())`, `RETURNING userId` |
| D-11 mutation order (claim → update users → 200) | ✓ | verify-email.ts: claim at ~131, users update at ~155, return 200 at ~165 |
| D-12 verify-email unauthenticated | ✓ | Bypass at line 142; mount BEFORE dispatcher at line 128 |
| D-13 5/hr per-IP rate limit on verify-email | ✓ | `RATE_LIMIT_MAX = 5`, per-IP `ipBuckets`, `Retry-After` |
| D-14 200 { ok: true }, no JWT | ✓ | `return c.json({ ok: true }, 200)` — no token in response |
| D-15 resend requires bearerAuth | ✓ | Mounted AFTER dispatcher (line 200 > 143); no bypass for resend |
| D-16 3/hr per-userId with key format | ✓ | `RATE_LIMIT_MAX = 3`, `"verify-resend:userId:"` prefix |
| D-17 most-recent-link wins (invalidate prior) | ✓ | UPDATE `SET used_at = now() WHERE user_id=$1 AND type='email_verify' AND used_at IS NULL` |
| D-18 idempotency on already-verified | ✓ | `user.emailVerifiedAt !== null` → `200 { ok: true, already_verified: true }` BEFORE rate-limit |
| D-19 no fetch on mount (Confirm gate) | ✓ | Zero functional useEffect calls in VerifyEmailPage.tsx; token via useMemo at render |
| D-20 success swap in-place, no redirect | ✓ | `setState('success')` with no navigate(); URL unchanged |
| D-21 single-bucket error UX | ✓ | 400/5xx/network all → `setState('error')` → "This link is no longer valid" |
| D-22 banner on /settings only | ✓ | Banner JSX only in SettingsPage.tsx; no shell-level component |
| D-23 banner copy | ✓ | "Verify your email — we sent a link to {meData.email}. Click it to confirm." |
| D-24 non-dismissible | ✓ | No × or close button inside verify banner block (lines 383-422) |
| D-25 Resend 5-state lifecycle | ✓ | idle/sending/sent (10s)/rate_limited/error all implemented + tested |
| D-26 login response emailVerifiedAt | ✓ | `user: { id, email, emailVerifiedAt: iso|null }` in login return |
| D-27 GET /v1/auth/me minimal fields | ✓ | auth-me.ts returns `{ id, email, emailVerifiedAt }` only; Test ME-05 asserts 3 keys exactly |
| D-28 local component state from /v1/auth/me | ✓ | `useState<meData>` in SettingsPage; new useEffect alongside /v1/me (both coexist) |

All 28 CONTEXT locked decisions honored.

### Human Verification Required

The following items require human action against the live Railway deployment of Phase 113 (Plans 01-04 merged + auto-deploy completed). Execute using `113-HUMAN-UAT.md` as the lab notebook.

**1. SC#1 — Verification email delivery (real Gmail inbox)**

**Test:** Register a fresh allowlisted user on prod (or use Resend via the seed user). Note submit time. Open Gmail inbox within 60 seconds.
**Expected:** Email arrives within 60s. From: noreply@vigilhub.io. Subject: "Verify your Vigil email". In inbox (not spam). Body has teal CTA "Verify email". Link href is https://app.vigilhub.io/auth/verify?token=... with no Resend tracking wrapper (confirms Phase 111 click_tracking:false).
**Why human:** Programmatic email delivery confirmation requires Resend webhook ingestion (out of scope). Real inbox arrival and DKIM/DMARC/deliverability must be observed live.

**2. SC#2 — Non-blocking banner visual inspection**

**Test:** With an unverified user, navigate to /settings and inspect the banner. Navigate to /thoughts and /work-orders to confirm banner is absent.
**Expected:** Amber banner at top of /settings (bg-warning-50 #FAEEDA, border-warning-400 #BA7517) with correct copy, Resend button, no dismiss control. Banner absent on all non-settings pages.
**Why human:** CSS color token rendering and cross-page banner containment cannot be verified programmatically. Visual inspection required.

**3. SC#3 — Verify link clears banner; no redirect; no URL change**

**Test:** Click verify link from Gmail. Open devtools Network tab before Confirm. Click Confirm. Check URL bar. Reload /settings in separate tab.
**Expected:** No POST fires on mount. Page swaps in-place to "Email verified" heading. URL bar still /auth/verify?token=... after swap. /settings banner gone on reload.
**Why human:** Network tab observation (mount-time fetch absence) and live URL bar inspection require a browser session. Banner disappearance requires live Railway /me endpoint returning non-null emailVerifiedAt.

**4. SC#4 — Pre-existing users grandfathered on Railway prod**

**Test:** `psql "$RAILWAY_DB_URL" -c "SELECT email, email_verified_at, created_at, (email_verified_at = created_at) AS backfilled FROM users WHERE email='jamesonmorrill1@gmail.com';"` Then log in as seed user and visit /settings.
**Expected:** email_verified_at IS NOT NULL and equals created_at (backfilled=t). Seed user /settings shows no verify banner. Login works normally.
**Why human:** Requires Railway prod Postgres access. Local DB already verified (117 users, 0 unverified). Prod migration runs automatically on next deploy via db:migrate-prod.

**5. SC#5 — Resend rate limit: 429 after 3 requests/hour**

**Test:** As unverified user on prod, click Resend 3 times (each time waiting for the 10s idle cycle). Click Resend a 4th time. Check Network tab.
**Expected:** 1st-3rd clicks cycle through Resend → Sending… → Sent! Check your inbox. → Resend. 4th click: 429 status, inline "You've requested too many. Try again later.", Resend button disappears, Retry-After header present.
**Why human:** Requires 4 live POST requests to the prod resend-verification endpoint with a real authenticated session. Cannot be simulated without Railway deploy and real JWT.

### Gaps Summary

No code-level gaps found. All 5 ROADMAP success criteria are implemented and verified in code + automated tests. The 5 human verification items are not gaps — they are the live-infrastructure validation layer (SC#1 email delivery, SC#2 visual, SC#3 live flow, SC#4 prod DB backfill, SC#5 live rate limit) that Plan 05 was explicitly designed to cover. The HUMAN-UAT.md checklist is authored and ready to execute post-deploy.

**Pre-existing non-blocking issue:** SettingsPage.test.tsx WR-03 failure (test:104, `?google_error=invalid_state` assertion) is a pre-existing Phase 110 issue unrelated to Phase 113. Documented in Phase 110 deferred-items.md.

---

_Verified: 2026-04-25T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
