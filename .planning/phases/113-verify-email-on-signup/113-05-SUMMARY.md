---
phase: 113
plan: 05
subsystem: vigil-core/scripts + planning
tags: [smoke-test, uat, auth, verify-email, live-e2e]
requirements: [AUTH-11]

dependency_graph:
  requires:
    - 113-01  # 0017 migration + schema (users.email_verified_at)
    - 113-02  # register hook + /me endpoint + login response shape
    - 113-03  # POST /v1/auth/verify-email + POST /v1/auth/resend-verification
    - 113-04  # PWA VerifyEmailPage + SettingsPage banner + Resend lifecycle
  provides:
    - vigil-core/scripts/smoke-test-verify-email.ts (live e2e smoke for AUTH-11)
    - .planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md (manual UAT checklist)
  affects:
    - vigil-core/package.json (smoke-test:verify-email npm script added)

tech_stack:
  added: []
  patterns:
    - DB-direct token INSERT for smoke test (bypasses email delivery — mirrors Phase 112 pattern)
    - finally-block cleanup for idempotent smoke re-runs (no orphan rows)
    - Human UAT checklist with per-SC Observed + Result blocks (mirrors 112-HUMAN-UAT.md)

key_files:
  created:
    - vigil-core/scripts/smoke-test-verify-email.ts
    - .planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md
    - .planning/phases/113-verify-email-on-signup/113-05-SUMMARY.md
  modified:
    - vigil-core/package.json (added smoke-test:verify-email script)

decisions:
  - "Cleanup DELETE moved to finally block: token row deleted even on mid-smoke failure — no orphan rows (Rule 1 auto-fix triggered by ECONNREFUSED test run exposing the gap)"
  - "insertedTokenId scoped outside try so finally block can reference it unconditionally"
  - "Smoke test does NOT register a new user: seed user is already allowlisted; fresh allowlist entries require Railway env change (out of scope for a smoke script)"
  - "10s window for email_verified_at age assertion: wide enough to absorb Postgres + test overhead, narrow enough to confirm THIS run bumped the value"
  - "HUMAN-UAT status: partial (authored; execution against Railway prod is human-driven post-deploy)"

metrics:
  duration: "~7 minutes"
  completed: "2026-04-26"
  tasks_completed: 2
  files_changed: 3
---

# Phase 113 Plan 05: Live E2E Smoke + Human UAT Checklist Summary

**One-liner:** AUTH-11 smoke script exercises DB-direct token INSERT → POST /v1/auth/verify-email → emailVerifiedAt DB assert → single-use replay 400; HUMAN-UAT.md authors a 5-SC manual checklist covering Gmail inbox, Apple Mail prefetch, banner lifecycle, Railway backfill, and Resend rate limit.

## What Was Built

### Task 1: smoke-test-verify-email.ts

Live integration script at `vigil-core/scripts/smoke-test-verify-email.ts`. Mirrors Phase 112's `smoke-test-forgot-password.ts` pattern:

1. Resolves the seed user (`jamesonmorrill1@gmail.com` by default) via direct DB query.
2. Directly INSERTs a `type='email_verify'` row into `password_reset_tokens` with a fresh `crypto.randomBytes(32).toString('base64url')` token (same entropy + hashing as production).
3. POSTs the raw token to `POST /v1/auth/verify-email` against the live API.
4. Asserts response `200 { ok: true }`.
5. Asserts `users.email_verified_at` was bumped within the last 10 seconds.
6. Asserts the token row's `used_at` is non-null (atomic single-use claim ran).
7. Replays the same token → asserts `400 { error: "Invalid or expired token" }` (T-113-03 single-use enforcement).
8. Cleanup in `finally`: deletes the inserted token row so re-runs leave no orphan rows.

The `npm run smoke-test:verify-email` script entry uses `tsx --env-file=.env` (matching the existing `smoke-test` scripts pattern).

**Why DB-direct INSERT instead of real register?** The allowlist (`VIGIL_ALLOWED_EMAILS`) matches the full email address — a fresh `+timestamp@gmail.com` would require a Railway env change per run. The smoke test is designed to be runnable without ops changes. Real email delivery (SC#1) is out of scope for automation and is covered by the HUMAN-UAT.

### Task 2: 113-HUMAN-UAT.md (auto-approved checkpoint)

Authored at `.planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md`. Status: `partial` (checklist authored; live execution against Railway pending).

Five SC sections + Apple Mail section:

| Section | Source | Type |
|---------|--------|------|
| SC#1 — Gmail inbox arrival | VALIDATION.md row 1 | Manual: real email + inbox |
| SC#2 — Settings banner UX | ROADMAP SC#2 | Manual: PWA visual inspection |
| SC#3 — Verify clears banner; no redirect | ROADMAP SC#3 + VALIDATION.md row 3 | Manual: multi-tab flow |
| SC#4 — Seed user grandfathered (Railway psql) | ROADMAP SC#4 + VALIDATION.md row 4 | Manual: psql query against prod |
| SC#5 — Resend rate limit 429 on 4th click | ROADMAP SC#5 | Manual: PWA click sequence |
| Apple Mail prefetch | VALIDATION.md row 2 / T-113-05 | Manual: iOS/macOS Mail + desktop |

Each section includes: Steps, Assertions (checkbox list), Observed block (fill-in during run), and PASS/FAIL/DEFERRED result line.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | smoke-test-verify-email.ts + npm script | 493533f | vigil-core/scripts/smoke-test-verify-email.ts (created), vigil-core/package.json (modified) |
| 2 | 113-HUMAN-UAT.md (auto-approved checkpoint) | 5e0e829 | .planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md (created) |

## Smoke Test Runtime

The smoke test was attempted against `http://localhost:3001` — local server was not running (ECONNREFUSED). DB connection and token INSERT succeeded (verified seed user found, token row id=168 inserted). The ECONNREFUSED on the fetch call was expected (server down), not a code defect. The orphaned token row was cleaned up manually.

The finally-block cleanup gap was discovered during this run (Rule 1 auto-fix applied — see Deviations). The script will be runnable against Railway prod after Plans 01-04 deploy:

```bash
VIGIL_API_BASE=https://api.vigilhub.io DATABASE_URL=$RAILWAY_DB_URL npm run smoke-test:verify-email
```

TypeScript type check: `npx tsc --noEmit` exits 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cleanup DELETE moved to finally block for idempotent re-runs**

- **Found during:** Task 1 — live test run exposed ECONNREFUSED, leaving orphaned token row id=168 in local DB.
- **Issue:** Original implementation had the cleanup `DELETE` inside the `try` block at Step 7, after all assertions. If the fetch to the API failed mid-run (e.g., server not running, network error), the inserted token row was never deleted — orphan rows accumulated on re-runs.
- **Fix:** Moved cleanup to `finally` block; `insertedTokenId` scoped outside `try` so `finally` can reference it regardless of where the error occurred. Added a nested try/catch in `finally` to warn (not crash) if the cleanup itself fails.
- **Files modified:** `vigil-core/scripts/smoke-test-verify-email.ts`
- **Commit:** 493533f (included in Task 1 commit after the fix)

## UAT Outcomes

| SC | Status | Notes |
|----|--------|-------|
| SC#1 — Gmail inbox arrival | PENDING | Requires Railway deploy + real register |
| SC#2 — Settings banner UX | PENDING | Requires Railway deploy + PWA |
| SC#3 — Banner clears on reload | PENDING | Requires Railway deploy + multi-tab flow |
| SC#4 — Railway backfill (psql) | PENDING | Requires Railway deploy + psql access |
| SC#5 — Resend rate limit 429 | PENDING | Requires Railway deploy + PWA click sequence |
| Apple Mail prefetch | PENDING | Requires iOS/macOS Mail device configured with test inbox |

All pending items require the Railway deploy of Plans 01-04 to be live. The HUMAN-UAT.md checklist is ready to execute immediately after deploy.

## Recommended Follow-ups

1. **Run the smoke test against Railway prod** after Plans 01-04 merge:
   `VIGIL_API_BASE=https://api.vigilhub.io DATABASE_URL=$RAILWAY_DB_URL npm run smoke-test:verify-email`
2. **Execute HUMAN-UAT.md** section by section. Update `status: verified` when all SCs are ticked.
3. **Resend webhook ingestion** (Phase 111 deferral): If SC#1 Gmail delivery reliability becomes a recurring concern (email to spam, delayed, etc.), a Resend webhook receiver for `email.delivered` / `email.bounced` events would give programmatic delivery confirmation. Currently out of scope.
4. **Phase 113 closure**: After HUMAN-UAT sign-off, commit the filled-in HUMAN-UAT.md with `status: verified` and mark AUTH-11 complete in REQUIREMENTS.md.

## Known Stubs

None — this plan authors scripts and a checklist, not UI components. No data-source wiring, no rendering stubs.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced by this plan. The smoke test accesses the DB directly via DATABASE_URL (trusted admin path per threat model boundary "smoke test → DATABASE_URL"). No new trust boundaries opened.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| vigil-core/scripts/smoke-test-verify-email.ts | FOUND |
| vigil-core/package.json has smoke-test:verify-email | FOUND (grep count = 1) |
| .planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md | FOUND |
| 113-HUMAN-UAT.md contains "Phase 113 — Human UAT" | FOUND |
| 113-HUMAN-UAT.md status: partial | FOUND |
| Commit 493533f (Task 1) | FOUND |
| Commit 5e0e829 (Task 2) | FOUND |
| npx tsc --noEmit | EXIT 0 |
