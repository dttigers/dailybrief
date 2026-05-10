---
id: SEED-013
status: dormant
planted: 2026-05-10
planted_during: v3.8 verifying / pre-v3.9 ideation
trigger_when: v3.9 milestone planning AND operator wants insights/therapy to feel "always current" without manual regenerate clicks; OR any phase that touches the insights/therapy or thought-capture pipelines
scope: Small
---

# SEED-013: Auto-regenerate insights/therapy cache on new thought upload

## Why This Matters

Today the insights and therapy outputs are AI-generated and cached in
`ai_cache` per-user, keyed by `(userId, type)` — see
[vigil-core/src/routes/insights.ts:146](../../vigil-core/src/routes/insights.ts#L146)
and [vigil-core/src/routes/therapy.ts:217](../../vigil-core/src/routes/therapy.ts#L217).
The cache is overwritten **on demand** when the user explicitly hits
regenerate; otherwise the dashboard happily serves a cached output that
may have been computed before the user's last 50 thought captures.

For the operator (ADHD founder using Vigil as a daily driver — see user
profile), this creates a quiet trust gap: "Are these insights actually
about how I've been thinking *this week*, or are they from last
Tuesday?" The cache header `generatedAt` answers it, but the operator
shouldn't have to read a timestamp to know whether to click regenerate.

**The behavioral fix:** when a new thought lands (POST /v1/thoughts,
sync from any client), mark the user's `ai_cache` entries for
`type IN ('insights', 'therapy_patterns', 'therapy_prep')` as stale —
either by deleting the row, setting a `stale_at` column, or queueing a
background regenerate. Next dashboard load triggers a fresh generate
without the operator clicking anything.

## When to Surface

**Trigger:** v3.9 milestone planning, OR any phase that opens the
insights/therapy or thought-capture pipeline files.

Surface during `/gsd-new-milestone` when the milestone scope mentions:
- Insights, therapy, or any AI-cache work
- Thought capture pipeline changes (the invalidation hook lives on the
  capture path)
- "Make the daily-driver feel more alive / always-current"

This is **not** a milestone-anchor on its own — it's a small Small that
folds naturally into a larger insights/therapy or capture milestone.

## Scope Estimate

**Small** — A few hours, plausibly one phase with 2-3 plans:

- Plan 1 (backend): on POST/sync thought, enqueue/invalidate `ai_cache`
  rows for the affected user. Decide invalidation strategy:
  - **Option A (simplest):** DELETE the cache rows. Next read regenerates
    synchronously. Adds latency on the dashboard load that follows the
    capture, but no infra change.
  - **Option B (cheap async):** Add a `stale_at` column; insights/therapy
    routes return cached + a `stale: true` flag and kick off background
    regeneration. Needs a job runner or fire-and-forget Promise.
  - **Option C (debounced):** Only invalidate if N thoughts captured
    since last generation OR M minutes elapsed. Avoids LLM cost on
    rapid-fire capture bursts.
- Plan 2 (PWA): handle the `stale: true` response (Option B) or just
  accept the latency (Option A). Show a subtle "updated just now" hint.
- Plan 3 (UAT): capture a thought, refresh dashboard, verify insights
  reflect the new thought without a manual regenerate.

Anti-scope: NOT changing how insights/therapy are generated (prompts,
LLM, etc.) — only when.

## Cost Consideration

Auto-regenerate means more Claude API calls. Per [memory `project_secret_drift`](../memory/project_secret_drift.md)
the operator already cares about API key hygiene; the cost side matters too.
Option C (debounced) is the prudent default — invalidate but only
regenerate on read, and rate-limit per-user-per-hour.

## Breadcrumbs

Related code in the current codebase:

- [vigil-core/src/routes/insights.ts:11](../../vigil-core/src/routes/insights.ts#L11) — `/insights/cache` (read) and the regenerate POST handler at L145
- [vigil-core/src/routes/therapy.ts:18](../../vigil-core/src/routes/therapy.ts#L18) — `/therapy/cache` (read) and the regenerate POST handlers at L217, L329
- `vigil-core/src/routes/thoughts.ts` — POST /v1/thoughts is the invalidation hook site
- `vigil-core/src/db/schema/ai-cache.ts` (or equivalent) — `uq_ai_cache_user_type` composite uniqueness from Phase 102
- Phase 102 (Multi-User Foundation) — locked the per-user cache scoping
- Phase 27 (Therapy Prep & Patterns), Phase 26 (Therapy Intelligence) — original prompt design

## Notes

Operator raised this 2026-05-10 during a /gsd-capture session as
"automate insights/therapy regenerated on new thought upload."

Strong "sooner rather than later" signal — likely v3.9 candidate, not a
park-and-forget seed. Pair with SEED-014 (chat context window) as
related "make the AI surface feel current" wins.
