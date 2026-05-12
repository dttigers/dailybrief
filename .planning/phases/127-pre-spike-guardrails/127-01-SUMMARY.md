---
phase: 127
plan: 01
subsystem: vigil-core (analytics + lib/sentry + drift detector)
tags: [GUARD-01, sentry, posthog, audio-pcm, drift-detector, log-redaction, security]
requirements: [GUARD-01]
threat_refs: [T-127-01, T-127-01-A, T-127-01-B]
dependency_graph:
  requires:
    - "vigil-core/src/analytics/posthog.ts BLOCKED_PROPERTY_NAMES export (Phase 103)"
    - "vigil-core/src/lib/sentry.ts initSentry + Sentry.init scaffold (Phase 126)"
    - "@sentry/node ^10.52.0 ErrorEvent + EventHint types (Phase 126)"
  provides:
    - "14-key BLOCKED_PROPERTY_NAMES Set (8 LOCKED + 6 audio EXTENSION) shared across PostHog and Sentry"
    - "redactSentryEvent(event, _hint?) pure function — Sentry beforeSend redactor with Pitfall-3 defensive shape"
    - "audio-log-redaction.test.ts three-rail CI drift detector (BLOCKED_PROPERTY_NAMES membership / Sentry.init beforeSend grep / console.* source scan)"
  affects:
    - "vigil-pwa GUARD-01 parity (Plan 02) — must land symmetric beforeSend + parity test"
    - "Phase 130 voice ingest (VOICE-02..08) — relies on Rail 3 to catch stray console.log(audioPcm) at PR review time"
tech_stack:
  added: []
  patterns:
    - "Single source of truth for log-sink denylists — Sentry imports BLOCKED_PROPERTY_NAMES from analytics/posthog (no fork)"
    - "Pure-function + pre-network hook — same shape as posthog.ts redactEvent → Sentry redactSentryEvent"
    - "Multi-line anchor for source-grep drift detector — `Sentry.init({\\n` anchors past JSDoc comment false-positives"
    - "Pitfall-3 defensive shape — try/catch returns original event reference on internal throw (never undefined)"
key_files:
  created:
    - "vigil-core/src/__tests__/audio-log-redaction.test.ts"
  modified:
    - "vigil-core/src/analytics/posthog.ts"
    - "vigil-core/src/analytics/posthog.test.ts"
    - "vigil-core/src/lib/sentry.ts"
    - "vigil-core/src/lib/sentry.test.ts"
decisions:
  - "Rail 2 anchor strengthened from `Sentry.init({` to `Sentry.init({\\n` to bypass the single-line JSDoc comment occurrence (inverse-sanity-tested: deleting the real beforeSend line now correctly fails Rail 2)"
  - "routes/process-audio.ts added to Rail 3 safe-list (Rule 3 — its console.error messages reference the literal route PATH `/process-audio` not audio DATA; plan did not anticipate this)"
metrics:
  duration: "6m"
  completed: "2026-05-12"
  tasks_completed: 3
  files_touched: 5
  commits: 5
---

# Phase 127 Plan 01: GUARD-01 vigil-core Summary

JWT/Sentry/PostHog audio-PCM log-leak prevention — six audio property names added to the single source-of-truth `BLOCKED_PROPERTY_NAMES` Set; Sentry now scrubs the same keys via a `beforeSend: redactSentryEvent` hook with Pitfall-3 defensive shape; a three-rail CI drift detector fails any future commit that removes the keys, drops the Sentry hook, or sneaks a `console.log(audioPcm)` into protected directories.

## What Was Built

Three structural rails locking biometric audio PCM payload (16 kHz × 16-bit LE × mono per Even SDK canonical format) out of every production log sink BEFORE Phase 130 voice ingest lands:

1. **PostHog rail** — extended the existing `BLOCKED_PROPERTY_NAMES` Set in `vigil-core/src/analytics/posthog.ts` with six audio keys (`audioPcm`, `audio_pcm`, `pcm`, `audio`, `audioBuffer`, `audio_buffer`). The existing `redactEvent` walker (lines 54-64) consumes the same Set, so PostHog's `before_send` hook (line 77) now strips audio keys automatically. Test size-lock at posthog.test.ts:91-117 widened to 14 entries.

2. **Sentry rail** — added `redactSentryEvent(event, _hint?)` pure function in `vigil-core/src/lib/sentry.ts`, imported `BLOCKED_PROPERTY_NAMES` from the PostHog module (no fork), and registered the hook in `Sentry.init({...})` as `beforeSend: redactSentryEvent` (function-reference form, NOT inline arrow — required by Rail 2 of the drift detector). The redactor walks `event.extra`, every named bag in `event.contexts`, and `breadcrumbs[].data`; deletes any key in the 14-key Set. Defensive shape per Pitfall 3: null-tolerant; try/catch returns the ORIGINAL event reference on internal throw (never `undefined`); inner `stripFromBag` early-returns when given a primitive (handles `event.contexts.os = "darwin"`).

3. **console.* rail** — new test file `vigil-core/src/__tests__/audio-log-redaction.test.ts` walks `src/{routes,lib,ai,middleware}` recursively and greps each non-test `.ts` file for `/console\.(log|info|warn|error|debug)[^)\n]*(audio|pcm)/i`. Safe-list excludes the source-of-truth file plus three modules where audio/pcm appears legitimately (see Deviations below). All three rails of the test pass; inverse-sanity-test verified that removing the real `beforeSend: redactSentryEvent,` line correctly fails Rail 2.

## Files Touched

| File | Status | Purpose |
|------|--------|---------|
| `vigil-core/src/analytics/posthog.ts` | EDIT | Extended `BLOCKED_PROPERTY_NAMES` from 8 → 14 keys with `// ── LOCKED as of Phase 103 D-04 ──` and `// ── Phase 127 GUARD-01 EXTENSION — audio PCM denylist (D-01.1) ──` comment-block split |
| `vigil-core/src/analytics/posthog.test.ts` | EDIT | Scaled `expected` Set in size-lock test from 8 → 14 entries (per-key `assert.ok(has(name))` loop iterates `expected`, so coverage is automatic) |
| `vigil-core/src/lib/sentry.ts` | EDIT | Added `redactSentryEvent` export + `import { BLOCKED_PROPERTY_NAMES } from "../analytics/posthog.js"` + `import type { ErrorEvent, EventHint } from "@sentry/node"` + `beforeSend: redactSentryEvent,` line inside Sentry.init body |
| `vigil-core/src/lib/sentry.test.ts` | EDIT | Added 6 new test cases under `GUARD-127-SENTRY-BEFORE-SEND` describe: extras strip / breadcrumbs+contexts strip / primitive-context no-throw / null event passthrough / internal-throw returns original event reference / source-grep `beforeSend: redactSentryEvent` pin |
| `vigil-core/src/__tests__/audio-log-redaction.test.ts` | NEW | Three-rail drift detector (164 lines) — describe block `GUARD-01 audio log redaction — three rails pinned` with one `it(` per rail |

## Six Audio Keys Added (Verbatim from D-01.1)

```typescript
// ── Phase 127 GUARD-01 EXTENSION — audio PCM denylist (D-01.1) ──
"audioPcm",
"audio_pcm",
"pcm",
"audio",
"audioBuffer",
"audio_buffer",
```

All 8 Phase-103 LOCKED keys (`content`, `body`, `text`, `message`, `description`, `title`, `note`, `transcript`) preserved unchanged — verified by per-key `grep -q` after the edit.

## Sentry Hook Wiring

```typescript
Sentry.init({
  dsn,
  environment: process.env["NODE_ENV"] ?? "development",
  tracesSampleRate: 0,
  // sendDefaultPii defaults to false in v10 — DO NOT override to true
  // (T-126-03-01 Bearer-leak mitigation).
  // Phase 127 GUARD-01.2 — last-in-process scrub before network I/O.
  // Function reference (NOT inline arrow) — drift detector pins this form.
  beforeSend: redactSentryEvent,
});
```

Exactly 1 occurrence of the literal `beforeSend: redactSentryEvent` in `vigil-core/src/lib/sentry.ts` (verified).

## Three Rails of audio-log-redaction.test.ts

1. **Rail 1 — Set membership.** Dynamic-imports `../analytics/posthog.js` and asserts each of `[audioPcm, audio_pcm, pcm, audio, audioBuffer, audio_buffer]` is in `BLOCKED_PROPERTY_NAMES`. Catches any future commit that removes an audio key from the Set.

2. **Rail 2 — Sentry.init body greps `beforeSend`.** Reads `vigil-core/src/lib/sentry.ts`, finds the multi-line `Sentry.init({\n` anchor (deliberately bypassing the single-line `Sentry.init({dsn, environment, tracesSampleRate: 0})` literal that appears in the JSDoc header — comment-prose false-positive defense), slices to the matching `});`, and `assert.match(slice, /\bbeforeSend\b/)`. Catches any future commit that drops the hook from Sentry.init.

3. **Rail 3 — console.* source scan.** Walks `src/{routes,lib,ai,middleware}` recursively, collects `.ts` (non-`.test.ts`) files, greps each for `/console\.(log|info|warn|error|debug)[^)\n]*(audio|pcm)/i`. Safe-list: `analytics/posthog.ts` (source-of-truth Set), `lib/audio-cap.ts` + `lib/ai-budget.ts` (Plan 03/05 modules — pre-emptively safe-listed), `routes/process-audio.ts` (Rule-3 deviation — see below). Catches any future stray `console.log("audio:", audioPcm)` pattern in protected directories.

## TDD Gate Compliance

Plan 127-01 is `type=execute` (not `type=tdd` plan-level), but every task has `tdd="true"`. RED/GREEN sequence per task:

| Task | RED commit | GREEN commit |
|------|-----------|--------------|
| 1 — extend denylist | `aa0d8b1f` test(127-01): widen BLOCKED_PROPERTY_NAMES expected Set to 14 keys (RED) | `02a1c7cc` feat(127-01): extend BLOCKED_PROPERTY_NAMES with 6 audio PCM keys (GREEN) |
| 2 — Sentry beforeSend | `bc15a0e0` test(127-01): add failing tests for redactSentryEvent + beforeSend (RED) | `e9990631` feat(127-01): add redactSentryEvent + register beforeSend in Sentry.init (GREEN) |
| 3 — drift detector | (regression-lock; no separate RED) | `4a28e2d7` test(127-01): add three-rail audio-log-redaction drift detector |

Task 3 is a regression-lock test that pins the work landed by Tasks 1 and 2 — it cannot meaningfully be RED before Tasks 1 and 2 land, because its rails verify the artifacts those tasks produced. Per the TDD gate's "fail-fast rule," I investigated whether the test passing immediately meant the feature already existed — it does, BECAUSE Tasks 1 and 2 just landed it. Documented here for traceability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Added `routes/process-audio.ts` to Rail 3 safe-list**

- **Found during:** Task 3 verification — Rail 3 would have failed immediately on first run because `vigil-core/src/routes/process-audio.ts` has three `console.error("[vigil-core] /process-audio …", …)` calls (lines 127, 149, 173). The Rail 3 regex `/console\.(log|info|warn|error|debug)[^)\n]*(audio|pcm)/i` matches the route-path substring `/process-audio` even though no audio DATA is logged — only telemetry strings describing which route failed.
- **Issue:** The plan's Rail 3 safe-list (`analytics/posthog.ts`, `lib/audio-cap.ts`, `lib/ai-budget.ts`) did not include `routes/process-audio.ts`. With the literal regex from the plan, the test fails on the unmodified source.
- **Fix:** Added `path.join(ROOT, "routes", "process-audio.ts")` to `denylistSources` with an inline comment explaining the route-path substring false-positive. The route's existing size-guard (`process-audio.ts:58-62`, `MAX_AUDIO_B64_CHARS`) caps the upload, and the audio bytes themselves are never passed to `console.*` — only the route's name. Manual cross-check of the file confirmed no actual PCM data flows into any logger call.
- **Files modified:** `vigil-core/src/__tests__/audio-log-redaction.test.ts` (denylist entry + explanatory comment)
- **Commit:** `4a28e2d7`

**2. [Rule 1 — Test strictness bug] Tightened Rail 2 anchor from `Sentry.init({` to `Sentry.init({\n`**

- **Found during:** Task 3 inverse-sanity-test — temporarily removing the real `beforeSend: redactSentryEvent,` line from `sentry.ts` and re-running Rail 2 found the test still passed, because the original `src.indexOf("Sentry.init({")` matched the single-line literal `Sentry.init({dsn, environment, tracesSampleRate: 0})` inside a JSDoc comment at sentry.ts:21, and the slice extending to the next `});` happened to span past several other comment lines mentioning the word `beforeSend`. False-negative defeats the entire rail.
- **Issue:** The plan's anchor `Sentry.init({` is ambiguous because the documentation header in `sentry.ts` contains the same string inline as comment prose. The drift detector would silently pass even after the production hook is removed.
- **Fix:** Anchor on `Sentry.init({\n` (with trailing newline) — only the REAL multi-line call has `{` immediately followed by a newline; the JSDoc literal has `{dsn,` on the same line. Inverse-sanity-test re-verified: deleting the real `beforeSend: redactSentryEvent,` line now correctly fails Rail 2 with `/\bbeforeSend\b/` not matching the slice. Inline comment in the test explains the anchor choice.
- **Files modified:** `vigil-core/src/__tests__/audio-log-redaction.test.ts` (Rail 2 anchor + explanatory comment)
- **Commit:** `4a28e2d7`

No architectural changes (Rule 4) were needed.

## Authentication Gates

None — this plan ships pure code/test additions to vigil-core; no Anthropic/Resend/Sentry credentials required at execution time. Sentry SDK v10 init paths are exercised against fake DSNs in unit tests (existing `AUTH-126-SENTRY-WITH-DSN-INIT` precedent).

## Acceptance Criteria — All Met

- ✅ `vigil-core/src/analytics/posthog.ts` contains `"audioPcm"` and `"audio_buffer"` inside the `new Set<string>([...])` block.
- ✅ `grep -c 'BLOCKED_PROPERTY_NAMES' vigil-core/src/analytics/posthog.ts` = 3 (≥ 1, export still present).
- ✅ `BLOCKED_PROPERTY_NAMES.size === 14` (8 LOCKED + 6 EXTENSION) — confirmed by `posthog.test.ts` `assert.equal(BLOCKED_PROPERTY_NAMES.size, expected.size)` passing.
- ✅ All 8 LOCKED keys preserved (verified by per-key grep after edit).
- ✅ `grep -c 'export function redactSentryEvent' vigil-core/src/lib/sentry.ts` = 1.
- ✅ `grep -c 'beforeSend: redactSentryEvent' vigil-core/src/lib/sentry.ts` = 1 (function-reference form, NOT inline arrow).
- ✅ `grep -cE 'import.*BLOCKED_PROPERTY_NAMES.*from.*"\.\./analytics/posthog' vigil-core/src/lib/sentry.ts` = 1.
- ✅ All three `cd vigil-core && npx tsx --test {posthog|sentry|audio-log-redaction}.test.ts` exit 0 — 33 tests / 8 suites / 0 failures.
- ✅ File `vigil-core/src/__tests__/audio-log-redaction.test.ts` exists with three `it(` blocks (1 per rail).
- ✅ Inverse-sanity-test verified Rail 2 fails when `beforeSend: redactSentryEvent,` is removed.
- ✅ No new top-level export besides `redactSentryEvent` (existing `initSentry`, `captureToSentry` preserved).

## Out-of-Scope Discoveries (Logged, Not Acted)

None — this plan stayed within scope. The `routes/process-audio.ts` console-message pattern is a deliberate Rule-3 fix (the safe-list entry), not an unrelated find.

## Next Plan

Plan 02 (vigil-pwa GUARD-01) must land:
- A symmetric `beforeSend` redactor in `vigil-pwa/src/main.tsx` Sentry init (browser SDK uses the same hook name).
- A `vigil-pwa/src/lib/sentry-redact.ts` pure function (browser-side; Vitest unit-tested) mirroring `redactSentryEvent` shape.
- A PWA-side parity test asserting the audio keys are blocked at the PWA Sentry boundary too.

This closes end-to-end GUARD-01 coverage across both runtimes.

## Self-Check: PASSED

**Created files exist:**
- FOUND: `vigil-core/src/__tests__/audio-log-redaction.test.ts`

**Commits exist (verified with `git log --oneline`):**
- FOUND: `aa0d8b1f` test(127-01): widen BLOCKED_PROPERTY_NAMES expected Set to 14 keys (RED)
- FOUND: `02a1c7cc` feat(127-01): extend BLOCKED_PROPERTY_NAMES with 6 audio PCM keys (GREEN)
- FOUND: `bc15a0e0` test(127-01): add failing tests for redactSentryEvent + beforeSend (RED)
- FOUND: `e9990631` feat(127-01): add redactSentryEvent + register beforeSend in Sentry.init (GREEN)
- FOUND: `4a28e2d7` test(127-01): add three-rail audio-log-redaction drift detector
