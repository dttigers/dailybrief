# vigil-core Runbook

Operational playbook for the Vigil Core API. Updated at each phase boundary.

## Environment Variables

| Name | Required | Purpose | Where set |
|------|----------|---------|-----------|
| `DATABASE_URL` | Yes | Postgres connection string | Railway env |
| `ANTHROPIC_API_KEY` | Yes | Claude API for triage/affirmations/chat | Railway env |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Yes | Google OAuth (Gmail + Calendar) | Railway env |
| `GOOGLE_OAUTH_STATE_SECRET` | Yes | 32+ chars; signs OAuth state JWT (now also carries userId per Phase 102) | Railway env |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Yes | 64 hex chars (32 bytes); AES-GCM key for refresh-token storage | Railway env |
| `JWT_SECRET` | Yes (Phase 102+) | 32+ chars; HMAC key for user JWTs | Railway env |
| `VIGIL_ALLOWED_EMAILS` | Yes (Phase 102+) | Comma-separated allowlist for POST /v1/auth/register | Railway env |
| `VIGIL_SEED_USER_EMAIL` | Optional (Phase 102+) | Default `jamesonmorrill1@gmail.com`; single-user tenant owner | Railway env |
| `CORS_ORIGINS` | Yes | Comma-separated list of PWA/client origins | Railway env |
| `PWA_URL` | Yes | Post-OAuth redirect target | Railway env |
| `PORT` | Auto | Railway injects; default 3001 | Railway |

Secret-drift policy (memory note "Anthropic key sprawl"): the canonical source of every
secret is Railway env. Do NOT copy these to `.env`, `~/.config/dailybrief/config.json`,
`plist`, or CI without a paired doctor-script update. Divergence is the default failure.

## JWT_SECRET Rotation Playbook (global session invalidation)

Phase 102 has no per-session revocation list (D-13). Global revocation = rotate JWT_SECRET.

At current user count (1–5), this is acceptable. Revisit after AUTH-07/08.

**When to rotate:**
- Suspected secret leak
- Routine 90-day rotation (not currently scheduled; enable if opening public registration)
- Incident response (force all sessions to re-authenticate)

**Procedure:**

1. Generate new secret: `openssl rand -hex 32` (64 hex chars = 32 bytes, exceeds D-19 floor).
2. Update `JWT_SECRET` in Railway dashboard → vigil-core project → Variables.
3. Trigger redeploy (push an empty commit, or "Redeploy" in the UI).
4. **Expected client impact (Phase 102 scope):**
   - PWA still on `vk_` key — NO impact (vk_ keys are unaffected by JWT_SECRET).
   - Monitor, G2 plugin, CLI, MacBook — all on `vk_` keys — NO impact.
   - **After AUTH-06 ships**, PWA will have active JWT sessions — all of those re-authenticate on next request.
5. Duration: ~30s deploy cycle.
6. Verify: `curl https://api.vigilhub.io/v1/summary -H "Authorization: Bearer vk_..."` still returns data (vk_ path is independent of JWT_SECRET).

## Deploy Sequence (Phase 102)

Railway deploys are triggered by a push to the main branch's `vigil-core/` subtree (Root Directory set to `vigil-core` per memory note).

**For Phase 102 specifically** (because the migration adds NOT NULL userId to every scoped table, a partial apply is risky):

1. Ensure the three new env vars are set in Railway BEFORE the deploy:
   - `JWT_SECRET` (new, 32+ chars)
   - `VIGIL_ALLOWED_EMAILS` = `jamesonmorrill1@gmail.com`
   - `VIGIL_SEED_USER_EMAIL` = `jamesonmorrill1@gmail.com` (optional)
2. Railway scales to 0 replicas (Settings → Scale). This stops the schedulers so no new rows are inserted without userId during the migration.
3. Push the Phase 102 commit.
4. Railway builds the new image and boots one replica.
5. The Dockerfile CMD chain runs:
   - `node dist/scripts/migrate-102-seed.js` — INSERTs seed user with placeholder hash; sets `vigil.seed_email` GUC on the DB.
   - `node dist/db/migrate.js` — applies 0012 migration (creates users table idempotently, adds user_id columns, backfills, SET NOT NULL, rewrites app_settings PK).
   - `node dist/index.js` — boots the API with full multi-user auth.
6. Scale back to 1 replica (if not auto-resumed).
7. Post-deploy: run the go/no-go curl (below).

## Go/No-Go Curl Check (post-deploy)

```bash
curl -si https://api.vigilhub.io/v1/summary \
  -H "Authorization: Bearer vk_<seed-user-key>" | head -3
```

Expected: `HTTP/2 200` + JSON body with seed-user summary.

If the response is 401 "Server misconfiguration" → an api_keys row has NULL userId. Run:

```sql
UPDATE api_keys SET user_id = (SELECT id FROM users WHERE email = 'jamesonmorrill1@gmail.com') WHERE user_id IS NULL;
```

If the response is 503 → DB unreachable. Investigate Railway logs.

If the response is any other non-200 → rollback via Railway UI (redeploy the previous commit).

## Client-Side Impact Summary (Phase 102)

| Client | Current auth | Phase 102 impact |
|--------|--------------|------------------|
| PWA (app.vigilhub.io) | `vk_` in localStorage | No change — backfilled to seed user |
| Mac CLI (`dailybrief`) | `vk_` in config.json | No change |
| Monitor (iMac launchd) | `vk_` in plist | No change |
| G2 plugin | `vk_` in SDK config | No change |
| MacBook Pro dev | `vk_` in env | No change |

All clients continue to operate against the seed user's data post-deploy.

## Public Endpoint Inventory (as of Phase 102)

These endpoints are exempt from bearer authentication. Any expansion requires an explicit threat-model re-review (T-102-03 threat flags).

| Path | Method | Purpose |
|------|--------|---------|
| `/v1/health` | GET | Liveness probe |
| `/v1/auth/register` | POST | Email+password claim flow; gated by `VIGIL_ALLOWED_EMAILS` (D-10 fail-closed) |
| `/v1/auth/login` | POST | Timing-safe login; returns HS256 JWT (30d exp per D-12) |
| `/v1/auth/google/callback` | GET | Google OAuth redirect target; state JWT HMAC-verified (carries userId per Phase 102 Plan 04) |

**Removed from public surface in Phase 102 Plan 04:** `/v1/auth/google` (initiation) is now BEHIND bearer — a client must be authenticated (vk_ or JWT) before re-linking Google. The state JWT now carries `{nonce, userId}` so the public callback can bind the returned oauth_tokens row to the verified caller.

## Known Test Infrastructure Quirks

- **Full-suite `npm test` produces a spurious EADDRINUSE file-level fail** on `src/integration/cross-user-isolation.test.ts` because it imports `src/index.ts` (which binds port 3001 at module load). The 11 test cases inside all pass; the failure is a post-hook uncaughtException from a subsequent test file's runner still holding the port. Workaround for hermetic validation: `npx tsx --test --test-force-exit src/integration/cross-user-isolation.test.ts`.
- **`--test-force-exit` required** for any test importing `src/db/connection.js` — Drizzle's postgres pool singleton leaves the connection open; node refuses to exit without the flag.

## Local Development (Phase 107.1)

After Phase 107.1, local development no longer mutates prod. Identical setup on iMac and MacBook Pro (per D-03).

### First-time setup per machine

```bash
# 1. Install Postgres 16 (pinned to match Railway prod — version 16.13)
brew install postgresql@16
brew services start postgresql@16   # one-time; sticky across reboots

# 2. Run the bootstrap script from the repo root
bash scripts/dev-setup.sh
```

The `dev-setup.sh` script:
- Detects (but does NOT automate) the retired `com.jamesonmorrill.vigilcore` daemon — retirement happened in Phase 107.1 Plan 04. If it reappears, see [.planning/phases/107.1-local-dev-environment-with-postgres-and-hot-reload-stack/107.1-daemon-retirement.md](../.planning/phases/107.1-local-dev-environment-with-postgres-and-hot-reload-stack/107.1-daemon-retirement.md) for reversal / re-retire instructions.
- Creates `vigil_dev` database if missing.
- Runs Drizzle migrations (`npm --prefix vigil-core run db:migrate`).
- Seeds fixtures (`npm --prefix vigil-core run seed:local` — 1 user, 1 vk_ key, 5 thoughts, 1 work order, 1 project).
- Creates `vigil-core/.env` from `.env.example` (LOCAL-ONLY template) and `vigil-pwa/.env.local` with `VITE_API_BASE=http://localhost:3001`.
- Prints manual follow-ups (Anthropic dev workspace + $20/mo cap — web UI only, no CLI).
- Runs `scripts/preflight-check.sh` at the end to confirm health.

### Daily workflow

```bash
# From repo root
npm run dev
```

This runs:
- `bash scripts/preflight-check.sh` (fails loud with exact fix commands on any precondition violation — daemon present, port 3001 occupied, Postgres stopped, DATABASE_URL not localhost)
- `concurrently --kill-others` with streams `[core]` (blue) and `[pwa]` (magenta)

Ctrl+C stops both servers.

### Schema resync after `git pull`

```bash
git pull
npm ci
npm --prefix vigil-core run db:migrate   # applies any new Drizzle migrations locally
```

### Wipe + rebuild local DB

```bash
bash scripts/dev-reset.sh   # prompts for confirmation, then dropdb + createdb + migrate + seed
```

### Secret-drift policy (D-18 amendment)

Before Phase 107.1, `ANTHROPIC_API_KEY` was expected to match across `config.json`, `~/.config/dailybrief/.env`, `~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist`, and Railway. After Phase 107.1:

- The plist is retired (Plan 04) — no longer a sync target.
- `vigil-core/.env` ANTHROPIC_API_KEY is a DEV-workspace key with a $20/mo cap. It is EXPECTED to differ from the Railway prod key.
- `scripts/sync-anthropic-key.sh` (Plan 06 amendment) no longer syncs the local .env by default — only Railway. Use `--include-config-env` to opt in to local sync when rotating the prod key on the Mac-app path.

`scripts/dailybrief-doctor.sh` gained an INFORMATIONAL row for local `vigil_dev` DB reachability (D-19) that is exit-code-neutral.

### What stays pointed at prod

Phase 107.1 intentionally does NOT migrate these surfaces to localhost:
- Mac apps (DailyBriefMonitor, DailyBrief CLI) → still `https://api.vigilhub.io/v1` (per [Sources/JarvisCore/Config/AppConfig.swift:28](../Sources/JarvisCore/Config/AppConfig.swift#L28))
- Safari extension, G2 plugin → unchanged
- Only **vigil-core + vigil-pwa** use the local stack (D-15)

### Known Issues

- **`work_orders` schema drift** (tracked in [.planning/phases/107.1-.../deferred-items.md](../.planning/phases/107.1-local-dev-environment-with-postgres-and-hot-reload-stack/deferred-items.md)): `vigil-core/src/db/schema.ts` defines `work_orders.notes`, `last_change_at`, `last_change_summary`, and `archived_at` but no migration in `drizzle/0000–0012` creates them. `seed:local` fails with Postgres `42703: column "notes" does not exist` at the work-order insert step on a freshly migrated DB. Fix: a follow-on plan runs `drizzle-kit generate` to author `drizzle/0013_work_orders_drift_repair.sql` (additive-only), then `npm run seed:local` completes end-to-end.

### Preflight failure triage

`scripts/preflight-check.sh` has 4 checks, each emitting the exact fix command on failure:

| Check | Failure means | Fix |
|-------|---------------|-----|
| 1. daemon not registered | `com.jamesonmorrill.vigilcore` still loaded | `launchctl bootout gui/$UID/com.jamesonmorrill.vigilcore && rm ~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist` (must run in Terminal.app, NOT SSH — Aqua session) |
| 2. port 3001 free | another process is bound to :3001 | `lsof -iTCP:3001 -sTCP:LISTEN \| tail -n +2 \| awk '{print $2}' \| xargs kill` |
| 3. postgresql@16 running | brew service not started, or not installed | `brew services start postgresql@16` — or `brew install postgresql@16` if formula absent |
| 4. DATABASE_URL localhost | `vigil-core/.env` points at a Railway/proxy URL or is missing | `bash scripts/dev-setup.sh` (writes `.env` from template with timestamped backup); or edit `vigil-core/.env` directly — DATABASE_URL should be `postgresql://localhost:5432/vigil_dev` |

There is NO bypass flag or env var. Fix the underlying issue, don't paper over it.

### Where backups live

- `vigil-core/.env.bak.YYYYMMDD-HHMMSS` — created by `scripts/dev-setup.sh` every time it runs over an existing `.env`. Gitignored via `.env.bak.*` + `*.env.bak.*` patterns. Safe to delete after ~24h of stable local dev.

### Rotating the Anthropic dev-workspace key

1. Anthropic Console → Settings → Workspaces → "Vigil Dev" workspace → API Keys → Create Key.
2. Copy the new `sk-ant-...` key.
3. Edit `vigil-core/.env` → replace the `ANTHROPIC_API_KEY=` line.
4. Restart `npm run dev` (tsx watch picks up the new env on restart, not in-place).
5. Revoke the old key in the Anthropic Console.

Workspace spend cap lives at Workspace → Limits tab → Change Limit (default $20/mo for Vigil Dev).
