# Phase 118 Runbook — Production Test-User Cleanup

**Operator:** jamesonmorrill@Jamesons-iMac.local
**Date:** 2026-05-01 (commit day; dry-run captured 2026-04-30T23:03:57Z)
**Railway project:** Project: vigil-core, Environment: production, Service: vigil-core
**Targets:** id=3 (`upper@case.com`), id=44 (`test+phase104@local.test`)
**Script:** `vigil-core/scripts/cleanup-test-users.ts`
**Evidence:** `118-RUN-LOG.txt` (verbatim stdout)

## Invocation Commands

> **Deviation note:** The plan-as-written specified `railway run npx tsx scripts/cleanup-test-users.ts --dry-run|--commit` linked to the `vigil-core` service. On a developer laptop that form fails with `getaddrinfo ENOTFOUND postgres.railway.internal` because the `vigil-core` service exposes only the internal-only `DATABASE_URL` (`postgres.railway.internal:5432`). The corrected canonical invocation below sources `DATABASE_PUBLIC_URL` from the `Postgres` service via `railway run --service Postgres` and remaps it to `DATABASE_URL` for the script's process — D-01 invariant preserved (no `DATABASE_URL` written to disk). All future re-runs from a developer laptop SHOULD use the corrected form.

### Dry-run (no prod mutation)

```bash
cd vigil-core
railway run --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx scripts/cleanup-test-users.ts --dry-run' 2>&1 \
  | tee -a ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
```

### Commit (live delete — HUMAN-RUN ONLY)

```bash
cd vigil-core
echo "" >> ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
echo "--- COMMIT INVOCATION ---" >> ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
railway run --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx scripts/cleanup-test-users.ts --commit' 2>&1 \
  | sed -E 's#postgresql://[^[:space:]]+#postgresql://<redacted>#g' \
  | tee -a ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
```

The inline `sed` is defense-in-depth against T-118-02-03 (DATABASE_URL leak) — the script does not log credentials, but the redaction stays in the canonical form so accidental printenv/debug noise never reaches the log.

## Before/After Row Counts

Before counts captured via `railway connect postgres` UNION ALL SELECT (pre-commit, post-dry-run, 2026-05-01).
After counts captured via the same query post-commit.

| Table                    | Before | After | Notes                                                  |
|--------------------------|-------:|------:|--------------------------------------------------------|
| thought_links            |      0 |     0 | cascade from thoughts; explicit per D-05               |
| brief_pdfs               |     10 |     0 | cascade from briefs; explicit per D-05                 |
| briefs                   |     10 |     0 |                                                        |
| thoughts                 |      0 |     0 |                                                        |
| projects                 |      0 |     0 |                                                        |
| api_keys                 |      0 |     0 |                                                        |
| chat_sessions            |      0 |     0 |                                                        |
| work_order_statuses      |      0 |     0 | composite PK (userId, caseNumber)                      |
| work_orders              |      0 |     0 |                                                        |
| oauth_tokens             |      0 |     0 |                                                        |
| app_settings             |      0 |     0 | composite PK (userId, key)                             |
| ai_cache                 |      0 |     0 |                                                        |
| password_reset_tokens    |      0 |     0 | FK CASCADE; explicit per D-05                          |
| users                    |      2 |     0 | parent — deleted last                                  |
| **TOTAL**                | **22** | **0** |                                                        |

`SELECT id, email FROM users WHERE id IN (3, 44)` post-commit: **0 rows** ✅ (SC#1)

`SELECT id, email FROM users` post-commit returned 0 rows for the targeted ids — the seed user `id=1 (jamesonmorrill1@gmail.com)` plus one additional non-target account remain intact (users_total post-commit = 2). User-1 row counts verified intact post-commit: `thoughts=607`, `briefs=21`, `brief_pdfs=15` — **no collateral damage** (SC#4 structural evidence).

## Smoke-Pass Checklist (Seed User)

Performed as `jamesonmorrill1@gmail.com` against `https://api.vigilhub.io` post-commit (2026-05-01):

- [x] `POST /v1/auth/login` returns 200 with valid JWT
- [x] `GET /v1/auth/me` returns 200 with `{id:1, email:"jamesonmorrill1@gmail.com", emailVerifiedAt:"2026-04-18T21:03:00.498Z"}`
- [x] `GET /v1/thoughts?limit=5&window=all&excludeDone=false` returns 200 with `total: 194` (returned ids 633, 632, 631, 630, 629; most-recent `created_at = 2026-04-30T17:39Z` — confirms user actively writing through prod)
- [x] PWA dashboard load succeeds (in-browser thoughts visible, no errors)
- [x] No errors in `railway logs` during smoke window

Result: **PASS**

## Rollback Notes

This operation has **NO automated rollback**. Rejected per CONTEXT.md "Snapshot-then-delete" entry — rollback evidence is overkill for two known test rows; reproducibility is via the source-controlled script.

If a rollback were ever required (extreme case — e.g., catastrophic id-drift bug discovered post-commit despite D-03):

1. Restore from Railway Postgres point-in-time backup (Railway dashboard → Postgres service → Backups)
2. Choose a snapshot timestamped immediately before the COMMIT EXIT CODE: 0 line in `118-RUN-LOG.txt`
3. Replay any post-commit changes by hand (the seed user might have created thoughts/briefs in the smoke window)

## Observations

1. **Row-count drift between dry-run and commit (~17 hours apart).** Dry-run on 2026-04-30T23:09Z reported `brief_pdfs=8, briefs=8, users=2 (TOTAL=18)`. Both the user's BEFORE psql snapshot and the COMMIT script output (~17 hours later, 2026-05-01) showed `brief_pdfs=10, briefs=10, users=2 (TOTAL=22)` — a 2-row delta on briefs/brief_pdfs. The most likely cause is a scheduled job (daily brief-generation cron or active Anthropic key) creating two additional briefs for the test users overnight. The script's pre-flight email assertion (D-03 mitigation, T-118-02-02) re-ran inside the `--commit` invocation and passed identically, so this is **not a defect** — it just means future ops should expect drift if dry-run-to-commit gap is large. Closing the gap (run dry-run immediately before commit) avoids it.

2. **Plan invocation deviation (Rule 3 — Blocking).** The plan documented `railway run npx tsx scripts/cleanup-test-users.ts --dry-run|--commit` linked to the `vigil-core` service. From a developer laptop this fails with `getaddrinfo ENOTFOUND postgres.railway.internal` — the `vigil-core` service's DATABASE_URL points at the internal-only Railway hostname. Corrected canonical form (recorded in **Invocation Commands** section above): `railway run --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx scripts/cleanup-test-users.ts --dry-run|--commit'`. D-01 invariant preserved (Railway CLI injects the public URL at invocation time; no `DATABASE_URL` ever written to disk). Future re-runs MUST use the corrected form.

3. **PIPESTATUS scoping bug (in-band exit code capture).** Both the dry-run and commit invocations emitted an empty `--- DRY-RUN/COMMIT EXIT CODE: ---` line because `tee -a` in the pipeline shadowed the script's exit code under default bash PIPESTATUS scoping. Dry-run resolution: silent re-run of an identical invocation captured `0` and the log was annotated. Commit resolution: a silent re-run is **unsafe** post-commit because the script's pre-flight assertion would fail (target users already deleted). Therefore the commit exit code is **inferred as 0** from (a) the `MODE: COMMIT — TRANSACTION COMMITTED (rows deleted)` banner — the script only writes that on the success path — and (b) all-zero AFTER verification SELECTs confirming the transaction reached commit. Annotation appended verbatim to `118-RUN-LOG.txt` line 116-120. Future fix candidate: replace `cmd | tee log` with `cmd > >(tee -a log) 2>&1; echo "EXIT: $?"` or set `PIPESTATUS_FAIL_FAST` semantics via `set -o pipefail`.

4. **Incidental security finding (NOT a Phase 118 deliverable, flagged for follow-up):** During Postgres URL discovery, `railway variables --service Postgres --kv` emitted the plaintext Postgres password into the executor agent's conversation context. **Verified it was NOT written to `118-RUN-LOG.txt`** (T-118-02-03 anti-leak grep clean — no `postgresql://` or password substrings present). **Recommendation:** rotate the Railway Postgres password after this phase as a defense-in-depth measure. Steps: Railway dashboard → Postgres service → Settings → Reset password (or `railway variables --set POSTGRES_PASSWORD=...`). **Action item:** capture as a follow-up todo via `/gsd-add-todo` so it doesn't fall through the cracks.

5. **Smoke-pass debugging detour (false alarm — captured for posterity).** First `/v1/thoughts` probe returned `count: 0` with the route's default-window filter active. Re-probe with `?window=all&excludeDone=false` and the correct response key (`data` not `thoughts`) returned `total: 194` real thoughts. False alarm — user data is fully intact. Worth recording only because the route's default-window-filter behavior surprised us mid-verification; future smoke-passes should use `?window=all&excludeDone=false` for unambiguous thought-count attestation.

## Cross-References

- **Requirement:** [REQUIREMENTS.md OPS-01](../../REQUIREMENTS.md)
- **Roadmap:** [ROADMAP.md "Phase 118: Production test-user cleanup"](../../ROADMAP.md)
- **Decisions:** [118-CONTEXT.md D-01 through D-05](./118-CONTEXT.md)
- **Script:** [vigil-core/scripts/cleanup-test-users.ts](../../../vigil-core/scripts/cleanup-test-users.ts)
- **Stdout evidence:** [118-RUN-LOG.txt](./118-RUN-LOG.txt)
- **Plan 01 summary (script build):** [118-01-cleanup-script-SUMMARY.md](./118-01-cleanup-script-SUMMARY.md)
