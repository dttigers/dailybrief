---
phase: 113
requirement: AUTH-11
status: partial
source:
  - 113-VALIDATION.md
  - 113-05-PLAN.md
created: 2026-04-26
tested_by: jamesonmorrill1@gmail.com
deploy: 44cb338
deploy_time: 2026-04-26T17:02:03Z
tested_on: <date — fill in when UAT is executed>
---

# Phase 113 — Human UAT (AUTH-11)

End-to-end live verification of the verify-email-on-signup flow against
production infrastructure. Run AFTER Plans 01-04 are deployed to Railway and
`vigil-core/scripts/smoke-test-verify-email.ts` passes its smoke-test run.

This file is a lab notebook — fill in observed values during the run, tick each
checkbox, and update frontmatter `status: verified` when sign-off is complete.

---

## Pre-flight

- [ ] Plans 01-04 merged to main and pushed to Railway.
- [ ] Railway auto-deploy completed successfully (check Railway dashboard "Last deployed" timestamp).
- [ ] `db:migrate-prod` ran on deploy — check Railway deploy logs for "0017_users_email_verified_at" applied OR idempotent no-op message.
- [ ] `curl -s https://api.vigilhub.io/v1/health` returns 200.
- [ ] PWA cache cleared / hard reload at https://app.vigilhub.io to pick up new bundle.
- [ ] Smoke test passed: `VIGIL_API_BASE=https://api.vigilhub.io DATABASE_URL=$RAILWAY_DB_URL npm run smoke-test:verify-email` exits 0 with "ALL CHECKS PASSED".

---

## SC#1 — Verification email arrives in real Gmail inbox within 60s

Source: VALIDATION.md Manual-Only row 1 / ROADMAP SC#1.

> Verifies that: Resend transports the verify email, DKIM/DMARC holds, the
> email is not spam-filtered, and the CTA link shape is correct (no tracking
> wrapper per Phase 111 click_tracking: false).

### Steps

1. Open https://app.vigilhub.io/auth in a private/incognito window.
2. Click "Don't have an account? Sign up".
3. Register with a fresh email. Options:
   - If the allowlist supports it: use `jamesonmorrill1+verify-uat-{N}@gmail.com`
     where {N} is a unique number (Gmail plus-addressing routes to the main inbox).
     NOTE: VIGIL_ALLOWED_EMAILS must include the FULL plus-address — if not, add it
     to Railway env before this step.
   - Alternatively: trigger a fresh resend via SC#5 using the existing seed user
     (no new allowlist entry needed), then check inbox for the resend email.
4. Submit. Note the exact submit time.
5. Within 60 seconds, check the Gmail inbox at jamesonmorrill1@gmail.com.

### Assertions

- [ ] Email arrived within 60s of register submit.
- [ ] From: `noreply@vigilhub.io` (or the configured Resend sender domain).
- [ ] Subject: "Verify your Vigil email".
- [ ] Email is in Inbox — NOT in Spam folder.
- [ ] Body contains a teal CTA button labeled "Verify email".
- [ ] Link href is `https://app.vigilhub.io/auth/verify?token=<base64url>` — NOT wrapped
      by a Resend tracking redirect (confirms Phase 111 `click_tracking: false`).
- [ ] The rendered link text and the href target are identical (no deceptive redirect).

### Observed

- Date/time of run: 
- Email arrived at: 
- From address: 
- Subject: 
- In Inbox (not Spam): [ ] yes / [ ] no
- CTA button label: 
- Link href (first 60 chars): 
- click_tracking absent (no resend.com in href): [ ] yes / [ ] no

**Result:** [ ] PASS  [ ] FAIL  [ ] DEFERRED

---

## SC#2 — Non-blocking verification banner in PWA Settings

Source: ROADMAP SC#2.

> Verifies that: the banner renders only on /settings (D-22), is non-dismissible
> (D-24), shows the correct copy + Resend button (D-23), and does NOT block any
> other Settings action.

### Steps

1. With the unverified test user from SC#1 logged in, navigate to https://app.vigilhub.io/settings.
2. Scroll to the top of the page.
3. Inspect the banner element (devtools if needed — check background color).
4. Navigate to other pages (/thoughts, /work-orders, etc.) and confirm no banner.
5. Return to /settings — banner should still be present.

### Assertions

- [ ] Banner renders at the TOP of /settings, above all other content sections.
- [ ] Banner background is amber/yellow (warning tone — not red/error).
- [ ] Banner text: "Verify your email — we sent a link to {email}. Click it to confirm."
      with the actual test email address interpolated.
- [ ] "Resend" button is visible inside the banner.
- [ ] No close (×) or dismiss button on the banner (D-24).
- [ ] All other Settings sections (change-password, Google Connect, schedules, etc.)
      load and function normally — the banner does NOT block any action.
- [ ] Banner does NOT appear on /thoughts, /work-orders, or any other page (D-22).

### Observed

- Banner renders at top of /settings: [ ] yes / [ ] no
- Banner background color observed: 
- Banner copy verbatim: 
- Resend button visible: [ ] yes / [ ] no
- Dismiss/× control: [ ] none (correct) / [ ] present (BUG)
- Other Settings sections functional: [ ] yes / [ ] no
- Banner on other pages: [ ] none (correct) / [ ] present (BUG — which page: )

**Result:** [ ] PASS  [ ] FAIL  [ ] DEFERRED

---

## SC#3 — Verify link clears the banner; no JWT in redirect URL

Source: ROADMAP SC#3 + VALIDATION.md Manual-Only row 3.

> Verifies that: the verify page requires a Confirm click (not mount-time fetch),
> success swaps in-place (no redirect, no URL change), and a Settings reload
> shows the banner gone (D-28 fresh /me call on mount).

### Steps

1. From the Gmail inbox, click the "Verify email" CTA link.
2. Browser opens `https://app.vigilhub.io/auth/verify?token=...`
3. Open devtools Network tab BEFORE clicking Confirm. Note: no POST should fire on mount.
4. Click "Confirm".
5. Observe the page response — do NOT close the tab.
6. In a SEPARATE browser tab, navigate to https://app.vigilhub.io/settings.

### Assertions

- [ ] Verify page renders with heading "Verify your email" + "Confirm" button on load
      (token-present state per D-19).
- [ ] Network tab shows NO POST to /v1/auth/verify-email on page mount — only on
      Confirm button click (prefetch-safe gate: D-19).
- [ ] After Confirm click: page swaps in-place to heading "Email verified" +
      body "You can close this tab, or" + "Go to app" link.
- [ ] URL bar AFTER the swap is STILL `/auth/verify?token=...` (no redirect, no URL
      change — D-20).
- [ ] No JWT, token, or credential appears anywhere in the post-Confirm URL.
- [ ] In the SEPARATE /settings tab, the verify banner is GONE after reload.
      (The fresh /me call returns non-null emailVerifiedAt — D-28.)

### Observed

- Verify page initial render (before Confirm): 
- POST fires on mount (should be NO): [ ] no (correct) / [ ] yes (BUG)
- Post-Confirm heading: 
- URL bar after Confirm: 
- JWT/token in URL after Confirm: [ ] none (correct) / [ ] present (BUG)
- /settings banner after reload in separate tab: [ ] gone (correct) / [ ] still there (BUG)

**Result:** [ ] PASS  [ ] FAIL  [ ] DEFERRED

---

## SC#4 — Pre-existing (seed) user grandfathered by 0017 migration (no lockout)

Source: ROADMAP SC#4 + VALIDATION.md Manual-Only row 4.

> Verifies that: the D-02 backfill ran on Railway prod, setting email_verified_at
> = created_at for all pre-existing users, so no existing user sees the banner
> or is locked out post-deploy.

### Steps

1. Connect to Railway prod Postgres. Get `DATABASE_PUBLIC_URL` from the Railway
   dashboard (Postgres service → Variables → `DATABASE_PUBLIC_URL`). The internal
   `DATABASE_URL` (`*.railway.internal`) only resolves inside Railway's network.
2. Run the **lockout audit** — the load-bearing assertion (every existing user
   has a non-null `email_verified_at`):
   ```bash
   psql "$RAILWAY_DB_URL" -c "
     SELECT
       COUNT(*) AS total_users,
       COUNT(email_verified_at) AS verified_users,
       COUNT(*) FILTER (WHERE email_verified_at IS NULL) AS unverified
     FROM users;
   "
   ```
3. Run the **backfill-equality audit** — verifies the UPDATE SET
   `email_verified_at = created_at` ran (sampling non-seed users so the
   smoke-test doesn't pollute results; smoke runs against the seed user and
   bumps then restores its timestamp, but if a prior smoke ran without the
   restore patch, the seed user may show `backfilled=f` even though backfill
   succeeded). Pick any 5 users that have NEVER been touched by the smoke:
   ```bash
   psql "$RAILWAY_DB_URL" -c "
     SELECT id, email, (email_verified_at = created_at) AS backfilled
     FROM users
     WHERE id != 1
     ORDER BY id
     LIMIT 5;
   "
   ```
4. As the seed user (jamesonmorrill1@gmail.com), navigate to
   https://app.vigilhub.io/settings (log in fresh if needed).

### Assertions

- [x] psql audit 1: `unverified = 0` AND `verified_users = total_users` —
      the load-bearing SC#4 assertion (no user can be locked out).
- [x] psql audit 2: ALL sampled non-seed users return `backfilled = t` —
      proves the D-02 `UPDATE … SET email_verified_at = created_at` UPDATE ran.
      (3 of 3 eligible non-seed users; LIMIT 5 returned all rows since DB has fewer than 5 non-seed users post-cleanup.)
- [x] /settings as the seed user: verify banner does NOT appear (emailVerifiedAt
      is non-null → banner condition is false).
- [x] Login as the seed user works normally (no AUTH-11 blocker).

### Observed

- Run timestamp: 2026-04-26T17:15:00Z (approx — psql ran shortly after deploy `44cb338` settled)
- total_users: 4
- verified_users: 4
- unverified (must be 0): 0
- non-seed sample backfilled = t for ALL: [x] yes — 3 of 3 non-seed users (ids 3, 44, 45) returned `backfilled = t`. DB has fewer than 5 non-seed users due to prior test-user cleanup (Phase 102 case-folding + Phase 104 work); LIMIT 5 returned all eligible rows.
- Sampled non-seed users:
  - id=3 `upper@case.com` — backfilled=t (Phase 102 case-folding artifact)
  - id=44 `test+phase104@local.test` — backfilled=t (Phase 104 artifact)
  - id=45 `jameson.morrill@icloud.com` — backfilled=t (real iCloud account)
- /settings banner for seed user: [x] absent (correct) — verified 2026-04-26 in browser; navigated explicitly to /settings after the post-login /thoughts redirect
- Login works normally: [x] yes — seed user logged in, post-login redirect to /thoughts (Phase 50/63 default), navigation to /settings worked, all sections rendered

**Result:** [x] PASS  [ ] FAIL  [ ] DEFERRED

> **Why two audits?** The load-bearing requirement is "no user is locked out"
> (audit 1). Audit 2 is the supporting evidence that the specific D-02
> `email_verified_at = created_at` semantics ran (vs. e.g. someone setting
> everything to `now()` which would also satisfy audit 1 but break the
> grandfathering intent). The seed user is excluded from audit 2 because the
> smoke-test mutates+restores its timestamp; under the original (pre-restore)
> smoke implementation, prior runs may have left `email_verified_at != created_at`
> for the seed user even though backfill worked. The restore patch shipped
> 2026-04-26 fixes this going forward.

---

## SC#5 — Resend rate limit: 429 after 3 requests per hour per user

Source: ROADMAP SC#5.

> Verifies that: D-16 (3/hr per userId rate limit) fires on the 4th Resend click
> within an hour window, returning 429 with the inline error state in the PWA
> banner (D-25 rate-limited terminal state).

### Steps

Use a freshly-unverified user. Options:
- The test user from SC#1 (if still unverified — i.e., Confirm was not clicked yet).
- OR temporarily null the seed user's email_verified_at via psql for testing:
  ```sql
  UPDATE users SET email_verified_at = NULL WHERE email = 'jamesonmorrill1@gmail.com';
  -- Restore after testing:
  UPDATE users SET email_verified_at = created_at WHERE email = 'jamesonmorrill1@gmail.com';
  ```

1. As the unverified user, navigate to https://app.vigilhub.io/settings.
2. Open devtools Network tab.
3. Click "Resend". Wait for it to return to idle (10s Sent confirmation window + timer).
4. Click "Resend" a second time. Wait for idle.
5. Click "Resend" a third time. Wait for idle.
6. Click "Resend" a fourth time. Observe.

### Assertions

- [ ] 1st click: button cycles "Resend" → "Sending…" → "Sent! Check your inbox."
      → (after ~10s) → "Resend". Network tab: POST /v1/auth/resend-verification returns 200.
- [ ] 2nd click: same lifecycle as 1st click. POST returns 200.
- [ ] 3rd click: same lifecycle as 1st click. POST returns 200.
- [ ] 4th click: POST /v1/auth/resend-verification returns 429.
      Inline error text "You've requested too many. Try again later." renders next to button.
      Resend button disappears (rate-limited terminal state until next page mount — D-25).
- [ ] Network tab 4th POST: status 429 with `Retry-After` response header present.
- [ ] No 5th token email arrives in inbox (rate limit suppressed the send).

### Observed

- 1st click result: 
- 2nd click result: 
- 3rd click result: 
- 4th click status (Network tab): 
- Retry-After header on 4th POST: [ ] present / [ ] absent
- Inline error text rendered: 
- Resend button state after 429: 

**Result:** [ ] PASS  [ ] FAIL  [ ] DEFERRED

---

## Apple Mail Prefetch — Token NOT burned by mail-client preview (D-19)

Source: VALIDATION.md Manual-Only row 2 / T-113-05.

> Verifies that: the Confirm-button gate (D-19) prevents Apple Mail Privacy
> Protection (iOS 15.4+ / macOS 12.3+) from burning the token via its
> background link prefetch. If this passes, the token is still claimable
> from a desktop browser after Apple Mail fetches the page silently.

### Steps

1. Send a fresh verify email (register a new allowlisted user OR use the Resend
   button as the unverified seed user — the email must land in a mailbox also
   configured in Apple Mail on iOS or macOS).
2. Open the email in Apple Mail on iOS or macOS. DO NOT tap or click the link.
   Wait at least 30 seconds (Apple Mail Privacy Protection fetches links silently
   within this window — it renders the VerifyEmailPage but must NOT POST to
   /v1/auth/verify-email because there is no Confirm click).
3. Open the SAME email on a desktop browser via gmail.com or mail.google.com.
4. Click the "Verify email" link from the desktop browser.
5. On the desktop verify page, click "Confirm".

### Assertions

- [ ] Desktop verify page renders the "Verify your email" heading + Confirm button
      (token NOT already burned by Apple Mail prefetch).
- [ ] Clicking Confirm on desktop succeeds: POST /v1/auth/verify-email returns 200,
      page swaps to "Email verified" state.
- [ ] /settings banner disappears after reload (token claimed successfully from desktop).
- [ ] If Apple Mail DID burn the token (BUG): desktop Confirm would return 400 →
      "This link is no longer valid" UX renders — flag this as a D-19 regression.

### Observed

- Apple Mail device: 
- Opened in Apple Mail at (time): 
- Waited before desktop click (seconds): 
- Desktop verify page render: [ ] "Verify your email" + Confirm (CORRECT) / [ ] "no longer valid" (BUG — prefetch burned token)
- Desktop Confirm result: 
- /settings banner after reload: [ ] gone (correct) / [ ] still present

**Result:** [ ] PASS  [ ] FAIL  [ ] DEFERRED
  Note if DEFERRED: Apple Mail not available on a device configured with this inbox.

---

## Sign-off

Complete after all above sections are filled in.

- [ ] SC#1 PASS — verification email arrives in Gmail inbox within 60s, correct sender/subject/CTA/link-shape.
- [ ] SC#2 PASS — non-blocking amber banner on /settings only, with Resend button, no dismiss control.
- [ ] SC#3 PASS — Confirm click required (no mount-time fetch), success swaps in-place, banner gone on reload.
- [ ] SC#4 PASS — Railway psql confirms seed user email_verified_at = created_at; no banner for seed user.
- [ ] SC#5 PASS — 4th Resend click within 1 hour returns 429 inline in PWA banner.
- [ ] Apple Mail prefetch PASS (or DEFERRED with rationale) — Confirm gate prevents token burn.
- [ ] No regressions in existing flows: login, change-password (Phase 110), forgot-password (Phase 112).
- [ ] Status updated to `verified` in this file's frontmatter.
- [ ] Phase 113 closure committed.

Any failures: open a fix branch, document the failure mode below, and re-execute the affected SC after the fix deploys.

Any deferred items: log to `.planning/phases/113-verify-email-on-signup/deferred-items.md` with rationale and re-schedule.
