---
phase: 81
plan: 02
subsystem: vigil-core
tags: [oauth, google, settings, api]
requires:
  - Phase 79 eventually providing `scopes` + `accountEmail` columns on `oauth_tokens` (back-compat path added for pre-79 rows)
provides:
  - "GET /v1/google/status → { calendar, gmail, email? } with 404 on missing row (D-07)"
  - "DELETE /v1/google/tokens → { ok: true } bearer-gated (OAUTH-02)"
  - OAuth callback lands on `${PWA_URL}/settings` with `google_connected=true` / `google_error=...` (D-10, D-11)
affects:
  - vigil-core/src/routes/calendar-auth.ts
  - vigil-core/src/routes/calendar-auth.test.ts
tech_stack:
  added: []
  patterns:
    - "Hono route factory DI (statusFn, deleteFn) matches existing getTokenFn/dbUpsertFn pattern"
    - "drizzle-orm eq() for provider='google' lookups"
key_files:
  created: []
  modified:
    - vigil-core/src/routes/calendar-auth.ts
    - vigil-core/src/routes/calendar-auth.test.ts
decisions:
  - "Kept the file as calendar-auth.ts — RESEARCH.md A2 confirmed Phase 79 has NOT run yet; rename is Phase 79's scope, not 81-02's"
  - "Added /google/status + /google/tokens inside the existing createCalendarAuthRouter factory (mounted at /v1 via index.ts:72) — no new route registration needed"
  - "Back-compat for pre-Phase-79 rows: when `scopes` column is absent, report calendar=connected (row presence implies calendar.readonly was granted) and gmail=needs_auth. Phase 79 scope writer will upgrade this automatically."
  - "Auth middleware bypass `/v1/auth/google*` (index.ts:77) already excludes /v1/google/* — no index.ts change required (T-81-05 already mitigated)"
metrics:
  duration_min: 4
  completed: 2026-04-13
  tasks: 2
  files_modified: 2
  tests_added: 6
  tests_passing: 122
---

# Phase 81 Plan 02: OAuth Callback Redirect + Status/Disconnect Endpoints Summary

Redirected the Google OAuth callback to `/settings` with a renamed `google_error` param, and added `GET /v1/google/status` + `DELETE /v1/google/tokens` behind bearer auth — unblocks Plan 06's SettingsPage (empty state, connected card, disconnect flow) without waiting for Phase 79.

## What Shipped

### Task 1 — Callback redirect targets (D-10, D-11)
- All 6 `c.redirect` calls in `calendar-auth.ts` now target `${pwaBase}/settings?google_(connected|error)=...`
- Introduced `pwaBase = pwaUrlRaw.replace(/\/$/, "")` — trailing slashes on `PWA_URL` no longer produce `//settings` (T-81-06 mitigation tightened beyond the "accept" disposition)
- Renamed every `calendar_error` param key to `google_error` (PWA only reads `google_error`)
- Success path: `${pwaBase}/settings?google_connected=true` (replaces bare `c.redirect(pwaUrl)` at old line 140)
- Test file updated: `CAL-01-callback-*` assertions now check `/settings` path and `google_error`; added `81-02-D10` regression test for trailing-slash normalization.
- **Commit:** `f1358e3`

### Task 2 — Status + Disconnect endpoints (D-07, OAUTH-02, OAUTH-03)
- `GET /google/status` returns `{ calendar, gmail, email? }` (200) or `{ error: 'not_connected' }` (404) when no `oauth_tokens` row for `provider='google'` — strict 404, not 200-with-defaults, per plan's D-07 verification clause.
- `DELETE /google/tokens` deletes the `provider='google'` row and returns `{ ok: true }`. 500 on DB error.
- Both endpoints live inside the existing `createCalendarAuthRouter` factory. Router is already mounted at `/v1` (index.ts:72), so paths resolve to `/v1/google/status` and `/v1/google/tokens` automatically.
- Bearer-auth coverage verified: `index.ts:77` bypass matches only `/v1/auth/google*` (via `startsWith`), so `/v1/google/status` and `/v1/google/tokens` fall through to `bearerAuth`. T-81-05 confirmed mitigated — no index.ts change needed.
- DI hooks `statusFn?: () => Promise<GoogleStatusRow | null>` and `deleteFn?: () => Promise<void>` added to `CalendarAuthDeps` for unit tests without a live DB.
- 5 new tests: `81-02-status-404`, `81-02-status-connected` (pre-scope), `81-02-status-both-scopes` (post-79), `81-02-delete-ok`, `81-02-delete-500`.
- **Commit:** `6169b1b`

## Acceptance Criteria vs Plan

| Criterion | Status |
|-----------|--------|
| ≥3 `/settings?google_(connected|error)` occurrences | 6 occurrences |
| `grep -c '/settings?google_connected=true'` ≥1 | Match (1 exact hit) |
| Zero bare `c.redirect(pwaUrl)` | Verified (grep returns 0) |
| Zero `calendar_error` in `src/routes/` | Verified (only a negative-assertion regex `calendar[_]error` remains in tests) |
| `cd vigil-core && npm run build` | Exit 0 |
| `router.delete('/google/tokens'` present | Present |
| `router.get('/google/status'` present | Present |
| Bearer bypass does NOT match `/v1/google/*` | Confirmed — `startsWith("/v1/auth/google")` only |
| Status 404 on missing row | Verified in source + test `81-02-status-404` |
| `rows.length === 0` → 404 grep check | Match |
| Response shape matches D-07 `{ calendar, gmail, email? }` | Verified |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Stale `pwaUrl` variable reference after rename**
- **Found during:** Task 1 (my rename of `pwaUrl` → `pwaBase`)
- **Issue:** Two sites in the success/catch tail still referenced the old variable name, which would have been a TS build error.
- **Fix:** Rewrote both to use `${pwaBase}/settings?...`
- **Files modified:** `vigil-core/src/routes/calendar-auth.ts`
- **Commit:** `f1358e3`

**2. [Rule 2 — Missing critical functionality] Pre-Phase-79 schema back-compat for status endpoint**
- **Found during:** Task 2 preflight
- **Issue:** Plan's reference code for `/google/status` reads `row[0].scopes` and `row[0].accountEmail`, but the current `oauth_tokens` schema has NEITHER column — Phase 79 ships them. A literal transcription of the reference code would emit a TS error and always produce `gmail: 'needs_auth'` + `calendar: 'needs_auth'` (i.e., the connected state would be unreachable until Phase 79 lands, breaking OAUTH-03 for anyone already connected via Phase 74's pre-existing OAuth).
- **Fix:** Treated `scopes` / `accountEmail` as optional on the row type, cast to a TS-unknown shape, and added a back-compat branch: when `granted.length === 0`, report `calendar='connected'` (row presence implies calendar scope) and `gmail='needs_auth'`. Once Phase 79 writes the scopes array, `granted.length > 0` takes over automatically — no code change needed then.
- **Files modified:** `vigil-core/src/routes/calendar-auth.ts`
- **Commit:** `6169b1b`
- **Documented for Phase 79:** the scopes writer must upsert the full requested scope list on every callback; otherwise the back-compat branch keeps reporting `gmail=needs_auth` indefinitely after Phase 79 ships.

**3. [Rule 2 — Correctness] Trailing-slash normalization added even though T-81-06 is marked "accept"**
- **Found during:** Task 1
- **Issue:** Threat model accepts the open-redirect via operator-controlled `PWA_URL`, but allowing `//settings` artifacts would break the `/settings` route match on the PWA side (React Router treats `//` specially) and could mask misconfiguration.
- **Fix:** `pwaBase = pwaUrlRaw.replace(/\/$/, "")` before every concat. Added `81-02-D10` test asserting `PWA_URL=http://localhost:5173/` produces `http://localhost:5173/settings?...`, not `http://localhost:5173//settings?...`.

### Auth Gates
None. Plan is fully autonomous.

## Test Results

```
tests 122
suites 5
pass  122
fail  0
```

Plan-specific additions: 6 new tests (1 in Task 1, 5 in Task 2). All pre-existing tests still pass; only updates were to the CAL-01 callback suite to reflect the D-10 path change and D-11 param rename.

## Known Stubs

None. All endpoints return live data (DB-backed by default; DI-overridable for tests).

## Deferred Items

- **Rename `calendar-auth.ts` → `google-auth.ts`** — explicitly Phase 79's scope (per plan's Task 1 read-first). Not done here.
- **`scopes` + `accountEmail` columns on `oauth_tokens`** — Phase 79 ships these; status endpoint back-compat branch handles the interim.
- **Scope-aware gmail reporting** — currently always `needs_auth` until Phase 79 upgrades `/auth/google` to request `gmail.readonly` AND writes `scopes` on the oauth row.

## Threat Flags

None. All routes stay behind the existing `/v1/*` bearer-auth middleware (except the public `/auth/google*` OAuth flow, unchanged). No new trust boundaries introduced.

## Files Modified

| File | Change |
|------|--------|
| `vigil-core/src/routes/calendar-auth.ts` | 6 redirect target updates, +2 routes (`/google/status`, `/google/tokens`), +2 DI hooks, +`eq` import |
| `vigil-core/src/routes/calendar-auth.test.ts` | Updated CAL-01 assertions, +6 new tests |

## Commits

- `f1358e3` — feat(81-02): redirect OAuth callback to /settings with google_error param
- `6169b1b` — feat(81-02): add GET /v1/google/status and DELETE /v1/google/tokens

## Self-Check: PASSED

- `vigil-core/src/routes/calendar-auth.ts` — FOUND
- `vigil-core/src/routes/calendar-auth.test.ts` — FOUND
- Commit `f1358e3` — FOUND
- Commit `6169b1b` — FOUND
- 122/122 tests passing — VERIFIED
- `npx tsc` clean — VERIFIED
