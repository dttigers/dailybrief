# Summary: 39-02 — Railway Deploy, API Key & Verification

## What was built

Deployed vigil-core to Railway with managed PostgreSQL, generated the first production API key, and verified all endpoints.

## Deliverables

- Railway project "vigil-core" with Dockerfile-based service
- Managed PostgreSQL addon with reference variable for DATABASE_URL
- ANTHROPIC_API_KEY set in production environment
- Production migrations ran successfully (drizzle)
- Public domain: https://vigil-core-production.up.railway.app
- First API key generated: prefix `vk_e2e2fae0` (name: "g2-glasses")

## Verification Results

- Health endpoint: `{"status":"ok","database":"connected"}` ✓
- Authenticated GET /v1/thoughts: 200 with empty array ✓
- Unauthenticated GET /v1/thoughts: 401 Unauthorized ✓

## Production Details (for subsequent phases)

- **URL:** https://vigil-core-production.up.railway.app
- **API Key prefix:** vk_e2e2fae0 (full key shown during generation — save separately)
- **Database:** PostgreSQL via Railway managed addon (internal: postgres.railway.internal:5432)

## Issues

- Railway CLI `add --database` command has an auth bug — used dashboard + CLI reference variable workaround
- `railway run` uses internal hostname which doesn't resolve locally — used public Postgres URL for key generation

## Commits

No code commits (infrastructure-only plan). All changes were Railway platform configuration.
