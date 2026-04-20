---
phase: 105-product-events-api-metrics-user-identity
plan: 02
subsystem: observability
tags: [posthog, analytics, middleware, hono, api-metrics, product-events]

# Dependency graph
requires:
  - phase: 105-product-events-api-metrics-user-identity
    plan: 01
    provides: "trackEvent with BLOCKED_PROPERTY_NAMES guard, identifyUser wrapper"
provides:
  - "metricsMiddleware (Hono MiddlewareHandler) + createMetricsMiddleware factory + statusClass helper"
  - "5 product events wired server-side: thought_created, photo_uploaded, triage_completed, brief_generated, chat_sent"
  - "1 API metrics event: api_request on every authenticated request"
affects: [105-03-user-identity, any future PostHog dashboard consuming these events]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dep-injection factory pattern (createMetricsMiddleware(trackFn?)) mirrors createProcessPhotoRouter / createMeRouter — tests use a spy, production uses the real wrapper"
    - "status_class enum bucketing via Math.floor(status/100) with defensive '5xx' fallback for <1 or >=600"
    - "await next() timing pattern — performance.now() before/after captures full downstream stack latency"
    - "Bounded primitive property shapes at every call site — defense-in-depth paired with Plan 01's runtime denylist"

key-files:
  created:
    - "vigil-core/src/middleware/metrics.ts"
    - "vigil-core/src/middleware/metrics.test.ts"
  modified:
    - "vigil-core/src/index.ts"
    - "vigil-core/src/routes/thoughts.ts"
    - "vigil-core/src/routes/process-photo.ts"
    - "vigil-core/src/routes/brief-generate.ts"
    - "vigil-core/src/routes/chat.ts"

key-decisions:
  - "metricsMiddleware skips emission when userId is missing (D-05 — no anonymous metrics). Defensive-only because the dispatcher short-circuits public routes before this mw runs."
  - "trackEvent call sites are synchronous (fire-and-forget at the wrapper) — no await added, so no new failure modes on the response path."
  - "brief_generated restructured the briefId capture: `let briefId: number | null = null` hoisted outside the transaction so the ID survives past the await boundary and lands in the event payload."
  - "triage_completed emits ONLY inside outcome.status === 'fulfilled' AFTER dbUpdateTriageFn succeeds — failed triages (rejected Promise OR DB update throw) emit captureException only, never triage_completed (D-15)."
  - "metrics middleware mounted AFTER googleAuth route (line 113 was, 115 now) and BEFORE summary (line 125) — guarantees c.var.userId is populated because bearerAuth dispatcher (line 105) has already run for non-public paths."

patterns-established:
  - "Dep-injection seam on middleware factories — trackFn defaults to real trackEvent but tests pass a spy to assert call shape without SDK involvement"
  - "Every product-event call site follows bounded-property shape: enums (paper_type, category, source, model), booleans (has_*, was_*, context_used), numbers (counts, confidence, duration_ms), never user content"

requirements-completed: [ANLY-02, ANLY-03]

# Metrics
duration: 4m 7s
completed: 2026-04-20
---

# Phase 105 Plan 02: API Metrics Middleware + Capture-Funnel Events Summary

**Per-route API metrics + five product events now land in PostHog via Plan 01's guarded trackEvent — `api_request` on every authenticated request, plus `thought_created`, `photo_uploaded`, `triage_completed`, `brief_generated`, `chat_sent` at their documented success points, all with bounded primitive property shapes.**

## Performance

- **Duration:** 4m 7s
- **Started:** 2026-04-20T02:16:32Z
- **Completed:** 2026-04-20T02:20:39Z
- **Tasks:** 2
- **Files created:** 2 (`metrics.ts`, `metrics.test.ts`)
- **Files modified:** 5 (`index.ts` + 4 route files)

## Accomplishments

- **Task 1 — metricsMiddleware:** Created `vigil-core/src/middleware/metrics.ts` with 3 exports: `statusClass` (HTTP status bucket helper), `createMetricsMiddleware(trackFn?)` (factory with DI seam), and `metricsMiddleware` (production singleton). Times every authenticated request with `performance.now()` around `await next()`, emits `api_request` via Plan 01 trackEvent with 5 bounded props: `{ route, method, status, duration_ms, status_class }`. Wraps the emit in try/catch so analytics failures never propagate to route handlers. Defensive `userId == null` skip (D-05 — no anonymous metrics).
- **Task 1 — tests:** 11 tests across 2 describe blocks. `statusClass` enum derivation (6 tests: 200, 201, 301, 404, 500, 0/negative fallback). `metricsMiddleware` emission contract (5 tests: one-event-per-request, full D-08 property shape, 4xx/5xx status_class, missing-userId skip, primitive-only properties). Tests use the DI factory with a push-to-array spy instead of SDK mocking.
- **Task 1 — index.ts wiring:** Added import after `rate-limit.ts` import, registered `app.use("/v1/*", metricsMiddleware)` between `app.route("/v1", googleAuth)` (line 113) and `app.route("/v1", summary)` (now line 125). Ordering verified: bearerAuth dispatcher line 105 → metricsMiddleware line 122 → first protected route line 125.
- **Task 2 — 5 trackEvent call sites** wired verbatim to the plan's locked shapes (see "Capture-Funnel Call Sites" section below). All synchronous fire-and-forget. All after DB writes. All bounded primitives. Zero denylist-name collisions.

## Task Commits

Each task was committed atomically:

1. **Task 1 — metricsMiddleware + tests + index.ts wiring** — `874676f` (feat)
2. **Task 2 — Wire trackEvent into 5 capture-funnel call sites** — `719f064` (feat)

_TDD note: Task 1 was TDD. Task 1 RED confirmed via `npx tsx --test src/middleware/metrics.test.ts` returning `ERR_MODULE_NOT_FOUND` for `./metrics.js` before `metrics.ts` existed (the module-level `await import` fails, so the whole file fails before any test runs — this is the Wave-0 RED-by-default idiom). GREEN: all 11 tests pass after writing metrics.ts. Committed as a single `feat` (test + implementation land together per Phase 103/104 established pattern). Task 2 was purely additive observability — no new tests needed; existing route tests (63/63 passing excluding DATABASE_URL-gated skips) serve as the regression gate._

## Capture-Funnel Call Sites

Exact property shapes landed verbatim from the plan action block:

### `metrics.ts` → `api_request`

| Property       | Type    | Value source                       |
| -------------- | ------- | ---------------------------------- |
| `route`        | string  | `c.req.path`                       |
| `method`       | string  | `c.req.method`                     |
| `status`       | number  | `c.res.status`                     |
| `duration_ms`  | number  | `Math.round(performance.now() diff)` |
| `status_class` | enum    | `'1xx' | '2xx' | '3xx' | '4xx' | '5xx'` |

### `routes/thoughts.ts` line 308 → `thought_created`

| Property                  | Type    | Value source                                  |
| ------------------------- | ------- | --------------------------------------------- |
| `source`                  | enum    | `created.source` (`'text' | 'voice' | 'image'`) |
| `has_category`            | boolean | `category != null`                            |
| `fire_and_forget_triage`  | boolean | `!category && getAIClient() != null`          |

Emits AFTER the DB insert returns, BEFORE the fire-and-forget triage block so every created thought produces an event (D-15: "thought_created always emits when a thought row is inserted").

### `routes/process-photo.ts` line 471 → `photo_uploaded`

| Property            | Type    | Value source                                 |
| ------------------- | ------- | -------------------------------------------- |
| `paper_type`        | enum    | `transformed.paperType` (`'lined' | 'gridded' | 'unknown'`) |
| `vision_confidence` | number  | `transformed.confidence` ([0,1])            |
| `thought_count`     | number  | `insertedRows.length`                        |
| `force_paper_type`  | enum    | `forcePaperType ?? 'none'`                   |
| `media_type`        | enum    | `claudeMediaType` (post-HEIC conversion target) |
| `was_heic`          | boolean | `mediaType === 'image/heic' || 'image/heif'` |

Emits ONCE per successful POST, immediately after the batched insert. BEFORE per-thought triage — so a successful upload always emits this even if every triage fails.

### `routes/process-photo.ts` line 498 → `triage_completed`

| Property                      | Type    | Value source                             |
| ----------------------------- | ------- | ---------------------------------------- |
| `category`                    | enum    | `t.category`                             |
| `confidence`                  | number  | `t.confidence`                           |
| `has_tags`                    | boolean | `(t.tags?.length ?? 0) > 0`              |
| `has_therapy_classification`  | boolean | `t.therapyClassification != null`        |
| `batch_size`                  | number  | `insertedRows.length`                    |

Emits ONLY inside `outcome.status === "fulfilled"` branch AFTER `dbUpdateTriageFn` succeeds. Rejected Promise branch emits `captureException` only. DB-update-throw branch emits `captureException` only. Strictly "triage-succeeded AND persisted" semantics (D-15).

### `routes/brief-generate.ts` line 110 → `brief_generated`

| Property        | Type    | Value source                  |
| --------------- | ------- | ----------------------------- |
| `source`        | enum    | `'manual'` (literal — HTTP route) |
| `date`          | string  | `dateStr` (YYYY-MM-DD)        |
| `brief_id`      | number  | `briefId` (captured inside tx, read outside) |
| `thought_count` | number  | `metadata.thoughtCount`       |
| `task_count`    | number  | `metadata.taskCount`          |

Required restructure: `let briefId: number | null = null;` hoisted outside the `db.transaction` closure so the insert ID survives past the await boundary. Event emits AFTER `await db.transaction(...)` resolves, BEFORE the `return new Response(...)` — so failed transactions emit nothing.

### `routes/chat.ts` line 111 → `chat_sent`

| Property                      | Type    | Value source                          |
| ----------------------------- | ------- | ------------------------------------- |
| `conversation_length`         | number  | `messages.length`                     |
| `context_used`                | number  | `contextUsed`                         |
| `include_context_requested`   | boolean | `includeContext`                      |
| `model`                       | enum    | `'claude'` (literal — SDK abstracts model name) |

Emits AFTER `callClaudeConversation` returns successfully, BEFORE `c.json({ response, contextUsed })`. Failed calls hit `catch (err)` and emit nothing (app.onError captures exception).

## BLOCKED_PROPERTY_NAMES Collision Check

`grep -rE 'trackEvent\(.*\b(content|body|text|message|description|title|note|transcript)\b' vigil-core/src/routes/ vigil-core/src/middleware/` → **zero matches**.

None of the 6 emit call sites uses any denylisted property name. The Plan 01 runtime guard is the safety net; this plan's discipline at the call site is the primary defense.

## Denylist Candidates for v3.6

From the plan's threat register (T-105-11, T-105-12):

- **`messages`** — not currently in denylist. If an event ever emits a user chat transcript under this property name, it would leak. **Candidate for v3.6 denylist addition.**
- **`response`** — same. Used nowhere in Phase 105, but tempting future property name for AI-return events. **Candidate for v3.6.**
- **`summary`** — same risk for brief-summary events. Used nowhere in Phase 105 shapes (we use `source/date/brief_id/*_count`), but low-cost to add. **Candidate for v3.6.**
- **`prompt`** / **`system`** — chat/Claude-adjacent. **Candidates for v3.6.**

Action: if any of these are observed firing `posthog_property_blocked` in PostHog Cloud, add them. Otherwise defer as a code-review-enforced invariant.

## Decisions Made

See frontmatter `key-decisions`. All 5 decisions were pre-locked by the plan's `<behavior>` blocks and CONTEXT.md §D-05..D-15. No drift from the plan's literal action text.

## Deviations from Plan

None — plan executed exactly as written. All 3 edits in Task 1 (new `metrics.ts`, new `metrics.test.ts`, `index.ts` import + `app.use`) and all 4 edits in Task 2 (thoughts/process-photo/brief-generate/chat) landed verbatim against the action-block code. The `briefId` hoist in brief-generate.ts was specified by the plan and implemented as documented.

## Verification

**Unit tests (scoped — touches posthog + metrics + auth + routes):**

```
$ cd vigil-core && npx tsx --test src/middleware/metrics.test.ts \
    src/middleware/auth.test.ts src/analytics/posthog.test.ts
ℹ tests 41   ℹ pass 38   ℹ fail 0   ℹ skipped 3   ℹ duration_ms 1034

$ cd vigil-core && npx tsx --test src/routes/thoughts.test.ts \
    src/routes/process-photo.test.ts src/routes/brief-generate.test.ts
ℹ tests 68   ℹ pass 63   ℹ fail 0   ℹ skipped 5   ℹ duration_ms 1312
```

Skipped tests are all DATABASE_URL-gated (same condition as Plan 01's note). No regressions in any modified route.

**TypeScript:** `cd vigil-core && npx tsc --noEmit` → zero errors.

**Acceptance greps (Task 1):**

- `grep -c "export const metricsMiddleware"` = 1 ✔
- `grep -c "export function createMetricsMiddleware"` = 1 ✔
- `grep -c "export function statusClass"` = 1 ✔
- `grep -c 'trackFn(userId, "api_request"'` = 1 ✔
- `grep -c "performance.now"` = 3 (≥2 required) ✔
- `grep -c 'import { metricsMiddleware }'` in index.ts = 1 ✔
- `grep -c 'app.use("/v1/\*", metricsMiddleware)'` in index.ts = 1 ✔
- Ordering: bearerAuth (line 105) < metricsMiddleware (line 122) < summary (line 125) ✔

**Acceptance greps (Task 2):**

- `grep -c 'trackEvent(userId, "thought_created"'` in thoughts.ts = 1 ✔
- `grep -c 'trackEvent(userId, "photo_uploaded"'` in process-photo.ts = 1 ✔
- `grep -c 'trackEvent(userId, "triage_completed"'` in process-photo.ts = 1 ✔
- `grep -c 'trackEvent(userId, "brief_generated"'` in brief-generate.ts = 1 ✔
- `grep -c 'trackEvent(userId, "chat_sent"'` in chat.ts = 1 ✔
- `triage_completed` emission preceded by `await deps.dbUpdateTriageFn(...)` (read lines 493-498) ✔
- `grep -E 'trackEvent\(.*\b(content|body|text|...)\b'` across routes + middleware = 0 matches ✔

**Plan-level verification:**

- 6 trackEvent call sites total (1 in metrics.ts as `trackFn`, 5 in routes) ✔
- 5 files import trackEvent from posthog.js (metrics.ts, thoughts.ts, process-photo.ts, brief-generate.ts, chat.ts) ✔
- Middleware ordering passes: bearerAuth dispatcher < metricsMiddleware register < first protected app.route ✔
- Zero BLOCKED_PROPERTY_NAMES collisions ✔

## Issues Encountered

None for Plan 02. The DATABASE_URL-gated skips noted in Plan 01's summary persist (5 skips in route tests, 1 in auth test) — pre-existing environment condition, not a plan regression, documented already for deferred-items consideration. Out of scope for this plan.

## Known Stubs

None. Grep of new/modified files for `TODO|FIXME|placeholder|not available|coming soon` returns zero hits. Every event wired is functionally complete — the PostHog SDK in Plan 01's wrapper is the integration point; the data flows end-to-end as soon as POSTHOG_API_KEY is set.

## Next Phase Readiness

- **Plan 03 (/v1/me identifyUser)** can proceed independently (different file: `routes/me.ts`). Nothing in this plan conflicts with Plan 03's wiring.
- **PostHog Cloud verification** (user-facing) requires a live request against Railway with `POSTHOG_API_KEY` set. The 6 events should appear within 10s (SDK flushInterval) of the next authenticated request.
- **ROADMAP SC#2** (per-route API metrics with status_class + latency) is structurally closed — awaiting Plan 03 + user's PostHog dashboard verification for SC#1 (person attribution).
- **ROADMAP SC#4** (no user-generated string content) is enforced at TWO layers: Plan 01's runtime denylist AND this plan's call-site discipline. Defense-in-depth.
- No blockers carried forward from this plan.

## Self-Check: PASSED

- `vigil-core/src/middleware/metrics.ts` — FOUND (new, 84 lines)
- `vigil-core/src/middleware/metrics.test.ts` — FOUND (new, 101 lines)
- `vigil-core/src/index.ts` — MODIFIED (import + app.use lines verified by grep)
- `vigil-core/src/routes/thoughts.ts` — MODIFIED (trackEvent at line 308)
- `vigil-core/src/routes/process-photo.ts` — MODIFIED (trackEvent at lines 471, 498)
- `vigil-core/src/routes/brief-generate.ts` — MODIFIED (trackEvent at line 110)
- `vigil-core/src/routes/chat.ts` — MODIFIED (trackEvent at line 111)
- Commit `874676f` — FOUND (`feat(105-02): add metricsMiddleware + ANLY-03 per-route API metrics`)
- Commit `719f064` — FOUND (`feat(105-02): wire trackEvent into 5 capture-funnel call sites (ANLY-02)`)
- 11 metrics tests passing + 19 posthog tests preserved + 63 route tests passing under shim path
- TypeScript clean (tsc --noEmit returns zero errors)

---
*Phase: 105-product-events-api-metrics-user-identity*
*Completed: 2026-04-20*
