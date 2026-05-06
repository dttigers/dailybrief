# Phase 117: Auth-email rate-limit UX hardening - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Auth-email rate-limit UX hardening across **3 of 4 endpoints** that surface a UI bucket for `429` (rate-limited) responses, plus per-endpoint cap tuning so legitimate retry patterns from a household-NAT IP don't trip the limit.

**In scope:**
- Server: raise rate-limit caps (per AUTH-13) on all 4 endpoints
- Server: existing `Retry-After` header behavior preserved on the 3 endpoints that already return 429
- PWA: extend `classifyFetchError` with a new `rate-limited` bucket
- PWA: render distinct 429 copy + live mm:ss countdown + disabled Submit on `VerifyEmailPage`, `ResetPasswordPage`, and `SettingsPage` (Resend Verification button)
- Tests: server cap-raise + PWA bucket-split + countdown-cleanup-on-unmount

**Out of scope:**
- Forgot-password 429 PWA copy — `forgot-password` deliberately returns 200-enum-safe on rate-limit (D-03 from Phase 112) to prevent oracle leak. Per SC#3 enumeration safety must be preserved. PWA forgot-password page UI is unchanged.
- Token-rotation copy ("This link was replaced by a newer email") — explicitly deferred as **SEED-004** per PROJECT.md.

</domain>

<decisions>
## Implementation Decisions

### Forgot-password tension (Area 1)
- **D-01:** `forgot-password` keeps 200-enum-safe behavior on rate-limit. AUTH-12's "render 429 copy" applies to 3 endpoints only (`verify-email`, `resend-verification`, `reset-password`). SC#3 (enumeration safety unchanged) is satisfied trivially because forgot-password's response shape doesn't change.
- **D-02:** PWA `ForgotPasswordPage.tsx` keeps existing generic success copy (`"If an account exists, we sent a reset link."`). Phase 117's PWA work targets only the 3 pages where 429 surfaces.

### Rate-limit cap policy (Area 2 — AUTH-13)
- **D-03:** `verify-email` + `reset-password`: raise per-IP cap from `5/hr` to `20/hr` sliding window. **No new axis** added (per-IP only). Tolerates ~4-user household NAT while still hard-blocking abuse patterns. Mirrors the existing `vigil-core/src/routes/reset-password.ts:48-87` and `vigil-core/src/routes/verify-email.ts:34-39` shape — only the `RATE_LIMIT_MAX` constant changes.
- **D-04:** `resend-verification`: raise per-userId cap from `3/hr` to `5/hr`. Constant change in `vigil-core/src/routes/resend-verification.ts:31`. No new axis.
- **D-05:** `forgot-password`: per-IP raised `5/hr` → `20/hr`; per-email stays at `5/hr` (preserves enum-safety defense — a single email getting 5+ attempts/hr is still suspicious). Both axes still trigger 200-enum-safe response.

### Countdown UX (Area 3)
- **D-06:** Live mm:ss countdown matches Phase 116.1 pattern from `vigil-pwa/src/pages/SettingsPage.tsx` (per-key timer refs in component state, decrement every 1s, clear on unmount, Submit button disabled while `countdown > 0`, re-enables at 0).
- **D-07:** Pages affected:
  - `vigil-pwa/src/pages/VerifyEmailPage.tsx` — handles `verify-email` endpoint 429
  - `vigil-pwa/src/pages/ResetPasswordPage.tsx` — handles `reset-password` endpoint 429
  - `vigil-pwa/src/pages/SettingsPage.tsx` — handles `resend-verification` endpoint 429 (Resend Verification button at line 518)
- **D-08:** 429 copy string is unified across the 3 pages: **`"Too many attempts — try again in {countdown}."`** where `{countdown}` is replaced by live `Xm Ys` (e.g., `"4m 32s"`).
- **D-09:** SettingsPage Resend Verification button uses the same disabled+countdown pattern as VerifyEmailPage/ResetPasswordPage. Single visual standard across the app.

### Bucket-split mechanics (Area 4)
- **D-10:** Extend Phase 116.1's `classifyFetchError` (in `vigil-pwa/src/api/client.ts`) with a 5th bucket: `rate-limited` triggered on `res.status === 429` with parsed `retryAfter` from response body or `Retry-After` header. Single helper used across sports + auth + future error-bucket UIs.
- **D-11:** PWA buckets distinguished for these auth flows:
  - **rate-limited** (status=429) → new countdown copy (D-08)
  - **token-expired/invalid** (status=410 / other 4xx) → existing `"This link is no longer valid"` copy stays
  - validation-error (400) and network/server-error buckets are out of scope (existing handling stays as-is)
- **D-12:** SEED-004 token-rotation copy ("This link was replaced by a newer email") stays deferred. Adding it would require server-side cause-tracking that doesn't exist yet, plus a 6th bucket — doubles test surface for marginal UX win.

### Claude's Discretion
- Exact placement of countdown text within each page's error block (above/below the message, badge vs inline text) — UI designer's call during planning, anchored by the Phase 116.1 SettingsPage style
- Whether to extract the countdown component into a shared `<RateLimitCountdown>` component or inline it per page (depends on prop/state shape)
- Test fixture shape for the new `rate-limited` bucket in `classifyFetchError` tests — match existing bucket-test pattern from Phase 116.1

### Folded Todos
None — no pending todos matched phase 117.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Server endpoints (current state to mutate)
- `vigil-core/src/routes/verify-email.ts` §§34-39 — per-IP `RATE_LIMIT_MAX = 5` constant; raise to 20
- `vigil-core/src/routes/reset-password.ts` §§48-87 — per-IP rate-limit shape (mirrored from resend-verification per its comment); raise `RATE_LIMIT_MAX` to 20
- `vigil-core/src/routes/resend-verification.ts` §§31-56 — per-userId `RATE_LIMIT_MAX = 3` constant; raise to 5
- `vigil-core/src/routes/forgot-password.ts` §§42-82 — dual-axis (per-IP `RATE_LIMIT_MAX = 5` + per-email same), raise per-IP to 20, keep per-email at 5; D-03/D-04 enum-safety comments explain why 200 returned not 429
- `vigil-core/src/middleware/rate-limit.ts` — global Map-based sliding-window pattern; auth endpoints implement their own per-route version mirroring this shape (do not modify global)

### PWA pages (current state to extend)
- `vigil-pwa/src/api/client.ts` — `classifyFetchError` helper from Phase 116.1; extend with `rate-limited` bucket (status=429 + retryAfter)
- `vigil-pwa/src/pages/VerifyEmailPage.tsx` — landing page for verify-email link tap; current 410-vs-429 lumping
- `vigil-pwa/src/pages/ResetPasswordPage.tsx` — landing page for reset-password link tap; same lumping issue
- `vigil-pwa/src/pages/SettingsPage.tsx` §§518 + countdown pattern — resend-verification call site + canonical countdown UX implementation (Phase 116.1)

### Requirements + roadmap
- `.planning/REQUIREMENTS.md` — AUTH-12 (PWA copy + countdown on 4 endpoints), AUTH-13 (cap policy tuning)
- `.planning/ROADMAP.md` §"Phase 117: Auth-email rate-limit UX hardening" — 4 success criteria
- `.planning/PROJECT.md` §"Last updated 2026-04-30" — SEED-004 deferral context

### Prior phase patterns
- Phase 116.1 SUMMARY (`*116.1-03-SUMMARY.md`) — countdown timer + disabled Submit + cleanup-on-unmount notes
- Phase 116.1 SUMMARY (`*116.1-01-SUMMARY.md`) — `Retry-After` parsing pattern (parseInt + 1..86400 range guard) — reuse on PWA side when reading the header

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`classifyFetchError`** (`vigil-pwa/src/api/client.ts`, Phase 116.1) — extend with `rate-limited` bucket; consumers already destructure `{ kind, retryAfter }` for sports
- **Countdown timer pattern** (`SettingsPage.tsx`, Phase 116.1) — per-key (here: per-page) timer ref, 1s decrement, cleanup on unmount, disabled-while-countdown side effect
- **Retry-After parser with 1..86400 range guard** (`vigil-core/src/services/sports-service.ts` UpstreamError class) — reuse parsing semantics on the PWA side when reading `Retry-After` from auth 429 responses

### Established Patterns
- **Per-route rate-limit constants** — each auth route has its own `RATE_LIMIT_MAX` constant (mirrored from `reset-password.ts`); raise these per D-03/D-04/D-05. Do NOT add a shared "auth rate-limit" middleware in this phase — would change the structural shape and increase risk.
- **Sliding-window in-process Map** — pattern used by all 4 endpoints. Single-instance memory only (multi-instance not addressed in 117 — out of scope; if vigil-core scales horizontally later, this becomes a separate phase).
- **200-enum-safe response on rate-limit (forgot-password only)** — D-03 from Phase 112; preserved.

### Integration Points
- PWA `vigilFetch` wrapper in `client.ts` — already returns Response; no signature change needed. `classifyFetchError` consumes Response.
- VerifyEmailPage + ResetPasswordPage: no current bucket-split — they currently render generic copy on any error. Phase 117 introduces per-bucket render branches mirroring SettingsPage.tsx's existing per-bucket render.
- SettingsPage `handleResendVerification` (line 518) — wrap response handling with `classifyFetchError` + new bucket UI; currently shows opaque error.

</code_context>

<specifics>
## Specific Ideas

- Phase 116.1's mm:ss countdown is the visual + interaction standard — `"Try again in 4m 32s"` ticking. Disabled button while > 0. Re-enables at 0 with no automatic re-fire.
- `Retry-After` header is already returned by 3 of 4 server endpoints (verify-email, reset-password, resend-verification). PWA should prefer header over body field for retryAfter source-of-truth, fall back to body's `retryAfter` field if header absent.
- D-21 misdirection from Phase 113: VerifyEmailPage's current "This link is no longer valid" lumps 410-expired and 429-rate-limited together. The split is the primary deliverable of AUTH-12.
- Goal-text phrasing — `"Too many attempts — try again in N minutes"` was the original AUTH-12 spec; we narrowed to `"Too many attempts — try again in {countdown}."` for unification with Phase 116.1 mm:ss format. Substantive content unchanged.

</specifics>

<deferred>
## Deferred Ideas

- **SEED-004** — Token rotation copy differentiation ("This link was replaced by a newer email" vs time-expired vs 429). Requires server-side cause-tracking that doesn't exist yet. Adds a 6th bucket. Per PROJECT.md last update, kept deferred for a future milestone.
- **Per-endpoint 429 copy variants** — Considered ("Verification request rate-limited..." vs "Password reset rate-limited..."). Rejected in favor of single unified copy string (D-08).
- **Static "try again in N minutes" non-ticking copy** — Considered as a simpler alternative to live countdown. Rejected in favor of Phase 116.1 mm:ss live pattern (D-06).
- **Validation-error (400) bucket on PWA** — Useful for ResetPasswordPage password-strength feedback but not in AUTH-12 scope. Existing 400-handling stays as-is.
- **Network/server-error generic retry bucket on auth pages** — Defensive but out of scope.
- **Multi-instance shared rate-limit store** — Current rate-limit is in-process Map, single-instance only. If vigil-core scales horizontally, this becomes a separate phase (likely Redis-backed).
- **Cooldown UI on AuthPage (login/register)** — Probably no auth-email endpoints called from there. Confirm during planning; if so, fold; if not, leave deferred.

</deferred>

---

*Phase: 117-auth-email-rate-limit-ux-hardening*
*Context gathered: 2026-04-30*
