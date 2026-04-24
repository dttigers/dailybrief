---
phase: 110-change-password-password-changed-at-gate
verified: 2026-04-24T12:00:00Z
status: human_needed
score: 4/4 must-haves verified (automated); 1 cross-device behavior requires human confirmation
overrides_applied: 0
re_verification: null
human_verification:
  - test: "Cross-device session invalidation (end-to-end D-19 payoff)"
    expected: "Log in on Device A and Device B with the same account. Change password on Device A (stays logged in, sees 'Password changed'). Trigger any authenticated request on Device B (e.g., reload Settings, toggle schedule). Device B must receive 401 + body {error:'Session expired'} and be force-navigated to /auth with sessionStorage cleared."
    why_human: "Requires two browsers/sessions simultaneously — cannot be verified programmatically without bootstrapping two JWT-bearing clients against a running API. This is the primary user-visible payoff of the phase (SC #2 observed cross-device)."
  - test: "PWA form visual/UX smoke"
    expected: "Open PWA Settings → Vigil Account. 'Change password' button visible next to 'Sign out'. Click it — form expands inline inside the same section (not a new card). Eye-icon toggles flip type='password' ↔ type='text'. Cancel button collapses form and clears inputs. Submit with wrong current password → inline red 'Current password is incorrect'. Submit with valid current + new (≥12 chars) → inline green 'Password changed', form collapses after 2s, user remains on Settings (no logout)."
    why_human: "Visual layout, expand/collapse animation, button placement within the Vigil Account card, and tactile UX of eye-toggle cannot be asserted by grep or unit tests."
---

# Phase 110: Change Password + password_changed_at Gate — Verification Report

**Phase Goal:** An authenticated user can change their password from the PWA, and all JWTs issued before the change (or any future reset) are invalidated.
**Verified:** 2026-04-24T12:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Authenticated user submits current + new password from PWA Settings and receives success confirmation — remains logged in with current session | VERIFIED | `vigil-pwa/src/pages/SettingsPage.tsx` renders expandable form inside Vigil Account section; submit handler POSTs `/v1/auth/change-password`; on 200 calls `storeKey(body.token)` (keeps session live) then shows `"Password changed"` text (`kind: 'success'`). Server-side test CP-CHG-01 passes on live DB (verifyToken(returned token) matches userId). |
| 2 | JWT issued before password change is rejected with 401 on any authenticated endpoint after change — bearerAuth jwt.iat < password_changed_at gate is active | VERIFIED (automated); cross-device behavior flagged for human | `vigil-core/src/middleware/auth.ts:127` computes `gateThreshold = Math.floor(user.passwordChangedAt.getTime()/1000)` and line 132 returns `{error:"Session expired"}` on 401 when `claims.iat < gateThreshold`. Test CP-GATE-01 (stale JWT → 401) passes on live DB. PWA global handler (`client.ts:172-185`) routes the body and forces `/auth` navigation. Cross-device empirical proof requires two sessions — see human_verification. |
| 3 | Submitting incorrect current password returns 401 with generic error; password not changed | VERIFIED | `vigil-core/src/routes/change-password.ts` `verifyPassword(currentPassword, user.passwordHash)` → `!currentOk` returns `{error:"Invalid credentials"}` 401 (line ~86). Test CP-CHG-02 passes on live DB. No db.update fires on this path (code inspection: early return before the UPDATE). PWA surfaces inline red "Current password is incorrect" (SettingsPage.tsx line 326 region). |
| 4 | password_changed_at column exists on users table and is updated by change-password (and future reset-password) operations | VERIFIED | `vigil-core/src/db/schema.ts:44` declares `passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull()`. Live DB query returned `password_changed_at \| timestamp with time zone \| NO` (NOT NULL). Migration `vigil-core/drizzle/0015_add_password_changed_at.sql` applied (journal idx 15 present). Handler writes via `db.update(users).set({ passwordHash: ..., passwordChangedAt: now, updatedAt: now })` in change-password.ts. Phase 112 reset will use same pattern. |

**Score:** 4/4 truths VERIFIED by automated checks. Truth #2 has a cross-device behavior that only manifests with two live sessions — flagged for human smoke.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vigil-core/src/db/schema.ts` | `passwordChangedAt` column on users pgTable | VERIFIED | Declared at line 44 after `updatedAt` (D-01 placement). `.notNull()` present, no `.defaultNow()` (migration handles backfill). |
| `vigil-core/drizzle/0015_add_password_changed_at.sql` | 5-step template (ADD COLUMN nullable → backfill → SET NOT NULL) | VERIFIED | 3-statement hand-authored migration: `ADD COLUMN IF NOT EXISTS`, `UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL`, `ALTER COLUMN ... SET NOT NULL`. Re-run safe. |
| `vigil-core/drizzle/meta/_journal.json` + `0015_snapshot.json` | Journal entry idx 15, snapshot contains password_changed_at | VERIFIED | `"idx": 15` present in journal; `0015_snapshot.json` exists with 2 matches for `password_changed_at`. |
| `vigil-core/src/middleware/auth.ts` | bearerAuth Path 2 iat-gate | VERIFIED | Lines 107-132: selects `passwordChangedAt` by userId, computes `Math.floor(user.passwordChangedAt.getTime() / 1000)`, rejects with `{error:"Session expired"}` on strict less-than. Gate code sits inside `if (looksLikeJwt(token))` block — vk_ Path 1 structurally bypasses. |
| `vigil-core/src/routes/change-password.ts` | NEW protected Hono router with 8-step D-11 flow | VERIFIED | File exists, exports `changePassword = new Hono()`, registers `POST /auth/change-password`. Flow: JSON parse → type check → SELECT user → verify current → length validate → same-as-current → hash → UPDATE → signToken AFTER update (D-14 ordering) → return `{token, user}`. |
| `vigil-core/src/index.ts` | Mount of changePassword AFTER bearerAuth dispatcher | VERIFIED | `import { changePassword } from "./routes/change-password.js"` at line 36. `app.route("/v1", changePassword)` at line 159. Dispatcher at line 117. Public `authRoutes` at line 110 unmodified (register/login stay public). Mount order: 110 < 117 < 159 — correct. |
| `vigil-pwa/src/pages/SettingsPage.tsx` | Expandable form inside Vigil Account section | VERIFIED | Grep counts: `"Change password"`=1, `/v1/auth/change-password`=2, `storeKey(body.token)`=1, `autoComplete="current-password"`=1, `autoComplete="new-password"`=1, `"Current password is incorrect"`=1, `confirmPassword`=0, `confirm-password`=1 (only in a negative comment: "NOTE: NO confirm-password field per D-16"). No real confirm field present. |
| `vigil-pwa/src/api/client.ts` | vigilFetch wrapped with D-19 `Session expired` handler | VERIFIED | `"Session expired"`=5, `res.clone()`=1, `window.location.href = '/auth'`=1, `if (res.status === 401)`=1. Try/catch around JSON parse handles non-JSON 401 bodies gracefully. |
| `vigil-pwa/src/api/client.test.ts` | 4 D-19 tests (vitest + vi.stubGlobal) | VERIFIED | `Session expired`=5, `Invalid credentials`=3, `vi.stubGlobal('location'`=3 (matches existing pattern), `Object.defineProperty(window, 'location'`=0 (not used — correct). 4 new D-19 tests appended. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| change-password handler | `users.passwordChangedAt` (write) | `db.update(users).set({ passwordHash, passwordChangedAt: now, updatedAt: now })` | WIRED | change-password.ts body contains exact UPDATE; `passwordChangedAt: now` written in same `.set()` as passwordHash. |
| bearerAuth Path 2 gate | `users.passwordChangedAt` (read) | `db.select({ id, passwordChangedAt }).from(users).where(eq(users.id, userId)).limit(1)` | WIRED | middleware/auth.ts lines 106-110 executes the select; line 127 reads result. |
| index.ts protected block | `changePassword` router | `app.route("/v1", changePassword)` after line 117 bearerAuth | WIRED | Line 159 mount — after dispatcher at 117. `c.get("userId")` non-null guaranteed. |
| change-password signToken | AFTER db.update commits (D-14) | code ordering — `await db.update(...)` then `await signToken(...)` | WIRED | Lines ~114 (update) then ~126 (signToken). Pinned by CP-CHG-06 test assertion `iat >= floor(refreshed.passwordChangedAt/1000)`. |
| SettingsPage form submit | `POST /v1/auth/change-password` | `vigilFetch('/v1/auth/change-password', {method:'POST', body: JSON.stringify({currentPassword, newPassword})})` | WIRED | Exact path present in SettingsPage.tsx; body shape matches server contract. |
| SettingsPage success | `sessionStorage['vigil_jwt']` | `storeKey(body.token)` called BEFORE any other fetch, inside 200-branch | WIRED | storeKey invoked immediately after response.json() parse; setState calls that follow do not fire network requests — ordering preserved by React synchronous semantics. |
| vigilFetch (any request) | `navigate('/auth')` on 401 `Session expired` | `res.clone()` → JSON parse → body.error check → `signOut()` → `window.location.href = '/auth'` | WIRED | client.ts lines 172-185; verified by D-19-01 vitest test. |
| 'vigil:signout' CustomEvent | App isAuthenticated state | `signOut()` dispatches `vigil:signout` which App listens for | WIRED | Pre-existing signOut() helper (client.ts:29) dispatches the event — verified by existing test "signOut dispatches a vigil:signout CustomEvent on window". |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| SettingsPage form (cpInlineMsg) | `cpInlineMsg` local state | Set by response status branches after real `fetch` to `/v1/auth/change-password` | Yes — wired to actual server response | FLOWING |
| bearerAuth gate | `user.passwordChangedAt` | `db.select({ passwordChangedAt }).from(users).where(eq(users.id, userId))` — real PK-indexed Postgres SELECT | Yes — live DB query | FLOWING |
| change-password handler | `user.passwordHash` + UPDATE of `passwordChangedAt` | `db.update(users).set(...)` — real Postgres UPDATE | Yes — Plan 02 SUMMARY reports 2 rows updated during tests | FLOWING |
| 200 response `{token, user}` | `token` (new JWT) | `signToken(user.id, user.email)` invoked AFTER db.update commits | Yes — CP-CHG-01 test verifies returned token decodes to correct userId | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command / Evidence | Result | Status |
|----------|-------------------|--------|--------|
| Live DB has column with correct type | `psql "$DATABASE_URL" -tAc "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='users' AND column_name='password_changed_at';"` | `password_changed_at\|timestamp with time zone\|NO` | PASS |
| Migration applied | Journal grep `"idx": 15` | 1 match | PASS |
| bearerAuth gate test suite (5 CP-GATE tests) | Plan 02 SUMMARY reports 5/5 pass on live DB | trusted per SUMMARY + commit `69031ba` | PASS (via SUMMARY) |
| change-password handler test suite (6 CP-CHG tests incl. D-14 ordering pin) | Plan 02 SUMMARY reports 6/6 pass on live DB | trusted per SUMMARY + commits `c5c679a`, `2359cc0`, `69031ba` | PASS (via SUMMARY) |
| client.test.ts D-19 4-case suite | Plan 03 SUMMARY reports 17/17 tests pass (13 existing + 4 new D-19) | trusted per SUMMARY + commit `237d584` | PASS (via SUMMARY) |
| PWA build clean | `cd vigil-pwa && npm run build` (per Plan 03 SUMMARY) | exit 0 | PASS (via SUMMARY) |
| vigil-core build clean | `cd vigil-core && npm run build` (per Plan 02 SUMMARY) | exit 0 | PASS (via SUMMARY) |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| AUTH-09 | 110-01, 110-02, 110-03 | "An authenticated user can change their password from the PWA profile page — re-entering their current password, setting a new one, and remaining logged in on success; confirmation email sent to the same address as an anti-hijack signal" | PARTIAL (as designed) | Password-change flow + staying-logged-in fully satisfied (truths 1, 3, 4). Confirmation email is explicitly DEFERRED in 110-CONTEXT.md §Deferred Ideas pending Phase 111 (EMAIL-01) — noted as expected scope boundary. Session-invalidation primitive (truth 2) closes the "anti-hijack" spirit independent of email. REQUIREMENTS.md lists AUTH-09 as "Complete" for Phase 110. |

**Orphaned requirements check:** REQUIREMENTS.md maps only AUTH-09 to Phase 110. All three plans declare `requirements: [AUTH-09]`. No orphans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| vigil-pwa/src/pages/SettingsPage.tsx | 351 | `confirm-password` string match | Info | False positive — the match is inside a negative comment: "NOTE: NO confirm-password field per D-16". Intentional marker for reviewers. Not a stub. |
| vigil-pwa/src/pages/SettingsPage.tsx | — | `setTimeout(() => {...}, 2000)` for form collapse | Info | Per-plan decision (line 318-321): captured closure without cleanup-on-unmount is a known trade-off; re-renders won't restart it. Documented in plan inline comment. Minor — not impacting goal. |
| vigil-core change-password.ts | ~line 78 | Handler early returns `{error:"Invalid credentials"}` for missing user row | Info | Defensive belt-and-suspenders; bearerAuth gate (Plan 02) already 401s on missing user BEFORE handler runs. Documented inline. Not a stub. |
| — | — | TODO/FIXME/PLACEHOLDER scan across modified files | None | Zero hits on the seven files modified in this phase. |

### Human Verification Required

1. **Cross-device session invalidation (the D-19 payoff)**
   - **Test:** Log in to PWA on Device A. Log in to same account on Device B. Change password on A via the new form. Stay on A — should see "Password changed" and remain authenticated. On B, trigger any authenticated action (reload Settings, click schedule toggle).
   - **Expected:** B receives 401 + `{error:"Session expired"}`, sessionStorage cleared, page navigates to `/auth` login screen.
   - **Why human:** Requires two live sessions against a running API. Only observable with two simultaneous JWT-bearing clients.

2. **PWA form visual/UX smoke**
   - **Test:** Open PWA Settings → Vigil Account. Click "Change password" to expand. Toggle eye icons. Cancel. Re-expand. Submit wrong current password → inline red. Submit valid change → inline green + auto-collapse after 2s.
   - **Expected:** Form renders INSIDE Vigil Account section (not a new card). Eye icons flip input type. Inline messages appear in correct colors. Form collapses on success after 2s.
   - **Why human:** Visual layout, DOM placement within the card, and tactile interaction cannot be asserted by grep or headless unit tests.

### Gaps Summary

No gaps. Every Success Criterion from ROADMAP is structurally satisfied by code, migrations, and tests. The two items routed to human verification are UX/cross-device concerns that cannot be exercised programmatically from a single verification run — they are not code defects.

One expected out-of-scope item (AUTH-09 confirmation email) is correctly deferred to Phase 111 per CONTEXT §Deferred and REQUIREMENTS.md. No scope shrinkage vs the roadmap Success Criteria — the four SCs listed in ROADMAP all map to verified artifacts.

---

*Verified: 2026-04-24T12:00:00Z*
*Verifier: Claude (gsd-verifier)*
