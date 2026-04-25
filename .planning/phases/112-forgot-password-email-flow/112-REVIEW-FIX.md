---
phase: 112-forgot-password-email-flow
fixed_at: 2026-04-25T22:59:25Z
review_path: .planning/phases/112-forgot-password-email-flow/112-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 1
skipped: 1
status: partial
---

# Phase 112: Code Review Fix Report

**Fixed at:** 2026-04-25T22:59:25Z
**Source review:** `.planning/phases/112-forgot-password-email-flow/112-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 2
- Fixed: 1
- Skipped: 1

## Fixed Issues

### WR-01: Hit-path response time depends on Resend round-trip — D-05 timing parity weakens in production

**Files modified:** `vigil-core/src/routes/forgot-password.ts`
**Commit:** `6038ee3`
**Applied fix:**

Replaced the awaited `sendEmailFn(user.email, resetUrl)` at line 213 with a
fire-and-forget invocation that catches errors via `console.error` to suppress
Node's unhandledRejection. The send is invoked synchronously (so test spies
still record the call before the response returns) but the returned promise is
intentionally not awaited.

Rationale:
- D-05 wall-clock parity is now bounded by local ops only (argon2 + DB writes)
  on BOTH paths. Resend network latency (50-300ms typical) no longer stacks on
  the hit path alone, which was producing the 1.83x live-smoke ratio.
- D-03 invariant preserved: response shape never reflects send outcome.
- Errors are still observable via `captureException` inside `email-service`
  (as documented in the prior comment block); the `.catch()` here is purely a
  Node unhandledRejection guard.

Verification:
- Tier 1 (re-read modified section): pass — fix present, surrounding code intact.
- Tier 2 (`npx tsc --noEmit`): pass — no TypeScript errors anywhere in `vigil-core`.
- Tier 3 (test suite): `npx tsx --test src/routes/forgot-password.test.ts`
  ran with 3 pass / 0 fail / 7 skipped (DB-dependent tests skipped because
  `DATABASE_URL` is not set in this shell session). The 3 non-DB tests
  (unknown email, invalid JSON, missing email field) all pass. DB-dependent
  tests including Test 3 (timing parity) and Tests 4/6/7/8 (spy-call counts)
  were not exercised here, but the change preserves both contracts:
  - Spy-call counting: `mock.fn` records calls at invocation time, not
    promise-resolution time, so `sendSpy.mock.callCount()` increments
    synchronously with the un-awaited call.
  - Timing parity: hit path is now strictly faster than before, never slower
    (Test 3 asserts `<= 1.5x` ratio, which the change can only improve).

Note: Test 3 (timing parity) and live smoke ratio should be re-validated on
prod after deploy. Update CONTEXT D-05 / RESEARCH §A2 to document the
fire-and-forget shift if accepted.

## Skipped Issues

### WR-02: `x-forwarded-for` is trusted without verifying the request came through Railway's proxy

**Files:** `vigil-core/src/routes/forgot-password.ts:127`,
`vigil-core/src/routes/reset-password.ts:109-110`

**Reason:** Judgment call requiring deployment-topology decision. Skipped
deliberately per phase-context guidance.

The reviewer offered two fix options:
- **(a)** Read the rightmost segment of `x-forwarded-for` (last trusted hop) —
  works behind Railway and any single trusted proxy; FAILS behind multi-hop
  CDN topologies.
- **(b)** Trust a configurable hop count via env (e.g., `TRUSTED_PROXY_HOPS=1`)
  or a `TRUST_PROXY=1` flag — more flexible, but introduces new config
  surface that has to be set correctly per-environment.

Neither is unambiguously correct without first pinning the deployment topology
that Phase 107.2 (cross-machine Tailscale dev-access) introduces. Today's
Railway-only ingress mitigates the issue in production; Phase 107.2's planned
direct-bind dev mode is the trigger that turns this from theoretical to
actionable. Picking the wrong fix now risks either:
1. Locking in option (a) before knowing whether Cloudflare or another
   multi-hop CDN will sit in front of Railway later (which would silently
   re-introduce the spoofable bucket).
2. Locking in option (b) with a default that's wrong for one of the two known
   environments (Railway prod vs. local/Tailscale dev).

**Recommendation:** Pin a CONTEXT entry on the deployment topology
(single trusted proxy vs. multi-hop, dev-mode bind shape, expected forwarding
chain) before implementing the fix. Once the topology is stated, the choice
between (a), (b), or "fall back to actual TCP peer when no trusted proxy is
configured" becomes deterministic. The fix should land alongside Phase 107.2
work, not as a standalone code-review patch.

**Original issue summary:** Both rate limiters key on the leftmost segment of
`x-forwarded-for`, which is client-supplied. Mitigated today only because
Railway's proxy is the sole ingress; spoofable the moment any direct-bind
deployment shape exists. For password-reset specifically, token entropy
(256 bits) makes the spoofable per-IP cap academic, but Phase 113 reuses the
same handler shape for `email_verify` and may pin shorter-lived assumptions.

---

_Fixed: 2026-04-25T22:59:25Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
