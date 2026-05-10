---
phase: 124-g2-companion-hud-websocket-fan-out-launch-source-home-overflow-polish
plan: 06
subsystem: vigil-g2-plugin
tags: [phase-124, plugin, sse-shim, transport, agent-api-03, agent-hud-01]

# Dependency graph
requires:
  - plan: 124-03
    provides: GET /v1/agent-stream SSE endpoint (server-side fan-out from per-userId EventEmitter bus). This plan consumes that endpoint with a hand-rolled WKWebView SSE shim — bearer in Authorization header, Last-Event-ID resume, exponential backoff, ping silent drop.
  - plan: 124-01
    provides: tsx devDep + plugin test layout (src/lib/__tests__/) — sse-client tests scaffold under that layout
  - file: vigil-g2-plugin/src/api.ts
    provides: VITE_API_URL/VITE_API_KEY env plumbing + Authorization header pattern — sse-client mirrors the Bearer header construction verbatim and reuses the same VITE_API_KEY env
provides:
  - vigil-g2-plugin/src/lib/sse-client.ts — createSseClient(opts) factory + parseFrame + BACKOFF_MS
  - vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts — 13 unit tests covering parser correctness, BACKOFF_MS lock, bearer hygiene, Last-Event-ID persistence, QuotaExceededError survival, ping silent drop, state callback transitions, backoff timing schedule, backoffIndex reset on success
  - vigil-g2-plugin/src/types.ts — AgentEventType (5-value union), AgentEvent, AgentSessionRow shapes mirroring vigil-core/src/routes/agent-events.ts:64-74
affects: [124-07, 124-08, 124-09]  # Plan 07 Companion screen consumes onEvent/onStateChange callbacks; Plan 08 onLaunchSource integration; Plan 09 E2E verification

# Tech tracking
tech-stack:
  added: []  # Zero new runtime npm deps preserved (D-04 posture)
  patterns:
    - "Hand-rolled SSE shim with fetch() + ReadableStream.getReader() + TextDecoder({stream:true}) + manual frame parser — replaces native EventSource because EventSource cannot set the Authorization header (WHATWG spec only allows browser-controlled cookies). Bearer goes in header, never URL — preserves memory feedback_railway_variables_leak posture"
    - "createSseClient(opts) factory returns { connect, disconnect } — DI seam pattern: storage/fetchFn/sleepFn injectable for unit tests, defaults to globalThis.localStorage / globalThis.fetch / setTimeout-backed sleep in production"
    - "parseFrame(frame): line-prefix-based SSE parser — handles event:, data: (multi-line concatenated with \\n), id:, comment lines (':' prefix per WHATWG spec)"
    - "AbortController-on-disconnect — fetch in-flight request is aborted via signal; loop exits cleanly via stopped check"
    - "safeWriteStorage(storage, key, value) — try/catch around setItem to survive QuotaExceededError (RESEARCH Pitfall 4); replay still works on next reconnect via the next event we receive"
    - "Backoff schedule lock [1000, 2000, 4000, 8000, 16000, 30000] (D-11) with cap-and-stay-at-30s; resets to backoffIndex=0 on successful 200 OK before EOF"
    - "Single-flight loop guard via loopRunning boolean — prevents concurrent loop() invocations if connect() called twice"

key-files:
  created:
    - vigil-g2-plugin/src/lib/sse-client.ts
    - vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts
  modified:
    - vigil-g2-plugin/src/types.ts

key-decisions:
  - "Test isolation pattern for never-resolving streams — makeNeverResolvingResponse(signal) wires the shim's AbortController through to a manually-created ReadableStream's controller.error(), so tests that simulate 'subsequent reconnect attempt' can let the shim sit in reader.read() without deadlocking the test runner at process exit. Without this signal-wired error path, the abort doesn't propagate to the manual stream and reader.read() awaits forever, keeping the Node event loop alive past the test runner's expected exit"
  - "sleepFn injection contract uses `(ms) => Promise<void>` AND tests pass functions that always schedule a setTimeout(0) inside the executor — pure synchronous resolution would cause microtask starvation (the test's polling loop with setTimeout(5) never gets a turn against an instantly-resolving sleepFn). This is a TEST contract, not a shim contract — production sleepFn is `defaultSleep` which always uses setTimeout"
  - "Backoff increment uses Math.min(backoffIndex + 1, BACKOFF_MS.length - 1) — keeps backoffIndex in valid range. After successful connect resets to 0, the very next disconnect uses BACKOFF_MS[0]=1000 again (test 13 pins this). Cap behavior pinned by test 12 (sleeps[6+] all === 30000)"
  - "All Authorization-bearing console.log paths are grep-detector-free by construction — drift detector grep `console.*(Authorization|Bearer|vk_|VITE_API_KEY|API_KEY)` returns empty against sse-client.ts. Comments at top of file explicitly call out the security posture so future debug-logging additions are flagged at review time"
  - "Pre-existing tsc errors in test files (`Cannot find module 'node:test'`) are accepted carry-forward from Plan 04 baseline — they do not affect the runtime tsx loader which resolves node: imports at execution time. Acceptance criteria scopes tsc cleanliness to src/lib/sse-client.ts and src/types.ts only (zero errors involving these two files)"

patterns-established:
  - "Hand-rolled fetch+ReadableStream SSE shim pattern — establishes the canonical reference for any future WKWebView (or browser-tab) consumer that needs to send Authorization headers on a long-lived stream. Future ride-alongs that add more SSE consumers (e.g., live notifications, voice streaming) reuse the same parseFrame + AbortController + BACKOFF_MS + Last-Event-ID skeleton"
  - "makeNeverResolvingResponse(signal) test helper for shims with AbortController — any future test that needs 'open this stream and let it sit until aborted' should follow the same signal→ctrl.error wire pattern"
  - "DI factory with injectable storage/fetchFn/sleepFn for transport shims — pattern to mirror in any future plugin-side network primitive (e.g., a future WebSocket shim if/when SDK supports it)"

requirements-completed: [AGENT-API-03, AGENT-HUD-01]
# AGENT-API-03 — client-side consumer of the SSE fan-out is now operational; Plan 03 shipped server-side. Plugin's HUD (Plan 07) wires onEvent/onStateChange to drive the offline indicator + content updates.
# AGENT-HUD-01 dependency satisfied — the onStateChange(connected: boolean) callback is the offline-indicator surface; Companion screen consumes it.

threats-mitigated: [T-124-06-01, T-124-06-02, T-124-06-03, T-124-06-04, T-124-06-05]
threats-accepted: [T-124-06-06]
# T-124-06-06 (server emits frame with id from another user) is structurally a SERVER concern — Plan 03's bus.on(userId, ...) Map<userId, EventEmitter> isolation enforces it. Plugin shim trusts the server's per-userId stream by virtue of bearer auth.

# Metrics
duration: 26min
completed: 2026-05-10
tasks: 2
files: 3
---

# Phase 124 Plan 06: WKWebView SSE shim (D-04 + D-11) Summary

**Hand-rolled fetch + ReadableStream + TextDecoder SSE shim that consumes vigil-core's `GET /v1/agent-stream` endpoint (Plan 03 server-side) with bearer in Authorization header (NEVER URL), Last-Event-ID resume from `localStorage['vigil:lastEventId']`, exact `[1000, 2000, 4000, 8000, 16000, 30000]` exponential backoff schedule (D-11), AbortController-driven disconnect, `event: ping` keepalive frames silently dropped, and `safeWriteStorage` try/catch for QuotaExceededError survival. 13 unit tests pin parser correctness, backoff lock, bearer hygiene, Last-Event-ID persistence, and reset-on-success behavior. Full plugin suite green (19/19 — smoke + sse-client + Plan 04 home drift detector).**

## Performance

- **Duration:** ~26 minutes
- **Started:** 2026-05-10T01:23:33Z
- **Completed:** 2026-05-10T01:49:10Z
- **Tasks:** 2 (both `type=auto tdd=true` — source + tests in same task per plan structure)
- **Files created:** 2 (sse-client.ts ~155 lines source, sse-client.test.ts ~366 lines tests)
- **Files modified:** 1 (types.ts — appended AgentEventType + AgentEvent + AgentSessionRow)
- **Test runtime:** 1.2s for sse-client tests alone; 1.17s for full plugin suite (npm test) — process exits cleanly with code 0 (no test-runner hang)

## Accomplishments

- **`GET /v1/agent-stream` consumer is live** in vigil-g2-plugin via `createSseClient(opts)`. Mirrors api.ts:5-21 auth header pattern: `Authorization: Bearer ${opts.apiKey}` + `Accept: text/event-stream` + optional `Last-Event-ID: <persisted>`. Bearer NEVER appears in the URL — drift detector test asserts `!capturedUrl.includes("vk_TESTKEY_1234")` on every fetch invocation.
- **Frame parser locked** per WHATWG SSE spec:
  - `parseFrame(frame: string): { event, data, id }` — splits on `\n`, line-prefix-based
  - `event:` → trimmed value (default `"message"`)
  - `data:` → trimmed value, multi-line concatenated with `\n`
  - `id:` → trimmed value (default `null`)
  - `:` prefix → SSE comment, skipped
  - Tested across 5 scenarios: single-line data, multi-line data, comment skip, event:ping recognition, missing id → null
- **BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] (D-11) locked structurally:**
  - Test 6 asserts `[...BACKOFF_MS]` deepEquals the exact array
  - Test 12 simulates 7+ disconnects, asserts sleeps[0..5] match the array verbatim and all subsequent sleeps cap at 30000
  - Test 13 simulates failure → failure → success → failure: asserts sleeps[2]=1000 (success resets backoffIndex)
- **Last-Event-ID persistence in WebView localStorage** under key `vigil:lastEventId` per CONTEXT Discretion:
  - Test 8 asserts `storage.getItem("vigil:lastEventId") === "42"` after a frame with `id: 42`
  - Test 9 asserts `Last-Event-ID: 99` header sent on reconnect when storage prepopulated
  - Test 10 asserts onEvent still fires when `setItem` throws QuotaExceededError (RESEARCH Pitfall 4) — `safeWriteStorage` wraps the call in try/catch
- **AbortController-driven disconnect** — `disconnect()` sets `stopped=true` AND calls `abortController?.abort()`. The shim's `signal` is passed to `fetchFn`, so the in-flight fetch is aborted. The loop's `await reader.read()` rejects, catch block checks `if (stopped) return;`, loop exits cleanly. No listener/stream leaks across reconnects.
- **`event: ping` keepalive frames silently dropped** — server emits every 25s per Plan 03 hand-off; the parser recognizes `event: ping` (test 4) and the loop's `if (parsed.event === "ping") continue;` skips before `onEvent` is called. Test 11 confirms the events array contains only the agent-event id, no ping pollution.
- **`onStateChange(connected: boolean)` callback wires the Companion screen's offline indicator** (Plan 07 dep):
  - `(true)` fires on first 200 OK response
  - `(false)` fires on disconnect (network error, non-2xx, EOF)
  - Test 11 asserts `states.includes(true)` after the first successful response
- **TypeScript types extended:**
  - `AgentEventType` — 5-value union pinned to Phase 122 D-01 drift detector (`needs_input | task_complete | task_failed | milestone | heartbeat`)
  - `AgentEvent` — `{ event: AgentEventType; message: string | null; eventTimestamp: string }` mirrors vigil-core's response shape
  - `AgentSessionRow` — `{ sessionId, label, host, lastEvent, eventCount }` mirrors vigil-core/src/routes/agent-events.ts:64-74
- **Zero new runtime npm deps** — D-04 posture preserved. Plugin runtime deps remain `@evenrealities/even_hub_sdk` only.
- **Bearer drift detector empty:** `grep -E "console.*(Authorization|Bearer|vk_|VITE_API_KEY|API_KEY)" vigil-g2-plugin/src/lib/sse-client.ts` returns empty. Memory `feedback_railway_variables_leak` posture preserved.
- **`npx tsc --noEmit` clean for sse-client.ts and types.ts** — zero errors involving either of the two target files. Pre-existing baseline errors in test files (`Cannot find module 'node:test'` from Plan 04) carry forward unchanged — out of scope per executor scope-boundary.

## Task Commits

Each task was committed atomically:

1. **Task 1: SSE shim source + types extension** — `a6d1846` (feat)
   - `vigil-g2-plugin/src/lib/sse-client.ts` (NEW, ~155 lines)
   - `vigil-g2-plugin/src/types.ts` (modified — appended AgentEventType + AgentEvent + AgentSessionRow at end)
2. **Task 2: SSE shim unit tests** — `a3dff3c` (test)
   - `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts` (NEW, ~366 lines, 13 tests)

_Note: Plan-metadata commit follows below this SUMMARY._

## Files Created/Modified

- `vigil-g2-plugin/src/lib/sse-client.ts` (created, 155 lines): `createSseClient(opts)` factory returns `{ connect, disconnect }`. Internal `loop()` async function with single-flight guard (`loopRunning` boolean). `parseFrame(frame)` exported helper. `BACKOFF_MS` exported readonly tuple. `safeWriteStorage(storage, key, value)` private helper. Defaults for storage/fetchFn/sleepFn injected via `opts.??` fallback chain. Header construction matches api.ts:5-21 verbatim — bearer in Authorization, Accept set to text/event-stream, optional Last-Event-ID from storage. Loop body: fetch → onStateChange(true) + backoffIndex=0 → reader.read() loop with TextDecoder({stream:true}) + buffer.indexOf("\n\n") frame split → parseFrame → event:ping continue OR event:agent-event with id → safeWriteStorage + onEvent. EOF / non-200 / fetch reject → onStateChange(false) → backoff sleep → reconnect.
- `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts` (created, ~366 lines): 13 node:test cases. Helpers: `fakeStorage()` with `_throwOnSet` seam (returns `Pick<Storage, "getItem"|"setItem">` with internal Map + boolean flag); `makeStreamResponse(chunks)` returns 200 OK Response with ReadableStream that enqueues each chunk then closes; `makeNeverResolvingResponse(signal)` returns 200 OK Response with ReadableStream whose `start(ctrl)` wires the abort signal to `ctrl.error(AbortError)` so the shim's disconnect-via-AbortController properly cleans up the test's manually-created stream. Test sleepFn injects record sleeps + always schedule `setTimeout(r, 0)` inside the Promise executor to prevent microtask starvation against the test's polling loop. Each test calls `client.disconnect()` then awaits a 10ms drain so the next test runs in a clean state.
- `vigil-g2-plugin/src/types.ts` (modified, +24 lines appended): No changes to existing exports (`VigilSummary`, `VigilBrief`, `VigilAffirmation`, `VigilPrioritized`). Appended `AgentEventType` (5-value union), `AgentEvent` (`{ event, message, eventTimestamp }`), `AgentSessionRow` (`{ sessionId, label, host, lastEvent, eventCount }`). Companion screen + sse-client both consume these.

## Decisions Made

- **Test sleepFn always schedules a setTimeout(0)**, even when "instant" is the intended semantic. Pure synchronous Promise resolution causes microtask starvation — the test's polling loop with `setTimeout(r, 5)` cannot fire while the shim's loop spins through fetchFn-throws → sleepFn-resolves cycles. This was discovered when isolated test 13 ran successfully but the same test in the full suite hung the runner; `setTimeout(0)` inside the sleepFn executor restored macrotask yield. Pattern locked: all test sleepFn injections must yield via setTimeout, not pure resolved promises.
- **`makeNeverResolvingResponse(signal)` is the canonical helper for "subsequent reconnect" tests.** Without wiring the signal to `ctrl.error()`, the shim's AbortController-on-disconnect doesn't propagate to manually-created ReadableStreams, and `reader.read()` awaits forever — keeping the Node process alive past the test runner's expected exit. Wire pattern: `signal.addEventListener("abort", () => ctrl.error(new DOMException("aborted", "AbortError")), { once: true })` inside `start(ctrl)`.
- **Drain 10ms between tests via `await new Promise(r => setTimeout(r, 10))`** — gives the SSE client's loop a tick to fully exit after `disconnect()` so the next test starts in a clean state. Without this, the previous test's loop's pending setTimeout(0) sleep can still fire during the next test's fetch sequence, causing cross-test interference.
- **Backoff increment via `Math.min(backoffIndex + 1, BACKOFF_MS.length - 1)` keeps backoffIndex in valid array range** — the wait lookup uses `Math.min(backoffIndex, BACKOFF_MS.length - 1)` for symmetry. After 5 failures, backoffIndex=5 → BACKOFF_MS[5]=30000; 6th failure uses backoffIndex=5 (capped) → BACKOFF_MS[5]=30000. Test 12 pins all 7+ subsequent sleeps at 30000.
- **Successful connect explicitly sets `backoffIndex = 0` BEFORE entering the reader.read() loop** — this means even a 1-byte response that immediately EOFs will reset the backoff schedule. Test 13 pins this: failure → failure → empty-stream success → next failure uses BACKOFF_MS[0]=1000, not BACKOFF_MS[2]=4000. Behavior matches CONTEXT D-11 "On successful reconnect ... the ⚠ clears, and the HUD updates to current state" — the offline indicator clears as soon as we get a 200 OK, not after we receive a frame.
- **`safeWriteStorage` wraps the storage.setItem call in try/catch** with an empty catch body — RESEARCH Pitfall 4 says replay still works on next reconnect via the next event we receive (the missing persist won't lose data, only delay one resume cycle). Test 10 pins this: setItem throws → onEvent still fires → loop continues without crash.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test isolation: makeStreamResponse closures shared across reconnect attempts caused infinite onEvent re-fires**

- **Found during:** Task 2 — initial test run showed `onStateChange(true) on first 200 OK; ping frames dropped silently` failing because the events array was `['5', '5', '5', ...×27]` instead of `['5']`.
- **Issue:** The test's `fetchFn = async () => makeStreamResponse([chunks])` returns a NEW Response each call. Each new Response means the chunks are sent again from index 0. The shim correctly parses them, calls onEvent, then EOFs. The loop reconnects, gets the same chunks again. Repeats until disconnect. By the time `await new Promise((r) => setTimeout(r, 50))` resolves, the loop has reconnected ~27 times.
- **Fix:** Track `let calls = 0` in fetchFn; first call returns the test chunks, subsequent calls return `makeNeverResolvingResponse(init?.signal ?? null)` — a 200 OK Response whose body never enqueues / never closes, but whose abort signal is wired to `ctrl.error()`. After disconnect, the abort propagates through the stream, `reader.read()` rejects, loop exits cleanly. This pattern is reused across 3 tests (lastEventId persists, ping silent drop, QuotaExceededError survival).
- **Files modified:** `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts`
- **Commit:** `a3dff3c` (folded into Task 2 since it was discovered during test development)

**2. [Rule 1 - Bug] Microtask starvation in test 13 (resets backoffIndex) when sleepFn resolves synchronously**

- **Found during:** Task 2 — `successful connect resets backoffIndex` test ran in isolation but hung the test runner when test 12 (`disconnect → backoff schedule`) ran first. Investigation: test 12's sleepFn was `async (ms) => { sleeps.push(ms); if (sleeps.length >= 7) await setTimeout(0); }` — for the first 6 calls it resolved synchronously. The shim's loop with synchronously-throwing fetchFn + synchronously-resolving sleepFn forms a microtask-only spin that monopolizes the queue. The test's polling loop `await new Promise(r => setTimeout(r, 5))` cannot fire (macrotask) until the microtask queue drains.
- **Fix:** Restructure both backoff tests to use `sleepFn: (ms) => new Promise<void>((r) => { sleeps.push(ms); ...; setTimeout(r, 0); })` — every call yields a macrotask boundary. Polling loop now interleaves correctly with the shim's loop.
- **Files modified:** `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts`
- **Commit:** `a3dff3c`

**3. [Rule 1 - Bug] Test 13 missing fetchFn injection caused fallback to globalThis.fetch**

- **Found during:** Task 2 — after fixing #1 and #2, test 13 still failed with `sleeps[2] === 4000` instead of `1000`. Debug prints showed `events: []` — the fetchFn (which records `fetch(succeed=...)` calls) was NEVER invoked. Investigation: the createSseClient call in test 13 omitted `fetchFn` in the options object. The shim's fallback `opts.fetchFn ?? globalThis.fetch.bind(globalThis)` activated globalThis.fetch, which sent real HTTP requests to `http://x/v1/agent-stream`. Those requests fail with the actual underlying error (DNS lookup), the catch block fires, sleepFn runs. The succeed-flip logic in the test's fetchFn never executed because the test's fetchFn was never wired up.
- **Fix:** Add `fetchFn,` to test 13's `createSseClient({...})` options literal. After the fix, fetchFn is invoked correctly: failure → failure → success-flip → empty stream → backoffIndex reset → 1000ms sleep. Test 13 passes.
- **Files modified:** `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts`
- **Commit:** `a3dff3c`

No Rule 2, Rule 3, or Rule 4 deviations. No architectural changes; all three deviations are test-mechanics fixes that preserve the plan's intent verbatim.

## Issues Encountered

- **Pre-existing tsc baseline errors in test files** carried forward from Plan 04: `Cannot find module 'node:test'`, `Cannot find module 'node:assert/strict'`, `Cannot find module 'node:fs'`, etc. These appear in `src/__tests__/smoke.test.ts` (Plan 01 baseline) and `src/screens/__tests__/home.test.ts` (Plan 04 baseline). They do NOT affect the runtime tsx loader (which resolves `node:` imports at execution time — npm test passes 19/19). Acceptance criteria scopes tsc cleanliness to `src/lib/sse-client.ts` and `src/types.ts` only — both are clean.
  - **Tracked in:** `.planning/STATE.md` Decisions section: "[Phase 124 / Plan 04]: Tsc baseline accepted — pre-existing 2 errors in `src/__tests__/smoke.test.ts` (missing node:test / node:assert/strict types) carry forward from Plan 01 baseline; out-of-scope per executor scope-boundary"
  - **Resolution path:** Future plan can install `@types/node` as a devDep to resolve all `node:*` import type errors. Out of scope for this plan.

## Threat Mitigations

| Threat ID | Disposition | Verified by |
|-----------|-------------|-------------|
| T-124-06-01 (Bearer key in URL → leaks to Railway HTTP-access logs) | mitigate | Test 7 (`bearer in Authorization header, NEVER in URL`) asserts `!capturedUrl.includes("vk_TESTKEY_1234")` AND `Authorization === "Bearer vk_TESTKEY_1234"`. Drift grep on sse-client.ts: no `?token=` / `?api_key=` / `${apiKey}?` patterns |
| T-124-06-02 (Bearer key in console.log / error message) | mitigate | Drift grep `grep -E "console.*(Authorization\|Bearer\|vk_\|VITE_API_KEY\|API_KEY)" sse-client.ts` returns empty. Error path uses status-only `new Error(`SSE HTTP ${res.status}`)` — never response body, never headers. Comment block at top of sse-client.ts explicitly adopts memory `feedback_railway_variables_leak` posture |
| T-124-06-03 (localStorage QuotaExceededError crashes the loop) | mitigate | `safeWriteStorage` wraps setItem in try/catch with empty body. Test 10 (`storage.setItem QuotaExceededError does not crash the loop`) sets `_throwOnSet=true` then asserts `received === true` — onEvent fires despite the throw, loop continues |
| T-124-06-04 (Reconnect storm with no backoff) | mitigate | BACKOFF_MS lock (test 6) + cap-at-30s behavior (test 12 sleeps[6+] all 30000) + reset-on-success (test 13 sleeps[2]=1000 after success). Backoff sleep is mandatory between every disconnect-reconnect cycle — no fast-path bypass |
| T-124-06-05 (Multi-byte UTF-8 character split across reader chunks corrupts data) | mitigate | `TextDecoder("utf-8")` constructed with default `fatal=false`, `decode(value, { stream: true })` flag preserves partial multi-byte sequences across calls per WHATWG decode spec. Frame parsing operates on the assembled buffer (`buffer += decoder.decode(...)`), not per-chunk — frames split across multiple reader.read() chunks parse correctly because indexOf("\n\n") only matches when both bytes have arrived |
| T-124-06-06 (Server emits frame with id from another user — cross-user leak) | accept | Server-side concern — Plan 03's `bus.on(userId, ...)` Map<userId, EventEmitter> structurally enforces isolation. Plugin shim trusts the server's per-userId stream by virtue of bearer auth. If the bearer is compromised, the server is also compromised; plugin can't independently verify userId. Mirrored disposition from CONTEXT D-04 + T-124-03-01 (Plan 03's threat register) |

## Threat Flags

No new threat surface introduced beyond what's in the plan's threat model. The shim is a pure-consumer transport — no new network endpoints, no auth paths (the bearer is reused from existing api.ts plumbing), no schema changes, no file-access patterns. The only state surface is `localStorage['vigil:lastEventId']` which is a small integer string with no PII (already cleared in T-124-06-02 trust boundary table).

## Plan-Level Verification

Per the plan's `<verification>` block:

1. **`cd vigil-g2-plugin && npx tsc --noEmit`** — zero errors involving sse-client.ts or types.ts (clean):
   ```
   $ npx tsc --noEmit 2>&1 | grep -E "src/(lib/sse-client|types)\.ts"
   (empty)
   ```
   Pre-existing baseline errors in test files unchanged (Plan 04 baseline carry-forward).
2. **`cd vigil-g2-plugin && npx tsx --test src/lib/__tests__/sse-client.test.ts`** — 13/13 pass in 1.2s, EXIT=0:
   ```
   ℹ tests 13
   ℹ pass 13
   ℹ fail 0
   ℹ duration_ms ~1000
   ```
3. **`cd vigil-g2-plugin && npm test`** — full plugin suite green, 19/19 pass in 1.17s, EXIT=0:
   ```
   ✔ smoke: node:test runner executes
   ✔ smoke: TypeScript types compile under tsx loader
   ✔ parseFrame: single-line data
   ✔ parseFrame: multi-line data joined with \n
   ✔ parseFrame: comment lines (':' prefix) skipped
   ✔ parseFrame: event: ping recognized so loop can drop it
   ✔ parseFrame: missing id returns null
   ✔ BACKOFF_MS schedule is exactly [1000, 2000, 4000, 8000, 16000, 30000] (D-11)
   ✔ bearer in Authorization header, NEVER in URL
   ✔ after a successful agent-event frame, lastEventId persists to storage
   ✔ on reconnect, Last-Event-ID header is sent from storage
   ✔ storage.setItem QuotaExceededError does not crash the loop
   ✔ onStateChange(true) on first 200 OK; ping frames dropped silently
   ✔ disconnect → backoff schedule increments through array, capped at 30000
   ✔ successful connect resets backoffIndex (next disconnect waits 1000 again)
   ✔ G2-POLISH-07 drift: bodyContent array has exactly 4 entries
   ✔ G2-POLISH-07 drift: home.ts does not reference DIVIDER (excluding comments)
   ✔ G2-POLISH-07 drift: home.ts does not reference affirmation parameter
   ✔ G2-POLISH-07 drift: buildHomeScreen takes one parameter (summary)
   ```
4. **All grep-based bearer-hygiene acceptance criteria pass:**
   - `BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000]` (1 occurrence in sse-client.ts source + 1 in JSDoc comment)
   - `Authorization` (3 occurrences incl. JSDoc), `Bearer ${opts.apiKey}` (1 occurrence at the header construction site)
   - `Last-Event-ID` (2 occurrences — JSDoc + conditional header set)
   - `vigil:lastEventId` (2 occurrences — JSDoc + STORAGE_KEY constant)
   - `TextDecoder` + `getReader()` both present
   - `event === "ping"` (1 occurrence — silent drop branch)
   - `AbortController` (3 occurrences — declaration, instantiation, signal pass-through)
   - `safeWriteStorage` (function name implies the try/catch — both definition and call site present)
   - `console.*(Authorization|Bearer|vk_|VITE_API_KEY|apiKey)` grep returns empty — drift detector clean
   - `(?token=|?api_key=|${.*apiKey.*}.*?)` grep returns empty — bearer never in URL pattern
   - `AgentSessionRow` + `AgentEventType` both present in types.ts

## Self-Check: PASSED

- `vigil-g2-plugin/src/lib/sse-client.ts` — exists ✓ (155 lines)
- `vigil-g2-plugin/src/lib/__tests__/sse-client.test.ts` — exists ✓ (366 lines, 13 tests)
- `vigil-g2-plugin/src/types.ts` — modified (AgentEventType + AgentEvent + AgentSessionRow appended) ✓
- `a6d1846` (Task 1 commit) — `git log --oneline | grep a6d1846` ✓ found
- `a3dff3c` (Task 2 commit) — `git log --oneline | grep a3dff3c` ✓ found
- `cd vigil-g2-plugin && npx tsx --test src/lib/__tests__/sse-client.test.ts` — 13/13 pass, EXIT=0 ✓
- `cd vigil-g2-plugin && npm test` — 19/19 pass, EXIT=0 ✓ (no Plan 01/04 regression)
- `cd vigil-g2-plugin && npx tsc --noEmit` — zero errors involving sse-client.ts or types.ts ✓
- All Task 1 + Task 2 acceptance criteria greps pass ✓
- All 9 plan-level success criteria pass ✓

## Hand-off to Plan 07+ (Companion screen, onLaunchSource integration)

Plan 06 inherits these load-bearing pre-conditions for the plugin-side downstream consumers:

- **API:** `import { createSseClient } from "../lib/sse-client.ts"` (or `./lib/sse-client.ts` from main.ts). Returns `{ connect(): void; disconnect(): void }`. Caller passes `{ url, apiKey, onEvent, onStateChange? }` plus optional injection seams.
- **URL convention:** Plan 07 should construct the URL as `${import.meta.env.VITE_API_URL || 'http://localhost:3001/v1'}/agent-stream` to match api.ts's BASE_URL pattern. NEVER append the bearer to the URL.
- **Bearer source:** `import.meta.env.VITE_API_KEY` (the same env-var as fetchSummary/fetchBrief/fetchAffirmation). Pass to `createSseClient({ apiKey: VITE_API_KEY, ... })`. Bearer goes ONLY in the Authorization header — verified structurally.
- **Connection state surface:** `onStateChange?: (connected: boolean) => void`. Companion screen wires this to its offline indicator: `(false)` → display `⚠` glyph in header rightSide; `(true)` → clear the glyph and let the default HH:MM clock or session N/M indicator render.
- **Event surface:** `onEvent: (id: string, data: string) => void`. `data` is the raw JSON body of the SSE frame's `data:` line — Companion screen parses `JSON.parse(data) as DrizzleAgentEvent` (or the canonical `AgentSessionRow` if vigil-core is sending the row directly). Plan 07 owns the parse + `activeSessions: Map<sessionId, AgentSessionRow>` state cache mutation.
- **Last-Event-ID storage** is per-userId-implicit (single-user UI today; bearer key already binds to userId server-side). Plan 07 doesn't need to manage this — the shim handles persistence + restore transparently. If Plan 07 introduces a settings UI that changes the bearer, it should call `localStorage.removeItem('vigil:lastEventId')` to avoid replaying another user's events on first connect (deferred per CONTEXT — "Cleared on bearer change is OK to skip for now").
- **Disconnect contract:** Plan 07's screen lifecycle should call `client.disconnect()` on unmount/teardown. Idempotent (multiple calls are safe). After disconnect, the loop exits within ~10ms (drain time observed in tests).
- **No new env vars** — `VITE_API_URL` and `VITE_API_KEY` are the only env touchpoints. No plumbing changes required in `vite-env.d.ts`.
