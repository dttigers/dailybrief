---
phase: 127
plan: 02
subsystem: vigil-pwa (analytics + lib/sentry-redact + browser Sentry init + cross-workspace parity)
tags: [GUARD-01, sentry-browser, posthog-pwa, audio-pcm, parity-drift-detector, cross-workspace, log-redaction, security]
requirements: [GUARD-01]
threat_refs: [T-127-01, T-127-01-C, T-127-01-D]
dependency_graph:
  requires:
    - "vigil-core/src/analytics/posthog.ts BLOCKED_PROPERTY_NAMES Set (Plan 127-01 — 14 keys)"
    - "vigil-pwa/src/main.tsx Sentry.init scaffold (Phase 126)"
    - "@sentry/react ^10.52.0 ErrorEvent + EventHint types (Phase 126)"
  provides:
    - "vigil-pwa BLOCKED_PROPERTY_NAMES Set — 14 keys identical to vigil-core, duplicated across workspace boundary by design"
    - "redactSentryEvent(event, _hint?) pure function for the Browser SDK — Pitfall-3 defensive shape (null-tolerant, try/catch returns original event reference)"
    - "vigil-pwa/src/main.tsx Sentry.init beforeSend hook (D-01.5)"
    - "denylist-parity.test.ts cross-workspace drift detector — HARD-FAILS on cross-workspace read failure (NO size-only fallback)"
    - "sentry-init.test.ts source-grep on main.tsx — symmetric to Plan 01 Rail 2 (T-127-01-D mitigation)"
    - "scripts/denylist-parity-ci.mjs sibling CI script — same diff, exit 1 on drift; defends against test-file deletion"
  affects:
    - "Phase 130 voice ingest (VOICE-02..08) — PWA may render voice clip metadata; Browser Sentry now scrubs PCM property names client-side before network"
    - "Future workspace boundary changes — both Vitest test AND CI script must be updated together if the relative path from vigil-pwa to vigil-core ever shifts"
tech_stack:
  added: []
  patterns:
    - "Duplicate-with-parity-drift-test for cross-workspace constants — chosen over cross-workspace TypeScript imports (which break Vite path resolution and workspace isolation)"
    - "Twin drift detectors: Vitest in-tree (CI default) + sibling ESM node script (CI defense-in-depth if Vitest test is deleted)"
    - "Anchored regex extraction (BLOCKED_PROPERTY_NAMES → new Set<string>([) to skip the SENSITIVE_ROUTES Set that appears higher in vigil-core/src/analytics/posthog.ts"
    - "Function-reference (NOT inline arrow) Sentry beforeSend registration — symmetric on Browser side; preserves the source-grep pattern Plan 01 Rail 2 locked"
    - "Hard-fail-on-cross-workspace-read-failure with named-error message that includes the sibling CI script path (T-127-01-C closure — NO degraded size-only fallback)"
key_files:
  created:
    - "vigil-pwa/src/lib/sentry-redact.ts"
    - "vigil-pwa/src/lib/sentry-redact.test.ts"
    - "vigil-pwa/src/__tests__/denylist-parity.test.ts"
    - "vigil-pwa/src/__tests__/sentry-init.test.ts"
    - "vigil-pwa/scripts/denylist-parity-ci.mjs"
  modified:
    - "vigil-pwa/src/analytics/posthog.ts"
    - "vigil-pwa/src/main.tsx"
    - "vigil-pwa/package.json"
decisions:
  - "Anchored extraction regex on the BLOCKED_PROPERTY_NAMES identifier first, then walked forward to `new Set<string>([` — caught during inverse-sanity prep when first parity-test run reported `pwaKeys` vs `coreKeys` diffing on SENSITIVE_ROUTES vs property names (root cause: vigil-core's posthog.ts has TWO `new Set<string>([` literals; a naive `indexOf` grabbed the FIRST which is SENSITIVE_ROUTES). Logged as Rule-1 inline fix below."
  - "Pnpm CLI unavailable on local dev machine — `npm run denylist-parity:ci` chained via the `test` script works identically across pnpm/npm/yarn (any package manager's `run` invokes node directly). No change to plan intent; the literal `pnpm denylist-parity:ci` command in error messages is preserved verbatim because that's the documented CI invocation."
metrics:
  duration: "4m"
  completed: "2026-05-12"
  tasks_completed: 2
  files_touched: 7
  commits: 4
---

# Phase 127 Plan 02: GUARD-01 vigil-pwa Summary

Symmetric browser-side closure of GUARD-01: vigil-pwa now mirrors the 14-key audio PCM denylist via a duplicated `BLOCKED_PROPERTY_NAMES` Set, registers `beforeSend: redactSentryEvent` in the PWA Sentry init (same Pitfall-3 defensive shape as the Node version), and ships a cross-workspace parity drift detector that HARD-FAILS on read failure (no size-only fallback) plus a sibling CI script that runs the same diff so a deleted Vitest file does not silently disable protection.

## What Was Built

End-to-end GUARD-01 coverage across both Sentry runtimes:

1. **Duplicated denylist Set** — `vigil-pwa/src/analytics/posthog.ts` now exports its own 14-key `BLOCKED_PROPERTY_NAMES` Set (8 LOCKED + 6 audio EXTENSION) verbatim from `vigil-core`. Cross-workspace TS imports were rejected during planning (RESEARCH Open Q3) because they break Vite path resolution and workspace isolation. The two Sets are kept in sync at CI time by twin drift detectors.

2. **Browser-side redactor** — `vigil-pwa/src/lib/sentry-redact.ts` exports `redactSentryEvent(event, _hint?)` — the structural twin of `vigil-core/src/lib/sentry.ts redactSentryEvent`. Same Pitfall-3 defensive shape: null-tolerant top return, outer `try { ... } catch { return event; }` (returns the ORIGINAL event reference on internal throw — never `undefined`, which would silently drop the event from Sentry), inner `stripFromBag` type-guarded against primitive contexts (`event.contexts.os = "darwin"`). Walks `event.extra` / `event.contexts.*` / `event.breadcrumbs[].data`.

3. **PWA Sentry init wired** — `vigil-pwa/src/main.tsx` now imports `redactSentryEvent` and registers it as `beforeSend: redactSentryEvent,` inside `Sentry.init({...})`. Function-reference form (NOT inline arrow) preserves the Rail-2 source-grep pattern Plan 01 locked on the Node side.

4. **Cross-workspace parity drift detector** (`vigil-pwa/src/__tests__/denylist-parity.test.ts`) — reads BOTH posthog.ts source files via `fs.readFileSync` at test time, extracts the Set entries via anchored regex (`BLOCKED_PROPERTY_NAMES` → `new Set<string>([`), asserts size + content equality. HARD-FAILS on cross-workspace read failure with a named-error message that literally includes `pnpm denylist-parity:ci`. NO size-only fallback. Two `it(...)` blocks: parity equality + anti-trivial-pass smoke (both source files must contain literal `"audioPcm"`).

5. **Sentry init drift detector** (`vigil-pwa/src/__tests__/sentry-init.test.ts`) — source-greps `vigil-pwa/src/main.tsx` for the literal `beforeSend: redactSentryEvent` AND `import { redactSentryEvent }`. Symmetric to vigil-core/src/__tests__/audio-log-redaction.test.ts Rail 2. **T-127-01-D upgraded from `accept` → `mitigate`** per plan threat register.

6. **Sibling CI script** (`vigil-pwa/scripts/denylist-parity-ci.mjs`) — pure ESM node script. Same paths, same regex extraction, same diff output as the Vitest test, same hard-fail semantics on cross-workspace read failure. Wired into `npm run denylist-parity:ci` (works under pnpm too); chained AHEAD of `vitest run` in the `test` script so the CI fails fast on drift even if a future commit deletes the Vitest test (T-127-01-C defense-in-depth — "deletion of one detector does not silently disable the rail").

## Files Touched

| File | Status | Purpose |
|------|--------|---------|
| `vigil-pwa/src/analytics/posthog.ts` | EDIT | Added 14-key `BLOCKED_PROPERTY_NAMES` Set with `// ── LOCKED as of Phase 103 D-04 ──` and `// ── Phase 127 GUARD-01 EXTENSION — audio PCM denylist (D-01.5) ──` comment-block split (verbatim mirror of vigil-core layout) |
| `vigil-pwa/src/lib/sentry-redact.ts` | NEW | `redactSentryEvent(event, _hint?)` exported pure function; imports `BLOCKED_PROPERTY_NAMES` from `../analytics/posthog`; imports `ErrorEvent` + `EventHint` from `@sentry/react` (NOT `@sentry/node`) |
| `vigil-pwa/src/lib/sentry-redact.test.ts` | NEW | 5 Vitest cases — extras strip / primitive-context no-throw / breadcrumb strip / null event / getter-throw defense (Pitfall-3) |
| `vigil-pwa/src/main.tsx` | EDIT | Added `import { redactSentryEvent } from './lib/sentry-redact'` and ONE new property line `beforeSend: redactSentryEvent,` inside `Sentry.init({...})`. dsn / environment / tracesSampleRate untouched |
| `vigil-pwa/src/__tests__/denylist-parity.test.ts` | NEW | 2 Vitest cases — sorted-array equality across workspaces + audio-PCM smoke; HARD-FAILS on cross-workspace read failure with named-error path to the sibling CI script |
| `vigil-pwa/src/__tests__/sentry-init.test.ts` | NEW | 1 Vitest case — main.tsx must contain both the import AND the registration; T-127-01-D mitigation |
| `vigil-pwa/scripts/denylist-parity-ci.mjs` | NEW | ESM node script; sibling of the Vitest test; same hard-fail semantics; exits 1 on drift; defense-in-depth against test-file deletion |
| `vigil-pwa/package.json` | EDIT | Added `denylist-parity:ci` script entry; modified `test` to `npm run denylist-parity:ci && vitest run` (parity check runs FIRST, fail-fast on drift) |

## Six Audio Keys Added (PWA Side, Verbatim from D-01.5)

```typescript
// ── Phase 127 GUARD-01 EXTENSION — audio PCM denylist (D-01.5) ──
'audioPcm',
'audio_pcm',
'pcm',
'audio',
'audioBuffer',
'audio_buffer',
```

All 8 Phase-103 LOCKED keys (`content`, `body`, `text`, `message`, `description`, `title`, `note`, `transcript`) preserved verbatim. PWA Set size is exactly 14 — verified by the parity test against vigil-core.

## Browser Sentry Hook Wiring

```typescript
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    beforeSend: redactSentryEvent,
  });
}
```

Exactly 1 occurrence of the literal `beforeSend: redactSentryEvent` in `vigil-pwa/src/main.tsx` (verified). Function-reference form preserves the Rail-2 grep convention from Plan 01.

## Parity Strategy Chosen

**Duplicate-with-drift-test** (RESEARCH Open Q3 recommended path) — NOT cross-workspace TS import.

Rationale:
- Cross-workspace imports (`import ... from "../../../vigil-core/src/analytics/posthog"`) break Vite path resolution and TypeScript module boundaries; the PWA build would need additional `paths` config and a runtime polyfill or relative-import workaround.
- Workspace isolation is a load-bearing invariant — `vigil-pwa` must build standalone for PWA dev/deploy without `vigil-core` present.
- The cost is two Sets in two files; the mitigation is CI-time drift detection.

**Hard-fail on cross-workspace read failure** (T-127-01-C closure — tightened from initial "size-only fallback" proposal):
- If `fs.readFileSync(corePath)` raises (renamed dir, monorepo layout changed, etc.), the test throws an error literally containing `"monorepo layout broke parity test — fix the relative path or ship a sibling CI script (pnpm denylist-parity:ci)"`. NO degraded check.
- Same semantics in the sibling CI script (`scripts/denylist-parity-ci.mjs`).
- Defense-in-depth: even if the Vitest test file is deleted in a future commit, the sibling CI script (wired into the `test` npm script) still trips on drift.

## Threat Register Closure

| Threat ID | Disposition | Mitigation Landed |
|-----------|-------------|-------------------|
| T-127-01 | mitigate | Browser Sentry + PostHog (via duplicated Set) scrub the same 14 keys as the Node side |
| T-127-01-C | mitigate | Twin drift detectors (Vitest + sibling node script); BOTH hard-fail on cross-workspace read failure with a named-error message; NO size-only fallback |
| T-127-01-D | mitigate (upgraded from `accept`) | `sentry-init.test.ts` source-grep on main.tsx fails CI if a future commit removes `beforeSend: redactSentryEvent` |

## TDD Gate Compliance

Plan 127-02 is `type=execute` plan-level, but both tasks have `tdd="true"`. RED/GREEN sequence per task:

| Task | RED commit | GREEN commit |
|------|-----------|--------------|
| 1 — PWA denylist + Browser redactor | `bcc858fd` test(127-02): add failing tests for PWA redactSentryEvent (RED) | `91fffe3f` feat(127-02): extend PWA BLOCKED_PROPERTY_NAMES + add Browser redactSentryEvent (GREEN) |
| 2 — beforeSend + parity + CI script | `ad51a451` test(127-02): add parity drift detector + main.tsx sentry-init pin (RED) | `74993eb9` feat(127-02): register beforeSend in PWA Sentry init + sibling CI parity script (GREEN) |

**Task 2 RED note (fail-fast rule):** `denylist-parity.test.ts` was passing the moment it was added because `vigil-pwa/src/analytics/posthog.ts` already had the 14-key Set landed by Task 1 (GREEN `91fffe3f`). The parity test is structurally a regression-pin like Plan 01's Rail 1 — it cannot meaningfully be RED before the Set extension lands. `sentry-init.test.ts` provided the actual RED signal for Task 2 (failed against main.tsx with no `beforeSend` registration), and turned GREEN once `74993eb9` landed. Investigated per fail-fast rule and confirmed this is expected for the regression-pin half of the test pair.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Anchored extractBlockedNames regex on `BLOCKED_PROPERTY_NAMES` identifier instead of bare `new Set<string>([`**

- **Found during:** Task 2 RED verification — first run of `denylist-parity.test.ts` reported `pwaKeys` containing the 14 audio/PCM keys vs `coreKeys` containing the 6 SENSITIVE_ROUTES (`/v1/chat`, `/v1/process-audio`, etc.). The Sets-are-equal assertion failed catastrophically.
- **Issue:** vigil-core/src/analytics/posthog.ts has TWO `new Set<string>([` literals — `SENSITIVE_ROUTES` at line 14 (route allowlist for request_body redaction) AND `BLOCKED_PROPERTY_NAMES` at line 32 (property-name denylist). A naive `src.indexOf('new Set<string>([')` grabbed the FIRST (SENSITIVE_ROUTES) and extracted route paths instead of audio property names. The PWA file only has ONE Set so PWA extraction was correct; the asymmetric extraction made the diff catastrophic.
- **Fix:** Anchored extraction on the `BLOCKED_PROPERTY_NAMES` identifier first (`src.indexOf('BLOCKED_PROPERTY_NAMES')`), then walked forward to `new Set<string>([` from that anchor. Applied the same fix to the sibling CI script. Inline comment in both files documents the SENSITIVE_ROUTES collision risk.
- **Files modified:** `vigil-pwa/src/__tests__/denylist-parity.test.ts` (extraction function), `vigil-pwa/scripts/denylist-parity-ci.mjs` (extraction function)
- **Commit:** Both files first landed in their final corrected form — the RED commit `ad51a451` already contained the anchored extraction (the bug was caught during prep, BEFORE committing the RED state). No separate fix commit needed.

**2. [Rule 3 — Blocking issue] Reduced `beforeSend: redactSentryEvent` doc-comment occurrence in main.tsx so the grep AC returns exactly 1**

- **Found during:** Final AC verification — `grep -c 'beforeSend: redactSentryEvent' vigil-pwa/src/main.tsx` initially returned 2 because I had documented the registration token by name in a self-referential comment ("`src/__tests__/sentry-init.test.ts` greps for the literal `beforeSend: redactSentryEvent` token").
- **Issue:** Plan AC literally says `=== 1` (function reference, NOT arrow). While 2 occurrences wouldn't break anything (the actual code is the one the SDK consumes), it would create a false-positive risk if a future developer believes the comment-token alone satisfies the test — the test source-greps for the literal regardless of comment context.
- **Fix:** Reworded the comment to say "the registered hook below scrubs..." and removed the embedded literal `beforeSend: redactSentryEvent` from the comment text. Grep now returns 1 — the actual code line — matching the AC verbatim. Inverse check (delete the code line) still trips the test correctly.
- **Files modified:** `vigil-pwa/src/main.tsx` (comment text only)
- **Commit:** Folded into GREEN commit `74993eb9` (the same commit that adds the registration).

### Out-of-Scope Discoveries

None — Plan 127-02 stayed within scope. Pre-existing dirty `.planning/research/*.md` files (ARCHITECTURE, FEATURES, PITFALLS, STACK) were left untouched per the executor prompt.

## Acceptance Criteria — All Met

- ✅ `"audioPcm"` and `"audio_buffer"` (single-quoted per PWA convention) appear inside `vigil-pwa/src/analytics/posthog.ts` `new Set<string>([...])` block.
- ✅ `vigil-pwa/src/lib/sentry-redact.ts` exists and exports `redactSentryEvent`.
- ✅ `grep -c 'export function redactSentryEvent' vigil-pwa/src/lib/sentry-redact.ts` = 1.
- ✅ `grep -cE 'import.*BLOCKED_PROPERTY_NAMES.*from.*analytics/posthog' vigil-pwa/src/lib/sentry-redact.ts` = 1.
- ✅ Browser SDK types used: imports from `@sentry/react`, NOT `@sentry/node` (verified by grep).
- ✅ Five `sentry-redact.test.ts` cases green: extras strip / primitive-context no-throw / breadcrumb strip / null event / getter-throw defense.
- ✅ `grep -c 'beforeSend: redactSentryEvent' vigil-pwa/src/main.tsx` = 1 (function reference, NOT arrow).
- ✅ `grep -cE "from ['\"]\\./lib/sentry-redact" vigil-pwa/src/main.tsx` = 1 (import landed).
- ✅ `vigil-pwa/src/__tests__/denylist-parity.test.ts` exists with 2 `it(...)` blocks.
- ✅ `vigil-pwa/src/__tests__/sentry-init.test.ts` exists with source-grep assertion against main.tsx.
- ✅ `vigil-pwa/scripts/denylist-parity-ci.mjs` exists.
- ✅ `vigil-pwa/package.json` contains `"denylist-parity:ci"` script entry AND wires it into the `test` script before vitest run.
- ✅ All 8 Vitest tests green: 5 (sentry-redact) + 2 (denylist-parity) + 1 (sentry-init).
- ✅ `npm run denylist-parity:ci` exits 0 against current HEAD.
- ✅ **Inverse manual check 1:** removing `audioPcm` from PWA Set → CI script reports `FAIL: ... -core-only: audioPcm` and exits 1; chained `test` script also trips (verified manually before commit).
- ✅ **Inverse manual check 2:** removing `beforeSend: redactSentryEvent,` from main.tsx → `sentry-init.test.ts` FAILS with the GUARD-01.5 / T-127-01-D message (verified manually).
- ✅ **Inverse manual check 3:** renaming `vigil-core` directory → BOTH the Vitest parity test AND `npm run denylist-parity:ci` HARD-FAIL with the named-error message literally containing `pnpm denylist-parity:ci`. T-127-01-C closure confirmed — NO size-only fallback path was triggered (verified manually).

## Authentication Gates

None — this plan ships pure code/test additions to the PWA workspace; no Sentry/PostHog credentials needed at execution time. The Browser SDK is exercised in jsdom + `as unknown as` casts in unit tests (existing `api-error-codes.test.ts` precedent).

## Manual Smoke (Browser-Side Sentry Trigger)

Deferred to post-deploy per 127-VALIDATION.md row 1. Operator verification path:

1. `cd vigil-pwa && npm run dev`.
2. Open browser console at the dev URL.
3. `Sentry.captureException(new Error("audio-pcm-leak-smoke"), { extra: { audioPcm: "secret-bytes", ok: 1 } })`.
4. Sentry dashboard: event arrives; `extras.ok === 1`; `extras.audioPcm` MUST be absent.

The smoke is a release-time check, not a code-correctness check — the Vitest tests already prove the function behavior; the smoke verifies the SDK actually invokes `beforeSend` (which is a Sentry runtime contract, not a Vigil contract).

## Self-Check: PASSED

**Created files exist:**
- FOUND: `vigil-pwa/src/lib/sentry-redact.ts`
- FOUND: `vigil-pwa/src/lib/sentry-redact.test.ts`
- FOUND: `vigil-pwa/src/__tests__/denylist-parity.test.ts`
- FOUND: `vigil-pwa/src/__tests__/sentry-init.test.ts`
- FOUND: `vigil-pwa/scripts/denylist-parity-ci.mjs`

**Modified files contain required changes:**
- FOUND: `vigil-pwa/src/analytics/posthog.ts` — 14-key BLOCKED_PROPERTY_NAMES Set
- FOUND: `vigil-pwa/src/main.tsx` — `beforeSend: redactSentryEvent,` registration
- FOUND: `vigil-pwa/package.json` — `denylist-parity:ci` script + `test` chain

**Commits exist (verified with `git log --oneline`):**
- FOUND: `bcc858fd` test(127-02): add failing tests for PWA redactSentryEvent (RED)
- FOUND: `91fffe3f` feat(127-02): extend PWA BLOCKED_PROPERTY_NAMES + add Browser redactSentryEvent (GREEN)
- FOUND: `ad51a451` test(127-02): add parity drift detector + main.tsx sentry-init pin (RED)
- FOUND: `74993eb9` feat(127-02): register beforeSend in PWA Sentry init + sibling CI parity script (GREEN)
