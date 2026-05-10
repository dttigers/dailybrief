---
phase: 125-quiet-mode-remaining-polish-riders-plugin-v0-3-0-ship-portfo
plan: 04
subsystem: plugin
tags: [phase-125, plugin, helper, dedupe, seed-008, g2-polish-08, wave-1]
requirements: [G2-POLISH-08]
dependency_graph:
  requires:
    - "Plan 01 RED placeholders at vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts"
  provides:
    - "vigil-g2-plugin/src/lib/deduped-device-status.ts exporting createDedupedDeviceStatusListener"
    - "G2-POLISH-08 closure: helper-with-test satisfies 'debounced or deduped' wording"
  affects:
    - "Future v3.9+ consumer (likely 'glasses disconnected' indicator) gets dedup defense for free against SDK Divergence 6"
tech_stack:
  added: []
  patterns:
    - "Closure-scoped state ref + identity-equality short-circuit for event dedup"
    - "Type-only import of SDK types (`import type { DeviceStatus, DeviceConnectType }`)"
key_files:
  created:
    - "vigil-g2-plugin/src/lib/deduped-device-status.ts (24 lines)"
  modified:
    - "vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts (RED placeholders → GREEN tests; 45 lines final)"
decisions:
  - "Helper imports DeviceConnectType as VALUE (runtime enum access for tests) plus DeviceStatus as TYPE-ONLY — matches RESEARCH §Example D verbatim"
  - "Test fixture casts `{ sn: 'TEST', connectType } as DeviceStatus` to skip optional fields (isWearing/batteryLevel/isCharging/isInCase per SDK type def lines 131-151)"
  - "main.ts deliberately untouched per D-12 (helper-only ship; no live bridge.onDeviceStatusChanged subscription in v3.8)"
metrics:
  duration: "~6 minutes wall (context-load + write + verify + commit + docs)"
  completed: "2026-05-10"
  tasks_completed: 1
  tests_added: 0  # Tests existed as Plan 01 RED placeholders; this plan turned 3 of them GREEN
  tests_turned_green: 3
  files_changed: 2
  helper_loc: 24
  test_loc: 45
---

# Phase 125 Plan 04: SEED-008 deduped-device-status helper Summary

**One-liner:** Shipped `createDedupedDeviceStatusListener` (24-LOC closure-scoped helper at `vigil-g2-plugin/src/lib/deduped-device-status.ts`) plus 3 GREEN tests replacing Plan 01 RED placeholders, closing G2-POLISH-08 against HARDWARE-DIVERGENCE Divergence 6 with zero live SDK subscription per D-12 (helper-only ship; first consumer is a v3.9+ candidate).

## Tasks Completed

### Task 1 — Create dedupe helper + replace test placeholders with GREEN coverage

**Commit:** `b6f7499`

**Files:**
- **CREATED** `vigil-g2-plugin/src/lib/deduped-device-status.ts` (24 lines including JSDoc block) — exports `createDedupedDeviceStatusListener(callback) → wrappedCallback` with closure-scoped `let lastSeenConnectType: DeviceConnectType | null = null` and short-circuit guard `if (status.connectType === lastSeenConnectType) return`.
- **MODIFIED** `vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts` — replaced 3 `{ skip: PLAN_04 }` placeholders with real assertions (5×None → 1 call; None→None→Connecting→Connected→Connected→Disconnected → [None,Connecting,Connected,Disconnected]; first-call-Connected → [Connected]).

**Implementation details vs RESEARCH §Example D:**
- Copied verbatim per plan instruction; type-only import of `DeviceStatus` and `DeviceConnectType`.
- Test file imports `DeviceConnectType` as a VALUE (needed at runtime for `DeviceConnectType.None` etc.) plus `DeviceStatus` as type-only — matches Example D.
- `makeStatus` fixture uses `{ sn: 'TEST', connectType } as DeviceStatus` cast to satisfy the required `sn` field while skipping optional fields (`isWearing?`, `batteryLevel?`, `isCharging?`, `isInCase?` per SDK index.d.ts lines 131-151).

## Test-Suite Results

### Targeted helper tests (`npx tsx --test src/lib/__tests__/deduped-device-status.test.ts`)

```
✔ createDedupedDeviceStatusListener — 5×"none" fires once
✔ createDedupedDeviceStatusListener — change fires; consecutive same is deduped
✔ createDedupedDeviceStatusListener — first call always fires (lastSeen starts null)
ℹ tests 3
ℹ pass 3
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 721.68
```

**Exit code:** 0 ✓
**TODO(125-04) marker count:** 4 (Plan 01 baseline) → **0** (after Plan 04) ✓

### Full plugin suite (`cd vigil-g2-plugin && npm test`)

```
ℹ tests 78
ℹ suites 0
ℹ pass 68
ℹ fail 0
ℹ cancelled 0
ℹ skipped 10
ℹ todo 0
ℹ duration_ms 1049.04
```

**Exit code:** 0 ✓

**Delta vs Plan 01 baseline (78/65/0/13):**
- pass +3 (deduped tests turned GREEN)
- skipped −3 (deduped placeholders consumed)
- fail unchanged at 0
- Remaining 10 skips are all `PLAN_06_SSE` / `PLAN_06_COMP` markers (untouched, as Plan 06 owns them).

## Acceptance Criteria — All Met

| Criterion | Status |
|-----------|--------|
| `vigil-g2-plugin/src/lib/deduped-device-status.ts` exists | ✓ |
| File contains `export function createDedupedDeviceStatusListener` | ✓ (1 occurrence) |
| File contains `let lastSeenConnectType: DeviceConnectType \| null = null` | ✓ (1 occurrence) |
| File contains `if (status.connectType === lastSeenConnectType) return` | ✓ (1 occurrence) |
| `tsx --test ...deduped-device-status.test.ts` exits 0 with `pass ≥ 3`, `fail 0`, `skipped 0` | ✓ (pass 3 / fail 0 / skipped 0) |
| `grep -c "TODO(125-04)" ...deduped-device-status.test.ts` returns 0 | ✓ |
| `vigil-g2-plugin/src/main.ts` NOT modified | ✓ (blob hash `fccd0f0` unchanged vs HEAD baseline; `git diff --stat` empty) |

## main.ts Untouched — Verification

```
$ git hash-object vigil-g2-plugin/src/main.ts
fccd0f0e0505459f8ed698e1d4b48943d91f599b
$ git rev-parse HEAD~1:vigil-g2-plugin/src/main.ts   # baseline before Plan 04 commit
fccd0f0e0505459f8ed698e1d4b48943d91f599b
```

Identical blob. D-12 invariant honored (helper ships, no `bridge.onDeviceStatusChanged` subscription).

## Deviations from Plan

None — plan executed exactly as written. RED placeholders existed at the expected path, helper file created at exact path with exact signature, all 3 acceptance tests pass, main.ts untouched, plugin suite green.

No bugs surfaced (Rule 1), no missing critical functionality (Rule 2), no blocking issues (Rule 3), no architectural decisions (Rule 4).

## Authentication Gates

None encountered — pure local helper + test, zero network or service interaction.

## Threat Register Closure

| Threat ID | Disposition | Mitigation Evidence |
|-----------|-------------|---------------------|
| T-125-W4-01 (Denial of Service — SDK device-status spam) | mitigated | Test 1 (5×None → 1 call) verifies short-circuit; helper ready for first consumer |
| T-125-W4-02 (Tampering — leaked closure across instances) | accepted | Each `createDedupedDeviceStatusListener()` call returns a NEW closure with its own `lastSeenConnectType` ref — multiple consumers don't share state. Not asserted by current test set; acceptable per plan disposition |

## Self-Check: PASSED

- File `vigil-g2-plugin/src/lib/deduped-device-status.ts`: FOUND (24 lines)
- File `vigil-g2-plugin/src/lib/__tests__/deduped-device-status.test.ts`: FOUND (45 lines, 3 GREEN tests, 0 placeholders)
- Commit `b6f7499` (Task 1, helper + GREEN tests): FOUND in `git log --oneline`
- vigil-g2-plugin full suite: exit 0 (78 tests / 68 pass / 0 fail / 10 skipped)
- main.ts blob hash unchanged: FOUND identical to HEAD~1 baseline
- TODO(125-04) marker count in test file: 0 (placeholders fully replaced)
