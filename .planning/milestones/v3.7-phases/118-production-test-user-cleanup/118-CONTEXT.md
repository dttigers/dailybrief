# Phase 118: Production test-user cleanup - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

One-shot deletion of two known test users from Railway prod (id=3 `upper@case.com`, id=44 `test+phase104@local.test`) plus all their child rows across the 12 user-scoped tables, with a committed runbook capturing exact commands run, before/after row counts, smoke results, and rollback notes.

**Out of scope:**
- Generalized "delete any user" tooling — this is one-shot, hardcoded to ids 3 + 44 with email-match assertions
- Soft-delete column or grace-period workflows — hard delete only
- DMARC ramp (Phase 119)

</domain>

<decisions>
## Implementation Decisions

### Execution Surface

- **D-01:** Idempotent Node script `vigil-core/scripts/cleanup-test-users.ts` invoked via `railway run npx tsx scripts/cleanup-test-users.ts [--dry-run|--commit]`. Reuses the existing Drizzle client and schema relationships. **No DATABASE_URL on local disk** — Railway CLI injects it at invocation time. Source-controlled, idempotent (safe to re-run; second run logs 0-row deletes).

### Transaction Boundary

- **D-02:** Single transaction wraps all DELETEs.
  - `--dry-run` (default): executes everything inside the tx, logs row counts, then `ROLLBACK` (no prod mutation)
  - `--commit`: same execution path, swaps in `COMMIT`
  - Two-step gate by design: human inspects dry-run output, then explicitly invokes `--commit`. Either fully completes or leaves prod untouched.

### Pre-flight Verification

- **D-03:** Before any DELETE statement, the script asserts:
  1. `SELECT id, email FROM users WHERE id IN (3, 44)` returns exactly 2 rows
  2. id=3 row's email = `upper@case.com` verbatim
  3. id=44 row's email = `test+phase104@local.test` verbatim
  - On mismatch (count != 2 OR email mismatch on either id) → abort with non-zero exit, no DELETE issued
  - This is defense-in-depth against id drift (e.g., if the test users were ever re-seeded with new ids)
  - **Post-delete smoke pass (SC#4):** runbook documents manual smoke as seed user `jamesonmorrill1@gmail.com` — login → fetch `/v1/auth/me` → generate brief → read thoughts. NOT automated in the script (would require a long-lived JWT in CI, out of scope).

### Delete Order & Cascade Semantics

- **D-05:** Explicit `DELETE FROM {table} WHERE user_id IN (3, 44)` for **every** user-scoped table, even where `onDelete: cascade` is defined in `schema.ts`. Two benefits:
  1. Row count logging is uniform and accurate per table (cascade-deleted rows would otherwise be invisible)
  2. Script remains correct under future schema changes that flip a cascade to restrict

  **Inventory of 12 user-scoped tables (from `vigil-core/src/db/schema.ts`):**

  | Table | onDelete (user_id FK) | Inherent cascades |
  |-------|----------------------|-------------------|
  | `projects` | restrict | — |
  | `thoughts` | restrict | `thought_links.thoughtId` cascades from thoughts |
  | `api_keys` | restrict | — |
  | `briefs` | restrict | `brief_pdfs.briefId` cascades from briefs |
  | `brief_pdfs` | restrict (also briefs FK cascades) | — |
  | `thought_links` | restrict | also cascades when parent thought deleted |
  | `chat_sessions` | restrict | — |
  | `work_order_statuses` | restrict | — |
  | `work_orders` | restrict | — |
  | `oauth_tokens` | restrict | — |
  | `app_settings` | restrict | — |
  | `ai_cache` | restrict | — |
  | `password_reset_tokens` | **cascade** | — |
  | `users` | (parent) | — |

  **Delete order (children first to satisfy `restrict` FKs):**
  1. `thought_links` (depends on thoughts + users)
  2. `brief_pdfs` (depends on briefs + users)
  3. `briefs` (depends on users)
  4. `thoughts` (depends on projects + users)
  5. `projects` (depends on users)
  6. `api_keys`
  7. `chat_sessions`
  8. `work_order_statuses`
  9. `work_orders`
  10. `oauth_tokens`
  11. `app_settings`
  12. `ai_cache`
  13. `password_reset_tokens` (cascade, but explicit per D-05)
  14. `users` (last)

### Runbook Artifact Format

- **D-04:** Two artifacts committed under `.planning/phases/118-production-test-user-cleanup/`:
  1. **`118-RUNBOOK.md`** — markdown checklist with: invocation commands (dry-run + commit), expected output summary, before/after row counts table, manual smoke-pass results checklist, rollback notes, observations
  2. **`118-RUN-LOG.txt`** — verbatim stdout capture of both `--dry-run` and `--commit` script invocations (script tees its log; user pastes into the file or pipes via `tee 118-RUN-LOG.txt`)

  The markdown is the human audit trail; the .txt is the machine-readable proof of what actually happened.

### Claude's Discretion

- Exact log format the script produces (table-formatted, JSON lines, or plain) — Claude picks based on what's readable in `118-RUN-LOG.txt`
- Whether the script is one big function or split per-table — implementation detail
- Exit codes and error message wording

### Folded Todos

None — no pending todos matched Phase 118 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & data model
- `vigil-core/src/db/schema.ts` — full table inventory, FK directions, `onDelete` semantics. Source of truth for delete-order correctness.
- `vigil-core/drizzle/` — migration history. Phase 118's runbook does NOT add a migration (D-01 is a one-shot script, not schema change).

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 118: Production test-user cleanup" — 4 success criteria
- `.planning/REQUIREMENTS.md` §"OPS-01" — full requirement language
- `.planning/PROJECT.md` §"Validated" — context that AUTH-09/10/11 (v3.6) created the seed user, change-password, forgot-password, and verify-email flows that produced the test rows being cleaned up

### Prior pattern references
- v3.6 milestone runbook patterns — runbooks committed under `.planning/phases/{X}-*/` is the established pattern (e.g., `.planning/v3.6-OPEN-UAT-RUNBOOK.md` uses similar structure, scoped to UAT not data ops)
- Phase 102 lesson (Anthropic key sprawl) → drove D-01 choice: Railway CLI injection over local DATABASE_URL on disk

### External tooling
- Railway CLI — `railway run` provides DATABASE_URL injection. Verify availability with `railway --version` before invocation.
- `npx tsx` — already in vigil-core devDependencies (used elsewhere in scripts/)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Drizzle client** at `vigil-core/src/db/client.ts` — already wired for schema.ts; script imports `db` and `schema.users`/`schema.thoughts`/etc. No new connection plumbing needed.
- **Existing scripts pattern**: `vigil-core/scripts/seed-local.ts` and `vigil-core/scripts/set-password.ts` show the established invocation shape (`tsx`, env-loaded DB client, structured logging).
- **Schema relationship inventory** — schema.ts already documents every FK + onDelete; the script can derive the table list from imports rather than hard-coding (or hard-code it to keep the runbook explicit — Claude's discretion per D-05 inventory).

### Established Patterns
- **Script naming:** `vigil-core/scripts/{verb}-{noun}.ts` (camel/kebab consistent with existing files)
- **Argv parsing:** Existing scripts use `process.argv` directly — no commander/yargs dependency. `--dry-run` (default) vs `--commit` flag check should match this pattern.
- **Database connection:** scripts import `{ db }` from `../src/db/client.js` and exit cleanly on completion.

### Integration Points
- `package.json` script entry — optional addition of `"cleanup:test-users:dry-run"` and `"cleanup:test-users:commit"` npm scripts for ergonomic invocation. Claude's discretion.
- No PWA / monitor / G2-plugin touch — phase is vigil-core only.
- No deploy trigger — script runs against existing prod, doesn't push to Railway. (Confirms `phase complete` push-on-deploy-targets won't fire spuriously since no source code touches the deploy bundle.)

</code_context>

<specifics>
## Specific Ideas

- The user has a strong drift-prevention instinct (Phase 102 Anthropic key sprawl memory). D-01 is shaped by this — the Railway CLI injects DATABASE_URL at invocation, so no `.env` mutation, no `DATABASE_URL` on disk, no risk of Railway/local drift.
- The `--dry-run`/`--commit` two-step gate (D-02) is intentionally human-in-the-loop. The user inspects the dry-run output before pulling the trigger; this is the structural mechanism preventing "wrong env" footguns.
- D-03's email-match assertion is the second structural mechanism — even if `--commit` fires accidentally, the script aborts unless ids 3+44 still map to the exact known test emails.

</specifics>

<deferred>
## Deferred Ideas

- **Generalized user-deletion tooling** — A reusable `delete-user.ts` script accepting any user_id with the same dry-run safety. Would belong in a future ops-tooling phase, not v3.7.
- **Automated post-delete smoke as seed user** — Requires a long-lived JWT in CI/local config. Out of scope; SC#4 met manually.
- **Soft-delete column** (`users.deleted_at`) — Not requested by any current requirement. Would be its own design phase.
- **Snapshot-then-delete** (D-02 alternative) — Considered and rejected: rollback evidence is overkill for two known test rows, and the source-controlled script + dry-run output already provides reproducibility.

### Reviewed Todos (not folded)

No todos surfaced — `todo match-phase 118` returned 0 matches.

</deferred>

---

*Phase: 118-production-test-user-cleanup*
*Context gathered: 2026-04-30*
