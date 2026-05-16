---
phase: 129-lifecycle-restore-servicenow-popup
plan: "08"
closes_gap: GAP-129-C
operator: Jameson Morrill
started: 2026-05-16T17:50:00Z
completed: 2026-05-16T17:57:00Z
status: no-op  # one of: pending | in_progress | completed | rolled_back | aborted | no-op
migration_file: vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql
migration_md5: 6576060561ec03301d9a2efef546f5eb
production_target: Railway-hosted Postgres (vigil-core production deployment's DATABASE_URL)
production_api: https://api.vigilhub.io
probe_sentinel_case_number: CS9999999
---

# 129-08 — Production Migration 0021 Deploy Log

This is the operator-fillable deploy log for closing **GAP-129-C** (production server returning HTTP 500 on `/v1/work-orders/sync` because the production DB has not had migration `0021_add_work_orders_client_capture_id.sql` applied).

The migration adds:
1. `client_capture_id text` (nullable) column on `work_orders`
2. `uq_work_orders_user_client_capture_id` partial unique index on `(user_id, client_capture_id) WHERE client_capture_id IS NOT NULL`

Both DDL statements use `IF NOT EXISTS` — re-runs are safe.

> **IMPORTANT — secrets handling:** When pasting `curl` output below, do NOT paste request headers (which contain `Authorization: Bearer <token>`). Use `curl -s` (silent mode, body-only output) as shown in the commands. After completion the deploy log will be grep-checked for `Authorization: Bearer` and must return zero matches.

---

## Pre-Deploy State

This section establishes baseline before the migration is applied. Three subsections — schema snapshot, HTTP probe (proves the bug exists), and negative probe (proves the legacy path is unaffected).

### Schema snapshot (production)

**Command (operator runs from a shell with `PROD_DATABASE_URL` exported):**

```bash
psql "$PROD_DATABASE_URL" -c "\d work_orders"
```

**Expected pre-deploy:** The column list does NOT include `client_capture_id`, and there is no `uq_work_orders_user_client_capture_id` index. (This matches the UAT GAP-129-C confirmation that the column was missing.)

**Output (captured 2026-05-16T17:50Z by operator from production):**

```
                           Table "public.work_orders"
       Column        |           Type           | Collation | Nullable | Default
---------------------+--------------------------+-----------+----------+----------
 case_number         | text                     |           | not null |
 store               | text                     |           | not null | ''::text
 short_description   | text                     |           | not null | ''::text
 trade               | text                     |           | not null | ''::text
 location            | text                     |           | not null | ''::text
 equipment           | text                     |           | not null | ''::text
 priority            | text                     |           | not null | ''::text
 contact             | text                     |           | not null | ''::text
 state               | text                     |           | not null | ''::text
 synced_at           | timestamp with time zone |           | not null | now()
 notes               | text                     |           | not null | ''::text
 last_change_at      | timestamp with time zone |           |          |
 last_change_summary | text                     |           |          |
 archived_at         | timestamp with time zone |           |          |
 user_id             | integer                  |           | not null |
 client_capture_id   | text                     |           |          |
Indexes:
    "work_orders_pkey" PRIMARY KEY, btree (case_number)
    "idx_work_orders_user_id" btree (user_id)
    "uq_work_orders_user_client_capture_id" UNIQUE, btree (user_id, client_capture_id) WHERE client_capture_id IS NOT NULL
Foreign-key constraints:
    "work_orders_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
```

**ACTUAL finding (deviation from expected pre-deploy):** Column `client_capture_id text` (nullable) is **already present**, and the `uq_work_orders_user_client_capture_id` partial unique index is **already present**. The migration was applied to production between UAT session 1 (2026-05-15) and this deploy attempt (2026-05-16) — most likely by a Railway autodeploy running `drizzle-kit migrate` automatically on a subsequent code push. This is the documented "no-op" edge case below.

### HTTP probe (proves the bug)

This POST exercises the `dbInsertOrGet` code path in `vigil-core/src/routes/work-orders.ts` (line 122) by including a `clientCaptureId` field. Pre-deploy, the route throws on the missing column → HTTP 500.

**Generate a fresh UUID for this probe:**

```bash
PRE_DEPLOY_UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
echo "Pre-deploy probe UUID: $PRE_DEPLOY_UUID"
```

**Command (operator runs from a shell with `PROD_API_KEY` exported):**

```bash
curl -s -o /tmp/probe-pre.json -w "HTTP %{http_code}\n" \
  -X POST "https://api.vigilhub.io/v1/work-orders/sync" \
  -H "Authorization: Bearer $PROD_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"workOrders\":[{\"caseNumber\":\"CS9999999\",\"shortDescription\":\"Phase 129 deploy probe — GAP-129-C pre-deploy\",\"priority\":\"Low\",\"clientCaptureId\":\"$PRE_DEPLOY_UUID\"}]}"
cat /tmp/probe-pre.json
```

**Expected pre-deploy:** `HTTP 500` and body `{"error":"Internal server error"}` (or equivalent generic-error envelope).

**Output (HTTP status line + response body — NO request headers):**

```
<operator pastes status line + body here>
```

### Negative probe (proves the legacy path works)

Same endpoint, no `clientCaptureId` field. This exercises the `dbUpsertLegacy` path (line 125 of `work-orders.ts`) which uses only existing columns and is expected to return HTTP 200 even pre-deploy. The point is to confirm the route is reachable and only the new-column path fails.

**Command:**

```bash
curl -s -o /tmp/probe-neg.json -w "HTTP %{http_code}\n" \
  -X POST "https://api.vigilhub.io/v1/work-orders/sync" \
  -H "Authorization: Bearer $PROD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"workOrders":[{"caseNumber":"CS9999998","shortDescription":"Phase 129 negative probe — legacy path","priority":"Low"}]}'
cat /tmp/probe-neg.json
```

**Expected pre-deploy:** `HTTP 200` with a `{"synced":...}` body — proves the route is reachable and only the new-column path throws.

**Output:**

```
<operator pastes status line + body here>
```

> **Edge case:** If the pre-deploy probe returns HTTP 200 instead of HTTP 500, the bug may already have been resolved by an out-of-band deploy (e.g., a Railway autodeploy that already ran the migration). If that happens, skip the "Apply Migration" section, jump directly to "Post-Deploy Verification" to confirm with the post-deploy schema snapshot + dedup probe, and write "no-op — already applied" in the Operator Sign-Off. Resume signal in that case: type `approved (no-op)`.

---

## Apply Migration

**Two options.** Pick one. Migration is idempotent (`IF NOT EXISTS` throughout) so re-running on partial failure is safe.

### Option A (preferred) — drizzle-kit migrate

Applies pending migrations in sequence against `DATABASE_URL`. If local-dev parity has been maintained, migration `0021` is the only pending one.

**Command:**

```bash
cd vigil-core
DATABASE_URL="$PROD_DATABASE_URL" npx drizzle-kit migrate
```

**Expected output:** drizzle-kit confirms migration `0021_add_work_orders_client_capture_id` applied successfully (no errors).

### Option B (fallback) — direct psql apply

Runs the SQL file directly. Use this if Option A errors out for any non-DB reason (e.g., drizzle-kit version mismatch, env-loading issue).

**Command:**

```bash
psql "$PROD_DATABASE_URL" -f vigil-core/drizzle/0021_add_work_orders_client_capture_id.sql
```

**Expected output:** Two `ALTER TABLE` / `CREATE INDEX` success messages (or `NOTICE: relation already exists, skipping` lines if any subset was already applied — both are fine because IF NOT EXISTS).

**Output (operator pastes whichever option was used):**

```
<operator pastes apply command output here>
```

> **Edge case:** If the apply fails partway (e.g., ALTER succeeds but CREATE INDEX hits a transient lock), the `IF NOT EXISTS` clauses make a re-run safe. Paste the error, re-run, and paste the second-run output below the first.

---

## Post-Deploy Verification

This section confirms the migration achieved its goal: column + index present, `clientCaptureId`-bearing POSTs return HTTP 200, and dedup behavior matches SVCNOW-04 spec.

### Schema snapshot (production)

Same `psql` command from pre-deploy.

**Command:**

```bash
psql "$PROD_DATABASE_URL" -c "\d work_orders"
```

**Expected post-deploy:** Column list now includes `client_capture_id | text |` (nullable), and the indexes list now includes `uq_work_orders_user_client_capture_id` as a partial unique index on `(user_id, client_capture_id) WHERE (client_capture_id IS NOT NULL)`.

**Output:**

```
<operator pastes psql output here>
```

**Optional belt-and-suspenders introspection (single-line checks):**

```bash
psql "$PROD_DATABASE_URL" -tAc "SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'client_capture_id';"
# expect: 1
psql "$PROD_DATABASE_URL" -tAc "SELECT 1 FROM pg_indexes WHERE indexname = 'uq_work_orders_user_client_capture_id';"
# expect: 1
```

**Output:**

```
<operator pastes output here, both should print 1>
```

### HTTP probe (proves the fix)

Same probe shape as pre-deploy. New UUID.

**Generate a fresh UUID:**

```bash
POST_DEPLOY_UUID_1=$(uuidgen | tr '[:upper:]' '[:lower:]')
echo "Post-deploy probe UUID #1 (single-shot probe): $POST_DEPLOY_UUID_1"
```

**Command:**

```bash
curl -s -o /tmp/probe-post.json -w "HTTP %{http_code}\n" \
  -X POST "https://api.vigilhub.io/v1/work-orders/sync" \
  -H "Authorization: Bearer $PROD_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"workOrders\":[{\"caseNumber\":\"CS9999999\",\"shortDescription\":\"Phase 129 deploy probe — GAP-129-C post-deploy\",\"priority\":\"Low\",\"clientCaptureId\":\"$POST_DEPLOY_UUID_1\"}]}"
cat /tmp/probe-post.json
```

**Expected post-deploy:** `HTTP 200` and body `{"synced":1}` (new clientCaptureId, isNew:true path).

**Output:**

```
<operator pastes status line + body here>
```

### Dedup probe (proves SVCNOW-04 on prod)

The dedup contract: sending the SAME `clientCaptureId` twice. First call writes the row (`synced: 1`); second call hits the partial unique index and returns the existing row (`synced: 0`).

**Generate ONE UUID and reuse it for both calls:**

```bash
DEDUP_UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
echo "Dedup probe UUID (used for BOTH calls): $DEDUP_UUID"
```

**First call:**

```bash
curl -s -o /tmp/probe-dedup-1.json -w "HTTP %{http_code}\n" \
  -X POST "https://api.vigilhub.io/v1/work-orders/sync" \
  -H "Authorization: Bearer $PROD_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"workOrders\":[{\"caseNumber\":\"CS9999999\",\"shortDescription\":\"Phase 129 dedup probe — first call\",\"priority\":\"Low\",\"clientCaptureId\":\"$DEDUP_UUID\"}]}"
cat /tmp/probe-dedup-1.json
```

**Expected (first call):** `HTTP 200` + `{"synced":1}`.

**Output (captured 2026-05-16T17:55Z):**

```
HTTP 200
{"synced":1}
```

✅ Matches expected. New clientCaptureId, `isNew:true` path — `dbInsertOrGet` works on prod.

**Second call (SAME body, SAME clientCaptureId):**

```bash
curl -s -o /tmp/probe-dedup-2.json -w "HTTP %{http_code}\n" \
  -X POST "https://api.vigilhub.io/v1/work-orders/sync" \
  -H "Authorization: Bearer $PROD_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"workOrders\":[{\"caseNumber\":\"CS9999999\",\"shortDescription\":\"Phase 129 dedup probe — first call\",\"priority\":\"Low\",\"clientCaptureId\":\"$DEDUP_UUID\"}]}"
cat /tmp/probe-dedup-2.json
```

**Expected (second call):** `HTTP 200` + `{"synced":0}` — the partial unique index caught the duplicate; `dbInsertOrGet` returned `isNew:false`.

**Output (captured 2026-05-16T17:55Z):**

```
HTTP 200
{"synced":0}
```

✅ Matches expected. Same clientCaptureId → partial unique index `uq_work_orders_user_client_capture_id` caught the duplicate; `dbInsertOrGet` returned `isNew:false`. **SVCNOW-04 dedup contract verified on production.**

### Cleanup

Remove all the test rows produced above. Replace `<operator_user_id>` with the operator's prod `users.id` (UUID) — find it via `psql "$PROD_DATABASE_URL" -tAc "SELECT id FROM users WHERE email = 'jamesonmorrill1@gmail.com';"` (or whichever email is on the prod API key in use).

**Command:**

```bash
psql "$PROD_DATABASE_URL" -c \
  "DELETE FROM work_orders WHERE case_number IN ('CS9999999','CS9999998') AND user_id = '<operator_user_id>';"
```

**Expected output:** `DELETE n` where `n` is the number of test rows created above (typically 1 to 4 depending on how many probes were retried).

**Output (captured 2026-05-16T17:57Z):**

```
$ psql "$PROD_DATABASE_URL" -tAc "SELECT id FROM users WHERE email = 'jamesonmorrill1@gmail.com';"
1
$ psql "$PROD_DATABASE_URL" -c "DELETE FROM work_orders WHERE case_number = 'CS9999999' AND user_id = 1;"
DELETE 1
```

✅ Single probe row removed (matches the dedup probe set — both calls used the same clientCaptureId so only one row was ever written). Prod is clean.

---

## Rollback Procedure (use only if post-deploy probes fail)

### When to roll back

Only roll back if BOTH of these hold:
1. The post-deploy schema snapshot shows the migration WAS applied (column + index present).
2. The post-deploy HTTP probe still returns HTTP 500.

That combination means "apply succeeded but the bug isn't actually GAP-129-C" — there's a different bug, and rollback won't fix it. **Investigate before rolling back.** Capture the actual HTTP 500 response body and any server logs first.

If the migration apply itself failed, do NOT roll back — the `IF NOT EXISTS` clauses leave the DB in either the pre-apply state or a partially-applied state, and re-running the apply is safe.

### Rollback SQL

**Command:**

```bash
psql "$PROD_DATABASE_URL" <<'SQL'
DROP INDEX IF EXISTS "uq_work_orders_user_client_capture_id";
ALTER TABLE "work_orders" DROP COLUMN IF EXISTS "client_capture_id";
SQL
```

**Output:**

```
<operator pastes output here only if rollback was actually executed>
```

### Why rollback is safe

- No real popup submissions have written `client_capture_id` values into prod yet. Per UAT (`129-UAT-RESULTS.md` Scenario 4b/4c), every popup POST with a `clientCaptureId` field has returned HTTP 500 → no rows were ever written with that column populated. Rollback therefore drops a column that contains only NULLs and an index that has no entries (partial index `WHERE client_capture_id IS NOT NULL`).
- The `/v1/work-orders/sync` route splits on `wo.clientCaptureId != null` (`work-orders.ts` lines 121–125). The `dbUpsertLegacy` branch — the one taken when `clientCaptureId` is null/omitted — uses only pre-existing columns and continues to work without `client_capture_id`. Plan 129-04's `behavior` tests cover the omitted-clientCaptureId case (backward-compat). Rollback restores the route to "legacy path only, returns 500 only on clientCaptureId-bearing POSTs" — i.e., the exact state described by GAP-129-C.
- Drizzle ORM types reference `clientCaptureId` in `schema.ts`, but at runtime, Postgres just throws on the missing column when `dbInsertOrGet` attempts a SELECT/INSERT. Rollback restores the pre-GAP-129-C state cleanly.

After a rollback, surface a new gap (e.g., GAP-129-C-2) in `129-UAT-RESULTS.md` with the actual error mode observed.

---

## Lessons Learned + Process Gap

Plan 129-01's task description explicitly scoped its migration apply step to the local dev DB only (Task 2: "`cd vigil-core && npx drizzle-kit migrate` against the configured DATABASE_URL (default: local Postgres dev DB)"). Production deployment was implicit — assumed to be picked up by the existing Railway autodeploy pipeline alongside the code rollout. In practice, the Railway code deploy outpaced the schema migration, so production code (with `dbInsertOrGet` referencing `client_capture_id`) shipped before the column existed in prod → every `clientCaptureId`-bearing POST throws → HTTP 500.

**Process change for future schema-changing plans:** any plan that touches `vigil-core/drizzle/*.sql` MUST include an explicit "production deploy" task (operator-run if Claude lacks credentials, automated if a deploy pipeline gate exists). The deploy pipeline itself should ideally gate code rollout on migration parity (refuse to deploy code commit `C` if its migrations are not yet applied to prod) — see plan **129-12** (build-gate process change) for the broader rule on plan-scoped verification missing production-relevant checks. Same root-cause class: plan-scoped checks miss out-of-repo state.

This deploy log itself is the audit trail for the corrective action.

---

## Operator Sign-Off

- **Operator:** Jameson Morrill
- **Completion timestamp (ISO 8601 UTC):** `2026-05-16T17:57:00Z`
- **Final status:** `no-op` — migration was already applied to production by an out-of-band path before this deploy attempt began. Post-deploy probes both green (synced:1 then synced:0), confirming the production state is correct without this plan having applied the migration itself.
- **Notes:**

```
Pre-deploy schema snapshot showed `client_capture_id` column AND `uq_work_orders_user_client_capture_id`
partial unique index already present at 2026-05-16T17:50Z. Most likely Railway autodeploy triggered
`drizzle-kit migrate` during a subsequent code-push build between UAT session 1 (2026-05-15) and this
deploy attempt (2026-05-16). The Apply Migration section was skipped entirely; we went straight to
post-deploy verification.

The pre-deploy HTTP 500 probe was also skipped — the schema snapshot already proved the bug surface
(missing column) was gone. Running the probe would have returned HTTP 200 and added no new evidence.

The dedup probe (the meaningful test) was run and both expected results landed:
  - First call (new clientCaptureId)   → HTTP 200 + {"synced":1}
  - Second call (same clientCaptureId) → HTTP 200 + {"synced":0}

This confirms `dbInsertOrGet` works on prod AND the partial unique index correctly dedupes — the
exact SVCNOW-04 contract the migration was designed to enforce. GAP-129-C is closed.

UAT scenarios 4b (multi-tab POST race) and 4c (retry-storm idempotency) are now unblocked and can
be re-run in plan 129-13's close-out UAT.

Process gap follow-up (Lessons Learned section above): plan 129-12 already documents the rule that
schema-changing plans must include an explicit production-deploy task. This no-op outcome doesn't
change that — it just means the implicit Railway autodeploy happened to do the right thing this
time, which is exactly the kind of "lucky" outcome the process change is designed to prevent
relying on.
```

**Resume signal back to /gsd-execute-phase orchestrator:** `approved (no-op)`
