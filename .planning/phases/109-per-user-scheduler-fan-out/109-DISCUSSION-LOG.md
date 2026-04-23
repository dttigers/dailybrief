# Phase 109: Per-User Scheduler Fan-Out — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 109-per-user-scheduler-fan-out
**Areas discussed:** Calendar scope, User iteration, Error isolation shape, Cache + prioritize route

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Calendar scope | Strict scheduler+prioritize only (roadmap SC), OR also fix calendar-service so each user's brief contains THEIR events. | ✓ |
| User iteration | Which users getAllUsers() returns, ordering, empty-table behavior, DI seam shape. | ✓ |
| Error isolation shape | Where the per-user try/catch wraps, log line format, settings-read failure handling. | ✓ |
| Cache + prioritize route | getCacheKey signature change, disposition of existing cache files, /prioritize auth hardening. | ✓ |

**User selected:** All four.

---

## Calendar Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Fold in | Add userId to fetchTodaysEvents, plumb through brief-assembly, scope 2 reads in calendar-service. ~5 lines + tests. Closes the 'cosmetic fan-out' bug class. | ✓ |
| Strict (roadmap literal) | Leave calendar-service seed-scoped. Update TODO to note deferral. SC met but every user's brief shows seed user's calendar until a future phase. | |
| Defer to 109.1 | Carve out an explicit follow-up phase for calendar-service fan-out. | |

**User's choice:** Fold in.
**Notes:** During the analysis a pre-existing latent gap was surfaced — neither scheduler path (index.ts:206) nor on-demand path (brief-generate.ts:40) currently passes `calendarService` into `createBriefAssemblyService`, so briefs have never contained Google Calendar events from either path. Fold-in therefore also requires atomic wiring updates in both callers, not just a signature change. Captured in CONTEXT.md Specifics.

---

## User Iteration

### Sub-question 1: What should getAllUsersFn() return?

| Option | Description | Selected |
|--------|-------------|----------|
| All users | SELECT id, email FROM users ORDER BY id ASC. Simplest, matches today's reality (N=1..few). | ✓ |
| Filter future-unverified | Return only email_verified=true users. Preempts AUTH-11 but adds dependency on schema that doesn't exist yet. | |
| Active-only heuristic | Filter to users with recent activity. No current product signal for this. | |

**User's choice:** All users.

### Sub-question 2: DI seam shape for the iteration?

| Option | Description | Selected |
|--------|-------------|----------|
| {id, email} | getAllUsersFn: () => Promise<Array<{id; email}>>. Email used in log lines for Railway debuggability. | ✓ |
| {id} only | Minimal — but logs show only numeric userId, harder to debug. | |
| Full user row | Overkill — pulls fields scheduler doesn't need. | |

**User's choice:** {id, email}.

### Sub-question 3: What happens when users table is empty?

| Option | Description | Selected |
|--------|-------------|----------|
| Silent skip with info log | Consistent with existing 'db unavailable, skipping tick' pattern. tick() is total-function. | ✓ |
| Warn log | Elevates empty state to warning. Noisy once per minute forever if DB really is empty. | |
| Error log | Treats empty as error. Contradicts fresh-DB legitimate case. | |

**User's choice:** Silent skip with info log.

---

## Error Isolation Shape

### Sub-question 1: How wide should the per-user try/catch wrap?

| Option | Description | Selected |
|--------|-------------|----------|
| Whole per-user flow | try { settings → schedule → dedupe → assemble → upsert } catch { log+continue }. Matches roadmap SC#2 literal reading. | ✓ |
| Only assemble+upsert | Narrower — but a malformed settings row for user N would throw out of the loop and stop users N+1..M. | |
| Nested try/catch per step | Over-engineered; more code paths to keep total-function. | |

**User's choice:** Whole per-user flow.

### Sub-question 2: Log line format when one user's generation fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured with userId+email | log('error', 'generate failed for user 42 (alice@…)', err.message). Makes Railway log-search trivial. | ✓ |
| Minimal err only | Can't tell which user from logs — bad for multi-user debugging. | |
| Full error object | Verbose; PostHog side already captures exceptions. | |

**User's choice:** Structured with userId+email.

### Sub-question 3: Should a dedupe/settings-read failure per-user also be isolated?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same try/catch | Natural consequence of 'Whole per-user flow'. Any DB hiccup reading user N's settings logs+continues. | ✓ |
| No, pre-read errors abort tick | Means one user's corrupt settings kills the whole fan-out. Contradicts the 'one user's failure doesn't block others' goal. | |

**User's choice:** Yes, same try/catch.

---

## Cache + Prioritize Route

### Sub-question 1: getCacheKey() signature change?

| Option | Description | Selected |
|--------|-------------|----------|
| getCacheKey(userId, workOrders) | Filename becomes wo-priority-{userId}-{today}-{hash}.json. userId as first positional param mirrors assembleAndRender(date, userId). | ✓ |
| getCacheKey(workOrders, userId) | userId as trailing param. Less natural. | |
| Embed userId into hash input only | Filename stays unchanged; opaque — can't eyeball cache files on disk. | |

**User's choice:** getCacheKey(userId, workOrders).

### Sub-question 2: What about existing unscoped cache files on disk?

| Option | Description | Selected |
|--------|-------------|----------|
| Leave them | New writes use new pattern; old files age out on date rollover. Zero-effort, zero-risk. | ✓ |
| Sweep on deploy | Adds code for negligible benefit. | |
| Sweep on first prioritize call | Adds branching to hot path for no user-visible win. | |

**User's choice:** Leave them.

### Sub-question 3: Auth-harden /prioritize while we're there?

| Option | Description | Selected |
|--------|-------------|----------|
| Status quo — relies on existing bearerAuth | Route already behind global bearerAuth dispatcher; c.get('userId') guaranteed non-null. No route-level changes beyond reading userId. | ✓ |
| Add explicit requireUser guard | Belt-and-suspenders defensive check. Redundant with bearerAuth today. | |
| Out of scope for Phase 109 | Don't touch auth at all. | |

**User's choice:** Status quo.

---

## Claude's Discretion

- Exact migration SQL text, log line punctuation/casing, test fixture emails/ids.
- Whether default `getAllUsersFn` implementation closes over `deps.db` inside `createGenerateScheduler` or is a top-level helper.
- Plan split shape (single plan vs 3-plan split on scheduler / prioritize / calendar). Planner's call.

## Deferred Ideas

- `gmail-workorder-service` fan-out — same TODO marker, different bug class (self-contained tick, writes to correctly-scoped table). Deferred to its own phase.
- Timezone-matching sequential-read perf at N > 10 users. Flagged as inline comment only.
- AUTH-11 `email_verified` filter on `getAllUsersFn` — Phase 113 revisit.
- `/prioritize` defence-in-depth 401 guard — cheap but redundant with bearerAuth today.
