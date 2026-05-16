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
## 129-11 Task 4 — pre-existing test failure (stale drift test for TTL_MS)

- **Discovered during:** Task 4 (file rename validation)
- **File:** `vigil-g2-plugin/src/__tests__/main.test.ts` line ~263 — "D-129 drift: TTL constant 30 * 60 * 1000 present in helpers (via screen-state-restore import)"
- **Issue:** Test asserts `launch-source-helpers.ts` source content contains `TTL_MS` or `30 * 60 * 1000`. After `ca91f60` (fix for 129-02's build-breaker) the `TTL_MS` import was correctly dropped from `launch-source-helpers.ts` (the TTL logic lives in `pickRestoredScreen` inside `screen-state-restore.ts` instead). The drift test was not updated; it still inspects the helpers source for a literal that no longer needs to be there.
- **Status:** PRE-EXISTING — NOT caused by Plan 129-11. Confirmed by inspecting `ca91f60` (2026-05-16, pre-129-11) and re-running the test before any 129-11 edits.
- **Suggested follow-up:** Update the drift test to assert `pickRestoredScreen` is imported from `screen-state-restore.ts` in `launch-source-helpers.ts` (which already is the case), and inspect `screen-state-restore.ts` for the TTL literal — or delete the drift test entirely if redundant with `screen-state-restore.test.ts`'s direct TTL boundary tests. Out of scope for 129-11 (terminology cleanup).
