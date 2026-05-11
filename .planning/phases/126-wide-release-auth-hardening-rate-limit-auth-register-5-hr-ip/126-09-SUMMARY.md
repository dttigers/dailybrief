---
phase: 126
plan: 09
subsystem: vigil-pwa/sentry
tags: [auth, pwa, sentry, error-tracking, react, AUTH-126-04, D-04]

# Dependency graph
requires:
  - phase: 126
    plan: 07
    provides: "@sentry/react@^10.52.0 installed in vigil-pwa/package.json"
provides:
  - "vigil-pwa/src/main.tsx Sentry.init() DSN-gated BEFORE createRoot().render() — React construction errors captured"
  - "vigil-pwa/src/components/ErrorBoundary.tsx Sentry.captureException() sibling — PostHog preserved alongside"
affects:
  - "Any React render-phase error is now forwarded to both PostHog and Sentry"
  - "Plan 10 (AuthPage surgery) — ErrorBoundary wraps AuthPage, so auth errors also reach Sentry if they escape to boundary"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DSN-gated Sentry.init before createRoot — mirrors posthog side-effect import convention at analytics/posthog.ts:D-14"
    - "Additive dual-sink in componentDidCatch — PostHog preserved verbatim + Sentry sibling; one failure does not block the other"

key-files:
  created: []
  modified:
    - "vigil-pwa/src/main.tsx — added import * as Sentry + DSN-gated init block before createRoot (14 lines added)"
    - "vigil-pwa/src/components/ErrorBoundary.tsx — added Sentry import + Sentry.captureException sibling in componentDidCatch (3 lines added)"

key-decisions:
  - "sendDefaultPii intentionally NOT set (default false) — opting in would risk Bearer-token leak via HTTP breadcrumbs per RESEARCH Security Domain"
  - "No Sentry.ErrorBoundary wrapper — existing ErrorBoundary.tsx already wraps the tree; double-wrapping would double-capture every error and blow the 5k/mo free tier quota"
  - "tracesSampleRate: 0 — errors-only; preserves 5k events/mo Developer-tier quota per CONTEXT additional_context"
  - "tags: { boundary: 'root' } shape for Sentry — tags are searchable in Sentry UI; aligns with server-side onError routing/method tagging pattern from Plan 06"

# Metrics
duration: 2m 25s
completed: 2026-05-11
---

# Phase 126 Plan 09: PWA Sentry init + ErrorBoundary dual-sink Summary

**`@sentry/react` wired into the PWA at two sites: `Sentry.init` in `main.tsx` BEFORE `createRoot().render()` (DSN-gated, no traces), and `Sentry.captureException` as an additive sibling in `ErrorBoundary.componentDidCatch` alongside the preserved PostHog call.**

## Performance

- **Duration:** ~2m 25s
- **Started:** 2026-05-11T19:48:07Z
- **Completed:** 2026-05-11T19:50:32Z
- **Tasks:** 2/2 (both autonomous)
- **Files modified:** 2

## Accomplishments

- `vigil-pwa/src/main.tsx`: Added `import * as Sentry from "@sentry/react"` and a DSN-gated `Sentry.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0 })` block placed AFTER the posthog side-effect import and BEFORE `createRoot(document.getElementById('root')!).render(...)`. Source position verified via `indexOf("Sentry.init(")` < `indexOf("createRoot(document")` (803 < 942).
- `vigil-pwa/src/components/ErrorBoundary.tsx`: Added `import * as Sentry from "@sentry/react"` and `Sentry.captureException(error, { tags: { boundary: 'root' } })` as an additive sibling call immediately after the existing `captureException(error, { boundary: 'root' })` PostHog call in `componentDidCatch`.
- `npx vite build` exits 0 in both cases (confirmed after each task).
- Existing PostHog `captureException` call preserved verbatim per D-19 and CONTEXT line 138.

## Task Commits

Each task committed atomically:

1. **Task 1: Wire Sentry.init in main.tsx BEFORE createRoot.render** — `723ede6` (feat)
2. **Task 2: Add Sentry sibling capture in ErrorBoundary.componentDidCatch** — `3a2ce38` (feat)

**Plan metadata commit:** _(landed with this SUMMARY)_

## Files Modified

- `vigil-pwa/src/main.tsx` — 14 lines added: Sentry namespace import + DSN-gated init block with comment
- `vigil-pwa/src/components/ErrorBoundary.tsx` — 3 lines added: Sentry namespace import + Sentry.captureException sibling in componentDidCatch

## Verification Evidence

| Check | Expected | Actual | Result |
|---|---|---|---|
| `grep -c "Sentry.init" vigil-pwa/src/main.tsx` | 1 | 1 | OK |
| `grep -c "VITE_SENTRY_DSN" vigil-pwa/src/main.tsx` | ≥ 1 | 2 | OK |
| `grep -c "tracesSampleRate" vigil-pwa/src/main.tsx` | ≥ 1 | 2 | OK |
| `Sentry.init` position < `createRoot(document` position | true | 803 < 942 | OK |
| Posthog side-effect import preserved | true | line 5 still present | OK |
| `grep -c "@sentry/react" vigil-pwa/src/components/ErrorBoundary.tsx` | ≥ 1 | 1 | OK |
| `grep -c "Sentry.captureException" vigil-pwa/src/components/ErrorBoundary.tsx` | ≥ 1 | 1 | OK |
| `grep -c "captureException(error" vigil-pwa/src/components/ErrorBoundary.tsx` | ≥ 2 | 2 | OK |
| `grep -c "boundary: 'root'" vigil-pwa/src/components/ErrorBoundary.tsx` | 2 (both calls) | 2 | OK |
| `npx vite build` exits 0 (after Task 1) | 0 | 0 | OK |
| `npx vite build` exits 0 (after Task 2) | 0 | 0 | OK |

## Decisions Made

- **`sendDefaultPii` NOT set** — default is `false`. Opting in would risk Bearer-token leak via Sentry HTTP breadcrumbs (RESEARCH Security Domain, T-126-09-02 mitigate disposition). Explicitly documented in comment in `main.tsx`.
- **No `<Sentry.ErrorBoundary>` wrapper** — the existing `vigil-pwa/src/components/ErrorBoundary.tsx` already wraps the entire React tree. Adding a second boundary would double-capture every render-phase error, burning the 5k events/mo free-tier quota twice as fast and violating T-126-09-05 (Repudiation — future code double-capturing). Plan body explicitly documents this prohibition.
- **`tags: { boundary: 'root' }` shape** — tags are indexed and searchable in Sentry UI, aligning with the server-side `captureToSentry(userId, err, { route, method })` tagging pattern from Plan 06's `index.ts` onError sink.
- **`tracesSampleRate: 0`** — errors only; performance tracing is disabled to stay under the Sentry Developer tier's 5k events/month free quota. Any future tracing opt-in is a deliberate one-line change.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the PATTERNS.md specifications verbatim. The symlink of `vigil-pwa/node_modules` (from the main repo) was required to run `vite build` from inside the worktree — this is a worktree-specific operational step, not a code deviation.

## Known Stubs

None — no placeholder values, empty returns, or TODO markers introduced. Both additions are production-functional wiring (init + capture calls).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced beyond those documented in the plan's `<threat_model>`. The `VITE_SENTRY_DSN` env var is a client-public Sentry DSN (per T-126-09-01 disposition: DSNs are public-by-design per Sentry's own threat model). The outbound Sentry SDK calls are fire-and-forget with no Bearer headers in the payload (`sendDefaultPii: false` by default).

## Next Phase Readiness

- **Plan 10 (AuthPage Turnstile widget + error UX):** ErrorBoundary's dual-sink is live; any signup/login render errors that escape to the boundary will be captured in both PostHog and Sentry.
- **VITE_SENTRY_DSN env var** must be set in Vercel's production environment (or `.env.local` for local dev) to activate Sentry capture. The DSN-gate ensures local dev with unset env var produces no Sentry traffic.

## Anchor

Plan 10 wires the final PWA-side AuthPage surgery (Turnstile widget + error-code rendering + legal footer).

## Self-Check: PASSED

- `vigil-pwa/src/main.tsx` modified — FOUND
- `vigil-pwa/src/components/ErrorBoundary.tsx` modified — FOUND
- Task 1 commit `723ede6` — FOUND
- Task 2 commit `3a2ce38` — FOUND
- `Sentry.init` in main.tsx before createRoot call — VERIFIED (index 803 < 942)
- Both `captureException` calls in ErrorBoundary.componentDidCatch — VERIFIED (count = 2)
- `npx vite build` exits 0 — VERIFIED

---
*Phase: 126-wide-release-auth-hardening*
*Plan: 09*
*Completed: 2026-05-11*
