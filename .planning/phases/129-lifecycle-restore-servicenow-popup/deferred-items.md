# Phase 129 — Deferred Items

Out-of-scope discoveries logged during plan execution per the scope-boundary
rule. Do NOT fix these in their discovering plan — they belong in a follow-up
plan with their own scope.

## Discovered during Plan 129-09 execution

### TTL_MS drift test failure in `vigil-g2-plugin/src/__tests__/main.test.ts`

**Test name:** `D-129 drift: TTL constant 30 * 60 * 1000 present in helpers (via screen-state-restore import)`

**Failure surface:** the test asserts that `vigil-g2-plugin/src/lib/launch-source-helpers.ts` contains either the literal `30 * 60 * 1000` OR the symbol `TTL_MS`. As of commit `ca91f60` ("fix(129-02): add missing navigateTo import + drop unused TTL_MS"), the helpers file no longer imports or references `TTL_MS` — the TTL constant moved entirely into `screen-state-restore.ts` and the helpers file just calls `pickRestoredScreen(stored, Date.now())` which encapsulates the TTL check internally.

**Root cause:** the D-129 drift test was authored when TTL_MS was inlined or imported in helpers; the 129-02 ride-along refactor removed the symbol from helpers without updating the drift test.

**Recommended fix:** update the drift test in `vigil-g2-plugin/src/__tests__/main.test.ts:259-268` to assert either (a) `pickRestoredScreen` is imported in helpers (the new abstraction boundary), or (b) the TTL literal exists in `screen-state-restore.ts` (the new home of the constant), or just delete this drift test since the TTL is now properly encapsulated.

**Why deferred:** this failure is unrelated to the WORK_ORDERS DOUBLE_CLICK gesture wiring this plan addresses; it existed in `main` before plan 129-09 started (107/108 baseline). Fixing it would expand 129-09 beyond its stated scope.

**Suggested ownership:** Plan 129-10 (G2 restore diagnostic) or a small standalone follow-up — the test belongs to the G2-LIFECYCLE-01 drift surface, not GAP-129-F.
