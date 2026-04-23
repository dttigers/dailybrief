# Phase 109: Per-User Scheduler Fan-Out — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Un-scaffold the Phase 102 hard-scope-to-seed-user pattern on the daily-brief scheduler and the prioritization cache, so both correctly serve every registered user with per-user error isolation.

In scope:
1. **`generate-scheduler.tick()` fan-out** — iterate all users (`getAllUsersFn` DI seam), read each user's `user_timezone` + `generate_schedule` from scoped `appSettings`, match against that user's current local time, dedupe per user, assemble a per-user brief, upsert per user. Each user's processing is wrapped in its own `try/catch { log; continue }`.
2. **`prioritize.ts::getCacheKey()` fix** — cache filename on disk includes `userId` so two users with overlapping caseNumbers cannot share a cache line.
3. **`calendar-service` fold-in** — `fetchTodaysEvents()` gains a `userId` parameter, scoping its oauth-token read and calendar API call to that user. Brief-assembly passes `userId` through. Both scheduler and on-demand brief paths are wired to actually pass `calendarService` into `createBriefAssemblyService` (pre-existing latent gap — see Specifics).

Out of scope (explicitly):
- `gmail-workorder-service.ts` fan-out — same `TODO(AUTH-06+)` marker but different bug class (self-contained 5-min tick, writes to correctly-scoped `work_orders`; new users get empty gmail imports rather than cross-contaminated data). Deferred — see Deferred Ideas.
- `/prioritize` route auth hardening beyond reading existing `c.get("userId")` — route is already behind the global `bearerAuth` dispatcher (index.ts:151 registered after line ~105 middleware), `userId` is guaranteed non-null in handler.
- AUTH-11 `email_verified` filter on the iteration — Phase 113 concern.

</domain>

<decisions>
## Implementation Decisions

### Scheduler Fan-Out (generate-scheduler.ts)
- **D-01:** Add DI seam `getAllUsersFn?: () => Promise<Array<{ id: number; email: string }>>` to `GenerateSchedulerDeps`. When absent, default implementation `SELECT id, email FROM users ORDER BY id ASC` via `deps.db`. Email is carried so log lines can cite it (not just numeric id) — materially better for Railway log-grepping with >1 user.
- **D-02:** Empty-users-table handling: `log("info", "no users found, skipping tick")` and return. Consistent with the existing "db unavailable, skipping tick" pattern at line 207. `tick()` remains total-function (T-86-07).
- **D-03:** Delete the resolve-seed-user helper (`getSeedUserId` lines 107-122) and the `seedUserId` test-DI field (line 53) — both are dead once fan-out lands. The `VIGIL_SEED_USER_EMAIL` env var stays (still referenced by gmail-workorder-service + calendar-service until those are fanned-out separately).
- **D-04:** Per-user try/catch wraps the **entire per-user flow**: `try { settings read → schedule match → dedupe → assemble → upsert } catch { log+continue }`. Matches roadmap SC#2 literal reading. A settings-read error or a malformed `generate_schedule` JSON for user N must not prevent users N+1..M from being processed this tick.
- **D-05:** Log-line format on per-user failure: `log("error", "generate failed for user ${id} (${email})", err.message)`. Structured enough to find in Railway logs; narrow enough to avoid leaking stack traces (PostHog side already captures exceptions via `captureException`). Success log also includes userId+email: `log("info", "generated brief for ${date} user ${id} (${email})")`.
- **D-06:** Tick cadence unchanged (60s). Inside a tick, users are processed sequentially. N is 1..few for the foreseeable future; if it ever grows to a point where per-user sequential settings reads take > 60s, that's a different phase's problem.
- **D-07:** Rewrite the `TODO(AUTH-06+)` block at generate-scheduler.ts:17-20 in-place to document what was done: "Phase 109 (SCHED-01): scheduler iterates all users via `getAllUsersFn`; per-user try/catch uses `continue`; seed-user hard-scope removed." Keeps the audit trail instead of deleting history silently. (Hygiene pattern from Phase 108 D-15/D-16.)

### Prioritize Cache (prioritize.ts)
- **D-08:** `getCacheKey(userId: number, workOrders: WorkOrder[])` — `userId` first positional. Filename becomes `wo-priority-${userId}-${today}-${hash}.json`. Mirrors the `assembleAndRender(date, userId)` ordering convention (most-significant partition first, payload-derived suffix last).
- **D-09:** POST `/prioritize` handler reads `c.get("userId")` (guaranteed non-null — route is behind global `bearerAuth` dispatcher) and passes it into `getCacheKey(userId, body.workOrders)` and into the cache-write path. No signature-level auth hardening beyond this.
- **D-10:** Existing unscoped cache files (`wo-priority-{today}-{hash}.json`) are left to age out naturally — the filename already embeds today's date, so anything pre-migration becomes unreachable at the server's TZ midnight after deploy. Zero startup sweep, zero route-level cleanup branching.

### Calendar-Service Fold-In (calendar-service.ts + brief-assembly-service.ts)
- **D-11:** `fetchTodaysEvents(userId: number): Promise<CalendarEventsResponse>` — `userId` is required, not optional. Internal `getSeedUserId()` helper removed. Both `getValidAccessToken(userId)` and the subsequent `oauthTokens` `.where(and(eq(oauthTokens.userId, userId), …))` reads use the passed-in `userId`. Users without a connected Google account return an empty events list silently (existing no-token branch at line ~162).
- **D-12:** Update `CalendarServiceDeps` / `brief-assembly-service.ts:33` signature so `calendarService.fetchTodaysEvents` takes `userId`. Plumb `userId` through `assembleAndRender(dateStr, userId)` at line 441-442. Both `index.ts:206-212` (scheduler path) **and** `routes/brief-generate.ts:40-46` (on-demand path) are updated to pass `createCalendarService()` into `createBriefAssemblyService`, closing the pre-existing latent gap where briefs never actually contained calendar events.
- **D-13:** Update the TODO block at `calendar-service.ts:10-14` the same way as D-07 — in-place rewrite noting Phase 109 fan-out.

### Test Strategy (generate-scheduler.test.ts + prioritize.test.ts)
- **D-14:** New test in `generate-scheduler.test.ts` injects `getAllUsersFn` returning a two-element array (e.g., `[{id: 1, email: "a@x"}, {id: 2, email: "b@x"}]`) and asserts: both users' `assemble` calls fire, a thrown `assemble` for user 1 does not prevent user 2's `assemble` from firing (roadmap SC#4 literal). Uses the existing `tick()` direct-invocation pattern, no setInterval.
- **D-15:** Extend prioritize tests (if present) or add a minimal cache-key test asserting `getCacheKey(1, workOrders) !== getCacheKey(2, workOrders)` for identical `workOrders`. Filename pattern asserted verbatim.

### Claude's Discretion
- Exact log line wording (the shape in D-05 is the invariant; punctuation/casing is discretionary).
- Whether the default `getAllUsersFn` implementation closes over `deps.db` inside `createGenerateScheduler`, or lives as a top-level helper. Minor style.
- Exact test fixture emails / ids.
- Whether to split into one plan or multiple (e.g., scheduler / prioritize / calendar / wiring). Planner's call. Roadmap SC map cleanly to 3 work-units so a 3-plan split (Wave 1: scheduler + tests; Wave 1: prioritize + tests; Wave 2: calendar fold-in + index.ts/brief-generate.ts wiring) is plausible but the planner decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 109 Specification
- `.planning/REQUIREMENTS.md` (SCHED-01) — requirement text, acceptance criteria
- `.planning/ROADMAP.md` §"Phase 109: Per-User Scheduler Fan-Out" (lines 506-518) — goal, four success criteria, W-01/W-02 dependency note

### Phase 102 Prior Decisions (this phase un-scaffolds)
- `.planning/milestones/v3.4-phases/102-multi-user-foundation/102-CONTEXT.md` §"Open Q4" resolution — establishes the seed-user hard-scope pattern Phase 109 removes
- `.planning/milestones/v3.4-phases/102-multi-user-foundation/102-RESEARCH.md` — rationale for "defer fan-out to a future phase" explicitly calls out generate-scheduler, gmail-workorder-service, calendar-service as the three TODO(AUTH-06+) sites

### Code Anchors (planner + researcher must read)
- `vigil-core/src/services/generate-scheduler.ts:17-20` — TODO block to rewrite (D-07)
- `vigil-core/src/services/generate-scheduler.ts:52-54` — `seedUserId` DI field to delete (D-03)
- `vigil-core/src/services/generate-scheduler.ts:104-122` — `getSeedUserId()` helper to delete (D-03)
- `vigil-core/src/services/generate-scheduler.ts:202-262` — `tick()` body to refactor for fan-out (D-01, D-04, D-05)
- `vigil-core/src/services/generate-scheduler.test.ts` — target file for D-14
- `vigil-core/src/routes/prioritize.ts:25-32` — `CACHE_DIR` + `getCacheKey()` to modify (D-08)
- `vigil-core/src/routes/prioritize.ts:52-109` — POST handler to read `c.get("userId")` (D-09)
- `vigil-core/src/services/calendar-service.ts:10-14` — TODO block to rewrite (D-13)
- `vigil-core/src/services/calendar-service.ts:114-168` — `createCalendarService` / `fetchTodaysEvents` / oauthTokens reads to add userId (D-11)
- `vigil-core/src/services/brief-assembly-service.ts:33` — `CalendarServiceDeps` shape to update (D-12)
- `vigil-core/src/services/brief-assembly-service.ts:441-442` — `deps.calendarService.fetchTodaysEvents()` call site to pass userId (D-12)
- `vigil-core/src/index.ts:206-212` — scheduler `createBriefAssemblyService` wiring needs `calendarService: createCalendarService()` (D-12)
- `vigil-core/src/routes/brief-generate.ts:40-46` — on-demand `createBriefAssemblyService` wiring needs `calendarService: createCalendarService()` (D-12)

### Phase 108 Hygiene Pattern (inform D-07, D-13)
- `.planning/phases/108-work-order-statuses-userid-scoping-isolation-test/108-CONTEXT.md` §D-15/D-16 — in-place guardrail inversion instead of deletion for audit-trail continuity

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DI-seam pattern in `GenerateSchedulerDeps`** (generate-scheduler.ts:30-54) — adding `getAllUsersFn` is a clean extension, not a refactor. Existing `getSettingFn`/`getRecentBriefFn`/`upsertBriefFn` override conventions apply verbatim.
- **`assembleAndRender(dateStr, userId)`** (brief-assembly-service.ts:424) — already user-scoped end-to-end for thoughts, work orders, settings, sports, affirmation. Fan-out is a loop-level change; per-user correctness is already there.
- **`appSettings` composite PK `(userId, key)`** (Phase 102) — per-user `user_timezone` + `generate_schedule` reads already work via `getSettingViaDb(key, userId)` at lines 219, 222. No schema change needed.
- **Test `tick()` direct-invocation pattern** (generate-scheduler.test.ts) — tests call `tick()` directly without starting the setInterval loop. New fan-out test inherits this pattern for free.

### Established Patterns
- **Total-function `tick()`** (T-86-07, line 258-261) — outer fail-safe try/catch around the whole body catches anything the per-user try/catch missed. Phase 109 keeps this outer guard; the new per-user try/catch is a nested inner layer.
- **Silent-skip on missing precondition** — the existing `if (!canRead) return` (line 207) and `if (seedUserId === null) return` (line 213) patterns generalize: empty users table → `log + return`, not throw.
- **TODO-in-place rewrite** — Phase 108 D-15/D-16 established "invert, don't delete" for guardrails; Phase 109 applies it to the three `TODO(AUTH-06+)` comment blocks in generate-scheduler.ts, calendar-service.ts, gmail-workorder-service.ts (only first two are actually rewritten to reflect work done; the gmail one is updated to note deferral explicitly with a forward pointer).

### Integration Points
- **bearerAuth middleware** (index.ts:105-122) — sets `c.set("userId", …)`. Already in place for `/v1/prioritize` since the route is registered after the global dispatcher at line 151.
- **Drizzle `users` table** (`schema.ts` — `users` imported in generate-scheduler.ts:14) — the default `getAllUsersFn` reads from this table directly. No migration.
- **Brief-assembly injection** — after D-12, both `index.ts:206-212` and `routes/brief-generate.ts:40-46` become the only two places that wire `createBriefAssemblyService`; they must stay in sync. A lint-level regression guard (grep check in verify script) is optional but worth flagging to the planner.

</code_context>

<specifics>
## Specific Ideas

- **Pre-existing latent bug surfaced during discussion**: neither scheduler path (index.ts:206-212) nor on-demand path (brief-generate.ts:40-46) currently passes `calendarService` into `createBriefAssemblyService`. `deps.calendarService` is optional (brief-assembly-service.ts:33, `?`) and falls through to the `No calendar service` rejection at line 443. **Briefs have therefore never actually contained Google Calendar events from either path, regardless of user.** Folding calendar into Phase 109 is the first time the calendar section of the brief becomes live. Planner must wire `calendarService` into **both** callers atomically with the userId signature change — not one without the other.
- **`TODO(AUTH-06+)` sites accounting**: three sites total — `generate-scheduler.ts:17` (fixed by D-07), `calendar-service.ts:10` (fixed by D-13), `gmail-workorder-service.ts:10` (updated in-place to note deferral to a future phase, per Deferred Ideas below). Never delete the comments — always rewrite in-place so future readers can see the evolution.
- **Two-user test fixture pattern**: model on `cross-user-isolation.test.ts` from Phase 108 but at the unit level — inject mocks directly via `getAllUsersFn`, don't stand up a real DB. The integration-level assertion that both users get briefs is already implicit from the DI wiring; unit coverage of the fan-out loop body + error isolation is what SC#4 actually asks for.
- **`VIGIL_SEED_USER_EMAIL` env var**: stays defined (still referenced by calendar-service pre-D-11 and by gmail-workorder-service which is deferred). Remove from generate-scheduler.ts only.

</specifics>

<deferred>
## Deferred Ideas

### gmail-workorder-service.ts fan-out
- `vigil-core/src/services/gmail-workorder-service.ts:10-11` carries the same `TODO(AUTH-06+)` marker
- Its tick runs on its **own** 5-minute interval (index.ts:228), independent of `generate-scheduler`
- Bug shape is different from calendar-service: writes to `workOrders` go to the resolved userId, so there is no cross-user contamination — users without seed access just get zero gmail-imported work orders. That's a feature-completeness gap, not a data-leak gap.
- Fan-out here is structurally different: iterate users, fetch each one's Gmail token via `getValidAccessToken(userId)`, import each user's emails into their own `workOrders` rows. Bigger blast radius than Phase 109 (new error modes per user: no token, revoked token, quota exhaustion).
- **Defer to a dedicated phase** (candidate: Phase 109.1 or a v3.7 requirement — planner's choice whether to insert decimally or route to backlog). Phase 109's `TODO` rewrite at gmail-workorder-service.ts:10-11 should explicitly cite the forward phase.

### Timezone-matching perf at N > 10 users
- Current sequential per-user settings reads inside `tick()` are fine at today's N (1..few). At N=100+ a single tick could approach the 60s interval ceiling.
- Not a current-milestone concern. Logging adds a 1-line comment in the `tick()` fan-out loop noting the sequential choice.

### AUTH-11 email_verified filter on iteration
- Phase 113 will add `email_verified` column. At that point `getAllUsersFn` may want to filter `WHERE email_verified = true`. Flagged so Phase 113 planning remembers to revisit the SCHED-01 iteration predicate.

### /prioritize route defence-in-depth
- An explicit `if (!userId) return 401` at the top of the handler is redundant today (bearerAuth dispatcher guarantees it) but would be cheap belt-and-suspenders. Not worth the scope churn for Phase 109; revisit if a future refactor loosens the global auth wiring.

</deferred>

---

*Phase: 109-per-user-scheduler-fan-out*
*Context gathered: 2026-04-23*
