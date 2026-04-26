---
id: SEED-004
status: dormant
planted: 2026-04-26
planted_during: v3.6 milestone (Phase 113 UAT closeout)
trigger_when: A real user reports "I clicked the verify link but it says expired" OR Phase 113 verify-email volume in Resend dashboard exceeds ~50/day OR v3.7+ planning includes auth-flow UX hardening
scope: Small
---

# SEED-004: Differentiate verify-email error states (rotated vs expired vs rate-limited)

## Why This Matters

Phase 113 ships AUTH-11 with three locked decisions that interact in a way that
produces a confusing UX in legitimate user journeys:

- **D-19** (prefetch-safe gate) — Confirm button required; no mount-time POST.
- **D-13** (per-IP rate limit on `/v1/auth/verify-email`) — 5 POSTs per hour
  per IP, sliding window. Defense against token-guessing brute force; given
  256-bit token entropy, this is belt-and-suspenders.
- **D-21** (single-bucket error UI) — All 4xx and 5xx responses collapse into
  one error state in the PWA: "This link is no longer valid. Verification
  links expire after 24 hours and can only be used once." Prevents
  information leak about which failure mode occurred (correct security
  posture).

Empirically observed during Phase 113 UAT (2026-04-26):

**Failure mode 1 — Rotated token from Resend:** Each resend creates a new
token AND marks the prior tokens as `used_at = now()`. A user who clicks
Resend a few times, then opens an OLDER email, sees "no longer valid" — the
copy implies expiration even though the token is fine, just superseded.
Real-world scenario: user signs up, doesn't see email immediately, clicks
Resend, eventually opens both emails over the course of a few minutes,
clicks the older one. Bad first impression for an auth flow.

**Failure mode 2 — Rate-limited claim:** A user who fumbles the verify
process a few times (clicks an old email, retries with a new one, clicks
back to the old one out of confusion) can hit the 5/hr per-IP rate limit on
`/v1/auth/verify-email`. The 429 response also collapses into D-21's
single-bucket "no longer valid" copy. The user has no signal that they're
rate-limited and would benefit from waiting. They'll likely keep clicking
Resend (a separate endpoint with its own 3/hr limit) and burn that bucket
too — now they're double-locked-out and have no actionable next step.

**Failure mode 3 — Genuine expiration (24h+):** This is the only case the
copy is actually accurate for. But it's likely the rarest in practice.

In all three failure modes, the user sees the same message: "This link is no
longer valid. Verification links expire after 24 hours and can only be used
once." Click "Request a new link" → bounces them back to the resend flow,
which may itself be rate-limited.

## When to Surface

**Trigger:** Any of the following:

1. A real user reports the "I clicked the link but it says expired"
   pattern in Discord, support email, or G2-plugin feedback.
2. Phase 113 verify-email volume in Resend dashboard exceeds ~50 emails/day
   (volume threshold where edge cases compound).
3. v3.7+ milestone planning explicitly addresses auth-flow UX hardening.
4. Phase 110 / Phase 112 / Phase 113 / Phase 114 work surfaces a similar
   "single-bucket error UI is hiding a real problem" pattern.

**Practical:** Watch for support-thread or Discord messages mentioning
"verify email" + "expired" or "doesn't work". Each one is signal that
this seed is ripe.

## Scope Estimate

**Small** — surgical change to `vigil-pwa/src/pages/VerifyEmailPage.tsx` plus
a backend response envelope change. Both can ship in a single phase.

**The work (sketched):**

1. **Backend** (`vigil-core/src/routes/verify-email.ts`):
   - Keep D-21 single-bucket envelope at the API boundary (don't leak token
     state) BUT include a coarse-grained `reason` field that's safe to
     expose:
     - `"rate_limited"` for 429 responses (already differentiable from the
       status code, just needs the PWA to read it)
     - `"invalid_or_expired"` for 400 responses (covers
       invalid/expired/used/wrong-type — preserves info-leak protection)
   - Include `Retry-After` header on 429 (already present per current
     implementation).

2. **Frontend** (`vigil-pwa/src/pages/VerifyEmailPage.tsx`):
   - Branch the error state on response status:
     - `429` → "Too many attempts. Try again in {N} minutes." with the
       N derived from `Retry-After` header. NO "Request a new link"
       button (would just hit another rate limit).
     - `400` (current) → "This link is no longer valid. Verification
       links expire after 24 hours and can only be used once." +
       "Request a new link" button (current behavior).
   - Optional: differentiate "rotated" from "expired" with a query-param
     hint `?source=resend-N` where N is the resend serial number (server
     omits, client-side only). If user clicks an N-1 link after Resend
     N has fired, render "This link has been replaced by a newer
     verification email — check your inbox" + "Use latest" button. This
     is more involved; can be deferred even within this seed's scope.

3. **Tests:**
   - Add a test asserting 429 response triggers the "Too many attempts"
     branch (regression test for D-13 → D-21 separation).
   - Update existing AUTH-11-P-MOUNT-NO-FETCH adjacents.

**Risk:** None. The security contract (single-bucket info-leak prevention)
is preserved — `reason: "invalid_or_expired"` doesn't leak which sub-state
the token is in. The 429 reason is already inferrable from the status code,
so no new info is exposed.

## Breadcrumbs

- `vigil-pwa/src/pages/VerifyEmailPage.tsx:54-74` — `handleConfirm` is the
  single-bucket error site (line 68: `setState('error')` for any non-`ok`).
- `vigil-pwa/src/pages/VerifyEmailPage.tsx:123-144` — error-state JSX render
  with the "no longer valid" copy.
- `vigil-core/src/routes/verify-email.ts:34-73` — D-13 rate-limit harness
  (`takeSlot`, sliding window, 5/hr per-IP).
- `vigil-core/src/routes/verify-email.ts:93-148` — main route handler;
  429 at line 99-102, 400 at line 144-148.
- `.planning/phases/113-verify-email-on-signup/113-HUMAN-UAT.md` §SC#3
  Notable findings (1)(2)(3) — empirical evidence of the friction observed
  during Phase 113 UAT closeout.
- Phase 113 CONTEXT.md D-13, D-19, D-21 — the three decisions that interact.

## Notes

- The D-21 single-bucket envelope is correct security-wise — preserves
  info-leak protection at the API. This seed proposes a small, safe widening:
  add a coarse `reason` enum with two values (`"rate_limited"` vs
  `"invalid_or_expired"`) that doesn't subdivide the second case (so the
  brute-force attacker still can't distinguish "this hash isn't in the DB"
  from "this hash is in the DB but used"). Net: +1 bit of info to the user
  (rate-limited vs not), 0 bits to the attacker.
- Test-user cleanup (`upper@case.com` id=3, `test+phase104@local.test` id=44)
  was also surfaced during Phase 113 UAT but is unrelated to this seed —
  capture separately as a todo if it becomes annoying.
- This is the second auth-flow-UX seed in the file (DMARC ramp is
  SEED-003). v3.7 may end up grouping these into an "auth UX hardening"
  mini-milestone; that's the natural pairing.
