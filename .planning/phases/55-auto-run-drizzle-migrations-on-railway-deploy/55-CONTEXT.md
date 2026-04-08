# Phase 55 Context — Auto-run drizzle migrations on Railway deploy

**Promoted from backlog 999.2 on 2026-04-08.**

## Why this exists

Surfaced from Phase 53-04 verification (2026-04-08). Currently Railway just runs `npm start` — there's no Procfile, no `railway.json` release hook, and no `start` wrapper. So a push that introduces a new migration deploys the new code but leaves the database schema behind, producing 500s on the first request that touches the new table.

During Phase 53 this manifested as `POST /v1/projects` returning 404 (route not deployed) followed by 500 (table missing) once the deploy actually landed. Had to manually run `DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx vigil-core/src/db/migrate.ts` from local against the public proxy host.

Memorialized in `project_railway_deploy.md` as a foot-gun.

## What it would do

- Add a pre-deploy / release hook to `vigil-core/railway.json` (or wrap `start` in `package.json`) that runs `node dist/db/migrate.js` before booting the Hono server
- Drizzle migrator is already idempotent (skips applied migrations via `__drizzle_migrations` table) so re-runs on every deploy are safe
- Verify the hook fails the deploy if the migration fails — better a failed deploy than a half-migrated DB

## Acceptance

Push a commit that adds a new migration → Railway deploys → the new table is queryable from the API on first request, with no manual intervention.

## Open questions for /gsd-discuss-phase

- `railway.json` release command vs. `start` wrapper — which one Railway actually honors with the current "Builder: Dockerfile" config (the `vigil-core/Dockerfile` may need a tweak too)
- How to handle a migration that fails on prod — do we want auto-rollback, or just fail-loud and stop the deploy?
- Should the migration also run in CI against an ephemeral Postgres before deploy? (separate concern, but related)

## Sibling

Phase 56 (push origin on phase-complete) is the natural sibling — together they would make `git push` the single atomic action that lands code + schema on prod.
