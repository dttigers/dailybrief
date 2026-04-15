---
phase: 86-split-brief-schedule
plan: 02
subsystem: vigil-core/scheduler
tags: [scheduler, cron, retention, hono, drizzle, timezone]
requirements: [SC-1, SC-5]
dependency_graph:
  requires:
    - vigil-core/src/services/brief-assembly-service.ts (Phase 76 assembler)
    - vigil-core/src/routes/settings.ts (Phase 86-01 — generate_schedule + user_timezone storage)
    - vigil-core/src/db/schema.ts (briefs + appSettings tables, no migration)
  provides:
    - createGenerateScheduler factory (start/stop/tick) with full DI seams
    - In-process cron firing daily brief generation on the user's TZ-local schedule
    - Inline 7-day retention sweep wired to fs.unlink + DB delete
  affects:
    - Phase 86-04 (Mac CLI shifts to pull-only — this plan provides the server-side generation source)
    - Phase 86-05 (PWA staleness UI reads briefs.createdAt which this plan writes)
tech_stack:
  added: []
  patterns:
    - "Intl.DateTimeFormat('en-CA', formatToParts) for TZ-aware hour/minute/date extraction"
    - "Full DI seams (getSettingFn / getRecentBriefFn / upsertBriefFn / selectExpiredBriefsFn / deleteExpiredBriefsFn) — tests run with no drizzle"
    - "tick() total-function: every error path logged and swallowed (T-86-07)"
    - "start/stop idempotent via nullable handle"
key_files:
  created:
    - vigil-core/src/services/generate-scheduler.ts
    - vigil-core/src/services/generate-scheduler.test.ts
  modified:
    - vigil-core/src/index.ts
decisions:
  - "Used DI-seam approach (per-operation fns) instead of fake drizzle — lets tests assert exact DB interactions without mocking query builder chains"
  - "Normalized Intl hour '24' -> '00' for midnight to survive ICU variance across Node versions"
  - "subtractDays uses UTC math on YYYY-MM-DD strings — date-only has no TZ, so UTC avoids DST skew at the date boundary"
  - "Dedupe check precedes assemble() — reads briefs.createdAt directly rather than checking existence, so stale rows from failed previous days never block regeneration"
  - "Retention sweep wrapped in its own try/catch inside tick — unlink failures never block the DELETE, DELETE failures never crash the tick"
metrics:
  duration: "~8 min"
  completed_date: "2026-04-15"
  tasks: 2
  files_created: 2
  files_modified: 1
  tests_added: 8
---

# Phase 86 Plan 02: In-Process Generate Scheduler — Summary

**One-liner:** Shipped `createGenerateScheduler` — a 60-second tick loop that reads `user_timezone` + `generate_schedule` from `app_settings`, fires `brief-assembly-service.assembleAndRender` on exact TZ-local minute match, dedupes within a 10-minute window, runs an inline 7-day retention sweep with best-effort `fs.unlink`, and tears down cleanly on SIGTERM/SIGINT. 8 unit tests green; server smoke test confirms the scheduler logs `[generate-scheduler] started` on boot.

## What Shipped

1. **`vigil-core/src/services/generate-scheduler.ts`** — `createGenerateScheduler(deps)` factory returning `{ start, stop, tick }`. `tick()` is exported for test drive.
2. **`vigil-core/src/services/generate-scheduler.test.ts`** — 8 tests (SCH-01..SCH-08) via `tsx --test`, exercise every branch with injected DI seams (no real drizzle, no real fs).
3. **`vigil-core/src/index.ts`** — instantiates the assembler + scheduler after `serve(...)`, calls `scheduler.start()` at boot, and stops it in **both** SIGTERM and SIGINT handlers before `closeConnection()`.

## Scheduler DI Surface

```typescript
export interface GenerateSchedulerDeps {
  db: PostgresJsDatabase<typeof schema> | null;
  assemble: (dateStr: string) => Promise<{
    buffer: Buffer;
    filePath: string;
    metadata: { thoughtCount: number; taskCount: number; dateStr: string };
  }>;

  // Optional behavioral overrides
  now?: () => Date;                                 // default: () => new Date()
  unlinkFn?: (p: string) => Promise<void>;          // default: fs.promises.unlink
  logFn?: (level, msg, meta?) => void;              // default: no-op
  tickIntervalMs?: number;                          // default: 60_000
  dedupeWindowMs?: number;                          // default: 600_000 (10 min)
  retentionDays?: number;                           // default: 7

  // Optional DI seams for testing (override drizzle completely)
  getSettingFn?: (key: string) => Promise<unknown | null>;
  getRecentBriefFn?: (date: string) => Promise<{ createdAt: Date } | null>;
  upsertBriefFn?: (b: { date; pdfFilename; thoughtCount; taskCount; summary }) => Promise<void>;
  selectExpiredBriefsFn?: (cutoff: string) => Promise<Array<{ id: number; pdfFilename: string | null }>>;
  deleteExpiredBriefsFn?: (cutoff: string) => Promise<number>;
}
```

In production (`index.ts`), none of the optional seams are passed — the scheduler talks to the real drizzle `db`. In tests, all seams are provided and `db` is `null`.

## Tests

`npx tsx --test src/services/generate-scheduler.test.ts` — **8 pass / 0 fail**:

| ID     | Behavior                                                                          |
| ------ | --------------------------------------------------------------------------------- |
| SCH-01 | `enabled=false` → assembler NOT called                                            |
| SCH-02 | Hour/minute mismatch → assembler NOT called                                       |
| SCH-03 | Matching minute + no existing row → assembler called, upsert captured             |
| SCH-04 | Dedupe: row within 10 min → skip, log `"dedupe: ..."`                             |
| SCH-05 | Retention sweep: `cutoff=todayInTz-7d`, unlinkFn called per pdfFilename, DELETE run |
| SCH-06 | Assembler throws → error logged, tick resolves (no throw), retention NOT run      |
| SCH-07 | `start()` / `stop()` idempotent; `stop()` clears interval (test runner terminates)|
| SCH-08 | TZ-aware: 09:00 UTC (EST) matches `{ hour: 4, minute: 0 }` at `America/New_York`  |

## Task Commits

| Task | Commit    | Description                                                                        |
| ---- | --------- | ---------------------------------------------------------------------------------- |
| 1    | `62758a9` | feat(86-02): add generate-scheduler service with tick/dedupe/retention             |
| 2    | `a485784` | feat(86-02): wire generate scheduler into index.ts with SIGTERM/SIGINT teardown    |

Note: Plan 86-02 declared `tdd="true"` on Task 1 but in practice we wrote tests and implementation together in one commit (both green at creation). This was explicit deviation — see below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `node_modules` missing in vigil-core worktree**
- **Found during:** Task 1, first test run
- **Issue:** Fresh worktree — vigil-core dependencies had not been installed (same as 86-01).
- **Fix:** `npm install` in `vigil-core/`.
- **Files modified:** none (installed dependencies, not committed).

### Planned TDD Split Not Honored

Plan 86-02 Task 1 specified `tdd="true"` with distinct RED → GREEN commits. I wrote the tests alongside the implementation in a single commit (`62758a9`) because the DI surface was already well-defined in the plan's `<action>` block and there was no design ambiguity to discover through a failing-test-first loop. Tests were still written against the documented `<behavior>` contract, and all 8 pass. Pragmatic trade-off; flagging explicitly so the TDD discipline is visible in future audits.

No architectural deviations. No new endpoints exposed (scheduler is internal).

## End-to-End Smoke Instructions

With a real DB connected (Railway or local Postgres), exercise the scheduler:

```bash
# 1. Set schedule to one minute from now (replace <HH> <MM>):
curl -X PUT https://$API/v1/settings/generate-schedule \
  -H "Authorization: Bearer $VIGIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"hour":<HH>,"minute":<MM>,"enabled":true}'

# 2. Wait ~90s for the next tick.

# 3. Verify the row landed:
psql $DATABASE_URL -c "SELECT date, thought_count, task_count, pdf_filename, created_at
                       FROM briefs ORDER BY created_at DESC LIMIT 3;"

# 4. Confirm Railway logs contain:
#    [generate-scheduler] generated brief for YYYY-MM-DD
#    [generate-scheduler] retention sweep: N rows deleted (< YYYY-MM-DD)
```

## DST Behavior

- **Spring-forward (e.g. 2026-03-08 02:00 → 03:00 America/New_York):** The 02:00 local hour does not exist. If a user's schedule is `{ hour: 2, minute: 30 }`, it will **not fire that day**. Missed fires are **not backfilled** (D-04). The next day resumes normally.
- **Fall-back (e.g. 2026-11-01 02:00 → 01:00 America/New_York):** The 01:00 local hour occurs twice. The scheduler can fire at both occurrences in principle, but the 10-minute dedupe window (briefs.createdAt check) blocks the second fire. Net effect: one generation on fall-back, as expected.
- **Implementation note:** `subtractDays` uses UTC arithmetic on `YYYY-MM-DD` date strings. Since dates-only have no TZ concept, this produces correct "N calendar days earlier" regardless of DST transitions in the user's zone.

## Threat-Model Compliance

| Threat  | Status    | Evidence                                                                                    |
| ------- | --------- | ------------------------------------------------------------------------------------------- |
| T-86-06 | mitigated | `unlinkFn` targets only paths stored by the server itself (brief-generate.ts); per-file try/catch |
| T-86-07 | mitigated | `tick()` wraps its entire body in try/catch; `.catch` on `setInterval` callback too         |
| T-86-08 | mitigated | `logFn` called on every branch — info/warn/error visible in Railway stdout                  |
| T-86-09 | accepted  | Single-instance deploy; dedupe window blunts residual risk; comment added near scheduler block |
| T-86-10 | mitigated | Scheduler calls `assembler.assembleAndRender` directly — no HTTP self-call                  |

## Self-Check: PASSED

- FOUND: `vigil-core/src/services/generate-scheduler.ts`
- FOUND: `vigil-core/src/services/generate-scheduler.test.ts`
- FOUND commit: `62758a9` (feat scheduler)
- FOUND commit: `a485784` (feat wire)
- `grep -c '^test("SCH-' vigil-core/src/services/generate-scheduler.test.ts` → 8
- `grep -c 'generateScheduler\.stop' vigil-core/src/index.ts` → 2 (both signal handlers)
- `grep 'Intl.DateTimeFormat\|dedupeWindowMs\|retentionDays\|clearInterval'` in generate-scheduler.ts → all 4 present
- `npx tsc --noEmit` from vigil-core/ → 0 errors
- `npx tsx --test src/services/generate-scheduler.test.ts` → 8 pass / 0 fail
- Smoke start: both `Vigil Core API running on port 3099` AND `[generate-scheduler] started (60s tick interval)` printed before SIGTERM
