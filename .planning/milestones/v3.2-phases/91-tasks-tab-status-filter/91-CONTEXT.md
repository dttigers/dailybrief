# Phase 91: Tasks Tab Status Filter - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a visible status filter toggle to the Tasks tab so users can switch between Open (default), Done, and All views. Filter persists via server-side app_settings.

</domain>

<decisions>
## Implementation Decisions

### Filter Toggle UI
- **D-01:** Segmented control (pill buttons: Open | Done | All) appears below CategoryTabs, only visible when Task category is active
- **D-02:** Style consistent with existing UI patterns (gray-900 inactive, teal active)

### Persistence Strategy
- **D-03:** Server-side persistence via app_settings table (key: "task_status_filter", value: "open" | "done" | "all")
- **D-04:** On mount, fetch current filter from app_settings; default to "open" if no setting exists
- **D-05:** On filter change, update app_settings (fire-and-forget, same pattern as timezone setting)

### What Counts as "Open"
- **D-06:** "Open" means open + inProgress (excludes only done). Matches current behavior.
- **D-07:** "Done" shows only done tasks
- **D-08:** "All" shows everything (open + inProgress + done)

### Already Implemented
- **D-09:** useThoughts already filters out done tasks client-side when category=task. Phase 91 replaces this hardcoded filter with the user-selectable toggle.

</decisions>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above.

### Existing code
- `vigil-pwa/src/hooks/useThoughts.ts` — current client-side done filter (line 35-37)
- `vigil-pwa/src/pages/ThoughtsPage.tsx` — CategoryTabs placement, filter state management
- `vigil-pwa/src/components/CategoryTabs.tsx` — tab UI pattern to match
- `vigil-core/src/routes/thoughts.ts` — server-side ?taskStatus query param support
- `vigil-core/src/routes/settings.ts` — app_settings read/write pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- CategoryTabs component: segmented tab pattern to mirror for status filter
- app_settings table + settings API: proven persistence pattern (used for timezone, generate_schedule)
- useThoughts hook: already has client-side done filter to replace

### Established Patterns
- Settings read/write: GET /v1/settings/{key}, PUT /v1/settings/{key}
- Fire-and-forget persistence: update server without blocking UI (CaptureBar triage pattern)
- Segmented controls: CategoryTabs uses pill-style buttons with active/inactive states

### Integration Points
- ThoughtsPage.tsx: new state variable for status filter, passed to useThoughts
- useThoughts hook: replace hardcoded done filter with dynamic filter from state
- Server: GET /thoughts already supports ?taskStatus param (exact match)
- Need: server support for "not done" filter (open + inProgress) or client-side filtering

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 91-tasks-tab-status-filter*
*Context gathered: 2026-04-16*
