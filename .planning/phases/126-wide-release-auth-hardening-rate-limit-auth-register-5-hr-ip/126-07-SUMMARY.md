---
phase: 126
plan: 07
subsystem: vigil-pwa/lib
tags: [auth, pwa, error-codes, error-ux, react, vite, turnstile, sentry, AUTH-126-05, AUTH-126-02, AUTH-126-04, D-04, INVALID_TOKEN_SUBJECT]

# Dependency graph
requires:
  - phase: 126
    plan: 01
    provides: "Wave 0 RED test src/lib/api-error-codes.test.ts pinning the public surface (resolveApiError, ERROR_CODE_MAP) + LOCKED 9-key enum contract"
  - phase: 126
    plan: 04
    provides: "INVALID_TOKEN_SUBJECT server emission (require-verified-email middleware defensive !user branch) — this plan maps it to the user-facing 'Session expired' UX"
provides:
  - "vigil-pwa/src/lib/api-error-codes.ts module — ApiErrorUx interface, ERROR_CODE_MAP lookup table (9 LOCKED + 4 extension codes), resolveApiError(body, fallback) resolver"
  - "@marsidev/react-turnstile@^1.5.2 in PWA dependencies — Plan 10 consumes via <Turnstile/> widget on signup form"
  - "@sentry/react@^10.52.0 in PWA dependencies — Plan 09 consumes via Sentry.init(...) in src/main.tsx"
  - "INVALID_TOKEN_SUBJECT → 'Session expired — please sign in again.' UX with /auth CTA (closes D-04 enum confusion threat T-126-07-06 + T-126-04-07)"
affects:
  - "Plan 09 (vigil-pwa Sentry init) — imports @sentry/react"
  - "Plan 10 (vigil-pwa AuthPage Turnstile widget + resolveApiError adoption) — imports both @marsidev/react-turnstile AND resolveApiError"
  - "Future PWA pages handling structured 4xx — call resolveApiError(body, GENERIC_ERROR) instead of collapsing every 4xx into a generic string"

# Tech tracking
tech-stack:
  added:
    - "@marsidev/react-turnstile@^1.5.2 — Cloudflare Turnstile React widget (Plan 10)"
    - "@sentry/react@^10.52.0 — Sentry browser SDK (Plan 09)"
  patterns:
    - "Locked-enum lookup table with planner-additive (not subtractive) semantics — Wave 0 test enforces at CI; future planners may ADD keys but never REMOVE the 9 locked ones (D-04 lock)"
    - "Forward-compat resolver — unknown server code falls back to raw body.error string so new server codes work in PWA without a deploy (mirror of vigil-pwa/src/api/client.ts classifyFetchError 5-bucket shape)"
    - "Co-locate npm dep installs for downstream-only consumers in one infra plan to avoid package.json contention between sibling parallel plans (Plan 09 + Plan 10)"
    - "Object.prototype.hasOwnProperty.call lookup-guard instead of `in` operator — defends against pathological code names like 'toString' / 'constructor' / '__proto__' that would otherwise match Object.prototype keys"

key-files:
  created:
    - "vigil-pwa/src/lib/api-error-codes.ts (164 lines) — locked-enum + extension lookup table + resolver"
  modified:
    - "vigil-pwa/package.json — added @marsidev/react-turnstile@^1.5.2 + @sentry/react@^10.52.0 to dependencies"
    - "vigil-pwa/package-lock.json — 8 new packages resolved + lockfile reconciled"

key-decisions:
  - "Object.prototype.hasOwnProperty.call(ERROR_CODE_MAP, body.code) lookup-guard hardens against malicious/pathological code values (e.g. 'toString', 'constructor') that the PATTERNS-skeleton's bare `ERROR_CODE_MAP[body.code]` would otherwise resolve via Object.prototype — Rule 2 (auto-add missing critical functionality, security). Wave 0 test still GREEN; T-126-07-03 spoofing surface narrowed by construction"
  - "Single `npm install pkg1 pkg2 --save` call so the lockfile reconciles once — RESEARCH §Library Decisions verified React 19 peer-dep compat for both packages, no --legacy-peer-deps needed (and `.npmrc` already sets it as a safety net); 0 peer warnings observed in install output"
  - "INVALID_TOKEN_SUBJECT extension entry includes ctaLabel='Sign in' + ctaHref='/auth' per Plan 04 cross-reference (T-126-04-07 + T-126-07-06 mitigation: distinct from INVALID_CREDENTIALS which is reserved login-only per D-04)"
  - "Module-header JSDoc documents the LOCKED enum lock + the additivity rule + the 4 extension codes + the 3-step resolution order — future planners reading this file see the lock contract before touching the table"

patterns-established:
  - "Locked-enum lookup table with CI-enforced additivity (D-04 lock) — applies to any future code-→-UX maps where the server-emitted enum must stay stable for cross-deploy compat"
  - "Forward-compat resolver — unknown codes fall back to raw error string, so adding a new server code is a one-deploy operation (server-side only); PWA can adopt the mapped UX in a follow-up deploy without breaking users in the gap"

requirements-completed:
  - AUTH-126-02
  - AUTH-126-04
  - AUTH-126-05

# Metrics
duration: 2m 23s
completed: 2026-05-11
---

# Phase 126 Plan 07: PWA error-code map + downstream deps Summary

**D-04 locked-enum error-UX lookup table (`ERROR_CODE_MAP` + `resolveApiError`) shipped at `vigil-pwa/src/lib/api-error-codes.ts` with all 9 LOCKED keys + 4 extension codes (including `INVALID_TOKEN_SUBJECT` cross-referenced from Plan 04), plus both downstream PWA dependencies (`@marsidev/react-turnstile@^1.5.2` for Plan 10, `@sentry/react@^10.52.0` for Plan 09) installed in one reconciliation pass.**

## Performance

- **Duration:** 2m 23s
- **Started:** 2026-05-11T18:00:12Z
- **Completed:** 2026-05-11T18:02:35Z
- **Tasks:** 2/2 (both autonomous)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `vigil-pwa/src/lib/api-error-codes.ts` (164 lines) — single new PWA module exporting `ApiErrorUx`, `ERROR_CODE_MAP`, and `resolveApiError(body, fallback)`. All 9 D-04 LOCKED codes present (CAPTCHA_FAILED, RATE_LIMITED, REG_NOT_ALLOWED, INVALID_EMAIL_FORMAT, PASSWORD_TOO_SHORT, PASSWORD_TOO_LONG, EMAIL_TAKEN, EMAIL_NOT_VERIFIED, INVALID_CREDENTIALS) plus 4 Phase 126 extension codes (INVALID_REQUEST, INVALID_JSON, SERVER_NOT_CONFIGURED, INVALID_TOKEN_SUBJECT).
- INVALID_TOKEN_SUBJECT mapped to "Session expired — please sign in again." with `ctaLabel: "Sign in"` + `ctaHref: "/auth"` — cross-reference to Plan 04's middleware defensive `!user` branch; structurally prevents the D-04 enum-confusion threat (T-126-07-06 / T-126-04-07) of surfacing "Invalid email or password" to a structurally-broken-session user.
- Both downstream-only PWA dependencies installed in a single `npm install --save` call (lockfile reconciled once, no contention with parallel Plans 09 + 10): `@marsidev/react-turnstile@^1.5.2` (Plan 10 signup-form widget) + `@sentry/react@^10.52.0` (Plan 09 client-side Sentry init). Both placed in `dependencies` (production bundle), not devDependencies. `@sentry/vite-plugin` deliberately NOT installed (source-map upload is Phase 127+ per RESEARCH §Library Decisions §2).
- Wave 0 test `src/lib/api-error-codes.test.ts` transitioned RED → GREEN: 6/6 passes (CAPTCHA / RATE-LIMITED / REG-NOT-ALLOWED-with-CTA / unknown-code-falls-back / null-body-falls-back / LOCKED-ENUM 9-key drift detector).

## Task Commits

Each task committed atomically:

1. **Task 1: Install @marsidev/react-turnstile + @sentry/react** — `940244b` (chore)
2. **Task 2: Ship api-error-codes.ts** — `0948d86` (feat)

**Plan metadata commit:** _(landed with this SUMMARY)_

## Files Created/Modified

- `vigil-pwa/src/lib/api-error-codes.ts` (created, 164 lines) — `ApiErrorUx` interface + `ERROR_CODE_MAP: Record<string, ApiErrorUx>` (9 LOCKED + 4 extension) + `resolveApiError(body, fallback): ApiErrorUx` resolver with 3-step lookup
- `vigil-pwa/package.json` (modified) — `dependencies` extended with `@marsidev/react-turnstile@^1.5.2` + `@sentry/react@^10.52.0`
- `vigil-pwa/package-lock.json` (modified) — 8 new packages resolved, lockfile reconciled

## Verification Evidence

| Check | Expected | Actual | Result |
|---|---|---|---|
| `npx vitest run src/lib/api-error-codes.test.ts` | 6/6 pass | 6/6 pass | OK |
| `grep -E '"@marsidev/react-turnstile":' vigil-pwa/package.json` | 1 match | 1 match (`^1.5.2`) | OK |
| `grep -E '"@sentry/react":' vigil-pwa/package.json` | 1 match | 1 match (`^10.52.0`) | OK |
| Both deps in `dependencies` (not devDependencies) | true | true | OK |
| `node_modules/@marsidev/react-turnstile` exists | true | true | OK |
| `node_modules/@sentry/react` exists | true | true | OK |
| Resolved Turnstile version | 1.5.2 | 1.5.2 | OK |
| Resolved Sentry React version | 10.52.0 | 10.52.0 | OK |
| 9 LOCKED keys present (each grep count == 1) | 9/9 | 9/9 | OK |
| 4 extension keys present (each grep count == 1) | 4/4 | 4/4 | OK |
| REG_NOT_ALLOWED has ctaLabel + ctaHref | true | `"Contact"` + `mailto:hello@vigilhub.io` | OK |
| EMAIL_TAKEN has ctaLabel + ctaHref | true | `"Sign in instead"` + `#login` | OK |
| EMAIL_NOT_VERIFIED has ctaLabel + ctaHref | true | `"Resend verification"` + `/settings` | OK |
| INVALID_TOKEN_SUBJECT has ctaLabel + ctaHref | true | `"Sign in"` + `/auth` | OK |
| Isolated tsc on api-error-codes.ts (strict, ES2022, bundler) | exit 0 | exit 0 | OK |

## Decisions Made

- **Object.prototype.hasOwnProperty.call lookup-guard** instead of the PATTERNS skeleton's bare `ERROR_CODE_MAP[body.code]` membership test. Rule 2 (security: defense in depth against pathological code values like `"toString"` / `"constructor"` / `"__proto__"` that would otherwise match `Object.prototype` keys and surface unintended UX). Wave 0 test still GREEN; semantically identical for all known codes; closes a latent forward-compat hardening gap. T-126-07-03 (spoofing) surface narrowed by construction.
- **INVALID_TOKEN_SUBJECT extension code maps with a sign-in CTA** (`ctaLabel: "Sign in"`, `ctaHref: "/auth"`) per Plan 04 cross-reference. The Plan 04 middleware (`requireVerifiedEmailWithGrace`) emits this code when a JWT validates but the user row is missing from the DB — the user's session is structurally broken and the right user action is to sign in fresh. Distinct from `INVALID_CREDENTIALS` which is reserved login-only per D-04 lock; conflating would surface "Invalid email or password" to a structurally-broken-session user (T-126-04-07 + T-126-07-06 mitigation).
- **Single `npm install pkg1 pkg2 --save`** rather than two sequential installs — the lockfile reconciles once, no risk of intermediate states. RESEARCH §Library Decisions verified React 19 peer-dep compat for both packages on 2026-05-11, so `--legacy-peer-deps` was not required; `.npmrc` already sets `legacy-peer-deps=true` globally as a safety net but install observed 0 peer warnings.
- **Module-header JSDoc documents the locked-enum contract verbatim** so future planners reading the file see the lock before touching the table — same convention as `vigil-core/src/middleware/require-verified-email.ts` JSDoc landed in Plan 04. No code-comment relies on a `/* @lock */` annotation since the Wave 0 test is the structural lock; comments are documentation only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical hardening] Hardened code lookup against Object.prototype pollution**

- **Found during:** Task 2 (implementation of `resolveApiError`)
- **Issue:** The PATTERNS skeleton at RESEARCH §AUTH-126-05 line 519 uses `if (body?.code && ERROR_CODE_MAP[body.code]) return ERROR_CODE_MAP[body.code];` — a bare bracket access. If a (compromised or buggy) server emits a `code: "toString"` or `code: "constructor"`, the bracket access resolves to an `Object.prototype` function reference, which then renders as a truthy object with no `.message` string at the call site, breaking the resolver's contract that it always returns a non-empty `message`.
- **Fix:** Use `Object.prototype.hasOwnProperty.call(ERROR_CODE_MAP, body.code)` as the membership test before bracket-accessing the entry. This restricts the lookup to OWN properties only (the explicit 13 codes), structurally preventing any prototype-chain spoofing. T-126-07-03 (spoofing) and T-126-07-01 (info disclosure via server-supplied raw error) both narrowed by construction.
- **Files modified:** `vigil-pwa/src/lib/api-error-codes.ts` (committed with Task 2)
- **Verification:** Wave 0 test 6/6 GREEN; isolated `tsc --strict` exits 0; existing test coverage already exercises the unknown-code-falls-back path (`AUTH-126-CODE-MAP-UNKNOWN-FALLS-BACK-RAW`) which now covers prototype-chain names by construction.
- **Committed in:** `0948d86` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — security hardening)
**Impact on plan:** Zero scope creep. Same public surface (ApiErrorUx, ERROR_CODE_MAP, resolveApiError) and same observable behavior; defense-in-depth narrowing of one threat-model spoofing surface. All Wave 0 tests still GREEN.

## Issues Encountered

- **`npx tsc --noEmit -p .` surfaces ~30 pre-existing TS6305 errors** on stale `.d.ts` files (e.g. `VerifyEmailPage.d.ts`, `WorkOrdersPage.d.ts`, etc.) from a prior compile artifact. NOT caused by this plan — verified by clean `git status` for any `.d.ts` files and clean isolated `tsc` exit 0 on `api-error-codes.ts` alone. Out of scope per executor scope-boundary; logged here for transparency but no fix attempted.

## Threat Surface Scan

No new threat surfaces introduced beyond those documented in the plan's `<threat_model>` (T-126-07-01 through T-126-07-06). The `INVALID_TOKEN_SUBJECT` mapping closes T-126-07-06 by construction. The `Object.prototype.hasOwnProperty.call` lookup-guard (Rule 2 deviation above) narrows T-126-07-03.

## User Setup Required

None - no external service configuration required. This plan ships a code module + two npm dependencies; both Turnstile (Plan 10) and Sentry (Plan 09) will require their respective DSN/site-key env-var setup in their own plans, not here.

## Next Phase Readiness

- **Plan 09 (Sentry init):** `@sentry/react@^10.52.0` is installed and resolvable; `import * as Sentry from '@sentry/react'` will type-check at landing time.
- **Plan 10 (PWA AuthPage Turnstile widget + resolveApiError adoption):** Both `@marsidev/react-turnstile@^1.5.2` and the `resolveApiError`/`ERROR_CODE_MAP` exports are ready to import. The locked enum + forward-compat fallback contract is enforced by the Wave 0 test, so Plan 10's signup-form 4xx-handler rewrites can rely on `resolveApiError(body, GENERIC_ERROR)` returning a stable `ApiErrorUx` shape.
- **Plan 04 cross-reference:** `INVALID_TOKEN_SUBJECT` server emission (already landed in Plan 04) now has its mapped UX in the PWA. End-to-end flow is wired structurally; will exercise live at Plan 10 AuthPage rewrite + manual sign-in test.

## Anchor

Plans 09 + 10 consume `@sentry/react` + `@marsidev/react-turnstile`; Plan 10 calls `resolveApiError`.

## Self-Check: PASSED

- `vigil-pwa/src/lib/api-error-codes.ts` exists — FOUND
- `vigil-pwa/package.json` has `@marsidev/react-turnstile` + `@sentry/react` in `dependencies` — FOUND
- `vigil-pwa/package-lock.json` modified — FOUND
- Task 1 commit `940244b` — FOUND in git log
- Task 2 commit `0948d86` — FOUND in git log
- Wave 0 test `src/lib/api-error-codes.test.ts` — 6/6 GREEN

---
*Phase: 126-wide-release-auth-hardening*
*Plan: 07*
*Completed: 2026-05-11*
