---
phase: 112
plan: 05
status: pending
source: AUTH-10
created: 2026-04-25
started:
updated: 2026-04-25
test_email: jamesonmorrill1@gmail.com
test_environment: production (Railway + Resend + custom domains)
---

# Phase 112 — AUTH-10 Manual UAT Checklist

End-to-end live verification of the forgot-password flow against production
infrastructure. Run AFTER Plans 01-04 are deployed to Railway and
`vigil-core/scripts/smoke-test-forgot-password.ts` passes its API-leg checks.

This file is a lab notebook — fill in observed values during the run, then
commit when sign-off is complete.

## Current Test

Pending kickoff. Pre-flight first; then SC#1 → SC#2 → SC#3 → SC#4 → SC#5 in order.

## Pre-flight

- [ ] Railway main branch deployed with Plans 01-04 (check Railway dashboard "Last deployed" timestamp; expect a build triggered after `15aed42` or later)
- [ ] `curl -s https://api.vigilhub.io/v1/health` returns 200
- [ ] Migration 0016 applied on prod — verified via Railway logs OR by querying via a Railway shell `\d password_reset_tokens` (expect 7 columns + 3 indexes + CHECK constraint on `type`)
- [ ] User account `jamesonmorrill1@gmail.com` exists in prod DB (the test target)
- [ ] Test Gmail inbox open in a tab; spam folder verified clear of prior `noreply@vigilhub.io` test emails (or note the count to filter the new one)
- [ ] **Two browser sessions ready:** Tab A logged into Vigil PWA (`https://app.vigilhub.io` with valid JWT) — this is the "device that will get kicked out by SC#4". Tab B in incognito mode (or a different browser) for the actual reset flow.
- [ ] Tab A's `vigil_jwt` captured to clipboard / scratch buffer for the SC#4 curl probe (devtools → Application → Session Storage → `vigil_jwt`)

## SC#1 — Enumeration safety: identical 200 + approximate timing

> ROADMAP: "Submitting a forgot-password request for an unknown email returns
> the same 200 response body and approximate response time as a known email —
> no enumeration possible"

### Procedure

1. Run the smoke script with both a known and an unknown email:
   ```bash
   cd vigil-core && npx tsx scripts/smoke-test-forgot-password.ts \
     jamesonmorrill1@gmail.com \
     definitely-not-a-real-vigil-user-9876543@example.com
   ```
2. Capture full stdout in this checklist.

### Expected

- HIT: `status=200 duration=<X>ms body={"ok":true,"message":"If your account exists, a reset link has been sent."}`
- MISS: `status=200 duration=<Y>ms body={"ok":true,"message":"If your account exists, a reset link has been sent."}`
- Body byte-equal across both calls
- Timing ratio `max/min < 2.0x` (lenient over the wire — in-process tests asserted < 1.5x in Plan 02 Test 3)
- Reset-password validation probes: 400 + `{"error":"Invalid or expired token"}` (invalid token), 400 + length error (weak password)
- Final exit code 0; "API leg PASSED" line printed

### Observed

- Date/time of run: `_______________`
- Hit duration: `_______ ms`
- Miss duration: `_______ ms`
- Ratio: `_______ x`
- Body byte-match (hit vs miss): ☐ yes ☐ no
- Reset-password invalid-token probe status: `_______` (must be 400)
- Reset-password weak-password probe status: `_______` (must be 400)
- Script exit code: `_______` (must be 0)

**Result:** pending

Sign-off: ☐ PASS ☐ FAIL

---

## SC#2 — Email delivery + click + reset + redirect to login (NO auto-login)

> ROADMAP: "The user receives an email with a reset link; clicking it allows
> setting a new password; the page then redirects to the login page (no
> auto-login, no JWT in the redirect URL)"

### Procedure

1. After SC#1 completes, switch to the Gmail inbox tab.
2. Refresh — wait up to 60 seconds for the email from `noreply@vigilhub.io` with subject "Reset your password".
3. Open the email. Note the Resend message id from the email headers (Show Original then grep `X-Resend-` or check Resend dashboard at https://resend.com/emails).
4. Verify the email body contains a link to `https://app.vigilhub.io/auth/reset?token=<~43-char-base64url>` — the link must NOT be wrapped by a Resend tracking redirect (Phase 111 disabled click_tracking + open_tracking).
5. Click the link. Browser opens Tab B (or use Cmd-click to open in new tab in a different profile).
6. ResetPasswordPage renders with the password input form (NOT the "This link is no longer valid" UX).
7. Enter a NEW password (e.g., `BrandNewPass2026!` — must be at least 12 chars). Click "Reset password".
8. Expected: redirected to `https://app.vigilhub.io/auth?reason=password_reset`. Green banner: "Password reset successfully. Please sign in with your new password."
9. URL bar shows `?reason=password_reset` — does NOT contain `token=`, `jwt=`, or any other credential.
10. Open browser devtools → Application → Local Storage / Session Storage. Verify `vigil_jwt` is EMPTY (no auto-login). Cookie storage clean.
11. Log in via the form using the NEW password. Should succeed and redirect to `/`.
12. Sign out. Try logging in again with the OLD password — should fail with "Invalid email or password. Please try again."

### Apple Mail pre-fetch defense — bonus check

13. Open the Gmail iOS app on iPhone (or Apple Mail on macOS) and let it preview the same email — but DO NOT click the link from there. Confirm Tab B's reset still works (token NOT burned by mail-client preview). This is the user-visible test of D-18 (form-submit gate) + Phase 111 tracking-disable working in concert.
    - If the mail client somehow burned the token, Tab B would have already shown the "This link is no longer valid" UX in step 6 — flag and capture the failure mode here.

### Expected

- Email arrives in Inbox (not Spam) within 60 seconds
- Reset link is verbatim `app.vigilhub.io/auth/reset?token=<base64url>` — no tracking wrapper
- Apple Mail preview does NOT consume the token
- Reset form submission redirects to `/auth?reason=password_reset` with green banner
- No JWT or credential exposed in URL or storage post-reset
- Login with new password succeeds
- Login with old password fails with generic "Invalid email or password"

### Observed

- Resend message id: `_______________`
- Email arrived in: ☐ Inbox ☐ Spam (note: should be Inbox per Phase 111 deliverability work)
- Time email arrived: `_______________` (should be < 60s after smoke-test run)
- Reset link URL shape: `_______________` (paste verbatim — first ~40 chars enough)
- Apple Mail preview consumed token? ☐ no (PASS) ☐ yes (FAIL — D-18 / Phase 111 tracking-disable regression)
- Browser Tab B URL after reset: `_______________` (must be `/auth?reason=password_reset` exactly)
- vigil_jwt in storage post-reset: `_______________` (must be empty)
- Login with NEW password: ☐ succeeded ☐ failed
- Login with OLD password: ☐ failed (expected) ☐ succeeded (REGRESSION)

**Result:** pending

Sign-off: ☐ PASS ☐ FAIL

---

## SC#3 — Single-use enforcement (atomic claim)

> ROADMAP: "Using the same reset link a second time returns 400 'Invalid or
> expired token' — single-use enforcement via atomic UPDATE RETURNING used_at"

### Procedure

1. With the reset link still in clipboard from SC#2, paste it back into Tab B's address bar OR open it again from the email.
2. ResetPasswordPage renders (token-present case).
3. Enter ANY valid password (e.g., `AnotherDifferentPass2026!`). Click "Reset password".
4. Expected: form unmounts, "This link is no longer valid" UX renders.
5. Verify D-20 verbatim copy:
   - Heading: "This link is no longer valid"
   - Body: "Reset links expire after 1 hour and can only be used once."
   - Primary button: "Request a new link"
   - Secondary link: "Back to login"
6. Click "Request a new link" → should navigate to `/auth/forgot`.
7. Open devtools Network tab; capture the second submit's response. Expect:
   - Status: 400
   - Body: `{"error":"Invalid or expired token"}`

### Expected

- Second submit returns 400 with verbatim error body
- D-20 single-bucket UX renders (no information leak about why the token failed)
- "Request a new link" CTA navigates to `/auth/forgot`

### Observed

- Second submit response status (devtools Network tab): `_______________` (must be 400)
- Response body: `_______________` (must be `{"error":"Invalid or expired token"}`)
- D-20 verbatim copy match (all 4 strings): ☐ yes ☐ no
- "Request a new link" navigates to /auth/forgot: ☐ yes ☐ no

**Result:** pending

Sign-off: ☐ PASS ☐ FAIL

---

## SC#4 — Pre-reset JWT invalidation (cross-device gate via Phase 110)

> ROADMAP: "A JWT issued before the password reset is rejected with 401 on
> subsequent API calls — password_changed_at is updated on reset success"

### Procedure

1. **Tab A** (the "device that will get kicked out") MUST have been logged in BEFORE SC#2's reset and the OLD JWT must have been captured to a scratch buffer during pre-flight. Verify the OLD JWT is non-empty.
2. After SC#2 + SC#3 complete, switch to Tab A.
3. Trigger any authenticated API call. Easiest: refresh the page (App.tsx mount calls `/v1/me` per identifyUser).
4. Expected: vigilFetch's 401 'Session expired' interceptor (Phase 110 D-19) fires; full-page navigation to `/auth?reason=session_expired`.
5. Verify the original Phase 110 banner renders: "Your session expired. Please sign in again." (regression check — Plan 04 must NOT have broken this).
6. Manually verify the gate at the API level using the captured OLD JWT:
   ```bash
   OLD_JWT="<paste captured JWT from pre-flight>"
   curl -s -H "Authorization: Bearer $OLD_JWT" https://api.vigilhub.io/v1/me
   # Expect: {"error":"Session expired"} (status 401)
   ```
7. **Redact the OLD JWT from this UAT log before commit** — the JWT is cryptographically dead post-reset (Phase 110 iat-gate fires) but committing it to git is unnecessary noise. Replace with `<redacted — invalid post-reset>` in the Observed block below.

### Expected

- Tab A's next authenticated request returns 401 with `{"error":"Session expired"}` body
- vigilFetch dispatcher force-navigates Tab A to `/auth?reason=session_expired`
- AuthPage renders the existing Phase 110 banner verbatim
- Curl on the OLD JWT against `/v1/me` returns 401 + `{"error":"Session expired"}`

### Observed

- Tab A behavior on next API call: ☐ navigated to /auth?reason=session_expired (PASS) ☐ stayed on dashboard (REGRESSION)
- Banner copy on landed /auth: ☐ "Your session expired. Please sign in again." (PASS) ☐ other
- Curl on old JWT response status: `_______________` (must be 401)
- Curl on old JWT response body: `_______________` (must be `{"error":"Session expired"}`)
- OLD JWT redacted from this file before commit: ☐ yes ☐ no (must be yes)

**Result:** pending

Sign-off: ☐ PASS ☐ FAIL

---

## SC#5 — Rate-limit, token-hash storage, and forgot-password miss path

> ROADMAP: "The password_reset_tokens table stores token_hash (SHA-256), not
> the raw token; the raw token appears only in the email URL and never in the
> DB. Rate limit fires after 5 requests per hour per IP/email; forgot-password
> for an unknown email returns 200 (no enumeration leak)."

This SC bundles three live observations: token-hash storage (the load-bearing
SC#5 from ROADMAP), rate-limit observation (per D-04 / D-13), and a final
no-enumeration miss-path probe distinct from SC#1's smoke-script run.

### Procedure A — token_hash storage (load-bearing)

1. From Railway shell or psql against the prod DB:
   ```sql
   SELECT id, user_id, length(token_hash) AS hash_len, used_at, expires_at, created_at
   FROM password_reset_tokens
   WHERE created_at > now() - interval '30 minutes'
   ORDER BY created_at DESC
   LIMIT 5;
   ```
2. Verify the most recent row(s):
   - `length(token_hash) = 64` (SHA-256 hex)
   - `token_hash` matches `^[a-f0-9]{64}$` (lowercase hex; do NOT contain `-_=` which would suggest base64url leakage)
   - `used_at` is non-NULL on the SC#2 row (token was claimed); the SC#3 second-click should NOT have produced a new row (claim failed without insert)
3. Re-paste the rawToken from SC#2 (the `?token=...` query value before the link was burned) and compute its SHA-256 locally:
   ```bash
   echo -n "<rawToken>" | shasum -a 256 | awk '{print $1}'
   ```
   Compare against the `token_hash` column from step 1 — must match byte-for-byte.
4. Search every column for any substring of the rawToken — expect 0 hits:
   ```sql
   SELECT * FROM password_reset_tokens
   WHERE token_hash LIKE '%' || substr('<first-12-chars-of-rawToken>', 1, 12) || '%';
   ```
   Expect 0 rows. (Coincidental hex/base64url overlap is theoretically possible but vanishingly improbable.)

### Procedure B — rate limit (D-04)

5. Make 6 forgot-password requests in rapid succession against the same IP:
   ```bash
   for i in 1 2 3 4 5 6; do
     curl -s -w "\n[%{http_code}]\n" -X POST https://api.vigilhub.io/v1/auth/forgot-password \
       -H "Content-Type: application/json" \
       -d "{\"email\":\"jamesonmorrill1+ratetest$i@gmail.com\"}"
     echo ""
   done
   ```
6. Expected: all 6 return status 200 with the enum-safe body — the rate limit hides under the same body shape per CONTEXT D-04 ("don't reveal that the per-email or per-IP limit fired"). The 6th request's wall-clock duration should be MEASURABLY FASTER than the first because the rate-limited path short-circuits before argon2.
7. Sanity check: a 7th request from the same IP should also short-circuit (no new email dispatched). Verify in Resend dashboard that ONLY 1 message was actually sent (the legitimate SC#1/SC#2 email) — the +ratetest variants do NOT exist in the user table, so the miss-path runs but the rate limit prevents the dummy-argon2 budget on requests 6 and 7.

### Procedure C — forgot-password miss path (no enumeration leak)

8. Run a dedicated miss probe with a clearly non-existent email (different from SC#1's MISS so this exercises a fresh state):
   ```bash
   curl -s -w "\n[%{http_code}]\n" -X POST https://api.vigilhub.io/v1/auth/forgot-password \
     -H "Content-Type: application/json" \
     -d '{"email":"absolutely-no-such-user-2026@example.invalid"}'
   ```
9. Expected: status 200, body `{"ok":true,"message":"If your account exists, a reset link has been sent."}` — byte-identical to SC#2's hit response.

### Expected (combined)

- token_hash is 64-char lowercase hex; matches local SHA-256 of rawToken
- Raw token does NOT appear anywhere in the password_reset_tokens row
- 6th rapid-fire forgot-password request returns 200 enum-safe (rate limit silent per D-04)
- Resend dashboard shows ONLY 1 actual message dispatched across the 6 rate-test requests
- Independent miss probe (Procedure C) returns 200 enum-safe — no enumeration leak

### Observed

- Most recent row's token_hash length: `_______________` (must be 64)
- Most recent row's token_hash regex match (`^[a-f0-9]{64}$`): ☐ yes ☐ no
- Most recent row's used_at non-NULL post-SC#2: ☐ yes ☐ no
- Local SHA-256 of rawToken: `_______________`
- Match against DB row: ☐ yes ☐ no
- Raw token substring search: ☐ 0 rows (PASS) ☐ 1 or more rows (FAIL)
- Rate-limit 6th request status: `_______________` (must be 200)
- Resend dashboard message count from rate test: `_______________` (must be 0 — the +ratetest emails are misses)
- Procedure C miss probe status: `_______________` (must be 200)
- Procedure C miss probe body: `_______________` (must be the SC#2-identical enum-safe body)

**Result:** pending

Sign-off: ☐ PASS ☐ FAIL

---

## Summary

- total: 5
- passed: 0
- failed: 0
- pending: 5

UAT executed by: `_______________`
Date / time started: `_______________`
Date / time completed: `_______________`
Resend message id (SC#2 legitimate send): `_______________`
Notes / anomalies: `_______________`

If any SC FAILED — capture the failure mode here, link to a follow-up plan or
gap-closure issue, and DO NOT proceed to `/gsd-verify-work`:

- Failure detail: `_______________`
- Follow-up plan: `_______________`

## Sign-off

All 5 SCs PASS — phase ready for `/gsd-verify-work`:

- [ ] SC#1 PASS — enumeration safety (smoke script API leg)
- [ ] SC#2 PASS — email delivery + click + reset + redirect (no auto-login, no token in URL post-redirect)
- [ ] SC#3 PASS — single-use enforcement (D-20 invalid-token UX on second click)
- [ ] SC#4 PASS — pre-reset JWT invalidation (Phase 110 iat-gate fires across devices)
- [ ] SC#5 PASS — token_hash 64-char hex; raw token never in DB; rate limit silent + miss path enum-safe

Sign-off: ☐ PASS ☐ FAIL

## Gaps

- Apple Mail preview test (SC#2 step 13) is a bonus check; the structural defense is in code (D-18 form-submit gate + Phase 111 tracking-disable). If iOS Mail client behavior changes upstream, the bonus check may need a follow-up plan.
- Procedure B "Resend dashboard message count" depends on Resend's API rate of update — give it 60s before reading the count.
- The OLD JWT capture in SC#4 must be redacted before commit. If it's accidentally committed, the JWT is already cryptographically invalid post-reset (Phase 110 gate), but the principle still applies: never ship secrets to git, even dead ones.
