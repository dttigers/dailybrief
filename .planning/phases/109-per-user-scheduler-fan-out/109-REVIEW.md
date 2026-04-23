---
phase: 109-per-user-scheduler-fan-out
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - vigil-core/src/index.ts
  - vigil-core/src/routes/brief-generate.ts
  - vigil-core/src/routes/calendar.ts
  - vigil-core/src/routes/prioritize.test.ts
  - vigil-core/src/routes/prioritize.ts
  - vigil-core/src/services/brief-assembly-service.test.ts
  - vigil-core/src/services/brief-assembly-service.ts
  - vigil-core/src/services/calendar-service.test.ts
  - vigil-core/src/services/calendar-service.ts
  - vigil-core/src/services/generate-scheduler.test.ts
  - vigil-core/src/services/generate-scheduler.ts
  - vigil-core/src/services/gmail-workorder-service.ts
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 109: Code Review Report

**Reviewed:** 2026-04-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 109 closes the per-user scheduler fan-out cleanly. The atomic two-site wiring of `calendarService: createCalendarService()` into both `index.ts` (scheduler path) and `routes/brief-generate.ts` (on-demand path) is in place, userId threads through `assembleAndRender(dateStr, userId) → calendarService.fetchTodaysEvents(userId)` consistently, and the per-user fan-out in `generate-scheduler.ts` uses `try { … } catch (err) { log(…); continue; }` correctly — user 1's failure cannot block user 2 (SCH-09 verifies this with a two-user fixture).

Cross-user isolation in the reviewed files is solid: every oauth_tokens read in `calendar-service.ts` is scoped to `(userId, provider='google')`, the prioritize cache filename is now userId-scoped (`wo-priority-{userId}-{YYYY-MM-DD}-{hex}.json`), and the scheduler's `getSettingViaDb`/`getRecentBriefViaDb`/`upsertBriefViaDb` all carry userId. The `c.get("userId")` calls in the reviewed routes are safe without runtime checks because `middleware/auth.ts` (1) guards every protected path via `app.use("/v1/*", bearerAuth)` at `index.ts:116-122`, and (2) declares `ContextVariableMap { userId: number }` so TypeScript types `c.get("userId")` as `number` without a cast. The `as number` casts in `calendar.ts` and `prioritize.ts` are redundant but not wrong.

One Critical finding surfaced in `gmail-workorder-service.ts` — a pre-existing per-user isolation bug that Phase 109 did *not* introduce but *does* leave in the review scope (the file was touched for the TODO/comment update). It's latent today (only the seed user imports) but becomes exploitable the moment AUTH-06+ lands and a second user connects Gmail. I'm flagging it because the comment at lines 10-16 explicitly signals this file will be revisited, and the surrounding deferral makes it easy to miss the onConflict target issue when the fan-out PR lands. The rest of the findings are warnings about stale comments and one minor coverage gap in the calendar-service DI seam.

## Critical Issues

### CR-01: gmail-workorder-service upsert onConflict target is not scoped by userId — collides across users

**File:** `vigil-core/src/services/gmail-workorder-service.ts:317-348`
**Issue:** The upsert uses `target: workOrdersTable.caseNumber` as the conflict target, which assumes `caseNumber` is globally unique. The schema is per-user (Phase 102 added `work_orders.user_id`), so the same ServiceNow case number can legitimately exist for two different users (e.g., two technicians assigned to the same case, or one user forwarding the email to another). When user B's Gmail import runs after user A already synced `CS0353601`, `onConflictDoUpdate` fires against user A's row and **overwrites user A's record with user B's userId value — silently corrupting the data isolation boundary**. Today this is latent because the service is hard-scoped to the seed user via `getSeedUserId()` (lines 221-233), so there's only ever one writer. As soon as the deferred AUTH-06+ fan-out lands (the TODO at lines 10-16 explicitly flags this as queued work), this becomes an active cross-user data leak. The conflict target must be the composite `(userId, caseNumber)` to match the per-user scoping that the SELECT on line 295 already uses.

**Fix:**
```ts
// Line 333 — change from:
.onConflictDoUpdate({
  target: workOrdersTable.caseNumber,
  set: { ... },
});

// To composite target matching the per-user SELECT:
.onConflictDoUpdate({
  target: [workOrdersTable.userId, workOrdersTable.caseNumber],
  set: { ... },
});
```
This also requires a matching composite unique index in the schema (check `vigil-core/src/db/schema.ts` — Phase 102 may have added `userId` as a column without updating the unique constraint). If the schema still has `UNIQUE(case_number)`, add a migration that drops it and adds `UNIQUE(user_id, case_number)` before flipping the target, otherwise the upsert will fail at runtime. Fix this **before** the Gmail fan-out phase ships — not in it — so the fan-out PR is a pure additive change and doesn't silently migrate constraints.

## Warnings

### WR-01: Stale comment in brief-generate.ts falsely claims schedulers run as seed user

**File:** `vigil-core/src/routes/brief-generate.ts:108-111`
**Issue:** The comment block reads `// D-12 (Phase 105): … D-13 attribution stays correct because schedulers run as the seed user).` After Phase 109 SCHED-01, this is no longer true — the scheduler fans out per-user and emits per-user artifacts. A future reader debugging PostHog attribution will read this comment and draw the wrong conclusion about why `source: "manual"` is hard-coded here vs. why the scheduler path has no `trackEvent` call at all. The comment should either be updated to reflect the post-109 architecture (scheduler path skips `brief_generated` entirely because it calls the assembler directly and doesn't route through this handler — which is still the reason the `source` enum doesn't need a `"scheduler"` value here), or deleted.

**Fix:**
```ts
// D-12 (Phase 105): brief_generated emits once per successful POST /brief/generate.
// source is 'manual' for this HTTP route; the scheduler path (Phase 109 fan-out)
// calls brief-assembly-service directly and does NOT route through this handler,
// so no 'scheduler' source value is needed here. Per-user attribution is driven
// by c.get("userId") from the bearerAuth dispatcher at index.ts:116-122.
trackEvent(userId, "brief_generated", { ... });
```

### WR-02: generate-scheduler does not emit `brief_generated` analytics event on success

**File:** `vigil-core/src/services/generate-scheduler.ts:244-255`
**Issue:** The on-demand path (`routes/brief-generate.ts:112`) calls `trackEvent(userId, "brief_generated", { source: "manual", … })` after every successful generation. The scheduler path now runs per-user and is the *primary* brief generation path (daily 4am cron for every user) — but it only writes a `log("info", …)` line, never a PostHog event. Post-109, the `brief_generated` PostHog funnel undercounts by exactly the scheduler-generated volume, which is the majority of briefs. This is not a correctness bug (briefs still land in the DB), but the analytics dashboard the app actually ships to users will be wrong, and detecting regressions (e.g., "user X hasn't had a scheduler brief in 3 days") is impossible without this event.

**Fix:** After the successful `upsertBriefViaDb` call on line 247-254, emit the event with `source: "scheduler"`:
```ts
import { trackEvent } from "../analytics/posthog.js";
// …after upsertBriefViaDb succeeds:
trackEvent(userId, "brief_generated", {
  source: "scheduler",
  date: todayInTz,
  thought_count: result.metadata.thoughtCount,
  task_count: result.metadata.taskCount,
});
```
Note: the property denylist in `analytics/posthog.ts` will need `"scheduler"` accepted as a valid `source` value — double-check `trackEvent` runtime guard doesn't reject it.

### WR-03: calendar-service dbUpdateFn DI seam does not receive userId, preventing tests from verifying user-scoped update

**File:** `vigil-core/src/services/calendar-service.ts:66, 143-150`
**Issue:** The production `dbUpdate(userId, accessToken, expiresAt)` wrapper correctly scopes the UPDATE to `and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, "google"))` (line 149), but the DI seam signature is `dbUpdateFn?: (accessToken, expiresAt) => Promise<void>` — userId is dropped. Tests cannot verify through the DI seam that the refresh write landed against the *correct* userId's row. `CAL-02-refresh` (test line 131) only asserts the access-token value, never the userId. If a future refactor regressed the production wrapper to forget the `userId` scoping (e.g., `db.update(oauthTokens).set(...)` with no WHERE), the existing tests would pass and a cross-user token corruption bug would ship. Low real-world risk today because the production code is correct, but the DI seam's shape is what locks the correctness in.

**Fix:**
```ts
// Line 66:
dbUpdateFn?: (userId: number, accessToken: string, expiresAt: Date | null) => Promise<void>;

// Line 144 (propagate userId into the seam):
if (deps?.dbUpdateFn) return deps.dbUpdateFn(userId, accessToken, expiresAt);

// Update calendar-service.test.ts CAL-02-refresh to assert userId reaches the seam.
```

## Info

### IN-01: Redundant `as number` casts on `c.get("userId")` in calendar.ts and prioritize.ts

**File:** `vigil-core/src/routes/calendar.ts:17, 26` and `vigil-core/src/routes/prioritize.ts:64`
**Issue:** `middleware/auth.ts:11-15` already augments `declare module "hono" { interface ContextVariableMap { userId: number } }`, which makes `c.get("userId")` return `number` (not `number | undefined`) directly. The `as number` casts are therefore redundant. They're not wrong and don't weaken type safety (the source type is already `number`), but they paper over the fact that `userId` is type-safe by construction — a reader not familiar with the declare-module might think the cast is covering a runtime check that doesn't exist. `routes/brief-generate.ts:57, 140` gets this right (no cast). Worth noting: `prioritize.ts:60-62` already documents *why* no explicit null-check is needed; the cast contradicts the spirit of that comment.

**Fix:** Drop the `as number` suffix in both files:
```ts
// calendar.ts:17, 26:
const userId = c.get("userId");

// prioritize.ts:64:
const userId = c.get("userId");
```
Alternatively, add a comment next to each cast citing the `declare module "hono"` augmentation so future readers know why the cast is safe rather than load-bearing.

### IN-02: Unused `err` parameter in calendar-service catch block

**File:** `vigil-core/src/services/calendar-service.ts:264-266`
**Issue:** The `catch (err)` block around `fetchCalendarListRaw` discards `err` and returns a hardcoded generic message `"Failed to fetch calendar list"`. The error loses fidelity that could be useful for ops (network timeout vs. 401 vs. parse error all collapse to the same string). Compare with the equivalent network-error path at lines 305-311 and the list-fetch path at line 335, which preserve `err.message` or a status-code-aware string.

**Fix:**
```ts
} catch (err) {
  return {
    status: "error",
    error: `Failed to fetch calendar list: ${err instanceof Error ? err.message : String(err)}`,
  };
}
```

### IN-03: Default seed email hardcoded in gmail-workorder-service

**File:** `vigil-core/src/services/gmail-workorder-service.ts:224`
**Issue:** `const seedEmail = (process.env["VIGIL_SEED_USER_EMAIL"] ?? "jamesonmorrill1@gmail.com").trim().toLowerCase();` — the fallback literal is the user's personal email. This is not a secret and not a security issue (it's just an email address), but it's the kind of "works on my machine" default that becomes a landmine in a multi-user build. If the env var is ever cleared by accident in CI or a new environment, the Gmail importer will silently run against whoever happens to have registered with that email. Since this file is already flagged as deferred for fan-out in Phase 109.1+, fold this cleanup into that phase.

**Fix:** Fail closed instead of defaulting:
```ts
const seedEmail = process.env["VIGIL_SEED_USER_EMAIL"]?.trim().toLowerCase();
if (!seedEmail) {
  log("warn", "VIGIL_SEED_USER_EMAIL not set — skipping Gmail import");
  return null;
}
```
Matches the fail-closed pattern already established by the `JWT_SECRET` and `CORS_ORIGINS` guards in `index.ts:60-73`.

### IN-04: generate-scheduler per-user error log passes `err.message` as `meta` (structured arg), not inline in msg

**File:** `vigil-core/src/services/generate-scheduler.ts:258-265`
**Issue:** The per-user error isolation log is split across two positional args: `log("error", "generate failed for user ${userId} (${email})", err.message)`. The default log fn in `index.ts:218-223` does `console.error(line, meta ?? "")`, which *does* print the error message, but SCH-09 test only asserts against `l.msg` — `err.message` is never in the `msg` string. The test at generate-scheduler.test.ts:305-309 only checks that the msg contains "generate failed for user 1" and "a@test", never the actual error cause. That means a regression where `err.message` gets dropped (e.g., swapped to `String(err.name)` or an empty-catch refactor) would not be caught by the test. Not a shipping bug, but a test coverage gap.

**Fix:** Either include the message in the primary string so it's asserted:
```ts
log(
  "error",
  `generate failed for user ${userId} (${email}): ${err instanceof Error ? err.message : String(err)}`,
);
```
Or update SCH-09 to assert the `meta` arg too:
```ts
const errLine = lines.find((l) => l.level === "error" && l.msg.includes("user 1"));
assert.ok(errLine!.meta === "simulated assemble failure for user 1", "meta must carry err.message");
```
The first option is preferred — single argument, no silent information loss if the log fn drops meta.

---

_Reviewed: 2026-04-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
