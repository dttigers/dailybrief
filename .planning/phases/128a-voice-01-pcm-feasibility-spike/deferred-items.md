# Phase 128a — Deferred Items

Tracking out-of-scope issues discovered during execution.

## Pre-existing test failure (not caused by Plan 128a-02)

**File:** `vigil-core/src/lib/ai-budget.test.ts`
**Failing test:** `secondary assertion: console.error captures 'withBudgetTracking accumulator failed' string when accumulator path throws` (line 211)

**Verification:** Reproduced on pristine main BEFORE landing voice-spike.ts (via `git stash`). Failure pre-dates this plan; out of scope per executor's SCOPE BOUNDARY rule.

**Suggested owner:** Phase 127 follow-up (the test pins the budget-accumulator catch path landed in GUARD-03). Likely a console.error capture-method drift (e.g. `t.mock.method(console, 'error', ...)` not being installed on the right binding) introduced by an unrelated change between Phase 127 ship and 2026-05-12.

**Impact on Phase 128a:** None. Plan 128a-02's success criterion is "all 4 regression rails still pass." Audio-cap, audio-log-redaction, and audio-session-guard rails all pass. ai-budget rail's failure is structural-not-functional (the per-user budget chokepoint itself works — only the secondary log-string assertion fails) and pre-dates this plan.

## Pre-existing TypeScript compile error (not caused by Plan 128a-02)

**File:** `vigil-core/src/lib/ai-budget.test.ts:138`
**Error:** `TS2345: Argument of type '() => Promise<{ ok: boolean; }>' is not assignable to parameter of type '() => Promise<{ usage?: ... }>'`

**Verification:** Same pre-existing state as the runtime failure above. The new `voice-spike.ts` and `transcribe-spike.ts` both compile cleanly under `npx tsc --noEmit -p tsconfig.json`.

**Impact on Phase 128a:** None — `tsx --test` ignores the type error and runs the tests at runtime.

## CORS regex too narrow for LAN dev (surfaced 2026-05-12 during Plan 06 pre-flight)

**Issue:** `vigil-core/src/index.ts:109` `LOOPBACK_ORIGIN_RE` only auto-allows `127.0.0.1` / `localhost`. When developing the plugin via `vite dev --host 0.0.0.0` + Even Hub QR scan, the iPhone WebView loads from a LAN IP (e.g. `http://192.168.1.212:5173`), which is rejected by CORS even though the origin is RFC1918-private.

**Workaround used in 128a:** added the specific LAN origin to Railway `CORS_ORIGINS` env var, removed post-spike.

**Phase 130 fix:** widen the regex to also match RFC1918 ranges (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`) when an `ALLOW_LAN_DEV=true` env flag is set. Keep production deploys without the flag so prod CORS stays tight.

**Why deferred (not 128a scope):** Phase 130 productionizes voice path; CORS fix belongs there.
