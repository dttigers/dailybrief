---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
plan: 03
subsystem: server-suppression-bus
tags: [phase-125, wave-1, server, suppression, bus, isolation]
requirements: [AGENT-HUD-03]
dependency_graph:
  requires:
    - "Plan 01 RED placeholders (vigil-core/src/lib/quiet-mode-suppression.test.ts + agent-events-bus.test.ts PLAN_03_BUS)"
  provides:
    - "vigil-core/src/lib/quiet-mode-suppression.ts (suppressionQueue.shouldSuppress / flush / _size / _clearAll)"
    - "vigil-core/src/lib/agent-events-bus.ts (bus.emitQuiet / onQuiet / offQuiet + joint cleanup gate)"
  affects:
    - "Plan 05 (vigil-core /v1/quiet-mode handler + agent-stream integration) — composes both primitives"
tech_stack:
  added: []
  patterns:
    - "Module-scope Map<userId, Map<sessionId, Map<eventType, Row>>> — same userId-keying invariant as agent-events-bus.ts"
    - "Map.set overwrite for last-of-each-kind (T-125-03 cap, no per-emit allocation)"
    - "EventEmitter joint cleanup gate — Map.delete only when both EVENT_NAME + QUIET_NAME listenerCount=0"
key_files:
  created:
    - "vigil-core/src/lib/quiet-mode-suppression.ts (73 LOC including comments)"
  modified:
    - "vigil-core/src/lib/quiet-mode-suppression.test.ts (was Plan 01 RED placeholder, +152/-39 — 8 GREEN tests)"
    - "vigil-core/src/lib/agent-events-bus.ts (+45/-4 — QUIET_NAME const, 3 new methods, joint cleanup guard)"
    - "vigil-core/src/lib/__tests__/agent-events-bus.test.ts (+73/-19 — 6 GREEN tests replacing 4 RED placeholders)"
decisions:
  - "Used single shared QUIET_NAME = 'quiet' channel on the existing per-userId EventEmitter rather than a parallel emitter Map — preserves the cleanup-gate invariant as a single Map operation"
  - "Added 2 bonus tests (offQuiet-without-emitter no-op, emitQuiet-without-subscribers no-op) beyond the plan's 4 — exercises the early-return paths the implementation relies on"
  - "Test fixture uses literal makeRow factory instead of casting from {} to DrizzleAgentEvent — populates all required schema fields (eventTimestamp, host, label, message, exitCode, receivedAt, clientEventId) so tests round-trip through real types"
metrics:
  duration: "~44 minutes wall (context-load + write + verify + commit, both tasks)"
  completed: "2026-05-10"
  tasks_completed: 2
  tests_added: 14  # 8 suppression + 6 bus
  files_changed: 4
---

# Phase 125 Plan 03: Suppression queue + bus emitQuiet extension Summary

**One-liner:** Wave 1 server primitives — in-memory `suppressionQueue` keyed `(userId, sessionId, eventType)` with last-of-each-kind overwrite + chronological flush, plus `bus.emitQuiet/onQuiet/offQuiet` per-userId fan-out gated by a joint EVENT_NAME ↔ QUIET_NAME cleanup guard.

## Tasks Completed

### Task 1 — Suppression queue lib + GREEN tests

**Commit:** `d2a1eef`

**Created:** `vigil-core/src/lib/quiet-mode-suppression.ts` (73 LOC including header comment).

- `ALLOWLIST = new Set(["needs_input", "task_failed"])` — hard-locked exactly per CONTEXT D-04 spec lock.
- `Map<userId, Map<sessionId, Map<eventType, DrizzleAgentEvent>>>` shape per RESEARCH §Pattern 3.
- `shouldSuppress(userId, isQuiet, row)` returns `false` for `!isQuiet` AND for allowlist events; otherwise stores via `Map.set` overwrite (last-of-each-kind, T-125-03 cap) and returns `true`.
- `flush(userId)` collects all `(session, event)` rows into a flat array, sorts by `eventTimestamp.getTime()` ASC (Pitfall 4 fix — chronological order, not insertion order), deletes the user's bucket, returns the sorted array.
- Test hooks: `_size(userId)` returns total held count for the user; `_clearAll()` for `beforeEach` reset.

**Modified:** `vigil-core/src/lib/quiet-mode-suppression.test.ts` — replaced 8 RED placeholders with 8 GREEN tests:

| # | Behavior | Verifies |
|---|----------|----------|
| 1 | Passthrough when `isQuiet=false` | non-DND events flow normally |
| 2 | Allowlist `{needs_input, task_failed}` passthrough even when DND | spec lock |
| 3 | Non-allowlist events stored when DND | suppression contract |
| 4 | Last-of-each-kind via `Map.set` overwrite | D-04 dedup |
| 5 | `flush()` sorts by `eventTimestamp` ASC (insertion order T+10/T+0/T+20 → flush T+0/T+10/T+20) | Pitfall 4 |
| 6 | `flush()` clears bucket; subsequent emit creates fresh entry | bucket lifecycle |
| 7 | Cross-user isolation — `flush(userA)` leaves userB untouched | T-125-01 |
| 8 | Replay-storm: 100× same `(sessionId, event)` → 1 row, last-emit retained | T-125-03 |

**Test result:** `pass 8 / fail 0 / skipped 0` (`npx tsx --test src/lib/quiet-mode-suppression.test.ts`).

### Task 2 — Bus emitQuiet/onQuiet/offQuiet + joint cleanup gate

**Commit:** `0c145d6`

**Modified:** `vigil-core/src/lib/agent-events-bus.ts`:

1. Added module-scope `const QUIET_NAME = "quiet" as const;` alongside `EVENT_NAME`.
2. Updated existing `off()` cleanup guard from
   ```ts
   if (emitter.listenerCount(EVENT_NAME) === 0)
   ```
   to
   ```ts
   if (emitter.listenerCount(EVENT_NAME) === 0 && emitter.listenerCount(QUIET_NAME) === 0)
   ```
   This is the load-bearing T-125-W3-01 regression — without it, `off()` would delete the emitter Map entry while a registered `onQuiet` listener was still attached, orphaning the QUIET listener on a deleted-then-resurrected emitter.
3. Added three new methods on `AgentEventBus` mirroring `emit/on/off`:
   - `emitQuiet(userId, payload)` — early-returns without allocating an emitter when no subscribers (mirrors `emit()`).
   - `onQuiet(userId, listener)` — `getOrCreate(userId).on(QUIET_NAME, listener)`.
   - `offQuiet(userId, listener)` — applies the same joint-cleanup gate as the updated `off()`.

**Modified:** `vigil-core/src/lib/__tests__/agent-events-bus.test.ts` — replaced 4 RED placeholders with 6 GREEN tests (4 plan-required + 2 bonus):

| # | Behavior | Verifies |
|---|----------|----------|
| 1 | `emitQuiet → onQuiet listener` fires once with exact payload | fan-out |
| 2 | `emitQuiet(101)` does NOT fire `onQuiet(102)` listener | T-125-01 |
| 3 | `offQuiet` removes listener → subsequent `emitQuiet` does not fire | unsubscribe |
| 4 | `on(uid, eventL) + onQuiet(uid, quietL); off(uid, eventL)` keeps Map entry; `offQuiet` then collapses it | T-125-W3-01 joint cleanup |
| 5 | `offQuiet` without prior `onQuiet` is no-op (no exception, no Map mutation) | early-return path |
| 6 | `emitQuiet` with no subscribers is no-op (does not allocate emitter) | mirrors emit() invariant |

**Test result:** Full bus suite `pass 12 / fail 0 / skipped 0` (6 pre-existing + 6 new).

## Test-Suite Results

### Targeted suite (modules I touched + adjacent)

```
$ cd vigil-core && npx tsx --test \
    src/lib/__tests__/agent-events-bus.test.ts \
    src/lib/quiet-mode-suppression.test.ts \
    src/routes/__tests__/agent-stream.test.ts \
    src/routes/__tests__/agent-events.test.ts

ℹ tests 32
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 5   ← all 5 are PLAN_05_STREAM placeholders waiting for Plan 05
ℹ todo 0
ℹ duration_ms 1472.836031
```

**Exit code:** 0 ✓
**Pre-existing tests in adjacent files (agent-events.test.ts, agent-stream.test.ts):** all still pass; no regression from the joint-cleanup-gate change in `off()`.

### Full vigil-core suite (`cd vigil-core && npm test`)

The full suite (543 tests across 35 suites) was attempted twice and was interrupted by a Bash background-task timeout in this sandbox (exit 144 / SIGURG) before completion — same pre-existing slow-test condition Plan 01's summary documented (`src/integration/cross-user-isolation.test.ts` occasionally runs ~15min instead of the typical 53s). The targeted suite above covers all modules touched by Plan 03 + their immediate consumers, with **0 failures** and **0 regressions**.

**Foreground evidence the suite was running normally to interruption point:** the partial output captured 27+ passing test cases (migrations, cross-user-isolation skip-when-no-DB, etc.) with 0 failures before the sandbox timeout. The interruption is environmental, not a test result.

This is consistent with Plan 01's deferred-items observation; logged here as continued-deferred, not a Plan 03 deviation.

## Wave-1 Acceptance Criteria

| Acceptance | Result |
|------------|--------|
| `vigil-core/src/lib/quiet-mode-suppression.ts` exists | ✓ FOUND (73 LOC) |
| Allowlist hard-locked: `ALLOWLIST = new Set(["needs_input", "task_failed"])` | ✓ grep count = 1 |
| Pitfall 4 sort: `out.sort((a, b) => a.eventTimestamp.getTime() - b.eventTimestamp.getTime())` | ✓ grep count = 1 |
| Flush clears bucket: `heldByUser.delete(userId)` | ✓ grep count = 1 |
| Suppression test exits 0 with `pass >= 8 / fail 0 / skipped 0` | ✓ 8/0/0 |
| `grep -c "TODO(125-03)" vigil-core/src/lib/quiet-mode-suppression.test.ts` returns 0 | ✓ 0 |
| `vigil-core/src/lib/agent-events-bus.ts` contains `emitQuiet(userId: number` | ✓ |
| `onQuiet(` and `offQuiet(` present | ✓ (onQuiet x2, offQuiet x1) |
| `QUIET_NAME = "quiet"` present | ✓ |
| `off()` cleanup guard references both EVENT_NAME + QUIET_NAME | ✓ (verified in 14-line context grep — Plan-spec's `-A 3` window was tighter than my comment block, but the underlying invariant is satisfied; Test 4 of Task 2 asserts the behavior at runtime) |
| Bus test exits 0 with `pass >= 4 + (existing-test-count)` and `fail 0 / skipped 0` | ✓ 12/0/0 |
| `grep -c "PLAN_03_BUS" vigil-core/src/lib/__tests__/agent-events-bus.test.ts` returns 0 | ✓ 0 |
| `grep -rc "TODO(125-03)" vigil-core/src/lib/` all zeros | ✓ 0 anywhere in vigil-core/src |

## Threat Model Verification

| Threat | Mitigation | Verified |
|--------|------------|----------|
| T-125-01 (cross-user state leak in suppression) | `shouldSuppress(userId, ...)` keys all Map operations on userId; `flush(userA)` does not touch userB's bucket | Test 7 of Task 1 (suppression) |
| T-125-01 (cross-user state leak in bus) | `emitQuiet(userId)` looks up emitter via `emitters.get(userId)`; never broadcasts | Test 2 of Task 2 (bus) |
| T-125-03 (replay-storm DoS) | `Map.set` overwrite caps per `(userId, sessionId, eventType)` at exactly 1 row | Test 8 of Task 1 (100× same key → 1 row) |
| T-125-W3-01 (cleanup-guard regression) | `off()` now requires both `EVENT_NAME` and `QUIET_NAME` listenerCount=0 before `Map.delete` | Test 4 of Task 2 (load-bearing regression test) |

## Deviations from Plan

### Auto-fixed Issues

None — both tasks executed verbatim against the plan-spec implementation in RESEARCH §Pattern 3 and §Example B.

### Bonus tests beyond plan minimum

- **2 extra bus tests** (offQuiet-no-emitter no-op + emitQuiet-no-subscribers no-op) — they exercise the early-return paths in the implementation. Plan required 4; landed 6. Not a deviation, just defensive coverage.

### Acceptance-grep window observation (out-of-scope, documented for next milestone)

The Task 2 acceptance criterion `grep -A 3 "off(userId" ... | grep -c "QUIET_NAME"` returns 0 because my comment block (preserving the original Phase 124 RESEARCH Pitfall 3 reference + adding Phase 125 T-125-W3-01 rationale) pushes the joint-cleanup `if` past the 3-line window. The underlying invariant is satisfied — Test 4 of Task 2 is the load-bearing runtime check and passes. A `grep -A 14` window confirms 2 QUIET_NAME mentions (one in comment, one in `if`). Logging here so future plans can either (a) widen the acceptance grep window or (b) require comments be inline rather than block-style for this kind of guard.

### Unrelated uncommitted artifacts in working tree (NOT touched)

When this plan started, the working tree had three untracked-or-modified files left over from Plan 02's Task 2 (drizzle migration generation):
- `vigil-core/drizzle/0019_add_users_quiet_mode.sql` (untracked)
- `vigil-core/drizzle/meta/0019_snapshot.json` (untracked)
- `vigil-core/drizzle/meta/_journal.json` (modified)

Per scope-boundary policy these are NOT mine to commit. Logging in `deferred-items.md` would also be wrong because they are explicitly Plan 02's responsibility — surface to operator that Plan 02 may have completed Task 1 (schema commit `c3fa8f9`) but NOT committed Task 2 (migration files). Plan 03 left them untouched.

## Authentication Gates

None — pure data-structure plan, no network/DB/SSE/auth surface.

## Self-Check: PASSED

- File `vigil-core/src/lib/quiet-mode-suppression.ts`: FOUND (73 LOC)
- File `vigil-core/src/lib/quiet-mode-suppression.test.ts`: FOUND (207 LOC, 8 GREEN tests, 0 placeholders)
- File `vigil-core/src/lib/agent-events-bus.ts`: FOUND (125 LOC, +45 LOC vs Plan 02 baseline)
- File `vigil-core/src/lib/__tests__/agent-events-bus.test.ts`: FOUND (197 LOC, 12 GREEN tests, 0 PLAN_03_BUS placeholders)
- Commit `d2a1eef` (Task 1, suppression): FOUND in `git log --oneline -5`
- Commit `0c145d6` (Task 2, bus extension): FOUND in `git log --oneline -5`
- Targeted suite (4 files): exit 0 (32 tests / 27 pass / 0 fail / 5 skipped — all skips are PLAN_05_STREAM)
- Acceptance: `grep -rc "TODO(125-03)" vigil-core/src/`: 0 anywhere in vigil-core/src
- Acceptance: `grep -c "PLAN_03_BUS" vigil-core/src/lib/__tests__/agent-events-bus.test.ts`: 0
- Allowlist hard-lock invariant (`{ needs_input, task_failed }` only): VERIFIED via grep + Test 2 of Task 1
- Cross-user isolation invariant (T-125-01): VERIFIED via Tests 7 (suppression) + 2 (bus)
- Joint cleanup gate (T-125-W3-01): VERIFIED via Test 4 of Task 2 — Map entry survives `off()` while quietL is registered
