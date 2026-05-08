# Phase 121: Agent-events API foundation + cross-user isolation lock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 121-agent-events-api-foundation-cross-user-isolation-lock
**Areas discussed:** agent_events schema shape, GET /v1/agent-sessions definition + response shape, Idempotency / replay protection, Cross-user isolation test layout

---

## Area 1: `agent_events` schema shape

### Q1.1: Two timestamps or one?

| Option | Description | Selected |
|--------|-------------|----------|
| Two timestamps | `event_timestamp` from daemon + `received_at` DB insert. Standard observability — debug clock skew, retry latency. | ✓ |
| One timestamp (event only) | Trust daemon's timestamp; loses retry-storm forensics. | |
| One timestamp (DB only) | DB is source-of-truth, daemon best-effort; loses event-ordering precision. | |

**User's choice:** Two timestamps (Recommended).
**Notes:** Standard hygiene; ~16 bytes per row is acceptable for the observability gain.

### Q1.2: Event column constraint

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres native enum | `CREATE TYPE agent_event_kind AS ENUM (...)`. Strict, smallest. | |
| Text + CHECK constraint | Same correctness as enum; editable in single non-locking migration; matches Drizzle conventions. | ✓ |
| Text only, validate at app | Just `text NOT NULL`; app-layer validation. | |

**User's choice:** Text + CHECK constraint (Recommended).
**Notes:** No PG enums currently used in `vigil-core/src/db/schema.ts` — staying with the existing pattern.

### Q1.3: Index strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Composite (userId, sessionId, eventTimestamp DESC) + idx_userId | Serves both GET sessions query and timeline queries. 2 indexes. | ✓ |
| Three single-column indexes | PG bitmap-scan combination; slower for canonical query. | |
| Just userId, defer composite | YAGNI; accept perf risk and migrate later. | |

**User's choice:** Composite + idx_userId (Recommended).
**Notes:** "currently-tracked sessions" query needs ordering; composite is the right shape.

### Q1.4: Extra columns

| Option | Description | Selected |
|--------|-------------|----------|
| client_event_id only (recommended after Claude's analysis) | Reserves idempotency option; nullable; partial unique index. | ✓ |
| All three (client_event_id + raw_payload + delivered_at) | Maximum future-proof; bloats every row. | |
| None — strict YAGNI | Migrate when needed. | |

**User's choice:** Asked "your thoughts?", then accepted Claude's recommendation.
**Notes:** Claude recommended `client_event_id` only. Rationale: idempotency strategy is the next gray area, and reserving the column now is essentially free; `raw_payload` duplicates JSONL source-of-truth; `delivered_at` may not match Phase 124's chosen fan-out shape (could need a separate `agent_event_deliveries` table). User accepted.

---

## Area 2: `GET /v1/agent-sessions` definition + response shape

### Q2.1: "Currently-tracked" definition

| Option | Description | Selected |
|--------|-------------|----------|
| Sliding window: last N hours, configurable via `?since=` | Bounded result set; matches daily-rhythm mental model. | ✓ |
| Non-terminal: last event ≠ task_complete/failed | Risks unbounded result set without window. | |
| All sessions, paginated | HUD owns filtering; loses Phase 121 ownership. | |
| Non-terminal AND sliding window | Strictest; may feel empty when sessions go quiet. | |

**User's choice:** Sliding window (Recommended), default 24h.
**Notes:** The `?since=` parameter gives clients flexibility without baking a fixed window into the API.

### Q2.2: Response row shape

| Option | Description | Selected |
|--------|-------------|----------|
| Flat list, last event embedded as nested object | Single round-trip; matches G2 3-line HUD layout. | ✓ |
| Flat list, last event flattened | Simpler JSON; couples HUD field names to API. | |
| Grouped by `label` | Project-grouped nesting; not needed for current single-user HUD. | |
| Two endpoints (list + per-session detail) | Doubles round-trips. | |

**User's choice:** Flat list, last event embedded (Recommended).
**Notes:** `{session_id, label, host, last_event: {event, message, event_timestamp}, event_count}`.

### Q2.3: Sort order

| Option | Description | Selected |
|--------|-------------|----------|
| Most-recent-event first (DESC last_event.event_timestamp) | Standard "recents" UX. | ✓ |
| Most-recent-FIRST-event-in-window first | Stable across reloads. | |
| Priority-weighted: needs_input first | Bakes display logic into API. | |

**User's choice:** DESC last_event.event_timestamp (Recommended).
**Notes:** HUD priority logic stays in the client (Phase 124).

### Q2.4: Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| Hard cap at 100 sessions, no pagination | Sliding window + single-user reality. | ✓ |
| Cursor pagination from day 1 | Forward-compat; complexity not yet warranted. | |
| No cap, no pagination | Worst case ~30 sessions today. | |

**User's choice:** Hard cap 100, no pagination (Recommended).

---

## Area 3: Idempotency / replay protection

### Q3.1: Dedupe strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Client-supplied UUID (client_event_id) | Daemon controls "same event"; column reserved D-A4. | ✓ |
| Server-side natural-key dedupe | (userId, session_id, event, event_timestamp); no daemon coordination. | |
| Accept duplicates | Daemon source-of-truth; complexity to consumers. | |
| Both: prefer UUID, fall back to natural key | Belt-and-suspenders; most code. | |

**User's choice:** client_event_id UUID (Recommended).
**Notes:** Pairs with the column reserved in Area 1.

### Q3.2: Response on duplicate

| Option | Description | Selected |
|--------|-------------|----------|
| 200 OK with existing row | Idempotent semantics; daemon advances offset confidently. | ✓ |
| 201 Created on first, 200 OK on dup | Distinguishes via status; daemon must handle both paths. | |
| 409 Conflict | Conflates idempotency with semantic conflict; fragile. | |

**User's choice:** 200 OK with existing row (Recommended).

### Q3.3: client_event_id required or optional?

| Option | Description | Selected |
|--------|-------------|----------|
| Required (400 if missing) | Forces correct daemon behavior from day one. | ✓ |
| Optional, no dedupe when absent | Permissive for curl; bug path possible. | |
| Optional, server generates UUID when absent | Loses retry safety. | |

**User's choice:** Required (Recommended).
**Notes:** Phase 122's daemon will generate UUIDv4 per event before queueing.

---

## Area 4: Cross-user isolation test layout

### Q4.1: Test file layout

| Option | Description | Selected |
|--------|-------------|----------|
| Both: mirror in cross-user-isolation.test.ts + dedicated agent-events.test.ts | Canonical lock file + per-feature unit tests. | ✓ |
| Only canonical file | File grows long; unit concerns leak in. | |
| Only dedicated agent-isolation.test.ts | Canonical-file pattern weakens. | |
| Just regular agent-events.test.ts | Loses load-bearing single-file lock. | |

**User's choice:** Both (Recommended).
**Notes:** The canonical file remains the load-bearing audit lock per Phase 108 precedent.

### Q4.2: What the canonical-file lock-test it() blocks must cover (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| POST: userA's POST cannot insert with userB's userId (also defends against body.userId tampering) | Pins D-21 (route never trusts body). | ✓ |
| GET: userA's GET never returns userB's sessions | Pins D-22 (route-level WHERE userId=...). | ✓ |
| Dedupe scope: userA + userB can share client_event_id | Pins composite-uniqueness invariant. | ✓ |
| Bearer-source proof: API ignores body.userId field | Folded into block 1 above. | |

**User's choice:** First three; bearer-source-proof folded into block 1.
**Notes:** Three lock-test blocks total in cross-user-isolation.test.ts.

---

## Claude's Discretion

The user did not explicitly defer any decision; all 4 gray areas had a recommendation chosen. Items left to Claude's discretion (per CONTEXT.md):

- POST response shape: 201 Created on first insert, 200 OK on idempotent dup. Body shape consistent across both.
- Validation strictness: zod `.strict()` mode. Reject unknown fields with 400.
- Drizzle types: generate via `InferSelectModel`/`InferInsertModel`.
- Migration filename: `nnnn_add_agent_events.sql` per existing sequence.
- Route file: `src/routes/agent-events.ts`, registered in `src/index.ts` after `bearerAuth` and `metricsMiddleware`.
- Error response shape: `{ error: "<short-code>", message: "..." }` matching existing routes.

## Deferred Ideas

- Cursor pagination on `GET /v1/agent-sessions` — defer until somebody hits the 100-session cap.
- Server-generated UUID fallback for `client_event_id` — rejected; would lose retry safety. Add via separate phase only if a real client cannot generate UUIDs.
- `raw_payload JSONB` column for forensics — JSONL is source of truth; CHECK + zod catches drift. Defer.
- `delivered_at` column for fan-out state — Phase 124 designs the right shape; reserving wrong shape is worse than reserving nothing.
- WebSocket fan-out (`agent-event` on `/v1/agent-stream`) — Phase 124 (AGENT-API-03), out of scope here.
- Bearer-source-proof as separate `it()` block — folded into POST block 1; not a distinct test.
