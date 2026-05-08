# Phase 121: Agent-events API foundation + cross-user isolation lock - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Vigil Core gets a new write/read pair for agent events:

- `POST /v1/agent-events` — vigil-watch (or any HTTP client) posts an event; row inserted into a new `agent_events` table with `user_id` resolved from the bearer token, never from the request body. Idempotent via required `client_event_id` UUID.
- `GET /v1/agent-sessions` — caller reads their own currently-tracked sessions (sliding 24h window) with the last event embedded per row.
- A cross-user isolation test mirrors the W-01/W-02 lock from Phase 108: 3 dedicated `it()` blocks added to `src/integration/cross-user-isolation.test.ts` plus a regular `agent-events.test.ts` with full route coverage.

Deferred to other phases:
- WebSocket fan-out of `agent-event` on `/v1/agent-stream` — Phase 124 (AGENT-API-03).
- vigil-watch daemon implementation — Phase 122.
- vigil-watch CLI shell + launchd + 24h soak — Phase 123.

This phase is API-only. No daemon, no client, no HUD.

</domain>

<decisions>
## Implementation Decisions

### `agent_events` schema shape

- **D-A1 (Two timestamps):** Schema carries both `event_timestamp` (timestamptz, from daemon payload — source-of-truth for ordering) and `received_at` (timestamptz, default `NOW()`, DB insert time). Two timestamps are standard observability hygiene — they let post-hoc debugging detect clock skew, retry latency, queue-flush storms. ~16 bytes extra per row.

- **D-A2 (Event constraint):** `event` column is `text NOT NULL CHECK (event IN ('needs_input','task_complete','task_failed','milestone','heartbeat'))`. Same correctness guarantee as a Postgres native enum, but the constraint is editable in a single non-locking migration. Matches existing Drizzle conventions in vigil-core (no PG enums currently used elsewhere in `src/db/schema.ts`).

- **D-A3 (Indexes):** Two indexes on `agent_events`:
  1. Composite `(user_id, session_id, event_timestamp DESC)` — serves both the `GET /v1/agent-sessions` "latest event per session per user" query and any future per-session timeline query.
  2. `idx_agent_events_user_id` on `user_id` — symmetry with the rest of the schema and write-side scoping safety.

- **D-A4 (Extra columns):** Add `client_event_id` (text, nullable) only. Skip `raw_payload JSONB` (JSONL files are the daemon's source of truth — duplicating bloats every row) and skip `delivered_at` (Phase 124 may want a separate `agent_event_deliveries` table for per-subscriber state, not a single flag — reserving the wrong shape is worse than reserving nothing). `client_event_id` gets a partial unique index `WHERE client_event_id IS NOT NULL`, scoped composite with `user_id` (see D-D2).

### `GET /v1/agent-sessions` definition + response shape

- **D-B1 (Currently-tracked = sliding window):** A session appears in the response IFF it has ≥1 event in the last 24 hours. Default window is 24h, configurable via `?since=<ISO-8601>` query param (defaults to `now() - 24h`). Bounded result set; no day-old terminated work polluting the HUD; matches the user's daily-rhythm mental model. The HUD does NOT need to filter "non-terminal" sessions — sessions that hit `task_complete` or `task_failed` simply age out of the 24h window naturally.

- **D-B2 (Row shape — flat list, last event embedded):** Each row is:
  ```json
  {
    "session_id": "claude-<jsonl-filename-without-extension>",
    "label": "vigil-vscode-extension",
    "host": "Jamesons-iMac",
    "last_event": {
      "event": "needs_input",
      "message": "Claude wants to run: rm -rf node_modules",
      "event_timestamp": "2026-05-08T18:34:12Z"
    },
    "event_count": 7
  }
  ```
  Single round-trip for HUD rendering; matches the G2 3-line layout (label / state / message). NOT grouped by `label` — Phase 124's HUD can re-shape if it wants project grouping.

- **D-B3 (Sort order):** `ORDER BY last_event.event_timestamp DESC` — newest activity first. Matches "recents" UX. The session that just emitted `needs_input` floats to the top of the HUD glance.

- **D-B4 (Pagination):** Hard cap at 100 sessions; no cursor/offset pagination yet. Sliding 24h window + single-user reality means ≥10 active sessions is already a lot. Add cursor pagination only when somebody actually has 100+ active sessions in 24h (probably never).

### Idempotency / replay protection

- **D-C1 (Dedupe via client_event_id UUID):** Daemon generates a UUIDv4 per event before queueing; same UUID survives retries. Vigil Core enforces uniqueness via partial unique index `(user_id, client_event_id) WHERE client_event_id IS NOT NULL`. Strongest correctness guarantee — daemon controls what "same event" means; column already reserved in D-A4.

- **D-C2 (200 OK on duplicate):** When a row with the same `(user_id, client_event_id)` already exists, return `200 OK` with the existing row (NOT 201, NOT 409). Idempotent semantics — daemon's retry receives the same response shape as the original POST and can confidently advance its offset.

- **D-C3 (client_event_id is REQUIRED):** API rejects POSTs missing `client_event_id` with `400 Bad Request`. Forces correct daemon behavior from day one; no "oops, we shipped without idempotency" path. Phase 122's vigil-watch daemon will generate UUIDv4 per event before queueing — same UUID survives retries.

> **Note: spec extension.** This adds an 8th field (`client_event_id`) to the v3.8 spec's "verbatim 7-field payload contract" (`session_id`, `event`, `message`, `timestamp`, `label`, `host`, `exit_code`). The Phase 120 verdict (`spec-correct-and-proceed`) did NOT address idempotency; the v3.8 spec mentioned a 100-event offline queue but didn't specify retry semantics. Adding `client_event_id` is the minimal extension to make the queue safe — without it, a queue flush after a network blip can produce duplicate rows. Phase 122 must update the daemon's queue + retry path to generate and persist UUIDs.

### Cross-user isolation test layout

- **D-D1 (Both: mirror + dedicated file):** Add 3 `it()` blocks to the canonical `src/integration/cross-user-isolation.test.ts` (the load-bearing single file every future phase greps for) covering POST + GET cross-user safety + dedupe-key composite scoping. Plus a regular `src/routes/agent-events.test.ts` with full route coverage (validation, dedupe, response shape, status codes). Best of both worlds: the lock test is discoverable via the established Phase 108 pattern, while regular unit-level tests live where they belong.

- **D-D2 (Lock-test it() blocks):** Three blocks added to `cross-user-isolation.test.ts`:
  1. **POST /v1/agent-events: userA's POST cannot insert with userB's userId** — userA POSTs with `body.userId = userB.id` (a hostile/buggy client); assert the inserted row has `user_id = userA.id` regardless. Pins D-21 (route filters by `c.get('userId')`, never trusts body).
  2. **GET /v1/agent-sessions: userA's GET never returns userB's sessions** — seed events for both users; assert userA's GET response contains only userA's sessions. Pins D-22 (route-level `.where(eq(agentEvents.userId, c.get('userId')))`).
  3. **Dedupe scope: userA's client_event_id collision with userB's UUID is allowed** — both users POST with the SAME `client_event_id`; assert each user gets their own row. Pins composite-uniqueness invariant `(user_id, client_event_id)` rather than just `client_event_id`. Without this test, a regression to single-column uniqueness would silently cross-contaminate.

  **NOT included in the lock test:** the "API ignores any `userId` field in request body" check is folded into block 1 above (which already tests this). Skipping it as a separate block keeps the canonical file lean.

### Claude's Discretion

- **POST response shape:** On successful insert, return `201 Created` with the inserted row body (camelCase Drizzle row, same shape as the GET row's `last_event` plus all other columns). On idempotent dup, return `200 OK` with the existing row (per D-C2). Body schema is consistent across both status codes — daemon doesn't branch on status.
- **Validation strictness:** zod schema in the route, strict mode (`.strict()`) — reject unknown fields with 400. The spec's payload contract is locked and Phase 122's daemon controls the wire format end-to-end; permissive validation has no use case.
- **Drizzle types:** Generate TypeScript types from the schema via `InferSelectModel`/`InferInsertModel` (existing pattern in `src/db/types.ts`). No hand-written DTOs.
- **Migration filename:** Drizzle convention `nnnn_add_agent_events.sql` per existing migration sequence in `src/db/migrations/`.
- **Route file location:** `src/routes/agent-events.ts` (matches the rest of `routes/` flat layout). Registered in `src/index.ts` via `app.route("/v1", agentEvents)` after the existing `bearerAuth` middleware mount point at `/v1/*`.
- **Error response shape:** match existing routes' `{ error: "<short-code>", message: "<human-readable text>" }` pattern (consistent with auth/me/forgot-password routes).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v3.8 Milestone Spec (load-bearing for entire milestone)
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Architecture surfaces" — table of new endpoints + per-userId scoping requirement.
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Event payload contract" — the 7-field POST body shape that Phase 121 implements (extended by `client_event_id` per D-C1).
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Event types (5)" — the 5 allowed values for the `event` column (the CHECK constraint enforces this list).
- `.planning/v3.8-CLAUDE-CODE-COMPANION-SPEC.md` §"Per-user scoping" — locks the SCHED-01-mirror requirement.

### Requirements
- `.planning/REQUIREMENTS.md` AGENT-API-01 + AGENT-API-02 — must satisfy both this phase. AGENT-API-03 (WebSocket fan-out) is Phase 124 and out of scope here.

### Phase 120 verdict (downstream cross-link)
- `https://github.com/dttigers/vigil-watch/blob/main/README.md` §Verdict — `spec-correct-and-proceed` locked. Phase 121's payload contract honors that verdict (event types verbatim; mapping field-paths NOT used in this phase since 121 is the API receiver, not the JSONL parser).
- `.planning/phases/120-day-1-jsonl-schema-verification-detection-strategy-lock/120-CONTEXT.md` — D-05 (findings shape) + D-06 (pragmatic-fallback rule).

### vigil-core code patterns (Phase 121 must follow)
- `vigil-core/src/middleware/auth.ts` — `bearerAuth` middleware (vk_/JWT). Sets `c.set('userId', number)` for downstream routes. Reuse verbatim.
- `vigil-core/src/integration/cross-user-isolation.test.ts` — the W-01/W-02 lock pattern. Phase 121 adds 3 `it()` blocks per D-D2 inside the existing file's structure (lazy imports, JWT_SECRET env, app.fetch in-process dispatch).
- `vigil-core/src/db/schema.ts` — Drizzle pattern for `userId NOT NULL FK + idx_<table>_user_id + composite indexes`. The `workOrderStatuses` table (composite PK `(user_id, case_number)`) is the closest analog for the `client_event_id` partial composite.
- `vigil-core/src/index.ts` — route registration pattern. New routes go AFTER `bearerAuth` mount (`app.use("/v1/*", ...)`) and AFTER `metricsMiddleware` (D-05 from Phase 109 — metrics needs `c.var.userId` already set).
- `vigil-core/src/db/migrate.ts` — migration runner; new migration file goes in `src/db/migrations/` per existing sequence.

### Phase 108/109 patterns (lessons + structural locks)
- `.planning/PROJECT.md` lines 142-144 — W-01 (`work_order_statuses` composite PK pattern), W-02 (cross-user isolation via response status code), SCHED-01 (per-user scheduler fan-out). Phase 121 MIRRORS the structural lock in test layout but does NOT re-implement scheduler-fanout patterns (that's Phase 124's WebSocket work).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`bearerAuth` middleware (`src/middleware/auth.ts:38`):** Already handles vk_ keys + JWTs and sets `c.var.userId`. Phase 121 routes mount under the existing `/v1/*` middleware chain — no new auth code.
- **`metricsMiddleware` (`src/middleware/metrics.ts`):** Auto-emits `api_request` metrics for every `/v1/*` route. Phase 121 routes inherit this for free; the new endpoints will appear in metrics dashboards without explicit instrumentation.
- **Drizzle schema patterns (`src/db/schema.ts`):** `workOrderStatuses` (composite PK with userId) is the closest structural analog for the `(user_id, client_event_id)` partial unique index pattern Phase 121 needs.
- **Cross-user isolation test scaffolding (`src/integration/cross-user-isolation.test.ts:1-70`):** Two real users in real DB, JWT signing, in-process `app.fetch` dispatch. Phase 121 adds 3 `it()` blocks inside the existing `describe()` structure.
- **Migration runner (`src/db/migrate.ts`):** Apply migrations in numeric sequence on app boot; Phase 121 adds the next-numbered SQL file.

### Established Patterns

- **Route-level userId scoping (D-21/D-22 from Phase 108):** Every scoped route MUST `.where(eq(<table>.userId, c.get('userId')))` on every read AND write. Never trust `req.body.userId`. Phase 121's POST and GET both follow this — POST resolves userId from bearer ONLY; GET filters by bearer's userId ONLY.
- **Validation via zod in-route, not middleware:** Existing routes (e.g., `forgot-password.ts`, `change-password.ts`) declare zod schemas inline at the top of the file and `.parse()` `req.body`. Phase 121's POST follows this pattern.
- **Response error shape:** `{ error: "<short-code>", message: "<human-readable text>" }` (e.g., `{ error: "invalid_payload", message: "client_event_id is required" }`). Phase 121 follows.
- **Migration filename convention:** `nnnn_<verb>_<noun>.sql` in `src/db/migrations/`. Phase 121 adds the next-numbered file.

### Integration Points

- **Routing:** `src/routes/agent-events.ts` exports a Hono sub-app; registered in `src/index.ts` via `app.route("/v1", agentEvents)` AFTER `bearerAuth` is mounted (line 135 area) and AFTER `metricsMiddleware` (line 157).
- **DB:** `src/db/schema.ts` adds `agentEvents = pgTable("agent_events", ...)`; new migration file in `src/db/migrations/`. Migration applied on app boot via existing `src/db/migrate.ts`.
- **Test runner:** Existing test setup in `node:test` runner; Phase 121's two test files (mirror in `cross-user-isolation.test.ts` + dedicated `agent-events.test.ts`) use the same `process.env["JWT_SECRET"] = "..."` + `process.env["VIGIL_ALLOWED_EMAILS"] = "..."` boot-block as the existing isolation file.
- **Future hooks:** `client_event_id` column reserved for Phase 122 daemon retry path; `agent_events` table itself is the source for Phase 124's WebSocket fan-out (Phase 124 will add a deliveries-tracking layer if needed).

</code_context>

<specifics>
## Specific Ideas

- **W-01/W-02 lock pattern is sacred.** The user explicitly chose to add isolation `it()` blocks to the canonical `cross-user-isolation.test.ts` file rather than only a per-feature dedicated file. The reason: future phases that audit "is this endpoint cross-user-safe?" must have ONE file to grep for the answer. Per-feature dedicated files are fine in addition, but the canonical file is the load-bearing audit lock.
- **Idempotency is non-negotiable AND extends the spec by one field.** The spec's verbatim 7-field payload contract is "wrong" in the sense that it doesn't address retry safety; without `client_event_id`, vigil-watch's 100-event offline queue can produce duplicate rows on a network blip during flush. Phase 121 EXTENDS the spec contract by exactly one field (`client_event_id`, required UUID). Phase 122 must consume this contract.
- **Recommendations were taken in every gray area.** All 4 areas had a "(Recommended)" option chosen, with the user explicitly asking "your thoughts?" on D-A4 and accepting the recommendation to add `client_event_id` only. Downstream agents should treat the recommendations as authoritative.

</specifics>

<deferred>
## Deferred Ideas

- **Cursor pagination on `GET /v1/agent-sessions`:** Hard cap of 100 sessions chosen for now. Add when somebody actually hits it (probably never).
- **Server-generated UUID fallback for `client_event_id`:** Considered and rejected — would lose retry safety. If a future client truly cannot generate UUIDs, add via separate phase with explicit non-idempotent semantics.
- **`raw_payload JSONB` column for forensics:** Considered and rejected — JSONL is source of truth, schema drift caught by CHECK constraint + zod validation. Add only if a real forensic need arises.
- **`delivered_at` column for fan-out state:** Reserving columns is cheaper than reserving wrong shapes. Phase 124 may want `agent_event_deliveries` (per-subscriber state), not a single timestamp on the parent row. Phase 124 designs the right shape.
- **WebSocket fan-out (`agent-event` on `/v1/agent-stream`):** Out of scope for Phase 121. Phase 124's responsibility (AGENT-API-03).
- **Bearer-source-proof as a separate `it()` block:** Folded into block 1 of D-D2 ("POST cannot insert with userB's userId" already tests this). Adding a 4th block was deemed redundant.

### Reviewed Todos (not folded)

None — `gsd-sdk query todo.match-phase 121` yielded no matches; this phase has no carry-over todos to fold.

</deferred>

---

*Phase: 121-agent-events-api-foundation-cross-user-isolation-lock*
*Context gathered: 2026-05-08*
