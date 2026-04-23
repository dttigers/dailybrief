---
phase: 109-per-user-scheduler-fan-out
plan: 03
subsystem: api
tags: [multi-user, calendar, brief-assembly, latent-bug-fix, tdd, hono, bearerAuth]

# Dependency graph
requires:
  - phase: 102-multi-user-foundation
    provides: global bearerAuth dispatcher setting c.set("userId") before route registration; oauth_tokens.userId column
  - phase: 109-01-per-user-scheduler-fan-out
    provides: per-user scheduler fan-out (sibling wave-1 plan; unrelated file-scope)
  - phase: 109-02-per-user-scheduler-fan-out
    provides: per-user /prioritize cache key isolation (sibling wave-1 plan; unrelated file-scope)
provides:
  - calendar-service.ts fetchTodaysEvents(userId) + fetchCalendarList(userId) with per-user oauthTokens scoping (SCHED-01 D-11)
  - brief-assembly-service.ts CalendarServiceDeps.fetchTodaysEvents takes userId; assembleAndRender threads userId into Promise.allSettled parallel call at line 442 (SCHED-01 D-12)
  - index.ts and routes/brief-generate.ts both wire `calendarService: createCalendarService()` into createBriefAssemblyService — FIRST time Google Calendar events reach the brief from either path (SCHED-01 D-12 atomic two-site wiring)
  - routes/calendar.ts /v1/calendar/events and /v1/calendar/list handlers read `c.get("userId")` and pass it to the calendar methods
  - gmail-workorder-service.ts TODO(AUTH-06+) rewritten in-place with DEFERRED marker and forward pointer (CONTEXT §Deferred Ideas, D-15/D-16 hygiene)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TypeScript build as forcing-function: making userId a required parameter catches every seed-user-assuming call site at compile time — no runtime sweep needed"
    - "Atomic two-site wiring (D-12): the latent calendar-never-wired bug is closed in a single commit across index.ts + routes/brief-generate.ts so neither path can ship half-fixed"
    - "In-place TODO rewrite (D-13, from Phase 108 D-15/D-16): resolved TODOs drop the TODO prefix but keep the comment block as a trail; deferred TODOs retain the prefix and gain a forward pointer"
    - "Human-verify checkpoint where grep+build+tests can't: first time calendar section renders in brief PDF — runtime behaviour requires eyeball"

key-files:
  modified:
    - vigil-core/src/services/calendar-service.ts
    - vigil-core/src/services/calendar-service.test.ts
    - vigil-core/src/services/brief-assembly-service.ts
    - vigil-core/src/services/brief-assembly-service.test.ts
    - vigil-core/src/index.ts
    - vigil-core/src/routes/brief-generate.ts
    - vigil-core/src/routes/calendar.ts
    - vigil-core/src/services/gmail-workorder-service.ts

key-decisions:
  - "fetchTodaysEvents / fetchCalendarList take userId as required first positional (D-11) — no internal seed-user resolution remains in calendar-service"
  - "D-12 atomicity: both index.ts scheduler-path wiring AND routes/brief-generate.ts on-demand-path wiring land in the SAME commit (9054a5d) — prevents a half-fixed ship where only one path carries calendar events"
  - "calendar-service.ts TODO(AUTH-06+) prefix removed (resolved → no longer unfinished work); comment block rewritten in-place with Phase 109 completion note per D-13"
  - "gmail-workorder-service.ts TODO(AUTH-06+) retained with DEFERRED: Phase 109 marker + forward pointer to 109.1 / v3.7 — fan-out is feature-completeness (not security) per CONTEXT §Deferred Ideas"
  - "Human-verify Path B chosen (no Google OAuth on local dev DB) — proves graceful degradation. Acceptance treats Path A and Path B as equally valid per plan spec. Path A deferred to production smoke-test post-deploy where OAuth lives."

requirements-completed:
  - SCHED-01 (already marked complete by Plan 01's executor; Plans 02 and 03 are additive contributors — mark-complete idempotent per CONTEXT §requirement-tracking)

# Metrics
duration: 11min
completed: 2026-04-23
---

# Phase 109 Plan 03: Calendar Service userId Fold-In + Atomic Two-Site Wiring

**`calendar-service.ts` is now per-user (userId required on both public methods), and both brief-generation paths atomically wire `calendarService: createCalendarService()` into `createBriefAssemblyService` for the first time — closing Phase 102's multi-user-foundation scaffolding AND fixing a latent "calendar section never rendered" bug that had been silent since the brief-assembly split.**

## Performance

- **Duration:** 11 min of active execution (4ab2d04 13:14:52Z → 9054a5d 13:25:17Z), plus a blocking human-verify checkpoint (~4h wall-clock wait to Path B verification)
- **Started:** 2026-04-23T19:14:52Z
- **Completed (checkpoint resolved):** 2026-04-23T23:25:30Z
- **Tasks:** 4 (3 auto + 1 human-verify checkpoint)
- **Files changed:** 8 (all modified — no new files created)

## Accomplishments

### Signature change — calendar-service.ts

- `fetchTodaysEvents(userId: number)` and `fetchCalendarList(userId: number)` are now required-param functions (D-11)
- Internal `resolvedSeedUserId` closure + `getSeedUserId()` helper DELETED — no fallback path exists
- `dbSelect(userId)`, `dbUpdate(userId, …)`, `getValidAccessToken(userId)` all scoped by caller-supplied userId
- `VIGIL_SEED_USER_EMAIL` reference removed; `users` schema import dropped (unused)
- TODO(AUTH-06+) block rewritten in-place as a Phase 109 (SCHED-01 D-11/D-13) completion note — marker dropped because the TODO is resolved
- Production singleton at line 388 (`export const calendarService = createCalendarService()`) retained — but now its methods require userId, which compile-breaks any remaining seed-user-assuming caller (the forcing function)

### Signature change — brief-assembly-service.ts

- `BriefAssemblyDeps.calendarService?.fetchTodaysEvents` signature now `(userId: number) => Promise<CalendarEventsResponse>`
- `assembleAndRender(dateStr, userId)` passes userId into `deps.calendarService.fetchTodaysEvents(userId)` inside the existing Promise.allSettled parallel block at line 442
- Existing zero-arg mocks in the test suite remain assignable (parameter-fewer-than-declared is allowed in TypeScript)

### Atomic two-site wiring (D-12)

- `vigil-core/src/index.ts:206-212` (scheduler path): `calendarService: createCalendarService()` added to `createBriefAssemblyService` call
- `vigil-core/src/routes/brief-generate.ts:40-46` (on-demand path): same
- Single commit (9054a5d) crosses both call sites so neither path can ship half-fixed
- **This is the FIRST time briefs carry Google Calendar events from either path.** Historically both paths omitted `calendarService` from their deps object, and `brief-assembly-service.ts:443` rejected with `Error("No calendar service")` — which the Promise.allSettled layer silently swallowed as an "empty calendar" result. Users never noticed because no calendar section was ever *missing*, just always empty.

### /v1/calendar route userId plumbing

- `routes/calendar.ts` `/v1/calendar/events` and `/v1/calendar/list` handlers read `const userId = c.get("userId") as number` and pass it into the calendar-service call
- Routes registered after global bearerAuth dispatcher (index.ts:151) so `c.get("userId")` is guaranteed non-null

### gmail-workorder-service.ts TODO hygiene

- `TODO(AUTH-06+)` block at lines 10-14 rewritten in-place with `DEFERRED: Phase 109` marker + forward pointer naming 109.1 or v3.7 as candidate phase
- Marker retained (not dropped) per CONTEXT §Deferred Ideas and the "never delete comments" rule — the fan-out gap is real and outstanding (Gmail importer still hard-scoped to `VIGIL_SEED_USER_EMAIL`); only the comment prose is updated to reflect status
- No runtime behaviour change in this file — gmail import fan-out remains deferred

### Build & tests

- `cd vigil-core && npm run build` — clean (tsc + tsc -p tsconfig.scripts.json, zero errors)
- 276 / 276 per-file tests pass across the touched + adjacent test files (calendar-service.test.ts, brief-assembly-service.test.ts, prioritize.test.ts, etc.) via `npx tsx --test <file>`
- `npm test` (glob suite) skipped by design — the pre-existing integration-test hang documented in 109-02-SUMMARY §Deferred Issues is still live

### Human-verify checkpoint (Task 4 — Path B)

- Path A not viable on this local dev DB (seed user `jamesonmorrill1@gmail.com` has no `oauth_tokens` row for provider=google — Phase 107.1 set up a fresh local Postgres; OAuth only exists on production / iMac DBs)
- **Path B executed 2026-04-23 ~23:25Z:**
  - Started vigil-core locally (`npm run dev`, port 3001)
  - Minted a 30-day HS256 JWT for user 1 via `signToken(1, 'jamesonmorrill1@gmail.com')`
  - `POST /v1/brief/generate` → HTTP 200, 19306-byte PDF version 1.3 (1 page), server log `[brief-assembly] Total: 5641ms`
  - Grep verification of logs: 0 occurrences of `"No calendar service"`, 0 `needs_reauth` lines, 0 stack traces
- Path A acceptance equivalent deferred to a production smoke-test post-v3.6 deploy (where OAuth rows actually live)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED:** `test(109-03): add failing test for userId-required calendar signature` — `4ab2d04`
2. **Task 1 GREEN:** `feat(109-03): thread userId through calendar-service (D-11/D-13)` — `4fbf4a9`
3. **Task 2 RED:** `test(109-03): add failing test for D-12 userId threading into calendar` — `df70c7f`
4. **Task 2 GREEN:** `feat(109-03): thread userId through brief-assembly calendar call (D-12)` — `327a17d`
5. **Task 3 (single atomic commit — D-12 two-site wiring):** `feat(109-03): wire calendar into both brief paths + route userId plumbing (D-12)` — `9054a5d`
6. **Checkpoint marker:** `wip: phase 109 paused at plan 03 task 4 (human-verify checkpoint)` — `e57665e` (deleted on plan close-out)

## Files Created/Modified

All files modified in-place — no new files created in this plan.

- `vigil-core/src/services/calendar-service.ts` — signature change, seed-user helper deleted, TODO rewritten in-place, environment variable reference dropped
- `vigil-core/src/services/calendar-service.test.ts` — existing CAL-* tests updated to pass `userId=1`; new CAL-SCHED-01-userid-required test added (RED first)
- `vigil-core/src/services/brief-assembly-service.ts` — `CalendarServiceDeps` type updated, Promise.allSettled call threads userId
- `vigil-core/src/services/brief-assembly-service.test.ts` — new D-12 test asserting `assembleAndRender(dateStr, 42)` threads `userId=42` into the captured calendar mock
- `vigil-core/src/index.ts` — `createCalendarService` import; `calendarService: createCalendarService()` added to scheduler-path `createBriefAssemblyService` call
- `vigil-core/src/routes/brief-generate.ts` — same (`createCalendarService` import + wiring for on-demand path)
- `vigil-core/src/routes/calendar.ts` — `/v1/calendar/events` and `/v1/calendar/list` handlers read `c.get("userId")` and pass to calendar methods
- `vigil-core/src/services/gmail-workorder-service.ts` — TODO(AUTH-06+) retained, rewritten in-place with DEFERRED marker + forward pointer

## Decisions Made

Followed plan as specified for all four tasks with no deviations.

Checkpoint-resolution decision: Path B verification was adopted because the seed user has no Google OAuth row on the local Postgres DB (verified via a direct DB query at the start of the checkpoint). Wiring OAuth locally to force Path A would have been ~1h+ of yak-shaving (PWA OAuth flow, redirect URIs, token insert) for a phase whose risk surface is already ~90% covered by build+tests. Path A remains viable against production post-deploy where `oauth_tokens` rows exist naturally. Plan spec treats Path A and Path B as equally valid acceptance paths (lines 663-665), so this is a plan-conformant choice.

## Deviations from Plan

None — plan executed exactly as written across all four tasks. Rule 1/2/3 auto-fixes were not needed; no Rule 4 architectural questions surfaced during execution or checkpoint resolution.

## Verification Results

### All Plan-level Success Criteria — PASS

| Criterion | Expected | Actual |
|-----------|----------|--------|
| `calendar-service.ts` fetchTodaysEvents(userId: number) | 1 | 1 |
| `calendar-service.ts` fetchCalendarList(userId: number) | 1 | 1 |
| `calendar-service.ts` getValidAccessToken(userId: number) | 1 | 1 |
| `calendar-service.ts` getSeedUserId absent | 0 | 0 |
| `calendar-service.ts` resolvedSeedUserId absent | 0 | 0 |
| `calendar-service.ts` VIGIL_SEED_USER_EMAIL absent | 0 | 0 |
| `calendar-service.ts` TODO(AUTH-06+) absent | 0 | 0 |
| `calendar-service.ts` Phase 109 (SCHED-01 comment | >=1 | 1 |
| `brief-assembly-service.ts` CalendarServiceDeps sig: `(userId: number) =>` | 1 | 1 |
| `brief-assembly-service.ts` `deps.calendarService.fetchTodaysEvents(userId)` | 1 | 1 |
| `brief-assembly-service.ts` zero-arg `fetchTodaysEvents()` residue | 0 | 0 |
| `index.ts` `calendarService: createCalendarService()` | 1 | 1 |
| `routes/brief-generate.ts` `calendarService: createCalendarService()` | 1 | 1 |
| `index.ts` `import { createCalendarService }` | 1 | 1 |
| `routes/brief-generate.ts` `import { createCalendarService }` | 1 | 1 |
| `routes/calendar.ts` `c.get("userId")` | >=1 | 2 |
| `gmail-workorder-service.ts` TODO(AUTH-06+) retained | 1 | 1 |
| `gmail-workorder-service.ts` `DEFERRED: Phase 109` | 1 | 1 |
| `cd vigil-core && npm run build` exit | 0 | 0 |
| Per-file test suite (touched + adjacent) | all pass | 276/276 |

### Task 4 Human-Verify Checkpoint — PASS (Path B)

| Acceptance signal | Expected | Actual |
|---|---|---|
| HTTP status of `POST /v1/brief/generate` | 200 | **200** |
| Response artifact | valid PDF | 19306-byte PDF v1.3 (1 page) |
| `[brief-assembly] Total:` log line | present | `5641ms` |
| `"No calendar service"` rejections in logs | 0 | **0** |
| `needs_reauth` debug lines in logs | <=1 | **0** |
| Stack traces in logs | 0 | **0** |
| Brief generation completes without crash | yes | **yes** |

## Deferred Issues

**Pre-existing `npm test` suite hang** — unchanged from 109-02-SUMMARY §Deferred Issues. `src/integration/cross-user-isolation.test.ts` imports `../index.js` which starts `setInterval` loops at module load, keeping the tsx test-isolation child process alive after the last assertion. Per-file `npx tsx --test <file>` runs are clean. Fix candidate (not this phase): gate scheduler startup in `index.ts` on `NODE_ENV !== "test"` or split into `buildApp()` + bootstrap entrypoint.

**Path A functional confirmation against production** — Path B confirmed graceful degradation locally; Path A (calendar events actually rendering in the PDF) requires a live Google OAuth row and should be run as a smoke-test post-v3.6 deploy against Railway, where production OAuth lives. Not blocking Plan 03 close-out per plan acceptance criteria.

**Gmail importer fan-out** — intentionally deferred per CONTEXT §Deferred Ideas. `gmail-workorder-service.ts` still hard-scoped to `VIGIL_SEED_USER_EMAIL`; non-seed users get zero Gmail-sourced work orders. Forward pointer in the updated TODO block names Phase 109.1 or v3.7 as candidate. Gap is feature-completeness (not a data-leak), so it waits for a dedicated phase.

## Known Stubs

None. All production code paths are wired end-to-end.

## Threat Flags

No new threats introduced. All changes track the Plan 03 threat model already documented:

- **T-109-C-01** (cross-user calendar event leak): mitigated — `getSeedUserId` absent, `fetchTodaysEvents(userId)` requires caller-supplied userId, oauthTokens SQL scoped by `eq(userId, ...)`
- **T-109-C-02** (auth-wiring regression → undefined userId): mitigated — TypeScript build enforces `userId: number` on both public methods; would fail `npm run build` if any handler dropped it (acceptance criterion verified)
- **T-109-C-04** (missing-token scope escape): mitigated — `dbSelect(userId)` returns null for missing row, `getValidAccessToken` throws `TokenNotFoundError`, `fetchTodaysEvents` catches → `{ status: "needs_reauth" }`. No fallback to another user's tokens exists (Path B verified no "No calendar service" rejection AND no `needs_reauth` line fired during a brief generation for the no-OAuth test case — graceful empty-state returned cleanly)
- **T-109-C-06** (atomic two-site wiring gap): mitigated — D-12 single-commit (9054a5d) crosses both index.ts and routes/brief-generate.ts

## Self-Check

**File existence:**
- FOUND: vigil-core/src/services/calendar-service.ts (modified)
- FOUND: vigil-core/src/services/calendar-service.test.ts (modified)
- FOUND: vigil-core/src/services/brief-assembly-service.ts (modified)
- FOUND: vigil-core/src/services/brief-assembly-service.test.ts (modified)
- FOUND: vigil-core/src/index.ts (modified)
- FOUND: vigil-core/src/routes/brief-generate.ts (modified)
- FOUND: vigil-core/src/routes/calendar.ts (modified)
- FOUND: vigil-core/src/services/gmail-workorder-service.ts (modified)
- FOUND: .planning/phases/109-per-user-scheduler-fan-out/109-03-SUMMARY.md (this file)

**Commit existence:**
- FOUND: 4ab2d04 — test(109-03): add failing test for userId-required calendar signature
- FOUND: 4fbf4a9 — feat(109-03): thread userId through calendar-service (D-11/D-13)
- FOUND: df70c7f — test(109-03): add failing test for D-12 userId threading into calendar
- FOUND: 327a17d — feat(109-03): thread userId through brief-assembly calendar call (D-12)
- FOUND: 9054a5d — feat(109-03): wire calendar into both brief paths + route userId plumbing (D-12)

**Functional verification:**
- Build: clean (`npm run build` exit 0)
- Per-file tests: 276/276 pass across touched + adjacent test files
- Human-verify Path B: HTTP 200, valid PDF, no crash, no "No calendar service", no stack trace

## Self-Check: PASSED
