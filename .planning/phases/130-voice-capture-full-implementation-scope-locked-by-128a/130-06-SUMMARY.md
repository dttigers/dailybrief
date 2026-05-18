---
phase: 130
plan: 06
subsystem: voice-capture
tags: [drift-detector, wav-header, audioPcm-redaction, audioControl-pairing, source-grep, VOICE-08]
dependency_graph:
  requires:
    - "Phase 130 Plan 02 — production voice-transcribe.ts route (D-D2 explicit pin)"
    - "Phase 130 Plan 04 — wav-encoder.ts buildWav (D-D1 byte map) + safeAudioControl Promise<boolean> + voice.ts call pair (D-D3 source)"
    - "Phase 127 GUARD-01 three-rail drift detector (D-D2 extends Rail 4 onto plugin source)"
    - "Phase 127 GUARD-02 audio-session-guard.ts wrapper (D-D3 EXCLUDED — wrapper implementation is exempt from caller pairing)"
  provides:
    - "D-D1 byte-for-byte WAV header pin — 13 distinct test() blocks pinning RIFF/WAVE/fmt /16kHz/mono/16-bit/data/byte-rate/block-align positions"
    - "D-D2 audioPcm-in-logs ban extended to vigil-core/src/ + vigil-g2-plugin/src/ + dedicated voice-transcribe.ts pin (server) AND vigil-pwa/src/ (PWA) with comment-stripped sink-line scanning"
    - "D-D3 safeAudioControl(true,…) === safeAudioControl(false,…) source-grep parity across vigil-g2-plugin/src/ with per-file offender reporting"
  affects:
    - "vigil-g2-plugin/src/__tests__/wav-encoder.test.ts (extended from 8 → 13 tests)"
    - "vigil-core/src/__tests__/audio-log-redaction.test.ts (extended with Rail 4 / 4 new tests for D-D2)"
    - "vigil-pwa/src/__tests__/denylist-parity.test.ts (extended with 3 new D-D2 tests)"
    - "vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts (NEW — 4 tests)"
tech_stack:
  added: []
  patterns:
    - "Comment-stripped source-grep — block comments (`/* … */`) and line comments (`^\\s*//`) stripped BEFORE sink-line scanning so JSDoc / inline-comment prose about banned patterns does not self-trip the detector"
    - "Sink-call detector regex — `/(?:console\\.(?:log|warn|error|info|debug)|Sentry\\.captureException|posthog\\.capture)\\s*\\(/` matches the seven production log-sink call shapes only"
    - "Object-key-position pcm detector — `/['\"]pcm['\"]\\s*:|(?<![A-Za-z0-9_])pcm\\s*:(?!:)/` matches `'pcm':` and `pcm:` object-key positions but NOT variable names like `pcmChunks` (no `:` trailing)"
    - "Literal-substring counting for D-D3 — `safeAudioControl(true,` and `safeAudioControl(false,` counted as literal substrings (trailing comma included) so function signatures and type declarations are not miscounted"
    - "Per-file offender breakdown — D-D3 failure mode prints true/false counts AND line numbers per offending file, so CI failure messages point developers at the exact source of the imbalance"
    - "Anti-trivial-pass smoke tests — every new drift detector includes a fixture-only test that confirms comment-stripping actually works (synthetic source with banned keys ONLY in comments + benign sink call MUST scan as zero offenders)"
key_files:
  created:
    - "vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts (~275 lines)"
  modified:
    - "vigil-g2-plugin/src/__tests__/wav-encoder.test.ts (8 → 13 tests; +73 lines)"
    - "vigil-core/src/__tests__/audio-log-redaction.test.ts (+207 lines — Rail 4 / D-D2 helpers + 4 tests)"
    - "vigil-pwa/src/__tests__/denylist-parity.test.ts (+171 lines — D-D2 PWA-side scanner + 3 tests)"
decisions:
  - "D-D1 finalize without rewrite — Plan 04 already pinned the 8 D-D1 byte positions via hex assertions; Plan 06 ADDS ASCII-marker assertions ('RIFF' / 'WAVE' / 'fmt ' / 'data' as decoded strings) + block-align (offset 32) so the test source explicitly references the literals required by the acceptance criterion. Source-grep acceptance: 13 distinct test() blocks; literals 'RIFF' / 'WAVE' / 'fmt ' / 'data' present; values 16000 / 32000 / 16 present; DataView + .getUint32(..., true) present."
  - "D-D2 extends GUARD-01 with Rail 4 — naive Phase 127 regex `/console\\.(log|...)[^)\\n]*(audio|pcm)/i` is too coarse for Phase 130 surface (matches comment prose, matches `pcmChunks` variables). Plan 06 introduces a stricter scanner: comment-strip first, then line-level intersection of (sink-call regex) AND (banned-key regex) with word boundaries on `audioPcm` / `audio_pcm` and object-key-position pattern on `pcm:`. Existing Rail 3 left intact so Phase 127 coverage does not regress."
  - "D-D2 cross-workspace path — vigil-core test reaches into vigil-g2-plugin/src/ via `path.join(ROOT, '..', '..', 'vigil-g2-plugin', 'src')`. Hard-fail on path resolution (T-127-01-C semantics) — if the relative path breaks, the test fails with a named-error message rather than silently skipping. Mirrors the denylist-parity.test.ts cross-workspace pattern from Phase 127 Plan 02."
  - "D-D2 PWA scanner is a complete clone, not an import — vigil-pwa uses vitest + ESM; vigil-core uses node:test. The scanner helpers (walk + stripComments + sink-line scan) are forked into the PWA test file so the workspace boundary stays a hard divide (no cross-workspace imports). Mirror of the denylist-parity.test.ts duplication pattern."
  - "D-D3 EXCLUDES audio-session-guard.ts — the wrapper implementation's 4 cleanup hooks call `bridge.audioControl(false)` (NOT `safeAudioControl(false,`) on the four exit paths. The wrapper contributes zero counts. Exclusion is documented in CONTEXT D-D3 and in the test file's EXCLUDED_FILES Set comment."
  - "D-D3 trailing-comma in literal — `safeAudioControl(true,` and `safeAudioControl(false,` (WITH the comma) is the canonical CALL form; type declarations and the function signature do NOT include the comma. Counting the bare form `safeAudioControl(true` would mis-match the wrapper's function declaration (`export async function safeAudioControl(on: boolean, ...)`)."
  - "Rule 2 deviation NONE — every test is wrapped in comment-stripping. The single observed risk during execution was the D-D2 PWA scanner: vitest's `describe`/`it` accepts a custom-message string as the third arg of `expect(value, message).toEqual(...)`. Spec-compliant; no fallback needed."
metrics:
  duration_minutes: 18
  completed_date: "2026-05-18"
  tasks_completed: 3
  files_created: 1
  files_modified: 3
  lines_changed: ~450
---

# Phase 130 Plan 06: Drift Detectors (D-D1 / D-D2 / D-D3) Summary

**One-liner:** Three drift detectors pinned in CI so future commits cannot silently regress the 16 kHz mono 16-bit WAV header structure, leak `audioPcm` / `audio_pcm` / object-key `pcm:` to any log sink across vigil-core + vigil-g2-plugin + vigil-pwa, or introduce an orphan `safeAudioControl(true,` call without a matching `(false,`.

## What Shipped

Plan 06 closes VOICE-08 (the drift-detector portion). Phase 130 production code (Plans 02–05) is well-formed today; this plan adds the structural CI defense so it stays well-formed across all future v3.9+ commits that touch the plugin source, the voice-transcribe.ts route, or any PostHog/Sentry/console.* call site.

### Task 1 — D-D1 wav-encoder.test.ts finalized (commit `8ffaae7`)

The test file existed from Plan 04 with 8 distinct `test(...)` blocks already pinning all 8 D-D1 header positions byte-for-byte via hex assertions. Plan 06 acceptance criterion required the source file to ALSO contain the literal ASCII strings `'RIFF'`, `'WAVE'`, `'fmt '`, `'data'` (so source-greps can verify the test pins the right strings, not just the hex bytes). Added:

1. Four ASCII-marker tests — `readAscii(wav, 0, 4) === 'RIFF'` / `'WAVE'` / `'fmt '` / `'data'`. Decodes via `String.fromCharCode` so the test does not depend on TextDecoder availability.
2. Trailing-space invariant pin at byte 15 (`wav[15] === 0x20`) so a `'fmt0'` regression breaks even with all numeric fields intact.
3. Block-align assertion at offset 32 (`view.getUint16(32, true) === 2`) — block align = channels × bit depth / 8 = 1 × 16 / 8 = 2. A stereo regression (channels = 2 → block align = 4) trips here in addition to byte 22.
4. Four ASCII-marker constants (`RIFF_MARKER`, `WAVE_MARKER`, `FMT_MARKER`, `DATA_MARKER`) defined at module scope so the source-grep acceptance criterion sees the exact literals.

Test count: 8 → 13. All 13 GREEN against current Plan 04 `wav-encoder.ts`.

### Task 2 — D-D2 audioPcm-in-logs ban extended (commit `5994afd`)

Two test files extended with parallel `D-D2` scanners:

**`vigil-core/src/__tests__/audio-log-redaction.test.ts`** — added a new `describe("D-D2 (Phase 130 Plan 06) — extended source-grep scope across vigil-core + vigil-g2-plugin")` block with 4 tests:

- **D-D2.A** — walks `vigil-core/src/` (excluding `__tests__/`, `analytics/posthog.ts`, `lib/sentry.ts`); for each `.ts` file, applies `stripComments()` (block comments first, then `^\s*//`), then scans line-by-line for intersection of `SINK_REGEX = /(?:console\.(?:log|warn|error|info|debug)|Sentry\.captureException|posthog\.capture)\s*\(/` AND any of `BANNED_AUDIOPCM = /\baudioPcm\b/` / `BANNED_AUDIO_PCM = /\baudio_pcm\b/` / `BANNED_PCM_KEY = /(['"]pcm['"]\s*:|(?<![A-Za-z0-9_])pcm\s*:(?!:))/`. Offenders are reported with file path + line number + matched pattern + line text.
- **D-D2.B** — same scanner applied to `vigil-g2-plugin/src/` via cross-workspace path `path.join(ROOT, '..', '..', 'vigil-g2-plugin', 'src')`. Hard-fails (T-127-01-C semantics) if the cross-workspace path resolution breaks. Asserts `files.length > 0` as anti-trivial-pass guard.
- **D-D2.C** — dedicated assertion on `vigil-core/src/routes/voice-transcribe.ts` (the file the audioPcm-in-logs invariant guards). Reads the file directly via `path.join(ROOT, 'routes', 'voice-transcribe.ts')`; surfaces a named-error message if the file is renamed/moved.
- **D-D2.D** — comment-hygiene anti-trivial-pass smoke. Synthesizes a fixture with banned-key references ONLY in JSDoc + line comments + a benign sink call (`console.log('voice processed', { bytes: 100, t: Date.now() })`), runs the strip+scan, and asserts zero offenders. Without this test, someone could weaken `stripComments()` and the suite would silently still pass.

**`vigil-pwa/src/__tests__/denylist-parity.test.ts`** — added a parallel `describe("D-D2 (Phase 130 Plan 06) — no log-sink call line in vigil-pwa/src/ contains audioPcm/audio_pcm/pcm:")` block with 3 tests:

- **D-D2.PWA** — walks `vigil-pwa/src/` (excluding `__tests__/`, `analytics/posthog.ts`, `lib/sentry-redact.ts`) with the same forked scanner (vitest+ESM context — helpers cloned, not imported across workspaces).
- **D-D2.PWA-COMMENT-HYGIENE** — comment-hygiene anti-trivial-pass smoke (same shape as D-D2.D).
- **D-D2.PWA-PATTERNS-PRESENT** — self-grep anti-trivial-pass. The PWA test file MUST reference `audioPcm`, `audio_pcm`, and `pcm:` patterns (Plan 06 acceptance criterion).

All 7 server-side + 5 PWA tests GREEN against current Phase 130 production source. Today's coverage:

- vigil-core/src/ produces zero offenders (Plan 02 voice-transcribe.ts logs only via `console.error(...)` on the transcribe-failure path, never with banned keys).
- vigil-g2-plugin/src/ produces zero offenders (Plan 04 main.ts:373 logs `[voice] chunk bytes=${chunk.length} t=${t}` — safe key names only; Plan 04 voice.ts has zero log calls touching PCM bytes).
- vigil-pwa/src/ produces zero offenders (no PWA code references audio PCM in logs at all).

### Task 3 — D-D3 audiocontrol-pairing.test.ts authored (commit `f86a7d0`)

NEW file `vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts` (~275 lines). Walks `vigil-g2-plugin/src/` recursively (excluding `__tests__/` directories + `audio-session-guard.ts`) and counts literal substring occurrences of `safeAudioControl(true,` and `safeAudioControl(false,` (trailing comma included — that's the CALL form; the function signature uses different punctuation). Includes 4 tests:

- **Main pairing test** — strips comments per file, sums true/false counts across all eligible files, asserts `totalTrue === totalFalse`, and includes anti-trivial-pass `assert.ok(totalTrue >= 1, ...)` so the test cannot pass on an empty source tree. On failure, the message prints per-file breakdown including the offending line numbers for both true and false calls.
- **Comment hygiene** — synthetic fixture with the literal call form ONLY in JSDoc + line comments; after `stripComments()`, count MUST be zero. Equivalent to D-D2.D for D-D3 surface.
- **Excluded paths** — defensive assertion that `audio-session-guard.ts` is in `EXCLUDED_FILES`. The wrapper file uses `bridge.audioControl(true/false)` (without the `safe` prefix) so the exclusion is documentary today, but it pins the intent for future refactors.
- **Imbalance message format** — self-test on the failure-message template against a synthetic per-file breakdown. Guarantees future regressions surface useful diagnostics in CI logs.

Current Plan 04 voice.ts: 1 × `safeAudioControl(true, bridge)` (START path) + 1 × `safeAudioControl(false, bridge)` (STOP path). Counts: 1 === 1. GREEN.

## Verification Results

### Tests

```
vigil-g2-plugin/src/__tests__/wav-encoder.test.ts         13/13   GREEN
vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts 4/4    GREEN
vigil-core/src/__tests__/audio-log-redaction.test.ts       7/7    GREEN (3 existing + 4 new D-D2)
vigil-pwa/src/__tests__/denylist-parity.test.ts            5/5    GREEN (2 existing + 3 new D-D2)
Full vigil-g2-plugin suite:                              154/155  PASS (1 pre-existing D-129 TTL drift failure, deferred since Plan 01)
```

The 1 remaining `vigil-g2-plugin` failure is `D-129 drift: TTL constant 30 * 60 * 1000 present in helpers (via screen-state-restore import)` at `src/__tests__/main.test.ts:263`. Confirmed pre-existing per Plan 01's `git stash` verification — NOT introduced by Plan 06. Carried in `deferred-items.md` Issue #1 since Plan 01.

### Build

- `cd vigil-g2-plugin && npx tsc --noEmit` → exit 0 (clean typecheck)
- `cd vigil-core && npx tsc --noEmit` → exit 0 (clean typecheck)

### Acceptance Criteria (Plan 06)

**Task 1 (D-D1):**

- ✅ `wav-encoder.test.ts` contains 13 `test(...)` blocks (≥ 8 required)
- ✅ Source references exact ASCII literals `'RIFF'`, `'WAVE'`, `'fmt '`, `'data'`
- ✅ Source references exact values `16000`, `32000`, `16`
- ✅ Source uses `DataView` AND `.getUint32(..., true)` (little-endian)
- ✅ `cd vigil-g2-plugin && npx tsx --test src/__tests__/wav-encoder.test.ts` exits 0

**Task 2 (D-D2):**

- ✅ `audio-log-redaction.test.ts` walks BOTH `vigil-core/src/` AND `vigil-g2-plugin/src/`
- ✅ References `vigil-core/src/routes/voice-transcribe.ts` explicitly (dedicated assertion D-D2.C)
- ✅ Uses comment-stripped scanning via `stripComments()` (not naive `grep -c`)
- ✅ Asserts patterns `audioPcm` AND `audio_pcm` AND object-key `pcm:` absent from `console.*` / `Sentry.captureException` / `posthog.capture` lines in both packages
- ✅ `denylist-parity.test.ts` references the same three patterns
- ✅ `cd vigil-core && npx tsx --test src/__tests__/audio-log-redaction.test.ts` exits 0
- ✅ `cd vigil-pwa && npx vitest run src/__tests__/denylist-parity.test.ts` exits 0

**Task 3 (D-D3):**

- ✅ `audiocontrol-pairing.test.ts` walks `vigil-g2-plugin/src/` recursively
- ✅ Strips comments before counting (substring filter — see `stripComments()`)
- ✅ Asserts `count_true === count_false` via `assert.equal(totalTrue, totalFalse, ...)`
- ✅ Excludes `audio-session-guard.ts` (`EXCLUDED_FILES` Set)
- ✅ Useful failure message includes both counts AND offender file(s) + line numbers
- ✅ `cd vigil-g2-plugin && npx tsx --test src/__tests__/audiocontrol-pairing.test.ts` exits 0
- ✅ `cd vigil-g2-plugin && npm test` exits 1 due to pre-existing D-129 failure (NOT introduced by this plan); full Plan 06 surface 17/17 GREEN

## Deviations from Plan

### None

Plan 06 ships tests-only with no production-code changes. No auto-fixes (Rules 1-3) applied. No checkpoint type tasks. The 1 remaining failing test in the full plugin suite (`D-129 drift: TTL constant 30 * 60 * 1000`) is pre-existing and documented as deferred since Plan 01.

## Authentication Gates

None — Plan 06 is autonomous test-only execution. No external services touched; no API keys consulted.

## Threat Flags

None — Plan 06 introduces no new surface. The 4 entries in the plan's `<threat_model>` block (T-130-06-1 audioPcm log leak, T-130-06-2 orphan audioControl, T-130-06-3 WAV header drift, T-130-06-SC package install) are all satisfied:

- T-130-06-1 → mitigated by D-D2 extended scope (vigil-core + vigil-g2-plugin + vigil-pwa, with comment-stripped sink-line scanning)
- T-130-06-2 → mitigated by D-D3 source-grep parity (vigil-g2-plugin/src/ with per-file offender breakdown)
- T-130-06-3 → mitigated by D-D1 byte-for-byte pin (13 distinct test() blocks, 8 header positions + 5 bonus)
- T-130-06-SC → no new packages installed (test-only changes use existing `node:test` + `node:fs` + `vitest` already in tree)

## Known Stubs

None — every assertion runs against real production source. The synthetic-fixture tests (D-D2.D / D-D2.PWA-COMMENT-HYGIENE / D-D3 comment hygiene / D-D3 imbalance message) exercise the scanner machinery against fabricated input but those are NOT stubs — they are anti-trivial-pass smoke tests that catch regressions in the scanner itself.

## Key Decisions Made

1. **D-D1 EXTEND, not rewrite** — Plan 04 already pinned the 8 D-D1 byte positions via hex assertions. The plan's acceptance criterion required additional source-greppable literals (`'RIFF'` / `'WAVE'` / `'fmt '` / `'data'`) and a value-source-grep for `16000` / `32000` / `16`. Rather than refactor the existing tests, Plan 06 appends a new batch of ASCII-marker assertions + a block-align assertion. Net delta: 8 → 13 test() blocks; 5 new assertions; zero changes to existing tests.

2. **D-D2 NEW Rail (Rail 4), not replacement** — the Phase 127 Rail 3 regex (`/console\.(log|info|warn|error|debug)[^)\n]*(audio|pcm)/i`) is intentionally broad. Plan 06 keeps Rail 3 as-is so Phase 127 GUARD-01 coverage does not regress, and introduces a tighter Rail 4 with comment-stripping + sink+key intersection + word-boundary + object-key-position. The two rails are complementary: Rail 3 catches catch-all `console.error('...audio...')` strings; Rail 4 catches structured-data-leak shape `console.log({ audioPcm: ... })`.

3. **D-D2 PWA scanner is forked, not imported** — vigil-pwa uses vitest+ESM with a separate `node_modules`; cross-workspace imports would couple the test runtime. The scanner helpers (`walkPwaSrc`, `stripPwaComments`, `PWA_SINK_REGEX`, `PWA_BANNED_*`, `scanPwaForBannedSinkLines`) are duplicated into the PWA test file. Mirrors the Phase 127 `denylist-parity.test.ts` precedent.

4. **D-D3 trailing comma in literal** — the literal substring `safeAudioControl(true,` (WITH comma) is the canonical call form. Counting bare `safeAudioControl(true` would erroneously match the wrapper's function declaration `export async function safeAudioControl(on: boolean, ...)`. Counting `safeAudioControl(true)` (with closing paren) would miss the real call form. The trailing-comma form is uniquely a call-site shape.

5. **D-D3 exclusion is documentary** — `audio-session-guard.ts` doesn't currently contribute to either count (it uses `bridge.audioControl(true/false)`, not `safeAudioControl(true/false,`). The exclusion is preserved as a documented invariant so future refactors that move the wrapper logic don't silently break parity counting.

## Files Audit

**Created (1):**
- `vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts` (275 lines)

**Modified (3):**
- `vigil-g2-plugin/src/__tests__/wav-encoder.test.ts` (+73 lines — 4 ASCII-marker assertions + 1 block-align assertion + trailing-space pin + `readAscii` helper)
- `vigil-core/src/__tests__/audio-log-redaction.test.ts` (+207 lines — Rail 4 helpers: `walkExtended` / `stripComments` / `scanForBannedSinkLines` / `buildD_D2SafeList` + 4 D-D2 tests in new describe block)
- `vigil-pwa/src/__tests__/denylist-parity.test.ts` (+171 lines — forked PWA scanner: `walkPwaSrc` / `stripPwaComments` / `scanPwaForBannedSinkLines` + 3 D-D2 tests in new describe block)

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `8ffaae7` | test(130-06) | Finalize D-D1 wav-encoder.test.ts with all 8 header positions pinned (8 → 13 tests; ASCII markers + block align + trailing-space invariant) |
| 2 | `5994afd` | test(130-06) | Extend D-D2 audio-log-redaction + denylist-parity to cover plugin source + voice-transcribe.ts (Rail 4 server + PWA mirror) |
| 3 | `f86a7d0` | test(130-06) | Author D-D3 audiocontrol-pairing source-grep parity test (4 tests; per-file offender reporting) |

## Next Plan

**Plan 07 — Hardware UAT (operator wallclock).** Per ROADMAP.md Wave 5:

- Production migration 0023 apply (Railway-side via `pnpm db:migrate` or operator-driven)
- G2 plugin pack + EHPK install via `evenhub` CLI + sideload
- Round-trip ≤ 8s acceptance test (DOUBLE_CLICK → "hello world" → PWA dashboard row visible)
- [NO MIC] surface test (revoke mic permission in Even Hub portal → STOP gesture must surface "enable mic in Hub")
- Airplane-mode queue drain (record N utterances offline → re-enable network → queue drains visibly)
- Portfolio screenshots (Loom waived per `[feedback_loom_waived_g2_not_screen_mirrorable]` memory)

VOICE-08 closes when Plan 07's hardware UAT passes — the operator's wallclock checkpoint is the last gate before Phase 130 ships.

## Self-Check: PASSED

Verified post-write:

```
[ -f vigil-g2-plugin/src/__tests__/audiocontrol-pairing.test.ts ]  → FOUND
[ -f vigil-g2-plugin/src/__tests__/wav-encoder.test.ts ]            → FOUND (extended)
[ -f vigil-core/src/__tests__/audio-log-redaction.test.ts ]         → FOUND (extended)
[ -f vigil-pwa/src/__tests__/denylist-parity.test.ts ]              → FOUND (extended)
git log | grep 8ffaae7  → FOUND
git log | grep 5994afd  → FOUND
git log | grep f86a7d0  → FOUND
```

All 17 Plan 06 new/extended tests GREEN against current Phase 130 production source. Full plugin suite 154/155 (1 pre-existing D-129 failure, NOT introduced by this plan). vigil-core + vigil-pwa typechecks clean.
