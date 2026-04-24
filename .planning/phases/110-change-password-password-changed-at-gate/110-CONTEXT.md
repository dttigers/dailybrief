# Phase 110: Change Password + password_changed_at Gate — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the `POST /v1/auth/change-password` endpoint, the `users.password_changed_at` column + JWT-iat gate in `bearerAuth`, and the PWA inline change-password form inside the Settings → Vigil Account card. This closes **AUTH-09** and creates the `password_changed_at` primitive that Phase 112 (forgot-password / reset-password) will also update.

**In scope:**
1. Schema: `users.password_changed_at TIMESTAMPTZ NOT NULL` (drizzle migration `0015_*`)
2. Route: `POST /v1/auth/change-password` — authenticated, verifies current password, writes new hash + `password_changed_at = NOW()`, returns a freshly-signed JWT so the caller stays logged in
3. Middleware: extend `bearerAuth` Path 2 (JWT) to read `users.password_changed_at` alongside token verification and reject if `jwt.iat < Math.floor(password_changed_at/1000)`
4. PWA: expandable Change Password form inside the `Vigil Account` section of `SettingsPage.tsx`; on success, swap `sessionStorage['vigil_token']` with the new JWT from the response body before any other authenticated request fires

**Out of scope (explicitly):**
- Confirmation email on successful change (deferred — see Deferred Ideas; Phase 111 EMAIL-01 is the enabler)
- Forgot-password / reset-password (Phase 112 AUTH-10; this phase's gate is consumed unchanged)
- Verify-email-on-signup (Phase 113 AUTH-11)
- Password strength meter / common-password dictionary (REQUIREMENTS.md Out-of-Scope)
- Confirm-password field (REQUIREMENTS.md Out-of-Scope — show/hide toggle instead)
- JWT revocation list / token-version counter (REQUIREMENTS.md Out-of-Scope — `password_changed_at` is the cheaper substitute)
- `vk_` bearer keys — unaffected; they have no `iat` claim and the gate only runs on JWT path
- Rate-limiting specific to change-password attempts (global rate limit is sufficient at current scale)

</domain>

<decisions>
## Implementation Decisions

### Schema & Migration (drizzle/0015_*)
- **D-01:** Add `password_changed_at timestamp with time zone NOT NULL` to `users`. Place in `schema.ts` immediately after `updatedAt` (line 38). No separate index — gate reads happen by PK which already has an index.
- **D-02:** Migration follows the 5-step Phase 102/108 template: ADD COLUMN nullable → backfill to `created_at` → SET NOT NULL. No FK/index steps needed (column is a scalar timestamp, not a reference). Wrapped in standard drizzle migrator transaction with `IF NOT EXISTS` / `DO` guards for re-run safety.
- **D-03:** Backfill for existing users: `UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL`. Semantics: "password was set at account creation." Guarantees every existing JWT keeps working on deploy because `jwt.iat ≥ floor(user.created_at.getTime()/1000)` by construction. No user gets kicked out by the deploy itself.
- **D-04:** Next migration filename is `0015_*.sql` (last on disk is `0014_work_order_statuses_user_scoping.sql`). Let `drizzle-kit generate` produce the descriptive suffix; do not hand-rename.

### Gate Precision (bearerAuth middleware)
- **D-05:** Gate formula: `jwt.iat < Math.floor(user.password_changed_at.getTime() / 1000)`. Strict less-than. Truncate the postgres microsecond-precision timestamp down to whole seconds to match JWT's RFC 7519 iat resolution. Any JWT minted AFTER `password_changed_at` has `iat ≥ floor(ts/1000)` and passes; any JWT minted BEFORE has `iat < floor(ts/1000)` and fails.
- **D-06:** Gate lives inside the existing `bearerAuth` middleware, Path 2 (`looksLikeJwt`), immediately after `verifyToken(token)` and before `c.set('userId', userId)`. Single extra `SELECT id, password_changed_at FROM users WHERE id = userId` per JWT request. At current scale (1–few users, 100 req/60s global rate limit, PK-indexed read) the extra round-trip is negligible. `vk_` path (Path 1) is unchanged — those keys have no `iat` to gate.
- **D-07:** If the `users` row is missing for a validly-signed JWT (user deleted mid-session), return 401 with the existing `"Invalid or expired token"` body. Same shape as `verifyToken` failure — keeps response surface symmetric.
- **D-08:** Gate failure error body: `{ "error": "Session expired" }` with status 401. Distinct from the generic `"Invalid or expired token"` so the PWA can route specifically on this to force a re-login (see D-17). No user enumeration concern — gate runs AFTER the JWT is already verified, so the caller is known-authenticated.

### Endpoint Contract (routes/auth.ts)
- **D-09:** Route: `POST /v1/auth/change-password`. Mounted on the same `auth` Hono router as `/auth/register` + `/auth/login`. Placed AFTER the `bearerAuth` dispatcher globally (index.ts:151 pattern) — `c.get('userId')` is guaranteed non-null in the handler, mirroring `/v1/prioritize` (Phase 109 D-09).
- **D-10:** Request body: `{ currentPassword: string, newPassword: string }`. JSON parse errors → 400 `"Invalid JSON body"` (existing auth.ts pattern line 51). Missing/non-string fields → 400 `"currentPassword and newPassword are required"`.
- **D-11:** Flow — (1) `db.select` user by `c.get('userId')`, (2) `verifyPassword(currentPassword, user.passwordHash)` → wrong ⇒ 401 generic `"Invalid credentials"` (exact same body as `/auth/login` line 145), (3) validate new password length `[MIN_PASSWORD=12, MAX_PASSWORD=128]` ⇒ 400 with same length error text as register (line 65), (4) `verifyPassword(newPassword, user.passwordHash)` — if true, reject with 400 `"New password must differ from current"`, (5) `hashPassword(newPassword)`, (6) `db.update(users).set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() })`, (7) `signToken(userId, email)` AFTER the update, (8) return `{ token, user: { id, email } }` with status 200.
- **D-12:** The same-as-current check (step 4) is deliberate. Costs one extra argon2 verify (~50–100ms) on the happy path but pre-empts the "typed my current password twice by accident" no-op that would otherwise bump `password_changed_at` and kick the user out of every other tab/device for zero semantic change.
- **D-13:** Response shape mirrors `/auth/login` line 154 verbatim: `{ token: string, user: { id: number, email: string } }`. No new keys — PWA's existing token-parsing code reuses the same handler.
- **D-14:** Ordering matters: `signToken()` MUST run AFTER the `db.update` commits, so the new JWT's `iat` is ≥ the `password_changed_at` that just landed. If signed before the update, gate math fails and the caller's own just-issued token bounces.

### PWA Form (vigil-pwa/src/pages/SettingsPage.tsx)
- **D-15:** Form lives as an expandable block INSIDE the existing `Vigil Account` section (SettingsPage.tsx:217). Collapsed by default behind a "Change password" button placed next to or below the existing "Sign out" button. Tapping the button expands the form inline; tapping it again (or "Cancel" inside the form) collapses it. Mirrors the Google card's inline confirm-disconnect pattern (SettingsPage.tsx:255-273) so Settings keeps a consistent vocabulary.
- **D-16:** Form fields, exactly two: `currentPassword` (`autocomplete="current-password"`) and `newPassword` (`autocomplete="new-password"`). Each field has an eye-icon toggle (type="password" ↔ type="text") — satisfies REQUIREMENTS.md Out-of-Scope directive `'use show/hide toggle instead of confirm-password field'`. No confirm-password field. No strength meter.
- **D-17:** On success (200 response): (1) write `response.token` to `sessionStorage['vigil_token']` BEFORE any other fetch fires, (2) show inline green success text "Password changed" beneath the form, (3) collapse the form after 2s, (4) clear both password input values. Banner state from existing `SettingsPage.tsx` banner hook may be reused if it simplifies the flow; otherwise a local component-level state is fine.
- **D-18:** On error: (1) HTTP 401 from change-password specifically → inline red "Current password is incorrect" (PWA can safely route on 401 here because the endpoint is POST-auth — the caller is already past `bearerAuth`, so a 401 means current-password-verify failed, not token invalid). (2) HTTP 400 → surface server error body `error` string verbatim (covers length validation + same-as-current case). (3) HTTP 500 / network failure → "Something went wrong. Try again."
- **D-19:** The `bearerAuth` 401 `"Session expired"` body (D-08) is handled at the global PWA fetch layer, NOT inside the change-password form specifically. A utility/wrapper around the existing fetch helper should detect that specific body and force navigation to `/auth` with the form state cleared. This is a cross-cutting behavior — every authenticated PWA request will start encountering it once this phase ships, not just change-password.

### Claude's Discretion
- Exact wording of inline success/error messages (semantic invariants above are the contract).
- Whether D-19's global 401 handler is a new tiny utility file or an Edit to the existing `client.ts` fetch wrapper. Planner's call — reuse existing if a natural seam exists.
- Whether the change-password button is text-only, icon + text, or inside an overflow menu. Match existing Settings vocabulary.
- Test split — unit tests on the route handler (mock db), migration test (password_changed_at column exists, NOT NULL, backfill worked), bearerAuth gate test (old JWT rejected with 401 "Session expired"). Whether these split across 3 plans or combine. Planner's call.
- TODO-in-place rewrites — if `bearerAuth` middleware or `/auth/login` has any pre-existing TODO markers referencing password-change, rewrite them in-place per Phase 108 D-15/D-16 hygiene. Otherwise N/A.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 110 Specification
- `.planning/REQUIREMENTS.md` (AUTH-09) — requirement text and acceptance criteria
- `.planning/ROADMAP.md` §"Phase 110: Change Password + password_changed_at Gate" (lines 522-532) — goal, four success criteria, W-01/W-02 dependency note (logical not hard)

### Prior-Phase Decisions (reused or informing)
- `.planning/milestones/v3.4-phases/102-multi-user-foundation/102-CONTEXT.md` — argon2id + HS256 JWT stack; D-11 claim-flow pattern; D-12 JWT lifetime 30d; D-14 JWT payload shape (sub=userId, email, iat, exp)
- `.planning/milestones/v3.4-phases/102-multi-user-foundation/102-01-PLAN.md` — 5-step migration template (ADD nullable → backfill → SET NOT NULL) that Phase 110 D-02 reuses
- `.planning/phases/104-pwa-auth-ui-browser-observability/104-CONTEXT.md` — D-04 sessionStorage vs localStorage decision; generic 401 body vs detailed (Phase 110 D-08 deliberately introduces a DISTINCT 401 body for session-expired because this is post-auth, not pre-auth)
- `.planning/phases/108-work-order-statuses-userid-scoping-isolation-test/108-CONTEXT.md` §D-15/D-16 — in-place TODO rewrite hygiene pattern (applies if this phase touches any existing TODO markers)
- `.planning/phases/109-per-user-scheduler-fan-out/109-CONTEXT.md` §D-07/D-13 — same in-place rewrite pattern applied to three TODO(AUTH-06+) sites

### Code Anchors (planner + researcher must read)
- `vigil-core/src/db/schema.ts:27-41` — `users` table definition; target for the new `passwordChangedAt` column
- `vigil-core/src/routes/auth.ts:1-156` — existing `/auth/register` + `/auth/login` handlers; factory + validation + error-shape patterns the new `/auth/change-password` must follow
- `vigil-core/src/routes/auth.ts:19-20` — `MIN_PASSWORD=12` / `MAX_PASSWORD=128` constants to reuse verbatim
- `vigil-core/src/utils/password.ts` (42 lines) — `hashPassword` / `verifyPassword` helpers (argon2id @node-rs bindings)
- `vigil-core/src/utils/jwt.ts:30-37` — `signToken(userId, email)` contract; D-14 requires calling AFTER `password_changed_at` is committed
- `vigil-core/src/middleware/auth.ts:89-102` — Path 2 (JWT) branch of `bearerAuth`; gate insertion point is immediately after `verifyToken(token)` at line 92 and before `c.set('userId', userId)` at line 97
- `vigil-core/src/routes/auth.test.ts` — existing register+login test patterns; new change-password tests follow the same shape (inject `db` mock, POST with `Authorization: Bearer <jwt>`)
- `vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql` — last migration on record; confirms next filename is `0015_*.sql`
- `vigil-pwa/src/pages/SettingsPage.tsx:215-231` — `Vigil Account` section; target for the inline change-password form block (D-15)
- `vigil-pwa/src/pages/SettingsPage.tsx:247-273` — Google card's inline confirm pattern; UX vocabulary template
- `vigil-pwa/src/pages/AuthPage.tsx:93-112` — existing password-field input + autocomplete pattern to mirror (D-16)
- `vigil-pwa/src/lib/client.ts` (path assumed — planner verifies) — global fetch helper / sessionStorage token read; insertion point for D-19 session-expired handler

### Tooling
- `vigil-core/scripts/migrate-102-seed.ts` — Phase 102 seed backfill utility; NOT reused here (backfill is pure SQL `UPDATE`, no session var needed) but worth reading for migration-script-pattern context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`hashPassword` / `verifyPassword`** (`vigil-core/src/utils/password.ts`) — argon2id wrappers; change-password handler calls both (verify twice: once on current, once for the same-as-current check, then hash once on new).
- **`signToken(userId, email)`** (`vigil-core/src/utils/jwt.ts:30`) — reused verbatim; call AFTER the `db.update` commits per D-14.
- **`auth` Hono router** (`vigil-core/src/routes/auth.ts:38`) — mount `/auth/change-password` on the same router; inherits the existing global `bearerAuth` dispatcher wiring downstream in `index.ts`.
- **`Vigil Account` card** (`vigil-pwa/src/pages/SettingsPage.tsx:217`) — existing section with email + Sign out; change-password form expands INSIDE this card (D-15).
- **Google card inline-confirm pattern** (`vigil-pwa/src/pages/SettingsPage.tsx:255-273`) — UX vocabulary template for the expand/cancel/submit flow inside a card.
- **`MIN_PASSWORD` / `MAX_PASSWORD` constants** (`vigil-core/src/routes/auth.ts:19-20`) — reused verbatim; same length-error string ensures /auth/register and /auth/change-password have identical validation UX.

### Established Patterns
- **argon2id + HS256 JWT** (Phase 102) — no deviation.
- **Factory/DI-free routes for auth** — `auth.ts` doesn't use the factory DI pattern the other routes do; it reads `db` directly. Change-password follows the same direct-import style to keep `/auth` internally consistent. Unit tests mock via module-boundary injection (see `auth.test.ts`).
- **Timing-safe verify on unknown user** (`auth.ts:140-142` DUMMY_HASH) — N/A here because change-password runs POST-auth; the user is known, no enumeration surface.
- **Generic 401 body** — `/auth/login` uses `"Invalid credentials"` for both wrong email and wrong password. Change-password reuses the exact string for wrong current password (D-11 step 2).
- **In-place TODO rewrites** — Phase 108 D-15/D-16 + Phase 109 D-07/D-13. Applies only if an existing TODO marker gets touched.

### Integration Points
- **`bearerAuth` Path 2 (JWT)** — `src/middleware/auth.ts:89-102`. Gate insertion point; D-05 / D-06 describe the formula and placement.
- **`users` table Phase 102 migration** — `drizzle/0012_multi_user_foundation.sql` established the schema; Phase 110's `0015_*` adds one column using the same DO-block / IF NOT EXISTS idiom.
- **PWA `sessionStorage['vigil_token']`** — Phase 104 D-04 established this storage key; D-17 swaps the value in-place after change-password success.
- **Cross-cutting 401 handler (D-19)** — after this phase ships, every authenticated PWA request can start returning 401 `"Session expired"` if the user changes their password on another device. The global fetch helper must route on that body and kick back to `/auth`. This is a dependency for correct UX on ALL authenticated pages, not just Settings.

</code_context>

<specifics>
## Specific Ideas

- **D-14 ordering is load-bearing.** If `signToken()` runs before the DB update commits, the new JWT's `iat` can equal `floor(password_changed_at/1000)` — gate uses strict-less-than (D-05), so the just-issued JWT would pass, but only because of a race window. Writing the DB first and then signing guarantees `iat > floor(ts/1000)` monotonically. Tests should pin this ordering explicitly.
- **D-19 is a phase-wide side-effect.** Adding the gate means *any* user changing their password on device A silently invalidates their JWT on device B. Without the global PWA 401→`/auth` handler, device B's next poll or fetch will fail and the user will see cryptic errors. Planner must ensure D-19 lands in the same phase as the gate, not as a follow-up.
- **Backfill is a pure SQL UPDATE**, not a separate TS script like `migrate-102-seed.ts`. The seed-email session-var trick is only needed when the backfill target is a dynamically-looked-up row; here every row gets `password_changed_at = created_at` unconditionally. Inline the UPDATE in the 0015 migration file between the ADD COLUMN and the SET NOT NULL steps.
- **Test matrix for the gate**: (1) JWT with `iat < floor(password_changed_at/1000)` returns 401 `"Session expired"`. (2) JWT with `iat == floor(password_changed_at/1000)` also returns 401 (strict less-than — but the new JWT from change-password is guaranteed `iat > floor(ts/1000)` so this case is theoretical). (3) JWT with `iat > floor(password_changed_at/1000)` passes. (4) `vk_` bearer key is unaffected — sets `userId` without touching `password_changed_at`. (5) Missing user row for a valid JWT returns 401 with existing `"Invalid or expired token"` body (D-07).
- **`updatedAt` bump**: the users table has `updatedAt` (line 36) already. The change-password UPDATE should bump both `passwordChangedAt` AND `updatedAt` to `new Date()` for audit-trail consistency with the claim-flow update at `auth.ts:101`.
- **No PWA /auth page changes needed.** The login flow and register flow are unchanged. Only SettingsPage + the global fetch helper touch frontend code.
- **No new env vars.**
- **No changes to `vk_` key behavior.** The gate runs only on JWT path; `vk_` keys have no `iat` claim and bypass the gate structurally.

</specifics>

<deferred>
## Deferred Ideas

### Confirmation email on successful password change (REQUIREMENTS.md AUTH-09)
The requirement text calls for a confirmation email as an anti-hijack signal. This phase ships without the email hook because Phase 111 (EMAIL-01 — Resend + DNS) is the enabler and is sequenced after Phase 110. Adding a no-op stub now would land dead code and violate the "TODO in-place, don't stub" hygiene from Phase 108/109.

**Follow-up plan:** Open a Phase 111.1 insert (or fold into Phase 112's planning) to add the `sendChangeConfirmation(userId)` hook inside the change-password handler right before `return c.json(...)`. Non-blocking (fire-and-forget); email failure should not reject the password change. Touches exactly `routes/auth.ts:/auth/change-password` + a new `services/email-service.ts` import. Single-plan insert.

### Rate-limiting wrong-current-password attempts
Global rate limit (100 req/60s, Phase 44) is sufficient at current scale. A per-endpoint counter (e.g., 5 wrong currents in 15min → lock) would add state + sweep logic with no credible threat at single-user scale (endpoint is post-auth; a compromised JWT is already a session-hijack incident, not a brute-force one). Revisit when user count > ~10 or before first multi-tenant customer.

### Common-password / zxcvbn dictionary check
Explicitly ruled out by REQUIREMENTS.md Out-of-Scope: "Password strength meter | Argon2id with no explicit rules is fine; adding a strength meter is scope creep." Preserved here so future phases know it was considered and deliberately rejected.

### JWT revocation list / token_version counter
Explicitly ruled out by REQUIREMENTS.md Out-of-Scope: "Needed to invalidate arbitrary sessions on demand, but v3.6 only needs to invalidate JWTs issued before a password reset — solved with a cheaper `password_changed_at` gate." This phase IS the cheaper gate. Revisit only if the v3.7 "Sign out all other sessions" UI (AUTH-13 in REQUIREMENTS deferred list) gets scheduled.

### `vk_` key rotation on password change
Currently, changing the PWA password does NOT invalidate a user's `vk_` bearer keys (Mac app / G2 plugin / browser extension all still authenticated). This matches the REQUIREMENTS threat model — `vk_` keys are long-lived client credentials, not session tokens. If a user-facing "Reset all my keys" button is desired in the future, it's a separate Phase 110.1 or v3.7 addition; out of scope here.

### None-of-the-above candidates considered
- Cookie-based auth instead of Bearer — rejected (Phase 104 D-04 sessionStorage decision; not revisiting)
- Confirm-password field on form — rejected (REQUIREMENTS Out-of-Scope: CXL 56% conversion hit; show/hide toggle wins)
- Caching `password_changed_at` in JWT claims — rejected (D-06 discussion; breaks Phase 112 clean invalidation)
- Forcing re-login via /auth/login after success — rejected (D-session-swap discussion; adds failure mode + keeps password in memory)

</deferred>

---

*Phase: 110-change-password-password-changed-at-gate*
*Context gathered: 2026-04-23*
