---
phase: 52-projects-backend
plan: 02
status: complete
completed: 2026-04-08
requirements:
  - PROJ-01
  - PROJ-07
---

# Plan 52-02 Summary — Projects CRUD Router

## What was built

A new Hono router at `vigil-core/src/routes/projects.ts` (225 lines) exposing 5 CRUD endpoints under `/v1/projects/*`, mounted in `index.ts` behind the existing `/v1/*` bearer-auth middleware.

### key-files
- **created**:
  - `vigil-core/src/routes/projects.ts` (225 lines)
- **modified**:
  - `vigil-core/src/index.ts` (+2 lines: import + `app.route("/v1", projects)`)

### Endpoints

| Method | Path | Status | Notes |
|--------|------|--------|-------|
| GET    | `/v1/projects`        | 200 | Returns plain JSON array (no pagination wrapper, per CONTEXT D-05) |
| GET    | `/v1/projects/:id`    | 200 / 404 / 400 | 400 on non-numeric id |
| POST   | `/v1/projects`        | 201 / 400 | Body: `{name, description?, status?}` |
| PATCH  | `/v1/projects/:id`    | 200 / 404 / 400 | Partial update; bumps `updated_at` |
| DELETE | `/v1/projects/:id`    | 204 / 404 | Hard delete; FK ON DELETE SET NULL nulls `thoughts.project_id` |

### Validation rules (per CONTEXT D-06)
- `name`: required, non-empty string after trim, ≤ 200 chars
- `description`: optional string, ≤ 2000 chars
- `status`: optional, must be one of `["active", "archived", "done"]`
- Extra fields: silently dropped (mass-assignment defense — explicit destructure on POST, explicit allowlist on PATCH)
- `id` path param: coerced via `Number()`, returns 400 on `NaN`

## Smoke test results

Smoke tests run against a one-off `node dist/index.js` instance on port 3098 with `DATABASE_URL=DATABASE_PUBLIC_URL` (Railway proxy: `hopper.proxy.rlwy.net:22526`). The launchd-managed local server on 3001 has no DATABASE_URL by design; production deploys to Railway.

```
=== 4a. no token ===                              → 401 ✓
=== 4b. list (auth) ===                           → 200 [] ✓
=== 4c. POST create ===                           → 201 {"id":1,"name":"Smoke Test 52-02",...,"status":"active"} ✓
=== 4d. GET one ===                               → 200 same shape ✓
=== 4e. list now contains it ===                  → 200 array of 1 ✓
=== 4f. PATCH status=done ===                     → 200 status=done, updatedAt > createdAt ✓
=== 4g. POST {} (missing name) ===                → 400 ✓
=== 4h. POST status="bogus" ===                   → 400 ✓
=== 4i. POST name=201 chars ===                   → 400 ✓
=== 4i2. POST description=2001 chars ===          → 400 ✓
=== 4i3. POST {name,ownership,admin} ===          → 201, extras dropped (id:2 created with null status) ✓
=== 4j. DELETE id=1 ===                           → 204 ✓
=== 4k. GET deleted id=1 ===                      → 404 ✓
=== 4k2. GET id=notanumber ===                    → 400 ✓
```

### FK cascade (Plan 52-01 + Plan 52-02 end-to-end)

Direct verification via node + `postgres` lib (psql not installed locally):

```
Created project id=4
Target thought id=77, current project_id=null
BEFORE delete: thought 77 project_id=4
DELETE status: 204
AFTER delete:  thought 77 project_id=null (NULL: true) — row preserved ✓
Final projects count: 0
```

The `ON DELETE SET NULL` constraint defined in Plan 52-01 nulled `thoughts.project_id` automatically when the parent project was hard-deleted via the API. Thought row preserved.

### PROJ-06 regression check

```
GET /v1/thoughts?category=project&limit=5
→ 200 {"data":[{"id":49,"category":"project",...},{"id":39,"category":"project",...},...]}
```

Existing `category='project'` thoughts (4 baseline rows confirmed in Plan 52-01) continue to be returned by the existing thoughts route. No regression.

## Compile / verify

- `cd vigil-core && npm run build` → tsc exits 0, clean
- `grep -c 'app.route("/v1", projects)' vigil-core/src/index.ts` → 1
- `grep -c 'export const projects' vigil-core/src/routes/projects.ts` → 1
- All 5 acceptance criteria handlers contain `if (!db) return c.json({ error: "Database not available" }, 503)` (5/5 occurrences)

## Threat mitigations (from PLAN threat model)

| ID | Status |
|----|--------|
| T-52-06 (auth bypass)        | ✓ Verified — no-token request returns 401 (smoke test 4a) |
| T-52-07 (mass assignment)    | ✓ Verified — extra fields `ownership`/`admin` silently dropped (smoke test 4i3) |
| T-52-08 (SQL injection)      | ✓ Drizzle parameterized builders only; `id` path coerced via `Number()` and rejected on NaN (smoke test 4k2) |
| T-52-09 (oversized payloads) | ✓ NAME_MAX=200, DESCRIPTION_MAX=2000 enforced before DB call (smoke tests 4i, 4i2) |
| T-52-10 (info disclosure)    | ✓ Generic error responses; details only in `console.error` |
| T-52-11 (DELETE cascade DoS) | accepted — single-user tool, idx_thoughts_project_id keeps cascade O(matching) |
| T-52-12 (per-user authZ)     | accepted (documented) — single-user, no `owner_id` column. See Phase 53+ extension below |
| T-52-13 (DELETE repudiation) | accepted — hard delete, no audit log per D-03 |

## Phase 53+ extension points

- **Per-project ownership**: add `owner_id integer references api_keys(id)` + `WHERE owner_id = current_user_key_id` on every query when multi-user lands
- **Filter thoughts by project**: add `?projectId=X` query param to `/v1/thoughts` (no schema change needed — the FK column already exists from Plan 52-01)
- **Computed `thoughtCount`**: extend `toResponse` to JOIN+count `thoughts WHERE project_id = projects.id` for the dashboard list view
- **Soft delete**: if Phase 53 needs an "Archive" affordance distinct from `status='archived'`, add `deleted_at timestamptz` and a WHERE filter
- **CloudKit sync**: not needed — projects are server-side only per CONTEXT D-04. If iOS surfaces the projects list, it talks to the API directly, no Core Data mirror

## Requirements delivered

- **PROJ-01** — Projects CRUD API ✓
- **PROJ-07** — Bearer auth on all `/v1/projects/*` ✓ (inherited from existing `/v1/*` middleware)

Combined with Plan 52-01 (PROJ-06 baseline + PROJ-07 schema FK), the full phase 52 requirement set `[PROJ-01, PROJ-06, PROJ-07]` is delivered.

## Notes / deviations

- The Plan PATCH validation block originally used `VALID_STATUSES.includes(body.status)` directly; TypeScript flagged the const tuple type narrowing, so the implementation extracted `isValidStatus()` as a type guard. Functionally identical, satisfies the tsc strict flag.
- Smoke testing was done via a one-off `PORT=3098 node dist/index.js` instance with `DATABASE_URL` set to Railway's `DATABASE_PUBLIC_URL` (proxy host). The persistent launchd-managed local server on port 3001 has no DATABASE_URL — by design, since the desktop app talks to Railway production directly. This is consistent with the project_railway_deploy memory.
- The leftover `id:2` project from the mass-assignment test was cleaned up via DELETE before the FK cascade test. Final `SELECT COUNT(*) FROM projects` = 0 — DB is clean.
