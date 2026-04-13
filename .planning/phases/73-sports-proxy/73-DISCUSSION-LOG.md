# Phase 73: Sports Proxy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 73-sports-proxy
**Areas discussed:** API source, Response shape, Route design, Team configuration

---

## API Source

| Option | Description | Selected |
|--------|-------------|----------|
| balldontlie.io | Single API for all 4 leagues, requires API key, consistent interface | ✓ |
| ESPN public API | Match existing Swift code, no API key, undocumented/unofficial | |
| MLB Stats API + ESPN | Keep the split like the Mac CLI | |
| You decide | Claude picks most reliable option | |

**User's choice:** balldontlie.io
**Notes:** User already has an API key. Single API source simplifies implementation vs the current Mac split (ESPN + MLB Stats API).

---

## Response Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror existing Swift models | Same field names/structure for easy Mac CLI swap | |
| Fresh format for the brief | Designed around what PDF/PWA brief needs | |
| You decide | Claude designs best shape for both consumers | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion to design response shape optimized for both brief generation and PWA consumption, using existing Swift models as reference.

---

## Route Design

| Option | Description | Selected |
|--------|-------------|----------|
| Single endpoint `/v1/sports` | All leagues in one call, per-league status flags | |
| Per-league endpoints `/v1/sports/:league` | Client calls each league separately | |
| Both | Aggregate + per-league, aggregate is primary | ✓ |

**User's choice:** Both
**Notes:** Claude recommended option 3 — aggregate endpoint as primary consumer path for brief generation, per-league endpoints fall out naturally from clean internal code separation. User agreed.

---

## Team Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Query params | Client passes team IDs per request, server is stateless | |
| User profile in DB | Store preferences per user in PostgreSQL | |
| Server-side config / env vars | Hardcode teams in server config, single-user system | ✓ |
| You decide | Claude picks | |

**User's choice:** Server-side config (after Claude recommended it)
**Notes:** Single-user system — env vars on Railway is simplest. No need for preferences DB table or query param threading. Multi-user preferences would be a future phase if needed.

---

## Claude's Discretion

- Response shape design (optimized for brief + PWA)
- Cache TTL and key design
- Internal code organization

## Deferred Ideas

None — discussion stayed within phase scope
