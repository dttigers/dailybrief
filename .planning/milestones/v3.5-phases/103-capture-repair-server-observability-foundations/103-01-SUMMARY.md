---
phase: 103-capture-repair-server-observability-foundations
plan: 01
subsystem: analytics

tags: [posthog, posthog-node, analytics, error-tracking, observability, redaction, before_send, singleton, d-10, d-12, d-14, d-15, anly-01, wave-1]

# Dependency graph
requires:
  - phase: 103-capture-repair-server-observability-foundations
    provides: "Plan 00 RED scaffold — posthog.test.ts (9 assertions pinning D-10 null-guard + D-12 redaction + Pitfall 3 captureException signature)"
provides:
  - "vigil-core/src/analytics/posthog.ts — PostHog singleton + D-14 wrapper API (redactEvent, trackEvent, captureException, shutdownPosthog, posthog)"
  - "D-10 key-absence gate: posthog === null when POSTHOG_API_KEY unset → wrappers no-op; no NODE_ENV coupling"
  - "D-12 before_send redactor for 6 sensitive routes (/v1/chat, /v1/process-photo, /v1/process-audio, /v1/thoughts, /v1/therapy, /v1/insights); strips request_body + headers inside the SDK before network send"
  - "D-13 readiness: enableExceptionAutocapture: true registers uncaughtException + unhandledRejection at construction (Plan 04 wires app.onError)"
  - "D-15 readiness: shutdownPosthog() → posthog?.shutdown() (Plan 04 wires to SIGTERM/SIGINT)"
  - "posthog-node@^5.29.2 installed"
affects:
  - 103-02-heic-convert-sync-triage (imports captureException for D-07 triage-failure fallback)
  - 103-04-global-error-handler (imports captureException + shutdownPosthog for app.onError + signal handlers)

# Tech tracking
tech-stack:
  added:
    - "posthog-node@^5.29.2 (server analytics + error autocapture SDK)"
  patterns:
    - "Module-scope singleton guarded by env-key absence (Pattern 1 from 103-RESEARCH.md)"
    - "Pure exported redactor used inside SDK before_send hook — unit-testable without an SDK instance"
    - "Wrapper API with optional-chaining null-guard (posthog?.capture, posthog?.captureException, posthog?.shutdown)"
    - "Non-Error → Error normalization at capture-exception boundary (Pitfall 3 mitigation)"

key-files:
  created:
    - "vigil-core/src/analytics/posthog.ts"
  modified:
    - "vigil-core/package.json (posthog-node dep)"
    - "vigil-core/package-lock.json (posthog-node + @posthog/core transitive)"

key-decisions:
  - "Used snake_case before_send verbatim per posthog-node v5.29.2 types.d.ts (Pitfall 2) — confirmed camelCase would compile but silently skip redaction"
  - "Normalize non-Error throws inside captureException wrapper rather than at call sites — moves the burden off future callers (app.onError, triage failure path) into one place"
  - "Export singleton posthog for test setup assertions only (D-14) — call sites use wrappers; code-review enforcement, not compiler enforcement"

patterns-established:
  - "Env-key absence gate for production-only services (Pattern 4): const x = process.env.KEY ? new Client(...) : null — wrappers optional-chain through"
  - "before_send as the only PII chokepoint: put redaction inside the SDK, not at call sites, so bypass is structurally impossible"

requirements-completed:
  - ANLY-01  # Per plan frontmatter — the posthog singleton + wrapper API is the "server exceptions land in PostHog" infrastructure. D-13 app.onError wiring + SIGTERM/SIGINT shutdown land in Plan 04 as the final wiring step; the core module that makes it possible lands here.

# Metrics
duration: 3m 10s
completed: 2026-04-19
---

# Phase 103 Plan 01: PostHog Analytics Shim Summary

**PostHog Node SDK singleton + D-14 wrapper API lands behind a key-absence gate with D-12 before_send redaction for six sensitive routes; Plan 00's 9 RED posthog.test.ts assertions turn GREEN.**

## Performance

- **Duration:** 3m 10s
- **Started:** 2026-04-19T18:20:38Z
- **Completed:** 2026-04-19T18:23:48Z
- **Tasks:** 2
- **Files modified:** 3 (1 new src file, 2 modified package files)

## Accomplishments

- `vigil-core/src/analytics/posthog.ts` (106 lines) — exactly 5 exports matching the D-14 public API contract: `redactEvent`, `trackEvent`, `captureException`, `shutdownPosthog`, `posthog`
- posthog-node@5.29.2 installed as a production dep; `cd vigil-core && node -e "..."` confirms version starts with `5.29.`
- Plan 00 RED → GREEN: `npx tsx --test src/analytics/posthog.test.ts` — 9 tests pass, 0 fail (was 1 fail with ERR_MODULE_NOT_FOUND before this plan)
- D-10, D-12, D-13 (readiness), D-14, D-15 all encoded per the research module template with zero `NODE_ENV` references
- No scope creep — diff limited to the three files declared in the plan's `files_modified` frontmatter

## Task Commits

Each task was committed atomically:

1. **Task 1: Install posthog-node@^5.29.2** — `a4af59c` (chore)
2. **Task 2: Implement analytics/posthog.ts singleton + wrapper module** — `d521a12` (feat)

**Plan metadata:** (committed separately as part of final step)

_Note: Task 2 was tagged `tdd="true"` in the plan but the RED tests already existed from Plan 00 — this plan turned them GREEN in a single commit rather than running a new RED → GREEN cycle._

## Files Created/Modified

- `vigil-core/src/analytics/posthog.ts` — NEW. PostHog singleton + wrapper API. Imports `{ PostHog, type EventMessage } from "posthog-node"`. Module-scope `const apiKey = process.env["POSTHOG_API_KEY"]` → `posthog = apiKey ? new PostHog(...) : null`. Constructor options: `host: "https://us.i.posthog.com"`, `enableExceptionAutocapture: true`, `before_send: redactEvent`. SDK defaults used for `flushAt` / `flushInterval`.
- `vigil-core/package.json` — MODIFIED. Added `"posthog-node": "^5.29.2"` to `dependencies`. No other deps touched.
- `vigil-core/package-lock.json` — MODIFIED. Lockfile entries for posthog-node + `@posthog/core@1.25.2` transitive.

## Public API (consumed by Plan 02 + Plan 04)

```typescript
// Singleton — test setup only per D-14
export const posthog: PostHog | null;

// Wrappers — the ONLY import path for call sites
export function trackEvent(
  userId: number | string,
  event: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
): void;

export function captureException(
  userId: number | string | null,
  err: unknown,
  context?: Record<string, string | number | boolean | undefined>,
): void;

export async function shutdownPosthog(): Promise<void>;

// Pure function — exported for unit testing (and used inside before_send)
export function redactEvent(event: EventMessage | null): EventMessage | null;
```

### How Plan 04 (index.ts wiring) uses each export

- **`captureException`** — called from `app.onError((err, c) => { captureException(c.get("userId") ?? null, err, { route: c.req.path, method: c.req.method }); ... })` as the D-13 chokepoint after all `app.route()` calls.
- **`shutdownPosthog`** — awaited as the FIRST await inside both `process.on("SIGTERM", ...)` and `process.on("SIGINT", ...)` handlers in `index.ts` (D-15) so Railway deploys never lose the tail-end of the event buffer.
- **`trackEvent`** — reserved for Phase 104 product events; not used in Phase 103.
- **`redactEvent`** — never imported at call sites; runs inside the SDK via `before_send: redactEvent` at construction.
- **`posthog` (singleton)** — never imported at call sites (D-14 code-review rule); only referenced in `posthog.test.ts` assertions.

### How Plan 02 uses each export

- **`captureException`** — called inside the per-thought triage try/catch on `POST /v1/process-photo` (D-07 fallback) to record the triage failure without surfacing it to the client.

## Decisions Made

- **Used snake_case `before_send` verbatim per posthog-node v5.29.2 `types.d.ts` line 134 (Pitfall 2 mitigation).** Structural typing would have accepted `beforeSend` silently; only a literal `grep "before_send: redactEvent"` catches regressions. Acceptance criterion checks this grep.
- **Chose to normalize non-Error throws inside `captureException` wrapper rather than at call sites.** Every future call site (Plan 02 triage catch, Plan 04 `app.onError`) gets a proper stack trace without duplicating `err instanceof Error ? err : new Error(String(err))` boilerplate.
- **Omitted custom `flushAt` / `flushInterval`** (CONTEXT.md Claude-discretion item) — kept SDK defaults (20 events / 10000 ms per research §State of the Art). Revisit in Phase 105 with real traffic.
- **Did not install `@types/heic-convert`** — that package is Plan 02's concern; installing it here would have created a stray commit breaking the one-plan-one-responsibility invariant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment phrasing violated NODE_ENV-count acceptance criterion**

- **Found during:** Task 2 (acceptance-criteria grep after first write)
- **Issue:** The initial module comment read `// ── D-10: Key-absence gate. NO NODE_ENV coupling. ────` which made `grep -c "NODE_ENV" vigil-core/src/analytics/posthog.ts` return `1` instead of the required `0`. The comment was intentionally stating the anti-pattern, but the acceptance criterion checks the substring literally.
- **Fix:** Rephrased comment to `// ── D-10: Key-absence gate. No environment-flag coupling. ────` — preserves the meaning (no env-flag gating) while satisfying the literal grep.
- **Files modified:** `vigil-core/src/analytics/posthog.ts`
- **Verification:** `grep -c "NODE_ENV" src/analytics/posthog.ts` now returns `0`; all 9 tests still pass.
- **Committed in:** `d521a12` (Task 2 commit — fix applied before commit)

---

**Total deviations:** 1 auto-fixed (1 bug — acceptance-criterion compliance)
**Impact on plan:** No scope change. Comment-only edit to satisfy literal grep check. No behavior change.

## Issues Encountered

- **Task 1 `npx tsc --noEmit` acceptance criterion — pre-existing Plan 00 RED errors:** The criterion says the install should not break existing code, but `tsc --noEmit` was already failing before the install due to Plan 00 RED scaffolds for `posthog.test.ts` and `me.test.ts` (ERR_MODULE_NOT_FOUND on imports of files Plans 01/03 create). Confirmed pre-existing via `git stash + tsc + stash pop` diff — my install added zero new errors; Plan 01 Task 2 resolved the `posthog.test.ts` error (only `me.test.ts` errors remain, which is Plan 03's scope). Per scope-boundary rule, the pre-existing errors are deferred to their owner plan (Plan 03), not fixed here.

## Known Stubs

None. Every export has a real implementation; `posthog === null` when key is absent is the intended D-10 behavior, not a stub.

## Threat Flags

None. No new security-relevant surface beyond what plan's `<threat_model>` already covered (T-103-01-01 through T-103-01-06 all mapped to mitigations in the as-built module).

## User Setup Required

None for this plan. Phase 103 as a whole requires the user to create a PostHog Cloud project and paste the production key into Railway env before success criterion #3 + #5 can be verified — that setup step is called out in the phase-level USER-SETUP (not here).

## Defense-in-depth reminder for Plan 04

Before Plan 04 lands the `app.onError` + signal-handler wiring, verify that `POSTHOG_API_KEY` remains **UNSET** in every local dotenv file (`vigil-core/.env`, `vigil-core/.env.local`, any sibling override files). The key-absence gate is the only thing preventing local `npm run dev` from writing to production PostHog (success criterion #5). Pitfall 9 in 103-RESEARCH.md is the long-form version of this note.

## Next Phase Readiness

- Plan 02 (HEIC + sync triage) can now `import { captureException } from "../analytics/posthog.js"` to wire the D-07 triage-failure fallback.
- Plan 04 (global error handler + signal-handler shutdown) can now import `captureException` and `shutdownPosthog` from the same path.
- Plan 03 (`/v1/me`) is untouched by this plan; its RED `me.test.ts` scaffold remains failing as expected.
- No blockers introduced for any downstream wave.

## Self-Check: PASSED

- File `vigil-core/src/analytics/posthog.ts` exists on disk
- File contains exactly 5 `export` statements (redactEvent, posthog, trackEvent, captureException, shutdownPosthog)
- `grep -c "NODE_ENV"` returns 0
- `grep -c "/v1/chat\\|/v1/process-photo\\|/v1/process-audio\\|/v1/thoughts\\|/v1/therapy\\|/v1/insights"` returns 6
- `grep -q "before_send: redactEvent"` succeeds (snake_case pinned)
- `grep -q "enableExceptionAutocapture: true"` succeeds
- `grep -q "posthog?.shutdown"` succeeds
- `vigil-core/package.json` contains `"posthog-node": "^5.29.2"`
- `vigil-core/node_modules/posthog-node/package.json` version starts with `5.29.`
- `npx tsx --test src/analytics/posthog.test.ts` → 9 pass / 0 fail
- Commit `a4af59c` exists in git log (Task 1)
- Commit `d521a12` exists in git log (Task 2)

---
*Phase: 103-capture-repair-server-observability-foundations*
*Completed: 2026-04-19*
