# Phase 102 Deploy + UAT Runbook

This is the one document to follow on deploy day for Phase 102.

## Pre-deploy checklist (local)

- [ ] Wave 1-4 plans all marked complete in STATE.md
- [ ] `cd vigil-core && npm test` GREEN (all tests pass; note the EADDRINUSE file-level quirk — run `src/integration/cross-user-isolation.test.ts` in isolation if the full-suite run reports it)
- [ ] `cd vigil-core && docker build -t vigil-core-102-final .` succeeds
- [ ] `cd vigil-core && npx tsc --noEmit` is 0 errors
- [ ] `.env.local` has JWT_SECRET + VIGIL_ALLOWED_EMAILS set (so you can smoke-test the full flow)
- [ ] Against a local Postgres: `npm run db:migrate-102` runs cleanly twice (idempotency)
- [ ] Cross-user isolation integration test is 11/11 GREEN against local Postgres (isolated-run invocation: `npx tsx --test --test-force-exit src/integration/cross-user-isolation.test.ts`)
- [ ] `cd vigil-core && npm run build && test -f dist/scripts/migrate-102-seed.js` — ensures the new Dockerfile CMD can find the compiled seed script (plan-checker Warning 3 gate)

## Railway env var configuration

Go to https://railway.app → vigil-core project → Variables tab. Add (if missing):

- [ ] `JWT_SECRET` = `<output of openssl rand -hex 32>` (64 hex chars)
- [ ] `VIGIL_ALLOWED_EMAILS` = `jamesonmorrill1@gmail.com`
- [ ] `VIGIL_SEED_USER_EMAIL` = `jamesonmorrill1@gmail.com` (optional — default matches)

## Deploy

- [ ] Railway → Settings → scale to 0 replicas
- [ ] `git push` the Phase 102 merge to main
- [ ] Wait for Railway to build; watch the build logs for `@node-rs/argon2-linux-x64-musl` resolving (no node-gyp errors — Pitfall 1 gate)
- [ ] Railway → Settings → scale back to 1 replica
- [ ] Watch boot logs for:
  - `[migrate-102-seed] seed user row ensured for jamesonmorrill1@gmail.com`
  - `[migrate] Running migrations...` → `[migrate] Migrations complete`
  - `Vigil Core API running on port 3001`
  - `[generate-scheduler] started (60s tick interval)`
  - `[gmail-workorders] started (5m tick interval)`

If ANY of these lines is missing from the boot logs, STOP — rollback via Railway UI before running the curl gate.

## Go/no-go verification

The operational gate for Phase 102 is `curl https://api.vigilhub.io/v1/summary` with the seed user's `vk_` bearer returning a 200. If this fails, rollback.

- [ ] Run: `curl -si https://api.vigilhub.io/v1/summary -H "Authorization: Bearer vk_94ec..." | head -3`
- [ ] Expected: `HTTP/2 200` with seed-user summary data
- [ ] Record the exact curl output in `102-05-SUMMARY.md`

If the response is not a 200:

- `401 {"error":"Server misconfiguration"}` → an `api_keys` row has NULL `user_id`. Fix:
  ```sql
  UPDATE api_keys SET user_id = (SELECT id FROM users WHERE email = 'jamesonmorrill1@gmail.com') WHERE user_id IS NULL;
  ```
- `503` → DB unreachable → investigate Railway Postgres health, rollback if sustained.
- Anything else → rollback via Railway UI (redeploy the previous commit); record the response body verbatim in the summary.

## Client smoke (verify no regressions)

- [ ] Open PWA at app.vigilhub.io → Thoughts tab loads → brief-history tab loads
- [ ] Context menu (Phase 101) — right-click a thought row → 5 menu items → Edit opens editor (D-19 interlock: `vigil:edit-started` fires)
- [ ] Edit-refresh pause (Phase 100) — open edit on a row → wait 30s → editor does NOT get overwritten
- [ ] Monitor menubar on iMac still shows the latest brief time (polls every 5m)
- [ ] `dailybrief --help` on Mac CLI returns its normal help text
- [ ] G2 plugin screens still load when connected (skip if no physical device access; memory note flags ~2026-04-24 retest window)

## Claim flow + login (NEW — Phase 102 headline)

- [ ] `curl -X POST https://api.vigilhub.io/v1/auth/register -H "Content-Type: application/json" -d '{"email":"jamesonmorrill1@gmail.com","password":"<chosen-password-min-12-chars>"}'`
  → expected: `201 {"id":..., "email":"jamesonmorrill1@gmail.com", "claimed": true}`
- [ ] Second attempt with same email + different password
  → expected: `409 {"error":"Unable to register with those credentials"}`
- [ ] `curl -X POST https://api.vigilhub.io/v1/auth/login -H "Content-Type: application/json" -d '{"email":"jamesonmorrill1@gmail.com","password":"<chosen-password>"}'`
  → expected: `200 {"token":"eyJ...", "user":{"id":..., "email":"..."}}`
- [ ] `curl -H "Authorization: Bearer <JWT from above>" https://api.vigilhub.io/v1/summary`
  → expected: `200` with seed-user summary (JWT path works end-to-end)

## Rollback plan (if go/no-go fails)

- [ ] Railway → Deployments → find last known-good deploy → "Redeploy"
- [ ] Migration 0012 does NOT auto-revert. To revert schema: run `scripts/revert-0012.sql` (author at rollback time; safer to roll forward with a hot-fix).
- [ ] Post-rollback curl: verify `vk_` key returns 200 on `/v1/summary`.
- [ ] If rollback restores the previous schema state (pre-0012), any rows inserted by the forward deploy's schedulers during the outage will have a `user_id` that becomes dangling — not a correctness problem at current scale (1 replica, 1 user) but flag for investigation if a future deploy hits this path.

## Post-deploy

- [ ] STATE.md updated: `status: verifying` → `status: complete` after UAT passes
- [ ] ROADMAP.md checkboxes: AUTH-01..05 all [x]
- [ ] REQUIREMENTS.md traceability table: AUTH-01..05 status = Complete
- [ ] Record chosen `<password>` in 1Password (not in git)
- [ ] Revert seed user password to placeholder if you want to re-test claim-flow on the next deploy (optional):
  ```bash
  psql $DATABASE_URL -c "UPDATE users SET password_hash = '\$argon2id\$v=19\$m=19456,t=2,p=1\$UExBQ0VIT0xERVJTQUxU\$UExBQ0VIT0xERVJIQVNISEFTSEhBU0hIQVNISEFTSEhBU0hIQVNISEFTSEhBUw' WHERE email = 'jamesonmorrill1@gmail.com';"
  ```
  (This is the D-11 placeholder hash pinned in `scripts/migrate-102-seed.ts` — prefix-detectable for claim-flow; `argon2.verify()` always returns false.)
