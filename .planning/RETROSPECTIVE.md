# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v3.2 — Freshness & Capture Parity

**Shipped:** 2026-04-16
**Phases:** 8 | **Plans:** 14 | **Timeline:** ~2 days (2026-04-15 to 2026-04-16)

### What Was Built
- Wed-anchored weekly rollover with shared date-window helper (reused by 4 subsystems)
- 7-day analysis scope for Insights, Therapy patterns, and Therapy session prep
- Server-side AI cache (ai_cache table) with Regenerate UI and Chat auto-resume
- Tasks tab Open/Done/All filter with localStorage-first + server-synced persistence
- Work order auto-archive with lazy evaluation on GET, filter tabs, unarchive, bulk-clear
- Brief PDF restructured: de-duplicated Tasks, Affirmation on Page 1, 7-day thought scope
- Browser extension rewritten from URL-only to full quick-capture with triage feedback
- iOS PWA standalone OAuth verified on real device

### What Worked
- **Shared utility pattern**: date-window.ts landed in Phase 88 and was reused cleanly by Phases 89, 93, and the PWA — zero duplication across 4 consumers
- **Server-side data ownership**: Moving Insights/Therapy analysis to server-side DB queries (Phase 89) eliminated client-side thought shipping and simplified hooks dramatically
- **Cache-first hooks**: The upsert + GET cache pattern made revisits instant and Regenerate straightforward
- **Parallel-safe phase design**: Phases 91, 92, 94 ran independently of the 88→89→90→93 chain with no conflicts
- **Incremental brief fixes**: Several brief improvements (sports injection, blank page removal, affirmation relocation) landed in fix commits before the formal Phase 93, keeping the brief usable throughout development

### What Was Inefficient
- **Gmail work order debugging**: Multiple fix commits (7d77260 through 2d20432) debugging Gmail message parsing — nested multipart MIME and ServiceNow email format weren't anticipated
- **Brief PDF pre-phase fixes**: BRIEF-01/02/03 requirements were satisfied by fix commits (696a8a7, 0380c8e) before Phase 93 formally started, creating a traceability gap where the audit couldn't cleanly attribute the work
- **Human-verify checkpoints skipped**: Phases 91-94 missing VERIFICATION.md; Phase 94 Task 2 (Chrome/Safari manual test) never completed — low risk but pattern of skipping verification gates
- **Test harness gap persists**: RO-01..05 integration tests still skipped with test.skip; no shared test-DB in vigil-core after 3 milestones of accumulating test debt

### Patterns Established
- **Date-window helper as shared utility**: Pure function with injectable `now` param and zero deps — template for future cross-subsystem utilities
- **Lazy evaluation on GET**: Work order auto-archive runs during read, not on a cron — simpler than background jobs for low-volume data
- **localStorage-first with server sync**: Snappy UX pattern (filter tabs, timezone) where local storage provides instant state and server persists across devices
- **Cache-first with Regenerate**: AI-generated content cached server-side; stale-while-revalidate UX with explicit Regenerate button instead of auto-refresh

### Key Lessons
1. **Fix commits before formal phases blur traceability** — if a requirement gets satisfied "early" in a fix, explicitly reference the REQ-ID in the commit message so audits can trace it
2. **Gmail/email parsing needs upfront format investigation** — the nested MIME debugging spiral could have been avoided by fetching one real email and inspecting its structure before writing the parser
3. **Human-verify checkpoints need enforcement** — 5/8 phases skipped verification, making the audit flag items that are almost certainly fine but technically unverified. Consider making verification a gate rather than optional
4. **Pure utility modules with injectable params are the highest-leverage pattern** — date-window.ts was trivially testable (13 unit tests) and reusable because it has zero imports and accepts optional `now`

### Cost Observations
- Model mix: Primarily opus for execution, sonnet for planning
- 133 commits across 44 source files
- +2,591 / -557 lines of code (net +2,034)
- Notable: 8 phases in ~2 days is consistent with prior velocity (~1 phase per 3-4 hours)

---

## Milestone: v3.4 — Multi-User Foundation & PWA Polish

**Shipped:** 2026-04-18
**Phases:** 4 (99-102) | **Plans:** 15 | **Timeline:** ~24h (2026-04-17 17:01 → 2026-04-18 17:33)

### What Was Built
- Brief history survives Railway redeploys — brief_pdfs BYTEA table + structured 404 (`brief_not_found` vs `brief_pdf_not_stored`) drives branched PWA UX with Regenerate (Phase 99)
- Edit-refresh pause gate — window event bus `vigil:edit-started/ended` with Set-based refcount pauses 30s poll + visibilitychange + vigil:thought-created during active edits, fires single catch-up on last-end (Phase 100)
- Context menu on every thought row — right-click + long-press, 7 actions (delete/move/edit/re-triage/add-to-project/etc), deferred-commit delete with single-slot toast undo, D-19 interlock preserves Phase 100 pause gate (Phase 101)
- Multi-user backend — users table + argon2id + HS256 JWT + bearerAuth three-path dispatcher + userId FKs on 11 tables + per-user scoping across 20 routes + 4 services; Google OAuth state-JWT carries userId; vk_ backcompat preserved (Phase 102)
- Live Railway deploy verified via 5/5 go/no-go curls on api.vigilhub.io; production Gmail importer firing on real data with seed userId

### What Worked
- **Wave-0 TDD discipline**: 108+ failing test scaffolds landed before any production code across Phases 101 + 102. Cross-user-isolation suite runs against live Railway DB — caught regressions that pure-mock tests would miss.
- **Decision IDs as grep guards**: D-19 interlock (ContextMenu must not touch setIsEditing or dispatch vigil:edit-started) became grep-enforceable; verification could be automated ("grep returns 0 matches = D-19 holds").
- **Single authoritative edit-entry path**: ThoughtRow.handleContentClick became the sole setIsEditing pathway; ContextMenu Edit menuitem routes through it rather than inlining. Prevented the pause-gate bypass that would otherwise regress Phase 100.
- **Expand-contract migrations without scaling to 0**: Phase 102 Plan 01 applied multi-user migration on live production DB (137 active thoughts, 508 total) with single replica — nullable ADD → backfill → SET NOT NULL held the race window closed at current scale.
- **Three-token-class discipline**: argon2id (passwords) + HS256 JWT (sessions) + SHA256 vk_ (API keys) each in a separate module. bearerAuth three-path dispatcher routes cleanly; no interaction bugs.
- **Runbook before deploy**: 102-RUNBOOK.md + vigil-core/RUNBOOK.md landed before the first Railway push; deploy-day was mechanical, not diagnostic.

### What Was Inefficient
- **Paste-artifact whitespace bug (6380c6c)**: `.trim()` missing from VIGIL_SEED_USER_EMAIL read sites at 3 service call sites. Found in-flight during Plan 05 rather than Plan 04's audit. Integration test still uses only `.toLowerCase()` (I-04) — production/test drift.
- **Phase 101 WR-01..04 advisory findings**: ContextMenu keydown deps rebind on every arrow keystroke; handleRetriage lacks try/catch; handleMoveToCategory revert-on-error has an edge case when prev===undefined. All deferred but should have been caught in review before merge.
- **VALIDATION.md paperwork gap**: Phases 99/100/102 have no VALIDATION.md; 101 has draft frontmatter never flipped. Coverage is actually substantial (340+ automated cases) but the audit trail is uneven because several phases used in-SUMMARY test inventories.
- **Single-dev-machine Docker-build skip**: Phase 102 Plan 02 couldn't run `docker build` locally (no Docker on dev machine), substituted with package-lock.json musl-entry check. Real validation deferred to Railway deploy (Plan 05). Worked out but was a risk.
- **work_order_statuses table shipped without userId column (W-01)**: Integration check caught it; accepted as tech debt at v3.4 scope (single real user). Becomes an integrity issue when second user onboards.

### Patterns Established
- **Wave-0 test scaffolds as executable specs**: Fail-by-default via real imports (not stubs) so module-resolution failure IS the RED signal. 70+ cases pin decision IDs and requirement IDs before a line of production code.
- **Window CustomEvent as cross-hook contract**: `vigil:edit-started/ended` is a dispatch contract between ThoughtRow (producer) and useThoughts (consumer) — no shared state, no prop drilling. Cleanly extensible (ContextMenu now a third participant without modifying either).
- **Deferred-commit + single-slot toast**: Delete hides the row immediately, commits on toast expiry, fires previous onExpire synchronously when replaced. Undo = toast action. Replaces the "confirm dialog" pattern for destructive actions.
- **Seed-user claim-flow (D-11)**: Placeholder password hash on seed user rows means first register-with-seed-email succeeds with 201 and overwrites the placeholder. Preserves zero-downtime migration path for existing vk_ clients.
- **State-JWT for OAuth callbacks**: Google OAuth state param carries `{nonce, userId}` signed with JWT_SECRET. Public callback can upsert oauth_tokens with verified caller identity without authenticating the callback itself.

### Key Lessons
1. **Normalize at all read sites, not just write sites** — VIGIL_SEED_USER_EMAIL got `.toLowerCase()` originally; the `.trim()` fix had to be applied at 3 scheduler call sites + migrate-102-seed. Harmonize test fixtures with production normalization (I-04 gap).
2. **Decision IDs earn their keep when they become grep guards** — D-19 went from a discussion-log entry to a concrete regression test by being grep-enforceable. Worth the ID overhead when the invariant is cross-cutting.
3. **Runbooks eliminate deploy-day improvisation** — 102-RUNBOOK.md's go/no-go curl checklist turned the live production cutover into 5 mechanical commands. No "what do we run next" thinking under pressure.
4. **Integration tests must mirror production normalization exactly** — the W-02 gap (GET /v1/brief/:date not in isolation suite) and I-04 (test-side `.toLowerCase()` only) both trace to test-vs-prod drift. Add a drift-detection lint or shared normalization helper.
5. **"Backend-only" phases still need a UI-consumer checklist** — Phase 102 was pure server-side but downstream AUTH-06 (PWA login UI) carries every client-side assumption. Capture the client-facing surface explicitly, not implicitly.

### Cost Observations
- Model mix: Opus primary for execution, Sonnet for planning/research, Haiku for file ops
- 56 commits across 131 source files
- +27,410 / -645 lines of code (net +26,765; ~60% of LOC is Phase 102 migrations + tests)
- Notable: 4 phases in ~24 wall hours is the highest single-day velocity of the project (v3.3 shipped 3 phases in ~1 day). The Wave-0 scaffold approach front-loaded ~2 hours of test-writing per phase but eliminated the back-and-forth debugging cycles that usually stretch phases into multi-day affairs.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Timeline | Phases | Key Change |
|-----------|----------|--------|------------|
| v3.2 | ~2 days | 8 | Shared utility pattern; cache-first hooks; lazy archive |
| v3.4 | ~24h | 4 | Wave-0 TDD scaffolds; decision-ID grep guards; runbook-first deploy |

### Top Lessons (Verified Across Milestones)

1. Pure utility modules with zero deps and injectable params maximize reuse and testability
2. Server-side data ownership simplifies clients — move computation to the API, not the browser
3. Fix commits should reference REQ-IDs for audit traceability
4. Wave-0 test scaffolds (fail-by-default via real imports) front-load the bug surface before production code is written
5. Decision IDs become cheap regression tests when the invariant is grep-enforceable
6. Normalize at all read sites, not just write sites — test fixtures must mirror production normalization exactly
