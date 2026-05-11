---
phase: 126
slug: wide-release-auth-hardening
status: ready-for-execution
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
updated: 2026-05-11
---

# Phase 126 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> `nyquist_compliant` and `wave_0_complete` flip to `true` after Plan 01 lands
> and Wave 0 stub tests transition from RED (intentional) to GREEN as their
> Wave 1+ production code lands. `status: approved` flips after Plan 01
> execution confirms the contract holds.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest@^2.1.9` (vigil-pwa) + `node:test` via `tsx@4.20.x` (vigil-core) |
| **Config file** | `vigil-pwa/vite.config.ts` (vitest block); vigil-core has NO central test config — each `*.test.ts` runs standalone via `npx tsx --test` (mirror Phase 117 convention from `forgot-password.test.ts`) |
| **Quick run command (vigil-core)** | `cd vigil-core && npx tsx --test src/<path-to>.test.ts` |
| **Quick run command (vigil-pwa)** | `cd vigil-pwa && npx vitest run <path-to>.test.tsx` |
| **Full suite (vigil-core)** | `cd vigil-core && find src -name "*.test.ts" -print0 \| xargs -0 -n1 npx tsx --test` |
| **Full suite (vigil-pwa)** | `cd vigil-pwa && npx vitest run` |
| **Estimated runtime (vigil-core full)** | ~45s |
| **Estimated runtime (vigil-pwa full)** | ~30s |
| **Estimated runtime (combined)** | ~75s |

---

## Sampling Rate

- **After every task commit:** Run the task-scoped `<verify>.automated` command from the per-task map below.
- **After every plan wave:** Run BOTH full-suite commands above (~75s combined). Required after Wave 1, Wave 2, Wave 3, Wave 4.
- **Before `/gsd-verify-work`:** Full suite must be green across both packages.
- **Max feedback latency:** ~75s (combined full suite). Task-scoped commands typically <10s.

---

## Per-Task Verification Map

> Commands extracted verbatim from each plan's `<verify>.automated` block. This is the executor's sampling contract — any drift between plan and this table is an integrity violation.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 126-01-01 | 01 | 1 | AUTH-126-01..06 | T-126-01-01..03 | Wave 0 stubs commit RED; documents production contract | unit (stub) | `cd vigil-core && npx tsx --test src/lib/turnstile.test.ts src/lib/sentry.test.ts src/middleware/require-verified-email.test.ts src/__tests__/mount-order.test.ts 2>&1 \| grep -E '(fail\|pass)' \| head -20; test -f src/lib/turnstile.test.ts && test -f src/lib/sentry.test.ts && test -f src/middleware/require-verified-email.test.ts && test -f src/__tests__/mount-order.test.ts` | ❌ W0 (creates) | ⬜ pending |
| 126-01-02 | 01 | 1 | AUTH-126-05, AUTH-126-06 | T-126-01-01..03 | Wave 0 PWA stubs commit RED | unit (stub) | `cd vigil-pwa && npx vitest run src/lib/api-error-codes.test.ts src/pages/PrivacyPolicyPage.test.tsx src/pages/TermsOfServicePage.test.tsx 2>&1 \| tail -30; test -f src/lib/api-error-codes.test.ts && test -f src/pages/PrivacyPolicyPage.test.tsx && test -f src/pages/TermsOfServicePage.test.tsx ; ! grep -q "react-router-dom" src/pages/PrivacyPolicyPage.test.tsx src/pages/TermsOfServicePage.test.tsx && echo "router_import_ok"` | ❌ W0 (creates) | ⬜ pending |
| 126-02-01 | 02 | 2 | AUTH-126-02 | T-126-02-01..06 | Turnstile helper fail-closed on network error; DI seam intact | unit | `cd vigil-core && npx tsx --test src/lib/turnstile.test.ts 2>&1 \| tail -20; grep -c "https://challenges.cloudflare.com/turnstile/v0/siteverify" src/lib/turnstile.ts; grep -c "__setVerifyTurnstileTokenForTest" src/lib/turnstile.ts; grep -c "__resetVerifyTurnstileTokenForTest" src/lib/turnstile.ts; grep -c "__setRegisterTurnstileFnForTest" src/lib/turnstile.ts` | ✅ (Wave 0) | ⬜ pending |
| 126-03-01 | 03 | 2 | AUTH-126-04 | — | @sentry/node@^10 installed as production dep | config | `cd vigil-core && grep -E '"@sentry/node":\s*"\^?10\.' package.json \| wc -l \| tr -d '\n' \| grep -q '^1$' && echo OK` | n/a | ⬜ pending |
| 126-03-02 | 03 | 2 | AUTH-126-04 | T-126-03-01..05 | Sentry server-side wrapper no-ops without DSN; v10 API; denylist clean | unit | `cd vigil-core && npx tsx --test src/lib/sentry.test.ts 2>&1 \| tail -20; grep -c "initSentry" src/lib/sentry.ts; grep -c "captureToSentry" src/lib/sentry.ts; grep -c "Sentry.withScope" src/lib/sentry.ts; ! grep -nE '^\s*(content\|body\|text\|message\|description\|title\|note\|transcript)\s*:' src/lib/sentry.ts && echo "denylist_clean"` | ✅ (Wave 0) | ⬜ pending |
| 126-04-01 | 04 | 2 | AUTH-126-03 | T-126-04-01..07 | Email-verify middleware honors 24h grace; bypass list intact; uses createdAt (R5); INVALID_TOKEN_SUBJECT extension (D-04) | unit | `cd vigil-core && npx tsx --test src/middleware/require-verified-email.test.ts 2>&1 \| tail -30 ; grep -c 'GRACE_WINDOW_MS' src/middleware/require-verified-email.ts ; grep -c '"/v1/health"' src/middleware/require-verified-email.ts ; grep -c '"/v1/auth/"' src/middleware/require-verified-email.ts ; ! grep -q 'passwordChangedAt' src/middleware/require-verified-email.ts && echo "r5_ok" ; grep -c '"INVALID_TOKEN_SUBJECT"' src/middleware/require-verified-email.ts ; ! grep -q '"INVALID_CREDENTIALS"' src/middleware/require-verified-email.ts && echo "d04_ok"` | ✅ (Wave 0) | ⬜ pending |
| 126-05-01 | 05 | 3 | AUTH-126-01, 02, 05, 08 | T-126-05-01..11 | auth.ts dual-counter + Turnstile + sentinel + code-on-every-error; distinct-seam invariant; pre-existing suite still green; tsc clean | integration | `cd vigil-core && grep -c "RATE_LIMIT_MAX_IP = 20" src/routes/auth.ts ; grep -c "RATE_LIMIT_MAX_EMAIL = 5" src/routes/auth.ts ; grep -cE "(registerTurnstileFn\|verifyTurnstileToken)\(" src/routes/auth.ts ; grep -c '__setRegisterTurnstileFnForTest' src/routes/auth.ts ; grep -c '__resetRegisterTurnstileFnForTest' src/routes/auth.ts ; ! grep -q '__setVerifyTurnstileTokenForTest' src/routes/auth.ts && echo "seam_distinct_ok" ; grep -c 'allowed.includes("\*")' src/routes/auth.ts ; grep -c 'code: "REG_NOT_ALLOWED"' src/routes/auth.ts ; grep -c 'code: "CAPTCHA_FAILED"' src/routes/auth.ts ; grep -c 'code: "RATE_LIMITED"' src/routes/auth.ts ; grep -c 'code: "EMAIL_TAKEN"' src/routes/auth.ts ; grep -c 'code: "INVALID_CREDENTIALS"' src/routes/auth.ts ; grep -c 'code: "INVALID_EMAIL_FORMAT"' src/routes/auth.ts ; grep -c 'code: "PASSWORD_TOO_SHORT"' src/routes/auth.ts ; grep -c 'code: "PASSWORD_TOO_LONG"' src/routes/auth.ts ; cd vigil-core && npx tsx --test src/routes/auth.test.ts 2>&1 \| tail -30 ; cd vigil-core && npx tsc --noEmit -p tsconfig.json 2>&1 \| tail -10` | ✅ (existing) | ⬜ pending |
| 126-05-02 | 05 | 3 | AUTH-126-01, 02, 05, 08 | T-126-05-09..11 | Drift detectors + behavior tests for new gates; coverage matrix; SEAM-NAMING gate | integration | `cd vigil-core && npx tsx --test src/routes/auth.test.ts 2>&1 \| tail -30 ; grep -c "AUTH-126-CAP-IP-20" src/routes/auth.test.ts ; grep -c "AUTH-126-CAP-EMAIL-5" src/routes/auth.test.ts ; grep -c "AUTH-126-TURNSTILE-CALLSITE" src/routes/auth.test.ts ; grep -c "AUTH-126-ALLOWLIST-WILDCARD" src/routes/auth.test.ts ; grep -c "AUTH-126-ERROR-CODE-COVERAGE" src/routes/auth.test.ts ; grep -c "AUTH-126-SEAM-NAMING" src/routes/auth.test.ts ; grep -c "__resetRegisterBucketsForTest" src/routes/auth.test.ts ; grep -c "__setRegisterTurnstileFnForTest" src/routes/auth.test.ts ; ! grep -q "__setVerifyTurnstileTokenForTest" src/routes/auth.test.ts && echo "no_cross_layer_seam"` | ✅ (existing) | ⬜ pending |
| 126-06-01 | 06 | 3 | AUTH-126-03, AUTH-126-04 | T-126-06-01..06 | index.ts wires initSentry < new Hono(); middleware > bearerAuth; PostHog preserved | integration | `cd vigil-core && npx tsx --test src/__tests__/mount-order.test.ts 2>&1 \| tail -20 ; grep -c "initSentry()" src/index.ts ; grep -c "captureToSentry(" src/index.ts ; grep -c "requireVerifiedEmailWithGrace" src/index.ts ; node -e 'const fs=require("fs"); const s=fs.readFileSync("src/index.ts","utf8"); const init=s.indexOf("initSentry()"); const hono=s.indexOf("new Hono()"); const verify=s.indexOf("requireVerifiedEmailWithGrace"); const bearer=s.indexOf("return bearerAuth(c, next)"); console.log("init<hono:", init>=0 && hono>=0 && init<hono); console.log("verify>bearer:", verify>=0 && bearer>=0 && verify>bearer);'` | ✅ (Wave 0 mount-order) | ⬜ pending |
| 126-07-01 | 07 | 2 | AUTH-126-02, 04, 05 | — | @marsidev/react-turnstile + @sentry/react installed as production deps | config | `cd vigil-pwa && grep -E '"@marsidev/react-turnstile":' package.json \| wc -l \| tr -d '\n' ; echo ; grep -E '"@sentry/react":' package.json \| wc -l \| tr -d '\n' ; echo ; test -d node_modules/@marsidev/react-turnstile && echo TURNSTILE_OK ; test -d node_modules/@sentry/react && echo SENTRY_OK` | n/a | ⬜ pending |
| 126-07-02 | 07 | 2 | AUTH-126-05 | T-126-07-01..06 | api-error-codes.ts maps 9 LOCKED + 4 extensions (incl. INVALID_TOKEN_SUBJECT for Plan 04 cross-ref) | unit | `cd vigil-pwa && npx vitest run src/lib/api-error-codes.test.ts 2>&1 \| tail -25 ; grep -c "CAPTCHA_FAILED" src/lib/api-error-codes.ts ; grep -c "RATE_LIMITED" src/lib/api-error-codes.ts ; grep -c "REG_NOT_ALLOWED" src/lib/api-error-codes.ts ; grep -c "INVALID_EMAIL_FORMAT" src/lib/api-error-codes.ts ; grep -c "PASSWORD_TOO_SHORT" src/lib/api-error-codes.ts ; grep -c "PASSWORD_TOO_LONG" src/lib/api-error-codes.ts ; grep -c "EMAIL_TAKEN" src/lib/api-error-codes.ts ; grep -c "EMAIL_NOT_VERIFIED" src/lib/api-error-codes.ts ; grep -c "INVALID_CREDENTIALS" src/lib/api-error-codes.ts ; grep -c "INVALID_TOKEN_SUBJECT" src/lib/api-error-codes.ts ; grep -c "INVALID_REQUEST" src/lib/api-error-codes.ts ; grep -c "INVALID_JSON" src/lib/api-error-codes.ts ; grep -c "SERVER_NOT_CONFIGURED" src/lib/api-error-codes.ts` | ✅ (Wave 0) | ⬜ pending |
| 126-08-01 | 08 | 2 | AUTH-126-06 | T-126-08-01..06 | Two legal pages render with required substrings + heading | unit | `cd vigil-pwa && npx vitest run src/pages/PrivacyPolicyPage.test.tsx src/pages/TermsOfServicePage.test.tsx 2>&1 \| tail -25 ; test -f src/pages/PrivacyPolicyPage.tsx && test -f src/pages/TermsOfServicePage.tsx && echo BOTH_OK ; wc -l src/pages/PrivacyPolicyPage.tsx src/pages/TermsOfServicePage.tsx` | ✅ (Wave 0) | ⬜ pending |
| 126-08-02 | 08 | 2 | AUTH-126-06 | T-126-08-05 | App.tsx mounts legal routes outside auth guard | integration | `cd vigil-pwa && grep -c "PrivacyPolicyPage" src/App.tsx ; grep -c "TermsOfServicePage" src/App.tsx ; grep -c '"/legal/privacy"' src/App.tsx ; grep -c '"/legal/terms"' src/App.tsx ; npx vitest run src/pages/PrivacyPolicyPage.test.tsx src/pages/TermsOfServicePage.test.tsx 2>&1 \| tail -5` | ✅ (Wave 0) | ⬜ pending |
| 126-09-01 | 09 | 3 | AUTH-126-04 | T-126-09-01..06 | main.tsx Sentry.init BEFORE createRoot; DSN-gated; Vite build clean | integration | `cd vigil-pwa && grep -c "@sentry/react" src/main.tsx ; grep -c "Sentry.init" src/main.tsx ; grep -c "VITE_SENTRY_DSN" src/main.tsx ; grep -c "tracesSampleRate" src/main.tsx ; node -e 'const fs=require("fs"); const s=fs.readFileSync("src/main.tsx","utf8"); const init=s.indexOf("Sentry.init"); const root=s.indexOf("createRoot"); console.log("init<createRoot:", init>=0 && root>=0 && init<root);'` | n/a (build check) | ⬜ pending |
| 126-09-02 | 09 | 3 | AUTH-126-04 | T-126-09-03 | ErrorBoundary fires Sentry + PostHog (sibling sinks) | integration | `cd vigil-pwa && grep -c "@sentry/react" src/components/ErrorBoundary.tsx ; grep -c "Sentry.captureException" src/components/ErrorBoundary.tsx ; grep -c "captureException(error" src/components/ErrorBoundary.tsx ; grep -c "boundary: 'root'" src/components/ErrorBoundary.tsx` | n/a (build check) | ⬜ pending |
| 126-10-01 | 10 | 4 | AUTH-126-02 | T-126-10-01..06 | TurnstileWidget.tsx wraps @marsidev/react-turnstile with dev-safe fallback | unit | `cd vigil-pwa && test -f src/components/TurnstileWidget.tsx && grep -c "@marsidev/react-turnstile" src/components/TurnstileWidget.tsx ; grep -c "VITE_TURNSTILE_SITE_KEY" src/components/TurnstileWidget.tsx ; grep -c "onToken" src/components/TurnstileWidget.tsx ; npx vite build 2>&1 \| tail -5` | n/a (build check) | ⬜ pending |
| 126-10-02 | 10 | 4 | AUTH-126-02, 05, 06 | T-126-10-01..09 | AuthPage Turnstile + 3-site resolveApiError + legal footer; R2 catch-block preserved; uses 'react-router' (NOT 'react-router-dom') | integration | `cd vigil-pwa && grep -c "resolveApiError" src/pages/AuthPage.tsx ; grep -c "TurnstileWidget" src/pages/AuthPage.tsx ; grep -c "turnstileToken" src/pages/AuthPage.tsx ; grep -c '/legal/privacy' src/pages/AuthPage.tsx ; grep -c '/legal/terms' src/pages/AuthPage.tsx ; grep -c "GENERIC_ERROR" src/pages/AuthPage.tsx ; ! grep -q "react-router-dom" src/pages/AuthPage.tsx && echo "router_import_ok" ; grep -c "from 'react-router'" src/pages/AuthPage.tsx ; npx vite build 2>&1 \| tail -5` | n/a (build check) | ⬜ pending |
| 126-11-01 | 11 | 5 | AUTH-126-07 | T-126-11-01..05 | Operator todo file content verified at /pending/ | structural | `test -f .planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md && echo TODO_EXISTS ; grep -c "AUTH-126-07" .planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md ; grep -c "Anthropic" .planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md ; grep -ci "spend.*cap\|cap.*spend\|spend limit" .planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md` | ✅ (planted in /gsd-discuss-phase) | ⬜ pending |
| 126-11-02 | 11 | 5 | AUTH-126-07 | T-126-11-01,04 | **MANUAL — checkpoint:human-action** — Anthropic Console spend cap set; todo moved /pending → /done | structural (manual gate) | `! test -f .planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md && test -f .planning/todos/done/2026-05-11-phase-126-anthropic-spend-cap.md && echo OPERATOR_DONE` | n/a (operator action) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Plan 01 creates seven RED-by-design test stubs. Each stub imports the production module that does not yet exist; the failing-module-resolution error IS the documentation for Wave 1+ executors.

- [ ] `vigil-core/src/lib/turnstile.test.ts` — siteverify URL drift detector + 4 behavior cases (AUTH-126-02)
- [ ] `vigil-core/src/lib/sentry.test.ts` — DSN-unset no-op + captureToSentry shape + denylist propname drift (AUTH-126-04)
- [ ] `vigil-core/src/middleware/require-verified-email.test.ts` — grace-window matrix + bypass list + INVALID_TOKEN_SUBJECT drift (AUTH-126-03)
- [ ] `vigil-core/src/__tests__/mount-order.test.ts` — three source-position drift detectors against index.ts (AUTH-126-03/04 mount-order)
- [ ] `vigil-pwa/src/lib/api-error-codes.test.ts` — vitest unit: resolver branches + LOCKED-ENUM (AUTH-126-05)
- [ ] `vigil-pwa/src/pages/PrivacyPolicyPage.test.tsx` — vitest + MemoryRouter from `'react-router'`; substring + heading (AUTH-126-06)
- [ ] `vigil-pwa/src/pages/TermsOfServicePage.test.tsx` — same shape as Privacy (AUTH-126-06)

All stubs use **react-router v7 single-package namespace** for MemoryRouter imports (NOT `react-router-dom` — that package is not installed in vigil-pwa). Verified `vigil-pwa/package.json:17`.

`wave_0_complete: true` flips when all 7 stub files exist on disk AND fail RED with module-not-found errors against their not-yet-existing production modules.

---

## Manual-Only Verifications

Two behaviors in Phase 126 cannot be automated; they require operator-or-human-eyeball verification.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Anthropic Console monthly spend cap set | AUTH-126-07 | No CLI/API surface for Anthropic Console spend limits as of 2026-05-11 (verified during discuss-phase). Must be set via web console. | (1) Open https://console.anthropic.com → Settings → Plans & Billing → Usage Limits. (2) Set monthly cap (recommended 3× baseline OR $100/mo starter). (3) Verify alert email destination is `jamesonmorrill1@gmail.com`. (4) Record cap value + date in `.planning/todos/pending/2026-05-11-phase-126-anthropic-spend-cap.md`. (5) `mv` file to `.planning/todos/done/`. Gate: Plan 11 Task 2 `<verify>.automated` asserts the move. |
| Sentry events visible in dashboard within 60s of error | AUTH-126-04 | Automated tests assert the `captureToSentry` / `Sentry.captureException` call shape, but actually appearing in the Sentry web UI requires DSN + project + network round-trip the test environment doesn't have. | Post-Wave 4 deploy: (1) Open Sentry web UI for the configured project. (2) Trigger a known error in vigil-core (e.g., POST a malformed JWT to a protected route). (3) Verify within 60s the event appears tagged with `route` + `method` (server-side) or `boundary: 'root'` (PWA). (4) Eyeball the breadcrumbs — confirm no `Authorization: Bearer ...` header captured (`sendDefaultPii: false` working as expected). |

All other Phase 126 behaviors are automated via the Per-Task Verification Map above.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (every row above has a command — no `MISSING`)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (verified — every task above runs a command; the only manual gate is 126-11-02 which is the closing operator wallclock and explicitly NOT skip_checkpoints-bypassable per memory `feedback_wallclock_checkpoint_exempt.md`)
- [ ] Wave 0 covers all MISSING references (Plan 01 creates the 7 stubs)
- [ ] No watch-mode flags (`vitest run` and `tsx --test` are one-shot)
- [ ] Feedback latency < 75s combined; <10s per task command
- [ ] `nyquist_compliant: true` set in frontmatter — **DEFERRED**: flips after Plan 01 stubs land (the stubs are intentionally RED, which is the documented Nyquist-compliant Wave 0 state per `references/tdd.md`; once all Wave 1+ production code lands and stubs turn GREEN, this flips with `wave_0_complete: true`)

**Approval:** pending — to be approved after Plan 01 execution confirms Wave 0 stubs commit RED with module-not-found errors as designed.

---

## Notes

### D-04 enum coverage check (post-revision)
- 9 LOCKED codes from CONTEXT.md D-04 covered server-side (Plan 05 auth.ts) and client-side (Plan 07 api-error-codes.ts).
- 4 extension codes added per planner authority in D-04 ("may add, cannot remove"):
  - `INVALID_REQUEST` (Plan 05, Plan 07)
  - `INVALID_JSON` (Plan 05, Plan 07)
  - `SERVER_NOT_CONFIGURED` (Plan 05, Plan 07; also used by Plan 04 503 short-circuit)
  - `INVALID_TOKEN_SUBJECT` (Plan 04 middleware emits; Plan 07 maps to "Session expired" UX) — distinct from locked `INVALID_CREDENTIALS` (login-only-generic-401) per checker review.

### Two-seam coordination check (post-revision)
- `vigil-core/src/lib/turnstile.ts` (Plan 02) exports `__setVerifyTurnstileTokenForTest` / `__resetVerifyTurnstileTokenForTest` — **helper-unit tests only** (turnstile.test.ts).
- `vigil-core/src/routes/auth.ts` (Plan 05) exports `__setRegisterTurnstileFnForTest` / `__resetRegisterTurnstileFnForTest` — **route-level integration tests** (auth.test.ts).
- Drift detector `AUTH-126-SEAM-NAMING` (Plan 05) asserts auth.ts has the route-level seam AND does NOT have the helper-unit seam name. Future double-stubbing footgun closed.

### Router package check (post-revision)
- vigil-pwa uses `react-router@^7.14.0` (single-package namespace per package.json line 17). NO `react-router-dom` dependency.
- All Phase 126 imports of `MemoryRouter`, `Link`, `useNavigate` come from `'react-router'`.
- AuthPage.tsx:2 reuses the existing `import { useNavigate, Link } from 'react-router'`; Plan 10 does NOT add a new Link import.
- Verify commands across Plan 01 Task 2, Plan 10 Task 2, and combined success criteria assert `grep "react-router-dom"` returns zero matches.

### Open-Q-2 SSE bypass resolution
- `/v1/agent-stream` (Phase 124 SSE) is INTENTIONALLY NOT bypassed by `requireVerifiedEmailWithGrace`. Per RESEARCH Open-Q-2: vigil-watch is operator-only, the operator's account is verified, and surfacing EMAIL_NOT_VERIFIED 403 (within grace) to the daemon mirrors the PWA UX. Plan 04 JSDoc documents this as a deliberate choice.

### Open-Q-1 enum extension formalization
- The three RESEARCH-suggested extensions (`INVALID_REQUEST`, `INVALID_JSON`, `SERVER_NOT_CONFIGURED`) are formally locked in Plans 05 (server) and 07 (PWA map). `INVALID_TOKEN_SUBJECT` added per checker review. Total: 9 LOCKED + 4 extensions = 13 codes mapped end-to-end.

### Open-Q-3 login captcha
- Login captcha is OUT OF SCOPE for Phase 126 per CONTEXT D-01 verbatim ("widget on signup form"). Plan 10 explicitly gates Turnstile render behind `!isLogin`. Login captcha rides with the deferred "Brute-force protection on /auth/login" phase per CONTEXT Deferred Ideas.

### Wallclock-checkpoint exemption (AUTH-126-07)
- Per memory `feedback_wallclock_checkpoint_exempt.md`: yolo mode / `skip_checkpoints` does NOT auto-skip Plan 11 Task 2. Operator must perform the Anthropic Console action and physically `mv` the todo file. The structural gate (`find .planning/todos/pending -name 'phase-126*' | wc -l` must be 0) is enforced by `/gsd-verify-work`.
