---
phase: 111-transactional-email-infrastructure-resend-dns
plan: 02
subsystem: email
tags: [resend, email, posthog, pii-hashing, lazy-init, factory-di, typescript]

# Dependency graph
requires:
  - phase: 103-posthog-observability-error-tracking-events
    provides: captureException + lazy null-init pattern (the canonical posthog.ts shape copied by email-service)
  - phase: 107.1-local-dev-environment-with-postgres-and-hot-reload-stack
    provides: .env.example commented-block convention
provides:
  - "vigil-core/src/services/email-service.ts — typed email wrappers + factory + module-level singleton"
  - "EmailSendResult discriminated union ({ sent | skipped_no_key | failed }) reusable by future routes"
  - "sendPasswordResetEmail / sendEmailVerificationEmail wrappers ready for Phase 112 / Phase 113 to import"
  - "sendEmail primitive escape hatch for future one-offs (AUTH-09 deferred confirm email)"
  - "SHA-256 PII-hash helper for safe PostHog error context (D-12 mitigation)"
  - ".env.example RESEND_API_KEY + VIGIL_APP_BASE_URL commented blocks (Phase 107.1 convention)"
  - "resend@^6.12.2 pinned in vigil-core/package.json"
affects:
  - 112-forgot-password-email-flow
  - 113-verify-email-on-signup
  - 111-03 (smoke test of transport)

# Tech tracking
tech-stack:
  added: [resend@^6.12.2 (Node SDK)]
  patterns:
    - "Email service: lazy null-init singleton copied verbatim from posthog.ts (D-10)"
    - "Closure-bound arrow wrappers (not shorthand methods) so singleton re-exports survive method-reference extraction"
    - "Factory + module-singleton DI pattern matches calendar-service.ts"
    - "PII hashing with SHA-256 hex[0..16] + lowercase/trim normalization before PostHog capture"
    - "Domain-level tracking-disable strategy (since Resend SDK v6 dropped per-send click_tracking/open_tracking flags — T-111-09 lives in Plan 01 now)"

key-files:
  created:
    - "vigil-core/src/services/email-service.ts (244 lines)"
    - "vigil-core/src/services/email-service.test.ts (407 lines, 10 node:test blocks)"
    - ".planning/phases/111-transactional-email-infrastructure-resend-dns/111-02-SUMMARY.md"
  modified:
    - "vigil-core/package.json (added resend@^6.12.2)"
    - "vigil-core/package-lock.json (lockfile updates for resend + transitive deps)"
    - "vigil-core/.env.example (RESEND_API_KEY + VIGIL_APP_BASE_URL commented blocks)"

key-decisions:
  - "Resend SDK v6.12.2 dropped per-send click_tracking/open_tracking — T-111-09 mitigation moved to Domain level (Plan 01 concern); this plan's tests now assert the payload does NOT contain those keys so future regressions surface loudly"
  - "Test spy captureExceptionFn signature uses optional context param to match the real captureException contract (strictFunctionTypes — required fn to optional-param fn coercion fails without this)"
  - "Closure-bound arrow wrappers (not shorthand methods) inside createEmailService so `export const sendPasswordResetEmail = singleton.sendPasswordResetEmail` works at runtime"
  - "SHA-256 hex[0..16] + lowercase/trim for PII hash — bounded PostHog property size, case/whitespace-stable across input variations"
  - "createEmailService resolves resendClient via hasOwnProperty check so explicit null from tests overrides the module singleton cleanly"

patterns-established:
  - "Lazy null-init singleton with factory DI override: service module exports both the singleton AND a createService(deps) factory for tests to inject mocks — callable interchangeably"
  - "PII-safe observability: hash recipient identifiers before emitting to PostHog; never include raw emails/usernames in capture context"
  - "Closure over this: when re-exporting methods as standalone references (e.g. singleton re-exports), define them as arrow properties, not shorthand methods"

requirements-completed: [EMAIL-01]

# Metrics
duration: 7min
completed: 2026-04-24
---

# Phase 111 Plan 02: email-service Module Summary

**Typed Resend wrappers (password reset + email verification + sendEmail primitive) with lazy null-init singleton, SHA-256 PII hashing on failure observability, and domain-level tracking-disable strategy forced by Resend SDK v6 API removal**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-24T16:28:30Z
- **Completed:** 2026-04-24T16:35:00Z (approx)
- **Tasks:** 3 (2 code tasks + 1 verification-only task)
- **Files modified:** 4 (2 created + 3 modified; package-lock counted separately)

## Accomplishments

- `email-service.ts` module ships with `sendEmail`, `sendPasswordResetEmail`, `sendEmailVerificationEmail`, `createEmailService`, and `EmailSendResult` exports — ready for Phase 112/113 to import.
- All 10 `node:test` blocks GREEN — full contract coverage for skipped_no_key / sent / failed (throw + error-object paths), no-per-send-tracking-fields, verbatim URL, html+text multipart, from-address, PII hash.
- Singleton-binding smoke verified: `RESEND_API_KEY= npx tsx -e "import('./src/services/email-service.ts').then(m => m.sendPasswordResetEmail(...))"` prints `singleton ok`. Closure-based wrappers survive method-reference extraction (the `this`-binding footgun the plan's Task 2 Step 5 warned about is absent — verified by both test and live smoke).
- vigil-core boots with `RESEND_API_KEY` unset (no FATAL added, server binds to 0.0.0.0:3001); Success Criterion #4 satisfied.

## Task Commits

1. **Task 1 (RED): install Resend SDK + scaffold RED tests** — `174afe5` (test)
2. **Task 2 (GREEN): implement email-service module, 10/10 tests pass** — `226b6a9` (feat)
3. **Task 3 (verify): boot-without-key smoke + cold-call check** — no code changes, verification-only (see Verification below)

## Verified Resend SDK Surface

- **Installed version:** `resend@^6.12.2`
- **Type inspection source:** `vigil-core/node_modules/resend/dist/index.d.mts` lines 515–596
- **`Emails.send(payload)` payload type:** `CreateEmailOptions = CreateEmailBaseOptions & (html | text | react | template)` — fields: `from, to, subject, headers, replyTo, cc, bcc, tags, attachments, scheduledAt, topicId, html, text, react` (no tracking fields).
- **`click_tracking` / `open_tracking` found at:** `Domain` interface (lines 91–101, snake_case) and `DomainApiOptions` (lines 104–113, snake_case), with camelCase variants on Domain update/create responses (lines 1165–1207). These are **domain-level** settings only — NOT accepted by `emails.send`.
- **Implication:** The plan's assumed per-send `click_tracking: false` / `open_tracking: false` call shape is not possible in SDK v6. The T-111-09 mitigation (disabling Apple Mail pre-fetch of reset links) must happen at the domain level via the Resend dashboard or `domains.update(id, { clickTracking: false, openTracking: false })` — that is Plan 01's responsibility. This plan's tests assert the send payload does NOT include those keys so any future regression (someone adding `click_tracking: false` back) fails loudly.

## Final Exports (email-service.ts)

- `sendEmail({ to, subject, html, text }): Promise<EmailSendResult>` — primitive escape hatch (D-04)
- `sendPasswordResetEmail(to: string, resetUrl: string): Promise<EmailSendResult>` — AUTH-10 wrapper (Phase 112)
- `sendEmailVerificationEmail(to: string, verifyUrl: string): Promise<EmailSendResult>` — AUTH-11 wrapper (Phase 113)
- `createEmailService(deps?: EmailServiceDeps): { sendEmail, sendPasswordResetEmail, sendEmailVerificationEmail }` — DI factory
- `EmailSendResult` type — `{ status: "sent"; id: string } | { status: "skipped_no_key" } | { status: "failed"; error: string }`
- `EmailServiceDeps` interface — `{ resendClient?: Resend | null; captureExceptionFn?: typeof realCaptureException }`
- `resend: Resend | null` — module-level singleton (posthog.ts pattern mirror)

## Test Count

- **Total blocks:** 10
- **Pass:** 10
- **Fail:** 0
- Run: `cd vigil-core && npx tsx --test src/services/email-service.test.ts` — duration ~1.8s.
- Regression run (email + calendar + posthog): 40/40 pass across all three test files.

## Cold-Call Smoke stdout (Task 3 Step 3)

```
$ cd vigil-core && RESEND_API_KEY= npx tsx -e "import('./src/services/email-service.ts').then(async m => { const r = await m.sendPasswordResetEmail('test@example.com', 'https://example.com/reset?token=x'); console.log(JSON.stringify(r)); })"
{"status":"skipped_no_key"}
```

## Boot-Without-Key Smoke (Task 3 Step 4)

- Ran `RESEND_API_KEY= npm run dev` for 8 seconds.
- Boot log at `/tmp/vigil-boot.log`:
  - `[generate-scheduler] started (60s tick interval)`
  - `[gmail-workorders] started (5m tick interval)`
  - `Vigil Core API running on 0.0.0.0:3001`
  - `[vigil-core] PostgreSQL connection verified`
- `grep -c 'FATAL' /tmp/vigil-boot.log` → 0
- No email-service or resend error/stack mentions anywhere in the log.
- Success Criterion #4 ("vigil-core boots successfully with RESEND_API_KEY unset — no startup crash") is demonstrably satisfied.

## Files Created/Modified

- `vigil-core/src/services/email-service.ts` *(created)* — 244 lines. Factory + singleton + doSend internal + three wrappers + PII hash helper.
- `vigil-core/src/services/email-service.test.ts` *(created)* — 407 lines. 10 node:test blocks with spy/mock Resend client + captureException spy.
- `vigil-core/.env.example` *(modified)* — appended RESEND_API_KEY and VIGIL_APP_BASE_URL commented blocks after the existing VIGIL_BIND_HOST block.
- `vigil-core/package.json` *(modified)* — added `"resend": "^6.12.2"` to dependencies.
- `vigil-core/package-lock.json` *(modified)* — lockfile updates for resend + 6 transitive deps.

## Decisions Made

1. **Per-send tracking flags not passed** (see "Verified Resend SDK Surface" above) — the plan-documented T-111-09 mitigation moves to Plan 01's domain-level Resend setup. This plan's tests now assert *absence* of tracking keys on the payload.
2. **SHA-256 hex prefix length = 16** — balances PostHog property-size bounds with enough entropy to correlate failures for the same recipient across events. Consistent with the plan's hint ("truncate to 16 chars").
3. **Test spy captureExceptionFn signature has optional `context` param** — `captureException`'s real type has `context?`, and TypeScript's strictFunctionTypes rejects a required-param spy substituting for an optional-param contract.
4. **`resendClient` resolution uses `hasOwnProperty` check** — so `createEmailService({ resendClient: null })` in tests explicitly overrides the singleton, while `createEmailService()` (no deps) or `createEmailService({ captureExceptionFn: fn })` falls through to the real module singleton.
5. **Closure-bound arrow wrappers, not shorthand methods** — faithful to the plan's Task 2 Step 5 footgun warning. The returned object's properties are `const sendPasswordResetEmail = async (...) => doSend(...)` arrows, making `export const sendPasswordResetEmail = singleton.sendPasswordResetEmail` binding-safe when re-exported at module top-level.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Resend SDK v6 does not accept per-send `click_tracking`/`open_tracking`**
- **Found during:** Task 1 Step 3 (SDK option-name verification — an explicit plan instruction)
- **Issue:** Plan's behavior section and assertions assumed the SDK's `emails.send` accepts per-send tracking flags. Inspection of `node_modules/resend/dist/index.d.mts` confirmed these fields exist only on the Domain API (snake_case + camelCase variants), NOT on `CreateEmailBaseOptions`. Passing them would TypeScript-error under strict mode or be silently dropped by the Resend API.
- **Fix:**
  - Removed `click_tracking: false` / `open_tracking: false` from the implementation's send payload.
  - Reframed the relevant test from "asserts payload contains `click_tracking: false`" to "asserts payload does NOT contain `click_tracking`/`open_tracking`/`clickTracking`/`openTracking`" — regression guard against anyone re-adding them.
  - Documented the SDK constraint in prominent comment blocks at the top of both `email-service.ts` and `email-service.test.ts`, including the forward reference that domain-level tracking-disable is Plan 01's responsibility.
- **Files modified:** `vigil-core/src/services/email-service.ts`, `vigil-core/src/services/email-service.test.ts`
- **Verification:** 10/10 tests pass; `npx tsc --noEmit` clean; no runtime errors on cold-call.
- **Committed in:** `174afe5` (Task 1) + `226b6a9` (Task 2)

**2. [Rule 3 — Blocking] Spy `captureExceptionFn` signature with required `context` param failed strictFunctionTypes**
- **Found during:** Task 2 Step 10 (`npx tsc --noEmit`)
- **Issue:** Initial test-spy helper typed `context` as required; `captureException`'s real signature has `context?` optional. Under strictFunctionTypes, a required-param function is NOT assignable to an optional-param function type (contravariance on parameters).
- **Fix:** Changed the spy's signature to `context?: Record<...>` and `context ?? {}` when recording.
- **Files modified:** `vigil-core/src/services/email-service.test.ts`
- **Verification:** `npx tsc --noEmit` clean on retry; all 10 tests still pass.
- **Committed in:** `226b6a9` (Task 2)

---

**Total deviations:** 2 auto-fixed (2 blocking — both SDK / type-system constraints that had to be resolved to complete the task).
**Impact on plan:** No scope creep. T-111-09 mitigation is preserved (just moved to the correct layer — domain config in Plan 01 — per SDK reality). All Phase 111 success criteria for Plan 02 remain satisfied.

## Issues Encountered

- Acceptance-criterion grep `grep -cE 'export (function|const) sendPasswordResetEmail'` returned 2 (not 1) because a comment line contains the phrase; the strict anchored `^export ...` check returns 1 as intended. Recorded for posterity; spirit of the criterion (each wrapper exported at module top level) is met.
- macOS `timeout` / `gtimeout` not installed — Task 3 Step 4 boot check used a background-PID + `sleep 8` + `kill` pattern instead. Same outcome, same log inspection.
- Pre-existing dirty-tree state on `vigil-pwa/src/index.css` and `.planning/STATE.md` not touched by this plan (orchestrator owns STATE.md). Staged only plan-specific files in each commit.

## User Setup Required

None — Resend SDK is fully mockable; this plan does not require a live `RESEND_API_KEY`, a verified domain, or Railway env injection. Plan 01 (DNS / domain verify) and Plan 03 (live smoke) handle the human-action steps.

## Cloudflare / Railway Config for Later Plans

- **Plan 01:** Configure Cloudflare DNS for `vigilhub.io` (DKIM CNAME gray-cloud, SPF TXT, DMARC TXT); verify domain in Resend dashboard; **disable click_tracking + open_tracking on the Resend domain** (either via dashboard or `domains.update(id, { clickTracking: false, openTracking: false })` — note camelCase on the Domains API per index.d.mts lines 1203–1207). This is where T-111-09 mitigation actually lands.
- **Plan 03:** Set `RESEND_API_KEY` on Railway Variables; set `VIGIL_APP_BASE_URL=https://app.vigilhub.io` on Railway; run live smoke test that sends `sendPasswordResetEmail("jamesonmorrill1@gmail.com", "https://example.com/reset?token=testing")` and confirms the email lands in Gmail inbox with the verbatim URL.

## Next Phase Readiness

- **Phase 112 (AUTH-10 forgot-password):** can import `sendPasswordResetEmail` today. Route handler constructs `${VIGIL_APP_BASE_URL}/auth/reset?token=${rawToken}` per D-05 and hands it to the wrapper. Failure handling follows D-10 enumeration-safety (always return HTTP 200; `EmailSendResult` is observed only for logging).
- **Phase 113 (AUTH-11 verify-email):** can import `sendEmailVerificationEmail` today. Reuses the `password_reset_tokens` table (type column) created in AUTH-10's migration — sequential ordering preserved.
- **Phase 111 Plan 01 (DNS/domain):** can execute in parallel/any order; domain-level tracking-disable is now a hard requirement surfaced by Plan 02's SDK inspection.
- **Phase 111 Plan 03 (live smoke):** blocked only on Plan 01 + Railway env injection, not on Plan 02.

## Self-Check

- [x] `vigil-core/src/services/email-service.ts` exists
- [x] `vigil-core/src/services/email-service.test.ts` exists
- [x] `.planning/phases/111-transactional-email-infrastructure-resend-dns/111-02-SUMMARY.md` exists (this file)
- [x] Task 1 commit `174afe5` in git log
- [x] Task 2 commit `226b6a9` in git log
- [x] `npx tsc --noEmit` clean
- [x] `npx tsx --test src/services/email-service.test.ts` 10/10 pass
- [x] Singleton smoke: `singleton ok`
- [x] Boot-without-key smoke: `{"status":"skipped_no_key"}` + no FATAL in boot log

---
*Phase: 111-transactional-email-infrastructure-resend-dns*
*Plan: 02*
*Completed: 2026-04-24*
