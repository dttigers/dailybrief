---
phase: 126
plan: 08
subsystem: vigil-pwa
tags:
  - frontend
  - legal
  - public-routes
  - auth-126-06
requirements:
  - AUTH-126-06
dependency_graph:
  requires:
    - 126-01 # Wave 0 RED scaffolds (PrivacyPolicyPage.test.tsx + TermsOfServicePage.test.tsx)
  provides:
    - "/legal/privacy public route"
    - "/legal/terms public route"
    - "PrivacyPolicyPage component (default export)"
    - "TermsOfServicePage component (default export)"
  affects:
    - 126-10 # AuthPage footer Link consumption — targets are now valid
tech_stack:
  added: []
  patterns:
    - "Public-route sibling: <Route> mounted OUTSIDE the isAuthenticated guard cluster (mirrors Phase 112 /auth/forgot + Phase 113 /auth/verify)"
    - "Stateless presentational component: no fetch / no useState / no router hooks → survives /v1/* downtime by design"
    - "Tailwind dark-surface chrome: min-h-screen bg-gray-900 text-white px-6 py-8 outer + max-w-3xl mx-auto <article>"
    - "Top-of-page revision anchor: 'Last updated: <date>' line beneath h1 (T-126-08-03 mitigation)"
key_files:
  created:
    - vigil-pwa/src/pages/PrivacyPolicyPage.tsx
    - vigil-pwa/src/pages/TermsOfServicePage.tsx
  modified:
    - vigil-pwa/src/App.tsx
decisions:
  - "Hand-rolled legal content (CONTEXT line 109) chosen over Termly-hosted iframe — avoids CSP carve-outs + survives /v1/* downtime. Operator may paste Termly-generator output here post-revenue if preferred"
  - "Section headings consistent across both pages (Tailwind text-xl font-semibold mt-6 mb-2) so future operator edits don't drift visual rhythm between Privacy and Terms"
  - "Contact CTA points to hello@vigilhub.io (same target as REG_NOT_ALLOWED ctaHref from Plan 07) — single consistent contact surface across auth + legal error states"
  - "13+ eligibility chosen (mirror Stripe/Linear default); operator can tighten to 18+ later if revenue model triggers different threshold without code reshape"
  - "Governing Law: Colorado, USA (operator's jurisdiction per user_timezone.md memory)"
metrics:
  duration: 2m 49s
  tasks_completed: 2
  files_created: 2
  files_modified: 1
  completed_date: 2026-05-11
---

# Phase 126 Plan 08: Legal pages (/legal/privacy + /legal/terms) Summary

Wave 1 implementation of AUTH-126-06: hand-rolled Privacy Policy and Terms of Service pages mounted as public route siblings outside the isAuthenticated guard, with content shaped for v1 publishability (lawyer review recommended within 30 days post-revenue per CONTEXT line 109).

## What Shipped

- **PrivacyPolicyPage.tsx (90 lines)** — six sections: Data We Collect, How We Use Your Data, Third-Party Services (Anthropic / Turnstile / Resend / PostHog / Sentry / Railway / Vercel), Data Retention, Your Rights, Contact. Top-of-page "Last updated: 2026-05-11" revision anchor.
- **TermsOfServicePage.tsx (109 lines)** — nine sections: Acceptance, Account Eligibility (13+), Acceptable Use, AI Disclaimer (not legal/medical/financial advice), Modifications to Service, Termination, Limitation of Liability, Governing Law (Colorado), Contact. Same revision-anchor pattern.
- **App.tsx diff (+6 lines)** — 2 imports (`PrivacyPolicyPage` / `TermsOfServicePage`) + 2 `<Route>` registrations sitting immediately AFTER `/auth/verify` (Phase 113) and BEFORE the `/*` isAuthenticated cluster.

Both pages use the Tailwind dark-surface chrome conventions established by Phase 112 ForgotPasswordPage (`min-h-screen bg-gray-900 text-white px-6 py-8` outer + semantic `<article>` wrapper).

## Verification Results

| Check | Status | Detail |
|---|---|---|
| PrivacyPolicyPage.test.tsx (Wave 0 RED) | ✓ GREEN | 2/2 — AUTH-126-PRIVACY-RENDERS + AUTH-126-PRIVACY-HEADING |
| TermsOfServicePage.test.tsx (Wave 0 RED) | ✓ GREEN | 2/2 — AUTH-126-TERMS-RENDERS + AUTH-126-TERMS-HEADING |
| `grep -c '"/legal/privacy"' App.tsx` | ✓ 1 | Exactly one Route registration |
| `grep -c '"/legal/terms"' App.tsx` | ✓ 1 | Exactly one Route registration |
| `grep -c "PrivacyPolicyPage" App.tsx` | ✓ 2 | Import + JSX use |
| `grep -c "TermsOfServicePage" App.tsx` | ✓ 2 | Import + JSX use |
| PrivacyPolicyPage.tsx ≥ 30 lines | ✓ 90 lines | Real publishable content, not stub |
| TermsOfServicePage.tsx ≥ 30 lines | ✓ 109 lines | Real publishable content, not stub |
| Routes positioned OUTSIDE isAuthenticated guard | ✓ | Sibling of /auth/forgot block; closes T-126-08-05 |
| `vite build` (production bundle) | ✓ Clean | `built in 1.24s`; PWA precache OK; zero new errors |

## Threat Model Coverage

| Threat ID | Status | How |
|---|---|---|
| T-126-08-01 (PII in page content) | mitigated | Contact email is `hello@vigilhub.io` brand alias; zero personal PII rendered |
| T-126-08-03 (undated edits) | mitigated | "Last updated: 2026-05-11" line beneath h1 on both pages — operator updates on each republish |
| T-126-08-05 (route mounted inside auth guard) | mitigated by construction | Both Route elements positioned alongside /auth/forgot|reset|verify siblings, BEFORE the /* isAuthenticated cluster; verified via App.tsx structural review during Task 2 |
| T-126-08-06 (pages should survive API/DB downtime) | mitigated by design | Pure presentational components: zero fetches / useState / useEffect / router hooks. Vercel CDN serves regardless of vigil-core state |
| T-126-08-02 (policy accuracy) | accepted | Operator owns accuracy; v1 ships honest minimum per CONTEXT line 109 |
| T-126-08-04 (phishing clones) | accepted | Public content — no copyright defense applies; `app.vigilhub.io` is source-of-truth |

## Deviations from Plan

None — both tasks executed exactly as written. Wave 0 RED scaffolds (Plan 01) defined minimum content shape and Plan 08 honored every acceptance gate on first try (4/4 tests green, 1/1 grep counts, 6/6 import/JSX counts, both files ≥ 30 lines).

## Deferred Issues (Out-of-Scope Discoveries)

- **Pre-existing `tsc --noEmit` TS6305 noise (76 errors)** — running `npx tsc --noEmit -p tsconfig.json` in `vigil-pwa/` produces 76 "Output file '….d.ts' has not been built from source file '….tsx'" errors. Affects every src/*.tsx file in the tree (App.tsx, all pages, all components, all utils — including pre-existing files), all `error TS6305`, zero `error TS<other>`. Root cause: stale `node_modules/.tmp/tsconfig.app.tsbuildinfo` incremental-build cache leftover from a previous `tsc -b` run, referencing emitted `.d.ts` files that no longer exist on disk and are not committed to git. The project's actual build path is `npm run build` → `vite build`, which exits clean (`built in 1.24s`). Out-of-scope for Plan 08 (Rule: scope boundary — pre-existing artifact unrelated to this plan's changes). Mitigation when an operator wants a clean tsc signal: `rm node_modules/.tmp/tsconfig.app.tsbuildinfo` before running `tsc --noEmit`. Not blocking — vite is the actual production build path.

## Stub Tracking

None. Both pages render real publishable content. No `TODO`, no `Lorem ipsum`, no "coming soon" placeholders.

## Commits

| Task | Description | Hash |
|---|---|---|
| 1 | feat(126-08): create PrivacyPolicyPage + TermsOfServicePage components | `9bb71a9` |
| 2 | feat(126-08): register /legal/privacy + /legal/terms public routes in App.tsx | `6d713e1` |

## Anchors for Downstream Plans

- **Plan 10 (AuthPage footer)** — AuthPage will add `<Link to="/legal/privacy">…</Link>` and `<Link to="/legal/terms">…</Link>` components in the signup-screen footer. Both routes are now valid targets — Plan 10 will land green without 404 risk.
- **Operator action (deferred, NOT a code task)** — Lawyer review of `/legal/privacy` + `/legal/terms` content recommended within 30 days post-revenue per CONTEXT line 109. Operator can either paste Termly-generator output into these components or hand-edit each section as needed; both files are stateless TSX with zero coupling to other modules, so content edits land as plain TSX diffs.

## Self-Check: PASSED

- FOUND: vigil-pwa/src/pages/PrivacyPolicyPage.tsx
- FOUND: vigil-pwa/src/pages/TermsOfServicePage.tsx
- FOUND: vigil-pwa/src/App.tsx
- FOUND: .planning/phases/126-wide-release-auth-hardening-rate-limit-auth-register-5-hr-ip/126-08-SUMMARY.md
- FOUND: commit `9bb71a9` (Task 1)
- FOUND: commit `6d713e1` (Task 2)
