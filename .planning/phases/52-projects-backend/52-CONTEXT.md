# Phase 52: Projects Backend - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 52 (interactive)

<domain>
## Phase Boundary

Backend-only phase. Deliver:
1. A `projects` table in PostgreSQL via a new Drizzle migration
2. Full CRUD REST API under `/projects` mounted in vigil-core (Hono router pattern, bearer auth, same conventions as `/thoughts`)
3. A nullable `project_id` foreign key column on the existing `thoughts` table (separate migration step, safe to add)
4. Existing `category="project"` thoughts must remain queryable and unchanged — no data mutation in the migration

**Out of scope (Phase 53):** dashboard project view, manual assignment UI, status filters, project picker on the thought card. Those depend on this API existing.

</domain>

<decisions>
## Implementation Decisions

### D-01: Projects table fields
**Locked:** name + status + description + timestamps. No color, no sortOrder.

- `id serial primary key`
- `name text not null`
- `description text` (nullable — free-text "what is this project about" memory aid)
- `status text` (nullable — see D-02 for vocabulary)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()` (mirror existing `modified_at` convention from `thoughts`)

Skip color/sortOrder — Phase 53 can add them via migration if the dashboard actually needs them. Lean schema first.

### D-02: Status column constraint
**Locked:** Free text, no DB constraint.

- `status text` with no CHECK constraint and no PostgreSQL ENUM type.
- App layer documents valid values: `active`, `archived`, `done` (from PROJ-05).
- Validation lives in the route handler: reject `POST`/`PATCH` requests with status outside the known set, return `400 { error: "status must be one of: active, archived, done" }`.
- Mirrors how `thoughts.category` is handled today (free text + app-layer validation in `VALID_CATEGORIES`).
- Why: easiest to evolve when Phase 53+ wants to add or rename status values — no migration required, just code change.

### D-03: Foreign key delete behavior
**Locked:** `ON DELETE SET NULL`.

- Migration adds `project_id integer` to `thoughts` with `references(() => projects.id, { onDelete: "set null" })`.
- Deleting a project (DELETE /projects/:id) sets `project_id = null` on its thoughts. Thoughts are preserved; their `category` is untouched.
- User reassigns orphaned thoughts later via Phase 53 UI.
- Rejected: RESTRICT (too much friction — every delete is a two-step dance) and CASCADE (data loss risk).

### D-04: Existing "project"-category thoughts
**Locked:** Migration does NOT touch existing data.

- The thoughts migration only adds the nullable `project_id` column. Default is NULL for all existing rows.
- Existing thoughts with `category="project"` keep `category="project"` and `project_id=null`.
- They remain accessible via the existing `GET /thoughts?category=project` query.
- User assigns them to named projects manually in Phase 53.
- Why: zero risk to existing data, no naming decision foisted on the user, satisfies PROJ-06 verbatim ("remain accessible and can be retroactively assigned").

### D-05: CRUD endpoint surface
**Locked by existing pattern** ([vigil-core/src/routes/thoughts.ts](vigil-core/src/routes/thoughts.ts)):

- `POST   /projects` — create. Body: `{ name, description?, status? }`. Returns created project.
- `GET    /projects` — list. No pagination (project counts will stay in the tens, not thousands). Returns plain array.
- `GET    /projects/:id` — fetch one. 404 if not found.
- `PATCH  /projects/:id` — partial update. Any of `name`, `description`, `status`. Updates `updated_at`.
- `DELETE /projects/:id` — hard delete. Returns 204. Cascade SET NULL handles orphaned thoughts.

All endpoints behind the existing bearer auth middleware (same as `/thoughts`).

### D-06: Validation rules
**Locked:**

- `name`: required, non-empty after trim, max 200 chars (arbitrary sane cap; matches no existing convention but `thoughts.content` is unbounded so this is a new policy specific to projects)
- `description`: optional, max 2000 chars
- `status`: optional, must be one of `active | archived | done` if present
- All other fields rejected (no extra-field smuggling)
- 400 on validation failure with `{ error: "<specific message>" }`

### D-07: Response shape
**Locked by existing pattern:**

- Dedicated `toResponse(row: DrizzleProject): ProjectApiResponse` mapper
- Dates as ISO 8601 strings (`row.createdAt.toISOString()`)
- Null fields stay null in JSON
- No computed fields (no `thoughtCount`) — Phase 53 can join if needed

### D-08: Migration strategy
**Locked by existing tooling:**

- Two separate migrations, generated via `npx drizzle-kit generate`:
  - `0003_*_projects_table.sql` — creates `projects` table only
  - `0004_*_thoughts_project_id.sql` — adds nullable `project_id` FK column to `thoughts`
- Apply via `npx drizzle-kit push` (or whatever the project's standard apply path is — planner confirms by reading existing migration scripts)
- Both migrations must be reversible / safe to re-run on a populated database

### Claude's Discretion

- Exact Drizzle column helper choices and indexing (the planner picks indexes based on query patterns the routes need — at minimum an index on `thoughts.project_id` for the inevitable `GET /thoughts?projectId=X` lookup in Phase 53)
- TypeScript interface naming and file organization (follow existing `db/types.ts` + `routes/*.ts` split)
- Whether to add `GET /thoughts?projectId=X` query support in this phase or defer to Phase 53 — recommend deferring; Phase 52 is strictly the projects CRUD + the FK column
- Test approach (project has no `Tests/` directory currently — follow existing convention of compile + manual curl smoke test)
- Error message wording

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema and DB conventions
- `vigil-core/src/db/schema.ts` — Drizzle table definitions, column helpers, index/unique patterns
- `vigil-core/src/db/types.ts` — `DrizzleThought`, `PaginatedResponse` patterns to mirror
- `vigil-core/src/db/connection.ts` — db client setup (and the `if (!db) return 503` pattern routes use)
- `vigil-core/drizzle/0000_*.sql` through `0002_*.sql` — examples of generated migrations to study
- `vigil-core/drizzle.config.ts` — drizzle-kit config (schema path, dialect, output dir)

### Route patterns
- `vigil-core/src/routes/thoughts.ts` — gold-standard reference. Follow its: `toResponse` mapper, validation style, error response shape, query parameter handling, db-availability check
- `vigil-core/src/routes/health.ts` — minimal route example (good for understanding the Hono mount pattern)
- Wherever routes are mounted in `vigil-core/src/index.ts` or equivalent — planner adds the `/projects` mount here

### Auth
- `vigil-core/src/middleware/` — bearer auth middleware that wraps protected routes. Apply identically to projects router

### Roadmap and requirements
- `.planning/ROADMAP.md` Phase 52 section — goal and 4 success criteria
- `.planning/REQUIREMENTS.md` PROJ-01, PROJ-06, PROJ-07 — the requirements this phase satisfies
- `.planning/REQUIREMENTS.md` PROJ-02..PROJ-05 — for context on what Phase 53 will need from this API (don't build for Phase 53, but don't paint into a corner either)

</canonical_refs>

<specifics>
## Specific Ideas

- The thoughts table has a `tsvector` generated column added via raw migration SQL. The new `project_id` migration must not break that column (it shouldn't — adding a column is orthogonal — but the planner should verify by reading the existing migration that introduced the tsvector).
- Railway deployment is wired (per memory) — schema migrations run automatically? Planner should confirm whether `npx drizzle-kit push` runs in CI/Railway or only locally, and document the deployment step explicitly in the plan.
- The mac client (`Sources/`) currently has no concept of projects. This phase does not touch mac client code. Phase 53+ adds project assignment UI to the mac dashboard.

</specifics>

<deferred>
## Deferred Ideas

**Captured for the roadmap backlog — do NOT implement in Phase 52:**

- **Per-project color** — defer to Phase 53 if the dashboard UI needs it. Adds one nullable `color text` column then.
- **Per-project sort order** — defer until the user sees the project list and decides ordering matters.
- **`GET /thoughts?projectId=X` filter** — defer to Phase 53 (where the dashboard project view actually needs it). Phase 52 is strictly projects CRUD + the FK column.
- **`thoughtCount` computed field on project responses** — defer to Phase 53. Adds a join cost; only worth it once a UI consumes it.
- **Soft delete (delete = set status="archived")** — explicitly rejected. DELETE /projects/:id is a hard delete; archiving via PATCH status is a separate concern.
- **Project name uniqueness constraint** — not asked for. Free-form names. If duplicates become a usability problem, add a unique index in a later phase.
- **Bulk operations (POST /projects/bulk, etc.)** — out of scope. Single-resource CRUD only.

</deferred>

---

*Phase: 52-projects-backend*
*Context gathered: 2026-04-08 via interactive /gsd-discuss-phase*
