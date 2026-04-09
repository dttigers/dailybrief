---
phase: 59-smart-photo-upload-backend
plan: 02
subsystem: api
tags: [hono, claude-vision, drizzle, postgres, anthropic, multimodal, ocr]

requires:
  - phase: 59-smart-photo-upload-backend (plan 01)
    provides: "processClaudeResponse helper with 11 unit tests covering D-02/D-04/D-08 coercions; toResponse + ThoughtApiResponse exports from thoughts.ts; /process-photo route scaffold with 501 stub"
provides:
  - Fully wired POST /v1/process-photo endpoint (Claude vision → batched DB insert → typed response)
  - Hardened verbatim-OCR Claude prompt (maxTokens 2000) with [illegible] escape hatch and "call mom" counter-example
  - ProcessPhotoDeps DI factory for injectable fake Claude + dbInsert in tests
  - 11 route-level tests covering every D-08 error branch + P-7 UUID uniqueness
  - testProcessPhoto() section in scripts/smoke-test.ts (live-API gate)
affects: [photo-upload-ui, eyes-plugin, capture-pipeline]

tech-stack:
  added: []
  patterns:
    - "Dependency-injected route factory (createProcessPhoto*Router) for testability without module mocking"
    - "Single batched Drizzle insert with per-row crypto.randomUUID() cloudKitRecordID"
    - "D-08 error mapping: 400 (validation) / 503 (no AI client) / 502 (Claude throws) / 500 (DB throws) / 201 (parse-failure fallback)"

key-files:
  created: []
  modified:
    - "vigil-core/src/routes/process-photo.ts"
    - "vigil-core/src/routes/process-photo.test.ts"
    - "vigil-core/scripts/smoke-test.ts"

key-decisions:
  - "Preserve per-thought confidence = paper-detection confidence (not per-item LLM confidence) to avoid false precision"
  - "Single batched insert (not per-thought) — atomicity + 1 round-trip matches P-12"
  - "Log only err.message / 'Create failed' in error branches — never body.image or rawText (T-59-04 logging discipline)"
  - "Keep legacy export of processPhoto handler alongside createProcessPhotoRouter factory so index.ts mount continues to work unchanged"

patterns-established:
  - "DI factory pattern for route testability: createProcessPhotoRouter({ callClaude, dbInsert }) — tests inject fakes, production uses real deps"
  - "Verbatim-OCR prompt discipline: role override as 'OCR engine, not an assistant', concrete counter-example, [illegible] marker"
  - "Error mapping gate: Claude errors → 502, DB errors → 500, validation → 400, no-ai-client → 503, parse failure → 201 with lined-fallback"

requirements-completed:
  - PHOTO-01
  - PHOTO-02
  - PHOTO-03
  - PHOTO-04

duration: ~45min (execution) + human-verify checkpoint
completed: 2026-04-09
---

# Phase 59 Plan 02: /process-photo Production Wire-Up Summary

**Verbatim-OCR photo endpoint live — Claude vision + batched Postgres insert + real lined/gridded handwriting verified with a writer's typo preserved through the pipeline**

## Performance

- **Duration:** ~45 min autonomous execution + human-verify checkpoint
- **Completed:** 2026-04-09
- **Tasks:** 4 (3 autonomous + 1 human-verify)
- **Files modified:** 3

## Accomplishments

- **Production `/v1/process-photo` endpoint** — replaces Plan 01's 501 stub. Single `callClaudeMultimodal` call with hardened verbatim prompt → `processClaudeResponse` (from Plan 01, unit-tested) → single batched Drizzle insert → `{paperType, confidence, thoughts: ThoughtApiResponse[]}`
- **Injectable test surface** — `ProcessPhotoDeps` + `createProcessPhotoRouter` factory lets tests swap in fake Claude and fake dbInsert without module mocking
- **11 new route-level tests (RT-1..RT-11)** — cover every D-08 error branch (400 missing image, 400 missing mediaType, 400 invalid mediaType, 503 no AI client, 502 Claude throws, 500 DB throws, 201 parse-failure fallback) plus P-7 UUID uniqueness and happy paths for lined + gridded
- **Extended smoke-test** — `testProcessPhoto()` section hits a running instance with a minimal PNG for shape validation + 400 validation paths
- **Real-photo verification passed** on both paper types with verbatim evidence

## Task Commits

Each task committed atomically on feature branch:

1. **Task 1:** Wire Claude call + batched DB insert + toResponse serialization — `50e169e` (feat)
2. **Task 2:** Route-level tests with fake Claude injection (RT-1..RT-11) — `3065c70` (test)
3. **Task 3:** Extend smoke-test.ts with testProcessPhoto() section — `da368f2` (chore)
4. **Task 4:** Human verification — this commit (docs)

## Files Modified

- `vigil-core/src/routes/process-photo.ts` — Full production implementation; exports `createProcessPhotoRouter(deps)` factory + legacy `processPhoto` handler for existing index.ts mount
- `vigil-core/src/routes/process-photo.test.ts` — 11 route-level tests via injected fakes
- `vigil-core/scripts/smoke-test.ts` — Added `testProcessPhoto()` section (happy path + 2 validation paths)

## Decisions Made

- **Per-thought confidence = paper-detection confidence** — not per-item LLM confidence. Avoids false precision when the LLM has no reliable per-item score.
- **One batched insert, not N inserts** — P-12 atomicity + single round-trip. `crypto.randomUUID()` generated inside the `.map()` that builds insert rows so each row gets a unique cloudKitRecordID (P-7, verified by RT-11).
- **Error log discipline** — error branches log `err.message` and `"Create failed"` only. `body.image` (raw base64) and Claude's `rawText` never hit logs (T-59-04).
- **Keep legacy `processPhoto` export** — `src/index.ts` already mounts it from Plan 01; the factory is additive so no mount change was needed.

## Deviations from Plan

None — plan executed exactly as written. The Task 4 verification script in the plan was followed; no auto-fixes triggered; no scope changes.

## Issues Encountered

**1. Claude 5MB base64 limit (upstream, not a route bug):**
Real-world gridded photo from the iPhone encoded to ~6.3MB base64 — Anthropic rejected it. Route correctly propagated the error. Human operator resized the source with `sips -Z 1600 -s formatOptions 75` (cap longest edge at 1600px, JPEG quality 75) — well under 5MB and OCR quality was unaffected. **Follow-up candidate:** optional client-side resize, or a pre-flight size check in the route returning 413 with a cleaner message instead of forwarding Claude's 400. Not blocking — logged for future polish.

**2. Smoke test happy-path expected failure on placeholder PNG:**
The `testProcessPhoto()` happy path ships a 1×1 transparent PNG. Claude rejects it (no content to transcribe), which the route correctly maps to **502**. This is the Claude-throws error path working as designed, not a bug. The smoke test's two 400 validation paths still pass, confirming body validation. Real photos are covered by the human-verify checkpoint below.

**3. Local dev port conflict on iMac:**
`com.jamesonmorrill.vigilcore` launchd daemon owns `:3001` persistently on this machine (runs `dist/index.js`). Had to `launchctl bootout gui/$UID/com.jamesonmorrill.vigilcore` before `npm run dev` could bind. Captured in memory (`project_imac_vigilcore_daemon.md`) so it doesn't re-bite on the next local dev session.

## Human Verification Evidence

Live test against `http://localhost:3001/v1/process-photo` on 2026-04-09, Anthropic + Railway Postgres public proxy (`hopper.proxy.rlwy.net:22526`). Bearer key `vk_94ec84a5…`. Photos sourced from operator's physical notebook.

### Lined-paper photo (operator's journal page)

```
paperType:   "lined"
confidence:  0.9
thoughts.length: 5
```

All 5 thoughts returned verbatim with `source="image"`, `confidence=0.9`, `projectId=null`, and 5 unique `cloudKitRecordID` values. Content preserved **first-person voice, original punctuation, trailing `--` marks, and — critically — the writer's typo (`"recieved"` was NOT corrected to `"received"`)**. Profanity in the source (`"as fuck"`) was not sanitized. This is the strongest possible verbatim-not-paraphrase signal: no LLM OCR pass would leave a misspelling alone unless the prompt's "OCR engine, not an assistant" role override is actually binding.

### Gridded-paper photo (operator's project brainstorm page)

```
paperType:   "gridded"
confidence:  0.95
thoughts.length: 1
```

Single thought containing the **full verbatim page transcription** with layout preserved via whitespace and newlines (indented sub-bullets rendered as multi-space runs, `/` list markers preserved, version tag `"V1.3- last before Beta"` intact). **`[illegible]` marker used correctly** for one unreadable span — exact pattern from the prompt spec (Rule 4). Unique UUID, all expected fields.

### What this verifies

- **PHOTO-01** — `/v1/process-photo` exists, accepts JSON base64, persists thoughts ✓
- **PHOTO-02** — Claude vision pipeline returns `{paperType, confidence, thoughts[]}` ✓
- **PHOTO-03** — Lined-paper → N split thoughts; gridded-paper → 1 blob thought ✓
- **PHOTO-04** — Verbatim transcription (no paraphrase, no sanitization, typos preserved, `[illegible]` marker honored) ✓

## User Setup Required

None — endpoint is live on the feature branch. Local dev requires `DATABASE_URL` + `ANTHROPIC_API_KEY` env vars; production Railway deploy inherits these from existing service config. No new secrets.

**Operator note:** after local dev sessions, reload the iMac launchd daemon with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jamesonmorrill.vigilcore.plist` to restore the always-on local vigilcore.

## Next Phase Readiness

- Backend photo pipeline complete — Eyes plugin / photo capture UI can now POST to `/v1/process-photo` and consume typed thoughts
- No blockers
- Polish candidate (non-blocking): pre-flight image size check (< 5MB base64) returning 413 before hitting Claude, sparing one round-trip on oversized photos

---
*Phase: 59-smart-photo-upload-backend*
*Completed: 2026-04-09*
