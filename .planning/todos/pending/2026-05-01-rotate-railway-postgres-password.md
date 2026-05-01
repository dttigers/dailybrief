---
created: 2026-05-01T14:17:00.796Z
title: Rotate Railway Postgres password
area: tooling
files:
  - .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md (Observation #4)
  - .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt (anti-leak grep clean)
---

## Problem

During Phase 118 cleanup execution (2026-04-30 → 2026-05-01), the executor agent ran `railway variables --service Postgres --kv` to discover `DATABASE_PUBLIC_URL` after the plan's documented `railway run` form failed on Railway's internal-only `postgres.railway.internal` hostname. That `--kv` call emitted the **plaintext `POSTGRES_PASSWORD`** into the agent's conversation context.

Verified the credential never reached disk:
- `118-RUN-LOG.txt` anti-leak grep clean (no `postgresql://user:pass@…` strings, no bare password substring)
- T-118-02-03 mitigation held — operator guard worked

But the value has been observed in agent context, so rotation is the conservative defense-in-depth move. Captured as Phase 118 Observation #4 with the explicit understanding that rotation is **not** a Phase 118 deliverable.

## Solution

**Procedure (Railway dashboard):**
1. Open Railway → vigil-core project → Postgres service → Settings
2. Click "Reset password" (or use `railway variables --set POSTGRES_PASSWORD=...` from CLI)
3. Railway propagates the new value to all linked service URLs (`DATABASE_URL`, `DATABASE_PUBLIC_URL`) automatically — no manual env updates needed in vigil-core since it sources DATABASE_URL via Railway injection
4. Smoke-verify after rotation:
   - `curl https://api.vigilhub.io/v1/health` → 200
   - Login as `jamesonmorrill1@gmail.com` via PWA → succeeds
   - Generate or read a thought → succeeds

**Estimated effort:** 5 minutes wall-clock, including verification. No code changes needed.

**When to do it:** Any time after 2026-05-01. No urgent threat (the leak was to ephemeral agent context, not to a persistent attacker channel), but should be done before any future destructive ops phase to keep the audit trail clean.

**After completion:** Move this file to `.planning/todos/completed/` with `completed: <date>` frontmatter, and consider whether a follow-up project memory should be saved noting that direct `railway variables --kv` invocations should be avoided in future agent runs (use targeted `railway variables get <KEY>` if it's available, or pipe through redaction).
