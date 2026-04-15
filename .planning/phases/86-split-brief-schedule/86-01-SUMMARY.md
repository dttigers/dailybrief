---
phase: 86-split-brief-schedule
plan: 01
subsystem: vigil-core/settings
tags: [hono, drizzle, settings, timezone, generate-schedule, tdd]
requirements: [SC-2]
dependency_graph:
  requires:
    - vigil-core/src/routes/settings.ts (Phase 83-01 DI factory)
    - vigil-core/src/db/schema.ts appSettings table (no migration needed)
  provides:
    - GET/PUT /v1/settings/generate-schedule (server cron config source)
    - GET/PUT /v1/settings/timezone (user TZ for cron local-time math)
    - isValidSchedule() shared validator
    - isValidTimezone() Intl round-trip validator
  affects:
    - Phase 86-02 (generate cron reads generate-schedule + user_timezone)
    - Phase 86-03 (PWA Settings UI consumes all three settings endpoint pairs)
tech_stack:
  added: []
  patterns:
    - "Hono DI factory with optional per-resource db fns (mirrors print-schedule from 83-01)"
    - "Shared validator extraction reused across PUT handlers"
    - "Intl.DateTimeFormat round-trip for IANA timezone validation"
key_files:
  created: []
  modified:
    - vigil-core/src/routes/settings.ts
    - vigil-core/src/routes/settings.test.ts
decisions:
  - "Reused PrintSchedule type for generate-schedule (identical shape, D-06)"
  - "Separate per-resource DI fns (dbGetFn / dbGetGenerateFn / dbGetTimezoneFn) instead of generic helper — matches existing style exactly"
  - "Extracted isValidSchedule() and refactored print-schedule PUT to use it (DRY + guarantees parity)"
  - "Empty string caught by length check before Intl.DateTimeFormat call (empty string does not throw on some engines)"
metrics:
  duration: "~6 min"
  completed_date: "2026-04-15"
  tasks: 2
  files_modified: 2
  tests_added: 10  # 6 GS + 4 TZ
---

# Phase 86 Plan 01: Server Settings Endpoints + Timezone Validation — Summary

**One-liner:** Added `/v1/settings/generate-schedule` and `/v1/settings/timezone` endpoint pairs to the existing `createSettingsRouter` factory — extracted a shared `isValidSchedule` validator, added `Intl.DateTimeFormat` round-trip timezone validation, and delivered 16 passing unit tests on `tsx --test`.

## What Shipped

Extended `vigil-core/src/routes/settings.ts` (Phase 83-01 factory) with two new endpoint pairs:

1. **`GET/PUT /v1/settings/generate-schedule`** — same shape as print-schedule (`{ hour, minute, enabled }`), default `{ hour: 4, minute: 0, enabled: true }`, storage key `generate_schedule` in existing `app_settings` table.
2. **`GET/PUT /v1/settings/timezone`** — plain IANA string wrapped in `{ timezone }` for GET response; default `"America/New_York"`; storage key `user_timezone`.

Both PUT handlers reject invalid input with 400 and do not call the upsert fn.

## Exported Signatures

```typescript
export interface PrintSchedule {
  hour: number;   // 0-23
  minute: number; // 0-59
  enabled: boolean;
}

export interface SettingsDeps {
  // print schedule (existing)
  dbGetFn?: () => Promise<PrintSchedule | null>;
  dbUpsertFn?: (s: PrintSchedule) => Promise<void>;
  // generate schedule (new)
  dbGetGenerateFn?: () => Promise<PrintSchedule | null>;
  dbUpsertGenerateFn?: (s: PrintSchedule) => Promise<void>;
  // timezone (new)
  dbGetTimezoneFn?: () => Promise<string | null>;
  dbUpsertTimezoneFn?: (tz: string) => Promise<void>;
}

export function createSettingsRouter(deps?: SettingsDeps): Hono;
export const settings: Hono;  // singleton still exported and mounted via index.ts
```

## Storage Keys (app_settings table)

| Key                 | Value shape                         | Default                    |
| ------------------- | ----------------------------------- | -------------------------- |
| `print_schedule`    | `{ hour, minute, enabled }` (jsonb) | `{ 6, 0, true }` (untouched) |
| `generate_schedule` | `{ hour, minute, enabled }` (jsonb) | `{ 4, 0, true }` (new)     |
| `user_timezone`     | plain IANA string (jsonb string)    | `"America/New_York"` (new) |

No schema migration required.

## Tests

16 tests via `tsx --test src/routes/settings.test.ts` — all pass:

- **PS-01..PS-06** (6) — print-schedule, unchanged behavior verified after validator refactor
- **GS-01..GS-06** (6) — generate-schedule mirror of PS tests + dbUpsertGenerateFn capture assertion
- **TZ-01..TZ-04** (4) — timezone default, round-trip, invalid IANA rejection, empty-string rejection

## Task Commits

| Task | Name                                                           | Commit    |
| ---- | -------------------------------------------------------------- | --------- |
| RED  | Add failing tests for generate-schedule and timezone           | `fd7169b` |
| 1    | Add generate-schedule endpoints + shared schedule validator    | `37db64e` |
| 2    | Add timezone GET/PUT endpoints with Intl round-trip validation | `8f80461` |

Note: The RED commit contains the full GS + TZ test suite up-front (true TDD red), then Tasks 1 and 2 each went green in order. TSC + all 16 tests pass at the final commit.

## Deviations from Plan

**1. [Rule 1 — Bug] TypeScript narrowing of `stored` in GS-02 test**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** TS narrowed `stored` to `never` after `assert.ok(stored !== null)` because the assertion is opaque to the compiler; direct `stored!.hour` access failed type-check at build.
- **Fix:** Extracted `const captured = stored as { hour, minute, enabled }` after the runtime assertion; used `captured.*` for subsequent field access.
- **Files modified:** `vigil-core/src/routes/settings.test.ts` (GS-02 block)
- **Commit:** rolled into `37db64e`

**2. [Rule 3 — Blocking] `node_modules` missing in vigil-core worktree**
- **Found during:** Initial test run (ERR_MODULE_NOT_FOUND for 'hono')
- **Issue:** Fresh worktree — vigil-core dependencies had not been installed.
- **Fix:** `npm install` in `vigil-core/`.
- **Files modified:** none (installed dependencies, not committed to tree)

No architectural deviations. `index.ts` required no edits — the `settings` singleton export already mounts the new routes.

## Self-Check: PASSED

- FOUND: `vigil-core/src/routes/settings.ts`
- FOUND: `vigil-core/src/routes/settings.test.ts`
- FOUND commit: `fd7169b` (test RED)
- FOUND commit: `37db64e` (feat generate-schedule)
- FOUND commit: `8f80461` (feat timezone)
- `grep -c "^test(" vigil-core/src/routes/settings.test.ts` → 16 (matches expected: 6 PS + 6 GS + 4 TZ)
- `grep -n "generate-schedule" vigil-core/src/routes/settings.ts` → 4 route lines present
- `grep -n "settings/timezone" vigil-core/src/routes/settings.ts` → 2 route lines present
- `grep -n "Intl.DateTimeFormat" vigil-core/src/routes/settings.ts` → validator present
- `grep -n "isValidSchedule" vigil-core/src/routes/settings.ts` → shared validator present, used by both print and generate PUT
- `npx tsc --noEmit` → clean
- `npx tsx --test src/routes/settings.test.ts` → 16 pass / 0 fail
