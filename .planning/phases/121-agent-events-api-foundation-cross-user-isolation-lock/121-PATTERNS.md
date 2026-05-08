# Phase 121: Agent-events API foundation + cross-user isolation lock — Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 6 (3 create, 3 modify)
**Analogs found:** 6 / 6 (every file has a strong existing analog in vigil-core)

---

## CONTEXT.md Discrepancies (read this FIRST before planning)

Three load-bearing inaccuracies in `121-CONTEXT.md` that the planner must override. All verified against the live tree as of 2026-05-08.

| # | CONTEXT.md says | Reality | Implication |
|---|-----------------|---------|-------------|
| **1** | `vigil-core/src/db/migrations/` is the migration directory; "Migration filename: Drizzle convention `nnnn_add_agent_events.sql` per existing migration sequence in `src/db/migrations/`" (lines 89, 118, 141, 146) | The directory is `vigil-core/drizzle/`. `drizzle.config.ts:5` says `out: "./drizzle"`; `src/db/migrate.ts:15` says `migrationsFolder: "./drizzle"`. The dir `src/db/migrations/` does **not exist**. | Migration file goes at `vigil-core/drizzle/0018_add_agent_events.sql`. Latest existing is `0017_users_email_verified_at.sql` (verified `ls vigil-core/drizzle/`). |
| **2** | "zod schema in the route, strict mode (`.strict()`) — reject unknown fields with 400" (D-Discretion line 87); "Validation via zod in-route, not middleware: Existing routes (e.g., `forgot-password.ts`, `change-password.ts`) declare zod schemas inline" (line 139) | **zod is NOT a dependency** in `vigil-core/package.json`. Searched all of `vigil-core/src/routes/` — zero `from "zod"` imports. The cited analogs (`forgot-password.ts`, `change-password.ts`) use **manual `typeof` checks**, not zod. See `change-password.ts:52-57` and `forgot-password.ts:130-131`. | **Two paths**: (a) `npm install zod` and write the route with zod (adds a new prod dep — ~50KB), or (b) follow the established codebase convention of inline manual validation (see Pattern Block 4 below). The strict-validation intent of D-Discretion can be honored either way; the planner must surface this as an explicit Plan-01 sub-decision. Recommend (b) for codebase consistency. |
| **3** | "`change-password.ts`" is listed alongside `forgot-password.ts` as a route-test analog (CONTEXT bullets it under "code patterns") | `change-password.ts` exists; **`change-password.test.ts` does not exist** (verified `ls vigil-core/src/routes/change-password.test.ts` → no such file). | Route-test analog for `agent-events.test.ts` is `forgot-password.test.ts` (503 lines, full coverage) **or** `work-order-status.test.ts` (166 lines, factory + DI pattern). Both are documented below; recommend `work-order-status.test.ts` as the primary analog because it tests an upsert/idempotent route shape closer to POST `/v1/agent-events`. |

Other minor notes:
- CONTEXT line 145 says "registered in `src/index.ts` via `app.route("/v1", agentEvents)` AFTER `bearerAuth` is mounted (line 135 area)". Confirmed: `index.ts:135` is the bearerAuth dispatcher, `index.ts:157` is `metricsMiddleware`, and authenticated routes start at `index.ts:163` — agent-events should be appended near `index.ts:200` (after `resendVerification`).
- CONTEXT line 117 is correct: `workOrderStatuses` IS the closest structural analog for the composite-PK + `idx_<table>_user_id` pattern. Verified in `schema.ts:240-254`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `vigil-core/src/db/schema.ts` (modify — add `agentEvents`) | model / schema | DDL | `workOrderStatuses` block at `schema.ts:236-254`; `passwordResetTokens` at `schema.ts:339-372` | exact (workOrderStatuses for composite-uniqueness shape; passwordResetTokens for the CHECK-on-text pattern) |
| `vigil-core/drizzle/0018_add_agent_events.sql` (create) | migration | DDL | `0016_password_reset_tokens.sql` (CREATE TABLE + CHECK + multi-index) | exact |
| `vigil-core/src/routes/agent-events.ts` (create — POST + GET sub-app) | controller (Hono router) | request-response (POST = idempotent upsert; GET = scoped list with sliding window) | `work-order-status.ts` (DI factory + composite-PK upsert + scoped GET) for shape; `forgot-password.ts` for body-parse + structured error pattern | exact (work-order-status) + role-match (forgot-password) |
| `vigil-core/src/index.ts` (modify — register route) | config / wiring | n/a | `index.ts:180` `app.route("/v1", changePassword)` — same "register-after-bearerAuth-and-metricsMiddleware" pattern | exact |
| `vigil-core/src/integration/cross-user-isolation.test.ts` (modify — add 3 `it()` blocks per D-D2) | test | test | Existing `it()` blocks in same file — `cross-user-isolation.test.ts:421-455` (work-orders isolation) is the closest structural analog (insert two rows for two users, GET as userA, assert no userB rows) | exact |
| `vigil-core/src/routes/agent-events.test.ts` (create — full route coverage) | test | test | `work-order-status.test.ts` (factory + DI + `c.set("userId", N)` middleware stub) — recommended; `forgot-password.test.ts` (live-DB seed + lazy import + JWT_SECRET env block) — secondary | exact (work-order-status) |

---

## Pattern Assignments

### File 1 — `vigil-core/src/db/schema.ts` (modify: add `agentEvents`)

**Primary analog (composite uniqueness + per-user index):** `workOrderStatuses` at `vigil-core/src/db/schema.ts:240-254`
**Secondary analog (CHECK-constraint-on-text-column note):** `passwordResetTokens` at `vigil-core/src/db/schema.ts:339-372`

#### Imports pattern (already in file — `schema.ts:1-16`)

```typescript
import {
  pgTable,
  serial,
  text,
  doublePrecision,
  timestamp,
  jsonb,
  boolean,
  integer,
  date,
  index,
  unique,
  uniqueIndex,
  customType,
  primaryKey,
} from "drizzle-orm/pg-core";
```

> All required helpers (`pgTable`, `serial`, `text`, `integer`, `timestamp`, `index`, `uniqueIndex`) are already imported. No import diff needed for the basic `agentEvents` table. Drizzle 0.45.2 has **no first-class column-level CHECK helper** — the comment at `schema.ts:351-353` documents this verbatim: `"CHECK constraint on `type` is enforced at SQL level only — drizzle-orm@0.45.2 has no first-class column-level CHECK helper for pgTable. The 0016 migration carries the strict semantic."` The same applies to D-A2 — the CHECK on `event` lives in the migration SQL, not in TypeScript.

#### Composite-PK + per-user index pattern to mirror (`schema.ts:240-254`)

```typescript
// ── work_order_statuses table (Phase 108 — W-01 user scoping) ──────────────
// Composite PK (userId, caseNumber) prevents cross-user caseNumber collisions
// on upsert. D-23 from Phase 102 reversed here — see migrate.test.ts:13.

export const workOrderStatuses = pgTable(
  "work_order_statuses",
  {
    caseNumber: text("case_number").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("open"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.caseNumber] }),
    index("idx_work_order_statuses_user_id").on(table.userId),
  ],
);
```

**For `agentEvents`, mirror this shape but:**
- Use `id: serial("id").primaryKey()` as the surrogate PK (events are append-only — no natural composite PK; the dedupe constraint is a separate partial unique index per D-A4).
- Add `userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" })` verbatim — every other scoped table uses `restrict` (see `thoughts.userId` at `schema.ts:89-91`, `projects.userId` at `schema.ts:65-67`, etc.).
- Add `event: text("event").notNull()` — CHECK constraint goes in the migration SQL (see migration analog below).
- Add `eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull()` (D-A1 source-of-truth).
- Add `receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull()` (D-A1 DB insert time).
- Add `clientEventId: text("client_event_id")` — **nullable** per D-A4; partial unique index lives in migration SQL (drizzle 0.45.2 has no partial-unique-index helper — pattern is to declare a regular `index()` here as a placeholder + put the actual `WHERE client_event_id IS NOT NULL` clause in raw SQL, OR omit from drizzle entirely and rely on migration SQL for the constraint; see CONTEXT.md D-A4 for the exact composite scope `(user_id, client_event_id) WHERE client_event_id IS NOT NULL`).
- Indexes block must include `index("idx_agent_events_user_session_ts").on(table.userId, table.sessionId, sql`${table.eventTimestamp} DESC`)` — note that drizzle-orm 0.45.2 supports the `.on()` raw-SQL escape for DESC ordering; verify with `drizzle-kit generate` output before committing.
- Plus `index("idx_agent_events_user_id").on(table.userId)` per D-A3 + symmetry with every other table in this schema.

#### CHECK-constraint convention (`schema.ts:351-353` comment block)

```typescript
// CHECK constraint on `type` is enforced at SQL level only — drizzle-orm@0.45.2
// has no first-class column-level CHECK helper for pgTable. The 0016 migration
// carries the strict semantic.
```

Mirror this comment verbatim shape for the `event` column on `agentEvents`, swapping `type` → `event` and `0016` → `0018`. Drift-detection test pattern at `forgot-password.test.ts:421-446` (regex-grep against the source file) is the established way to lock CHECK lists in source.

---

### File 2 — `vigil-core/drizzle/0018_add_agent_events.sql` (create)

**Primary analog:** `vigil-core/drizzle/0016_password_reset_tokens.sql` (full file — 47 lines — CREATE TABLE + CHECK + 3 indexes, all `IF NOT EXISTS` guarded)

#### Header comment pattern (`0016_password_reset_tokens.sql:1-19`)

```sql
-- ── Phase 112: AUTH-10 password_reset_tokens table ──────────────────────────
-- Backs the forgot-password / reset-password endpoints (Plans 02/03).
-- Phase 113 (AUTH-11) reuses this table with type='email_verify'; the CHECK
-- constraint is pre-locked here so 113 doesn't need to revisit the migration.
--
-- Atomic single-use claim (CONTEXT D-02 / Phase 112 RESEARCH §Pattern-2):
--   UPDATE password_reset_tokens
--      SET used_at = now()
--    WHERE token_hash = $1
--   ...
--
-- Re-run safe: every statement uses IF NOT EXISTS. Re-running npm run db:migrate
-- on an already-migrated DB is a no-op.
```

> Mirror verbatim shape: phase + requirement IDs in the header, document load-bearing semantics (D-A1 two-timestamps rationale, D-C1 dedupe constraint), state re-run safety. Lock vocabulary the planner can grep for in future phases.

#### CREATE TABLE with CHECK constraint pattern (`0016_password_reset_tokens.sql:21-31`)

```sql
-- ── Step 1: CREATE TABLE with all columns + CHECK constraint ────────────────
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id"          serial PRIMARY KEY,
  "user_id"     integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash"  text NOT NULL,
  "type"        text NOT NULL CHECK ("type" IN ('password_reset','email_verify')),
  "expires_at"  timestamp with time zone NOT NULL,
  "used_at"     timestamp with time zone,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
```

**For `agent_events`, mirror this shape:**
- `"id" serial PRIMARY KEY`
- `"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT` (NB: `RESTRICT` not `CASCADE` — events are an audit trail per existing scoped tables like `thoughts`, `projects`, `work_orders`; see `schema.ts:91, 67, 261`).
- `"session_id" text NOT NULL`
- `"event" text NOT NULL CHECK ("event" IN ('needs_input','task_complete','task_failed','milestone','heartbeat'))` ← the 5 D-A2 values verbatim
- `"message" text` (per spec — nullable to allow events without freeform message)
- `"label" text NOT NULL` (per D-B2 row shape)
- `"host" text NOT NULL` (per D-B2 row shape)
- `"exit_code" integer` (nullable — only present on task_complete/task_failed per spec's 7-field contract)
- `"event_timestamp" timestamp with time zone NOT NULL` (D-A1)
- `"received_at" timestamp with time zone DEFAULT now() NOT NULL` (D-A1)
- `"client_event_id" text` (nullable per D-A4)

#### Index pattern (`0016_password_reset_tokens.sql:33-47`)

```sql
-- ── Step 2: UNIQUE index on token_hash (lookup key for atomic claim) ────────
CREATE UNIQUE INDEX IF NOT EXISTS "idx_prt_token_hash"
  ON "password_reset_tokens" ("token_hash");
--> statement-breakpoint

-- ── Step 3: composite index on (user_id, type) — supports D-06 invalidate-prior
CREATE INDEX IF NOT EXISTS "idx_prt_user_id_type"
  ON "password_reset_tokens" ("user_id", "type");
--> statement-breakpoint

-- ── Step 4: index on expires_at (cleanup-friendly; rare query path) ─────────
CREATE INDEX IF NOT EXISTS "idx_prt_expires_at"
  ON "password_reset_tokens" ("expires_at");
```

**For `agent_events`, mirror this `IF NOT EXISTS` + `statement-breakpoint` pattern:**

```sql
-- D-A3 idx 1: serves GET /v1/agent-sessions "latest event per session per user"
CREATE INDEX IF NOT EXISTS "idx_agent_events_user_session_ts"
  ON "agent_events" ("user_id", "session_id", "event_timestamp" DESC);
--> statement-breakpoint

-- D-A3 idx 2: per-user listing + write-side scoping safety
CREATE INDEX IF NOT EXISTS "idx_agent_events_user_id"
  ON "agent_events" ("user_id");
--> statement-breakpoint

-- D-C1 dedupe — partial unique on (user_id, client_event_id) WHERE client_event_id IS NOT NULL.
-- NO existing migration in this repo uses a partial unique index — this is a new pattern.
-- PG syntax verified: CREATE UNIQUE INDEX <name> ON <tbl> (<cols>) WHERE <predicate>.
-- Composite scope is load-bearing per D-D2 block 3 — single-column would cross-contaminate users.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_events_user_client_event_id"
  ON "agent_events" ("user_id", "client_event_id")
  WHERE "client_event_id" IS NOT NULL;
```

> **Workflow per CONTEXT correction:** `npm run db:generate` (drizzle-kit diffs schema.ts → emits SQL) → manual review/edit (the auto-generated SQL will NOT include the CHECK constraint or the partial unique index — both must be hand-added) → `npm run db:migrate` for local/test → `npm run db:migrate-prod` (compiled JS path) for Railway prod. Confirmed against `vigil-core/package.json` scripts.

#### Backfill pattern reference (NOT applicable here)

`agent_events` is a NEW table — no backfill needed. The `0014_work_order_statuses_user_scoping.sql` DO-block pattern (`vigil-core/drizzle/0014_work_order_statuses_user_scoping.sql:19-29`) is for retrofitting `user_id` into existing tables; ignore for Phase 121.

---

### File 3 — `vigil-core/src/routes/agent-events.ts` (create — Hono sub-app)

**Primary analog:** `vigil-core/src/routes/work-order-status.ts` (94 lines — DI factory pattern + composite-PK upsert + scoped GET + manual validation + error response shape)
**Secondary analog (auth-route style + body-parse + DI seam for tests):** `vigil-core/src/routes/forgot-password.ts:114-237`

#### Imports pattern (`work-order-status.ts:1-4` + `forgot-password.ts:23-29`)

```typescript
// from work-order-status.ts:1-4
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { workOrderStatuses } from "../db/schema.js";
```

> For `agent-events.ts`, mirror this exact import block. Add: `and`, `desc`, `gte`, `sql` from `drizzle-orm` for the GET query (sliding window + DESC sort + composite filter); add `agentEvents, users` from `../db/schema.js`. Note `.js` extension on relative imports is **mandatory** in this codebase (NodeNext resolution — see every existing route file).

#### `c.get("userId")` userId-scoping pattern (`work-order-status.ts:29, 42`)

```typescript
const userId = c.get("userId") as number;
```

> Verbatim. The `as number` cast is the established codebase convention (see `change-password.ts:39` comment: `"D-09: userId is non-null because /v1/auth/change-password is registered after the global bearerAuth dispatcher at index.ts:116."`). Mirror that comment shape on `agent-events.ts` with the relevant index.ts line number where the new route gets mounted.

#### POST body-parse + manual validation pattern (`work-order-status.ts:44-59` — recommended over zod per Discrepancy #2)

```typescript
let body: unknown;
try {
  body = await c.req.json();
} catch {
  return c.json({ error: "Invalid JSON body" }, 400);
}

// Mass-assignment defense: destructure only { status } (T-65-01)
const { status } = body as Record<string, unknown>;

if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
  return c.json(
    { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
    400,
  );
}
```

**For `agent-events.ts` POST, mirror this pattern field-by-field:**
- Destructure ONLY the spec's 7 fields + `client_event_id` (mass-assignment defense — exclude any `userId`, `received_at`, etc.).
- `typeof` check each required string field (`session_id`, `event`, `message`, `label`, `host`, `client_event_id`).
- `Number.isFinite(exit_code) || exit_code === undefined` for the optional integer.
- ISO-8601 parse for `timestamp` → `eventTimestamp`. Pattern: `const ts = new Date(timestamp); if (Number.isNaN(ts.getTime())) return c.json({ error: "invalid_timestamp", message: "..." }, 400);`
- `VALID_EVENTS.includes(event)` against the same 5-value list as the CHECK constraint (drift detector test will lock both source files).
- **`client_event_id` REQUIRED** per D-C3 — early-return 400 if missing/empty.

> **Note on D-Discretion `.strict()` rejection of unknown fields:** With manual validation, the equivalent of `.strict()` is to introduce an explicit `KNOWN_FIELDS = new Set([...])` and reject if `Object.keys(body).some(k => !KNOWN_FIELDS.has(k))`. Recommend the planner add this as an explicit Plan-01 decision.

#### Error response shape (`change-password.ts:53, 77, 84, 92, 103` — single-string `{ error }`; CONTEXT D-Discretion line 91 says `{ error, message }`)

CONTEXT D-Discretion line 91 calls for `{ error: "<short-code>", message: "<human-readable text>" }`. **The actual codebase is split:**
- Single-string `{ error: "..." }`: `change-password.ts:54, 77, 84, 92, 103`, `work-order-status.ts:48, 56`, `index.ts:211`. (Most common.)
- Two-field `{ error, message }` shape: NOT found in any existing route. The closest two-field shape is `forgot-password.ts:55-58` `{ ok: true, message: "..." }` (which is enum-safety semantics, not error reporting).

> **Recommendation:** Adopt CONTEXT D-Discretion's two-field shape (`{ error: "<short-code>", message: "<human-readable text>" }`) — it's a deliberate upgrade. Just be aware no existing route uses it; no drift-detection tests will break, but the planner should call this out as a "new convention introduced by Phase 121" worth documenting in PROJECT.md so future routes follow suit. Phase 121's `agent-events.ts` becomes the canonical reference for the shape going forward.

#### Idempotent upsert pattern for D-C1/D-C2 (`work-order-status.ts:85-91`)

```typescript
await db
  .insert(workOrderStatuses)
  .values({ userId, caseNumber, status })
  .onConflictDoUpdate({
    target: [workOrderStatuses.userId, workOrderStatuses.caseNumber],
    set: { status, updatedAt: new Date() },
  });
```

**For `agent-events.ts`, the dedupe semantics are different — D-C2 says return the EXISTING row on conflict, NOT update it.** The drizzle pattern is `.onConflictDoNothing({ target: [...] })` followed by a SELECT, OR the more idiomatic `.returning()` pattern with conditional check:

```typescript
// Sketch — planner to refine:
const [inserted] = await db
  .insert(agentEvents)
  .values({ userId, sessionId, event, message, label, host, exitCode, eventTimestamp, clientEventId })
  .onConflictDoNothing({
    target: [agentEvents.userId, agentEvents.clientEventId],  // NB: matches the partial unique index
    where: sql`${agentEvents.clientEventId} IS NOT NULL`,        // partial-index awareness
  })
  .returning();

if (inserted) {
  return c.json(inserted, 201);  // D-C2: 201 on fresh insert
}

// Conflict path — D-C2: return 200 + existing row
const [existing] = await db
  .select()
  .from(agentEvents)
  .where(and(
    eq(agentEvents.userId, userId),
    eq(agentEvents.clientEventId, clientEventId),
  ))
  .limit(1);
return c.json(existing, 200);
```

> **CRITICAL idempotency invariant per D-D2 block 3:** the `target` MUST be `[agentEvents.userId, agentEvents.clientEventId]`, NEVER `[agentEvents.clientEventId]` alone. Single-column would cross-contaminate users. The cross-user isolation test block 3 pins exactly this.

#### GET sliding-window + DESC sort pattern

No exact analog exists for "latest event per group" — the closest reference is the brief-history GET in `cross-user-isolation.test.ts:309-351` (date-range filter on a per-user table). For the `GROUP BY session_id` + "latest event per session" query per D-B2, the planner should reach for one of:
- Postgres `DISTINCT ON (session_id)` with `ORDER BY session_id, event_timestamp DESC` — most natural for "row with the latest timestamp per group" (verified PG-native pattern).
- Or window function `ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY event_timestamp DESC)` filtered to `rn = 1`.

Both compose with the composite index `(user_id, session_id, event_timestamp DESC)` for index-only scan. Drizzle 0.45.2 supports raw SQL via `sql` template tag — see `schema.ts:14` (`customType` import) for the established raw-SQL escape pattern. The planner should pick one approach in Plan-02 and stick with it; the `agent_count` per D-B2 is a `count(*) OVER (PARTITION BY session_id)` window function alongside.

#### Production singleton export + factory DI seam pattern (`work-order-status.ts:71-93`)

```typescript
export const workOrderStatus = createWorkOrderStatusRouter({
  get dbAvailable() {
    return !!db;
  },
  dbSelectFn: async (userId: number) => { ... },
  dbUpsertFn: async (userId: number, caseNumber: string, status: string) => { ... },
});
```

Or the simpler pattern from `change-password.ts:33`:

```typescript
export const changePassword = new Hono();
changePassword.post("/auth/change-password", async (c) => { ... });
```

**Recommendation:** Use the factory pattern (`work-order-status.ts` style). Two reasons:
1. CONTEXT D-D2 block 3 + the dedupe-collision test benefits from being able to inject a deterministic `nowFn` for clock control (mirror `forgot-password.ts:107-112` `ForgotPasswordDeps` shape).
2. The factory pattern lets `agent-events.test.ts` (route-level) use stubbed deps while `cross-user-isolation.test.ts` (integration) uses the real `db` singleton.

---

### File 4 — `vigil-core/src/index.ts` (modify — register route)

**Primary analog:** `vigil-core/src/index.ts:180` — the registration of `changePassword` after the bearerAuth dispatcher and metricsMiddleware.

#### Import pattern to add (mirroring `index.ts:36-37`)

```typescript
// Existing in index.ts:36-37:
import { changePassword } from "./routes/change-password.js";
import { forgotPassword } from "./routes/forgot-password.js";
```

> Add: `import { agentEvents } from "./routes/agent-events.js";` near the protected-routes import group (line ~36-42 area, alongside other authenticated routes).

#### Route mount pattern (`index.ts:175-200`)

```typescript
// Phase 110 (AUTH-09 D-09): change-password is a NEW protected router.
// Mounted AFTER the bearerAuth dispatcher at line 116 (mirrors prioritize
// pattern). The handler does `c.get("userId") as number` and the dispatcher
// guarantees that's non-null. Do NOT move this above line 116 — would create
// a silent auth bypass (see WR-02 mount-order comment at lines 124-130).
app.route("/v1", changePassword);
app.route("/v1", describeImage);
app.route("/v1", processPhoto);
app.route("/v1", processAudio);
app.route("/v1", therapy);
app.route("/v1", briefHistory);
...
app.route("/v1", resendVerification);
```

**Insertion point:** Append `app.route("/v1", agentEvents);` AFTER `index.ts:200` (`app.route("/v1", resendVerification);`) and BEFORE `index.ts:204` (`app.onError(...)` — the global error handler must remain last per the `index.ts:202-203` comment: `"D-13 — single chokepoint for unhandled errors. Must be AFTER all app.route() calls so Hono's handler-chain ordering routes thrown errors here (Pitfall 4)."`).

**Required block comment to mirror (`index.ts:175-179`):** Add a similar 5-line block above the new `app.route` call referencing Phase 121 + AGENT-API-01 + AGENT-API-02 + the bearerAuth dispatcher line + the do-not-move warning.

#### Mount-order load-bearing constraints to preserve

| Constraint | Source line | Rationale |
|------------|-------------|-----------|
| Route mounted AFTER `app.use("/v1/*", ...bearerAuth...)` at `index.ts:135` | `index.ts:175-179` block comment | Otherwise route is structurally PUBLIC. |
| Route mounted AFTER `app.use("/v1/*", metricsMiddleware)` at `index.ts:157` | `index.ts:146-156` WR-02 block | Otherwise route is silently unmeasured (and `c.var.userId` not yet set in metrics). |
| Route mounted BEFORE `app.onError(...)` at `index.ts:204` | `index.ts:202-203` D-13 comment | Hono handler-chain ordering — error handler must be last (Pitfall 4). |

---

### File 5 — `vigil-core/src/integration/cross-user-isolation.test.ts` (modify — add 3 `it()` blocks per D-D2)

**Primary analog (within the same file):** `cross-user-isolation.test.ts:421-455` — the work-orders isolation block (insert two rows for two users, GET as userA, assert no userB rows in response, cleanup in `finally`).

#### Lazy-import + DB-skip-guard pattern (mandatory at top of every block — `cross-user-isolation.test.ts:421-431`)

```typescript
it("work-orders isolation — GET /v1/work-orders returns only caller's orders", async (t) => {
  if (!DB_READY) {
    t.skip("DATABASE_URL required");
    return;
  }
  const { db: d } = await import("../db/connection.js");
  const { workOrders } = await import("../db/schema.js");
  // Use unique caseNumbers scoped to this test to avoid PK collisions.
  const aCase = `ISO-A-${Date.now()}`;
  const bCase = `ISO-B-${Date.now()}`;
  await d!.insert(workOrders).values({
    userId: userA.id,
    caseNumber: aCase,
    shortDescription: "userA-order",
  });
  await d!.insert(workOrders).values({
    userId: userB.id,
    caseNumber: bCase,
    shortDescription: "userB-order",
  });
  try {
    const res = await get("/v1/work-orders?filter=all", tokenA);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: Array<{ caseNumber: string }> };
    const cases = body.data.map((w) => w.caseNumber);
    assert.ok(cases.includes(aCase), "userA must see own work order");
    assert.ok(
      !cases.includes(bCase),
      "LEAK: GET /v1/work-orders surfaced userB's order in userA's list",
    );
  } finally {
    await d!.delete(workOrders).where(eq(workOrders.caseNumber, aCase));
    await d!.delete(workOrders).where(eq(workOrders.caseNumber, bCase));
  }
});
```

**For Phase 121's 3 D-D2 blocks, mirror this exact shape per block:**

1. **Block 1 — POST cannot use body-supplied userId** (D-D2.1):
   - `await post("/v1/agent-events", tokenA, { ...validPayload, userId: userB.id })` — hostile body.
   - Assert response status is 201.
   - Assert response body has `userId: userA.id` (NOT `userB.id`).
   - Cross-check via DB SELECT: the inserted row has `user_id = userA.id`.
   - Cleanup in `finally`: delete by `clientEventId`.

2. **Block 2 — GET filters by token's userId** (D-D2.2):
   - Insert one event for userA, one for userB (use the `agentEvents` import via lazy `await import("../db/schema.js")`).
   - `await get("/v1/agent-sessions", tokenA)` — assert no userB session in response.
   - Cleanup in `finally`.

3. **Block 3 — Composite-uniqueness dedupe scope** (D-D2.3):
   - Both users POST with the SAME `client_event_id` UUID.
   - Both POSTs must succeed with 201 (each user gets own row).
   - DB SELECT confirms two rows exist with the same `client_event_id` but different `user_id`.
   - This pins `(user_id, client_event_id)` composite uniqueness invariant. A regression to single-column unique would cause one POST to 200-dedupe against the other.

#### File-level boot block to PRESERVE (`cross-user-isolation.test.ts:26-37`)

```typescript
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";
process.env["VIGIL_ALLOWED_EMAILS"] = "userA@test.local,userB@test.local";

// Lazy imports so the boot-checks in utils/jwt.ts run after env is set
const { db } = await import("../db/connection.js");
const { users, thoughts, projects, apiKeys } = await import("../db/schema.js");
const { signToken } = await import("../utils/jwt.js");
const { hashPassword } = await import("../utils/password.js");

// Import the Hono app for in-process dispatch.
const { app } = await import("../index.js");
```

> Don't add `agentEvents` to the eager top-level import block — keep it `await import(...)` at the per-test level (matches the work-orders block at `:427`). Reasoning: minimal blast-radius if `agent_events` table doesn't exist on a stale local DB; per-test lazy import lets the rest of the file still run.

#### Helpers to REUSE (`cross-user-isolation.test.ts:46-64`)

```typescript
async function get(path: string, token: string) {
  return app.fetch(
    new Request(`http://x${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}
async function post(path: string, token: string, body: unknown) {
  return app.fetch(
    new Request(`http://x${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}
```

> Already in the file. New blocks just call `get(...)` / `post(...)` — no helper changes.

---

### File 6 — `vigil-core/src/routes/agent-events.test.ts` (create — full route coverage)

**Primary analog (recommended):** `vigil-core/src/routes/work-order-status.test.ts` (166 lines, factory + DI + `c.set("userId", N)` middleware stub — pure-unit, no DB required).
**Secondary analog (live-DB seed pattern + drift-detector lock + JWT_SECRET env block):** `vigil-core/src/routes/forgot-password.test.ts` (503 lines, beforeEach DI seam, `t.skip("DATABASE_URL required")` per-test guard, drift-detection regex tests).

#### JWT_SECRET pre-import boot block (`forgot-password.test.ts:27-29`)

```typescript
// Set JWT_SECRET BEFORE importing the route — utils/jwt.ts exits at import time
// without it (per index.ts:61-64 and the auth.test.ts pattern at line 21).
process.env["JWT_SECRET"] = "test-secret-32-chars-minimum-value-xxxxxx";
```

> Mandatory if any imported module ultimately reaches `utils/jwt.ts`. Verify whether `agent-events.ts` imports anything that does (it shouldn't — the route doesn't sign tokens). If not strictly needed, still recommend including this block — it makes the test file self-contained and copy-pasteable.

#### Userid-stub middleware pattern (`work-order-status.test.ts:31-39`)

```typescript
// Build a Hono app that stubs c.set("userId", <id>) BEFORE routing to the
// factory router. Mirrors production, where bearerAuth sets userId on the
// context for every route under /v1.
function makeApp(deps: WorkOrderStatusDeps, userId: number = 1): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/", createWorkOrderStatusRouter(deps));
  return app;
}
```

> Mirror this verbatim. For agent-events the factory will be `createAgentEventsRoute(deps)`. Stub `userId: 1` for most tests; use `userId: 2` for the cross-user dedupe test where two users insert with the same `client_event_id` to verify per-user scoping at unit level (complementary to the integration-level isolation test in `cross-user-isolation.test.ts`).

#### Test naming convention

The codebase uses two styles:
- `forgot-password.test.ts:97`: `it("unknown email returns 200 with enum-safe body", ...)` — plain English description.
- `work-order-status.test.ts:57`: `test("WO-02/T1: PUT /work-orders/TEST001/status with done returns 200 and correct body", ...)` — structured `<REQ>/<T#>: <description>` format.

> **Recommendation:** Use the structured format `AGENT-API-01/T1: ...` etc. Easier to grep for requirement coverage when /gsd-state-current audits Phase 121 traceability.

#### Drift-detection test pattern for the 5 event-type values (`forgot-password.test.ts:421-446`)

```typescript
it("AUTH-13-FP-CAP-IP-20: source file declares RATE_LIMIT_MAX_IP = 20 verbatim (drift detector)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, "forgot-password.ts"), "utf8");
  assert.match(
    src,
    /const RATE_LIMIT_MAX_IP = 20;/,
    "forgot-password.ts must declare RATE_LIMIT_MAX_IP = 20 verbatim (Phase 117 AUTH-13 D-05 lock)",
  );
});
```

> **Strongly recommend** adding a similar drift detector for the 5 event-type values to BOTH `agent-events.ts` (the `VALID_EVENTS` const) AND the migration SQL file (the CHECK constraint string). One test per file. This is the established pattern for locking semantically load-bearing string lists across schema + code.

#### Coverage list (per CONTEXT D-D1 "full route coverage")

The planner's Plan-04 should hit at minimum:

1. POST happy path → 201, all fields preserved verbatim, ISO-8601 parsed correctly.
2. POST without `client_event_id` → 400 (`{ error: "invalid_payload", message: "client_event_id is required" }`).
3. POST with same `client_event_id` twice → first 201, second 200 with same row.
4. POST with each of the 5 valid `event` values → 201 (5 sub-cases or table-driven).
5. POST with invalid `event` value (e.g., `"made_up_event"`) → 400.
6. POST with malformed timestamp → 400.
7. POST with extra unknown fields → 400 (per D-Discretion `.strict()` intent).
8. POST with body containing `userId: 999` → row inserted with caller's userId, 999 ignored (mass-assignment defense — duplicates the integration block 1 at unit level).
9. GET happy path → 200, sorted DESC by event_timestamp, sliding 24h window applied.
10. GET with `?since=<ISO>` query param → respects override.
11. GET with > 100 sessions → response capped at 100.
12. GET when user has zero sessions → 200, `{ data: [] }` (or whatever the chosen response shape is).
13. Drift detector for `VALID_EVENTS` const in `agent-events.ts`.
14. Drift detector for `CHECK ("event" IN (...))` in `0018_add_agent_events.sql`.

---

## Shared Patterns

### Authentication

**Source:** `vigil-core/src/middleware/auth.ts` — `bearerAuth` middleware (entire file, 153 lines)
**Mount point:** `vigil-core/src/index.ts:135-144` (the `app.use("/v1/*", ...)` dispatcher).
**Apply to:** `agent-events.ts` (both POST and GET inherit from the existing dispatcher — no per-route auth code needed).

```typescript
// from auth.ts:38-46 — what bearerAuth does for every /v1/* route:
export const bearerAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }
  const token = authHeader.slice(7);
  // ... vk_ key path or JWT path → c.set("userId", row.userId) ...
};
```

> Phase 121 routes do NOT need to add any auth code. The `c.set("userId", N)` invariant is established by the dispatcher BEFORE the route handler runs. The route only needs `const userId = c.get("userId") as number;` (mirroring `change-password.ts:39`).

### Error Handling

**Source:** `vigil-core/src/index.ts:204-212` — global onError handler
**Apply to:** All thrown exceptions in `agent-events.ts` (route handlers should `throw new Error(...)` rather than catch-and-rethrow; the global handler logs to PostHog and returns 500).

```typescript
app.onError((err, c) => {
  console.error("[vigil-core] unhandled error:", err);
  const userId = (c.get("userId") as number | undefined) ?? null;
  captureException(userId, err, {
    route: c.req.path,
    method: c.req.method,
  });
  return c.json({ error: "Internal server error" }, 500);
});
```

> Route-level `try/catch` is reserved for **expected** failure modes (JSON parse, validation) that map to specific 4xx responses. Unexpected errors (DB connection blip, etc.) bubble to the global handler — DO NOT catch-all in the route.

### DB-Available Guard

**Source:** `vigil-core/src/routes/change-password.ts:59` and `work-order-status.ts:27, 40`
**Apply to:** `agent-events.ts` POST and GET handlers, both as the first non-validation check.

```typescript
if (!db) return c.json({ error: "Database unavailable" }, 503);
```

> One-liner. `db` is typed as `... | null` per `db/connection.ts`; this narrows it for TypeScript.

### Drizzle Type Inference (per D-Discretion)

**Source:** `vigil-core/src/db/types.ts:7-21`

```typescript
export type DrizzleThought = typeof thoughts.$inferSelect;
export type NewThought = typeof thoughts.$inferInsert;
export type DrizzleWorkOrderStatus = typeof workOrderStatuses.$inferSelect;
export type NewWorkOrderStatus = typeof workOrderStatuses.$inferInsert;
```

> Add to `db/types.ts` after the existing block:
> ```typescript
> export type DrizzleAgentEvent = typeof agentEvents.$inferSelect;
> export type NewAgentEvent = typeof agentEvents.$inferInsert;
> ```
> Update the `import { ... } from "./schema.js"` line at `db/types.ts:3` to add `agentEvents`. Per D-Discretion: "No hand-written DTOs."

### Lazy Imports in Tests

**Source:** `vigil-core/src/integration/cross-user-isolation.test.ts:30-37`

```typescript
const { db } = await import("../db/connection.js");
const { users, thoughts, projects, apiKeys } = await import("../db/schema.js");
const { signToken } = await import("../utils/jwt.js");
const { hashPassword } = await import("../utils/password.js");
const { app } = await import("../index.js");
```

> Mandatory in `cross-user-isolation.test.ts` (top-level + per-test for new tables); recommended in `agent-events.test.ts` if it imports the route module directly. The reason is the `process.env["JWT_SECRET"] = ...` block must execute BEFORE any module that imports `utils/jwt.ts` is loaded — eager imports would break the env-set ordering.

### Migration Workflow

**Source:** `vigil-core/package.json` + `vigil-core/src/db/migrate.ts:15`

```bash
# 1. Edit src/db/schema.ts (add agentEvents table)
# 2. Generate SQL diff:
cd vigil-core && npm run db:generate
# This creates drizzle/0018_<auto-generated-slug>.sql — RENAME to 0018_add_agent_events.sql per CONTEXT D-Discretion line 89.

# 3. MANUALLY EDIT the generated SQL to add:
#    - The CHECK constraint on the event column (drizzle 0.45.2 doesn't emit this).
#    - The partial unique index `WHERE client_event_id IS NOT NULL` (drizzle 0.45.2 doesn't emit this).
#    - The `IF NOT EXISTS` guard on every CREATE statement (mirror 0016_password_reset_tokens.sql shape).
#    - The phase-anchored header comment block (mirror 0016 lines 1-19).

# 4. Apply locally:
cd vigil-core && npm run db:migrate

# 5. Apply on Railway prod (auto-runs at deploy time per Phase 55):
# `npm run db:migrate-prod` is the compiled-JS path; happens via the deploy hook.
```

> Verified against `vigil-core/package.json` scripts and `vigil-core/src/db/migrate.ts:15` (`migrationsFolder: "./drizzle"`). The auto-generated drizzle filename slug WILL need to be renamed to match CONTEXT D-Discretion's `nnnn_add_agent_events.sql` convention; this is normal — see `0008_add_oauth_scopes_and_account_email.sql`, `0009_add_app_settings.sql`, `0010_add_ai_cache.sql` for the descriptive-rename pattern. Older migrations like `0011_dashing_redwing.sql` use the auto-slug; the trend post-Phase 79.1 has been toward descriptive names.

---

## No Analog Found

| File / Concept | Reason | Mitigation |
|----------------|--------|------------|
| Partial unique index `WHERE client_event_id IS NOT NULL` | No existing migration in `vigil-core/drizzle/` uses a partial index. New pattern. | Hand-write per the SQL block above; PG syntax verified. Drift detector test should grep the migration SQL for the literal `WHERE "client_event_id" IS NOT NULL` to lock against accidental simplification to a full unique index. |
| `{ error, message }` two-field error response shape | No existing route uses this shape; CONTEXT D-Discretion introduces it as a new convention. | Adopt as the new canonical shape; document in PROJECT.md as a Phase-121 pattern lock so future routes follow suit. Phase 121's `agent-events.ts` becomes the reference. |
| zod-based route validation | zod is NOT installed in `vigil-core/package.json`; no existing route uses it. | Use established manual `typeof` validation pattern (Pattern Block 4 above) — recommended; OR add `zod` to deps as a Phase 121 sub-decision (planner to lock in Plan-01). |
| Per-test live-DB factory + `agentEvents` cleanup helper | New table + new test file — no existing helper. | Author per `forgot-password.test.ts:50-78` `seedUser` / `clearTokensFor` shape, scoped to the new table. |
| `DISTINCT ON (session_id)` or window-function PG query for "latest event per session" | No existing route does a per-group-latest query in vigil-core. | New pattern; planner picks `DISTINCT ON` (simpler, native PG, composes with the composite index) or window function (more portable) in Plan-02. Both are valid; document the choice. |

---

## Metadata

**Analog search scope:**
- `vigil-core/src/db/` (schema.ts, types.ts, migrate.ts, connection.ts)
- `vigil-core/src/routes/` (all 39 route files; close-read on work-order-status.ts, change-password.ts, forgot-password.ts, work-order-status.test.ts, forgot-password.test.ts)
- `vigil-core/src/middleware/` (auth.ts, metrics.ts)
- `vigil-core/src/integration/` (cross-user-isolation.test.ts)
- `vigil-core/drizzle/` (all 18 SQL files; close-read on 0014, 0016, 0017)
- `vigil-core/package.json` + `vigil-core/drizzle.config.ts` (workflow verification)

**Files scanned:** ~60
**Pattern extraction date:** 2026-05-08

---

*Phase: 121-agent-events-api-foundation-cross-user-isolation-lock*
*Mapped: 2026-05-08*
