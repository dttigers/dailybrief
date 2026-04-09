---
phase: 59
slug: smart-photo-upload-backend
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-09
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built into Node 22, zero deps) invoked via `tsx` |
| **Config file** | None (node:test has no config) |
| **Quick run command** | `cd vigil-core && npx tsx --test src/routes/process-photo.test.ts` |
| **Full suite command** | `cd vigil-core && npx tsx --test "src/**/*.test.ts"` |
| **Live smoke (gated)** | `cd vigil-core && API_KEY=vk_xxx npm run smoke-test` (existing script, extended with /process-photo section in Plan 02) |
| **Estimated runtime** | < 5s for unit suite |

Package.json `scripts` block MUST gain a `test` entry in Plan 01 Task 2:
```json
"test": "tsx --test \"src/**/*.test.ts\""
```

---

## Sampling Rate

- **After every task commit:** `npm test` (pure helper unit suite, no network, no DB)
- **After every plan wave:** `npm test` + `tsc --noEmit` (type-check)
- **Before `/gsd-verify-work`:** Full unit suite green + one manual live-API sanity call against a real lined sample and a real gridded sample
- **Max feedback latency:** < 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | PHOTO-01..04 enablement | — | N/A (mechanical export) | grep | `grep -q "^export function toResponse" vigil-core/src/routes/thoughts.ts && grep -q "^export interface ThoughtApiResponse" vigil-core/src/routes/thoughts.ts` | ✅ | ⬜ pending |
| 59-01-02 | 01 | 1 | Wave 0 infra | — | N/A | smoke | `cd vigil-core && npm test` (empty suite OK, exit 0) | ❌ W0 | ⬜ pending |
| 59-01-03 | 01 | 2 | PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-04 | T-59-04 | Parse-failure fallback returns raw text as single lined thought (no 502) | unit | `cd vigil-core && npx tsx --test src/routes/process-photo.test.ts` | ❌ W0 | ⬜ pending |
| 59-01-04 | 01 | 2 | PHOTO-01..04 | T-59-05 | Route mounted under `/v1/*` bearer-auth umbrella | grep+build | `grep -q "processPhoto" vigil-core/src/index.ts && cd vigil-core && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 59-02-01 | 02 | 3 | PHOTO-01..04 | T-59-02 | Prompt hardened: role override + counter-example + [illegible] escape hatch | grep | `grep -q "OCR engine" vigil-core/src/routes/process-photo.ts && grep -q "call mom" vigil-core/src/routes/process-photo.ts` | ❌ W0 | ⬜ pending |
| 59-02-02 | 02 | 3 | PHOTO-02, PHOTO-03 | T-59-03 | Batched Drizzle insert (single round-trip, atomic) | unit+grep | `cd vigil-core && npm test && grep -q "values(.*\\.map" vigil-core/src/routes/process-photo.ts` | ❌ W0 | ⬜ pending |
| 59-02-03 | 02 | 3 | PHOTO-01..04 | T-59-01 | Input validation rejects missing/invalid image + mediaType (400); `mediaType` allowlist | unit (route) | `cd vigil-core && npm test` | ❌ W0 | ⬜ pending |
| 59-02-04 | 02 | 4 | success criterion 5 | T-59-02 | Live sample verbatim (human confirms no paraphrase) | checkpoint:human-verify | manual | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Phase Requirements → Test Assertion Map

| Req ID / Decision | Assertion | Test function name (suggested) |
|-------------------|-----------|--------------------------------|
| PHOTO-01 | `processClaudeResponse(linedFixture).paperType === "lined"` and `.confidence === 0.92` | `test("PHOTO-01 paperType+confidence populated")` |
| PHOTO-02 | `processClaudeResponse(linedFixture).thoughts.length === 3` | `test("PHOTO-02 lined returns multiple thoughts")` |
| PHOTO-03 | `processClaudeResponse(griddedFixture).thoughts.length === 1` | `test("PHOTO-03 gridded returns exactly one thought")` |
| PHOTO-04 | `processClaudeResponse(verbatimFixture).thoughts[0] === "I need to call mom"` (strict equality, no rewrite) | `test("PHOTO-04 verbatim preserved exactly")` |
| D-04 low-confidence fallback | `processClaudeResponse(ambiguousFixture /* conf 0.3 */).thoughts.length > 1` (treated as lined) | `test("D-04 confidence<0.5 falls back to lined split")` |
| D-04 unknown fallback | `processClaudeResponse(unknownFixture /* paperType "unknown", 2 thoughts */).thoughts.length === 2` | `test("D-04 unknown paperType falls back to lined")` |
| D-04 gridded coercion | Gridded with 3 thoughts returns concatenated single thought (defensive) | `test("D-04 defensive: gridded with >1 thoughts concatenates")` |
| D-08 parse-failure fallback | `processClaudeResponse("Here is the JSON: ...").thoughts.length === 1 && paperType === "unknown" && confidence === 0` | `test("D-08 malformed JSON falls back to single lined thought")` |
| D-08 error contract | POST /process-photo with no `image` → 400; no `mediaType` → 400; invalid mediaType → 400 | `test("route returns 400 on missing image")` etc. |
| D-08 503 | Route returns 503 when getAIClient() is stubbed null | `test("route returns 503 when AI client unavailable")` |
| Success criterion 5 (smoke) | Live POST to running instance with real lined + real gridded images → shape matches; human confirms verbatim | Manual checkpoint in Plan 02 Task 4 |

---

## Wave 0 Requirements

- [ ] `vigil-core/package.json` gains `"test": "tsx --test \"src/**/*.test.ts\""` script (Plan 01 Task 2)
- [ ] `vigil-core/src/routes/thoughts.ts` — `toResponse` function and `ThoughtApiResponse` interface exported (Plan 01 Task 1)
- [ ] `vigil-core/src/routes/process-photo.ts` — route scaffold + exported pure `processClaudeResponse` helper (Plan 01 Task 3)
- [ ] `vigil-core/src/routes/process-photo.test.ts` — all unit tests above, using `node:test` (Plan 01 Task 3)

*Framework install: NONE. `node:test` is built into Node 22. `tsx ^4.19.0` already in devDependencies.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real lined-paper photo → multiple verbatim thoughts | Success criterion 1 + PHOTO-04 | Requires live Claude API + real image; verbatim judgment is a human call | Plan 02 Task 4: start `vigil-core` locally, POST a real lined-paper photo via `curl`, human reads returned thoughts and confirms no paraphrase |
| Real gridded-paper photo → single thought | Success criterion 2 | Same (live API + real image) | Plan 02 Task 4: POST real gridded photo, confirm `thoughts.length === 1` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test framework + helper + fixtures)
- [x] No watch-mode flags
- [x] Feedback latency < 59s (actual: < 10s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-09
