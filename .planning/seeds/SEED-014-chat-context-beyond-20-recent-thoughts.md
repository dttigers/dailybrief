---
id: SEED-014
status: dormant
planted: 2026-05-10
planted_during: v3.8 verifying / pre-v3.9 ideation
trigger_when: v3.9 milestone planning AND operator wants chat to feel "always knows me"; OR any phase that touches /v1/chat, thought-contextual chat, or the chat UI
scope: Small
---

# SEED-014: Expand chat context beyond 20 most-recent thoughts

## Why This Matters

The AI chat endpoint queries thoughts with **no date filter** but with a
hard cap of **20 most-recent thoughts** — see
[vigil-core/src/routes/chat.ts:23, 32-36](../../vigil-core/src/routes/chat.ts#L23).
`contextLimit` defaults to 20 and is configurable 1–50 per request.

Brief assembly uses a 7-day window (`getCurrentWeekWindow()`,
[brief-assembly-service.ts:540](../../vigil-core/src/services/brief-assembly-service.ts#L540))
which is appropriate for a daily brief. But chat is conversational —
the operator should be able to ask "what was I thinking about that
sales deal last month?" and have the assistant *find it*.

Today, asking about anything older than the 20 most recent captures
returns "I don't have that context" — even though **the thought exists
in the database forever** (soft-delete only via `syncStatus =
"pendingDeletion"`, no retention sweep — see
[vigil-core/src/routes/thoughts.ts:471-503](../../vigil-core/src/routes/thoughts.ts#L471-L503)).

The data is right there. Chat just can't reach it.

**The operator's framing (2026-05-10 capture session):** "allow chat to
still reference thoughts outside 7 day window for broader context. i
cant remember what we did with old thoughts. if gone, no need to worry
about this one."

Confirmed: thoughts are not gone. The gap is real.

## When to Surface

**Trigger:** v3.9 milestone planning, OR any phase touching:
- `/v1/chat` or thought-contextual chat (Phase 98 territory)
- Chat UI in the PWA
- Search / retrieval over thoughts

This is **not** a milestone-anchor — it's a Small that pairs well with
SEED-013 (cache invalidation) as part of a "make the AI surface feel
current and complete" theme.

## Scope Estimate

**Small** — A few hours, one phase, 2-3 plans:

- Plan 1 (retrieval strategy): pick how chat reaches older thoughts.
  Three families:
  - **Option A — Bigger window:** raise `contextLimit` cap (50 → 200?).
    Cheap, but token-blunt; eventually hits Claude context limits and
    loses the most relevant signal in noise.
  - **Option B — Hybrid retrieval:** keep 20 recent + run a keyword/full-text
    search on the user's message to pull 5-10 historically relevant
    thoughts. The `GET /thoughts?q=...` route at
    [vigil-core/src/routes/thoughts.ts:154-158, 206](../../vigil-core/src/routes/thoughts.ts#L154)
    already supports full-text search — chat just needs to call it before
    composing the LLM context.
  - **Option C — Embedding/vector search:** new infra (pgvector or
    similar), best recall, but a real lift. Probably overscoped for v3.9
    unless the operator wants a vector-search milestone-anchor.
  - **Probable pick:** Option B — gets most of the win for one phase of
    work, leverages existing search infra, no new dependencies.
- Plan 2 (chat endpoint): extract query terms from operator message
  (cheap heuristic or one LLM hop), call the search route, merge results
  with recents, dedupe by thoughtId.
- Plan 3 (UAT): operator asks chat about a topic that was discussed
  >20 thoughts ago; assistant retrieves and references it.

Anti-scope: NOT changing the daily brief's 7-day window (that's
intentional — brief is "this week"). NOT adding chat history /
multi-turn memory (separate concern). NOT semantic search infra (defer
to a later milestone if Option B isn't enough).

## Cost Consideration

Option B adds one or two extra DB queries per chat turn and ~5-10 extra
thoughts in the LLM context — token cost goes up linearly with retrieved
context. Probably acceptable; worth measuring on v3.9 to confirm.

## Breadcrumbs

- [vigil-core/src/routes/chat.ts:13-124](../../vigil-core/src/routes/chat.ts#L13-L124) — current chat handler, `contextLimit` at L23
- [vigil-core/src/routes/thoughts.ts:154-158, 206](../../vigil-core/src/routes/thoughts.ts#L154-L158) — `GET /thoughts?q=&after=&before=` full-text + date-range search (the unused retrieval lever)
- [vigil-core/src/services/brief-assembly-service.ts:540](../../vigil-core/src/services/brief-assembly-service.ts#L540) — `getCurrentWeekWindow()` brief-side 7-day window (DO NOT touch)
- Phase 89 (7-Day Analysis Scope) — locked the brief window; intentionally bounded
- Phase 98 (Thought-Contextual Chat) — original chat endpoint design

**Bug breadcrumb (worth surfacing during planning):** chat.ts:74 filters
`syncStatus != "deleted"` but the SyncStatus type only allows
`"pending" | "synced" | "pendingDeletion"` (db/types.ts:42). Dead code —
the live filter is upstream. Fix during this phase if the file is
already open.

## Notes

Operator raised this 2026-05-10 with explicit "sooner rather than
later" preference. The pre-condition — "if gone, no need to worry" —
was answered by code inspection: thoughts persist indefinitely
(soft-delete only). So the operator's worry case is the real case.

Pair with SEED-013 for a v3.9 "AI surface feels current and complete"
theme.
