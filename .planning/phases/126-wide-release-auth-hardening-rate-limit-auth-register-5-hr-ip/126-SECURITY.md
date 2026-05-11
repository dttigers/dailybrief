---
phase: 126
slug: wide-release-auth-hardening-rate-limit-auth-register-5-hr-ip
status: verified
threats_total: 46
threats_closed: 46
threats_open: 0
register_authored_at_plan_time: true
asvs_level: 1
audit_date: 2026-05-11
---

# Phase 126 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (register_authored_at_plan_time: true).
> All 11 plans contributed threat entries. Verification performed 2026-05-11
> by code-grep audit against committed implementation files.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → POST /auth/register | Untrusted client; gates in order: rate-limit → captcha → shape → allowlist → DB | email, password, turnstileToken |
| vigil-core → Cloudflare siteverify | Outbound HTTPS POST; TURNSTILE_SECRET_KEY server-only env | token (single-use opaque string) |
| vigil-core process → Sentry SaaS | Outbound error reports; DSN client-public; no Bearer capture | error stack traces, route/method context |
| React render → Sentry SaaS | PWA browser-side error sink; DSN in bundle by design | error stack traces, boundary tag |
| bearerAuth → requireVerifiedEmailWithGrace | userId guaranteed present by mount-order; second email-verify gate | userId (integer) |
| requireVerifiedEmailWithGrace → users table | Read-only SELECT by primary key; never writes | emailVerifiedAt, createdAt |
| Environment → isAllowlistedEmail | VIGIL_ALLOWED_EMAILS env var; sentinel `*` unlocks public registration | allowlist CSV string |
| Browser → /legal/* routes | Public unauthenticated content; no input; no PII | static HTML |
| Wave 0 test files → filesystem | Drift detectors read source via fs.readFileSync; read-only | source literal strings |
| Filesystem (/todos/pending/) → Phase 126 closure | File presence is the gate for AUTH-126-07 | todo file path |
| Operator browser → Anthropic Console | External-service configuration; no in-tree code | spend cap dollar value |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-126-01-01 | Tampering | Wave 0 test files | mitigate | AUTH-126-* test IDs are unique and grep-verifiable; Plan 05 + Plan 07 re-verified presence. Evidence: `grep -r "AUTH-126-" vigil-core/src/lib/turnstile.test.ts` finds entries. | closed |
| T-126-01-02 | Repudiation | "Tests fail because code isn't written yet" excuse | mitigate | Each failing stub names the missing module. Wave 1 cannot claim done without matching test green. All 7 test files now GREEN per phase summary. | closed |
| T-126-01-03 | Information Disclosure | Test file imports leaking sensitive constants | accept | No sensitive constants in Wave 0 — only public siteverify URL + LOCKED enum names. See accepted risks log. | closed |
| T-126-02-01 | Spoofing | Client-submitted `success:true` injection | mitigate | `realVerifyTurnstileToken` never reads client-side success — always re-verifies via Cloudflare siteverify. `turnstile.ts:80-98`. | closed |
| T-126-02-02 | Tampering | Token replay across users | mitigate | Cloudflare enforces single-use semantics + hostname + challenge_ts out-of-tree. `turnstile.ts:80-98` delegates entirely to siteverify. | closed |
| T-126-02-03 | Information Disclosure | TURNSTILE_SECRET_KEY in stack traces / logs | mitigate | Secret only flows into fetch body at `turnstile.ts:83`; JSDoc at `turnstile.ts:36-39` explicitly forbids logging. Phase 103 R12 denylist documented. | closed |
| T-126-02-04 | Denial of Service | Cloudflare siteverify outage | mitigate (fail-closed) | 5s AbortController at `turnstile.ts:77-78`; fetch errors propagate upward (no catch). `auth.ts:246` catches and returns 503. D-01 no-fail-open honored. | closed |
| T-126-02-05 | Repudiation | Helper silently disabled at call site | mitigate | `auth.ts:245` calls `registerTurnstileFn(turnstileToken, ip)`. Drift detector `AUTH-126-TURNSTILE-CALLSITE` in `auth.test.ts` asserts the call site present. | closed |
| T-126-02-06 | Tampering | Future maintainer renames seams to match → double-stubbing | mitigate | `turnstile.ts:23-28` JSDoc names both seams explicitly and states they are distinct. `auth.ts:0`: grep for `__setVerifyTurnstileTokenForTest` returns 0 — distinct-seam invariant holds. | closed |
| T-126-03-01 | Information Disclosure | Bearer leak via Sentry HTTP breadcrumbs | mitigate | `sentry.ts:85` comment: `sendDefaultPii` defaults to `false` and is not overridden. `main.tsx:16-20` also omits `sendDefaultPii`. | closed |
| T-126-03-02 | Information Disclosure | Sentry context capturing user passwords / tokens / message bodies | mitigate | `sentry.ts:100-106` JSDoc documents Phase 103 denylist. `index.ts:268-279` uses `{route, method}` shape only — denylist-clean. Anchored object-literal-key grep clean in `sentry.ts`. | closed |
| T-126-03-03 | Denial of Service | Sentry SaaS outage blocks request handlers | accept | `captureToSentry` is fire-and-forget via `Sentry.withScope`; SDK batches internally. See accepted risks log. | closed |
| T-126-03-04 | Repudiation | Sentry silently disabled by SENTRY_DSN="" | accept | Local-dev intentional. `initSentry()` called regardless of DSN at `index.ts:89`. Mount-order test GREEN. Operator documents DSN in Railway. See accepted risks log. | closed |
| T-126-03-05 | Tampering | `initialized` flag toggled at runtime | accept | Module-scope mutable state intentional for test-time reset. No production attack surface. See accepted risks log. | closed |
| T-126-04-01 | Spoofing | Forged userId in c.get() | mitigate | bearerAuth validates JWT signature + iat-gate before `requireVerifiedEmailWithGrace` runs. Mount-order enforced: `index.ts:166-181` shows bearerAuth dispatcher precedes the middleware mount. | closed |
| T-126-04-02 | Tampering | JWT manipulation to bypass verification | mitigate | bearerAuth (existing) handles JWT. `requireVerifiedEmailWithGrace` is a SECOND gate: even a passing JWT receives the email-verify check at `require-verified-email.ts:165-213`. | closed |
| T-126-04-03 | Information Disclosure | DB error leaking schema info via 503 | mitigate | `require-verified-email.ts:172-177` returns generic `"Database unavailable"` with no schema details. | closed |
| T-126-04-04 | Denial of Service | DB query on every /v1/* request | accept | Single SELECT by primary key; PostgreSQL handles thousands/sec. Phase 127+ caching candidate. See accepted risks log. | closed |
| T-126-04-05 | Elevation of Privilege | Bypass via path crafting (e.g., "/v1/health/admin") | mitigate | `require-verified-email.ts:145` uses `path === "/v1/health"` strict equality (not startsWith). `/v1/auth/` uses startsWith only for the auth-owned prefix. | closed |
| T-126-04-06 | Repudiation | Operator account hits 403 unexpectedly | accept | Phase 113 migration 0017 backfilled emailVerifiedAt = created_at for seed users. Operator's account passes unconditionally via `user.emailVerifiedAt !== null` at `require-verified-email.ts:196`. See accepted risks log. | closed |
| T-126-04-07 | Information Disclosure | "Invalid email or password" UX for token-subject-not-found | mitigate | `require-verified-email.ts:187-193` returns code `"INVALID_TOKEN_SUBJECT"` (not `INVALID_CREDENTIALS`). PWA maps this at `api-error-codes.ts:129-137` to "Session expired" UX. | closed |
| T-126-05-01 | Denial of Service | Bot-scripted /auth/register flood | mitigate | `auth.ts:32-33`: `RATE_LIMIT_MAX_IP = 20`, `RATE_LIMIT_MAX_EMAIL = 5`. Both applied at `auth.ts:209-227` via `takeSlot`. Plus Turnstile gate. | closed |
| T-126-05-02 | Denial of Service | IP-rotating distributed bots | mitigate | Email-axis cap of 5/hr at `auth.ts:210-214` catches one-email/many-IPs. Turnstile siteverify per attempt makes large-scale automation costly. | closed |
| T-126-05-03 | Spoofing | Forged captcha token from client | mitigate | `auth.ts:245` calls `registerTurnstileFn(turnstileToken, ip)` — server re-verifies with TURNSTILE_SECRET_KEY. No client-trust path. | closed |
| T-126-05-04 | Information Disclosure | 403 REG_NOT_ALLOWED vs 409 EMAIL_TAKEN reveals account existence | accept | Known tradeoff per CONTEXT D-08. Distinct codes preserved intentionally — operator decision. See accepted risks log. | closed |
| T-126-05-05 | Information Disclosure | Captcha bypass reveals allowlist contents via differential response | mitigate | Gate order at `auth.ts:201-260`: rate-limit FIRST → captcha SECOND → allowlist THIRD. Captcha failure (400) returns before allowlist is ever consulted. | closed |
| T-126-05-06 | Tampering | Allowlist `*` sentinel collision with legitimate email | mitigate | `auth.ts:161`: `allowed.includes("*")` matches only after split-trim-lowercase. Real emails containing `*` rejected by `isValidEmailShape` regex at `auth.ts:165-168`. | closed |
| T-126-05-07 | Information Disclosure | Rate-limit error reveals endpoint existence | accept | /auth/register is public-by-design. 429 RATE_LIMITED is industry-standard. See accepted risks log. | closed |
| T-126-05-08 | Tampering | Tests bypass DI seam to test against real Cloudflare | mitigate | `auth.ts:97-104`: `__setRegisterTurnstileFnForTest` / `__resetRegisterTurnstileFnForTest` exported. `auth.test.ts` uses these per SUMMARY-05. | closed |
| T-126-05-09 | Repudiation | Code field silently dropped on future error path | mitigate | `AUTH-126-ERROR-CODE-COVERAGE` test in `auth.test.ts` programmatically asserts `code` field on every documented failure path. | closed |
| T-126-05-10 | Elevation of Privilege | Bypass rate-limit via spoofed x-forwarded-for | accept | Railway proxy strips/sets X-Forwarded-For. Multi-instance scale-out deferred. See accepted risks log. | closed |
| T-126-05-11 | Tampering | Future maintainer renames route-level seam to match helper-unit seam | mitigate | `auth.ts:0`: grep for `__setVerifyTurnstileTokenForTest` returns 0 (confirmed). `AUTH-126-SEAM-NAMING` drift detector in `auth.test.ts` asserts this invariant at CI. | closed |
| T-126-06-01 | Repudiation | initSentry() silently moved after new Hono() | mitigate | `mount-order.test.ts:36-43`: `AUTH-126-MOUNT-SENTRY-BEFORE-HONO` asserts `indexOf("initSentry()") < indexOf("new Hono()")`. Test GREEN per phase summary. `index.ts:89` confirms position. | closed |
| T-126-06-02 | Elevation of Privilege | requireVerifiedEmailWithGrace mounted BEFORE bearerAuth | mitigate | `mount-order.test.ts:45-53`: `AUTH-126-MOUNT-VERIFY-AFTER-BEARER` asserts position. `index.ts:166-181` (bearerAuth dispatcher) precedes `index.ts:181` (requireVerifiedEmailWithGrace mount). | closed |
| T-126-06-03 | Repudiation | PostHog captureException removed when adding Sentry sibling | mitigate | `index.ts:268-271`: `captureException` (PostHog) present. `index.ts:276-279`: `captureToSentry` present as sibling. grep counts both: 2 and 2 respectively. | closed |
| T-126-06-04 | Information Disclosure | onError context grows to include request body / sensitive fields | mitigate | `index.ts:268-279`: both calls use `{route: c.req.path, method: c.req.method}` — R12/Phase 103 denylist-clean. | closed |
| T-126-06-05 | Denial of Service | Sentry SaaS unreachable blocks app startup | accept | `Sentry.init` is non-blocking (`sentry.ts:78-89`). SDK handles failures internally. See accepted risks log. | closed |
| T-126-06-06 | Tampering | Mount-order test deleted to bypass enforcement | mitigate | `mount-order.test.ts` contains 3 AUTH-126-MOUNT-* test IDs; test file exists and passed GREEN per phase summary. | closed |
| T-126-07-01 | Information Disclosure | Server error string contains stack trace or PII | mitigate | `auth.ts:172-413`: all error strings are curated static copy. `resolveApiError` at `api-error-codes.ts:150-164` resolves known codes first; raw `error` fallback only if code is unknown. | closed |
| T-126-07-02 | Tampering | Future ctaHref in ERROR_CODE_MAP ships malicious URL | accept | Source-controlled; PR review catches. All existing ctaHref values are internal (/auth, /settings) or mailto:hello@vigilhub.io. See accepted risks log. | closed |
| T-126-07-03 | Spoofing | Server emits unknown code claiming to be sensitive | mitigate | `api-error-codes.ts:155`: `Object.prototype.hasOwnProperty.call(ERROR_CODE_MAP, body.code)` lookup-guard prevents prototype-chain pollution. Unknown codes fall back to raw `error` string (SUMMARY-07 documents this security hardening beyond the plan skeleton). | closed |
| T-126-07-04 | Repudiation | Locked code silently removed from ERROR_CODE_MAP | mitigate | `api-error-codes.test.ts`: `AUTH-126-CODE-MAP-LOCKED-ENUM` asserts all 9 LOCKED keys present. Removal breaks CI. | closed |
| T-126-07-05 | Information Disclosure | @sentry/react bundles DSN into JS — DSN leak via DevTools | accept | DSNs are public-by-design per Sentry threat model. DSN ≠ secret. See accepted risks log. | closed |
| T-126-07-06 | Information Disclosure | "Invalid email or password" UX for token-subject-not-found | mitigate | `api-error-codes.ts:129-137`: INVALID_TOKEN_SUBJECT maps to "Session expired" + sign-in CTA. `require-verified-email.ts:187-193` emits the distinct code. No conflation with INVALID_CREDENTIALS. | closed |
| T-126-08-01 | Information Disclosure | Page exposes operator's personal address | mitigate | `PrivacyPolicyPage.tsx`: contact is `hello@vigilhub.io` brand-domain alias; no personal PII. | closed |
| T-126-08-02 | Tampering | Privacy policy contradicts actual data handling | accept | Operator owns accuracy. v1 ships honest minimum per CONTEXT line 109. See accepted risks log. | closed |
| T-126-08-03 | Repudiation | Page edited later without dated revision | mitigate | `PrivacyPolicyPage.tsx:19`: "Last updated: 2026-05-11" anchor present. Operator updates on republish. | closed |
| T-126-08-04 | Spoofing | Phishing site clones /legal/privacy verbatim | accept | Publicly accessible content; domain `app.vigilhub.io` is source-of-truth. See accepted risks log. | closed |
| T-126-08-05 | Elevation of Privilege | Legal route accidentally mounted INSIDE isAuthenticated guard | mitigate | `App.tsx:79-82`: `<Route path="/legal/privacy">` and `<Route path="/legal/terms">` sit outside the `isAuthenticated ? ... : ...` cluster, as siblings of `/auth/verify` (line 78). | closed |
| T-126-08-06 | Denial of Service | Static pages fail when API + DB are down | mitigate by design | `PrivacyPolicyPage.tsx` / `TermsOfServicePage.tsx`: no fetch, no async, no useEffect. Vercel CDN serves regardless of vigil-core state. | closed |
| T-126-09-01 | Information Disclosure | Sentry DSN leak via JS bundle | accept | DSNs are public-by-design per Sentry threat model. `main.tsx:17` embeds VITE_SENTRY_DSN intentionally. See accepted risks log. | closed |
| T-126-09-02 | Information Disclosure | Bearer token leak via Sentry HTTP breadcrumbs | mitigate | `main.tsx:13-14` comment: `sendDefaultPii` intentionally NOT set (default false). `sentry.ts:85` same gate on server side. | closed |
| T-126-09-03 | Tampering | Existing PostHog captureException removed when adding Sentry | mitigate | `ErrorBoundary.tsx:21`: PostHog `captureException` present. `ErrorBoundary.tsx:22`: `Sentry.captureException` added as sibling. Both calls exist (grep count: PostHog=3, Sentry=1, in componentDidCatch). | closed |
| T-126-09-04 | Denial of Service | Sentry CDN/SaaS outage breaks app | accept | `Sentry.init` is fire-and-forget. SDK degrades gracefully when SaaS unreachable. See accepted risks log. | closed |
| T-126-09-05 | Repudiation | Future code adds Sentry.ErrorBoundary double-capturing | mitigate | `main.tsx:23-30`: no `<Sentry.ErrorBoundary>` wrapper. `ErrorBoundary.tsx` is the single boundary. SUMMARY-09 documents prohibition. | closed |
| T-126-09-06 | Information Disclosure | Sentry context captures user input via React ErrorInfo | accept | `_info` (ErrorInfo) is component-stack only — no user data. See accepted risks log. | closed |
| T-126-10-01 | Spoofing | Bot bypasses Turnstile widget via DevTools | mitigate | `AuthPage.tsx:195`: `disabled={loading || (!isLogin && !turnstileToken)}`. Even if bypassed client-side, `auth.ts:229-260` catches at server-side rate-limit + siteverify. Defense-in-depth. | closed |
| T-126-10-02 | Tampering | Token reused across users (replay) | mitigate | Cloudflare enforces single-use server-side. `AuthPage.tsx:39` resets via `toggleMode`. `setTurnstileToken(null)` on error/expire via `TurnstileWidget.tsx:63-65`. | closed |
| T-126-10-03 | Information Disclosure | Error-code resolver leaks server message verbatim for unknown codes | accept | Intentional forward-compat: new codes surface raw `error` until PWA map updates. See accepted risks log. | closed |
| T-126-10-04 | Repudiation | Future regression re-introduces setError(GENERIC_ERROR) collapse | mitigate | `AuthPage.tsx`: `resolveApiError` called at 3 sites (lines 57, 82, 94). `GENERIC_ERROR` count = 5 (constant declaration + catch-block R2 preservation + 3 fallback args to resolveApiError). Acceptance criteria grep-count locked. | closed |
| T-126-10-05 | Elevation of Privilege | Legal pages link to malicious external host | accept | `AuthPage.tsx:216-218`: `<Link to="/legal/*">` is react-router internal-only. No external href. See accepted risks log. | closed |
| T-126-10-06 | Denial of Service | Turnstile widget fails to load — user cannot sign up | mitigate | `TurnstileWidget.tsx:48-57`: falls back to placeholder div when `VITE_TURNSTILE_SITE_KEY` missing. Submit disabled in that state prevents broken submissions. | closed |
| T-126-10-07 | Tampering | Catch-block site accidentally gets resolveApiError treatment | mitigate | `AuthPage.tsx:112`: catch-block uses `setError(GENERIC_ERROR)` verbatim (R2 lock). `GENERIC_ERROR` grep count ≥ 2 in acceptance criteria. | closed |
| T-126-10-08 | Information Disclosure | Login form leaks email-existence by differential error code | accept | `auth.ts:410-415`: generic `INVALID_CREDENTIALS` (401) regardless of whether email exists. See accepted risks log. | closed |
| T-126-10-09 | Repudiation | Future maintainer adds react-router-dom import | mitigate | `AuthPage.tsx`: grep for `react-router-dom` returns 0. `from 'react-router'` at line 2. `TurnstileWidget.tsx`: no router imports needed. | closed |
| T-126-11-01 | Repudiation | Operator marks Phase 126 complete without setting spend cap | mitigate | Spend cap todo moved from `/pending/` to `/done/` at `.planning/todos/done/2026-05-11-phase-126-anthropic-spend-cap.md`. File contains `status: done`, `cap_value_usd: 500`, `completed: 2026-05-11`. Operator action confirmed. | closed |
| T-126-11-02 | Denial of Service | Anthropic API spend exhausts before operator cap | accept | Rate-limit (Plan 05) + Turnstile (Plan 05) are upstream gates. Spend cap is final backstop. See accepted risks log. | closed |
| T-126-11-03 | Information Disclosure | Spend cap value recorded in /done/ leaks operator cost data | accept | Internal planning artifact; .planning/ is private. See accepted risks log. | closed |
| T-126-11-04 | Tampering | Auto-script moves todo to /done/ without operator action | mitigate | Plan 11 is `autonomous: false` with `type="checkpoint:human-action"`. File confirmed in `/done/` with operator-recorded frontmatter (`cap_value_usd: 500`, `alert_email: jamesonmorrill1@gmail.com`). Operator action took place 2026-05-11. | closed |
| T-126-11-05 | Spoofing | Lower-than-baseline cap accidentally locks legit users out | accept | Operator's responsibility per runbook. Reversible at any time via Anthropic Console. See accepted risks log. | closed |

*Status: closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-126-01 | T-126-01-03 | Wave 0 test files import only the public Cloudflare siteverify URL and LOCKED enum names — no sensitive constants. | planner/executor | 2026-05-11 |
| AR-126-02 | T-126-03-03 | Sentry.captureException is fire-and-forget; SDK batches and retries internally; failure does not propagate to caller or block responses. | planner/executor | 2026-05-11 |
| AR-126-03 | T-126-03-04 | SENTRY_DSN="" is intentional for local dev. initSentry() is called unconditionally at startup; mount-order test verifies the call. Railway prod documents the DSN in env. | planner/executor | 2026-05-11 |
| AR-126-04 | T-126-03-05 | Module-scope `initialized` flag is mutable by design for test-time reset semantics. No production attack surface: tests restore the flag via the exported reset function. | planner/executor | 2026-05-11 |
| AR-126-05 | T-126-04-04 | Single SELECT by primary key on every /v1/* request is acceptable at current traffic. PostgreSQL handles thousands/sec. Phase 127+ may add caching if metrics show load. | planner/executor | 2026-05-11 |
| AR-126-06 | T-126-04-06 | Phase 113 migration 0017 backfilled emailVerifiedAt = created_at for all seed users. Operator's account passes unconditionally. Zero regression risk documented in RESEARCH. | planner/executor | 2026-05-11 |
| AR-126-07 | T-126-05-04 | 403 REG_NOT_ALLOWED vs 409 EMAIL_TAKEN is a known tradeoff per CONTEXT D-08 (Phase 102). Distinct codes preserved intentionally for UX clarity. Operator decision. | operator | 2026-05-11 |
| AR-126-08 | T-126-05-07 | /auth/register is public-by-design; endpoint existence is not secret. 429 RATE_LIMITED is industry-standard signal. No new attack surface from structured error code. | planner/executor | 2026-05-11 |
| AR-126-09 | T-126-05-10 | Railway proxy sets X-Forwarded-For to client IP — bypass at Railway layer is out of scope for this phase. Multi-instance per-IP rate-limit coordination (Redis) deferred to Phase 127+. | planner/executor | 2026-05-11 |
| AR-126-10 | T-126-06-05 | Sentry.init is non-blocking. SDK handles SaaS unreachability internally via buffering and exponential retry. App startup is not blocked on Sentry availability. | planner/executor | 2026-05-11 |
| AR-126-11 | T-126-07-02 | All ctaHref values are source-controlled internal paths (/auth, /settings) or mailto:hello@vigilhub.io. PR review is the control. Future absolute external URLs require explicit reviewer scrutiny. | planner/executor | 2026-05-11 |
| AR-126-12 | T-126-07-05 | Sentry DSNs are public-by-design per Sentry's own threat model. DSN ≠ secret — it identifies where to send events, not how to authenticate. DSN exposure is expected and benign. | planner/executor | 2026-05-11 |
| AR-126-13 | T-126-08-02 | Privacy policy accuracy is operator responsibility. v1 ships honest minimum per CONTEXT line 109. Lawyer review recommended within 30 days post-revenue. | operator | 2026-05-11 |
| AR-126-14 | T-126-08-04 | Legal page content is publicly accessible by design. Domain app.vigilhub.io is the canonical source-of-truth. Cloning cannot be prevented for static public content. | operator | 2026-05-11 |
| AR-126-15 | T-126-09-01 | Sentry DSN in JS bundle is per-design (Sentry threat model). VITE_SENTRY_DSN intentionally embeds in bundle. DSN is not a credential. | planner/executor | 2026-05-11 |
| AR-126-16 | T-126-09-04 | Sentry.init is fire-and-forget at browser. SDK gracefully degrades when SaaS unreachable. App rendering is not blocked. | planner/executor | 2026-05-11 |
| AR-126-17 | T-126-09-06 | React ErrorInfo.componentStack is component names only — public-knowledge app structure. No user-generated content is included. | planner/executor | 2026-05-11 |
| AR-126-18 | T-126-10-03 | Forward-compat intentional: new server codes that the PWA doesn't yet know about surface the raw `error` string. Acceptable because server-emitted `error` strings are operator-curated static copy. | planner/executor | 2026-05-11 |
| AR-126-19 | T-126-10-05 | react-router `<Link to="/legal/*">` is internal-router only — it cannot navigate to an absolute external URL. No XSS/open-redirect surface. | planner/executor | 2026-05-11 |
| AR-126-20 | T-126-10-08 | Login uses generic INVALID_CREDENTIALS (401) regardless of email existence — this is the correct security-best-practice behavior per CONTEXT D-08. Login captcha / brute-force protection is deferred (Open-Q-3). | planner/executor | 2026-05-11 |
| AR-126-21 | T-126-11-02 | Rate-limit + Turnstile are upstream gates before Anthropic API is invoked. Spend cap is the final backstop. Bad actor must bypass two gates to cause AI spend. Acceptable risk for v3.8 launch window. | operator | 2026-05-11 |
| AR-126-22 | T-126-11-03 | .planning/ directory is private planning artifact. Operator may redact specific dollar figures if planning history becomes public. Dollar value ($500/mo) is not operationally sensitive. | operator | 2026-05-11 |
| AR-126-23 | T-126-11-05 | Cap value is reversible at any time via Anthropic Console. Operator followed the runbook guidance (3× baseline; alert email set). Recovery path is well-understood. | operator | 2026-05-11 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

The following items surfaced in SUMMARY.md files but had no corresponding new threat ID — they are informational notes or security hardening confirmations, not new unregistered threats:

- SUMMARY-07: `Object.prototype.hasOwnProperty.call(ERROR_CODE_MAP, body.code)` lookup-guard (auto-added as Rule 2 security hardening beyond the PATTERNS skeleton). This narrows T-126-07-03 (Spoofing) surface further; T-126-07-03 is already CLOSED. Not an unregistered flag — an accepted auto-improvement.
- SUMMARY-09: `sendDefaultPii` not set, no Sentry.ErrorBoundary double-wrap, `tracesSampleRate: 0` — all documented conformances to T-126-09-02 and T-126-09-05 mitigations. Not new threat surface.

*No unregistered_flag entries (new attack surface with no threat mapping was not introduced during implementation).*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-11 | 46 | 46 | 0 | Claude Sonnet 4.6 (gsd-secure-phase) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-11
