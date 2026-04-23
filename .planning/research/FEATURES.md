# Feature Research

**Domain:** v3.6 — Multi-User Completion, Auth UX & Safari Parity
**Researched:** 2026-04-22
**Confidence:** HIGH for auth patterns (OWASP + GitHub industry reference); HIGH for Safari extension gap (direct code diff); MEDIUM for email provider selection (multiple current sources); MEDIUM for email verification UX (SuperTokens + Authgear sources)

---

## Feature Area 1: AUTH-09 — Change Password (from PWA Profile)

The user is already authenticated. This is a self-service password update, not a recovery flow. No email needed.

### What "Works" Means

User visits Settings → Vigil Account section → enters current password + new password → clicks Save → password updated → stays logged in. No redirect. No email. Current session JWT remains valid.

### User-Visible Flow

1. Settings page → Vigil Account card (currently shows email + Sign Out)
2. "Change Password" sub-section with three fields: Current password, New password, Confirm new password (or show/hide toggle instead of confirm field — see anti-features)
3. Submit → server verifies current password against argon2id hash, rejects if wrong
4. On success: brief success banner ("Password updated"), stay on page, stay logged in

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Current password re-entry required | Standard security — prevents session-hijack attacker from silently changing password | LOW | POST /v1/auth/change-password: verify `currentPassword` against stored argon2id hash before applying new hash. Return 401 if wrong. |
| New password min-length enforcement | Existing register endpoint enforces 12–128 chars. Change-password must match. | LOW | Reuse `MIN_PASSWORD = 12` / `MAX_PASSWORD = 128` constants already in auth.ts. |
| Incorrect current password gives generic error | Prevents fishing for "did my old password work?" | LOW | Return 400 "Incorrect current password" — do NOT return 401 (would expose session-vs-credential ambiguity) |
| Stay logged in after change | Industry norm — user just proved identity via current password | LOW | Do NOT invalidate current JWT on password change. Multi-device sign-out is a differentiator, not table stakes at this scale. |
| Success feedback | Without it, user doesn't know if it worked | LOW | Brief banner ("Password updated") on the Settings page, auto-dismiss in 5s (same pattern as existing banner system in SettingsPage.tsx) |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Password strength indicator | Real-time feedback on new password quality | LOW | Client-side only — no library needed; simple length + char-class check with a colored bar. Not a blocker; purely UX polish. |
| "Sign out of all other sessions" toggle | Security-conscious users want nuclear option after suspected compromise | MEDIUM | Requires JWT invalidation strategy. Current stateless HS256 tokens have no server-side revocation. Would need a `password_changed_at` timestamp on the users row and a check in the bearerAuth dispatcher. Ship only if session revocation is also added for other flows. Defer to v3.7 unless scope is small. |
| Confirmation email after password change | "Security alert: your password was changed" notification | MEDIUM | Requires transactional email (AUTH-10 infra). If AUTH-10 email provider is added in the same milestone, the confirmation email is a cheap add-on (reuse same provider). Mark as conditional on AUTH-10 ship order. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Confirm-password field (type-twice) | "Reduce typos" | Reduces conversion by 56% (CXL research); NCSC recommends against it | Use show/hide toggle on new-password field instead |
| Auto sign-out after change | "Security" | Breaks the user's active session — they're on the Settings page; extremely surprising UX | Stay logged in; offer sign-out-other-sessions as optional toggle (differentiator above) |
| Email confirmation required to change password | "Extra verification" | Email auth is not in scope for change-password (user is already authenticated); adds unnecessary friction | Current-password re-entry is the correct second factor here |

### Backend Contract (New Endpoint Needed)

```
POST /v1/auth/change-password
Authorization: Bearer <JWT>
Body: { currentPassword: string, newPassword: string }

200: { message: "Password updated" }
400: { error: "Incorrect current password" }
400: { error: "Password must be 12-128 characters" }
401: (from bearerAuth middleware — JWT invalid)
```

### Dependency Chain

```
AUTH-09 Change Password
    └──requires──> existing POST /v1/auth/login pattern (same argon2id verify call)
    └──requires──> bearerAuth middleware (JWT authentication — already shipped)
    └──requires──> Vigil Account section in SettingsPage (AUTH-07 — already shipped)
    └──optional──> transactional email for confirmation email (AUTH-10 infra)
    └──optional──> session revocation for sign-out-other-sessions differentiator
```

---

## Feature Area 2: AUTH-10 — Forgot Password Email Link

The user is unauthenticated and has forgotten their password. This is the first outbound transactional email in Vigil. The email provider decision is the critical dependency for the entire auth email cluster (AUTH-10 + AUTH-11).

### What "Works" Means

User clicks "Forgot password?" on login page → enters email → sees "If that email is registered, you'll receive a link shortly" → receives email with link → clicks link (valid, single-use, time-limited) → enters new password → lands on success page → logs in manually with new password.

### User-Visible Flow

1. Login page: "Forgot your password?" link below the password field
2. Dedicated forgot-password page: single email input + Submit button
3. After submit (regardless of whether email exists): "Check your inbox — if that email is registered with Vigil, you'll receive a reset link within a few minutes."
4. Email arrives: simple plain-text or minimal HTML email with a single CTA button "Reset your Vigil password" → link is `https://app.vigilhub.io/reset-password?token=<opaque_token>`
5. Reset page: new password field + submit. Token validated server-side on load (show error immediately if expired/used). On success: "Password updated. Sign in with your new password." → redirect to login page.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Enumeration protection — always show "check your inbox" | OWASP Forgot Password Cheat Sheet: "Return a consistent message for both existent and non-existent accounts" | LOW | Server always returns 200 with same message regardless of whether email is in DB. Do NOT branch: no "email not found" vs "email sent" differentiation. |
| Opaque random token (not JWT) | Simpler, no signed-payload attack surface, easier to invalidate | LOW | Generate 32 bytes via `crypto.randomBytes(32).toString('hex')` → 64-char hex token. Store hash (SHA-256) in password_resets table. Never store plaintext. |
| 1-hour expiry | OWASP norm: "rarely more than an hour." 15 min is too aggressive for email latency variance. 24h is too long for a privileged reset link. | LOW | Store `expires_at = NOW() + 1 hour` in password_resets row. Check on use. |
| Single-use enforcement | Token is invalidated immediately upon successful use | LOW | Mark `used_at = NOW()` on successful password reset. Any subsequent use of same token returns 400 "This link has already been used." |
| Token delivered as URL parameter | User clicks link, no copy-paste | LOW | `https://app.vigilhub.io/reset-password?token=<token>`. Do NOT use a paste-code flow — URL link is the industry norm and lowest friction. |
| Do NOT auto-login after reset | OWASP: "Don't auto-login users after reset; require standard authentication instead" | LOW | On success: redirect to /auth with a query param `?reset=success` that shows a one-time success banner. User must log in manually. |
| Post-reset notification email | OWASP: "After password modification, send a confirmation email" | MEDIUM | Second email: "Your Vigil password was changed. If this was you, no action needed. If not, [contact link]." Reuses same email provider. |
| Rate limiting on forgot-password endpoint | Prevent email flooding / enumeration via timing | LOW | Per-email: max 3 requests per 15 minutes. Per-IP: max 10 requests per 15 minutes. Return 429 with `Retry-After` header. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Resend link on the "check your inbox" page | User didn't receive email (spam folder, delay); avoid rage-refresh | LOW | "Resend email" button on the confirmation page, rate-limited to once per 2 minutes client-side + same server-side rate limit above. Reuses existing token if not yet used. |
| Pre-check referrer on reset page load | If token is already invalid/expired, show error before user fills in the form | LOW | GET /v1/auth/reset-password/validate?token=<token> on page load. If invalid: show "This link has expired. Request a new one." with link back to forgot-password page. Prevents user from typing a new password only to get an error on submit. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Signed JWT as reset token | "Stateless, no DB row needed" | Cannot be invalidated after use without a revocation list (defeating the stateless benefit); replay attack surface | Opaque random token stored in DB — simple, single-use, invalidatable |
| Show "email not found" if address unregistered | "Better UX — no false hope" | Classic enumeration attack: attacker can determine which emails are registered | Always show same message ("check your inbox") |
| Auto-login after reset | "Convenient" | Allows attacker who intercepted the token to get a session without knowing the new password | Require manual login after reset |
| 24-hour token expiry | "Reduces re-request support" | 24 hours is a long window for a privileged reset link; 1 hour is the industry norm | 1-hour expiry with easy "resend" on the confirm page |

### Email Provider Decision (Critical Dependency)

AUTH-10 and AUTH-11 both require a transactional email provider. This is the first outbound email Vigil has ever sent.

**Recommendation: Resend**

Rationale:
- Free tier: 3,000 emails/month. At ~5 users who might each reset their password a handful of times per month, Vigil will never leave the free tier.
- Node.js SDK: `npm install resend` — official TypeScript client, dead simple.
- React Email templates supported (vigil-core is Node.js; React Email works server-side with no frontend dependency).
- Verified domain sending via DNS records — straightforward DNS setup for `vigilhub.io`.
- Developer experience is significantly better than Postmark for a new project starting in 2026.
- Postmark's main advantage (mission-critical deliverability, inbound email parsing) is irrelevant at this scale and use case.

For password reset and email verification, both providers are functionally equivalent. Resend wins on free tier and DX.

**New DB Table Required:**

```sql
CREATE TABLE password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 of the raw token
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Dependency Chain

```
AUTH-10 Forgot Password
    └──requires──> transactional email provider (Resend — new infra)
    └──requires──> password_resets table (new migration)
    └──requires──> vigilhub.io DNS setup for Resend domain verification
    └──enables──> AUTH-11 (same email provider, same table pattern)
    └──enables──> AUTH-09 post-change confirmation email (optional)
    └──requires──> "Forgot password?" link on AuthPage.tsx (minor UI addition)
    └──requires──> new PWA route /reset-password
```

---

## Feature Area 3: AUTH-11 — Verify Email on Signup

New users must verify their email address. This closes the loop on spam/typo registrations and is a prerequisite for transactional email trust (Resend/Postmark domains need verified sender reputation).

This feature reuses the same email infra, same token table pattern, and same Resend SDK as AUTH-10. If AUTH-10 ships first, AUTH-11 is a smaller lift.

### What "Works" Means

User registers → immediately sees "Check your inbox — verify your email to start using Vigil" → receives email with verification link → clicks link → sees "Email verified!" confirmation → can fully use the app.

### Key Design Decision: Block vs Banner

**Recommendation: Banner (soft gate), not hard block.**

Rationale: Vigil is currently a ~5-user personal/trusted system with an allowlist (VIGIL_ALLOWED_EMAILS). The users who can register are already implicitly trusted. A hard block (lock out entire app until verified) is appropriate for public signups where spam is a real risk. For Vigil's closed system, a banner warning with reduced capability is less hostile.

Practical soft-gate pattern (industry standard from SuperTokens/Authgear research):
- After signup: user is logged in immediately (existing behavior from AuthPage.tsx), but sees a persistent banner: "Verify your email — check your inbox for a link."
- All core features: fully accessible. No hard block.
- Optionally: defer certain sensitive operations (future email-change flow) until verified.
- Banner disappears once verified.

### User-Visible Flow

1. User completes registration → auto-login (existing behavior) → redirects to / with verification banner at top
2. Banner: "Verify your email. A link was sent to [email]. [Resend email]"
3. Background: server sends verification email immediately after successful registration
4. User clicks link in email → `https://app.vigilhub.io/verify-email?token=<token>`
5. PWA verify-email page: calls server to verify token → on success: "Your email is verified!" → redirect to / (banner gone)
6. On token expired/used: "This link has expired. [Request a new one]"

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Email sent automatically on registration | User expects verification email to arrive without requesting it | LOW | After successful POST /v1/auth/register, fire-and-forget Resend call. Never block registration response on email send success — handle Resend failure gracefully (log error, don't 500 the register endpoint). |
| 24-hour token expiry | Industry norm for email verification (longer than password reset because email delivery can be slow; lower risk than reset) | LOW | Store `expires_at = NOW() + 24 hours`. SuperTokens + AppMaster research: 24h is the standard. |
| Resend verification email button | Users miss emails in spam; 24h expiry means they can't wait days | LOW | POST /v1/auth/resend-verification (authenticated). Rate limit: 3 per hour per user. Reuse existing token if not expired; generate new one if expired. |
| Single-use token | Same as AUTH-10 — no replay | LOW | Same DB pattern as password_resets, new email_verifications table. |
| Link format: URL parameter (not paste code) | Lower friction — user clicks, not copies | LOW | `https://app.vigilhub.io/verify-email?token=<token>` |
| Soft gate (banner not block) | At ~5 trusted users on an allowlist, hard block is hostile | LOW | Show persistent banner until verified. All features remain accessible. |
| `email_verified` column on users table | Server needs to know verification state | LOW | Add `email_verified BOOLEAN DEFAULT FALSE` + `email_verified_at TIMESTAMPTZ` to users table via migration. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Pre-validate token on page load (not just on submit) | Same as AUTH-10 — show expired error before user does anything | LOW | GET /v1/auth/verify-email/validate?token= on mount. Shows friendly expired message with resend link. |
| Auto-redirect after verification | No manual "back to app" click needed | LOW | 3-second countdown then redirect to / after successful verification. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Hard block entire app until verified | "Security best practice" | Vigil is a closed allowlist system; blocking trusted users from the app they just registered for is hostile and unnecessary | Soft banner gate — all features work, just show persistent reminder |
| Paste-code verification (6-digit OTP) | "Mobile-friendly" | Adds UX friction vs clicking a link; phone-number OTP is common but email-link is the universal pattern for email verification | URL link — click once, done |
| Re-verify on email change | "Keep email ownership confirmed" | Email change is not in v3.6 scope | Defer to v3.7 when email-change feature is designed |
| Block forgot-password flow if email unverified | "Can't verify identity without confirmed email" | Circular — user can't verify email if they're locked out and forgot password | Allow forgot-password regardless of verification state; the allowlist already gates who can be a user |

### New DB Table Required

```sql
CREATE TABLE email_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration on users table:
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
```

### Dependency Chain

```
AUTH-11 Email Verification
    └──requires──> AUTH-10 transactional email provider (Resend) — same infra
    └──requires──> email_verifications table + users.email_verified column (migration)
    └──requires──> registration hook: fire verification email in POST /v1/auth/register
    └──requires──> new PWA route /verify-email
    └──requires──> verification banner component in PWA (reads email_verified from GET /v1/me)
    └──get /v1/me must return email_verified field (minor backend change)
```

---

## Feature Area 4: EXT-02 — Safari Extension Quick-Capture Parity

### Current State Delta (Code-Level Audit)

Direct comparison of `vigil-extension/popup.js` (Chrome, Phase 94) vs `vigil-safari-extension/.../popup.js` (Safari, current):

| Capability | Chrome (Phase 94) | Safari (current) | Gap |
|-----------|-------------------|-----------------|-----|
| Freeform text input | YES — empty textarea, user types | YES — textarea pre-filled with page title+URL | DIFFERENT BEHAVIOR |
| URL inclusion | YES — explicit checkbox "Include page URL" (opt-in) | NO checkbox — URL always pre-filled in textarea | MISSING CHECKBOX |
| Triage feedback badge | YES — polls `/v1/thoughts/:id` up to 5s, shows category badge ("Task", "Reminder", etc.) | NO — just shows static "Captured!" and closes after 1500ms | MISSING TRIAGE FEEDBACK |
| Cmd+Enter submit | YES — `e.metaKey || e.ctrlKey` on keydown | NO — only Capture button click works | MISSING SHORTCUT |
| Auto-close timing | After triage badge shown (1500ms post-category) or 5s timeout | 1500ms after success, no triage wait | DIFFERENT |
| Success text element | `<span id="success-text">` updated dynamically | Static `<span class="checkmark"> Captured!</span>` in HTML | MISSING SUCCESS-TEXT SPAN |

Safari's current behavior is "v1 URL-only capture" (Phase 84 shape), not Phase 94 quick-capture shape. The Chrome popup is the reference implementation.

### What "Works" Means (Parity Definition)

Safari popup behavior must match Chrome exactly:
- Empty textarea on open (cursor focused, no pre-fill)
- "Include page URL" checkbox below textarea (unchecked by default)
- When checkbox checked + capture submitted: appends `\n\n${tab.title}: ${tab.url}` to content (same Chrome logic)
- Cmd+Enter submits (same event handler)
- After successful POST: shows "Analyzing..." → polls for category → shows "Captured! [Category]" badge → closes after 1500ms
- 5s polling timeout fallback: shows "Captured!" without badge, closes

### Safari-Specific API Compatibility Notes

**chrome.tabs.query** — Supported in Safari Web Extensions. The existing Safari popup.js already uses `chrome.tabs.query` for pre-filling and it works (verified by the current code shipping). This same call can be used for the opt-in URL inclusion logic.

**chrome.storage.local** — Supported and already in use in the Safari extension (STORAGE_KEY pattern identical to Chrome). No change needed.

**chrome.commands (keyboard_shortcuts)** — The `commands` API for declaring global extension shortcuts (e.g., opening the popup via keyboard) has limited/no support in Safari Web Extensions per Apple Developer Forums. However, the Phase 94 keyboard shortcut is `Cmd+Enter` *within the popup textarea* — this is a standard DOM keydown event listener, NOT a chrome.commands shortcut. DOM keydown events work identically in Safari. No Safari-specific limitation applies here.

**browser vs chrome namespace** — Safari Web Extensions support both `browser.*` and `chrome.*` namespaces. Current extension uses `chrome.*` throughout; no changes needed.

### Safari-Specific UX Conventions

**Popup dismissal**: Safari extension popups dismiss automatically when focus moves away from the popup window — same as Chrome. The setTimeout/window.close() pattern works identically.

**Popup sizing**: Safari respects width set in HTML viewport meta tag (`width=320` already set). Height is auto-fitted to content. No special handling needed.

**Visual density**: Safari users on macOS tend to expect slightly more compact UI compared to Chrome extensions. The existing popup.css should be checked for font size and padding — minor adjustment may be needed, but this is cosmetic, not functional.

**Extension icon toolbar position**: In Safari, extensions appear in the toolbar just like Chrome. The Vigil Capture icon placement is identical.

### Auth Scope Question: Should Safari Migrate from vk_ to JWT in v3.6?

**Recommendation: NO — defer to v3.7.**

Current state: Both Chrome and Safari extensions use the hardcoded `vk_` bearer token stored in `chrome.storage.local`. The v3.4 backend's bearerAuth three-path dispatcher already handles `vk_` tokens (path 1) — this is the "D-03 no-regression" guarantee.

Arguments for migrating to JWT in v3.6:
- Would make extensions authenticate as a specific user (not just "the account")
- Consistent with PWA auth model
- Cleaner long-term

Arguments against in v3.6 scope:
- JWT tokens are short-lived — extensions would need refresh logic (not trivial without a refresh endpoint)
- JWT is stored in sessionStorage in PWA; extension can't access PWA's sessionStorage
- Extensions would need their own login UI (setup view → login form, not just API key paste)
- This is a significant scope expansion; EXT-02 goal is feature parity, not auth model migration
- vk_ tokens work, are stable, and will continue to work as long as bearerAuth dispatcher keeps path 1
- The right time to migrate is when the vk_ bearer is deprecated — not forced in v3.6

**Conclusion:** EXT-02 is a copy-paste of Chrome's Phase 94 popup changes into the Safari extension. Zero auth model changes. Keep vk_ bearer. The parity gap is entirely in popup UX, not auth.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Empty textarea on popup open (no pre-fill) | Phase 94 Chrome behavior; the pre-fill was removed in Chrome because it interfered with freeform capture | LOW | Remove the try/catch block that pre-fills `contentInput.value` with `title\nurl\n\n`. Start with empty string. |
| "Include page URL" checkbox | Chrome Phase 94 has it; Safari user expects parity | LOW | Add `<label><input type="checkbox" id="include-url"> Include page URL</label>` to popup.html. Add URL-append logic in popup.js (same as Chrome). |
| Triage polling feedback badge | Core v3.2 quick-capture feature; Safari missing it entirely | LOW | Copy the polling interval logic from Chrome popup.js verbatim. Add `<span id="success-text">` to popup.html (replaces static "Captured!" text). |
| Cmd+Enter submit shortcut | Chrome has it; expected by any power user | LOW | Add `contentInput.addEventListener('keydown', ...)` with `e.metaKey || e.ctrlKey` check. Identical to Chrome. |
| Shortcut hint text | Chrome shows "Cmd+Enter to capture" below button | LOW | Add `<div class="shortcut-hint">Cmd+Enter to capture</div>` to popup.html. Add CSS if not already in popup.css. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Visual density pass for Safari | Safari toolbar popups are slightly more compact natively | LOW | Check font-size and vertical padding in popup.css. Minor cosmetic pass after functional parity is achieved. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| JWT login UI in Safari extension setup | "Auth model consistency with PWA" | Scope creep; requires refresh token endpoint + extension login form; EXT-02 goal is feature parity not auth migration | Defer auth migration to v3.7 when vk_ deprecation is planned |
| Global keyboard shortcut to open popup | "Open Vigil from any page" | chrome.commands API for popup-open shortcuts has limited Safari support; complex to test across macOS versions | The popup is opened via toolbar click; Cmd+Enter within popup is the relevant shortcut and works via DOM events |
| Context menu "Capture this" right-click | "More capture surfaces" | Requires `contextMenus` permission + background service worker; significant scope expansion | Defer; toolbar popup is sufficient for v3.6 |

### Dependency Chain

```
EXT-02 Safari Quick-Capture Parity
    └──requires──> vigil-safari-extension popup.html + popup.js changes (pure diff from Chrome)
    └──no new server endpoints needed (same POST /v1/thoughts + GET /v1/thoughts/:id polling)
    └──no auth model changes (keep vk_ bearer)
    └──requires──> popup.css check for shortcut-hint class (copy from vigil-extension/popup.css if missing)
    └──independent from AUTH-09/10/11
```

---

## Feature Area 5: Multi-User Debt (W-01, W-02, SCHED-01)

These are existing-pattern extensions of v3.4 work. No new feature research needed.

**W-01 — work_order_statuses userId scoping:** Add `user_id INTEGER REFERENCES users(id)` column to `work_order_statuses` table with Drizzle migration. Update all queries to filter by `userId` from JWT context. Same pattern as the 11 tables already scoped in v3.4.

**W-02 — cross-user isolation test for GET /v1/brief/:date:** Write a test that creates two users, generates a brief for user A, then asserts that user B's GET /v1/brief/:date returns 404 (not user A's PDF bytes). Follows existing test patterns.

**SCHED-01 — per-user scheduler fan-out:** Current scheduler uses a hardcoded seed user ID. Change to `SELECT id FROM users` and iterate. No user-facing feature change — this is a correctness fix so that all registered users get their brief generated and prioritization cache refreshed, not just the seed user.

---

## Cross-Feature Dependency Map

```
Transactional email provider (Resend)
    └──required by──> AUTH-10 (forgot password)
    └──required by──> AUTH-11 (email verification)
    └──optional for──> AUTH-09 (post-change notification email)
    └──blocks──> AUTH-10 and AUTH-11 until provider is set up

AUTH-10 (forgot password)
    └──requires──> password_resets table + Resend
    └──enables──> AUTH-11 (same infra pattern reused)
    └──enables──> AUTH-09 post-change email (optional, same provider)

AUTH-11 (email verification)
    └──requires──> AUTH-10 infra (Resend + token table pattern)
    └──requires──> email_verified column on users table
    └──requires──> verification banner component in PWA

AUTH-09 (change password)
    └──requires──> bearerAuth middleware (already exists)
    └──independent of email infra (works without AUTH-10/11)
    └──optional enhancement──> confirmation email (requires AUTH-10 infra)

EXT-02 (Safari parity)
    └──independent from all auth features
    └──independent from W-01/W-02/SCHED-01
    └──requires──> no new server endpoints

W-01/W-02/SCHED-01 (multi-user debt)
    └──independent from each other
    └──independent from auth features
    └──SCHED-01 requires──> W-01 (if work_order_statuses scoping is part of the fan-out)
```

### Recommended Phase Ordering

Based on dependencies:

1. **Phase 1: AUTH-09 + W-01** — These are independent of email infra and each other. AUTH-09 is pure server + SettingsPage UI. W-01 is a migration. Ship together.
2. **Phase 2: AUTH-10 (Transactional Email + Forgot Password)** — Introduces Resend. Sets up the email infra and password_resets table. This unblocks AUTH-11.
3. **Phase 3: AUTH-11 (Email Verification)** — Reuses Resend + token pattern from AUTH-10. Adds email_verifications table + PWA banner.
4. **Phase 4: EXT-02 (Safari Parity)** — Completely independent, pure popup code change. Can go in any phase but is the smallest lift so schedule last or parallel with a server-side phase.
5. **Phase 5: W-02 + SCHED-01** — Can go in parallel with auth phases since they're server-only changes.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| AUTH-09 change password | HIGH — core auth UX; users locked if they need to change | LOW | P1 |
| AUTH-10 forgot password | HIGH — recovery path; users stuck without it | MEDIUM (email infra) | P1 |
| AUTH-11 email verification | MEDIUM — security hygiene; not an emergency at 5-user scale | MEDIUM | P1 |
| EXT-02 Safari parity | HIGH for Safari users — Chrome and Safari capture UX diverge | LOW | P1 |
| W-01 work_order_statuses scoping | MEDIUM — data isolation correctness | LOW | P1 |
| SCHED-01 per-user scheduler fan-out | HIGH — every registered user needs their brief | LOW | P1 |
| W-02 cross-user isolation test | MEDIUM — test coverage, not a user-facing fix | LOW | P2 |
| post-change confirmation email (AUTH-09 + email) | LOW — nice security alert | LOW (after AUTH-10) | P2 |
| sign-out-other-sessions (AUTH-09 differentiator) | LOW — not needed at current scale | MEDIUM | P3 |
| JWT auth migration for extensions (EXT) | LOW — vk_ tokens work; migration is refactor | HIGH | Defer v3.7 |

**Priority key:**
- P1: Must ship in v3.6
- P2: Should ship in v3.6, adds after core
- P3: Nice to have, consider only if ahead of schedule
- Defer: Explicitly out of v3.6 scope

---

## Known Gaps (Require Phase-Level Investigation)

- **Resend domain verification setup for vigilhub.io:** DNS records (DKIM, SPF, DMARC) must be added to the vigilhub.io domain. One-time setup step. Should be confirmed before writing any email-sending code — if DNS propagation is slow it can delay testing.
- **users table migration order for email_verified:** Drizzle migrate() runs on every Railway deploy. Adding a non-null column with a default is safe. But the timing of this migration relative to AUTH-11 PWA deploy matters — GET /v1/me must return `email_verified` before the banner component reads it. Deploy server first, then PWA.
- **Safari extension Xcode build process:** The vigil-safari-extension is an Xcode project. The JS changes in Resources/popup.{html,js} are straightforward, but the build + sign + load flow for testing must be confirmed. Phase plan should document the test cycle explicitly.
- **password_resets table cleanup:** Expired reset tokens accumulate. A periodic cleanup job (cron or lazy-delete on lookup) should be noted in the phase plan — not critical for v3.6 but avoids table bloat.
- **Vigil Account card expansion in SettingsPage:** AUTH-09 needs to add a "Change Password" sub-section to the existing Vigil Account card in SettingsPage.tsx. The existing card only has email display + Sign Out. The phase plan should specify whether this expands inline or links to a separate `/settings/change-password` route.

---

## Sources

- OWASP Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html (HIGH — authoritative)
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html (HIGH — authoritative)
- SuperTokens email verification flow: https://supertokens.com/blog/implementing-the-right-email-verification-flow (MEDIUM — well-researched practitioner source)
- Authgear login/signup UX guide 2025: https://www.authgear.com/post/login-signup-ux-guide (MEDIUM)
- Resend vs Postmark 2026 comparison: https://www.sequenzy.com/versus/resend-vs-postmark (MEDIUM — multiple sources agree on Resend DX advantage)
- Resend vs Postmark developer analysis: https://www.pkgpulse.com/blog/resend-vs-nodemailer-vs-postmark-email-nodejs-2026 (MEDIUM)
- Password UX — confirm field removal: https://cxl.com/blog/password-ux/ (MEDIUM — CXL A/B test data: 56.3% conversion lift removing confirm field)
- GitHub change password flow: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/updating-your-github-access-credentials (HIGH — current password required confirmed)
- Safari extension browser compatibility: https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility (HIGH — official Apple docs)
- Token expiry best practices 2025: https://zuplo.com/blog/2025/03/01/token-expiry-best-practices (MEDIUM)
- Chrome/Safari extension keyboard shortcuts gap: https://developer.apple.com/forums/thread/115651 (MEDIUM — DOM keydown works; chrome.commands popup-open has limited support)
- Direct code audit: vigil-extension/popup.js vs vigil-safari-extension/.../popup.js (HIGH — first-party source)

---
*Feature research for: Vigil v3.6 — Multi-User Completion, Auth UX & Safari Parity*
*Researched: 2026-04-22*
