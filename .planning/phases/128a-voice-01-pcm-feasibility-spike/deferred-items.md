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
