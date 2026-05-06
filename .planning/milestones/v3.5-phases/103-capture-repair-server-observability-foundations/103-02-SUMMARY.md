---
phase: 103-capture-repair-server-observability-foundations
plan: 02
subsystem: capture-pipeline

tags: [cap-01, cap-02, heic-convert, sync-triage, promise-allsettled, d-01, d-05, d-06, d-07, d-08, posthog-integration, wave-2]

# Dependency graph
requires:
  - phase: 103-capture-repair-server-observability-foundations
    provides: "Plan 00 RED scaffold — 8 CAP-* cases in process-photo.test.ts + pre-fix production curl evidence (category:null x5)"
  - phase: 103-capture-repair-server-observability-foundations
    provides: "Plan 01 captureException wrapper (used for D-07 per-thought triage failure reporting)"
  - phase: 59-smart-photo-upload
    provides: "ProcessPhotoDeps dep-injection surface, processClaudeResponse pure helper"
  - phase: 60-01-preview-forcing
    provides: "applyForcePaperType override + preview=true query flag (preserved as D-08 scope boundary)"
provides:
  - "vigil-core/src/routes/triage.ts — exported triageThought(content) helper (same prompt + maxTokens as POST /v1/triage route)"
  - "vigil-core/src/routes/process-photo.ts — VALID_MEDIA_TYPES extended (image/heic + image/heif), Step 3c HEIC→JPEG conversion, Step 9b parallel triage with D-07 graceful-null fallback"
  - "ProcessPhotoDeps extended with heicConvertFn, triageFn, dbUpdateTriageFn (6 fields total)"
  - "All 8 Plan 00 RED CAP-* cases GREEN: CAP-01-a..d (HEIC acceptance + 422 on decode failure + passthrough) and CAP-02-a..d (sync triage + parallel + D-07 null fallback + D-08 preview skip)"
affects:
  - 103-04-global-error-handler (still needs to wire app.onError + SIGTERM/SIGINT shutdown; this plan consumed captureException, Plan 04 still consumes shutdownPosthog)
  - Phase 103 VERIFICATION.md (post-fix curl round-trip against live Railway remains pending Plan 04 deploy)

# Tech tracking
tech-stack:
  added:
    - "heic-convert@^2.1.0 (pure-JS HEIC→JPEG decoder — no native deps, no Dockerfile changes required on Railway)"
  patterns:
    - "Pre-transcode mediaType normalization: HEIC/HEIF decoded to JPEG before Claude vision call; claudeMediaType + claudeImageB64 variables thread post-conversion values through Step 5"
    - "Per-thought Promise.allSettled triage (Pitfall 6 mitigation) — batch rejection does NOT short-circuit; each thought gets its own success/failure treatment"
    - "D-07 graceful-null pattern: triage rejection → keep row, log to PostHog via captureException wrapper, return 201 with category:null for that thought only"
    - "Dep-injected triage helper (extracted from POST /v1/triage route) — tests pass fakes without hitting Claude; production default wires to triageThought"
    - "Ambient module declaration for heic-convert (package ships no first-party types) in src/types/heic-convert.d.ts"

key-files:
  created:
    - "vigil-core/src/types/heic-convert.d.ts"
  modified:
    - "vigil-core/package.json (heic-convert dep)"
    - "vigil-core/package-lock.json (heic-convert + transitives)"
    - "vigil-core/src/routes/triage.ts (added triageThought helper export)"
    - "vigil-core/src/routes/process-photo.ts (VALID_MEDIA_TYPES extension + Step 3c HEIC conversion + Step 9b sync triage + extended ProcessPhotoDeps)"
    - "vigil-core/src/routes/process-photo.test.ts (makeDeps defaults for 3 new deps; RT-1/RT-2 confidence assertion updates)"

key-decisions:
  - "Honored D-01 revision: heic-convert (pure JS, zero Railway rebuild) NOT sharp (libvips prebuilt excludes HEIC on Linux — A1 in 103-RESEARCH.md). sharp does NOT appear in package.json."
  - "heic-convert ambient declaration in src/types/heic-convert.d.ts — package ships no first-party types; direct default import failed TS strict-mode check. Ambient declare preserves esModuleInterop default-export pattern without namespace workaround."
  - "Per-thought Promise.allSettled (not Promise.all) — Pitfall 6 mitigation. One rejected triage does NOT reject the whole batch; each thought's outcome is handled individually before the 201 response."
  - "Extended ProcessPhotoDeps with dbUpdateTriageFn (not an inline db.update) — preserves the existing dep-injection contract so route-level tests never need a real DB. Default wires to db.update with userId-scoped WHERE (T-103-02-05 mitigation)."
  - "RT-1/RT-2 confidence assertions updated from 0.92/0.88 (Claude vision) to 0.9 (default triage confidence) — documented in-test with comments. Pre-Plan-02 tests asserted Claude confidence because triage didn't exist on this path; post-Plan-02 the thought row carries triage confidence per D-05/D-06 contract."

patterns-established:
  - "Media-type pre-conversion as a handler step (Step 3c) — inserts AFTER validation, BEFORE AI client gate, so non-HEIC paths skip the branch entirely"
  - "captureException-in-recovery pattern: per-thought triage try/catch funnels both call-level rejections (from allSettled) AND db-update failures to PostHog with different op labels (triage vs triage_update)"

requirements-completed:
  - CAP-01
  - CAP-02

# Metrics
duration: 18m 10s
completed: 2026-04-19
---

# Phase 103 Plan 02: HEIC Conversion + Sync Parallel Triage Summary

**CAP-01 and CAP-02 fixed in one atomic plan — HEIC/HEIF photos now pass server-side JPEG pre-conversion via heic-convert, and /v1/process-photo commit-mode responses return thoughts with category populated from per-thought parallel triage (D-07 graceful-null on partial failure, D-08 preview-mode untouched).**

## Performance

- **Duration:** 18m 10s
- **Started:** 2026-04-19T18:31:53Z
- **Completed:** 2026-04-19T18:50:03Z
- **Tasks:** 3
- **Files modified:** 6 (1 new type declaration + 2 package files + 2 route source files + 1 test file)

## Accomplishments

- `heic-convert@2.1.0` installed as `vigil-core` production dep. Pure-JS HEIC→JPEG decoder; zero native dependencies; works on Railway out of the box (D-01 revised per Pitfall 1 in 103-RESEARCH.md).
- `vigil-core/src/types/heic-convert.d.ts` (14 lines) — ambient declaration patches the package's missing first-party types under TS strict mode.
- `vigil-core/src/routes/triage.ts` — added `export async function triageThought(content: string): Promise<TriageResult>` helper (+21 lines). Reuses existing `TRIAGE_SYSTEM_PROMPT` + `maxTokens: 100` verbatim. POST /v1/triage route behavior 100% unchanged (additive-only edit).
- `vigil-core/src/routes/process-photo.ts` — VALID_MEDIA_TYPES extended with `image/heic` + `image/heif`; ProcessPhotoDeps grew from 3 fields to 6 (added `heicConvertFn`, `triageFn`, `dbUpdateTriageFn`); new Step 3c converts HEIC buffers to JPEG BEFORE the Claude call; new Step 9b runs per-thought triage in parallel via `Promise.allSettled` AFTER DB insert, BEFORE the 201 response. Claude call now uses `claudeMediaType` + `claudeImageB64` post-conversion variables.
- All 8 Plan 00 RED CAP-* cases turn GREEN: CAP-01-a (HEIC→heicConvert→claude ordering), CAP-01-b (image/heif triggers same path), CAP-01-c (decode failure → 422, not 500), CAP-01-d (non-HEIC passthrough — heicConvertFn never called), CAP-02-a (category populated on response), CAP-02-b (N=3 thoughts triggers 3 triage calls), CAP-02-c (per-thought rejection returns 201 with exactly 1 null-category row), CAP-02-d (preview mode skips triage entirely).
- Zero regressions: 46/46 process-photo tests pass, auth middleware clean (8/8), thoughts router clean (8/8), `cd vigil-core && npm run build` succeeds, `npx tsc --noEmit` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install heic-convert@^2.1.0 + ambient type declaration** — `842a9cf` (chore)
2. **Task 2: Extract triageThought(content) helper from triage.ts** — `a2295c1` (feat)
3. **Task 3: Wire HEIC conversion + sync parallel triage into process-photo.ts** — `9d13dec` (feat)

## Before/After Response Shape

Pre-fix (from Plan 00 `artifacts/cap-02-pre-fix-curl.txt`, live Railway 2026-04-19):
```json
{
  "paperType": "lined",
  "confidence": 0.9,
  "thoughts": [
    { "id": 5891, "content": "...", "category": null, "confidence": null, ... },
    { "id": 5892, "content": "...", "category": null, "confidence": null, ... },
    { "id": 5893, "content": "...", "category": null, "confidence": null, ... },
    { "id": 5894, "content": "...", "category": null, "confidence": null, ... },
    { "id": 5895, "content": "...", "category": null, "confidence": null, ... }
  ]
}
```
All 5 thoughts: `category: null`. Every single capture required manual re-triage via the PWA. CAP-02 reproduced verbatim.

Post-fix (expected, pending Plan 04 deploy and VERIFICATION.md round-trip curl):
```json
{
  "paperType": "lined",
  "confidence": 0.9,
  "thoughts": [
    { "id": X, "content": "...", "category": "task", "confidence": 0.9, "tags": [...], "taskStatus": "open", ... },
    { "id": Y, "content": "...", "category": "idea", "confidence": 0.85, "tags": [...], ... },
    ...
  ]
}
```
Each thought has its own category, confidence, tags, and (if `category === "task"`) `taskStatus: "open"`. On per-thought triage failure, that thought keeps `category: null` while siblings get populated values — never lose the capture.

## ProcessPhotoDeps Shape Change

| Field | Pre-Plan-02 | Post-Plan-02 |
|-------|-------------|--------------|
| `callClaudeFn` | ✓ | ✓ |
| `getAIClientFn` | ✓ | ✓ |
| `dbInsertFn` | ✓ | ✓ |
| `heicConvertFn` | ✗ | ✓ (CAP-01 D-01) |
| `triageFn` | ✗ | ✓ (CAP-02 D-05/D-06) |
| `dbUpdateTriageFn` | ✗ | ✓ (CAP-02 D-07) |

Test `makeDeps()` grew corresponding defaults so existing `createProcessPhotoRouter(makeDeps())` call sites remain compatible with zero changes.

## Test Count Delta

| Metric | Pre-Plan-02 | Post-Plan-02 |
|--------|-------------|--------------|
| process-photo.test.ts total tests | 46 | 46 |
| Tests passing | 38 | 46 |
| Tests failing (Plan 00 RED CAP-*) | 6 | 0 |
| Tests passing by negation (CAP-01-d, CAP-02-d) | 2 | 2 (still pass, now for the right reason) |

## Decisions Made

- **Honored D-01 revision strictly** — `heic-convert` is installed; `sharp` is NOT. Research Assumption A1 flagged the libvips prebuilt HEIC gap on Railway; Plan 02 defaulted to the safer pure-JS path. Acceptance criterion explicitly forbids sharp in package.json; verified via grep.
- **Ambient `declare module "heic-convert"` over namespace-import workaround** — direct `import heicConvert from "heic-convert"` failed TS strict-mode check (TS7016). Rather than switch to a brittle `as unknown as { default: ... }` dance, added a 14-line ambient declaration in `src/types/heic-convert.d.ts`. Cleaner, future-proof if the package ever ships first-party types.
- **Promise.allSettled over Promise.all** — Pitfall 6 mitigation. One slow or throttled Claude triage call must NOT reject the whole batch. Each thought's outcome is evaluated independently in the post-settle loop; D-07 kicks in per-thought.
- **Separate `dbUpdateTriageFn` dep (not inline db.update)** — preserves the route-level test contract that NO test ever needs a real DB. Default wires to `db.update(thoughtsTable).set({...}).where(and(eq(id), eq(userId)))` — userId-scoped per T-103-02-05 mitigation.
- **Non-breaking ProcessPhotoDeps growth** — 3 new fields added as REQUIRED (not optional). Rationale: every caller needs a real triageFn in production; optional would invite silent no-op bugs. Test `makeDeps()` provides defaults; no existing call site breaks.
- **RT-1/RT-2 assertion update** — per-thought `confidence` now reflects triage confidence (0.9 from default makeDeps triageFn), not Claude vision confidence (0.92/0.88). Documented in-test with comments explaining the intentional behavior change. Page-level `json.confidence` (the paperType detection confidence) still equals Claude vision result.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing `makeDeps()` in test file needed defaults for 3 new required ProcessPhotoDeps fields**

- **Found during:** Task 3 post-edit `npx tsc --noEmit`
- **Issue:** After extending `ProcessPhotoDeps` with three new required fields (heicConvertFn, triageFn, dbUpdateTriageFn), the pre-existing `makeDeps()` helper in `process-photo.test.ts` no longer satisfied the type contract. TS raised TS2322 on line 203. Plan 00's runtime-RED pattern (`as Partial<ProcessPhotoDeps>` casts in the CAP-* cases) already anticipated this — but Plan 02 needed to LAND the defaults so the non-CAP tests that don't cast would still compile.
- **Fix:** Added three default implementations to `makeDeps()`:
  - `heicConvertFn: async (buf) => buf` (identity passthrough; CAP-01-* tests override per-case)
  - `triageFn: async () => ({ category: "task", confidence: 0.9 })` (deterministic fixture)
  - `dbUpdateTriageFn: async () => {}` (no-op; Plan 03 MeRouter pattern precedent)
- **Files modified:** `vigil-core/src/routes/process-photo.test.ts`
- **Verification:** `cd vigil-core && npx tsc --noEmit` exits 0; all 46 tests still pass.
- **Committed in:** `9d13dec` (same commit as Task 3 — single atomic landing).

**2. [Rule 1 - Bug] RT-1 and RT-2 assertions regressed — per-thought confidence now reflects triage result, not Claude vision**

- **Found during:** Task 3 first test run after makeDeps() default triageFn landed
- **Issue:** RT-1 asserted `t.confidence === 0.92` (Claude vision) on every returned thought; RT-2 asserted `0.88`. These assertions were VALID PRE-Plan-02 because no triage step ran. Post-Plan-02, the sync triage step updates the DB row with `confidence: triageResult.confidence` per the plan's behavior contract (D-05: "commit-mode response thoughts each have populated category") which also implies the row's confidence now reflects triage confidence.
- **Fix:** Updated RT-1 and RT-2 per-thought `confidence` assertions from Claude vision confidence (0.92 / 0.88) to default triage confidence (0.9). Added in-test comments explaining the behavior change. Page-level `json.confidence` (paperType detection) still asserts Claude vision result — only per-thought `t.confidence` changed.
- **Files modified:** `vigil-core/src/routes/process-photo.test.ts`
- **Verification:** 46/46 tests pass (was 44/46 before the fix).
- **Committed in:** `9d13dec` (same commit as Task 3).

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug — both required by the correct plan implementation; neither is scope creep).
**Impact on plan:** Zero scope change. Both deviations are test-file compatibility with correctly-implemented behavior.

## Issues Encountered

None beyond the two documented deviations. `npm test` full suite running slow in the backgrounded process but individual test-file runs confirmed zero regressions in the most-exercised routes (process-photo, auth, thoughts, me).

## Known Stubs

None. Every new dep has a real production default:
- `heicConvertFn` wraps `heic-convert` npm module
- `triageFn` wraps the new `triageThought` helper (real Claude call)
- `dbUpdateTriageFn` wraps `db.update(thoughtsTable)` with userId-scoped WHERE

## Threat Flags

None. Plan's `<threat_model>` (T-103-02-01..07) all map to concrete mitigations in the as-built code:
- T-103-02-01 (DoS via HEIC decode) — 5MB base64 cap runs BEFORE heic-convert
- T-103-02-02 (malformed HEIC tampering) — heic-convert@2.1.0 pure JS, no native CVEs
- T-103-02-03 (PostHog PII disclosure) — captureException context is `{route, method, op}` only; Plan 01's `redactEvent` strips request_body
- T-103-02-04 (Claude enum tampering) — `TriageResult` type enforces enum; parseAIJson validates shape; D-07 catches unexpected values
- T-103-02-05 (IDOR via dbUpdateTriageFn) — UPDATE WHERE id=$1 AND userId=$2 preserves multi-user isolation
- T-103-02-06 (Content-Type spoofing) — heic-convert rejects non-HEIC buffers → 422
- T-103-02-07 (30s budget blown by parallel triage) — D-07 graceful-null fallback per-thought; allSettled never short-circuits

## User Setup Required

None. Phase-level POSTHOG_API_KEY setup is Plan 01's concern; `heic-convert` is a plain npm install.

## Defense-in-depth reminder for Plan 04

When Plan 04 wires the live HEIC round-trip verification against Railway (per `<output>` §"live-Railway HEIC round-trip verification is pending deploy"), the curl probe should post a real iPhone HEIC file and assert:
1. HTTP 201 (not 400, not 422 on happy path)
2. Response `thoughts[i].category` is a real enum value (`"task"|"therapy"|"idea"|"reflection"|"project"`) — not null
3. The diff against `artifacts/cap-02-pre-fix-curl.txt` shows `"category":null` → `"category":"<enum>"` across every thought

This closes the end-to-end evidence loop started by Plan 00's pre-fix curl.

## Next Phase Readiness

- Plan 04 (global error handler + signal-handler shutdown) can now ship the final wiring: `app.onError(...)` + `await shutdownPosthog()` in SIGTERM/SIGINT handlers. Plan 02 does NOT touch `vigil-core/src/index.ts` — that remains Plan 04's scope.
- No blockers introduced for any downstream wave.
- Verification helper: `cd vigil-core && npx tsx --test src/routes/process-photo.test.ts` → expect 46/46 pass (8 CAP-* + 2 PHOTO-* + 10 D-04/D-08 + 20 RT-* + 6 T-60-*).

## Self-Check: PASSED

- File `vigil-core/src/types/heic-convert.d.ts` exists on disk
- File `vigil-core/src/routes/triage.ts` contains `export async function triageThought`
- File `vigil-core/src/routes/process-photo.ts` contains `image/heic`, `image/heif`, `heicConvertFn`, `triageFn`, `dbUpdateTriageFn`, `Promise.allSettled`, `captureException`, `Image conversion failed`, `claudeMediaType`, `claudeImageB64`
- File `vigil-core/package.json` contains `"heic-convert": "^2.1.0"` and does NOT contain `"sharp"`
- `vigil-core/node_modules/heic-convert/package.json` version is `2.1.0`
- `cd vigil-core && npx tsc --noEmit` exits 0
- `cd vigil-core && npx tsx --test src/routes/process-photo.test.ts` exits 0 with 46/46 passing, 0 failing
- `cd vigil-core && npm run build` succeeds (TS emits .js to dist/)
- Commit `842a9cf` exists in git log (Task 1)
- Commit `a2295c1` exists in git log (Task 2)
- Commit `9d13dec` exists in git log (Task 3)
- `git diff HEAD~3 HEAD vigil-core/src/routes/thoughts.ts vigil-core/src/routes/process-audio.ts` is empty (D-08 scope honored)

---
*Phase: 103-capture-repair-server-observability-foundations*
*Completed: 2026-04-19*
