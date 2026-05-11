---
phase: 126
plan: 03
subsystem: vigil-core
tags: [auth, sentry, error-tracking, wave-1, observability, AUTH-126-04]
requires:
  - phase-126/plan-01 (Wave 0 RED scaffold — vigil-core/src/lib/sentry.test.ts)
  - phase-103/posthog-wrapper (analytics/posthog.ts sibling pattern — key-absence gate + captureException signature)
provides:
  - vigil-core/src/lib/sentry.ts — initSentry() + captureToSentry() server-side wrapper
  - @sentry/node@^10.52.0 dependency entry in vigil-core/package.json
  - executable acceptance contract for AUTH-126-04 Wave 0 RED → GREEN flip
affects:
  - vigil-core/package.json (+1 dep entry)
  - vigil-core/package-lock.json (+54 packages)
tech-stack:
  added:
    - "@sentry/node@10.52.0 (production dep)"
  patterns:
    - "Key-absence gate mirrors PostHog null-singleton (analytics/posthog.ts:69-80) — SENTRY_DSN unset → init no-ops silently → captureToSentry no-ops"
    - "Sentry v10 functional API (Sentry.withScope) — zero references to deprecated pre-v8 Hub/configureScope surface (R9)"
    - "JSDoc-documented property-name denylist awareness (R12 / Phase 103 carryforward) — comments document the rule via wording-not-token to satisfy anchored object-literal-key drift detector"
    - "sendDefaultPii kept at v10 default (false) — T-126-03-01 Bearer-leak mitigation"
key-files:
  created:
    - vigil-core/src/lib/sentry.ts
    - .planning/phases/126-wide-release-auth-hardening-rate-limit-auth-register-5-hr-ip/126-03-SUMMARY.md
  modified:
    - vigil-core/package.json
    - vigil-core/package-lock.json
decisions:
  - "@sentry/node installed at exact resolved version 10.52.0 (semver caret ^10.52.0 in package.json) — matches RESEARCH §Library Decisions §2 verified 2026-05-11"
  - "Deprecated-API references rewritten in JSDoc to use wording-not-token (e.g. \"pre-v8 hub/scope surface\") so plan-level grep contract `grep -cE 'Sentry\\.(Hub|configureScope)' = 0` passes — Rule 3 (Blocking) fix; mirrors Phase 126 Plan 01 deviation pattern for comment-vs-grep reconciliation"
  - "Module-scope `let initialized = false` (mutable boolean) chosen over null-singleton because Sentry.init has side effects that survive module reload — boolean lets captureToSentry no-op idempotently even if init was never called; T-126-03-05 (Tampering of initialized flag) disposition = accept per plan threat model"
  - "tracesSampleRate: 0 — errors-only, no performance tracing, keeps us under 5k events/mo Developer-tier free quota per CONTEXT.md additional_context"
metrics:
  duration: "2m 21s"
  completed: 2026-05-11
  tasks_completed: 2
  files_modified: 3
  files_created: 1
  commits: 2
---

# Phase 126 Plan 03: Sentry Server-Side Wrapper Summary

Sibling of `vigil-core/src/analytics/posthog.ts` — `initSentry()` + `captureToSentry()` exported from `vigil-core/src/lib/sentry.ts` with v10 functional API. `@sentry/node@10.52.0` lands as a production dependency. Wave 0 RED scaffold transitions to GREEN (5/5 tests pass). Plan 06 will wire `initSentry()` BEFORE `new Hono()` in `index.ts`.

## What Shipped

### Task 1 — @sentry/node@^10.52.0 production dep (commit 33b14d4)

Installed `@sentry/node@^10.52.0` via `npm install --save`. Resolved version landed at **10.52.0** matching RESEARCH §Library Decisions §2 (verified 2026-05-11). Lock file gained 54 packages (Sentry v10 SDK + OpenTelemetry transitive deps). 7 moderate audit warnings in transitive deps tolerated per Plan acceptance ("warnings tolerated, no peer-dep ERRORs").

| File | Δ |
|------|---|
| `vigil-core/package.json` | `+"@sentry/node": "^10.52.0"` under `dependencies` (line 30) |
| `vigil-core/package-lock.json` | +804 lines / -11 lines (Sentry v10 + OTel deps) |

**Verified:**
- `grep -E '"@sentry/node":\s*"\^?10\.' package.json | wc -l == 1` ✓
- `node_modules/@sentry/node/package.json` reports `"version": "10.52.0"` ✓
- Lives in `dependencies`, NOT `devDependencies` ✓
- No `@sentry/vite-plugin` / `@sentry/tracing` installed (source-map upload deferred per RESEARCH §2 last paragraph) ✓

### Task 2 — sentry.ts wrapper (commit 41c0708)

New file `vigil-core/src/lib/sentry.ts` (119 LOC). Module structure:

```typescript
import * as Sentry from "@sentry/node";
let initialized = false;

export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;                          // ← key-absence gate (mirrors posthog.ts:69-80)
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0,                     // ← errors-only, 5k/mo quota guard
  });
  initialized = true;
}

export function captureToSentry(
  userId: number | string | null,
  err: unknown,
  context: Record<string, string | number | boolean | undefined> = {},
): void {
  if (!initialized) return;                   // ← no-op when init never ran
  const error = err instanceof Error ? err : new Error(String(err));
  Sentry.withScope((scope) => {               // ← v10 functional API (NOT pre-v8 hub/scope)
    if (userId !== null) scope.setUser({ id: String(userId) });
    scope.setContext("request", context);
    Sentry.captureException(error);
  });
}
```

**Verified (full `<verification>` block from PLAN.md):**

| Gate | Expected | Actual |
|------|----------|--------|
| `npx tsx --test src/lib/sentry.test.ts` | 5/5 GREEN | ✓ pass 5 / fail 0 / duration 1.2s |
| `grep -c "@sentry/node" vigil-core/package.json` | ≥ 1 | ✓ 1 |
| `grep -c "Sentry.withScope" src/lib/sentry.ts` | ≥ 1 | ✓ 3 (1 call + 2 JSDoc refs) |
| `grep -cE "Sentry\\.(Hub\|configureScope)" src/lib/sentry.ts` | 0 | ✓ 0 (deprecated names purged from comments via wording-not-token) |
| Anchored denylist: `^\s*(content\|body\|text\|message\|description\|title\|note\|transcript)\s*:` | 0 matches | ✓ clean |
| `npx tsc --noEmit` errors attributable to sentry.ts | 0 | ✓ none |

### Wave 0 sentry.test.ts: RED → GREEN

Plan 126-01 landed `src/lib/sentry.test.ts` as a RED-by-construction scaffold (import failure on `./sentry.js` was the RED signal). After this plan:

| Test ID | Status |
|---------|--------|
| `AUTH-126-SENTRY-NO-DSN-NOOP` | ✓ PASS — `initSentry()` no-ops when SENTRY_DSN unset |
| `AUTH-126-SENTRY-NO-DSN-CAPTURE-NOOP` | ✓ PASS — `captureToSentry` no-ops after no-DSN init |
| `AUTH-126-SENTRY-WITH-DSN-INIT` | ✓ PASS — `initSentry()` with fake DSN initializes |
| `AUTH-126-SENTRY-CAPTURE-SHAPE` | ✓ PASS — Error + non-Error + null userId + missing ctx all tolerated |
| `AUTH-126-SENTRY-PROPNAMES` | ✓ PASS — `route` OR `method` mentioned in JSDoc (Phase 103 denylist awareness) |

**5/5 GREEN.** AUTH-126-04 server-side wrapper now has an executable acceptance contract for Plan 06 (mount-order wire-up).

## Wire-Up Anchor for Plan 06

Plan 06 wires `initSentry()` BEFORE `new Hono()` in `index.ts`. The mount-order drift detector at `vigil-core/src/__tests__/mount-order.test.ts` (Plan 01) already locks the position via `source.indexOf("initSentry()") < source.indexOf("new Hono()")` — currently failing because Plan 06 has not landed; Plan 06's GREEN flip is the next gate.

Additionally, Plan 06's `app.onError` handler at `vigil-core/src/index.ts:252-260` will call BOTH `captureToSentry(userId, err, {route, method})` AND the existing PostHog `captureException(...)` — both wrappers accept identical argument shapes by design (see RESEARCH §AUTH-126-04 Implementation Map). PostHog stays — Sentry is ADDITIVE, not a replacement, per memory `project_secret_drift` and CONTEXT D-04 (PostHog already running with key-absence gate at `analytics/posthog.ts:69-80`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded JSDoc to drop literal `Sentry.Hub` / `Sentry.configureScope` tokens**

- **Found during:** Task 2 verification
- **Issue:** Plan-level `<verification>` line 198 reads `grep -cE "Sentry\.(Hub|configureScope)" vigil-core/src/lib/sentry.ts → 0`. My initial JSDoc explicitly named the deprecated tokens to warn future planners ("Sentry v8+ removed Sentry.Hub and deprecated Sentry.configureScope ... DO NOT reintroduce Sentry.Hub or Sentry.configureScope in this file."). The grep matched the documentation, blocking the verify gate.
- **Fix:** Rewrote the comment using wording-not-token while preserving intent and the RESEARCH §R9 cross-reference. The new wording: `"removed the legacy Hub API and deprecated the pre-v8 per-call scope-configuration helper. ... DO NOT reintroduce the deprecated pre-v8 surface (see RESEARCH §R9)."` Plan acceptance grep now returns 0 matches; semantic warning preserved for future readers.
- **Files modified:** `vigil-core/src/lib/sentry.ts` (one comment block, lines 25-28)
- **Commit:** 41c0708 (folded into Task 2; fix landed before staging)
- **Pattern precedent:** Identical to Phase 126 Plan 01 deviations 1 and 2 (comment-vs-grep reconciliation). Zero architectural change, zero scope creep.

### Other Adjustments

None — Tasks 1 and 2 landed first-try on the production-code side. The Task 2 fix above was a documentation rewording caught at the verify gate, fixed before commit.

## Authentication Gates

None — Sentry wrapper boots cleanly with `SENTRY_DSN` unset (local dev / test path). No auth needed for `npm install` or `npx tsx --test`. Production Railway env will set `SENTRY_DSN` per CONTEXT.md additional_context (operator action, NOT a code task in this plan).

## Known Stubs

None. The wrapper is fully functional — DSN unset = no-op (intentional and tested), DSN set = real Sentry SDK active. No placeholder data flows to any UI.

## Threat Surface Coverage

All five threats in PLAN.md `<threat_model>` already had `mitigate` or `accept` dispositions in the plan; implementation lands those mitigations verbatim:

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-126-03-01 Bearer leak via Sentry breadcrumbs | mitigate | `Sentry.init({...})` does NOT enable HTTP integration with header capture; `sendDefaultPii` left at v10 default `false`. JSDoc documents the constraint at the top of the file. |
| T-126-03-02 Sentry capturing passwords / tokens / message bodies | mitigate | JSDoc documents Phase 103 BLOCKED_PROPERTY_NAMES denylist; anchored object-literal-key regex (`^\s*key:`) verifies denylisted names never appear AS object-literal keys (JSDoc mentions tolerated via wording-not-token). Existing PostHog call site at `index.ts:255-258` already uses safe `{route, method}` shape — Plan 06 reuses it. |
| T-126-03-03 Sentry SaaS outage blocks request handlers | accept | `Sentry.captureException` is fire-and-forget; SDK batches and retries internally. No flush per capture. |
| T-126-03-04 SENTRY_DSN=\"\" silently disables Sentry | accept | Local-dev intentional. Mount-order test in Plan 06 verifies `initSentry()` is called regardless of DSN value. |
| T-126-03-05 `initialized` flag toggled at runtime | accept | Module-scope mutable state, intentional for test-time reset; no production attack surface. |

No new threat surface introduced beyond what was in the plan's `<threat_model>`.

## Self-Check: PASSED

**Files** — verified via `[ -f path ]`:

- FOUND: `vigil-core/src/lib/sentry.ts` (119 LOC)
- FOUND: `vigil-core/package.json` (modified — `@sentry/node` line 30)
- FOUND: `vigil-core/package-lock.json` (modified)
- FOUND: `.planning/phases/126-wide-release-auth-hardening-rate-limit-auth-register-5-hr-ip/126-03-SUMMARY.md`

**Commits** — verified via `git log --oneline | grep`:

- FOUND: `33b14d4` — chore(126-03): add @sentry/node@^10.52.0 production dep
- FOUND: `41c0708` — feat(126-03): add Sentry server-side wrapper (initSentry + captureToSentry)

**Plan success criteria:**
- [x] `@sentry/node@^10.52.0` in `package.json` dependencies (line 30, exact resolved 10.52.0)
- [x] `sentry.ts` exports `initSentry` + `captureToSentry` with v10 API (`Sentry.withScope`)
- [x] Wave 0 `sentry.test.ts` transitions from RED to GREEN (5/5 pass)
- [x] JSDoc captures property-name denylist warning per Phase 103 / R12 (mentions `route`/`method`)
- [x] Implementation contains zero object-literal keys named on the denylist (anchored grep clean)

**Anchor for Plan 06:** `initSentry()` is the side-effect call to insert at the top of `vigil-core/src/index.ts` BEFORE `new Hono()`. Mount-order drift detector in `src/__tests__/mount-order.test.ts` enforces the position.
