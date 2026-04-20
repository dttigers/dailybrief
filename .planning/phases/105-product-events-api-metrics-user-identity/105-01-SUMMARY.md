---
phase: 105-product-events-api-metrics-user-identity
plan: 01
subsystem: observability
tags: [posthog, analytics, redaction, security, node-test, tdd]

# Dependency graph
requires:
  - phase: 103-capture-repair-server-observability-foundations
    provides: "posthog singleton + trackEvent/captureException/redactEvent/shutdownPosthog wrappers, D-10 key-absence gate, D-14 wrapper-only contract"
provides:
  - "BLOCKED_PROPERTY_NAMES Set (8 denylisted property names)"
  - "Runtime property-name guard inside trackEvent (case-sensitive drop + posthog_property_blocked meta-event)"
  - "identifyUser(userId, properties) wrapper so /v1/me never imports the posthog singleton directly"
affects: [105-02-api-metrics, 105-03-user-identity, any future phase emitting product events]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-constant denylist (BLOCKED_PROPERTY_NAMES) mirrors Phase 103 SENSITIVE_ROUTES shape — grep-visible, easy to extend"
    - "Drop-the-property, not drop-the-event: partition properties first, emit one meta-event per blocked name, then emit the user's event with survivors"
    - "Wrapper-only call surface extended (trackEvent + identifyUser) — Phase 103 D-14 contract unchanged"

key-files:
  created: []
  modified:
    - "vigil-core/src/analytics/posthog.ts"
    - "vigil-core/src/analytics/posthog.test.ts"

key-decisions:
  - "Meta-event emission order: emit posthog_property_blocked BEFORE the user event so downstream consumers always see the canary first (D-02 interpretation)"
  - "One meta-event per blocked property name (not one aggregated meta with an array) — simpler invariant, matches Task 1 Test 4 wording"
  - "Kept the `properties: allowed` call even when allowed is empty — 'thought_created with no props beats no event' (D-02 'drop-the-property')"
  - "trackEvent signature byte-identical to Phase 103 (D-03 lock) — only the body changed; zero call-site churn"
  - "identifyUser placed between trackEvent and captureException to keep the public API block contiguous per Phase 103 layout"

patterns-established:
  - "BLOCKED_PROPERTY_NAMES export pattern: runtime denylist + grep-visible + easy to add new names without type changes"
  - "posthog_property_blocked meta-event doubles as an auditable leak canary inside PostHog itself"

requirements-completed: [ANLY-02, ANLY-04]

# Metrics
duration: 37min
completed: 2026-04-19
---

# Phase 105 Plan 01: PostHog Wrapper Guard + identifyUser Summary

**PostHog trackEvent now silently drops user-generated string properties by name (8-name denylist, case-sensitive) and emits `posthog_property_blocked` meta-events per drop; new `identifyUser` wrapper unblocks /v1/me person-properties from Plan 03 without leaking the singleton to route files.**

## Performance

- **Duration:** 37 min
- **Started:** 2026-04-20T01:36:20Z
- **Completed:** 2026-04-20T02:13:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `BLOCKED_PROPERTY_NAMES` Set with exactly the 8 documented names (`content`, `body`, `text`, `message`, `description`, `title`, `note`, `transcript`) — exported for grep visibility and test access.
- Extended `trackEvent` to partition incoming properties into (allowed, blocked) in one pass, emit one `posthog_property_blocked` meta-event per blocked name (properties = `{event_name, property_name}`), then emit the user's event with the surviving allowed properties. Drop-the-property semantics (D-02) preserved — the original event still fires even if every property was blocked.
- Added `identifyUser(userId, properties)` wrapper — 2-line null-guarded passthrough to `posthog.identify`. Plan 03's `/v1/me` handler can now stay wrapper-only (Phase 103 D-14 never regresses).
- Updated the module-top docstring to include `identifyUser` in the public API list.
- Added 3 new describe blocks (10 new tests) covering the denylist literal + case-sensitivity, the trackEvent guard's shim-path no-throw behaviour, and the identifyUser wrapper surface. All 9 Phase 103 tests preserved untouched.
- `trackEvent` signature is byte-identical to its Phase 103 form (D-03 lock) — zero call-site churn for existing callers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend trackEvent with BLOCKED_PROPERTY_NAMES guard + add identifyUser wrapper** — `7ce1ae4` (feat)
2. **Task 2: Add tests for guard + identifyUser; verify existing 9 tests still pass** — `1306ae0` (test)

_Note: Plan was marked `tdd="true"` on both tasks; the module was extended in place (not rewritten), so TDD landed as single commits per task (feat, then test) rather than the RED/GREEN/REFACTOR triplet because the Phase 103 test suite already acted as the RED scaffold for the existing wrapper surface._

## Files Created/Modified

- `vigil-core/src/analytics/posthog.ts` — Added BLOCKED_PROPERTY_NAMES constant (8 names), replaced trackEvent body with partition + meta + emit flow, added identifyUser wrapper, updated top docstring public API list.
- `vigil-core/src/analytics/posthog.test.ts` — Extended dynamic import to pull identifyUser + BLOCKED_PROPERTY_NAMES, appended 3 new describe blocks (10 new `it` tests) covering D-04 denylist literal, D-01..D-03 property guard shim path, and D-09..D-11 identifyUser wrapper export.

## Decisions Made

See frontmatter `key-decisions`. All decisions were pre-locked in 105-CONTEXT.md §D-01..D-04 and §D-09..D-11; the plan's action block was followed literally with no behavioural drift. Ordering decision (meta-event fires before user event) was pre-specified in the plan's Change 2 block.

## Deviations from Plan

None — plan executed exactly as written. All 4 changes from Task 1's action block (BLOCKED_PROPERTY_NAMES constant, trackEvent body replacement, identifyUser wrapper, top docstring update) and both Task 2 appends (dynamic-import line + 3 new describe blocks) landed verbatim.

**Task 2 test count note:** The plan's `<behavior>` list enumerates 10 distinct `it` tests across the 3 new describe blocks (not 12, despite the plan's success-criteria bullet mentioning "12 new tests"). The 10 tests shipped match the literal enumeration in the plan's `<action>` block — the `12` figure appears to be a drafting artefact in the plan's own success text. Test count delivered: 10 new + 9 existing = 19 total, all passing under the `POSTHOG_API_KEY` unset shim path.

## Verification

**Unit tests (authoritative for this plan's scope):**

```
$ cd vigil-core && npx tsx --test src/analytics/posthog.test.ts
▶ redactEvent — D-12 sensitive-route allowlist                    (4 tests) ✔
▶ trackEvent / captureException — D-10 null-guard                 (5 tests) ✔
▶ BLOCKED_PROPERTY_NAMES — D-04 denylist literal                  (2 tests) ✔
▶ trackEvent — D-01..D-03 property guard (shim path)              (4 tests) ✔
▶ identifyUser — D-09..D-11 wrapper export                        (4 tests) ✔
ℹ tests 19   ℹ pass 19   ℹ fail 0   ℹ duration_ms 416.8
```

**TypeScript:** `cd vigil-core && npx tsc --noEmit` → zero errors.

**Acceptance criteria greps (Task 1):**

- `grep -c "BLOCKED_PROPERTY_NAMES = new Set"` = 1 ✔
- `grep -c '"content"'` = 1 ✔ (inside the Set literal)
- `grep -c "posthog_property_blocked"` = 3 ✔ (>= 1 required)
- `grep -c "export function identifyUser"` = 1 ✔
- `grep -c "export const BLOCKED_PROPERTY_NAMES"` = 1 ✔
- 8-name literal count = 8 ✔
- Phase 103 exports preserved: `redactEvent`, `trackEvent`, `captureException`, `shutdownPosthog`, `posthog` ✔

**Acceptance criteria greps (Task 2):**

- `grep -c 'describe("BLOCKED_PROPERTY_NAMES'` = 1 ✔
- `grep -c 'describe("identifyUser'` = 1 ✔
- First line still `import { describe, it } from "node:test";` ✔
- `delete process.env["POSTHOG_API_KEY"];` line unchanged at line 6 ✔

**Plan-level verification:**

- `grep -E "BLOCKED_PROPERTY_NAMES|posthog_property_blocked|identifyUser" posthog.ts` = 8 hits (>= 4 required) ✔
- Phase 103 wrapper API contract unchanged — trackEvent / captureException / redactEvent / shutdownPosthog signatures byte-identical ✔
- Only 2 files touched: `posthog.ts` + `posthog.test.ts` (confirmed via `git diff --name-only 7ce1ae4~1 HEAD`) ✔

## Issues Encountered

**Full `npm test` hanging on integration suites (not a Plan 01 regression).**
The workspace-wide `npm test` script also runs `src/integration/cross-user-isolation.test.ts`, which requires a live Postgres connection. With no local DB available this test hangs indefinitely rather than failing fast. It predates this plan and is out of scope (Rule 4 — would require environment-level changes to short-circuit). For Plan 01 verification I ran the targeted `npx tsx --test src/analytics/posthog.test.ts` invocation, which gives unambiguous signal for every file this plan touched. Logged for future `deferred-items.md` consideration: integration tests should be gated on `DATABASE_URL` presence or split into a separate npm script.

## Known Stubs

None — `grep -E "TODO|FIXME|placeholder|not available"` across the 2 touched files returned no hits.

## Next Phase Readiness

- **Plan 02 (API metrics middleware)** can now call `trackEvent(userId, 'api_request', { route, method, status, duration_ms, status_class })` with confidence — any developer-added string property whose name collides with the denylist will be silently dropped and surfaced via `posthog_property_blocked`.
- **Plan 03 (/v1/me identify)** can import `identifyUser` from `analytics/posthog.ts` and call `identifyUser(userId, { email, createdAt })` after every successful `/v1/me` response. No direct posthog singleton import required.
- **SC#4 (no event property contains user-generated string content)** is now enforced at the wrapper, not at call sites — every event emitted in Phase 105 inherits the guard automatically.
- No blockers carried forward.

## Self-Check: PASSED

- `vigil-core/src/analytics/posthog.ts` — FOUND (modified, 175 lines)
- `vigil-core/src/analytics/posthog.test.ts` — FOUND (modified, 175 lines)
- Commit `7ce1ae4` — FOUND (`feat(105-01): add BLOCKED_PROPERTY_NAMES guard + identifyUser wrapper`)
- Commit `1306ae0` — FOUND (`test(105-01): add BLOCKED_PROPERTY_NAMES + identifyUser test suites`)
- All 19 posthog tests passing under shim path
- TypeScript clean (tsc --noEmit returns zero errors)

---
*Phase: 105-product-events-api-metrics-user-identity*
*Completed: 2026-04-19*
