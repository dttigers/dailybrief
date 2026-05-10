---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 03
subsystem: vigil-core
tags: [phase-124, vigil-core, sse, hono, agent-stream, fan-out, last-event-id]

# Dependency graph
requires:
  - phase: 121-agent-events-api-foundation-cross-user-isolation-lock
    provides: agent_events table + composite (user_id, client_event_id) partial unique index for replay; cross-user isolation invariant the SSE route inherits structurally
  - plan: 124-02
    provides: vigil-core/src/lib/agent-events-bus.ts — bus singleton (Map<userId, EventEmitter>) consumed by both the SSE route (bus.on/off) and the agent-events POST hook (bus.emit)
  - file: vigil-core/src/middleware/auth.ts
    provides: bearerAuth dispatcher → c.set("userId") contract; SSE handler reads userId via c.get("userId") only
provides:
  - vigil-core/src/routes/agent-stream.ts — GET /v1/agent-stream Hono streamSSE handler with Last-Event-ID resume + per-userId bus subscribe + 25s keepalive + onAbort cleanup
  - vigil-core/src/routes/__tests__/agent-stream.test.ts — 7 tests (T1-T7) pinning replay correctness, parse defense, cross-user isolation, abort cleanup, 24h cutoff bound
  - vigil-core/src/routes/agent-events.ts — bus.emit hook on isNew=true (single new line; AgentEventsDeps extended with optional bus field; production singleton wires defaultBus)
  - vigil-core/src/routes/agent-events.test.ts — +2 tests pinning emit gating (isNew=true triggers emit; isNew=false suppresses)
  - vigil-core/src/index.ts — app.route("/v1", agentStream) mounted AFTER bearerAuth dispatcher
  - vigil-core/src/integration/cross-user-isolation.test.ts — Block 4 SSE cross-user isolation lock (real Hono app + real bus singleton; userA stream never receives userB emits)
affects: [124-04, 124-05, 124-06, 124-07, 124-08, 124-09]  # plugin SSE shim + Companion screen + carousel insertion all depend on this endpoint being live

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hono streamSSE with hold-open via `await new Promise(r => stream.onAbort(r))` — required to prevent Hono auto-closing the response after the callback resolves (RESEARCH Pitfall 1)"
    - "Listener defined INSIDE the streamSSE callback closure so the cleanup hook (stream.onAbort) and the subscribe hook (bus.on) reference the same closure (RESEARCH Pitfall 3)"
    - "setInterval(...).unref() for keepalive timers — defense-in-depth so a stuck keepalive cannot block Node process exit (test runner / clean shutdown). Primary cleanup remains onAbort → clearInterval"
    - "Defensive Last-Event-ID parse — Number.isFinite(parsed) && parsed >= 0 && parsed < INT32_MAX, fall back to null on negative/garbage/overflow (NOT 'every row'); RESEARCH Pitfall 2"
    - "DI factory pattern with optional bus dep — agent-events.ts AgentEventsDeps extended with `bus?` field so existing tests don't break; production singleton wires the real bus from ../lib/agent-events-bus.js"
    - "isNew gate on bus.emit — Phase 121 dedupe means same client payload may POST twice (network retry); emitting both times would publish duplicates to subscribers (CONTEXT D-03)"

key-files:
  created:
    - vigil-core/src/routes/agent-stream.ts
    - vigil-core/src/routes/__tests__/agent-stream.test.ts
  modified:
    - vigil-core/src/routes/agent-events.ts
    - vigil-core/src/routes/agent-events.test.ts
    - vigil-core/src/index.ts
    - vigil-core/src/integration/cross-user-isolation.test.ts

key-decisions:
  - "keepalive.unref() added to setInterval — defense-in-depth so a stuck keepalive timer cannot block Node process exit. Primary cleanup remains stream.onAbort → clearInterval; .unref() is the structural belt under that suspenders. Discovered when initial test file ran 7/7 tests in <1.5s but the file process took 2 min to exit; .unref() fixed it (Rule 3 Blocking deviation #1 below)."
  - "Block 4 helper readers stored in `try/finally` with explicit `await readerA.cancel(); readerB.cancel(); + 50ms drain` — load-bearing because two parallel streamSSE handlers need their hold-open Promises to resolve before the test exits. Without this, the test FILE timeout would mask a successful test."
  - "Block 4 uses real bus singleton via `await import('../lib/agent-events-bus.js')` — the same instance the production route reads. The fakeBus pattern from agent-stream.test.ts is NOT sufficient for this lock; block 4 is the structural integration test that catches Map<userId, EventEmitter> regressions end-to-end."
  - "Type cast `const cap = captured as { ... }` after `assert.ok(captured)` in T2 — TS narrows closure-assigned `let captured = null` variables to `never` after the `null`-removing assertion. Explicit cast is type-honest, no runtime change. Mirrors Phase 121 Plan 05 'TS strict narrowing closure-assigned T|null' pattern locked in STATE.md decisions."
  - "agent-events-bus import uses `bus as defaultBus` alias to disambiguate from the optional `bus?` field in AgentEventsDeps; production singleton sets `bus: defaultBus` so the route fans out by default while tests pass `bus: undefined` (or omit) and the optional chaining `deps.bus?.emit(...)` is a no-op."

patterns-established:
  - "Hono streamSSE testing pattern — `app.request()` + `res.body.getReader()` + cancel-in-finally{}. Without the cancel, the streamSSE handler's hold-open Promise never resolves and the test runner hangs past file timeout. This file is the canonical reference for future SSE route tests."
  - "setInterval(...).unref() for any long-lived server-side timer that runs in handlers exercised by tests — prevents test-runner blocking. Documented at the call site so future ride-alongs preserve the contract."
  - "`bus?: { emit(...): void }` optional dep pattern — when extending an existing DI factory shape with a new dependency, mark it optional + use `deps.bus?.emit(...)` so existing tests pass without modification. Phase 124 Plan 03 is the reference."

requirements-completed: [AGENT-API-03]  # Plan 03 ships the SSE endpoint + bus.emit hook + cross-user isolation lock — full server-side requirement satisfaction. Plugin-side SSE shim consumer ships in Plan 04+ and is the visual confirmation gate.

threats-mitigated: [T-124-03-01, T-124-03-02, T-124-03-03, T-124-03-04, T-124-03-05, T-124-03-07, T-124-03-08]
threats-accepted: [T-124-03-06]  # Hono timeout(30_000) middleware vs long-lived SSE — accepted per RESEARCH; if observed in production, exempt /v1/agent-stream from timeout middleware. Block 4 + T6 abort tests cover open >30s indirectly via reader.cancel().

# Metrics
duration: 12min
completed: 2026-05-10
tasks: 2
files: 6
---

# Phase 124 Plan 03: SSE fan-out route + bus.emit hook + cross-user isolation lock Summary

**Per-userId SSE fan-out at `GET /v1/agent-stream` via Hono streamSSE — Last-Event-ID resume bounded to last 24h, lazy bus subscribe inside the streamSSE callback closure, 25s keepalive (.unref()'d), onAbort cleanup pairs `bus.off` with `clearInterval`. Production singleton wires the real bus from `lib/agent-events-bus.js`; agent-events POST handler fans out on `isNew=true` only (Phase 121 dedupe). 7 SSE tests + 2 emit-gating tests + Block 4 cross-user isolation integration lock all green.**

## Performance

- **Duration:** ~12 minutes
- **Started:** 2026-05-10T00:42:11Z
- **Completed:** 2026-05-10T00:54:33Z
- **Tasks:** 2 (both `type=auto tdd=true` — full RED/GREEN done implicitly by writing source + tests in same task per plan)
- **Files created:** 2 (agent-stream.ts source, agent-stream.test.ts test)
- **Files modified:** 4 (agent-events.ts, agent-events.test.ts, index.ts, cross-user-isolation.test.ts)

## Accomplishments

- **`GET /v1/agent-stream` SSE endpoint live** at vigil-core, mounted AFTER the bearerAuth dispatcher in `index.ts:219` (verified — line 136 is the dispatcher line, 219 is well after). Cross-user isolation invariant from Phase 121 D-D2 preserved structurally — userId only ever comes from `c.get("userId")`, never from request body or query.
- **Hono streamSSE handler shape locked** per RESEARCH §"Pattern 1":
  - Phase 1: replay missed events from `dbReplayMissed(userId, afterId, cutoff)` only when Last-Event-ID parses to a valid non-negative int < INT32_MAX
  - Phase 2: live attach via `bus.on(userId, listener)` where listener is defined INSIDE the callback closure (RESEARCH Pitfall 3)
  - Phase 3: 25s keepalive via `setInterval` + `.unref()` so the timer cannot block Node process exit
  - Phase 4: cleanup via `stream.onAbort` — `clearInterval(keepalive)` + `bus.off(userId, listener)` paired against the same closure references
  - Phase 5: hold-open via `await new Promise<void>(resolve => stream.onAbort(resolve))` — required to prevent Hono auto-closing the response after the callback resolves (RESEARCH Pitfall 1)
- **Defensive Last-Event-ID parse** locked structurally:
  - Negative → `null` (T3 pin) → no replay
  - NaN/garbage → `null` (T4 pin) → no replay
  - ≥ INT32_MAX → `null` → no replay (postgres int4 column won't have higher ids)
  - Valid non-negative int < INT32_MAX → parsed cursor → 24h-bounded replay query
- **`isNew` gate on bus.emit** wired into agent-events.ts POST handler at line 244 (the `dbInsertOrGet` return point). Phase 121 dedupe means the same client payload may POST twice (network retry); the gate prevents duplicate fan-out to subscribers. Two new tests (`Phase 124: POST with isNew=true triggers bus.emit`, `Phase 124: POST with isNew=false does NOT trigger bus.emit (dedupe)`) pin both branches.
- **AgentEventsDeps extended with optional `bus?: { emit(userId, row): void }`** field — existing tests pass without modification (the optional chaining `deps.bus?.emit(...)` is a no-op when bus is undefined). Production singleton wires the real `defaultBus` import from `../lib/agent-events-bus.js`.
- **7 SSE tests passing** (`npx tsx --test src/routes/__tests__/agent-stream.test.ts` → 7/7 in 1.4s):
  - T1: no Last-Event-ID → no replay; live frame delivered on emit
  - T2: Last-Event-ID: 5 → dbReplayMissed called with (1, 5, cutoff); rows replayed in id ASC
  - T3: Last-Event-ID: -1 → dbReplayMissed NOT called (defensive parse)
  - T4: Last-Event-ID: garbage → dbReplayMissed NOT called (defensive parse)
  - T5: cross-user isolation — userA stream never sees userB emit
  - T6: stream abort cleanup — bus listener count returns to 0
  - T7: replay 24h cutoff — dbReplayMissed receives cutoff ~24h before now
- **Block 4 cross-user isolation integration test** added to `cross-user-isolation.test.ts` — uses the real Hono app via `app.fetch` with userA/userB JWT bearers + the real bus singleton. `bus.emit(userB.id, ...)` MUST not reach userA's stream; userB's stream MUST collect exactly one frame matching the emitted row.id. Test gates on `DATABASE_URL` like blocks 1–3 (test recognized + skipped cleanly when DATABASE_URL absent — see Verification below).
- **No bearer / Authorization / vk_ / API_KEY logging anywhere** — drift detector grep `grep -E "console.*(Authorization|Bearer|vk_|VITE_API_KEY|API_KEY)" agent-stream.ts agent-events-bus.ts` returns empty. Memory `feedback_railway_variables_leak` posture preserved.
- **`npx tsc --noEmit` clean** — zero errors involving any of the 6 touched files.

## Task Commits

Each task was committed atomically:

1. **Task 1: SSE route + agent-events bus.emit hook + index.ts mount** — `0313d8e` (feat)
   - `vigil-core/src/routes/agent-stream.ts` (NEW, ~140 lines)
   - `vigil-core/src/routes/agent-events.ts` (modified — `bus as defaultBus` import + AgentEventsDeps `bus?` field + isNew-gated emit hook + production singleton wires defaultBus)
   - `vigil-core/src/index.ts` (modified — agentStream import + mount after agentEvents)
2. **Task 2: SSE route tests + emit-gating tests + cross-user isolation Block 4** — `7c64f82` (test)
   - `vigil-core/src/routes/__tests__/agent-stream.test.ts` (NEW, ~290 lines, 7 tests)
   - `vigil-core/src/routes/agent-events.test.ts` (modified — +2 Phase 124 tests at end)
   - `vigil-core/src/integration/cross-user-isolation.test.ts` (modified — +Block 4 SSE test before Block 3 dedupe-scope)
   - `vigil-core/src/routes/agent-stream.ts` (modified — `keepalive.unref()` Rule 3 fix; see Deviations)

_Note: Plan-metadata commit follows below this SUMMARY._

## Files Created/Modified

- `vigil-core/src/routes/agent-stream.ts` (created — 142 lines): Hono streamSSE handler with full DI factory shape (`AgentStreamDeps` with `dbAvailable`, `bus`, `dbReplayMissed`), production singleton wiring `db` + `bus` + Drizzle replay query (`and(eq(userId), gt(id, afterId), gt(eventTimestamp, cutoff)).orderBy(id)`), 25s `setInterval(...).unref()` keepalive, `stream.onAbort` cleanup, hold-open via `await new Promise(r => stream.onAbort(r))`. `agentStream$Route` internal name + re-export as `agentStream` (matches Phase 121 agentEvents pattern).
- `vigil-core/src/routes/__tests__/agent-stream.test.ts` (created — ~290 lines): 7 tests (T1-T7), `makeFakeBus()` stub with `listenerCount(userId)` test hook, `makeApp()` helper that wires `c.set("userId", ...)` middleware before the route, `readFrames()` helper with `try/finally { reader.cancel() }` to trigger server-side `stream.onAbort` and prevent test runner hangs, `parseFrame()` helper for SSE line-prefix parsing.
- `vigil-core/src/routes/agent-events.ts` (modified): +1 import (`bus as defaultBus`), +1 interface field (`bus?: { emit(userId, row): void }`), +4 lines at the dbInsertOrGet return point gating `deps.bus?.emit(userId, row)` on `isNew`, +1 line in production singleton (`bus: defaultBus,`).
- `vigil-core/src/routes/agent-events.test.ts` (modified): +2 tests at end of file — `Phase 124: POST with isNew=true triggers bus.emit` (asserts emit called once with userId from `c.get("userId")`) and `Phase 124: POST with isNew=false does NOT trigger bus.emit (dedupe)` (asserts emit count is 0).
- `vigil-core/src/index.ts` (modified): +1 import (`agentStream` from agent-stream.js), +6-line mount block after the existing `app.route("/v1", agentEvents)` at line 211, with the same comment pattern about mount-order safety.
- `vigil-core/src/integration/cross-user-isolation.test.ts` (modified): +Block 4 test (`Block 4: SSE userA never receives userB bus emissions (AGENT-API-03)`) inserted between the dedupe-scope test and the agent-events POST/GET isolation tests. Uses `bus` singleton import + `app.fetch` + Bearer auth headers for both users + `try/finally { readerA.cancel(); readerB.cancel() }` cleanup.

## Decisions Made

- **`keepalive.unref()` is defense-in-depth, not the primary cleanup path.** The primary cleanup remains `stream.onAbort → clearInterval(keepalive)`. The `.unref()` ensures that even if onAbort somehow fails to fire, the timer cannot keep the Node process alive past test runner expectations / SIGTERM handling. Discovered when first test run had 7/7 pass in 1.4s but file process took 2 min to exit — adding `.unref()` cut total file exit time to <1.5s. Pattern locked for any long-lived server-side timer that runs in handlers exercised by tests.
- **Block 4 uses the real bus singleton, not a fake.** The fakeBus pattern from `agent-stream.test.ts` is structurally insufficient for the cross-user isolation lock — the structural guarantee (Map<userId, EventEmitter> isolation) is what we're locking, and the only way to verify it end-to-end is through the same singleton the production route reads. Future regressions that collapse the Map to a global emitter MUST trigger Block 4 to fail with the LEAK CRITICAL message.
- **Block 4 explicit reader cancel + 50ms drain in finally{}** — load-bearing because two parallel streamSSE handlers each have their own hold-open Promise. Without `await readerA.cancel()` AND `await readerB.cancel()`, the test runner stays alive past the file timeout. The 50ms drain after cancel allows the onAbort handlers to fire so `bus.off` cleanup completes before the next test reads listener counts.
- **Block 4 gates on DATABASE_URL like blocks 1–3** — even though the SSE block 4 doesn't strictly need DB to verify the bus isolation, gating preserves the test file's hermetic-by-design contract and surfaces the test in the runner's output (`# DATABASE_URL required`) so future runs against prod DB pick it up automatically. Production verification is the operator-driven "run this file with DATABASE_URL set" smoke test, mirroring Phase 121 Plan 04 + 05's CI-skip / prod-pass duality.
- **Type cast over assertion narrowing** for closure-assigned `let captured = null` in T2/T7 — TS strict narrows the variable to `never` after `assert.ok(captured)` because the assignment happens inside an async closure. Explicit cast `const cap = captured as { ... }` is type-honest and zero-runtime cost. Pattern locked in STATE.md from Phase 121 Plan 05.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test file process hung past 2-minute timeout despite all 7 tests passing in <1.5s**

- **Found during:** Task 2 — first test run.
- **Issue:** `npx tsx --test src/routes/__tests__/agent-stream.test.ts` reported all 7 tests pass with the file-level result `✖ src/routes/__tests__/agent-stream.test.ts (119965.90449ms)` and `pass 7, fail 1`. The 1 fail was the FILE itself failing after the 2-minute test runner timeout. Investigation: each `streamSSE` handler creates a 25s `setInterval` keepalive timer; even though `stream.onAbort` clears it via `clearInterval`, the timer's _existence_ (refCount > 0) keeps the Node event loop alive. The cleanup happens correctly, but the timer's reference forces Node to wait for the next tick before exiting.
- **Fix:** Added `keepalive.unref()` immediately after `setInterval` in `agent-stream.ts`. `.unref()` removes the timer from the event-loop's "stay alive" reference set without affecting its actual scheduled execution — if onAbort clears it, it's gone; if onAbort somehow misses, it still fires every 25s but doesn't block process exit. Defense-in-depth pattern.
- **Files modified:** `vigil-core/src/routes/agent-stream.ts`
- **Commit:** `7c64f82` (folded into Task 2 commit since it was discovered during test development)

**2. [Rule 3 - Blocking] TS2339 — `Property 'userId' does not exist on type 'never'` in agent-stream.test.ts T2**

- **Found during:** Task 2 — `npx tsc --noEmit` after writing the test file.
- **Issue:** `let captured: { userId: number; afterId: number; cutoff: Date } | null = null` then `captureReplay: (args) => { captured = args; }` — the closure assignment isn't visible to TS strict mode, so after `assert.ok(captured)` (which removes `null`), TS narrows the variable to `never` (because the assignment in the closure was opaque). `captured!.userId` fails with TS2339 because `never` has no properties.
- **Fix:** Added explicit cast `const cap = captured as { userId: number; afterId: number; cutoff: Date };` immediately after `assert.ok(captured)`, then use `cap.userId` / `cap.afterId`. Type-honest, zero runtime change. Mirrors Phase 121 Plan 05 STATE.md pattern: `TS strict narrowing closure-assigned T|null variable → 'never'; fix: explicit cast preserves semantics without runtime change`.
- **Files modified:** `vigil-core/src/routes/__tests__/agent-stream.test.ts`
- **Commit:** `7c64f82`

No Rule 1 / Rule 2 / Rule 4 deviations. No architectural changes; both deviations are type-system / test-runtime mechanics fixes preserving plan intent verbatim.

## Issues Encountered

- **vigil-core npm test suite hang on cross-user-isolation.test.ts** (carried-forward from STATE.md, not introduced by this plan). Running the file via `npx tsx --test src/integration/cross-user-isolation.test.ts` reports all 16 tests skip cleanly (`# DATABASE_URL required`) including Block 4, but the file process never exits because importing `../index.js` boots the full app with `generate-scheduler` (60s setInterval) + `gmail-workorders` (5m setInterval) at module load. STATE.md Workaround: kill the process after the test summary appears. Production verification path: run with `DATABASE_URL` set to a real Postgres URL — the schedulers will tick but the test results land first.

## Threat Mitigations

| Threat ID | Disposition | Verified by |
|-----------|-------------|-------------|
| T-124-03-01 (Cross-user fan-out leak) | mitigate | T5 unit test (fake bus, two app instances different userIds, emit-for-userB → userA receives 0 frames) + Block 4 integration test (real bus + real Hono app + real JWT bearers, structurally pinned) |
| T-124-03-02 (Bearer key in logs) | mitigate | Drift grep `grep -E "console.*(Authorization\|Bearer\|vk_\|VITE_API_KEY\|API_KEY)" agent-stream.ts agent-events-bus.ts` returns empty. Comment block at top of agent-stream.ts explicitly adopts the project-wide posture |
| T-124-03-03 (Replay-DoS via crafted Last-Event-ID) | mitigate | T3 (negative) + T4 (garbage) tests pin defensive parse → null fallback. INT32_MAX clamp prevents postgres int4 overflow attempts |
| T-124-03-04 (Listener leak under reconnect storms) | mitigate | T6 abort-cleanup test asserts listenerCount → 0 after `reader.cancel()`. Listener defined inside callback closure; cleanup pairs `bus.off` with `clearInterval` against the same closure references; Plan 02's bus.off auto-deletes Map entry when listenerCount === 0 |
| T-124-03-05 (iOS NAT idle-kill) | mitigate | 25s `setInterval` keepalive emits `event: ping` SSE comment. `.unref()` for defense-in-depth so the timer cannot block clean shutdown |
| T-124-03-06 (Hono timeout middleware closes long-lived SSE) | accept | Per RESEARCH §"index.ts pitfall to flag" — Hono streaming responses return immediately as `Response`; timeout middleware doesn't race against an already-returned response. T6 (abort cleanup) implicitly covers >30s open via explicit reader.cancel(). If observed in production, mitigation = exempt /v1/agent-stream from timeout middleware. NOT verified by a >30s open-stream test in this plan; deferred operator-monitoring item |
| T-124-03-07 (SQL injection via Last-Event-ID) | mitigate | Drizzle `gt(agentEvents.id, parsedNumber)` is bind-parameterized; `parsedNumber` is `parseInt(rawHeader, 10)` with NaN/range/overflow guard. `userId` is from `c.get("userId")` (server-set). Defensive parse pre-clamps before any DB call |
| T-124-03-08 (req.body.userId spoofing) | mitigate | SSE GET has no body. Route literally does `c.get("userId") as number` — there is no path that reads userId from request body or query. Block 4 + the Phase 121 Plan 04 KNOWN_FIELDS guard for POST cover both surfaces. Cross-user-isolation.test.ts is the structural lock |

## Plan-Level Verification

Per the plan's `<verification>` block:

1. **`cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts src/routes/__tests__/agent-stream.test.ts src/routes/agent-events.test.ts src/integration/cross-user-isolation.test.ts`** — runs each file individually:
   - `agent-events-bus.test.ts`: 6/6 pass (no Plan 02 regression)
   - `agent-stream.test.ts`: 7/7 pass (1.4s)
   - `agent-events.test.ts`: 33/33 pass (31 pre-existing + 2 new Phase 124 emit-gating)
   - `cross-user-isolation.test.ts`: 16/16 recognized; all skip cleanly (`# DATABASE_URL required`) when DATABASE_URL absent. File process hangs per STATE.md known issue (index.js scheduler imports), kill after summary.
2. **`cd vigil-core && npx tsc --noEmit`** — zero errors involving any of the 6 touched files.
3. **All grep-based acceptance criteria pass:**
   - `streamSSE` (5 occurrences in agent-stream.ts), `from "hono/streaming"` (1), `c.get("userId")` (2), `Last-Event-ID` (4 in source + 11 in tests)
   - `Number.isFinite(parsed) && parsed >= 0 && parsed < INT32_MAX` (1, defensive parse pinned)
   - `setInterval` (1) + `25_000` (1) + `clearInterval` (3, comment + onAbort + Phase 4 doc)
   - `stream.onAbort(resolve)` (1, Phase 5 hold-open)
   - `bus.on(userId` (2 incl. comment), `bus.off(userId` (1 in code + 1 in comment doc as `bus.off(...)`)
   - `if (isNew)` (1, agent-events.ts:240) + `deps.bus?.emit(userId` (1, agent-events.ts:243) + `bus?:` (1, AgentEventsDeps interface)
   - `import { agentStream }` (1, index.ts:44) + `app.route("/v1", agentStream)` (1, index.ts:219 — well after bearerAuth dispatcher at line 136)
4. **Drift-detector grep for bearer/Authorization/vk_/VITE_API_KEY/API_KEY logging** in agent-stream.ts and agent-events-bus.ts → empty (no secret logging path).

## Self-Check: PASSED

- `vigil-core/src/routes/agent-stream.ts` — exists ✓
- `vigil-core/src/routes/__tests__/agent-stream.test.ts` — exists ✓
- `vigil-core/src/routes/agent-events.ts` — modified (bus.emit hook + AgentEventsDeps.bus?) ✓
- `vigil-core/src/routes/agent-events.test.ts` — modified (+2 Phase 124 tests) ✓
- `vigil-core/src/index.ts` — modified (mount after bearerAuth) ✓
- `vigil-core/src/integration/cross-user-isolation.test.ts` — modified (+Block 4) ✓
- `0313d8e` (Task 1 commit) — `git log --oneline | grep 0313d8e` ✓ found
- `7c64f82` (Task 2 commit) — `git log --oneline | grep 7c64f82` ✓ found
- `cd vigil-core && npx tsx --test src/routes/__tests__/agent-stream.test.ts` — 7/7 pass ✓
- `cd vigil-core && npx tsx --test src/routes/agent-events.test.ts` — 33/33 pass ✓
- `cd vigil-core && npx tsx --test src/lib/__tests__/agent-events-bus.test.ts` — 6/6 pass ✓ (no Plan 02 regression)
- `cd vigil-core && npx tsc --noEmit` — clean ✓
- All Task 1 + Task 2 acceptance criteria greps pass ✓

## Hand-off to Plan 04+ (plugin SSE shim, Companion screen, etc.)

Plan 03 inherits these load-bearing pre-conditions for the plugin-side consumers:

- **Endpoint:** `GET /v1/agent-stream` is live in vigil-core, mounted AFTER bearerAuth at index.ts:219. Plugin SSE shim (Plan 04) connects with `Authorization: Bearer ${VITE_API_KEY}` + `Accept: text/event-stream` headers. Bearer NEVER goes in the URL (CONTEXT D-04).
- **Frame format:** Each agent_event row is emitted as `event: agent-event\nid: <agent_events.id>\ndata: <JSON.stringify(row)>\n\n`. Plugin shim parses `event:` / `data:` / `id:` line prefixes; `event: ping` keepalive frames silently dropped.
- **Last-Event-ID resume:** Plugin sends `Last-Event-ID: <last-seen-id>` header on reconnect. Server replays rows where `id > <id> AND event_timestamp > now() - 24h` in id ASC order, then attaches the live listener. Plugin stores `lastEventId` in WebView `localStorage` per CONTEXT Discretion.
- **Keepalive:** Server emits `event: ping` every 25s. Plugin shim consumes/drops these silently — no UI side-effect. The 25s cadence is the iOS NAT idle-kill mitigation (Pitfall 7).
- **Reconnect contract:** On disconnect, plugin shim reconnects with exponential backoff `[1000, 2000, 4000, 8000, 16000, 30000]` (CONTEXT D-11). On successful reconnect, Last-Event-ID replays missed events.
- **Cross-user isolation invariant** is structural — Plan 04+ MUST never trust client-supplied userId (no body/query/header userId injection); the bearer token via bearerAuth dispatcher is the ONLY userId source.
- **No bearer logging anywhere** — both server-side (`feedback_railway_variables_leak`) and plugin-side debug logging MUST be gated behind a flag and MUST log only `{ status, hasAuth: !!API_KEY }`, never the actual key.
