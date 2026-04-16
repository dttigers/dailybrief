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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Timeline | Phases | Key Change |
|-----------|----------|--------|------------|
| v3.2 | ~2 days | 8 | Shared utility pattern; cache-first hooks; lazy archive |

### Top Lessons (Verified Across Milestones)

1. Pure utility modules with zero deps and injectable params maximize reuse and testability
2. Server-side data ownership simplifies clients — move computation to the API, not the browser
3. Fix commits should reference REQ-IDs for audit traceability
