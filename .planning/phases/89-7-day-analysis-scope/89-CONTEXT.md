# Phase 89: 7-Day Analysis Scope - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Scope all three AI analysis endpoints (Insights, Therapy pattern recognition, Therapy session prep) to analyze only the last 7 days of thoughts, using the `getRollingDayWindow` helper from Phase 88. The endpoints shift from "client sends thoughts" to "server queries DB directly."

**Requirements covered:** SCOPE-01, SCOPE-02, SCOPE-03

**Out of scope:** Daily brief PDF 7-day scope (Phase 93, SCOPE-04), server-side persistence/caching of results (Phase 90), configurable analysis window (deferred past v3.2).

</domain>

<decisions>
## Implementation Decisions

### Data Sourcing (server-side shift)
- **D-01:** All three endpoints (`POST /insights`, `POST /therapy/patterns`, `POST /therapy/prep`) become fully server-side: they query the DB for thoughts within the 7-day window using `getRollingDayWindow(tz, 7)`, then run Claude. Clients no longer send thoughts in the request body.
- **D-02:** PWA hooks (`useInsights.ts`, `useTherapy.ts`) simplify to just calling the endpoint with no body. The `getThoughts({ limit: 200, window: 'all' })` fetches are removed from these hooks.
- **D-03:** Therapy-specific filtering happens server-side in the DB query: Patterns endpoint queries thoughts with any `therapyClassification` set; Prep endpoint queries thoughts with `therapyClassification = 'bringToTherapist'`. Combined with the 7-day window filter in one Drizzle query.
- **D-04:** DB access via Hono context (`c.get('db')`) — matches the established pattern in `thoughts.ts` and other routes.

### Insufficient Data Behavior
- **D-05:** When the 7-day window yields fewer thoughts than the minimum (Insights: <3, Patterns: <5, Prep: <1), the endpoint returns a structured error with the count and a friendly message (e.g., "Only 2 thoughts this week — need at least 3 for insights"). No fallback to a wider window.
- **D-06:** Thresholds remain unchanged (Insights: 3, Patterns: 5, Prep: 1). No lowering.

### Scope Indicator in UI
- **D-07:** Insights and Therapy pages show a subtle subheading under the page title: "Analyzing last 7 days" — small gray text, consistent with the "This week" header pattern from Phase 88's Thoughts tab.

### Prompt Text
- **D-08:** AI prompt text hardcodes "7 days" literally (e.g., "from the last 7 days"). No variable/parameter — matches the v3.2 lock. Therapy patterns prompt changes from "last 30 days" to "last 7 days".

### Claude's Discretion
- Exact Drizzle query structure for combining date-window + classification filters
- Whether to extract a shared "get thoughts in window" helper used by all three endpoints, or inline the query in each
- HTTP status code for the "insufficient data" response (400 vs 200 with empty result + message)
- Exact copy for the "Analyzing last 7 days" subheading and insufficient-data messages
- Whether the POST body becomes completely empty or accepts optional params for future extensibility

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requirements
- `.planning/ROADMAP.md` §"Phase 89" — phase goal, depends-on, success criteria
- `.planning/REQUIREMENTS.md` §SCOPE-01..03 — acceptance criteria wording

### Phase 88 context (direct dependency)
- `.planning/phases/88-date-window-helper-rollover/88-CONTEXT.md` — D-01 defines `getRollingDayWindow(tz, days, now?)` signature; D-03 confirms helper is pure, callers pass `tz`

### Code touchpoints
- `vigil-core/src/utils/date-window.ts` — `getRollingDayWindow` implementation (Phase 88 output)
- `vigil-core/src/routes/insights.ts` — `POST /insights` endpoint (currently client-sent thoughts; refactor to server-side query)
- `vigil-core/src/routes/therapy.ts` — `POST /therapy/patterns` and `POST /therapy/prep` (same refactor)
- `vigil-core/src/routes/settings.ts:172` — timezone lookup for `tz` argument
- `vigil-core/src/routes/thoughts.ts` — reference for Drizzle query patterns (`conditions[]`, `and(...conditions)`)
- `vigil-core/src/db/schema.ts` — thoughts table schema (therapyClassification column)
- `vigil-pwa/src/hooks/useInsights.ts` — PWA hook to simplify (remove getThoughts call)
- `vigil-pwa/src/hooks/useTherapy.ts` — PWA hook to simplify (remove getThoughts calls + client filtering)
- `vigil-pwa/src/pages/InsightsPage.tsx` — add "Analyzing last 7 days" subheading
- `vigil-pwa/src/pages/TherapyPage.tsx` — add "Analyzing last 7 days" subheading
- `vigil-pwa/src/api/client.ts` — update API call signatures (no thoughts in body)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vigil-core/src/utils/date-window.ts` — `getRollingDayWindow(tz, 7)` is the designated helper. Returns `{ start: Date; end: Date }`. Feeds Drizzle's `gte`/`lte` directly.
- `vigil-core/src/routes/thoughts.ts:137-140` — established `conditions.push(gte(createdAt, ...))` pattern for date filtering with Drizzle.
- `vigil-core/src/routes/settings.ts:172` — `getTimezone(db)` helper for resolving user timezone.

### Established Patterns
- Route handlers access DB via `c.get('db')` Hono context.
- Drizzle queries use `conditions[]` array assembled with `and(...conditions)`.
- AI endpoints use `callClaude({ system, userMessage, maxTokens })` from `ai/client.ts`.
- `parseAIJson(raw)` for structured AI response parsing.
- Plain-function utilities (no classes).

### Integration Points
- Three endpoints gain DB access (insights.ts, therapy.ts currently have none).
- PWA hooks (`useInsights`, `useTherapy`) drop their `getThoughts` calls and body construction.
- PWA API client functions drop `thoughts` parameter from signatures.
- Two page components gain a subheading element.

</code_context>

<specifics>
## Specific Ideas

- Success criterion #4 ("all three endpoints share the same date-window helper") is the driver for server-side scoping — `getRollingDayWindow` is called in each route handler.
- The `days` parameter on `POST /insights` body and the `days` field in therapy patterns (default 30) both become irrelevant — server hardcodes 7.
- Current minimum thresholds (3 for insights, 5 for patterns, 1 for prep) are preserved. The insufficient-data message surfaces the count so users understand why generation didn't run.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 89-7-day-analysis-scope*
*Context gathered: 2026-04-16*
