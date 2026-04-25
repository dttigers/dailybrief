---
phase: 113
phase_name: verify-email-on-signup
status: context_locked
gathered: 2026-04-25
mode: interactive
locked_by: user (single-message lock-all-recommendations across 4 areas)
requirements:
  - AUTH-11
depends_on:
  - 111  # EMAIL-01 — Resend transport + sendEmailVerificationEmail wrapper (already shipped)
  - 112  # AUTH-10 — password_reset_tokens table with type='email_verify' CHECK constraint (already shipped)
---

# Phase 113 — Verify Email on Signup (CONTEXT)

## Phase Boundary

**In scope:**
- One migration (`vigil-core/drizzle/0017_*.sql`) — add `users.email_verified_at TIMESTAMPTZ NULL` and backfill all pre-existing rows to `created_at` (SC#4).
- Hook into existing `POST /v1/auth/register` (both fresh-register and claim branches) to issue an `email_verify` token row in `password_reset_tokens` and fire-and-forget `sendEmailVerificationEmail`.
- New endpoint `POST /v1/auth/verify-email` — accepts `{ token }`, atomically claims, sets `users.email_verified_at = now()`, returns 200/400.
- New endpoint `POST /v1/auth/resend-verification` — bearerAuth required, rate-limited 3/hour per user, invalidates prior unused `email_verify` tokens for that user and issues a new one (most-recent-link wins).
- New endpoint `GET /v1/auth/me` — bearerAuth required, returns `{ id, email, emailVerifiedAt }` from a fresh DB read.
- Extend login response to include `emailVerifiedAt` in the user object.
- New PWA route `/auth/verify` — static page with Confirm button that POSTs to `/v1/auth/verify-email`; success swaps in place, no redirect.
- PWA Settings banner — non-blocking, non-dismissible, shown when `emailVerifiedAt === null`, with Resend button.

**Out of scope (deferred to roadmap or future phases):**
- Email change flow (AUTH-12) — explicit roadmap deferral to v3.7.
- Hard-block on unverified users — banner is non-blocking per SC#2.
- Custom branded `/auth/verify` landing page (logo, hero illustration) — minimal styling, brand-consistent only.
- Resend webhook ingestion (delivered/bounce/complaint events) — Phase 111 deferral, still applies.
- Confirmation email "your email was verified" — mirror Phase 110/112 deferral of confirmation emails at this scale.
- Shell-level banner on every authed page — explicitly deferred (Settings-only per SC#2 literal).
- WebSocket push of verify state — over-engineered.

## Implementation Decisions

### Migration (drizzle/0017_users_email_verified_at)

**D-01 (column shape — locked):**
```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
```
Nullable, no default. `NULL` = unverified (sentinel for the banner). Non-null timestamp = verified at that moment.

**D-02 (backfill — locked, satisfies SC#4):**
```sql
UPDATE users
   SET email_verified_at = created_at
 WHERE email_verified_at IS NULL;
```
Same migration file, executed after the ADD COLUMN. Grandfathers every pre-existing user (including the seed user, if it has been claimed). Safe to re-run (idempotent — second pass finds no NULL rows). After this migration deploys, `email_verified_at IS NULL` is true ONLY for users that registered AFTER the migration ran but before clicking their verify link.

**D-03 (index — Claude's discretion):** Skip. We never query "list all unverified users" in the hot path; banner check is a single-row lookup by user_id (already PK). Index can be added later if a backfill/cleanup job needs it.

**D-04 (migration filename — Claude's discretion):** `0017_users_email_verified_at.sql` (next free after Phase 112's 0016). Hand-authored, follows Phase 110/112 idempotent `IF NOT EXISTS` / re-runnable pattern.

**D-05 (drizzle schema sync — locked):** Add `emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true })` (nullable — no `.notNull()`) to the `users` table object in `vigil-core/src/db/schema.ts`, alongside `passwordChangedAt`.

### Token issuance (hook into POST /v1/auth/register)

**D-06 (token row insertion — locked):** Inside the register handler, BEFORE returning 201:
1. Generate raw token via `crypto.randomBytes(32).toString('base64url')` (~43 chars, 256 bits — Phase 112 D-07 pattern).
2. Hash via `crypto.createHash('sha256').update(rawToken).digest('hex')` (Phase 112 D-08 pattern).
3. INSERT row into `password_reset_tokens` with `type='email_verify'`, `expires_at = now() + 24h`, `user_id = newUser.id`.
4. Return 201 to caller.
5. **After** the response is sent (`queueMicrotask` or top-level `void` IIFE), call `sendEmailVerificationEmail(email, verifyUrl)` where `verifyUrl = ${VIGIL_APP_BASE_URL}/auth/verify?token=${rawToken}`.

Token is durable in DB before response, so a crashed/failed background send still leaves the user able to hit Resend later. Per Phase 111 D-10, the send failure is swallowed — `console.error` + PostHog `captureException` only.

**D-07 (claim-flow parity — locked):** The seed-user claim branch (`existing.passwordHash.startsWith(PLACEHOLDER_HASH_PREFIX)`) ALSO issues a verify token + email — but ONLY if `existing.emailVerifiedAt IS NULL`. Background: after the 0017 migration backfills the seed user to `email_verified_at = created_at`, the claim path will see a non-null value and skip the email send. Defensive guard for the edge case where a seed user was inserted between migration and claim.

**D-08 (fire-and-forget pattern — locked, mirrors Phase 112 D-21):** The send call sits inside a `queueMicrotask(async () => { try { await sendEmailVerificationEmail(...); } catch (err) { console.error('[register] email send failed (background):', err); } })` block. The await happens AFTER `c.json({...}, 201)` returns. Register response time stays at hash + INSERT cost (~50-150ms), Resend latency invisible to caller.

### Verify endpoint (POST /v1/auth/verify-email)

**D-09 (request body — locked):** `{ token: string }`. Token is the base64url raw value from the URL query string (PWA reads it from `?token=...` and POSTs it in the body — body, not URL, to keep server logs clean).

**D-10 (atomic claim — locked, mirrors Phase 112 D-02 with type filter):**
```sql
UPDATE password_reset_tokens
   SET used_at = now()
 WHERE token_hash = $1
   AND type = 'email_verify'
   AND used_at IS NULL
   AND expires_at > now()
RETURNING user_id;
```
0 rows → return `400 { error: "Invalid or expired token" }`. 1 row → proceed.

**D-11 (state mutation order — locked):**
1. Atomic claim (D-10) — burns the token.
2. UPDATE users SET email_verified_at = now() WHERE id = $1.
3. Return `200 { ok: true }`.

If step 2 fails after step 1, the token is already burned — user requests a fresh link via Resend. Acceptable failure mode (mirrors Phase 112 D-11).

**D-12 (auth requirement — locked):** Endpoint is **unauthenticated**. The token IS the auth. Mount in `vigil-core/src/index.ts` bearerAuth bypass list alongside `/v1/auth/forgot-password` and `/v1/auth/reset-password`.

**D-13 (rate limit — locked):** **5 / hour per-IP only.** No per-user axis (the token IS the auth — there's no email/user identifier in the body). Mirrors Phase 112 D-13 reset-password limit shape. Belt-and-suspenders against brute-force token guessing on top of 256-bit entropy.

**D-14 (response on success — locked, satisfies SC#3):** `200 { ok: true }`. **No JWT, no auto-login, no token in response.** PWA reads the 200 → swaps to success state in place (D-19).

### Resend endpoint (POST /v1/auth/resend-verification)

**D-15 (auth requirement — locked):** **bearerAuth required.** User must be logged in. Body is empty `{}` — server reads `userId` from the JWT. This satisfies SC#5 ("3 requests within 1 hour for the same user") cleanly: rate limit key = userId.

**D-16 (rate limit — locked, satisfies SC#5):** **3 requests per hour per userId** via the existing in-memory sliding-window rate limiter (`vigil-core/src/middleware/rate-limit.ts`). Key format: `verify-resend:userId:{id}`. 429 response when exceeded.

**D-17 (token reuse — locked, mirrors Phase 112 D-06):** Before issuing a new token, run `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND type = 'email_verify' AND used_at IS NULL`. Most-recent-link wins. User only has one valid link in inbox at any time.

**D-18 (idempotency on already-verified — locked):** Before any work, check `users.email_verified_at`. If non-null, return `200 { ok: true, already_verified: true }` and skip the token + email entirely. Guards against banner-state staleness causing a wasted send.

### PWA — `/auth/verify` (verify page)

**D-19 (page shape — locked, prefetch-safe):** Static page, **no fetch on mount**. Mount: parse `?token=...` from URL.
- Token present: render heading "Verify your email" + body "Click the button below to confirm your email address." + primary "Confirm" button. POST happens **only on Confirm click**. Apple Mail / Outlook SafeLinks / Gmail prefetch hits this page and harmlessly renders — no token burn.
- Token missing: render explicit error state per D-21.

**D-20 (success state — locked, satisfies SC#3):** On 200 from `/v1/auth/verify-email`, swap content **in place** (no redirect, no URL change). Render: heading "Email verified" + body "You can close this tab, or" + secondary link "Go to app" → "/" (which routes to /auth if logged out, home if logged in). Works identically in logged-in and logged-out states. SC#3 ("redirect URL contains no JWT or token parameter") trivially satisfied — there is no redirect.

**D-21 (error states — locked):**
- **Missing token in URL** (?token absent or empty): render "This verification link is malformed. Please use the button in the email we sent you." + link "Back to app" → "/".
- **Generic claim failure** (Claude's Discretion — covers 400 invalid/expired/used + 5xx + network) — single-bucket per Phase 112 D-20 pattern: heading "This link is no longer valid" + body "Verification links expire after 24 hours and can only be used once." + primary button "Request a new link" → "/settings" if logged in, "/auth" if logged out + secondary link "Back to app" → "/". 5xx and network errors collapse into the same UX (Claude's Discretion — no info leak, simpler state machine, retry is one click via "Request a new link").

### PWA — Settings page banner

**D-22 (banner placement — locked, satisfies SC#2):** Banner renders **only at the top of `/settings`**. No shell-level banner, no banner on home/other pages. Aligns with SC#2 literal ("non-blocking banner in the PWA Settings page") and avoids nagging the user inside their daily workflow.

**D-23 (banner shape — locked):** Visible on Settings mount when `me.emailVerifiedAt === null`:
- Background: light yellow/amber (warning, not error — non-blocking per SC#2).
- Text: "Verify your email — we sent a link to {email}. Click it to confirm."
- Inline button: "Resend".
- No dismiss/× control.

**D-24 (non-dismissible — locked):** Banner stays at top of Settings page until `emailVerifiedAt` is non-null. Cannot be dismissed. Mirrors Phase 112 banner pattern. Re-renders on every Settings mount via fresh `/v1/auth/me` call.

**D-25 (Resend button lifecycle — locked):**
- **Idle** (default): button label "Resend", enabled.
- **Sending**: on click, label changes to "Sending…", disabled.
- **Sent confirmation** (10s window): on 200, label becomes "Sent! Check your inbox.", disabled. After 10s, returns to Idle so user can retry if email never arrived (e.g., spam folder).
- **Rate-limited**: on 429, render inline error text "You've requested too many. Try again later." next to the button. Button stays disabled in this rendered state until next page load (no countdown timer — keeps state machine simple).
- **Network/5xx**: render inline error "Could not send. Try again." Button re-enables to Idle.

### Login response + /me endpoint (PWA needs to know verify state)

**D-26 (extend login response — locked):** Login response shape changes from `{ token, user: { id, email } }` to `{ token, user: { id, email, emailVerifiedAt } }`. `emailVerifiedAt` is ISO string or `null`. Backwards-compatible additive change for any existing client (PWA is the only client and we're updating it in this phase).

**D-27 (new GET /v1/auth/me — locked):** New route, bearerAuth required. Returns `{ id: number, email: string, emailVerifiedAt: string | null }` from a fresh DB read of `users` by id (extracted from JWT). Mount alongside other `/v1/auth/*` routes. **Minimal field set** — do NOT expose `passwordChangedAt`, `passwordHash`, or other internal fields. Future fields can be added when a feature needs them.

**D-28 (PWA cache strategy — locked):** Settings page calls `/v1/auth/me` on mount via `useEffect`, stores the response in **local component state** (no global store, no react-query, no SWR, no localStorage cache). Banner renders from local state. No other page renders the banner, so no other page needs `/me`. Smallest possible PWA change. Satisfies SC#3 ("banner disappears on next page load") because a fresh `/me` call fires every mount.

## Claude's Discretion (planner can decide without re-asking)

- Exact wording of success messages, error copy, and banner microcopy (load-bearing structure is locked above; word-level tweaks fine).
- Migration filename if 0017 is taken (pick next free).
- Whether to extract a shared `tokenIssue.ts` helper for the "generate raw + hash + insert with type" pattern that's now used in 4 places (forgot-password, reset-password, register-verify-issue, resend-verify) — judgment call based on whether the duplication is worth abstracting yet.
- Test file layout — match existing auth test conventions (single `auth.test.ts` vs split per-route).
- HTTP status codes for the resend endpoint: 200 success, 429 rate-limited, 401 (no JWT), 200 already-verified — confirm against Hono conventions.
- Whether to add `getMe` as a method on `vigilFetch` or just call it directly from SettingsPage with `vigilFetch('/v1/auth/me')`.
- Whether to log a structured PostHog event on successful verify (`email_verified` with `userId`) for funnel analytics — nice-to-have, not load-bearing.
- Specific content of the error banner color (light yellow / amber) — match the existing Vigil PWA color palette for warnings.

## Folded Todos

None — todo match-phase returned 0 results.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + Requirements
- `.planning/ROADMAP.md` §"Phase 113: Verify Email on Signup" — Goal, Success Criteria 1-5, dependencies on Phase 111 + 112.
- `.planning/REQUIREMENTS.md` §"AUTH-11" — authoritative per-field acceptance criteria.

### Existing code patterns to mirror
- `vigil-core/src/services/email-service.ts` (lines 224-253) — `sendEmailVerificationEmail(to, verifyUrl)` wrapper. Already shipped, already tested, already has WR-01 escape, already has `click_tracking: false`. Use as-is, do NOT modify.
- `vigil-core/src/db/schema.ts` (line 335 onward) — `password_reset_tokens` table definition with `type` CHECK constraint. Already supports `type='email_verify'`. Add the new `users.emailVerifiedAt` column alongside `passwordChangedAt` (around line 44-45).
- `vigil-core/src/routes/auth.ts` (lines 40-118) — existing `/auth/register` handler. Modify to issue the verify token + fire-and-forget the email (D-06–D-08). Add the new `/auth/me` route here too (D-27).
- `vigil-core/src/routes/forgot-password.ts` — Phase 112 fire-and-forget background send pattern (line ~222 background error log). Mirror for the register email send.
- `vigil-core/src/routes/reset-password.ts` — Phase 112 atomic UPDATE-RETURNING claim pattern. Mirror for the verify-email claim.
- `vigil-core/src/middleware/rate-limit.ts` — sliding-window in-memory rate limiter. Use for the resend endpoint at 3/hour per userId (D-16).
- `vigil-core/src/middleware/bearerAuth.ts` — Phase 110 iat gate. No changes needed; resend + /me routes mount under bearerAuth; verify-email is in the bypass list.
- `vigil-core/src/index.ts` (lines 132-133) — bearerAuth bypass list. Add `/v1/auth/verify-email` next to `/v1/auth/forgot-password` and `/v1/auth/reset-password`.
- `vigil-core/drizzle/0016_*.sql` (Phase 112) — hand-authored idempotent migration template. Mirror shape for 0017.

### PWA anchors
- `vigil-pwa/src/main.tsx` (or wherever routes are wired) — add `/auth/verify` route.
- `vigil-pwa/src/pages/AuthPage.tsx` — login response shape consumer; update to handle the new `emailVerifiedAt` field if it's stored anywhere on login.
- `vigil-pwa/src/pages/SettingsPage.tsx` — add the verify banner at the top (D-22–D-25); add the `/v1/auth/me` fetch on mount (D-28); existing change-password section is the styling reference for inline error/success states.
- `vigil-pwa/src/api/client.ts` — `vigilFetch` wrapper. Use directly for `/v1/auth/me` and `/v1/auth/resend-verification` calls. Verify-page POST to `/v1/auth/verify-email` happens unauthenticated (no bearer) — confirm vigilFetch supports that or use raw `fetch()`.

### Project-level policy
- `.planning/PROJECT.md` §Current State — Railway is the prod secrets source of truth; `.env.example` is the dev template.
- `.planning/phases/111-transactional-email-infrastructure-resend-dns/111-CONTEXT.md` — D-04, D-05, D-06, D-10, D-12 directly inform Phase 113 (transport conventions, env var, swallow-failure rule, observability).
- `.planning/phases/112-forgot-password-email-flow/112-CONTEXT.md` — D-01 (table schema with type CHECK), D-02 (atomic claim SQL template), D-06 (most-recent-link wins), D-07/D-08 (token format + storage), D-13 (per-IP-only rate limit on token-only endpoints), D-18 (form-submit prefetch gate), D-20 (single-bucket error UX), D-21 (fire-and-forget Resend send pattern). All are direct templates for this phase.

### External docs (planner may read via WebFetch / context7 during research)
- Resend Node SDK — already wired via `email-service.ts`; no new SDK research needed for this phase.
- Apple Mail Privacy Protection prefetch behavior — context for D-19 prefetch-safe page design (already factored into the locked decision).
- Hono route mounting + middleware bypass — confirm against current Hono version when adding the bypass entry in `index.ts`.

## Existing Code Insights

### Reusable Assets
- **`sendEmailVerificationEmail`** (vigil-core/src/services/email-service.ts:227) — fully implemented in Phase 111. Zero email-content work needed. Just call it with `(email, verifyUrl)` from the register handler and the resend handler.
- **`password_reset_tokens` table** — already migrated (0016), already has `type='email_verify'` allowed by CHECK constraint, already has unique index on `token_hash`, already supports atomic UPDATE-RETURNING claims. Phase 113 just inserts/claims rows with the new type discriminant.
- **Atomic claim SQL** (Phase 112 D-02) — copy-paste with `type` filter changed to `'email_verify'`.
- **Token generation pattern** (Phase 112 forgot-password.ts) — `crypto.randomBytes(32).toString('base64url')` + `createHash('sha256').update(raw).digest('hex')`. Same shape, same entropy, same storage discipline.
- **`vigil-core/src/middleware/rate-limit.ts`** — sliding-window in-memory rate limiter. Drop-in for the resend endpoint at 3/hour/userId.
- **Fire-and-forget background send** (Phase 112 D-21) — `queueMicrotask(async () => { try { await send(...); } catch (err) { console.error(...); } })` after `c.json(...)` returns. Same pattern for register.
- **bearerAuth iat gate** (Phase 110) — No changes needed; verify endpoint is in the unauthenticated bypass list, resend + /me are bearerAuth-protected.
- **PWA banner pattern** (Phase 110/112 banners on AuthPage) — color/typography/layout reference for the Settings verify banner.
- **`vigilFetch` 401 handling** (Phase 110 D-19) — already wired; PWA Settings page can call `/v1/auth/me` and `/v1/auth/resend-verification` without re-implementing 401-redirect logic.

### Established Patterns
- **Hand-authored idempotent SQL migrations** with `IF NOT EXISTS` guards (Phase 110 / 112). 0017 follows the same shape.
- **No-startup-crash posture** — RESEND_API_KEY is optional via lazy null-init in email-service (Phase 111 D-04). Phase 113 inherits this: if Resend key is unset on a Railway deploy, register still works, banner still renders, Resend button shows "Could not send" — no fatal.
- **Discriminated-union return types from services** — `EmailSendResult` from email-service is already `{ status: "sent" | "skipped_no_key" | "failed", ... }`. Register and resend handlers ignore the result (per D-08 fire-and-forget) but log it.
- **Single-bucket error UX for token-bearing endpoints** (Phase 112 D-20) — D-21 of this phase mirrors exactly: one generic "this link is no longer valid" state covers expired / used / unknown.
- **Most-recent-link wins on token reissue** (Phase 112 D-06) — D-17 mirrors for verify resend.
- **Fire-and-forget Resend send after 2xx response** (Phase 112 D-21) — D-08 mirrors for register.
- **Per-IP-only rate limit on token-only endpoints** (Phase 112 D-13) — D-13 mirrors for verify-email POST.

### Integration Points
- **Phase 110 bearerAuth iat gate**: unchanged. Verify-email endpoint is in the bypass list (token IS auth, no JWT presented). Resend + /me are bearerAuth-protected and benefit from the gate automatically.
- **Phase 111 email transport**: Resend domain verified, RESEND_API_KEY on Railway, send-failure swallow + PostHog already in place. Phase 113 calls `sendEmailVerificationEmail` and inherits all of this.
- **Phase 112 password_reset_tokens table**: schema already has `type='email_verify'` allowed. No new migration on the tokens table.
- **PWA `vigilFetch` 401 handler**: continues to redirect to `/auth?reason=session_expired`. Verify page is unauthenticated, so it should NOT use `vigilFetch` (or should disable the 401 redirect for its one POST). Planner detail.
- **Future Phase 114 (Safari extension)**: independent; no integration concerns.
- **Future AUTH-12 (email change)**: when implemented, it will trigger AUTH-11 re-verification on the new address — i.e., it will reuse `sendEmailVerificationEmail` and the token + verify endpoint built here. Phase 113 is the foundation for AUTH-12.

## Specific Ideas

- **Apple Mail prefetch is the load-bearing concern for the verify page design.** The Confirm-button gate (D-19) is non-negotiable. Apple Mail Privacy Protection (iOS 15.4+ / macOS 12.3+) silently fetches every link in the email through Apple's edge proxy with a generic browser UA, so a pure GET claim endpoint would burn the token before the human ever sees the email. The user would then click the link and see "already used", confused. UA-sniffing heuristics are unreliable (Apple deliberately uses generic UAs). The Confirm-click gate is the only robust mitigation.
- **`click_tracking: false` is already set in Phase 111** at the email-service layer (every send call hardcodes it). Resend's link rewriter is not the prefetch source here — Apple Mail itself is. The Confirm gate handles both.
- **The grandfathering backfill (D-02) is the single most important piece of safety for the Railway deploy.** Without it, every existing user (jamesonmorrill1@gmail.com plus any others on the allowlist) would render the banner immediately and have to verify. The migration UPDATE backfills `email_verified_at = created_at`, which is semantically "they've been using the account, treat them as verified." Planner must confirm this UPDATE runs in the SAME migration as the ADD COLUMN, atomically.
- **Resend rate limit key is `userId`, not email or IP** (D-16) — because the user is authenticated. This is more precise than Phase 112's per-email/per-IP shape (which had to handle unauthenticated forgot-password). Per-user is correct for resend.
- **The `/me` endpoint is the smallest possible new surface** — three fields, bearerAuth, single SQL SELECT. Resist the urge to make it a "user profile" endpoint or add flags/preferences. Future fields go in only when a feature needs them.
- **Smoke test approach** (Claude's Discretion, but worth flagging): mirror Phase 112's `smoke-test-forgot-password.ts` script — register a test user, capture the verify URL from the email send result (or DB), POST it to verify-email, confirm `users.emailVerifiedAt` is non-null. Live integration test against Railway after deploy. Manual UAT covers the "click email in inbox" leg.

## Deferred Ideas

### Shell-level banner on every authed page
Considered and rejected for v1 of AUTH-11. SC#2 says Settings page; staying minimal avoids nagging the user inside their daily workflow. Revisit if low-engagement users go weeks without visiting Settings and stay unverified — at that point a thinner shell-level strip with a per-session dismiss (sessionStorage) would be the natural next step.

### Auto-claim verify on logged-in /me hit
Idea: if user is logged in AND has a fresh unverified token row AND clicks verify link from same browser, server could auto-claim without the Confirm gate. Rejected — adds a parallel code path with no clear UX win over the 1-click Confirm. Confirm gate works in 100% of cases.

### Confirmation email "Your email was verified"
Anti-hijack signal. Phase 110 (change-password) and Phase 112 (forgot-password) both deferred their analogous confirm emails at this scale. Stay symmetric; revisit when user count justifies the noise.

### Funnel analytics: PostHog event on successful verify
Light-touch nice-to-have for measuring verify conversion rate (registered → verified within 24h). Planner can add as a one-liner in the success path of `/v1/auth/verify-email` if convenient; not a load-bearing decision. Captured in Claude's Discretion.

### Cleanup cron for expired/used `email_verify` token rows
Same disposition as Phase 112's deferred cleanup — not load-bearing at single-user scale. Atomic claim filters on `expires_at > now() AND used_at IS NULL` so old rows don't pollute the hot path.

### Index on `email_verified_at`
Skipped (D-03). No "list all unverified users" query exists or is planned. Add later if a backfill or admin-side report needs it.

### Email change re-verification (AUTH-12)
Roadmap-deferred to v3.7. Phase 113 builds the foundation (verify endpoint + email + token discriminant) so AUTH-12 is a small additive phase.

### Custom branded `/auth/verify` landing page
Logo, hero illustration, footer. Out of scope — minimal styling matching the Settings page is fine for v1.

### Reviewed Todos (not folded)
None — `todo match-phase 113` returned zero matches.

---

*Phase: 113-verify-email-on-signup*
*Context gathered: 2026-04-25*
