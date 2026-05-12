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

## `e2e_ms` metric-definition bug (surfaced 2026-05-12 during Run 1 analysis)

**Issue:** `vigil-g2-plugin/src/screens/voice-spike.ts:272-273` computes `e2e_ms` as `Date.now() − micOnStartedAt`. `micOnStartedAt` is set when DOUBLE_CLICK *starts* the recording, so the resulting `e2e_ms` includes the entire recording duration, not just the stop→HTTP round-trip.

**Impact on D-M1:** the metric VOICE-06's 8-second acceptance criterion describes (operator-perceived latency: DOUBLE_CLICK-to-stop → server response) is `stop→HTTP_ms`, not the start-anchored value the code logs. For Run 1's ~5s clips this over-counts the latency by ~5s; for Run 2's near-cap clip it over-counted by ~56.8s.

**Spike-time correction:** `stop→HTTP_ms = recorded_e2e_ms − (chunks × 100ms)` — applied inline in `128a-MEASUREMENTS.md` Run 1 table (per-trial column) and Run 2 summary. The verdict reads the corrected values.

**Phase 130 fix:** capture `micStoppedAt = Date.now()` in `toggleVoiceSpikeRecording` at the STOP branch (just after `safeAudioControl(false)`), then log `stop_http_ms = Date.now() − micStoppedAt` directly. Drop the start-anchored field or rename it `recording_to_response_ms` to disambiguate.

**Why deferred:** this is a measurement-instrumentation correctness improvement, not a functional bug — the spike's verdict already uses the corrected math. Phase 130 hardening is the right place to land the fix because Phase 130 is rewriting/replacing this screen anyway (file is marked TOSSABLE in its banner).

## End-of-spike: bulk-delete g2_voice test thoughts

Spike runs (Run 1 ×10 short clips, Run 2 ×1 near-cap, Run 5 battery-delta ×10 push-to-record) generate `source='g2_voice'` test thoughts in production. Operator deferred cleanup until after Run 5 completes (single sweep beats incremental cleanup).

**Cleanup SQL** (Supabase MCP — soft-delete; verify `deleted_at` column exists first):
```sql
UPDATE thoughts SET deleted_at = NOW() WHERE source = 'g2_voice' AND created_at > '2026-05-12T20:00:00Z' AND deleted_at IS NULL;
```

**Cleanup date target:** 2026-05-12 or whenever Run 5 completes.
