---
created: 2026-05-01T14:17:00.796Z
completed: 2026-05-02T22:08:28Z
title: Rotate Railway Postgres password
area: tooling
files:
  - .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md (Observation #4)
  - .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt (anti-leak grep clean)
---

## Recurrence + re-rotation (2026-05-09)

Same trap, second time. During Phase 123 operator setup (24h soak install on iMac), `railway variables` was used to surface `DATABASE_PUBLIC_URL` for a one-shot `generate-key.ts` invocation against prod Postgres. Output table-wrapped at column width and printed the plaintext password into chat context (line `║ postgres:OxXcNTcBBaYDzvYmzoZGoqEkUNRoTRun@p ║`). User rotated the password via Railway dashboard immediately after detection. Vigil-core auto-redeployed and stayed green. No service interruption.

**Pattern locked:** `railway variables` (with or without `--kv`) prints secrets in cleartext at full TTY width. Even when the goal is just one URL, the table-wrap can split the value across visible lines but the underlying string is intact in stdout. Grep'ing the output (e.g. `| grep DATABASE_PUBLIC_URL`) doesn't help if the wrapped continuation line is also filter-matched. **Saved to memory** to prevent third occurrence.

**Files updated this rotation:**
- `feedback_railway_variables_leak.md` — never dump full `railway variables`; use Dashboard or `railway variables get <KEY>`
- `STATE.md` — Deferred Items table corrected (file was already in completed/, table stale)

## Resolution (2026-05-02)

Rotated successfully but the path deviated significantly from what this todo documented. Updated `project_railway_deploy.md` memory so this is not re-learned. Summary:

1. Dashboard "Reset password" updated POSTGRES_PASSWORD env BUT did NOT run `ALTER USER postgres PASSWORD ...` on the live DB → cluster locked out of itself, vigil-core crash-looped on `auth_failed`.
2. vigil-core's DATABASE_URL was a literal copy of the old URL (not a `${{Postgres.DATABASE_URL}}` reference) — converted to reference during recovery.
3. Recovery: ran `ALTER USER postgres WITH PASSWORD '<new>'` via Railway dashboard's Postgres Data/SQL tab (admin path, no user-password auth needed).
4. `railway restart` did NOT pick up the new injection — references resolve at deploy time. `railway redeploy --service vigil-core` was required for a fresh build to re-resolve DATABASE_URL with the current password.
5. Verified green: HTTP 200 + `database: "connected"` at 2026-05-02T22:08:28Z; PWA login + thought capture confirmed by user.

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
