---
phase: 128a-voice-01-pcm-feasibility-spike
plan: 01
subsystem: testing
tags: [openai, voice, spike, node:test, hono, wave-0]

# Dependency graph
requires:
  - phase: 127-pre-spike-guardrails
    provides: audio-session-cap helper, per-user AI-budget chokepoint, GUARD-01 log-name redaction policy
provides:
  - openai SDK at ^6.37.0 pinned in vigil-core (server-only)
  - Wave 0 smoke test scaffold at canonical __tests__/voice-spike.test.ts path
  - Test-first rail: RED smoke test that Plan 128a-02 must turn GREEN
affects: [128a-02, 130-voice-capture-full-impl]

# Tech tracking
tech-stack:
  added: [openai@^6.37.0]
  patterns:
    - "Wave 0 test-first rail (RED scaffold before route lands)"
    - "TOSSABLE header as Phase 130 grep anchor"
    - "Lazy await import() after env preamble + mock.method stub"

key-files:
  created:
    - vigil-core/src/routes/__tests__/voice-spike.test.ts
  modified:
    - vigil-core/package.json
    - vigil-core/package-lock.json

key-decisions:
  - "Pinned openai@^6.37.0 per RESEARCH DRIFT-03 (NOT ^4.79.0 as stale STACK.md claimed)"
  - "Left smoke test intentionally RED — Wave 0 test-first rail per 128A-VALIDATION.md; Plan 128a-02 turns it GREEN"
  - "Mocked transcribe-spike export via node:test mock.method instead of bundler-level injection (no Vitest, no jest)"
  - "Server-only dependency: vigil-g2-plugin and vigil-pwa package.json untouched (CONTEXT D-W4 OPENAI_API_KEY is server-only secret)"

patterns-established:
  - "Wave 0 smoke test scaffold lives in src/routes/__tests__/ (subdir reserved for agent-stream pattern), not the sibling *.test.ts pattern used by other routes"
  - "Node:test mock.method on lazily-imported service module is the spike-mock pattern (no test-double DI framework needed)"

requirements-completed: [VOICE-01]

# Metrics
duration: 1m 32s
completed: 2026-05-12
---

# Phase 128a Plan 01: Wave 0 Scaffolding Summary

**Pinned openai@^6.37.0 in vigil-core and stood up a RED smoke test scaffold at `src/routes/__tests__/voice-spike.test.ts` to lock the Plan 128a-02 contract before the route author writes a line of code.**

## Performance

- **Duration:** 1m 32s
- **Started:** 2026-05-12T18:11:10Z
- **Completed:** 2026-05-12T18:12:42Z
- **Tasks:** 2 (both `type=auto`; Task 2 also `tdd="true"` and left RED by design)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `openai` dependency locked at `^6.37.0` (registry latest verified via `npm view openai version` = 6.37.0); resolved install is `openai@6.37.0` per `npm ls openai`
- Wave 0 smoke test scaffold (54 LOC) lives at the canonical path Plan 128a-02 will mount the route at — kills the "scavenger hunt" anti-pattern by locking the test shape first
- Tossable grep anchor (`PHASE 128a SPIKE — TOSSABLE`) seeded for Phase 130 cleanup
- Plugin (`vigil-g2-plugin/package.json`) and PWA (`vigil-pwa/package.json`) manifests untouched — OPENAI_API_KEY stays a server-only secret per CONTEXT D-W4

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin openai@^6.37.0 in vigil-core/package.json** — `b0ffc4a7` (chore)
2. **Task 2: Create Wave 0 smoke test scaffold for /v1/voice/transcribe** — `df94fe6f` (test, RED gate)

_Note: Task 2 is the TDD RED commit. GREEN gate is owned by Plan 128a-02 when `voice-spike.ts` and `transcribe-spike.ts` land. REFACTOR is not in scope for the spike (the entire file is tossable)._

## Files Created/Modified

- `vigil-core/package.json` — added `"openai": "^6.37.0"` in `dependencies` (between `node-cron`-region alphabetical insertion handled by `npm install`)
- `vigil-core/package-lock.json` — openai@6.37.0 + transitive deps recorded
- `vigil-core/src/routes/__tests__/voice-spike.test.ts` — Wave 0 smoke test scaffold: tossable header, JWT_SECRET preamble, `mock.method` stub on `transcribeWav`, lazy `await import("../voice-spike.js")`, two `node:test` cases (400 empty-body + 201 happy-path with `{id, content}` shape assertion), Hono outer-middleware `c.set("userId")` to bypass bearerAuth in unit test

## Verified RED Test Output (last 3 lines)

```
test at src/routes/__tests__/voice-spike.test.ts:1:1
✖ src/routes/__tests__/voice-spike.test.ts (314.401262ms)
  'test failed'
```

Failure cause: `ERR_MODULE_NOT_FOUND` resolving `vigil-core/src/ai/transcribe-spike.js` (route's lazy-stubbed dependency). Plan 128a-02 creates both `transcribe-spike.ts` and `voice-spike.ts` — that landing turns the smoke GREEN.

Plan's exact verify command:
```
$ npx tsx --test src/routes/__tests__/voice-spike.test.ts ...
Wave 0 RED: route not implemented yet (expected)
```

## Installed openai Version

`npm ls openai` output:
```
vigil-core@0.2.0 /Users/jamesonmorrill/Desktop/Local AI/dailybrief/vigil-core
└── openai@6.37.0
```

## Decisions Made

- **DRIFT-03 honored:** `openai@^6.37.0` is the canonical version, NOT `^4.79.0` (STACK.md is stale on this version; RESEARCH.md is authoritative).
- **node:test `mock.method` over Vitest/jest:** The vigil-core test runner is `tsx --test` (node:test) per `package.json:9`. The stub had to use `mock.method` on the dynamically-imported service module — added a `transcribe-spike` lazy import so the stub installs before the route's transitive resolution.
- **Test left RED intentionally:** Wave 0 test-first rail per 128A-VALIDATION.md. Mocking the route to make it green would defeat the purpose (it'd hide the route-contract drift Plan 128a-02 is meant to surface).

## Deviations from Plan

None — plan executed exactly as written.

The plan's Task 2 action mentioned the test "SHOULD fail with 'Cannot find module ../voice-spike.js'" — the actual first-resolver miss is `transcribe-spike.js` (the stub-target imported before the route), but the failure mode is identical (ERR_MODULE_NOT_FOUND in the same `*-spike` family) and the plan's verify command's grep pattern (`Cannot find module.*voice-spike|FAIL`) matched on `FAIL` cleanly. No behavior change needed; documenting here for transparency.

## Issues Encountered

None.

## TDD Gate Compliance

- **RED gate (Task 2):** Present — commit `df94fe6f` is a `test(128a-01): ...` commit with `ERR_MODULE_NOT_FOUND` verified.
- **GREEN gate:** Deferred to Plan 128a-02 by design (Wave 0 rail). The smoke test will pass once `transcribe-spike.ts` exports `transcribeWav` and `voice-spike.ts` exports the `voiceSpike` Hono app with the 400/201 contract intact.
- **REFACTOR gate:** N/A — spike scope; entire file is tossable.

## User Setup Required

None — no external service configuration required by this plan. Operator wallclock checkpoint C-1 (`OPENAI_API_KEY` set in Railway) belongs to a later plan in this phase, not Plan 01.

## Next Phase Readiness

- **Plan 128a-02 unblocked:** `openai` SDK installed at the contract-correct version, smoke test scaffold pins the route signature (POST `/voice/transcribe`, body `{ audio: string }`, response 201 `{ id, content }` happy / 400 missing-audio).
- **Tossable grep anchor seeded:** Phase 130 cleanup can `grep -r "PHASE 128a SPIKE"` to find every spike file.
- **No blockers.**

## Self-Check: PASSED

- File `vigil-core/src/routes/__tests__/voice-spike.test.ts` — FOUND
- File `vigil-core/package.json` openai line — FOUND (`"openai": "^6.37.0"`)
- Commit `b0ffc4a7` — FOUND
- Commit `df94fe6f` — FOUND
- Plugin/PWA package.json untouched — VERIFIED (no `"openai"` substring in either)
- Banned audio tokens absent from test file — VERIFIED

---
*Phase: 128a-voice-01-pcm-feasibility-spike*
*Completed: 2026-05-12*
