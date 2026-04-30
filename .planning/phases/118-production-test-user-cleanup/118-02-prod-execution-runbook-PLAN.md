---
phase: 118-production-test-user-cleanup
plan: 02
type: execute
wave: 2
depends_on: ["118-01"]
files_modified:
  - .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
  - .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md
autonomous: false
requirements: [OPS-01]
must_haves:
  truths:
    - "`SELECT * FROM users WHERE id IN (3, 44)` against Railway prod returns zero rows after --commit invocation"
    - "Every one of the 14 user-scoped tables shows zero rows for user_id IN (3, 44) post-commit (verified by orphan-check SELECTs)"
    - "118-RUNBOOK.md exists with sections: Invocation Commands, Before/After Row Counts, Smoke-Pass Checklist, Rollback Notes, Observations"
    - "118-RUN-LOG.txt contains verbatim stdout for both --dry-run and --commit invocations against Railway prod"
    - "Seed user `jamesonmorrill1@gmail.com` still authenticates against Railway prod and can read thoughts after cleanup (smoke-pass)"
  artifacts:
    - path: ".planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md"
      provides: "Human audit trail — checklist + before/after table + smoke results + rollback notes"
      contains: "## Before/After Row Counts"
    - path: ".planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt"
      provides: "Machine-readable proof of dry-run + commit execution"
      contains: "MODE: COMMIT — TRANSACTION COMMITTED"
  key_links:
    - from: ".planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md"
      to: ".planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt"
      via: "Runbook references RUN-LOG.txt as evidence"
      pattern: "118-RUN-LOG"
    - from: "Railway prod Postgres"
      to: "vigil-core/scripts/cleanup-test-users.ts"
      via: "railway run npx tsx scripts/cleanup-test-users.ts --commit (DATABASE_URL injected by Railway CLI)"
      pattern: "railway run"
---

<objective>
Execute the Plan 01 cleanup script against Railway prod (dry-run, then commit) and produce two committed artifacts capturing the operation: machine-readable `118-RUN-LOG.txt` (verbatim stdout) and human-readable `118-RUNBOOK.md` (checklist + before/after row counts + smoke results + rollback notes).

Purpose: This is the OPS-01 deliverable. The script alone is not enough — without the runbook, there's no audit trail proving the operation happened cleanly and that the seed user still functions.

Output:
- `.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt` — concatenated stdout of `--dry-run` followed by `--commit` invocations
- `.planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md` — markdown audit trail with before/after row counts, smoke-pass checklist, observations

**This plan is `autonomous: false` — Task 2 (live --commit against prod) is a `checkpoint:human-action`. Claude prepares the dry-run and the runbook draft; the user pulls the trigger on --commit.**
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/118-production-test-user-cleanup/118-CONTEXT.md
@.planning/phases/118-production-test-user-cleanup/118-01-cleanup-script-SUMMARY.md
@vigil-core/scripts/cleanup-test-users.ts

<interfaces>
<!-- Required CLI invocations — exact form -->

Railway CLI confirmed at `/usr/local/bin/railway` (v4.36.1).

Dry-run (no prod mutation):
```bash
cd vigil-core
railway run npx tsx scripts/cleanup-test-users.ts --dry-run | tee -a ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
```

Commit (live delete — HUMAN-RUN ONLY):
```bash
cd vigil-core
railway run npx tsx scripts/cleanup-test-users.ts --commit | tee -a ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
```

Post-commit verification SELECTs (run via railway CLI psql or a one-liner tsx):
```bash
# Option A (preferred): railway connect postgres → psql prompt
railway connect postgres
\c vigil_prod
SELECT id, email FROM users WHERE id IN (3, 44);  -- expect 0 rows
SELECT 'thought_links' AS t, COUNT(*) FROM thought_links WHERE user_id IN (3, 44)
UNION ALL SELECT 'brief_pdfs',           COUNT(*) FROM brief_pdfs           WHERE user_id IN (3, 44)
UNION ALL SELECT 'briefs',               COUNT(*) FROM briefs               WHERE user_id IN (3, 44)
UNION ALL SELECT 'thoughts',             COUNT(*) FROM thoughts             WHERE user_id IN (3, 44)
UNION ALL SELECT 'projects',             COUNT(*) FROM projects             WHERE user_id IN (3, 44)
UNION ALL SELECT 'api_keys',             COUNT(*) FROM api_keys             WHERE user_id IN (3, 44)
UNION ALL SELECT 'chat_sessions',        COUNT(*) FROM chat_sessions        WHERE user_id IN (3, 44)
UNION ALL SELECT 'work_order_statuses',  COUNT(*) FROM work_order_statuses  WHERE user_id IN (3, 44)
UNION ALL SELECT 'work_orders',          COUNT(*) FROM work_orders          WHERE user_id IN (3, 44)
UNION ALL SELECT 'oauth_tokens',         COUNT(*) FROM oauth_tokens         WHERE user_id IN (3, 44)
UNION ALL SELECT 'app_settings',         COUNT(*) FROM app_settings         WHERE user_id IN (3, 44)
UNION ALL SELECT 'ai_cache',             COUNT(*) FROM ai_cache             WHERE user_id IN (3, 44)
UNION ALL SELECT 'password_reset_tokens',COUNT(*) FROM password_reset_tokens WHERE user_id IN (3, 44);
-- Every row's count column must be 0.
```

Smoke-pass against prod (seed user — already known credentials):
```bash
# Adjust API base to actual prod URL (api.vigilhub.io per memory)
PROD_API="https://api.vigilhub.io"
EMAIL="jamesonmorrill1@gmail.com"
# Login → get JWT
TOKEN=$(curl -sS -X POST "$PROD_API/v1/auth/login" \
  -H "content-type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"<seed-password>\"}" \
  | jq -r '.token')
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { echo "LOGIN FAILED"; exit 1; }
# /v1/auth/me
curl -sS "$PROD_API/v1/auth/me" -H "authorization: Bearer $TOKEN" | jq .
# Read thoughts
curl -sS "$PROD_API/v1/thoughts?limit=5" -H "authorization: Bearer $TOKEN" | jq '.thoughts | length'
# Generate brief (existing AUTH-09 endpoint pattern; if none, fall back to PWA-side click)
curl -sS -X POST "$PROD_API/v1/briefs/generate" -H "authorization: Bearer $TOKEN" | jq '.briefId'
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Run dry-run against Railway prod and capture output</name>
  <files>.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</files>
  <read_first>
    - .planning/phases/118-production-test-user-cleanup/118-CONTEXT.md (D-01 explicitly requires `railway run` injection — no local DATABASE_URL)
    - .planning/phases/118-production-test-user-cleanup/118-01-cleanup-script-SUMMARY.md (any deviations from the plan that affect output format)
    - vigil-core/scripts/cleanup-test-users.ts (the script being executed; verify the file is committed before running)
  </read_first>
  <action>
1. **Sanity check Railway CLI auth and project link** (no prod mutation):
   ```bash
   railway --version          # expect 4.x
   railway whoami             # confirms logged-in account
   railway status             # confirms current project + environment
   ```
   If `railway status` shows the wrong project or no project linked, abort and ask the user to run `railway link` first.

2. **Initialize the run log** with a header:
   ```bash
   mkdir -p .planning/phases/118-production-test-user-cleanup
   cat > .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt <<EOF
   ============================================================
   Phase 118 — Production Test-User Cleanup — Run Log
   ============================================================
   Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
   Operator: $(whoami)@$(hostname)
   Railway project: $(railway status 2>&1 | head -5)
   Script: vigil-core/scripts/cleanup-test-users.ts
   Targets: id=3 (upper@case.com), id=44 (test+phase104@local.test)
   ============================================================

   --- DRY-RUN INVOCATION ---
   EOF
   ```

3. **Run dry-run via Railway CLI** and append stdout+stderr to the log:
   ```bash
   cd vigil-core
   railway run npx tsx scripts/cleanup-test-users.ts --dry-run 2>&1 \
     | tee -a ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
   echo "--- DRY-RUN EXIT CODE: $? ---" \
     >> ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
   cd -
   ```

4. **Inspect dry-run output** for:
   - `Pre-flight OK: id=3 -> upper@case.com, id=44 -> test+phase104@local.test`
   - 14 per-table row-count lines
   - `MODE: DRY-RUN — TRANSACTION ROLLED BACK (no prod mutation)` closing banner
   - Exit code 0

5. **If pre-flight FAILED** (any mismatch): STOP. Do NOT proceed to Task 2. Report the mismatch — likely id drift; CONTEXT.md D-03 deferred ids may have been reassigned. Investigate before any --commit.

6. **If dry-run succeeded:** record the per-table row counts in a temp note for Task 3's runbook draft. Do NOT proceed to Task 2 yet — Task 2 is a checkpoint.
  </action>
  <verify>
    <automated>test -f .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</automated>
    <automated>grep -F "DRY-RUN INVOCATION" .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</automated>
    <automated>grep -F "Pre-flight OK" .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</automated>
    <automated>grep -F "DRY-RUN — TRANSACTION ROLLED BACK" .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</automated>
    <automated>grep -F "DRY-RUN EXIT CODE: 0" .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt` exists
    - File contains the literal string `DRY-RUN INVOCATION`
    - File contains `Pre-flight OK: id=3 -> upper@case.com, id=44 -> test+phase104@local.test`
    - File contains 14 per-table row-count entries (one each: thought_links, brief_pdfs, briefs, thoughts, projects, api_keys, chat_sessions, work_order_statuses, work_orders, oauth_tokens, app_settings, ai_cache, password_reset_tokens, users)
    - File contains the closing banner `MODE: DRY-RUN — TRANSACTION ROLLED BACK (no prod mutation)`
    - File contains `DRY-RUN EXIT CODE: 0`
    - `railway status` confirms a Railway project is linked before the run
    - No DATABASE_URL string is written to the log file (the env value should not be echoed)
  </acceptance_criteria>
  <done>
    Dry-run executed against Railway prod via `railway run`. Pre-flight passed (ids 3+44 still map to expected emails). 14 row-count lines captured. ROLLBACK banner present. Output appended to 118-RUN-LOG.txt. No prod mutation. Counts available for runbook draft. Ready for human checkpoint at Task 2.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Human runs --commit against Railway prod</name>
  <files>.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</files>
  <read_first>
    - .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt (the dry-run output Claude just produced — user MUST inspect)
    - .planning/phases/118-production-test-user-cleanup/118-CONTEXT.md (D-02 explicitly requires the human-in-the-loop two-step gate; this checkpoint IS the gate)
  </read_first>
  <what-built>
    Plan 01 produced the cleanup script. Task 1 of this plan ran it in --dry-run mode against Railway prod via `railway run`. Stdout is captured in `118-RUN-LOG.txt` showing pre-flight passed and which row counts WOULD be deleted on --commit.
  </what-built>
  <action>
**STOP — Claude does NOT execute this task. This is `checkpoint:human-action`. Per D-02, --commit must be a human-issued command after human inspection of the dry-run output. Claude pauses here and waits for the resume signal.**

The user performs the following 5 steps in their own terminal, then types the resume signal back:

1. **Inspect the dry-run output.** Read `.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt` and confirm:
   - Pre-flight banner shows `id=3 -> upper@case.com` and `id=44 -> test+phase104@local.test` (D-03 satisfied — no id drift)
   - Per-table row counts look reasonable (e.g., thoughts > 0, briefs > 0; nothing implausibly huge that would suggest a wrong DB)
   - `MODE: DRY-RUN — TRANSACTION ROLLED BACK` banner present
   - `DRY-RUN EXIT CODE: 0`

2. **Capture BEFORE counts** via psql (these go into the runbook in Task 3):
   ```bash
   railway connect postgres
   ```
   At the psql prompt, run the UNION ALL SELECT block from the plan's `<interfaces>` section. Save the output (paste into a scratch file) as the "Before" column for the runbook table.

3. **Run --commit** (THIS is the destructive operation; Claude does not run this):
   ```bash
   cd vigil-core
   echo "" >> ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
   echo "--- COMMIT INVOCATION ---" >> ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
   railway run npx tsx scripts/cleanup-test-users.ts --commit 2>&1 \
     | tee -a ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
   echo "--- COMMIT EXIT CODE: $? ---" \
     >> ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
   cd -
   ```
   Verify: `MODE: COMMIT — TRANSACTION COMMITTED (rows deleted)` banner present and `COMMIT EXIT CODE: 0`.

4. **Capture AFTER counts** via psql (also for the runbook):
   ```bash
   railway connect postgres
   ```
   At the psql prompt: `SELECT id, email FROM users WHERE id IN (3, 44);` MUST return 0 rows. Then run the UNION ALL block again — every count column MUST be 0. Save the output for the runbook "After" column.

5. **Smoke-pass as seed user** (D-03 SC#4) against `https://api.vigilhub.io`:
   - Login as `jamesonmorrill1@gmail.com` → 200 with valid JWT
   - `GET /v1/auth/me` → 200, email field matches
   - Read thoughts (`GET /v1/thoughts?limit=5`) → existing thoughts intact
   - Generate brief OR open PWA dashboard — no errors

Do NOT proceed to Task 3 until --commit returned 0 AND verification SELECTs all returned 0 rows for ids 3+44 AND seed-user smoke-pass is green.
  </action>
  <verify>
    <automated>grep -F "COMMIT INVOCATION" .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</automated>
    <automated>grep -F "MODE: COMMIT — TRANSACTION COMMITTED" .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</automated>
    <automated>grep -F "COMMIT EXIT CODE: 0" .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt` contains `--- COMMIT INVOCATION ---`
    - `.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt` contains `MODE: COMMIT — TRANSACTION COMMITTED`
    - `.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt` contains `COMMIT EXIT CODE: 0`
    - User pastes BEFORE COUNT(*) UNION ALL output (13 rows + users count = 14 lines)
    - User pastes AFTER COUNT(*) UNION ALL output, all counts = 0
    - User confirms (in resume signal) seed-user login + thought-read smoke-pass succeeded
    - User confirms `SELECT id, email FROM users WHERE id IN (3, 44)` post-commit returns 0 rows
  </acceptance_criteria>
  <resume-signal>
    Type "committed: SC1=ok, SC2=ok, SC4=ok" with BEFORE + AFTER UNION ALL output pasted, OR describe failure (which step failed, what error surfaced) — failure path triggers Rollback Notes in Task 3.
  </resume-signal>
  <done>
    --commit executed by the user against Railway prod. 118-RUN-LOG.txt now contains both DRY-RUN and COMMIT sections with COMMIT EXIT CODE: 0. Phase success criterion #1 (zero rows for ids 3+44 in users) and #2 (zero rows in all 13 child tables) are evidenced by the user's pasted UNION ALL output. Smoke-pass green confirms SC#4. Ready for Task 3 to author the runbook.
  </done>
</task>
<task type="auto" tdd="false">
  <name>Task 3: Write 118-RUNBOOK.md audit trail</name>
  <files>.planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</files>
  <read_first>
    - .planning/phases/118-production-test-user-cleanup/118-CONTEXT.md (D-04 specifies the artifact format — must include invocation commands, before/after row counts, smoke-pass checklist, rollback notes, observations)
    - .planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt (the captured stdout — runbook references this as evidence)
  </read_first>
  <action>
Create `.planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md` with the following exact section structure (copy verbatim, fill in real values from Task 1 dry-run + Task 2 commit + Task 2 verification SELECTs):

```markdown
# Phase 118 Runbook — Production Test-User Cleanup

**Operator:** {whoami}@{hostname}
**Date:** {ISO 8601 UTC date}
**Railway project:** {railway status output}
**Targets:** id=3 (`upper@case.com`), id=44 (`test+phase104@local.test`)
**Script:** `vigil-core/scripts/cleanup-test-users.ts`
**Evidence:** `118-RUN-LOG.txt` (verbatim stdout)

## Invocation Commands

### Dry-run (no prod mutation)
\`\`\`bash
cd vigil-core
railway run npx tsx scripts/cleanup-test-users.ts --dry-run 2>&1 \
  | tee -a ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
\`\`\`

### Commit (live delete)
\`\`\`bash
cd vigil-core
railway run npx tsx scripts/cleanup-test-users.ts --commit 2>&1 \
  | tee -a ../.planning/phases/118-production-test-user-cleanup/118-RUN-LOG.txt
\`\`\`

## Before/After Row Counts

Before counts captured via `railway connect postgres` UNION ALL SELECT (pre-commit, post-dry-run).
After counts captured via the same query post-commit.

| Table                    | Before | After | Notes                                  |
|--------------------------|-------:|------:|----------------------------------------|
| thought_links            | {N}    | 0     | cascade from thoughts; explicit per D-05 |
| brief_pdfs               | {N}    | 0     | cascade from briefs; explicit per D-05   |
| briefs                   | {N}    | 0     |                                        |
| thoughts                 | {N}    | 0     |                                        |
| projects                 | {N}    | 0     |                                        |
| api_keys                 | {N}    | 0     |                                        |
| chat_sessions            | {N}    | 0     |                                        |
| work_order_statuses      | {N}    | 0     | composite PK (userId, caseNumber)       |
| work_orders              | {N}    | 0     |                                        |
| oauth_tokens             | {N}    | 0     |                                        |
| app_settings             | {N}    | 0     | composite PK (userId, key)              |
| ai_cache                 | {N}    | 0     |                                        |
| password_reset_tokens    | {N}    | 0     | FK CASCADE; explicit per D-05           |
| users                    | 2      | 0     | parent — deleted last                   |
| **TOTAL**                | **{N}**| **0** |                                        |

`SELECT id, email FROM users WHERE id IN (3, 44)` post-commit: **0 rows** ✅

## Smoke-Pass Checklist (Seed User)

Performed as `jamesonmorrill1@gmail.com` against `https://api.vigilhub.io` post-commit:

- [ ] `POST /v1/auth/login` returns 200 with valid JWT
- [ ] `GET /v1/auth/me` returns 200 with `email = "jamesonmorrill1@gmail.com"`
- [ ] `GET /v1/thoughts?limit=5` returns existing thoughts (count > 0 — seed user's thoughts intact)
- [ ] `POST /v1/briefs/generate` (or PWA dashboard equivalent) succeeds
- [ ] No errors in `railway logs` during smoke window

Result: **PASS** / **FAIL** {with details if FAIL}

## Rollback Notes

This operation has **NO automated rollback**. Rejected per CONTEXT.md "Snapshot-then-delete" entry — rollback evidence is overkill for two known test rows; reproducibility is via the source-controlled script.

If a rollback were ever required (extreme case — e.g., catastrophic id-drift bug discovered post-commit despite D-03):
1. Restore from Railway Postgres point-in-time backup (Railway dashboard → Postgres service → Backups)
2. Choose a snapshot timestamped immediately before the COMMIT EXIT CODE: 0 line in `118-RUN-LOG.txt`
3. Replay any post-commit changes by hand (the seed user might have created thoughts/briefs in the smoke window)

## Observations

{Free-form notes — anything unexpected during dry-run, anything observed during smoke window, follow-ups to file as todos.}

## Cross-References

- Requirement: REQUIREMENTS.md OPS-01
- Roadmap: ROADMAP.md "Phase 118: Production test-user cleanup"
- Decisions: 118-CONTEXT.md D-01 through D-05
- Script: vigil-core/scripts/cleanup-test-users.ts
- Stdout evidence: 118-RUN-LOG.txt
```

Fill in every `{placeholder}` with the actual value from Task 1's dry-run output and Task 2's verification SELECTs. The `Before` counts come from the dry-run row counts (script logged what WOULD be deleted) cross-checked against the pre-commit psql UNION ALL output. The `After` counts come from the post-commit psql UNION ALL output (must all be 0).
  </action>
  <verify>
    <automated>test -f .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>grep -F "## Before/After Row Counts" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>grep -F "## Smoke-Pass Checklist" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>grep -F "## Rollback Notes" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>grep -F "## Invocation Commands" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>grep -F "## Observations" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>grep -F "118-RUN-LOG.txt" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>grep -E "thought_links.*\|.*0" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>grep -E "users.*\|.*2.*\|.*0" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>! grep -F "{N}" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
    <automated>! grep -F "{placeholder}" .planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/118-production-test-user-cleanup/118-RUNBOOK.md` exists
    - File contains heading `## Invocation Commands`
    - File contains heading `## Before/After Row Counts`
    - File contains heading `## Smoke-Pass Checklist (Seed User)` (or `## Smoke-Pass Checklist`)
    - File contains heading `## Rollback Notes`
    - File contains heading `## Observations`
    - File references `118-RUN-LOG.txt` as evidence link
    - File's row-count table contains 14 data rows (one per table) plus a TOTAL row
    - Every `After` column value is `0`
    - `users` row shows `Before = 2`, `After = 0`
    - No `{N}` or `{placeholder}` text remains (all values filled in)
    - File references the exact target ids (3, 44) and emails (`upper@case.com`, `test+phase104@local.test`)
    - Smoke-pass checklist has explicit Pass/Fail outcome recorded
  </acceptance_criteria>
  <done>
    Runbook is the human audit trail for OPS-01. All sections populated with real values from the run. Cross-references back to CONTEXT decisions, script, and run log are present. No template placeholders remain. Phase 118 success criteria 1, 2, 3, and 4 all evidenced.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local terminal → Railway prod | `railway run` injects DATABASE_URL into a single subprocess invocation; outside that subprocess no prod credential is on disk |
| Claude → human | --commit is the single step Claude does NOT execute; T-118-02-04 is mitigated structurally by Task 2 being a `checkpoint:human-action` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-118-02-01 | Tampering | Wrong Railway project / wrong environment | mitigate | Task 1 step 1 runs `railway whoami` + `railway status` as a sanity check before invocation; output is appended to 118-RUN-LOG.txt as audit trail. |
| T-118-02-02 | Tampering | id drift between dry-run and commit (race window) | mitigate | The script's pre-flight email assertion (D-03, mitigated in Plan 01 T-118-01-02) re-runs inside the --commit invocation — it's not a one-time gate. The dry-run is read-only; the email assertion runs again at --commit. |
| T-118-02-03 | Information Disclosure | DATABASE_URL leaked into 118-RUN-LOG.txt | mitigate | Script never logs DATABASE_URL; `railway run` logs to stderr only on failure paths and even then masks credentials. Operator instructed in Task 1 to verify no `postgresql://` strings appear in the log file before commit. |
| T-118-02-04 | Elevation of Privilege | Accidental --commit firing while user thought it was --dry-run | mitigate | Task 2 is `checkpoint:human-action` — Claude literally cannot execute --commit. Combined with D-02 default-dry-run + D-03 email assertion + the resume-signal requiring SC1/SC2/SC4 explicit confirmation. |
| T-118-02-05 | Denial of Service | Smoke-pass collateral damage — seed user broken post-cleanup | mitigate | Pre-condition check: targets are scoped to id IN (3, 44); seed user is `jamesonmorrill1@gmail.com` which the user knows by id (NOT 3 or 44). Detection: Task 2 step 5 explicit smoke-pass MUST pass before runbook completes. If smoke fails, runbook records failure + escalates to point-in-time-restore (Rollback Notes section). |
| T-118-02-06 | Repudiation | No evidence of who ran --commit and when | mitigate | 118-RUN-LOG.txt header includes `whoami`, `hostname`, ISO 8601 UTC timestamp, and Railway project context. File is git-committed as part of phase closeout, providing tamper-evident audit trail via git history. |

**HIGH severity items:** T-118-02-04 (accidental --commit) and T-118-02-05 (collateral damage to seed user). T-118-02-04 is mitigated by `autonomous: false` + `checkpoint:human-action`. T-118-02-05 is mitigated by mandatory smoke-pass with explicit Pass/Fail outcome before phase completion.
</threat_model>

<verification>
- 118-RUN-LOG.txt exists with both DRY-RUN INVOCATION and COMMIT INVOCATION sections
- 118-RUN-LOG.txt shows COMMIT EXIT CODE: 0 and the COMMIT mode banner
- 118-RUNBOOK.md exists with all required sections (Invocation Commands, Before/After Row Counts, Smoke-Pass Checklist, Rollback Notes, Observations)
- Runbook's After column is all 0; users row shows Before=2/After=0
- No template placeholders (`{N}`, `{placeholder}`) remain in runbook
- Smoke-pass outcome explicitly recorded as PASS (or FAIL with rollback notes if FAIL)
</verification>

<success_criteria>
Maps directly to phase success criteria 1-4:

1. **SC#1 (`SELECT * FROM users WHERE id IN (3, 44)` returns zero rows):** Evidenced by Task 2 verification SELECT pasted into runbook's Before/After table and by COMMIT EXIT CODE: 0 in 118-RUN-LOG.txt.

2. **SC#2 (No orphaned child rows in any user-scoped table):** Evidenced by 13 per-table COUNT(*) entries in runbook's After column, all 0.

3. **SC#3 (Runbook committed under `.planning/phases/118-*/`):** 118-RUNBOOK.md and 118-RUN-LOG.txt both committed under this path.

4. **SC#4 (No collateral damage — seed user still works):** Evidenced by Smoke-Pass Checklist explicitly marked PASS in runbook.
</success_criteria>

<output>
After completion, create `.planning/phases/118-production-test-user-cleanup/118-02-prod-execution-runbook-SUMMARY.md` capturing:
- Final commit timestamp + Railway project context
- Total rows deleted across all 14 tables
- Smoke-pass outcome (PASS / FAIL + details)
- Any observations the runbook captured (e.g., dry-run row counts surprised you, schema drift discovered, anything anomalous)
- Confirmation that all 4 phase success criteria are evidenced
- Pointers to the two committed artifacts (118-RUNBOOK.md + 118-RUN-LOG.txt)
</output>
