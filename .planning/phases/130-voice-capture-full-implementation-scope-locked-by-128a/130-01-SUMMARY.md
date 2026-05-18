---
phase: 130
plan: 01
subsystem: voice-capture
tags: [spike-cleanup, atomic-revert, D-C1, D-C2, D-C4]
dependency_graph:
  requires:
    - "Phase 128a SPIKE-DECISION (PASS verdict) — gives the canonical 5-file delete list + 5-file revert list"
    - "Phase 127 guardrails (audio-session-guard, ai-budget, audio-cap) — D-C3 carry-forward, do NOT touch"
  provides:
    - "Clean pre-128a baseline (modulo Phase 127 carry-forward) for Plans 02-07 to add production voice code onto"
    - "Single atomic spike-removal commit boundary (auditable via git log per D-C4)"
  affects:
    - "vigil-core entrypoint (route mount table)"
    - "vigil-g2-plugin navigation/carousel (SCREEN_ORDER, Screen enum)"
    - "vigil-g2-plugin app.json permissions (g2-microphone PRESERVED)"
tech_stack:
  added: []
  patterns:
    - "Atomic spike-removal commit pattern (D-C4) — delete-then-revert as one logical plan, two commits for clarity"
key_files:
  created: []
  modified:
    - "vigil-g2-plugin/src/navigation.ts (revert)"
    - "vigil-g2-plugin/src/main.ts (revert)"
    - "vigil-g2-plugin/src/constants.ts (revert)"
    - "vigil-g2-plugin/app.json (reword desc, preserve g2-microphone)"
    - "vigil-core/src/index.ts (revert)"
    - "vigil-g2-plugin/src/__tests__/navigation.test.ts (drift-detector unlock — slot 4 / 5 → 4)"
  deleted:
    - "vigil-g2-plugin/scripts/voice-spike-encoder.ts"
    - "vigil-g2-plugin/src/screens/voice-spike.ts"
    - "vigil-core/src/routes/voice-spike.ts"
    - "vigil-core/src/ai/transcribe-spike.ts"
    - "vigil-core/src/routes/__tests__/voice-spike.test.ts"
decisions:
  - "D-C1 — Delete 5 spike-only files outright; do NOT in-place rename (D-U1)"
  - "D-C2 — Revert 5 spike-only modifications to pre-128a baseline (modulo Phase 127 carry-forward)"
  - "D-C3 — Phase 127 guardrails (audio-session-guard, ai-budget, audio-cap) NOT touched in Plan 01 (Plan 04 modifies safeAudioControl signature)"
  - "D-C4 — Spike-removal commit boundary lands before production code arrives (auditability + prevents 'production reuses spike code' failure mode)"
  - "Auto-deviation Rule 3 — Updated navigation.test.ts SCREEN_ORDER drift detector from 5-slot lock to 4-slot lock; the test's own comments at lines 7-11 explicitly predicted this revert"
metrics:
  duration_minutes: 45
  completed_date: "2026-05-18"
  tasks_completed: 2
  files_deleted: 5
  files_modified: 6
  lines_deleted: 730
  lines_added: 28
---

# Phase 130 Plan 01: spike-removal commit Summary

**One-liner:** Single atomic spike-removal of Phase 128a — five voice-spike files deleted, five spike-only modifications reverted to pre-128a baseline, `g2-microphone` permission preserved, both packages typecheck green.

## What Shipped

Plan 01 is a **delete-only / revert-only** plan. No production code was added. This is the D-C4 plan-ordering invariant: the spike-removal commit must land BEFORE Plans 02-07 add the production VOICE-02..08 implementation, to keep the spike-removal auditable as a single atomic step (preventing the "production code accidentally reuses spike code" failure mode).

### Task 1 — Delete five spike-only files (commit `ea32bd7`)

Per D-C1, `git rm`'d the five Phase 128a SPIKE-marked files:

| File | Role | Deleted |
|---|---|---|
| `vigil-g2-plugin/scripts/voice-spike-encoder.ts` | WAV encoder (CLI script) | yes |
| `vigil-g2-plugin/src/screens/voice-spike.ts` | G2 screen module + PCM collector | yes |
| `vigil-core/src/routes/voice-spike.ts` | Hono route `POST /v1/voice/transcribe` (spike-version) | yes |
| `vigil-core/src/ai/transcribe-spike.ts` | OpenAI SDK wrapper (spike-version) | yes |
| `vigil-core/src/routes/__tests__/voice-spike.test.ts` | Spike route tests | yes |

Build/test verification deferred to Task 2 by design — the spike-only modifications still import these files, so the tree is intentionally inconsistent between Task 1 and Task 2.

### Task 2 — Revert five spike-only modifications (commit `12f6164`)

Per D-C2, removed all spike-only entries from each modified file:

| File | What was reverted |
|---|---|
| `vigil-g2-plugin/src/navigation.ts` | Voice-spike imports, `VOICE_SPIKE` Screen enum entry, `SCREEN_ORDER` slot 4, `buildScreen` case, `handleNavEvent` DOUBLE_CLICK carve-out |
| `vigil-g2-plugin/src/main.ts` | `appendPcmChunk` import + the `audioEvent.audioPcm` collector branch in `onEvenHubEvent` |
| `vigil-g2-plugin/src/constants.ts` | `VOICE_SPIKE_HEADER` / `VOICE_SPIKE_BODY` / `VOICE_SPIKE_FOOTER` container IDs (16/17/18) |
| `vigil-g2-plugin/app.json` | **KEPT** `g2-microphone` permission (D-C2 + D-C3 PRESERVE); reworded `desc` from `"Phase 128a VOICE-01 spike: push-to-record voice capture for thought intake."` → `"Push-to-record voice capture for thought intake."` |
| `vigil-core/src/index.ts` | `import { voiceSpike } from "./routes/voice-spike.js"` (line 29) + `app.route("/v1", voiceSpike)` (line 232) |

## Verification Results

### Acceptance criteria (all PASSED)

```text
$ ls vigil-g2-plugin/scripts/voice-spike-encoder.ts 2>&1
  → No such file or directory                                          [PASS]
$ ls vigil-g2-plugin/src/screens/voice-spike.ts 2>&1
  → No such file or directory                                          [PASS]
$ ls vigil-core/src/routes/voice-spike.ts 2>&1
  → No such file or directory                                          [PASS]
$ ls vigil-core/src/ai/transcribe-spike.ts 2>&1
  → No such file or directory                                          [PASS]
$ ls vigil-core/src/routes/__tests__/voice-spike.test.ts 2>&1
  → No such file or directory                                          [PASS]

$ grep -RIl 'voice-spike|VOICE_SPIKE|voiceSpike|voice_spike' \
    vigil-g2-plugin/src/ vigil-g2-plugin/scripts/ vigil-g2-plugin/app.json \
    vigil-core/src/ 2>/dev/null | grep -v node_modules | wc -l
  → 0                                                                  [PASS]

$ grep -q '"name": "g2-microphone"' vigil-g2-plugin/app.json
  → match (permission PRESERVED)                                       [PASS]

$ grep -q 'Phase 128a' vigil-g2-plugin/app.json
  → no match (desc reworded)                                           [PASS]

$ cd vigil-core && npx tsc --noEmit
  → exit 0 (no TypeScript errors)                                      [PASS]
$ cd vigil-g2-plugin && npx tsc --noEmit
  → exit 0 (no TypeScript errors)                                      [PASS]

$ test -f vigil-g2-plugin/src/lib/audio-session-guard.ts
  → exists (D-C3 carry-forward UNCHANGED in Plan 01)                   [PASS]
```

### `npm test`

- **vigil-g2-plugin:** 114 / 115 pass. 1 pre-existing failure (`TTL_MS drift
  detector` in `main.test.ts:263`) — verified to fail on the pre-Plan-01 tree
  via `git stash`. Documented in `deferred-items.md`.
- **vigil-core:** Earlier runs (task IDs `b9lbqnagv`, `beeq5hewv`, `bvo1v1j10`)
  completed with exit 0. Later attempts to capture summary line via piped
  redirect were truncated by a pre-existing test-runner scheduler-hang
  (`index.ts` import-side-effect starts `generateScheduler` + `gmailWorkOrders`
  which don't terminate under `--test-isolation=process`). `npx tsc --noEmit`
  on the same tree runs cleanly. Documented in `deferred-items.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Updated `vigil-g2-plugin/src/__tests__/navigation.test.ts`**

- **Found during:** Task 2 verification (post-revert grep)
- **Issue:** The Phase 124 Plan 07 drift detector `navigation.test.ts` was hardened
  in Phase 128a to assert `SCREEN_ORDER` has exactly 5 entries with `VOICE_SPIKE`
  at slot 4 (lines 65-101). After reverting `navigation.ts` to 4 entries, this
  test would fail and block the "build green" acceptance criterion. The
  `GAP-129-F` ordering test also referenced `VOICE_SPIKE` as the immediate
  predecessor carve-out (lines 214-238), which no longer exists.
- **Fix:** Updated the SCREEN_ORDER assertion to lock 4 entries (matching the
  pre-128a baseline), and changed the GAP-129-F ordering test to assert the
  COMPANION carve-out as the immediate predecessor (the new post-spike-removal
  ordering). The test file's own comments at lines 7-11 explicitly predicted
  this revert: "Phase 128a SPIKE — TOSSABLE: slot 4 (VOICE_SPIKE) was added
  by the PCM feasibility spike and MUST be removed when Phase 130 lands (revert
  slot count to 4 + drop the VOICE_SPIKE assertion below)."
- **Files modified:** `vigil-g2-plugin/src/__tests__/navigation.test.ts`
- **Commit:** `12f6164`

**2. [Rule 3 - Blocking issue] Removed VOICE_SPIKE comment reference in `vigil-g2-plugin/src/main.ts`**

- **Found during:** Task 2 verification (grep for VOICE_SPIKE residuals)
- **Issue:** A `Phase 129 GAP-129-G fix` documentation comment in `main.ts`
  enumerated screens including `VOICE_SPIKE` as an example. The plan's
  acceptance criterion requires the grep to return 0 matches outside `.planning/`.
- **Fix:** Removed `VOICE_SPIKE` from the comment's example screen list (now
  lists `WORK_ORDERS, AFFIRMATION, TASK_DETAIL, ...`).
- **Files modified:** `vigil-g2-plugin/src/main.ts`
- **Commit:** `12f6164`

## Deferred Issues

Tracked in `.planning/phases/130-voice-capture-full-implementation-scope-locked-by-128a/deferred-items.md`:

1. **Pre-existing failing test:** `vigil-g2-plugin/src/__tests__/main.test.ts:263`
   (`D-129 drift: TTL constant 30 * 60 * 1000 present in helpers`) — failing
   on the pre-Plan-01 tree per `git stash` verification. Phase 129/131 cleanup.
2. **Pre-existing test-runner hang:** `vigil-core` `npm test` cannot terminate
   because `index.ts` import side-effects start long-lived schedulers. `npx tsc
   --noEmit` is the build-green proxy used for Plan 01. Future plan to gate
   scheduler startup behind a non-test entry-point guard.

## Authentication Gates

None — Plan 01 is delete-only / revert-only with no network or auth dependencies.

## Threat Flags

None — Plan 01 removes attack surface (spike route at `/v1/voice/transcribe`,
spike screen, spike microphone-event collector). The `g2-microphone` permission
is **preserved** so Phase 130 production code does not re-trigger the Even Hub
portal C-2 approval pipeline (per D-C2 + D-C3 + threat T-130-01-SC).

## Key Decisions Made

1. **D-C1+D-C2+D-C4 enforced as written** — atomic spike-removal commit boundary lands BEFORE any production code in Plans 02-07.
2. **`g2-microphone` permission PRESERVED** — desc reworded to drop the spike-only prefix without touching the permission entry name (D-C3 + threat-model invariant for Even Hub portal).
3. **Two commits, one logical plan** — Task 1 deletes the 5 files; Task 2 reverts the 5 modifications. Splitting on the deletion/revert boundary makes the audit trail cleaner than a single mega-commit.
4. **Test-file revert handled as Rule 3 auto-fix** — Phase 128a's `navigation.test.ts` had explicitly predicted this revert in its own comments; updating it from 5-slot lock to 4-slot lock is a non-architectural mechanical revert needed to unblock the build-green criterion.

## Files Audit

**Deleted (5):**
- `vigil-g2-plugin/scripts/voice-spike-encoder.ts`
- `vigil-g2-plugin/src/screens/voice-spike.ts`
- `vigil-core/src/routes/voice-spike.ts`
- `vigil-core/src/ai/transcribe-spike.ts`
- `vigil-core/src/routes/__tests__/voice-spike.test.ts`

**Modified (6):**
- `vigil-core/src/index.ts`
- `vigil-g2-plugin/app.json`
- `vigil-g2-plugin/src/constants.ts`
- `vigil-g2-plugin/src/main.ts`
- `vigil-g2-plugin/src/navigation.ts`
- `vigil-g2-plugin/src/__tests__/navigation.test.ts`

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `ea32bd7` | chore(130-01) | Delete five Phase 128a spike files (D-C1) |
| 2 | `12f6164` | chore(130-01) | Revert five Phase 128a spike-only modifications (D-C2) |

## Next Plan

Plan 02 — Production `voice-transcribe` route + `transcribe.ts` service +
`wav-encoder.ts` + `voice_captures` table migration (per PATTERNS.md
§"PRODUCTION CREATES" + CONTEXT D-U1..D-U4).

## Self-Check: PASSED

Verified post-write:
- All 5 deleted files: `MISSING` (confirmed via `test -f`)
- Both commits (`ea32bd7`, `12f6164`): `FOUND` in `git log --all`
- All 6 modified files exist and have spike-marker greps returning 0 matches
- `g2-microphone` permission preserved in `app.json`
- D-C3 carry-forward files untouched
