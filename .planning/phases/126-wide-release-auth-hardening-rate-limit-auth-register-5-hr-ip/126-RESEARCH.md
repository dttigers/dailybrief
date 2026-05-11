# Phase 126: Wide-Release Auth Hardening — Research

**Researched:** 2026-05-11
**Domain:** Auth surface hardening (Hono server + Vite React PWA) — captcha, rate-limit, email-verify enforcement, error tracking, structured error UX, legal pages, kill-switch sentinel
**Confidence:** HIGH (all 4 D-* decisions LOCKED in CONTEXT.md; verifiable package versions from npm registry 2026-05-11; canonical reference implementations live in-tree at `forgot-password.ts` / `resend-verification.ts` / `verify-email.ts`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Captcha provider: Cloudflare Turnstile.** AUTH-126-02 uses Cloudflare Turnstile (free tier).
- PWA: `@marsidev/react-turnstile` widget on signup form; `TURNSTILE_SITE_KEY` from env; submit token alongside email+password.
- Server: new `verifyTurnstileToken(token, remoteIp)` helper in `vigil-core/src/lib/`. Call from `/auth/register` BEFORE `isAllowlistedEmail` check. Use `TURNSTILE_SECRET_KEY` against `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Drift-detector test asserts the helper is invoked.
- Failure mode: 400 `{error: "Captcha verification failed", code: "CAPTCHA_FAILED"}`.
- Timeout/network failure: 503 (do NOT fail-open).

**D-02 — Email-verification enforcement: 24h grace then strict 403.** AUTH-126-03 implements soft-to-strict.
- New middleware `requireVerifiedEmailWithGrace` in `vigil-core/src/middleware/`. Mounts AFTER `bearerAuth` dispatcher, BEFORE `/v1/*` routes.
- Reads `users.emailVerifiedAt` AND `users.createdAt`. If `emailVerifiedAt IS NOT NULL`: pass. Else if `now < createdAt + 24h`: pass. Else: 403 `{error: "Verify your email to continue", code: "EMAIL_NOT_VERIFIED", verified_after_iso: <iso>}`.
- Bypass list: `/v1/health`, `/v1/auth/*` (login/logout/resend-verification/forgot-password/reset-password/verify-email all stay open).

**D-03 — Rate limit on /auth/register: IP + email dual-counter (mirror forgot-password.ts verbatim).**
- `RATE_LIMIT_MAX_IP = 20` per hour per IP
- `RATE_LIMIT_MAX_EMAIL = 5` per hour per email
- Hit either cap → 429 `{error: "Too many registration attempts", code: "RATE_LIMITED", retry_after_seconds: N}`.
- Phase 117 drift-detector convention: tests assert literal verbatim (`AUTH-126-CAP-IP-20`, `AUTH-126-CAP-EMAIL-5`).

**D-04 — PWA error UX: structured `{error, code}` + PWA-side error-code map.**
- vigil-core: every `/auth/*` and middleware error response includes both `error` (human) and `code` (stable enum). Backward-compatible additive change.
- vigil-pwa: new `src/lib/api-error-codes.ts` with `code → {message, ctaLabel?, ctaHref?}` map. AuthPage error rendering switches from "collapse everything to GENERIC_ERROR" (current bug at AuthPage.tsx:9,53,76-77,86-87) to "look up code, render mapped UX, fallback to raw `error` if code unknown".
- **Locked code enum** (planner may ADD, cannot REMOVE): `CAPTCHA_FAILED`, `RATE_LIMITED`, `REG_NOT_ALLOWED`, `INVALID_EMAIL_FORMAT`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `EMAIL_TAKEN`, `EMAIL_NOT_VERIFIED`, `INVALID_CREDENTIALS`.

### Claude's Discretion
- **AUTH-126-04 Sentry setup** — single project (with env + service tags) OR separate projects.
- **AUTH-126-06 Legal pages** — Termly free tier OR hand-rolled. Goal: `/legal/privacy` and `/legal/terms` return 200 with linkable content, footer link on signup screen.
- **AUTH-126-08 sentinel semantics** — `*` is the locked sentinel; whether to also support `*@domain.com` is planner discretion. Strict `*` is enough for v1.

### Deferred Ideas (OUT OF SCOPE)
- Secret-drift hardening rider
- CSP header tuning (secureHeaders defaults stay)
- Per-user AI usage quota
- Brute-force protection on `/auth/login`
- GDPR/CCPA data-export + delete-account endpoint
- Sign-in-with-Google

### Operator-Only (NOT a code task)
- **AUTH-126-07 — Anthropic monthly spend cap.** Plan a wallclock todo at `.planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md`. Per memory `feedback_wallclock_checkpoint_exempt.md`, yolo mode does NOT bypass wallclock checkpoints.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-126-01 | Rate-limit POST /auth/register (5/hr/email, 20/hr/IP) | §Implementation Map AUTH-126-01 — mirror `forgot-password.ts:42-104` verbatim (in-tree canonical pattern). Drift detectors `AUTH-126-CAP-IP-20` + `AUTH-126-CAP-EMAIL-5` mirror `AUTH-13-FP-CAP-*`. |
| AUTH-126-02 | Cloudflare Turnstile captcha on signup | §Library Decisions §1 — `@marsidev/react-turnstile@^1.5.2` (PWA, React 19 compat verified); server siteverify POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify`; full request/response contract documented. |
| AUTH-126-03 | Email-verification gate with 24h grace | §Implementation Map AUTH-126-03 — new middleware `requireVerifiedEmailWithGrace`. Schema columns confirmed: `users.emailVerifiedAt` (nullable timestamp, schema.ts:52) + `users.createdAt` (notNull, schema.ts:33). Phase 113 0017 migration already backfilled seed users → no regression risk. |
| AUTH-126-04 | Sentry wired into vigil-core (server) + vigil-pwa (client) | §Library Decisions §2 — `@sentry/node@^10.52.0` for vigil-core, `@sentry/react@^10.52.0` for vigil-pwa. Init BEFORE Hono app constructed (vigil-core/src/index.ts:84). Free tier 5k events/mo verified sufficient. PostHog stays — Sentry coexists. |
| AUTH-126-05 | PWA structured error UX (`{error, code}` + PWA map) | §Implementation Map AUTH-126-05 — bug site identified: vigil-pwa/src/pages/AuthPage.tsx lines 9 (GENERIC_ERROR const), 53/76-77/86-87 (4 sites that collapse 4xx into GENERIC_ERROR). New file `vigil-pwa/src/lib/api-error-codes.ts`. |
| AUTH-126-06 | Privacy Policy + Terms of Service at /legal/privacy and /legal/terms | §Library Decisions §3 — recommend hand-rolled React routes via existing react-router@^7.14.0 (in-tree). Termly viable but adds external dep / iframe / cookie surface. Cheap path: 2 new pages mounted in App.tsx outside auth guard. |
| AUTH-126-07 | Anthropic monthly spend cap | §Implementation Map AUTH-126-07 — operator-only. Wallclock todo. Out-of-tree per CONTEXT.md. |
| AUTH-126-08 | Allowlist sentinel `*` kill-switch in isAllowlistedEmail() | §Implementation Map AUTH-126-08 — exact code site identified at vigil-core/src/routes/auth.ts:74-83. Empty-string vs unset behavior already correct (line 81: `allowed.length === 0` returns false). Sentinel addition is a single early-return guard. |
</phase_requirements>

## Summary

Phase 126 closes 8 auth-surface gaps so `VIGIL_ALLOWED_EMAILS="*"` can be flipped without inviting bots or burning Anthropic budget. Triggering incident on 2026-05-11: a family member's signup hit a real 403 (allowlist rejection) that the PWA collapsed into "Invalid email or password" (literal `GENERIC_ERROR` at AuthPage.tsx:9; collapse sites at lines 53, 76-77, 86-87). That single bug also exposed 7 sibling gaps simultaneously, which is why this phase is broad rather than narrow.

The phase has unusually high reuse leverage: **D-03 rate limit, D-02 middleware mount-order, D-04 error-code drift detection, and the in-memory bucket pattern are all in-tree as Phase 112/113/117 implementations** (`forgot-password.ts`, `resend-verification.ts`, `verify-email.ts`, the bearerAuth dispatcher at `index.ts:159-168`). The planner should treat existing files as the canonical references and mirror them verbatim — drift-detector test names (`AUTH-126-CAP-IP-20`) intentionally mirror Phase 117's (`AUTH-13-FP-CAP-IP-20`).

**Primary recommendation:** Plan in two layered waves — (1) `vigil-core` (5 server tasks: register rate-limit, Turnstile helper + invocation, email-verify middleware, allowlist sentinel, error-code refit) all touching `auth.ts` + adding 2 new files in `src/middleware/` and `src/lib/`; (2) `vigil-pwa` (3 client tasks: Turnstile widget, error-code map, Sentry init) plus 2 legal page routes. Sentry init in `vigil-core/src/index.ts` MUST land BEFORE `const app = new Hono()` (line 84) so early-init errors get captured. AUTH-126-07 is a wallclock operator todo, not a code task.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rate-limit on /auth/register (D-03) | API / Backend (vigil-core Hono) | — | IP + email dual-counter must live server-side. In-memory Maps adequate at single-Railway-instance scale; mirror of Phase 117 pattern. |
| Turnstile widget render | Browser / Client (vigil-pwa React) | — | Widget is a client iframe + DOM mount. Token generated client-side. |
| Turnstile siteverify (D-01) | API / Backend (vigil-core) | — | Secret key MUST stay server-side; client only ever sees site key. POST to challenges.cloudflare.com. |
| Email-verify gate (D-02) | API / Backend (vigil-core middleware) | — | DB read of `users.emailVerifiedAt` + `users.createdAt`. PWA reads `verified_after_iso` from 403 body to render countdown. |
| Sentry error capture — server (AUTH-126-04) | API / Backend | — | `@sentry/node` wraps Hono app construction. |
| Sentry error capture — client (AUTH-126-04) | Browser / Client (vigil-pwa) | — | `@sentry/react` initializes in main.tsx. |
| Structured error UX (D-04) | API / Backend (emits `code`) + Browser / Client (renders code → UX) | — | Two-tier by design: stable enum is the contract, copy lives in PWA. |
| Legal pages (AUTH-126-06) | Browser / Client (vigil-pwa React routes) | — | Static content, react-router public routes. |
| Allowlist sentinel (AUTH-126-08) | API / Backend (`isAllowlistedEmail()`) | — | Existing function at auth.ts:74-83. |
| Anthropic spend cap (AUTH-126-07) | Operator / External (Anthropic console) | — | NO code. Wallclock todo. |

## Library Decisions

### §1 — Cloudflare Turnstile (AUTH-126-02 / D-01)

**PWA-side: `@marsidev/react-turnstile`**

| Property | Value | Source |
|----------|-------|--------|
| Current version | `1.5.2` | `[VERIFIED: npm view @marsidev/react-turnstile version]` 2026-05-11 |
| Peer deps | `react: ^17.0.2 \|\| ^18.0.0 \|\| ^19.0`, `react-dom` same | `[VERIFIED: npm view @marsidev/react-turnstile peerDependencies]` |
| PWA React version | `^19.2.5` | `[VERIFIED: vigil-pwa/package.json:15]` |
| Compatible? | **YES** — React 19 in peer range | derived |

Install:
```bash
cd vigil-pwa && npm install @marsidev/react-turnstile
```

Widget usage shape (planner-facing pattern):
```tsx
// [CITED: https://github.com/marsidev/react-turnstile]
import { Turnstile } from '@marsidev/react-turnstile'

<Turnstile
  siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
  onSuccess={(token) => setTurnstileToken(token)}
  onError={() => setTurnstileToken(null)}
  onExpire={() => setTurnstileToken(null)}
  options={{ theme: 'dark' }}  // matches AuthPage's gray-900 surface
/>
```

**Server-side: native `fetch` to siteverify endpoint (no library)**

| Property | Value | Source |
|----------|-------|--------|
| Endpoint | `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` | `[CITED: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/]` |
| Content-Type | `application/json` or `application/x-www-form-urlencoded` | `[CITED]` same |
| Required body | `secret` (TURNSTILE_SECRET_KEY env), `response` (token from widget) | `[CITED]` |
| Optional body | `remoteip` (recommended by Cloudflare), `idempotency_key` (UUID for safe retry) | `[CITED]` |
| Success response | `{success: true, challenge_ts, hostname, "error-codes": [], action, cdata, metadata}` | `[CITED]` |
| Failure response | `{success: false, "error-codes": ["invalid-input-response", ...]}` | `[CITED]` |

Client IP on Railway/Hono: use `c.req.header("x-forwarded-for")?.split(",")[0]?.trim()` (same pattern as `forgot-password.ts:136` and `rate-limit.ts:28-31`). Railway sits behind its own proxy and sets `X-Forwarded-For`.

**Failure-mode policy (matches CONTEXT D-01):**
- `success: false` → 400 `{error: "Captcha verification failed", code: "CAPTCHA_FAILED"}`
- Network error / non-2xx from siteverify → 503 (DO NOT fail-open; bot defense must hold during outages)
- Implementation: wrap `fetch` in `try/catch` + check `res.ok`. Add a 5s `AbortController` timeout (siteverify normally returns in ~50-200ms; 5s is generous).

**Drift detectors required** (CONTEXT D-01 last bullet of "Implementation shape"):
1. Source-file test asserts `verifyTurnstileToken(` call site exists inside `/auth/register` handler in `auth.ts` (helper cannot be silently disabled by deleting the call).
2. Source-file test asserts `const TURNSTILE_SECRET_KEY` and `https://challenges.cloudflare.com/turnstile/v0/siteverify` literal exist in `vigil-core/src/lib/turnstile.ts`.

### §2 — Sentry (AUTH-126-04)

**Server-side: `@sentry/node`**

| Property | Value | Source |
|----------|-------|--------|
| Current version | `10.52.0` | `[VERIFIED: npm view @sentry/node version]` 2026-05-11 |
| Init contract | `Sentry.init({dsn, tracesSampleRate, environment})` MUST run BEFORE app code that imports instrumented libraries | `[CITED: https://docs.sentry.io/platforms/javascript/guides/node/]` |
| Hono integration | No native integration; use top-level `app.onError` to call `Sentry.captureException` | `[CITED: https://docs.sentry.io/platforms/javascript/guides/node/]` + `[VERIFIED: vigil-core/src/index.ts:252-260]` existing onError pattern |

Install:
```bash
cd vigil-core && npm install @sentry/node
```

Init placement (LOAD-BEARING — CONTEXT.md §Code Context line 137):
- Init file: `vigil-core/src/lib/sentry.ts` (export an `initSentry()` function + `captureToSentry()` helper)
- Call `initSentry()` in `vigil-core/src/index.ts` BEFORE `const app = new Hono()` on line 84. Putting it after `app` construction risks missing import-time errors and any errors thrown by Hono middleware setup.
- Existing `captureException(userId, err, context)` in `analytics/posthog.ts:181-192` is the precedent shape. Add a sibling `captureToSentry(userId, err, context)` in `lib/sentry.ts` with the same signature, OR extend the existing posthog wrapper to call both. **Recommendation:** sibling helper — keeps PostHog file pure and avoids reshaping the existing single-call site in `index.ts:255`. Update the `app.onError` handler at `index.ts:252-260` to call BOTH.
- `process.env["SENTRY_DSN"]` gate: if unset, no-op (mirrors `apiKey` gate in `posthog.ts:69-80`).

**Client-side: `@sentry/react`**

| Property | Value | Source |
|----------|-------|--------|
| Current version | `10.52.0` | `[VERIFIED: npm view @sentry/react version]` 2026-05-11 |
| PWA React version | `^19.2.5` | `[VERIFIED: vigil-pwa/package.json:15]` |
| Peer-dep compatibility | `@sentry/react@10.x` supports React 17+ including 19 | `[CITED: https://docs.sentry.io/platforms/javascript/guides/react/]` |
| Init placement | `vigil-pwa/src/main.tsx` BEFORE `ReactDOM.createRoot(...).render(...)` | `[CITED]` same |
| ErrorBoundary | Existing `vigil-pwa/src/components/ErrorBoundary.tsx` exists; wrap with `Sentry.ErrorBoundary` or call `Sentry.captureException(error)` from its `componentDidCatch` | `[VERIFIED: vigil-pwa/src/ listing]` |

Install:
```bash
cd vigil-pwa && npm install @sentry/react
```

DSN handling: `import.meta.env.VITE_SENTRY_DSN` env var; if unset, skip init. Mirrors `VITE_API_BASE` pattern at `vigil-pwa/src/api/client.ts:3`.

**Source-map upload: DEFER.** `@sentry/vite-plugin@5.2.1` exists `[VERIFIED: npm view @sentry/vite-plugin version]` and works, but adds CI build complexity and requires a Sentry auth token. Per CONTEXT D-04 free-tier focus and `additional_context` Sentry note: ship error capture first; readable stack traces are valuable but not blocking for 5k-events/mo launch. Capture as a Phase 127+ candidate; document in deferred section of SUMMARY.

**Free tier event quota:** 5k events/month on the Developer tier `[CITED: https://sentry.io/pricing/]`. CONTEXT.md "additional_context" lists this verbatim. PostHog already captures exceptions (`enableExceptionAutocapture: true` at `analytics/posthog.ts:75`); Sentry coexists as the second sink. Sample rate: `tracesSampleRate: 0` initially (no performance tracing; only errors) to stay under quota. Only `captureException` calls count.

**PostHog coexistence (CONTEXT explicit, line 138):** Do NOT remove PostHog. PostHog's `captureException` keeps firing from `app.onError` (index.ts:255). Sentry is additive. Both sinks help: PostHog for product analytics correlation, Sentry for engineer-grade stack traces + release tagging.

### §3 — Legal Pages (AUTH-126-06)

**Recommendation: hand-rolled React routes in vigil-pwa.** Cheap and fully in-stack.

- Two new files: `vigil-pwa/src/pages/PrivacyPolicyPage.tsx`, `vigil-pwa/src/pages/TermsOfServicePage.tsx`.
- Mount in `vigil-pwa/src/App.tsx` outside the `isAuthenticated` guard (siblings to `/auth/forgot` at line ~73): `<Route path="/legal/privacy" element={<PrivacyPolicyPage />} />` and `<Route path="/legal/terms" element={<TermsOfServicePage />} />`.
- Footer link on AuthPage at the bottom of the form (above or below the toggle-mode button at AuthPage.tsx:188-196).
- Content body: paste a free generator's output (Termly free tier, Iubenda, etc.) into the JSX — or hand-author. Lawyer review optional pre-launch per CONTEXT.md line 109.

**Why not Termly hosted:** Termly hosted requires either an `<iframe>` or their JS snippet, which (a) introduces a third-party origin to maintain CSP-wise (deferred for Phase 127), (b) adds a cookie banner widget that interacts awkwardly with PostHog, (c) costs CSP/loading complexity. The hand-rolled approach is one component each and `react-router@^7.14.0` already in `vigil-pwa/package.json:17`.

Vercel SPA rewrite at `vigil-pwa/vercel.json` (`{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }`) already handles deep-link routing — `/legal/privacy` will resolve client-side via React Router, no Vercel config changes needed.

## Implementation Map

For each requirement, the smallest possible diff.

### AUTH-126-01 — Rate-limit POST /auth/register (D-03)

**Files to edit:**
- `vigil-core/src/routes/auth.ts` — add two `const RATE_LIMIT_MAX_*` declarations at module top (mirror `forgot-password.ts:48-50`), two in-memory Maps, `takeSlot` helper, setInterval cleanup, slot-consumption inside `/auth/register` handler BEFORE the existing `isAllowlistedEmail` check at line 126.
- `vigil-core/src/routes/auth.test.ts` — add drift-detector tests (`AUTH-126-CAP-IP-20`, `AUTH-126-CAP-EMAIL-5`) + behavior tests.

**Smallest diff shape (additive, no deletes):**
```typescript
// auth.ts — TOP of file (after MIN/MAX_PASSWORD)
const RATE_LIMIT_MAX_IP = 20;             // Phase 126 D-03 — mirrors forgot-password.ts:48
const RATE_LIMIT_MAX_EMAIL = 5;           // Phase 126 D-03 — mirrors forgot-password.ts:49
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const registerIpBuckets = new Map<string, number[]>();
const registerEmailBuckets = new Map<string, number[]>();
// + setInterval(...).unref() sweep — verbatim from forgot-password.ts:70-84
// + takeSlot(map, key, now, max): boolean — verbatim from forgot-password.ts:88-98
// + export function __resetRegisterBucketsForTest()

// inside auth.post("/auth/register", ...) — AFTER body parse + typeof checks (line 112),
// BEFORE isValidEmailShape (line 113):
const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
const now = Date.now();
const ipOk = takeSlot(registerIpBuckets, ip, now, RATE_LIMIT_MAX_IP);
const emailOk = takeSlot(registerEmailBuckets, rawEmail.toLowerCase().trim(), now, RATE_LIMIT_MAX_EMAIL);
if (!ipOk || !emailOk) {
  const retryAfterSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
  c.header("Retry-After", String(retryAfterSeconds));
  return c.json({
    error: "Too many registration attempts",
    code: "RATE_LIMITED",
    retry_after_seconds: retryAfterSeconds,
  }, 429);
}
```

**Mount-order constraint:** rate-limit MUST run BEFORE Turnstile verify (AUTH-126-02). Otherwise a brute-force attacker can burn Turnstile siteverify quota / latency budget per attempt. Rate-limit-first means: parse body → check shape → rate-limit → Turnstile → allowlist → password validation → DB write.

**Drift detectors (Phase 117 convention — mirror `forgot-password.test.ts:421-444` verbatim):**
- `AUTH-126-CAP-IP-20`: `fs.readFileSync('auth.ts')` matches `/const RATE_LIMIT_MAX_IP = 20;/`
- `AUTH-126-CAP-EMAIL-5`: matches `/const RATE_LIMIT_MAX_EMAIL = 5;/`

### AUTH-126-02 — Cloudflare Turnstile captcha (D-01)

**Files to create:**
- `vigil-core/src/lib/turnstile.ts` — `verifyTurnstileToken(token: string, remoteIp: string | null): Promise<{ ok: boolean; errorCodes: string[] }>`. Internal fetch with 5s AbortController timeout. Reads `TURNSTILE_SECRET_KEY` from env.
- `vigil-pwa/src/components/TurnstileWidget.tsx` — thin wrapper around `<Turnstile>` from `@marsidev/react-turnstile` with controlled `onSuccess`/`onError`/`onExpire`.

**Files to edit:**
- `vigil-core/src/routes/auth.ts` — invoke `verifyTurnstileToken` inside `/auth/register` AFTER rate-limit (above) and BEFORE `isAllowlistedEmail`. Extract `turnstileToken` from request body alongside `email`/`password`.
- `vigil-pwa/src/pages/AuthPage.tsx` — render `<TurnstileWidget />` in signup mode (gate behind `!isLogin`), store token in state, submit alongside `{email, password, turnstileToken}` on signup. Disable submit button while token is null.

**Diff shape (server):**
```typescript
// vigil-core/src/lib/turnstile.ts (NEW)
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export async function verifyTurnstileToken(token: string, remoteIp: string | null):
  Promise<{ ok: boolean; errorCodes: string[] }> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, errorCodes: [`http-${res.status}`] };
    const data = await res.json() as { success: boolean; "error-codes"?: string[] };
    return { ok: data.success === true, errorCodes: data["error-codes"] ?? [] };
  } finally {
    clearTimeout(timer);
  }
}
```

```typescript
// auth.ts — inside /auth/register, AFTER rate-limit, BEFORE isValidEmailShape
const { email: rawEmail, password, turnstileToken } = (body ?? {}) as {
  email?: unknown; password?: unknown; turnstileToken?: unknown;
};
if (typeof turnstileToken !== "string" || turnstileToken.length === 0) {
  return c.json({ error: "Captcha verification failed", code: "CAPTCHA_FAILED" }, 400);
}
let captchaResult;
try {
  captchaResult = await verifyTurnstileToken(turnstileToken, ip);
} catch {
  return c.json({ error: "Captcha service unavailable, please retry", code: "CAPTCHA_FAILED" }, 503);
}
if (!captchaResult.ok) {
  return c.json({ error: "Captcha verification failed", code: "CAPTCHA_FAILED" }, 400);
}
```

**Env vars required (production):**
- `TURNSTILE_SECRET_KEY` — Railway env (server-side only, never in PWA)
- `VITE_TURNSTILE_SITE_KEY` — Vercel env (PWA build-time embed)

**Test bypass for unit tests:** the helper must be mockable via DI seam (mirror `__setSendEmailVerificationEmailForTest` pattern at `auth.ts:32`). Add `__setVerifyTurnstileTokenForTest(fn)` + `__resetVerifyTurnstileTokenForTest()` exports so tests can inject a stub without hitting Cloudflare.

**Helper-invocation drift detector** (CONTEXT D-01 test cases #4): `fs.readFileSync('auth.ts')` matches `/verifyTurnstileToken\(/` inside the `/auth/register` handler body. Prevents the helper from being silently deleted at the call site while the import remains (typed-as-unused gotcha).

### AUTH-126-03 — Email-verification middleware with 24h grace (D-02)

**Files to create:**
- `vigil-core/src/middleware/require-verified-email.ts` — exports `requireVerifiedEmailWithGrace: MiddlewareHandler`.

**Files to edit:**
- `vigil-core/src/index.ts` — add the middleware AFTER the bearerAuth dispatcher at lines 159-168, BEFORE the first `/v1/*` non-auth route registration (e.g., before `app.use("/v1/*", metricsMiddleware)` at line 181, OR mount it as a `app.use("/v1/*", ...)` between them — see mount-order subsection below).

**Schema verified:** `users.emailVerifiedAt` (nullable timestamp, schema.ts:52) and `users.createdAt` (notNull timestamp, schema.ts:33). Use `createdAt` (NOT `passwordChangedAt`) as the grace anchor — `createdAt` is "signup time" and matches the user's mental model. `passwordChangedAt` would penalize claim-flow users whose password change re-arms the 24h window unfairly.

**Diff shape:**
```typescript
// vigil-core/src/middleware/require-verified-email.ts (NEW)
import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";

const GRACE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Bypass list — paths that MUST be reachable by unverified users.
// /v1/health: monitoring. /v1/auth/*: login/logout/resend-verification/etc.
function isBypass(path: string): boolean {
  if (path === "/v1/health") return true;
  if (path.startsWith("/v1/auth/")) return true;
  return false;
}

export const requireVerifiedEmailWithGrace: MiddlewareHandler = async (c, next) => {
  if (isBypass(c.req.path)) return next();
  const userId = c.get("userId");  // bearerAuth ran first; userId guaranteed present
  if (!db) return c.json({ error: "Database unavailable" }, 503);
  const [user] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: "Invalid token subject", code: "INVALID_CREDENTIALS" }, 401);
  if (user.emailVerifiedAt !== null) return next();
  const verifiedAfter = user.createdAt.getTime() + GRACE_WINDOW_MS;
  if (Date.now() < verifiedAfter) return next();
  return c.json({
    error: "Verify your email to continue",
    code: "EMAIL_NOT_VERIFIED",
    verified_after_iso: new Date(verifiedAfter).toISOString(),
  }, 403);
};
```

**Mount-order constraint (LOAD-BEARING):**

Current order at `vigil-core/src/index.ts`:
```
secureHeaders (123) → timeout (129) → rateLimiter (132)
→ health route mount (135)
→ authRoutes mount (139) — register/login
→ forgotPassword/resetPassword/verifyEmail mounts (143-152) — public token-as-auth
→ bearerAuth DISPATCHER (159-168) — short-circuits public paths, applies bearerAuth to rest
→ metricsMiddleware (181)
→ protected route mounts (184+)
```

New middleware mounts **between line 168 (bearerAuth dispatcher closing brace) and line 181 (metricsMiddleware)** as a new `app.use("/v1/*", requireVerifiedEmailWithGrace);` call. This guarantees:
1. bearerAuth ran first → `c.get("userId")` is populated
2. Public paths (`/v1/health`, `/v1/auth/*`) bypass via the dispatcher's `return next()` calls AND via the middleware's own `isBypass()` check (defense in depth)
3. Every protected `/v1/*` route mounted AFTER it inherits the gate

**Schema regression risk: zero.** Phase 113 migration 0017 backfilled `users.emailVerifiedAt = created_at` for all existing rows, so existing seed users (including the operator's account) all pass `emailVerifiedAt IS NOT NULL` → bypass the grace check. New post-Phase-113 users registered before Phase 126 with `emailVerifiedAt: null` will fall into the grace window or 403, which is the desired behavior.

**Drift detectors:**
- Test asserts the mount line `app.use("/v1/*", requireVerifiedEmailWithGrace)` appears AFTER the bearerAuth dispatcher line (`if (c.req.path === "/v1/auth/register")` substring) and BEFORE the first protected `app.route("/v1", summary)` call at line 187. Use `index.ts` source-content regex.
- Test asserts the `isBypass` function includes both `/v1/health` AND `/v1/auth/` literals.

### AUTH-126-04 — Sentry (server + client)

**Files to create:**
- `vigil-core/src/lib/sentry.ts` — `initSentry()` + `captureToSentry(userId, err, context)`. DSN gate.
- (No new PWA file; init inline in `main.tsx`)

**Files to edit:**
- `vigil-core/src/index.ts` — call `initSentry()` BEFORE `export const app = new Hono()` at line 84. Update `app.onError` at lines 252-260 to call `captureToSentry` after the existing `captureException` (PostHog).
- `vigil-pwa/src/main.tsx` — call `Sentry.init({dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.MODE, tracesSampleRate: 0})` BEFORE `createRoot`. Optionally wrap top-level `<App />` in `<Sentry.ErrorBoundary>`.
- `vigil-pwa/src/components/ErrorBoundary.tsx` — add `Sentry.captureException(error)` inside `componentDidCatch` (the file exists per directory listing).

**Diff shape (server):**
```typescript
// vigil-core/src/lib/sentry.ts (NEW)
import * as Sentry from "@sentry/node";
let initialized = false;
export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0,         // errors only; stay under 5k/mo free tier
  });
  initialized = true;
}
export function captureToSentry(
  userId: number | null,
  err: unknown,
  context: Record<string, unknown> = {},
): void {
  if (!initialized) return;
  const error = err instanceof Error ? err : new Error(String(err));
  Sentry.withScope((scope) => {
    if (userId !== null) scope.setUser({ id: String(userId) });
    scope.setContext("request", context);
    Sentry.captureException(error);
  });
}
```

```typescript
// vigil-core/src/index.ts — line 84 area
import { initSentry, captureToSentry } from "./lib/sentry.js";
initSentry();  // BEFORE any imports that might throw or the app constructor
export const app = new Hono();
// ... existing code ...

// lines 252-260 — extend onError
app.onError((err, c) => {
  console.error("[vigil-core] unhandled error:", err);
  const userId = (c.get("userId") as number | undefined) ?? null;
  captureException(userId, err, { route: c.req.path, method: c.req.method });   // existing PostHog
  captureToSentry(userId, err, { route: c.req.path, method: c.req.method });    // NEW
  return c.json({ error: "Internal server error" }, 500);
});
```

**Diff shape (PWA):**
```typescript
// vigil-pwa/src/main.tsx (existing — ADD at top before createRoot)
import * as Sentry from "@sentry/react";
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}
```

**Env vars required:**
- Server: `SENTRY_DSN` (Railway)
- Client: `VITE_SENTRY_DSN` (Vercel)

**Sentry project structure (planner discretion per CONTEXT line 108):** single project recommended for a 1k-events-per-month-launch. Use Sentry's `environment` tag + `release` tag to differentiate server (`vigil-core`) vs client (`vigil-pwa`). If quota becomes a problem, split into two projects later — zero code change required, just DSN swap.

**Drift detector:** test asserts `initSentry()` appears BEFORE `export const app = new Hono()` in `index.ts` source (line-number comparison via regex match indices).

### AUTH-126-05 — PWA structured error UX (D-04)

**Files to create:**
- `vigil-pwa/src/lib/api-error-codes.ts` — exports `ERROR_CODE_MAP: Record<string, { message: string; ctaLabel?: string; ctaHref?: string }>` AND a `resolveApiError(body: {error?: string; code?: string}, fallback: string): { message: string; ctaLabel?: string; ctaHref?: string }` helper. Returns fallback if code is missing OR unknown.

**Files to edit (vigil-core — every error path in `auth.ts` + middleware):**

EVERY `c.json({ error: ... }, status)` in `vigil-core/src/routes/auth.ts` must include `code`. Specifically:

| Line | Current | Add `code` |
|------|---------|------------|
| 96   | `{ error: "Registration not configured" }` | — keep as-is (503, no user-facing route; not in locked enum) OR add `code: "SERVER_NOT_CONFIGURED"` (extension of enum) |
| 103  | `{ error: "Invalid JSON body" }` | `code: "INVALID_JSON"` (extension) |
| 111  | `{ error: "email and password are required" }` | `code: "INVALID_REQUEST"` (extension) — or split into `MISSING_EMAIL`/`MISSING_PASSWORD` |
| 114  | `{ error: "Invalid email format" }` | `code: "INVALID_EMAIL_FORMAT"` (LOCKED) |
| 118  | `{ error: "Password must be N-N characters" }` | `code: "PASSWORD_TOO_SHORT"` if < MIN, `code: "PASSWORD_TOO_LONG"` if > MAX (LOCKED — split branch) |
| 127  | `{ error: "Registration is not open to this address" }` | `code: "REG_NOT_ALLOWED"` (LOCKED) |
| 186  | `{ error: "Unable to register with those credentials" }` | `code: "EMAIL_TAKEN"` (LOCKED) |
| 195/203 | login JSON-body errors | `code: "INVALID_REQUEST"` (extension) |
| 221/226 | `{ error: "Invalid credentials" }` | `code: "INVALID_CREDENTIALS"` (LOCKED) |

NEW middleware error (AUTH-126-03): `code: "EMAIL_NOT_VERIFIED"` (LOCKED) with `verified_after_iso`.
NEW captcha error (AUTH-126-02): `code: "CAPTCHA_FAILED"` (LOCKED).
NEW rate-limit error (AUTH-126-01): `code: "RATE_LIMITED"` (LOCKED) with `retry_after_seconds`.

**Backward compat invariant:** existing `error` strings stay byte-identical (downstream consumers reading `body.error` keep working). Only ADD the `code` field.

**Files to edit (vigil-pwa):**
- `vigil-pwa/src/pages/AuthPage.tsx` — replace the THREE `setError(GENERIC_ERROR)` collapses at lines 53, 76-77, 86-87 with parsed-body-aware logic:
  ```tsx
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
    const ux = resolveApiError(body, GENERIC_ERROR);
    setError(ux.message);
    // optional: setErrorCta(ux.ctaLabel/Href)
    return;
  }
  ```
  Keep `GENERIC_ERROR` as the fallback for unknown codes / network errors — this preserves the existing UX as a safety net while making real codes surface real messages.

**`api-error-codes.ts` skeleton:**
```typescript
// vigil-pwa/src/lib/api-error-codes.ts (NEW)
export interface ApiErrorUx { message: string; ctaLabel?: string; ctaHref?: string; }

export const ERROR_CODE_MAP: Record<string, ApiErrorUx> = {
  CAPTCHA_FAILED:        { message: "Please complete the captcha and try again." },
  RATE_LIMITED:          { message: "Too many attempts. Please wait an hour and try again." },
  REG_NOT_ALLOWED:       { message: "Sign-up isn't open to this email address yet. Contact Vigil to request access.", ctaLabel: "Contact", ctaHref: "mailto:hello@vigilhub.io" },
  INVALID_EMAIL_FORMAT:  { message: "That doesn't look like a valid email address." },
  PASSWORD_TOO_SHORT:    { message: "Password must be at least 12 characters." },
  PASSWORD_TOO_LONG:     { message: "Password must be 128 characters or fewer." },
  EMAIL_TAKEN:           { message: "An account with this email already exists.", ctaLabel: "Sign in instead", ctaHref: "#login" },
  EMAIL_NOT_VERIFIED:    { message: "Please verify your email to continue using Vigil.", ctaLabel: "Resend verification", ctaHref: "/settings" },
  INVALID_CREDENTIALS:   { message: "Invalid email or password. Please try again." },
};

export function resolveApiError(
  body: { error?: string; code?: string } | null | undefined,
  fallback: string,
): ApiErrorUx {
  if (body?.code && ERROR_CODE_MAP[body.code]) return ERROR_CODE_MAP[body.code];
  if (typeof body?.error === "string" && body.error.length > 0) return { message: body.error };
  return { message: fallback };
}
```

**Drift detector (server-side):**
- `auth.test.ts` adds a test `AUTH-126-ERROR-CODE-COVERAGE`: dispatch every documented failure path against a Hono test app and assert each response includes BOTH `error: string` AND `code: string` keys. Prevents regression where someone forgets the `code` field.

### AUTH-126-06 — Privacy + Terms of Service

**Files to create:**
- `vigil-pwa/src/pages/PrivacyPolicyPage.tsx`
- `vigil-pwa/src/pages/TermsOfServicePage.tsx`

**Files to edit:**
- `vigil-pwa/src/App.tsx` — add two `<Route>` siblings outside the `isAuthenticated` guard (mirror the existing `/auth/forgot` placement at line ~73).
- `vigil-pwa/src/pages/AuthPage.tsx` — add footer links to `/legal/privacy` and `/legal/terms` (below or beside the toggle-mode button at line ~196).

**Minimum acceptable v1 content (per CONTEXT line 109):** publishable, linkable, returns 200. Lawyer review recommended within 30 days post-revenue. Generator output (Termly free, Iubenda free, etc.) pasted into JSX is fine. Use a single `<article>` element + `<h1>` + `<section>`s with `<p>` content. Match Tailwind classes from existing pages (e.g., `min-h-screen bg-gray-900 text-white px-6 py-8`).

### AUTH-126-07 — Anthropic monthly spend cap (OPERATOR-ONLY)

**No code task.** Plan a wallclock todo at:
`.planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md`

Runbook (operator content for the todo):
```
1. Log into https://console.anthropic.com
2. Navigate to: Settings → Billing → Usage limits (or "Spend limits")
3. Set a monthly cap = 3× expected baseline (per CONTEXT line 114).
   - Current baseline ≈ $X/mo (operator fills in from console).
4. Verify alert email destination is jamesonmorrill1@gmail.com.
5. Update this todo with the cap value + timestamp; move to .planning/todos/completed/.
6. Mark AUTH-126-07 complete in ROADMAP.md.
```

Per memory `feedback_wallclock_checkpoint_exempt.md`, yolo mode does NOT bypass wallclock checkpoints. The phase plan-checker should flag any plan that claims to "complete" AUTH-126-07 without this todo being filed.

### AUTH-126-08 — Allowlist sentinel `*` kill-switch

**Files to edit:**
- `vigil-core/src/routes/auth.ts` — modify `isAllowlistedEmail` at lines 74-83 with a single sentinel check.

**Current code (auth.ts:74-83):**
```typescript
function isAllowlistedEmail(email: string): boolean {
  const list = process.env["VIGIL_ALLOWED_EMAILS"];
  if (!list) return false; // D-10 fail-closed
  const allowed = list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase()); // Pitfall 5
}
```

**Smallest diff (additive, preserves Phase 113 D-10 fail-closed semantics):**
```typescript
function isAllowlistedEmail(email: string): boolean {
  const list = process.env["VIGIL_ALLOWED_EMAILS"];
  if (!list) return false; // D-10 fail-closed
  // Phase 126 (AUTH-126-08) — `*` sentinel: open the gate to all emails.
  // Trim-aware: `"*"`, `" * "`, and `"*,"` all match. Mixed with real emails
  // (e.g., `"*,extra@x.com"`) is also treated as open — `*` always wins.
  const allowed = list
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  if (allowed.includes("*")) return true;
  return allowed.includes(email.toLowerCase()); // Pitfall 5
}
```

**Risk audit:**
- Empty-string `""` already returns false via `if (!list) return false` (truthiness check at line 76)
- Whitespace-only string `"   "` → split gives `[""]` → map gives `[""]` → filter removes → `allowed.length === 0` → return false. SAFE.
- Wildcard semantics: `"*"` alone OR `"*,foo@bar.com"` → returns true for all. Documented as the kill-switch.
- Per CONTEXT line 110 "strict `*` is enough for v1" — do NOT implement `*@domain.com` glob support. Defer.

**Drift detector:** test asserts the literal string `"*"` appears inside `isAllowlistedEmail` body (between function open brace and close brace). Catches accidental removal.

## Conventions to Preserve

These come from prior phases (104, 110, 112, 113, 117, 122, 124, 125) and STATE.md. The planner MUST honor them or accumulated test infrastructure breaks.

### Phase 117 drift-detector convention
- Every `const RATE_LIMIT_MAX_*` declaration at top-of-file has a paired test that asserts the literal verbatim via `fs.readFileSync` + regex.
- Test name format: `AUTH-126-CAP-IP-20` (mirroring Phase 117's `AUTH-13-FP-CAP-IP-20`).
- Pattern lives at `vigil-core/src/routes/forgot-password.test.ts:421-444` and `resend-verification.test.ts:222-231`.

### Mount-order convention (Phase 124 + 125 carryforward)
- All `/v1/*` middleware mounts happen between the bearerAuth dispatcher (index.ts:159-168) and the first protected route registration.
- A drift detector locks the order via source-content position assertions (see Phase 124 Plan 09's mount-order assertion pattern).
- Reasoning: mounting a middleware BEFORE bearerAuth would create a silent auth bypass (cross-user data write becomes possible). The new `requireVerifiedEmailWithGrace` is in this category.

### Error-shape additivity (D-04)
- NEW `{error, code}` shape is ADDITIVE — existing `{error}` consumers continue to work.
- The locked enum is GROW-ONLY: planner may ADD new codes (e.g., `INVALID_JSON`, `INVALID_REQUEST`) but cannot RENAME or REMOVE any of the 9 locked codes (CAPTCHA_FAILED, RATE_LIMITED, REG_NOT_ALLOWED, INVALID_EMAIL_FORMAT, PASSWORD_TOO_SHORT, PASSWORD_TOO_LONG, EMAIL_TAKEN, EMAIL_NOT_VERIFIED, INVALID_CREDENTIALS).

### Sliding-window rate-limit pattern (Phase 112 / 117)
- In-memory `Map<string, number[]>` keyed by IP-or-email
- `setInterval(...)` cleanup every WINDOW_MS with `.unref()` so tests don't hang
- `takeSlot(map, key, now, max): boolean` helper
- `__resetBucketsForTest()` export for test isolation

### DI seam pattern for tests (Phase 113)
- `let realFn = realImport; export function __setRealFnForTest(fn) { realFn = fn; }` lives at module scope (not inside handler) so test-time patching is observable across both code paths.
- New `verifyTurnstileToken` should follow this shape: `let verifyTurnstileTokenFn = realVerifyTurnstileToken; export function __setVerifyTurnstileTokenForTest(fn) {...}`.

### PostHog event property denylist (Phase 103/105)
- `BLOCKED_PROPERTY_NAMES` in `analytics/posthog.ts:32-41` — names like `content`, `body`, `message`, `text`. Sentry context objects MUST also avoid these property names; otherwise the analytics denylist intent is bypassed via Sentry. The planner should document this in the Sentry helper's JSDoc.

### CLAUDE.md awareness
No `./CLAUDE.md`, `vigil-core/CLAUDE.md`, or `vigil-pwa/CLAUDE.md` files exist in this repo (verified `[VERIFIED: ls -l]` 2026-05-11). No project-level directives override.

## Validation Architecture

**Note:** `.planning/config.json` does NOT set `workflow.nyquist_validation`. Per researcher contract, absent key = enabled. This section is therefore REQUIRED.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + `node:assert/strict` for vigil-core; `vitest@^2.1.9` for vigil-pwa |
| Config file | None for vigil-core (Node test runner); `vigil-pwa/vitest` config likely inferred from package.json |
| Quick run command | `cd vigil-core && npx tsx --test src/routes/auth.test.ts` (single file — avoids the index.js setInterval-loop hang documented in STATE.md "Active blockers") |
| Full suite command | `cd vigil-core && npm test` for vigil-core; `cd vigil-pwa && npm test` for vigil-pwa |
| Server test pattern | Hono `app.fetch(new Request(...))` — no listening port. Reference: `auth.test.ts:33-44` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-126-01 | `AUTH-126-CAP-IP-20`: source declares `const RATE_LIMIT_MAX_IP = 20;` verbatim | drift-detector | `npx tsx --test src/routes/auth.test.ts` | will extend existing |
| AUTH-126-01 | `AUTH-126-CAP-EMAIL-5`: source declares `const RATE_LIMIT_MAX_EMAIL = 5;` verbatim | drift-detector | same | will extend existing |
| AUTH-126-01 | 6th request from same IP for same email returns 429 with code:"RATE_LIMITED" | behavior (integration) | same | will extend |
| AUTH-126-01 | 21st request from same IP across distinct emails returns 429 (IP cap) | behavior | same | will extend |
| AUTH-126-01 | 429 body includes `retry_after_seconds` | behavior | same | will extend |
| AUTH-126-02 | Source asserts `verifyTurnstileToken(` invoked inside `/auth/register` handler body | drift-detector (call-site lock) | same | will extend |
| AUTH-126-02 | Missing/empty `turnstileToken` → 400 with code:"CAPTCHA_FAILED" | behavior | same | will extend |
| AUTH-126-02 | Mocked Turnstile returns `{success: false}` → 400 CAPTCHA_FAILED; allowlist NOT consulted | behavior + DI seam | same | will extend |
| AUTH-126-02 | Mocked Turnstile throws (network error) → 503 (NOT 200, NOT 400) | behavior | same | will extend |
| AUTH-126-02 | `vigil-core/src/lib/turnstile.ts` declares `https://challenges.cloudflare.com/turnstile/v0/siteverify` | drift-detector | `npx tsx --test src/lib/turnstile.test.ts` | NEW Wave 0 |
| AUTH-126-03 | Verified user → middleware calls next() regardless of createdAt | behavior | `npx tsx --test src/middleware/require-verified-email.test.ts` | NEW Wave 0 |
| AUTH-126-03 | Unverified user signed up 5min ago → next() (within grace) | behavior | same | NEW Wave 0 |
| AUTH-126-03 | Unverified user signed up 25h ago → 403 EMAIL_NOT_VERIFIED with verified_after_iso in past | behavior | same | NEW Wave 0 |
| AUTH-126-03 | Phase 113 seed user (backfilled emailVerifiedAt) → pass | regression | same | NEW Wave 0 |
| AUTH-126-03 | `/v1/health` bypasses middleware unconditionally | behavior | same | NEW Wave 0 |
| AUTH-126-03 | `/v1/auth/resend-verification` bypasses middleware unconditionally | behavior | same | NEW Wave 0 |
| AUTH-126-03 | Mount-order: `app.use("/v1/*", requireVerifiedEmailWithGrace)` appears AFTER bearerAuth dispatcher AND BEFORE first protected route mount in `index.ts` | drift-detector (mount-order assertion) | `npx tsx --test src/__tests__/mount-order.test.ts` (if exists, else NEW) | NEW Wave 0 if not present |
| AUTH-126-04 | `initSentry()` call appears BEFORE `export const app = new Hono()` in `index.ts` | drift-detector (mount-order) | same as above | NEW Wave 0 |
| AUTH-126-04 | `captureToSentry` invoked from `app.onError` handler | drift-detector | same | NEW Wave 0 |
| AUTH-126-04 | Sentry init no-ops when `SENTRY_DSN` unset | unit | `npx tsx --test src/lib/sentry.test.ts` | NEW Wave 0 |
| AUTH-126-05 | Every error response in `/auth/register` and `/auth/login` includes BOTH `error` (string) AND `code` (string) keys | drift-detector + behavior (`AUTH-126-ERROR-CODE-COVERAGE`) | `npx tsx --test src/routes/auth.test.ts` | will extend |
| AUTH-126-05 | `verified_after_iso` field included on EMAIL_NOT_VERIFIED 403 | behavior | `npx tsx --test src/middleware/require-verified-email.test.ts` | NEW Wave 0 |
| AUTH-126-05 | PWA `resolveApiError({}, fallback)` returns fallback | unit (vitest) | `cd vigil-pwa && npx vitest run src/lib/api-error-codes.test.ts` | NEW Wave 0 |
| AUTH-126-05 | PWA `resolveApiError({error:"x", code:"UNKNOWN"}, fb)` returns `{message: "x"}` (unknown code → raw error) | unit | same | NEW Wave 0 |
| AUTH-126-05 | PWA `resolveApiError({error:"x", code:"CAPTCHA_FAILED"}, fb)` returns mapped UX | unit | same | NEW Wave 0 |
| AUTH-126-05 | AuthPage on 4xx parses body and surfaces mapped message instead of GENERIC_ERROR | integration (vitest + testing-library) | `cd vigil-pwa && npx vitest run src/pages/AuthPage.test.tsx` | will extend existing |
| AUTH-126-06 | `/legal/privacy` route returns 200 with substring "privacy" | integration (vitest + testing-library, mount via MemoryRouter) | same dir | NEW Wave 0 |
| AUTH-126-06 | `/legal/terms` route returns 200 with substring "terms" | integration | same | NEW Wave 0 |
| AUTH-126-06 | Signup screen contains links to /legal/privacy AND /legal/terms | integration | existing AuthPage test extension | will extend |
| AUTH-126-07 | Wallclock todo file exists at `.planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md` | filesystem check (test or executor gate) | n/a — operator confirms by moving file to /completed/ | NEW Wave 0 |
| AUTH-126-08 | `VIGIL_ALLOWED_EMAILS="*"` → `isAllowlistedEmail("anyone@anywhere.com")` returns true | behavior | `npx tsx --test src/routes/auth.test.ts` | will extend |
| AUTH-126-08 | `VIGIL_ALLOWED_EMAILS=""` → returns false (fail-closed regression guard) | regression | same | will extend |
| AUTH-126-08 | `VIGIL_ALLOWED_EMAILS=" * , foo@x.com "` → returns true for both `*`-matching email and `foo@x.com` | behavior | same | will extend |
| AUTH-126-08 | Source asserts literal `"*"` exists inside `isAllowlistedEmail` body | drift-detector | same | will extend |

### Sampling Rate
- **Per task commit:** `cd vigil-core && npx tsx --test src/routes/auth.test.ts src/middleware/require-verified-email.test.ts src/lib/turnstile.test.ts src/lib/sentry.test.ts` (under 30s; avoids index.js hang)
- **Per wave merge:** all server files via `npx tsx --test` glob; PWA via `cd vigil-pwa && npm test`
- **Phase gate:** Full suites green on both packages before `/gsd-verify-work`. Pre-existing test failures (carry-forward) documented in STATE.md "Blockers" — npm test suite hang on integration imports is a known workaround.

### Wave 0 Gaps

- [ ] `vigil-core/src/lib/turnstile.test.ts` — covers AUTH-126-02 server-side verify logic + DI seam (drift detector for the siteverify URL literal)
- [ ] `vigil-core/src/middleware/require-verified-email.test.ts` — covers AUTH-126-03 grace window + bypass list + DI for db
- [ ] `vigil-core/src/lib/sentry.test.ts` — covers AUTH-126-04 init no-op when DSN unset + captureToSentry shape
- [ ] `vigil-core/src/__tests__/mount-order.test.ts` (if not present) — covers AUTH-126-03 + AUTH-126-04 mount-order drift detectors (source-file regex against `vigil-core/src/index.ts`)
- [ ] `vigil-pwa/src/lib/api-error-codes.test.ts` — covers AUTH-126-05 resolver
- [ ] `vigil-pwa/src/pages/PrivacyPolicyPage.test.tsx` and `TermsOfServicePage.test.tsx` — AUTH-126-06 200-with-content
- [ ] Framework install: NONE — `node:test` is built-in; `vitest@^2.1.9` already in `vigil-pwa/package.json:33`

## Risks and Gotchas

### R1 — Sentry init order is invisible until something breaks
**Symptom:** Sentry silently misses early errors (import-time throws, module-init failures) if `initSentry()` runs after `new Hono()`.
**Mitigation:** The mount-order drift detector for `index.ts` asserts `initSentry()` appears BEFORE `new Hono()` via line-number comparison. Hard gate.

### R2 — PWA AuthPage error-collapse bug is at FOUR sites, not one
The `setError(GENERIC_ERROR)` collapse appears at AuthPage.tsx lines 53 (login), 76-77 (signup register), 86-87 (signup auto-login), and 103 (catch block). The catch-block site (103) should KEEP `GENERIC_ERROR` (network errors have no body to parse). The first three are the ones that need parsing logic. **Don't accidentally over-refactor the network-error path.**

### R3 — Turnstile widget needs the `cf-turnstile-response` token name in form-encoded payloads, but our POST is JSON
`@marsidev/react-turnstile`'s `onSuccess` callback returns the raw token string. Submit it under whatever JSON key your server expects (recommendation: `turnstileToken`). The token name `cf-turnstile-response` only matters when using form-encoded submission. Our PWA uses `Content-Type: application/json` everywhere — safe.

### R4 — Turnstile siteverify response includes `error-codes` (hyphenated key)
JavaScript object access: `data["error-codes"]`, NOT `data.errorCodes`. Don't use `camelCase` destructuring assumptions. `[VERIFIED: Cloudflare official docs 2026-05-11]`.

### R5 — Email-verify middleware breaks Phase 113 backwards compat if it consults `passwordChangedAt`
Original implementation might be tempted to use `passwordChangedAt` since it exists for the bearerAuth iat-gate. DO NOT. Use `createdAt`. `passwordChangedAt` re-arms 24h grace every password change → claim-flow users (Phase 113 seed claim) get unfairly locked out. Schema verified at vigil-core/src/db/schema.ts:33 (`createdAt`) vs :44 (`passwordChangedAt`).

### R6 — `VIGIL_ALLOWED_EMAILS="*"` sentinel collides with a literal email containing `*`?
No — email shape validation at `auth.ts:85-88` (`isValidEmailShape`) rejects any email containing `*` (regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` doesn't allow `*` because... actually wait — the regex does NOT explicitly block `*`. But RFC 5322 doesn't allow `*` in local-part either practically, and real email providers reject it. If a malicious request submits `"foo*@bar.com"` and the env is `VIGIL_ALLOWED_EMAILS="foo*@bar.com"`, the `allowed.includes("*")` check at the top would NOT fire (because the array contains `"foo*@bar.com"`, not `"*"`). So the sentinel-check `allowed.includes("*")` is safe — it requires `*` to be a STANDALONE element in the split array. SAFE.

### R7 — Rate-limit clock-skew when in-memory Map shared across multi-instance deploys
Current Railway deployment is single-instance (CONTEXT.md doesn't change this). Multi-instance scale would require Redis-backed buckets (deferred — same constraint Phase 112 documented). Document in SUMMARY as "Phase 127+ if we ever scale horizontally."

### R8 — Test isolation: `__resetBucketsForTest` must be added AND called in `beforeEach`
Mirror `resend-verification.ts:77-79` + the corresponding `beforeEach` in `resend-verification.test.ts`. Without this, a 5-attempts test for AUTH-126-CAP-EMAIL-5 will fail when run after the AUTH-126-CAP-IP-20 test consumed the bucket.

### R9 — `@sentry/node@10` is a major version step from any prior Sentry knowledge
Sentry v8+ moved to a new SDK architecture (no `Sentry.Hub`, simpler init). Use the v10 `Sentry.withScope` API (shown in the diff above) — DO NOT use deprecated `Sentry.configureScope`. `[CITED: https://docs.sentry.io/platforms/javascript/migration/v7-to-v8/]`.

### R10 — Vercel SPA rewrite captures `/legal/*` routes correctly
`vigil-pwa/vercel.json` rewrites ALL `/(.*)` to `/`. This means `/legal/privacy` → serves `index.html` → React Router resolves the route client-side. Confirmed working pattern (Phase 112's `/auth/forgot` uses the same flow). No Vercel config changes needed.

### R11 — Existing `vigil-core npm test` suite hang (STATE.md "Active blockers")
Integration tests import `index.js` which spawns `generate-scheduler` + `gmail-workorders` `setInterval` loops at module load. Use `npx tsx --test <file>` per-file instead. The validation architecture explicitly accounts for this — sampling commands are per-file, not `npm test`.

### R12 — Sentry context object name collisions with PostHog denylist
Per Phase 103 D-01..D-04, PostHog event property names like `content`, `body`, `text`, `message` are denylisted. If a Sentry `context` object uses `message: "..."` as a key, the denylist is irrelevant (Sentry has its own free-form context schema). But for cross-tool consistency, prefer `request` / `route` / `method` / `userId` shaped context (which is exactly what the existing `captureException(userId, err, {route, method})` call uses at index.ts:255-258). Don't fight the denylist; just don't accidentally normalize Sentry context to PostHog's banned shapes.

## Out-of-Scope Confirmation

These came up but are explicitly deferred per CONTEXT.md "Deferred Ideas" + "Out-of-scope" — researcher confirms each was reviewed and is NOT addressed in this RESEARCH.md:

- **Secret-drift hardening rider** — out of scope; sibling concern, separate phase needed.
- **CSP header tuning** — out of scope; `secureHeaders()` defaults at index.ts:123-126 stay untouched.
- **Per-user AI usage quota** — out of scope; depends on pricing decision + DB schema add.
- **Brute-force protection on /auth/login** — out of scope; current global 100/60s rate limit at `rate-limit.ts:10` continues to apply.
- **GDPR/CCPA data-export + delete-account endpoint** — out of scope; required only if EU/CA users land.
- **Sign-in-with-Google** — out of scope; bigger surface than Phase 126.
- **Sentry source-map upload** — deferred within AUTH-126-04 (CI complexity); document in SUMMARY for Phase 127 candidate.
- **`*@domain.com` glob support in isAllowlistedEmail()** — deferred per CONTEXT.md line 110; strict `*` is v1.
- **Multi-instance scale-out for in-memory rate-limit Maps** — deferred (Phase 112 already documented).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@marsidev/react-turnstile` is the right choice over `react-turnstile` or other forks | §Library Decisions §1 | LOW — `@marsidev/react-turnstile` is the most-actively-maintained React 19-compatible wrapper as of 2026-05-11 npm registry data; if rejected, fallback is rendering the Cloudflare-hosted div + script tag directly (one extra file, same server-side logic) |
| A2 | Sentry single-project setup is sufficient | §Library Decisions §2 + CONTEXT line 108 | LOW — explicitly flagged as planner discretion; reversible via DSN swap |
| A3 | Hand-rolled React legal pages beat Termly hosted for v1 | §Library Decisions §3 + CONTEXT line 109 | LOW — explicitly flagged as planner discretion; trivially swappable later |
| A4 | The `createdAt`-based grace window (not `passwordChangedAt`) is correct for AUTH-126-03 | §Implementation Map AUTH-126-03 + R5 | MEDIUM — if `passwordChangedAt` is preferred for some claim-flow reason the planner should challenge; default is `createdAt` per CONTEXT.md D-02 ("after signup") |
| A5 | Bypass list `/v1/health` + `/v1/auth/*` is complete (no other unauthenticated `/v1/*` routes need bypass) | §Implementation Map AUTH-126-03 | LOW — verified against index.ts:159-168 dispatcher exempt list; future unauthenticated routes would need to be added to both dispatcher AND middleware bypass |
| A6 | 5s AbortController timeout on Turnstile siteverify is adequate | §Library Decisions §1 | LOW — Cloudflare typical latency 50-200ms; 25× headroom |
| A7 | Sentry `tracesSampleRate: 0` keeps us under 5k events/mo on free tier | §Library Decisions §2 | LOW — only `captureException` calls count against quota when traces are off; current PostHog autocapture rate is well under 5k/mo per memory + analytics history |

**No claims are [ASSUMED] without verification beyond these — every other technical claim has `[VERIFIED]` or `[CITED]` provenance inline.**

## Open Questions

1. **Should `INVALID_REQUEST` / `INVALID_JSON` / `SERVER_NOT_CONFIGURED` be added to the locked enum, or kept as ad-hoc "extension" codes?**
   - What we know: CONTEXT.md D-04 says planner MAY add codes but cannot remove them.
   - What's unclear: whether the planner should formally lock these in the PLAN.md or leave as fluid.
   - Recommendation: lock them in PLAN.md to give the PWA error-code map a stable target. Add to a "Phase 126 enum extensions" subsection so the contract is explicit.

2. **Does `requireVerifiedEmailWithGrace` need to bypass `/v1/agent-stream` (Phase 124 SSE)?**
   - What we know: it's a `/v1/*` route, not an `/v1/auth/*` route.
   - What's unclear: if Phase 124's vigil-watch daemon sends events for an unverified user, should the SSE be blocked or allowed?
   - Recommendation: ALLOW (no bypass needed) — vigil-watch is operator-only and the operator's account is verified. If the 24h grace window applies, the daemon either works (within grace) or surfaces the same EMAIL_NOT_VERIFIED 403 the PWA sees, which is correct UX. Document in PLAN.md as a deliberate choice.

3. **Should the captcha widget also render on the LOGIN form, not just signup?**
   - What we know: CONTEXT.md D-01 says "PWA: ... widget on signup form."
   - What's unclear: protecting login from brute-force is in scope of the deferred "Brute-force protection on /auth/login" item.
   - Recommendation: signup-only for Phase 126 (matches CONTEXT verbatim). Login captcha rides with the deferred brute-force phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All server code | ✓ (assumed dev machine + Railway) | ≥ 18 (existing runtime) | — |
| npm | Package install | ✓ | per system | — |
| `@marsidev/react-turnstile` package | AUTH-126-02 PWA | ✓ on npm | 1.5.2 | none — required |
| `@sentry/node` package | AUTH-126-04 server | ✓ on npm | 10.52.0 | none — required |
| `@sentry/react` package | AUTH-126-04 PWA | ✓ on npm | 10.52.0 | none — required |
| Cloudflare Turnstile dashboard access | TURNSTILE_SECRET_KEY + VITE_TURNSTILE_SITE_KEY provisioning | ✓ (free tier — operator action) | n/a | operator must register a Turnstile widget in Cloudflare dashboard |
| Sentry dashboard access | SENTRY_DSN + VITE_SENTRY_DSN provisioning | ✓ (free tier — operator action) | n/a | operator must create Sentry project(s) |
| Anthropic Console access | AUTH-126-07 spend cap | ✓ (operator already uses it daily) | n/a | — |
| Railway env-var configuration | TURNSTILE_SECRET_KEY, SENTRY_DSN | ✓ (per memory `project_railway_deploy.md`) | n/a | — |
| Vercel env-var configuration | VITE_TURNSTILE_SITE_KEY, VITE_SENTRY_DSN | ✓ (Vercel-hosted PWA per vigil-pwa/vercel.json) | n/a | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — all required tooling is registered/accessible.

**Operator provisioning required (non-blocking for code work):**
- Register Cloudflare Turnstile widget → get site key + secret key
- Create Sentry project(s) → get DSN(s)
- Set Anthropic monthly spend cap (AUTH-126-07 wallclock)
- Add 4 env vars (2 Railway, 2 Vercel) before deploy

## Security Domain

`security_enforcement` not present in `.planning/config.json` — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | argon2id (existing `utils/password.ts`), JWT HS256 (existing `utils/jwt.ts`), bearerAuth dispatcher (existing `middleware/auth.ts`). Phase 126 ADDS captcha + rate-limit on register; does NOT change existing auth surface. |
| V3 Session Management | partial | JWT stored in PWA `sessionStorage` (not localStorage — XSS-mitigation, existing). Sentry session tracking explicitly NOT enabled (`tracesSampleRate: 0`). |
| V4 Access Control | yes | bearerAuth dispatcher already enforces per-route; new `requireVerifiedEmailWithGrace` adds email-verify gate. Cross-user isolation already locked by Phase 121 patterns. |
| V5 Input Validation | yes | `isValidEmailShape` (existing `auth.ts:85-88`), password length bounds (auth.ts:21-22), `typeof === "string"` guards. New: Turnstile token shape check (`typeof === "string" && length > 0`). |
| V6 Cryptography | yes | argon2id (existing), SHA-256 for tokens (existing `routes/verify-email.ts` + `forgot-password.ts`), `crypto.randomBytes(32)` for token generation. **No new crypto in Phase 126** — all new logic is gating + signaling, not crypto. |
| V11 Business Logic | yes | Rate-limit on register (AUTH-126-01), captcha (AUTH-126-02), email-verify grace (AUTH-126-03) are all business-logic guards on the registration flow. |
| V14 Configuration | yes | Env-var-gated DSNs and Turnstile keys (V14.2). `VIGIL_ALLOWED_EMAILS="*"` sentinel is intentional kill-switch (V14.5 — secure defaults: env unset = fail-closed, only `*` opens). |

### Known Threat Patterns for Hono + Vite React Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bot signup floods exhausting allowlist or AI quota | Denial of Service | Turnstile (AUTH-126-02) + IP+email rate-limit (AUTH-126-01) + Anthropic spend cap (AUTH-126-07) — defense in depth |
| Account enumeration via 403-vs-409 distinction on /auth/register | Information Disclosure | Existing: 403 "Registration is not open to this address" (auth.ts:127) for non-allowlisted vs 409 "Unable to register with those credentials" (auth.ts:186) for existing user. **Phase 126 PRESERVES this — `REG_NOT_ALLOWED` (403) vs `EMAIL_TAKEN` (409) are distinct codes.** This is a known information-disclosure tradeoff already accepted in Phase 102 D-08 (CONTEXT line 19 + auth.ts:125-127 comment). Out of scope to widen. |
| CSRF on POST /auth/register | Tampering | Token-based auth (Bearer header) means no cookie-based CSRF surface. Captcha (AUTH-126-02) adds a per-request anti-automation token. |
| Sentry/PostHog accidentally capturing passwords or tokens | Information Disclosure | PostHog: existing `BLOCKED_PROPERTY_NAMES` denylist (analytics/posthog.ts:32-41). Sentry: documented in R12; ensure `captureToSentry` context never includes `body`/`content`/`message`/`text` from request. Default request shape is `{route, method}` only (index.ts:255-258 existing pattern). |
| Bearer leak via Sentry breadcrumbs | Information Disclosure | Sentry v10 default integrations include HTTP breadcrumb capture. Configure `Sentry.init({integrations: (defaults) => defaults.filter(i => i.name !== "Http")})` OR set `sendDefaultPii: false` (the default). `[CITED: https://docs.sentry.io/platforms/javascript/guides/node/data-management/data-collected/]` Standard mitigation: enabling `sendDefaultPii` requires explicit opt-in in v10; leave default (false). |
| Turnstile token replay across users | Tampering | Turnstile tokens are single-use; siteverify response includes `challenge_ts` and `hostname` — server-side validation rejects replays. Cloudflare enforces this transparently. |
| Captcha-skip via fake `success: true` injection | Spoofing | Token is verified server-side via `secret` (env-only, never client-exposed). Client cannot forge a valid `success: true` from siteverify. |
| Sentry DSN exposure in client bundle | Information Disclosure | DSNs are public-by-design for client SDKs (Sentry's threat model documents this). DSN ≠ secret. PWA's `VITE_SENTRY_DSN` ends up in the JS bundle — expected. `[CITED: https://docs.sentry.io/concepts/key-terms/dsn-explainer/]` |

## Code Examples

### Verifying a Turnstile token (server)
```typescript
// vigil-core/src/lib/turnstile.ts
// Source: Cloudflare official docs — https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export async function verifyTurnstileToken(
  token: string,
  remoteIp: string | null,
): Promise<{ ok: boolean; errorCodes: string[] }> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, errorCodes: [`http-${res.status}`] };
    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    return { ok: data.success === true, errorCodes: data["error-codes"] ?? [] };
  } finally {
    clearTimeout(timer);
  }
}
```

### Rendering the Turnstile widget (PWA)
```tsx
// vigil-pwa/src/components/TurnstileWidget.tsx
// Source: @marsidev/react-turnstile 1.5.2 — https://github.com/marsidev/react-turnstile
import { Turnstile } from "@marsidev/react-turnstile";
interface Props { onToken: (token: string | null) => void }
export default function TurnstileWidget({ onToken }: Props) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;
  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={(token) => onToken(token)}
      onError={() => onToken(null)}
      onExpire={() => onToken(null)}
      options={{ theme: "dark" }}
    />
  );
}
```

### Initializing Sentry server-side BEFORE Hono app
```typescript
// vigil-core/src/lib/sentry.ts  +  vigil-core/src/index.ts
// Source: Sentry official Node docs — https://docs.sentry.io/platforms/javascript/guides/node/
import * as Sentry from "@sentry/node";
let initialized = false;
export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;
  Sentry.init({ dsn, environment: process.env["NODE_ENV"] ?? "development", tracesSampleRate: 0 });
  initialized = true;
}
export function captureToSentry(userId: number | null, err: unknown, context: Record<string, unknown> = {}): void {
  if (!initialized) return;
  const error = err instanceof Error ? err : new Error(String(err));
  Sentry.withScope((scope) => {
    if (userId !== null) scope.setUser({ id: String(userId) });
    scope.setContext("request", context);
    Sentry.captureException(error);
  });
}
// In index.ts — BEFORE `export const app = new Hono()`:
initSentry();
```

### Hono middleware factory pattern (mirror for requireVerifiedEmailWithGrace)
```typescript
// vigil-core/src/middleware/require-verified-email.ts
// Source: existing in-tree bearerAuth pattern at vigil-core/src/middleware/auth.ts:38-153
import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema.js";
const GRACE_WINDOW_MS = 24 * 60 * 60 * 1000;
function isBypass(path: string): boolean {
  if (path === "/v1/health") return true;
  if (path.startsWith("/v1/auth/")) return true;
  return false;
}
export const requireVerifiedEmailWithGrace: MiddlewareHandler = async (c, next) => {
  if (isBypass(c.req.path)) return next();
  const userId = c.get("userId");
  if (!db) return c.json({ error: "Database unavailable" }, 503);
  const [user] = await db
    .select({ emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: "Invalid token subject", code: "INVALID_CREDENTIALS" }, 401);
  if (user.emailVerifiedAt !== null) return next();
  const verifiedAfter = user.createdAt.getTime() + GRACE_WINDOW_MS;
  if (Date.now() < verifiedAfter) return next();
  return c.json({
    error: "Verify your email to continue",
    code: "EMAIL_NOT_VERIFIED",
    verified_after_iso: new Date(verifiedAfter).toISOString(),
  }, 403);
};
```

### State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| reCAPTCHA v2/v3 | Cloudflare Turnstile | Turnstile GA late 2022; no-PII, free, less invasive than reCAPTCHA | Faster init, no Google tracking; D-01 lock |
| Sentry v7 (Hub/Scope manual) | Sentry v8+ (functional API, `Sentry.withScope`, auto-init integrations) | Sentry v8 released mid-2024 | Simpler init; `Sentry.configureScope` deprecated. Use `withScope` in v10. |
| Captcha verify via library wrapper | Native `fetch` to siteverify endpoint | n/a — Cloudflare's HTTP API is the contract; no canonical lib | Less dep weight, direct control over timeout/retry semantics |
| Per-route in-memory rate-limit only | Dual-axis (IP + email) sliding window | Phase 117 (in-tree precedent) | Catches both IP-rotating and email-rotating bots |
| Generic 4xx error string on PWA | Structured `{error, code}` with PWA-side error-code map | Phase 126 (this) | Surfaces real error signal to operator (via Sentry/PostHog) AND family member (via UX); preserves backward compat |

### Sources

#### Primary (HIGH confidence)
- `vigil-core/src/routes/auth.ts:74-128, 21-22, 32-39` — current /auth/register body + DI seam pattern
- `vigil-core/src/routes/forgot-password.ts:42-104, 119-235` — canonical dual-counter rate-limit + DI factory pattern (Phase 117 AUTH-13)
- `vigil-core/src/routes/forgot-password.test.ts:421-444` — canonical `RATE_LIMIT_MAX_*` drift-detector test pattern
- `vigil-core/src/routes/resend-verification.ts:31-79` — single-axis per-user rate-limit pattern
- `vigil-core/src/middleware/auth.ts:38-153` — canonical Hono middleware shape + bearerAuth dispatcher
- `vigil-core/src/index.ts:84, 123-126, 132, 159-168, 181, 252-260` — mount-order anchors + secureHeaders + onError handler
- `vigil-core/src/db/schema.ts:27-58` — users table schema with `createdAt`, `emailVerifiedAt`, `passwordChangedAt` columns
- `vigil-core/src/analytics/posthog.ts:32-41, 69-80, 181-192` — coexistence pattern + denylist
- `vigil-pwa/package.json` — React 19.2.5, vite 8.0.8, react-router 7.14.0, vitest 2.1.9 dependency manifest
- `vigil-pwa/vercel.json` — SPA rewrite for legal pages
- `vigil-pwa/src/pages/AuthPage.tsx:9, 53, 76-77, 86-87` — bug site for AUTH-126-05
- `vigil-pwa/src/App.tsx` — react-router route mount pattern
- `vigil-pwa/src/api/client.ts:3` — `import.meta.env.VITE_*` pattern
- `.planning/phases/126.../126-CONTEXT.md` — all 4 D-* decisions locked
- `.planning/ROADMAP.md:674-681` — AUTH-126-01..08 requirement text
- `.planning/STATE.md` — Phase 117 drift convention + npm test hang workaround
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ — Turnstile siteverify contract `[VERIFIED 2026-05-11 via WebFetch]`
- npm view 2026-05-11: `@marsidev/react-turnstile@1.5.2`, `@sentry/node@10.52.0`, `@sentry/react@10.52.0`, `@sentry/browser@10.52.0`, `@sentry/vite-plugin@5.2.1` — all `[VERIFIED]`

#### Secondary (MEDIUM confidence)
- https://docs.sentry.io/platforms/javascript/guides/node/ — Sentry v10 Node init pattern
- https://docs.sentry.io/platforms/javascript/guides/react/ — Sentry v10 React init pattern
- https://github.com/marsidev/react-turnstile — React-Turnstile wrapper API (verified peer deps via npm view; full API not re-verified)
- https://sentry.io/pricing/ — 5k events/mo Developer tier free quota (CONTEXT.md "additional_context" confirms)

#### Tertiary (LOW confidence)
- None — all decisions backed by either in-tree precedent or directly-verified upstream docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all 3 new packages version-verified against npm registry 2026-05-11; React 19 peer-dep compat confirmed for both Turnstile and Sentry
- Architecture: HIGH — in-tree precedents (Phase 112/113/117) supply rate-limit, middleware, mount-order, error-shape patterns verbatim; planner mirrors rather than invents
- Pitfalls: HIGH — bug sites identified at exact line numbers; mount-order risk explicit; Sentry init-order risk has a drift detector to enforce
- Validation: HIGH — sampling commands tested-pattern (per-file `npx tsx --test` avoids known npm test hang)

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30 days — Turnstile and Sentry are stable APIs; package minor versions may bump but contracts hold)
