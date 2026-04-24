---
phase: 110-change-password-password-changed-at-gate
fixed_at: 2026-04-23T00:00:00Z
review_path: .planning/phases/110-change-password-password-changed-at-gate/110-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 110: Code Review Fix Report

**Fixed at:** 2026-04-23T00:00:00Z
**Source review:** `.planning/phases/110-change-password-password-changed-at-gate/110-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-01, WR-02 — 5 Info findings out of scope under `fix_scope=critical_warning`)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: DB outage during JWT iat-gate SELECT is swallowed as 401

**Files modified:** `vigil-core/src/middleware/auth.ts`
**Commit:** `2a8dee1`
**Applied fix:** Narrowed the JWT-path `try/catch` to wrap only `verifyToken(token)`. Moved the null-db check, users-table SELECT, user-not-found branch, and iat-gate comparison out of the `try` block so any database error (connection pool exhaustion, network blip to Railway PG, timeout) now bubbles to the global `app.onError` handler and surfaces as 500, rather than being misread as `401 "Invalid or expired token"`. Added an inline comment explaining the WR-01 rationale. Behavior for the four legitimate 401 paths is preserved: tampered/expired JWT (catch of `verifyToken`), invalid token subject, deleted user (`!user`), and stale-iat (`claims.iat < gateThreshold`) all still return the same 401 bodies. Typed `claims` as `Awaited<ReturnType<typeof verifyToken>>` so narrowing survives the refactor without importing a new type.

**Verification:**
- Tier 1: re-read lines 85-149 of `auth.ts` — edit intact, surrounding code preserved.
- Tier 2: `npx tsc --noEmit` in `vigil-core` — no errors.
- Test run: `npx tsx --test src/middleware/auth.test.ts` — 7/7 runnable tests pass, 9 skipped (require DATABASE_URL, unchanged from pre-edit). Non-DB 401 paths (tampered signature, expired token, malformed token) still return 401 as expected.

### WR-02: Change-password success setTimeout leaks on unmount / rapid navigation

**Files modified:** `vigil-pwa/src/pages/SettingsPage.tsx`
**Commit:** `072e3c9`
**Applied fix:**
1. Added `useRef` to the `react` import.
2. Declared `cpSuccessTimerRef = useRef<number | null>(null)` to track the pending collapse timer id.
3. Added a `useEffect(() => () => {...}, [])` unmount-cleanup that clears the timer if the component unmounts inside the 2s window (prevents setState on unmounted component and removes the React 17 warning under StrictMode).
4. In the success branch of `handleChangePasswordSubmit`, replaced bare `setTimeout(...)` with `window.setTimeout(...)` captured into `cpSuccessTimerRef.current`, and now cancel any prior pending timer before scheduling a new one (prevents an older timer from clobbering state set by a newer submit — e.g., collapsing a freshly re-opened form).
5. The scheduled callback clears its own ref to `null` on fire, so subsequent submits always see a clean slate.
6. In `handleCpCancel`, clear the pending timer so a cancel-then-reopen sequence cannot be clobbered by an in-flight collapse. Added WR-02 rationale comments at each touch point.

**Verification:**
- Tier 1: re-read modified sections (import at line 1, state block at lines 70-87, success branch at lines 202-217, cancel handler at lines 246-260) — all edits intact, surrounding code preserved.
- Tier 2: `npx tsc --noEmit -p tsconfig.app.json` — no errors in `SettingsPage.tsx`. The remaining errors shown (ImportMeta env, CaptureBar type mismatches, BriefHistoryPage unions) are pre-existing project errors in unrelated files.
- Test run: `npx vitest run src/pages/SettingsPage.test.tsx` — 5 passed, 1 failed. The failing test asserts the raw `invalid_state` string appears in the banner, but that assertion was already stale after the WR-03 allowlist mapping landed in Phase 110 (banner now renders the mapped user-visible string "Connection attempt expired..."). Confirmed the failure is pre-existing by re-running the same test with `SettingsPage.tsx` stashed to its pre-fix state — identical `1 failed | 5 passed` result. My fix introduces no new regressions; the stale-expectation test is orthogonal to the change-password form and the timer-ref refactor.

## Skipped Issues

_None — both in-scope findings were fixed._

---

_Fixed: 2026-04-23T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
