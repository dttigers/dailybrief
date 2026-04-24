---
phase: 111
plan: 03
status: in_progress
started: 2026-04-24
updated: 2026-04-24
---

# Plan 111-03 — Live email verification log

## Railway env set

Timestamp: `2026-04-24T17:08Z` (user confirmed via health-check curl timestamp)

Variables added to the **vigil-core** Railway service:

| Variable name | Source | Notes |
|---|---|---|
| `RESEND_API_KEY` | Generated at https://resend.com/api-keys — scoped: Sending access, Domain: vigilhub.io | Value NOT committed here — stored in 1Password + Railway Variables only (per memory `project_secret_drift.md` — avoid key sprawl) |
| `VIGIL_APP_BASE_URL` | Literal `https://app.vigilhub.io` (CONTEXT D-06) | Public URL — safe to log |

## Post-deploy health check

```
$ curl -sS https://api.vigilhub.io/v1/health
{"status":"ok","timestamp":"2026-04-24T17:08:54.496Z","version":"0.1.0","database":"connected"}
```

HTTP 200. Database connected. Railway redeploy after env var injection completed successfully. No regression from adding `RESEND_API_KEY` + `VIGIL_APP_BASE_URL` to the environment.

## Smoke send

_Pending Task 3._

## Gmail auth headers

_Pending Task 3._

## CTA href (raw source)

_Pending Task 3._

## Resend dashboard delivery

_Pending Task 3._
