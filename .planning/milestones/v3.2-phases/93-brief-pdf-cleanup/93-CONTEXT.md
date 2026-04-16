# Phase 93: Brief PDF Cleanup & 7-Day Scope - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply 7-day Wed-anchored window to brief thought queries. Verify PDF layout after earlier session restructuring (Tasks dedupe, Affirmation + Sports on Page 1, Page 2 removed).

</domain>

<decisions>
## Implementation Decisions

### 7-Day Scope for Brief Thoughts
- **D-01:** Use `getCurrentWeekWindow(tz)` from Phase 88 date-window helper — same Wed-anchored week as Thoughts tab
- **D-02:** Apply window to all three brief thought queries: fetchTaskThoughts, fetchRecentThoughts, fetchUnprocessedThoughts
- **D-03:** Read user timezone from app_settings (same pattern as GET /thoughts)

### Already Completed (this session, pre-phase)
- **D-04:** Tasks section deduplicated — removed from Page 1, kept on captured thoughts page only
- **D-05:** Affirmation moved to Page 1 (after Work Orders, before Sports)
- **D-06:** Sports moved to Page 1 (after Affirmation, before Calendar)
- **D-07:** Page 2 removed entirely — brief is now Page 1 + Captured Thoughts page
- **D-08:** Notes section on every page via shared drawNotesSection helper

</decisions>

<canonical_refs>
## Canonical References

### Existing code
- `vigil-core/src/services/brief-assembly-service.ts` — fetchTaskThoughts/fetchRecentThoughts/fetchUnprocessedThoughts (lines 200-238)
- `vigil-core/src/utils/date-window.ts` — getCurrentWeekWindow(tz) helper
- `vigil-core/src/routes/thoughts.ts` — reference implementation of window query (lines 170-181)
- `vigil-core/src/services/pdf-service.ts` — already restructured layout

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- getCurrentWeekWindow(tz): returns {start, end} Date objects for Wed-Tue window
- app_settings table: stores user_timezone
- gte/lt drizzle operators: same pattern as GET /thoughts

### Integration Points
- brief-assembly-service.ts: add window filter to the three WHERE clauses
- Need to import getCurrentWeekWindow and appSettings

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward application of existing pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 93-brief-pdf-cleanup*
*Context gathered: 2026-04-16*
