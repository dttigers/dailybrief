---
phase: 112
slug: forgot-password-email-flow
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-24
requirements: [AUTH-10]
depends_on: [110, 111]
source_decisions: 112-CONTEXT.md (D-14..D-20)
---

# Phase 112 — UI Design Contract

> Visual + interaction contract for the forgot-password flow. Three PWA touch points: existing `/auth` (login) gets a "Forgot password?" link + a new `?reason=password_reset` banner case; new `/auth/forgot` page (single email input, always-success message); new `/auth/reset` page (single password input + show/hide toggle, single-bucket error UX).

CONTEXT.md is the source of truth for UX decisions. This UI-SPEC formalizes those decisions into a checker-validatable design contract. **No new design questions were asked of the user** — every value below traces to CONTEXT.md, REQUIREMENTS.md, or an established Phase 110 / AuthPage pattern.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Tailwind v4 with `@theme` tokens in `vigil-pwa/src/index.css`) |
| Preset | not applicable |
| Component library | none — bespoke Tailwind-styled `<input>` / `<button>` / `<form>` |
| Icon library | Unicode emoji glyphs (👁 / 🙈) — zero-dep pattern established in Phase 110 D-17 |
| Font | Inter (already loaded via `--font-sans` in `index.css`) |

**Source pattern files (must mirror):**
- `vigil-pwa/src/pages/AuthPage.tsx` — login form structure, banner pattern, brand button styling
- `vigil-pwa/src/pages/SettingsPage.tsx` lines 354–429 — Phase 110 D-16/D-17 single-password-with-eye-toggle pattern
- `vigil-pwa/src/index.css` — token source of truth

---

## Spacing Scale

Project already uses Tailwind's default 4px-multiple scale. The contract for Phase 112 reuses the existing `AuthPage` rhythm verbatim — do NOT introduce new spacing values.

| Token | Tailwind class | Value | Phase 112 usage |
|-------|----------------|-------|------------------|
| xs | `gap-2`, `mt-2`, `mb-2` | 8px | Inline label-to-input gap, banner internal spacing |
| sm | `mb-4`, `mt-4`, `py-2` | 16px | Field-to-field gap, form vertical rhythm |
| md | `p-5`, `p-8` | 20–32px | Card padding (matches existing `bg-gray-900 rounded-lg p-8` shell on AuthPage line 87) |
| lg | `mb-6` | 24px | Heading-to-form gap |

**Exceptions:** none. All three Phase 112 surfaces (link on `/auth`, full `/auth/forgot`, full `/auth/reset`) compose from existing AuthPage rhythm.

---

## Typography

Project enforces **Inter, weights 400 (Regular) and 500 (Medium) only** per brand guidelines (`reference_brand_guidelines.md`). NO 600/700 weights — explicit project rule.

| Role | Tailwind class | Size | Weight | Usage in Phase 112 |
|------|----------------|------|--------|---------------------|
| Display | `text-2xl font-medium` | 24px | 500 | Page heading (e.g. "Reset your password", "Check your inbox") — mirrors AuthPage line 88 |
| Body | (default) | 16px | 400 | Body copy in success/error blocks |
| Label | `text-sm` | 14px | 400 | Form input labels ("Email", "New password") — mirrors AuthPage line 100 |
| Helper | `text-sm` | 14px | 400 | "Back to login" link, secondary CTAs |
| Helper-muted | `text-xs` | 12px | 400 | Inline helper text (none required this phase, but available) |

**Line height:** Tailwind defaults (1.5 for body, ~1.2 for headings). No overrides.

---

## Color

Project uses 60/30/10 split with Vigil teal as the brand accent. Tokens already defined in `vigil-pwa/src/index.css`.

| Role | Token | Hex | Usage in Phase 112 |
|------|-------|-----|---------------------|
| Dominant (60%) | `bg-gray-900` | `#2C2C2A` | Page background, card surface (matches AuthPage shell) |
| Secondary (30%) | `bg-gray-900/80` + `border-gray-400/30` | translucent | Input field surface (matches AuthPage line 110) |
| Accent (10%) | `bg-teal-600` / `text-teal-400` | `#0F6E56` / `#1D9E75` | Primary CTAs, "Forgot password?" link, success banner border, focus ring |
| Destructive | `text-red-400` / `bg-red-900/40` | (Tailwind defaults) | Error banner, inline error text |
| Success | `bg-teal-900/40` + `text-teal-50` | derived | Green success banner on `/auth?reason=password_reset` (mirrors Phase 110 banner style) |

**Accent reserved for (explicit list — checker validates this):**
1. Primary submit button on `/auth/forgot` ("Send reset link") — `bg-teal-600 hover:bg-teal-800`
2. Primary submit button on `/auth/reset` ("Reset password") — `bg-teal-600 hover:bg-teal-800`
3. Primary "Request a new link" button on `/auth/reset` invalid-token state — `bg-teal-600 hover:bg-teal-500`
4. "Forgot password?" text link on `/auth` — `text-teal-400 hover:text-teal-300`
5. "Back to login" text link on `/auth/forgot` and `/auth/reset` — `text-teal-400 hover:text-teal-300` (secondary, but still teal because it is brand-link, not destructive)
6. `?reason=password_reset` success banner border + text on `/auth` — `border-teal-600/40 bg-teal-600/10 text-teal-200` (mirrors Phase 110's `?reason=session_expired` banner verbatim)

**Accent NOT used for:**
- "Cancel" / dismissive secondary buttons → `bg-gray-700`
- Sign-out / destructive → `text-red-400`
- Body text → `text-gray-50` / `text-gray-400`

**Destructive usage:** No destructive confirmations in this phase. The reset flow itself is recovery, not deletion — the "no longer valid" error state is informational, not destructive (uses `text-red-400` for the error heading only, not for buttons).

---

## Component Inventory

Three frontend surfaces, each composed entirely of existing primitives. **No new components introduced.** Each surface is a single `.tsx` page file consuming the same `<input>` / `<button>` / `<form>` Tailwind patterns already shipped in `AuthPage.tsx` and `SettingsPage.tsx`.

| Component | New / Existing | File | Source pattern |
|-----------|----------------|------|----------------|
| `<AuthPage>` (modified) | existing — additive edits only | `vigil-pwa/src/pages/AuthPage.tsx` | self |
| `<ForgotPasswordPage>` | NEW | `vigil-pwa/src/pages/ForgotPasswordPage.tsx` | `AuthPage.tsx` shell + form pattern |
| `<ResetPasswordPage>` | NEW | `vigil-pwa/src/pages/ResetPasswordPage.tsx` | `AuthPage.tsx` shell + `SettingsPage.tsx` lines 380–404 (eye-toggle) |

---

## Route Plan

| Route | Auth | Page component | Source of truth |
|-------|------|----------------|------------------|
| `/auth` | unauthenticated | `<AuthPage>` (modified — add "Forgot password?" link + `?reason=password_reset` banner case) | CONTEXT D-14, D-19 |
| `/auth/forgot` | unauthenticated | `<ForgotPasswordPage>` (NEW) | CONTEXT D-15, D-16 |
| `/auth/reset` | unauthenticated | `<ResetPasswordPage>` (NEW) | CONTEXT D-17, D-18, D-19, D-20 |

Routes wire into the existing top-level `<Route path="/auth" ...>` pattern in `vigil-pwa/src/App.tsx` lines 55–62 — extend with two sibling `<Route path="/auth/forgot">` and `<Route path="/auth/reset">` entries that render OUTSIDE the protected `<Layout>` shell (no nav, no sidebar — same shell-less treatment as `/auth`).

---

## Surface 1 — `/auth` (existing login page, additive edits only)

### 1a. "Forgot password?" link (CONTEXT D-14)

**Placement:** Below the password input, above the submit button. Inline anchor `<Link to="/auth/forgot">`.

**Visual contract:**
```
[Email input]
[Password input]
                                      Forgot password?  ← right-aligned, text-sm, text-teal-400
[Sign In button]
```

**Tailwind composition:**
```tsx
<div className="mt-2 flex justify-end">
  <Link
    to="/auth/forgot"
    className="text-sm text-teal-400 hover:text-teal-300"
  >
    Forgot password?
  </Link>
</div>
```

**Visibility rules:**
- Render ONLY when `mode === 'login'` (i.e. `isLogin === true`). Hide on signup mode — recovery is irrelevant for a not-yet-existing account.
- Always-visible when on login mode regardless of session-expired banner state.

### 1b. `?reason=password_reset` banner case (CONTEXT D-19, mirrors Phase 110 D-19 pattern)

**Trigger:** `/auth/reset` POST 200 response → navigate to `/auth?reason=password_reset`. Login page reads the URL query string at mount (extending the existing `readSessionExpiredFlag()` helper at `AuthPage.tsx:11–14`).

**Copy:** "Password reset successfully. Please sign in with your new password."

**Visual contract** (verbatim mirror of existing `?reason=session_expired` banner at `AuthPage.tsx:91–98`, success-styled):

```tsx
<div
  role="status"
  className="mb-4 rounded border border-teal-600/40 bg-teal-600/10 px-3 py-2 text-sm text-teal-200"
>
  Password reset successfully. Please sign in with your new password.
</div>
```

**State management:** Add a sibling boolean state `passwordReset` and helper `readPasswordResetFlag()` next to the existing `sessionExpired` / `readSessionExpiredFlag()` pattern. Both flags can co-exist; render whichever is set. Toggling `mode` (login ↔ signup) clears both flags (extend the existing `toggleMode` clear at line 28).

**Reason-string contract:** `'password_reset'` is the canonical query value. Do NOT use synonyms (`reset_success`, `pw_changed`, etc.) — checker greps for the exact string in both the producer (`/auth/reset` redirect) and consumer (`AuthPage.tsx`).

---

## Surface 2 — `/auth/forgot` (NEW page)

### Layout shell

Reuses AuthPage's centered card shell verbatim:
```tsx
<div className="min-h-screen flex items-center justify-center bg-gray-900">
  <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
    {/* content */}
  </div>
</div>
```

### State machine

Two states: **form** (initial) and **submitted** (after 200 response). Same component, conditional render.

### State 1 — Form (initial)

**Heading:** "Reset your password" — `text-2xl font-medium text-white mb-6`

**Helper copy** (above input, optional but recommended for clarity): "Enter your email address and we'll send you a link to reset your password." — `text-sm text-gray-400 mb-4`

**Form structure:**
- Single `<input type="email" required autoComplete="email" id="email">` labeled "Email" via `<label htmlFor="email">`
- Submit button: "Send reset link" — full-width, `bg-teal-600 hover:bg-teal-800`, `disabled:opacity-50`
- While submitting: button label becomes "Sending…", button is `disabled`
- Below the form: "Back to login" link — centered, `text-sm text-gray-400 hover:text-gray-200`, navigates to `/auth`

**Mirror these classes verbatim from AuthPage:**
- Input: `w-full px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded text-white placeholder-gray-400 focus:outline-none focus:border-teal-600`
- Submit button: `w-full mt-4 py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50`
- Label: `block text-sm text-gray-400 mb-2` (and `mt-4` for non-first labels)

**Behavior:**
- On submit → POST `/v1/auth/forgot-password` with body `{ email: email.trim().toLowerCase() }`
- Lowercase + trim mirrors AuthPage login submit at line 40
- Use `vigilFetch` (or bare `fetch` with `API_BASE` since this route is unauthenticated — both acceptable; AuthPage uses bare `fetch` and that's the established precedent for unauthenticated auth routes)
- On 200 response → switch to State 2 (success)
- On 429 or network error → render an inline error banner above the form: "Something went wrong. Please try again in a moment." with `text-sm text-red-400` styling (mirrors the inline error pattern at `AuthPage.tsx:126–127`). Form remains submittable.

### State 2 — Submitted (success)

**Replace the form** with a success block. Same card shell.

**Heading:** "Check your inbox" — `text-2xl font-medium text-white mb-6`

**Body copy (CONTEXT D-16 verbatim):** "If your account exists, a reset link has been sent. The link expires in 1 hour."
- `text-sm text-gray-300 mb-6`
- Rendered as React text — auto-escaped, no `dangerouslySetInnerHTML`

**Footer:** "Back to login" link — `text-sm text-gray-400 hover:text-gray-200`, centered, navigates to `/auth`

**Crucial:** This message renders identically regardless of whether the email exists in the database (CONTEXT D-03 enumeration safety). The PWA does NOT branch on the response body content — only on HTTP status code.

---

## Surface 3 — `/auth/reset` (NEW page)

### Layout shell

Same as `/auth/forgot` — reuses AuthPage's centered card shell.

### State machine

Three states resolved at mount + on submit:
1. **Missing token** (no `?token=` query param) → render Error state (D-20)
2. **Form** (token present, not yet submitted) → render password input form
3. **Error / invalid token** (after submit, API returned 400) → render Error state (D-20)

On success (200), redirect to `/auth?reason=password_reset` — no in-page success state.

### Token detection (CONTEXT D-18)

```tsx
const [searchParams] = useSearchParams()
const token = searchParams.get('token')
const [tokenInvalid, setTokenInvalid] = useState(!token)
```

If `token` is missing at mount → set `tokenInvalid = true` → render Error state immediately. Do NOT make any API call until the user submits the form (CONTEXT D-18 — defense-in-depth against email pre-fetch burning the token).

### State 1 — Form (token present, valid-shape)

**Heading:** "Set a new password" — `text-2xl font-medium text-white mb-6`

**Helper copy:** "Choose a new password for your Vigil account." — `text-sm text-gray-400 mb-4`

**Form structure (single password field with show/hide toggle — CONTEXT D-19 / Phase 110 D-16+D-17):**

Mirror `SettingsPage.tsx:380–404` verbatim (the "New password" block — minus the "Current password" sibling, which is not required here because the token IS the auth):

```tsx
<div>
  <label htmlFor="rp-new" className="block text-sm text-gray-400 mb-2">New password</label>
  <div className="flex">
    <input
      id="rp-new"
      type={showPw ? 'text' : 'password'}
      value={newPw}
      onChange={(e) => setNewPw(e.target.value)}
      autoComplete="new-password"
      required
      className="flex-1 px-3 py-2 bg-gray-900/80 border border-gray-400/30 rounded-l text-white placeholder-gray-400 focus:outline-none focus:border-teal-600"
      disabled={submitting}
    />
    <button
      type="button"
      onClick={() => setShowPw((v) => !v)}
      aria-label={showPw ? 'Hide password' : 'Show password'}
      className="px-3 bg-gray-900/80 border border-l-0 border-gray-400/30 rounded-r text-gray-400 hover:text-gray-200"
    >
      {showPw ? '🙈' : '👁'}
    </button>
  </div>
</div>
```

**Submit button:** "Reset password" — full-width, `bg-teal-600 hover:bg-teal-800`, `disabled:opacity-50`. While submitting: label "Resetting…", disabled.

**NO confirm-password field** — explicit per CONTEXT D-19 + REQUIREMENTS.md Out-of-Scope row ("Confirm-password field on change | CXL data: 56% conversion hit; use show/hide toggle instead"). Checker greps for absence.

**Footer:** "Back to login" link — `text-sm text-gray-400 hover:text-gray-200`, centered, navigates to `/auth`

**Behavior:**
- On submit → POST `/v1/auth/reset-password` with body `{ token, newPassword: newPw }`
- On 200 → `navigate('/auth?reason=password_reset')` (CONTEXT D-19; the login page renders the success banner from Surface 1b)
- On 400 → set `tokenInvalid = true` → unmount the form, render Error state (D-20)
- On 429 → inline error banner above form: "Too many attempts. Please try again in a moment." — `text-sm text-red-400`. Form stays mounted and re-submittable.
- On other errors (network / 500) → inline error banner: "Something went wrong. Try again." — `text-sm text-red-400`. Form stays mounted.

### State 2 — Token error (CONTEXT D-20 — single-bucket UX)

Triggered by:
- Mount with no `?token=` query param, OR
- POST `/v1/auth/reset-password` returned 400

**ZERO differentiation between expired / used / nonexistent / missing** — single bucket per CONTEXT D-20 (information-leak prevention + simpler state machine).

**Visual contract:**

```tsx
<div className="bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4">
  <h1 className="text-2xl font-medium text-white mb-4">This link is no longer valid</h1>
  <p className="text-sm text-gray-300 mb-6">
    Reset links expire after 1 hour and can only be used once.
  </p>
  <button
    type="button"
    onClick={() => navigate('/auth/forgot')}
    className="w-full py-2 bg-teal-600 hover:bg-teal-800 text-white rounded font-medium"
  >
    Request a new link
  </button>
  <div className="mt-4 text-center">
    <Link to="/auth" className="text-sm text-gray-400 hover:text-gray-200">
      Back to login
    </Link>
  </div>
</div>
```

**Copy is verbatim** from CONTEXT D-20:
- Heading: "This link is no longer valid"
- Body: "Reset links expire after 1 hour and can only be used once."
- Primary CTA: "Request a new link" → `/auth/forgot`
- Secondary link: "Back to login" → `/auth`

---

## Copywriting Contract

Every user-visible string in Phase 112, sourced from CONTEXT.md. Checker greps these verbatim.

| Element | Surface | Copy | Source |
|---------|---------|------|--------|
| Login link | `/auth` | "Forgot password?" | D-14 |
| Login banner (post-reset) | `/auth?reason=password_reset` | "Password reset successfully. Please sign in with your new password." | D-19 / mirrors Phase 110 |
| Forgot heading | `/auth/forgot` | "Reset your password" | discretion (CONTEXT D-16 doesn't dictate; consistent with brand voice "calm, direct, warm") |
| Forgot helper | `/auth/forgot` | "Enter your email address and we'll send you a link to reset your password." | discretion |
| Forgot label | `/auth/forgot` | "Email" | mirrors AuthPage line 101 |
| Forgot submit (idle) | `/auth/forgot` | "Send reset link" | discretion (clear action verb + noun, brand voice) |
| Forgot submit (loading) | `/auth/forgot` | "Sending…" | mirrors AuthPage "Signing in…" pattern (line 135) |
| Forgot success heading | `/auth/forgot` | "Check your inbox" | discretion |
| Forgot success body | `/auth/forgot` | "If your account exists, a reset link has been sent. The link expires in 1 hour." | **D-16 verbatim** |
| Forgot/Reset back link | both | "Back to login" | D-16, D-20 verbatim |
| Forgot rate-limit error | `/auth/forgot` | "Something went wrong. Please try again in a moment." | discretion (D-16 says "rendered as a generic banner with 'Try again later'") |
| Reset heading (form) | `/auth/reset` | "Set a new password" | discretion |
| Reset helper | `/auth/reset` | "Choose a new password for your Vigil account." | discretion |
| Reset label | `/auth/reset` | "New password" | mirrors Phase 110 SettingsPage line 384 |
| Reset show/hide aria | `/auth/reset` | "Show password" / "Hide password" | mirrors SettingsPage line 397 |
| Reset submit (idle) | `/auth/reset` | "Reset password" | discretion |
| Reset submit (loading) | `/auth/reset` | "Resetting…" | mirrors AuthPage loading-label pattern |
| Reset rate-limit error | `/auth/reset` | "Too many attempts. Please try again in a moment." | discretion |
| Reset network error | `/auth/reset` | "Something went wrong. Try again." | mirrors Phase 110 D-18 case 3 |
| Invalid-token heading | `/auth/reset` | "This link is no longer valid" | **D-20 verbatim** |
| Invalid-token body | `/auth/reset` | "Reset links expire after 1 hour and can only be used once." | **D-20 verbatim** |
| Invalid-token primary CTA | `/auth/reset` | "Request a new link" | **D-20 verbatim** |

**Brand voice check (per `reference_brand_guidelines.md`):**
- Short sentences ✓
- No productivity jargon ✓
- No ALL CAPS ✓
- Calm + direct + warm ✓
- First-person "Vigil captured this" not used (n/a — these are user-action prompts, not Vigil-narrative)

---

## State Coverage

Every page must define every state the checker expects.

### `/auth/forgot`

| State | Render |
|-------|--------|
| Idle | Form with empty email input, "Send reset link" button enabled-when-non-empty |
| Loading | Form with `disabled` input, "Sending…" button |
| Success (200) | "Check your inbox" success block (replaces form) |
| Empty input | Submit button is `disabled` while `email.trim() === ''` |
| Error (429 / 500 / network) | Inline red error banner above form; form stays submittable |

### `/auth/reset`

| State | Render |
|-------|--------|
| Mount with token | Form (State 1) |
| Mount without token | Invalid-token error block (State 2) |
| Loading (form submitting) | Form with `disabled` input, "Resetting…" button |
| Success (200) | Navigate away to `/auth?reason=password_reset` (no in-page state) |
| Invalid token (400) | Invalid-token error block (State 2) |
| Rate limit (429) | Inline red error above form; form stays mounted |
| Network / 500 | Inline red error above form; form stays mounted |
| Empty input | Submit button is `disabled` while `newPw === ''` |

### `/auth` (modified)

| State | Render |
|-------|--------|
| Idle | Existing login form + new "Forgot password?" link below password input |
| Mode = signup | "Forgot password?" link is hidden |
| `?reason=session_expired` | Existing teal-bordered banner (unchanged) |
| `?reason=password_reset` | NEW teal-bordered banner: "Password reset successfully. Please sign in with your new password." |
| Both reasons unset | No banner |

---

## Accessibility Contract

Checker validates these specific attributes/behaviors:

| Surface | Requirement | Implementation |
|---------|-------------|-----------------|
| `/auth/forgot` email input | Associated label | `<label htmlFor="email">Email</label>` + `<input id="email">` |
| `/auth/forgot` email input | Type/autocomplete | `type="email" autoComplete="email" required` |
| `/auth/reset` password input | Associated label | `<label htmlFor="rp-new">New password</label>` + `<input id="rp-new">` |
| `/auth/reset` password input | Type/autocomplete | `type="password" autoComplete="new-password" required` (type flips to `text` only on show-toggle) |
| `/auth/reset` show/hide button | Aria label | `aria-label={showPw ? 'Hide password' : 'Show password'}` (mirrors SettingsPage line 372) |
| All forms | Submit semantics | `<form onSubmit={...}>` with `type="submit"` button — supports Enter-to-submit |
| `/auth?reason=password_reset` banner | Live region | `role="status"` (matches existing `?reason=session_expired` banner at AuthPage line 93) |
| Error banners | Live region | `role="alert"` (matches SettingsPage banner pattern at line 303) |
| Focus management | Initial focus | Form inputs auto-focusable via Tab; do NOT autoFocus programmatically (mobile keyboard pop-in is intrusive — established AuthPage pattern is no autoFocus) |
| Color contrast | text-gray-50 on gray-900 | ≥ AA (existing palette already validated for AuthPage) |
| Touch targets | Buttons ≥ 44px | All buttons use `py-2` (16px vertical padding) on text-sm content → ~36px height. **Acceptable per existing AuthPage pattern** — Phase 112 is intentionally consistent with existing forms rather than introducing a new touch-target rule. |
| HTML escape | All user-provided / server-provided strings | React text rendering (auto-escaped); NO `dangerouslySetInnerHTML` anywhere on the new pages. Checker greps for absence. |

---

## Brand Application

| Brand element | Phase 112 expression |
|----------------|----------------------|
| Vigil teal `#0F6E56` (Teal 600) — primary moment | All three primary CTAs ("Send reset link", "Reset password", "Request a new link") use `bg-teal-600 hover:bg-teal-800` |
| Vigil teal `#1D9E75` (Teal 400) — accent / link | "Forgot password?" link uses `text-teal-400 hover:text-teal-300`. Banner border + tint use `border-teal-600/40 bg-teal-600/10 text-teal-200` |
| Inter font, weights 400 + 500 only | All text uses Tailwind defaults (Inter loaded by `--font-sans`). Headings use `font-medium` (500). NO `font-bold` / `font-semibold` (would be 600/700, banned by brand) |
| Voice: calm, direct, warm | All copy short-sentence, no jargon, no ALL CAPS. "Check your inbox" + "This link is no longer valid" are direct, not anxiety-inducing |
| Logo mark | NOT introduced on these auth pages (existing `/auth` doesn't display the mark either — consistent treatment) |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable (project is not shadcn-based) |
| Third-party registries | none | not applicable |

No third-party UI components introduced. All Phase 112 surfaces compose from raw HTML elements + Tailwind utilities, mirroring the established AuthPage / SettingsPage patterns. Registry safety gate is **N/A**.

---

## Cross-Phase Consistency Checks

The checker should verify these alignments with prior shipped work:

| Pattern | Source | Phase 112 verification |
|---------|--------|------------------------|
| Single-password field (no confirm) | Phase 110 D-16 + REQUIREMENTS.md Out-of-Scope | `/auth/reset` has exactly ONE password input. Grep `confirm` returns 0 in `ResetPasswordPage.tsx` |
| Show/hide eye-emoji toggle | Phase 110 D-17 + SettingsPage.tsx:395–402 | `/auth/reset` button uses `'🙈' : '👁'` and the same `aria-label` toggle wording |
| Banner pattern (auth page query-string-driven) | Phase 110 D-19 (`?reason=session_expired`) | `/auth` reads `?reason=password_reset` via the same `URLSearchParams` helper at AuthPage line 11–14, renders structurally identical banner |
| Card shell on unauthenticated pages | AuthPage.tsx:86–87 | All three Phase 112 surfaces use `min-h-screen flex items-center justify-center bg-gray-900` outer + `bg-gray-900 rounded-lg p-8 w-full max-w-md mx-4` inner |
| Brand button class | AuthPage.tsx:132 | All primary CTAs use `bg-teal-600 hover:bg-teal-800 text-white rounded font-medium disabled:opacity-50` |
| Email lowercase + trim before POST | AuthPage.tsx:40 | `/auth/forgot` submit applies `email.trim().toLowerCase()` before sending |
| No `dangerouslySetInnerHTML` | Phase 110 threat model T-110-03-04 | Grep returns 0 across new files |
| No `Object.defineProperty(window, 'location'` in tests | Phase 110 Warning 6 | Tests (when added by planner/executor) use `vi.stubGlobal` |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: all 22 strings declared, voice matches brand, D-16 + D-20 verbatim
- [ ] Dimension 2 Visuals: card shell mirrors AuthPage, no new components introduced, all states defined
- [ ] Dimension 3 Color: 60/30/10 split honored, accent reserved for the explicit 6-element list, destructive used only for error text (not buttons)
- [ ] Dimension 4 Typography: Inter only, weights 400 + 500 only, sizes drawn from existing AuthPage scale (text-2xl / text-sm / text-xs)
- [ ] Dimension 5 Spacing: all multiples of 4, mirrors AuthPage rhythm verbatim
- [ ] Dimension 6 Registry Safety: N/A (no shadcn, no third-party components)

**Approval:** pending

---

## Notes for Planner / Executor

1. **No new dependencies.** Both new pages compose entirely from React + react-router + Tailwind. The eye-toggle uses Unicode emoji glyphs (zero-dep, established pattern).

2. **Mirror, don't reinvent.** Every visual decision traces to AuthPage.tsx or SettingsPage.tsx lines 354–429. Reach for those first. New CSS classes are not expected.

3. **Reason-string contract is load-bearing.** The string `'password_reset'` must appear identically in:
   - The redirect URL produced by `/auth/reset` on success: `/auth?reason=password_reset`
   - The query-param read in `AuthPage.tsx`'s new `readPasswordResetFlag()` helper
   Any drift breaks the banner.

4. **Single-bucket error UX is non-negotiable.** Resist the temptation to differentiate "expired" vs "used" vs "missing" on `/auth/reset`. CONTEXT D-20 explicitly forbids this — the single bucket is the security feature.

5. **Form-submit gate, not auto-submit on mount.** `/auth/reset` does NOT POST anything until the user submits the form (CONTEXT D-18). Mount-time work is limited to reading the `?token=` param and toggling the `tokenInvalid` boolean if missing.

6. **Test-pattern reuse:** New page tests should follow `AuthPage.test.tsx` and `SettingsPage.test.tsx` conventions (vitest + `vi.stubGlobal`, no `Object.defineProperty(window, 'location'`).
