# Phase 76: Brief Assembly Endpoint - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 76-brief-assembly-endpoint
**Areas discussed:** Data source orchestration, PDF storage strategy, API contract & auth, Work order data source

---

## Data Source Orchestration

| Option | Description | Selected |
|--------|-------------|----------|
| Omit the section entirely | If sports fails, the sports section just doesn't appear. Remaining sections fill the space. | |
| Show placeholder text | Section header still renders with a message like "Sports data unavailable". | |
| You decide | Claude picks the approach that best fits the existing PDF renderer behavior. | :heavy_check_mark: |

**User's choice:** You decide (Claude's discretion)
**Notes:** User deferred partial failure rendering approach to Claude.

| Option | Description | Selected |
|--------|-------------|----------|
| Service layer direct | Call sports-service, calendar-service, etc. directly. Avoids HTTP overhead. | :heavy_check_mark: |
| Internal HTTP calls | Fetch from own routes via localhost. Cleaner separation but adds latency. | |
| You decide | Claude picks based on codebase patterns. | |

**User's choice:** Service layer direct
**Notes:** Reuse existing DI factory pattern. No internal HTTP roundtrips.

| Option | Description | Selected |
|--------|-------------|----------|
| All optional — always generate | Even if everything fails, produce a PDF with just the date header. | :heavy_check_mark: |
| Thoughts required, rest optional | Brief must have at least thoughts/tasks data from DB. | |
| You decide | Claude determines what makes sense. | |

**User's choice:** All optional — always generate
**Notes:** The brief always succeeds regardless of data source availability.

---

## PDF Storage Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Filesystem on Railway | Write to a directory on Railway. Simple, no extra services. Ephemeral. | :heavy_check_mark: |
| PostgreSQL bytea column | Store PDF binary directly in the DB. Survives redeploys. | |
| Railway volume (persistent) | Attach a Railway persistent volume. Survives redeploys. | |
| You decide | Claude picks based on Railway constraints. | |

**User's choice:** Filesystem on Railway
**Notes:** Ephemeral storage acceptable since briefs are regenerable.

| Option | Description | Selected |
|--------|-------------|----------|
| Ephemeral is fine | Briefs are cheap to regenerate. Regenerate on-demand if file is gone. | |
| Need persistence | Past briefs must survive redeploys. | |
| You decide | Claude determines the right tradeoff. | :heavy_check_mark: |

**User's choice:** You decide (Claude's discretion on ephemeral vs persistent tradeoff)

| Option | Description | Selected |
|--------|-------------|----------|
| Date-based (e.g. 2026-04-12) | Natural, human-readable. One brief per day. | :heavy_check_mark: |
| UUID per generation | Allows multiple briefs per day. More complex. | |
| You decide | Claude picks based on single-user pattern. | |

**User's choice:** Date-based
**Notes:** Matches existing briefs table unique date constraint.

---

## API Contract & Auth

| Option | Description | Selected |
|--------|-------------|----------|
| No params — today's brief | POST with empty body. Server uses today's date, server-side config. | :heavy_check_mark: |
| Optional date param | Accept date to generate/regenerate past briefs. | |
| Date + config overrides | Accept date, enabledSections, fontScale, etc. | |

**User's choice:** No params — today's brief
**Notes:** Simplest for all clients. Single-user system with server-side config.

| Option | Description | Selected |
|--------|-------------|----------|
| PDF binary directly | Content-Type: application/pdf, raw bytes. Storage key in header. | |
| JSON with storage key, then separate fetch | Two-step: JSON metadata response, then fetch PDF. | |
| You decide | Claude picks based on success criteria SC-1. | :heavy_check_mark: |

**User's choice:** You decide (SC-1 says "returns a PDF binary response")

| Option | Description | Selected |
|--------|-------------|----------|
| Same bearer auth | Reuse existing auth middleware. Consistent with all /v1/* routes. | :heavy_check_mark: |
| Different or additional auth | Some other auth scheme for brief endpoints. | |

**User's choice:** Same bearer auth

---

## Work Order Data Source

| Option | Description | Selected |
|--------|-------------|----------|
| DB query | Query work_orders + work_order_statuses tables directly. | :heavy_check_mark: |
| Caller passes them in | POST body includes work orders. | |
| ServiceNow API direct | Assembler calls ServiceNow API at generation time. | |

**User's choice:** DB query
**Notes:** Data already synced by Mac CLI. If no work orders exist, section is empty.

| Option | Description | Selected |
|--------|-------------|----------|
| Include AI priority | Call existing prioritization logic for urgency-ranked work orders. | |
| Raw DB order only | Query work orders sorted by creation date. Simpler. | |
| You decide | Claude picks based on BriefRenderData contract. | :heavy_check_mark: |

**User's choice:** You decide (existing BriefRenderData has workOrderPriorityOrder field)

---

## Claude's Discretion

- Partial failure rendering approach (omit section vs show placeholder)
- Response format (PDF binary vs JSON wrapper)
- AI work order prioritization inclusion
- BriefRenderData mapping implementation details
- Thoughts/insights/therapy assembly queries

## Deferred Ideas

None — discussion stayed within phase scope.
