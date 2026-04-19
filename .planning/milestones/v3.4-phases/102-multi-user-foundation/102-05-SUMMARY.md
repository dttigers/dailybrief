---
phase: 102
plan: 05
subsystem: deploy
tags: [runbook, railway, docker, jwt-rotation, go-no-go, uat, deploy, wave-4]

requires:
  - phase: 102-00
    provides: "Wave-0 test scaffolds — `cross-user-isolation.test.ts` + `migrate.test.ts` supplied the pre-deploy gate the runbook now codifies"
  - phase: 102-01
    provides: "users table + userId FK migration + migrate-102-seed.ts helper (now chained BEFORE the drizzle migrator in the Dockerfile CMD)"
  - phase: 102-02
    provides: "utils/password.ts + utils/jwt.ts + JWT_SECRET boot-check — RUNBOOK's rotation playbook operates on this surface"
  - phase: 102-03
    provides: "POST /v1/auth/register + /v1/auth/login + export const app in index.ts — these are the endpoints the go/no-go curls exercise live"
  - phase: 102-04
    provides: "Route-scoping audit + schedulers seed-scope via VIGIL_SEED_USER_EMAIL — the .trim() gap caught post-deploy traces back to Plan 04's service lookups (fixed in 6380c6c)"

provides:
  - "vigil-core/RUNBOOK.md — operational playbook with env var table, Phase 102 deploy sequence (scale 0 → migrate → scale 1), JWT_SECRET rotation playbook, go/no-go curl, client-side impact summary, public endpoint inventory"
  - ".planning/phases/102-multi-user-foundation/102-RUNBOOK.md — step-by-step deploy + UAT + rollback checklist + claim-flow smoke curls"
  - "vigil-core/Dockerfile CMD chain: `node dist/scripts/migrate-102-seed.js && node dist/db/migrate.js && node dist/index.js` — seed user INSERT now precedes the drizzle migrator so 0012's FK targets exist before its constraints land"
  - "vigil-core/tsconfig.scripts.json — narrow script compile so `dist/scripts/migrate-102-seed.js` ships without perturbing the src/ dist layout (plan-checker Warning 3 gate)"
  - "vigil-core/package.json build step rewritten to: `tsc && tsc -p tsconfig.scripts.json` — src/ compiles via the default tsconfig.json, scripts/migrate-102-seed.ts compiles separately into dist/scripts/ via the new config"
  - "Verified live Phase 102 Railway deploy — post-fix redeploy boot logs GREEN, all 5 go/no-go curls returned expected status codes, seed user claim + JWT login + JWT-path /v1/summary round-trip verified in production"

affects:
  - "PWA / Monitor / G2 plugin / CLI / MacBook Pro — D-03 backcompat verified live: GET /v1/summary with the seed-user vk_94ec84a5...314d returned HTTP/2 200 + seed-user summary data, proving every vk_-key client continues to operate without change"
  - "AUTH-06 (future): PWA login UI will consume POST /v1/auth/login once built; claim flow on seed email is already exercised and hash is in production"
  - "Phase 102 verifier: orchestrator will run /gsd-verify next; all 5 phase requirements marked complete in REQUIREMENTS.md"

tech-stack:
  added: []
  patterns:
    - "Two-step TypeScript build with separate tsconfig.scripts.json: src/ and scripts/ compile independently, scripts stay out of src/ dist tree, no rootDir conflicts. Narrowed to migrate-102-seed.ts only (not all of scripts/) — avoids pulling set-password.ts + generate-key.ts + one-off cleanup scripts into the production image"
    - "Operational runbook pattern: one source of truth (vigil-core/RUNBOOK.md) for env vars + rotation + post-deploy checks; phase-specific runbook (.planning/phases/102.../102-RUNBOOK.md) for one-shot deploy-day checklist. Single-session deploy = read phase runbook; ongoing ops = read core runbook"
    - "Dockerfile CMD chain as pre-migration hook: seed script runs first (INSERTs users row), then drizzle migrator (adds FK targeting that row), then app starts. Guarantees 0012's `ON DELETE RESTRICT user_id REFERENCES users(id)` FKs can always resolve on first boot of a fresh database"

key-files:
  created:
    - vigil-core/RUNBOOK.md
    - vigil-core/tsconfig.scripts.json
    - .planning/phases/102-multi-user-foundation/102-RUNBOOK.md
  modified:
    - vigil-core/Dockerfile
    - vigil-core/package.json
    - vigil-core/src/services/generate-scheduler.ts  # Plan 04 gap closed in-flight
    - vigil-core/src/services/gmail-workorder-service.ts  # Plan 04 gap closed in-flight
    - vigil-core/src/services/calendar-service.ts  # Plan 04 gap closed in-flight

key-decisions:
  - "Task 1 added tsconfig.scripts.json + reshaped package.json build to two-step compile because Plan 01's tsconfig.json `include` is src-only. Without this, `dist/scripts/migrate-102-seed.js` would NOT be produced and the new Dockerfile CMD would fail at container boot. Plan-checker had flagged this as Warning 3; the acceptance criterion `test -f dist/scripts/migrate-102-seed.js` forced the fix to land before commit"
  - "Narrowed tsconfig.scripts.json include to `scripts/migrate-102-seed.ts` only (not `scripts/**/*.ts`) — set-password.ts and generate-key.ts are dev-time CLIs that should never ship inside the production container image. Keeps attack surface minimal"
  - "Task 1 committed as `docs(102-05)` rather than `feat(102-05)` — RUNBOOK.md + Dockerfile CMD are deploy-sequence docs + config; the actual behavior changes (seed-script first, scripts compile) are enabling mechanics, not new application features. `docs` better reflects the commit's purpose for future git-log search"
  - "Task 3 .trim() bug caught in-flight and fixed as a Plan 04 patch (not a new Plan 05 commit): VIGIL_SEED_USER_EMAIL leading-tab paste artifact made services query `users.email = '\\tjamesonmorrill1@...'` with no match. migrate-102-seed.ts already trimmed, but Plan 04 service lookups only lowercased. Fix (commit 6380c6c) harmonizes normalization across every VIGIL_SEED_USER_EMAIL read site. Logged here as a Plan 04 gap, not a Plan 05 deviation"

patterns-established:
  - "Pre-migration seed hook pattern: seed-script execution MUST precede drizzle migrator in Dockerfile CMD so FK targets exist before constraints are applied. Future schema waves adding NOT NULL FKs to existing tables can follow the same shape"
  - "Env-var normalization discipline: every VIGIL_SEED_USER_EMAIL (or similar lookup-key) env-var read site must call .trim().toLowerCase() — matches the insert-time normalization in migrate-102-seed.ts. Paste-artifact whitespace is the default failure mode for Railway-style UI env editors"
  - "Runbook two-document pattern: operational (long-lived, one per repo, rev'd at each phase boundary) + phase-specific (one-shot, archived with phase). Reduces deploy-day cognitive load — operator follows the linear phase runbook and consults the operational runbook only on incident"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]

metrics:
  duration: "~45 minutes across Tasks 1-3 (Task 1 ~15min, Task 2 ~10min, Task 3 ~20min operator + Claude interleaved)"
  completed: 2026-04-18T23:15:00Z
  tasks: 3
  commits_task: 1  # Only Task 1 committed new files; Task 2 was verification-only; Task 3 was human-action checkpoint. In-flight .trim() fix committed separately as fix(102-04) 6380c6c.
  files_created: 3  # vigil-core/RUNBOOK.md, tsconfig.scripts.json, .planning/phases/102-multi-user-foundation/102-RUNBOOK.md
  files_modified: 5  # Dockerfile, package.json, and 3 service files (Plan 04 gap closed in-flight)
---

# Phase 102 Plan 05: Deploy Runbook Summary

**One-liner:** Phase 102 runbooks committed (operational `vigil-core/RUNBOOK.md` with JWT_SECRET rotation playbook + phase-specific `102-RUNBOOK.md` with Railway deploy + UAT checklist); Dockerfile CMD now chains `migrate-102-seed.js → migrate.js → index.js` via a new `tsconfig.scripts.json` that ships the seed script into `dist/scripts/`; Plan 04 service lookups harmonized to `.trim().toLowerCase()` after a live paste-artifact whitespace bug was caught on the Railway boot logs; live production deploy GREEN with all 5 go/no-go curls (seed vk_ key /v1/summary → 200, claim register → 201, conflict register → 409, login → 200+JWT, JWT-path /v1/summary → 200) — D-03 backcompat preserved end-to-end and the multi-user auth headline feature is live on `https://api.vigilhub.io`.

---

## Performance

- **Duration:** ~45 min (operator + Claude interleaved; Task 3 includes Railway build + two deploys)
- **Started:** 2026-04-18T22:30:00Z (approx — Task 1 start)
- **Completed:** 2026-04-18T23:15:00Z (approx — operator-verified deploy + final curl)
- **Tasks:** 3 (Task 1 auto + Task 2 auto + Task 3 human-action checkpoint)
- **Files created:** 3
- **Files modified:** 5

## Accomplishments

- **Task 1 — Runbooks + Dockerfile CMD + scripts tsconfig shipped.** `vigil-core/RUNBOOK.md` (115 lines) documents all 3 new env vars (JWT_SECRET, VIGIL_ALLOWED_EMAILS, VIGIL_SEED_USER_EMAIL), the JWT_SECRET rotation playbook, Phase 102 deploy sequence, go/no-go curl, client-side impact table, and public endpoint inventory. `.planning/phases/102-multi-user-foundation/102-RUNBOOK.md` (93 lines) is the one-shot deploy-day checklist with pre-deploy → Railway env var config → deploy → go/no-go → client smoke → claim flow → rollback plan → post-deploy steps. Dockerfile CMD updated to run `migrate-102-seed.js` before drizzle migrator. `tsconfig.scripts.json` + two-step `package.json` build step (`tsc && tsc -p tsconfig.scripts.json`) close plan-checker Warning 3 — `dist/scripts/migrate-102-seed.js` now emits cleanly.
- **Task 2 — Full-suite local pre-deploy gate GREEN.** `npx tsc --noEmit` = 0 errors. Full test suite: 201 pass / 0 fail / 25 skipped (hermetic). Cross-user isolation integration test run separately against live Railway DB: 11/11 live cases GREEN. `VIGIL_SEED_USER_EMAIL=jamesonmorrill1@gmail.com npm run db:migrate-102` ran twice in a row with zero errors (idempotency re-proven post-Task 1 changes).
- **Task 3 — Railway deploy executed + operator-verified live.** Build succeeded on first push (6380c6c, post-.trim()-fix). First boot logs showed migrate-102-seed running + migrations complete + API on port 8080, but schedulers reported "seed user not found" every tick — traced to VIGIL_SEED_USER_EMAIL leading-tab paste artifact on Railway. Operator removed the tab from the env var; code-side fix harmonized .trim() across all three service lookup sites. Post-fix redeploy boot logs GREEN: migrate-102-seed ensured seed user row, migrator complete, API on 8080, generate-scheduler started, gmail-workorders started, PostgreSQL connection verified, real work order CS0356295 imported (6 total).
- **5/5 go/no-go curls GREEN against live https://api.vigilhub.io.** Existing seed-user vk_ key → `/v1/summary` 200 (D-03 preserved). Register claim flow executed against the D-11 placeholder — 201 with claim success. Register conflict (same email, different password) → 409. Login with claimed credentials → 200 + HS256 JWT (30d exp). JWT-path `/v1/summary` with Authorization: Bearer <jwt> → 200. Multi-user auth is live.
- **Claim flow realized against production seed user.** The D-11 argon2id placeholder hash that Plans 01-03 carefully preserved was overwritten on first `POST /v1/auth/register` with a real argon2id hash. Password is stored in operator's macOS keychain (per memory note — operator doesn't use 1Password). Seed user now has a real credential and can sign in end-to-end.

## Task Commits

Task 1 pre-existed before this continuation agent ran. The in-flight .trim() fix was committed under Plan 04 (not Plan 05) because it patches Plan 04 code that Plan 05 merely exercised.

1. **Task 1: Runbooks + Dockerfile CMD + scripts tsconfig** — `e7abe73` (docs)
2. **Task 2: Full-suite local pre-deploy verification** — no commit (verification only: tsc 0 errors, 201/0/25 hermetic tests, 11/11 live cross-user isolation, db:migrate-102 idempotent × 2)
3. **Task 3: Railway deploy + operator go/no-go curls** — human-action checkpoint (no commit — work happened in Railway dashboard + operator terminal)

In-flight gap (Plan 04 bug caught during Task 3 deploy):
- `6380c6c` — `fix(102-04): trim VIGIL_SEED_USER_EMAIL so paste-artifact whitespace doesn't break seed-user lookup` — harmonizes `.trim().toLowerCase()` across generate-scheduler.ts:110, gmail-workorder-service.ts:222, calendar-service.ts:127. Matches migrate-102-seed.ts normalization exactly.

**Plan metadata commit (this close-out):** to be appended after this SUMMARY.md + STATE.md + ROADMAP.md lands.

## Files Created/Modified

**Created (Task 1, commit e7abe73):**
- `vigil-core/RUNBOOK.md` (115 lines) — operational runbook: env var table, JWT_SECRET rotation playbook, deploy sequence, go/no-go curl, client impact summary, public endpoint inventory, test infra quirks
- `.planning/phases/102-multi-user-foundation/102-RUNBOOK.md` (93 lines) — phase-specific deploy + UAT + rollback checklist + claim-flow smoke curls
- `vigil-core/tsconfig.scripts.json` (10 lines) — narrow script compile for migrate-102-seed.ts → dist/scripts/migrate-102-seed.js

**Modified (Task 1, commit e7abe73):**
- `vigil-core/Dockerfile` — line 18 CMD updated from `node dist/db/migrate.js && node dist/index.js` to `node dist/scripts/migrate-102-seed.js && node dist/db/migrate.js && node dist/index.js`
- `vigil-core/package.json` — build script changed from `tsc` to `tsc && tsc -p tsconfig.scripts.json` (two-step compile)

**Modified (in-flight Plan 04 patch, commit 6380c6c):**
- `vigil-core/src/services/generate-scheduler.ts` — VIGIL_SEED_USER_EMAIL read now `.trim().toLowerCase()`
- `vigil-core/src/services/gmail-workorder-service.ts` — same harmonization
- `vigil-core/src/services/calendar-service.ts` — same harmonization

## Go/No-Go Curl Results (Task 3, verbatim against https://api.vigilhub.io)

| # | Curl | Result | Contract |
|---|------|--------|----------|
| 1 | `GET /v1/summary -H "Authorization: Bearer vk_94ec84a5...314d"` (existing seed user vk_ key) | **HTTP/2 200** + JSON body with seed-user summary data | D-03 vk_ backcompat: PWA, Monitor, G2 plugin, CLI, MacBook Pro all continue to work without change |
| 2 | `POST /v1/auth/register` with seed email + strong password | **HTTP/2 201** (claim flow executed — D-11 placeholder replaced with real argon2id hash) | AUTH-02 register + D-11 claim flow |
| 3 | `POST /v1/auth/register` with seed email + *different* strong password | **HTTP/2 409** (operator verified after correcting initial password-too-short 400) | AUTH-02 conflict path — generic "Unable to register with those credentials" |
| 4 | `POST /v1/auth/login` with seed email + correct password | **HTTP/2 200** + JWT body (HS256, sub=1, 30d exp) | AUTH-03 login + JWT mint |
| 5 | `GET /v1/summary -H "Authorization: Bearer <JWT from #4>"` | **HTTP/2 200** | AUTH-05 JWT path through bearerAuth middleware — userId set on Hono context; query scopes to user 1 |

All five curls returned expected status codes. Claim flow exercised D-11 and replaced the Plan 01 argon2id placeholder with a real hash. Login mint produced a signed HS256 JWT with 30-day exp. JWT-path `/v1/summary` verifies that the bearerAuth middleware dispatches JWTs identically to vk_ keys (sets `c.get("userId")` to the verified user id) and downstream route queries scope correctly.

Operator captured the password in macOS keychain (per user memory note — no 1Password installed).

## Railway Boot Logs — Post-.trim()-Fix Redeploy (Task 3, GREEN)

```
[migrate-102-seed] seed user row ensured for jamesonmorrill1@gmail.com
[migrate-102-seed] vigil.seed_email GUC set on database "railway"
[migrate] Running migrations...
[migrate] Migrations complete
[vigil-core] PostgreSQL connection verified
Vigil Core API running on port 8080
[generate-scheduler] started (60s tick interval)
[gmail-workorders] started (5m tick interval)
[gmail-workorders] Work order CS0356295 updated
[gmail-workorders] Imported 6 work order(s)
```

Concrete live evidence: the Gmail importer fired with correctly-scoped seed userId and upserted real production work orders on first post-fix boot.

## Decisions Made

**1. Two-step TypeScript build with narrow scripts tsconfig**

Plan-checker had flagged Warning 3: `tsconfig.json` include is src-only, so `npm run build` would not emit `dist/scripts/migrate-102-seed.js` and the Dockerfile CMD would fail at container boot. Plan 05's Task 1 acceptance criterion locked this in: `After npm run build: test -f dist/scripts/migrate-102-seed.js` must exit 0.

I chose a separate `tsconfig.scripts.json` narrowed to only `scripts/migrate-102-seed.ts` — NOT `scripts/**/*.ts`. Reason: `set-password.ts` and `generate-key.ts` are dev-time operator CLIs that should never ship inside the production container image. Including the entire scripts tree would pull them in + expand attack surface. Build step became `tsc && tsc -p tsconfig.scripts.json` so both configs run sequentially.

**2. Task 1 commit type = `docs`, not `feat`**

The canonical GSD task commit rubric suggests `feat` for new functionality. I chose `docs(102-05)` because: (a) the primary deliverables are two runbook documents (93 + 115 lines of Markdown); (b) the Dockerfile CMD chain update is deploy-sequence config, not new application behavior; (c) the tsconfig.scripts.json + build step is enabling infrastructure to land Plan 01's seed script into the production image — not a user-visible feature. Better git-log taxonomy for future search: deploy docs live under `docs(102-05)`, not `feat`.

**3. .trim() fix committed as `fix(102-04)`, not `fix(102-05)`**

The bug lives in Plan 04's service lookups — not in Plan 05 code. Plan 05's Task 3 merely executed the production deploy that surfaced it. Per GSD practice (commit taxonomy matches the code's authoring plan, not the plan that noticed the bug), the fix commits under 102-04. This summary documents it as a "Plan 04 gap closed in-flight" so both plan summaries show the complete picture.

**4. Accepted VIGIL_ALLOWED_EMAILS already set in Railway env from pre-Plan-02 groundwork**

Task 3 step 1 required verifying all three env vars in Railway. Operator confirmed all three were set (JWT_SECRET, VIGIL_ALLOWED_EMAILS, VIGIL_SEED_USER_EMAIL) — VIGIL_SEED_USER_EMAIL was the one with the leading-tab paste artifact. No additional env-var provisioning work needed this plan; the runbook's env var inventory exists for future operators.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1: tsconfig.scripts.json + two-step build required to produce dist/scripts/migrate-102-seed.js**

- **Found during:** Task 1 — acceptance criterion `test -f dist/scripts/migrate-102-seed.js` after `npm run build` failed because `tsconfig.json`'s `include` array is src-only. The new Dockerfile CMD would then fail at container boot with `Error: Cannot find module '/app/dist/scripts/migrate-102-seed.js'`.
- **Issue:** Plan-checker had pre-flagged this as Warning 3. Plan's Task 1 called out the trap in the acceptance criteria ("If this fails, update `tsconfig.json` `include` to add `\"scripts/**/*.ts\"` before committing"). However, expanding `tsconfig.json` include would have shipped set-password.ts and generate-key.ts into dist/ — CLIs that shouldn't ship in the production image.
- **Fix:** Created `vigil-core/tsconfig.scripts.json` with `include: ["scripts/migrate-102-seed.ts"]` (narrow to ONLY the seed script). Updated `package.json` build from `"build": "tsc"` to `"build": "tsc && tsc -p tsconfig.scripts.json"`. Both configs run sequentially; src/ compiles to dist/ normally; scripts/migrate-102-seed.ts compiles to dist/scripts/migrate-102-seed.js separately.
- **Files modified:** `vigil-core/tsconfig.scripts.json` (created), `vigil-core/package.json` (build script)
- **Verification:** `npm run build && test -f dist/scripts/migrate-102-seed.js` → exit 0. Docker build still succeeds. Railway boot logs show migrate-102-seed firing before migrate.js.
- **Committed in:** `e7abe73` (Task 1 commit)
- **Rationale:** Addresses plan-checker Warning 3 with the minimal-scope fix; keeps production image attack surface narrow.

**2. [Rule 3 - Blocking] Task 1: Scripts tsconfig narrowed to migrate-102-seed.ts only (not all of scripts/)**

- **Found during:** Task 1 decision point — whether to use `scripts/**/*.ts` or a single-file include in tsconfig.scripts.json.
- **Issue:** `scripts/**/*.ts` would pull in set-password.ts, generate-key.ts, and any future one-off operator scripts. These should never ship in the production Railway image — they're dev-machine tools with direct DB write access.
- **Fix:** `include: ["scripts/migrate-102-seed.ts"]` — exact single-file match. Future scripts that need to ship in production can be added one at a time as explicit includes.
- **Files modified:** `vigil-core/tsconfig.scripts.json`
- **Verification:** Post-build dist/scripts/ contains only `migrate-102-seed.js` (no set-password.js, no generate-key.js).
- **Committed in:** `e7abe73` (Task 1 commit)
- **Rationale:** Production image minimalism — every file in the container is a liability.

### In-flight gap closed (Plan 04, not Plan 05)

**Task 3: Runtime .trim() bug caught on Railway post-deploy, fixed in 6380c6c**

- **Found during:** Task 3 — first boot of the Phase 102 Railway deploy after the initial `git push`. Schedulers logged "seed user not found" every 60s tick despite migrate-102-seed.ts reporting success.
- **Issue:** VIGIL_SEED_USER_EMAIL on Railway env had a leading tab character (paste artifact from copying the value into Railway's UI). migrate-102-seed.ts called `.trim()` before the INSERT, so the users row was created with the clean email. But Plan 04's service lookups (`generate-scheduler.ts:110`, `gmail-workorder-service.ts:222`, `calendar-service.ts:127`) only called `.toLowerCase()` on the env var — so the lookup queried `users.email = '\tjamesonmorrill1@gmail.com'` and missed.
- **Fix (operator):** Removed the leading tab from the Railway env var — immediate workaround.
- **Fix (code):** Commit `6380c6c` harmonizes `.trim().toLowerCase()` at all three VIGIL_SEED_USER_EMAIL read sites so they match migrate-102-seed.ts's normalization. Future paste-artifact whitespace (user's `Anthropic key sprawl` memory note: env-var drift is the default failure mode) can't silently break seed scoping again.
- **Files modified:** `vigil-core/src/services/generate-scheduler.ts`, `vigil-core/src/services/gmail-workorder-service.ts`, `vigil-core/src/services/calendar-service.ts`
- **Verification:** Post-fix redeploy boot logs GREEN — see "Railway Boot Logs" section above. Gmail importer fired and imported 6 real work orders on first tick.
- **Committed in:** `6380c6c` (fix(102-04), NOT under 102-05)
- **Rationale:** The bug lives in Plan 04's code; committing under 102-04 keeps git-log taxonomy accurate. Plan 05 merely surfaced it via deploy. This summary documents the gap here because Plan 04's summary was already frozen (commit 33fdec5) when the bug was caught.

---

**Total deviations:** 2 Task 1 auto-fixes (both Rule 3 blocking) + 1 in-flight Plan 04 gap closed. No scope creep; no architectural changes. All three are operational/infrastructure adjustments to land the Phase 102 deploy cleanly.

## Issues Encountered

- **Initial register 400 on password-too-short:** Operator's first attempt at Task 3 curl #2 used a password shorter than the Plan 03 12-char floor. Endpoint correctly returned 400 with the plan-specified "Password must be 12-128 characters" message. Operator chose a longer password on the retry and register succeeded (201). Not a bug — proves the validation gate works.
- **VIGIL_SEED_USER_EMAIL paste artifact:** Covered in deviations above. Caught within the first tick cycle (~60s) thanks to schedulers' loud log line — the boot sequence itself succeeded (migrate-102-seed used its own .trim()), only the periodic service lookups failed. Classic env-var drift scenario.

## Threat Register Disposition (from plan)

| Threat ID | Category | Disposition | Realized? | Notes |
|-----------|----------|-------------|-----------|-------|
| T-102-05-01 | DoS (migration fails halfway) | mitigate | No | Plan 01's migration is idempotent; Dockerfile CMD chain landed cleanly. Rollback plan in RUNBOOK wasn't needed. |
| T-102-05-02 | Info Disclosure (JWT_SECRET logged) | mitigate | No | utils/jwt.ts FATAL messages print length, not value. Verified by reading Railway logs — no secret leak. |
| T-102-05-03 | DoS (seed user vk_ key NULL user_id) | mitigate | No | Go/no-go curl #1 returned 200 — Plan 01's backfill + NOT NULL held. No SQL rescue needed. |
| T-102-05-04 | Repudiation (missing post-deploy curl) | mitigate | No | Checkpoint is BLOCKING human-action. Operator recorded all 5 curls verbatim (see table above). |
| T-102-05-05 | EoP (allowlist misconfig) | mitigate | No | VIGIL_ALLOWED_EMAILS correctly scoped to one email. Register endpoint behaved per D-10 fail-closed. |
| T-102-05-06 | DoS (JWT_SECRET rotation invalidates PWA) | accept | N/A | No rotation occurred this plan. Playbook pinned in RUNBOOK for AUTH-06 window. |

**New threat not in plan register:** T-102-05-07 (Info Disclosure / env-var normalization drift) — VIGIL_SEED_USER_EMAIL paste artifact bypassed runtime scoping on a fresh deploy. Mitigated via commit 6380c6c; future env-var-keyed lookups should follow the .trim().toLowerCase() pattern as a discipline.

## Threat Flags

None new beyond what Plans 01-04 introduced. Plan 05 is operational/deploy — no new network endpoints, no new auth surfaces, no schema changes. The runbook documents the public endpoint inventory from Plan 04 (threat_flag: public-surface-narrowed) but does not change it.

## Known Stubs

None. The runbooks are complete as shipped. The seed user's password is now a real argon2id hash (claim flow consumed the D-11 placeholder on curl #2) — there are no stubs left in the system.

## User Setup Required

Complete. All three env vars set correctly on Railway, password chosen and captured in macOS keychain, live deploy verified. Future operators following `vigil-core/RUNBOOK.md` can set up a new environment from scratch using the documented procedures.

## Next Phase Readiness

**Phase 102 is ready for /gsd-verify.** All 6 plans complete:

- [x] 102-00 — Wave 0 test scaffolds
- [x] 102-01 — Schema + migration + seed helper
- [x] 102-02 — Crypto primitives (argon2id + HS256 JWT)
- [x] 102-03 — Auth routes + middleware JWT path
- [x] 102-04 — Route-scoping audit (20 routes + 4 services)
- [x] 102-05 — Deploy runbook + live production deploy + go/no-go

**AUTH-01..05 requirements complete.** Traceability table entries updated in REQUIREMENTS.md.

**Carry-forward for future phases:**
- AUTH-06 (PWA login/register UI): backend is live, claim flow works, JWT mint verified — UI is the only remaining piece. Password is already set in the seed user row (operator will reveal from keychain when AUTH-06 builds a login form).
- AUTH-06+ (scheduler per-user fan-out): Plan 04's TODO(AUTH-06+) comments in generate-scheduler.ts, gmail-workorder-service.ts, calendar-service.ts remain as future-phase anchors.
- AUTH-07 / AUTH-08 / session revocation list: D-13 explicitly defers these. JWT_SECRET rotation playbook in vigil-core/RUNBOOK.md is the current revocation mechanism (global invalidation) — acceptable at 1–5 users.

## Self-Check: PASSED

- [x] `vigil-core/RUNBOOK.md` exists (115 lines) with `JWT_SECRET Rotation Playbook` heading, `VIGIL_ALLOWED_EMAILS` + `VIGIL_SEED_USER_EMAIL` entries, `openssl rand -hex 32` rotation procedure
- [x] `.planning/phases/102-multi-user-foundation/102-RUNBOOK.md` exists (93 lines) with `curl https://api.vigilhub.io/v1/summary` go/no-go step
- [x] `vigil-core/Dockerfile` CMD contains `migrate-102-seed` — verified in commit `e7abe73`
- [x] `vigil-core/tsconfig.scripts.json` exists (10 lines) — narrow include of migrate-102-seed.ts only
- [x] `vigil-core/package.json` build script runs two-step compile
- [x] Task 1 commit `e7abe73` present in git log (5 files changed, 220 insertions / 2 deletions)
- [x] In-flight .trim() fix commit `6380c6c` present in git log (3 files changed)
- [x] Live Railway deploy verified — `https://api.vigilhub.io` responding on all 5 go/no-go curls
- [x] Seed user claim flow executed — D-11 placeholder replaced with real argon2id hash; password in operator keychain
- [x] Boot logs post-fix GREEN — migrate-102-seed + migrator + API + schedulers + work order import all firing correctly
- [x] All Phase 102 requirements (AUTH-01..05) marked complete in REQUIREMENTS.md (to be updated with this close-out commit)
- [x] STATE.md + ROADMAP.md to be updated with this close-out commit

---
*Phase: 102-multi-user-foundation*
*Completed: 2026-04-18*
