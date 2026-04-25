---
phase: 112
phase_name: forgot-password-email-flow
status: context_locked
started: 2026-04-24
updated: 2026-04-24
mode: express_path_A
locked_by: user (single-message lock-all-recommendations)
requirements:
  - AUTH-10
depends_on:
  - 110  # AUTH-09 — password_changed_at column + bearerAuth iat gate
  - 111  # EMAIL-01 — Resend transport + sendPasswordResetEmail wrapper
---

# Phase 112 — Forgot-Password Email Flow (CONTEXT)

## Phase Boundary

**In scope:** Two new endpoints (`POST /v1/auth/forgot-password`, `POST /v1/auth/reset-password`), one migration (`drizzle/0016_*` for `password_reset_tokens`), two PWA pages (`/auth/forgot`, `/auth/reset`), and a "Forgot password?" link on the existing login page.

**Out of scope (deferred to roadmap or future phases):**
- Email confirmation on successful reset (anti-hijack notification) — see Deferred Ideas
- Multi-factor / TOTP for reset flow — explicit "out of scope for AUTH-10" per AUTH-09 pattern
- Admin-side password reset (force reset by admin) — not in v3.6
- Phase 113 reuses this table — schema includes the `type` column up front but only `'password_reset'` writes happen in Phase 112

## Implementation Decisions

### Schema & Migration (drizzle/0016_password_reset_tokens)

**D-01 (table schema, full DDL — locked):**
```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('password_reset','email_verify')),
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user_id_type ON password_reset_tokens(user_id, type);
CREATE INDEX IF NOT EXISTS idx_prt_expires_at ON password_reset_tokens(expires_at);
```

**Why these columns:**
- `id` SERIAL PK — standard pattern, not used as the user-facing token (token_hash UNIQUE is the lookup key).
- `user_id` FK ON DELETE CASCADE — when a user is deleted, their reset tokens go with them; no orphan rows.
- `token_hash` SHA-256 hex of raw token. UNIQUE index = prevents collisions and gives fast lookup.
- `type` with CHECK constraint — Phase 113 (AUTH-11) reuses this table by writing `type='email_verify'` rows. Constraint pre-locks the allowed values so Phase 113 doesn't need to revisit the migration.
- `expires_at` TIMESTAMPTZ — wall-clock UTC. Indexed for the rare-but-possible cleanup query.
- `used_at` TIMESTAMPTZ NULL — null = not yet used; non-null timestamp = used (single-use enforcement). Atomic UPDATE … RETURNING is the claim mechanism.
- `created_at` — for forensic timeline; not used in the hot path.

**D-02 (atomic single-use claim — locked, satisfies SC#3):**
```sql
UPDATE password_reset_tokens
   SET used_at = now()
 WHERE token_hash = $1
   AND type = $2
   AND used_at IS NULL
   AND expires_at > now()
RETURNING user_id;
```

If 0 rows returned → token is invalid/expired/already-used → reset endpoint returns 400 generic error (D-20). If 1 row returned → claim succeeded; proceed to update password.

### Forgot-password endpoint (POST /v1/auth/forgot-password)

**D-03 (enumeration-safe response — locked, satisfies SC#1):** Always returns `200 { ok: true, message: "If your account exists, a reset link has been sent." }` regardless of whether the email maps to a user. Same response body, same status code, same approximate wall-clock time.

**D-04 (rate limit shape — locked):** **5 requests per hour, per-email AND per-IP** (whichever fires first). Both axes prevent (a) attacker burning through Resend quota by spamming arbitrary emails (per-IP catches this) and (b) user's mailbox from being weaponized via known-good email (per-email catches this). 5/hour is gentle enough that legit fat-finger or misclicked-link doesn't lock out a real user.

  - Implementation note: planner/researcher to investigate Hono rate-limiter middleware OR a small in-process LRU + sliding-window counter (the global rate limiter at Phase 44 is 100/60s and is too coarse for this use case).
  - 429 response body: same enumeration-safe shape as D-03 (don't reveal that "this email hit the per-email limit" vs "your IP hit the per-IP limit").

**D-05 (timing-attack mitigation — locked):** Run a **dummy argon2 hash on miss** so success/miss paths take similar wall-clock time. The argon2 verify on the hit path is ~100-200ms; the dummy on the miss path uses the same `verifyArgon2` call against a synthesized hash. Trade-off acknowledged: every miss costs ~100-200ms CPU. Acceptable at single-user scale; revisit at >100 active users.

  - Approximate, not constant-time — SC#1 says "approximate response time", not "byte-equal time".

**D-06 (token reuse on second forgot-password — locked):** When a user with an existing unused token requests another reset, **invalidate prior unused tokens for that user + type pair, issue a new one.** "Most recent link wins."
  - Implementation: before INSERT of new token, run `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND type = 'password_reset' AND used_at IS NULL`.
  - Cleaner UX (user only has one valid link in inbox) and keeps single-use semantics tight.

**D-07 (token format — locked):** 32 random bytes via `crypto.randomBytes(32)`, encoded as **base64url** (URL-safe, no padding). ~43 characters, 256 bits of entropy.

**D-08 (token storage — locked, satisfies SC#5):** `crypto.createHash('sha256').update(rawToken).digest('hex')` (64-char hex) is what goes into DB. Raw token NEVER touches the DB; appears only in the email URL and in memory between generation and email send.

### Reset-password endpoint (POST /v1/auth/reset-password)

**D-09 (request body — locked):** `{ token: string, newPassword: string }`. Token is the base64url raw value from the email URL. Server SHA-256-hashes it before lookup (D-08).

**D-10 (atomic claim — locked):** D-02 SQL is the FIRST DB op. If 0 rows returned, return `400 { error: "Invalid or expired token" }` and STOP. If 1 row returned, proceed.

**D-11 (state-mutation order — locked, mirrors Phase 110 D-14):**
  1. UPDATE password_reset_tokens claim (D-10 / D-02) — atomic single-use.
  2. UPDATE users SET password_hash = argon2id(newPassword), password_changed_at = now() WHERE id = $1.
  3. Return 200 success.

  Token claim BEFORE password update BEFORE 200 response. If step 2 fails after step 1 succeeded, the token is already burned (used_at set) — user requests a fresh reset via /forgot-password. Acceptable failure mode.

**D-12 (response on success — locked, satisfies SC#2):** `200 { ok: true, message: "Password reset successful. You can now log in." }`. **No JWT, no auto-login, no token in response.** PWA reads the 200 → navigates to /auth?reason=password_reset (Phase 110 D-19 banner pattern, fresh login required).

**D-13 (rate limit on reset endpoint — locked):** **5 / hour per-IP only.** No per-email axis here because the body has no email field — the token IS the auth. Per-IP catches brute-force token guessing (although 256 bits of entropy makes that effectively impossible — this is belt-and-suspenders).

### PWA — `/auth` (login page)

**D-14 (link placement — locked):** A **"Forgot password?"** text link rendered immediately below the password input on the login form. Plain anchor `<Link to="/auth/forgot">`, no modal. Inline-styled to match the existing form's secondary text color.

### PWA — `/auth/forgot` (forgot-password page)

**D-15 (route — locked):** `/auth/forgot` (unauthenticated, top-level under the auth flow).

**D-16 (form + UX — locked):**
  - Single `<input type="email" required>` field labeled "Email".
  - Submit → POST /v1/auth/forgot-password → on 200, replace form with success message: **"If your account exists, a reset link has been sent. The link expires in 1 hour."**
  - Same message regardless of whether a user actually exists (D-03 enumeration safety).
  - Below success message: "Back to login" link.
  - Errors: only network errors and 429s surface (rendered as a generic banner with "Try again later").

### PWA — `/auth/reset` (reset-password page)

**D-17 (route — locked):** `/auth/reset` (unauthenticated). The smoke test in Phase 111 already exercised this URL shape (`/auth/reset?token=smoke-test-...`).

**D-18 (token source — locked):** Read `?token=...` from URL query string at mount. If missing → render the error UX (D-20). Do NOT make any API call until user submits the form (avoids burning the token via Apple Mail pre-fetch — although Phase 111 already mitigates this at the email-tracking layer, the form-submit gate is defense in depth).

**D-19 (form + UX — locked):**
  - Single `<input type="password">` field labeled "New password" (single field, no confirm — Phase 110 D-16 pattern; show/hide toggle via emoji eye-icon per Phase 110 D-19).
  - Submit → POST /v1/auth/reset-password with `{ token, newPassword }`.
  - On 200: redirect to `/auth?reason=password_reset` — login page renders a green banner "Password reset successfully. Please sign in with your new password." (mirrors Phase 110's `?reason=session_expired` banner pattern).

**D-20 (token error UX — locked):** If the API returns 400 (invalid/expired/used), render a single generic state:
  - Heading: "This link is no longer valid"
  - Body: "Reset links expire after 1 hour and can only be used once."
  - Primary button: "Request a new link" → navigates to /auth/forgot.
  - Secondary link: "Back to login" → /auth.

  No specific differentiation between expired / used / nonexistent — single bucket prevents info leak and simplifies state machine.

### Email content (no new design — reuses Phase 111)

**D-21:** Re-uses `sendPasswordResetEmail(to, resetUrl)` from `vigil-core/src/services/email-service.ts` exactly as shipped in Phase 111. The resetUrl is constructed by the route handler as `${VIGIL_APP_BASE_URL}/auth/reset?token=${rawToken}` (URL-safe because base64url has no need for percent-encoding).

  - WR-01 fix already in place (HTML escape on URL interpolation) — no template changes needed.
  - Teal `#1D9E75` CTA, 1-hour copy, plaintext fallback — all already shipped.

## Claude's Discretion (planner can decide without re-asking)

- Exact wording of success messages and 4xx error bodies (D-12 / D-20 give the load-bearing bits; minor copy tweaks are fine).
- Argon2 cost parameters for the dummy hash on miss — use whatever the existing argon2 config exports; don't invent new params.
- Hono rate-limiter library choice (look for existing in repo first; if none, prefer in-process LRU + sliding window over adding a Redis dep at this scale).
- Migration filename / number — pick the next free `drizzle/00XX_*.sql` based on existing files.
- Whether to add a small `cleanup-expired-tokens` cron — defer unless trivially small. Not load-bearing for the v3.6 milestone.
- Test file layout (single big test file vs split per-route — match existing auth test conventions).
- Specific 4xx codes for rate-limited responses (429 vs 503 — 429 is correct, but defer if Hono middleware uses something else).

## Phase 112 Specification

**Endpoints to ship:**

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | /v1/auth/forgot-password | none | `{ email }` | `200 { ok: true, message }` always (D-03) — even on rate limit OR error path (only network/server errors return 5xx) |
| POST | /v1/auth/reset-password | none | `{ token, newPassword }` | `200 { ok, message }` on success / `400 { error: "Invalid or expired token" }` / `429` on rate limit |

**Migration:** `vigil-core/drizzle/00XX_password_reset_tokens.sql` (D-01).

**PWA routes:** `/auth/forgot` (D-15/D-16), `/auth/reset` (D-17–D-20). "Forgot password?" link on `/auth` (D-14).

**Tests:**
- Unit: token generation entropy + base64url shape, hash determinism, atomic UPDATE-RETURNING semantics (mock DB).
- Integration: full forgot→email→reset→login flow against test DB; enumeration safety timing test (response time within ~30% on hit vs miss).
- PWA: form submit happy path + invalid-token error UX.
- Cross-phase regression: existing login + change-password flows still pass.

## Prior-Phase Decisions (reused or informing)

- **Phase 110 D-12** — bumping `password_changed_at` invalidates old JWTs via the existing bearerAuth iat gate. Phase 112 just bumps the column on reset success; no new gate code needed.
- **Phase 110 D-14** — state mutation BEFORE token signing (here adapted as: token claim BEFORE password update BEFORE 200 response). Order is load-bearing for crash-safety.
- **Phase 110 D-16** — single password input field (no confirm field). Phase 112 reset page mirrors this.
- **Phase 110 D-17** — emoji eye-icon show/hide toggle. Reuse on `/auth/reset`.
- **Phase 110 D-19** — `vigilFetch` 401 handler force-navigates to `/auth?reason=session_expired`. Phase 112 adds `?reason=password_reset` as a new banner case (login page renders both).
- **Phase 110 D-13** — confirmation email on successful change-password was DEFERRED out of Phase 110. Phase 112 *could* send a "your password was just reset" notification email. Lean toward NOT including it in v1 of AUTH-10 — keep the change-password-vs-reset symmetry (both omit the confirm email at this scale), revisit when user count justifies the anti-hijack signal. Captured in Deferred Ideas.
- **Phase 111 D-04** — typed wrappers per email type. `sendPasswordResetEmail` already exists; just call it.
- **Phase 111 D-12** — SHA-256 PII hashing for observability. Phase 112's captureException calls (on token claim failures, etc.) follow the same to_hash pattern.

## Code Anchors (planner + researcher MUST read)

- `vigil-core/src/services/email-service.ts` — `sendPasswordResetEmail(to, resetUrl)` signature, return type `EmailSendResult`.
- `vigil-core/src/routes/auth.ts` — existing `/register`, `/login`, `/change-password` routes; mount the new `/forgot-password` and `/reset-password` here.
- `vigil-core/src/middleware/bearerAuth.ts` — Phase 110 iat gate (no changes needed; just confirm the gate fires on old JWTs after password_changed_at bump).
- `vigil-core/src/db/schema.ts` — Drizzle schema location; add `passwordResetTokens` table object alongside `users`.
- `vigil-core/drizzle/` — migration sequence; pick next free number after Phase 110's 0015 + Phase 108's 0014. Likely 0016.
- `vigil-pwa/src/api/client.ts` — `vigilFetch` + `storeKey` (don't store anything on reset success — D-12 says no auto-login).
- `vigil-pwa/src/pages/AuthPage.tsx` — login form; add "Forgot password?" link (D-14) and the `?reason=password_reset` banner case (D-19/D-12).
- `vigil-pwa/src/pages/SettingsPage.tsx` — Phase 110 change-password UI (reference for show/hide toggle pattern, single-field design).
- `vigil-pwa/src/main.tsx` or wherever routes are wired — add `/auth/forgot` and `/auth/reset` routes.

## External docs (planner may read via WebFetch / context7)

- `@node-rs/argon2` — already in vigil-core deps; `verify(hash, password)` for the timing-attack dummy on miss.
- Hono rate-limiter middleware — search existing repo first; if none present, evaluate `hono-rate-limiter` or roll a small LRU-based one.
- Drizzle migration generator vs hand-authored SQL — Phase 110 went hand-authored due to drizzle-kit snapshot ordering issues (D-02 in Phase 110 CONTEXT). Likely same call here unless drizzle-kit is healthier now.

## Reusable Assets

- `sendPasswordResetEmail` + `EmailSendResult` + `hashRecipient` from `email-service.ts`.
- Argon2 config from existing register/change-password routes (don't introduce new params).
- Drizzle schema + hand-authored SQL migration pattern from Phase 110.
- `vigilFetch` + 401 handling — already wired.
- AuthPage form pattern — extend with new form variants.
- Global rate limiter (Phase 44, 100 req/60s) — still applies on top of the per-endpoint limits in D-04 / D-13.
- Phase 111 `vigil-core/scripts/smoke-test-email.ts` — useful pattern reference for an end-to-end forgot→reset smoke if planner wants one.

## Established Patterns

- Discriminated-union return types for service-layer ops (Phase 111 / calendar-service shape).
- Env-first config (no new envs needed for Phase 112 — `RESEND_API_KEY`, `VIGIL_APP_BASE_URL`, `JWT_SECRET`, argon2 config all already present).
- Hand-authored idempotent SQL migrations (`IF NOT EXISTS`, ordered by `when` not idx — Phase 110 migration gotcha).
- Plan-04 backfill pattern from Phase 110 (`backfill = column DEFAULT created_at`) — N/A here (new table, no backfill).
- Atomic single-use enforcement via `UPDATE ... RETURNING` (this phase establishes the pattern; Phase 113 reuses).
- Show/hide password toggle via emoji eye-icons (Phase 110 D-17).

## Integration Points

- **Phase 113 (AUTH-11):** reuses `password_reset_tokens` table with `type='email_verify'`. Phase 112's CHECK constraint allows it; Phase 113 just inserts/claims rows with the new type.
- **Phase 110 bearerAuth gate:** automatically invalidates JWTs whose iat predates `password_changed_at`. Phase 112 just bumps the column; the gate does the rest.
- **Phase 111 email transport:** `sendPasswordResetEmail` is already in production (Resend domain verified, RESEND_API_KEY on Railway, smoke test confirmed inbox + DKIM/SPF/DMARC pass).
- **PWA Phase 110 D-19 banner machinery:** `?reason=session_expired` already wired; add `?reason=password_reset` as a sibling case.

## Reviewed Todos (not folded — for traceability)

- None matched (no pending todos referencing forgot-password / reset / AUTH-10 in the todo store).

## Deferred Ideas

### Confirmation email on successful password reset (anti-hijack signal)

Phase 110 deferred the change-password equivalent ("we'll send a confirmation email when password changes") under "Confirmation email on successful password change (REQUIREMENTS.md AUTH-09)" — explicit deferral with rationale that anti-hijack notification is more valuable at multi-user scale. Same call here for AUTH-10 — keep symmetry with Phase 110, revisit when user count grows or before the first multi-tenant customer.

If revisited: would add a third call inside the reset-password handler — `sendEmail({to: user.email, subject: "Your Vigil password was just reset", html: ..., text: ...})` after the password update succeeds. Use the already-shipped generic `sendEmail` primitive from email-service.ts.

### Cleanup cron for expired/used tokens

Not load-bearing — `expires_at < now()` filter on every claim handles expired-but-not-used; `used_at IS NOT NULL` handles used. Old rows will accumulate but at single-user scale it's <100 rows/year. Revisit if the table grows past 100k rows or PostgreSQL query plans degrade.

### Per-account lockout after N failed reset-password attempts

Bonus security on top of the rate limit. Skipped because (a) 256-bit entropy on the token makes brute force infeasible, (b) per-IP rate limit already throttles attempts, (c) lockout adds state and customer-support friction without a credible threat at this scale.

### Constant-time response on `/forgot-password` (rather than approximate)

Would require running argon2 to a fixed wall-clock budget regardless of branch — adds complexity for marginal information-leak reduction. SC#1 says "approximate", and the email-existence leak is already low-value (emails are commonly known via other channels).

### Multi-factor / TOTP layer on reset

Would require a separate phase. Not in v3.6 milestone scope.
