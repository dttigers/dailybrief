---
created: 2026-04-26T17:07:43.948Z
completed: 2026-05-02T22:35:00Z
resolution: moot — self-recovered
title: Disable gmail-workorders importer tick — invalid_grant since 2026-04-26
area: api
files:
  - vigil-core/src/services/gmail-workorder-service.ts:39
  - vigil-core/src/services/gmail-workorder-service.ts:183
  - vigil-core/src/services/gmail-workorder-service.ts:287
---

## Resolution (2026-05-02)

**Moot — importer self-recovered.** Verified live in vigil-core production logs after the 2026-05-02 redeploy:

```
[gmail-workorders] started (5m tick interval)
[gmail-workorders] Work order CS0356295 updated: ...
[gmail-workorders] Imported 8 work order(s)
[gmail-workorders] No new work orders to import
```

No `invalid_grant`, actively importing and updating ServiceNow work-order notification emails. Likely cause of recovery: OAuth refresh-token regenerated automatically once usage resumed, OR the 2026-05-02 vigil-core redeploy (triggered for the unrelated DB password rotation) reset some cached auth state.

Either way: importer is healthy, no code change needed. Closing without action.

If `invalid_grant` returns: re-do Google OAuth consent flow for the importer's service account credentials (Google's refresh tokens expire after 6 months of inactivity for unverified apps).

## Problem

Railway production logs (deploy `44cb338`, observed 2026-04-26 ~17:02 UTC) show the
gmail-workorders importer failing every 5 minutes with:

```
[gmail-workorders] import tick failed GaxiosError: invalid_grant
error: 'invalid_grant'
error_description: 'Token has been expired or revoked.'
```

Stack trace originates at `getValidAccessToken` (gmail-workorder-service.ts:39),
called from `importWorkOrders` (line 183), invoked by the 5-minute `tick` loop
(line 287). Google has revoked or expired the OAuth refresh token; every tick
hits the same wall.

This compounds the existing "Work Order source pivot" decision (memory:
`project_work_order_source_pivot.md`) — IT was already blocking Gmail
forwarding + IMAP; now the OAuth path is dead too. ServiceNow API is the
target replacement, blocked on the same token as G2 v0.2.0.

Until the ServiceNow path lands, this importer:
- Spams Railway logs every 5 min with a multi-page stack trace (noise that
  drowns real errors during phase 113/114 UAT and beyond)
- Wastes a function invocation each tick
- Provides zero work-order ingestion (Gmail path was already blocked at the
  IT layer; the OAuth death is just the visible failure mode)

## Solution

Two-phase approach (pick based on appetite when this surfaces):

**Quick fix (15 min) — disable the tick:**
Add an env gate (e.g. `GMAIL_WORKORDERS_ENABLED`, default `false` in prod) and
short-circuit `tick()` at gmail-workorder-service.ts:287 if disabled. Set the
env var to `false` on Railway. Importer goes silent; existing data untouched;
re-enable trivially when ServiceNow lands or the OAuth path is revived.

**Proper fix (when ServiceNow API path lands):**
Delete the gmail-workorder-service entirely (file + tick registration in the
service entrypoint + any DB migrations specific to gmail-only fields). Replace
with the ServiceNow polling/push handler. Couples cleanly with the v3.7
work-order pivot phase.

Recommended: ship the quick fix first to silence prod noise during v3.6 UAT,
then do the proper rip-and-replace as part of the ServiceNow phase.

## Reference

- Work Order source pivot memory: `~/.claude/projects/-Users-jamesonmorrill-Desktop-Local-AI-dailybrief/memory/project_work_order_source_pivot.md`
- Phase 22 (original IMAP work email importer)
- ServiceNow API path is blocked on the same OAuth token as G2 v0.2.0 (per memory)
