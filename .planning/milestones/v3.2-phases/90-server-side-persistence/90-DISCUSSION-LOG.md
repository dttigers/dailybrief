# Phase 90: Server-Side Persistence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 90-server-side-persistence
**Areas discussed:** Cache storage & invalidation, Regenerate UX, Chat auto-resume, Cache lifetime & scope

---

## Cache Storage & Invalidation

### Where should cached AI results live?

| Option | Description | Selected |
|--------|-------------|----------|
| New DB table | A single 'ai_cache' table in Postgres (type column, result JSONB, timestamps). Matches Drizzle patterns, works across devices. | ✓ |
| Existing appSettings table | Reuse key-value appSettings. Avoids migration but awkward fit. | |
| You decide | Claude picks. | |

**User's choice:** New DB table
**Notes:** None

### Cache key granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Type only | One row per type (insights, patterns, prep). Single user + fixed 7-day scope. Upsert on regenerate. | ✓ |
| Type + date window | Key by type + window start. Keeps historical snapshots. More complex. | |
| You decide | Claude picks. | |

**User's choice:** Type only
**Notes:** None

---

## Regenerate UX

### What should happen when user taps Regenerate?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace inline with spinner | Old results disappear, spinner shows, new results appear. Matches existing loading pattern. | ✓ |
| Keep old results while loading | Old results stay visible with 'Regenerating...' indicator. | |
| You decide | Claude picks. | |

**User's choice:** Replace inline with spinner
**Notes:** None

### Should Regenerate require confirmation?

| Option | Description | Selected |
|--------|-------------|----------|
| No confirmation | Tap Regenerate → immediately runs. Low-stakes action. Frictionless. | ✓ |
| Light confirmation | Brief toast with cancel option for ~2s. | |
| You decide | Claude picks. | |

**User's choice:** No confirmation
**Notes:** None

### On first visit (no cache), auto-generate or wait?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generate on first visit | If no cache, fire AI call automatically (same as current behavior). | ✓ |
| Always show Generate button | Even first visit shows button. Saves AI costs but adds friction. | |
| You decide | Claude picks. | |

**User's choice:** Auto-generate on first visit
**Notes:** None

### Should cached result show a freshness timestamp?

| Option | Description | Selected |
|--------|-------------|----------|
| Show relative timestamp | Small gray text: 'Generated 2h ago'. Helps user judge freshness. | ✓ |
| No timestamp | Just cached result + Regenerate button. Simpler. | |
| You decide | Claude picks. | |

**User's choice:** Show relative timestamp
**Notes:** None

---

## Chat Auto-Resume

### How should Chat auto-resume work?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-load most recent session | On mount, load session with latest updatedAt. User lands where they left off. | ✓ |
| Remember last active per-device | Store last session ID in localStorage. Falls back to most recent. | |
| Show session list first | Keep current behavior — user picks session. | |
| You decide | Claude picks. | |

**User's choice:** Auto-load most recent session
**Notes:** None

### Should there be a staleness guard on auto-resume?

| Option | Description | Selected |
|--------|-------------|----------|
| No guard — always resume | Auto-load regardless of age. User starts new chat if wanted. | ✓ |
| Guard at 7 days | If most recent > 7 days old, show session list instead. | |
| You decide | Claude picks. | |

**User's choice:** No guard — always resume
**Notes:** None

---

## Cache Lifetime & Scope

### Should cached AI results auto-invalidate?

| Option | Description | Selected |
|--------|-------------|----------|
| Regenerate only | Cache persists until user taps Regenerate. No auto-invalidation. Timestamp lets users judge freshness. | ✓ |
| Auto-invalidate on new thoughts | New thought marks caches as stale. Next visit shows stale indicator or auto-regenerates. | |
| TTL-based expiry | Cache expires after fixed period (e.g., 24h). | |
| You decide | Claude picks. | |

**User's choice:** Regenerate only
**Notes:** None

### Should old cached results be cleaned up or keep history?

| Option | Description | Selected |
|--------|-------------|----------|
| Overwrite on regenerate | Single row per type, upserted. No history. | ✓ |
| Keep last N versions | Store up to N previous results. Enables lookback. | |
| You decide | Claude picks. | |

**User's choice:** Overwrite on regenerate
**Notes:** None

---

## Claude's Discretion

- Exact table/column naming for ai_cache
- GET vs POST endpoint design for cache retrieval
- Migration file structure
- Relative timestamp formatting
- Regenerate button placement
- Hook restructuring for cache-first flow

## Deferred Ideas

None — discussion stayed within phase scope.
