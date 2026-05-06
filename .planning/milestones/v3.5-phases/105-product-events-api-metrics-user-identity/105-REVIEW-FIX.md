---
phase: 105-product-events-api-metrics-user-identity
fixed_at: 2026-04-20T03:59:43Z
review_path: .planning/phases/105-product-events-api-metrics-user-identity/105-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 105: Code Review Fix Report

**Fixed at:** 2026-04-20T03:59:43Z
**Source review:** `.planning/phases/105-product-events-api-metrics-user-identity/105-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-01, WR-02; fix_scope=critical_warning — Info items skipped by scope)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: Direct `trackEvent` call sites are not wrapped in try/catch

**Files modified:** `vigil-core/src/analytics/posthog.ts`
**Commit:** `86272aa`
**Applied fix:** Chose reviewer's Option (b) — wrapped the entire `trackEvent` body in try/catch inside `vigil-core/src/analytics/posthog.ts` so every caller (thoughts.ts:308, process-photo.ts:471, brief-generate.ts:110, chat.ts:111, and metricsMiddleware) inherits the non-fatal guarantee. On catch, logs `[posthog] trackEvent failed (non-fatal):` with the error message and swallows. The existing try/catch inside `metricsMiddleware` was left in place as defense-in-depth — both layers being present is cheap and a second callsite catching again does nothing harmful. Added JSDoc paragraph explaining the WR-01 guarantee. No signature change, no call-site churn. Tier 2 verification: `src/analytics/posthog.test.ts` — 19/19 pass.

### WR-02: `metricsMiddleware` is registered after `googleAuth`, silently dropping those routes from metrics

**Files modified:** `vigil-core/src/index.ts`
**Commit:** `1f8bfa6`
**Applied fix:** Moved the `app.use("/v1/*", metricsMiddleware)` mount to *before* `app.route("/v1", googleAuth)` (still after the bearerAuth dispatcher) so the authenticated `/v1/auth/google` initiation route is now measured. Updated the comment block to correctly describe the mount ordering rationale (Hono applies path-scoped `app.use()` only to routes registered after it) and explicitly note that mounting before googleAuth is load-bearing. D-05 public-route skipping is preserved by the bearerAuth dispatcher's `return next()` short-circuits plus the middleware's internal `if (userId == null) return;` guard. Tier 2 verification: `src/middleware/metrics.test.ts` — 11/11 pass; full Phase 105 test triad (`posthog.test.ts` + `metrics.test.ts` + `me.test.ts`) — 38/38 pass.

## Skipped Issues

None. IN-01 through IN-04 are outside `fix_scope=critical_warning` and were not attempted in this iteration. They remain in 105-REVIEW.md for future reference.

---

_Fixed: 2026-04-20T03:59:43Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
