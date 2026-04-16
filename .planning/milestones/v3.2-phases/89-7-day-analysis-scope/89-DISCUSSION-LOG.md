# Phase 89: 7-Day Analysis Scope - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 89-7-day-analysis-scope
**Areas discussed:** Data sourcing shift, Insufficient data behavior, Scope indicator in UI, Prompt text update

---

## Data sourcing shift

| Option | Description | Selected |
|--------|-------------|----------|
| Fully server-side (Recommended) | Endpoints take no thoughts in body — they query the DB for last-7-day thoughts using getRollingDayWindow, then run Claude. PWA just calls POST /insights with no body. | ✓ |
| Server validates client data | Client still sends thoughts, but server re-filters using getRollingDayWindow to strip any outside the window. | |
| You decide | Claude picks the approach that best fits the codebase and success criteria. | |

**User's choice:** Fully server-side
**Notes:** None

### Follow-up: Filtering

| Option | Description | Selected |
|--------|-------------|----------|
| Server handles all filtering (Recommended) | Server queries DB with window + classification filters in one Drizzle query. | ✓ |
| Server gets all, AI filters | Server queries all 7-day thoughts and lets Claude see everything. | |
| You decide | Claude picks based on existing patterns. | |

**User's choice:** Server handles all filtering

### Follow-up: DB access

| Option | Description | Selected |
|--------|-------------|----------|
| Hono context (Recommended) | Use c.get('db') — matches the pattern in thoughts.ts and other routes. | ✓ |
| You decide | Claude follows whatever pattern is established. | |

**User's choice:** Hono context

---

## Insufficient data behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Show count + friendly message (Recommended) | Return a clear message like "Only 2 thoughts this week — need at least 3 for insights." No fallback to wider window. | ✓ |
| Lower the thresholds | Drop minimums so 7-day window almost always produces something. Risk: low-quality AI output. | |
| Silent empty state | Show the same empty state as today. User may not understand why nothing generated. | |

**User's choice:** Show count + friendly message
**Notes:** None

---

## Scope indicator in UI

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle subheading (Recommended) | Small gray text under the page title, like "Analyzing last 7 days". Consistent with Thoughts tab pattern from Phase 88. | ✓ |
| No label needed | 7-day scope is implicit. Keeps UI minimal. | |
| You decide | Claude picks based on existing UI patterns. | |

**User's choice:** Subtle subheading
**Notes:** None

---

## Prompt text update

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcode '7 days' (Recommended) | Prompts say "from the last 7 days" literally. Clear, matches v3.2 lock. | ✓ |
| Keep variable, lock to 7 | Server passes days=7 to prompt builder. More flexible but adds indirection. | |
| You decide | Claude picks the cleanest approach. | |

**User's choice:** Hardcode '7 days'
**Notes:** None

---

## Claude's Discretion

- Exact Drizzle query structure for combining date-window + classification filters
- Whether to extract a shared helper or inline queries per endpoint
- HTTP status code for insufficient data responses
- Exact UI copy for subheadings and messages
- POST body shape (empty vs optional params)

## Deferred Ideas

None — discussion stayed within phase scope.
