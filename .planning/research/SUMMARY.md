# Project Research Summary

**Project:** Vigil v3.6 — Multi-User Completion, Auth UX & Safari Parity
**Domain:** Auth flows + transactional email + Safari extension parity (subsequent milestone on existing app)
**Researched:** 2026-04-22
**Confidence:** HIGH

## Executive Summary

v3.6 is a correctness-and-completeness milestone, not a greenfield build. It closes three open categories: (1) multi-user data isolation debt from v3.4 that was explicitly deferred — `work_order_statuses` is the last table without `userId` scoping and the scheduler still runs for only the seed user; (2) auth UX completeness — change-password, forgot-password, and email verification are expected features in any credentialed system and are fully absent today; (3) Safari extension parity — the Safari popup is running Phase 84 behavior while Chrome shipped Phase 94 quick-capture, creating a visible feature gap for Safari users. The research confirms all three areas are well-understood with clear implementation paths on the existing stack.

The recommended approach is a 4-wave build with no new frameworks and minimal new dependencies. The only new infrastructure is Resend for transactional email (`npm install resend @react-email/components @react-email/render react@18 react-dom@18` in vigil-core) plus one new env var (`RESEND_API_KEY`). Everything else extends existing patterns: argon2id + HS256 JWT for auth, Drizzle migrations for schema, DI-seamed services for testability, and direct `chrome.*` calls for Safari. The most important architectural decision is adding `password_changed_at` to the `users` table and checking `jwt.iat < password_changed_at` in the bearerAuth middleware — without this gate, stateless JWTs remain valid after a password reset, which defeats the security purpose of the entire forgot-password flow.

The primary risks are security-shaped, not complexity-shaped. The 25 pitfalls catalogued in PITFALLS.md cluster around four themes: token handling (store hash not plaintext; atomic single-use UPDATE; no JWT in URLs), email deliverability (DKIM/SPF/DMARC must be set before first send; link tracking must be disabled or Apple Mail pre-fetch consumes single-use tokens), migration ordering (backfill before NOT NULL constraint), and cross-cutting scope (all four workOrderStatuses call sites need userId scoping, not just the status-specific route). None of these are novel — the codebase already demonstrates the right patterns (DUMMY_HASH timing-safety, 0012 backfill migration, PostHog lazy-null-init) and v3.6 must simply apply them consistently to the new surface area.

---

## Key Findings

### Recommended Stack

The existing stack handles v3.6 with five new packages in vigil-core only. vigil-pwa and the Safari extension require zero new dependencies. Install `resend@^6.12.2` (Resend Node SDK), `@react-email/components` + `@react-email/render@^2.0.4` (email templates as typed JSX), and `react@18 react-dom@18` as peer deps for react-email. Pin React 18 in vigil-core — vigil-pwa uses React 19 in a separate package.json; no conflict. Do not add Lucia, Auth.js, or better-auth — migrating the existing argon2id + HS256 JWT + three-path bearerAuth dispatcher across 11-table FK schema has no net benefit for adding 3 endpoints and 5 columns.

**Core technologies:**
- `resend@^6.12.2`: transactional email (3,000/month free, TypeScript-native SDK, one env var) — only viable choice at this scale vs. Postmark's 100/month free tier or SES's four-credential IAM setup
- `@react-email/render@^2.0.4`: server-side JSX to HTML email string — same component model as PWA, compiler catches missing template vars, handles inline-CSS/table layout automatically
- `node:crypto` (built-in): reset token generation — `crypto.randomBytes(32)` + SHA-256 at rest + `timingSafeEqual`; zero new dependencies; do NOT use argon2id on tokens (CSPRNG already has 2^256 entropy)
- Direct `chrome.*` calls: Safari extension — Safari MV3 already returns Promises from `chrome.*`; webextension-polyfill has incomplete MV3 support and adds indirection for zero gain
- **JSX tsconfig override required:** `vigil-core/src/email/tsconfig.json` must set `"jsxImportSource": "react"` to override vigil-core root `"jsxImportSource": "hono/jsx"` — without this, react-email templates fail to compile

**New env vars (one total):**
- `RESEND_API_KEY=re_xxxxxxxxx` in Railway Variables + vigil-core/.env.example
- DNS required before first send: SPF TXT on send.vigilhub.io, DKIM TXT at resend._domainkey.vigilhub.io, MX on send.vigilhub.io, DMARC TXT on _dmarc.vigilhub.io with `adkim=s`

### Expected Features

**Must have (table stakes, P1):**
- AUTH-09 Change Password — current password re-entry required; inline form in SettingsPage Vigil Account card; stay logged in after change; `password_changed_at` updated on success
- AUTH-10 Forgot Password — opaque 32-byte hex token; SHA-256 hash in `password_reset_tokens` (NOT plaintext); always-200 enumeration protection; 1-hour TTL; atomic single-use UPDATE RETURNING; post-reset notification email
- AUTH-11 Email Verification — soft-gate banner not hard block (Vigil is a closed allowlist); `emailVerifiedAt` backfilled to `created_at` for existing users; 24-hour TTL; register hook fires verification email fire-and-forget
- EXT-02 Safari Quick-Capture Parity — freeform textarea (no pre-fill), URL checkbox, Cmd+Enter, triage polling badge — pure popup.html + popup.js delta from Chrome Phase 94; no server changes, no auth model changes
- W-01 work_order_statuses userId scoping — add `user_id` FK + composite PK; update four call sites (two in work-order-status.ts, two in work-orders.ts); backfill follows 0012 pattern
- SCHED-01 per-user scheduler fan-out — replace seed-user singleton with all-users loop; per-user try/catch with `continue` not `return`; getCacheKey() must include userId

**Should have (P2):**
- W-02 cross-user brief PDF isolation test — route is already scoped; this is coverage only; add to cross-user-isolation.test.ts
- Post-change confirmation email (AUTH-09 + Resend infra) — low marginal cost once AUTH-10 provider is live

**Defer to v3.7:**
- JWT auth migration for Safari/Chrome extensions — vk_ tokens work; defer until vk_ deprecation is planned
- Sign-out-other-sessions for AUTH-09
- Global keyboard shortcut to open Safari extension popup

**Explicit anti-features (do not build):**
- Confirm-password field — use show/hide toggle instead (56% conversion lift per CXL data)
- Hard email verification block — hostile to trusted allowlist users
- JWT as reset token — cannot be made single-use without defeating statelessness
- Auto-login via JWT-in-URL after reset/verify — JWT visible in PostHog, browser history, server logs

### Architecture Approach

v3.6 extends the existing Hono + Drizzle + PostgreSQL architecture with three new DB migrations (0014, 0015, 0016), one new service file (`email-service.ts`), two new PWA pages (ForgotPasswordPage, ResetPasswordPage), and two Safari extension resource files updated. The `password_reset_tokens` table is designed with a `type` column from the start so AUTH-10 and AUTH-11 share a single table (`type='password_reset'` and `type='email_verify'`) — avoiding a second migration for AUTH-11. The 4-wave build order ensures no blocking during development.

**Major components:**
1. `vigil-core/src/services/email-service.ts` (NEW) — DI-seamed Resend wrapper with `sendPasswordReset` and `sendEmailVerification`; lazy null-init following PostHog pattern; shared by AUTH-10 and AUTH-11
2. `vigil-core/src/routes/auth.ts` (EXTENDED) — 5 new endpoints: change-password, forgot-password, reset-password, send-verify-email, verify-email/:token; forgot/reset/verify-email added to bearerAuth skip block in index.ts
3. Migrations 0014/0015/0016 — work_order_statuses userId + composite PK; password_reset_tokens with type column; emailVerifiedAt on users with backfill
4. `generate-scheduler.ts` (REFACTORED) — tick() replaces seed-user singleton with getAllUsersForScheduling() loop; per-user try/catch; prioritize.ts getCacheKey() receives userId
5. Safari extension Resources/ (2 FILES UPDATED) — popup.html gets URL checkbox + shortcut hint + dynamic success span; popup.js gets Phase 94 initCaptureView with triage polling; Xcode rebuild + re-sign required

**Cross-cutting gate — add to users table and bearerAuth:**
`password_changed_at TIMESTAMP WITH TIME ZONE` — bearerAuth JWT path checks `jwt.iat < password_changed_at` after verifyToken() succeeds; one indexed DB lookup per JWT request; both AUTH-09 and AUTH-10 must update this column on success; without it stateless JWTs remain valid 30 days after a password reset.

### Critical Pitfalls

1. **Reset token stored plaintext in DB** — column must be `token_hash TEXT NOT NULL` (SHA-256 of raw token); raw 64-char hex goes in email URL; hash goes in DB; mirror the existing `vk_` key pattern
2. **Stateless JWT valid after password reset** — add `password_changed_at` to users; check `jwt.iat < password_changed_at` in bearerAuth; applies to both AUTH-09 and AUTH-10; skipping this makes the reset flow security theater
3. **Apple Mail pre-fetch consumes single-use token** — link tracking is ON by default in Resend; set `clickTracking: false` on every email with a token link; test by inspecting raw email source href
4. **W-01 migration FK before backfill** — 5-step sequence required: ADD COLUMN nullable, DO $$ backfill, ALTER COLUMN SET NOT NULL, ADD CONSTRAINT FK, CREATE INDEX; any reordering fails the Railway deploy
5. **Four workOrderStatuses call sites need userId** — two in work-order-status.ts (SELECT, upsert), two in work-orders.ts (statusMap build, DELETE cascade); work-orders.ts calls are the most likely to be missed; run grep after W-01
6. **emailVerifiedAt not backfilled for existing users** — AUTH-11 migration must UPDATE users SET `email_verified_at = created_at` WHERE `email_verified_at IS NULL`; without this the seed user is locked out immediately after Railway deploy
7. **DKIM/SPF/DMARC not configured before first send** — `dig TXT _dmarc.vigilhub.io` must return valid record before AUTH-10 ships; silent deliverability failure is invisible in Railway logs
8. **Email enumeration via timing** — forgot-password always returns 200 in approximately equal time for known and unknown emails; add constant-time floor; same threat DUMMY_HASH guards on login

---

## Implications for Roadmap

### Phase 1 (Wave 1A): W-01 + W-02 — Multi-User Debt Closure

**Rationale:** Closes the last open multi-user isolation gap from v3.4. No email infra required. All patterns established. Highest correctness value, lowest risk.
**Delivers:** work_order_statuses rows isolated per user; all four call sites scoped; upsert conflict target updated to composite; W-02 coverage test added to cross-user-isolation.test.ts
**Addresses:** W-01, W-02
**Avoids:** Pitfall 12 (FK before backfill ordering), Pitfall 13 (four call sites), Pitfall 14 (stale upsert conflict target)
**Research flag:** SKIP — established 0012 migration pattern

### Phase 2 (Wave 1B): AUTH-09 — Change Password

**Rationale:** No email infrastructure required. Introduces `password_changed_at` column and bearerAuth gate which AUTH-10 also inherits — building it here eliminates a coordination point later.
**Delivers:** `POST /v1/auth/change-password`; inline SettingsPage form (no new route); `password_changed_at` on users; bearerAuth `iat < password_changed_at` gate; show/hide password toggle
**Addresses:** AUTH-09
**Avoids:** Pitfall 3 (stateless JWT valid after password change)
**Research flag:** SKIP — pure argon2id verify + users table update

### Phase 3 (Wave 1C): EXT-02 — Safari Extension Quick-Capture Parity

**Rationale:** Fully independent of all server work. Pure popup.html + popup.js delta. Can run on MacBook Pro in parallel with any server phase.
**Delivers:** Safari popup matches Chrome Phase 94 — freeform textarea, URL checkbox, Cmd+Enter, triage polling badge; Xcode rebuild + re-sign + UAT
**Addresses:** EXT-02
**Avoids:** Pitfall 24 (test Cmd+Enter in Safari FIRST before writing any code), Pitfall 25 (re-sign step explicitly in plan)
**Research flag:** SKIP — confirmed Chrome APIs work in Safari MV3; surgical diff is known

### Phase 4 (Wave 2): Email Foundation — Resend + DNS + email-service.ts

**Rationale:** Hard dependency for AUTH-10 and AUTH-11. DNS propagation can delay testing — isolating this phase prevents it from blocking AUTH-10 implementation work.
**Delivers:** email-service.ts with DI seams; npm install in vigil-core; RESEND_API_KEY in Railway; vigilhub.io DNS records configured; deliverability test email confirmed in inbox; startup warning if key unset; vigil-core/src/email/tsconfig.json JSX override
**Avoids:** Pitfall 17 (link tracking disabled), Pitfall 18 (Railway trailing newline — .trim()), Pitfall 19 (DKIM/SPF/DMARC verified before send), Pitfall 20 (lazy null-init)
**Research flag:** DNS propagation timing is variable — schedule with buffer before Phase 5 UAT

### Phase 5 (Wave 3A): AUTH-10 — Forgot Password Email Flow

**Rationale:** Most architecturally novel feature. Highest pitfall concentration (8 of 25). Build after email foundation proven working.
**Delivers:** POST /v1/auth/forgot-password + POST /v1/auth/reset-password (both public); migration 0015 (password_reset_tokens with type column); ForgotPasswordPage.tsx + ResetPasswordPage.tsx; enumeration protection; atomic single-use UPDATE RETURNING; post-reset notification email; password_changed_at update on reset
**Addresses:** AUTH-10
**Avoids:** Pitfall 1 (token_hash), Pitfall 2 (JWT after token verify — only after atomic UPDATE), Pitfall 4 (timing floor), Pitfall 5 (per-email rate limit), Pitfall 6 (no email= in URL), Pitfall 7 (atomic UPDATE RETURNING), Pitfall 8 (PLACEHOLDER_HASH guard)
**Research flag:** REVIEW PITFALLS.md checklist before starting implementation — 8 pitfalls concentrated here

### Phase 6 (Wave 3B): AUTH-11 — Email Verification on Signup

**Rationale:** Reuses email-service.ts and password_reset_tokens (type='email_verify') from AUTH-10. Only new migration is emailVerifiedAt column on users (0016) with backfill.
**Delivers:** Verification email on register (fire-and-forget); POST /v1/auth/send-verify-email (bearer); GET /v1/auth/verify-email/:token (public); emailVerifiedAt on users with backfill; verification banner in SettingsPage; GET /v1/me returns emailVerifiedAt
**Addresses:** AUTH-11
**Avoids:** Pitfall 9 (token referrer leak — history.replaceState), Pitfall 10 (no JWT in post-verify URL), Pitfall 11 (existing user lockout — backfill migration)
**Research flag:** SKIP — reuses AUTH-10 patterns; migration follows 0012 backfill model

### Phase 7 (Wave 4): SCHED-01 — Per-User Scheduler Fan-Out

**Rationale:** No inter-feature dependencies. Can slot into Wave 1 if developer prefers to batch all multi-user items; Wave 4 avoids context-switching during auth build sequence.
**Delivers:** generate-scheduler.ts tick() iterates all users sequentially; per-user try/catch with continue; getCacheKey() includes userId; test updated for multi-user DI injection
**Addresses:** SCHED-01
**Avoids:** Pitfall 15 (one user error blocks others), Pitfall 16 (prioritize cache cross-user data leak)
**Research flag:** SKIP — DI-seamed service with established test patterns

### Phase Ordering Rationale

- AUTH-09 builds `password_changed_at` and the bearerAuth gate; AUTH-10 inherits both at zero coordination cost. The gate must exist before the first password reset ships to production.
- Email DNS setup is isolated as Phase 4 because propagation timing is non-deterministic. Phases 5 and 6 depend on Resend being live and verified — Phase 4 acts as the buffer.
- The 0015 migration (password_reset_tokens) must include the `type` column even if AUTH-11 ships later. AUTH-10 creates the table; AUTH-11 reuses it. No second migration required.
- EXT-02 has no server dependency and can run on the MacBook Pro in parallel with any server phase. Scheduling it as Phase 3 (alongside server Wave 1) is practical.
- SCHED-01 has no ordering constraint. Wave 4 placement is preference; move earlier if the developer wants all multi-user items grouped.

### Research Flags

Phases needing deeper investigation during planning:
- **Phase 4 (Email Foundation):** DNS record configuration is environment-specific. Confirm vigilhub.io DNS provider and existing records before writing phase plan. Resend dashboard generates exact DKIM key value after domain registration — that step happens first.
- **Phase 5 (AUTH-10):** Security-critical. Phase plan should walk through PITFALLS.md checklist explicitly before execution. Integration test plan must cover: tampered token → 400, expired token → 400, double-click race, unknown email timing.

Phases with standard patterns (skip research-phase):
- **Phase 1 (W-01/W-02):** 0012 migration and cross-user-isolation.test.ts are the reference
- **Phase 2 (AUTH-09):** Pure argon2id verify + users table update
- **Phase 3 (EXT-02):** Chrome Phase 94 popup is the reference; Safari APIs confirmed
- **Phase 6 (AUTH-11):** Reuses AUTH-10 patterns; migration follows 0012 backfill
- **Phase 7 (SCHED-01):** DI-seamed scheduler with established test structure

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Resend SDK official docs verified; react-email GitHub confirmed; JSX tsconfig override pattern corroborated by Hono issue #3197; Safari chrome.* compatibility confirmed via MDN official docs |
| Features | HIGH | Auth patterns grounded in OWASP cheat sheets; Safari gap derived from direct popup.js code diff (first-party); email verification UX from SuperTokens + Authgear practitioner research |
| Architecture | HIGH | All integration points derived from direct codebase inspection of actual source files; migration strategy derived from reading 0012 SQL; no assumptions |
| Pitfalls | HIGH | All 25 pitfalls verified against direct code inspection; prior-art patterns (DUMMY_HASH, 0012 backfill, PostHog lazy-init) confirmed in codebase |

**Overall confidence: HIGH**

### Gaps to Address

- **Resend domain verification timing:** DNS propagation for vigilhub.io SPF/DKIM/DMARC is variable. Phase 4 plan must include a "wait for propagation + verify with dig" step. Do not assume propagation is instant.
- **Safari Cmd+Enter keyboard event priority:** PITFALLS.md flags Safari may swallow Cmd+Enter before extension JS fires. Test this empirically as the first step of Phase 3 — if swallowed, build fallback UX before any other EXT-02 work.
- **Vigil Account card layout decision:** AUTH-09 inline form placement needs a decision: expand inline in the existing Vigil Account section vs. link to `/settings/change-password` separate route. Architecture research recommends inline (no new route); confirm in Phase 2 plan.
- **password_reset_tokens cleanup strategy:** Expired tokens accumulate. Lazy-delete-on-lookup is the simplest approach — delete expired rows when a lookup finds them. Specify this in Phase 5 plan to avoid table bloat.
- **W-01 primary key strategy:** Architecture research recommends surrogate `id SERIAL` PK + composite unique index `(user_id, case_number)`. Confirm this vs. composite PK approach in Phase 1 plan — either works but surrogate PK is more consistent with the rest of the schema.

---

## Sources

### Primary (HIGH confidence)
- OWASP Forgot Password Cheat Sheet — token storage, timing enumeration, single-use enforcement, post-reset notification
- OWASP Authentication Cheat Sheet — current password re-entry, session management on password change
- MDN WebExtensions: Chrome incompatibilities — browser.* vs chrome.* namespace; Promise support in Safari MV3
- Resend official Node.js docs (resend.com/docs/send-with-nodejs) — SDK, env var, {data, error} return shape
- Resend GitHub releases — v6.12.2 latest confirmed 2026-04-20
- Resend pricing page — 3,000/month, 100/day, 1 domain free tier verified 2026-04-22
- Apple Developer docs: Assessing Safari Web Extension Browser Compatibility
- Direct codebase inspection: vigil-core/src/db/schema.ts, routes/auth.ts, routes/work-order-status.ts, routes/work-orders.ts, services/generate-scheduler.ts, routes/prioritize.ts, middleware/auth.ts, analytics/posthog.ts, drizzle/0012_multi_user_foundation.sql
- Direct code diff: vigil-extension/popup.js (Chrome Phase 94) vs vigil-safari-extension/.../popup.js (current)

### Secondary (MEDIUM confidence)
- Hono GitHub issue #3197 — JSX conflict root cause; per-directory tsconfig override as resolution
- react-email GitHub (resend/react-email) — @react-email/render 2.0.4 confirmed; 920k+ weekly downloads
- SuperTokens email verification flow — 24h TTL norm; banner vs hard-block recommendation
- DEV article: Resend + react-email + Hono — monorepo tsconfig override pattern corroborated
- Apple Mail Privacy Protection link pre-fetch behavior — Apple Developer Forums + lapcatsoftware.com
- webextension-polyfill GitHub issue #329 — MV3 support incomplete as of 2025
- CXL A/B test data — 56.3% conversion lift from removing confirm-password field

### Tertiary (LOW confidence)
- buildmvpfast.com email API cost comparison (April 2026) — matches official pricing pages
- zuplo.com token expiry best practices 2025 — multiple sources agree on 1h reset, 24h verify

---
*Research completed: 2026-04-22*
*Synthesized: 2026-04-23*
*Ready for roadmap: yes*
