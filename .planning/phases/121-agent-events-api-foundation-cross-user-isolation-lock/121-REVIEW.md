---
phase: 121-agent-events-api-foundation-cross-user-isolation-lock
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - vigil-core/drizzle/0018_add_agent_events.sql
  - vigil-core/src/db/schema.ts
  - vigil-core/src/db/types.ts
  - vigil-core/src/index.ts
  - vigil-core/src/integration/cross-user-isolation.test.ts
  - vigil-core/src/routes/agent-events.test.ts
  - vigil-core/src/routes/agent-events.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 121: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 121 adds a Postgres-backed `agent_events` API to vigil-core: Drizzle table, hand-edited migration with a CHECK constraint and partial unique index, a Hono sub-app exposing `POST /v1/agent-events` (idempotent insert) and `GET /v1/agent-sessions` (sliding-window list), pure-unit route tests with two drift detectors, and three new D-D2 cross-user isolation lock blocks.

The four highest-leverage invariants — userId from bearer (mass-assignment defense), composite (user_id, client_event_id) dedupe scope, KNOWN_FIELDS strict allowlist, and partial-index ON CONFLICT predicate — are each correctly implemented and pinned by at least one assertion. SQL injection risk on the raw `db.execute(sql\`...\`)` GET path is neutralized by Drizzle's tagged-parameter binding (userId is a typed number, sinceIso is converted via `.toISOString()`).

**No blockers found.** The four warnings below are mostly drift / contract gaps that will degrade ergonomics or land hidden regressions on the next `drizzle-kit generate` run, plus two bounded-input gaps (no length cap on text fields, no upper bound on `since`). Info items are minor cleanups.

## Warnings

### WR-01: Drizzle snapshot drifts from migration on `idx_agent_events_user_session_ts` ordering — next `drizzle-kit generate` will spuriously reorder the index

**File:** `vigil-core/src/db/schema.ts:411-415` (vs. `vigil-core/drizzle/0018_add_agent_events.sql:41-42` and `vigil-core/drizzle/meta/0018_snapshot.json:96-100`)

**Issue:** The migration creates `idx_agent_events_user_session_ts` with `event_timestamp DESC`:
```sql
CREATE INDEX IF NOT EXISTS "idx_agent_events_user_session_ts"
  ON "agent_events" ("user_id", "session_id", "event_timestamp" DESC);
```
The Drizzle schema declares the same index without DESC:
```ts
index("idx_agent_events_user_session_ts").on(
  table.userId,
  table.sessionId,
  table.eventTimestamp,
),
```
The snapshot at `0018_snapshot.json:96-100` reflects the schema (`"asc": true, "nulls": "last"`), not the migration. This means the next time someone runs `drizzle-kit generate` against this schema, Drizzle will detect drift between the snapshot ASC and the *intended* DESC and emit a `DROP INDEX … / CREATE INDEX … ASC` migration that destroys the DESC ordering. The migration header comment explicitly cites DESC as a perf invariant ("DESC on event_timestamp lets PG do an index-only scan for DISTINCT ON / window queries"), and the production GET path's `ORDER BY session_id, event_timestamp DESC` is intended to compose with that ordering. After the spurious regen, that path silently regresses to a sort step.

**Fix:** Use Drizzle's `.desc()` helper on the index column so the schema, snapshot, and migration agree:
```ts
import { desc } from "drizzle-orm";
// ...
index("idx_agent_events_user_session_ts").on(
  table.userId,
  table.sessionId,
  desc(table.eventTimestamp), // was: table.eventTimestamp
),
```
Then re-snapshot (`drizzle-kit generate` should be a no-op once schema matches the SQL). Alternatively, document this as an intentional drift in the migration header and add a `0018_snapshot.json` post-edit step.

---

### WR-02: No length caps on user-controlled text fields — unbounded payload reaches DB

**File:** `vigil-core/src/routes/agent-events.ts:126-203`

**Issue:** `session_id`, `label`, `host`, `client_event_id`, and `message` are validated as non-empty strings but have no maximum-length enforcement. The DB columns are `text` (unbounded). A daemon misconfiguration or a hostile authenticated client could push 10MB strings, balloon the row footprint, and slow down GET via DISTINCT ON. The 30-second request timeout (`index.ts:106`) blunts the worst case but lets a single 25MB POST through, and `message` is the most exposed field (it's narrative). `client_event_id` should also be bounded — UUIDs are 36 chars; nothing the spec calls for is longer.

This is not a security incident on its own (the bearer is authenticated and per-user-scoped), but it is a robustness gap and a denial-of-disk vector if the daemon is buggy.

**Fix:** Add explicit length caps in the validation block. Suggested limits — UUID-like fields tight, narrative loose:
```ts
const MAX_ID_LEN = 256;        // session_id, label, host, client_event_id
const MAX_MESSAGE_LEN = 4096;  // freeform narrative

if (sessionId.length > MAX_ID_LEN) { /* 400 invalid_payload */ }
if (label.length > MAX_ID_LEN) { /* 400 */ }
if (host.length > MAX_ID_LEN) { /* 400 */ }
if (clientEventId.length > MAX_ID_LEN) { /* 400 */ }
if (typeof message === "string" && message.length > MAX_MESSAGE_LEN) { /* 400 */ }
```
Add unit tests asserting 400 on over-length input for each field.

---

### WR-03: GET `?since` accepts arbitrary past/future dates with no sanity bounds — large window risks unbounded scan

**File:** `vigil-core/src/routes/agent-events.ts:254-270`

**Issue:** The handler parses `?since=<ISO>` and only rejects unparseable strings. A caller can pass `?since=1970-01-01T00:00:00Z` and force a full table scan over their own data; or pass `?since=2099-01-01T00:00:00Z` (future) and silently get an empty list. Neither is a security issue (data is user-scoped), but the `LIMIT 100` is applied AFTER the DISTINCT ON — the inner CTE still scans every row in the window. With the partial index, this is bounded by the user's row count, but a user with 1M events would still pay a multi-second scan per GET.

D-B1 in the plan is "default 24h sliding window," but no upper bound on caller override is documented or enforced.

**Fix:** Either reject `since` more than N days in the past (e.g., 30 days) with `400 invalid_query`, OR push the LIMIT into the inner CTE so the scan terminates after the cap is filled:
```ts
// Option A: reject far-past since
const MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
if (Date.now() - parsed.getTime() > MAX_LOOKBACK_MS) {
  return c.json({ error: "invalid_query", message: "since cannot be more than 30 days in the past" }, 400);
}
```
Reject future `since` similarly (`parsed.getTime() > Date.now()`). At minimum, document the v1 caller contract in the route comment.

---

### WR-04: Drift detector T1's per-value regex is loose — passes even if VALID_EVENTS const is renamed/dropped

**File:** `vigil-core/src/routes/agent-events.test.ts:416-428`

**Issue:** The first half of the DRIFT/T1 test greps the entire source file for each value:
```ts
for (const v of [...]) {
  assert.match(src, new RegExp(`"${v}"`), `... must declare "${v}" in VALID_EVENTS verbatim`);
}
```
This regex matches `"needs_input"` ANYWHERE in the file — including comments (line 28 mentions all five values in a comment), test fixtures, or unrelated string literals. If a future edit silently renamed `VALID_EVENTS` to something else but left a comment listing the values, this loop would still pass. The follow-up check at lines 430-446 narrows to the `VALID_EVENTS = […]` block and is sound — but the per-value loop's failure messages claim a stronger guarantee than they verify.

**Fix:** Either drop the loose loop (the narrow block check at lines 430-446 is sufficient), or scope the per-value match to the captured block:
```ts
const block = validEventsBlock![1]!;
for (const v of [...]) {
  assert.match(block, new RegExp(`"${v}"`), `... must declare "${v}" inside VALID_EVENTS block`);
}
```

## Info

### IN-01: Redundant `Number.isFinite` check in exit_code validation

**File:** `vigil-core/src/routes/agent-events.ts:209-212`

**Issue:** `Number.isInteger(x)` already implies `Number.isFinite(x)` — `NaN`, `Infinity`, and `-Infinity` all return false from `isInteger`. The triple guard is harmless but redundant.

**Fix:**
```ts
if (typeof exitCodeRaw !== "number" || !Number.isInteger(exitCodeRaw)) {
  // 400 invalid_payload
}
```

---

### IN-02: `agentEvents` identifier collides between Drizzle table and Hono router

**File:** `vigil-core/src/routes/agent-events.ts:4` and `:404`

**Issue:** The file imports `agentEvents` (Drizzle table) at the top and re-exports the Hono router as `agentEvents` at the bottom via `export { agentEvents$Route as agentEvents }`. The two live in different scopes (top-of-file imports point to the table for in-file use; the re-export creates a separate named export for `index.ts`), but the name collision makes future edits brittle — a maintainer who adds a new function inside the file and refers to `agentEvents` will get the Drizzle table, not the router, despite the file's "public" identity being the router.

**Fix:** Rename the public router export to something less ambiguous, e.g., `agentEventsRoute`, and update `index.ts:43, 210` to match. Mirrors the `chatSessionsRouter` / `workOrdersRouter` naming already in use.

---

### IN-03: `event` column lacks `$type<AgentEventType>()` annotation — `DrizzleAgentEvent["event"]` is `string`

**File:** `vigil-core/src/db/schema.ts:400`

**Issue:** The column is `text("event").notNull()`. Drizzle's inferred select type for this is `string`, not `AgentEventType`. Consumers like `agent-events.test.ts:44` (`event: row.event as DrizzleAgentEvent["event"]`) and the production handler's mapper (`event: r.event as AgentEventType`, `agent-events.ts:390`) cast through `string` — the type system never validates that values from the DB match the union. The CHECK constraint enforces this at SQL level, but a regressed CHECK would silently let arbitrary strings flow through TS.

**Fix:** Annotate the column type so `$inferSelect` returns the union:
```ts
event: text("event").$type<AgentEventType>().notNull(),
```
This requires importing `AgentEventType` from `routes/agent-events.ts` (or moving the union to `db/types.ts` and re-exporting). The cast at `agent-events.ts:390` becomes unnecessary.

---

### IN-04: `CREATE TABLE IF NOT EXISTS` will not retro-add the CHECK constraint on a partially-applied DB

**File:** `vigil-core/drizzle/0018_add_agent_events.sql:24-36`

**Issue:** The migration is described as "Re-run safe: every statement uses IF NOT EXISTS." That's true for re-running a fully-applied migration, but the CHECK constraint is part of the `CREATE TABLE` statement. If a prior aborted run already created the table (without the CHECK, somehow — e.g., a hand-edit during dev), re-running this migration would skip the table creation entirely (`IF NOT EXISTS`) and never add the CHECK. The CHECK would silently be missing in production. Same risk applies to a future tightening of VALID_EVENTS — `CREATE TABLE IF NOT EXISTS` cannot mutate existing constraints.

This is theoretical for the deploy itself (Phase 121 is a fresh table) but matters for ops runbooks and any future migration that revises the enum.

**Fix:** Either separate the CHECK into a standalone `ALTER TABLE … ADD CONSTRAINT IF NOT EXISTS` (PG 9.6+) statement, or document in the migration header that future enum changes require a new migration that drops + re-adds the CHECK rather than editing 0018.

---

### IN-05: `db.execute(sql\`…\`)` return-type cast through `unknown` defeats type checking

**File:** `vigil-core/src/routes/agent-events.ts:375-385`

**Issue:** The mapper casts `rows as unknown as Array<{...}>` to bypass TS. This is correct for `db.execute` (its return type is `unknown` shape), but writing `as unknown as Array<{...}>` masks any future schema rename. If the SELECT list adds/removes a column, the runtime mapper would silently produce `undefined` in fields the consumer expects.

**Fix:** Tighten by introducing a row interface near the SQL string and asserting at the boundary, or use Drizzle's typed query builder once it gets a `distinctOn` helper. Acceptable as-is for v1 — flag for cleanup when moving to typed DISTINCT ON.

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
