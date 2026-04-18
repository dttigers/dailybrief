---
gsd_state_version: 1.0
milestone: v3.4
milestone_name: Multi-User Foundation & PWA Polish
status: executing
stopped_at: "Completed 102-03 — bearerAuth dispatches vk_/JWT/malformed with userId injection; POST /v1/auth/register + login shipped with allowlist + D-11 claim-flow + timing-safe login; export const app in index.ts for integration tests; generate-key.ts requires --email. Plan 00 middleware + routes tests GREEN (8/8 each); cross-user-isolation imports resolve (11/11 enumerate, 4 per-route scoping failures → Plan 04's job). Next: Plan 04 (route-scoping audit) — add .where(userId) to every query site in 20 route files"
last_updated: "2026-04-18T21:45:50.265Z"
last_activity: 2026-04-18
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 15
  completed_plans: 13
  percent: 87
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** Capture every thought with zero friction and have the system organize it for you — so nothing falls through the cracks and your brain can let go.
**Current focus:** Phase 102 — multi-user-foundation

## Current Position

Phase: 102 (multi-user-foundation) — EXECUTING
Plan: 4 of 6
Status: Ready to execute
Last activity: 2026-04-18

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: ~196 (through v3.3)
- Total execution time: ~17 days
- Average duration: ~5 min per plan

**By Milestone:**

| Milestone | Phases | Plans | Timeline |
|-----------|--------|-------|----------|
| v1.0 MVP | 1-7 | 17 | 3 days |
| v1.1 Always On | 8-13 | 16 | 1 day |
| v1.2 Daily Driver | 14-18 | 14 | 1 day |
| v1.3 Stability & Smarts | 19-23 | 7 | 1 day |
| v1.4 Intelligence & Org | 24-28 | 11 | 1 day |
| v2.0 Vigil Platform | 29-36 | 22 | 1 day |
| v2.1 Server Deployment | 37-44 | 13 | 1 day |
| v2.2 Polish & Power | 45-50 | 12 | 1 day |
| v2.3 Projects & Precision | 51-57 | 14 | ~19h |
| v2.4 Capture Without Friction | 58-62 | 9 | 2 days |
| v2.5 Dashboard Everywhere | 63-72 | 17 | 2 days |
| v3.0 Server-Side PDF | 73-78 | 11 | ~1 day |
| v3.1 Gmail + Thin Clients | 79-87 | 26 | ~2 days |
| v3.2 Freshness & Capture Parity | 88-95 | 14 | 2 days |
| v3.3 Stability & Chat Context | 96-98 | 5 | 1 day |
| Phase 99-brief-history-fix P01 | 20min | 2 tasks | 6 files |
| Phase 99-brief-history-fix P02 | 5 minutes | 3 tasks | 6 files |
| Phase 100 P01 | 5 min | 3 tasks | 4 files |
| Phase 101 P00 | 6 min | 3 tasks | 4 files |
| Phase 101 P01 | 2min | 3 tasks | 4 files |
| Phase 101 P02 | 4min | 1 tasks | 1 files |
| Phase 101 P03 | 9min | 3 tasks | 5 files |
| Phase 101 P04 | 7min | 2 tasks | 4 files |
| Phase 102 P00 | 15min | 3 tasks | 6 files |
| Phase 102 P01 | 25min | 2 tasks | 6 files |
| Phase 102 P02 | 9min | 3 tasks | 6 files |
| Phase 102 P03 | 9m1s | 3 tasks | 4 files |

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.
v3.3 decisions archived to milestones/v3.3-ROADMAP.md.

- [Phase 99-brief-history-fix]: Used Drizzle customType for bytea (no built-in helper); sibling table brief_pdfs keeps SELECT * FROM briefs clean; repaired out-of-sync journal and __drizzle_migrations before generating migration 0011
- [Phase 99-brief-history-fix]: assembleAndRender drops filePath; GET /brief/:date uses LEFT JOIN brief_pdfs for two-tier 404 (brief_pdf_not_stored vs brief_not_found); retention sweep deleted per D-09
- [Phase 100]: Event names vigil:edit-started / vigil:edit-ended on window with {id:number} detail; Set<number> refcount; N->0 catch-up + interval reset; 5 edit-ended dispatch sites in ThoughtRow (no-change, empty, save-finally, Escape, unmount)
- [Phase 100]: D-12 unmount guard pattern: isEditingRef + []-deps cleanup (not [isEditing, thought.id] deps) to avoid re-firing end on every isEditing transition
- [Phase 101]: Wave 0 test scaffolds: fail-by-default via real imports (not stubs) so module-resolution failure IS the RED signal. 70 test cases across 4 files pin D-01..D-21 + CTX-01..CTX-07. D-19 interlock trap-test spies vigil:edit-started around menu Edit click to catch the shortcut of setIsEditing=true inline.
- [Phase 101]: Pointer Events (pointerType:'touch', clientX/Y) in long-press tests — matches production useLongPress hook path 1:1, avoids Pitfall 4 (fireEvent.touchStart missing clientX/Y).
- [Phase 101]: useToast hook + ToastHost: single-slot toast via React context + useRef timer/onExpire (no module-level singleton); showToast replacement fires previous onExpire synchronously before setState (D-16); manual dismiss() does NOT fire onExpire (only timer does)
- [Phase 101]: CATEGORIES canonical constant at vigil-pwa/src/constants/categories.ts — doc comment points at vigil-core VALID_CATEGORIES for drift detection (T-101-01-04); BulkActionBar imports from constants instead of declaring inline; Plan 02 Move-to-category submenu will consume the same tuple
- [Phase 101]: Plan 02 ContextMenu: portal to document.body via createPortal; view state machine root|categories|projects with useLayoutEffect re-measure on view change for mobile inline-replace; jsdom-safe fallback dims (192w/200h) so overflow-flip tests pass without a browser; D-19 interlock preserved (zero references to edit-state setter or edit-started window event in ContextMenu.tsx)
- [Phase 101]: Plan 03 deferred-commit delete via filter-on-render (hiddenPendingDelete Set + visibleThoughts); useThoughts.ts byte-identical to Phase 100 final state; D-19 interlock preserved via onStartEdit={handleContentClick} in ThoughtRow ContextMenu mount; all 5 vigil:edit-ended sites intact
- [Phase 101]: Plan 03 PointerEvent polyfill in src/test/setup.ts (Rule 3 blocking fix) — jsdom 25 ships generic Event for fireEvent.pointerDown so pointerType/clientX/clientY silently dropped; polyfill extends MouseEvent with PointerEventInit fields guarded by typeof check; production code unchanged
- [Phase 101]: Plan 03 dual-mode open-state in ThoughtRow (parent-managed vs. local-fallback via parentManagesOpenState = onOpenMenu !== undefined) — preserves single-open invariant in production while letting 17 Wave 0 ThoughtRow tests render standalone without fabricating parent state
- [Phase 101]: Plan 04 keyboard a11y: useLayoutEffect (not useEffect) for focus apply so document.activeElement lands synchronously after portal commit; ref-callback eager .focus() as safety net for portal-initial-mount timing; requestAnimationFrame-deferred rowRef.focus() on menu close (synchronous focus gets clobbered by portal unmount)
- [Phase 101]: Plan 04 integration tests avoid waitFor() under vi.useFakeTimers — waitFor polls with setTimeout which halts under fake timers; use flushMicrotasks() (double Promise.resolve inside act) matching useThoughts.test.tsx pattern
- [Phase 101]: Plan 04 Task 3 iOS Safari long-press UAT is a human-action checkpoint — autonomous executor completed Tasks 1 and 2 (33/33 ContextMenu tests + 24/24 ThoughtRow tests + 5/5 new ThoughtsPage integration tests green) but phase gate is NOT closed until operator records Tests A–H results on physical iPhone in 101-04-SUMMARY.md
- [Phase 102]: [Phase 102 P00] node:test hermetic skip pattern — use TestContext.skip() inside it((t)=>...) NOT SuiteContext.skip() inside before((t)=>...) (SuiteContext has no .skip); DB_READY module-const + per-it check keeps Wave 0 tests hermetic
- [Phase 102]: [Phase 102 P00] Placeholder hash prefix $argon2id$v=19$m=19456,t=2,p=1$ pinned in migrate.test.ts + password.test.ts — seed-user claim flow (D-11) relies on exact prefix match for register-overwrite detection
- [Phase 102]: [Phase 102 P00] Cross-user isolation imports app from ../index.js — creates hard contract for Plan 03 to change 'const app' to 'export const app' in src/index.ts; 7 LEAK: assertion messages in integration test fire if any Plan 04 route misses .where(userId) clause
- [Phase 102]: Plan 01 — Hand-rewrote drizzle-kit-generated 0012.sql to use Pitfall 2 expand-contract (nullable ADD → backfill → SET NOT NULL) + 13 DO/EXCEPTION duplicate_object blocks for FK idempotency; Postgres has no ADD CONSTRAINT IF NOT EXISTS for FKs
- [Phase 102]: Plan 01 — migrate-102-seed.ts uses ALTER DATABASE ... SET vigil.seed_email (persists across migrator reconnects) rather than SET LOCAL (session-scoped, wouldn't survive drizzle's fresh connection per .sql file)
- [Phase 102]: Plan 01 — Railway production DB migrated live at current scale (single replica, ~137 active thoughts + 508 total) without scaling to 0 replicas; Pitfall 2 race window did not hit. Flagged for Plan 05 runbook: scale Railway to 0 for future schema-wave deploys
- [Phase 102]: Plan 01 — Dropped .unique() inline modifier on briefs.date + oauth_tokens.provider in addition to the uniqueIndex swap; drizzle emits both as separate SQL objects (briefs_date_unique + uq_briefs_date). Both required for the per-user composite uniqueness target
- [Phase 102]: Plan 02 — Docker build verification substituted with package-lock.json musl-entry check (linux-x64-musl + linux-arm64-musl@2.0.2 pinned); dev machine has no Docker, and @node-rs/argon2 ships prebuilt binaries as separate npm packages (not a buildable native addon) so Pitfall 1's true signal is lockfile entries not docker output. Real validation at Railway deploy (Plan 05).
- [Phase 102]: Plan 02 — three-token-class discipline pinned: argon2id → utils/password.ts, HS256 JWT → utils/jwt.ts, SHA256 vk_ keys → middleware/auth.ts. Each module is standalone; verifyPassword returns false (never throws) for both malformed-hash and oversized-input cases for timing-safe reject parity
- [Phase 102]: Plan 02 — IIFE boot-check in utils/jwt.ts + pre-check in src/index.ts is intentional duplication: scripts that bypass index.ts (set-password.ts, tests) still exit cleanly on missing JWT_SECRET. Both pathways agree on the same 32-char threshold (D-19)
- [Phase 102]: Plan 03 — isVkKey() tightened to include !token.includes('.') to route vk_ strings with dots into malformed (401 'Unrecognized token format') rather than accidentally dispatching to api_keys lookup; matches D-02 error-copy contract
- [Phase 102]: Plan 03 — Moved if(!db) guard from middleware entry into vk_ branch only; malformed + JWT paths must 401 without touching DB (plan's example code would 503 pre-dispatch when DATABASE_URL unset, failing Plan 00 hermetic tests)
- [Phase 102]: Plan 03 — DUMMY_HASH is a compile-time constant (format-valid argon2id string with base64 junk) not a runtime hash; saves ~30ms boot cost, verifyPassword() returns false deterministically, timing parity preserved
- [Phase 102]: Plan 03 — Bearer exemption extended ONLY to /v1/auth/register + /v1/auth/login by exact-path match; future AUTH-06 profile + AUTH-07 password-reset must add their own exemptions (prevents accidental public surface growth)

### Pending Todos

_(None)_

### Blockers/Concerns

- ServiceNow API token still blocks Phase 80 (carried forward from v3.1)
- G2 hardware retest still pending physical device access (~2026-04-24)
- Phase 85 (iOS Shortcut) held — Shortcuts.app bugs
- Brief history fix (Phase 99): root cause is Railway /tmp ephemerality — PDF storage strategy needs investigation before planning

## Session Continuity

Last session: 2026-04-18T21:45:50.259Z
Stopped at: Completed 102-03 — bearerAuth dispatches vk_/JWT/malformed with userId injection; POST /v1/auth/register + login shipped with allowlist + D-11 claim-flow + timing-safe login; export const app in index.ts for integration tests; generate-key.ts requires --email. Plan 00 middleware + routes tests GREEN (8/8 each); cross-user-isolation imports resolve (11/11 enumerate, 4 per-route scoping failures → Plan 04's job). Next: Plan 04 (route-scoping audit) — add .where(userId) to every query site in 20 route files
Resume file: None
Next action: `/gsd-plan-phase 99`
